/**
 * GTC-179 (E2, phase 3) — the per-person nudge mark, in one place.
 *
 * Moment 4 §10.3: "Per-person: a mark alongside the recipient picker (*go gentle / don't
 * chase*), set at Moment 1 or any time — a hosting judgement the system stores and
 * obeys. **Don't-chase is the far end**: the per-person off-switch (the mother, the
 * bereaved, the feuding cousin)."
 *
 * TWO DIFFERENT MECHANISMS, DELIBERATELY, AND THIS MODULE OWNS ONLY ONE OF THEM.
 *
 *   GENTLE      is a CADENCE change — fewer legs, later. It lives entirely in
 *               `resolveNudgeOffsetDays` (src/lib/nudge-cadence.ts) and never reaches
 *               this module. Nothing here may treat GENTLE as a suppression.
 *   DONT_CHASE  is a SUPPRESSION — the person is not a candidate at all, on any path.
 *               That is what lives here.
 *
 * WHY DON'T-CHASE NEEDS A SUPPRESSION AND NOT JUST AN EMPTY CADENCE. The resolver DOES
 * return `[]` for DONT_CHASE, and that alone would silence the direct sweep. It is not
 * enough for two reasons, both ruled:
 *
 *  1. **Ruling 6 requires a RECORDED SKIP.** An empty cadence is indistinguishable from
 *     an OFF event and from not-yet-due — all three are `[]` — so the reason cannot be
 *     recovered from the resolver's return value. Every other exclusion on this path
 *     (the child rule, no token, an invalid number, opt-out) records a skip; this would
 *     have been the only silent one, and invisible is indistinguishable from broken when
 *     someone asks why a person got nothing.
 *  2. **Ruling 3 requires the PROXY path too**, and the proxy path has no cadence at all
 *     — no clock, no window, nothing to return `[]` from. A boolean read is the only
 *     mechanism both paths share.
 *
 * The two therefore overlap on the direct path by design: the loop's gate short-circuits
 * before the resolver runs, and the resolver's `[]` stands behind it. That is the same
 * belt-and-braces treatment the child rule already gets in `nudge-eligibility.ts`, where
 * the SQL excludes CHILD and the JS re-checks anyway. If the two ever disagree they fail
 * in the safe direction: the row is suppressed, not sent to.
 *
 * ⚠ DELIBERATELY NOT A PRISMA `where` FRAGMENT — unlike `MESSAGEABLE_PERSON_EVENT` next
 * door. Filtering DONT_CHASE in SQL would be cheaper and would make the person vanish
 * before the loop ever saw them, which is exactly what Ruling 6 forbids: no row loaded
 * means no skip recorded. The cost of one extra row in memory buys the host an answer to
 * "why did she get nothing".
 *
 * ⚠ LAYERED ON TOP OF OPT-OUT, NEVER THROUGH IT (Do-Not-Touch Zone 7). Opt-out is
 * GUEST-set and legally binding; this is HOST-set and revocable. Every eligibility ladder
 * must check `isOptedOut` FIRST and this SECOND, so that a host clearing DONT_CHASE can
 * never resume messaging someone who opted out. Ruling 3 states the same ordering for the
 * proxy path, and `tests/nudge-cadence-controls-test.ts` asserts it on both by giving the
 * ordering subjects BOTH conditions and checking which reason is reported.
 */

import type { NudgeMark } from '@/lib/nudge-cadence';

/**
 * May this person be chased by the automated machinery at all?
 *
 * NULL and GENTLE are both chaseable — null is "no mark", and gentle is a volume control,
 * not an off-switch (Ruling 1: gentle is one nudge at day 5, and it hands back to the
 * host no differently from a spent standard cadence). Only DONT_CHASE is false.
 *
 * Takes a widened `string` alongside the union so a Prisma row typed from a narrow
 * `select` can be passed without a cast.
 */
export function isChaseable(mark: NudgeMark | string | null | undefined): boolean {
  return mark !== 'DONT_CHASE';
}

/**
 * Skip reason recorded when a candidate is dropped for the mark. Shared by the direct
 * and proxy paths so the two cannot drift into reporting the same fact two ways —
 * `tests/nudge-cadence-controls-test.ts` asserts both files reference this symbol.
 */
export const DONT_CHASE_SKIP_REASON = "Host marked don't-chase (Moment 4 §10.3)";
