/**
 * [[GTC-460]] Stage 3, step 3a — THE CONTACTS LIST KEPT IN THIS BROWSER.
 *
 * A host loads a list of people (step 3b) so she can pick them as she types a household (step 3c).
 * The list lives in HER browser, under her sign-in, and nowhere else: no server, no database, no
 * request (rulings 36, 38 and 44; the plan's section 5). This file is the only place it is read or
 * written. Pure functions over a small storage interface, no React, so a test hands it a stand-in.
 *
 * WHAT IT KEEPS. One value under `gather:contacts:v1:<user id>`, written whole: a version, the owner
 * and the people. It survives sign-out and carries across her events. Another person who signs in on
 * the same device reads an empty list (hidden, not deleted); with nobody signed in nothing is read,
 * written or deleted and the storage is not touched.
 *
 * WHAT IT NEVER DOES. It never touches a household draft: its three prefixes (below) are not the
 * start of `gather:household-draft:` and none is the start of another, so `sweepDrafts`, which clears
 * drafts on every page load, can never take a contact, a placement or a hand-off note. A value that is
 * corrupt, from an older version, or another person's is ignored, never thrown at. A person over the
 * length limits is left out and counted, because a household draft rejects any text over 500
 * characters and one long name would one day make a whole draft unreadable.
 */

/** The part of `Storage` used here, so a test can hand it a stand-in. */
export interface ContactsStore {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const CONTACTS_PREFIX = 'gather:contacts:';
/** Remembered placements, one value per person per event (written from step 3d). */
export const PLACED_PREFIX = 'gather:contact-placed:';
/** The short-lived hand-off note, in per-tab storage (written from step 3c). */
export const HANDOFF_PREFIX = 'gather:contact-handoff:';
export const CONTACTS_VERSION = 1;

/** The cap, and the length limits (the plan's R11). */
export const MAX_CONTACTS = 2000;
export const MAX_NAME = 200;
export const MAX_EMAIL = 254;
export const MAX_PHONE = 40;
const MAX_PROBLEMS = 8;
const MAX_PROBLEM_TEXT = 300;

/** One person in the list. `id` is the reader's random id, "never sent anywhere". */
export interface Contact {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  /** The reader's own sentences about a detail it could not trust (GTC-448); kept as they are. */
  problems?: string[];
}

export type ReadStatus = 'ok' | 'refused' | 'signed-out';
export interface ListRead {
  status: ReadStatus;
  contacts: Contact[];
}
export type WriteStatus = 'ok' | 'refused' | 'full' | 'signed-out';
export interface WriteResult {
  status: WriteStatus;
  /** The list as it stands after the call (unchanged when the call did not go through). */
  contacts: Contact[];
  added: number;
  /** Left out because they could not be read: no name, no id, an id already held, or too long. */
  unreadable: number;
  /** Left out because the list is full. */
  didntFit: number;
}

interface StoredList {
  v: number;
  userId: string;
  contacts: Contact[];
}

export function contactsKey(userId: string): string {
  return `${CONTACTS_PREFIX}v${CONTACTS_VERSION}:${userId}`;
}
const placedHead = (userId: string) => `${PLACED_PREFIX}v${CONTACTS_VERSION}:${userId}:`;
const handoffHead = (userId: string) => `${HANDOFF_PREFIX}v${CONTACTS_VERSION}:${userId}:`;

/** This browser's localStorage, or null where touching it throws (or there is no window). */
export function browserContactsStore(): ContactsStore | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}
/** This tab's sessionStorage (the hand-off note), or null where touching it throws. */
export function browserTabStore(): ContactsStore | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

const isText = (v: unknown): v is string => typeof v === 'string';

/** The person as it may be kept, or null when it cannot be: no id, no name, or over a limit. */
function cleanContact(c: unknown): Contact | null {
  const o = c as Contact;
  if (!o || typeof o !== 'object' || !isText(o.id) || o.id === '' || !isText(o.name)) return null;
  const name = o.name.trim();
  const email = o.email === undefined ? '' : o.email;
  const phone = o.phone === undefined ? '' : o.phone;
  if (name === '' || !isText(email) || !isText(phone)) return null;
  const tooLong = name.length > MAX_NAME || email.length > MAX_EMAIL || phone.length > MAX_PHONE;
  if (tooLong) return null;
  let problems: string[] | undefined;
  if (o.problems !== undefined) {
    if (!Array.isArray(o.problems) || o.problems.length > MAX_PROBLEMS) return null;
    if (!o.problems.every((p) => isText(p) && p.length <= MAX_PROBLEM_TEXT)) return null;
    problems = o.problems.length ? [...o.problems] : undefined;
  }
  return {
    id: o.id,
    name,
    ...(email !== '' ? { email } : {}),
    ...(phone !== '' ? { phone } : {}),
    ...(problems ? { problems } : {}),
  };
}

function parseList(raw: string | null, userId: string): Contact[] {
  if (raw === null) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  const s = v as StoredList;
  if (!s || typeof s !== 'object' || s.v !== CONTACTS_VERSION || s.userId !== userId) return [];
  if (!Array.isArray(s.contacts)) return [];
  const out: Contact[] = [];
  const seen = new Set<string>();
  for (const c of s.contacts) {
    const clean = cleanContact(c);
    if (clean && !seen.has(clean.id)) {
      seen.add(clean.id);
      out.push(clean);
    }
  }
  return out.slice(0, MAX_CONTACTS);
}

/** Her list. Nobody signed in: nothing, and the storage is not touched. */
export function readContacts(store: ContactsStore | null, userId: string | null): ListRead {
  if (!userId) return { status: 'signed-out', contacts: [] };
  if (!store) return { status: 'refused', contacts: [] };
  try {
    return { status: 'ok', contacts: parseList(store.getItem(contactsKey(userId)), userId) };
  } catch {
    return { status: 'refused', contacts: [] };
  }
}

function isQuota(e: unknown): boolean {
  const o = e as { name?: string; code?: number; message?: string };
  return (
    o?.name === 'QuotaExceededError' ||
    o?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    o?.code === 22 ||
    o?.code === 1014 ||
    /quota/i.test(String(o?.message ?? ''))
  );
}

/** The whole list in one write: it goes in whole or not at all. */
function writeWhole(store: ContactsStore, key: string, value: StoredList): WriteStatus {
  try {
    store.setItem(key, JSON.stringify(value));
    return 'ok';
  } catch (e) {
    return isQuota(e) ? 'full' : 'refused';
  }
}

const result = (
  status: WriteStatus,
  contacts: Contact[],
  extra: Partial<Pick<WriteResult, 'added' | 'unreadable' | 'didntFit'>> = {}
): WriteResult => ({ status, contacts, added: 0, unreadable: 0, didntFit: 0, ...extra });

/**
 * Adds people to the end of her list. Those that fit and can be read are added; the rest are
 * counted, never dropped silently. If the write fails nothing is added and the list is as it was.
 */
export function addContacts(
  store: ContactsStore | null,
  userId: string | null,
  incoming: unknown[]
): WriteResult {
  if (!userId) return result('signed-out', []);
  const read = readContacts(store, userId);
  if (read.status !== 'ok' || !store) return result('refused', read.contacts);
  const have = new Set(read.contacts.map((c) => c.id));
  const fits: Contact[] = [];
  let unreadable = 0;
  let didntFit = 0;
  for (const raw of incoming) {
    const clean = cleanContact(raw);
    if (!clean || have.has(clean.id)) {
      unreadable++;
    } else if (read.contacts.length + fits.length >= MAX_CONTACTS) {
      didntFit++;
    } else {
      have.add(clean.id);
      fits.push(clean);
    }
  }
  const next = [...read.contacts, ...fits];
  const key = contactsKey(userId);
  const written = writeWhole(store, key, { v: CONTACTS_VERSION, userId, contacts: next });
  if (written !== 'ok') return result(written, read.contacts, { unreadable, didntFit });
  return result('ok', next, { added: fits.length, unreadable, didntFit });
}

/** Takes one person out of her list (nothing is asked for one person). */
export function removeContact(
  store: ContactsStore | null,
  userId: string | null,
  id: string
): WriteResult {
  if (!userId) return result('signed-out', []);
  const read = readContacts(store, userId);
  if (read.status !== 'ok' || !store) return result('refused', read.contacts);
  if (!read.contacts.some((c) => c.id === id)) return result('ok', read.contacts);
  const next = read.contacts.filter((c) => c.id !== id);
  const written = writeWhole(store, contactsKey(userId), {
    v: CONTACTS_VERSION,
    userId,
    contacts: next,
  });
  return written === 'ok' ? result('ok', next) : result(written, read.contacts);
}

function keysStartingWith(store: ContactsStore, head: string): string[] {
  const keys: string[] = [];
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(head)) keys.push(k);
  }
  return keys;
}

/**
 * Clear: her list, every placement she has remembered (for any event) and her hand-off note go; no
 * one else's, and no draft. The keys are gathered before any is removed, so none is skipped.
 */
export function clearContacts(
  store: ContactsStore | null,
  tabStore: ContactsStore | null,
  userId: string | null
): { status: 'ok' | 'refused' | 'signed-out' } {
  if (!userId) return { status: 'signed-out' };
  if (!store) return { status: 'refused' };
  try {
    const gone = [contactsKey(userId), ...keysStartingWith(store, placedHead(userId))];
    for (const k of gone) store.removeItem(k);
    if (tabStore) {
      for (const k of keysStartingWith(tabStore, handoffHead(userId))) tabStore.removeItem(k);
    }
    return { status: 'ok' };
  } catch {
    return { status: 'refused' };
  }
}
