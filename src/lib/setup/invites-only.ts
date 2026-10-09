/**
 * [[GTC-374]] (item 14) — INVITES ONLY: an event with no plan, where nobody is asked to bring anything
 * and guests are asked only whether they can come.
 *
 * The founder's rulings at scoping (2026-10-09): she chooses it *"At the start of Moment 2"*, with
 * *"a second, quieter choice to skip the plan and go straight to sending the invitations"*; she can
 * change her mind either way *"until the invitations go"*; the strip shows Moments 2 and 3 *"as not
 * needed"*. The plan's rulings (2026-10-09): W1 *"Skip the plan: invites only"*, the others as
 * proposed. Kept in `EventSetup.invitesOnly`, written only by `POST /api/events/[id]/setup`, by the
 * host. A plan already made is [[GTC-375]]'s: until it lands the route refuses the flag on an event
 * with any item (409), and Moment 2's opening does not offer it there.
 *
 * CLIENT-SAFE: no imports. The words are the ruled W-lines, verbatim; change none without a ruling
 * (`tests/walkthrough-batch7-test.tsx` types every one of them again).
 */
export const INVITES_ONLY_WORDS = {
  /** W1 — Moment 2's opening, the quieter choice under "Let’s do this →". */
  CHOOSE: 'Skip the plan: invites only',
  /** W2 — under W1. */
  EXPLAIN:
    'Nobody’s asked to bring anything. Guests are only asked whether they can come. You can still make a plan any time before you send.',
  /** W3 — while the choice is stored and the event held. */
  WORKING: 'Getting the invitations ready…',
  /** W4 — if that fails. */
  FAILED: 'That didn’t work. Try again.',
  /** W5 — a co-host: only the host holds and sends (GTC-360 Q3), so only the host chooses this. */
  NOT_HOST: 'Only the host can choose this, and send the invitations.',
  /** W10 — the pre-flight, under its intro. */
  PREFLIGHT_LINE: 'Invites only: nobody’s asked to bring anything, just whether they can come.',
  /** W11 — the pre-flight's steps 1 and 2, ticked for her (Q8, Q9). */
  STEP_NOT_NEEDED: 'Not needed: this event is invites only.',
  /** W13 — the guest page, in place of "There's nothing for you to bring — just let us know…". */
  GUEST_LINE: 'Just let us know if you’ll be there.',
  /** W14 — the guest page's yes, in place of "Yes, still coming". */
  GUEST_YES: 'Yes, I’ll be there',
  /**
   * [[GTC-375]] W1 — the foot of Moment 2's plan, a quiet link beside "Invites, people and
   * reminders →": the plan is put away, the event held, the pre-flight opened. While it works, if it
   * fails, and for a co-host: W3, W4 and W5 above, unchanged (plan rulings, 2026-10-09).
   */
  PUT_AWAY: 'Put the plan away: invites only',
  /** [[GTC-375]] W2 — Moment 2's opening, under "Let’s do this →", only while a plan is put away. */
  PLAN_WAITING: 'Your plan is put away. “Let’s do this →” brings it back as you left it.',
  /** [[GTC-375]] W3, as ruled — the pre-flight, under W10, only while a plan is put away. */
  PREFLIGHT_WAITING: 'Your plan is put away. Go back to “What’s the plan?” to bring it back.',
  /** [[GTC-375]] W4 — when the plan comes back. */
  BROUGHT_BACK: 'Your plan is back, as you left it.',
} as const;

/**
 * [[GTC-375]] W5 — when something held by someone no longer on the event could not come back with
 * the plan (it comes back with nobody holding it, plan Q9).
 */
export function notBroughtBackLine(n: number): string {
  return n === 1
    ? 'Your plan is back. 1 thing was with someone no longer on this event, so nobody has it now.'
    : `Your plan is back. ${n} things were with people no longer on this event, so nobody has them now.`;
}

/** Where the choice is up to on Moment 2's opening. */
export type InvitesOnlyState = 'idle' | 'working' | 'failed' | 'not-host';
