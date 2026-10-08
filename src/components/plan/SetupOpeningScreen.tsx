'use client';

import { useState } from 'react';
import MomentArc, { type ArcDoor } from './MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';

interface SetupOpeningScreenProps {
  onStart: () => void;
  /** [[GTC-367]] (item 2): the strip's doors; Moment 1's is the same as the button. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, top right; C4). */
  details?: EventDetailsFacts;
}

export default function SetupOpeningScreen({ onStart, doors, details }: SetupOpeningScreenProps) {
  const [fading, setFading] = useState(false);

  const handleClick = () => {
    setFading(true);
    setTimeout(() => {
      onStart();
    }, 400);
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* [[GTC-367]] (item 31, W1): this screen covers the menu bar, so it carries its own way out.
          [[GTC-368]] (item 17, Q1): the event's name across from it, the same row on every overlay. */}
      <div className="absolute top-6 inset-x-6 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href="/plan/events"
          className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {STRIP_WORDS.YOUR_EVENTS}
        </a>
        {details && <EventDetails facts={details} />}
      </div>
      <div className="max-w-[600px] w-full px-6 text-center">
        {/* The line */}
        <p className="text-2xl sm:text-3xl text-gray-800 leading-relaxed mb-12">
          We&rsquo;re here to organise what could be described as a herd of cats. Let&rsquo;s get it
          done.
        </p>

        {/* The four moment arc */}
        <div className="mb-12">
          <MomentArc currentMoment={1} doors={doors} />
        </div>

        {/* Entry button */}
        <button
          onClick={handleClick}
          disabled={fading}
          className="px-8 py-3 bg-accent text-white text-lg rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          Ready to start herding →
        </button>
      </div>
    </div>
  );
}
