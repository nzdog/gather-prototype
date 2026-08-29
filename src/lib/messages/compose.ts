/**
 * GTC-187 (H2) — the three-movement message: the slots, who voices each one, how they join.
 *
 * Hinge §5, the whole architecture in one passage: "The message has three movements, seam
 * deliberately visible: (1) Kate speaks first, fully hers; (2) the handover, Kate introduces
 * Gather; (3) Gather takes over in its own voice." And the point of the seam: "The guest can
 * tell whose words are whose — and that's the design."
 *
 * This module owns the ARCHITECTURE and none of the words. The ask's words live in
 * `ask-register.ts`; the thank-you's do not exist yet — see THE MISSING REGISTER below.
 *
 * THE SHAPE IS A FOUNDER RULING, TAKEN VERBATIM (GTC-187 decision 7, 2026-08-23): "closed
 * register presets, named content fields". `Voice`, `VoiceProfile`, `ASK_REGISTER` and
 * `composeMessage` below match that ruling's declaration exactly, down to the field names,
 * which are the spec's own vocabulary for the three movements. Do not widen `VoiceProfile`
 * into something assembled per call: the ruling's stated reason for a baked constant is that
 * "an invalid authorship combination cannot be constructed".
 *
 * CLIENT-SAFE, for the reason `nudge-cadence.ts` is. The pre-flight (GTC-188) must show the
 * message the send will produce, not an approximation — Hinge §1 makes reading the real thing
 * the cure for "what will this thing say to my mother", and an approximation is exactly what
 * it refuses. One pure module called by both the screen and the dispatch path (GTC-189) is
 * how those two are prevented from disagreeing. The single import below reaches a module that
 * itself imports nothing; `tests/message-composition-test.ts` asserts the no-server-import
 * property structurally.
 *
 * THE MISSING REGISTER. There is deliberately no `THANK_YOU_REGISTER` here, and adding one is
 * not an executor's call. GTC-187 decision 7 checked Moment 4 §8.4 in full and found it
 * describes a ROLE inversion without ever stating a per-movement mapping: it does not say
 * which named slot Gather occupies in that direction, whether `handover` survives at all, or
 * whether the movements keep their order. "Reverse register" is glossed nowhere as either
 * "invert the voice at each position" or "reverse the sequence of movements", and both
 * readings fit the quoted text equally. The ruling left it open for a founder ruling; H1
 * (GTC-186) is where it lands.
 */

// Reused, not redefined. A second segment counter is how the number the host reads at the
// threshold and the number the carrier bills for start to disagree. `nudge-templates.ts`
// imports nothing, so reaching it keeps this module client-safe.
import { getMessageInfo } from '@/lib/sms/nudge-templates';

/** Who is speaking in a movement. Not who typed it — the handover is templated and voiced as
 *  the host, which is Hinge §5's design and not a shortcut. */
export type Voice = 'HOST' | 'SYSTEM';

/** GTC-187 decision 7, verbatim. */
export interface VoiceProfile {
  authorLine: Voice;
  handover: Voice;
  systemVoice: Voice;
}

/** GTC-187 decision 7, verbatim. The outgoing ask: Kate's line, Kate's handover, Gather's
 *  roadmap. Frozen as a constant so no call site can assemble a different one. */
export const ASK_REGISTER: VoiceProfile = {
  authorLine: 'HOST',
  handover: 'HOST',
  systemVoice: 'SYSTEM',
};

/** GTC-187 decision 7, verbatim. `authorLine` is nullable because Hinge §5 makes movement 1
 *  the host's — including theirs to cut to nothing. The other two are the register's words. */
export interface MovementContent {
  authorLine: string | null;
  handover: string;
  systemVoice: string;
}

export type MovementSlot = keyof VoiceProfile;

/**
 * The order the movements are read in.
 *
 * THIS IS THE ASK'S ORDER (Hinge §5, numbered 1–2–3 there). It is NOT a universal fact about
 * the architecture: "reverse register" in Moment 4 §8.4 may mean the thank-you reverses this
 * sequence, and decision 7 refuses to pick between that reading and the other one. A second
 * register must state its own order rather than inherit this constant.
 */
export const MOVEMENT_ORDER: readonly MovementSlot[] = ['authorLine', 'handover', 'systemVoice'];

export interface Movement {
  slot: MovementSlot;
  voice: Voice;
  text: string;
}

/** The blank line between movements. The seam is meant to be visible (Hinge §5); running the
 *  movements together as one paragraph would hide it. */
const MOVEMENT_SEPARATOR = '\n\n';

/**
 * The movements that will actually appear, each carrying who voices it.
 *
 * The preview renders from this rather than from the joined string, so the screen can show
 * whose words are whose — the thing Hinge §5 says the guest is supposed to be able to tell,
 * and the thing Kate is checking for at the threshold ("coverage and voice").
 *
 * An empty or whitespace-only movement is dropped, not rendered as a gap.
 */
export function movementsOf(content: MovementContent, profile: VoiceProfile): Movement[] {
  return MOVEMENT_ORDER.map((slot) => ({
    slot,
    voice: profile[slot],
    text: (content[slot] ?? '').trim(),
  })).filter((m) => m.text.length > 0);
}

/**
 * GTC-187 decision 7, verbatim signature.
 *
 * NO LENGTH CAP, NO TRUNCATION (decision 6): "No enforced cap. Multi-segment SMS is
 * acceptable and already ships... Do not truncate, do not block." The cost is made visible
 * instead — see `composedSegments`.
 */
export function composeMessage(content: MovementContent, profile: VoiceProfile): string {
  return movementsOf(content, profile)
    .map((m) => m.text)
    .join(MOVEMENT_SEPARATOR);
}

export interface ComposedCost {
  /** How many SMS segments the body occupies. Email ignores it. */
  segments: number;
  /**
   * Whether the count is being taken at 70 characters a segment instead of 160.
   *
   * NOT TRIVIA. GSM-7 has no em dash, so a single `—` anywhere in the body drops the whole
   * message to UCS-2 and more than doubles its segment count — a 510-character ask reads as
   * 8 texts, not 4. The ASK register's own words are GSM-7 clean for exactly that reason
   * (see `ask-register.ts`), but the message also carries item, venue and person names from
   * the database, and any one of those can put it back on 70-character segments. When that
   * happens the host is told WHY the number is what it is: a surprising count with no cause
   * reads as a bug, and decision 6's whole point is that the cost be legible.
   *
   * ⚠ `getFirstNudgeMessage` and `getSecondNudgeMessage` in
   * `src/lib/sms/nudge-templates.ts` both ship an em dash and pay the same doubling on every
   * auto-nudge. Out of GTC-187's scope and deliberately not touched here — see the em-dash
   * finding in `docs/tickets/GTC-187.md`.
   */
  narrowSegments: boolean;
}

/**
 * What a composed message costs to send, for showing the host at compose time (decision 6:
 * "Surface the segment count to the host at compose time so the cost is visible"). Never a
 * cap and never a reason to truncate — decision 6 forbids both.
 */
export function composedCost(text: string): ComposedCost {
  const info = getMessageInfo(text);
  return { segments: info.segments, narrowSegments: info.hasUnicode };
}
