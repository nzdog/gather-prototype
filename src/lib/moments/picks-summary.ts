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
import { MENU_WORDS } from '@/lib/moments/menu-search';

/** The Dietary row's name, as W7 writes it. */
const DIETARY_HEAD = '⚠️ Dietary requirements';

export const PICKS_WORDS = {
  /** W4 */
  HEADING: 'What you’ve picked',
  /** W9 — no section line and no W8 line. */
  NOTHING_YET: 'Nothing picked yet.',
  /** W8 — the always-planned sections with nothing picked and not still deciding. */
  nothingIn: (names: string[]) =>
    `Nothing picked in ${joinWithAnd(names)} yet. Gather will choose for you.`,
  /** W7 — always first. */
  dietary: (summary: string) => `${DIETARY_HEAD}: ${summary}`,
} as const;

/**
 * [[GTC-394]] tweak 6 — the table's headers (founder ruling, 19 Oct 2026: "Section / Picked / Notes
 * (Recommended)"). "Section" is Find a dish's own W5; "Picked" and "Notes" are new, approved.
 */
export const PICKS_TABLE_WORDS = {
  SECTION: MENU_WORDS.SECTION,
  PICKED: 'Picked',
  NOTES: 'Notes',
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

/**
 * W5 in two parts: what is ticked (each ticked style with its ticked dishes in brackets, then
 * considerations) and what was typed in an "Other" box, quoted. `pickedWords` is the two, in that
 * order, as the summary has always read.
 */
function pickedParts(
  levels: OptionTreeLevel[],
  raw: OptionTreeSelections
): { picked: string[]; typed: string[] } {
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
  const typed: string[] = [];
  levels.forEach((_, i) => {
    const text = (selections[i]?.freeText ?? '').trim();
    if (text) typed.push(`“${text}”`);
  });
  return { picked: words, typed };
}

/** W5 — each ticked style with its ticked dishes in brackets, then considerations, then "Other" text. */
function pickedWords(levels: OptionTreeLevel[], raw: OptionTreeSelections): string[] {
  const { picked, typed } = pickedParts(levels, raw);
  return [...picked, ...typed];
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

/**
 * [[GTC-394]] tweak 6 — "What you’ve picked" as a table (founder, 19 Oct 2026: "more like a
 * spreadsheet"): one row a section, in the same order and the same words as `picksSummary`, from the
 * same helpers, so the two cannot drift. A row's section, what is picked, and what was typed; the
 * still-deciding words stand in the picked column; W8 and W9 are lines across the table. Joined as
 * "{section}: {picked and typed, by commas}", each row is the summary's line.
 */
export type PicksRow =
  | { kind: 'row'; section: string; picked: string[]; notes: string[] }
  | { kind: 'line'; text: string };

export function picksRows({
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
}): PicksRow[] {
  const rows: PicksRow[] = [
    { kind: 'row', section: DIETARY_HEAD, picked: [dietaryTitleSummary(dietary)], notes: [] },
  ];
  const alwaysPlanned = getDefaultCategories(eventType);
  const nothingIn: string[] = [];
  let sectionRows = 0;
  for (const key of sections) {
    const names = SECTION_NAMES[key];
    if (!names) continue;
    const head = `${names.emoji} ${names.label}`;
    const pick = picks[key];
    if (pick?.stillDeciding) {
      rows.push({ kind: 'row', section: head, picked: [STILL_DECIDING_HINT], notes: [] });
      sectionRows++;
      continue;
    }
    const levels = getCategoryLevels(eventType, key) ?? [];
    const parts = pick?.selections
      ? pickedParts(levels, pick.selections)
      : { picked: [], typed: [] };
    if (parts.picked.length + parts.typed.length > 0) {
      rows.push({ kind: 'row', section: head, picked: parts.picked, notes: parts.typed });
      sectionRows++;
    } else if (alwaysPlanned.includes(key)) nothingIn.push(names.label);
  }
  if (nothingIn.length > 0) rows.push({ kind: 'line', text: PICKS_WORDS.nothingIn(nothingIn) });
  if (sectionRows === 0 && nothingIn.length === 0)
    rows.push({ kind: 'line', text: PICKS_WORDS.NOTHING_YET });
  return rows;
}
