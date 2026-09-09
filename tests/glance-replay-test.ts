/**
 * GTC-192 (J1, phase 6, slice 6a) — the rewind and the replay derivation. NO UI.
 *
 * Ruling 1 fences the arrival replay to state changes: "no opens, no views, no hesitations,
 * ever." Ruling 6 makes the reversal play last and settle once played. Ruling 21 (2026-09-09)
 * moves the rewind's source to `AuditEntry` so the table carrying `LINK_OPENED` is NOT TOUCHED
 * AT ALL rather than touched and guarded. Ruling 26 rules which transitions play: good news and
 * reds; GREEN → AMBER is not a reversal and does not play.
 *
 * FIVE LAYERS IN THE PLAN; 6a BUILDS 1, 2 AND 4.
 *   1. PURE      — `deriveReplay` and `scheduleReplay` over hand-built inputs. No server, no DB.
 *   2. DB        — `rewindGlanceInputs` against a seeded event with REAL `AuditEntry` rows.
 *   3. HTTP      — the stamp route. NOT 6a; that is 6b.
 *   4. STRUCTURAL + FENCE — the denylist, the allowlist, the no-timestamp rule, the rewind's
 *                  confinement, the one door, no websocket package.
 *   5. the four mutations — run and reported as part of 6a, not encoded here.
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
import { BEHAVIOUR_DENYLIST, REWIND_DENYLIST, collectKeys, code } from './glance-fence';

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

    // ── The schedule: the whole replay inside ~3s ──
    assert(
      'layer 1 / schedule',
      'the replay budget is 3000ms, named rather than scattered',
      built && ok(() => RP.REPLAY_BUDGET_MS === 3000)
    );
    for (const n of [1, 5, 64]) {
      const steps = Array.from({ length: n }, (_, i) => ({
        personEventId: `pe${i}`,
        from: 'AMBER',
        to: 'GREEN',
        spark: true,
      }));
      assert(
        'layer 1 / schedule',
        `${n} step(s) schedule inside the 3000ms budget, monotonically`,
        built &&
          ok(() => {
            const at: number[] = RP.scheduleReplay(steps);
            return (
              at.length === n &&
              at.every((ms, i) => Number.isFinite(ms) && ms >= 0 && (i === 0 || ms >= at[i - 1])) &&
              at[at.length - 1] <= RP.REPLAY_BUDGET_MS
            );
          })
      );
    }
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

    // (b) PENDING default: an assignment with no ledger rows at all
    const gSilent = await guest('Silent');
    const aSilent = await give(gSilent.person.id, 'napkins', 'PENDING', T0);

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
    assert(
      'layer 2 / default',
      'an assignment with no ledger rows reads PENDING — the schema default, positively defaulted',
      built && ok(() => (rewound.responseAt.get(aSilent.id) ?? 'PENDING') === 'PENDING')
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

    // ── 6a CHANGES NOTHING THE HOST CAN SEE ──────────────────────────────
    //
    // "NOTHING CALLS THE NEW MODULES. The board must be byte-identical to what phase 4
    // shipped." Asserted rather than promised.
    const surfaces = [
      'src/components/glance/GlanceBoard.tsx',
      'src/components/glance/PersonSurface.tsx',
      'src/components/glance/assistant.ts',
      'src/app/plan/[eventId]/glance/page.tsx',
      'src/app/api/events/[id]/glance/route.ts',
      'src/lib/glance/read.ts',
      'src/lib/glance/state.ts',
      'src/lib/glance/actions.ts',
    ];
    assert(
      'layer 4 / no UI',
      'NOTHING calls the new modules — no surface, page, route or existing glance module imports them',
      surfaces.every((f) => {
        const src = code(f);
        return src.length > 0 && !/glance\/(rewind|replay|replay-entry)/.test(src);
      })
    );
    assert(
      'layer 4 / no UI',
      'and no polling was introduced — Ruling 10’s ~20s is 6e, not 6a',
      // Gated on the file actually being read: `code()` returns '' for a missing path, and an
      // absence test over an empty string is the vacuous green this ticket keeps catching.
      surfaces.every((f) => {
        const src = code(f);
        return src.length > 0 && !/setInterval|setTimeout|router\.refresh/.test(src);
      })
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
