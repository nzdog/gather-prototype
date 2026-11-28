/**
 * [[GTC-488]] B — "1 pieces", "x1 pieces", "1 trays" (the founder's walk of GTC-483, 26 Nov 2026).
 * The singular of each word the plan's unit list offers (Moment 2's `COMMON_UNITS`), W1 to W18,
 * and one rule (the founder's ruling 7, 28 Nov 2026): at exactly 1, a word that is exactly one of
 * the list's words, same letters and same case, reads as its singular. Every other word, and every
 * other amount, reads exactly as stored.
 *
 * Why by spelling: the plan's write and Moment 2's unit list store a unit as words (`CUSTOM` with
 * the word beside it), so a word picked from the list and the same word typed cannot be told apart.
 * Ruling 7 narrows the earlier ruling that a custom unit is left exactly as typed: a typed word that
 * matches the list exactly is treated as the list's word. "1 big bowl", "1 pavlovas" and "1 Pieces"
 * stay as they are.
 *
 * kg, g and ml (W1, W2, W4) are symbols, and "dozen" (W17) reads the same at any amount, so they
 * have no entry. "packs" (W18) is not on the list: it is the word an old fixed unit shows, and one
 * the AI is told it may use.
 *
 * Pure: no imports, so a screen, a server read and a test can all call it.
 */

/** W3, W5 to W16 and W18: each list word that changes at 1, and its singular. */
export const UNIT_SINGULARS: Readonly<Record<string, string>> = {
  litres: 'litre',
  bottles: 'bottle',
  cans: 'can',
  trays: 'tray',
  bowls: 'bowl',
  plates: 'plate',
  pieces: 'piece',
  servings: 'serving',
  bags: 'bag',
  boxes: 'box',
  packets: 'packet',
  bunches: 'bunch',
  loaves: 'loaf',
  packs: 'pack',
};

/** The unit word for this amount: the singular at exactly 1 for a list word, else the word as stored. */
export function unitWordFor(amount: number | string | null | undefined, word: string): string {
  if (amount === null || amount === undefined || amount === '') return word;
  if (Number(amount) !== 1) return word;
  return Object.prototype.hasOwnProperty.call(UNIT_SINGULARS, word) ? UNIT_SINGULARS[word] : word;
}
