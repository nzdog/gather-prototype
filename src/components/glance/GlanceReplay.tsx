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
import type { PersonState } from '@/lib/glance/state';
import { STRIP_TONE, stripHexes } from './strip';
import GlanceReplayPreview from './GlanceReplayPreview';

/**
 * The reference's ramp: "~18 particles per flip in the green/amber ramp hexes."
 *
 * DERIVED from the two tints themselves — see `stripHexes`. A hex written here would be a
 * second definition of the palette, free to drift from the strips the sparks come off.
 */
const SPARK_COLOURS = [...stripHexes('AMBER'), ...stripHexes('GREEN')];

/** The animation, as prototyped (`docs/design/moment4-glance-reference.md`). */
const PARTICLE_COUNT = 18;
const THROW_MIN_PX = 35;
const THROW_MAX_PX = 80;
const PARTICLE_MIN_MS = 900;
const PARTICLE_MAX_MS = 1300;
const PARTICLE_SIZE_PX = 4;
const RING_WIDTH_PX = 3;
const RING_MS = 700;
const POP_SCALE = 1.12;
const POP_MS = 520;
const COLOUR_MS = 700;
/** Overshoot, so the pop lands like a thing with weight rather than a thing being resized. */
const OVERSHOOT = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

const TRANSITION = `background-color ${COLOUR_MS}ms ease, color ${COLOUR_MS}ms ease, border-color ${COLOUR_MS}ms ease, opacity ${COLOUR_MS}ms ease`;

/**
 * `useLayoutEffect` on the client, `useEffect` on the server pass.
 *
 * The timing matters — the past has to be painted before the browser paints again — but React
 * warns when a layout effect is called during a server render, and a client component in the
 * App Router is server-rendered for the first HTML. This is the ordinary way to have both.
 */
const useBrowserLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** A number in [min, max). The spread the reference asks for, not a fixed value. */
function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/**
 * Swap a strip's TINT and leave everything else exactly as the board wrote it.
 *
 * The class string is not recomposed here: the tone is a contiguous substring of what the
 * board rendered, so it is substituted in place. That keeps the strip's shape — and the
 * `block w-full text-left` a red door carries — out of this module entirely. If the tone is
 * not found the strip is left alone: the true board is already correct, so failing to animate
 * is the recoverable failure and a mangled class string is not.
 */
function paint(el: HTMLElement, to: PersonState): boolean {
  const current = el.dataset.stripState as PersonState | undefined;
  if (!current || !STRIP_TONE[current] || !STRIP_TONE[to]) return false;
  const from = STRIP_TONE[current].className;
  if (!el.className.includes(from)) return false;
  el.className = el.className.replace(from, STRIP_TONE[to].className);
  el.dataset.stripState = to;
  return true;
}

/**
 * Hide or show the half of a strip that describes the person's state NOW.
 *
 * ── FINDING 1, RULED (6c) ────────────────────────────────────────────────────────────────
 *
 * The tint rewinds and the words cannot: they are server-rendered from the CURRENT state, and
 * the past `reasons` are not on the wire — `ReplayStep` is exactly four keys and the allowlist
 * holds. So during the rewind a strip painted GREEN went on reading "— out", and one painted
 * AMBER went on carrying "maybe timed out". The ruling:
 *
 *   "During the replay, SUPPRESS THE REASON LINE on any strip that still has a pending step;
 *    let it appear as the step lands. A green strip reading 'out' is incoherent and the words
 *    are the truthful half."
 *
 * So they are HIDDEN, never rewritten. Rewriting would need the past reasons — the fifth key.
 * Hiding needs nothing on the wire at all.
 *
 * ⚠ ONLY STRIPS WITH A PENDING STEP. A strip that is not in the replay never changes state, so
 * its words are true of both boards and are left alone throughout.
 */
function showWords(el: HTMLElement, show: boolean): void {
  const words = el.querySelector<HTMLElement>('[data-strip-words]');
  if (!words) return;
  if (show) words.hidden = false;
  else words.hidden = true;
}

/** The flourish: a pop on the strip, a ring off it, and eighteen particles thrown clear. */
function burst(el: HTMLElement, layer: HTMLElement | null): void {
  const box = el.getBoundingClientRect();

  // THE POP, on the strip itself — the thing that changed is the thing that moves.
  el.animate(
    [
      { transform: 'scale(1)' },
      { transform: `scale(${POP_SCALE})`, offset: 0.45 },
      { transform: 'scale(1)' },
    ],
    { duration: POP_MS, easing: OVERSHOOT }
  );

  if (!layer || SPARK_COLOURS.length === 0) return;

  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;

  // THE RING — 3px, expanding off the strip's own outline.
  const ring = document.createElement('div');
  ring.setAttribute(
    'style',
    `position:absolute;left:${box.left}px;top:${box.top}px;width:${box.width}px;height:${box.height}px;` +
      `border:${RING_WIDTH_PX}px solid ${SPARK_COLOURS[SPARK_COLOURS.length - 1]};border-radius:6px;`
  );
  layer.appendChild(ring);
  const ringAnim = ring.animate(
    [
      { transform: 'scale(0.96)', opacity: 0.85 },
      { transform: 'scale(1.28)', opacity: 0 },
    ],
    { duration: RING_MS, easing: 'ease-out' }
  );
  ringAnim.onfinish = () => ring.remove();

  // THE PARTICLES — thrown 35–80px over 0.9–1.3s, so the burst frays rather than pulsing.
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = (i / PARTICLE_COUNT) * Math.PI * 2 + between(-0.2, 0.2);
    const distance = between(THROW_MIN_PX, THROW_MAX_PX);
    const dot = document.createElement('div');
    dot.setAttribute(
      'style',
      `position:absolute;left:${cx}px;top:${cy}px;width:${PARTICLE_SIZE_PX}px;height:${PARTICLE_SIZE_PX}px;` +
        `margin:${-PARTICLE_SIZE_PX / 2}px 0 0 ${-PARTICLE_SIZE_PX / 2}px;border-radius:50%;` +
        `background:${SPARK_COLOURS[i % SPARK_COLOURS.length]};`
    );
    layer.appendChild(dot);
    const anim = dot.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        {
          transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance + distance * 0.35}px) scale(0.4)`,
          opacity: 0,
        },
      ],
      {
        duration: between(PARTICLE_MIN_MS, PARTICLE_MAX_MS),
        easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)',
      }
    );
    anim.onfinish = () => dot.remove();
  }
}

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
  const reduced =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const strips = steps.map((step) =>
    document.querySelector<HTMLElement>(
      `[data-person-event-id="${CSS.escape(step.personEventId)}"]`
    )
  );

  // ── PAINT THE PAST, with transitions OFF ──────────────────────────────────
  //
  // The backwards move is not part of the replay and must not be animated: fading the true
  // board back into the old one for 0.7s is the "glitch, not a replay" reading the ticket
  // records as the risk. It is a jump by design; only the walk forward is animated.
  strips.forEach((el, i) => {
    if (!el) return;
    el.style.transition = 'none';
    paint(el, steps[i].from);
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
      if (paint(el, step.to) && step.spark && !reduced) burst(el, layer);
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

    played.current = true;
    timers.current = runReplay(steps, scheduleReplay(steps), layer.current, () => {
      void fetch(`/api/events/${eventId}/glance/seen`, { method: 'POST' }).catch(() => {
        // A failed stamp costs one repeated replay on the next visit. It fails safe, so it
        // is swallowed rather than shown: an error toast on a screen whose whole job is a
        // four-second answer is the lean-in Ruling 1's general test refuses.
      });
    });

    return () => timers.current.forEach((t) => window.clearTimeout(t));
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
        className="pointer-events-none fixed inset-0 z-40 overflow-hidden"
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
