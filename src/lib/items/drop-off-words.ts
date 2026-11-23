/**
 * [[GTC-395]] item 7 — WHERE AND WHEN TO DROP OFF (founder, 20 Oct 2026: "Need details of where and
 * when to drop off for the items"). One where-and-when for the EVENT, from what it already has: the
 * venue's name and the event's start and end times (`venueName`, `venueTimingStart`,
 * `venueTimingEnd`, set in the Edit event box's venue step). No new column.
 *
 * Shown at the top of Moment 2's plan and of Moment 3 (`EventDropOffLine`). An item with its own
 * drop-off place or note shows it on its row through the existing `DropOffDisplay`, with that
 * component's own words. There is no per-item time in this batch (the items route takes no
 * `dropOffAt`), and the guests' messages are not changed: both are later tickets.
 */

export const DROP_OFF_WORDS = {
  /** "Drop off at Riverside Park" */
  AT: 'Drop off at',
  /** ", 12:00pm to 4:00pm" */
  TO: 'to',
  /** ", from 12:00pm" (a start and no end) */
  FROM: 'from',
  /** ", by 4:00pm" (an end and no start) */
  BY: 'by',
  /** No venue yet. */
  NO_VENUE: 'Drop off: the venue hasn’t been added yet.',
  /** [[GTC-475]] item 5 (founder ruling F, 23 Nov 2026): the door beside the line above, when there is no venue. */
  ADD_VENUE: 'Add the venue',
} as const;

/**
 * [[GTC-475]] item 5 — WHERE "Add the venue" LANDS, no new route. The venue is set in one place only: the Edit
 * event box on the old dashboard, at its step 3 of 3 ("Venue Details"). The door goes to that dashboard with
 * `?edit=venue`; the dashboard reads it once on arrival, opens the box at that step and takes the setting out
 * of the address again. Client-safe, like the rest of this file.
 */
export const EDIT_PARAM = 'edit';
export const EDIT_VENUE = 'venue';
export function addVenueHref(eventId: string): string {
  return `/plan/${eventId}?${EDIT_PARAM}=${EDIT_VENUE}`;
}

export interface DropOffFacts {
  /** [[GTC-475]]: the event's id, so the no-venue line can have its door (the guest page passes none). */
  id?: string | null;
  venueName?: string | null;
  venueTimingStart?: string | null;
  venueTimingEnd?: string | null;
}

/** The event's one line: where, and when if the event has its times. */
export function eventDropOffLine(facts: DropOffFacts): string {
  const venue = facts.venueName?.trim();
  if (!venue) return DROP_OFF_WORDS.NO_VENUE;
  const start = facts.venueTimingStart?.trim();
  const end = facts.venueTimingEnd?.trim();
  const when =
    start && end
      ? `, ${start} ${DROP_OFF_WORDS.TO} ${end}`
      : start
        ? `, ${DROP_OFF_WORDS.FROM} ${start}`
        : end
          ? `, ${DROP_OFF_WORDS.BY} ${end}`
          : '';
  return `${DROP_OFF_WORDS.AT} ${venue}${when}`;
}
