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

/** Ruling 1's guardrail: the whole replay resolves inside ~3 seconds. */
export const REPLAY_BUDGET_MS = 3000;

/** The unhurried spacing a short replay gets, compressed only when there are many steps. */
const STEP_INTERVAL_MS = 180;

/**
 * When each step lands, in milliseconds from the start of the replay.
 *
 * Compressed rather than truncated at large headcounts: Ruling 5 keeps every settled person a
 * strip at any event size, so a big board must still finish inside the budget rather than
 * dropping the tail of its own replay.
 */
export function scheduleReplay(steps: readonly ReplayStep[]): number[] {
  if (steps.length === 0) return [];
  const interval = Math.min(STEP_INTERVAL_MS, REPLAY_BUDGET_MS / steps.length);
  return steps.map((_, i) => Math.round(interval * i));
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
        spark: from === 'AMBER' && to === 'GREEN',
      },
      reversal,
      order,
    });
  }

  // Ruling 6: the reversal plays LAST, so the replay ends on the truth. Everything else keeps
  // the order it actually happened in.
  ranked.sort((a, b) => (a.reversal === b.reversal ? a.order - b.order : a.reversal ? 1 : -1));

  return { steps: ranked.map((r) => r.step) };
}
