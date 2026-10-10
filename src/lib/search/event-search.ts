/**
 * [[GTC-373]] (item 13) — the board's "Find someone or something": what it reads, and what each
 * result says.
 *
 * Ruled 2026-10-08 ("Approve all (Recommended)"): W13 to W24 and Q11 to Q21 as proposed. It only
 * finds: nothing here writes, sends or asks.
 *
 * WHAT IT READS (Q13): the list the print door reads, `GET /api/events/[id]/items`, narrowed the
 * moment it arrives to each item's name, its holder's person id and whether they handed it back
 * (`narrowItems`), so no other field of the row stays in the page; and the people from the board's
 * own payload. Outside Ruling 1's fence, as the print's `src/lib/print/item-list.ts` is; the island
 * that uses it, `EventSearch.tsx`, is inside it.
 *
 * WHAT EACH RESULT SAYS (Q14 to Q18): items first, then people, in plan and board order. An item
 * names who holds it (W15), "Nobody yet" (W16), or who handed it back (W17); a person names what they
 * hold (W18), or says "Nothing yet" (W19), "Just attending" (W20) or "Not coming" (W21). The host and
 * children read like anyone. A holder the board does not show reads as nobody yet.
 */

import { matchesAll, searchTerms } from './fold';

/** The ruled words. */
export const EVENT_WORDS = {
  /** W13 */
  BUTTON: 'Find someone or something',
  /** W14 */
  LABEL: 'A name, or something to bring',
  /** W16 */
  NOBODY_YET: 'Nobody yet',
  /** W19 */
  NOTHING_YET: 'Nothing yet',
  /** W20 — Moment 3's own words for the mark. */
  JUST_ATTENDING: 'Just attending',
  /** W21 */
  NOT_COMING: 'Not coming',
  /** W17 and W18 — the board's own words for a declined row. */
  HANDED_BACK: 'handed it back',
  /** W22 */
  LOADING: 'Getting the list…',
  /** W23 */
  FAILED: 'That didn’t work. Close this and try again.',
  /** W24 */
  nothing: (typed: string) => `Nobody and nothing on this event matches “${typed}”.`,
  /** W10, as on the menu. */
  more: (n: number) => `${n} more. Keep typing to narrow it.`,
  /** [[GTC-374]] W15 — the button on an invites-only board: there is nothing to find but people. */
  BUTTON_INVITES_ONLY: 'Find someone',
  /** [[GTC-374]] W16 — the box's label there. */
  LABEL_INVITES_ONLY: 'A name',
  /** [[GTC-374]] W17 — a person's answer there, the board's own words (`readingStatusWord`). */
  CONFIRMED: 'Confirmed',
  NO_ANSWER_YET: 'No answer yet',
  /** [[GTC-374]] W18 — nothing found there. */
  nothingInvitesOnly: (typed: string) => `Nobody on this event matches “${typed}”.`,
} as const;

/** How many results show before W10. */
export const EVENT_SHOWN = 8;

/** One person on the board, as the search needs them. */
export interface SearchPerson {
  personEventId: string;
  personId: string;
  name: string;
  /** The strip's state; `OUT` reads W21. */
  state: string;
  /** Moment 3's "Just attending" mark (Q16). */
  justAttending: boolean;
}

/** All the search keeps of an item (Q13). */
export interface SearchItem {
  name: string;
  holderId: string | null;
  handedBack: boolean;
}

export interface EventHit {
  kind: 'item' | 'person';
  key: string;
  /** The left half: the item's or the person's name. */
  words: string;
  /** The right half: who, or what. */
  answer: string;
  /** The strip a tap goes to (Q19); null when nobody holds the item (Q20). */
  target: string | null;
}

const text = (v: unknown): string | null => (typeof v === 'string' ? v : null);

/** Q13 — the item list, down to the three facts the search shows, the moment it arrives. */
export function narrowItems(raw: unknown[]): SearchItem[] {
  return raw.map((r) => {
    const row = (r ?? {}) as Record<string, any>;
    const held = (row.assignment ?? null) as Record<string, any> | null;
    return {
      name: text(row.name) ?? '',
      holderId: held ? (text(held.person?.id) ?? text(held.personId)) : null,
      handedBack: held?.response === 'DECLINED',
    };
  });
}

/** Every result for what she typed, items first; none under two letters. */
export function findInEvent(
  people: readonly SearchPerson[],
  items: readonly SearchItem[],
  query: string,
  /**
   * [[GTC-374]] (Q15) — an invites-only event: nobody brings anything, so a person's answer is
   * whether they're coming (W17): a yes (green) "Confirmed", a no "Not coming", anyone else "No
   * answer yet". Absent is a planned event, answered as batch 6 ruled.
   */
  opts: { invitesOnly?: boolean } = {}
): EventHit[] {
  const terms = searchTerms(query);
  if (!terms) return [];
  const byId = new Map(people.map((p) => [p.personId, p]));
  const hits: EventHit[] = [];
  items.forEach((item, i) => {
    if (!matchesAll(item.name, terms)) return;
    const holder = item.holderId ? byId.get(item.holderId) : undefined;
    const answer = !holder
      ? EVENT_WORDS.NOBODY_YET
      : item.handedBack
        ? `${EVENT_WORDS.NOBODY_YET} (${holder.name} ${EVENT_WORDS.HANDED_BACK})`
        : holder.name;
    const target = holder && !item.handedBack ? holder.personEventId : null;
    hits.push({ kind: 'item', key: `item:${i}`, words: item.name, answer, target });
  });
  for (const person of people) {
    if (!matchesAll(person.name, terms)) continue;
    const held = items.filter((item) => item.holderId === person.personId);
    const answer = opts.invitesOnly
      ? person.state === 'OUT'
        ? EVENT_WORDS.NOT_COMING
        : person.state === 'GREEN'
          ? EVENT_WORDS.CONFIRMED
          : EVENT_WORDS.NO_ANSWER_YET
      : person.state === 'OUT'
        ? EVENT_WORDS.NOT_COMING
        : held.length > 0
          ? held
              .map((item) =>
                item.handedBack ? `${item.name} (${EVENT_WORDS.HANDED_BACK})` : item.name
              )
              .join(', ')
          : person.justAttending
            ? EVENT_WORDS.JUST_ATTENDING
            : EVENT_WORDS.NOTHING_YET;
    hits.push({
      kind: 'person',
      key: `person:${person.personEventId}`,
      words: person.name,
      answer,
      target: person.personEventId,
    });
  }
  return hits;
}

/** A result as one line: "Roast turkey: Gus Henderson". */
export function hitLine(hit: EventHit): string {
  return `${hit.words}: ${hit.answer}`;
}
