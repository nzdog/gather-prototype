/**
 * [[GTC-258]] — THE WORDS FOR A TEXT THAT DIDN'T ARRIVE, off the board. Founder ruling Q8,
 * 2026-10-02: W5 to W9 as proposed. The board's own sentences (W1 to W3) are in
 * `src/lib/glance/text-note.ts`; W4 is in `src/lib/eligibility/email-block-words.ts`.
 */

/** W5 — the person modal's reminder lines, when TNZ reported the reminder's text failed. */
export const FIRST_REMINDER_DID_NOT_ARRIVE = "First auto-reminder didn't arrive";
export const SECOND_REMINDER_DID_NOT_ARRIVE = "Second auto-reminder didn't arrive";

/** W6 — the person modal's line for the host's own nudge, when its text failed. */
export const NUDGE_DID_NOT_ARRIVE = "Nudged, but the text didn't arrive";

/** W7 — the thank-you panel, for a thank-you re-sent by email after its text failed. */
export const THANK_YOU_SENT_BY_EMAIL = 'Sent by email';

/** W8 — the thank-you's `failReason` when its text failed and no email retry could go. */
export const TEXT_DID_NOT_ARRIVE = "The text didn't arrive";

/** W9 — the host's nudge refused: the number is dead and there is no email. */
export const NUDGE_NUMBER_DEAD_NO_EMAIL =
  "Texts to their number don't arrive, and they have no email.";
