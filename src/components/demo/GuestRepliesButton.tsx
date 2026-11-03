'use client';

import { useState } from 'react';
import { REPLIES_WORDS, repliesDoneLine, repliesExplainLine } from '@/lib/demo/replies-words';

/**
 * [[GTC-445]] "MAKE THE GUESTS REPLY" (W49 to W54, W56), on a sample copy's board only, beside the
 * Host / Guest pair. Founder rulings, 1 Nov 2026 (Q7, Q16).
 *
 * Its own client file, so GlanceBoard stays hook-free and its markup unchanged. A button, not a
 * link. It posts `{ demoReplies: true }` to the households route, then loads the board again (a
 * full page load, O11), so the board's replay plays the answers arriving.
 */
export type RepliesState = 'idle' | 'working' | 'done' | 'already' | 'nobody' | 'failed';

/** What the button draws in each state. No hooks, so a suite can draw every state. */
export function GuestRepliesView({
  state,
  answered,
  guestFirstName,
  onPress,
}: {
  state: RepliesState;
  answered: number;
  guestFirstName: string;
  onPress: () => void;
}) {
  if (state === 'done' || state === 'already' || state === 'nobody') {
    return (
      <p
        data-guest-replies={state}
        className="mb-4 rounded-lg bg-sage-50 border border-sage-200 px-4 py-3 text-sm text-gray-700"
      >
        {state === 'done'
          ? repliesDoneLine(answered)
          : state === 'already'
            ? REPLIES_WORDS.ALREADY
            : REPLIES_WORDS.NOBODY}
      </p>
    );
  }
  return (
    <div
      data-guest-replies={state}
      className="mb-4 rounded-lg bg-sage-50 border border-sage-200 p-4"
    >
      <button
        type="button"
        onClick={onPress}
        disabled={state === 'working'}
        className="w-full py-3 text-base font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
      >
        {state === 'working' ? REPLIES_WORDS.WORKING : REPLIES_WORDS.BUTTON}
      </button>
      <p className="mt-2 text-sm text-gray-600">{repliesExplainLine(guestFirstName)}</p>
      {state === 'failed' && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {REPLIES_WORDS.FAILED}
        </p>
      )}
    </div>
  );
}

export default function GuestRepliesButton({
  eventId,
  guestFirstName,
}: {
  eventId: string;
  guestFirstName: string;
}) {
  const [state, setState] = useState<RepliesState>('idle');
  const [answered, setAnswered] = useState(0);

  async function press() {
    setState('working');
    try {
      const res = await fetch(`/api/events/${eventId}/households`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoReplies: true }),
      });
      const body = (await res.json().catch(() => null)) as {
        answered?: unknown;
        code?: unknown;
      } | null;
      if (res.ok && typeof body?.answered === 'number') {
        setAnswered(body.answered);
        setState('done');
        // [[GTC-445]] O11: the board's own address loaded again, a full page load her click
        // started, so the replay plays the answers (newer than her last look). Not a refresh of
        // the page by itself: the live island's own polling is separate and unchanged.
        window.location.reload();
        return;
      }
      if (res.status === 409 && body?.code === 'ALREADY_REPLIED') return setState('already');
      if (res.status === 409 && body?.code === 'NO_GUESTS') return setState('nobody');
      setState('failed');
    } catch {
      setState('failed');
    }
  }

  return (
    <GuestRepliesView
      state={state}
      answered={answered}
      guestFirstName={guestFirstName}
      onPress={() => void press()}
    />
  );
}
