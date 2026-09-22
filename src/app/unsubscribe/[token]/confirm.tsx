'use client';

import { useState } from 'react';
import { unsubscribeDoneSentence } from '@/lib/eligibility/email-opt-out';

/**
 * [[GTC-296]] — the press, and what it says afterwards.
 *
 * ⚠ IT POSTS WITH `fetch` RATHER THAN SUBMITTING A FORM, so the person stays on the page they
 * just read and sees the answer in the same words. A form post to the API route would land them
 * on a JSON body, which is a worse ending than the one they came for.
 *
 * ⚠ AND THE ROUTE IT POSTS TO IS THE SAME URL THE `List-Unsubscribe` HEADER CARRIES. One
 * handler, so the button on this page and the button in Gmail cannot diverge.
 */
export function UnsubscribeConfirm({
  action,
  words,
}: {
  action: string;
  words: { hostFirstName: string; eventName: string };
}) {
  const [state, setState] = useState<'idle' | 'working' | 'done' | 'failed'>('idle');

  if (state === 'done') {
    return <p className="text-gray-900 text-lg">{unsubscribeDoneSentence(words)}</p>;
  }

  return (
    <div>
      <button
        type="button"
        disabled={state === 'working'}
        onClick={async () => {
          setState('working');
          try {
            const res = await fetch(action, { method: 'POST' });
            setState(res.ok ? 'done' : 'failed');
          } catch {
            setState('failed');
          }
        }}
        className="rounded-md bg-gray-900 px-5 py-2.5 text-white disabled:opacity-60"
      >
        {state === 'working' ? 'Unsubscribing…' : 'Unsubscribe'}
      </button>
      {state === 'failed' && (
        <p className="mt-4 text-sm text-gray-700">
          That didn&apos;t go through. Try again, or reply to the email and ask to be taken off.
        </p>
      )}
    </div>
  );
}
