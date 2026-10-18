import {
  getAccordionDefaults,
  getCategoryLevels,
  getUpFrontCategories,
} from '@/lib/ai/config-loader';
import { FOOD_CATEGORY_ORDER } from '@/lib/ai/plan-categories';

/**
 * [[GTC-392]] part B — "FILL IN TYPICAL ANSWERS" on Moment 2's questions, for a sample. Founder plan
 * rulings, 18 Oct 2026 (QB5, QB6; W23 to W28).
 *
 * It fills only what she left empty and never changes an answer she gave. No kind picked: Casual
 * BBQ, with the picks below. Another kind: the first choice in each of its up-front food questions.
 * Either way, the dietary answer and the two jobs if they are empty. The screen then saves through
 * its own half-second save, as her own ticks would (QB6): nothing new on the server, and it never
 * presses Generate or touches the AI count.
 *
 * CLIENT-SAFE AND PURE: it reads its argument and the questions' own option lists, and writes
 * nothing. Every pick below is one the Casual BBQ questions offer.
 */

/** W23 to W28. */
export const TYPICAL_WORDS = {
  /** W23 — the button. */
  BUTTON: 'Fill in typical answers',
  /** W24 — the line under it. */
  EXPLAIN:
    'I’ll answer the questions the way a typical host might. You can change any answer before you press Generate.',
  /** W25 — done. */
  DONE: 'Filled in. Change anything you like.',
  /** W26 — nothing left to fill. */
  NOTHING: 'Everything’s already answered.',
  /** W27 — the set-up job it types. */
  SET_UP: 'Tables and chairs out, and the BBQ cleaned with a full gas bottle.',
  /** W28 — the clean-up job it types. */
  CLEAN_UP: 'Dishes, rubbish and recycling, and a scrape-down of the BBQ.',
} as const;

/** The kind it picks when she has picked none. */
export const TYPICAL_KIND = 'Casual BBQ';

/** The Casual BBQ picks, level by level (the plan's list, ruled QB5). */
const BBQ: Record<string, string[][]> = {
  mains: [['Mixed grill'], ['Sausages and steaks']],
  sides_salads: [['Mixed salads'], ['Classic BBQ sides combo']],
  drinks_alcoholic: [
    ['Beer and cider'],
    ['Mix of beer and cider'],
    ['Provide low/no-alcohol alternatives'],
  ],
  drinks_non_alcoholic: [['Soft drinks and juice'], ['L&P and classic NZ fizzy']],
  table_snacks: [['Dips and nibbles'], ['Mixed dip platter']],
  // Behind "Show more" for a BBQ, so the screen opens it.
  dessert: [['Pavlova'], ['Classic pavlova with cream']],
};

const TYPICAL_DIETARY = ['Vegetarian', 'Gluten-free'];

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

const toSelections = (levels: string[][]): Selections =>
  Object.fromEntries(levels.map((options, i) => [i, { options, freeText: '' }]));

/** The first choice in a food question: its first style, then the first choice under it. */
function firstChoices(kind: string, key: string): string[][] | null {
  const levels = getCategoryLevels(kind, key);
  const first = levels?.[0]?.options?.[0];
  if (!levels || !first) return null;
  const out: string[][] = [[first]];
  const next = levels[1];
  if (next && !next.multiSelect) {
    const want = next.dependsOn ? next.dependsOn[first]?.[0] : next.options?.[0];
    if (want) out.push([want]);
  }
  return out;
}

const emptySection = (selections: Selections | undefined, stillDeciding: boolean) =>
  !stillDeciding && !(selections?.[0]?.options?.length ?? 0);

const emptyJob = (job: Job) => !job.stillDeciding && job.freeText.trim() === '';

/**
 * The questions with every empty answer filled, and whether "Show more" must open to show one.
 * Null when there is nothing left to fill (W26).
 */
export function fillTypicalAnswers<S extends TypicalAnswersState>(
  state: S
): { next: S; openMore: boolean } | null {
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

  // Which food questions it answers, and with what.
  const picks: Array<[string, string[][]]> =
    kind === TYPICAL_KIND
      ? Object.entries(BBQ)
      : FOOD_CATEGORY_ORDER.filter((key) => shown.has(key))
          .map((key) => [key, firstChoices(kind, key)] as [string, string[][] | null])
          .filter((pair): pair is [string, string[][]] => pair[1] !== null);

  let openMore = false;
  for (const [key, levels] of picks) {
    if (key === 'mains') {
      if (!emptySection(next.mainsData.selections, next.mainsData.stillDeciding)) continue;
      next = {
        ...next,
        mainsData: { ...next.mainsData, selections: toSelections(levels), stillDeciding: false },
      };
    } else {
      const entry = next.extendedCategoriesData[key];
      if (entry && !emptySection(entry.selections, entry.stillDeciding)) continue;
      next.extendedCategoriesData[key] = { selections: toSelections(levels), stillDeciding: false };
      if (!shown.has(key)) openMore = true;
    }
    changed = true;
  }

  const d = next.dietaryData;
  if (d.status === 'unanswered' && d.requirements.length === 0 && (d.other ?? '').trim() === '') {
    next = {
      ...next,
      dietaryData: { status: 'confirmed_needs', requirements: [...TYPICAL_DIETARY], other: '' },
    };
    changed = true;
  }
  if (emptyJob(next.setUpData)) {
    next = { ...next, setUpData: { freeText: TYPICAL_WORDS.SET_UP, stillDeciding: false } };
    changed = true;
  }
  if (emptyJob(next.cleanUpData)) {
    next = { ...next, cleanUpData: { freeText: TYPICAL_WORDS.CLEAN_UP, stillDeciding: false } };
    changed = true;
  }

  return changed ? { next: { ...state, ...next } as S, openMore } : null;
}
