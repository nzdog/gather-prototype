/**
 * [[GTC-385]] (item 59) — a dish's marks (V, VG, GF, DF, NF), drawn the same on Moment 2's plan and
 * Moment 3, and the key line above the list. The rules and the words are in
 * src/lib/items/dish-marks.ts. Hook-free: both views render it, and so do the suites.
 */

import { DISH_MARKS, type DishMark } from '@/lib/items/dish-marks';

const WORD = new Map(DISH_MARKS.map((d) => [d.mark, d.word]));

/** The marks after a dish's name, outside its button; nothing when there are none. */
export function DishMarkTags({ marks }: { marks: readonly DishMark[] }) {
  if (marks.length === 0) return null;
  return (
    <span data-dish-marks className="ml-1.5 inline-flex shrink-0 gap-1 align-middle">
      {marks.map((m) => (
        <abbr
          key={m}
          title={WORD.get(m)}
          className="no-underline rounded border border-gray-300 bg-white px-1 text-[11px] font-medium leading-4 text-gray-600"
        >
          {m}
        </abbr>
      ))}
    </span>
  );
}

/** The key and its warning, once above the list, only when a dish is marked. */
export function DishMarksKey({ words, className }: { words: string; className: string }) {
  return (
    <p data-dish-key className={className}>
      {words}
    </p>
  );
}
