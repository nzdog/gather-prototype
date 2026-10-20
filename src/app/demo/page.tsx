'use client';

import { useState } from 'react';
import { DEMO_START_WORDS } from '@/lib/demo/start-limit';

/**
 * [[GTC-394]] tweak 3 — the copy button's own label on this page (founder's words). GTC-392's
 * `DEMO_START_WORDS.BUTTON` stays as it is in `start-limit.ts`, unused here; the other start words
 * (the notes, the limits, the failure) are this page's as before.
 */
const TRY_IT_YOURSELF = 'Try it yourself';

/**
 * /demo — [[GTC-394]] tweak 3, and [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026: "Don't have the
 * Henderson Christmas button." "The front page only has the Try it yourself button"). The heading
 * and one button, nothing else.
 *
 * "Try it yourself" starts a private sample copy, as GTC-392 part A built it, and is still shown on
 * the founder's Mac only until part D (GTC-392 Q5). In a production build the page is the heading
 * and no button (a flag on GTC-395).
 *
 * The "Sarah demo" button and its handler went with GTC-395. The route behind it (the demo session
 * route's no-body path) is not touched: the old shared Sarah event stays in the database until part
 * D retires it. The tokens and reset routes are not touched either; the reset route still exists,
 * is development-only, and force-resets whichever database the server points at.
 */
export default function DemoLandingPage() {
  // [[GTC-392]] part A — her own sample event, on the founder's Mac only until part D (Q5).
  const [startingCopy, setStartingCopy] = useState(false);
  const [copyNote, setCopyNote] = useState<{ words: string; href?: string } | null>(null);

  const handleStartCopy = async () => {
    setStartingCopy(true);
    setCopyNote(null);
    try {
      const response = await fetch('/api/demo/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: 'copy' }),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && typeof body.href === 'string') {
        window.location.href = body.href;
        return;
      }
      if (response.status === 409) {
        // Signed in already: is it a sample she has open (W10), or a real account (W9)?
        const list = await fetch('/api/events')
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        const open = ((list?.events ?? []) as Array<{ id: string; isDemo?: boolean }>).find(
          (e) => e.isDemo === true
        );
        setCopyNote(
          open
            ? { words: DEMO_START_WORDS.ALREADY_OPEN, href: `/plan/${open.id}/setup` }
            : { words: DEMO_START_WORDS.SIGNED_IN }
        );
      } else if (response.status === 429 && typeof body.error === 'string') {
        setCopyNote({ words: body.error });
      } else {
        setCopyNote({ words: DEMO_START_WORDS.FAILED });
      }
    } catch {
      setCopyNote({ words: DEMO_START_WORDS.FAILED });
    }
    setStartingCopy(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-sm mx-auto px-5 py-20 text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-10">Gather</h1>
        <div className="flex flex-col gap-3">
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={handleStartCopy}
              disabled={startingCopy}
              className="w-full px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {startingCopy ? 'Starting…' : TRY_IT_YOURSELF}
            </button>
          )}
        </div>
        {copyNote && (
          <p className="mt-4 text-sm text-gray-700">
            {copyNote.words}{' '}
            {copyNote.href && (
              <a href={copyNote.href} className="underline underline-offset-2">
                {DEMO_START_WORDS.GO_TO_IT}
              </a>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
