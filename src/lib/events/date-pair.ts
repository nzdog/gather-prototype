/**
 * [[GTC-385]] (item 53) — the event's date: one date, with a link for more days.
 *
 * Founder ruling Q1 (2026-10-15): the forms ask for one "Date"; a small link, "It runs over more
 * than one day", opens "First day" and "Last day", and "Just the one day" closes it again. With one
 * day the end date stored equals the start. The end box exists only while the link is open, so a
 * single date always sends end = start: Pay & Create is never blocked by a hidden required field,
 * and the post-payment route (`POST /api/events`, which refuses an EMPTY end after she has paid)
 * never sees an empty one. Q2: Edit Event's PATCH and the clone route refuse a backwards pair.
 *
 * Pure and client-safe: no clock, no database. The form's dates are YYYY-MM-DD strings, which
 * compare as text; the routes compare instants (`endBeforeStart`).
 */

export const DATE_WORDS = {
  DATE: 'Date',
  MORE_DAYS: 'It runs over more than one day',
  FIRST_DAY: 'First day',
  LAST_DAY: 'Last day',
  ONE_DAY: 'Just the one day',
  BACKWARDS: 'The last day can’t be before the first day.',
} as const;

/** What the date fields hold: the first day, the last day, and whether "more days" is open. */
export interface DatePairValue {
  first: string;
  last: string;
  moreDays: boolean;
}

/** The calendar day of a stored date or a form value, as YYYY-MM-DD (as Edit Event always read it). */
export function dayOf(value: string | Date | null | undefined): string {
  if (!value) return '';
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? '' : value.toISOString().slice(0, 10);
  return value.split('T')[0];
}

/** True when the end is before the start. Strings or Dates; an unreadable date is never "backwards". */
export function endBeforeStart(start: string | Date, end: string | Date): boolean {
  const a = start instanceof Date ? start.getTime() : Date.parse(start);
  const b = end instanceof Date ? end.getTime() : Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return false;
  return b < a;
}

/**
 * The fields for a stored event: closed when it is one day; open when it runs over more days, and
 * open too when it is backwards, so she sees both and the line.
 */
export function datePairFrom(
  start: string | Date | null,
  end: string | Date | null
): DatePairValue {
  const first = dayOf(start);
  const last = dayOf(end) || first;
  return { first, last, moreDays: !!first && last !== first };
}

/** Opening "more days": the last day starts at the first, unless a later one is already there. */
export function openMoreDays(v: DatePairValue): DatePairValue {
  return { ...v, moreDays: true, last: v.last && v.last >= v.first ? v.last : v.first };
}

/** "Just the one day": closed, and the last day put back to the first. */
export function closeMoreDays(v: DatePairValue): DatePairValue {
  return { ...v, moreDays: false, last: v.first };
}

/** A new first day; while open, a last day it would pass moves with it. */
export function changeFirst(v: DatePairValue, first: string): DatePairValue {
  const last = v.moreDays && v.last && first && v.last < first ? first : v.last;
  return { ...v, first, last };
}

/** The backwards line, or null. Only an open pair can be backwards: closed sends one day. */
export function datePairProblem(v: DatePairValue): string | null {
  return v.moreDays && v.first && v.last && v.last < v.first ? DATE_WORDS.BACKWARDS : null;
}

/** What is sent: one day sends end = start; open with no last day sends one day too. */
export function datePairToSend(v: DatePairValue): { startDate: string; endDate: string } {
  return { startDate: v.first, endDate: v.moreDays && v.last ? v.last : v.first };
}
