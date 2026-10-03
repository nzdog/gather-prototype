/**
 * [[GTC-329]] — the words of the way back after the press. ALL RULED 2026-09-29.
 *
 * After the press the pre-flight, and the three decisions the chase reads when it runs (the
 * don't-chase mark, the per-person exception, the event switch), were reachable only by typing
 * the address. These are the words of the path back, and of the surface it leads to.
 *
 * Gather's first person, the voice [[GTC-311]]'s ruled chase words use.
 *
 * Imports nothing, so `nudge-mark.ts` can name the heading without taking on a dependency.
 */

/** WA — the link, on the host-token page, `InviteStatusSection` and the board, after the press only. */
export const CHASE_DOOR_LINK = 'Change who I chase';

/**
 * [[GTC-357]] — right after the press, under the threshold lines. Founder, PLAN RULINGS 2026-10-03,
 * Q2: *"Lines, link, then board (Recommended)"* — *"The lines show with "See the board →" under
 * them. After about 8 seconds, roughly the time it takes to read them, the page moves to the board
 * by itself; the link lets you go sooner."* Q3 approved the words.
 */
export const SEE_THE_BOARD_LINK = 'See the board →';
/** Q2: 8 seconds, not the plan's 6. */
export const BOARD_MOVE_AFTER_MS = 8000;

/**
 * WB — under the link on the host-token page. That page is the host MAGIC-LINK view and its reader
 * may hold no session, while the pre-flight is session-gated: the second sentence is the caveat
 * "Review and send" already carries there, for the same reason.
 */
export const CHASE_DOOR_HOST_VIEW_NOTE =
  'Opens the page where you can change who I chase. You will need to be signed in.';

/**
 * WC — the post-press surface's heading. `DONT_CHASE_NOT_ADDRESSABLE_MESSAGE` names it, so the
 * refusal sends the host to a place she will see called by that name.
 */
export const AFTER_PRESS_HEADING = 'Who I chase';

/**
 * WD — the post-press lead. Its second sentence is Unknown 1's answer, ruled: a change here reaches
 * the reminders not yet sent, because the chase reads the stored values when it runs, and it cannot
 * recall one already sent.
 */
export function afterPressLead(sentAt: Date): string {
  const date = sentAt.toLocaleDateString('en-NZ', { day: 'numeric', month: 'long' });
  return `The invitations went out on ${date}. Changes here apply to reminders I haven't sent yet.`;
}

/**
 * Where the link goes: the pre-flight's own address, which after the press shows the smaller
 * surface. GTC-192 Ruling 17: *"The don't-chase mark is revisited where it is set (the
 * pre-flight)"* — so the address stays the one the ruling names.
 */
export function chaseDoorHref(eventId: string): string {
  return `/plan/${eventId}/pre-flight`;
}
