'use client';

import { useEffect, useState } from 'react';

/** [[GTC-392]] W1, approved 18 Oct 2026. */
export const DEMO_BANNER_WORDS =
  'This is a sample event. Nothing you do here sends a message to anyone. Use made-up names.';

/**
 * [[GTC-392]] part A — THE SAMPLE EVENT'S BANNER, on the setup page and the pre-flight.
 *
 * It renders nothing unless the event is a sample (`isDemo`, read from `GET /api/events/[id]`,
 * which already carries it), so every real event's screens are exactly as they were. Fixed in the
 * top right corner, under the bar and above the Moment screens (z-[55]: the bar's panels are at
 * z-[60]), and it never takes a click: everything under it still answers.
 */
export function DemoBanner({ eventId }: { eventId: string }) {
  const [isDemo, setIsDemo] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/events/${eventId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body) => {
        if (live) setIsDemo(body?.event?.isDemo === true);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [eventId]);

  if (!isDemo) return null;
  return (
    <div
      role="note"
      className="pointer-events-none fixed top-[73px] right-4 left-4 z-[55] sm:left-auto sm:max-w-xs rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-snug text-amber-900 shadow-sm"
    >
      {DEMO_BANNER_WORDS}
    </div>
  );
}
