import { boardHref } from '@/lib/events/home-href';
import { SAMPLE_BOARD_WORDS, guestViewLine, type SampleBoardView } from '@/lib/demo/sample-board';

/**
 * [[GTC-444]] ON A SAMPLE COPY'S BOARD ONLY: what amber means here (W43), and the Host view / Guest
 * view pair (W44, W45) with the line under it (W46, or W47 when no guest has a link). Drawn by the
 * board page above the Moments strip, never by GlanceBoard (no hook there, its markup unchanged).
 * Two plain links: the board itself, and the fixed guest's own page. No hooks, no searchParams.
 */
export default function SampleViewToggle({
  eventId,
  view,
}: {
  eventId: string;
  view: SampleBoardView;
}) {
  const guest = view.guest;
  return (
    <div
      data-sample-board=""
      className="mb-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-800"
    >
      <p data-sample-note="">{SAMPLE_BOARD_WORDS.NOTE}</p>
      <p data-sample-views="" className="mt-3 flex gap-4">
        <a href={boardHref(eventId)} aria-current="page" className="font-medium text-gray-900">
          {SAMPLE_BOARD_WORDS.HOST_VIEW}
        </a>
        {guest ? (
          <a href={guest.href} className="font-medium text-gray-900 underline underline-offset-2">
            {SAMPLE_BOARD_WORDS.GUEST_VIEW}
          </a>
        ) : (
          <span className="text-gray-500">{SAMPLE_BOARD_WORDS.GUEST_VIEW}</span>
        )}
      </p>
      <p data-sample-guest-line="" className="mt-2 text-gray-600">
        {guest ? guestViewLine(guest.name, guest.firstName) : SAMPLE_BOARD_WORDS.NO_GUEST}
      </p>
    </div>
  );
}
