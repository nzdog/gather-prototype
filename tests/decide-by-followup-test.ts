/**
 * GTC-175 (D2) — The decide-by follow-up fires exactly once, and never to a child.
 *
 * Hinge §8: "Near the decide-by, one follow-up in the same voice." One. The clock suite
 * (tests/decide-by-clock-test.ts) proves the derivation; THIS file proves the sweep that
 * consumes it picks the right people and picks them once.
 *
 * WHY THIS SEAM, AND NOT THE SENDER.
 * The stamp is written only on `result.success` (the `sendNudge` idiom,
 * nudge-sender.ts:74-82), and `sendSms` fails closed with no TNZ_AUTH_TOKEN — so locally
 * `success` is never true and a stamp assertion would sit RED forever for the wrong
 * reason. Same constraint tests/wrap-up-double-send-test.ts:20-27 documents and solves the
 * same way: assert at the layer where candidacy is decided. Every assertion below is on
 * `findDecideByFollowupCandidates`, which is what the sender would later turn into texts.
 *
 * NO SMS IS SENT. `processDecideByFollowups` is never invoked. Fixtures carry no real
 * contact details — RESEND_API_KEY is live in .env and an email fallback would make a
 * genuine call (the warning tests/wrap-up-quiet-hours-test.ts:19-26 records).
 *
 * THE CHILD GATE IS THE POINT OF HALF THIS FILE. `isMessageableRole(undefined)` returns
 * TRUE (child-exclusion.ts:65-68), so a gate that naively calls it on a missing
 * membership row FAILS OPEN — the exact inversion of that module's own allowlist
 * rationale. Both directions are asserted: a CHILD is skipped, and a person with no
 * membership row at all is skipped for a DIFFERENT, named reason.
 *
 * Run: npx tsx tests/decide-by-followup-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { findDecideByFollowupCandidates } from '../src/lib/sms/decide-by-eligibility';

const prisma = new PrismaClient();

const TAG = 'GTC175';
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
    //
    // NOW is fixed, and every finder call passes an explicit clock — the whole feature
    // is a clock, so no assertion here may depend on what the wall clock happens to be.
    //
    // The main event ends in 10 days. With the 120h (5-day) default that puts the
    // decide-by at now+5d and opens the 24h follow-up window at now+4d. So:
    //   now       → 4 days before the window opens  (none before)
    //   now+4.5d  → inside the window               (due)
    //   now+6d    → a day past the decide-by        (not chased)
    // Walking the clock forward exercises all three without touching a single row.
    const now = new Date();
    const sentAt = new Date(now.getTime() - 3 * DAY);
    const endsIn10Days = new Date(now.getTime() + 10 * DAY);
    const inWindow = new Date(now.getTime() + 4.5 * DAY);
    const pastDecideBy = new Date(now.getTime() + 6 * DAY);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    async function makeEvent(name: string, endDate: Date, offsetHours: number | null = null) {
      const event = await prisma.event.create({
        data: {
          name: `${TAG} ${name}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: 'CONFIRMING',
          // SENT_AND_LIVE: sentAt not null AND endDate in the future.
          sentAt,
          decideByOffsetHours: offsetHours,
        },
      });
      createdEventIds.push(event.id);
      const team = await prisma.team.create({
        data: { name: `${TAG} Team`, eventId: event.id },
      });
      return { event, team };
    }

    const main = await makeEvent('main event', endsIn10Days);

    /**
     * A guest who is maximally messageable by every signal except the one under test:
     * real NZ phone, email, DIRECT tier, a participant token, and a MAYBE they tapped.
     */
    async function makeGuest(opts: {
      name: string;
      phone: string;
      householdRole: 'PRIMARY_CONTACT' | 'CHILD' | 'GUEST' | null;
      eventId: string;
      teamId: string;
      response?: 'MAYBE' | 'ACCEPTED' | 'DECLINED' | 'PENDING';
      followupSentAt?: Date | null;
      itemOffsetHours?: number | null;
      skipMembership?: boolean;
      itemCount?: number;
    }) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${opts.name}`,
          email: `${TAG.toLowerCase()}-${opts.name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
          phoneNumber: opts.phone,
        },
      });
      createdPersonIds.push(person.id);

      if (!opts.skipMembership) {
        await prisma.personEvent.create({
          data: {
            personId: person.id,
            eventId: opts.eventId,
            role: 'PARTICIPANT',
            // The §10.6 contradiction: contact info present, so even a CHILD derives DIRECT.
            reachabilityTier: 'DIRECT',
            contactMethod: 'SMS',
            householdRole: opts.householdRole,
            sentAt,
          },
        });
      }

      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${person.id}`,
          scope: 'PARTICIPANT',
          eventId: opts.eventId,
          personId: person.id,
        },
      });

      const assignmentIds: string[] = [];
      for (let i = 0; i < (opts.itemCount ?? 1); i++) {
        const item = await prisma.item.create({
          data: {
            name: `${TAG} ${opts.name} item ${i + 1}`,
            teamId: opts.teamId,
            status: 'ASSIGNED',
            decideByOffsetHours: opts.itemOffsetHours ?? null,
          },
        });
        const assignment = await prisma.assignment.create({
          data: {
            itemId: item.id,
            personId: person.id,
            response: opts.response ?? 'MAYBE',
            decideByFollowupSentAt: opts.followupSentAt ?? null,
          },
        });
        assignmentIds.push(assignment.id);
      }

      return { person, assignmentIds };
    }

    const base = { eventId: main.event.id, teamId: main.team.id };

    const subject = await makeGuest({
      name: 'Subject Adult',
      phone: '+64211111111',
      householdRole: 'GUEST',
      ...base,
    });
    const child = await makeGuest({
      name: 'Child In Window',
      phone: '+64211234567',
      householdRole: 'CHILD',
      ...base,
    });
    const nullRole = await makeGuest({
      name: 'Direct Add',
      phone: '+64214444444',
      householdRole: null,
      ...base,
    });
    const orphan = await makeGuest({
      name: 'No Membership',
      phone: '+64215555555',
      householdRole: null,
      skipMembership: true,
      ...base,
    });
    const stamped = await makeGuest({
      name: 'Already Texted',
      phone: '+64216666666',
      householdRole: 'GUEST',
      followupSentAt: new Date(now.getTime() - HOUR),
      ...base,
    });
    const acceptedGuest = await makeGuest({
      name: 'Accepted',
      phone: '+64217777777',
      householdRole: 'GUEST',
      response: 'ACCEPTED',
      ...base,
    });
    const twoItems = await makeGuest({
      name: 'Two Maybes',
      phone: '+64218888888',
      householdRole: 'GUEST',
      itemCount: 2,
      ...base,
    });

    // A second event whose date is inside the offset window: every maybe on it is born
    // already past its decide-by. Not contrived — Item.dropOffAt is not host-settable
    // today, so neededBy() collapses to endDate for essentially every item, and any host
    // who presses send within 5 days of the date lands every guest here.
    const soon = await makeEvent('event in 2 days', new Date(now.getTime() + 2 * DAY));
    const bornExpired = await makeGuest({
      name: 'Born Expired',
      phone: '+64219999999',
      householdRole: 'GUEST',
      eventId: soon.event.id,
      teamId: soon.team.id,
    });
    const childExpired = await makeGuest({
      name: 'Child Expired',
      phone: '+64212222222',
      householdRole: 'CHILD',
      eventId: soon.event.id,
      teamId: soon.team.id,
    });

    console.log(`\n  subject (GUEST)      = ${subject.person.id}`);
    console.log(`  child in window      = ${child.person.id}`);
    console.log(`  child expired maybe  = ${childExpired.person.id}`);
    console.log(`  no membership row    = ${orphan.person.id}\n`);

    const has = (result: { eligible: { personId: string }[] }, id: string) =>
      result.eligible.some((c) => c.personId === id);
    const reasons = (result: { skipped: { reason: string; count: number }[] }) =>
      result.skipped.map((s) => s.reason);

    // ── PHASE 1 — before the window opens: none before ───────────────────
    const early = await findDecideByFollowupCandidates(now);
    assert(
      'none before',
      'a maybe 6 days from its decide-by is NOT a candidate',
      !has(early, subject.person.id)
    );
    assert('none before', 'nobody at all is due this early', early.eligible.length === 0);

    // ── PHASE 2 — inside the window ──────────────────────────────────────
    const due = await findDecideByFollowupCandidates(inWindow);
    assert(
      'in window',
      'the subject IS a candidate once the window opens',
      has(due, subject.person.id)
    );
    assert(
      'in window',
      'a NULL-role direct-add adult is still a candidate',
      has(due, nullRole.person.id)
    );

    // ── PHASE 3 — the child gate, both directions ────────────────────────
    assert('child gate', 'a CHILD with a maybe is NOT a candidate', !has(due, child.person.id));
    assert(
      'child gate',
      'a person with NO membership row is NOT a candidate (fails CLOSED)',
      !has(due, orphan.person.id)
    );
    assert(
      'child gate',
      'the missing-membership skip has its OWN reason — a missing row is not a child',
      reasons(due).some((r) => /membership/i.test(r)) && reasons(due).some((r) => /CHILD/.test(r))
    );

    // ── PHASE 4 — fires once ─────────────────────────────────────────────
    assert(
      'fires once',
      'an already-stamped assignment is NOT a candidate',
      !has(due, stamped.person.id)
    );
    assert(
      'fires once',
      'an ACCEPTED assignment is never a candidate',
      !has(due, acceptedGuest.person.id)
    );
    assert(
      'fires once',
      'two maybes by one guest collapse to ONE message, not two',
      due.eligible.filter((c) => c.personId === twoItems.person.id).length === 1
    );
    assert(
      'fires once',
      'the collapsed candidate carries BOTH assignments so both get stamped',
      (due.eligible.find((c) => c.personId === twoItems.person.id)?.assignmentIds.length ?? 0) === 2
    );

    // ── PHASE 5 — past the decide-by: silence, not a stale deadline ──────
    const late = await findDecideByFollowupCandidates(pastDecideBy);
    assert('expired', 'a maybe past its decide-by is NOT texted', !has(late, subject.person.id));
    assert(
      'expired',
      'a maybe born already-expired is never texted',
      !has(due, bornExpired.person.id) && !has(late, bornExpired.person.id)
    );
    assert(
      'expired',
      'a CHILD with an EXPIRED maybe receives no follow-up either',
      !has(due, childExpired.person.id) && !has(late, childExpired.person.id)
    );
    assert(
      'expired',
      'the passed-decide-by skip is recorded, not silent',
      reasons(late).some((r) => /decide-by/i.test(r))
    );

    // ── Sanity: the child really is maximally messageable but for role ───
    const childRow = await prisma.personEvent.findFirstOrThrow({
      where: { personId: child.person.id, eventId: main.event.id },
      include: { person: true },
    });
    assert(
      'fixture',
      'the child keeps phone + email + DIRECT tier — the gate keys on ROLE, not on data',
      childRow.person.phoneNumber === '+64211234567' &&
        !!childRow.person.email &&
        childRow.reachabilityTier === 'DIRECT' &&
        childRow.householdRole === 'CHILD'
    );
  } finally {
    // ── Cleanup ──────────────────────────────────────────────────────────
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
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
  console.log('\x1b[32mGREEN — one follow-up, in its window, never to a child.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
