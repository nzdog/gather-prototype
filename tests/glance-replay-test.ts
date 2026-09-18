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
  /**
   * SLICE 6e — the LIVE half's pure module, loaded on its own gate.
   *
   * It is deliberately NOT part of `built`. `built` is 6a's three modules, and an assertion
   * about the arrival replay must not start failing because polling is missing, nor the
   * reverse. Every 6e assertion is anded with `liveBuilt` instead — the same treatment 6a gave
   * `built` and 6c gave `islandBuilt`, for the same reason: "absent" must never read as
   * "correct".
   */
  let LV: any = null;
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
   * SLICE 6d — Ruling 23's two halves live in modules that ALREADY EXIST, so a `built` gate
   * over the module is worthless here: `strip.ts` is phase 2's and `state.ts` is phase 1's and
   * both import fine with none of 6d in them. The gate has to be on THE EXPORTS THEMSELVES,
   * and it is deliberately split in two — the overlay (what a strip displays) and the reversal
   * predicate (which people it is displayed for) are different halves and an assertion about
   * one must not go green because the other landed.
   *
   * ⚠ AND THE LOADS ARE INSIDE A `try` FOR THE REASON RULING 30'S RED RECORDED: a fixture that
   * calls a missing export at module scope CRASHES, and a suite that cannot report its RED is
   * not a RED.
   */
  let ST: any = null;
  let SS: any = null;
  try {
    ST = await import('../src/components/glance/strip');
    SS = await import('../src/lib/glance/state');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m strip/state load failed: ${String((err as Error).message)}`);
  }

  /**
   * THE GATE THAT MAKES THE RED MEAN SOMETHING. Every assertion whose subject is one of the
   * three new modules is anded with this, so "the module does not exist" can never read as
   * "the module behaves correctly".
   */
  const built = RW !== null && RP !== null && RE !== null;

  try {
    LV = await import('../src/lib/glance/live');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m live module load failed: ${String((err as Error).message)}`);
  }
  /** 6e's own gate. See the declaration above for why it is separate from `built`. */
  const liveBuilt = LV !== null;

  /** 6d's two gates. See the loads above for why they are exports rather than modules. */
  const reversalBuilt =
    RP !== null &&
    typeof RP.isReversalTransition === 'function' &&
    typeof RP.stickyReversals === 'function';
  const overlayBuilt = ST !== null && typeof ST.overlayReversal === 'function';

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
    /**
     * The board the replay RESOLVES TO — i.e. what the server rendered and what the walk
     * forward ends on. Named rather than inlined because slice 6e's baseline assertion needs
     * exactly this object: the live diff's baseline must be THIS, never the past board the
     * replay opened on.
     */
    const mixedResolved = glanceOf([
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
    ]);
    const mixed = built
      ? replayOf(
          mixedResolved,
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

    // ══ LAYER 1d — RULING 23, THE SETTLING REVERSAL (SLICE 6d), PURE ═════
    //
    // Ruling 23, verbatim: "the sticky red is an OVERLAY on top of the ordinary derivation.
    // Playing the replay removes the overlay; what is revealed is whatever the person's state
    // already derives to underneath. This invents no new colour and needs no definition of
    // 'settled' beyond the overlay lifting." And: "DERIVED, never a write."
    //
    // ⚠ WHAT THE TREE ACTUALLY HELD BEFORE THIS SLICE, RECORDED HERE BECAUSE THE ASSERTIONS
    // BELOW ONLY MAKE SENSE AGAINST IT. `derivePersonState` returns OUT for a reversed person
    // on its FIRST line, before any red source is consulted, so a reversal has never read red
    // at all — `strip.ts` says so at its own site: *"'Ray — was in, now out' is the attendance
    // reversal Ruling 6 fences behind phase 5's last-seen record."* Clause 1 was deliberately
    // unbuilt because it needs a per-viewer "seen", and phase 5 is what supplied one. So 6d
    // builds the overlay AND its lifting, because clause 3 has nothing to lift without it.
    //
    // The differential that makes this layer real is assertion 14: the overlay reads RED while
    // `derivePersonState` on the same inputs still reads OUT. An overlay that changed the
    // derivation would fail it, and that is the whole of "never a write, no new colour".
    const outPerson = gPerson({
      personEventId: 'pe-out',
      personId: 'p-out',
      name: 'Ray Dalton',
      state: 'OUT',
      reasons: ['ATTENDANCE_NO'],
      items: [
        gItem({
          itemId: 'i-ice',
          assignmentId: 'a-ice',
          name: 'The ice',
          state: 'RED',
          reason: 'REVERSAL',
        }),
      ],
    });

    assert(
      'layer 1d / Ruling 23',
      'THE GATE — `isReversalTransition` and `stickyReversals` are exported from replay.ts (every reversal assertion below is anded with this)',
      reversalBuilt
    );
    assert(
      'layer 1d / Ruling 23',
      'THE GATE — `overlayReversal` is exported from strip.ts (every overlay assertion below is anded with this)',
      overlayBuilt
    );

    // ── ONE DEFINITION OF THE REVERSAL ───────────────────────────────────
    assert(
      'layer 1d / Ruling 6',
      'GREEN → OUT is a reversal — in, then out, which is Ruling 6’s own words',
      reversalBuilt && ok(() => RP.isReversalTransition('GREEN', 'OUT') === true)
    );
    assert(
      'layer 1d / Ruling 6',
      'AMBER → OUT is a reversal too — the reversal is about LEAVING, not about which shade she left from',
      reversalBuilt && ok(() => RP.isReversalTransition('AMBER', 'OUT') === true)
    );
    assert(
      'layer 1d / Ruling 6',
      'OUT → OUT is NOT — she was already out, and nothing reversed',
      reversalBuilt && ok(() => RP.isReversalTransition('OUT', 'OUT') === false)
    );
    assert(
      'layer 1d / Ruling 26',
      'GREEN → AMBER is NOT a reversal — the boundary Ruling 26 states so nobody implements it wrong',
      reversalBuilt && ok(() => RP.isReversalTransition('GREEN', 'AMBER') === false)
    );
    assert(
      'layer 1d / Ruling 26',
      'and AMBER → RED is NOT either — an ordinary red plays in the middle, and only the reversal plays last',
      reversalBuilt && ok(() => RP.isReversalTransition('AMBER', 'RED') === false)
    );
    // NOT "the word appears near deriveReplay". THE MECHANISM: the literal comparison exists
    // exactly once in the file, and `deriveReplay` reaches it by CALLING the predicate. A
    // second copy of the rule inside the overlay is the drift this ticket refuses at
    // `isChaseable`, at `mayHoldRow` and at `isSparkTransition` — 6e's own precedent.
    assert(
      'layer 1d / one definition',
      "THE REVERSAL RULE IS WRITTEN ONCE — the `to === 'OUT'` comparison appears exactly once in replay.ts, and deriveReplay CALLS the predicate rather than restating it",
      reversalBuilt &&
        ok(() => {
          const src = code('src/lib/glance/replay.ts');
          const literals = src.match(/===\s*'OUT'/g) ?? [];
          return (
            literals.length === 1 &&
            /export function isReversalTransition/.test(src) &&
            /isReversalTransition\(from,\s*to\)/.test(src)
          );
        })
    );

    // ── WHICH REVERSALS ARE STILL OWED TO THIS VIEWER ────────────────────
    assert(
      'layer 1d / overlay',
      'AN EMPTY REPLAY OWES NOTHING — no steps, no overlay, so a viewer who has been shown everything sees the ordinary derivation',
      reversalBuilt && ok(() => RP.stickyReversals([]).length === 0)
    );
    assert(
      'layer 1d / overlay',
      'a replay of ordinary steps owes nothing either — a spark and an ordinary red are not reversals',
      reversalBuilt &&
        ok(() => {
          const steps = [
            { personEventId: 'a', from: 'AMBER', to: 'GREEN', spark: true },
            { personEventId: 'b', from: 'AMBER', to: 'RED', spark: false },
          ];
          return RP.stickyReversals(steps).length === 0;
        })
    );
    assert(
      'layer 1d / overlay',
      'and a replay carrying a reversal owes EXACTLY that person — not the spark beside it, not the red beside it',
      reversalBuilt &&
        ok(() => {
          const steps = [
            { personEventId: 'a', from: 'AMBER', to: 'GREEN', spark: true },
            { personEventId: 'b', from: 'AMBER', to: 'RED', spark: false },
            { personEventId: 'pe-out', from: 'GREEN', to: 'OUT', spark: false },
          ];
          const owed = RP.stickyReversals(steps);
          return owed.length === 1 && owed[0] === 'pe-out';
        })
    );

    // THE COMPOSITION, not a hand-built step whose ends happen to match. The reversal comes out
    // of the real derivation — a row ACCEPTED at `since` and DECLINED now, over a stored
    // attendance NO — so this fails if `deriveReplay` stops producing reversals at all.
    const reversalReplay = built
      ? replayOf(
          glanceOf([outPerson]),
          rewindOf({
            responseAt: new Map([['a-ice', 'ACCEPTED']]),
            attendanceAt: new Map([['pe-out', 'NO']]),
          })
        )
      : null;
    assert(
      'layer 1d / overlay',
      'THE POSITIVE CONTROL — the real derivation produces the reversal (GREEN → OUT), so the two assertions below are about a step that exists',
      built &&
        ok(
          () =>
            reversalReplay.steps.length === 1 &&
            reversalReplay.steps[0].from === 'GREEN' &&
            reversalReplay.steps[0].to === 'OUT' &&
            reversalReplay.steps[0].spark === false
        )
    );
    assert(
      'layer 1d / overlay',
      'and `stickyReversals` names that person off the DERIVED replay — the overlay follows the replay rather than re-deciding who reversed',
      built &&
        reversalBuilt &&
        ok(() => {
          const owed = RP.stickyReversals(reversalReplay.steps);
          return owed.length === 1 && owed[0] === 'pe-out';
        })
    );
    // ⚠ THE INVARIANT THAT KEEPS 6e OUT OF THIS. `GlanceLive` reads its baseline off
    // `data-strip-state`, and an overlaid strip carries RED where the poll route (which is
    // viewer-agnostic) will answer OUT. That would be a spurious quiet flip, owing Ruling 30's
    // debt for a change nobody made. It cannot happen: an overlay exists only when the replay
    // is non-empty, and the island does not arm until the replay is done — at which point the
    // overlay has been stamped away.
    assert(
      'layer 1d / 6e boundary',
      'AN OVERLAY IMPLIES A PENDING REPLAY — so the live island never arms on an overlaid board and never reads RED as its baseline',
      reversalBuilt &&
        ok(() => {
          const steps = [{ personEventId: 'pe-out', from: 'GREEN', to: 'OUT', spark: false }];
          return (
            RP.stickyReversals(steps).length > 0 &&
            steps.length > 0 &&
            RP.stickyReversals([]).length === 0
          );
        })
    );

    // ── THE OVERLAY ITSELF — ONE FIELD, ON TOP OF THE ORDINARY DERIVATION ─
    assert(
      'layer 1d / Ruling 23',
      'THE OVERLAY CHANGES EXACTLY ONE FIELD — `state` becomes RED and every other key is byte-identical, which is what "an overlay ON TOP OF the ordinary derivation" means mechanically',
      overlayBuilt &&
        ok(() => {
          const on = ST.overlayReversal(outPerson);
          if (on.state !== 'RED') return false;
          const keys = new Set([...Object.keys(outPerson), ...Object.keys(on)]);
          for (const k of keys) {
            if (k === 'state') continue;
            if ((on as any)[k] !== (outPerson as any)[k]) return false;
          }
          return keys.size === Object.keys(outPerson).length;
        })
    );
    assert(
      'layer 1d / Ruling 23',
      'and it does NOT touch `reasons` — the why is the person’s own ATTENDANCE_NO, not a reason the overlay invented for her',
      overlayBuilt &&
        ok(() => {
          const on = ST.overlayReversal(outPerson);
          return (
            on.reasons.length === 1 &&
            on.reasons[0] === 'ATTENDANCE_NO' &&
            outPerson.reasons.length === 1 &&
            outPerson.reasons[0] === 'ATTENDANCE_NO'
          );
        })
    );
    assert(
      'layer 1d / Ruling 23',
      'IT DOES NOT MUTATE — the person handed in still reads OUT afterwards, so the ordinary derivation cannot be edited by rendering',
      overlayBuilt &&
        ok(() => {
          ST.overlayReversal(outPerson);
          return outPerson.state === 'OUT';
        })
    );
    // ⭐ THE DIFFERENTIAL THIS LAYER EXISTS FOR. Ruling 23: "never a write... what is revealed
    // is whatever the person's state already derives to underneath." Underneath is
    // `derivePersonState`, and it must still say OUT on the very inputs the overlay is showing
    // as RED. A "settling" implemented by editing the derivation fails this and nothing else.
    assert(
      'layer 1d / Ruling 23',
      '⭐ THE DERIVATION UNDERNEATH IS UNTOUCHED — the same person derives to OUT while the overlay displays RED, so lifting reveals the ordinary answer rather than a fourth colour',
      overlayBuilt &&
        SS !== null &&
        ok(() => {
          const underneath = SS.derivePersonState(
            {
              isHost: false,
              exhaustion: null,
              nudgeMark: null,
              attendanceAnswer: 'NO',
              items: [
                {
                  itemId: 'i-ice',
                  assignmentId: 'a-ice',
                  name: 'The ice',
                  critical: true,
                  response: 'DECLINED',
                  kind: 'ITEM',
                  teamId: 't1',
                  item: { dropOffAt: null, decideByOffsetHours: null },
                },
              ],
            },
            event,
            NOW
          );
          return underneath.state === 'OUT' && ST.overlayReversal(outPerson).state === 'RED';
        })
    );

    // ── RULING 6's "RED WITH ITS WHY" ────────────────────────────────────
    assert(
      'layer 1d / Ruling 6',
      'THE OVERLAID STRIP CARRIES ITS WHY — "was in, now out", the reference’s own words for Uncle Ray’s fade',
      overlayBuilt && ok(() => ST.whyLineFor(ST.overlayReversal(outPerson)) === 'was in, now out')
    );
    assert(
      'layer 1d / Ruling 4',
      'and it fits the strip — 16 characters is the cap the browser walk set, and this is inside it',
      overlayBuilt && ok(() => (ST.whyLineFor(ST.overlayReversal(outPerson)) ?? '').length <= 16)
    );
    assert(
      'layer 1d / Ruling 6',
      'the words render through the SAME `stripStateWords` the island suppresses and reveals — not a second way of writing a strip’s words',
      overlayBuilt &&
        ok(() => ST.stripStateWords(ST.overlayReversal(outPerson)) === '— was in, now out')
    );
    // The why is produced by the OVERLAY, not by the state. Without this the branch could be
    // satisfied by an OUT person growing a why-line, which Ruling 7 refuses ("— out" carries it).
    assert(
      'layer 1d / Ruling 7',
      'AND THE UNOVERLAID PERSON STILL READS "— out" WITH NO WHY — Ruling 7’s fade is intact, and the why arrives with the overlay rather than with the state',
      overlayBuilt &&
        ok(() => ST.whyLineFor(outPerson) === null && ST.stripStateWords(outPerson) === '— out')
    );

    // ── RULING 30 IS UNTOUCHED, AND IT REACHES THIS BY CONSTRUCTION ──────
    //
    // The brief's question: is a settling reversal a spark or a quiet change, and does it owe
    // debt? It is quiet, it owes, and NOTHING WAS BUILT TO MAKE THAT TRUE. The classifier is
    // `!flip.spark` and the spark rule is `isSparkTransition`, which is AMBER → GREEN and
    // nothing else — so no transition INTO OUT can ever spark, and any reversal that repaints
    // live is a non-spark that sets the debt. Asserted rather than argued.
    assert(
      'layer 1d / Ruling 30',
      'A REVERSAL CAN NEVER SPARK — no transition into OUT is AMBER → GREEN, from any of the five states',
      built &&
        ok(() =>
          ['RED', 'AMBER', 'GREEN', 'NOT_CHASED', 'OUT'].every(
            (from) => RP.isSparkTransition(from, 'OUT') === false
          )
        )
    );
    assert(
      'layer 1d / Ruling 30',
      'SO A SETTLING REVERSAL THAT REPAINTS LIVE OWES THE QUIET DEBT — one non-spark flip, no stamp, debt set, with no second classifier written for it',
      built &&
        liveBuilt &&
        ok(() => {
          const d = LV.liveStampDecision(
            [{ personEventId: 'pe-out', from: 'GREEN', to: 'OUT', spark: false }],
            false
          );
          return d.stamp === false && d.quietDebtAfter === true;
        })
    );
    assert(
      'layer 1d / Ruling 30',
      'and a spark landing behind it still does not stamp — the debt a reversal set suppresses the stamp exactly as any other quiet change does',
      built &&
        liveBuilt &&
        ok(() => {
          const first = LV.liveStampDecision(
            [{ personEventId: 'pe-out', from: 'GREEN', to: 'OUT', spark: false }],
            false
          );
          const second = LV.liveStampDecision(
            [{ personEventId: 'x', from: 'AMBER', to: 'GREEN', spark: true }],
            first.quietDebtAfter
          );
          return second.stamp === false && second.quietDebtAfter === true;
        })
    );

    // ══ LAYER 1e — THE LIVE DIFF (SLICE 6e), PURE ════════════════════════
    //
    // Ruling 10's ~20-second poll, as a function. The live half needs NO LEDGER AT ALL and
    // this block is where that is proved: `diffLive` takes two payloads and nothing else — no
    // rewind, no `since`, no AuditEntry, no clock. The rewind machinery is ARRIVAL-ONLY.
    //
    // ⚠ AND THAT IS NOT RULING 28's BUG RETURNING, WHICH IS WHY IT IS WRITTEN DOWN HERE AS
    // WELL AS AT THE MODULE. Ruling 28 forbids inferring a GUEST'S CHANGE from a difference
    // between two states nobody watched. The live diff infers something else and weaker: what
    // THIS VIEWER WAS SHOWN CHANGE, between a board she was looking at and the board that
    // replaced it under her eyes. The showing is the positive evidence, and it is evidence the
    // rewind can never have.
    assert(
      'layer 1e / live',
      'THE LIVE MODULE EXISTS — every 6e assertion is anded with this, so "absent" cannot read as "correct"',
      liveBuilt
    );
    assert(
      'layer 1e / Ruling 10',
      'GLANCE_POLL_MS is 20000 — Ruling 10’s "roughly every 20 seconds", taken literally and named once',
      liveBuilt && ok(() => LV.GLANCE_POLL_MS === 20000)
    );

    // ⭐ THE ONE-LINE BUG THIS SLICE IS MOST LIKELY TO SHIP, ASSERTED AS ITS OWN NAMED PAIR.
    //
    // The diff's baseline must be the board the replay RESOLVED TO, not the board it OPENED
    // ON. The two assertions below are a differential: the first shows the right baseline
    // yields silence, the second shows the WRONG baseline reproduces the replay's own steps —
    // so the failure is demonstrated rather than merely forbidden. A single "it is empty"
    // assertion would pass against a `diffLive` that always returned nothing.
    const pastStates = liveBuilt && built ? new Map<string, any>() : null;
    if (pastStates && mixed) for (const s of mixed.steps) pastStates.set(s.personEventId, s.from);
    assert(
      'layer 1e / baseline',
      '⭐ THE BASELINE IS THE BOARD THE REPLAY RESOLVED TO — diffing it against itself yields ZERO flips, so the first poll re-sparks NOTHING',
      liveBuilt &&
        built &&
        ok(() => {
          const resolved = LV.liveStates(mixedResolved);
          return mixed.steps.length === 2 && LV.diffLive(resolved, resolved).length === 0;
        })
    );
    assert(
      'layer 1e / baseline',
      '⭐ and the WRONG baseline is shown to be wrong — the past board the replay opened on reproduces the replay’s own steps, which is the bug named',
      liveBuilt &&
        built &&
        ok(() => {
          const wrong = LV.diffLive(pastStates!, LV.liveStates(mixedResolved));
          return (
            mixed.steps.length === 2 &&
            wrong.length === 2 &&
            wrong.some((f: any) => f.personEventId === 'pe-good' && f.spark === true) &&
            wrong.some((f: any) => f.personEventId === 'pe-reversal' && f.to === 'OUT')
          );
        })
    );

    // ── What sparks, live. Ruling 26's boundary, carried across. ─────────
    //
    // ⚠ THE FILTER IS NOT CARRIED ACROSS, AND ONLY THE SPARK IS. `deriveReplay` DROPS every
    // step that is not GREEN / RED / reversal, because the server-rendered board underneath is
    // already the truth. LIVE HAS NO SUCH UNDERNEATH — the DOM is the OLD board — so dropping
    // a GREEN → AMBER would freeze a strip on good news that is no longer true. That is
    // manufactured good news, the one failure Ruling 28 says this feature cannot have. So live
    // APPLIES every change and SPARKS only AMBER → GREEN.
    const bothWays =
      liveBuilt && ok(() => true)
        ? (() => {
            const prev = new Map<string, any>([
              ['pe1', 'AMBER'],
              ['pe2', 'GREEN'],
              ['pe3', 'AMBER'],
              ['pe4', 'RED'],
            ]);
            const next = new Map<string, any>([
              ['pe1', 'GREEN'],
              ['pe2', 'AMBER'],
              ['pe3', 'RED'],
              ['pe4', 'GREEN'],
            ]);
            return LV.diffLive(prev, next);
          })()
        : null;
    assert(
      'layer 1e / Ruling 26',
      'every live change is APPLIED — a GREEN → AMBER flips the strip back, because live has no true board underneath to fall through to',
      liveBuilt &&
        ok(
          () =>
            bothWays.length === 4 &&
            bothWays.some((f: any) => f.personEventId === 'pe2' && f.to === 'AMBER')
        )
    );
    assert(
      'layer 1e / Ruling 26',
      'but only AMBER → GREEN SPARKS — the flourish is the spark and only the spark, asserted against three non-sparking flips in the same diff',
      liveBuilt &&
        ok(() => {
          const sparks = bothWays.filter((f: any) => f.spark);
          return bothWays.length === 4 && sparks.length === 1 && sparks[0].personEventId === 'pe1';
        })
    );
    assert(
      'layer 1e / one definition',
      'and the spark rule has ONE definition — the live diff asks the same predicate deriveReplay does, so the two cannot drift',
      liveBuilt &&
        built &&
        ok(() => typeof RP.isSparkTransition === 'function') &&
        !/'AMBER'\s*&&|===\s*'GREEN'/.test(
          code('src/lib/glance/live.ts').replace(/isSparkTransition/g, '')
        )
    );
    assert(
      'layer 1e / no-op',
      'a person whose state did not move produces NO flip — the no-op rule, live',
      liveBuilt &&
        ok(() => {
          const same = new Map<string, any>([['pe1', 'RED']]);
          return LV.diffLive(same, new Map(same)).length === 0;
        })
    );
    assert(
      'layer 1e / membership',
      'a person who APPEARS between polls is not a flip, and one who LEAVES is not either — a diff can only speak about strips that were on the board',
      liveBuilt &&
        ok(() => {
          const prev = new Map<string, any>([['pe1', 'AMBER']]);
          const next = new Map<string, any>([
            ['pe1', 'AMBER'],
            ['pe-new', 'GREEN'],
          ]);
          return LV.diffLive(prev, next).length === 0 && LV.diffLive(next, prev).length === 0;
        })
    );
    assert(
      'layer 1e / allowlist',
      'a live flip’s keys are EXACTLY {personEventId, from, to, spark} — the replay step’s own allowlist, so nothing can ride along on the live carrier either',
      liveBuilt &&
        ok(() => {
          const flips = LV.diffLive(new Map([['pe1', 'AMBER']]), new Map([['pe1', 'GREEN']]));
          return (
            flips.length === 1 &&
            JSON.stringify(Object.keys(flips[0]).sort()) ===
              JSON.stringify(['from', 'personEventId', 'spark', 'to'])
          );
        })
    );
    assert(
      'layer 1e / no time',
      'and it carries NO TIMESTAMP — no ISO-shaped string and no epoch-shaped number anywhere in a live diff, at any depth',
      liveBuilt &&
        ok(() => {
          const flips = LV.diffLive(new Map([['pe1', 'AMBER']]), new Map([['pe1', 'GREEN']]));
          const scalars = collectScalars(flips);
          return (
            flips.length === 1 &&
            !scalars.some((v) => typeof v === 'string' && ISO_LIKE.test(v)) &&
            !scalars.some((v) => typeof v === 'number' && v > EPOCH_FLOOR)
          );
        })
    );
    assert(
      'layer 1e / states',
      'liveStates reads the WHOLE board — housed and unhoused alike, keyed by personEventId',
      liveBuilt &&
        ok(() => {
          const g = glanceOf([gPerson({ personEventId: 'pe-h', state: 'RED' })]);
          g.unhoused = [gPerson({ personEventId: 'pe-u', state: 'AMBER' })];
          const states = LV.liveStates(g);
          return (
            states.size === 2 && states.get('pe-h') === 'RED' && states.get('pe-u') === 'AMBER'
          );
        })
    );

    // ── RULING 30 (2026-09-10) — THE QUIET DEBT ─────────────────────────
    //
    // "A live spark stamps ONLY IF no non-spark change has repainted since the last stamp."
    //
    // ⚠ WHY THE RULE EXISTS, BECAUSE THE MECHANISM IS THE WHOLE ARGUMENT. `glanceSeenAt` is a
    // SINGLE INSTANT, not a per-person cursor. So a spark's stamp moves the high-water mark
    // past EVERYTHING behind it — including a red or a reversal that repainted quietly and
    // stamped nothing of its own. That red is then gone from tomorrow's rewind, silently: 6b's
    // own named failure ("silently, with no way to know what she missed") arriving through a
    // door that ruling did not consider. **Losing news is the one failure this screen cannot
    // have.**
    //
    // ⚠ RULING 24 STANDS. This narrows WHEN the stamp fires, not what the mark MEANS. It is
    // still the high-water mark of news this viewer has been shown; the debt says that a
    // spark's stamp would carry more than the spark past it.
    //
    // ⚠ AND THE DECISION IS PURE, ON PURPOSE. Every other way of writing this — a boolean read
    // inside an effect, a condition spelled out at the call site — is a rule that can only be
    // exercised in a browser, and this ticket has caught that confusion in three slices. Here
    // the rule is a function over (what painted, what is owed) and the island's only say in it
    // is to call it.
    // Built inside a try, so a MISSING export reads as a failed assertion rather than as a
    // crashed run — the same reason `ok()` exists. A fixture that throws takes the whole suite
    // with it, and a suite that cannot report its RED is not a RED.
    const debtCases = ((): any => {
      try {
        return !liveBuilt
          ? null
          : {
              sparkNoDebt: LV.liveStampDecision(
                [{ personEventId: 'pe1', from: 'AMBER', to: 'GREEN', spark: true }],
                false
              ),
              sparkWithDebt: LV.liveStampDecision(
                [{ personEventId: 'pe1', from: 'AMBER', to: 'GREEN', spark: true }],
                true
              ),
              sparkAndQuietSameTick: LV.liveStampDecision(
                [
                  { personEventId: 'pe1', from: 'AMBER', to: 'GREEN', spark: true },
                  { personEventId: 'pe2', from: 'AMBER', to: 'RED', spark: false },
                ],
                false
              ),
              quietAlone: LV.liveStampDecision(
                [{ personEventId: 'pe2', from: 'AMBER', to: 'RED', spark: false }],
                false
              ),
              nothingPainted: LV.liveStampDecision([], false),
              nothingPaintedWithDebt: LV.liveStampDecision([], true),
            };
      } catch {
        return null;
      }
    })();

    assert(
      'layer 1e / Ruling 30',
      '⭐ A QUIET CHANGE OWES A DEBT, AND A SPARK BEHIND IT DOES NOT STAMP — asserted as a DIFFERENTIAL: the identical spark stamps with no debt and does not stamp with one',
      liveBuilt &&
        ok(() => debtCases.sparkNoDebt.stamp === true && debtCases.sparkWithDebt.stamp === false)
    );
    assert(
      'layer 1e / Ruling 30',
      '⭐ and the SAME TICK is the case that matters most — a red landing beside a spark suppresses it, whichever order the diff put them in',
      liveBuilt &&
        ok(
          () =>
            debtCases.sparkAndQuietSameTick.stamp === false &&
            debtCases.sparkAndQuietSameTick.quietDebtAfter === true
        )
    );
    assert(
      'layer 1e / Ruling 30',
      'a quiet change alone stamps nothing and OWES the debt — it is the thing the next spark must not carry past the mark',
      liveBuilt &&
        ok(
          () => debtCases.quietAlone.stamp === false && debtCases.quietAlone.quietDebtAfter === true
        )
    );
    assert(
      'layer 1e / Ruling 30',
      'the debt PERSISTS across polls until a stamp actually happens — "since the last stamp" is not "in this tick"',
      liveBuilt &&
        ok(
          () =>
            debtCases.sparkWithDebt.quietDebtAfter === true &&
            debtCases.nothingPaintedWithDebt.quietDebtAfter === true
        )
    );
    assert(
      'layer 1e / Ruling 30',
      'and a stamp CLEARS it — the mark has just moved, so nothing is owed behind it any more',
      liveBuilt &&
        ok(
          () =>
            debtCases.sparkNoDebt.stamp === true && debtCases.sparkNoDebt.quietDebtAfter === false
        )
    );
    assert(
      'layer 1e / Ruling 30',
      'a poll that painted NOTHING neither stamps nor owes — the no-op rule reaches the mark as well as the board',
      liveBuilt &&
        ok(
          () =>
            debtCases.nothingPainted.stamp === false &&
            debtCases.nothingPainted.quietDebtAfter === false
        )
    );
    assert(
      'layer 1e / Ruling 30',
      'the decision reads WHAT PAINTED, not what the diff found — a flip whose strip was not on the board neither sparks nor owes',
      liveBuilt &&
        ok(() => {
          // The island hands it only the flips it actually painted; the empty case IS that
          // path, and it must not manufacture a debt out of a diff nobody saw.
          const seen = LV.liveStampDecision([], false);
          return seen.stamp === false && seen.quietDebtAfter === false;
        })
    );
    assert(
      'layer 1e / Ruling 30',
      'and its answer is exactly two keys — {stamp, quietDebtAfter}; nothing rides along on the decision either',
      liveBuilt &&
        ok(
          () =>
            JSON.stringify(Object.keys(debtCases.sparkNoDebt).sort()) ===
            JSON.stringify(['quietDebtAfter', 'stamp'])
        )
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

    // ── RULING 30's SECOND HALF, AT RUNTIME ──────────────────────────────
    //
    // The ruling's own assertion is in two parts: *"a quiet red repaints, then a spark fires,
    // and glanceSeenAt does NOT move. Then the red still plays on the next arrival."*
    //
    // ⚠ WHICH HALF THIS IS, SAID PLAINLY. The FIRST half — a spark declining to stamp — is a
    // browser behaviour and is NOT proved here: it is proved as a pure decision at layer 1e, as
    // a structural fact at layer 4e, and as a MEASUREMENT in the ticket's walk. This is the
    // SECOND half, and it is the one that makes the rule worth having: **if the mark does not
    // move, the news is still owed, and the next arrival plays it.** That is a claim about the
    // server, and the server is right here.
    //
    // It is asserted as a REPEAT rather than as a single read: the same board is fetched twice
    // with the mark untouched in between, and both loads must carry the same pending step. A
    // single load would prove only that a replay derives at all.
    const playRes2 = await fetch(`${BASE}/plan/${playEvent.id}/glance`, { headers: HOST_COOKIE });
    const playHtml2 = playRes2.status === 200 ? await playRes2.text() : '';
    const playMark2 = await markOf(hostUser.id, playEvent.id);
    assert(
      'layer 3 / Ruling 30',
      '⭐ AN UNMOVED MARK MEANS THE NEWS IS STILL OWED — the same board, loaded again with glanceSeenAt untouched, STILL carries the same step to play',
      serverUp &&
        playRes.status === 200 &&
        playRes2.status === 200 &&
        /data-glance-replay="1"/.test(playHtml) &&
        /data-glance-replay="1"/.test(playHtml2) &&
        playMark2 !== null &&
        playMark2.getTime() === playSince.getTime()
    );

    // ── 6d: RULING 23's OVERLAY, PER VIEWER, ON THE PAGE SHE ACTUALLY GETS ──
    //
    // Ruling 20: "A reversal the host has watched settle stays sticky red for the co-host until
    // she watches it too... one-per-event would let whoever opens first silently consume the
    // other's news." Two `EventRole` rows on ONE event, exactly as 6b proved the stamp.
    //
    // ⚠ THE STAMP IS DRIVEN THROUGH THE REAL ROUTE, not written by hand. The completion POST is
    // what the island fires when the last beat ends, so "the host watched it" is expressed the
    // way the product expresses it. A hand-set `glanceSeenAt` would be this fixture asserting
    // its own model of how the mark moves — the failure the standing warning names.
    //
    // ⚠ AND THE BEFORE STATE IS TAKEN FIRST, AS A POSITIVE CONTROL. "The co-host is red" is
    // trivially true of a board where everyone is red and of a page that failed to render; it
    // means something only against the same strip reading OUT for the other viewer, on the same
    // board, in the same second.
    const COHOST_COOKIE = await sessionFor(cohostUser.id);

    /** One strip's own markup, from its element's `<` to its own closing tag. */
    const stripHtmlFor = (html: string, personEventId: string): string => {
      const at = html.indexOf(`data-person-event-id="${personEventId}"`);
      if (at < 0) return '';
      const start = html.lastIndexOf('<', at);
      const endDiv = html.indexOf('</div>', at);
      const endBtn = html.indexOf('</button>', at);
      const end =
        endBtn >= 0 && (endDiv < 0 || endBtn < endDiv)
          ? endBtn + '</button>'.length
          : endDiv + '</div>'.length;
      return end > start ? html.slice(start, end) : '';
    };

    const revGuest = await prisma.person.create({
      data: { name: `${TAG} RevGuest`, email: `${TAG}-rev@example.com` },
    });
    createdPersonIds.push(revGuest.id);
    const revEvent = await prisma.event.create({
      data: {
        name: `${TAG} reversal fixture`,
        startDate: new Date(Date.now() + 100 * HOUR),
        endDate: new Date(Date.now() + 130 * HOUR),
        hostId: stampPerson.id,
        status: 'CONFIRMING',
        sentAt: new Date(Date.now() - 10 * DAY),
      },
    });
    createdEventIds.push(revEvent.id);
    const revSince = new Date(Date.now() - 2 * HOUR);
    await prisma.eventRole.create({
      data: { userId: hostUser.id, eventId: revEvent.id, role: 'HOST', glanceSeenAt: revSince },
    });
    await prisma.eventRole.create({
      data: { userId: cohostUser.id, eventId: revEvent.id, role: 'COHOST', glanceSeenAt: revSince },
    });
    // The degenerate attendance case, answered outright and BEFORE the anchor — the only way a
    // stored NO can sit under an accepted row, and the same shape the demo board uses. Answered
    // inside the window it would mark him ambiguous and the replay would drop him.
    const revMembership = await prisma.personEvent.create({
      data: {
        personId: revGuest.id,
        eventId: revEvent.id,
        role: 'PARTICIPANT',
        sentAt: new Date(Date.now() - 10 * DAY),
        attendanceAnswer: 'NO',
      },
    });
    await prisma.auditEntry.create({
      data: {
        eventId: revEvent.id,
        actorId: revGuest.id,
        actionType: 'ANSWER_ATTENDANCE',
        targetType: 'PersonEvent',
        targetId: revMembership.id,
        details: '',
        timestamp: new Date(Date.now() - 9 * DAY),
      },
    });
    const revTeam = await prisma.team.create({
      data: { eventId: revEvent.id, name: `${TAG} RevMains` },
    });
    // CRITICAL, deliberately. Ruling 6: "criticals among them surface in the alert strip." The
    // ordinary half of the widened predicate is proved in `test:glance-read`; this is the half
    // the ruling names, and it is proved on the page rather than on the payload.
    const revItem = await prisma.item.create({
      data: { teamId: revTeam.id, name: `${TAG} the glazed ham`, kind: 'ITEM', critical: true },
    });
    const revAssignment = await prisma.assignment.create({
      data: {
        itemId: revItem.id,
        personId: revGuest.id,
        response: 'DECLINED',
        createdAt: new Date(Date.now() - 6 * DAY),
      },
    });
    await prisma.auditEntry.create({
      data: {
        eventId: revEvent.id,
        actorId: revGuest.id,
        actionType: 'ACCEPT_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: revAssignment.id,
        details: '',
        timestamp: new Date(Date.now() - 5 * DAY),
      },
    });
    await prisma.auditEntry.create({
      data: {
        eventId: revEvent.id,
        actorId: revGuest.id,
        actionType: 'DECLINE_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: revAssignment.id,
        details: '',
        timestamp: new Date(Date.now() - 1 * HOUR),
      },
    });

    /** Everything about this board that is NOT the mark, so "no write" is a diff and not a claim. */
    const revDump = async () => {
      const [a, pe, item, audits] = await Promise.all([
        prisma.assignment.findFirst({
          where: { id: revAssignment.id },
          select: { id: true, personId: true, response: true, itemId: true },
        }),
        prisma.personEvent.findFirst({
          where: { id: revMembership.id },
          select: { id: true, attendanceAnswer: true, nudgeMark: true, teamId: true },
        }),
        prisma.item.findFirst({
          where: { id: revItem.id },
          select: { id: true, critical: true, status: true, name: true },
        }),
        prisma.auditEntry.count({ where: { eventId: revEvent.id } }),
      ]);
      return JSON.stringify({ a, pe, item, audits });
    };

    const revUrl = `${BASE}/plan/${revEvent.id}/glance`;
    const dumpBefore = await revDump();
    const hostBefore = await fetch(revUrl, { headers: HOST_COOKIE });
    const hostHtmlBefore = hostBefore.status === 200 ? await hostBefore.text() : '';
    const cohostBefore = await fetch(revUrl, { headers: COHOST_COOKIE });
    const cohostHtmlBefore = cohostBefore.status === 200 ? await cohostBefore.text() : '';
    const hostStripBefore = stripHtmlFor(hostHtmlBefore, revMembership.id);
    const cohostStripBefore = stripHtmlFor(cohostHtmlBefore, revMembership.id);

    const bothRendered = serverUp && hostBefore.status === 200 && cohostBefore.status === 200;
    assert(
      'layer 3 / 6d',
      'THE POSITIVE CONTROL — both viewers get the board (200) and both are owed the reversal, so the island is on both pages',
      bothRendered &&
        /data-glance-replay="1"/.test(hostHtmlBefore) &&
        /data-glance-replay="1"/.test(cohostHtmlBefore)
    );
    assert(
      'layer 3 / Ruling 6',
      'AN UNPLAYED REVERSAL READS STICKY RED, WITH ITS WHY — the strip carries data-strip-state="RED" and "— was in, now out", on the page the host actually receives',
      bothRendered &&
        /data-strip-state="RED"/.test(hostStripBefore) &&
        /— was in, now out/.test(hostStripBefore)
    );
    assert(
      'layer 3 / Ruling 17',
      'and it is a DOOR, like every other red — "only a red is a door" stays true in both directions under the overlay',
      bothRendered && /^<button/.test(hostStripBefore) && /data-strip-door/.test(hostStripBefore)
    );
    assert(
      'layer 3 / Ruling 6',
      'the co-host reads the same red at the same instant — before either has watched, the news is owed to both',
      bothRendered &&
        /data-strip-state="RED"/.test(cohostStripBefore) &&
        /— was in, now out/.test(cohostStripBefore)
    );

    // ── THE HOST WATCHES IT. The real completion POST, not a hand-set mark. ──
    const revStamp = await postSeen(revEvent.id, HOST_COOKIE);
    const hostMarkRev = await markOf(hostUser.id, revEvent.id);
    const cohostMarkRev = await markOf(cohostUser.id, revEvent.id);
    assert(
      'layer 3 / 6d',
      'the host’s replay completes and stamps — 200, and her mark moves off the anchor',
      serverUp &&
        revStamp.status === 200 &&
        hostMarkRev !== null &&
        hostMarkRev.getTime() > revSince.getTime()
    );
    assert(
      'layer 3 / Ruling 20',
      'and the CO-HOST’s mark did not move — the stamp is per viewer, so her news is not consumed by the host watching',
      serverUp &&
        hostMarkRev !== null &&
        hostMarkRev.getTime() > revSince.getTime() &&
        cohostMarkRev !== null &&
        cohostMarkRev.getTime() === revSince.getTime()
    );

    const hostAfter = await fetch(revUrl, { headers: HOST_COOKIE });
    const hostHtmlAfter = hostAfter.status === 200 ? await hostAfter.text() : '';
    const cohostAfter = await fetch(revUrl, { headers: COHOST_COOKIE });
    const cohostHtmlAfter = cohostAfter.status === 200 ? await cohostAfter.text() : '';
    const hostStripAfter = stripHtmlFor(hostHtmlAfter, revMembership.id);
    const cohostStripAfter = stripHtmlFor(cohostHtmlAfter, revMembership.id);
    const bothRenderedAfter = serverUp && hostAfter.status === 200 && cohostAfter.status === 200;

    assert(
      'layer 3 / Ruling 23',
      'PLAYED → THE OVERLAY LIFTS: the host’s strip now reads OUT with "— out", which is exactly what the ordinary derivation gives — no fourth colour',
      // GATED ON THE BEFORE. "It reads OUT" is trivially true of a board with no overlay at
      // all, which is what it read at RED. The pair — RED before, OUT after, same strip, same
      // viewer — is the assertion; either half alone is worthless.
      /data-strip-state="RED"/.test(hostStripBefore) &&
        bothRenderedAfter &&
        /data-strip-state="OUT"/.test(hostStripAfter) &&
        /— out</.test(hostStripAfter) &&
        !/was in, now out/.test(hostStripAfter)
    );
    assert(
      'layer 3 / Ruling 23',
      'and the settled strip is a plain <div> again — no door, because the state underneath is OUT and Ruling 17 seals it',
      // Gated on the door having been there. At RED there is no door on any reversal, so
      // "there is no door now" was trivially true.
      /^<button/.test(hostStripBefore) &&
        bothRenderedAfter &&
        /^<div/.test(hostStripAfter) &&
        !/data-strip-door/.test(hostStripAfter)
    );
    assert(
      'layer 3 / Ruling 6',
      'her board also has nothing left to play — the replay is empty, which is what "once played, it settles" means for the next arrival',
      bothRenderedAfter && !/data-glance-replay="1"/.test(hostHtmlAfter)
    );
    // ⭐ THE RULING 20 CASE, AND IT IS THE INTERESTING ONE.
    assert(
      'layer 3 / Ruling 20',
      '⭐ ONE BOARD, TWO VIEWERS, TWO DIFFERENT REDS — the overlay lifted for the host who watched it and STAYED for the co-host who has not',
      bothRendered &&
        bothRenderedAfter &&
        /data-strip-state="RED"/.test(hostStripBefore) &&
        /data-strip-state="OUT"/.test(hostStripAfter) &&
        /data-strip-state="RED"/.test(cohostStripAfter) &&
        /— was in, now out/.test(cohostStripAfter) &&
        /data-glance-replay="1"/.test(cohostHtmlAfter)
    );

    // ── WHAT THE OVERLAY MUST NOT REACH, AS A TWO-VIEWER DIFFERENTIAL ────
    //
    // ⚠ THIS IS WHERE THE REAL GUARD LIVES, AND IT IS HERE BECAUSE MUTATION (e) SURVIVED
    // `test:glance-grid`. The grid suite compares an overlaid render with an unoverlaid one and
    // asserts the summary and the assistant's message are identical — but `GlanceBoard` never
    // RECOMPUTES the summary, so that half could not fail however wrong the code was. Here the
    // two boards are two real pages for two real viewers, one of whom is overlaid and one of
    // whom is not, and the payload behind them is the same event. If the overlay reached the
    // payload rather than the strip, the co-host's summary would count him among "N need you"
    // and §3's assistant message would name his critical for her and not for the host.
    assert(
      'layer 3 / Ruling 2',
      // ⚠ WHAT THIS CATCHES AND WHAT IT DOES NOT, MEASURED RATHER THAN ASSUMED. It does NOT
      // catch an overlay applied inside `GlanceBoard` — mutation (e) was run against it and it
      // stayed green, because the board renders `glance.summary` and never recomputes it, so no
      // board-level change can move the sentence. What it DOES catch is the overlay pushed down
      // into the DERIVATION, which is the thing Ruling 23 actually forbids: mutation (i) makes a
      // reversed person derive RED and this fails with eleven others. Recorded at the site so
      // the next reader does not take it for a wider guard than it is.
      '⭐ THE SUMMARY SENTENCE IS THE SAME FOR BOTH VIEWERS — the overlay is a strip, not a person state, so it never changes how many people need her',
      bothRenderedAfter &&
        /data-strip-state="RED"/.test(cohostStripAfter) &&
        /data-strip-state="OUT"/.test(hostStripAfter) &&
        ok(() => {
          const summaryOf = (html: string) => {
            const at = html.indexOf('data-summary="');
            if (at < 0) return '';
            const end = html.indexOf('"', at + 14);
            return end < 0 ? '' : html.slice(at, end);
          };
          const h = summaryOf(hostHtmlAfter);
          return h.length > 0 && h === summaryOf(cohostHtmlAfter);
        })
    );
    assert(
      'layer 3 / §3',
      '⭐ AND SO IS THE ASSISTANT’S MESSAGE — he holds a critical red row, so an overlay that reached the payload would name it to the co-host and not to the host; neither is named',
      bothRenderedAfter &&
        /data-strip-state="RED"/.test(cohostStripAfter) &&
        !/data-assistant-message/.test(hostHtmlAfter) &&
        !/data-assistant-message/.test(cohostHtmlAfter)
    );

    // ── "FALL LOOSE", AND IT IS NOT PER VIEWER ───────────────────────────
    //
    // Ruling 23's second half keys on "rows held by a reversed person", not on a reversal this
    // viewer has seen — so it is a fact about the board and both viewers read it the same. That
    // also keeps `readEventGlance` viewer-agnostic, which is what lets 6e's poll refresh from it.
    assert(
      'layer 3 / Ruling 23',
      'THE CRITICAL HE HELD IS LOOSE — it is named in the alert strip above the grid, which is Ruling 6’s "criticals among them surface in the alert strip"',
      bothRenderedAfter &&
        new RegExp(`data-critical-strip="[^"]*${TAG} the glazed ham`).test(hostHtmlAfter)
    );
    assert(
      'layer 3 / Ruling 23',
      'and the co-host sees it loose too — the fall-loose half is a fact about the board, not about who has looked',
      bothRenderedAfter &&
        new RegExp(`data-critical-strip="[^"]*${TAG} the glazed ham`).test(cohostHtmlAfter)
    );
    const revRowAfter = await prisma.assignment.findFirst({
      where: { id: revAssignment.id },
      select: { personId: true, response: true },
    });
    assert(
      'layer 3 / Ruling 23',
      'NO UNASSIGNMENT — the Assignment row still exists, still on him, still DECLINED: "loose" is a reading, not a move',
      // GATED ON THE ROW HAVING GONE LOOSE. "It was not unassigned" is trivially true of a
      // build where nothing falls loose at all, which is what it was at RED.
      new RegExp(`data-critical-strip="[^"]*${TAG} the glazed ham`).test(hostHtmlAfter) &&
        serverUp &&
        revRowAfter?.personId === revGuest.id &&
        revRowAfter?.response === 'DECLINED'
    );
    // Read through the same module both pages read, in process: the row is in BOTH places at
    // once. That is what "no unassignment, no write" costs and buys, and it is asserted rather
    // than left for a later reader to discover.
    const revGlance = RD ? await RD.readEventGlance(prisma, revEvent.id) : null;
    assert(
      'layer 3 / \u00a710.8',
      'and the item is STILL ON HIM in the payload as well as loose in the strip — one Assignment row, read two ways, never moved',
      revGlance !== null &&
        ok(() => {
          const people = [
            ...revGlance.households.flatMap((h: any) => h.members),
            ...revGlance.unhoused,
          ];
          const him = people.find((p: any) => p.personEventId === revMembership.id);
          return (
            !!him &&
            him.items.some((i: any) => i.itemId === revItem.id) &&
            revGlance.unassignedCritical.some((i: any) => i.itemId === revItem.id)
          );
        })
    );

    // ⭐ THE NO-WRITE PROOF, AS A DIFF RATHER THAN AS A CLAIM.
    const dumpAfter = await revDump();
    assert(
      'layer 3 / Ruling 23',
      '⭐ THE SETTLING WROTE NOTHING — Assignment, PersonEvent, Item and the audit count are byte-identical across the whole walk; the only row that moved is the viewer’s own mark',
      // ⚠ GATED ON A SETTLING HAVING HAPPENED. "Nothing was written" is trivially true of a
      // build that settles nothing — it passed at RED until this gate was added, which is the
      // same vacuous shape 6b caught in "the memory NEVER MOVES BACKWARDS". The overlay must
      // have been up and must have come down for the diff to mean anything.
      /data-strip-state="RED"/.test(hostStripBefore) &&
        /data-strip-state="OUT"/.test(hostStripAfter) &&
        bothRendered &&
        bothRenderedAfter &&
        dumpBefore === dumpAfter &&
        dumpBefore.length > 0
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
    /**
     * SLICE 6e — the live island and the shared painters, added to the surface list FIRST.
     *
     * The ordering is the point and it is recorded so it is not undone: a 6e source that is
     * not in this list is exempt from all four guards below at once — it could import the
     * door, start a second interval and self-refresh with everything green. Extending the list
     * is what turns those guards red for the RIGHT reason during the RED run.
     */
    const LIVE_ISLAND = 'src/components/glance/GlanceLive.tsx';
    const PAINT = 'src/components/glance/paint.ts';
    const componentSurfaces = [
      'src/components/glance/GlanceBoard.tsx',
      'src/components/glance/PersonSurface.tsx',
      'src/components/glance/assistant.ts',
      'src/components/glance/strip.ts',
      'src/app/api/events/[id]/glance/route.ts',
      'src/lib/glance/read.ts',
      'src/lib/glance/state.ts',
      'src/lib/glance/actions.ts',
      PAINT,
    ];
    const liveSrc = code(LIVE_ISLAND);
    const paintSrc = code(PAINT);
    const liveIslandBuilt = liveSrc.length > 0 && paintSrc.length > 0;
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
      liveIslandBuilt &&
        [...componentSurfaces, ISLAND, LIVE_ISLAND].every((f) => {
          const src = code(f);
          return src.length > 0 && !/glance\/(rewind|replay-entry)/.test(src);
        })
    );
    // ⚠ NARROWED IN 6e, WITH ITS SUCCESSOR AT THE SITE — and narrowed honestly rather than
    // satisfied by its letter. 6e adds a SECOND pure module (`live.ts`), and the person surface
    // has to know the NAME of the refresh event Ruling 25 requires. The old sentence would have
    // stayed literally true while the property it protects — "the replay derivation is not
    // spread across the board's components" — quietly stopped being asserted about the new one.
    //
    //   was:  EXACTLY ONE component reaches the PURE replay — the island, and nothing else
    //   now:  the pure REPLAY module is reached by exactly one component (the arrival island);
    //         the pure LIVE module is reached by exactly two (the live island, and the person
    //         surface — and the surface takes ONE name from it and nothing else).
    //   and:  this is NOT a held-back guard. It is a widening the slice earns; a later slice
    //         that wants a third reader of either module is making a design change, not a
    //         narrowing, and this assertion is where it has to argue for it.
    assert(
      'layer 4 / no UI',
      'EXACTLY ONE component reaches the PURE REPLAY module — the arrival island, and nothing else on the board',
      islandBuilt &&
        liveIslandBuilt &&
        /glance\/replay['"]/.test(islandSrc) &&
        [...componentSurfaces, LIVE_ISLAND].every((f) => {
          const src = code(f);
          return src.length > 0 && !/glance\/replay['"]/.test(src);
        })
    );
    // ⚠ AND THE LIVE MODULE'S SUCCESSOR IS NOT A HEADCOUNT, BECAUSE A HEADCOUNT IS THE WRONG
    // PROPERTY. Three components legitimately name `live.ts`: the poller, and — for the NAME of
    // an event and nothing else — the person surface (Ruling 25's immediate refresh) and the
    // arrival island (which announces that polling may begin). Counting them would go stale the
    // first time a fourth island wanted an event name, and would say nothing about the thing
    // that matters. What matters is that the DIFF has exactly one reader: two components
    // deciding what a poll means is two definitions of the live board.
    assert(
      'layer 4 / no UI',
      'EXACTLY ONE component reads the LIVE DIFF — the poller; nothing else on the board decides what a poll means',
      liveIslandBuilt &&
        /diffLive|liveStates|GLANCE_POLL_MS/.test(liveSrc) &&
        [...componentSurfaces, ISLAND].every((f) => {
          const src = code(f);
          return src.length > 0 && !/diffLive|liveStates|GLANCE_POLL_MS/.test(src);
        })
    );
    assert(
      'layer 4 / no UI',
      'and the two components that DO name the live module take ONE name each, and it is an event’s — not a decision',
      liveIslandBuilt &&
        ok(() =>
          [
            ['src/components/glance/PersonSurface.tsx', 'GLANCE_REFRESH_EVENT'],
            [ISLAND, 'GLANCE_REPLAY_DONE_EVENT'],
          ].every(([file, name]) => {
            const imported = code(file).match(
              /import\s*\{([^}]*)\}\s*from\s*'@\/lib\/glance\/live'/
            );
            if (imported === null) return false;
            const names = imported[1]
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean);
            return names.length === 1 && names[0] === name;
          })
        )
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
    const allGlanceSurfaces = [...surfaces, ISLAND, LIVE_ISLAND];
    // ⚠ 6c's TIMER GUARD IS RETIRED HERE — THE INTERVAL HALF ONLY, WITH ITS SUCCESSOR AT THIS
    // SITE, EXACTLY AS 6c NAMED IT: "6e retires the interval half when polling lands,
    // deliberately and at this site."
    //
    //   was:  NO SURFACE POLLS — no interval AND no self-refresh anywhere, the island included
    //   now:  split in two, because it was always two claims sharing one regex:
    //           (a) EXACTLY ONE SURFACE POLLS — the live island — and its period is the named
    //               GLANCE_POLL_MS, never a literal. Every other surface still starts none.
    //           (b) NO SURFACE REFRESHES ITSELF — `router.refresh` appears NOWHERE in the
    //               glance. **THIS HALF IS NOT RETIRED.** It is the one that keeps the live
    //               update a DOM write rather than a server re-render, which is what lets
    //               phase 2's no-hooks board survive polling at all.
    //   and:  (b) names no retirer. A slice that wants a self-refreshing glance is asking for a
    //         ruling, not for a narrowing.
    assert(
      'layer 4 / no UI',
      'EXACTLY ONE SURFACE POLLS — the live island — and every other surface still starts no interval (6c’s guard, interval half retired here)',
      liveIslandBuilt &&
        /setInterval\(/.test(liveSrc) &&
        allGlanceSurfaces
          .filter((f) => f !== LIVE_ISLAND)
          .every((f) => {
            const src = code(f);
            return src.length > 0 && !/setInterval/.test(src);
          })
    );
    assert(
      'layer 4 / Ruling 10',
      'and its period is the NAMED constant, never a literal — GLANCE_POLL_MS is the only polling interval on the surface',
      liveIslandBuilt &&
        /setInterval\([^,]+,\s*GLANCE_POLL_MS\s*\)/.test(liveSrc) &&
        /GLANCE_POLL_MS/.test(liveSrc) &&
        !/setInterval\([^,]+,\s*\d/.test(liveSrc) &&
        !/\b20000\b|\b20_000\b/.test(liveSrc)
    );
    assert(
      'layer 4 / no UI',
      'NO SURFACE REFRESHES ITSELF — router.refresh appears nowhere in the glance; the live update is a DOM write, not a server re-render (NOT retired)',
      liveIslandBuilt &&
        allGlanceSurfaces.every((f) => {
          const src = code(f);
          return src.length > 0 && !/router\.refresh/.test(src);
        })
    );
    assert(
      'layer 4 / no UI',
      'and the ONLY timeouts in the glance are the arrival island’s schedule — the live path has none, because live news has nothing to stage',
      islandBuilt &&
        liveIslandBuilt &&
        surfaces.every((f) => code(f).length > 0 && !/setTimeout/.test(code(f))) &&
        !/setTimeout/.test(liveSrc)
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
    // ⚠ THE PAINTING MECHANICS MOVED IN 6e, AND THE ASSERTIONS THAT READ THEM MOVE WITH THEM —
    // NARROWED AT THE SITE RATHER THAN LEFT TO FAIL OR QUIETLY DELETED.
    //
    //   was:  these properties are asserted on the ARRIVAL ISLAND's source
    //   now:  asserted on the island AND the shared painter it now reads them from, TOGETHER —
    //         because 6e adds a second island that paints the same strips, and a burst or a
    //         tone written twice is the second definition this ticket refuses everywhere.
    //   and:  the accompanying assertion below — that the painters live in ONE module read by
    //         BOTH islands — is what makes the widening safe rather than merely convenient.
    const paintingSrc = `${islandSrc}\n${paintSrc}`;
    assert(
      'layer 4 / island',
      'it reads ONE definition of the colours — the tones and their hexes come from the strip module, and NOT ONE HEX is written in the painting path',
      islandBuilt &&
        liveIslandBuilt &&
        /from '\.\/strip'/.test(paintingSrc) &&
        /STRIP_TONE/.test(paintingSrc) &&
        !/#[0-9A-Fa-f]{6}/.test(paintingSrc) &&
        !/#[0-9A-Fa-f]{6}/.test(liveSrc)
    );
    assert(
      'layer 4 / one definition',
      'and the PAINTERS ARE ONE MODULE, read by BOTH islands — neither writes its own paint, its own burst or its own transition',
      liveIslandBuilt &&
        islandBuilt &&
        /components\/glance\/paint|from '\.\/paint'/.test(islandSrc) &&
        /components\/glance\/paint|from '\.\/paint'/.test(liveSrc) &&
        // The burst's geometry is written once, in the painter, and nowhere else.
        /PARTICLE_COUNT|function burst/.test(paintSrc) &&
        !/function burst|PARTICLE_COUNT/.test(islandSrc) &&
        !/function burst|PARTICLE_COUNT/.test(liveSrc)
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
      'and it fires ONCE — guarded by a ref, so a re-render, a strict-mode double effect or a visibility restart cannot stamp twice',
      islandBuilt && /useRef/.test(islandSrc)
    );
    // ⚠ NARROWED BY RULING 29, AT THE SITE. The property was unconditional and is now
    // conditional, and the regex could not tell: `useLayoutEffect` still matches whether or not
    // the paint waits for visibility.
    //
    //   was:  it paints the past BEFORE the browser paints — a layout effect
    //   now:  it paints the past before the browser paints ON A VISIBLE ARRIVAL, and does not
    //         paint it AT ALL while the document is hidden (Ruling 29)
    //   and:  the second half is asserted against `document.hidden` / `visibilitychange`
    //         appearing in the start path, not merely somewhere in the file.
    assert(
      'layer 4 / island',
      'it paints the past BEFORE the browser paints ON A VISIBLE ARRIVAL — a layout effect, not a post-paint one',
      islandBuilt && /useLayoutEffect/.test(islandSrc)
    );
    assert(
      'layer 4 / Ruling 29',
      'and NOT AT ALL WHILE HIDDEN — the arrival replay does not START in a background tab; it waits for the first visible moment',
      islandBuilt &&
        /document\.hidden|visibilityState/.test(islandSrc) &&
        /visibilitychange/.test(islandSrc) &&
        /removeEventListener\(\s*'visibilitychange'/.test(islandSrc)
    );
    assert(
      'layer 4 / Ruling 29',
      'and NOTHING STAMPS WHILE HIDDEN — the completion POST is behind the visibility guard at the moment it FIRES, not at the moment the walk started',
      islandBuilt &&
        /const visible = \(\) => document\.visibilityState === 'visible';/.test(islandSrc) &&
        ok(() => {
          const at = islandSrc.indexOf('/glance/seen');
          return at > 0 && /if \(visible\(\)\) \{/.test(islandSrc.slice(Math.max(0, at - 300), at));
        })
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
      'THE WORDS ARE SUPPRESSED WHILE A STEP IS PENDING — the painting path hides the strip’s state-words with the past paint',
      islandBuilt &&
        liveIslandBuilt &&
        /data-strip-words/.test(paintingSrc) &&
        /hidden\s*=\s*true/.test(paintingSrc)
    );
    assert(
      'layer 4 / finding 1',
      'and they APPEAR AS THE STEP LANDS — hidden is set back, in the same place the tint is',
      islandBuilt && liveIslandBuilt && /hidden\s*=\s*false/.test(paintingSrc)
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

    // ══ LAYER 4e — THE LIVE ISLAND (SLICE 6e) ════════════════════════════
    //
    // ⚠ WHAT THIS BLOCK CAN AND CANNOT PROVE, SAID PLAINLY BECAUSE THIS TICKET HAS CAUGHT THE
    // CONFUSION BEFORE. There is no jsdom, no timer axis and no browser here. Everything below
    // is STRUCTURAL: the constant's value, that it is the only interval, that the teardown
    // returns `clearInterval`, that the visibility gates exist, that the baseline is seeded
    // from the board rather than from the replay's steps. **That the interval actually FIRES
    // and lands a flip within 20 seconds is NOT proved by any green here.** It is a browser
    // walk, and it is claimed in the ticket, not in this file.
    assert(
      'layer 4e / live',
      'THE LIVE ISLAND EXISTS — every 6e structural assertion is anded with this, so "absent" cannot read as "correct"',
      liveIslandBuilt
    );
    assert(
      'layer 4e / live',
      'it is a CLIENT component, and the BOARD still is not — polling is an island beside the board, not a reason to hydrate it',
      liveIslandBuilt &&
        /['"]use client['"]/.test(raw(LIVE_ISLAND)) &&
        ok(() => {
          const board = code('src/components/glance/GlanceBoard.tsx');
          return (
            board.length > 0 && !/['"]use client['"]|useState|useEffect|useLayoutEffect/.test(board)
          );
        })
    );
    assert(
      'layer 4e / live',
      'IT RENDERS NOTHING, EVER — a pure-effects component with no markup at all, so 6c’s "the island renders nothing when there are no steps" is untouched rather than narrowed to "on the server pass"',
      liveIslandBuilt &&
        /return null;?/.test(liveSrc) &&
        !/<div|<span|<p\b|<button|<a\s/.test(liveSrc)
    );
    assert(
      'layer 4e / no new route',
      'IT POLLS THE ROUTE PHASE 1 BUILT — GET /api/events/[id]/glance, and it names no other endpoint; no leaner endpoint, no second assembly',
      liveIslandBuilt &&
        ok(() => {
          const paths = [...liveSrc.matchAll(/\/api\/[^`'"\s)]*/g)].map((m) => m[0]);
          const unique = [...new Set(paths)];
          return (
            unique.length === 2 &&
            unique.some((p) => /^\/api\/events\/\$\{[^}]*\}\/glance$/.test(p)) &&
            unique.some((p) => /^\/api\/events\/\$\{[^}]*\}\/glance\/seen$/.test(p))
          );
        })
    );
    assert(
      'layer 4e / no new route',
      'and the glance ROUTE ITSELF is untouched — the same GET, assembling nothing of its own; polling reused it rather than growing a states-only twin',
      ok(() => {
        const routeSrc = code('src/app/api/events/[id]/glance/route.ts');
        return (
          routeSrc.length > 0 &&
          /export async function GET/.test(routeSrc) &&
          !/export async function (POST|PUT|PATCH|DELETE)/.test(routeSrc) &&
          /readEventGlance\(/.test(routeSrc) &&
          !/derivePersonState|worstItemState|summarisePeople/.test(routeSrc)
        );
      })
    );
    assert(
      'layer 4e / house idiom',
      'THE INTERVAL IS CLEARED ON UNMOUNT — clearInterval is returned from the effect, the idiom InviteStatusSection already uses',
      liveIslandBuilt && /return\s*\(\)\s*=>/.test(liveSrc) && /clearInterval\(/.test(liveSrc)
    );
    // ⭐ THE BASELINE, STRUCTURALLY. Layer 1e proves the FUNCTION picks the right baseline; this
    // proves the ISLAND hands it the right one. The live path must never read the replay's
    // steps: `step.from` IS the past board, and seeding from it is the one-line bug.
    assert(
      'layer 4e / baseline',
      '⭐ THE ISLAND NEVER READS THE REPLAY’S STEPS — no `steps` prop, no ReplayStep, no scheduleReplay; a baseline seeded from `step.from` IS the past board and would re-spark the whole replay',
      liveIslandBuilt && !/\bReplayStep\b|\bscheduleReplay\b|\bsteps\b/.test(liveSrc)
    );
    assert(
      'layer 4e / baseline',
      '⭐ and it seeds from THE BOARD ITSELF — data-strip-state on the strips the board rendered, which IS by construction what the replay resolved to',
      liveIslandBuilt &&
        /data-person-event-id/.test(liveSrc + paintSrc) &&
        /stripState/.test(liveSrc + paintSrc)
    );
    assert(
      'layer 4e / ordering',
      'AND IT DOES NOT ARM UNTIL THE ARRIVAL REPLAY IS DONE — a poll landing mid-replay would repaint the board underneath the animation',
      liveIslandBuilt &&
        islandBuilt &&
        /GLANCE_REPLAY_DONE_EVENT/.test(liveSrc) &&
        /GLANCE_REPLAY_DONE_EVENT/.test(islandSrc)
    );
    // ⚠ ASSERTED ON THE CHAINING, NOT ON A TEXTUAL POSITION. "The dispatch appears below the
    // POST in the file" is satisfied by a dispatch that runs first at runtime, and would also
    // have been defeated here by the import statement, which names the event at the top of the
    // file. `.finally(announce)` IS the ordering: it runs when the stamp's promise settles.
    assert(
      'layer 4e / ordering',
      'and the arrival island announces it AFTER the stamp has SETTLED, not when the last beat lands — "completed AND stamped" is two things',
      islandBuilt &&
        /\.finally\(announce\)/.test(islandSrc) &&
        /dispatchEvent\(new Event\(GLANCE_REPLAY_DONE_EVENT\)\)/.test(islandSrc)
    );
    assert(
      'layer 4e / ordering',
      'and it announces on the SKIPPED and FAILED stamp paths too — the replay is over either way, so polling must not be left waiting for ever',
      islandBuilt &&
        ok(() => {
          // The declaration is not a use; strip it, then count the call sites.
          const uses = islandSrc.replace(/function announce\(\)/, '');
          return [...uses.matchAll(/(?<![A-Za-z_])announce(\(\)|\))/g)].length === 2;
        })
    );
    assert(
      'layer 4e / Ruling 29',
      'POLLING PAUSES WHILE HIDDEN and refreshes IMMEDIATELY on return — the visibility listener is registered and removed',
      liveIslandBuilt &&
        /visibilitychange/.test(liveSrc) &&
        /document\.hidden|visibilityState/.test(liveSrc) &&
        /removeEventListener\(\s*'visibilitychange'/.test(liveSrc)
    );
    // ⚠ ASSERTED ON THE GUARD ITSELF RATHER THAN ON A TOKEN NEAR THE POST. A proximity scan for
    // `visibilityState` would be satisfied by a comment, and defeated by a one-line helper —
    // which is what both islands use, because the predicate deserves one definition. So: the
    // helper IS `document.visibilityState === 'visible'`, and the POST is behind it.
    assert(
      'layer 4e / Ruling 29',
      'and NOTHING STAMPS WHILE HIDDEN on the live path either — the POST is behind the visibility guard, at the moment it fires',
      liveIslandBuilt &&
        /const visible = \(\) => document\.visibilityState === 'visible';/.test(liveSrc) &&
        ok(() => {
          const at = liveSrc.indexOf('/glance/seen');
          return (
            at > 0 && /if \(!visible\(\)\) return;/.test(liveSrc.slice(Math.max(0, at - 300), at))
          );
        })
    );
    // ⚠ RULING 24's STAMP NOW HAS TWO CALLERS, AND THE 6b ASSERTION ABOVE CANNOT TELL ONE FROM
    // TWO. The no-body scan stays exactly as 6b wrote it — it is the load-bearing half — and
    // this is added beside it rather than folded into it.
    assert(
      'layer 4e / Ruling 24',
      'THE STAMP HAS EXACTLY TWO CALL SITES — the arrival replay’s completion and the live spark — both to 6b’s route, both bodiless, both without a client instant',
      islandBuilt &&
        liveIslandBuilt &&
        ok(() => {
          const sites = [islandSrc, liveSrc].map((s) => [...s.matchAll(/\/glance\/seen/g)].length);
          const both = `${islandSrc}\n${liveSrc}`;
          return (
            sites[0] === 1 &&
            sites[1] === 1 &&
            [...both.matchAll(/method:\s*'POST'/g)].length === 2 &&
            !/body:/.test(both) &&
            !/new Date\(|Date\.now\(|toISOString\(/.test(both)
          );
        })
    );
    // ⚠ NARROWED BY RULING 30, AT THE SITE, ONE DAY AFTER IT WAS WRITTEN.
    //
    //   was:  the live stamp is fired for a SPARK — one call site, guarded by `sparked`
    //   now:  the live stamp is fired by the SHARED DECISION — one call site, guarded by
    //         `liveStampDecision`, which is Ruling 30's rule and the island's ONLY say in it
    //   and:  not a held-back guard. The old form encoded "a spark stamps", which Ruling 30
    //         narrowed to "a spark stamps unless a quiet change is owed behind it". Asserting
    //         the condition is `decision.stamp` is what stops the rule being re-spelled here,
    //         where it could only ever be exercised in a browser.
    assert(
      'layer 4e / Ruling 24',
      'the live stamp has ONE call site — not every successful poll, and not a poll that changed nothing',
      liveIslandBuilt &&
        /const stamp = \(\) => \{/.test(liveSrc) &&
        [...liveSrc.matchAll(/(?<![A-Za-z_])stamp\(\)/g)].length === 1
    );
    assert(
      'layer 4e / Ruling 30',
      '⭐ and its condition is the SHARED DECISION, asked once — the island decides nothing about the mark, so the rule cannot be re-spelled where only a browser could test it',
      liveIslandBuilt &&
        [...liveSrc.matchAll(/liveStampDecision\(/g)].length === 1 &&
        /if \(decision\.stamp\) stamp\(\);/.test(liveSrc) &&
        // The debt survives polls, so it is a ref rather than a local — a local would be reset
        // to false on every tick and the rule would silently become "in this tick only".
        /quietDebt = useRef\(false\)/.test(liveSrc) &&
        /quietDebt\.current = decision\.quietDebtAfter;/.test(liveSrc)
    );
    // ⚠ THIS ASSERTION EXISTS BECAUSE A MUTATION SURVIVED WITHOUT IT, AND THAT IS RECORDED
    // RATHER THAN QUIETLY PATCHED. The mutation that hands the decision EVERY flip in the diff
    // — rather than only the ones whose paint actually landed — passed the whole suite. Layer
    // 1e proves the function is honest about an empty list; nothing proved the ISLAND only ever
    // gives it what reached the screen.
    //
    // The consequence it would have shipped: a flip whose strip is not on the board (a person
    // added between polls, or a tone the class swap could not find) would claim a spark nobody
    // saw, or owe a debt for a quiet change nobody saw — and under Ruling 30 an imaginary debt
    // suppresses real stamps for the rest of the session.
    assert(
      'layer 4e / Ruling 30',
      'and it is given only what REACHED THE SCREEN — a flip whose paint did not land neither sparks nor owes a debt, because it was shown to nobody',
      liveIslandBuilt &&
        /const landed = paintStrip\(/.test(liveSrc) &&
        /if \(landed\) painted\.push\(flip\);/.test(liveSrc) &&
        [...liveSrc.matchAll(/painted\.push\(/g)].length === 1
    );
    assert(
      'layer 4e / Ruling 1',
      'A FAILED POLL SAYS NOTHING — no banner, no retry control, no "offline"/"stale"/"reconnecting" wording anywhere on the glance; the interval simply keeps running',
      liveIslandBuilt &&
        !/offline|reconnect|stale|retry|try again|could not refresh|failed to refresh/i.test(
          liveSrc
        ) &&
        !/<button|<a\s|role="button"|onClick|onKeyDown/i.test(liveSrc) &&
        /catch/.test(liveSrc)
    );
    assert(
      'layer 4e / Ruling 25',
      'AN ACTION TRIGGERS AN IMMEDIATE REFRESH — the live island listens for the action layer’s own event, so the board catches up without waiting up to 20s',
      liveIslandBuilt &&
        ok(() => {
          const surface = code('src/components/glance/PersonSurface.tsx');
          return (
            /GLANCE_REFRESH_EVENT/.test(liveSrc) &&
            /addEventListener\(\s*GLANCE_REFRESH_EVENT/.test(liveSrc) &&
            /removeEventListener\(\s*GLANCE_REFRESH_EVENT/.test(liveSrc) &&
            surface.length > 0 &&
            /dispatchEvent/.test(surface) &&
            /GLANCE_REFRESH_EVENT/.test(surface)
          );
        })
    );
    assert(
      'layer 4e / Ruling 25',
      'and the ACTION LAYER still owns no endpoint of its own — the refresh is an event on the page, not a second request from actions.ts',
      ok(() => {
        const actionsSrc = code('src/lib/glance/actions.ts');
        return (
          actionsSrc.length > 0 &&
          !/\/glance/.test(actionsSrc) &&
          !/dispatchEvent|window\./.test(actionsSrc)
        );
      })
    );
    assert(
      'layer 4e / Ruling 25',
      'and the word "reload" is gone from the glance entirely — the copy is not replaced with weaker copy, it is replaced with the board being right',
      ok(() =>
        [
          'src/lib/glance/actions.ts',
          'src/components/glance/PersonSurface.tsx',
          'src/components/glance/GlanceBoard.tsx',
        ].every((f) => code(f).length > 0 && !/reload/i.test(code(f)))
      )
    );
    assert(
      'layer 4e / Ruling 22',
      'THE WRITE PATH IS NOT WIDENED — polling reads; nothing in the live path writes anything but the host’s own mark',
      liveIslandBuilt &&
        !/method:\s*'(PUT|PATCH|DELETE)'/.test(liveSrc) &&
        [...liveSrc.matchAll(/method:\s*'POST'/g)].length === 1
    );
    assert(
      'layer 4e / page',
      'THE PAGE MOUNTS THE LIVE ISLAND, and mounts it UNCONDITIONALLY — most visits have nothing to replay, and those are exactly the visits polling exists for',
      pageSrc6b.length > 0 &&
        /components\/glance\/GlanceLive/.test(pageSrc6b) &&
        /<GlanceLive/.test(pageSrc6b) &&
        !/replay\.steps\.length\s*>\s*0\s*(&&|\?)[^\n]*GlanceLive/.test(pageSrc6b)
    );
    assert(
      'layer 4e / page',
      'and the page is STILL a server component that stamps only on an empty replay — 6e moves neither rule',
      pageSrc6b.length > 0 &&
        !/'use client'/.test(pageSrc6b) &&
        /replay\.steps\.length === 0/.test(pageSrc6b) &&
        [...pageSrc6b.matchAll(/stampGlanceSeen\(/g)].length === 1
    );

    // ── Ruling 10: no websocket infrastructure, ever, for this screen ────
    const pkg = JSON.parse(code('package.json') || '{}');
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    // ⚠ THIS IS A STANDING GUARD AND IS NOT 6e's EVIDENCE. It has been green since 6a and would
    // be green if 6e had shipped nothing at all. It is Ruling 10's NEGATIVE proof — "push is a
    // later upgrade"; the positive proof that polling was built is the assertion above that the
    // live island calls setInterval on GLANCE_POLL_MS against the existing GET.
    //
    // 6e adds `eventsource` to the list. The brief named "sse", which is a browser API rather
    // than a package — `eventsource` is the npm package a server-sent-events implementation
    // would actually pull in, so that is what is denied. `EventSource` itself needs no
    // dependency at all, which is why the source scan below is the half that catches it.
    assert(
      'layer 4 / Ruling 10',
      'the dependency tree gains NO websocket or SSE package — "do not build websocket infrastructure for this screen"',
      ![
        'ws',
        'socket.io',
        'socket.io-client',
        'pusher',
        'pusher-js',
        'ably',
        'sockjs',
        'eventsource',
      ].some((p) => p in deps)
    );
    assert(
      'layer 4 / Ruling 10',
      'and NO SOURCE OPENS A SOCKET OR A STREAM EITHER — a dependency-free WebSocket or EventSource would pass the scan above and still be push',
      liveIslandBuilt &&
        [...allGlanceSurfaces].every((f) => {
          const src = code(f);
          return src.length > 0 && !/\bnew WebSocket\b|\bnew EventSource\b|\bwss:\/\//.test(src);
        })
    );

    // ── 6d: RULING 23 IS DERIVED, AND "DERIVED" IS A PROPERTY OF THE SOURCE ──
    //
    // "DERIVED, never a write. A write makes looking become operating, and the glance is a
    // place she looks, not a place she operates." The runtime half is at layer 3, where the
    // whole board is dumped before and after and diffed. This is the half that holds when
    // nobody runs the walk: the four modules the settling passes through cannot write at all.
    const settleSources: Array<[string, string]> = [
      ['src/lib/glance/replay.ts', code('src/lib/glance/replay.ts')],
      ['src/components/glance/strip.ts', code('src/components/glance/strip.ts')],
      ['src/components/glance/GlanceBoard.tsx', code('src/components/glance/GlanceBoard.tsx')],
      ['src/lib/glance/read.ts', code('src/lib/glance/read.ts')],
    ];
    const settleSourcesExist = settleSources.every(([, src]) => src.length > 0);
    const WRITE_VERBS = /\.(update|updateMany|create|createMany|delete|deleteMany|upsert)\s*\(/;
    assert(
      'layer 4d / Ruling 23',
      'THE SETTLING PATH CANNOT WRITE — replay.ts, strip.ts, GlanceBoard.tsx and read.ts name no update/create/delete/upsert at all',
      settleSourcesExist && settleSources.every(([, src]) => !WRITE_VERBS.test(src))
    );
    assert(
      'layer 4d / Ruling 23',
      'and three of the four hold no database handle either — the overlay is a pure transform and the reversal predicate is pure, so neither could write if it wanted to',
      settleSourcesExist &&
        settleSources
          .filter(([f]) => f !== 'src/lib/glance/read.ts')
          .every(([, src]) => !/@prisma\/client|PrismaClient|\bprisma\b/.test(src))
    );
    assert(
      'layer 4d / Ruling 23',
      'THE PAGE’S ONLY WRITE IS STILL 6b’s STAMP — one call to `stampGlanceSeen`, and no Prisma write verb anywhere in it',
      pageSrc6b.length > 0 &&
        (pageSrc6b.match(/stampGlanceSeen\(/g) ?? []).length === 1 &&
        !WRITE_VERBS.test(pageSrc6b)
    );

    // ── ONE SITE, ONE DEFINITION ─────────────────────────────────────────
    const boardSrc6d = code('src/components/glance/GlanceBoard.tsx');
    assert(
      'layer 4d / one definition',
      'THE OVERLAY IS APPLIED AT EXACTLY ONE SITE IN THE BOARD — one `overlayReversal(` call, so a strip and its door cannot disagree about which person is sticky',
      boardSrc6d.length > 0 && (boardSrc6d.match(/overlayReversal\(/g) ?? []).length === 1
    );
    assert(
      'layer 4d / one definition',
      "and the board does NOT re-decide who reversed — no `'OUT'` comparison and no reversal literal in it; it is handed the ids the replay derived",
      // Gated on the overlay existing: a board with no overlay in it trivially contains no
      // second definition of one.
      /overlayReversal\(/.test(boardSrc6d) &&
        boardSrc6d.length > 0 &&
        !/===\s*'OUT'/.test(boardSrc6d) &&
        !/was in, now out/.test(boardSrc6d)
    );
    assert(
      'layer 4d / one definition',
      'THE WHY IS WRITTEN ONCE IN THE WHOLE GLANCE — "was in, now out" appears in strip.ts and in no other source, so the copy cannot drift between the strip and the door',
      settleSourcesExist &&
        ok(() => {
          const everySource = [
            ...allGlanceSurfaces,
            'src/lib/glance/replay.ts',
            'src/lib/glance/replay-entry.ts',
            'src/lib/glance/rewind.ts',
            'src/components/glance/GlanceReplayPreview.tsx',
          ];
          // ⚠ `code()`, NOT `raw()`. As first written this used `raw` and PASSED AT RED — it
          // matched strip.ts's own comment about the line being unbuildable. A guard that fires
          // on a comment about the thing is not a guard on the thing.
          const hits = everySource.filter((f) => /was in, now out/.test(code(f)));
          return hits.length === 1 && hits[0] === 'src/components/glance/strip.ts';
        })
    );
    assert(
      'layer 4d / Ruling 20',
      'THE OVERLAY AND THE ISLAND COME FROM ONE SOURCE — the page derives both from `replay.steps`, so a board can never be overlaid without the replay that lifts it',
      pageSrc6b.length > 0 &&
        /stickyReversals\(replay\.steps\)/.test(pageSrc6b) &&
        /hasReplay=\{replay\.steps\.length > 0\}/.test(pageSrc6b)
    );

    assert(
      'layer 4d / one door',
      'THE OVERLAY REACHES THE PAGE THROUGH THE DOOR AND IS NOT REDEFINED BEHIND IT — replay-entry RE-EXPORTS `stickyReversals` and declares no function of its own',
      entrySrc.length > 0 &&
        /export \{ stickyReversals \} from '\.\/replay';/.test(entrySrc) &&
        !/function stickyReversals/.test(entrySrc) &&
        (code('src/lib/glance/replay.ts').match(/export function stickyReversals/g) ?? [])
          .length === 1
    );

    // ── THE WIDENED PREDICATE IS THE HOUSE ONE, WIDENED ──────────────────
    const readSrc6d = code('src/lib/glance/read.ts');
    assert(
      'layer 4d / Ruling 23',
      'THE EMPTY-STRIP PREDICATE IS STILL `assignment: null`, WIDENED — not replaced, and never `Item.status`, which is a presence cache that is never consulted for status',
      readSrc6d.length > 0 &&
        /assignment:\s*null/.test(readSrc6d) &&
        !/status:\s*'UNASSIGNED'/.test(readSrc6d)
    );
    assert(
      'layer 4d / Ruling 23',
      'and the widening costs NO SECOND QUERY — the loose rows come off the people already assembled, so the board is still one read',
      // Anded with the runtime proof from layer 3 that the widening is actually there — the
      // query count alone is trivially satisfied by not having widened anything.
      revGlance !== null &&
        revGlance.unassignedCritical.some((i: any) => i.itemId === revItem.id) &&
        readSrc6d.length > 0 &&
        (readSrc6d.match(/db\.item\.findMany\(/g) ?? []).length === 1 &&
        (readSrc6d.match(/db\.item\.count\(/g) ?? []).length === 1
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
