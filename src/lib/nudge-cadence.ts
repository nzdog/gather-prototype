/**
 * GTC-178 (E1, phase 5) — the nudge cadence.
 * GTC-179 (E2, phase 1) — and the two controls that adjust it.
 *
 * Moment 4 §8.3, ruled: "two nudges, days 4 and 7, adjustable; criticality does not
 * compress." §4: "first nudge, then a second at a later window, **on the system's own
 * schedule** — Kate does not compose, time, or approve them." The 4/7 spacing matches the
 * real reply distribution from the Hinge walk (§6): first response ~41 min, a same-day
 * cluster, a day-3 pair, stragglers from day 7 on. The dangerous void is short; the real
 * exposure is the tail.
 *
 * §10.3 supplies the adjustment: a per-EVENT pace (standard / relaxed / off) and a
 * per-PERSON mark (go gentle / don't chase). "Cadence controls live where the
 * people-decisions live... Not a settings page." This module owns what those words mean
 * in days and how the two compose; it owns nothing about where Kate sets them.
 *
 * WHAT IS STORED AND WHAT IS NOT.
 *
 *   STORED   PersonEvent.sentAt — the per-person send clock the offsets count from.
 *   STORED   the pace and the mark, from GTC-179 phase 2 — two nullable enum columns.
 *   DERIVED  every nudge instant, and whether a leg is due.
 *
 * There is deliberately no `nextNudgeAt` column. A stored instant drifts from the
 * `sentAt` it was computed from, and from the cadence Kate can now adjust — the same
 * reasoning `decide-by.ts` records for having no `decideByAt`, and the `Item.status`
 * mistake before it (architecture-contract §6).
 *
 * CLIENT-SAFE. No imports at all, so the host UI can render the same clock the sweep
 * enforces. Hinge §6 refuses seen-status and replaces it with the nudge-clock — "each
 * yellow box quietly shows what the system will do next and when (*nudge in 2 days*)".
 * That box and `nudge-eligibility.ts` must not be able to disagree, which they would the
 * moment there were two definitions. `tests/nudge-cadence-test.ts` asserts the zero-import
 * property structurally, which is why the pace and mark vocabularies below are
 * locally-declared string-literal unions and NOT `@prisma/client` enum imports. Phase 2's
 * Prisma enums must MIRROR the two tables here; these are the source, the enums the copy.
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
 *    here of running out. ⚠ GTC-179 sharpens that warning rather than softening it: see
 *    `nextNudgeAt` below, where an empty cadence now returns null from moment zero.
 *  - The proxy path's TIMING — GTC-252. It shares no cadence code with this one, and
 *    GTC-179's Ruling 3 suppresses don't-chase there with a boolean read, never a clock.
 */

/** The system default: two nudges, at day 4 and day 7 (Moment 4 §8.3). */
export const DEFAULT_NUDGE_OFFSET_DAYS: readonly number[] = [4, 7];

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The per-EVENT pace (§10.3: "at the pre-flight — nudge pace: standard / relaxed / off").
 * GTC-188 (I1) builds the surface Kate sets it on; this is only what it means.
 */
export type NudgePace = 'STANDARD' | 'RELAXED' | 'OFF';

/**
 * The per-PERSON mark (§10.3: "a mark alongside the recipient picker — go gentle / don't
 * chase, set at Moment 1 or any time"). GTC-179 phase 4 builds the surface.
 */
export type NudgeMark = 'GENTLE' | 'DONT_CHASE';

/**
 * What each pace means in days. GTC-179 Ruling 2 (2026-08-27).
 *
 * STANDARD *names* the system default rather than restating it — one place holds [4, 7],
 * so a future change to the default cannot silently disagree with the pace that means it.
 */
export const NUDGE_PACE_OFFSET_DAYS: Readonly<Record<NudgePace, readonly number[]>> = {
  STANDARD: DEFAULT_NUDGE_OFFSET_DAYS,
  RELAXED: [6, 12],
  OFF: [],
};

/**
 * What each mark means in days. GTC-179 Ruling 1 (2026-08-27).
 *
 * GENTLE IS A VOLUME CONTROL, NOT A HANDBACK CONTROL — ruled explicitly. One nudge at
 * day 5, then the system stops, and it hands back to the host no differently from a spent
 * standard cadence. Whatever GTC-251 (E6) eventually does at exhaustion applies to gentle
 * on the same terms as to everyone else. Nothing here may be read as a second ending.
 *
 * DONT_CHASE is §10.3's far end — "the per-person off-switch (the mother, the bereaved,
 * the feuding cousin)". Zero legs, forever, on this path AND on the proxy path
 * (Ruling 3, enforced in `proxy-nudge-eligibility.ts` from phase 3 — a suppression read,
 * not a cadence).
 */
export const NUDGE_MARK_OFFSET_DAYS: Readonly<Record<NudgeMark, readonly number[]>> = {
  GENTLE: [5],
  DONT_CHASE: [],
};

/**
 * Anything carrying the per-event pace. Structural, so a narrow Prisma `select` works.
 * NULL/absent means NOT SET — no opinion — never "zero". Same convention
 * `Event.decideByOffsetHours` records.
 */
export interface NudgePaceSource {
  nudgePace?: NudgePace | null;
}

/** Anything carrying the per-person mark. Same convention as above. */
export interface NudgeMarkSource {
  nudgeMark?: NudgeMark | null;
}

/**
 * The quieter of two cadences. GTC-179 Ruling 4 (2026-08-27).
 *
 * QUIETER MEANS FEWER NUDGES FIRST, THEN LATER. Count dominates; timing only breaks ties.
 * So [5] beats [6, 12] — one message is quieter than two even though it lands sooner —
 * and [] beats everything, because zero is the fewest there is.
 *
 * Symmetric: argument order cannot change the answer, which is what lets the resolver
 * `reduce` over its candidates without caring which layer it saw first.
 *
 * Assumes both inputs are already ascending (`normaliseOffsets` guarantees it, and both
 * tables above are written that way). The tie-break compares position by position, so an
 * unsorted input would compare the wrong pair of days.
 */
export function quieterOffsets(a: readonly number[], b: readonly number[]): readonly number[] {
  if (a.length !== b.length) return a.length < b.length ? a : b;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? a : b;
  }
  return a;
}

/**
 * The cadence, resolved from the per-person mark and the per-event pace.
 *
 * A PARAMS OBJECT, NOT POSITIONAL ARGUMENTS — deliberately, and for the reason
 * `resolveDecideByOffsetHours` records: §10.3 rules two axes Kate can set, and a third
 * (§10.2's per-person decide-by, GTC-180's) is coming. New layers add keys, not
 * arguments, and no caller changes.
 *
 * NOT A PRECEDENCE LADDER — QUIETER WINS (Ruling 4). This function's previous docstring
 * promised "per-PERSON override, else per-EVENT default, else the system default", and
 * that ladder is WRONG: it gives a GENTLE person on an OFF event [5] — MORE nudges than
 * an unmarked person on the same event, who gets none. A control that exists only to
 * reduce contact would have increased it. The ladder is not implemented; it is recorded
 * here so the correction is legible rather than looking like drift.
 *
 * AN UNSET LAYER HAS NO OPINION. It does not contribute a candidate, and it is not the
 * system default in disguise — the default applies only when NEITHER layer has spoken.
 * That distinction is what keeps `resolveNudgeOffsetDays({})` at [4, 7] while
 * `{ event: { nudgePace: 'OFF' } }` is [].
 *
 * THE EMPTY ARRAY IS THE SEAM FOR DON'T-CHASE, and now for OFF as well. Returning `[]`
 * means no leg is ever due, which every consumer already handles by iterating — no branch
 * in the sweep, only this resolution. (§10.3: "Don't-chase is the far end — the
 * per-person off-switch.")
 *
 * Returns ascending, deduped, and free of negatives — the sweep indexes legs by position,
 * so an unsorted or duplicated cadence would silently mislabel which nudge fired.
 */
export function resolveNudgeOffsetDays(sources: {
  person?: NudgeMarkSource | null;
  event?: NudgePaceSource | null;
}): readonly number[] {
  const candidates: (readonly number[])[] = [];

  const mark = sources.person?.nudgeMark;
  if (mark != null) candidates.push(NUDGE_MARK_OFFSET_DAYS[mark]);

  const pace = sources.event?.nudgePace;
  if (pace != null) candidates.push(NUDGE_PACE_OFFSET_DAYS[pace]);

  if (candidates.length === 0) return normaliseOffsets(DEFAULT_NUDGE_OFFSET_DAYS);

  return normaliseOffsets(candidates.reduce(quieterOffsets));
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
 *
 * ⚠ GTC-179 MAKES THAT WARNING LOAD-BEARING RATHER THAN CAUTIONARY. A DONT_CHASE person
 * — or anyone on an OFF event — resolves to [], so this returns null FROM MOMENT ZERO,
 * before a single nudge has been sent. A GENTLE person reaches null after one leg rather
 * than two. An exhausted predicate written as "nextNudgeAt === null" would therefore turn
 * every don't-chase person red the instant Kate marked them — she asks the system to stop
 * chasing her mother and it escalates her mother to her. GTC-251 must distinguish NO
 * cadence from a SPENT one; a note recording that is filed on that ticket.
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
