/**
 * GTC-379 (item 44, W4 to W9) — "What you’ve picked": the questions' picks, one line a section,
 * at the foot of Moment 2's questions, under Notes and above the bar.
 *
 * Pure: the lines come from the screen's own state, read as today's words and through
 * `withoutOrphanedChoices`, so a dish shows only where the questions show it ticked, once, under
 * the first ticked style that lists it. The sections come in the screen's order, the ones behind
 * "Show more" included; Notes, Set up, Clean up and "📋 Other" never show (Q11).
 */
import { STILL_DECIDING_HINT } from '@/components/plan/AccordionShell';
import {
  shownUnder,
  type OptionTreeLevel,
  type OptionTreeSelections,
} from '@/components/shared/OptionTree';
import {
  getCategoryLevels,
  getDefaultCategories,
  readStoredSelections,
  withoutOrphanedChoices,
} from '@/lib/ai/config-loader';
import { dietaryTitleSummary, type DietaryData } from '@/lib/dietary';

export const PICKS_WORDS = {
  /** W4 */
  HEADING: 'What you’ve picked',
  /** W9 — no section line and no W8 line. */
  NOTHING_YET: 'Nothing picked yet.',
  /** W8 — the always-planned sections with nothing picked and not still deciding. */
  nothingIn: (names: string[]) =>
    `Nothing picked in ${joinWithAnd(names)} yet. Gather will choose for you.`,
  /** W7 — always first. */
  dietary: (summary: string) => `⚠️ Dietary requirements: ${summary}`,
} as const;

/**
 * Each section's name and emoji as its box in the questions shows them (Moment2Step1Modal's
 * `OPTION_TREE_CATEGORY_META`; Table Snacks is 🍿 there, not `plan-categories.ts`'s 🥨).
 */
const SECTION_NAMES: Record<string, { label: string; emoji: string }> = {
  entree_starters: { label: 'Entrée & Starters', emoji: '🥟' },
  mains: { label: 'Mains', emoji: '🍖' },
  sides_salads: { label: 'Sides & Salads', emoji: '🥗' },
  dessert: { label: 'Dessert', emoji: '🍰' },
  cake: { label: 'Cake', emoji: '🎂' },
  drinks_alcoholic: { label: 'Alcoholic Drinks', emoji: '🍷' },
  drinks_non_alcoholic: { label: 'Non-Alcoholic Drinks', emoji: '🥤' },
  table_snacks: { label: 'Table Snacks', emoji: '🍿' },
  breakfast_brunch: { label: 'Breakfast & Brunch', emoji: '🍳' },
};

/** One section's state on the questions: what is ticked and typed, and whether it is still deciding. */
export interface SectionPicks {
  selections?: OptionTreeSelections;
  stillDeciding?: boolean;
}

function joinWithAnd(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** W5 — each ticked style with its ticked dishes in brackets, then considerations, then "Other" text. */
function pickedWords(levels: OptionTreeLevel[], raw: OptionTreeSelections): string[] {
  const selections = withoutOrphanedChoices(levels, readStoredSelections(raw));
  const tickedAt = (i: number) => selections[i]?.options ?? [];
  const dependent = levels.flatMap((level, i) => (i > 0 && level.dependsOn ? [i] : []));
  const independent = levels.flatMap((level, i) => (i > 0 && !level.dependsOn ? [i] : []));

  const styles = (levels[0]?.options ?? []).filter((o) => tickedAt(0).includes(o));
  const unlisted = tickedAt(0).filter((o) => !(levels[0]?.options ?? []).includes(o));
  const words = [...styles, ...unlisted].map((style) => {
    const dishes = dependent.flatMap((i) =>
      shownUnder(levels, selections, i, style).filter((c) => tickedAt(i).includes(c))
    );
    return dishes.length > 0 ? `${style} (${dishes.join(', ')})` : style;
  });
  for (const i of independent) {
    const listed = levels[i].options ?? [];
    words.push(...listed.filter((o) => tickedAt(i).includes(o)));
    words.push(...tickedAt(i).filter((o) => !listed.includes(o)));
  }
  levels.forEach((_, i) => {
    const typed = (selections[i]?.freeText ?? '').trim();
    if (typed) words.push(`“${typed}”`);
  });
  return words;
}

/**
 * The summary's lines: the Dietary line (W7); then each section in `sections`' order, with picks
 * (W5) or still deciding (W6); then the always-planned sections with nothing picked (W8); or W9
 * when no section line and no W8 line shows.
 */
export function picksSummary({
  eventType,
  sections,
  picks,
  dietary,
}: {
  eventType: string;
  /** The food sections in the order the questions show them, "Show more" ones included. */
  sections: string[];
  picks: Record<string, SectionPicks | undefined>;
  dietary: DietaryData;
}): string[] {
  const lines = [PICKS_WORDS.dietary(dietaryTitleSummary(dietary))];
  const alwaysPlanned = getDefaultCategories(eventType);
  const nothingIn: string[] = [];
  for (const key of sections) {
    const names = SECTION_NAMES[key];
    if (!names) continue;
    const head = `${names.emoji} ${names.label}`;
    const pick = picks[key];
    if (pick?.stillDeciding) {
      lines.push(`${head}: ${STILL_DECIDING_HINT}`);
      continue;
    }
    const levels = getCategoryLevels(eventType, key) ?? [];
    const words = pick?.selections ? pickedWords(levels, pick.selections) : [];
    if (words.length > 0) lines.push(`${head}: ${words.join(', ')}`);
    else if (alwaysPlanned.includes(key)) nothingIn.push(names.label);
  }
  if (nothingIn.length > 0) lines.push(PICKS_WORDS.nothingIn(nothingIn));
  if (lines.length === 1) lines.push(PICKS_WORDS.NOTHING_YET);
  return lines;
}
