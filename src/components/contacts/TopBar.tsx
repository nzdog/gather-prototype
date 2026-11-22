/**
 * [[GTC-470]] — THE TOP BAR OF BOTH CONTACTS PAGES: "← Your events", "Go back", and, from an event, the
 * four Moments row.
 *
 * A plain function that returns markup, as `renderLoadBox` and `renderRow` are, so the page's tests can see
 * all of it in one render. The real screen and the sample note (what a sample visitor sees) both draw it.
 *
 *   left        "← Your events": the event screens' own words (W1 of GTC-367) and look, a plain link to
 *               /plan/events
 *   right       "Go back" (W18, R4): a button, drawn from the first paint. Where it goes is
 *               `goBackAction` (src/lib/contacts/address.ts); `goBack` below does it.
 *   under them  the four Moments, Moment 1 current (every way in from an event starts on Moment 1's
 *               household form), no ticks (Moment 1's own screens draw none). `doors` tap through to the
 *               other Moments; null is a plain display with no taps (while the reads load, or if one fails,
 *               or no event). MomentArc marks the current step for a screen reader only when it is given
 *               doors, so null becomes an empty set on purpose.
 */
import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';
import { CONTACTS_WORDS as W } from '@/lib/contacts/words';
import {
  HOME_HREF,
  goBackAction,
  type ContactsAddress,
  type GoBackEnv,
} from '@/lib/contacts/address';

export interface TopBarProps {
  /** The Moments row is drawn only when she came from an event. */
  showMoments: boolean;
  /** The row's doors, or null for a plain display. */
  doors: Partial<Record<1 | 2 | 3 | 4, ArcDoor>> | null;
  onGoBack: () => void;
}

export function renderTopBar({ showMoments, doors, onGoBack }: TopBarProps) {
  return (
    <div data-contacts-top className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-3">
        <a
          href={HOME_HREF}
          className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {STRIP_WORDS.YOUR_EVENTS}
        </a>
        <button
          type="button"
          data-contacts-back
          onClick={onGoBack}
          className="px-4 py-2 text-sm border border-gray-300 rounded-lg bg-white text-gray-800 hover:bg-gray-50"
        >
          {W.BACK}
        </button>
      </div>
      {showMoments && (
        <div data-contacts-moments className="mt-4">
          <MomentArc currentMoment={1} doors={doors ?? {}} />
        </div>
      )}
    </div>
  );
}

/** What the browser knows now. Each piece is looked for only here, at the press, and may be missing. */
function browserEnv(): GoBackEnv {
  const doc = typeof document === 'undefined' ? null : document;
  const win = typeof window === 'undefined' ? null : window;
  return {
    referrer: doc?.referrer ?? '',
    origin: win?.location?.origin ?? '',
    historyLength: win?.history?.length ?? 0,
  };
}

/**
 * The press of Go back. The sample page has no address and passes null. It writes nothing, reads no
 * draft and makes no request: the household form's draft and the hand-off are left exactly as they are.
 */
export function goBack(address: ContactsAddress | null): void {
  const action = goBackAction(address, browserEnv());
  if (action.kind === 'history') window.history.back();
  else window.location.assign(action.href);
}
