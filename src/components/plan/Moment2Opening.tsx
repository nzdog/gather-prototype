'use client';

import { STRIP_WORDS } from '@/lib/moments/strip';
import { OPENING_TITLES } from '@/lib/moments/opening-titles';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import MomentWords from '@/components/plan/MomentWords';
import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { INVITES_ONLY_WORDS, type InvitesOnlyState } from '@/lib/setup/invites-only';

interface Moment2OpeningProps {
  eventName: string;
  onStart: () => void;
  /** [[GTC-367]] (items 1 and 31, W2): back to Moment 1. */
  onBack?: () => void;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, top right). */
  details?: EventDetailsFacts;
  /**
   * [[GTC-374]] — on an invites-only event "Let’s do this →" first clears the flag: W3 while it
   * works, W4 if it fails, W5 for a co-host ([[GTC-394]] tweak 2: these stay with the button).
   */
  invitesOnlyState?: InvitesOnlyState;
  /** [[GTC-375]] W2 — a plan is put away, and "Let’s do this →" brings it back. */
  planWaiting?: boolean;
  /** [[GTC-399]] item 1: the strip's doors (`stripDoors`, built by the setup page). */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
}

/**
 * Moment 2's transition page. [[GTC-394]] tweak 2 (founder, 19 Oct 2026): the Moment's name, big;
 * "What this does" and "When it’s done"; the one button, with the words that belong to it under it
 * (the plan put away; its refusal). The strip is gone from here, and "Write the list myself" and
 * "Skip the plan: invites only" moved into the questions (Moment2Step1Modal), under the same rule.
 * "← Your events", the event's details and "← Back to the people" stay, as navigation.
 * [[GTC-399]] item 1 (the founder, 24 Oct 2026: "Flow breadcrumbs on moment 2 splash screen"): the
 * strip is back, above the title, current Moment 2, Moment 1 completed, with the doors every other
 * screen has. This reverses that part of GTC-394 tweak 2.
 */
export default function Moment2Opening({
  onStart,
  onBack,
  details,
  invitesOnlyState = 'idle',
  planWaiting = false,
  doors,
}: Moment2OpeningProps) {
  const working = invitesOnlyState === 'working';
  return (
    <div className="fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto">
      {/* [[GTC-367]] (item 31, W1): its own way out. [[GTC-381]] (ruling 2, Q7): below the menu bar.
          [[GTC-368]] (item 17, Q1): the event's name across from it. */}
      {/* [[GTC-382]] (Q9): on a phone the row takes its own room above the column, so "← Your events"
          never sits on the title; from sm up it is placed as before. */}
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
        {/* [[GTC-399]] item 1: the strip, under the top row and above the title, as on every other
            screen (the same MomentArc, its own wrapper's mb-6). */}
        <div className="mb-6">
          <MomentArc currentMoment={2} completedMoments={[1]} doors={doors} />
        </div>
        {/* [[GTC-394]] tweak 2: the Moment's name, big. */}
        <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 text-center">
          {OPENING_TITLES[2]}
        </h1>

        {/* [[GTC-368]] (item 5, Q10's A): where Moment 2 starts, the founder's "What this does";
            [[GTC-378]] (item 45, ruling 5): "When it’s done" directly under it. */}
        <MomentWords moment={2} part="does" className="mt-10 max-w-xl" />
        <MomentWords moment={2} part="done" className="mt-4 max-w-xl" />

        {/* Primary action */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onStart}
            disabled={working}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-60"
          >
            Let&rsquo;s do this &rarr;
          </button>
        </div>

        {/* [[GTC-375]] W2: what "Let’s do this →" does while her plan is put away. */}
        {planWaiting && (
          <p data-plan-waiting="" className="mt-3 max-w-md text-center text-sm text-gray-600">
            {INVITES_ONLY_WORDS.PLAN_WAITING}
          </p>
        )}

        {/* [[GTC-374]] W3 to W5, kept with the button they answer: on an invites-only event
            "Let’s do this →" clears the flag first, and says so if it cannot. */}
        {invitesOnlyState !== 'idle' && (
          <p
            data-start-state={invitesOnlyState}
            role="status"
            className={`mt-3 max-w-md text-center text-sm ${working ? 'text-gray-500' : 'text-amber-800'}`}
          >
            {working
              ? INVITES_ONLY_WORDS.WORKING
              : invitesOnlyState === 'not-host'
                ? INVITES_ONLY_WORDS.NOT_HOST
                : INVITES_ONLY_WORDS.FAILED}
          </p>
        )}

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
