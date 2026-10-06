/**
 * [[GTC-366]] (item 32) — the way from the greyed Send to the first check not yet ticked.
 *
 * The founder's words, from his walk: *"Go to unchecked in preflight"*. Ruled 2026-10-06 (Q1 to
 * Q4): a line under the greyed Send names the first step not yet ticked (W1); one tap scrolls that
 * step to the top of the screen and puts the focus on its box. It ticks nothing and presses
 * nothing, and Send stays exactly as it is.
 *
 * Pure, so the rule is pinned without a browser (`tests/walkthrough-batch4-test.tsx`). The step
 * titles live here so the steps and the line that names them cannot drift apart.
 */

/** The five steps' titles, in order. The pre-flight's `<Step>`s read them from here. */
export const PREFLIGHT_STEP_TITLES = [
  'What is still loose',
  'Dietary needs',
  'Who Gather talks to',
  'The message, shown',
  'Ready',
] as const;

/** The first step whose box is not ticked, 1 to 5; null once all five are. */
export function firstUnticked(checked: Record<number, boolean>): number | null {
  for (let n = 1; n <= PREFLIGHT_STEP_TITLES.length; n++) if (!checked[n]) return n;
  return null;
}

/** W1, ruled 2026-10-06 — e.g. "Go to step 2: Dietary needs ↑". */
export function goToStepLine(n: number): string {
  return `Go to step ${n}: ${PREFLIGHT_STEP_TITLES[n - 1]} ↑`;
}
