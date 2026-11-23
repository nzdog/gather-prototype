/**
 * [[GTC-478]] — the session routes' words and the two inputs they read (a name and a date).
 * The words are the founder's, approved with the plan on 23 Nov 2026 (ruling 1). No screen shows
 * them yet; they are what a caller of the routes reads.
 *
 * Imports nothing, on purpose: pure, so the routes and the tests read the same words.
 */

export const SESSION_WORDS = {
  nameMissing: 'A session needs a name',
  nameTooLong: 'That name is too long (100 characters at most)',
  badDate: "Give the session's date as YYYY-MM-DD",
  notOnEvent: 'That session is not on this event',
  listEachOnce: 'List every session of this event once',
  dateOrder: 'Sessions stay in date order',
  stillHasItems:
    'This session still has items. Move them to another session or to the whole event first.',
} as const;

export const SESSION_NAME_MAX = 100;

/** A session's name: a string, trimmed, 1 to 100 characters. */
export function readSessionName(value: unknown): { name: string } | { error: string } {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return { error: SESSION_WORDS.nameMissing };
  }
  const name = value.trim();
  if (name.length > SESSION_NAME_MAX) return { error: SESSION_WORDS.nameTooLong };
  return { name };
}

/**
 * A session's date: exactly YYYY-MM-DD, a real calendar day, stored at midnight UTC — the way the
 * other writers store a bare day (src/lib/demo/copy.ts), so two sessions on one date carry the same
 * date and their order decides between them.
 */
export function readSessionDate(value: unknown): { date: Date } | { error: string } {
  if (typeof value !== 'string') return { error: SESSION_WORDS.badDate };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return { error: SESSION_WORDS.badDate };
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) {
    return { error: SESSION_WORDS.badDate };
  }
  return { date };
}

/** The order sessions are read in everywhere this ticket reads them: date, then place, then id. */
export const SESSION_ORDER = [
  { date: 'asc' as const },
  { displayOrder: 'asc' as const },
  { id: 'asc' as const },
];
