/**
 * GTC-209 — A second wrap-up press must not re-send.
 *
 * `POST /api/events/[id]/wrap-up` had no idempotency guard at any of four layers, so a
 * host who pressed wrap-up twice sent every guest two thank-you texts. Confirmed by the
 * 2026-08-04 accuracy audit; reproduction needs a reload, a second tab, or a direct POST
 * (within one page load the button is disabled).
 *
 * WHAT THIS TEST EXERCISES, AND WHY IT IS THIS SEAM.
 * The route itself sits behind `requireEventRole` and is unreachable from a DB-level
 * test — the same constraint GTC-172 documented and solved by extracting
 * `selectWrapUpRecipients`. So this test simulates a press exactly as the route performs
 * one (`wrap-up/route.ts:106-108`): `selectWrapUpRecipients` then `generateWrapUpLinks`.
 * That is the layer where the duplicate rows are actually created, and therefore the
 * layer where "does not re-send" is observable.
 *
 * The route-level `wrappedAt` guard is deliberately NOT asserted here — see the ticket's
 * Evidence section. It is a one-liner mirroring the already-shipped
 * `confirm-invites-sent/route.ts:51-53`, and claiming DB-test coverage for it would be
 * false.
 *
 * NO SMS IS SENT. `dispatchPendingWrapUpMessages` (the only thing that calls `sendSms`)
 * is never invoked. Every assertion is on `WrapUpLink` rows and their dispatch state,
 * which is what the dispatcher would later turn into messages, one row at a time
 * (`wrap-up.ts:182` iterates rows, not people).
 *
 * Run: npx tsx tests/wrap-up-double-send-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import {
  selectWrapUpRecipients,
  generateWrapUpLinks,
  type WrapUpCandidate,
} from '../src/lib/wrap-up';

const prisma = new PrismaClient();

const TAG = 'GTC209';

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

/** Load the event's people exactly as the wrap-up route does (`route.ts:30-46`). */
async function loadCandidates(eventId: string): Promise<WrapUpCandidate[]> {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      people: {
        include: { person: { include: { assignments: { include: { item: true } } } } },
      },
    },
  });
  return (event?.people ?? []) as unknown as WrapUpCandidate[];
}

/**
 * One press, as the route performs it at `wrap-up/route.ts:106-108`.
 * The route's own `wrappedAt` write is replicated so the fixture matches production
 * state after a press, but this helper deliberately does NOT apply the route guard —
 * a second call here is exactly the "reload / second tab / direct POST" case.
 */
async function press(eventId: string) {
  await prisma.event.update({ where: { id: eventId }, data: { wrappedAt: new Date() } });
  const guests = selectWrapUpRecipients(await loadCandidates(eventId), HOST_ID);
  return generateWrapUpLinks(eventId, guests);
}

let HOST_ID = '';

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── Fixture: a COMPLETE event (endDate in the past) with three guests ──
    const now = new Date();
    const past = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const anchor = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);
    HOST_ID = host.id;

    const event = await prisma.event.create({
      data: {
        name: `${TAG} double-send test`,
        startDate: past,
        endDate: past, // isComplete() = now > endDate
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt: anchor,
      },
    });
    eventId = event.id;

    await prisma.personEvent.create({
      data: { personId: host.id, eventId, role: 'HOST', householdRole: 'PRIMARY_CONTACT' },
    });

    /** Three guests spanning all three channels generateWrapUpLinks can assign. */
    async function makeGuest(name: string, phoneNumber: string | null, email: string | null) {
      const person = await prisma.person.create({
        data: { name: `${TAG} ${name}`, phoneNumber, email },
      });
      createdPersonIds.push(person.id);
      await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId,
          role: 'PARTICIPANT',
          householdRole: 'GUEST',
          contactMethod: phoneNumber ? 'SMS' : 'EMAIL',
        },
      });
      return person;
    }

    const smsGuest = await makeGuest('Sms Guest', '+64211234567', 'sms@example.test');
    const emailGuest = await makeGuest('Email Guest', null, 'email@example.test');
    const unreachable = await makeGuest('Unreachable Guest', null, null);

    const REACHABLE = 2; // sms + email; the third has no contact details
    const TOTAL_GUESTS = 3; // a 'skipped' row is still written

    // ── PRESS 1 — the correct, single press. Must be unaffected by the fix. ──
    const first = await press(eventId);

    assert('press 1', 'reports 2 links created (sms + email)', first.created === REACHABLE);
    assert('press 1', 'reports 1 guest skipped (no contact details)', first.skipped === 1);

    const afterFirst = await prisma.wrapUpLink.findMany({ where: { eventId } });
    assert('press 1', 'one WrapUpLink row per guest', afterFirst.length === TOTAL_GUESTS);
    assert(
      'press 1',
      'the host is not a recipient',
      !afterFirst.some((l) => l.personId === host.id)
    );
    assert(
      'press 1',
      'sms guest routed to the sms channel',
      afterFirst.find((l) => l.personId === smsGuest.id)?.channel === 'sms'
    );
    assert(
      'press 1',
      'email-only guest routed to the email channel',
      afterFirst.find((l) => l.personId === emailGuest.id)?.channel === 'email'
    );
    assert(
      'press 1',
      'unreachable guest marked skipped and pre-dispatched',
      afterFirst.find((l) => l.personId === unreachable.id)?.channel === 'skipped' &&
        afterFirst.find((l) => l.personId === unreachable.id)?.dispatched === true
    );

    // ── PRESS 2 — the defect. A reload, a second tab, or a direct POST. ──
    const second = await press(eventId);

    assert('press 2', 'creates ZERO new links', second.created === 0);

    const afterSecond = await prisma.wrapUpLink.findMany({ where: { eventId } });
    assert(
      'press 2',
      'total WrapUpLink rows unchanged after the second press',
      afterSecond.length === TOTAL_GUESTS
    );

    const perPerson = new Map<string, number>();
    for (const link of afterSecond) {
      perPerson.set(link.personId, (perPerson.get(link.personId) ?? 0) + 1);
    }
    const duplicated = [...perPerson.entries()].filter(([, n]) => n > 1);
    assert(
      'press 2',
      `no guest holds more than one link (found ${duplicated.length} duplicated)`,
      duplicated.length === 0
    );

    // The dispatcher iterates ROWS, not people (`wrap-up.ts:182`), so the pending row
    // count IS the number of messages that would be sent.
    const pending = await prisma.wrapUpLink.findMany({
      where: { eventId, dispatched: false },
    });
    assert(
      'press 2',
      `dispatcher would send exactly ${REACHABLE} messages, not ${REACHABLE * 2}`,
      pending.length === REACHABLE
    );

    // ── CONTROL — dedupe must not block a legitimately new guest ──
    // GTC-186 (H1) and the mini-send model both depend on a guest added AFTER the press
    // still being reachable. A dedupe that keyed on the event rather than on
    // (event, person) would pass every assertion above and silently break this.
    const lateGuest = await makeGuest('Late Guest', '+64217654321', 'late@example.test');
    const third = await press(eventId);

    assert('control', 'a guest added after the press gets a link', third.created === 1);

    const afterThird = await prisma.wrapUpLink.findMany({ where: { eventId } });
    assert(
      'control',
      'the late guest holds exactly one link',
      afterThird.filter((l) => l.personId === lateGuest.id).length === 1
    );
    assert(
      'control',
      'and no existing guest was duplicated by that press',
      afterThird.length === TOTAL_GUESTS + 1
    );
  } finally {
    // Cleanup — own rows only.
    if (eventId) {
      await prisma.wrapUpLink.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error('\nRED assertions:');
    redAssertions.forEach((a) => console.error(`  ✗ ${a}`));
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
