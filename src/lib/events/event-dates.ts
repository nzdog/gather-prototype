/**
 * [[GTC-366]] (item 8) — the two dates the board may now show, both about the EVENT.
 *
 * The founder's ruling at the walkthrough sort (GTC-189's Fourth ruling, 2026-10-05): *"When
 * answers are due (“Answers by Fri 18 Dec”)"*, and *"Days to teh event as a button the host can
 * click to see if htey want"*. That lifts GTC-192's refusal of a countdown (Moment 4 §3, Ruling 1)
 * for these two things only. Dates for people stay fenced: neither is in the glance payload; the
 * page works them out and hands the board two finished strings.
 *
 * Pure and client-safe: no database, no clock of its own (`now` is passed in).
 */

import { decideBy } from '@/lib/decide-by';
import { isSent, type LifecycleEvent } from '@/lib/lifecycle';

/** W2's words, before the day. */
export const ANSWERS_BY = 'Answers by';
/** W3 — the button that shows the days to the event. */
export const DAYS_TO_GO_BUTTON = 'Days to go';

const NZ = 'Pacific/Auckland';

/** The NZ calendar day of an instant, as YYYY-MM-DD. */
function nzDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: NZ }).format(d);
}

/** Whole NZ calendar days from `now` to `then` (negative once `then`'s day is behind). */
function nzDaysBetween(now: Date, then: Date): number {
  return Math.round((Date.parse(nzDay(then)) - Date.parse(nzDay(now))) / 86_400_000);
}

/** "Fri 18 Dec" in NZ time — Q7: the same shape every time, however near or far. */
export function shortNzDay(d: Date): string {
  return new Intl.DateTimeFormat('en-NZ', {
    timeZone: NZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
    .formatToParts(d)
    .filter((p) => p.type !== 'literal')
    .map((p) => p.value)
    .join(' ');
}

/**
 * When answers are due, for the whole event — Q5, ruled 2026-10-06.
 *
 * The event-level decide-by: the same day a maybe is told to decide by. `decideBy` with no item
 * override, so the event's end date less the event's own offset, else five days — ONE derivation
 * (GTC-180's Stop Condition 10), never a second copy of the rule. An item with its own offset can
 * fall on another day; this is the event's.
 *
 * Q6: null before the press (the clock starts there), and null once that NZ day has passed.
 */
export function answersByDay(
  event: LifecycleEvent & { decideByOffsetHours: number | null },
  now: Date
): string | null {
  if (!isSent(event)) return null;
  const at = decideBy({ dropOffAt: null, decideByOffsetHours: null }, event);
  if (nzDaysBetween(now, at) < 0) return null;
  return shortNzDay(at);
}

/**
 * What the "Days to go" button shows — W4 to W6, Q8. Counted in NZ calendar days to the start
 * date; null once the start day has passed, and then there is no button.
 */
export function daysToGoLine(startDate: Date, now: Date): string | null {
  const days = nzDaysBetween(now, startDate);
  if (days < 0) return null;
  if (days === 0) return 'It’s today.';
  if (days === 1) return '1 day to go.';
  return `${days} days to go.`;
}
