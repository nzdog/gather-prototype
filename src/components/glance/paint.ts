/**
 * GTC-192 (J1, phase 6, slice 6e) — THE PAINTERS, held in one place.
 *
 * ⚠ THIS FILE IS AN EXTRACTION, NOT AN INVENTION. Every painter below was written in 6c and
 * lived inside `GlanceReplay.tsx`, which was correct while there was exactly one thing painting
 * strips. 6e adds a second — the live poller — and it repaints the same strips, in the same
 * tones, with the same burst. A `burst` that exists twice can be tuned in one copy with nothing
 * failing; so can a tone swap, and so can the transition. That is the failure this ticket
 * refuses at `isChaseable`, at `mayHoldRow`, at the colours and at the fence list, and this is
 * the same refusal applied to the animation.
 *
 * Nothing about the animation changed in the move. `tests/glance-replay-test.ts` asserts the
 * painters are ONE module read by BOTH islands, and that neither island writes a burst, a
 * particle count or a hex of its own.
 *
 * ── WHAT LIVES HERE, AND WHAT DELIBERATELY DOES NOT ───────────────────────────────────────
 *
 * HERE: how to change one thing on the board — a tint, a strip's words, the summary sentence,
 * the assistant's line — and how to throw the flourish.
 *
 * NOT HERE: WHEN. The arrival replay's walk (`runReplay`, and the `setTimeout` schedule Ruling 1
 * budgets) stays in `GlanceReplay.tsx`, because it is that island's own story; the live poll's
 * interval stays in `GlanceLive.tsx`. This module has no timer of any kind, which is asserted:
 * it is on the surface list that may start neither an interval nor a timeout.
 *
 * ── THE ONE RULE THAT GOVERNS ALL OF IT: VALUES, NEVER STRUCTURE ──────────────────────────
 *
 * A painter may change what an element SAYS. It may not decide whether an element EXISTS, with
 * one stated exception below. The board is a server component and it OWNS the markup: which
 * strips are doors, which cards exist, whether the assistant is speaking at all. A client that
 * could build those is a second renderer of the board, and the board having exactly one
 * renderer is what phase 2 bought with the no-hooks property.
 *
 * ⚠ THE EXCEPTION, NAMED SO IT STAYS ONE: `setWords` creates and removes the state-words span.
 * It has to, because the board emits that span only when there is something to say, and a live
 * AMBER → RED gains Ruling 4's why ("a red is her move, and a move needs a direction") with
 * nowhere to put it. The line is drawn where duplication starts: the span's CLASS comes from
 * `STRIP_WORDS_CLASS` in the strip module and its TEXT from `stripStateWords`, so nothing about
 * how words look or read is decided here — only that one span exists.
 */

import {
  STRIP_TONE,
  STRIP_WORDS_CLASS,
  stripHexes,
  stripStateWords,
  summaryClauses,
  summarySentence,
} from './strip';
import { assistantMessage, findCriticalRedHits } from './assistant';
import type { EventGlance, GlancePerson, PersonState } from '@/lib/glance/state';

/**
 * The reference's ramp: "~18 particles per flip in the green/amber ramp hexes."
 *
 * DERIVED from the two tints themselves. A hex written here would be a second definition of the
 * palette, free to drift from the strips the sparks come off.
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

export const TRANSITION = `background-color ${COLOUR_MS}ms ease, color ${COLOUR_MS}ms ease, border-color ${COLOUR_MS}ms ease, opacity ${COLOUR_MS}ms ease`;

/**
 * The particle layer's class, written once and used by both islands.
 *
 * `pointer-events-none` keeps it from intercepting a tap on a red door underneath;
 * `aria-hidden` (applied by each caller) keeps a decoration out of the accessibility tree.
 */
export const SPARK_LAYER_CLASS = 'pointer-events-none fixed inset-0 z-40 overflow-hidden';

/** The id the lazily-created layer carries, so there is never more than one of it. */
const LIVE_LAYER_ID = 'glance-live-spark-layer';

/** A number in [min, max). The spread the reference asks for, not a fixed value. */
function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Is the viewer asking for less motion? Checked at each burst, not cached at mount. */
export function prefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** The strip the board rendered for this person, door or plain, or null if it is not there. */
export function stripFor(personEventId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[data-person-event-id="${CSS.escape(personEventId)}"]`
  );
}

/** The state a strip is currently showing, read back off the board's own attribute. */
export function stripStateOf(el: HTMLElement): PersonState | null {
  const current = el.dataset.stripState as PersonState | undefined;
  return current && STRIP_TONE[current] ? current : null;
}

/**
 * Swap a strip's TINT and leave everything else exactly as the board wrote it.
 *
 * The class string is not recomposed here: the tone is a contiguous substring of what the board
 * rendered, so it is substituted in place. That keeps the strip's shape — and the
 * `block w-full text-left` a red door carries — out of this module entirely. If the tone is not
 * found the strip is left alone: the true board is already correct, so failing to animate is the
 * recoverable failure and a mangled class string is not.
 */
export function paintStrip(el: HTMLElement, to: PersonState): boolean {
  const current = stripStateOf(el);
  if (!current || !STRIP_TONE[to]) return false;
  const from = STRIP_TONE[current].className;
  if (!el.className.includes(from)) return false;
  el.className = el.className.replace(from, STRIP_TONE[to].className);
  el.dataset.stripState = to;
  return true;
}

/**
 * Hide or show the half of a strip that describes the person's state NOW.
 *
 * ── FINDING 1, RULED (6c) — and it is the ARRIVAL replay's problem alone ──────────────────
 *
 * The tint rewinds and the words cannot: they are server-rendered from the CURRENT state, and
 * the past `reasons` are not on the wire — `ReplayStep` is exactly four keys and the allowlist
 * holds. So during the rewind a strip painted GREEN went on reading "— out". The ruling: hide
 * them while a step is pending and let them appear as the step lands. HIDDEN, never rewritten;
 * rewriting would need the fifth key the allowlist refuses.
 *
 * ⚠ THE LIVE PATH HAS THE OPPOSITE PROBLEM AND THE OPPOSITE ANSWER — see `setWords`. Live, the
 * words are not in the past; they are the CURRENT payload's, and the payload is in hand.
 */
export function showWords(el: HTMLElement, show: boolean): void {
  const words = el.querySelector<HTMLElement>('[data-strip-words]');
  if (!words) return;
  if (show) words.hidden = false;
  else words.hidden = true;
}

/**
 * Write a strip's state-words from a payload that HAS them — the live path's half of finding 1.
 *
 * The arrival replay can only hide these, because it is describing a past it cannot reconstruct.
 * A live poll has no such handicap: the words it needs are `stripStateWords(person)` over the
 * payload that just arrived, computed by the same function the board renders with. So live
 * strips do not go wordless while their tint moves — a strip turning red carries its why in the
 * same instant, exactly as it would on a fresh load.
 *
 * ⚠ CREATES AND REMOVES THE SPAN. The stated exception to values-never-structure; see the file
 * header for where the line is drawn and why.
 */
export function setWords(el: HTMLElement, person: GlancePerson): void {
  const words = stripStateWords(person);
  const span = el.querySelector<HTMLElement>('[data-strip-words]');
  if (words === null) {
    span?.remove();
    return;
  }
  if (span) {
    span.hidden = false;
    span.textContent = ` ${words}`;
    return;
  }
  const made = document.createElement('span');
  made.setAttribute('data-strip-words', '');
  made.className = STRIP_WORDS_CLASS;
  made.textContent = ` ${words}`;
  el.appendChild(made);
}

/**
 * RULING 2's sentence, repainted — the four-second answer, kept true.
 *
 * ⚠ THIS IS NOT THE RULING THAT SAYS THE SUMMARY DOES NOT COUNT DOWN. That one is about the
 * ARRIVAL replay, where the summary is the TRUTH and the board is the past: *"the summary
 * showing true counts while the board shows the past is the thing that keeps the answer
 * un-hostage."* The live case is the mirror image — the board becomes the truth and the summary
 * would be the past — and a lead clause reading "Nothing needs you." above a strip that has just
 * turned red is not context around the answer; it is the answer being wrong.
 *
 * The words come from `summaryClauses`, the function the board renders with. Nothing about the
 * sentence is decided here.
 */
export function paintSummary(glance: EventGlance): void {
  const p = document.querySelector<HTMLElement>('[data-summary]');
  if (!p) return;
  const lead = p.querySelector<HTMLElement>('span');
  if (!lead) return;
  const { lead: leadText, rest } = summaryClauses(glance.summary);
  lead.textContent = leadText;
  // The rest of the sentence is a bare text node beside the span, exactly as the board emits
  // it. Setting it to '' rather than removing the node keeps the shape stable across polls.
  const tail = lead.nextSibling;
  if (tail && tail.nodeType === Node.TEXT_NODE) tail.textContent = rest ? ` ${rest}` : '';
  else if (rest) p.appendChild(document.createTextNode(` ${rest}`));
  p.setAttribute('data-summary', summarySentence(glance.summary));
}

/**
 * §3's one plain assistant message — RETEXTED OR REMOVED, never created.
 *
 * This is the element Ruling 25 is really about. Phase 4's walk recorded it: take over the
 * critical red the assistant is naming, reload, and *"the assistant's message is gone"*. Once
 * "reload to see it" is deleted, a message still saying *"Gather is out of moves — the pavlova,
 * with Amelia Turner. It's yours now."* about an item that is already hers is the loudest wrong
 * thing on the board, and it would be wrong for up to twenty seconds — or until she reloaded,
 * which is the instruction just removed.
 *
 * ⚠ NEVER CREATED, AND THAT IS A STATED CEILING RATHER THAN AN OVERSIGHT. When the board renders
 * no message there is no element to write into, and building one here would mean this module
 * owning the assistant's markup, its border and its tint — a second renderer of the band. A
 * critical red that ARRIVES live therefore shows on its own strip, with its why, and the
 * assistant's line waits for the next full load. It fails toward silence, which is the direction
 * every ruling on this screen points.
 */
export function paintAssistant(glance: EventGlance): void {
  const p = document.querySelector<HTMLElement>('[data-assistant-message]');
  if (!p) return;
  const message = assistantMessage(findCriticalRedHits(glance));
  if (message === null) {
    p.remove();
    return;
  }
  p.textContent = message;
  p.setAttribute('data-assistant-message', message);
}

/**
 * The particle layer, made once and kept.
 *
 * The arrival island renders its own layer in JSX, because it renders anyway. The live poller
 * renders NOTHING — it is a pure-effects component, which is what keeps 6c's "the island renders
 * nothing when there are no steps" true rather than narrowed — so its layer is made here, on the
 * first spark that needs one, and reused after that.
 */
export function ensureSparkLayer(): HTMLElement {
  const existing = document.getElementById(LIVE_LAYER_ID);
  if (existing) return existing;
  const layer = document.createElement('div');
  layer.id = LIVE_LAYER_ID;
  layer.setAttribute('aria-hidden', 'true');
  layer.className = SPARK_LAYER_CLASS;
  document.body.appendChild(layer);
  return layer;
}

/** The flourish: a pop on the strip, a ring off it, and eighteen particles thrown clear. */
export function burst(el: HTMLElement, layer: HTMLElement | null): void {
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
