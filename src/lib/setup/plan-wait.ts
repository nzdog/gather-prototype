/**
 * [[GTC-385]] (item 58) — the bar while Generate plan waits.
 *
 * There is no true progress to show: finalize-plan is ONE AI call, not streamed. So the bar is an
 * honest estimate, from the generations measured in earlier dev logs (full plans 61s and 80s;
 * near-empty questions under 6s): 95 × (1 − e^(−t / 35s)) per cent — about 55 at 30s, 78 at 60s,
 * 85 at 80s. Founder rulings (2026-10-15): it never passes 95 until the plan has really arrived,
 * never goes back, then goes to 100 (Q3); the five stage words below, exactly, in this order,
 * changing on the clock every 12 to 16 seconds across that curve; the last stays until the plan
 * arrives; none claims a count or says it is done (Q3).
 *
 * Pure: the caller passes the time since the press, so a suite can drive it on a made-up clock.
 */

/** The bar's ceiling before the plan has arrived. */
export const PLAN_WAIT_CAP = 95;

/** The curve's time constant, from the measured generations. */
const PLAN_WAIT_TAU_MS = 35_000;

/** Q3, ruled verbatim: five stage words, in order, a real ellipsis. */
export const PLAN_WAIT_STAGES = [
  'Reading your answers…',
  'Choosing the dishes…',
  'Working out quantities…',
  'Checking dietary needs…',
  'Putting the plan in order…',
] as const;

/** When each stage begins, in ms after the press: 0, 12, 26, 42 and 58 seconds. */
export const PLAN_WAIT_STAGE_AT_MS = [0, 12_000, 26_000, 42_000, 58_000] as const;

/**
 * The bar's percent: the estimate while waiting (never above the cap), 100 once arrived.
 * [[GTC-488]] E: `tauMs` is the curve's time constant; left out, it is Generate's (35 s). One
 * category's Regenerate passes `CATEGORY_WAIT_TAU_MS`.
 */
export function planWaitPercent(
  elapsedMs: number,
  arrived: boolean,
  tauMs: number = PLAN_WAIT_TAU_MS
): number {
  if (arrived) return 100;
  const t = Math.max(0, Number.isFinite(elapsedMs) ? elapsedMs : 0);
  return Math.min(PLAN_WAIT_CAP, PLAN_WAIT_CAP * (1 - Math.exp(-t / tauMs)));
}

/** The stage words for the time since the press; the last one stays. */
export function planWaitStage(elapsedMs: number): (typeof PLAN_WAIT_STAGES)[number] {
  let i = 0;
  for (let s = 0; s < PLAN_WAIT_STAGE_AT_MS.length; s++) {
    if (elapsedMs >= PLAN_WAIT_STAGE_AT_MS[s]) i = s;
  }
  return PLAN_WAIT_STAGES[i];
}

/*
 * [[GTC-488]] E — the bar while a Regenerate waits (the founder's rulings 5 and 6, 28 Nov 2026).
 * The whole plan keeps Generate's five words and clock above: it is the same one AI call over the
 * same answers. One category gets four stages and a faster clock (measured at about 30 seconds on
 * the founder's Mac): "Choosing the dishes…" and "Checking dietary needs…" are left out, because a
 * category can be drinks. The bar is taken away when the wait ends, never filled to 100: the plan
 * view is not told whether the wait ended well.
 */

/** One category's time constant: about 54 per cent at 10 s, 87 at 30 s, 93 at 45 s. */
export const CATEGORY_WAIT_TAU_MS = 12_000;

/** One category's four stages, in order (W26 and W27 new; the other two are Generate's). */
export const CATEGORY_WAIT_STAGES = [
  'Reading your answers…',
  'Choosing new suggestions…',
  'Working out quantities…',
  'Putting them in order…',
] as const;

/** When each of one category's stages begins, in ms after the press: 0, 6, 14 and 22 seconds. */
export const CATEGORY_WAIT_STAGE_AT_MS = [0, 6_000, 14_000, 22_000] as const;

/** One category's stage words for the time since the press; the last one stays. */
export function categoryWaitStage(elapsedMs: number): (typeof CATEGORY_WAIT_STAGES)[number] {
  let i = 0;
  for (let s = 0; s < CATEGORY_WAIT_STAGE_AT_MS.length; s++) {
    if (elapsedMs >= CATEGORY_WAIT_STAGE_AT_MS[s]) i = s;
  }
  return CATEGORY_WAIT_STAGES[i];
}

/** The bar's name for a screen reader while a Regenerate waits (W24, W25). */
export const REGENERATE_WAIT_WORDS = {
  PLAN: 'Regenerating the plan',
  category: (name: string) => `Regenerating ${name}`,
} as const;
