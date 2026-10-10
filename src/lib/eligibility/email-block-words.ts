/**
 * [[GTC-324]] / [[GTC-189]] slice 8a — WHAT THE HOST IS TOLD ABOUT AN ADDRESS GATHER CAN NO
 * LONGER EMAIL. The words, and the one pure function that picks them.
 *
 * ⚠ CLIENT-SAFE, AND IT IMPORTS NOTHING. `PersonSurface` is a client component and reads
 * `emailNoteFor` through the board's payload; the pre-flight's `ADULT_WHY`/`CHILD_WHY` read the
 * same constants. One spelling of each sentence, so the board and the pre-flight cannot say two
 * different things about one guest (`press-words.ts`'s reason for a separate words file).
 *
 * ⚠ RULING 3 IS THE FOUNDER'S OWN THREE SENTENCES, RULED AS TYPED (one typo corrected):
 *
 *   "I can't email this address anymore. Their email reported your invitation as spam. Text
 *    them, or I'll put them on your list."
 *
 * The middle sentence is shown ONLY on the event whose invitation was reported (D4, 2026-09-27:
 * *"'Your invitation' means that invitation."*). Every other host, and the same host on any
 * other event, sees the first and third alone (ruling 2) and never learns of the report.
 *
 * "Their email reported" puts the report on the inbox rather than on the person, so it stays true
 * when a filter, or somebody else in a shared mailbox, pressed the button. Do not "sharpen" it to
 * a name.
 */

/** Ruling 3, first sentence. Shown to every host. */
export const EMAIL_BLOCK_FIRST = "I can't email this address anymore.";

/** Ruling 3, middle sentence. The reported event only (D4). */
export const EMAIL_REPORTED_MIDDLE = 'Their email reported your invitation as spam.';

/**
 * Ruling 3, third sentence. "Text them" is the HOST texting by hand — ruling AD's by-hand nudge,
 * which GTC-324 ruling 1 keeps — because on the reported event the automatic chase is stopped on
 * every channel (GTC-296 ruling 3).
 */
export const EMAIL_BLOCK_TEXT_THEM = "Text them, or I'll put them on your list.";

/** W1, neutral — every host but the reported one; no mobile Gather may text. */
export const EMAIL_BLOCKED_WORDS = `${EMAIL_BLOCK_FIRST} ${EMAIL_BLOCK_TEXT_THEM}`;

/** W1, whole — the event whose invitation was reported. */
export const EMAIL_REPORTED_WORDS = `${EMAIL_BLOCK_FIRST} ${EMAIL_REPORTED_MIDDLE} ${EMAIL_BLOCK_TEXT_THEM}`;

/** W2 — a person Gather can still text. The third sentence would be false: Gather texts them. */
export const EMAIL_BLOCKED_TEXTING_WORDS =
  "I can't email this address anymore, so I'll text them instead.";

/** W3 — blocked, and opted out of texts. "Text them" would invite texting somebody who said stop. */
export const EMAIL_BLOCKED_SMS_OPTED_OUT_WORDS =
  "I can't email this address anymore, and they've opted out of texts.";

/**
 * The reported event, and they have opted out of texts. Ruled 2026-09-27 as proposed.
 *
 * ⚠ AND THERE IS NO "I'll text them instead" VARIANT FOR THE REPORTED EVENT, DELIBERATELY. The
 * founder's first D8 addition proposed one and withdrew it at 8a: a complaint is GTC-296's opt-out
 * for that event, which stops the chase on EVERY channel, and D4 confines the middle sentence to
 * that same event — so wherever it appears Gather never texts them, and the sentence would be false.
 * A reported guest who can be texted reads W1 whole; its "Text them" is the host's by-hand nudge.
 */
export const EMAIL_REPORTED_SMS_OPTED_OUT_WORDS = `${EMAIL_BLOCK_FIRST} ${EMAIL_REPORTED_MIDDLE} They've opted out of texts too, so I'll put them on your list.`;

/** W4 — a child whose household contact's address is blocked. */
export const EMAIL_BLOCKED_CHILD_WORDS = "Their household's contact can't be emailed anymore.";

/**
 * A child whose household contact's address was reported on this event. Ruled 2026-09-27, with
 * ruling 3's "Their email" changed to "That email" so it cannot be read as the CHILD's.
 */
export const EMAIL_REPORTED_CHILD_WORDS = `${EMAIL_BLOCKED_CHILD_WORDS} That email reported your invitation as spam.`;

/**
 * The person view, for the one case the strip reads as "can't email": an invitation queued before
 * the block was learned, withheld by the dispatcher's fence, for a guest Gather can still text.
 * W2 would be false here — nothing will text the invitation unless the host sends it as a text.
 * Ruled 2026-09-27, with "out" added.
 */
export const EMAIL_BLOCKED_ASK_HELD_WORDS =
  "I can't email this address anymore, so their invitation hasn't gone out. You can send it as a text.";

/**
 * [[GTC-340]] plan ruling Q3 (founder, 2026-10-01) — the person view for a blocked, textable guest
 * whose ask went by TEXT and did not arrive (Gather's own setup stopped it, or the provider refused
 * it). W2's "so I'll text them instead" is false of them: Gather tried to, and nothing texts them
 * again unless the host presses. ⚠ ONLY WHEN THE FAILED ASK ROW IS A TEXT ROW — the founder's
 * change: a guest whose EMAIL bounced is blocked by that bounce, was never texted, and keeps W2.
 */
export const EMAIL_BLOCKED_TEXT_FAILED_WORDS =
  "I can't email this address anymore, and my text to them didn't arrive.";

/**
 * The two chase refusals, for `CHASE_NONE_WHY`. Both refuse the ASK first, so neither person is
 * ever on group B; kept so no route renders blank, and worded apart from the host-list sentences
 * above, as ruling AN requires. Ruled 2026-09-27 as proposed; unreachable today.
 */
export const EMAIL_REPORTED_CHASE_WORDS =
  "Their email reported your invitation as spam, so I won't nudge them.";
export const EMAIL_BLOCKED_CHASE_WORDS =
  "I can't email them anymore and have no mobile to nudge them by.";

/**
 * [[GTC-258]] W4 (founder ruling Q8, 2026-10-02) — a blocked address AND a number TNZ reported dead.
 * `EMAIL_BLOCKED_WORDS` would say "Text them, or I'll put them on your list", false of a dead number.
 */
export const EMAIL_BLOCKED_NUMBER_DEAD_WORDS =
  "I can't email this address anymore, and texts to their number don't arrive.";

/**
 * Where a person stands, for the words. Resolved by `emailBlockStateOf` in `email-block.ts`.
 *   NONE      — Gather may email this address.
 *   BLOCKED   — the provider will not deliver to it (ruling 2), for any host.
 *   REPORTED  — BLOCKED, and the complaint was about THIS event's message (D4).
 */
export type EmailBlockState = 'NONE' | 'BLOCKED' | 'REPORTED';

/**
 * The sentence the board shows on a person's surface, or null.
 *
 * ⚠ A SENTENCE, NEVER THE ADDRESS. The board's payload has never carried a guest's contact
 * details (slice 7b, founder answer 6), and this keeps it that way: the server decides which
 * sentence and ships only the sentence.
 *
 * `textable` is the chooser's own answer — a usable mobile the person has not opted out of —
 * never a comparison written here.
 */
export function emailNoteFor(input: {
  state: EmailBlockState;
  textable: boolean;
  smsOptedOut: boolean;
  /** [[GTC-258]] — TNZ reported the number cannot receive. Absent means no. */
  numberDead?: boolean;
}): string | null {
  if (input.state === 'NONE') return null;
  if (input.state === 'REPORTED') {
    return input.smsOptedOut ? EMAIL_REPORTED_SMS_OPTED_OUT_WORDS : EMAIL_REPORTED_WORDS;
  }
  if (input.smsOptedOut) return EMAIL_BLOCKED_SMS_OPTED_OUT_WORDS;
  // [[GTC-258]] W4 — not "Text them": the texts don't arrive either.
  if (input.numberDead) return EMAIL_BLOCKED_NUMBER_DEAD_WORDS;
  return input.textable ? EMAIL_BLOCKED_TEXTING_WORDS : EMAIL_BLOCKED_WORDS;
}
