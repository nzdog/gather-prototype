import { eventDropOffLine, type DropOffFacts } from '@/lib/items/drop-off-words';

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

export default function EventDropOffLine({
  facts,
  place,
}: {
  facts: DropOffFacts;
  place: DropOffPlace;
}) {
  return (
    <p data-drop-off-line="" className={PLACE_CLASS[place]}>
      {eventDropOffLine(facts)}
    </p>
  );
}
