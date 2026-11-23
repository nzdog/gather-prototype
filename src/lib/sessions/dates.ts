/**
 * [[GTC-479]] — THE DATE RULE FOR SESSIONS (founder ruling 1, decision 1, 24 Nov 2026).
 *
 * A session's date is a calendar date. Two forms of it are stored today, 13 hours apart:
 *   - the seed's, at NZ midnight ("25 Dec" held as 24 Dec 11:00 UTC);
 *   - GTC-478's routes', the demo copy's and checkout's, at midnight UTC ("25 Dec" held as
 *     25 Dec 00:00 UTC). New sessions are written this way (`readSessionDate` in ./input).
 * Both are the right day in NZ time. So every reader turns a stored date into its date HERE, as the
 * NZ calendar day of what is stored, and compares, groups and sorts by that answer, never by the
 * stored time. No existing row is changed (no data change, no migration). Every later ticket reads
 * session dates through this file.
 *
 * Imports nothing, on purpose: pure, so the routes, the card and the tests read dates one way.
 */

const NZ = 'Pacific/Auckland';
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** A stored session date (or an event's start or end) as its NZ calendar day, YYYY-MM-DD. */
export function sessionDateKey(stored: Date | string): string {
  const d = new Date(stored);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The numbers of a YYYY-MM-DD date, or null when it is not one. */
function partsOf(key: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** A date's words, the same shape every time: "Thu 24 Dec". */
export function sessionDateWords(key: string): string {
  const p = partsOf(key);
  if (!p) return '';
  const wd = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return `${WEEKDAYS[wd]} ${p.d} ${MONTHS[p.m - 1]}`;
}

/** Every date from `startKey` to `endKey`, both included, in order ([] when end is before start). */
export function datesFrom(startKey: string, endKey: string): string[] {
  const a = partsOf(startKey);
  const b = partsOf(endKey);
  if (!a || !b) return [];
  const out: string[] = [];
  const day = new Date(Date.UTC(a.y, a.m - 1, a.d));
  const last = Date.UTC(b.y, b.m - 1, b.d);
  // At most a year of dates: a guard, never reached by a real event.
  while (day.getTime() <= last && out.length < 366) {
    out.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

/**
 * Sessions in their order: their date (by the rule above), then their place, then the order made
 * (the id). For an event whose sessions share one stored form this is exactly the order GTC-478's
 * `SESSION_ORDER` gives; for one with both forms on a date, it keeps them on that date in place order.
 */
export function sortSessions<T extends { id: string; date: Date | string; displayOrder: number }>(
  rows: readonly T[]
): T[] {
  return rows
    .map((row) => ({ row, key: sessionDateKey(row.date) }))
    .sort(
      (x, y) =>
        (x.key < y.key ? -1 : x.key > y.key ? 1 : 0) ||
        x.row.displayOrder - y.row.displayOrder ||
        (x.row.id < y.row.id ? -1 : x.row.id > y.row.id ? 1 : 0)
    )
    .map((x) => x.row);
}
