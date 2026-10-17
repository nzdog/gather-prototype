/**
 * GTC-179 (E2, phase 5) — the per-event nudge pace, where it acts as a gate.
 *
 * Moment 4 §10.3: "Per-event pace: at the pre-flight (*nudge pace: standard / relaxed /
 * off*) — an event-level sending decision made where she reviews how everyone is
 * contacted."
 *
 * THIS MODULE OWNS ONLY THE OFF END. STANDARD and RELAXED are cadence, not suppression:
 * they resolve to offsets in `resolveNudgeOffsetDays` (src/lib/nudge-cadence.ts) and
 * never reach here. Only OFF stops a person being a candidate at all — the same division
 * `nudge-mark.ts` next door draws between GENTLE (cadence) and DONT_CHASE (suppression).
 *
 * WHY THE PACE IS READ HERE AS WELL AS IN THE RESOLVER. The resolver already returns `[]`
 * for OFF, which is enough to silence the sweep. It is not enough to EXPLAIN it: `[]` is
 * also don't-chase, and also not-yet-due, so the cause cannot be recovered from the
 * return value. Founder Ruling 11 (2026-08-27) requires the cause on the record. The two
 * therefore overlap by design and fail in the safe direction — the gate here
 * short-circuits, and the resolver's `[]` stands behind it as belt and braces.
 */

import type { NudgePace } from '@/lib/nudge-cadence';

/**
 * Has the host switched automated nudging off for this whole event?
 *
 * NULL and STANDARD and RELAXED are all false — an unset pace is "no opinion", which
 * resolves to the system default, and the two named cadences are volume, not an
 * off-switch. Only OFF is true.
 *
 * Takes a widened `string` alongside the union so a Prisma row typed from a narrow
 * `select` can be passed without a cast.
 */
export function isPaceOff(pace: NudgePace | string | null | undefined): boolean {
  return pace === 'OFF';
}

/**
 * Skip reason recorded when a candidate is dropped because the event's pace is OFF.
 *
 * ⚠ THE SEMANTIC COST OF THIS STRING, STATED HERE RATHER THAN LEFT TO BE NOTICED.
 *
 * Every other reason in `EligibilityResult.skipped` means *"this individual was excluded
 * for an individual reason"* — this person is a child, this person has no token, this
 * number is invalid, this person opted out, this person is marked don't-chase. All five
 * are facts about a person.
 *
 * **This one is not.** It is a SINGLE HOST DECISION about the event, reported once per
 * person, so a forty-guest event yields `{ reason: <this>, count: 40 }` from one click at
 * the pre-flight. The per-person tally is being used to carry an event-level fact, and
 * that is a genuine change in what the skipped array means. It was surfaced as a shape
 * question and ruled in deliberately (Ruling 11, 2026-08-27), not arrived at by accident.
 *
 * Why it was ruled in anyway: the invisibility argument that produced Ruling 6 for
 * don't-chase is identical here — a person the system will never message must not be
 * silently absent from the run report, because invisible is indistinguishable from
 * broken when someone asks why nobody got anything. And "40 people skipped because this
 * event's pace is OFF" is the sentence an operator actually wants. The alternative
 * considered and rejected was a separate field on `EligibilityResult`, which preserves
 * the per-person semantics but changes the TYPE — and that type propagates through
 * `NudgeRunResult.candidates.skipped` into the cron route's response. A special case in
 * one of the two places skips are produced is what a later session misreads.
 *
 * If a future reader is tempted to "fix" this by counting it once: don't. The count is
 * the number of people not messaged, which is the number that matters.
 */
export const PACE_OFF_SKIP_REASON = "Event's nudge pace is OFF (Moment 4 §10.3)";
