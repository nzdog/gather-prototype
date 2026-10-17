/**
 * [[GTC-373]] (item 23) — the search for Moment 2's menu: what it finds, and what a tap ticks.
 *
 * Ruled 2026-10-08 ("Approve all (Recommended)"): W1 to W12 and Q1 to Q10 as proposed.
 *
 * WHAT IT COVERS (Q1, C1): the nine food sections the questions show, in their own order (the
 * sections up front, then those behind "Show N more"), each section's styles and the choices under
 * them, Alcoholic Drinks' "Anything else to consider?" (a level that hangs off no style, C4), and the
 * five Dietary choices: 257 rows for each of the ten kinds. Not the typed boxes (Notes, Set up, Clean
 * up, Other jobs, any "Other"), and nothing at all for "Other" or a kind with no menu (Q2).
 *
 * WHAT A TAP TICKS (Q5 to Q8): a dish and, when none of its styles is ticked, the first style that
 * lists it ("Roast potatoes" sits under two, C5); a style; a consideration alone. A row already
 * ticked comes back as the same object, so a tap never unticks and nothing is saved (Q6). Every
 * change goes out through `withoutOrphanedChoices`, as any tick in `OptionTree` does.
 */

import planConfig from '@/lib/ai/plan-option-tree-config.json';
import { getCategoryLevels, getConfigKey, withoutOrphanedChoices } from '@/lib/ai/config-loader';
import type { OptionTreeLevel, OptionTreeSelections } from '@/components/shared/OptionTree';
import { DIETARY_OPTIONS, type DietaryStatus } from '@/lib/dietary';
import { matchesAll, searchTerms } from '@/lib/search/fold';

/** The ruled words (W1 to W12). W3 and W4 are built from the section and style names below. */
export const MENU_WORDS = {
  /** W1 */
  LABEL: 'Find a dish',
  /** W2 */
  PLACEHOLDER: 'For example, turkey or pavlova',
  /** W5 — a section's second line. */
  SECTION: 'Section',
  /** W6 — a Dietary choice's second line. */
  DIETARY: 'Dietary requirements',
  /** W7 */
  TICK: 'Tick',
  /** W8 */
  TICKED: '✓ Ticked',
  /** W9 */
  OPEN: 'Open',
  /** W12 */
  UNTICK_NONE_FIRST: 'Untick “No dietary needs” first',
  /** W10 */
  more: (n: number) => `${n} more. Keep typing to narrow it.`,
  /** W11 */
  nothing: (typed: string) =>
    `Nothing on the menu matches “${typed}”. You can add your own in any section’s “Other” box.`,
} as const;

/** Q4 — how many results show before W10. */
export const MENU_SHOWN = 8;

export interface MenuRow {
  /** `{kind}:{section}:{level}:{words}` — unique within one kind's index. */
  id: string;
  kind: 'section' | 'style' | 'choice' | 'dietary';
  /** The section's key (`mains`, `breakfast_brunch`, …); null for a Dietary choice. */
  section: string | null;
  /** The level the words sit on in `OptionTree` (0 for a style); -1 for a section or Dietary. */
  level: number;
  words: string;
  /** W3 to W6 — the row's second line. */
  where: string;
  /** For a choice under styles: every style that lists it, in the section's order. */
  styles: string[];
}

interface ConfigShape {
  [occasion: string]: { categories: Record<string, { label: string }> };
}
const config = planConfig as unknown as ConfigShape;

/**
 * Every row the menu search can find for `eventType`, in the questions' on-screen order:
 * `sectionKeys` are the sections as the questions list them (up front, then "Show more").
 */
export function buildMenuIndex(
  eventType: string | null | undefined,
  sectionKeys: readonly string[]
): MenuRow[] {
  const occasion = eventType ? getConfigKey(eventType) : null;
  if (!eventType || !occasion || !(occasion in config)) return [];
  const rows: MenuRow[] = [];
  for (const section of sectionKeys) {
    const levels = getCategoryLevels(eventType, section);
    if (!levels || levels.length === 0) continue;
    const label = config[occasion].categories[section]?.label ?? section;
    rows.push(row('section', section, -1, label, MENU_WORDS.SECTION));
    const styles = levels[0].options ?? [];
    const dependent = levels.flatMap((l, i) => (i > 0 && l.dependsOn ? [i] : []));
    const independent = levels.flatMap((l, i) => (i > 0 && !l.dependsOn ? [i] : []));
    // A choice listed under two styles shows once, under the first — as OptionTree shows it.
    const shown = new Map<number, Set<string>>(dependent.map((i) => [i, new Set<string>()]));
    for (const style of styles) {
      rows.push(row('style', section, 0, style, label));
      for (const i of dependent) {
        const dependsOn = levels[i].dependsOn ?? {};
        for (const choice of dependsOn[style] ?? []) {
          if (shown.get(i)!.has(choice)) continue;
          shown.get(i)!.add(choice);
          const listing = styles.filter((s) => (dependsOn[s] ?? []).includes(choice));
          rows.push({
            ...row('choice', section, i, choice, `${label} · ${listing[0]}`),
            styles: listing,
          });
        }
      }
    }
    for (const i of independent) {
      for (const option of levels[i].options ?? []) {
        rows.push(row('choice', section, i, option, label));
      }
    }
  }
  for (const need of DIETARY_OPTIONS) {
    rows.push(row('dietary', null, -1, need, MENU_WORDS.DIETARY));
  }
  return rows;
}

function row(
  kind: MenuRow['kind'],
  section: string | null,
  level: number,
  words: string,
  where: string
): MenuRow {
  return {
    id: `${kind}:${section ?? ''}:${level}:${words}`,
    kind,
    section,
    level,
    words,
    where,
    styles: [],
  };
}

/** Q4 — the rows matching what she typed, in on-screen order; none under two letters. */
export function findInMenu(rows: readonly MenuRow[], query: string): MenuRow[] {
  const terms = searchTerms(query);
  if (!terms) return [];
  return rows.filter((r) => matchesAll(r.words, terms));
}

/**
 * Q5 to Q7 — a section's selections after a tap on `row`. The SAME OBJECT when nothing changes
 * (already ticked, or a row with nothing to tick), so the caller saves only a real change.
 */
export function tickFromSearch(
  levels: OptionTreeLevel[],
  selections: OptionTreeSelections,
  row: MenuRow
): OptionTreeSelections {
  if (row.kind !== 'style' && row.kind !== 'choice') return selections;
  const level = levels[row.level];
  if (!level) return selections;
  const current = selections[row.level] ?? { options: [], freeText: '' };
  const has = current.options.includes(row.words);
  const tickedStyles = selections[0]?.options ?? [];
  const style =
    row.styles.length > 0 && !row.styles.some((s) => tickedStyles.includes(s))
      ? row.styles[0]
      : null;
  if (has && !style) return selections;
  const next: OptionTreeSelections = { ...selections };
  if (!has) {
    next[row.level] = {
      ...current,
      options: level.multiSelect === false ? [row.words] : [...current.options, row.words],
    };
  }
  if (style) {
    const first = next[0] ?? { options: [], freeText: '' };
    next[0] = {
      ...first,
      options: levels[0].multiSelect === false ? [style] : [...first.options, style],
    };
  }
  return withoutOrphanedChoices(levels, next);
}

interface DietaryAnswer {
  status: DietaryStatus;
  requirements: string[];
  other: string;
}

/**
 * Q8 — the Dietary answer after a tap on a need: added, as ticking its box would (GTC-150's
 * derived status). The SAME OBJECT while "No dietary needs" is ticked, or when it is already there.
 */
export function dietaryFromSearch<D extends DietaryAnswer>(data: D, need: string): D {
  if (data.status === 'confirmed_none' || data.requirements.includes(need)) return data;
  return {
    ...data,
    status: 'confirmed_needs',
    requirements: [...data.requirements, need],
    other: data.other,
  };
}
