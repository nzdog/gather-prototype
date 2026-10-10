/**
 * [[GTC-355]] — every word a host reads in Moment 3, in one place.
 *
 * THE DOCUMENT'S WORDS ARE THE FOUNDER'S, AS WRITTEN (docs/moment-3-flow-document.md). The
 * rest are W2 to W7, proposed in GTC-355's plan and approved by the founder on 2026-10-03
 * (PLAN RULINGS in docs/tickets/GTC-355.md). tests/moment-three-test.ts types every one of
 * them again, so a changed constant fails rather than agreeing with itself. Change none of
 * them without a ruling.
 *
 * Client-safe: no imports.
 */

export const M3_WORDS = {
  // The document's words.
  SENTENCE: "Now. Who's on what.",
  UNASSIGNED: 'unassigned',
  JUST_ATTENDING: 'Just attending',
  WANT_ME_TO_SUGGEST: 'Want me to suggest?',
  ALL_SORTED: 'All sorted →',
  MOVE_ON: 'Move on →',
  KEEP_GOING: 'Keep going',
  PLAN_IS_HELD: "The plan is held. Now let's make sure everyone knows.",
  NO_PLAN_ITEMS: 'No plan items yet.',
  BACK_TO_PLAN: '← Back to the plan',
  // W6 — a save that fails.
  SAVE_FAILED: "That didn't save. Try again.",
  // W7 — accessible names with no variable part.
  DISMISS_LABEL: 'Dismiss',
  NOT_JUST_ATTENDING_LABEL: 'Not just attending',
  // [[GTC-360]] — holding the plan at "Move on →". W1 to W6 and the two links, approved with the
  // founder's fixes (PLAN RULINGS 2026-10-03 in docs/tickets/GTC-360.md).
  HOLDING: 'Holding the plan…',
  HOLD_FAILED: "That didn't hold. Try again.",
  HOLD_CLASH:
    'Before I hold the plan, a serious clash in it needs settling. You can settle it in Plan Status.',
  HOLD_QUANTITY:
    'Before I hold the plan, an important item needs a quantity. You can set it in Items & Quantities.',
  HOLD_EMPTY: "There's nothing in the plan to hold yet. Go back to the plan and add what's needed.",
  HOLD_NOT_HOST: 'Only the host can hold the plan and send it.',
  OPEN_PLAN_STATUS: 'Open Plan Status',
  OPEN_ITEMS_AND_QUANTITIES: 'Open Items & Quantities',
  // [[GTC-365]] — W5 and W8, approved 2026-10-06 (PLAN RULINGS in docs/tickets/GTC-365.md).
  ACCEPTING: 'Accepting…',
  DONE: 'Done',
} as const;

/** The document's counter: "[X] of [Y] items assigned." — as written, for every count. */
export function assignedCounter(assigned: number, total: number): string {
  return `${assigned} of ${total} items assigned.`;
}

/** The document's items panel; W4 for one. */
export function itemsStillUnassigned(count: number): string {
  return count === 1
    ? '1 item still unassigned. You can come back to it anytime. Move on?'
    : `${count} items still unassigned. You can come back to these anytime. Move on?`;
}

/** The document's "Everyone's sorted." line, as written. */
export function everyoneSorted(people: number, items: number): string {
  return `Everyone's sorted. ${people} people, ${items} items, all decided.`;
}

/** W2 — the people panel's counter. */
export function peopleWithNothing(count: number): string {
  return count === 1 ? '1 person with nothing yet.' : `${count} people with nothing yet.`;
}

/** W3 — every item assigned, people holding nothing. Adapted from the document's team-mode line. */
export function peopleHaveNothing(count: number): string {
  return count === 1
    ? "1 person has nothing to bring yet. That's fine — they can just attend. Move on?"
    : `${count} people have nothing to bring yet. That's fine — they can just attend. Move on?`;
}

/** W7 — × on an assigned item. */
export function removeLabel(name: string): string {
  return `Remove ${name}`;
}

/** W7 — ✓ on a suggestion. */
export function giveLabel(item: string, name: string): string {
  return `Give ${item} to ${name}`;
}

/**
 * [[GTC-365]] W4 — one tap accepts the suggestions on screen. Approved 2026-10-06.
 */
export function acceptAllLabel(count: number): string {
  return count === 1 ? '✓ Accept 1 suggestion' : `✓ Accept all ${count} suggestions`;
}

/**
 * [[GTC-365]] W6 — Accept all, when some of its saves fail. Not GTC-355's W6 (SAVE_FAILED), which
 * is still what a single failed save says.
 */
export function acceptAllFailed(failed: number, count: number): string {
  return `${failed} of ${count} didn't save. Tap ✓ to try again.`;
}

/** [[GTC-365]] W7, with the founder's fix (no "Picked:") — at the foot while a person is picked. */
export function giveToLine(name: string): string {
  return `Tap items to give them to ${name}.`;
}
