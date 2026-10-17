/**
 * [[GTC-385]] (item 59) — dietary marks on dishes: V, VG, GF, DF and NF.
 *
 * The AI tags each dish (`Item.dietaryTags`: VEGETARIAN, VEGAN, GLUTEN_FREE, DAIRY_FREE, NUT_FREE),
 * but the store holds three spellings: the AI's, the old Add and Edit item modals' (`vegetarian`,
 * `glutenFree`) and the seed's (`gluten-free`). This is the one reader of all three. Founder
 * rulings (2026-10-15): all five marks, exactly as the tags say, so a vegan dish without a
 * VEGETARIAN tag shows VG alone (Q6); never in the two drinks sections, never on a job (Q7, Q12);
 * on Moment 2's plan, Moment 3 and the print, never on a guest's page or in an ask (Q8); the key
 * and its warning (Q10), Moment 3's without "tap a dish", which is not true there (Q11).
 *
 * The marks are the AI's guesses: "Stuffed mushrooms" can come back gluten-free, and a dish named
 * "Vegetarian sausages" with no tags at all. The words below say so.
 */

import { CATEGORY_LABELS } from '@/lib/ai/plan-categories';

export type DishMark = 'V' | 'VG' | 'GF' | 'DF' | 'NF';

/** The five, in the order they show: the mark, the tag the AI writes, the tick's word. */
export const DISH_MARKS: ReadonlyArray<{ mark: DishMark; tag: string; word: string }> = [
  { mark: 'V', tag: 'VEGETARIAN', word: 'Vegetarian' },
  { mark: 'VG', tag: 'VEGAN', word: 'Vegan' },
  { mark: 'GF', tag: 'GLUTEN_FREE', word: 'Gluten-free' },
  { mark: 'DF', tag: 'DAIRY_FREE', word: 'Dairy-free' },
  { mark: 'NF', tag: 'NUT_FREE', word: 'Nut-free' },
];

/** Q10: the key, on Moment 2's plan and Moment 3. */
export const DISH_MARKS_KEY = 'V vegetarian, VG vegan, GF gluten-free, DF dairy-free, NF nut-free.';
/** Q10: Moment 2's plan, where a tap on a dish opens its editor. */
export const DISH_MARKS_GUESS_PLAN =
  'These are Gather’s guesses: check with whoever’s cooking, and tap a dish to change them.';
/** Q11: Moment 3, where a tap gives a dish to someone and changes nothing about it. */
export const DISH_MARKS_GUESS_M3 = 'These are Gather’s guesses: check with whoever’s cooking.';
/** Q10: the printed list. */
export const DISH_MARKS_PRINT = 'Marks are Gather’s guesses, check with the cook.';

/** A tag in any of the three spellings, folded: "GLUTEN_FREE", "glutenFree", "gluten-free" → "glutenfree". */
const fold = (tag: string) => tag.toLowerCase().replace(/[^a-z]/g, '');
const BY_FOLD = new Map(DISH_MARKS.map((d) => [fold(d.tag), d.mark]));

/** The marks a dish's tags say, in the order V VG GF DF NF, each once. Anything else is not a mark. */
export function dishMarks(tags: unknown): DishMark[] {
  if (!Array.isArray(tags)) return [];
  const found = new Set<DishMark>();
  for (const t of tags) {
    if (typeof t !== 'string') continue;
    const mark = BY_FOLD.get(fold(t));
    if (mark) found.add(mark);
  }
  return DISH_MARKS.map((d) => d.mark).filter((m) => found.has(m));
}

/** Q7, Q12: no marks in the two drinks sections, none on a job. */
export function marksApply(sectionName: string, kind?: string | null): boolean {
  if (kind === 'TASK') return false;
  const name = sectionName.trim().toLowerCase();
  return (
    name !== CATEGORY_LABELS.drinks_alcoholic.toLowerCase() &&
    name !== CATEGORY_LABELS.drinks_non_alcoholic.toLowerCase()
  );
}

/** The marks a row shows: its tags' marks where marks apply, else none. */
export function shownMarks(
  sectionName: string,
  kind: string | null | undefined,
  tags: unknown
): DishMark[] {
  return marksApply(sectionName, kind) ? dishMarks(tags) : [];
}

/** True when two sets of marks are the same. */
export function sameMarks(a: readonly DishMark[], b: readonly DishMark[]): boolean {
  return a.length === b.length && a.every((m) => b.includes(m));
}

/**
 * The tags to save for these ticks: every tag that is not one of the five kept as it was, then the
 * five ticked, written as the AI writes them.
 */
export function withMarks(tags: unknown, marks: readonly DishMark[]): string[] {
  const kept = (Array.isArray(tags) ? tags : []).filter(
    (t): t is string => typeof t === 'string' && !BY_FOLD.has(fold(t))
  );
  return [...kept, ...DISH_MARKS.filter((d) => marks.includes(d.mark)).map((d) => d.tag)];
}
