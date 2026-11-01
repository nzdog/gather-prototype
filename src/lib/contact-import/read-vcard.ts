import { readRawVCards } from '@/lib/vcard';
import { makeContact, makeIdMaker } from './build-contact';
import type { ContactPerson, ReadOptions, ReadResult } from './types';

/**
 * [[GTC-448]] — the vCard reader. It reads every card with `readRawVCards` (src/lib/vcard.ts), which
 * keeps all of a card's emails and numbers as written, and builds each person the same way the other
 * readers do.
 *
 * Unlike `parseVCF`, a card with no email and no number is KEPT (a person with neither is still a
 * guest). Only a card with no name is dropped, and it is counted in `leftOut.noName`; it is never
 * named from an email or a company. A card the parser throws on is counted in `leftOut.unreadable`.
 *
 * A name from FN is given to the name tidy ("Smith, John" can be written that way); a name built from
 * N is already First Last and is not. Several emails or numbers: one of each, by the chooser.
 */
export function readVCard(text: string, opts?: ReadOptions): ReadResult {
  const newId = makeIdMaker(opts);
  const raw = readRawVCards(text);
  const people: ContactPerson[] = [];
  let noName = 0;
  let tidied = 0;

  for (const card of raw.cards) {
    const made = makeContact(
      {
        name: card.name,
        tidy: card.nameFromFn,
        emails: card.emails,
        phones: card.phones,
      },
      newId
    );
    if (!made) {
      noName++;
      continue;
    }
    people.push(made.person);
    if (made.flipped) tidied++;
  }

  return {
    people,
    found: raw.totalFound,
    leftOut: { noName, unreadable: raw.unreadable },
    tidied,
  };
}
