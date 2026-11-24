/**
 * [[GTC-479]] — the words of Moment 1's sessions card and of "who comes to which session", exactly
 * as the founder approved them (ruling 1, decision 6, 24 Nov 2026). Change them only by a ruling.
 * The screens say "session" (Q1).
 *
 * Imports nothing, on purpose: pure, so the card, the route and the tests read the same words.
 */

/** "the pavlova"; "the pavlova and the ham"; "the pavlova, the ham and the trifle". */
export function dishList(names: readonly string[]): string {
  const the = names.map((n) => `the ${n}`);
  if (the.length <= 1) return the.join('');
  return `${the.slice(0, -1).join(', ')} and ${the[the.length - 1]}`;
}

export const CARD_WORDS = {
  heading: 'Sessions',
  emptyManyDates:
    'Is this more than one meal? Add a session for each one, like Christmas lunch or Boxing Day dinner. Until you add one, everything is for the whole event.',
  emptyOneDay:
    'Lunch and dinner on the day? Add a session for each. Until you add one, everything is for the whole event.',
  fillEachDate: 'Add one session for each date',
  add: '+ Add a session',
  nameLabel: 'Session name',
  dateLabel: 'Date',
  namePlaceholder: 'e.g. Christmas lunch',
  save: 'Save session',
  cancel: 'Cancel',
  edit: 'Edit',
  remove: 'Remove',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveUpAloud: (name: string) => `Move ${name} up`,
  moveDownAloud: (name: string) => `Move ${name} down`,
  outsideDates: "Outside the event's dates",
  removeAsk: (name: string) => `Remove ${name}?`,
  removeYes: 'Remove',
  removeNo: 'Keep it',
  saveFailed: "That didn't save. Please try again.",
} as const;

export const COMING_WORDS = {
  heading: 'Who comes to which session',
  line: 'Everyone comes to every session unless you say otherwise.',
  every: 'Coming to: every session',
  some: (names: readonly string[]) => `Coming to: ${names.join(', ')}`,
  differs: 'Coming to: it differs by person',
  none: 'Coming to: no sessions',
  change: 'Change',
  done: 'Done',
  littles: 'Kids without jobs come with the household.',
  dishWarning: (person: string, dishes: readonly string[], session: string) =>
    `${person} is down to bring ${dishList(dishes)} to ${session}. Mark ${person} as not coming to ${session} anyway? Nothing changes about the dish.`,
  markAnyway: 'Mark as not coming',
  keepComing: 'Keep as coming',
} as const;

/** The new route's own words (the session one is GTC-478's, `SESSION_WORDS.notOnEvent`). */
export const ATTENDANCE_WORDS = {
  personNotOnEvent: 'That person is not on this event',
  comingMissing: 'Say whether they are coming to this session',
} as const;
