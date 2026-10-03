import type { PressRefusalCode } from './press';

/**
 * GTC-189 SLICE 5f — WHAT THE HOST READS AT THE PRESS.
 *
 * The words, in one place, away from the screen that shows them — the same split
 * `ask-preview-compose.ts` makes for the pre-flight's own sentences.
 *
 * ⚠ AND IT IS A SEPARATE FILE FROM `press.ts` FOR A REASON THAT IS NOT TIDINESS: the pre-flight is a
 * CLIENT component. Importing a value from `press.ts` would pull the press module — and therefore
 * Prisma — into the browser bundle. `PressRefusalCode` is imported as a TYPE, which TypeScript erases,
 * so this file carries the vocabulary without the machinery. Nothing here may gain a database handle.
 */

/**
 * HINGE §2's TWO-SENTENCE THRESHOLD SCRIPT, VERBATIM.
 *
 * The spec's own words, and the ticket's acceptance list asks for them *"verbatim (or to the same
 * effect) at commitment"*. They are the handover: the first sentence answers *"what have I just given
 * up"* and the second answers *"what happens now"*.
 *
 * ⚠ AND THE SPEC REFUSES A ROADMAP DOOR WITH THEM — no cadences, no escalation ladder, no
 * tone-over-time. *"The compressed two-sentence script carries the feeling without the inventory."*
 * The suite asserts neither sentence names a nudge, a day or an escalation, which is what stops this
 * quietly growing into the options screen the spec turned down.
 */
export const THRESHOLD_SCRIPT = [
  "You can still change anything — I'll just keep the history.",
  "You'll start to see replies coming in. I'll track them and flag anything that needs you.",
] as const;

/**
 * ONE SENTENCE PER REFUSAL, AS A `Record` OVER THE PRESS'S OWN UNION.
 *
 * ⚠ AN EIGHTH REFUSAL CODE DOES NOT COMPILE UNTIL SOMEBODY WRITES THE SENTENCE A HOST READS. The
 * alternative is a default — *"something went wrong"* — for a state the press named precisely, which
 * is the press knowing more than the screen and telling her less.
 *
 * ── WHAT EACH ONE SAYS, AND WHAT IT DELIBERATELY DOES NOT ─────────────────────
 *
 * **No code, no blame, and a next move where one exists.** The route sends the code beside the prose
 * so a screen can branch without parsing a sentence; the host sees only the sentence. And none of
 * these says *"you"* did anything wrong: three of the seven are Gather's own state and one is a race.
 */
export const PRESS_REFUSAL_WORDS: Record<PressRefusalCode, string> = {
  // A 404. The id in the URL is not an event she can see.
  EVENT_NOT_FOUND: 'This event could not be found. Try opening it again from your plans.',

  /*
   * ONE ACT, NO RECALL — so this is the refusal that protects the ruling, and its words say the
   * reassuring half rather than only the closed door: nothing was sent twice.
   */
  ALREADY_SENT: 'This one has already gone out. Nothing was sent again.',

  /*
   * [[GTC-360]] W7, approved 2026-10-03: a Moment-flow plan is held at Moment 3's "Move on →", so the
   * refusal names where to go and what to press.
   */
  NOT_CONFIRMING:
    'This plan isn\'t held yet. Go back to "Who\'s on what?" and press "Move on →" first.',

  /*
   * RULING AC. Her replies would have nowhere to go, so the press refuses rather than sending mail
   * whose reply-to is nobody. "Claim the event" is the actual next move, which is why it is named.
   */
  HOST_HAS_NO_ACCOUNT:
    'Replies to this invitation would have nowhere to go. Claim the event first, then send.',

  /*
   * Ruled 2026-09-19: an event with nobody to message is not an event ready to send, and refusing is
   * the same fail-closed direction as ruling AC.
   */
  NO_RECIPIENTS:
    'There is nobody to send to yet. Add a way to reach at least one guest, then send.',

  // The preview could not be assembled. Gather's own state, said as such.
  RECIPIENTS_UNAVAILABLE:
    'Gather could not put the guest list together, so nothing was sent. Try again in a moment.',

  /*
   * Slice 5b's refusal: the pre-flight promised a link and issuance did not deliver one. ⚠ The words
   * say NOTHING WAS SENT first, because the host's question on reading a refusal at the press is
   * whether it half-happened.
   */
  LINKS_NOT_ISSUED:
    'Some guests could not be given a link, so nothing was sent. Open the check again and it will be put right.',
};
