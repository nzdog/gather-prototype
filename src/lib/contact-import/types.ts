/**
 * [[GTC-448]] — contact import, piece one: the shapes and the seven sentences.
 *
 * Pure data and types. Nothing here stores, sends or logs anything, and nothing imports a server
 * module: the whole folder runs in the browser. A loaded person is never given a role and is never
 * decided to be a child; those are set only in the existing household form.
 */

/**
 * W1 to W7, the only sentences this code gives a host (ruling 10). None carries contact content,
 * so a problem can be counted or logged without exposing a name, number or address.
 */
export const WORDS = {
  W1: "This email address doesn't look right.",
  W2: 'This looks like an overseas number. Gather only handles New Zealand numbers for now.',
  W3: "This doesn't look like a New Zealand phone number.",
  W4: 'More than one email came with this person. We kept one.',
  W5: 'More than one number came with this person. We kept one.',
  W6: "We couldn't tell which part of this name is the first name, so we left it as it was.",
  W7: "Part of this person's details didn't look like a name, number or email, so we left it out.",
} as const;

/** One loaded person. An absent email or phone is a missing key, never null or an empty string. */
export type ContactPerson = {
  /** Browser-only; never sent anywhere and never a Person id. */
  tempId: string;
  /** Trimmed, single spaces, never empty. */
  name: string;
  /** Trimmed and lower-cased; kept (and flagged) even when it fails the check. */
  email?: string;
  /** The +64 form when it passes; as typed, spaces collapsed, when it is flagged. */
  phone?: string;
  /** Plain-English problems, W1 to W7 only; empty when there are none. */
  problems: string[];
};

export type ReadResult = {
  people: ContactPerson[];
  /** Non-blank lines, data rows or cards seen (not a skipped heading or header row). */
  found: number;
  /** Counts only: what was not loaded, and why. */
  leftOut: { noName: number; unreadable: number };
  /** Names the flip rule turned from Last, First into First Last. */
  tidied: number;
};

export type ReadOptions = {
  /** Makes a tempId. Tests inject a counter; the default is a random id. */
  newId?: () => string;
};

/** What a CSV column is taken to hold. Email and phone columns may repeat. */
export type Field = 'first' | 'last' | 'name' | 'email' | 'phone' | 'ignore';
