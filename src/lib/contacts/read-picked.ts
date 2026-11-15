/**
 * [[GTC-460]] Stage 3, step 3b — THE PHONE PICKER'S PEOPLE, MADE THE WAY THE READERS MAKE THEM.
 *
 * The phone's contact picker hands back a list of items, each with optional lists of names, emails
 * and numbers (`name`, `email`, `tel`). Each is turned into a person by GTC-448's `makeContact`, the
 * one place a person is made, so a picked person is tidied, checked and flagged exactly as a pasted
 * one is: "Smith, John" is turned round, a number that is not a New Zealand one is kept and flagged,
 * and several emails or numbers keep one and say so.
 *
 * Counted the way the paste reader counts: an item with nothing in it is not a line at all; an item
 * with an email or a number and no name is "had no name" and is left out. Anything that is not the
 * shape the picker gives is ignored, and nothing here throws.
 */
import { makeContact, makeIdMaker } from '@/lib/contact-import/build-contact';
import type { ContactPerson, ReadResult } from '@/lib/contact-import/types';

/** A list of text values: a string alone counts as a list of one; anything that is not text is ignored. */
function textsOf(v: unknown): string[] {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  return raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter((x) => x !== '');
}

export function readPicked(items: unknown, newId?: () => string): ReadResult {
  const nextId = makeIdMaker(newId ? { newId } : undefined);
  const people: ContactPerson[] = [];
  let found = 0;
  let noName = 0;
  let tidied = 0;
  for (const item of Array.isArray(items) ? items : []) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const names = textsOf(o.name);
    const emails = textsOf(o.email);
    const phones = textsOf(o.tel);
    if (names.length === 0 && emails.length === 0 && phones.length === 0) continue;
    found++;
    if (names.length === 0) {
      noName++;
      continue;
    }
    const made = makeContact(
      {
        name: names[0],
        tidy: true,
        emails: emails.map((value) => ({ value })),
        phones: phones.map((value) => ({ value })),
      },
      nextId
    );
    if (!made) {
      noName++;
      continue;
    }
    people.push(made.person);
    if (made.flipped) tidied++;
  }
  return { people, found, leftOut: { noName, unreadable: 0 }, tidied };
}
