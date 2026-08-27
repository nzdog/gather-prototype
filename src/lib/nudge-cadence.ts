/**
 * GTC-178 (E1, phase 5) — the nudge cadence.
 *
 * Moment 4 §8.3, ruled: "two nudges, days 4 and 7, adjustable; criticality does not
 * compress." §4: "first nudge, then a second at a later window, **on the system's own
 * schedule** — Kate does not compose, time, or approve them." The 4/7 spacing matches the
 * real reply distribution from the Hinge walk (§6): first response ~41 min, a same-day
 * cluster, a day-3 pair, stragglers from day 7 on. The dangerous void is short; the real
 * exposure is the tail.
 *
 * WHAT IS STORED AND WHAT IS NOT.
 *
 *   STORED   PersonEvent.sentAt — the per-person send clock the offsets count from.
 *   DERIVED  every nudge instant, and whether a leg is due.
 *
 * There is deliberately no `nextNudgeAt` column. A stored instant drifts from the
 * `sentAt` it was computed from, and from the cadence Kate is about to make adjustable —
 * the same reasoning `decide-by.ts` records for having no `decideByAt`, and the
 * `Item.status` mistake before it (architecture-contract §6).
 *
 * CLIENT-SAFE. No imports at all beyond types, so the host UI can render the same clock
 * the sweep enforces. Hinge §6 refuses seen-status and replaces it with the nudge-clock —
 * "each yellow box quietly shows what the system will do next and when (*nudge in 2
 * days*)". That box and `nudge-eligibility.ts` must not be able to disagree, which they
 * would the moment there were two definitions.
 *
 * CRITICALITY IS ABSENT FROM THIS MODULE, DELIBERATELY. §8.3: "Critical items get the
 * SAME schedule as everything else — criticality does exactly two things (the badge, and
 * the assistant's message at red) and touches nothing else. It is entirely a host-facing
 * signal, never a guest-facing pressure." A `critical` term in any function here would be
 * guest-facing pressure. `tests/nudge-cadence-test.ts` asserts structurally that the word
 * appears nowhere in this module or the three that consume it.
 *
 * NOT THIS MODULE'S, AND NOT THIS TICKET'S:
 *  - Truncation at the red-by-time line (§8.3's "no nudge fires when there's no time left
 *    for it to work"). That line does not exist yet — GTC-180 (E3) is open and owns both
 *    the line and the truncation. Nothing here caps the offsets against the event date.
 *  - Exhaustion, the exhausted predicate, the retry count, the red door — GTC-251 (E6).
 *    This module answers "which legs are due"; it never counts, and there is no notion
 *    here of running out.
 *  - The proxy path — GTC-252. It shares no cadence code with this one.
 */

/** The system default: two nudges, at day 4 and day 7 (Moment 4 §8.3). */
export const DEFAULT_NUDGE_OFFSET_DAYS: readonly number[] = [4, 7];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Anything carrying a cadence override. Structural, so a narrow `select` works — and
 * empty today, because no such field exists yet. GTC-179 (E2) adds the per-event pace
 * (standard/relaxed/off) and the per-person go-gentle/don't-chase mark; when it does, the
 * fields land on this interface and every call site below keeps compiling.
 */
export interface NudgeCadenceSource {
  // GTC-179 (E2) adds its override fields here. Intentionally empty until then — an
  // invented placeholder would be a field with no ruled meaning, which is how a
  // vocabulary gets built from nothing.
}

/**
 * The cadence, resolved in precedence: per-PERSON override, else per-EVENT default, else
 * the system default.
 *
 * A PARAMS OBJECT, NOT POSITIONAL ARGUMENTS — deliberately, and for the reason
 * `resolveDecideByOffsetHours` records: Moment 4 §10.3 rules two axes Kate can set (the
 * pre-flight pace, per event; the go-gentle mark, per person) which GTC-179 owns and this
 * ticket does not build. When E2 adds them it adds keys here, and no caller changes.
 *
 * THE EMPTY ARRAY IS THE SEAM FOR DON'T-CHASE. §10.3: "Don't-chase is the far end — the
 * per-person off-switch (the mother, the bereaved, the feuding cousin)." Returning `[]`
 * means no leg is ever due, which every consumer already handles by iterating. E2 needs
 * no new branch in the sweep, only a layer here.
 *
 * Returns ascending, deduped, and free of negatives — the sweep indexes legs by position,
 * so an unsorted or duplicated cadence would silently mislabel which nudge fired.
 */
export function resolveNudgeOffsetDays(_sources: {
  person?: NudgeCadenceSource | null;
  event?: NudgeCadenceSource | null;
}): readonly number[] {
  // Only the system-default layer exists today. GTC-179 inserts the person and event
  // layers above it, in that precedence.
  return normaliseOffsets(DEFAULT_NUDGE_OFFSET_DAYS);
}

/** Ascending, deduped, no negatives. Exported so E2's layers can reuse the guarantee. */
export function normaliseOffsets(days: readonly number[]): readonly number[] {
  return Array.from(new Set(days.filter((d) => Number.isFinite(d) && d >= 0))).sort(
    (a, b) => a - b
  );
}

/** The instant a given leg becomes due, counted from THIS person's send clock. */
export function nudgeDueAt(sentAt: Date, offsetDays: number): Date {
  return new Date(sentAt.getTime() + offsetDays * DAY_MS);
}

/**
 * Which legs are due for a person, by index into the resolved cadence.
 *
 * Index, not day count: the sweep stamps `firstNudgeSentAt`/`secondNudgeSentAt` by
 * position (Ruling 7 — ordinal names, because E2 makes the days adjustable), so position
 * is the thing that has to line up. `[0]` means the first leg is due, `[0, 1]` means both
 * are (someone added late, or a cron that missed a tick).
 *
 * Time only. Whether a due leg should actually SEND is the caller's decision — opt-out,
 * the child rule, response state and the already-sent stamps all live in
 * `nudge-eligibility.ts` and none of them belong in a pure clock.
 */
export function dueNudgeIndices(
  sentAt: Date,
  now: Date,
  offsetDays: readonly number[] = DEFAULT_NUDGE_OFFSET_DAYS
): number[] {
  const due: number[] = [];
  offsetDays.forEach((days, i) => {
    if (nudgeDueAt(sentAt, days).getTime() <= now.getTime()) due.push(i);
  });
  return due;
}

/**
 * The next nudge instant, or null when the cadence is spent.
 *
 * This is what Hinge §6's "nudge in 2 days" renders from. NULL DOES NOT MEAN RED. It
 * means this module has no further scheduled leg — whether that is exhaustion, and what
 * colour it earns, is GTC-251's (E6) to decide and GTC-192's (J1) to draw. Nothing here
 * may be read as an exhaustion signal.
 */
export function nextNudgeAt(
  sentAt: Date,
  now: Date,
  offsetDays: readonly number[] = DEFAULT_NUDGE_OFFSET_DAYS
): Date | null {
  for (const days of offsetDays) {
    const at = nudgeDueAt(sentAt, days);
    if (at.getTime() > now.getTime()) return at;
  }
  return null;
}
