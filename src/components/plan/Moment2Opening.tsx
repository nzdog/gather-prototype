'use client';

import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import MomentWords from '@/components/plan/MomentWords';
import { INVITES_ONLY_WORDS, type InvitesOnlyState } from '@/lib/setup/invites-only';

interface Moment2OpeningProps {
  eventName: string;
  onStart: () => void;
  /** [[GTC-367]] (items 1 and 31, W2): back to Moment 1. */
  onBack?: () => void;
  /** [[GTC-367]] (item 2): the strip's doors. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /** [[GTC-368]] (item 17): the event's name and its details (W10, top right). */
  details?: EventDetailsFacts;
  /**
   * [[GTC-374]] (item 14) — the quieter choice, W1 with W2 under it. Absent, it is not offered: the
   * page leaves it out for an event with any item until [[GTC-375]] (plan ruling, Q13).
   */
  onInvitesOnly?: () => void;
  /** [[GTC-374]] — W3 while it works, W4 if it fails, W5 for a co-host. */
  invitesOnlyState?: InvitesOnlyState;
  /** [[GTC-375]] W2 — a plan is put away, and "Let’s do this →" brings it back. */
  planWaiting?: boolean;
}

export default function Moment2Opening({
  onStart,
  onBack,
  doors,
  details,
  onInvitesOnly,
  invitesOnlyState = 'idle',
  planWaiting = false,
}: Moment2OpeningProps) {
  const working = invitesOnlyState === 'working';
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
            in place of the line that said nearly the same (R2, removed: Q11). [[GTC-378]] (item 45,
            ruling 5): "When it’s done" moved here from the foot of the plan, directly under it. */}
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

        {/* [[GTC-374]] (item 14) — the second, quieter choice: no plan, invites only (W1, W2). */}
        {onInvitesOnly && (
          <div className="mt-4 flex max-w-md flex-col items-center text-center">
            <button
              type="button"
              data-invites-only=""
              onClick={onInvitesOnly}
              disabled={working}
              className="px-3 py-2 text-base text-gray-700 underline underline-offset-4 hover:text-gray-900 disabled:opacity-60"
            >
              {INVITES_ONLY_WORDS.CHOOSE}
            </button>
            <p className="mt-1 text-sm leading-snug text-gray-500">{INVITES_ONLY_WORDS.EXPLAIN}</p>
            {invitesOnlyState !== 'idle' && (
              <p
                data-invites-only-state={invitesOnlyState}
                role="status"
                className={`mt-2 text-sm ${working ? 'text-gray-500' : 'text-amber-800'}`}
              >
                {working
                  ? INVITES_ONLY_WORDS.WORKING
                  : invitesOnlyState === 'not-host'
                    ? INVITES_ONLY_WORDS.NOT_HOST
                    : INVITES_ONLY_WORDS.FAILED}
              </p>
            )}
          </div>
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
