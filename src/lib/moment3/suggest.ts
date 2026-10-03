/**
 * [[GTC-355]] — "Want me to suggest?": Gather's structural suggestions, direct mode.
 *
 * The document: "For each unassigned item, Gather picks the person with the fewest
 * assignments who has no conflicting dietary requirements." For v1, structural only — no AI
 * call and no relational knowledge — and a suggestion is a proposal: it is shown as a ghost
 * with ✓ and ×, and nothing is assigned until the host taps ✓.
 *
 * THE RULE (founder ruling Q11, 2026-10-03), for each unassigned row in the plan's order:
 *   - candidates: everyone in the people panel EXCEPT the host (GTC-256 Ruling 9: the system
 *     never assigns her anything), people marked "Just attending", and kids with jobs unless
 *     the row is a job (a TASK row);
 *   - pick: the fewest items held, COUNTING THIS BATCH'S OWN SUGGESTIONS, so a batch spreads
 *     out instead of landing every row on the one person holding least; ties go to the person
 *     first in the panel; no candidate means no suggestion for that row.
 *
 * NO DIETARY CHECK, AND WHY. Gather holds no person's diet: Person and PersonEvent carry no
 * dietary field and Moment 1 asks none. Dietary needs are event-wide (EventSetup.dietaryData)
 * and say what the event needs, not who needs it, so there is nothing on the person's side for
 * an item's flags to conflict with. A check starts with Moment 1 capturing a person's diet.
 *
 * Pure: it reads its arguments and writes nothing.
 */

export interface SuggestItem {
  id: string;
  /** `Item.kind` — 'ITEM' (something to bring) or 'TASK' (a job). */
  kind: string;
  assigneePersonId: string | null;
}

export interface SuggestPerson {
  personId: string;
  /** Items held now. */
  count: number;
  isHost: boolean;
  justAttending: boolean;
  isKidWithJob: boolean;
}

export interface Suggestion {
  itemId: string;
  personId: string;
}

export function suggestAssignments(
  items: readonly SuggestItem[],
  people: readonly SuggestPerson[]
): Suggestion[] {
  const held = new Map(people.map((p) => [p.personId, p.count]));
  const out: Suggestion[] = [];
  for (const item of items) {
    if (item.assigneePersonId !== null) continue;
    let best: SuggestPerson | null = null;
    for (const p of people) {
      if (p.isHost || p.justAttending) continue;
      if (p.isKidWithJob && item.kind !== 'TASK') continue;
      if (best === null || (held.get(p.personId) ?? 0) < (held.get(best.personId) ?? 0)) best = p;
    }
    if (best === null) continue;
    out.push({ itemId: item.id, personId: best.personId });
    held.set(best.personId, (held.get(best.personId) ?? 0) + 1);
  }
  return out;
}
