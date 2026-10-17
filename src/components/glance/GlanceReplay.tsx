'use client';

/**
 * GTC-192 (J1, phase 6, slice 6c) — THE ARRIVAL REPLAY, PLAYED.
 *
 * Ruling 1: the replay exists to deliver the SHOULDER-DROP — proof she didn't need to watch.
 * 6a derived the steps, 6b remembered that she was shown them; this is where she sees them.
 *
 * ── AN ISLAND, NOT A CLIENT BOARD — PHASE 4'S PATTERN, ONE SIZE SMALLER ─────────────────
 *
 * `GlanceBoard` stays a server component with no hooks, which is the property phase 2 built it
 * for and the reason the true board is in the FIRST paint. So the replay cannot be a wrapper
 * around every strip — that would hydrate sixty-four components on the oversized board to
 * animate five of them. It is ONE island beside the board, and it repaints strips it does not
 * own, finding them by the `data-person-event-id` the board marks them with.
 *
 * That is a deliberate trade and it is worth naming: the island touches the DOM directly
 * rather than through React. The board owns the TRUTH — what the states are — and the island
 * owns only the three seconds before that truth is reached. Nothing it does survives a
 * re-render, because there is nothing to re-render: it holds no state and paints no strips of
 * its own.
 *
 * ── WHAT PLAYS, AND HOW LOUDLY ──────────────────────────────────────────────────────────
 *
 * Ruling 26(b): good news and reds play; everything else is the new board arriving without
 * ceremony. Ruling 6: the reversal plays LAST, quietly, NO sparks. Both are settled in
 * `deriveReplay` before anything reaches here — this module invents no step, drops no step and
 * reorders no step. It plays what it is handed, in the order it is handed.
 *
 * The flourish is `spark` and only `spark`, which `deriveReplay` sets for AMBER → GREEN alone.
 * Everything else — every red, and the reversal that ends the replay — gets the 0.7s colour
 * transition by itself. "Quietly" is not a shorter burst; it is no burst.
 *
 * ── PAINTING THE PAST, AND THE THING TO WATCH ───────────────────────────────────────────
 *
 * The server renders the CURRENT board. On mount this island paints the OLD tints and then
 * walks forward. The paint is a LAYOUT effect so nothing of ours reaches the screen between
 * the two.
 *
 * ⚠ IT CANNOT BE INVISIBLE, AND THE TICKET RECORDS THAT AS A RISK RATHER THAN A SETTLED
 * QUESTION. The board is server-rendered, so the browser paints the TRUE tints as the HTML
 * arrives — before any client code exists to run. A layout effect is the earliest moment
 * hydration offers, and it is still after that first paint. So the true board is visible for
 * one hydration's worth of time and then jumps backwards. The stated fallback, if it reads as
 * a glitch rather than as a replay, is to skip painting the past and spark only what changed —
 * NOT TAKEN HERE; walked and reported instead.
 *
 * ── THE STAMP ──────────────────────────────────────────────────────────────────────────
 *
 * Ruling 6: "'seen' means the replay played." So the POST goes out when the LAST beat has
 * finished, not on arrival, and it carries no body — the instant is the server's
 * (`stampGlanceSeen`), never a browser's. A host who closes the tab at two seconds does not
 * stamp and sees the same replay next time: it repeats rather than loses, which is the safe
 * direction, and the "replay finished OR N seconds" softening is recorded on the ticket as NOT
 * RULED and is deliberately not invented here.
 *
 * ── REDUCED MOTION — a build decision, flagged, not a ruling ────────────────────────────
 *
 * Under `prefers-reduced-motion: reduce` the particles, the ring and the pop are suppressed
 * and the tint walk and its schedule are UNCHANGED. The sequence is the news; the motion is
 * the decoration. Keeping the walk keeps "seen" meaning the same thing for every viewer —
 * skipping straight to the true board would stamp news she was never shown.
 *
 * ── A DEV-ONLY VIEWING MODE, AND WHAT IT IS CAREFUL NOT TO TOUCH ────────────────────
 *
 * The replay is ~1.8s on a five-step board and is over before a person watching for the
 * first time has focused on it. `?replay=manual` on the glance URL holds it behind a Play
 * button and spaces the steps a second apart, so it can be WATCHED rather than caught.
 *
 * ⚠ IT IS NOT THE PRODUCT AND IT CHANGES NOTHING ABOUT THE PRODUCT. Three rulings sit on
 * this file and all three are left exactly where they are:
 *
 *   - RULING 1's ~3s budget. `scheduleReplay` is untouched and still the only schedule the
 *     shipped replay ever uses. The preview's spacing deliberately does NOT fit the budget
 *     — that is the whole of what makes it a preview — so it is a separate function with a
 *     separate name, never a widened constant that the real path would inherit.
 *   - RULING 6's "nothing to press". The button exists ONLY after a client effect has read
 *     the query param, so the island's rendered markup is byte-for-byte what it always was
 *     and `test:glance-grid`'s "NO ACKNOWLEDGE CONTROL ANYWHERE" assertion stays green on
 *     the real thing rather than being narrowed to accommodate a dev affordance.
 *   - RULING 6's "'seen' means the replay played". The preview does NOT stamp: it is a
 *     rehearsal, not an arrival, and news consumed by a rehearsal is news she never saw.
 *     The stamp has exactly one caller and it is the automatic path.
 *
 * ⚠ AND THE PREVIEW DOES NOT PAINT THE PAST ON MOUNT. Ruling 1: never hold the answer
 * hostage. A board that sat showing a two-day-old state until someone pressed a button
 * would do exactly that, so the true board is left alone until Play is pressed — the rewind
 * is the first thing the press does.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  QUIET_DURATION_MS,
  SPARK_DURATION_MS,
  scheduleReplay,
  type ReplayBeat,
  type ReplayStep,
} from '@/lib/glance/replay';
import { GLANCE_REPLAY_DONE_EVENT } from '@/lib/glance/live';
import {
  SPARK_LAYER_CLASS,
  TRANSITION,
  burst,
  paintStrip,
  prefersReducedMotion,
  showWords,
  stripFor,
} from './paint';
import GlanceReplayPreview from './GlanceReplayPreview';

/**
 * `useLayoutEffect` on the client, `useEffect` on the server pass.
 *
 * The timing matters — the past has to be painted before the browser paints again — but React
 * warns when a layout effect is called during a server render, and a client component in the
 * App Router is server-rendered for the first HTML. This is the ordinary way to have both.
 */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * ONE DEFINITION OF THE WALK, taking its schedule as an argument.
 *
 * Both callers below — the automatic replay and the dev preview — come through here, because
 * two copies of "paint the past, then walk it forward" would be free to drift, and the one
 * that drifts would be the one nobody watches. What differs between them is the SCHEDULE and
 * what happens at the end, so those are the two parameters; everything else is identical.
 *
 * Returns its timer ids, so a caller can cancel a walk that is still running.
 */
function runReplay(
  steps: readonly ReplayStep[],
  beats: readonly ReplayBeat[],
  layer: HTMLElement | null,
  onFinished: () => void
): number[] {
  const reduced = prefersReducedMotion();

  const strips = steps.map((step) => stripFor(step.personEventId));

  // ── PAINT THE PAST, with transitions OFF ──────────────────────────────────
  //
  // The backwards move is not part of the replay and must not be animated: fading the true
  // board back into the old one for 0.7s is the "glitch, not a replay" reading the ticket
  // records as the risk. It is a jump by design; only the walk forward is animated.
  strips.forEach((el, i) => {
    if (!el) return;
    el.style.transition = 'none';
    paintStrip(el, steps[i].from);
    // Finding 1: the words describe the state this strip has NOT reached yet.
    showWords(el, false);
  });
  // Commit the past as the transition's starting value before any transition exists.
  void document.body.offsetHeight;
  strips.forEach((el) => {
    if (el) el.style.transition = TRANSITION;
  });

  // ── WALK FORWARD ──────────────────────────────────────────────
  const timers = steps.map((step, i) =>
    window.setTimeout(() => {
      const el = strips[i];
      if (!el) return;
      // The words become true at exactly the moment the tint does, so they arrive together.
      showWords(el, true);
      if (paintStrip(el, step.to) && step.spark && !reduced) burst(el, layer);
    }, beats[i].delayMs)
  );

  // ── AND THEN HAND THE STRIPS BACK ───────────────────────────────────
  const endsAt = Math.max(...beats.map((b) => b.delayMs + b.durationMs));
  timers.push(
    window.setTimeout(() => {
      // Exactly as the board wrote them: right tint, right words, no inline style.
      // `showWords` is idempotent, so a step whose timer already ran is a no-op.
      strips.forEach((el) => {
        if (!el) return;
        showWords(el, true);
        el.style.removeProperty('transition');
      });
      onFinished();
    }, endsAt)
  );

  return timers;
}

/**
 * DEV ONLY — is `?replay=manual` on this URL?
 *
 * Read from `window.location` inside an effect rather than from `searchParams` on the page,
 * for two reasons that both matter: the page stays a server component that knows nothing
 * about this, and the control cannot exist in the island's rendered markup — which is what
 * `test:glance-grid` asserts Ruling 6 with.
 */
function previewRequested(): boolean {
  return new URLSearchParams(window.location.search).get('replay') === 'manual';
}

/** The preview's spacing: a second between steps, because it is made to be watched. */
const PREVIEW_STEP_INTERVAL_MS = 1000;

/**
 * The preview's schedule — deliberately NOT `scheduleReplay`.
 *
 * ⚠ THIS OVERRUNS `REPLAY_BUDGET_MS` AND IS MEANT TO. Ruling 1 fences the replay a host
 * actually receives; a rehearsal that a developer is watching on purpose is not that replay,
 * and widening the shipped constant to buy a slower rehearsal would put the cost on every
 * host to serve a person looking at a screen. So the budget keeps its meaning and this keeps
 * its own name: nothing on the automatic path can reach it.
 */
function previewBeats(steps: readonly ReplayStep[]): ReplayBeat[] {
  return steps.map((step, i) => ({
    delayMs: i * PREVIEW_STEP_INTERVAL_MS,
    durationMs: step.spark ? SPARK_DURATION_MS : QUIET_DURATION_MS,
  }));
}

export default function GlanceReplay({ eventId, steps }: { eventId: string; steps: ReplayStep[] }) {
  const layer = useRef<HTMLDivElement | null>(null);
  /** One play, one stamp — a re-render or a strict-mode double effect must not repeat either. */
  const played = useRef(false);
  const timers = useRef<number[]>([]);
  /** DEV ONLY. False through every server render, so the markup Ruling 6 is asserted on is unchanged. */
  const [preview, setPreview] = useState(false);

  useBrowserLayoutEffect(() => {
    if (steps.length === 0 || played.current) return;

    // DEV ONLY. The preview leaves the true board exactly as the server rendered it and waits
    // to be asked — no rewind on mount, so nothing is held hostage behind a control.
    if (previewRequested()) {
      setPreview(true);
      return;
    }

    /*
      ── RULING 29 (slice 6e) — THE REPLAY DOES NOT START IN A BACKGROUND TAB ─────────────

      6c's walk found it and the ticket recorded it as finding 3: a replay in a hidden tab
      plays, completes and stamps, so "seen" is consumed by nobody. The ruling:

        NOTHING STAMPS WHILE THE DOCUMENT IS HIDDEN, and the arrival replay does not START
        while hidden — it waits for visible.

      ⚠ WAITING IS NOT A DELAY, IT IS A PRECONDITION. The walk is under Ruling 1's ~3s budget
      from the moment it begins, and it begins when she can see it. A host who opens the board
      in a background tab and comes to it two minutes later gets the whole replay, from the
      top, at the ruled pace — which is what "the replay played" was always supposed to mean.
    */
    const visible = () => document.visibilityState === 'visible';

    const play = () => {
      if (played.current) return;
      played.current = true;
      timers.current = runReplay(steps, scheduleReplay(steps), layer.current, () => {
        /*
          RULING 29's other half, CHECKED WHERE IT FIRES rather than where the walk started.
          A tab can be hidden part-way through a three-second replay, and the tail of it was
          then shown to nobody. Not stamping costs one repeated replay next visit, which is
          the direction 6b ruled safe: "Repeating is the safe direction; losing is not."
        */
        if (visible()) {
          void fetch(`/api/events/${eventId}/glance/seen`, { method: 'POST' })
            .catch(() => {
              // A failed stamp costs one repeated replay on the next visit. It fails safe, so
              // it is swallowed rather than shown: an error toast on a screen whose whole job
              // is a four-second answer is the lean-in Ruling 1's general test refuses.
            })
            .finally(announce);
          return;
        }
        announce();
      });
    };

    /*
      ⚠ AND THIS IS WHAT LETS POLLING BEGIN — 6e's ordering, announced rather than assumed.

      A poll landing mid-replay repaints the board underneath the animation. So the live
      island does not arm until this fires, and this fires only once the walk is over AND the
      stamp attempt has settled — "completed and stamped" is two things. It fires even when
      the stamp was skipped or failed: the replay is over either way, and the board is correct
      either way, so there is nothing left for polling to trample.
    */
    function announce() {
      window.dispatchEvent(new Event(GLANCE_REPLAY_DONE_EVENT));
    }

    if (visible()) {
      play();
      return () => timers.current.forEach((t) => window.clearTimeout(t));
    }

    const onVisibility = () => {
      if (!visible()) return;
      document.removeEventListener('visibilitychange', onVisibility);
      play();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, [eventId, steps]);

  /** Timers from a preview press outlive the effect above, so unmount clears them too. */
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  /**
   * DEV ONLY — rehearse the walk at the preview's spacing.
   *
   * NO STAMP, deliberately: the completion callback is empty, so this consumes nothing and can
   * be pressed as many times as it takes to see what happened. The mechanics are `runReplay`,
   * the same single definition the automatic path uses — the preview changes the SCHEDULE and
   * nothing else.
   */
  const rehearse = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = runReplay(steps, previewBeats(steps), layer.current, () => {});
  };

  // "No fake fireworks. If nothing changed, nothing plays." Nothing is also what renders.
  if (steps.length === 0) return null;

  /*
    The particle layer, and — on the path a host takes — NOTHING ELSE. Ruling 6 is that "seen"
    means the replay played: no acknowledge control, no inbox mechanics, and nothing to press
    to make it stop. `pointer-events-none` keeps the layer from intercepting a tap on a red
    door underneath, and `aria-hidden` keeps a decoration out of the accessibility tree; the
    strips themselves carry the meaning and are read normally.

    The dev chrome below renders ONLY under `?replay=manual`, only after a client effect has
    said so, and never in the markup this island returns from a server render.
  */
  return (
    <>
      <div
        ref={layer}
        data-glance-replay={steps.length}
        aria-hidden="true"
        className={SPARK_LAYER_CLASS}
      />
      {preview && (
        <GlanceReplayPreview
          stepCount={steps.length}
          intervalSeconds={PREVIEW_STEP_INTERVAL_MS / 1000}
          play={rehearse}
        />
      )}
    </>
  );
}
