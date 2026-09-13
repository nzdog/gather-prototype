'use client';

/**
 * GTC-192 (J1, phase 6, slice 6e) — THE BOARD, WHILE SHE IS LOOKING AT IT.
 *
 * The design reference calls this the product's best moment: *"If a reply lands while she is on
 * the screen, that strip celebrates in real time."* Ruling 10 decided how: polling, roughly
 * every twenty seconds. *"A strip flipping within 20 seconds of the truth still feels live; the
 * spark does the work."*
 *
 * ── AN ISLAND THAT RENDERS NOTHING, AND THAT IS DELIBERATE ────────────────────────────────
 *
 * This component returns `null`, always, on every path. It has no markup at all.
 *
 * The alternative — folding polling into `GlanceReplay` — fails on a rule 6c wrote and named as
 * unretireable by any slice: *"THE ISLAND RENDERS NOTHING WHEN THERE ARE NO STEPS."* Polling has
 * to run on exactly the visits where there is nothing to replay, because that is most visits. So
 * the two are separate islands, and this one has no markup for that guard to have to make an
 * exception for. The spark's particle layer is made in the DOM at the first spark that needs one
 * (`ensureSparkLayer`), rather than rendered — which is also why it does not exist on a board
 * that never sparks.
 *
 * ── VALUES, NEVER STRUCTURE — WHAT A POLL CAN HONESTLY CHANGE ─────────────────────────────
 *
 * The board is a SERVER component (phase 2's property, and the reason the true board is in the
 * first paint). This island repaints strips it does not own, the way the arrival replay already
 * does. What it may change is what an element SAYS — a tint, a strip's words, the summary
 * sentence, the assistant's line — through the same pure functions the board rendered them with,
 * so there is one definition of each. What it may NOT do is decide what EXISTS.
 *
 * ⚠ THREE THINGS THEREFORE DO NOT FOLLOW A LIVE CHANGE, AND THEY ARE STATED AS A CEILING RATHER
 * THAN DISCOVERED LATER:
 *
 *   1. DOOR-NESS. A red strip is a `<button>` wrapping `PersonSurface`; everything else is a
 *      `<div>`. A DOM repaint cannot cross that line. So a strip that turns RED live carries its
 *      tint and its why but is not tappable until the next load, and a strip that LEAVES red
 *      stays a door onto a modal built from the state it had at page load. The second is the
 *      sharper half — an action taken from that modal writes against stale data — and it is
 *      bounded rather than harmless: every action is a request to a route that carries its own
 *      guards, so the worst case is a refusal or a no-op, never a write the route would not
 *      have accepted from a fresh board.
 *   2. THE ASSISTANT'S MESSAGE IN THE CREATE DIRECTION. It is retexted and removed (see
 *      `paintAssistant`); it is not built, because building it would mean this file owning that
 *      band's markup.
 *   3. RULING 8's ALERT STRIP, at all. Ownerless criticals have no holder, so nothing on this
 *      surface can assign or unassign one — no action can move that strip, in either direction.
 *      Only a guest claiming a shared item moves it, and that waits for the next load.
 *
 * All three fail toward a board that is quieter than the truth rather than louder than it, which
 * is the direction every ruling on this screen points.
 *
 * ── THE BASELINE, AND THE ONE-LINE BUG IT EXISTS TO CLOSE ─────────────────────────────────
 *
 * ⚠ THE DIFF'S BASELINE IS THE BOARD THE REPLAY RESOLVED TO, NEVER THE BOARD IT OPENED ON. Get
 * that wrong and the first poll re-sparks every flip the arrival replay just played, twenty
 * seconds after she watched them.
 *
 * It is closed STRUCTURALLY rather than by remembering to close it: the baseline is read off the
 * board's own `data-strip-state` attributes at ARM time — and arm time is after the replay has
 * finished walking, so what is on those attributes IS what it resolved to. This island never
 * receives the replay's steps, never imports `ReplayStep`, and has no `from` to be tempted by.
 * After the first poll the baseline advances from the fetched payload rather than from the DOM,
 * so a strip that failed to paint costs one missed animation rather than being re-detected, and
 * re-stamped, on every poll for the life of the page.
 *
 * ── RULING 29 — VISIBILITY ────────────────────────────────────────────────────────────────
 *
 * NOTHING STAMPS WHILE THE DOCUMENT IS HIDDEN, polling PAUSES while hidden, and returning fires
 * an IMMEDIATE refresh so she comes back to a true board rather than a stale one. A spark thrown
 * in a background tab is a celebration nobody attended, and stamping it consumes news that was
 * shown to no one.
 *
 * ── WHAT A FAILED POLL DOES ───────────────────────────────────────────────────────────────
 *
 * Keeps the last good board, keeps the baseline where it was, and keeps polling. It says
 * NOTHING. An error banner on a screen whose whole job is a four-second answer is the lean-in
 * Ruling 1's general test refuses, and the failure is self-correcting twenty seconds later.
 */

import { useEffect, useRef } from 'react';
import {
  GLANCE_POLL_MS,
  GLANCE_REFRESH_EVENT,
  GLANCE_REPLAY_DONE_EVENT,
  diffLive,
  liveStampDecision,
  liveStates,
} from '@/lib/glance/live';
import type { EventGlance, GlancePerson, PersonState } from '@/lib/glance/state';
import type { LiveFlip } from '@/lib/glance/live';
import {
  burst,
  ensureSparkLayer,
  paintAssistant,
  paintStrip,
  paintSummary,
  prefersReducedMotion,
  setWords,
  stripFor,
  stripStateOf,
  TRANSITION,
} from './paint';

/** Everyone on the board, housed and unhoused, so a repaint can find a person's payload. */
function peopleOf(glance: EventGlance): Map<string, GlancePerson> {
  const people = new Map<string, GlancePerson>();
  for (const household of glance.households) {
    for (const person of household.members) people.set(person.personEventId, person);
  }
  for (const person of glance.unhoused) people.set(person.personEventId, person);
  return people;
}

export default function GlanceLive({
  eventId,
  hasReplay,
}: {
  eventId: string;
  /**
   * Whether the server handed the arrival island anything to play.
   *
   * A BOOLEAN, NOT THE STEPS. This island must never see them: `step.from` is the past board,
   * and a baseline seeded from it is the one-line bug this slice exists to avoid. The boolean
   * answers only "do I wait for the replay, or arm now?"
   */
  hasReplay: boolean;
}) {
  /** The board she is currently being shown, as states. Seeded at arm, advanced by each poll. */
  const baseline = useRef<Map<string, PersonState> | null>(null);
  const timer = useRef<number | null>(null);
  /** In flight, so a visibility flip during a slow poll cannot start a second one. */
  const busy = useRef(false);
  /**
   * RULING 30 — the quiet debt. Has a NON-SPARK change repainted since the last stamp?
   *
   * A REF, NOT A LOCAL, and the distinction is the ruling. "Since the last stamp" spans polls;
   * a local would be reset to false on every tick and the rule would silently become "in this
   * tick only", which is the half of the failure that is easiest to miss — a red at 12:03 and a
   * spark at 12:04 are different ticks and that is exactly the case the ruling is about.
   */
  const quietDebt = useRef(false);

  useEffect(() => {
    let live = true;

    /** Ruling 29: nothing happens — no fetch, no paint, no stamp — while the tab is hidden. */
    const visible = () => document.visibilityState === 'visible';

    /**
     * Read the board off the board. See the header: this is what closes the baseline bug
     * structurally, because it runs only once the arrival replay has finished walking.
     */
    const seedFromBoard = () => {
      const seeded = new Map<string, PersonState>();
      for (const el of document.querySelectorAll<HTMLElement>('[data-person-event-id]')) {
        const id = el.dataset.personEventId;
        const state = stripStateOf(el);
        if (id && state) seeded.set(id, state);
      }
      baseline.current = seeded;
    };

    const stamp = () => {
      // RULING 29, AT FIRE TIME RATHER THAN AT POLL TIME. A tab can go hidden between the
      // fetch and here, and a stamp is the one thing that cannot be taken back.
      if (!visible()) return;
      void fetch(`/api/events/${eventId}/glance/seen`, { method: 'POST' }).catch(() => {
        // A failed stamp costs one repeated replay on the next visit. It fails safe, so it is
        // swallowed rather than shown — Ruling 1's general test refuses the toast.
      });
    };

    const apply = (glance: EventGlance) => {
      const next = liveStates(glance);
      const previous = baseline.current;
      baseline.current = next;
      if (!previous) return;

      const flips = diffLive(previous, next);
      if (flips.length === 0) return;

      const people = peopleOf(glance);
      const reduced = prefersReducedMotion();
      /**
       * What actually reached the screen, which is not the same as what the diff found. A strip
       * that is not on the board was shown to nobody, so under Ruling 30 it neither sparks nor
       * owes a debt.
       */
      const painted: LiveFlip[] = [];

      for (const flip of flips) {
        const el = stripFor(flip.personEventId);
        if (!el) continue;
        // The colour transition is the "without ceremony" half of Ruling 26: every change
        // arrives on the same 0.7s ramp, and only a spark gets anything more.
        el.style.transition = TRANSITION;
        const landed = paintStrip(el, flip.to);
        const person = people.get(flip.personEventId);
        // Live, the words are not in the past — they are in the payload that just arrived, so
        // they change WITH the tint rather than being suppressed until it lands.
        if (person) setWords(el, person);
        if (landed && flip.spark && !reduced) burst(el, ensureSparkLayer());
        if (landed) painted.push(flip);
      }

      // Ruling 2's sentence and §3's one message follow the strips, so the four-second answer
      // cannot sit above a board that has moved underneath it.
      paintSummary(glance);
      paintAssistant(glance);

      // RULING 24, AS RULING 30 NARROWS IT. "glanceSeenAt is the high-water mark of news this
      // viewer has been shown, whether shown on arrival or shown live" — and because the mark
      // is a single INSTANT rather than a per-person cursor, a spark that stamps carries every
      // quiet change behind it past the mark too. So a spark stamps only when nothing quiet is
      // owed.
      //
      // ⚠ THE RULE IS NOT SPELLED OUT HERE, AND THAT IS DELIBERATE. `liveStampDecision` is pure
      // and is driven directly in `test:glance-replay` layer 1e; a condition written at this
      // call site would be a rule only a browser could exercise.
      const decision = liveStampDecision(painted, quietDebt.current);
      quietDebt.current = decision.quietDebtAfter;
      if (decision.stamp) stamp();
    };

    const poll = async () => {
      if (!live || busy.current || !visible()) return;
      busy.current = true;
      try {
        const response = await fetch(`/api/events/${eventId}/glance`);
        if (!response.ok) return;
        const glance = (await response.json()) as EventGlance;
        if (live) apply(glance);
      } catch {
        // A failed poll keeps the last good board and keeps polling. It says nothing.
      } finally {
        busy.current = false;
      }
    };

    const start = () => {
      if (timer.current !== null) return;
      timer.current = window.setInterval(poll, GLANCE_POLL_MS);
    };
    const stop = () => {
      if (timer.current === null) return;
      window.clearInterval(timer.current);
      timer.current = null;
    };

    /** Arm: seed the baseline off the resolved board, then start the clock if she is here. */
    const arm = () => {
      if (baseline.current !== null) return;
      seedFromBoard();
      if (visible()) start();
    };

    const onVisibility = () => {
      if (!visible()) {
        // Ruling 29: polling PAUSES. Nothing is queued and nothing is owed on return except a
        // look at the truth.
        stop();
        return;
      }
      if (baseline.current === null) return;
      // Ruling 29: and refreshes IMMEDIATELY on return, so she comes back to a true board
      // rather than to one that is up to twenty seconds old.
      start();
      void poll();
    };

    // Ruling 25: an action that moves the board does not wait for the next tick.
    const onRefresh = () => {
      if (baseline.current === null) return;
      void poll();
    };

    // ⚠ POLLING DOES NOT ARM UNTIL THE ARRIVAL REPLAY HAS COMPLETED **AND** STAMPED. A poll
    // landing mid-replay would repaint the board underneath the animation — the true board
    // arriving on top of the past one, halfway through the walk forward. With nothing to play
    // there is nothing to wait for, and the page has already stamped.
    if (hasReplay) window.addEventListener(GLANCE_REPLAY_DONE_EVENT, arm);
    else arm();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener(GLANCE_REFRESH_EVENT, onRefresh);

    return () => {
      live = false;
      stop();
      window.removeEventListener(GLANCE_REPLAY_DONE_EVENT, arm);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener(GLANCE_REFRESH_EVENT, onRefresh);
    };
  }, [eventId, hasReplay]);

  // Nothing. See the header: this island is effects and no markup, which is what keeps 6c's
  // "the island renders nothing when there are no steps" true rather than narrowed.
  return null;
}
