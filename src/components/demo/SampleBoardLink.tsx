import { boardHref } from '@/lib/events/home-href';
import { SAMPLE_BOARD_WORDS } from '@/lib/demo/sample-board';

/**
 * [[GTC-444]] W42 — THE WAY FROM THE PRETEND SEND TO THE BOARD (Q4 (A)). Drawn by the pre-flight
 * right after the pretend panel, beside it and not in it: the panel stays without a link or a
 * button (demo-tweaks S3). It records nothing; nothing is marked sent (QB2). No hooks.
 */
export default function SampleBoardLink({ eventId }: { eventId: string }) {
  return (
    <p data-sample-board-link="" className="mt-3 text-sm">
      <a
        href={boardHref(eventId)}
        className="font-medium text-gray-900 underline underline-offset-2"
      >
        {SAMPLE_BOARD_WORDS.SEE_THE_BOARD}
      </a>
    </p>
  );
}
