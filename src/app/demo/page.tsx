'use client';

import { useState } from 'react';
import { useToast } from '@/contexts/ToastContext';
import { DEMO_START_WORDS } from '@/lib/demo/start-limit';

/**
 * [[GTC-394]] tweak 3 — the copy button's own label on this page (founder's words). GTC-392's
 * `DEMO_START_WORDS.BUTTON` stays as it is in `start-limit.ts`, unused here; the other start words
 * (the notes, the limits, the failure) are this page's as before.
 */
const TRY_IT_YOURSELF = 'Try it yourself';

/**
 * /demo — [[GTC-394]] tweak 3 (founder, 19 Oct 2026: "just two buttons: Sarah Demo and Try it
 * yourself"). The heading and two buttons, nothing else.
 *
 * "Sarah demo" signs in to the shared sample exactly as "Open Planning Dashboard" did (the demo
 * session route, unchanged, with its GTC-269 refusal when someone is signed in already) and opens
 * her event on the board, the new Moment flow's home ("Her event on the new board (Recommended)").
 *
 * "Try it yourself" starts a private sample copy, as GTC-392 part A built it, and is still shown on
 * the founder's Mac only until part D (GTC-392 Q5). In a production build only Sarah's button shows.
 *
 * The routes behind the old page (tokens, reset, session) are not touched. The reset route still
 * exists, is development-only, and force-resets whichever database the server points at.
 */
export default function DemoLandingPage() {
  const toast = useToast();
  const [openingSarah, setOpeningSarah] = useState(false);
  // [[GTC-392]] part A — her own sample event, on the founder's Mac only until part D (Q5).
  const [startingCopy, setStartingCopy] = useState(false);
  const [copyNote, setCopyNote] = useState<{ words: string; href?: string } | null>(null);

  const handleOpenSarah = async () => {
    setOpeningSarah(true);
    try {
      const response = await fetch('/api/demo/session', { method: 'POST' });
      if (response.ok) {
        const { eventId } = await response.json();
        window.location.href = `/plan/${eventId}/glance`;
      } else if (response.status === 409) {
        // GTC-269: the route now refuses rather than overwriting a session that is
        // already there. It used to replace it silently, which signed a real host
        // out of their own account and into the demo. The refusal carries its own
        // explanation, so show that rather than a generic failure.
        const { reason } = await response.json().catch(() => ({ reason: null }));
        toast.error(reason ?? 'You are already signed in. Sign out to explore the demo.');
        setOpeningSarah(false);
      } else {
        toast.error('Failed to create demo session');
        setOpeningSarah(false);
      }
    } catch (err) {
      console.error('Failed to open dashboard:', err);
      toast.error('Failed to open planning dashboard');
      setOpeningSarah(false);
    }
  };

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
          <button
            onClick={handleOpenSarah}
            disabled={openingSarah}
            className="w-full px-5 py-3 bg-sage-600 text-white font-semibold rounded-lg hover:bg-sage-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {openingSarah ? 'Opening…' : 'Sarah demo'}
          </button>
          {process.env.NODE_ENV === 'development' && (
            <button
              onClick={handleStartCopy}
              disabled={startingCopy}
              className="w-full px-5 py-3 border border-sage-600 text-sage-700 font-semibold rounded-lg hover:bg-sage-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
