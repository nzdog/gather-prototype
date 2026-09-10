/**
 * GTC-192 (J1, phase 6, slice 6a) — the replay derivation. PURE.
 *
 * No database handle, no clock of its own: `since` and `now` are injected, so the same inputs
 * always produce the same replay and the client and the server cannot disagree about what
 * happened while she was away.
 *
 * ── ONE DEFINITION OF THE COLOURS ────────────────────────────────────────────────────────
 *
 * The past state is computed by handing reconstructed inputs to `derivePersonState` — the
 * SAME function the live board derives from. Nothing here re-states that a DECLINED row is
 * red or that an itemless undecided guest is amber. A second copy of the colour rules living
 * in the replay is exactly the drift this ticket has refused everywhere else: `isChaseable`
 * over a `'DONT_CHASE'` literal, `mayHoldRow` over a hand-rolled same-team rule, one
 * definition of the colours rather than a server one and a client one.
 *
 * ── WHICH TRANSITIONS PLAY — RULING 26(b), the quieter one ───────────────────────────────
 *
 *   "Good news and reds play; everything else is the new board arriving without ceremony.
 *    Boundary, stated so nobody implements it wrong: GREEN -> AMBER is NOT Ruling 6's
 *    reversal. A reversal is in-then-out. Someone going from settled back to unsettled is a
 *    different fact and under this ruling it does not play."
 *
 * So a step survives only if it lands on GREEN, lands on RED, or is a reversal. A strip going
 * NOT_CHASED does not play either, and that agrees with Ruling 22 without needing its own
 * clause: the host's own override is not news to her.
 *
 * ── THE NO-OP STEP RULE ──────────────────────────────────────────────────────────────────
 *
 * A guest who accepted, then declined, then accepted again while she was away has a positive
 * ledger row inside the window and the same value at both ends. The ledger row proves
 * something happened; the states prove it netted to nothing; nothing is what she sees. Any
 * step whose `from` and `to` are identical is dropped — the same family as the vacuous greens
 * this ticket has caught in every phase.
 *
 * ── ORDER, NOT TIME ──────────────────────────────────────────────────────────────────────
 *
 * No timestamp of any kind reaches a step: not `since`, not `at`, not an ISO string, not an
 * epoch number. The rewind's ordering key sorts the steps here and is then discarded. A
 * behaviour leak in a replay does not arrive called `openedAt` — it arrives called `at`, and
 * it is when the guest acted.
 */

import { derivePersonState } from './state';
import type { DecideByItem } from '../decide-by';
import type { EventGlance, GlanceEvent, GlanceItemInput, GlancePerson, PersonState } from './state';
// TYPE-ONLY, so this module keeps no runtime dependency on the DB-bound half and stays
// client-safe. The interface is not restated here; there is one of it, and it lives there.
import type { GlanceRewind } from './rewind';

/** Ruling 1's whole replay, and nothing else. One key, so nothing can ride along beside it. */
export interface GlanceReplay {
  steps: ReplayStep[];
}

/**
 * FOUR FIELDS, AND THE TEST ASSERTS THEY ARE EXACTLY THESE FOUR.
 *
 * A denylist can only ban what someone thought of; a step is small enough to allowlist, and
 * an allowlist bans everything nobody thought of.
 */
export interface ReplayStep {
  personEventId: string;
  from: PersonState;
  to: PersonState;
  /** TRUE ONLY FOR AMBER → GREEN. Ruling 6's reversal plays quietly, with no spark. */
  spark: boolean;
}

/**
 * WHICH TRANSITION EARNS THE FLOURISH — one definition, asked by two callers.
 *
 * ⚠ SLICE 6e EXPORTS THIS OUT OF `deriveReplay`, AND THE EXPORT IS THE WHOLE POINT. Until 6e
 * the rule was an inline expression with exactly one reader, which was correct while there was
 * exactly one replay. 6e adds a second: `diffLive` (`src/lib/glance/live.ts`) has to answer the
 * same question about a live poll, and re-expressing `from === 'AMBER' && to === 'GREEN'` there
 * would be a spark rule that exists twice — weakenable in one copy with nothing failing, the
 * failure this ticket refuses at `isChaseable`, at `mayHoldRow` and at the colours.
 *
 * Nothing about the rule changed in the move. The reference: "amber-to-green flips get the
 * flourish"; Ruling 6: the reversal plays quietly, with no spark; Ruling 26: reds play, and
 * everything else is the new board arriving without ceremony. AMBER → GREEN, and nothing else.
 */
export function isSparkTransition(from: PersonState, to: PersonState): boolean {
  return from === 'AMBER' && to === 'GREEN';
}

/** Ruling 1's guardrail: the whole replay resolves inside ~3 seconds. */
export const REPLAY_BUDGET_MS = 3000;

/**
 * A SPARK's envelope — the reference's own flight time, at its top end.
 *
 * "~18 particles per flip … thrown 35–80px, 0.9–1.3s." The particles vary inside this; the
 * envelope is the slowest of them, because the budget has to hold the slowest one.
 */
export const SPARK_DURATION_MS = 1300;

/**
 * A QUIET step's envelope — the reference's "background/colour transition 0.7s ease", alone.
 *
 * Ruling 6's reversal plays "quietly, no sparks", and Ruling 26 puts every red in the same
 * boat: good news and reds both play, and only AMBER → GREEN earns the flourish. So a quiet
 * step is not a shortened spark. It is a different thing — a tint changing, and nothing else.
 */
export const QUIET_DURATION_MS = 700;

/** The unhurried spacing a short replay gets, compressed only when there are many steps. */
const STEP_INTERVAL_MS = 180;

/** When a step starts, and how long it runs. Milliseconds from the start of the replay. */
export interface ReplayBeat {
  delayMs: number;
  durationMs: number;
}

/**
 * The steps, placed on the ~3-second clock Ruling 1 fences.
 *
 * ⚠ THE BEAT CARRIES ITS OWN DURATION, AND THAT IS 6c's CORRECTION TO 6a. The first cut
 * returned start times alone, so the budget could only ever be asserted on the LAST START —
 * which says nothing about when the last burst FINISHES. Measured: sixty-four steps started at
 * ~2953ms and ended at ~4.25s, with the assertion green the whole way. The budget Ruling 1
 * actually fences is when the replay is OVER, so a beat has to say when it ends, and
 * `delayMs + durationMs <= REPLAY_BUDGET_MS` for every beat is what the suite now proves.
 *
 * COMPRESSED RATHER THAN TRUNCATED at large headcounts. Ruling 5 keeps every settled person a
 * strip at any event size, so a big board must still finish inside the budget rather than
 * dropping the tail of its own replay.
 *
 * ⚠ AND THE COST OF THAT IS REAL AND IS NOT HIDDEN. Past roughly twenty steps the stagger
 * falls under the ~50ms it takes for two bursts to read as two events, and a long replay
 * becomes one wave rather than a sequence. That is the budget winning over the stagger, which
 * is the order Ruling 1 puts them in: "never hold the answer hostage."
 */
export function scheduleReplay(steps: readonly ReplayStep[]): ReplayBeat[] {
  if (steps.length === 0) return [];
  const durations = steps.map((s) => (s.spark ? SPARK_DURATION_MS : QUIET_DURATION_MS));
  // The tail is what the budget has to hold, and the longest envelope is what the tail might
  // be. Reserving it for every step is a hair conservative and cannot overrun.
  const longest = Math.max(...durations);
  const room = Math.max(0, REPLAY_BUDGET_MS - longest);
  const interval = steps.length === 1 ? 0 : Math.min(STEP_INTERVAL_MS, room / (steps.length - 1));
  return steps.map((_, i) => ({ delayMs: Math.floor(interval * i), durationMs: durations[i] }));
}

/**
 * A row as it stood at `since`, in the shape the live derivation already takes.
 *
 * THE CLOCK COMES FROM THE PLAN, NOT FROM THE PAYLOAD — Ruling 27. `GlanceItem.decideByAt` is
 * display data and is non-null only for a row that is a maybe NOW, so it cannot answer whether a
 * row that WAS a maybe had already run out of time. The rewind carries `Item.dropOffAt` and
 * `Item.decideByOffsetHours` instead, and the shared predicate is asked the real question as at
 * `since`. Nothing is reconstructed and nothing is guessed.
 *
 * A row with no clock entry falls back to the event's own defaults, which is what
 * `resolveDecideByOffsetHours` does for an item that overrides nothing.
 */
function pastRow(
  item: GlancePerson['items'][number],
  response: string,
  clock: DecideByItem | undefined
): GlanceItemInput {
  return {
    itemId: item.itemId,
    assignmentId: item.assignmentId,
    name: item.name,
    critical: item.critical,
    kind: item.kind,
    teamId: item.teamId,
    response,
    item: clock ?? { dropOffAt: null, decideByOffsetHours: null },
  };
}

/**
 * The steps between the board she last saw and the board she is looking at.
 *
 * `now` is accepted and used only as a sanity boundary: a `since` at or after it is not a
 * window, and a replay is not the place to reason about clock skew.
 */
export function deriveReplay(
  glance: EventGlance,
  past: GlanceRewind,
  event: GlanceEvent,
  since: Date,
  now: Date
): GlanceReplay {
  if (!(since.getTime() < now.getTime())) return { steps: [] };

  const ranked: Array<{ step: ReplayStep; reversal: boolean; order: number }> = [];
  const people: GlancePerson[] = [
    ...glance.households.flatMap((h) => h.members),
    ...glance.unhoused,
  ];

  for (const person of people) {
    // FAIL-SAFE SILENT. A person the rewind could not resolve is dropped rather than guessed
    // at: silence is the recoverable failure, a wrong spark is not.
    if (past.ambiguous.has(person.personEventId)) continue;
    if (!past.attendanceAt.has(person.personEventId)) continue;

    const rows: GlanceItemInput[] = [];
    let order = 0;

    for (const item of person.items) {
      // Born after she last looked: she held no such row then, which is not the same fact as
      // holding it unanswered.
      if (past.absentAt.has(item.assignmentId)) continue;

      const response = past.responseAt.get(item.assignmentId) ?? 'PENDING';

      const moved = past.changedSince.get(item.assignmentId);
      if (typeof moved === 'number' && moved > order) order = moved;

      // RULING 27: the clock is the plan's, so a past maybe resolves rather than silencing the
      // whole person. There is no unresolvable case left to drop.
      rows.push(pastRow(item, response, past.clockAt.get(item.assignmentId)));
    }

    const from = derivePersonState(
      {
        isHost: person.isHost,
        // NOT REWOUND, AND NEITHER IS THE MARK. Exhaustion is GTC-251's fact and does not
        // exist yet; the mark is Kate's own decision rather than something a guest did, and
        // Ruling 22 rules her own override is not news to her.
        exhaustion: null,
        nudgeMark: person.nudgeMark,
        attendanceAnswer: past.attendanceAt.get(person.personEventId) ?? null,
        items: rows,
      },
      event,
      since
    ).state;

    const to = person.state;

    // THE NO-OP STEP RULE. The states prove it netted to nothing.
    if (from === to) continue;

    // Ruling 6's reversal is IN-THEN-OUT, and only that.
    const reversal = to === 'OUT' && from !== 'OUT';

    // RULING 26(b). Everything else is the new board arriving without ceremony.
    if (!(to === 'GREEN' || to === 'RED' || reversal)) continue;

    ranked.push({
      step: {
        personEventId: person.personEventId,
        from,
        to,
        spark: isSparkTransition(from, to),
      },
      reversal,
      order,
    });
  }

  // Ruling 6: the reversal plays LAST, so the replay ends on the truth. Everything else keeps
  // the order it actually happened in.
  //
  // ⚠ THE DESIGN REFERENCE SAYS *ALL* REDS LAND LAST. THIS SORTS ONLY THE REVERSAL, AND THAT IS
  // RULED — recorded here so nobody "fixes" the code toward the reference. The reference's
  // replay rules read *"reds land last, quietly, so the replay ends on the truth"*; Ruling 6 is
  // about the reversal's lifecycle specifically, and Ruling 26 — which let ordinary reds play at
  // all — came after both and said nothing about their order. Put to the founder at 6c's walk,
  // where two reds visibly played in the middle of the good news:
  //
  //   "Reversals last, as built. Ruling 6 is specific about the reversal's lifecycle; the
  //    reference sentence is a sketch and the ruling governs."
  //
  // So an ordinary red keeps the order it actually happened in, like every other step.
  ranked.sort((a, b) => (a.reversal === b.reversal ? a.order - b.order : a.reversal ? 1 : -1));

  return { steps: ranked.map((r) => r.step) };
}
