/**
 * GTC-178 (E1, phase 5) — day-4 / day-7, on the system's own schedule.
 *
 * Moment 4 §8.3 ruled two nudges at days 4 and 7, adjustable, with criticality NOT
 * compressing them. §4: the schedule is the system's — "Kate does not compose, time, or
 * approve them." This file proves the arithmetic, the boundaries, the gate change, and
 * the two invariants that are easiest to break silently.
 *
 * THREE LAYERS, DELIBERATELY:
 *  1. Pure — `src/lib/nudge-cadence.ts` against fixed clocks. No database, so the
 *     boundaries can be hit exactly rather than approximately.
 *  2. DB — `findNudgeCandidates(now)` with `now` injected, at day 3 / 4 / 6 / 7. The
 *     pure layer can be right while the sweep still reads the old constants.
 *  3. Structural — criticality, asserted on source with comments stripped.
 *
 * WHY `now` IS INJECTED. A cadence test that cannot fix the clock asserts whatever the
 * wall clock happened to be when CI ran, and day-4/day-7 boundaries are exactly where
 * that goes wrong. Same shape as tests/decide-by-clock-test.ts.
 *
 * NO SMS IS SENT. `processNudges` is never invoked; every assertion is at the layer where
 * candidacy is decided.
 *
 * Run: npx tsx tests/nudge-cadence-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  DEFAULT_NUDGE_OFFSET_DAYS,
  resolveNudgeOffsetDays,
  normaliseOffsets,
  nudgeDueAt,
  dueNudgeIndices,
  nextNudgeAt,
} from '../src/lib/nudge-cadence';
import { findNudgeCandidates } from '../src/lib/sms/nudge-eligibility';

const prisma = new PrismaClient();

const TAG = 'GTC178P5';
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

/** Source with comments stripped — naming a thing you excluded must not read as using it. */
function code(rel: string): string {
  return readFileSync(join(__dirname, '..', rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];

  try {
    // ══ LAYER 1 — the pure module ═══════════════════════════════════════
    const T0 = new Date('2026-08-01T09:00:00.000Z');

    assert(
      'pure',
      'the default cadence is days 4 and 7',
      DEFAULT_NUDGE_OFFSET_DAYS.length === 2 &&
        DEFAULT_NUDGE_OFFSET_DAYS[0] === 4 &&
        DEFAULT_NUDGE_OFFSET_DAYS[1] === 7
    );

    assert(
      'pure',
      'resolve returns the system default — the only layer today',
      JSON.stringify(resolveNudgeOffsetDays({})) === JSON.stringify([4, 7])
    );

    assert(
      'pure',
      'resolve is a params object, so GTC-179 adds keys not arguments',
      JSON.stringify(resolveNudgeOffsetDays({ person: null, event: null })) ===
        JSON.stringify([4, 7])
    );

    assert(
      'pure',
      'day-4 leg is due exactly 4 days after the send',
      nudgeDueAt(T0, 4).getTime() === T0.getTime() + 4 * DAY
    );
    assert(
      'pure',
      'day-7 leg is due exactly 7 days after the send',
      nudgeDueAt(T0, 7).getTime() === T0.getTime() + 7 * DAY
    );

    // The boundaries. `<= now` is the rule, so the instant itself is DUE.
    const at = (d: number, ms = 0) => new Date(T0.getTime() + d * DAY + ms);
    assert(
      'pure boundary',
      'day 3 + 23:59:59 — nothing due yet',
      dueNudgeIndices(T0, at(4, -1000)).length === 0
    );
    assert(
      'pure boundary',
      'day 4 exactly — the first leg is due (inclusive)',
      JSON.stringify(dueNudgeIndices(T0, at(4))) === JSON.stringify([0])
    );
    assert(
      'pure boundary',
      'day 6 + 23:59:59 — still only the first',
      JSON.stringify(dueNudgeIndices(T0, at(7, -1000))) === JSON.stringify([0])
    );
    assert(
      'pure boundary',
      'day 7 exactly — both legs due (inclusive)',
      JSON.stringify(dueNudgeIndices(T0, at(7))) === JSON.stringify([0, 1])
    );

    assert(
      'pure',
      'nextNudgeAt on day 0 is the day-4 instant',
      nextNudgeAt(T0, T0)?.getTime() === at(4).getTime()
    );
    assert(
      'pure',
      'nextNudgeAt after day 4 is the day-7 instant',
      nextNudgeAt(T0, at(5))?.getTime() === at(7).getTime()
    );
    assert(
      'pure',
      'nextNudgeAt after day 7 is null — spent, NOT a red signal',
      nextNudgeAt(T0, at(8)) === null
    );

    // The don't-chase seam (GTC-179 §10.3). No new branch in the sweep, just [].
    assert(
      'pure',
      "an empty cadence is never due — the don't-chase seam",
      dueNudgeIndices(T0, at(365), []).length === 0 && nextNudgeAt(T0, T0, []) === null
    );

    assert(
      'pure',
      'offsets normalise ascending, deduped, no negatives',
      JSON.stringify(normaliseOffsets([7, 4, 4, -1, 7])) === JSON.stringify([4, 7])
    );

    // ══ LAYER 2 — the sweep, with now injected ══════════════════════════
    const now = new Date();
    const sentAt = new Date(now.getTime() - 30 * DAY); // long ago; `now` moves, not this
    const future = new Date(now.getTime() + 90 * DAY);

    const host = await prisma.person.create({ data: { name: `${TAG} Host` } });
    createdPersonIds.push(host.id);

    const event = await prisma.event.create({
      data: {
        name: `${TAG} cadence event`,
        startDate: future,
        endDate: future,
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(event.id);

    /**
     * `opened` is the point of the second subject. Ruling 5 deletes the !hasOpened gate:
     * opening is BEHAVIOUR, and Hinge §6 refuses showing the host anything a guest did
     * short of deciding — "a nudge in 2 days" is only truthful if opening cannot silently
     * cancel it. Before this phase, an opened link killed the first leg outright.
     */
    async function makeSubject(name: string, phone: string, opened: boolean) {
      const person = await prisma.person.create({
        data: {
          name: `${TAG} ${name}`,
          email: `${TAG.toLowerCase()}-${name.toLowerCase().replace(/\s+/g, '-')}@example.test`,
          phoneNumber: phone,
        },
      });
      createdPersonIds.push(person.id);
      await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'SMS',
          sentAt,
        },
      });
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${person.id}`,
          scope: 'PARTICIPANT',
          eventId: event.id,
          personId: person.id,
          openedAt: opened ? new Date(sentAt.getTime() + HOUR) : null,
        },
      });
      return person;
    }

    const silent = await makeSubject('Silent', '+64211111111', false);
    const opener = await makeSubject('Opened But Silent', '+64212222222', true);

    // `now` is derived from the fixture's OWN send clock, so the boundaries are exact.
    const clock = (d: number, ms = 0) => new Date(sentAt.getTime() + d * DAY + ms);
    const sweep = async (at: Date) => {
      const r = await findNudgeCandidates(at);
      return {
        first: (id: string) => r.eligibleFirst.some((c) => c.personId === id),
        second: (id: string) => r.eligibleSecond.some((c) => c.personId === id),
      };
    };

    const d3 = await sweep(clock(4, -1000)); // day 3 + 23:59:59
    assert(
      'sweep day 3',
      'no first-leg candidate before day 4 (this is the retime)',
      !d3.first(silent.id)
    );
    assert('sweep day 3', 'and no second-leg candidate either', !d3.second(silent.id));

    const d4 = await sweep(clock(4));
    assert('sweep day 4', 'first leg IS due at exactly day 4', d4.first(silent.id));
    assert('sweep day 4', 'second leg is NOT yet due at day 4', !d4.second(silent.id));

    const d6 = await sweep(clock(7, -1000)); // day 6 + 23:59:59
    assert(
      'sweep day 6',
      'still first-leg only at day 6',
      d6.first(silent.id) && !d6.second(silent.id)
    );

    const d7 = await sweep(clock(7));
    assert('sweep day 7', 'second leg IS due at exactly day 7', d7.second(silent.id));

    // ── Ruling 5 — opening no longer cancels the cadence ────────────────
    assert(
      'ruling 5',
      'an OPENED-but-silent person is still a first-leg candidate at day 4',
      d4.first(opener.id)
    );
    assert('ruling 5', 'and still a second-leg candidate at day 7', d7.second(opener.id));
    assert(
      'ruling 5',
      'the opened person is treated identically to the silent one',
      d4.first(opener.id) === d4.first(silent.id) && d7.second(opener.id) === d7.second(silent.id)
    );

    // ── !hasResponded is KEPT (Ruling 5's other half) ───────────────────
    const responder = await makeSubject('Responded', '+64213333333', false);
    const team = await prisma.team.create({ data: { name: `${TAG} Team`, eventId: event.id } });
    const item = await prisma.item.create({
      data: { name: `${TAG} Item`, teamId: team.id, status: 'ASSIGNED' },
    });
    await prisma.assignment.create({
      data: { itemId: item.id, personId: responder.id, response: 'ACCEPTED' },
    });
    const d7b = await sweep(clock(7));
    assert(
      'ruling 5',
      'a person who RESPONDED is not a second-leg candidate — decisions stop the cadence',
      !d7b.second(responder.id)
    );
    assert(
      'ruling 5',
      'but responding does not retroactively suppress the first leg — it is time-only',
      d7b.first(responder.id)
    );

    // ══ LAYER 3 — criticality touches nothing ═══════════════════════════
    // §8.3: "criticality does exactly two things (the badge, and the assistant's message
    // at red) and touches nothing else. It is entirely a host-facing signal, never a
    // guest-facing pressure." Comments stripped so prose cannot satisfy this.
    for (const rel of [
      'src/lib/nudge-cadence.ts',
      'src/lib/sms/nudge-eligibility.ts',
      'src/lib/sms/nudge-sender.ts',
      'src/lib/sms/nudge-scheduler.ts',
    ]) {
      assert(
        'criticality',
        `${rel.split('/').pop()} contains no criticality term`,
        !/critical/i.test(code(rel))
      );
    }

    // The cadence module must stay client-safe: no prisma, no server-only imports, or the
    // host UI cannot render the same clock the sweep enforces (Hinge §6).
    assert(
      'criticality',
      'nudge-cadence.ts imports nothing — pure and client-safe',
      !/^\s*import\s/m.test(code('src/lib/nudge-cadence.ts'))
    );
  } finally {
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
  console.log("\x1b[32mGREEN — days 4 and 7, on the system's own schedule.\x1b[0m");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
