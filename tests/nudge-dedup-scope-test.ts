/**
 * GTC-178 (E1, phase 4) — the sent-side dedup state is PER-EVENT, not per-person.
 *
 * THE SECOND HALF OF THE SAME LEAK. Phase 2 fixed the clock: which instant the cadence
 * counts from. This fixes the STAMP: where "already nudged" is recorded. Both were
 * per-person fields standing in for a per-event fact, and fixing only one leaves the bug
 * intact through the other door — a correct per-event clock is worthless if a single
 * global flag silences every event the moment one of them sends.
 *
 * Concretely, before this phase: one person in two live events, both past 24h. The cron
 * nudges them for event A and stamps `Person.nudge24hSentAt`. Event B — a different host,
 * a different occasion, its own send — is now permanently silent for that person. Nobody
 * is nudged twice; somebody is never nudged at all. That is the worse direction to fail,
 * and it is invisible without a two-event fixture.
 *
 * HOW THIS FILE SURVIVES THE CUTOVER UNCHANGED. The stamp is written by `sendNudge` only
 * on `result.success`, and `sendSms` fails closed with no TNZ_AUTH_TOKEN — so the send
 * path cannot be driven locally (the constraint tests/decide-by-followup-test.ts and
 * tests/wrap-up-double-send-test.ts both document). The fixture therefore writes the
 * stamp directly, and writes it in BOTH the old location and the new one. That is not
 * belt-and-braces padding: the fact being asserted is "event A's first nudge has already
 * fired", and this file has to state that fact in whichever column the code under test
 * reads, so that ONE unmodified file can be run RED before the cutover and GREEN after.
 * The write side is asserted structurally below, for the same reason.
 *
 * SCOPE OF THIS PHASE. Timing stays 24h/48h, labels stay "24h"/"48h", and the
 * `!hasOpened` gate stays — all three move in phase 5 (Ruling 5). Every assertion below
 * is about WHERE THE STAMP LIVES, nothing else.
 *
 * Run: npx tsx tests/nudge-dedup-scope-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';

const prisma = new PrismaClient();

const TAG = 'GTC178P4';
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

/** Source with comments stripped — naming what you removed must not read as still doing it. */
function code(rel: string): string {
  return readFileSync(join(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
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

    async function makeEvent(key: string) {
      const event = await prisma.event.create({
        data: {
          name: `${TAG} ${key}`,
          startDate: future,
          endDate: future,
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt: eightDaysAgo,
        },
      });
      createdEventIds.push(event.id);
      return event;
    }

    async function joinEvent(person: { id: string }, event: { id: string }) {
      const personEvent = await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          // Both events pressed 8 days ago: both are past 24h AND past 48h, so the ONLY
          // thing that can separate them is the stamp.
          sentAt: eightDaysAgo,
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

    const eventA = await makeEvent('event A (nudged)');
    const eventB = await makeEvent('event B (never nudged)');

    const subject = await prisma.person.create({
      data: {
        name: `${TAG} Two Events`,
        email: `${TAG.toLowerCase()}-two-events@example.test`,
        phoneNumber: '+64211111111',
        // Still set, deliberately: the fix must read past it, not depend on it being null.
        inviteAnchorAt: eightDaysAgo,
      },
    });
    createdPersonIds.push(subject.id);

    const peA = await joinEvent(subject, eventA);
    const peB = await joinEvent(subject, eventB);

    // ── "Event A's nudges have already fired." ───────────────────────────
    // Written in BOTH locations — see the header. Pre-cutover the eligibility query
    // reads the Person pair; post-cutover it reads the PersonEvent pair. The fact is the
    // same either way, and stating it twice is what lets one file prove both states.
    await prisma.person.update({
      where: { id: subject.id },
      data: { nudge24hSentAt: oneHourAgo, nudge48hSentAt: oneHourAgo },
    });
    await prisma.personEvent.update({
      where: { id: peA.id },
      data: { firstNudgeSentAt: oneHourAgo, secondNudgeSentAt: oneHourAgo },
    });

    console.log(`\n  subject  = ${subject.id}`);
    console.log(`  event A  = ${eventA.id}  (stamped — already nudged)`);
    console.log(`  event B  = ${eventB.id}  (unstamped — never nudged)\n`);

    // ── Act ──────────────────────────────────────────────────────────────
    const result = await findNudgeCandidates(now);
    const in24h = (eventId: string) =>
      result.eligible24h.some((c) => c.personId === subject.id && c.eventId === eventId);
    const in48h = (eventId: string) =>
      result.eligible48h.some((c) => c.personId === subject.id && c.eventId === eventId);

    // ── THE LEAK — the assertion this whole file exists for ──────────────
    assert(
      'leak',
      "event B is STILL eligible (24h) — event A's nudge must not silence it",
      in24h(eventB.id)
    );
    assert(
      'leak',
      "event B is STILL eligible (48h) — event A's nudge must not silence it",
      in48h(eventB.id)
    );

    // ── THE CONTROL — the stamp still works where it belongs ─────────────
    // Without this the leak assertions could be satisfied by a fix that simply stopped
    // deduping at all, which would nudge everyone forever. Same person, same run,
    // opposite outcome — so the difference is the stamp's SCOPE and nothing else.
    assert(
      'control',
      'event A is NOT eligible (24h) — its own stamp is still respected',
      !in24h(eventA.id)
    );
    assert(
      'control',
      'event A is NOT eligible (48h) — its own stamp is still respected',
      !in48h(eventA.id)
    );

    // ── THE WRITE SIDE — structural, because the send path cannot run ────
    const senderSrc = code('src/lib/sms/nudge-sender.ts');
    assert(
      'write',
      'nudge-sender.ts no longer writes Person.nudge24hSentAt / nudge48hSentAt',
      !senderSrc.includes('nudge24hSentAt') && !senderSrc.includes('nudge48hSentAt')
    );
    assert(
      'write',
      'nudge-sender.ts stamps firstNudgeSentAt / secondNudgeSentAt instead',
      senderSrc.includes('firstNudgeSentAt') && senderSrc.includes('secondNudgeSentAt')
    );
    assert(
      'write',
      'and it stamps the PersonEvent row, not the Person row',
      senderSrc.includes('personEvent.update') && !senderSrc.includes('person.update')
    );

    const eligibilitySrc = code('src/lib/sms/nudge-eligibility.ts');
    assert(
      'read',
      'nudge-eligibility.ts no longer reads the Person-level stamps',
      !eligibilitySrc.includes('nudge24hSentAt') && !eligibilitySrc.includes('nudge48hSentAt')
    );

    // ── Fixture integrity ────────────────────────────────────────────────
    const peBAfter = await prisma.personEvent.findUnique({ where: { id: peB.id } });
    assert(
      'fixture',
      'event B genuinely carries no stamp of its own — the leak assertion is not vacuous',
      peBAfter?.firstNudgeSentAt === null && peBAfter?.secondNudgeSentAt === null
    );
    const peAAfter = await prisma.personEvent.findUnique({ where: { id: peA.id } });
    const subjectAfter = await prisma.person.findUnique({ where: { id: subject.id } });
    assert(
      'fixture',
      'the fact is stated in BOTH locations, so one file can prove both sides of the cutover',
      peAAfter?.firstNudgeSentAt?.getTime() === oneHourAgo.getTime() &&
        subjectAfter?.nudge24hSentAt?.getTime() === oneHourAgo.getTime()
    );
    assert(
      'fixture',
      'both memberships are past 24h and 48h — only the stamp can separate them',
      peAAfter?.sentAt?.getTime() === eightDaysAgo.getTime() &&
        peBAfter?.sentAt?.getTime() === eightDaysAgo.getTime()
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
  console.log('\x1b[32mGREEN — one event’s nudge never silences another.\x1b[0m');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
