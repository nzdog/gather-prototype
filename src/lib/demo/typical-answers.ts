import {
  getAccordionDefaults,
  getCategoryLevels,
  getUpFrontCategories,
} from '@/lib/ai/config-loader';
import { FOOD_CATEGORY_ORDER } from '@/lib/ai/plan-categories';
import { shownUnder, type OptionTreeLevel } from '@/components/shared/OptionTree';
import { DIETARY_OPTIONS } from '@/lib/dietary';

/**
 * [[GTC-392]] part B — "FILL IN TYPICAL ANSWERS" on Moment 2's questions, for a sample. Founder plan
 * rulings, 18 Oct 2026 (QB5, QB6; W23 to W28).
 *
 * It fills only what she left empty and never changes an answer she gave. No kind picked: Casual
 * BBQ. The screen then saves through its own half-second save, as her own ticks would (QB6):
 * nothing new on the server, and it never presses Generate or touches the AI count.
 *
 * [[GTC-394]] tweak 5 (founder, 19 Oct 2026: "The ticked boxes should be more random and the
 * occasional note"): each food question gets a random style, sometimes two, and one or two random
 * dishes under each, always from the question's own choices; the Dietary answer is one to three
 * from the real list; each job is one of three sentences; about one section in three gets a short
 * note in its first "Other" box, never more than two in one press. The question "Anything else to
 * consider?" is left empty (founder ruling). The sections it fills are the same as before, and it
 * says which, so the screen opens them. The random source is an argument (`Math.random` by
 * default), so a test can hand it a sequence.
 *
 * CLIENT-SAFE AND PURE: it reads its arguments and the questions' own option lists, and writes
 * nothing.
 */

/** W23 to W28. */
export const TYPICAL_WORDS = {
  /** W23 — the button. */
  BUTTON: 'Fill in demo answers',
  /** W24 — the line under it. */
  EXPLAIN:
    'I’ll answer the questions the way a typical host might. You can change any answer before you press Generate.',
  /** W25 — done. */
  DONE: 'Filled in. Change anything you like.',
  /** W26 — nothing left to fill. */
  NOTHING: 'Everything’s already answered.',
  /** W27 — the set-up job it types (the first of its three since GTC-394). */
  SET_UP: 'Tables and chairs out, and the BBQ cleaned with a full gas bottle.',
  /** W28 — the clean-up job it types (the first of its three since GTC-394). */
  CLEAN_UP: 'Dishes, rubbish and recycling, and a scrape-down of the BBQ.',
} as const;

/** [[GTC-394]] tweak 5 — the set-up job: one of these three (the founder's words). */
export const TYPICAL_SET_UP = [
  TYPICAL_WORDS.SET_UP,
  'Chilly bins out, and the tables set up under the trees.',
  'Chairs out, a speaker set up, and extension leads run.',
] as const;

/** [[GTC-394]] tweak 5 — the clean-up job: one of these three (the founder's words). */
export const TYPICAL_CLEAN_UP = [
  TYPICAL_WORDS.CLEAN_UP,
  'Rubbish and recycling out, and the tables wiped down.',
  'Leftovers packed up and the chairs put away.',
] as const;

/** [[GTC-394]] tweak 5 — the occasional note, by section (the founder's words). Others get none. */
export const TYPICAL_NOTES: Readonly<Record<string, string>> = {
  mains: 'No pork, if we can.',
  sides_salads: 'The salads can be made the day before.',
  dessert: 'Nana can’t have nuts.',
  drinks_alcoholic: 'Keep it light, there are drivers.',
  drinks_non_alcoholic: 'Plenty of ice, please.',
  table_snacks: 'Something for the kids too.',
};

/** About one section in three gets its note; never more than two in one press. */
export const NOTE_CHANCE = 1 / 3;
export const MAX_NOTES = 2;

/** The kind it picks when she has picked none. */
export const TYPICAL_KIND = 'Casual BBQ';

/** The Casual BBQ sections it fills (QB5's list; Dessert is behind "Show more", so it opens). */
const BBQ_SECTIONS = [
  'mains',
  'sides_salads',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'dessert',
];

/** Where its numbers come from: anything returning a number in [0, 1), as `Math.random` does. */
export type RandomSource = () => number;

type Selections = Record<number, { options: string[]; freeText: string }>;
interface Section {
  items: unknown[];
  stillDeciding: boolean;
  selections?: Selections;
}
interface Entry {
  selections: Selections;
  stillDeciding: boolean;
}
interface Job {
  freeText: string;
  stillDeciding: boolean;
}
/** The questions' state, as far as this reads it (`Moment2Step1Modal`'s `Step1State`). */
export interface TypicalAnswersState {
  eventType: string | null;
  eventTypeOther: string;
  mainsData: Section;
  sidesData: Section;
  dessertsData: Section;
  drinksData: Section;
  dietaryData: { status: string; requirements: string[]; other: string };
  extendedCategoriesData: Record<string, Entry>;
  setUpData: Job;
  cleanUpData: Job;
}

/** A whole number in [0, n), from the source. */
const pick = (random: RandomSource, n: number) =>
  Math.min(n - 1, Math.max(0, Math.floor(random() * n)));

/** `count` different choices from `list`, kept in the list's own order. */
function chooseN(random: RandomSource, list: readonly string[], count: number): string[] {
  const pool = [...list];
  const got = new Set<string>();
  while (got.size < count && pool.length > 0) got.add(pool.splice(pick(random, pool.length), 1)[0]);
  return list.filter((o) => got.has(o));
}

/** One choice, or one or two where the question lets her tick more than one. */
const choose = (random: RandomSource, list: readonly string[], many: boolean) =>
  chooseN(random, list, many && list.length > 1 ? 1 + pick(random, 2) : 1);

/** A food question's random picks: its styles, then the dishes it shows under each. */
function randomPicks(levels: OptionTreeLevel[], random: RandomSource): Selections {
  const first = levels[0];
  const styles = choose(random, first.options ?? [], first.multiSelect !== false);
  const selections: Selections = { 0: { options: styles, freeText: '' } };
  levels.forEach((level, i) => {
    if (i === 0 || !level.dependsOn) return;
    const dishes: string[] = [];
    for (const style of styles) {
      const choices = shownUnder(levels, selections, i, style);
      if (choices.length > 0) dishes.push(...choose(random, choices, level.multiSelect !== false));
    }
    if (dishes.length > 0) selections[i] = { options: dishes, freeText: '' };
  });
  return selections;
}

const emptySection = (selections: Selections | undefined, stillDeciding: boolean) =>
  !stillDeciding && !(selections?.[0]?.options?.length ?? 0);

const emptyJob = (job: Job) => !job.stillDeciding && job.freeText.trim() === '';

/**
 * The questions with every empty answer filled; whether "Show more" must open to show one; and the
 * sections it filled, by the ids the screen gives them, so the screen can open them. Null when
 * there is nothing left to fill (W26).
 */
export function fillTypicalAnswers<S extends TypicalAnswersState>(
  state: S,
  random: RandomSource = Math.random
): { next: S; openMore: boolean; opened: string[] } | null {
  let changed = false;
  let next: TypicalAnswersState = {
    ...state,
    extendedCategoriesData: { ...state.extendedCategoriesData },
  };

  if (!next.eventType) {
    const defaults = getAccordionDefaults(TYPICAL_KIND);
    next = {
      ...next,
      eventType: TYPICAL_KIND,
      eventTypeOther: '',
      mainsData: {
        items: defaults.mains,
        stillDeciding: next.mainsData.stillDeciding,
        selections: {},
      },
      sidesData: { items: defaults.sides, stillDeciding: next.sidesData.stillDeciding },
      dessertsData: { items: defaults.desserts, stillDeciding: next.dessertsData.stillDeciding },
      drinksData: { items: defaults.drinks, stillDeciding: next.drinksData.stillDeciding },
      extendedCategoriesData: {},
    };
    changed = true;
  }
  const kind = next.eventType as string;
  const shown = new Set(getUpFrontCategories(kind));
  const sections = FOOD_CATEGORY_ORDER.filter((key) =>
    kind === TYPICAL_KIND ? BBQ_SECTIONS.includes(key) : shown.has(key)
  );

  const opened: string[] = [];
  let openMore = false;
  let notes = 0;
  for (const key of sections) {
    const levels = getCategoryLevels(kind, key);
    if (!levels || !(levels[0]?.options?.length ?? 0)) continue;
    const isMains = key === 'mains';
    const current = isMains ? next.mainsData : next.extendedCategoriesData[key];
    if (current && !emptySection(current.selections, current.stillDeciding)) continue;
    const selections = randomPicks(levels, random);
    const note = TYPICAL_NOTES[key];
    if (note && notes < MAX_NOTES && levels[0].freeText && random() < NOTE_CHANCE) {
      selections[0] = { ...selections[0], freeText: note };
      notes++;
    }
    if (isMains) {
      next = { ...next, mainsData: { ...next.mainsData, selections, stillDeciding: false } };
    } else {
      next.extendedCategoriesData[key] = { selections, stillDeciding: false };
    }
    if (!shown.has(key)) openMore = true;
    opened.push(key);
    changed = true;
  }

  const d = next.dietaryData;
  if (d.status === 'unanswered' && d.requirements.length === 0 && (d.other ?? '').trim() === '') {
    const requirements = chooseN(random, DIETARY_OPTIONS, 1 + pick(random, 3));
    next = { ...next, dietaryData: { status: 'confirmed_needs', requirements, other: '' } };
    opened.push('dietary');
    changed = true;
  }
  if (emptyJob(next.setUpData)) {
    const freeText = TYPICAL_SET_UP[pick(random, TYPICAL_SET_UP.length)];
    next = { ...next, setUpData: { freeText, stillDeciding: false } };
    opened.push('setUp');
    changed = true;
  }
  if (emptyJob(next.cleanUpData)) {
    const freeText = TYPICAL_CLEAN_UP[pick(random, TYPICAL_CLEAN_UP.length)];
    next = { ...next, cleanUpData: { freeText, stillDeciding: false } };
    opened.push('cleanUp');
    changed = true;
  }

  return changed ? { next: { ...state, ...next } as S, openMore, opened } : null;
}
