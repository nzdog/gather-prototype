/**
 * [[GTC-460]] Stage 3, step 3c — THE MATCH: which of her loaded people to offer for what she has typed.
 *
 * Pure, and it reaches nothing: it takes her list as its argument and imports only a type. No server,
 * no database, no network, no storage (D10). It never builds a regular expression from what she types:
 * what is typed is only ever compared as text, so a bracket, a dot or a star means nothing special.
 *
 * What matches (D8 to D11, R5):
 *   - the START of any word, ignoring capitals and macrons ("marama" finds "Mārama", "tane" finds
 *     "Aroha Tane-Brown"); never the middle of a word;
 *   - several words: each typed word must start a DIFFERENT word, in any order ("tane mer" finds
 *     "Mere Tane"; "mere mere" does not);
 *   - names first; then people whose email or number matches ("021 555" finds "+64 21 555 …", read as
 *     the local 021 form too). A number is only compared when what she typed is digits.
 *   - up to six lines; nothing for an empty or blank box; the order is the order of her list inside
 *     each group, so it never jumps about.
 * A line can be greyed with a reason (`taken`): it stays in the list, counts toward the six, and the
 * form will not pick it.
 */
import type { Contact } from '@/lib/contacts/store';

export const MAX_LINES = 6;

export type PickLine = {
  contact: Contact;
  /** What matched: the name, else the email, else the number. */
  via: 'name' | 'email' | 'phone';
  /** Why the line is greyed, if it is (the form gives the sentence). */
  taken?: string;
};

/** Lower case with macrons and other accents taken off, so "Mārama" and "marama" are the same. */
export function fold(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** The words of some text, folded: runs of letters and digits. */
function wordsOf(text: string): string[] {
  return fold(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w !== '');
}

/** Every typed word starts a different word of the text. */
function startsEach(typed: string[], text: string): boolean {
  const free = wordsOf(text);
  for (const qw of typed) {
    const at = free.findIndex((w) => w.startsWith(qw));
    if (at < 0) return false;
    free.splice(at, 1);
  }
  return true;
}

/** Digits typed against a number, read as written and as the local 0-form of a +64 number. */
function phoneHit(digits: string, phone: string): boolean {
  const have = phone.replace(/\D/g, '');
  if (digits === '' || have === '') return false;
  if (have.startsWith(digits)) return true;
  return have.startsWith('64') && `0${have.slice(2)}`.startsWith(digits);
}

export function matchContacts(
  list: Contact[],
  typed: string,
  opts?: { max?: number; taken?: (c: Contact) => string | undefined }
): PickLine[] {
  if (typeof typed !== 'string' || !Array.isArray(list)) return [];
  const q = fold(typed).trim();
  if (q === '') return [];
  const qWords = q.split(/\s+/);
  const digits = /[a-z]/.test(q) ? '' : q.replace(/\D/g, '');
  const max = opts?.max ?? MAX_LINES;
  const named: PickLine[] = [];
  const other: PickLine[] = [];
  for (const c of list) {
    const reason = opts?.taken?.(c);
    const base = { contact: c, ...(reason ? { taken: reason } : {}) };
    if (startsEach(qWords, c.name)) {
      named.push({ ...base, via: 'name' });
    } else if (c.email && startsEach(qWords, c.email)) {
      other.push({ ...base, via: 'email' });
    } else if (c.phone && phoneHit(digits, c.phone)) {
      other.push({ ...base, via: 'phone' });
    }
  }
  return [...named, ...other].slice(0, max);
}
