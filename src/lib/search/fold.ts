/**
 * [[GTC-373]] (Q4) — how both searches read what she types: case and accents ignored on both sides,
 * so a typed "hāngī" finds "Hangi-inspired" and "canape" finds "canapés"; every word typed must
 * appear, in any order, inside the words; nothing is looked for under two letters.
 *
 * Shared by the menu's search (`src/lib/moments/menu-search.ts`) and the board's
 * (`src/lib/search/event-search.ts`), so the two can never read the same typing differently.
 */

/** Lower case, with every accent and macron taken off. */
export function foldForSearch(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** The words she typed, folded; null until there are two letters to look for. */
export function searchTerms(query: string): string[] | null {
  const folded = foldForSearch(query).trim();
  if (folded.replace(/\s+/g, '').length < 2) return null;
  return folded.split(/\s+/);
}

/** Whether every typed word appears in `text`. */
export function matchesAll(text: string, terms: readonly string[]): boolean {
  const folded = foldForSearch(text);
  return terms.every((t) => folded.includes(t));
}
