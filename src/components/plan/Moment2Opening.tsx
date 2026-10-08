'use client';

import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';

interface Moment2OpeningProps {
  eventName: string;
  onStart: () => void;
  /** [[GTC-367]] (items 1 and 31, W2): back to Moment 1. */
  onBack?: () => void;
  /** [[GTC-367]] (item 2): the strip's doors. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
}

export default function Moment2Opening({ onStart, onBack, doors }: Moment2OpeningProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      {/* [[GTC-367]] (item 31, W1): an overlay over the menu bar, so its own way out. */}
      <a
        href="/plan/events"
        className="absolute top-6 left-6 inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
      >
        {STRIP_WORDS.YOUR_EVENTS}
      </a>
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-screen">
        {/* MomentArc */}
        <MomentArc currentMoment={2} completedMoments={[1]} doors={doors} />

        {/* Assistant line */}
        <p className="mt-10 text-2xl font-semibold text-gray-900 text-center">
          Let&rsquo;s get this plan out of your head and onto the page.
        </p>

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
