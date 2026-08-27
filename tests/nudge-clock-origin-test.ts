/**
 * GTC-178 (E1, phase 2) — the nudge clock is PER-EVENT, not per-person.
 *
 * `Person.inviteAnchorAt` is global. A person who is a guest at two events has ONE
 * anchor, so the second event's nudge timing has been wrong since the day
 * `PersonEvent.sentAt` was introduced without `nudge-eligibility.ts` being updated to
 * read it. `prisma/schema.prisma`'s own comment on `PersonEvent.sentAt` names this
 * ticket as the fix. Ruling 2 (2026-08-23) records it as a BUG FIX, not a refactor.
 *
 * THE FIXTURE IS THE ARGUMENT. One person, two live sent events, two different personal
 * send dates. Under the global anchor the second event inherits the first event's clock
 * and fires immediately; under the per-event clock it waits its turn. Nothing about that
 * is expressible with a one-event fixture, which is why the leak survived this long.
 *
 * WHY THIS SEAM, AND NOT THE SENDER. The sent-stamp is written only on
 * `result.success`, and `sendSms` fails closed with no TNZ_AUTH_TOKEN — so locally
 * `success` is never true and a stamp assertion would sit RED forever for the wrong
 * reason. Same constraint tests/decide-by-followup-test.ts and
 * tests/wrap-up-double-send-test.ts document, solved the same way: assert at the layer
 * where candidacy is decided. NO SMS IS SENT — `processNudges` is never invoked.
 *
 * `now` IS INJECTED. This is a clock feature; a test that cannot fix the clock asserts
 * whatever the wall clock happened to be when CI ran. Same shape as
 * `findDecideByFollowupCandidates(now)` and `isComplete(event, now)`.
 *
 * SCOPE OF THIS PHASE. Timing stays 24h/48h and the `!hasOpened` gate stays — both move
 * in phase 5, and moving them here would mean two variables changed at once with no way
 * to tell which one a failure came from. Every assertion below is about WHICH CLOCK IS
 * READ, nothing else.
 *
 * Run: npx tsx tests/nudge-clock-origin-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';

const prisma = new PrismaClient();

const TAG = 'GTC178P2';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

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

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];

  try {
    // ── Fixture ──────────────────────────────────────────────────────────
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * DAY);
    const oneHourAgo = new Date(now.getTime() - 1 * HOUR);
    const future = new Date(now.getTime() + 14 * DAY);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    async function makeEvent(key: string, sentAt: Date) {
      const event = await prisma.event.create({
        data: {
          name: `${TAG} ${key}`,
          startDate: future,
          endDate: future,
          hostId: host.id,
          // SENT_AND_LIVE: sentAt not null AND endDate in the future.
          status: 'CONFIRMING',
          sentAt,
        },
      });
      createdEventIds.push(event.id);
      return event;
    }

    /**
     * Everything findNudgeCandidates checks, satisfied: valid NZ mobile, a PARTICIPANT
     * token, unopened, no assignments (so `hasResponded` is false), no nudge stamped, not
     * opted out. The ONLY variable is which clock says how long they have been waiting.
     */
    async function joinEvent(
      person: { id: string },
      event: { id: string },
      personEventSentAt: Date | null
    ) {
      const personEvent = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          sentAt: personEventSentAt,
        },
      });
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${person.id}-${event.id}`,
          scope: 'PARTICIPANT',
          eventId: event.id,
          personId: person.id,
          openedAt: null,
        },
      });
      return personEvent;
    }

    async function makePerson(name: string, phone: string, inviteAnchorAt: Date | null) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
          phoneNumber: phone,
          inviteAnchorAt,
        },
      });
      createdPersonIds.push(person.id);
      return person;
    }

    // ── SUBJECT — one person, two events, two clocks ─────────────────────
    // Event A pressed 8 days ago and is what anchored them globally. Event B pressed one
    // hour ago. Under the global anchor, B inherits A's 8-day-old clock.
    const eventA = await makeEvent('event A (pressed 8d ago)', eightDaysAgo);
    const eventB = await makeEvent('event B (pressed 1h ago)', oneHourAgo);

    const subject = await makePerson('Two Events', '+64211111111', eightDaysAgo);
    const subjectPeA = await joinEvent(subject, eventA, eightDaysAgo);
    const subjectPeB = await joinEvent(subject, eventB, oneHourAgo);

    // ── INVERSE — a personal clock with NO global anchor ─────────────────
    // Proves the GATE moved, not just the read. The old query filtered
    // `inviteAnchorAt: { not: null }`, so this person was invisible to it entirely.
    const eventC = await makeEvent('event C (pressed 8d ago)', eightDaysAgo);
    const inverse = await makePerson('No Global Anchor', '+64212222222', null);
    await joinEvent(inverse, eventC, eightDaysAgo);

    // ── FAIL-SAFE — a global anchor with NO personal clock ───────────────
    // No clock must mean no nudge. If this one stays eligible, the global field is still
    // being read as a fallback and the leak is intact behind a rename.
    const eventD = await makeEvent('event D (pressed 8d ago)', eightDaysAgo);
    const noClock = await makePerson('No Personal Clock', '+64213333333', eightDaysAgo);
    await joinEvent(noClock, eventD, null);

    console.log(`\n  subject      = ${subject.id}  (events A + B)`);
    console.log(`  inverse      = ${inverse.id}`);
    console.log(`  no-clock     = ${noClock.id}\n`);

    // ── Act ──────────────────────────────────────────────────────────────
    const result = await findNudgeCandidates(now);
    const at = (list: typeof result.eligibleFirst, personId: string, eventId: string) =>
      list.find((c) => c.personId === personId && c.eventId === eventId);
    const in24h = (personId: string, eventId: string) =>
      !!at(result.eligibleFirst, personId, eventId);
    const in48h = (personId: string, eventId: string) =>
      !!at(result.eligibleSecond, personId, eventId);

    // ── THE LEAK — the assertion this whole file exists for ──────────────
    assert(
      'leak',
      "event B does NOT nudge on event A's clock (24h) — pressed 1 hour ago",
      !in24h(subject.id, eventB.id)
    );
    assert(
      'leak',
      "event B does NOT nudge on event A's clock (48h) — pressed 1 hour ago",
      !in48h(subject.id, eventB.id)
    );

    // ── THE CONTROL — the same person, the same run, the other event ─────
    // Without this the leak assertions could be satisfied by a bug that simply stops
    // nudging everyone. Same person, same query, opposite outcome — so the difference is
    // the clock and nothing else.
    assert(
      'control',
      'event A DOES still nudge the same person (24h) — pressed 8 days ago',
      in24h(subject.id, eventA.id)
    );
    assert(
      'control',
      'event A DOES still nudge the same person (48h) — pressed 8 days ago',
      in48h(subject.id, eventA.id)
    );

    // ── THE INVERSE — the gate moved, not just the read ──────────────────
    assert(
      'inverse',
      'a person with NO inviteAnchorAt is still nudged off their PersonEvent.sentAt',
      in24h(inverse.id, eventC.id) && in48h(inverse.id, eventC.id)
    );
    const inverseCandidate = at(result.eligibleFirst, inverse.id, eventC.id);
    assert(
      'inverse',
      'and their anchorAt IS PersonEvent.sentAt — a real date, from the per-event row',
      inverseCandidate?.anchorAt?.getTime() === eightDaysAgo.getTime()
    );

    // ── THE FAIL-SAFE — no clock, no nudge ───────────────────────────────
    assert(
      'fail-safe',
      'a null PersonEvent.sentAt is NOT nudged, even with a global anchor set',
      !in24h(noClock.id, eventD.id) && !in48h(noClock.id, eventD.id)
    );

    // ── personEventId — the row the phase-3 columns will hang off ────────
    const candA = at(result.eligibleFirst, subject.id, eventA.id);
    assert(
      'personEventId',
      "candidate carries the PersonEvent row's id, not just person + event",
      candA?.personEventId === subjectPeA.id
    );
    assert(
      'personEventId',
      "and it is THIS event's row — the two memberships are distinguishable",
      subjectPeA.id !== subjectPeB.id && candA?.personEventId !== subjectPeB.id
    );

    // ── Fixture integrity ────────────────────────────────────────────────
    // If the subject stopped being messageable for some unrelated reason the control
    // above would fail for the wrong reason. Pin the preconditions.
    const peA = await prisma.personEvent.findUnique({ where: { id: subjectPeA.id } });
    const peB = await prisma.personEvent.findUnique({ where: { id: subjectPeB.id } });
    assert(
      'fixture',
      'both memberships are real, distinct, and carry the two different clocks',
      peA?.sentAt?.getTime() === eightDaysAgo.getTime() &&
        peB?.sentAt?.getTime() === oneHourAgo.getTime()
    );
    const subjectRow = await prisma.person.findUnique({ where: { id: subject.id } });
    assert(
      'fixture',
      'the global anchor is still set — the fix is reading past it, not relying on it being null',
      subjectRow?.inviteAnchorAt?.getTime() === eightDaysAgo.getTime()
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    for (const eventId of createdEventIds) {
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — every event carries its own nudge clock.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
