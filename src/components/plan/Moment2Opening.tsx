'use client';

import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import MomentWords from '@/components/plan/MomentWords';

interface Moment2OpeningProps {
  eventName: string;
  onStart: () => void;
  /** [[GTC-367]] (items 1 and 31, W2): back to Moment 1. */
  onBack?: () => void;
  /** [[GTC-367]] (item 2): the strip's doors. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, top right). */
  details?: EventDetailsFacts;
}

export default function Moment2Opening({ onStart, onBack, doors, details }: Moment2OpeningProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* [[GTC-367]] (item 31, W1): an overlay over the menu bar, so its own way out.
          [[GTC-368]] (item 17, Q1): the event's name across from it. */}
      <div className="absolute top-6 inset-x-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href="/plan/events"
          className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {STRIP_WORDS.YOUR_EVENTS}
        </a>
        {details && <EventDetails facts={details} />}
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-screen">
        {/* MomentArc */}
        <MomentArc currentMoment={2} completedMoments={[1]} doors={doors} />

        {/* [[GTC-368]] (item 5, Q10's A): where Moment 2 starts, the founder's "What this does",
            in place of the line that said nearly the same (R2, removed: Q11). */}
        <MomentWords moment={2} part="does" className="mt-10 max-w-xl" />

        {/* Primary action */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onStart}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
          >
            Let&rsquo;s do this &rarr;
          </button>
        </div>

        {/* [[GTC-367]] (items 1 and 31, W2): this screen's way back, to Moment 1. */}
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mt-4 text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
          >
            {STRIP_WORDS.BACK_TO_PEOPLE}
          </button>
        )}
      </div>
    </div>
  );
}
