'use client';

/**
 * GTC-192 (J1, phase 7) — RULING 32, as amended 2026-09-11. THE READING PANEL.
 *
 * The founder's reason, verbatim, and the whole specification of this file:
 *
 *   "a green strip tells her someone is sorted but not what they are sorted FOR, and she
 *    should be able to check that without leaving the board."
 *
 * Read and close. It is NOT `PersonSurface`, which is about moving work around.
 *
 * ── WHAT IT IS NOT, WHICH IS MOST OF WHAT IT IS ───────────────────────────────────────────
 *
 * NO CONTROLS AT ALL, other than the close. No Move to…, no Move, no I'll do it, no Remind.
 * Ruling 31 is untouched here in the strongest possible sense: there is nothing for it to be
 * ⚠ AND THE TWO CONSEQUENCES THE SUPERSEDED `b-all-open` VARIANT CARRIED STAY RECORDED HERE AS
 * WARNINGS, because they return the moment a control is added and they return with nothing
 * failing. `remindOffered` (`src/lib/glance/actions.ts`) filters `ATTENDANCE_NO` and nothing
 * else, so (1) it returns TRUE FOR THE HOST, whom the route then refuses with a 403, and (2)
 * `remindItemPhrase` skips green rows and falls back to "your assigned items", so a SETTLED
 * person is nudgeable about nothing outstanding. Neither can arise today — there is no remind
 * control here — and neither is gated. Both are closed BY CONSTRUCTION, not by a guard.
 *
 * NO TIMESTAMP OF ANY KIND. Not when they confirmed, not when they were asked. ⚠ AND IT IS
 * ENFORCED BY WHAT THIS FILE IS GIVEN RATHER THAN BY WHAT IT RENDERS: it takes a
 * `ReadingPanel`, which has no date-shaped field at any depth, and NOT a `GlancePerson`, which
 * carries `nextNudgeAt` and a `decideByAt` on every row. A field in hand and not rendered is
 * one careless JSX edit from being rendered, which is the exact reasoning §5 layer 3 gives.
 * `tests/glance-grid-test.tsx` runs 6a's own no-timestamp rule over the object.
 *
 * NO DESCRIPTION, NO DIETARY TAGS, NO TIMING, NO DROP-OFF. Quantity and unit only — "more
 * than that makes it a plan view rather than a glance." None of them are on the wire either.
 *
 * ── NO CLICK-THROUGH, AND THE REASON IS A SURVEY RATHER THAN A PREFERENCE ─────────────────
 *
 * There is nowhere good to send her, established by reading the tree rather than assumed:
 *
 *   · there is NO per-person page and NO per-item page anywhere in the app — all 25 page
 *     routes were checked, and none is keyed to a person or an item;
 *   · the ONLY host surface that edits an item is the Items accordion of the plan editor,
 *     `/plan/[eventId]?expand=items`, whose Edit button is the single `setEditingItem` trigger
 *     in that file;
 *   · that accordion CANNOT be filtered to a person — `?expand=` takes one of eight section
 *     names and there is no person parameter and no filter;
 *   · `?expand=teams`, where Ruling 8's quiet door already goes, has no Edit button at all;
 *   · `PersonInviteDetailModal`, the existing person-level surface, does not list a person's
 *     items and edits nothing about one;
 *   · `/h/[token]/team/[teamId]` had its item Edit button DELETED by GTC-198.
 *
 * The founder's ruling: "A link that drops her into the full item list to hunt is a detour,
 * not a door." So this panel has no way out but closing.
 *
 * ⚠ AND GTC-198's OWN NOTE POINTS AT THE SAME GAP, which is why this is a later ticket rather
 * than an omission. Deleting that button, it recorded: *"Ordinary editing on this surface is
 * GTC-192 (J1)'s to design — the coordinator and host dashboard surfaces already have it."*
 * That design does not exist, here or anywhere. It needs its own ticket and it is not this one.
 *
 * ── AN ISLAND, LIKE `PersonSurface` ───────────────────────────────────────────────────────
 *
 * `GlanceBoard` stays a server component with no hooks — phase 2's property, which no slice
 * may retire. The cost is that every green and amber strip hydrates — which on the oversized
 * board is every strip, and retires phase 4's "nothing here hydrates at all" sentence. It
 * hydrates cheaply: this component takes a narrowed payload and NO candidate pool, so the
 * per-strip cost is a name, a word, a weekday and its rows.
 */

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { ReadingPanel, ReadingRow } from './reading';

export interface GlancePersonReadingProps {
  /** The narrowed payload. Never a `GlancePerson`; see the header. */
  panel: ReadingPanel;
  personEventId: string;
  /** The strip's own state, for the board's handle. Display only. */
  state: string;
  /** The strip's contents and tint, rendered by the board so both kinds of strip read alike. */
  className: string;
  children: ReactNode;
}

export default function GlancePersonReading({
  panel,
  personEventId,
  state,
  className,
  children,
}: GlancePersonReadingProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/*
        THE DOOR. A real <button>, so the tap works and so does the keyboard — the same choice
        `PersonSurface` makes and for the same reason.

        ⚠ IT IS NOT STYLED AS A BUTTON. Tint, text and padding are the strip's, unchanged.
        RULING 35 answered whether a door should look like one — it should, on every strip that
        opens something — and the treatment is composed by the BOARD and handed down in
        `className`, so a reading door and an acting door cannot come to look different.
        `block w-full text-left` only undoes the element's own inline centring.
      */}
      <button
        type="button"
        data-strip-state={state}
        data-strip-reading=""
        data-person-event-id={personEventId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`block w-full text-left ${className}`}
      >
        {children}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={panel.name}
            data-reading-panel={panel.name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-xl bg-[#ffffff] p-5 text-[#2c2c2a]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[17px] font-medium">{panel.name}</p>
                {/*
                  Ruling 32's "status in a word". One word-ish, not a sentence: the panel
                  answers what she is bringing, and the status is the frame around it rather
                  than a second thing to read.
                */}
                <p data-reading-status="" className="m-0 mt-0.5 text-[13px] text-[#888780]">
                  {panel.status}
                </p>
                {/*
                  RULING 34 — the nudge day, on amber people only.

                  "the same fact is a countdown on a strip she did not ask for and an answer in
                  a panel she chose to open. Where it sits is what changes it."

                  ⚠ A WEEKDAY, NEVER A COUNT. "A count is a countdown by another name and this
                  ruling is about not having one." The guard is mechanical rather than a
                  promise: the test asserts this line contains no digit, which a count cannot
                  satisfy and neither can a date.

                  ⚠ AND NULL IS SILENT. A green person has nothing pending; a spent cadence and
                  a don't-chase person both read null, and a line saying "no more nudges" would
                  decide GTC-251's exhaustion question from a display component.
                */}
                {panel.nudge ? (
                  <p data-reading-nudge="" className="m-0 mt-0.5 text-[13px] text-[#854F0B]">
                    {panel.nudge}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setOpen(false)}
                className="-mr-1 -mt-1 rounded p-1 text-[#888780]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-col gap-2">
              {panel.rows.length === 0 ? (
                /*
                  The itemless case is REAL on both states this panel opens for: Ruling 16's
                  attendance-only amber holds nothing and is still being asked, and a host or a
                  settled guest can hold nothing too. It says so rather than rendering an empty
                  box, which would read as a panel that failed to load.
                */
                <p className="m-0 text-[13px] text-[#888780]">Bringing nothing.</p>
              ) : null}

              {panel.rows.map((row: ReadingRow) => (
                <div
                  key={row.itemId}
                  data-reading-row={row.itemId}
                  className="flex items-baseline gap-2 rounded-lg bg-[#f5f4ef] p-2.5 text-[13px]"
                >
                  <span>{row.name}</span>
                  {row.critical ? (
                    <span className="text-[11px] text-[#888780]">critical</span>
                  ) : null}
                  {/*
                    The quantity, right-aligned so a column of rows reads as a list of amounts.
                    ABSENT rather than "—" when there is none: a placeholder quantity and no
                    quantity are indistinguishable on this payload by design, and a dash would
                    assert that the item genuinely has none.
                  */}
                  {row.quantity ? (
                    <span data-reading-quantity="" className="ml-auto shrink-0 text-[#5f5e5a]">
                      {row.quantity}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
