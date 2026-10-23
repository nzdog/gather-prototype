/**
 * [[GTC-365]] — Moment 3's assigning, made quicker: the rules behind the taps.
 *
 * From the walkthrough (GTC-189's Fourth ruling) and the founder's rulings on the plan, 2026-10-06
 * (docs/tickets/GTC-365.md):
 *   - item 4: one tap accepts the suggestions ON SCREEN, nothing else (Q6, Q7); a person marked
 *     "Just attending" loses their suggestions at once (the founder's change to Q7);
 *   - item 29: a given item is the soft blue (Q12, A) — none of the board's colours, since a given
 *     item is not yet settled by anyone, and the sage pick ring still shows on it;
 *   - item 30: a picked person stays picked (Q8); with a person picked, a tap gives an open item,
 *     moves one someone else holds, and takes back one they hold (Q9, Q10).
 *
 * Who Gather suggests is unchanged (suggest.ts). Pure and client-safe: no imports, no writes.
 */

import type { Suggestion } from './suggest';

/** Q12, A — a given item's row. Hex, applied as style: src/lib is outside Tailwind's content. */
export const GIVEN_ROW = { background: '#EEF4FB', border: '#B7CCE6', text: '#1F3A5F' } as const;

/**
 * [[GTC-398]] item 5 (founder, 23 Oct 2026: "When person's name is tapped, their dish should
 * highlight") — a row the PICKED person holds, while they are picked: a deeper blue fill and a
 * deeper border than GIVEN_ROW, the same dark text, so their rows stand out from everyone else's
 * soft blue. Hex, as GIVEN_ROW. Not the board's green.
 */
export const HELD_BY_PICKED_ROW = {
  background: '#CFE0F5',
  border: '#4F7CB8',
  text: '#1F3A5F',
} as const;

export type Selection = { kind: 'item'; id: string } | { kind: 'person'; id: string } | null;

/** Q6/Q7 — the suggestions she can see: shown, and their item still held by nobody. */
export function suggestionsOnScreen(
  shown: readonly Suggestion[],
  holders: Readonly<Record<string, { personId: string } | null | undefined>>
): Suggestion[] {
  return shown.filter((g) => !holders[g.itemId]);
}

/** The founder's change to Q7 — marking a person "Just attending" takes their suggestions away. */
export function dropSuggestionsFor(shown: readonly Suggestion[], personId: string): Suggestion[] {
  return shown.filter((g) => g.personId !== personId);
}

export type ItemTap =
  | { act: 'give'; personId: string }
  | { act: 'move'; personId: string }
  | { act: 'take-back' }
  | { act: 'unpick' }
  | { act: 'pick-item' };

/** What a tap on an item does, given what is picked and who holds the item now. */
export function itemTap(selection: Selection, itemId: string, holderId: string | null): ItemTap {
  if (selection?.kind === 'person') {
    if (holderId === null) return { act: 'give', personId: selection.id };
    if (holderId === selection.id) return { act: 'take-back' };
    return { act: 'move', personId: selection.id };
  }
  if (selection?.kind === 'item' && selection.id === itemId) return { act: 'unpick' };
  return { act: 'pick-item' };
}

/** Q8 — after a give, a picked person stays picked; a picked item has its person, so it clears. */
export function selectionAfterGive(selection: Selection): Selection {
  return selection?.kind === 'person' ? selection : null;
}

/**
 * [[GTC-398]] item 5 — the items the picked person holds, to highlight: with a person picked, every
 * item they hold now or that is saving as theirs; an item saving away from them (to someone else,
 * or taken back) is not theirs. Nothing when no person is picked. A suggestion is not a holding, so
 * it never counts. Pure: the view draws the rows from it.
 */
export function heldByPicked(
  selection: Selection,
  holders: Readonly<Record<string, { personId: string } | null | undefined>>,
  pending: Readonly<Record<string, string | null>>
): string[] {
  if (selection?.kind !== 'person') return [];
  const picked = selection.id;
  const ids = new Set([...Object.keys(holders), ...Object.keys(pending)]);
  return [...ids].filter((id) =>
    id in pending ? pending[id] === picked : holders[id]?.personId === picked
  );
}
