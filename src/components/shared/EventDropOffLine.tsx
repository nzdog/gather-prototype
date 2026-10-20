import { eventDropOffLine, type DropOffFacts } from '@/lib/items/drop-off-words';

/**
 * [[GTC-395]] item 7 — the event's where-and-when to drop off, one plain line at the top of Moment
 * 2's plan and of Moment 3. No hook and no router (both views render without either). Its own line
 * on the plan view (with a margin under it); on Moment 3 in the top row, with no margin, so it adds
 * no height above the lists (the founder's ruling after batch11 C7, 20 Oct 2026).
 */
export default function EventDropOffLine({
  facts,
  spacing = 'mb-4',
}: {
  facts: DropOffFacts;
  /** The margin it keeps; '' in a row. */
  spacing?: string;
}) {
  return (
    <p data-drop-off-line="" className={`text-sm text-gray-600 break-words ${spacing}`.trim()}>
      {eventDropOffLine(facts)}
    </p>
  );
}
