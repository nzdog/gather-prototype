'use client';

import { STRIP_WORDS } from '@/lib/moments/strip';
import { OPENING_TITLES } from '@/lib/moments/opening-titles';
import { M3_WORDS } from '@/lib/moment3/words';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import MomentWords from '@/components/plan/MomentWords';
import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';

interface Moment3OpeningProps {
  /** "Let’s do this →": on to Moment 3's working screen. */
  onStart: () => void;
  /** "← Back to the plan": the plan screen, her approval kept (as the working screen's own way back). */
  onBack: () => void;
  /** The event's name and its details (W10, top right), as on every screen of the flow. */
  details?: EventDetailsFacts;
  /** The strip's doors (`stripDoors`, built by the setup page). */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
}

/**
 * [[GTC-399]] item 2 — Moment 3's opening page (the founder, 24 Oct 2026: "Moment 3 has no splash
 * screen. I want it to have one with the what this does and when it's done. I want the breadcrumbs
 * to be visible"). Built as Moment 2's (Moment2Opening): the Moment's name, big; "What this does"
 * and "When it’s done"; the one button; the strip; "← Your events" and the event's details, and
 * the way back to the plan, as navigation.
 *
 * When it shows (his ruling, "Only when moving forward from the plan"): after the plan screen's own
 * forward button only. It is a screen state of the setup page, stored nowhere: a reload, the strip's
 * door, the search, a link to one dish and the pre-flight's way back open the working screen, as
 * before. The working screen no longer repeats these two blocks (his ruling).
 */
export default function Moment3Opening({ onStart, onBack, details, doors }: Moment3OpeningProps) {
  return (
    <div data-moment3-opening="" className="fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto">
      {/* The way out and the event's name across from it, placed as on Moment 2's opening: on a
          phone the row takes its own room above the column; from sm up it sits at the top. */}
      <div className="relative px-6 pt-6 sm:absolute sm:top-6 sm:inset-x-6 sm:p-0 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <a
          href="/plan/events"
          className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
        >
          {STRIP_WORDS.YOUR_EVENTS}
        </a>
        {details && <EventDetails facts={details} />}
      </div>
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-full">
        {/* The strip, under the top row and above the title (item 1's placement): Moment 3 current,
            Moments 1 and 2 done. */}
        <div className="mb-6">
          <MomentArc currentMoment={3} completedMoments={[1, 2]} doors={doors} />
        </div>
        {/* The Moment's name, big: the strip's own label for Moment 3. */}
        <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 text-center">
          {OPENING_TITLES[3]}
        </h1>

        <MomentWords moment={3} part="does" className="mt-10 max-w-xl" />
        <MomentWords moment={3} part="done" className="mt-4 max-w-xl" />

        {/* Primary action: the same words and look as Moment 2's opening. */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onStart}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-60"
          >
            Let&rsquo;s do this &rarr;
          </button>
        </div>

        {/* The way back to the plan, in the working screen's own words. */}
        <button
          type="button"
          onClick={onBack}
          className="mt-4 text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
        >
          {M3_WORDS.BACK_TO_PLAN}
        </button>
      </div>
    </div>
  );
}
