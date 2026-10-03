/**
 * [[GTC-355]] — what "All sorted →" opens.
 *
 * "All sorted →" is always there, with no minimum (the document). It opens one panel, chosen
 * here in this order:
 *   1. items still unassigned — the document's panel ("[X] items still unassigned..."), or W4
 *      for one;
 *   2. otherwise people holding nothing who are not "Just attending" — W3, adapted from the
 *      document's team-mode line (founder ruling Q7);
 *   3. otherwise "Everyone's sorted." with the Moment 1 headcount, kids without jobs included
 *      (Q10), and the plan's row count, then "The plan is held. Now let's make sure everyone
 *      knows."
 * Every panel carries "Move on →" (to the pre-flight, Q5) and "Keep going" (W5).
 *
 * Pure and client-safe.
 */

import { M3_WORDS, everyoneSorted, itemsStillUnassigned, peopleHaveNothing } from './words';

export type CompletionKind = 'ITEMS_UNASSIGNED' | 'PEOPLE_UNPLACED' | 'ALL_DECIDED';

export interface CompletionPanel {
  kind: CompletionKind;
  lines: string[];
  moveOn: string;
  keepGoing: string;
}

export function completionPanel(input: {
  unassignedItems: number;
  unplacedPeople: number;
  headcount: number;
  itemCount: number;
}): CompletionPanel {
  const buttons = { moveOn: M3_WORDS.MOVE_ON, keepGoing: M3_WORDS.KEEP_GOING };
  if (input.unassignedItems > 0) {
    return {
      kind: 'ITEMS_UNASSIGNED',
      lines: [itemsStillUnassigned(input.unassignedItems)],
      ...buttons,
    };
  }
  if (input.unplacedPeople > 0) {
    return {
      kind: 'PEOPLE_UNPLACED',
      lines: [peopleHaveNothing(input.unplacedPeople)],
      ...buttons,
    };
  }
  return {
    kind: 'ALL_DECIDED',
    lines: [everyoneSorted(input.headcount, input.itemCount), M3_WORDS.PLAN_IS_HELD],
    ...buttons,
  };
}
