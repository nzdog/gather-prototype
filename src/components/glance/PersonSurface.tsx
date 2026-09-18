'use client';

/**
 * GTC-192 (J1, phase 4) — what is behind the tap.
 *
 * §3: "Behind a tap: all actions (remind, reassign, take over a silence) — looking never
 * becomes operating." This is the second layer: the strip is the door, and this is the
 * room.
 *
 * ── A MODAL, BECAUSE THAT IS WHAT THIS CODEBASE DOES FOR A PERSON ─────────────
 *
 * `PersonInviteDetailModal` is the existing person-level detail surface and it is a fixed
 * overlay with a scrim; `HostPersonModal`, `EditPersonModal` and `AcknowledgeModal` are the
 * same shape. Matching it is the obvious half of the reason.
 *
 * The other half is Ruling 3. The board is "a map, not a queue", and its value is that
 * households hold their places — an in-card expansion would push every card below and to
 * the right of the tapped one, so opening Amelia would move the Nguyens. A card that
 * changed shape when touched would cost exactly the learned geography fixed positions were
 * chosen to buy. The overlay leaves the map underneath untouched, and closing returns her
 * to the same four-second screen she left.
 *
 * ── STATE ONLY, AND ONLY THE STATE THE BOARD ALREADY CARRIES ──────────────────
 *
 * The person, their why, what they hold, and the actions. No behaviour — Ruling 1's fence
 * is not relaxed by a tap, and `tests/glance-read-test.ts` carries the denylist over this
 * file. No plan content beyond the row's own name: no quantity, no team name, no
 * drop-off, no notes. No history, no message log, no counts of anything.
 *
 * ── AN ISLAND, NOT A CLIENT BOARD ─────────────────────────────────────────────
 *
 * `GlanceBoard` stays a server component with no hooks — the property phase 2 built it for,
 * and the reason the whole board is in the first paint. Only a RED strip is a door, so only
 * a red strip is an island: on the oversized board (64 settled people, no reds) nothing
 * here hydrates at all.
 *
 * The cost is that each island is handed the same `pool`, so a board with three reds
 * serialises the candidate list three times. That is a few hundred bytes against hydrating
 * sixty-four strips to make three of them tappable, and it is the trade taken knowingly.
 *
 * ── THE REFRESH, AND WHY IT IS AN EVENT (slice 6e) ────────────────────────────
 *
 * ⚠ SUPERSEDED, NOT DELETED. Until 6e this section read: "Ruling 10's ~20-second refresh is
 * phase 6. When an action changes what the board shows, this SAYS the board is behind
 * (`STALE_NOTE`) rather than quietly refreshing." Polling has landed and Ruling 25 replaced
 * that sentence with the board being right: *"an action must trigger an immediate refresh
 * rather than waiting up to 20s for the next poll."*
 *
 * So an action that MOVED the board — `outcome.movedBoard`, which `actions.ts` states as a
 * fact rather than as a side effect — dispatches one event, and the live island polls at once.
 *
 * WHY AN EVENT RATHER THAN A CALL. This modal and the poller are two separate islands beside a
 * SERVER-rendered board. There is no shared React tree to hang a callback on, and giving them
 * one means hydrating the board — phase 2's no-hooks property, which the ticket says a slice
 * may not retire. An event on `window` is the seam that already exists between them.
 *
 * ⚠ A REMIND DISPATCHES NOTHING, and that is the differential Ruling 25 names. A nudge changes
 * no state, so a board that repainted for it would repaint an identical board and imply that
 * something moved.
 */

import { useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import type { GlanceItem, GlancePerson } from '@/lib/glance/state';
import type { AssignActorRole } from '@/lib/assignment/same-team';
import {
  reassign,
  reassignCandidates,
  remind,
  remindOffered,
  remindRefusal,
  takeOver,
  type GlanceActionOutcome,
  type GlanceAssignable,
} from '@/lib/glance/actions';
import { GLANCE_REFRESH_EVENT } from '@/lib/glance/live';
import { whyLineFor } from './strip';

export interface PersonSurfaceProps {
  person: GlancePerson;
  eventId: string;
  eventName: string;
  /** Formatted for the reminder copy; the page owns the formatting, not the payload. */
  eventDate: string;
  hostPersonId: string;
  /** The viewer's own authority on this event, straight from `requireEventRole`. */
  actorRole: AssignActorRole;
  pool: GlanceAssignable[];
  /** The strip's own contents, rendered by the board so both kinds of strip read alike. */
  className: string;
  children: ReactNode;
}

/** The item's tint, as a small square — the same vocabulary as the strips, at row scale. */
const ROW_TONE: Record<GlanceItem['state'], string> = {
  RED: 'bg-[#A32D2D]',
  AMBER: 'bg-[#854F0B]',
  GREEN: 'bg-[#3B6D11]',
};

export default function PersonSurface({
  person,
  eventId,
  eventName,
  eventDate,
  hostPersonId,
  actorRole,
  pool,
  className,
  children,
}: PersonSurfaceProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<GlanceActionOutcome | null>(null);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});

  const why = whyLineFor(person);
  const refusal = remindRefusal(person);
  /*
    RULING 31 — the glance stops offering a remind to someone it has just said pulled out.

    "A door that tells her a person has pulled out and offers to remind them is the screen
    contradicting itself inside one panel. She is not being stopped from doing anything — the
    route is unchanged and every other path to it remains — the glance simply stops offering it
    in the one place it has just said the opposite."

    ⚠ THE DECISION IS THE ACTION LAYER'S, ASKED HERE. `remindOffered` sits beside Ruling 18's
    own picker filter in `actions.ts`, for the placement reason Ruling 18 gives: one surface
    declining to propose something is not a change to the rule. This file writes no attendance
    check of its own — asserted — so there is one definition and one call site.

    ⚠ AND IT IS SILENT, UNLIKE RULING 14's REFUSAL BELOW. The mark has a way out and so gets
    words; a guest who has answered no has nothing for Kate to change, and a paragraph
    explaining that would be the lean-in Ruling 1's general test refuses.
  */
  /*
    ⚠ AND IT IS AN EARLY RETURN RATHER THAN A TERNARY, WHICH IS NOT A STYLE CHOICE. Written as
    `{offered ? <section/> : null}` the guard was defeated by a one-character mutation —
    `{true ? …}` — that left the `remindOffered` call standing, so an assertion counting call
    sites still passed while the control rendered for a person who had pulled out. The mutation
    that survived is what moved this: the guard now IS the function's first statement, and
    `tests/glance-actions-test.ts` asserts that literal plus that the label and the action call
    live nowhere but inside it.
  */
  function remindSection() {
    if (!remindOffered(person)) return null;
    return (
      <div className="mt-4 border-t-[0.5px] border-[#dcdad2] pt-3">
        {refusal ? (
          <p data-remind-refused="" className="m-0 text-[13px] text-[#888780]">
            {refusal}
          </p>
        ) : (
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => run('remind', () => remind(eventId, person, { eventName, eventDate }))}
            className="rounded-md border-[0.5px] border-[#dcdad2] px-2.5 py-1.5 text-[13px] disabled:opacity-40"
          >
            {busy === 'remind' ? 'Reminding…' : 'Remind them'}
          </button>
        )}
      </div>
    );
  }

  async function run(key: string, action: () => Promise<GlanceActionOutcome>) {
    setBusy(key);
    setOutcome(null);
    try {
      const result = await action();
      setOutcome(result);
      // RULING 25. Only an action that actually moved the board asks for the refresh, and only
      // when the route accepted it — a refused reassign changed nothing to catch up to.
      if (result.ok && result.movedBoard) {
        window.dispatchEvent(new Event(GLANCE_REFRESH_EVENT));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      {/*
        THE DOOR. A real <button>, so the tap works and so does the keyboard — a div with
        an onClick is reachable by neither Tab nor a screen reader.

        ⚠ IT IS STYLED AS A DOOR, AS OF RULING 35 (2026-09-11) — and the styling does not live
        here. The board composes `className` and hands it down, so an acting door, a reading
        door and a sealed strip are handed the same string by the same rule (`doorTreatmentFor`,
        which asks `panelFor`). This file adds only `w-full block text-left`, undoing the
        element's own inline centring. ⚠ SUPERSEDED, NOT DELETED: until that ruling this note
        read "IT IS NOT STYLED AS A BUTTON… the strip-as-button SHAPE is phase 7's variant, and
        shipping it here would settle an unruled decision by stealth." It was ruled, not
        stolen.
      */}
      <button
        type="button"
        data-strip-state={person.state}
        data-strip-door=""
        /*
          Phase 6 slice 6c. The same handle the plain strips carry, so the replay's island can
          repaint a red exactly as it repaints anything else — a strip that is a door is still
          a strip. It changes nothing here: this component already hydrates because it IS the
          door.
        */
        data-person-event-id={person.personEventId}
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
            aria-label={person.name}
            data-person-surface={person.personId}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[85vh] w-full max-w-[420px] overflow-y-auto rounded-xl bg-[#ffffff] p-5 text-[#2c2c2a]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="m-0 text-[17px] font-medium">{person.name}</p>
                {/*
                  Ruling 4's why, carried through unchanged. The strip's line and this line
                  come from one function, so the door and the room cannot say two things.
                */}
                {why ? <p className="m-0 mt-0.5 text-[13px] text-[#A32D2D]">{why}</p> : null}
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

            {/*
              WHAT THEY HOLD. §10.8: "all items visible on tap" — including the ones that
              are settled, because worst-colour-wins means a red person can be holding three
              things and only one of them is the trouble.
            */}
            <div className="mt-4 flex flex-col gap-2.5">
              {person.items.length === 0 ? (
                <p className="m-0 text-[13px] text-[#888780]">Holding nothing yet.</p>
              ) : null}

              {person.items.map((row) => {
                const candidates = reassignCandidates(pool, row, actorRole, hostPersonId, [
                  person.personId,
                  hostPersonId,
                ]);
                const chosen = moveTo[row.itemId] ?? '';
                return (
                  <div
                    key={row.itemId}
                    data-surface-row={row.itemId}
                    className="rounded-lg bg-[#f5f4ef] p-2.5"
                  >
                    <p className="m-0 flex items-center gap-2 text-[13px]">
                      <span
                        aria-hidden="true"
                        className={`inline-block h-2 w-2 rounded-full ${ROW_TONE[row.state]}`}
                      />
                      <span>{row.name}</span>
                      {row.critical ? (
                        <span className="text-[11px] text-[#888780]">critical</span>
                      ) : null}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <select
                        aria-label={`Move ${row.name} to`}
                        data-move-picker={row.itemId}
                        value={chosen}
                        onChange={(e) =>
                          setMoveTo((prev) => ({ ...prev, [row.itemId]: e.target.value }))
                        }
                        className="min-w-0 flex-1 rounded-md border-[0.5px] border-[#dcdad2] bg-[#ffffff] px-2 py-1.5 text-[13px]"
                      >
                        <option value="">Move to…</option>
                        {candidates.map((c) => (
                          <option key={c.personId} value={c.personId}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={chosen === '' || busy !== null}
                        onClick={() =>
                          run(`move-${row.itemId}`, () =>
                            reassign(
                              eventId,
                              row,
                              chosen,
                              candidates.find((c) => c.personId === chosen)?.name ?? 'them'
                            )
                          )
                        }
                        className="rounded-md bg-[#2c2c2a] px-2.5 py-1.5 text-[13px] text-[#ffffff] disabled:opacity-40"
                      >
                        Move
                      </button>
                      {/*
                        TAKE OVER — GTC-256 Ruling 9's self-pick, reached through the same
                        route and the exemption `mayHoldRow` already carries. It has its own
                        control rather than being a name in the picker above, which is why
                        the host is excluded from that list: one thing, one door.
                      */}
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() =>
                          run(`take-${row.itemId}`, () => takeOver(eventId, row, hostPersonId))
                        }
                        className="rounded-md border-[0.5px] border-[#dcdad2] px-2.5 py-1.5 text-[13px] disabled:opacity-40"
                      >
                        I’ll do it
                      </button>
                    </div>

                    {candidates.length === 0 ? (
                      <p className="m-0 mt-1.5 text-[11px] text-[#888780]">
                        Nobody else on this row’s team — take it over, or add someone to the team on
                        the plan.
                      </p>
                    ) : null}
                  </div>
                );
              })}
            </div>

            {/*
              REMIND — one press, no composer.

              §3 refuses messaging on this surface and Ruling 1's general test refuses
              anything that makes the host lean in; a tone picker and a textarea is the V1
              composer, which is where a host who wants her own words already goes. The words
              are Gather's existing warm host-nudge template.

              ⚠ THE REFUSAL, WHEN IT SHOWS, IS RULING 14's. It cannot be reached from this
              screen — only reds are doors, and a marked person is never red — but the
              refusal is real rather than a disabled button, because the rule is about the
              system and not about which strips happen to be tappable.
            */}
            {/*
              RULING 31: the whole section goes, divider included. A bordered empty band would
              be the panel pointing at the thing it has decided not to offer.
            */}
            {remindSection()}

            {/*
              WHAT HAPPENED. A route's refusal is shown in the route's own words — those are
              already written for a host, and a second wording here would be a second place
              to keep them true. A failed send says so: [[GTC-247]] means no send path
              authenticates in dev, and the honest 502 is what shows rather than a green tick.
            */}
            {outcome ? (
              <p
                data-action-outcome={outcome.ok ? 'ok' : 'failed'}
                className={`m-0 mt-3 text-[13px] ${outcome.ok ? 'text-[#3B6D11]' : 'text-[#A32D2D]'}`}
              >
                {outcome.ok ? outcome.note : outcome.error}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
