import {
  addVenueHref,
  DROP_OFF_WORDS,
  eventDropOffLine,
  type DropOffFacts,
} from '@/lib/items/drop-off-words';

/**
 * [[GTC-395]] item 7 — the event's where-and-when to drop off, one plain line at the top of Moment
 * 2's plan and of Moment 3. No hook and no router (both views render without either).
 *
 * [[GTC-398]] item 2 (founder, 23 Oct 2026: "Make the Drop off at Riverside Park, 12:00pm to 4:00pm
 * More prominent"), the same words. `place` says which of the two it is:
 *   - 'plan': its own line above the plan's heading, drawn as a box in the plan view's own card
 *     style (border, rounded, white), the sentence larger, semibold and dark, with the margin it
 *     had (mb-4);
 *   - 'row': in Moment 3's top row beside the event's details, no margin, so it adds no height
 *     above the lists (the founder's ruling after batch11 C7, 20 Oct 2026). Dark and semibold at
 *     the size it had: a larger size could wrap the row beside a long event name on a computer.
 */
export type DropOffPlace = 'plan' | 'row';

const PLACE_CLASS: Record<DropOffPlace, string> = {
  plan: 'mb-4 rounded-lg border border-gray-200 bg-white px-4 py-3 text-base font-semibold text-gray-900 break-words',
  row: 'text-sm font-semibold text-gray-900 break-words',
};

/**
 * [[GTC-475]] item 5 (founder, 22 Nov 2026: "Drop off venue hasn't been added yet warning needs a button to be
 * able to add drop off venue"; ruling F, 23 Nov: F-b): when there is no venue, one door straight after the
 * line, "Add the venue", to the old dashboard with the Edit event box open at the venue step. The line's own
 * paragraph and words are untouched. On Moment 2's plan the door is a button under the box (44 px high); in
 * Moment 3's top row it is an underlined link of the row's own size, padded for the tap and pulled back so it
 * adds no height. Still a plain link: no hook, no router.
 * [[GTC-475]] (the look at 390, 23 Nov 2026): that padding gave a phone only a 40 px tap, and it could not grow
 * without covering the event's name just below. Below md the row's door is now its own 44 px box (the row grows by
 * that much on a phone); from md up it keeps the classes it had, so a computer's row adds no height, as before.
 */
const DOOR_CLASS: Record<DropOffPlace, string> = {
  plan: '-mt-2 mb-4 inline-flex min-h-[44px] items-center rounded-md border border-accent bg-white px-4 text-sm font-medium text-accent hover:bg-accent/10',
  row: 'inline-flex min-h-[44px] items-center text-sm font-semibold text-accent underline underline-offset-2 hover:text-accent-dark md:min-h-0 md:-my-2.5 md:py-2.5',
};

export default function EventDropOffLine({
  facts,
  place,
}: {
  facts: DropOffFacts;
  place: DropOffPlace;
}) {
  const noVenue = !facts.venueName?.trim();
  return (
    <>
      <p data-drop-off-line="" className={PLACE_CLASS[place]}>
        {eventDropOffLine(facts)}
      </p>
      {noVenue && facts.id ? (
        <a data-add-venue="" href={addVenueHref(facts.id)} className={DOOR_CLASS[place]}>
          {DROP_OFF_WORDS.ADD_VENUE}
        </a>
      ) : null}
    </>
  );
}
