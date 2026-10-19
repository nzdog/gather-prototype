'use client';

import { useState } from 'react';
import MomentWords from './MomentWords';
import { STRIP_WORDS } from '@/lib/moments/strip';
import { OPENING_TITLES } from '@/lib/moments/opening-titles';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';

interface SetupOpeningScreenProps {
  onStart: () => void;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, top right; C4). */
  details?: EventDetailsFacts;
}

/**
 * Moment 1's transition page. [[GTC-394]] tweak 2 (founder, 19 Oct 2026: "The title and the
 * paragraphs are the important things"): the Moment's name, big; "What this does" and "When it’s
 * done"; the one button. The strip and the herd-of-cats line are gone from here (the strip stays on
 * every other screen); "← Your events" and the event's details stay, as navigation.
 */
export default function SetupOpeningScreen({ onStart, details }: SetupOpeningScreenProps) {
  const [fading, setFading] = useState(false);

  const handleClick = () => {
    setFading(true);
    setTimeout(() => {
      onStart();
    }, 400);
  };

  return (
    <div
      className={`fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto transition-opacity duration-400 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* [[GTC-367]] (item 31, W1): its own way out. [[GTC-381]] (ruling 2, Q7): it starts below the
          menu bar now, and the way out stays.
          [[GTC-368]] (item 17, Q1): the event's name across from it, the same row on every overlay.
          [[GTC-384]] (item 54): on a phone the row takes its own room above the column (GTC-382 Q9's
          pattern on Moment 2's opening), so the taller screen never runs under it; from sm up it is
          placed as before. */}
      <div className="relative px-6 pt-6 sm:absolute sm:top-6 sm:inset-x-6 sm:p-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href="/plan/events"
          className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {STRIP_WORDS.YOUR_EVENTS}
        </a>
        {details && <EventDetails facts={details} />}
      </div>
      {/* [[GTC-384]] (item 54): the column grows from the top of the box and scrolls when it is taller
          than the screen, instead of being centred past its own top. */}
      <div className="max-w-[600px] mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-full">
        {/* [[GTC-394]] tweak 2: the Moment's name, big. */}
        <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 text-center">
          {OPENING_TITLES[1]}
        </h1>

        <MomentWords moment={1} part="does" className="mt-10 max-w-xl" />
        <MomentWords moment={1} part="done" className="mt-4 max-w-xl" />

        {/* Entry button */}
        <button
          onClick={handleClick}
          disabled={fading}
          className="mt-12 px-8 py-3 bg-accent text-white text-lg rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
        >
          Ready to start herding →
        </button>
      </div>
    </div>
  );
}
