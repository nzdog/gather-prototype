/**
 * [[GTC-258]] — THE SENTENCE UNDER A TEXT GUEST'S STRIP WHEN TNZ REPORTED THEIR INVITATION DIDN'T
 * ARRIVE. Founder ruling Q8, 2026-10-02: W1 to W3 as proposed.
 *
 * ⚠ W2 IS NOTE 8's: a failure that is not the guest's fault must not send the host to fix the
 * number (`TnzFailureBucket`'s own note on OUR_FAULT). A sentence, never the number: the board's
 * payload carries no contact detail, and the server decides which sentence.
 */

/** W1 — TNZ said the number cannot receive. */
export const TEXT_NOTE_DEAD_NUMBER =
  "My text didn't arrive. That number doesn't seem to work, so I won't text it again.";

/** W2 — a fault on TNZ's or Gather's side, or a cancel in TNZ's Dashboard. */
export const TEXT_NOTE_OUR_SIDE =
  "My text didn't go through. That was a problem on my side, not with their number.";

/** W3 — "Undelivered" with no reason, or a failure TNZ named in words Gather does not know. */
export const TEXT_NOTE_NO_REASON = "My text didn't arrive, and the phone network didn't say why.";

const TEXT_NOTES: Record<string, string> = {
  TEXT_DEAD_CHANNEL: TEXT_NOTE_DEAD_NUMBER,
  TEXT_OUR_FAULT: TEXT_NOTE_OUR_SIDE,
  TEXT_CANCELLED: TEXT_NOTE_OUR_SIDE,
  TEXT_UNDELIVERED: TEXT_NOTE_NO_REASON,
  TEXT_FAILED_UNRECOGNISED: TEXT_NOTE_NO_REASON,
};

/** The sentence for a TEXT row's outcome, or null when it has none (sent, opted out, an email). */
export function textNoteFor(deliveryState: string | null | undefined): string | null {
  return (deliveryState && TEXT_NOTES[deliveryState]) || null;
}
