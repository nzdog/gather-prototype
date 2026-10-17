'use client';

/**
 * [[GTC-366]] (item 11) — "Print the list", the board's door to the print for the fridge.
 *
 * Ruled 2026-10-06 (Q12 to Q16). An ISLAND BESIDE THE BOARD'S OWN MARKUP, as the replay and the
 * poll are, so `GlanceBoard` keeps phase 2's property: no hooks, no fetch. This file holds both.
 *
 * ⚠ THE WINDOW OPENS IN THE TAP ITSELF, BEFORE THE LIST IS READ. A browser lets a page open a
 * window only in answer to a tap; opened after an `await`, it is blocked. So it opens first, says
 * W14 while the list loads, then writes the list and opens the browser's print.
 *
 * Q13: it reads `GET /api/events/[id]/items`, the route the old dashboard reads, and keeps only the
 * printed fields (`toPrintItems`) the moment the list arrives. Q15: this file is one of the glance
 * sources Ruling 1's fence scans (`tests/glance-read-test.ts`).
 */

import { useState } from 'react';
import {
  PRINT_WORDS,
  itemListHtml,
  noteHtml,
  toPrintItems,
  writePage,
} from '@/lib/print/item-list';

interface PrintListDoorProps {
  eventId: string;
  eventName: string;
  /** The event's date as the print shows it, worked out by the page. */
  printDate: string;
  className: string;
}

export default function PrintListDoor({
  eventId,
  eventName,
  printDate,
  className,
}: PrintListDoorProps) {
  // Q16 — a blocked window is said on the board (W16), not swallowed.
  const [blocked, setBlocked] = useState(false);

  const print = () => {
    const win = window.open('', '_blank');
    if (!win) {
      setBlocked(true);
      return;
    }
    setBlocked(false);
    writePage(win, noteHtml(eventName, PRINT_WORDS.LOADING), false);
    fetch(`/api/events/${eventId}/items`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => {
        const items = toPrintItems(Array.isArray(data?.items) ? data.items : []);
        writePage(win, itemListHtml({ eventName, eventDate: printDate, items }), true);
      })
      .catch(() => writePage(win, noteHtml(eventName, PRINT_WORDS.FAILED), false));
  };

  return (
    <>
      <button type="button" data-print-door="" onClick={print} className={className}>
        {PRINT_WORDS.DOOR}
      </button>
      {blocked ? (
        <p data-print-blocked="" role="alert" className="m-0 w-full text-[12px] text-[#A32D2D]">
          {PRINT_WORDS.BLOCKED}
        </p>
      ) : null}
    </>
  );
}
