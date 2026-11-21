/**
 * [[GTC-460]] Stage 3, step 3b — LOADING PEOPLE INTO THE LIST: the part with no screen in it.
 *
 * A host pastes a list or chooses a CSV or vCard file; GTC-448's readers (`@/lib/contact-import/`,
 * called here and never changed) turn the text into people, and the people are added to her list in
 * this browser (`./store`). This file holds what sits between the two: the limits (a file up to 5 MB,
 * pasted text up to 100,000 characters), sending a file to the right reader, the summary of a load in
 * the ruled words (W26 to W28), and the three ways forward on a row with a problem (ruling 160).
 *
 * Pure: it holds nothing, keeps nothing between calls, and touches no screen. The only storage it
 * reaches is the one it is handed, through the store's own add. No server, no request, nothing logged.
 * No sentence here carries a name, an email or a number (ruling 10): a problem sentence is always one
 * of GTC-448's seven.
 *
 * Loading the same list twice doubles it (ruling 161): nobody is skipped for being there already.
 */
import { checkEmail } from '@/lib/contact-import/check-email';
import { checkPhone } from '@/lib/contact-import/check-phone';
import { readCsv } from '@/lib/contact-import/read-csv';
import { readPaste } from '@/lib/contact-import/read-paste';
import { readVCard } from '@/lib/contact-import/read-vcard';
import { collapseSpaces } from '@/lib/contact-import/tidy-name';
import type { ContactPerson, ReadResult } from '@/lib/contact-import/types';
import {
  addContacts,
  readContacts,
  type Contact,
  type ContactsStore,
  type WriteResult,
} from '@/lib/contacts/store';
import {
  CONTACTS_WORDS as W,
  addedWords,
  didntFitWords,
  noNameWords,
  turnedWords,
  unreadableWords,
} from '@/lib/contacts/words';

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_PASTE_CHARS = 100000;

export type FileKind = 'csv' | 'vcard';
export type ReadKind = 'paste' | FileKind;
export type Refusal = 'too-big' | 'too-long' | 'wrong-type' | 'unreadable';

/** W29: the sentence for a refusal before reading. */
export function refusalWords(r: Refusal): string {
  switch (r) {
    case 'too-big':
      return W.TOO_BIG;
    case 'too-long':
      return W.TOO_LONG;
    case 'wrong-type':
      return W.WRONG_TYPE;
    default:
      return W.FILE_UNREADABLE;
  }
}

/** Pasted text over the limit is refused before it is read. */
export function checkPaste(text: string): Refusal | null {
  if (text.length > MAX_PASTE_CHARS) return 'too-long';
  return null;
}

/**
 * Which reader a chosen file goes to, by its name and then its type, from what the browser says about
 * it (name, type, size) and before a byte of it is read. A kind we cannot read, or a file over the
 * limit, is refused here.
 */
export function routeFile(f: {
  name?: unknown;
  type?: unknown;
  size?: unknown;
}): { kind: FileKind } | { refusal: Refusal } {
  const name = typeof f.name === 'string' ? f.name.toLowerCase() : '';
  const type = typeof f.type === 'string' ? f.type.toLowerCase() : '';
  const size = typeof f.size === 'number' ? f.size : 0;
  let kind: FileKind | null = null;
  if (name.endsWith('.csv')) kind = 'csv';
  else if (name.endsWith('.vcf')) kind = 'vcard';
  else if (type === 'text/csv') kind = 'csv';
  else if (type === 'text/vcard' || type === 'text/x-vcard') kind = 'vcard';
  if (!kind) return { refusal: 'wrong-type' };
  if (size > MAX_FILE_BYTES) return { refusal: 'too-big' };
  return { kind };
}

/** The text through the reader for its kind. Never throws: text that is not text reads as nothing. */
export function readText(kind: ReadKind, text: string, newId?: () => string): ReadResult {
  const t = typeof text === 'string' ? text : '';
  const opts = newId ? { newId } : undefined;
  if (kind === 'csv') return readCsv(t, opts);
  if (kind === 'vcard') return readVCard(t, opts);
  return readPaste(t, opts);
}

/** One loaded person as the list keeps them. The reader's `tempId` is the id; nothing else is added. */
export function toContact(p: ContactPerson): Contact {
  return {
    id: p.tempId,
    name: p.name,
    ...(p.email !== undefined ? { email: p.email } : {}),
    ...(p.phone !== undefined ? { phone: p.phone } : {}),
    ...(p.problems.length ? { problems: [...p.problems] } : {}),
  };
}

export type LoadSummary = {
  /** Lines, rows or cards the reader saw. */
  found: number;
  /** People the reader made. */
  people: number;
  added: number;
  noName: number;
  /** The reader's own count plus the store's (a name, email or number that is too long). */
  unreadable: number;
  didntFit: number;
  tidied: number;
};

export function summarise(read: ReadResult, written: WriteResult): LoadSummary {
  return {
    found: read.found,
    people: read.people.length,
    added: written.added,
    noName: read.leftOut.noName,
    unreadable: read.leftOut.unreadable + written.unreadable,
    didntFit: written.didntFit,
    tidied: read.tidied,
  };
}

/** What a load did, in the ruled sentences (W26 to W28): each left-out count only above zero. */
export function summaryLines(s: LoadSummary): string[] {
  const out: string[] = [s.people === 0 ? W.NOTHING_FOUND : addedWords(s.added)];
  if (s.tidied > 0) out.push(turnedWords(s.tidied));
  if (s.noName > 0) out.push(noNameWords(s.noName));
  if (s.unreadable > 0) out.push(unreadableWords(s.unreadable));
  if (s.didntFit > 0) out.push(didntFitWords(s.didntFit));
  return out;
}

/** Reads nobody: nothing is written (a list with nothing in it needs no new write). */
function nobody(store: ContactsStore | null, userId: string | null): WriteResult {
  const read = readContacts(store, userId);
  return {
    status: read.status,
    contacts: read.contacts,
    added: 0,
    unreadable: 0,
    didntFit: 0,
  };
}

/** The people a reader found, added to her list. A failed write adds nobody and says why. */
export function loadPeople(
  store: ContactsStore | null,
  userId: string | null,
  read: ReadResult
): { written: WriteResult; summary: LoadSummary } {
  const incoming = read.people.map(toContact);
  const written =
    incoming.length > 0 ? addContacts(store, userId, incoming) : nobody(store, userId);
  return { written, summary: summarise(read, written) };
}

// ── The three ways forward on a row with a problem (ruling 160; the plan's R3) ──────────────────

function make(
  id: string,
  name: string,
  email: string | undefined,
  phone: string | undefined,
  problems: string[]
): Contact {
  return {
    id,
    name,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(problems.length ? { problems } : {}),
  };
}

/** The checks, run again on what a person now has. Only GTC-448's own sentences ever come out. */
export function recheck(d: { email?: string; phone?: string }): string[] {
  const problems: string[] = [];
  if (d.email) {
    const r = checkEmail(d.email);
    if (r.kind === 'bad') problems.push(r.problem);
  }
  if (d.phone) {
    const r = checkPhone(d.phone);
    if (r.kind === 'overseas' || r.kind === 'malformed') problems.push(r.problem);
  }
  return problems;
}

/**
 * Double-check it: the row's name, email and number as she has edited them, with the checks run
 * again. A blank name is not a person (null: nothing to save). A blank email or number is left out.
 * The sentences that came with the load (W4 to W7) are about what was loaded, not about what she has
 * now looked at, so they go; what is still wrong with an email or a number is said again.
 */
export function doubleCheck(
  c: Contact,
  edit: { name: string; email: string; phone: string }
): Contact | null {
  const name = collapseSpaces(String(edit.name ?? ''));
  if (!name) return null;
  const e = checkEmail(String(edit.email ?? ''));
  const p = checkPhone(String(edit.phone ?? ''));
  const email = e.kind === 'none' ? undefined : e.email;
  const phone = p.kind === 'none' ? undefined : p.phone;
  const problems = recheck({ email, phone });
  return make(c.id, name, email, phone, problems);
}

/**
 * Skip it: the flagged detail is left out and the person is kept, with any detail that passed.
 * A person with no problem is returned as they are.
 */
export function skipIt(c: Contact): Contact {
  if (!c.problems?.length) return c;
  const email = c.email && checkEmail(c.email).kind === 'ok' ? c.email : undefined;
  const phone = c.phone && checkPhone(c.phone).kind === 'ok' ? c.phone : undefined;
  return make(c.id, c.name, email, phone, []);
}

/**
 * Use a different way: another number or email replaces the flagged one. An address (it has an "@")
 * takes the email's place and anything else the number's; a flagged detail of the other kind is
 * left out, since this is the way she chose instead. A blank box changes nothing. If what she typed
 * is itself flagged, the row says so again.
 */
export function differentWay(c: Contact, other: string): Contact {
  const value = String(other ?? '').trim();
  if (!value) return c;
  const dropOther = true;
  let email = c.email;
  let phone = c.phone;
  if (value.includes('@')) {
    const e = checkEmail(value);
    if (e.kind !== 'none') email = e.email;
    if (dropOther && phone && checkPhone(phone).kind !== 'ok') phone = undefined;
  } else {
    const p = checkPhone(value);
    if (p.kind !== 'none') phone = p.phone;
    if (dropOther && email && checkEmail(email).kind !== 'ok') email = undefined;
  }
  return make(c.id, c.name, email, phone, recheck({ email, phone }));
}
