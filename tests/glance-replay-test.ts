/**
 * GTC-192 (J1, phase 6) — the rewind, the replay derivation, the stamp, and the island.
 *
 * Ruling 1 fences the arrival replay to state changes: "no opens, no views, no hesitations,
 * ever." Ruling 6 makes the reversal play last and settle once played. Ruling 21 (2026-09-09)
 * moves the rewind's source to `AuditEntry` so the table carrying `LINK_OPENED` is NOT TOUCHED
 * AT ALL rather than touched and guarded. Ruling 26 rules which transitions play: good news and
 * reds; GREEN → AMBER is not a reversal and does not play.
 *
 * FIVE LAYERS IN THE PLAN. 6a built 1, 2 and 4; 6b added 3; 6c extends 1 and 4.
 *   1. PURE      — `deriveReplay` and `scheduleReplay` over hand-built inputs. No server, no DB.
 *   2. DB        — `rewindGlanceInputs` against a seeded event with REAL `AuditEntry` rows.
 *   3. HTTP      — the stamp route, and the page's own stamping rule.
 *   4. STRUCTURAL + FENCE — the denylist, the allowlist, the no-timestamp rule, the rewind's
 *                  confinement, the one door, no websocket package, and 6c's island.
 *   5. the four mutations — run and reported as part of 6a, not encoded here.
 *
 * ⚠ WHAT THIS FILE CANNOT PROVE, SAID PLAINLY BECAUSE THE TICKET HAS CAUGHT THE CONFUSION
 * BEFORE. There is no jsdom, no Playwright and no time axis here. The SCHEDULE is proved — a
 * pure function from steps to beats, every beat inside the 3000ms budget. The ≤3s budget AS
 * EXPERIENCED, the pixels, and "the summary is legible throughout" are NOT proved by any green
 * below; they are browser-walk claims and are earned in the walk, in the ticket.
 *
 * ⚠ LAYER 2 SEEDS ITS OWN TAGGED `AuditEntry` ROWS, AND THAT IS A STATED REQUIREMENT RATHER
 * THAN A PRACTICE. No real event in `gather_dev` has a single `AuditEntry` row, so a rewind
 * that read nothing at all would pass identically to a correct empty diff — the vacuous green
 * this ticket has caught in every phase. It also must NOT borrow `test:security`'s fixture
 * rows: another suite owns those and deletes them at the start of its own run.
 *
 * ⚠ THE NO-OP FIXTURE DRIVES THE REAL ACK ROUTE, in process (it is token-authed, not
 * session-authed, so it needs no server). Accept → decline → accept: three genuine rows on one
 * `targetId`, netting to nothing. Not a hand-built step whose ends happen to match.
 *
 * NO SMS IS SENT and nothing is written outside this file's own fixture rows.
 *
 * Run: npx tsx tests/glance-replay-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { BEHAVIOUR_DENYLIST, REWIND_DENYLIST, collectKeys, code, raw } from './glance-fence';

const prisma = new PrismaClient();

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

/**
 * Evaluate an assertion that may throw before the module under test exists. A missing export
 * must READ as a failed assertion, not as a crashed run.
 */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

/** Every scalar appearing anywhere in a payload, at any depth. The no-timestamp rule's eyes. */
function collectScalars(value: unknown, into: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const v of value) collectScalars(v, into);
  } else if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectScalars(v, into);
  } else {
    into.push(value);
  }
  return into;
}

const ISO_LIKE = /\d{4}-\d{2}-\d{2}T/;
const EPOCH_FLOOR = 1e12;

/** The 18 members of `InviteEventType`. The rewind may name none of them. */
const INVITE_EVENT_TYPES = [
  'INVITE_SEND_CONFIRMED',
  'LINK_OPENED',
  'NAME_CLAIMED',
  'RESPONSE_SUBMITTED',
  'NUDGE_SENT_AUTO',
  'NUDGE_DEFERRED_QUIET',
  'PROXY_NUDGE_SENT',
  'PROXY_NUDGE_DEFERRED_QUIET',
  'HOUSEHOLD_ESCALATED',
  'SMS_OPT_OUT_RECEIVED',
  'SMS_BLOCKED_OPT_OUT',
  'SMS_BLOCKED_INVALID',
  'SMS_SEND_FAILED',
  'MANUAL_OVERRIDE_MARKED',
  'CLAIM_RESET',
  'NUDGE_SENT_HOST',
  'WRAPUP_MESSAGE_SENT',
  'WRAPUP_MESSAGE_FAILED',
];

/** Columns the rewind's select must NOT reach for: free text and arbitrary JSON. */
const FORBIDDEN_SELECT = ['details', 'before', 'after', 'metadata', 'actorId', 'actorName'];

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  let RW: any = null;
  let RP: any = null;
  let RE: any = null;
  let ACK: any = null;
  let loadError: string | null = null;
  try {
    RW = await import('../src/lib/glance/rewind');
    RP = await import('../src/lib/glance/replay');
    RE = await import('../src/lib/glance/replay-entry');
  } catch (err) {
    loadError = String((err as Error).message).split('\n')[0];
    console.error(`\x1b[31m!\x1b[0m module load failed: ${loadError}`);
  }
  try {
    ACK = await import('../src/app/api/p/[token]/ack/[assignmentId]/route');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m ack route load failed: ${String((err as Error).message)}`);
  }
  // Loaded on its own, and NOT part of the `built` gate: `read.ts` is phase 1's and always
  // exists. Ruling 28's headline assertion drives the whole door — read, rewind, derive — over
  // a real board, because that is the only place the bug was visible.
  let RD: any = null;
  try {
    RD = await import('../src/lib/glance/read');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m read module load failed: ${String((err as Error).message)}`);
  }

  /**
   * THE GATE THAT MAKES THE RED MEAN SOMETHING. Every assertion whose subject is one of the
   * three new modules is anded with this, so "the module does not exist" can never read as
   * "the module behaves correctly".
   */
  const built = RW !== null && RP !== null && RE !== null;

  try {
    // ══ LAYER 1 — THE PURE DERIVATION ════════════════════════════════════
    //
    // Hand-built glance and rewind. No database, no clock: `since` and `now` are literals so
    // the AMBER/GREEN boundary is hit exactly rather than approximately.
    const SINCE = new Date('2026-09-01T09:00:00.000Z');
    const NOW = new Date('2026-09-01T18:00:00.000Z');

    const event = {
      status: 'CONFIRMING' as const,
      sentAt: new Date(SINCE.getTime() - 10 * DAY),
      endDate: new Date(NOW.getTime() + 130 * HOUR),
      decideByOffsetHours: null,
      nudgePace: null,
    };

    const gItem = (over: Record<string, unknown> = {}): any => ({
      itemId: 'i1',
      assignmentId: 'a1',
      name: 'The trifle',
      critical: false,
      kind: 'ITEM',
      teamId: 't1',
      state: 'GREEN',
      reason: 'ACCEPTED',
      decideByAt: null,
      ...over,
    });

    const gPerson = (over: Record<string, unknown> = {}): any => ({
      personEventId: 'pe1',
      personId: 'p1',
      name: 'Amelia Turner',
      isHost: false,
      householdRole: 'ADULT',
      role: 'PARTICIPANT',
      teamId: 't1',
      nudgeMark: null,
      state: 'GREEN',
      reasons: ['ACCEPTED'],
      nextNudgeAt: null,
      items: [gItem()],
      ...over,
    });

    const glanceOf = (members: any[]): any => ({
      eventId: 'e1',
      hostPersonId: 'host-person',
      asOf: NOW.toISOString(),
      summary: { needYou: 0, withGather: 0, settled: 0 },
      households: [
        {
          householdId: 'h1',
          primaryContactName: 'Amelia Turner',
          isHostHousehold: false,
          members,
        },
      ],
      unhoused: [],
      unassignedCritical: [],
      unassignedOrdinaryCount: 0,
    });

    const rewindOf = (over: Record<string, unknown> = {}): any => ({
      responseAt: new Map<string, string>(),
      absentAt: new Set<string>(),
      changedSince: new Map<string, number>(),
      clockAt: new Map<string, { dropOffAt: Date | null; decideByOffsetHours: number | null }>(),
      attendanceAt: new Map<string, string | null>([['pe1', null]]),
      ambiguous: new Set<string>(),
      ...over,
    });

    const replayOf = (glance: any, past: any) => RP.deriveReplay(glance, past, event, SINCE, NOW);

    // ── The null branch: play nothing, and do not touch the database to decide it ──
    //
    // Phase 5's inherited note 1: NULL IS NOT EPOCH. `since (glanceSeenAt ?? epoch)` would
    // replay the entire history of the event on a host's first ever visit. The db handle
    // passed here throws on ANY property access, so a rewind reached before the null check
    // fails loudly rather than returning an empty diff for the wrong reason.
    const explodingDb: any = new Proxy(
      {},
      {
        get() {
          throw new Error('the rewind was reached on the null branch');
        },
      }
    );
    let nullBranch: any = null;
    let nullBranchThrew = false;
    try {
      nullBranch = built
        ? await RE.readGlanceReplay(explodingDb, 'e1', null, glanceOf([gPerson()]), event, NOW)
        : null;
    } catch {
      nullBranchThrew = true;
    }
    assert(
      'layer 1 / null',
      'glanceSeenAt === null plays NOTHING — an empty replay, not the whole history',
      built &&
        !nullBranchThrew &&
        ok(() => Array.isArray(nullBranch.steps) && nullBranch.steps.length === 0)
    );
    assert(
      'layer 1 / null',
      'and it decides that WITHOUT reaching the database — the null branch is the first statement',
      built && !nullBranchThrew
    );

    // ── Nothing changed → nothing plays. A SEPARATE rule from the null branch. ──
    const unchanged = built
      ? replayOf(glanceOf([gPerson()]), rewindOf({ responseAt: new Map([['a1', 'ACCEPTED']]) }))
      : null;
    assert(
      'layer 1 / empty',
      'nothing changed → nothing plays: same response at `since` and now yields no steps',
      built && ok(() => unchanged.steps.length === 0)
    );

    // ── THE NO-OP STEP RULE. A positive ledger row inside the window, netting to nothing. ──
    //
    // The founder's addition to the diff: "the ledger row proves something happened; the states
    // prove it netted to nothing; nothing is what she sees." Asserted here in the pure layer
    // with the ordering key PRESENT, so it cannot pass merely because the window looked empty.
    const netZero = built
      ? replayOf(
          glanceOf([gPerson()]),
          rewindOf({
            responseAt: new Map([['a1', 'ACCEPTED']]),
            changedSince: new Map([['a1', SINCE.getTime() + 2 * HOUR]]),
          })
        )
      : null;
    assert(
      'layer 1 / no-op',
      'a step from a state to ITSELF is dropped, even with a positive ledger row in the window',
      built && ok(() => netZero.steps.length === 0)
    );

    // ── The spark: AMBER → GREEN, and ONLY that ──
    const pendingToAccepted = built
      ? replayOf(glanceOf([gPerson()]), rewindOf({ responseAt: new Map([['a1', 'PENDING']]) }))
      : null;
    assert(
      'layer 1 / spark',
      'AMBER → GREEN is a step, and it SPARKS',
      built &&
        ok(
          () =>
            pendingToAccepted.steps.length === 1 &&
            pendingToAccepted.steps[0].from === 'AMBER' &&
            pendingToAccepted.steps[0].to === 'GREEN' &&
            pendingToAccepted.steps[0].spark === true
        )
    );

    const declinedToAccepted = built
      ? replayOf(glanceOf([gPerson()]), rewindOf({ responseAt: new Map([['a1', 'DECLINED']]) }))
      : null;
    assert(
      'layer 1 / spark',
      'RED → GREEN plays as good news but does NOT spark — the spark is AMBER → GREEN alone',
      built &&
        ok(
          () =>
            declinedToAccepted.steps.length === 1 &&
            declinedToAccepted.steps[0].from === 'RED' &&
            declinedToAccepted.steps[0].to === 'GREEN' &&
            declinedToAccepted.steps[0].spark === false
        )
    );

    // ── RULING 26's BOUNDARY, stated so nobody implements it wrong ──
    //
    // "GREEN -> AMBER is NOT Ruling 6's reversal. A reversal is in-then-out. Someone going from
    // settled back to unsettled is a different fact and under this ruling it does not play."
    const greenToAmber = built
      ? replayOf(
          glanceOf([
            gPerson({
              state: 'AMBER',
              reasons: ['AWAITING_REPLY'],
              items: [gItem({ state: 'AMBER', reason: 'AWAITING_REPLY' })],
            }),
          ]),
          rewindOf({ responseAt: new Map([['a1', 'ACCEPTED']]) })
        )
      : null;
    assert(
      'layer 1 / Ruling 26',
      'GREEN → AMBER does NOT play — it is not a reversal, and the board simply arrives',
      built && ok(() => greenToAmber.steps.length === 0)
    );

    // ── Reds play ──
    const greenToRed = built
      ? replayOf(
          glanceOf([
            gPerson({
              state: 'RED',
              reasons: ['REVERSAL'],
              items: [gItem({ state: 'RED', reason: 'REVERSAL' })],
            }),
          ]),
          rewindOf({ responseAt: new Map([['a1', 'ACCEPTED']]) })
        )
      : null;
    assert(
      'layer 1 / Ruling 26',
      'a red plays — and does not spark',
      built &&
        ok(
          () =>
            greenToRed.steps.length === 1 &&
            greenToRed.steps[0].to === 'RED' &&
            greenToRed.steps[0].spark === false
        )
    );

    // ── The host's own override is not news to her (Ruling 22) ──
    const toNotChased = built
      ? replayOf(
          glanceOf([
            gPerson({
              state: 'NOT_CHASED',
              reasons: ['DONT_CHASE'],
              nudgeMark: 'DONT_CHASE',
              items: [gItem({ state: 'RED', reason: 'REVERSAL' })],
            }),
          ]),
          // ACCEPTED at `since`, so the past state is a real GREEN (Ruling 14 greys only a
          // person whose worst row is NOT green). The step therefore genuinely transitions
          // GREEN → NOT_CHASED and is dropped by RULING 26's filter, not by the no-op rule.
          rewindOf({ responseAt: new Map([['a1', 'ACCEPTED']]) })
        )
      : null;
    assert(
      'layer 1 / Ruling 22',
      'a strip going NOT_CHASED does not play — the host’s own override is not news to her',
      built && ok(() => toNotChased.steps.length === 0)
    );

    // ── RULING 6: the reversal plays LAST, quietly, no sparks ──
    const mixed = built
      ? replayOf(
          glanceOf([
            gPerson({
              personEventId: 'pe-reversal',
              personId: 'p-ray',
              name: 'Ray Dalton',
              state: 'OUT',
              reasons: ['ATTENDANCE_NO'],
              items: [gItem({ assignmentId: 'a-ray', state: 'GREEN', reason: 'ACCEPTED' })],
            }),
            gPerson({
              personEventId: 'pe-good',
              personId: 'p-amelia',
              items: [gItem({ assignmentId: 'a-good' })],
            }),
          ]),
          rewindOf({
            responseAt: new Map([
              ['a-ray', 'ACCEPTED'],
              ['a-good', 'PENDING'],
            ]),
            attendanceAt: new Map<string, string | null>([
              ['pe-reversal', null],
              ['pe-good', null],
            ]),
          })
        )
      : null;
    assert(
      'layer 1 / Ruling 6',
      'the reversal plays LAST — the replay ends on the truth',
      built &&
        ok(
          () =>
            mixed.steps.length === 2 &&
            mixed.steps[0].personEventId === 'pe-good' &&
            mixed.steps[1].personEventId === 'pe-reversal' &&
            mixed.steps[1].to === 'OUT'
        )
    );
    assert(
      'layer 1 / Ruling 6',
      'and it plays with NO SPARK — "quietly, no sparks"',
      built && ok(() => mixed.steps[1].spark === false)
    );

    // ── The ambiguous exclusion is honoured by the derivation, fail-safe silent ──
    const ambiguousSkipped = built
      ? replayOf(
          glanceOf([gPerson()]),
          rewindOf({
            responseAt: new Map([['a1', 'PENDING']]),
            ambiguous: new Set(['pe1']),
          })
        )
      : null;
    assert(
      'layer 1 / ambiguous',
      'a person the rewind could not resolve is EXCLUDED — fail-safe silent, never guessed',
      built && ok(() => ambiguousSkipped.steps.length === 0)
    );

    // ── A row born after `since` was not theirs to hold then ──
    const bornAfter = built
      ? replayOf(
          glanceOf([gPerson()]),
          rewindOf({
            responseAt: new Map([['a1', 'ACCEPTED']]),
            absentAt: new Set(['a1']),
          })
        )
      : null;
    assert(
      'layer 1 / absent',
      'an assignment born AFTER `since` is excluded from the past state — she held nothing then',
      built &&
        ok(
          () =>
            bornAfter.steps.length === 1 &&
            bornAfter.steps[0].from === 'AMBER' &&
            bornAfter.steps[0].to === 'GREEN' &&
            bornAfter.steps[0].spark === true
        )
    );

    // ── RULING 27 — THE WAS-A-MAYBE ROW IS RECOVERED, NOT DROPPED ────────
    //
    // A row that was a maybe at `since` and is not one now carries no decide-by instant on the
    // WIRE (`GlanceItem.decideByAt` is display data, non-null only for a current maybe). 6a
    // first dropped the whole PERSON in that case, which would have silenced every other piece
    // of good news they had — disproportionate, and not what "one narrow spark" described.
    //
    // Ruling 27 recovers it: the rewind carries the row's CLOCK INPUTS, which are PLAN data
    // (`Item.dropOffAt`, `Item.decideByOffsetHours`), so the shared predicate can be asked the
    // real question as at `since`. Nothing is guessed and nothing is dropped.
    const wasLiveMaybe = built
      ? replayOf(
          glanceOf([gPerson()]),
          rewindOf({
            responseAt: new Map([['a1', 'MAYBE']]),
            // decideBy = dropOffAt − 0h = `since` + 10h. Still hers at `since`: AMBER.
            clockAt: new Map([
              ['a1', { dropOffAt: new Date(SINCE.getTime() + 10 * HOUR), decideByOffsetHours: 0 }],
            ]),
          })
        )
      : null;
    assert(
      'layer 1 / Ruling 27',
      'a LIVE maybe at `since` that is now accepted plays AMBER → GREEN, and sparks',
      built &&
        ok(
          () =>
            wasLiveMaybe.steps.length === 1 &&
            wasLiveMaybe.steps[0].from === 'AMBER' &&
            wasLiveMaybe.steps[0].to === 'GREEN' &&
            wasLiveMaybe.steps[0].spark === true
        )
    );

    const wasExpiredMaybe = built
      ? replayOf(
          glanceOf([gPerson()]),
          rewindOf({
            responseAt: new Map([['a1', 'MAYBE']]),
            // decideBy = `since` − 10h. The clock had already run out: RED.
            clockAt: new Map([
              ['a1', { dropOffAt: new Date(SINCE.getTime() - 10 * HOUR), decideByOffsetHours: 0 }],
            ]),
          })
        )
      : null;
    assert(
      'layer 1 / Ruling 27',
      'an EXPIRED maybe at `since` that is now accepted plays RED → GREEN — good news, no spark',
      built &&
        ok(
          () =>
            wasExpiredMaybe.steps.length === 1 &&
            wasExpiredMaybe.steps[0].from === 'RED' &&
            wasExpiredMaybe.steps[0].to === 'GREEN' &&
            wasExpiredMaybe.steps[0].spark === false
        )
    );
    assert(
      'layer 1 / Ruling 27',
      'and the two differ ONLY by the clock — the same responses, opposite past states',
      built && ok(() => wasLiveMaybe.steps[0].from !== wasExpiredMaybe.steps[0].from)
    );

    // The regression the ruling exists to prevent: a was-a-maybe row must not silence the rest
    // of that person. Two rows, one of them the recovered case; the person still plays.
    const twoRows = built
      ? replayOf(
          glanceOf([
            gPerson({
              items: [gItem(), gItem({ itemId: 'i2', assignmentId: 'a2', name: 'The pavlova' })],
            }),
          ]),
          rewindOf({
            responseAt: new Map([
              ['a1', 'MAYBE'],
              ['a2', 'PENDING'],
            ]),
            clockAt: new Map([
              ['a1', { dropOffAt: new Date(SINCE.getTime() + 10 * HOUR), decideByOffsetHours: 0 }],
            ]),
          })
        )
      : null;
    assert(
      'layer 1 / Ruling 27',
      'a person holding a was-a-maybe row STILL PLAYS — one row no longer silences the whole person',
      built && ok(() => twoRows.steps.length === 1 && twoRows.steps[0].to === 'GREEN')
    );

    // ⚠ THE CONSTRAINT ON RULING 27. The decide-by instant is PLAN data, not guest behaviour —
    // but it is still a TIME, and layer 3's rule is that no time of any kind crosses the wire.
    // Asserted on a replay that actually USED the clock, so it cannot pass by the clock being
    // absent from the fixture.
    assert(
      'layer 1 / Ruling 27',
      'the decide-by instant does NOT reach the payload — no ISO string, on a replay that used the clock',
      built &&
        ok(() => {
          const scalars = collectScalars(wasLiveMaybe);
          return (
            wasLiveMaybe.steps.length > 0 &&
            !scalars.some((v) => typeof v === 'string' && ISO_LIKE.test(v))
          );
        })
    );
    assert(
      'layer 1 / Ruling 27',
      'and no epoch-shaped number either — the clock is consumed server-side and discarded',
      built &&
        ok(() => {
          const scalars = collectScalars(wasLiveMaybe);
          return (
            wasLiveMaybe.steps.length > 0 &&
            !scalars.some((v) => typeof v === 'number' && Math.abs(v) > EPOCH_FLOOR)
          );
        })
    );
    assert(
      'layer 1 / Ruling 27',
      'the step’s keys are still EXACTLY the four — the clock added no field to the wire',
      built &&
        ok(
          () =>
            JSON.stringify(Object.keys(wasLiveMaybe.steps[0]).sort()) ===
            JSON.stringify(['from', 'personEventId', 'spark', 'to'])
        )
    );

    // ── THE SCHEDULE (6c) — AND WHAT THESE ASSERTIONS DO NOT PROVE ───────
    //
    // ⚠ SAID PLAINLY, BECAUSE THE TWO CLAIMS ARE DIFFERENT AND THIS TICKET HAS CAUGHT THE
    // CONFUSION BEFORE. The estate is `tsx` scripts and `renderToStaticMarkup`: no jsdom, no
    // Playwright, no time axis. What is proved below is THE SCHEDULE — a pure function
    // turning steps into beats. It is NOT the ≤3s budget as experienced, NOT the pixels, and
    // NOT "the summary is legible throughout". A green schedule assertion is not a proven
    // budget; the browser walk is where that claim is earned.
    //
    // ⚠ THE SHAPE CHANGED IN 6c, AND THE BUDGET IS WHY. 6a's `scheduleReplay` returned start
    // times alone and asserted that the LAST START lands inside 3000ms — which says nothing
    // about when the last burst FINISHES. With the reference's 0.9–1.3s flight, 64 steps
    // started at ~2953ms and ended at ~4.25s, over budget with every assertion green. A beat
    // carries its own duration so the budget can be asserted on `delayMs + durationMs`, which
    // is the thing Ruling 1 actually fences.
    assert(
      'layer 1 / schedule',
      'the replay budget is 3000ms, named rather than scattered',
      built && ok(() => RP.REPLAY_BUDGET_MS === 3000)
    );
    assert(
      'layer 1 / schedule',
      'the two envelopes are named — a spark is the reference’s 0.9–1.3s burst, a quiet step its 0.7s colour transition',
      built && ok(() => RP.SPARK_DURATION_MS === 1300 && RP.QUIET_DURATION_MS === 700)
    );
    const beatSteps = (n: number, spark = true) =>
      Array.from({ length: n }, (_, i) => ({
        personEventId: `pe${i}`,
        from: spark ? 'AMBER' : 'GREEN',
        to: spark ? 'GREEN' : 'RED',
        spark,
      }));
    for (const n of [1, 2, 5, 12, 64]) {
      assert(
        'layer 1 / schedule',
        `${n} spark(s): every beat is {delayMs, durationMs} and NOTHING RUNS PAST 3000ms — delay PLUS duration`,
        built &&
          ok(() => {
            const beats = RP.scheduleReplay(beatSteps(n));
            return (
              beats.length === n &&
              beats.every(
                (b: any) =>
                  JSON.stringify(Object.keys(b).sort()) ===
                    JSON.stringify(['delayMs', 'durationMs']) &&
                  Number.isFinite(b.delayMs) &&
                  b.delayMs >= 0 &&
                  b.durationMs > 0 &&
                  b.delayMs + b.durationMs <= RP.REPLAY_BUDGET_MS
              )
            );
          })
      );
      if (n > 1) {
        assert(
          'layer 1 / schedule',
          `${n} sparks: the beats are STAGGERED — strictly increasing, so bursts read as a sequence rather than one flash`,
          built &&
            ok(() => {
              const beats = RP.scheduleReplay(beatSteps(n));
              return beats.every(
                (b: any, i: number) => i === 0 || b.delayMs > beats[i - 1].delayMs
              );
            })
        );
      }
    }
    assert(
      'layer 1 / schedule',
      'a quiet step gets the quiet envelope and a spark the burst — Ruling 6’s "quietly, no sparks" has a DURATION, not only a look',
      built &&
        ok(() => {
          const mix = RP.scheduleReplay([
            { personEventId: 'a', from: 'AMBER', to: 'GREEN', spark: true },
            { personEventId: 'b', from: 'GREEN', to: 'OUT', spark: false },
          ]);
          return (
            mix[0].durationMs === RP.SPARK_DURATION_MS && mix[1].durationMs === RP.QUIET_DURATION_MS
          );
        })
    );
    // Reversal-last is `deriveReplay`'s ordering (asserted above); this asserts the SCHEDULE
    // agrees, over the derivation's OWN output rather than a hand-ordered array, so the two
    // cannot drift into disagreeing about which beat ends the replay.
    assert(
      'layer 1 / schedule',
      'the LAST beat is the REVERSAL’s and it is the quiet one — the replay ends on the truth (Ruling 6)',
      built &&
        ok(() => {
          const beats = RP.scheduleReplay(mixed.steps);
          return (
            mixed.steps.length === 2 &&
            mixed.steps[1].to === 'OUT' &&
            beats.length === 2 &&
            beats[1].delayMs > beats[0].delayMs &&
            beats[1].durationMs === RP.QUIET_DURATION_MS &&
            beats[1].delayMs + beats[1].durationMs <= RP.REPLAY_BUDGET_MS
          );
        })
    );
    assert(
      'layer 1 / schedule',
      'an empty replay schedules nothing — no fake fireworks when nothing changed',
      built && ok(() => RP.scheduleReplay([]).length === 0)
    );

    // ══ LAYER 2 — THE REWIND, AGAINST REAL LEDGER ROWS ═══════════════════
    const stamp = Date.now();
    const TAG = `GTC192P6A-${stamp}`;

    const user = await prisma.user.create({
      data: { email: `gtc192-p6a+${stamp}@example.com` },
    });
    createdUserIds.push(user.id);

    const hostPerson = await prisma.person.create({
      data: { name: `${TAG} Kate`, email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const dbEvent = await prisma.event.create({
      data: {
        name: `${TAG} replay fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(Date.now() - 10 * DAY),
      },
    });
    createdEventIds.push(dbEvent.id);

    const team = await prisma.team.create({ data: { eventId: dbEvent.id, name: `${TAG} Mains` } });

    async function guest(name: string, attendanceAnswer: any = null) {
      const p = await prisma.person.create({
        data: { name: `${TAG} ${name}`, email: `gtc192-p6a+${stamp}+${name}@example.com` },
      });
      createdPersonIds.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: dbEvent.id,
          role: 'PARTICIPANT',
          attendanceAnswer,
          sentAt: new Date(Date.now() - 10 * DAY),
        },
      });
      return { person: p, personEvent: pe };
    }

    async function give(personId: string, name: string, response: any, createdAt?: Date) {
      const item = await prisma.item.create({
        data: { teamId: team.id, name: `${TAG} ${name}`, kind: 'ITEM' },
      });
      const a = await prisma.assignment.create({
        data: {
          itemId: item.id,
          personId,
          response,
          ...(createdAt ? { createdAt } : {}),
        },
      });
      return a;
    }

    /** A ledger row exactly as the ack route writes one, at an instant this test chooses. */
    async function ledger(actionType: string, targetId: string, at: Date, actorId: string) {
      await prisma.auditEntry.create({
        data: {
          eventId: dbEvent.id,
          actorId,
          actionType,
          targetType: 'Assignment',
          targetId,
          details: '',
          timestamp: at,
        },
      });
    }

    const T0 = new Date(Date.now() - 6 * HOUR);
    const SINCE_DB = new Date(Date.now() - 3 * HOUR);

    // (a) latest-at-or-before: MAYBE at −5h, ACCEPTED at −4h, DECLINED at −1h (after `since`)
    const gLatest = await guest('Latest');
    const aLatest = await give(gLatest.person.id, 'trifle', 'DECLINED', T0);
    await ledger(
      'MAYBE_ASSIGNMENT',
      aLatest.id,
      new Date(Date.now() - 5 * HOUR),
      gLatest.person.id
    );
    await ledger(
      'ACCEPT_ASSIGNMENT',
      aLatest.id,
      new Date(Date.now() - 4 * HOUR),
      gLatest.person.id
    );
    await ledger(
      'DECLINE_ASSIGNMENT',
      aLatest.id,
      new Date(Date.now() - 1 * HOUR),
      gLatest.person.id
    );

    // (b) no ledger rows at all, and the row is PENDING now
    const gSilent = await guest('Silent');
    const aSilent = await give(gSilent.person.id, 'napkins', 'PENDING', T0);

    // (e) RULING 28 — THE UNLOGGED RESPONSE. No ledger row at all, and ACCEPTED now.
    //
    // This is the row the old rule got wrong, and (b) could never catch it: (b)'s current
    // response IS `PENDING`, so "default to PENDING" and "carry the current value" agree there
    // and the assertion passed either way. Here they disagree, and the difference is the bug —
    // defaulting to PENDING asserts a change from AMBER to GREEN that nothing recorded.
    const gUnlogged = await guest('Unlogged');
    const aUnlogged = await give(gUnlogged.person.id, 'the pudding', 'ACCEPTED', T0);

    // (f) RULING 28's OTHER HALF — THE CANONICAL SPARK, which the rule must NOT silence.
    //
    // A row created before `since` whose ONLY ledger entry falls INSIDE the window: she was
    // pending when Kate last looked and accepted while Kate was away. This is the case the
    // whole feature exists for, and a rule that silenced it would be worse than the bug it
    // fixes. The dated first change is what makes PENDING positive evidence here rather than an
    // assumption: the ledger is demonstrably live for this row.
    const gFirst = await guest('FirstInWindow');
    const aFirstInWindow = await give(gFirst.person.id, 'the gravy', 'ACCEPTED', T0);
    await ledger(
      'ACCEPT_ASSIGNMENT',
      aFirstInWindow.id,
      new Date(Date.now() - 2 * HOUR),
      gFirst.person.id
    );

    // (c) ABSENT: an assignment born after `since`
    const gNew = await guest('NewRow');
    const aNew = await give(gNew.person.id, 'pavlova', 'ACCEPTED', new Date(Date.now() - 1 * HOUR));

    // (d) ambiguous: an ANSWER_ATTENDANCE row inside the window, whose answer lives only in
    //     `details` / `before` / `after` — all three fence-excluded from the select.
    const gAttend = await guest('Attend', 'YES');
    await prisma.auditEntry.create({
      data: {
        eventId: dbEvent.id,
        actorId: gAttend.person.id,
        actionType: 'ANSWER_ATTENDANCE',
        targetType: 'PersonEvent',
        targetId: gAttend.personEvent.id,
        details: 'Answered still coming',
        timestamp: new Date(Date.now() - 2 * HOUR),
      },
    });

    const rewound = built ? await RW.rewindGlanceInputs(prisma, dbEvent.id, SINCE_DB) : null;

    assert(
      'layer 2 / latest',
      'the response at `since` is the LATEST ledger row AT OR BEFORE it — not the first, not the last',
      built && ok(() => rewound.responseAt.get(aLatest.id) === 'ACCEPTED')
    );
    // ⚠ THE "PENDING DEFAULT" ASSERTION IS RETIRED HERE, IN 6a-fix, WITH ITS SUCCESSOR NAMED AT
    // THE SITE — the treatment phase 3 gave phase 2's alert-strip guard and 6b and 6c gave
    // theirs. It is retired because it ENCODED THE BUG, which is a different reason from every
    // other retirement in this ticket and is worth saying plainly:
    //
    //   was:  an assignment with no ledger rows reads PENDING — "the schema default,
    //         positively defaulted"
    //   now:  an assignment with no ledger rows reads its CURRENT response — nothing is
    //         recorded as having changed, so nothing changed (RULING 28)
    //
    // "Positively defaulted" was the wrong word for it. The old rule inferred a past value from
    // the ABSENCE of a row, which is the one thing §5 forbids — "no change is ever inferred from
    // a difference alone" — and it is what let the replay manufacture good news and repeat it on
    // every visit for ever. Ruling 28 makes responses follow the rule attendance already
    // followed. Nothing about this retirement is a narrowing; the old assertion was wrong.
    assert(
      'layer 2 / Ruling 28',
      'an assignment with no ledger rows reads its CURRENT response — nothing recorded, nothing changed',
      built && ok(() => rewound.responseAt.get(aUnlogged.id) === 'ACCEPTED')
    );
    assert(
      'layer 2 / Ruling 28',
      'and the same rule leaves a genuinely-pending row PENDING — the fix is one rule, not a special case',
      built && ok(() => rewound.responseAt.get(aSilent.id) === 'PENDING')
    );
    assert(
      'layer 2 / Ruling 28',
      'a row whose FIRST ledger entry falls inside the window reads PENDING — a dated first change proves it had never changed at `since`',
      built && ok(() => rewound.responseAt.get(aFirstInWindow.id) === 'PENDING')
    );
    assert(
      'layer 2 / absent',
      'an assignment created AFTER `since` is ABSENT, not PENDING — she held no such row then',
      built && ok(() => rewound.absentAt.has(aNew.id))
    );
    assert(
      'layer 2 / absent',
      'and an assignment created BEFORE `since` is NOT absent — the boundary is not "everything"',
      built && ok(() => !rewound.absentAt.has(aLatest.id) && !rewound.absentAt.has(aSilent.id))
    );
    assert(
      'layer 2 / ordering',
      'the ordering key is present for a row that moved inside the window, and absent for one that did not',
      built &&
        ok(
          () =>
            typeof rewound.changedSince.get(aLatest.id) === 'number' &&
            !rewound.changedSince.has(aSilent.id)
        )
    );
    assert(
      'layer 2 / positive evidence',
      'attendance with NO ledger row in the window is carried forward unchanged — positive evidence only',
      built && ok(() => rewound.attendanceAt.has(gLatest.personEvent.id))
    );
    assert(
      'layer 2 / ambiguous',
      'an ANSWER_ATTENDANCE row inside the window makes that person AMBIGUOUS — the answer is in `details`, which the fence excludes',
      built && ok(() => rewound.ambiguous.has(gAttend.personEvent.id))
    );
    assert(
      'layer 2 / ambiguous',
      'and an untouched person is NOT ambiguous — the exclusion is evidence-driven, not blanket',
      built && ok(() => !rewound.ambiguous.has(gLatest.personEvent.id))
    );

    assert(
      'layer 2 / Ruling 27',
      'the rewind carries each row’s CLOCK INPUTS — plan data, so a past maybe can be resolved',
      built &&
        ok(
          () =>
            rewound.clockAt.has(aLatest.id) &&
            rewound.clockAt.has(aSilent.id) &&
            'dropOffAt' in rewound.clockAt.get(aLatest.id) &&
            'decideByOffsetHours' in rewound.clockAt.get(aLatest.id)
        )
    );
    assert(
      'layer 2 / Ruling 27',
      'and it is the ITEM’s own clock, not a copy of the event’s — a null override reads null, not 120',
      built && ok(() => rewound.clockAt.get(aLatest.id).decideByOffsetHours === null)
    );

    // ── RULING 28's HEADLINE: NOTHING CHANGED → NOTHING PLAYS, ON A REAL BOARD ──
    //
    // ⚠ THIS IS THE ASSERTION NEITHER EXISTING LAYER COULD SEE, and it is the one the browser
    // walk produced. Layer 1 hand-builds `responseAt`, so it can never exercise the default.
    // Layer 2 above seeds its ledger rows deliberately, so every row it looks at HAS evidence.
    // The bug lived in the gap: a board whose responses were never logged.
    //
    // Measured on the walk before the fix: `since = now − 1 second` on the seeded glance board
    // yielded SEVEN steps, and did so on every visit, for ever. Nothing changed in that second.
    //
    // Driven through the WHOLE DOOR — read, rewind, derive — because that is where it showed.
    const dbEventFull = {
      status: dbEvent.status,
      sentAt: dbEvent.sentAt,
      endDate: dbEvent.endDate,
      decideByOffsetHours: dbEvent.decideByOffsetHours,
      nudgePace: dbEvent.nudgePace,
    };
    const nowDb = new Date();
    const glanceDb = RD ? await RD.readEventGlance(prisma, dbEvent.id, nowDb) : null;
    const replayOneSecond =
      built && glanceDb
        ? await RE.readGlanceReplay(
            prisma,
            dbEvent.id,
            new Date(nowDb.getTime() - 1000),
            glanceDb,
            dbEventFull,
            nowDb
          )
        : null;
    const replayThreeHours =
      built && glanceDb
        ? await RE.readGlanceReplay(prisma, dbEvent.id, SINCE_DB, glanceDb, dbEventFull, nowDb)
        : null;

    // THE POSITIVE CONTROL FIRST, so "zero" can never read as "the door returned nothing".
    assert(
      'layer 2 / Ruling 28',
      'the board REPLAYS at all — a `since` that straddles a real logged change yields steps (the control the zero below hangs on)',
      built && glanceDb !== null && ok(() => replayThreeHours.steps.length > 0)
    );
    assert(
      'layer 2 / Ruling 28',
      'NOTHING CHANGED → NOTHING PLAYS: `since` = now − 1 second on unlogged responses yields ZERO steps',
      built &&
        glanceDb !== null &&
        ok(() => replayThreeHours.steps.length > 0 && replayOneSecond.steps.length === 0)
    );
    // The canonical spark is the thing a positive-evidence rule could most easily kill, so it is
    // asserted as its own case rather than left to the control above.
    assert(
      'layer 2 / Ruling 28',
      'and the CANONICAL SPARK still plays — pending when she looked, accepted while she was away, AMBER → GREEN with a spark',
      built &&
        glanceDb !== null &&
        ok(() => {
          const step = replayThreeHours.steps.find(
            (s: any) => s.personEventId === gFirst.personEvent.id
          );
          return !!step && step.from === 'AMBER' && step.to === 'GREEN' && step.spark === true;
        })
    );

    // ── §5 layer 4: the rewind's RETURN carries no behaviour, at any depth ──
    assert(
      'layer 2 / fence',
      'the rewind returns maps of past INPUTS — no AuditEntry row, and no denied name at any depth',
      built &&
        ok(() => {
          const shallow = {
            responseAt: Object.fromEntries(rewound.responseAt),
            absentAt: Array.from(rewound.absentAt),
            changedSince: Object.fromEntries(rewound.changedSince),
            clockAt: Object.fromEntries(rewound.clockAt),
            attendanceAt: Object.fromEntries(rewound.attendanceAt),
            ambiguous: Array.from(rewound.ambiguous),
          };
          const keys = collectKeys(shallow);
          return keys.size > 0 && !BEHAVIOUR_DENYLIST.some((n) => keys.has(n));
        })
    );

    // ── THE NO-OP FIXTURE, THROUGH THE REAL ACK ROUTE ────────────────────
    //
    // Accept → decline → accept, in process, against the route a guest actually taps. The
    // window is then chosen to sit BETWEEN the first row and the second, so the state at
    // `since` and the state now are both ACCEPTED with two genuine rows in between.
    const gFlip = await guest('Flip');
    const aFlip = await give(gFlip.person.id, 'the pavlova', 'PENDING', T0);
    const flipToken = randomBytes(24).toString('hex');
    await prisma.accessToken.create({
      data: {
        token: flipToken,
        scope: 'PARTICIPANT',
        eventId: dbEvent.id,
        personId: gFlip.person.id,
      },
    });

    let flipRows: Array<{ actionType: string; timestamp: Date }> = [];
    if (ACK) {
      for (const response of ['ACCEPTED', 'DECLINED', 'ACCEPTED']) {
        await ACK.POST(
          new Request('http://localhost/api/p/x/ack/y', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ response }),
          }) as any,
          { params: Promise.resolve({ token: flipToken, assignmentId: aFlip.id }) }
        );
        await new Promise((r) => setTimeout(r, 5));
      }
      flipRows = await prisma.auditEntry.findMany({
        where: { eventId: dbEvent.id, targetId: aFlip.id },
        select: { actionType: true, timestamp: true },
        orderBy: { timestamp: 'asc' },
      });
    }

    assert(
      'layer 2 / no-op',
      'the real ack route wrote THREE genuine rows on one targetId — accept, decline, accept',
      flipRows.length === 3 &&
        flipRows[0].actionType === 'ACCEPT_ASSIGNMENT' &&
        flipRows[1].actionType === 'DECLINE_ASSIGNMENT' &&
        flipRows[2].actionType === 'ACCEPT_ASSIGNMENT'
    );

    const flipSince =
      flipRows.length === 3 ? new Date(flipRows[0].timestamp.getTime() + 1) : SINCE_DB;
    const flipRewound =
      built && flipRows.length === 3
        ? await RW.rewindGlanceInputs(prisma, dbEvent.id, flipSince)
        : null;
    assert(
      'layer 2 / no-op',
      'and the rewind reads ACCEPTED at `since` — the same value the row carries now',
      built &&
        flipRows.length === 3 &&
        ok(() => flipRewound.responseAt.get(aFlip.id) === 'ACCEPTED')
    );
    assert(
      'layer 2 / no-op',
      'with the two later rows recorded as movement — so the drop is the RULE, not an empty window',
      built &&
        flipRows.length === 3 &&
        ok(() => typeof flipRewound.changedSince.get(aFlip.id) === 'number')
    );

    const flipGlance = glanceOf([
      gPerson({
        personEventId: gFlip.personEvent.id,
        personId: gFlip.person.id,
        items: [gItem({ assignmentId: aFlip.id })],
      }),
    ]);
    const flipReplay =
      built && flipRows.length === 3
        ? RP.deriveReplay(flipGlance, flipRewound, event, flipSince, new Date())
        : null;
    assert(
      'layer 2 / no-op',
      'THE NO-OP RULE, end to end: a real double-flip emits NO STEP — nothing is what she sees',
      built && flipRows.length === 3 && ok(() => flipReplay.steps.length === 0)
    );

    // ══ LAYER 3 — THE STAMP ROUTE, OVER HTTP ═════════════════════════════
    //
    // `requireEventRole` reads a session cookie, so this cannot be driven in process — the
    // same reason `tests/glance-actions-test.ts` gives. Needs `npm run dev` against
    // gather_dev, which is the default DATABASE_URL: no temporary .env.local is created.
    //
    // ⚠ KB-005. If a build has been run since the server started, the server is on a stale
    // build and every route 500s. The probe below asks the GLANCE ROUTE for its 401 rather
    // than asking whether the server answers at all, because a stale build answers too.
    const BASE = process.env.GLANCE_TEST_BASE_URL ?? 'http://localhost:3000';
    const SEEN = (id: string) => `${BASE}/api/events/${id}/glance/seen`;

    async function postSeen(id: string, headers: Record<string, string>, body?: unknown) {
      const res = await fetch(SEEN(id), {
        method: 'POST',
        headers,
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      let json: any = null;
      try {
        json = await res.json();
      } catch {
        /* a refusal may carry no JSON */
      }
      return { status: res.status, json };
    }

    /** The stored mark for one viewer, read back from the database rather than inferred. */
    async function markOf(userId: string, eventId: string): Promise<Date | null> {
      const row = await prisma.eventRole.findFirst({
        where: { userId, eventId },
        select: { glanceSeenAt: true },
      });
      return row?.glanceSeenAt ?? null;
    }

    let probeStatus = 0;
    try {
      probeStatus = (await fetch(`${BASE}/api/events/none/glance`)).status;
    } catch {
      probeStatus = 0;
    }
    const serverUp = probeStatus === 401;
    assert(
      'layer 3 / http',
      `the dev server is healthy on ${BASE} — the glance route answers 401, not 500 (KB-005)`,
      serverUp
    );

    // ── The fixture: ONE event, TWO viewers who may look, ONE who may not ──
    const hostUser = await prisma.user.create({
      data: { email: `${TAG}-host@example.com` },
    });
    const cohostUser = await prisma.user.create({
      data: { email: `${TAG}-cohost@example.com` },
    });
    const coordUser = await prisma.user.create({
      data: { email: `${TAG}-coord@example.com` },
    });
    createdUserIds.push(hostUser.id, cohostUser.id, coordUser.id);

    async function sessionFor(userId: string) {
      const tok = randomBytes(24).toString('hex');
      await prisma.session.create({
        data: { userId, token: tok, expiresAt: new Date(Date.now() + DAY) },
      });
      return { Cookie: `session=${tok}`, 'Content-Type': 'application/json' };
    }
    const HOST_COOKIE = await sessionFor(hostUser.id);
    const COORD_COOKIE = await sessionFor(coordUser.id);

    const stampPerson = await prisma.person.create({
      data: {
        name: `${TAG} StampHost`,
        email: `${TAG}-stamphost@example.com`,
        userId: hostUser.id,
      },
    });
    createdPersonIds.push(stampPerson.id);

    const stampEvent = await prisma.event.create({
      data: {
        name: `${TAG} stamp fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: stampPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(Date.now() - 10 * DAY),
      },
    });
    createdEventIds.push(stampEvent.id);

    // Two rows on ONE event, both null. Ruling 20's per-viewer memory, set up so a write
    // that ignores `userId` is visible as a fact rather than as an argument.
    await prisma.eventRole.create({
      data: { userId: hostUser.id, eventId: stampEvent.id, role: 'HOST' },
    });
    await prisma.eventRole.create({
      data: { userId: cohostUser.id, eventId: stampEvent.id, role: 'COHOST' },
    });
    await prisma.eventRole.create({
      data: { userId: coordUser.id, eventId: stampEvent.id, role: 'COORDINATOR' },
    });

    // ── The guard: the same one the GET and the page use ──────────────────
    const anon = await postSeen(stampEvent.id, { 'Content-Type': 'application/json' });
    assert(
      'layer 3 / auth',
      'an unauthenticated caller is refused 401 — before anything is written',
      serverUp && anon.status === 401
    );
    assert(
      'layer 3 / auth',
      'and nothing was stamped by that refusal',
      serverUp && anon.status === 401 && (await markOf(hostUser.id, stampEvent.id)) === null
    );

    const wrongRole = await postSeen(stampEvent.id, COORD_COOKIE);
    assert(
      'layer 3 / auth',
      'a COORDINATOR is refused 403 — the guard admits HOST and COHOST and nobody else',
      serverUp && wrongRole.status === 403
    );
    assert(
      'layer 3 / auth',
      'and the COORDINATOR’s own row is not stamped either — a refusal writes nothing',
      serverUp && wrongRole.status === 403 && (await markOf(coordUser.id, stampEvent.id)) === null
    );

    // ── NULL → STAMP NOW ──────────────────────────────────────────────────
    const beforeFirst = new Date();
    const first = await postSeen(stampEvent.id, HOST_COOKIE);
    const afterFirst = new Date();
    const hostMark1 = await markOf(hostUser.id, stampEvent.id);
    const cohostMark1 = await markOf(cohostUser.id, stampEvent.id);

    assert('layer 3 / stamp', 'the host’s POST answers 200', serverUp && first.status === 200);
    assert(
      'layer 3 / stamp',
      'NULL → STAMPED NOW: the mark moves from null to a server instant inside this test’s window',
      serverUp &&
        hostMark1 !== null &&
        hostMark1.getTime() >= beforeFirst.getTime() - 1000 &&
        hostMark1.getTime() <= afterFirst.getTime() + 1000
    );

    // ── RULING 20, PROVEN IN ISOLATION ────────────────────────────────────
    //
    // ONE assertion, both halves, deliberately: "the co-host did not move" is trivially true
    // of a route that does not exist, and would be a vacuous green at RED. Anding it with
    // "the caller DID move" makes it a differential that only a scoped write can satisfy.
    assert(
      'layer 3 / Ruling 20',
      'EXACTLY ONE ROW MOVED, and it was the caller’s — the co-host’s memory is untouched',
      serverUp && hostMark1 !== null && cohostMark1 === null
    );

    // ── NO BODY IS READ ───────────────────────────────────────────────────
    //
    // Gated on a row that actually moved, for the same reason: at RED nothing moves, and
    // "the stored value is not 2099" is trivially true of a row that was never written.
    await prisma.eventRole.updateMany({
      where: { userId: hostUser.id, eventId: stampEvent.id },
      data: { glanceSeenAt: null },
    });
    const FAR_FUTURE = '2099-01-01T00:00:00.000Z';
    const beforeBody = new Date();
    const withBody = await postSeen(stampEvent.id, HOST_COOKIE, { glanceSeenAt: FAR_FUTURE });
    const hostMark2 = await markOf(hostUser.id, stampEvent.id);
    assert(
      'layer 3 / no body',
      'a client-supplied glanceSeenAt is IGNORED — the row is stamped, and stamped with the SERVER clock',
      serverUp &&
        withBody.status === 200 &&
        hostMark2 !== null &&
        hostMark2.getTime() >= beforeBody.getTime() - 1000 &&
        hostMark2.getTime() < new Date(FAR_FUTURE).getTime()
    );

    // ── MONOTONIC ─────────────────────────────────────────────────────────
    //
    // A tab that stamped the future would silence the replay forever. The guard is
    // `glanceSeenAt IS NULL OR glanceSeenAt < now`, so a stored instant ahead of the server
    // clock is left exactly where it is.
    const AHEAD = new Date(Date.now() + 2 * DAY);
    await prisma.eventRole.updateMany({
      where: { userId: hostUser.id, eventId: stampEvent.id },
      data: { glanceSeenAt: AHEAD },
    });
    const backward = await postSeen(stampEvent.id, HOST_COOKIE);
    const hostMark3 = await markOf(hostUser.id, stampEvent.id);
    assert(
      'layer 3 / monotonic',
      'the memory NEVER MOVES BACKWARDS — a stored instant ahead of the server clock is left alone',
      // GATED ON A POSITIVE CONTROL. "The row did not move" is trivially true of a route that
      // does not exist — this passed vacuously at RED until the `withBody` clause was added,
      // which proves a FORWARD stamp works against the same row moments earlier. The pair is
      // the assertion; either half alone is worthless.
      serverUp &&
        withBody.status === 200 &&
        hostMark2 !== null &&
        hostMark3 !== null &&
        hostMark3.getTime() === AHEAD.getTime()
    );
    assert(
      'layer 3 / monotonic',
      'and the route still answers 200 — refusing to move backwards is not an error',
      serverUp && backward.status === 200
    );

    // ── THE PAGE STAMPS: null baseline AND empty diff ─────────────────────
    //
    // "Nothing to play → stamp immediately" covers BOTH, and the empty diff is the common
    // case. Driven through the real page over HTTP with the host's cookie, then read back
    // from the database.
    await prisma.eventRole.updateMany({
      where: { userId: hostUser.id, eventId: stampEvent.id },
      data: { glanceSeenAt: null },
    });
    const pageUrl = `${BASE}/plan/${stampEvent.id}/glance`;
    const pageRes1 = await fetch(pageUrl, { headers: HOST_COOKIE });
    const pageMark1 = await markOf(hostUser.id, stampEvent.id);
    assert(
      'layer 3 / page',
      'the page renders for the host (200)',
      serverUp && pageRes1.status === 200
    );
    assert(
      'layer 3 / page',
      'NULL BASELINE → the page stamps: nothing was played, so the memory advances immediately',
      serverUp && pageRes1.status === 200 && pageMark1 !== null
    );

    // Second visit with nothing changed in between: an EMPTY DIFF, not a null baseline. It
    // must advance too — most visits change nothing, and a memory that only moves on the
    // first visit would replay every quiet week.
    await new Promise((r) => setTimeout(r, 1100));
    const pageRes2 = await fetch(pageUrl, { headers: HOST_COOKIE });
    const pageMark2 = await markOf(hostUser.id, stampEvent.id);
    assert(
      'layer 3 / page',
      'EMPTY DIFF → the page stamps AGAIN, forward — the common case is not the null case',
      serverUp &&
        pageRes2.status === 200 &&
        pageMark1 !== null &&
        pageMark2 !== null &&
        pageMark2.getTime() > pageMark1.getTime()
    );

    // ── 6c: SOMETHING TO PLAY → THE ISLAND GETS IT, AND THE PAGE DOES NOT STAMP ──
    //
    // ⚠ THE STAMP TIMING IS NOT A BUG, AND 6c DOES NOT MOVE IT. 6b's recorded decision:
    // nothing to play → stamp immediately; something to play → do NOT stamp until the replay
    // has played. 6c ADDS the completion POST — the island's, after the last beat — and
    // leaves the page's rule exactly where 6b put it. A slice that made the page stamp
    // unconditionally would consume the news before anything existed to show it, and the
    // first host to open the board would find her reversals already settled, silently.
    //
    // The fixture is the common good news: an assignment created BEFORE `since`, `ACCEPTED`
    // now, with its `ACCEPT_ASSIGNMENT` row dated INSIDE the window. AMBER → GREEN, one spark.
    //
    // ⚠ THIS FIXTURE ORIGINALLY WROTE NO LEDGER ROW AT ALL, AND RULING 28 BROKE IT — which is
    // the ruling proving itself on 6c's own test. It leant on the `PENDING` default: no row, so
    // the rewind assumed pending at `since` and the spark appeared out of an assumption. Under
    // positive evidence the same fixture correctly replays NOTHING, because nothing recorded a
    // change. The row below is what makes the change real, and it is what a guest's own tap
    // writes.
    const playPerson = await prisma.person.create({
      data: { name: `${TAG} PlayGuest`, email: `${TAG}-play@example.com` },
    });
    createdPersonIds.push(playPerson.id);
    const playEvent = await prisma.event.create({
      data: {
        name: `${TAG} play fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: stampPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(Date.now() - 10 * DAY),
      },
    });
    createdEventIds.push(playEvent.id);
    const playSince = new Date(Date.now() - 2 * HOUR);
    await prisma.eventRole.create({
      data: {
        userId: hostUser.id,
        eventId: playEvent.id,
        role: 'HOST',
        glanceSeenAt: playSince,
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: playPerson.id,
        eventId: playEvent.id,
        role: 'PARTICIPANT',
        sentAt: new Date(Date.now() - 10 * DAY),
      },
    });
    const playTeam = await prisma.team.create({
      data: { eventId: playEvent.id, name: `${TAG} PlayMains` },
    });
    const playItem = await prisma.item.create({
      data: { teamId: playTeam.id, name: `${TAG} the pavlova`, kind: 'ITEM' },
    });
    const playAssignment = await prisma.assignment.create({
      data: {
        itemId: playItem.id,
        personId: playPerson.id,
        response: 'ACCEPTED',
        createdAt: new Date(Date.now() - 6 * HOUR),
      },
    });
    await prisma.auditEntry.create({
      data: {
        eventId: playEvent.id,
        actorId: playPerson.id,
        actionType: 'ACCEPT_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: playAssignment.id,
        details: '',
        timestamp: new Date(Date.now() - 1 * HOUR),
      },
    });

    const playRes = await fetch(`${BASE}/plan/${playEvent.id}/glance`, { headers: HOST_COOKIE });
    const playHtml = playRes.status === 200 ? await playRes.text() : '';
    const playMark = await markOf(hostUser.id, playEvent.id);
    assert(
      'layer 3 / play',
      'the page renders for the host on a board with something to play (200)',
      serverUp && playRes.status === 200
    );
    // THE POSITIVE CONTROL FIRST. Everything below is a claim about a NON-EMPTY replay, and
    // "the mark did not move" is trivially true of a page that computed nothing at all.
    assert(
      'layer 3 / play',
      'THE REPLAY IS NON-EMPTY — the island is on the page carrying one step (the positive control the two below hang on)',
      serverUp && playRes.status === 200 && /data-glance-replay="1"/.test(playHtml)
    );
    assert(
      'layer 3 / play',
      'SOMETHING TO PLAY → THE PAGE DOES NOT STAMP — 6b’s rule survives 6c, and the news is not consumed before it is shown',
      serverUp &&
        playRes.status === 200 &&
        /data-glance-replay="1"/.test(playHtml) &&
        playMark !== null &&
        playMark.getTime() === playSince.getTime()
    );
    // Ruling 6 end-to-end: "'seen' means the replay played — no acknowledge button, no inbox
    // mechanics." Asserted on the page a host actually receives, with a replay pending on it,
    // rather than only on the island's source.
    assert(
      'layer 3 / play',
      'NO ACKNOWLEDGE CONTROL reaches the served page — "seen" means the replay played (Ruling 6)',
      serverUp &&
        playRes.status === 200 &&
        /data-glance-replay="1"/.test(playHtml) &&
        !/acknowledge|dismiss|got it|mark as seen|skip replay/i.test(playHtml)
    );

    // ══ LAYER 4 — STRUCTURAL AND FENCE ═══════════════════════════════════
    const rewindSrc = code('src/lib/glance/rewind.ts');
    const replaySrc = code('src/lib/glance/replay.ts');
    const entrySrc = code('src/lib/glance/replay-entry.ts');
    const sourcesExist = rewindSrc.length > 0 && replaySrc.length > 0 && entrySrc.length > 0;

    assert(
      'layer 4 / sources',
      'the three new modules exist — every structural assertion below is gated on this',
      sourcesExist
    );

    // ── §5 layer 1: the runtime denylist, GATED ON A NON-EMPTY REPLAY ────
    //
    // "A fence that passes on an empty replay is not a fence." The payload scanned here is
    // `pendingToAccepted`, which carries exactly one step.
    for (const banned of BEHAVIOUR_DENYLIST) {
      assert(
        'layer 4 / fence runtime',
        `the replay payload carries no "${banned}"`,
        built &&
          ok(() => {
            const keys = collectKeys(pendingToAccepted);
            return pendingToAccepted.steps.length > 0 && !keys.has(banned);
          })
      );
    }

    // ── §5 layer 2: the positive allowlist on the step object ────────────
    assert(
      'layer 4 / allowlist',
      'a step’s keys are EXACTLY {personEventId, from, to, spark} — an allowlist bans what nobody thought of',
      built &&
        ok(() => {
          const keys = Object.keys(pendingToAccepted.steps[0]).sort();
          return (
            pendingToAccepted.steps.length > 0 &&
            JSON.stringify(keys) === JSON.stringify(['from', 'personEventId', 'spark', 'to'])
          );
        })
    );
    assert(
      'layer 4 / allowlist',
      'and the replay itself carries exactly {steps} — no `since`, no `asOf`, no cursor',
      built &&
        ok(() => JSON.stringify(Object.keys(pendingToAccepted)) === JSON.stringify(['steps']))
    );

    // ── §5 layer 3: NO TIMESTAMP OF ANY KIND. The assertion that does the real work. ──
    //
    // A behaviour leak in a replay does not arrive called `openedAt`; it arrives called `at`
    // or `when`, and it is WHEN THE GUEST ACTED. The name denylist would not catch it.
    assert(
      'layer 4 / no timestamp',
      'no ISO-shaped string anywhere in the replay payload, at any depth',
      built &&
        ok(() => {
          const scalars = collectScalars(pendingToAccepted);
          return (
            pendingToAccepted.steps.length > 0 &&
            !scalars.some((v) => typeof v === 'string' && ISO_LIKE.test(v))
          );
        })
    );
    assert(
      'layer 4 / no timestamp',
      'and no epoch-shaped number — nothing above 10^12 crosses the wire',
      built &&
        ok(() => {
          const scalars = collectScalars(pendingToAccepted);
          return (
            pendingToAccepted.steps.length > 0 &&
            !scalars.some((v) => typeof v === 'number' && Math.abs(v) > EPOCH_FLOOR)
          );
        })
    );
    assert(
      'layer 4 / no timestamp',
      'the payload carries ORDER, not TIME — the ordering key is used to sort and then discarded',
      built && ok(() => !JSON.stringify(pendingToAccepted).includes('changedSince'))
    );

    // ── §5 layer 4: the rewind is confined ───────────────────────────────
    for (const t of INVITE_EVENT_TYPES) {
      assert(
        'layer 4 / confinement',
        `the rewind never names InviteEventType.${t}`,
        sourcesExist && !new RegExp(`\\b${t}\\b`).test(rewindSrc)
      );
    }
    assert(
      'layer 4 / confinement',
      'the rewind never names `inviteEvent` or `InviteEvent` — the table carrying LINK_OPENED is NOT READ AT ALL',
      sourcesExist && !/\binviteEvent\b/.test(rewindSrc) && !/\bInviteEvent\b/.test(rewindSrc)
    );
    assert(
      'layer 4 / confinement',
      'the rewind pins actionType with an `in:` allowlist rather than a free filter',
      sourcesExist && /actionType\s*:\s*\{\s*in\s*:/.test(rewindSrc)
    );
    assert(
      'layer 4 / confinement',
      'and the allowlist is EXACTLY the three response verbs — asserted on its contents, not its shape',
      built &&
        ok(
          () =>
            JSON.stringify([...RW.REWIND_RESPONSE_ACTIONS].sort()) ===
            JSON.stringify(['ACCEPT_ASSIGNMENT', 'DECLINE_ASSIGNMENT', 'MAYBE_ASSIGNMENT'])
        )
    );
    for (const col of FORBIDDEN_SELECT) {
      assert(
        'layer 4 / confinement',
        `the rewind never selects \`${col}\` — free text and arbitrary JSON stay out of the process`,
        sourcesExist && !new RegExp(`\\b${col}\\s*:\\s*true`).test(rewindSrc)
      );
    }
    assert(
      'layer 4 / confinement',
      'the rewind selects the four columns it needs and says so explicitly',
      sourcesExist &&
        /targetId\s*:\s*true/.test(rewindSrc) &&
        /actionType\s*:\s*true/.test(rewindSrc) &&
        /timestamp\s*:\s*true/.test(rewindSrc) &&
        /targetType\s*:\s*true/.test(rewindSrc)
    );
    assert(
      'layer 4 / confinement',
      'nothing in the three new modules uses `include:` — no whole row can spread in behind the select',
      sourcesExist && ![rewindSrc, replaySrc, entrySrc].some((s) => /\binclude\s*:/.test(s))
    );

    // ── The rewind's exemption is TWO NAMES WIDE (Ruling 21), derived from the one list ──
    assert(
      'layer 4 / Ruling 21',
      'the rewind is scanned with the ONE list minus exactly two names — no second denylist exists',
      BEHAVIOUR_DENYLIST.length - REWIND_DENYLIST.length === 2 &&
        BEHAVIOUR_DENYLIST.filter((n) => !REWIND_DENYLIST.includes(n)).join(',') ===
          'auditEntry,AuditEntry'
    );
    for (const banned of REWIND_DENYLIST) {
      assert(
        'layer 4 / Ruling 21',
        `the rewind names no "${banned}" — everything but the two exempt names still applies to it`,
        sourcesExist && !new RegExp(`\\b${banned}\\b`).test(rewindSrc)
      );
    }

    // ── replay.ts is pure: no Prisma, no clock ───────────────────────────
    assert(
      'layer 4 / purity',
      'replay.ts holds no database handle — it is client-safe by construction',
      sourcesExist && !/@prisma\/client|PrismaClient|\bprisma\b|\bauditEntry\b/.test(replaySrc)
    );
    assert(
      'layer 4 / purity',
      'and reads no clock of its own — `now` and `since` are injected, so the replay is deterministic',
      sourcesExist && !/new Date\(\s*\)|Date\.now\(\s*\)/.test(replaySrc)
    );

    // ── The one door ─────────────────────────────────────────────────────
    assert(
      'layer 4 / one door',
      'the null branch is the FIRST STATEMENT of the door — not a guard buried after a read',
      sourcesExist &&
        /export async function readGlanceReplay[\s\S]*?\{\s*if\s*\([^)]*null[^)]*\)\s*(return|\{)/.test(
          entrySrc
        )
    );
    assert(
      'layer 4 / one door',
      'the rewind is reached ONLY through the door — no other glance source imports it',
      sourcesExist &&
        !['state', 'read', 'actions'].some((m) =>
          /glance\/rewind/.test(code(`src/lib/glance/${m}.ts`))
        )
    );

    // ── WHO MAY REACH THE REPLAY, AND WITH WHAT ──────────────────────────
    //
    // ⚠ 6b's assertion "NO COMPONENT reaches the replay at all" IS RETIRED HERE, WITH ITS
    // SUCCESSOR NAMED AT THE SITE — the treatment phase 3 gave phase 2's alert-strip guard
    // and 6b gave 6a's. 6b could say no component touched the replay because 6b shipped no
    // island. 6c ships one, so the invariant NARROWS rather than disappears:
    //
    //   was:  no component imports rewind / replay / replay-entry
    //   now:  NO COMPONENT REACHES THE DB-BOUND HALF — not the rewind, not the door — and
    //         EXACTLY ONE component reaches the PURE half, and it is the island.
    //
    // That is the property worth holding. The rewind is the module that touches a ledger and
    // the door is the module that reads a database; a client component reaching either would
    // put both in a browser bundle. `replay.ts` is pure and client-safe by construction, and
    // asserted so a few lines above.
    const ISLAND = 'src/components/glance/GlanceReplay.tsx';
    const componentSurfaces = [
      'src/components/glance/GlanceBoard.tsx',
      'src/components/glance/PersonSurface.tsx',
      'src/components/glance/assistant.ts',
      'src/components/glance/strip.ts',
      'src/app/api/events/[id]/glance/route.ts',
      'src/lib/glance/read.ts',
      'src/lib/glance/state.ts',
      'src/lib/glance/actions.ts',
    ];
    const islandSrc = code(ISLAND);
    const islandBuilt = islandSrc.length > 0;
    assert(
      'layer 4 / island',
      'THE ISLAND EXISTS — every assertion whose subject is the island is gated on this, so "absent" cannot read as "correct"',
      islandBuilt
    );
    assert(
      'layer 4 / no UI',
      'NO COMPONENT reaches the DB-BOUND half — not the rewind, not the door; a client bundle must not contain either',
      [...componentSurfaces, ISLAND].every((f) => {
        const src = code(f);
        return src.length > 0 && !/glance\/(rewind|replay-entry)/.test(src);
      })
    );
    assert(
      'layer 4 / no UI',
      'and EXACTLY ONE component reaches the PURE replay — the island, and nothing else on the board',
      islandBuilt &&
        /glance\/replay['"]/.test(islandSrc) &&
        componentSurfaces.every((f) => {
          const src = code(f);
          return src.length > 0 && !/glance\/replay['"]/.test(src);
        })
    );
    const pageSrc6b = code('src/app/plan/[eventId]/glance/page.tsx');
    assert(
      'layer 4 / one door',
      'the PAGE reaches the replay ONLY through the one door — replay-entry, never rewind or replay',
      pageSrc6b.length > 0 &&
        /glance\/replay-entry/.test(pageSrc6b) &&
        !/glance\/rewind/.test(pageSrc6b) &&
        !/glance\/replay['"]/.test(pageSrc6b)
    );
    // ⚠ AND 6b's TIMER ASSERTION NARROWS TOO, FOR THE SAME REASON AND WITH THE SAME
    // TREATMENT. The island's schedule IS timeouts — that is what a staggered replay is — so
    // a blanket "no setTimeout anywhere" would have to be either deleted or lied to.
    //
    //   was:  no setInterval, no setTimeout, no router.refresh on ANY surface
    //   now:  NO SURFACE STARTS AN INTERVAL AND NONE REFRESHES ITSELF — polling is Ruling
    //         10's ~20s and belongs to 6e — and the only timeouts in the glance are the
    //         island's own schedule.
    //   and:  6e retires the interval half when polling lands, deliberately and at this site.
    const surfaces = [...componentSurfaces, 'src/app/plan/[eventId]/glance/page.tsx'];
    assert(
      'layer 4 / no UI',
      'NO SURFACE POLLS — no interval and no self-refresh anywhere, the island included; Ruling 10’s ~20s is 6e’s',
      // Gated on the file actually being read: `code()` returns '' for a missing path, and an
      // absence test over an empty string is the vacuous green this ticket keeps catching.
      islandBuilt &&
        [...surfaces, ISLAND].every((f) => {
          const src = code(f);
          return src.length > 0 && !/setInterval|router\.refresh/.test(src);
        })
    );
    assert(
      'layer 4 / no UI',
      'and the ONLY timeouts in the glance are the island’s schedule — every other surface starts none',
      islandBuilt && surfaces.every((f) => code(f).length > 0 && !/setTimeout/.test(code(f)))
    );

    // ── THE ISLAND ITSELF (6c) ───────────────────────────────────────────
    assert(
      'layer 4 / island',
      'it is a CLIENT component — the animation needs a browser',
      islandBuilt && /['"]use client['"]/.test(raw(ISLAND))
    );
    assert(
      'layer 4 / island',
      'and the BOARD still is not — GlanceBoard keeps phase 2’s no-hooks property; the replay is an island BESIDE it, phase 4’s pattern',
      islandBuilt &&
        ok(() => {
          const src = code('src/components/glance/GlanceBoard.tsx');
          return (
            src.length > 0 && !/['"]use client['"]|useState|useEffect|useLayoutEffect/.test(src)
          );
        })
    );
    assert(
      'layer 4 / island',
      'it holds NO database handle and no Prisma import — a client bundle is not a place for one',
      islandBuilt && !/@prisma\/client|PrismaClient|\bprisma\b/.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'it reads ONE definition of the colours — the tones and their hexes come from the strip module, and NOT ONE HEX is written here',
      islandBuilt &&
        /from '\.\/strip'/.test(islandSrc) &&
        /STRIP_TONE/.test(islandSrc) &&
        !/#[0-9A-Fa-f]{6}/.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'it asks the SHARED schedule rather than staggering by hand — one definition of the budget',
      islandBuilt && /scheduleReplay\(/.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'NO ACKNOWLEDGE CONTROL — no button, no link, no role="button", no click handler anywhere in it (Ruling 6)',
      islandBuilt &&
        !/<button|<a\s|role="button"|onClick|onKeyDown|acknowledge|dismiss/i.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'the completion POST goes to 6b’s route, with NO BODY — the instant is the server’s, never the client’s',
      islandBuilt &&
        /\/api\/events\/\$\{[^}]*\}\/glance\/seen/.test(islandSrc) &&
        /method:\s*'POST'/.test(islandSrc) &&
        !/body:/.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'and it fires ONCE — guarded by a ref, so a re-render or a strict-mode double effect cannot stamp twice',
      islandBuilt && /useRef/.test(islandSrc)
    );
    assert(
      'layer 4 / island',
      'it paints the past BEFORE the browser paints — a layout effect, not a post-paint one',
      islandBuilt && /useLayoutEffect/.test(islandSrc)
    );
    // ── 6c / FINDING 1, RULED ────────────────────────────────────────────
    //
    // "During the replay, SUPPRESS THE REASON LINE on any strip that still has a pending step;
    // let it appear as the step lands. No past reasons, no fifth key on ReplayStep, the
    // allowlist holds. A green strip reading 'out' is incoherent and the words are the
    // truthful half."
    //
    // The tint is rewound and the words are not — they describe the state NOW, and during the
    // rewind that state has not arrived. So the words are hidden, not rewritten: rewinding them
    // would need the past `reasons`, which is the fifth key the allowlist refuses.
    assert(
      'layer 4 / finding 1',
      'THE WORDS ARE SUPPRESSED WHILE A STEP IS PENDING — the island hides the strip’s state-words with the past paint',
      islandBuilt && /data-strip-words/.test(islandSrc) && /hidden\s*=\s*true/.test(islandSrc)
    );
    assert(
      'layer 4 / finding 1',
      'and they APPEAR AS THE STEP LANDS — hidden is set back, in the same place the tint is',
      islandBuilt && /hidden\s*=\s*false/.test(islandSrc)
    );
    assert(
      'layer 4 / finding 1',
      'and NO PAST REASON crosses the wire to do it — the step is still exactly the four keys',
      built &&
        islandBuilt &&
        ok(() => {
          const keys = Object.keys(pendingToAccepted.steps[0]).sort();
          return JSON.stringify(keys) === JSON.stringify(['from', 'personEventId', 'spark', 'to']);
        })
    );
    assert(
      'layer 4 / island',
      'the strips are ADDRESSABLE — the board marks each with its personEventId so the island can find it',
      ok(() => {
        const board = code('src/components/glance/GlanceBoard.tsx');
        const surface = code('src/components/glance/PersonSurface.tsx');
        return (
          board.length > 0 &&
          surface.length > 0 &&
          /data-person-event-id/.test(board) &&
          /data-person-event-id/.test(surface)
        );
      })
    );
    // ⚠ NOT A SECOND DEFINITION OF THE NO-OP RULE. 6a drops `from === to` inside
    // `deriveReplay`, and re-implementing that drop in the island would be the second
    // definition this ticket refuses everywhere else. So the assertion is on the COMPOSITION:
    // the double-flip fixture is put through the real derivation and the island is handed
    // whatever comes out — and what comes out is nothing to paint.
    assert(
      'layer 4 / island',
      'THE ISLAND NEVER RENDERS A NO-OP — the double-flip derives to zero steps, so there is nothing for it to paint',
      built &&
        islandBuilt &&
        ok(() => netZero.steps.length === 0 && RP.scheduleReplay(netZero.steps).length === 0)
    );
    assert(
      'layer 4 / island',
      'and Ruling 26 holds at the island’s door too — GREEN → AMBER derives to nothing, so no strip is ever painted backwards into amber',
      built && islandBuilt && ok(() => greenToAmber.steps.length === 0)
    );
    assert(
      'layer 4 / page',
      'THE PAGE HANDS THE REPLAY TO THE ISLAND — 6b computed it and dropped it; 6c is where it becomes visible',
      pageSrc6b.length > 0 &&
        /components\/glance\/GlanceReplay/.test(pageSrc6b) &&
        /<GlanceReplay/.test(pageSrc6b) &&
        /replay\.steps/.test(pageSrc6b)
    );
    assert(
      'layer 4 / page',
      'and it STILL stamps only when there is nothing to play — 6b’s decision is not a bug, and 6c does not move it',
      pageSrc6b.length > 0 &&
        /replay\.steps\.length === 0[\s\S]{0,160}stampGlanceSeen/.test(pageSrc6b) &&
        (pageSrc6b.match(/stampGlanceSeen\(/g) ?? []).length === 1
    );
    assert(
      'layer 4 / page',
      'the page is still a SERVER component — the board is right in the first paint, not after a fetch',
      pageSrc6b.length > 0 && !/['"]use client['"]/.test(pageSrc6b)
    );

    // ── 6b: THE STAMP ROUTE, STRUCTURALLY ────────────────────────────────
    const seenSrc = code('src/app/api/events/[id]/glance/seen/route.ts');
    const seenExists = seenSrc.length > 0;
    assert(
      'layer 4 / stamp route',
      'the stamp route exists — every assertion below is gated on this',
      seenExists
    );
    assert(
      'layer 4 / stamp route',
      'it is host-scoped through the SAME guard the GET and the page use — no second definition',
      seenExists && /requireEventRole\(\s*eventId\s*,\s*\['HOST',\s*'COHOST'\]\s*\)/.test(seenSrc)
    );
    assert(
      'layer 4 / stamp route',
      'and it fails closed — the guard’s NextResponse is returned before any write',
      seenExists && /if\s*\(auth instanceof NextResponse\)\s*return auth;/.test(seenSrc)
    );
    assert(
      'layer 4 / stamp route',
      'IT READS NO BODY — a client-supplied instant could stamp the future and silence the replay forever',
      seenExists &&
        !/\.json\(\s*\)/.test(seenSrc.replace(/NextResponse\.json/g, '')) &&
        !/\bbody\b/.test(seenSrc)
    );
    assert(
      'layer 4 / stamp route',
      'it is a ROUTE, not a server action — a server action bypasses route-classifications, the inventory gate and test:security entirely',
      seenExists &&
        !/['"]use server['"]/.test(seenSrc) &&
        /export async function POST/.test(seenSrc)
    );
    assert(
      'layer 4 / stamp route',
      'the route writes nothing itself — the monotonic write lives in ONE place and both callers ask it',
      seenExists && !/updateMany/.test(seenSrc) && /stampGlanceSeen/.test(seenSrc)
    );

    // ── RULING 20 IS A WRITE-SCOPE RULE ──────────────────────────────────
    //
    // The invariant is NOT "uses updateMany" — updateMany is how the monotonic guard is
    // expressed, since `update` takes only a unique where. The invariant is THAT THE WHERE
    // NAMES userId: a write scoped to eventId alone stamps every viewer's row and silently
    // consumes the co-host's news, which is the exact thing Ruling 20 exists to prevent.
    const stampSrc = entrySrc;
    assert(
      'layer 4 / Ruling 20',
      'THE WRITE IS SCOPED TO THE VIEWER — its where names userId, not the event alone',
      stampSrc.length > 0 && /where:\s*\{[^}]*userId/.test(stampSrc)
    );
    assert(
      'layer 4 / Ruling 20',
      'and to the event as well — one viewer, one event, one row',
      stampSrc.length > 0 && /where:\s*\{[^}]*eventId/.test(stampSrc)
    );
    assert(
      'layer 4 / monotonic',
      'the write carries the monotonic guard — null OR strictly earlier, so two tabs cannot move it backwards',
      stampSrc.length > 0 &&
        /updateMany/.test(stampSrc) &&
        /glanceSeenAt:\s*null/.test(stampSrc) &&
        /lt:/.test(stampSrc)
    );
    assert(
      'layer 4 / monotonic',
      'and the instant is the SERVER’s — new Date() in the write path, never a parameter off the wire',
      stampSrc.length > 0 && /new Date\(\s*\)/.test(stampSrc)
    );

    // ── THE INVENTORY GOES 80 → 81, ONCE AND DELIBERATELY ────────────────
    const classifications = JSON.parse(code('route-classifications.json') || '[]');
    const seenEntry = classifications.find(
      (r: any) => r.filePath === 'src/app/api/events/[id]/glance/seen/route.ts'
    );
    assert(
      'layer 4 / inventory',
      'the stamp route is classified — SESSION, requireEventRole, POST',
      !!seenEntry &&
        seenEntry.authType === 'SESSION' &&
        seenEntry.authEvidence.includes('requireEventRole') &&
        JSON.stringify(seenEntry.methods) === JSON.stringify(['POST']) &&
        JSON.stringify(seenEntry.securityIssues) === JSON.stringify([])
    );
    assert(
      'layer 4 / inventory',
      'and the surface is 81 routes — phase 4’s "no new route" property ends here, once',
      classifications.length === 81
    );

    // ── Ruling 10: no websocket infrastructure, ever, for this screen ────
    const pkg = JSON.parse(code('package.json') || '{}');
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    assert(
      'layer 4 / Ruling 10',
      'the dependency tree gains NO websocket package — "do not build websocket infrastructure for this screen"',
      !['ws', 'socket.io', 'socket.io-client', 'pusher', 'pusher-js', 'ably', 'sockjs'].some(
        (p) => p in deps
      )
    );
  } finally {
    await prisma.auditEntry.deleteMany({ where: { eventId: { in: createdEventIds } } });
    await prisma.accessToken.deleteMany({ where: { eventId: { in: createdEventIds } } });
    for (const eventId of createdEventIds) {
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — the rewind reads one ledger, the replay carries order not time.\x1b[0m'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
