/**
 * [[GTC-388]] (item 72) — "SEE MENU" AND "SEE ASSIGNMENTS": what the board's two pop-ups show.
 *
 * Founder plan rulings, 2026-10-16 (Q16 to Q23, W20 to W31). Both read `GET /api/events/[id]/items`,
 * as the print and the search do (Q17), so a co-host sees them as the host does; read-only, with no
 * link inside (Q20). The menu is by section in the plan's order, the print's own ordering; "Who’s on
 * what" is by person, holders only, then what nobody holds (Q21).
 *
 * ⚠ THE ROWS ARE CUT DOWN AT ONCE (as `toPrintItems` is): the route sends each item whole, and
 * nothing of a row but what the pop-ups show reaches the board's page. The amounts read in the
 * print's plain words (`printQuantity`). This file is one of the glance sources Ruling 1's fence
 * scans (`tests/glance-read-test.ts`).
 */

import { printQuantity, toPrintItems } from '@/lib/print/item-list';

/** W20 to W27, W29 to W31, ruled 2026-10-16. */
export const PLAN_LISTS_WORDS = {
  MENU_DOOR: 'See menu',
  ASSIGNMENTS_DOOR: 'See assignments',
  MENU_HEADING: 'The menu',
  ASSIGNMENTS_HEADING: 'Who’s on what',
  LOADING: 'Getting the list…',
  FAILED: 'That didn’t work. Close this and try again.',
  MENU_EMPTY: 'Nothing on the menu yet.',
  NOBODY: 'Nobody yet',
  ASSIGNMENTS_EMPTY: 'Nobody has anything yet.',
  UNHELD: 'Not given to anyone yet',
  CLOSE: 'Close',
} as const;

/** W28 — beside a holder's name, their answer. */
export const ANSWER_WORDS = {
  ACCEPTED: 'said yes',
  PENDING: 'hasn’t answered',
  MAYBE: 'maybe',
  DECLINED: 'said no',
} as const;

/** Exactly what the two pop-ups show of an item, and nothing more. */
export interface PlanListItem {
  id: string;
  name: string;
  /** The amount in plain words, or null when the plan gives none. */
  amount: string | null;
  section: string;
  sectionOrder: number;
  holder: { id: string; name: string } | null;
  /** W28's words, or null when nobody holds it. */
  answer: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);

function answerOf(response: string): string {
  return (ANSWER_WORDS as Record<string, string>)[response] ?? ANSWER_WORDS.PENDING;
}

/** The list as the route sends it, cut down at once to what the pop-ups show. */
export function toPlanListItems(raw: unknown[]): PlanListItem[] {
  const shown = toPrintItems(raw);
  return shown.map((item, i) => {
    const r = (raw[i] ?? {}) as Record<string, any>;
    const amount = printQuantity(item);
    const person = item.assignment?.person ?? null;
    const holderId = str(r.assignment?.person?.id);
    return {
      id: str(r.id) ?? String(i),
      name: item.name,
      amount: amount === '—' ? null : amount,
      section: item.team.name,
      sectionOrder: item.team.displayOrder,
      holder: person && holderId ? { id: holderId, name: person.name } : null,
      answer: person && holderId ? answerOf(item.assignment!.response) : null,
    };
  });
}

/** The sections in the plan's order: by the section's own order when the plan has one, else by name. */
function sectionsInOrder(items: readonly PlanListItem[]): string[] {
  const first = new Map<string, number>();
  for (const i of items) if (!first.has(i.section)) first.set(i.section, i.sectionOrder);
  const hasOrder = items.some((i) => i.sectionOrder > 0);
  return [...first.keys()].sort((a, b) => {
    if (hasOrder) {
      const d = (first.get(a) ?? 0) - (first.get(b) ?? 0);
      if (d !== 0) return d;
    }
    return a.localeCompare(b);
  });
}

/** Items in menu order: section by section, and within one the route's own order. */
function inMenuOrder(items: readonly PlanListItem[]): PlanListItem[] {
  return sectionsInOrder(items).flatMap((s) => items.filter((i) => i.section === s));
}

/** "See menu": each section with its dishes, who has each and their answer, or nobody. */
export function menuSections(items: readonly PlanListItem[]): Array<{
  section: string;
  rows: Array<{
    name: string;
    amount: string | null;
    holder: string | null;
    answer: string | null;
  }>;
}> {
  return sectionsInOrder(items).map((section) => ({
    section,
    rows: items
      .filter((i) => i.section === section)
      .map((i) => ({
        name: i.name,
        amount: i.amount,
        holder: i.holder ? i.holder.name : null,
        answer: i.answer,
      })),
  }));
}

/** "Who’s on what": holders by name, each with their rows in menu order; then what nobody holds. */
export function whoIsOnWhat(items: readonly PlanListItem[]): {
  people: Array<{
    name: string;
    rows: Array<{ name: string; amount: string | null; section: string; answer: string | null }>;
  }>;
  unheld: Array<{ name: string; amount: string | null; section: string }>;
} {
  const ordered = inMenuOrder(items);
  const byHolder = new Map<string, { name: string; rows: PlanListItem[] }>();
  for (const i of ordered) {
    if (!i.holder) continue;
    const entry = byHolder.get(i.holder.id) ?? { name: i.holder.name, rows: [] };
    entry.rows.push(i);
    byHolder.set(i.holder.id, entry);
  }
  return {
    people: [...byHolder.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({
        name: p.name,
        rows: p.rows.map((i) => ({
          name: i.name,
          amount: i.amount,
          section: i.section,
          answer: i.answer,
        })),
      })),
    unheld: ordered
      .filter((i) => !i.holder)
      .map((i) => ({ name: i.name, amount: i.amount, section: i.section })),
  };
}
