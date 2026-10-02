/**
 * [[GTC-350]] — A GUEST'S TEXT REPLY ENDS GATHER'S CHASE OF THEM.
 *
 * Founder ruling Q1 (2026-10-02), verbatim as chosen: *"Stop; they're mine (Recommended)"* —
 * *"Gather stops reminding them. Their card turns red and shows their words and when they came,
 * because only you can read what they said. To let Gather carry on, you hand them back for 1 to 3
 * more reminders, as you can from "gone quiet"."*
 *
 * THE RULE, IN ONE SENTENCE: a reply puts the guest in the host's hands until she hands them back.
 * A reply is IN FORCE when it came after the latest hand-back, or there has been none (note 3: a
 * hand-back starts a new chase, which only a later reply ends). A guest who has answered has no
 * reminder owed, so a reply ends nothing for them and their answered rows read green (Q1).
 *
 * ONE PREDICATE, MANY READERS. The board (`readEventGlance`), the sweep (`findNudgeCandidates`), the
 * drain (`drainChaseRow`), the decide-by finder and its retry, the hand-back and the replay all ask
 * `replyInForce`. Its server half is `./chase-reply-read.ts`, the only place a reply's instant is
 * read — the shape `chase-exhaustion.ts` / `chase-exhaustion-read.ts` already have.
 *
 * Client-safe and pure: no Prisma, no clock of its own. `now` is always handed in, so the same
 * predicate answers for the present board and for the replay's past.
 */

import type { ChaseRoute } from '@/lib/eligibility/channel-chooser';
import type { ChaseSpend } from '@/lib/chase-exhaustion';
import type { PersonReason, PersonState, ReplyFact } from '@/lib/glance/state';
import { firstNameOf } from '@/lib/messages/ask-register';
import { FOLLOW_UP_SPENT_CHASE_NOTE, PACE_OFF_CHASE_NOTE } from '@/lib/glance/chase-fact';

/** The run report's skip for a guest whose reply is in force. Operator-facing, not host words. */
export const REPLIED_SKIP_REASON =
  "Replied by text — the host's until she hands them back (GTC-350)";

/**
 * Is a reply in force for this recipient, as at `now`?
 *
 * "As at" is exact, for the replay: a reply received after `now` did not exist then, and a hand-back
 * made after `now` had not happened then.
 */
export function replyInForce(
  repliedAt: readonly Date[],
  handBack: { at: Date } | null,
  now: Date
): boolean {
  const t = now.getTime();
  const since = handBack && handBack.at.getTime() <= t ? handBack.at.getTime() : -Infinity;
  return repliedAt.some((r) => r.getTime() <= t && r.getTime() > since);
}

/**
 * The board's fact for one membership. GATED ON THE CHOOSER, as `exhaustionFor` is: a route of NONE
 * means Gather is not chasing this person, so a reply ends nothing there — each of those has its own
 * colour. Null only where there is no route: the host. A child's route names its carrier, whose
 * replies and hand-back answer for the child (the reminder carrying the child's ask is the carrier's).
 */
export function replyFactFor(
  route: ChaseRoute | undefined,
  repliedAtByMembership: ReadonlyMap<string, readonly Date[]>,
  spendByRecipient: ReadonlyMap<string, Pick<ChaseSpend, 'handBack'>>,
  now: Date
): ReplyFact | null {
  if (!route) return null;
  if (route.kind === 'NONE') return { ended: false };
  return {
    ended: replyInForce(
      repliedAtByMembership.get(route.recipientId) ?? [],
      spendByRecipient.get(route.recipientId)?.handBack ?? null,
      now
    ),
  };
}

/**
 * [[GTC-335]]'s ordering key for the replay: the latest reply recorded inside the window, or
 * undefined. A number, sorted on server-side and discarded, as every fact's time is.
 */
export function replyMovedSince(repliedAt: readonly Date[], since: Date): number | undefined {
  const inside = repliedAt.map((r) => r.getTime()).filter((t) => t > since.getTime());
  return inside.length > 0 ? Math.max(...inside) : undefined;
}

/**
 * R5, ruled 2026-10-02 — when a reply came, as the host reads it: "Fri 2 Oct, 2:14pm", in NZ time.
 * Written on the server, so no instant reaches the browser (Ruling 1's fence, relaxed by Q2).
 */
export function replyWhen(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-NZ', {
    timeZone: 'Pacific/Auckland',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(at);
  const v = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${v('weekday')} ${v('day')} ${v('month')}, ${v('hour')}:${v('minute')}${v('dayPeriod').toLowerCase()}`;
}

/**
 * WHICH HAND-BACK CHOICES THE RED OFFERS — the door, decided once, read by the panel and the route.
 *
 *  - "gone quiet": 1, 2 or 3, as [[GTC-251]] Q3 ruled.
 *  - a reply, with something still unanswered and reminders on: 1, 2 or 3 (Q1).
 *  - a reply whose only open answer is a maybe: 1 — *"since one follow-up is all they can get"*
 *    (plan ruling Q-D). With reminders off the same holds: *"offer and accept a hand-back only where
 *    it would still send something (a maybe's follow-up still comes), with the "1 more reminder"
 *    choice only"* (plan fix 1).
 *  - otherwise none: a door that would send nothing is the dead door [[GTC-336]] ruled out.
 */
export function handBackChoicesFor(input: {
  state: PersonState | string;
  reasons: readonly (PersonReason | string)[];
  paceOff: boolean;
  /** The recipient (or a child it carries) still owes an answer that the chase reminds about. */
  unanswered: boolean;
  /** The recipient holds a live maybe whose one follow-up has not gone yet. */
  followUpOwed: boolean;
}): number[] {
  if (input.state !== 'RED') return [];
  if (input.reasons.includes('EXHAUSTED_SILENCE')) return [1, 2, 3];
  if (!input.reasons.includes('REPLIED')) return [];
  if (input.unanswered && !input.paceOff) return [1, 2, 3];
  if (input.followUpOwed) return [1];
  return [];
}

/**
 * The room's sentence when a replied red has no door. Founder rulings, 2026-10-02: a spent follow-up
 * says so (*"Say why"*), and *"Where reminders are also off, this sentence is the one shown, because
 * the spent follow-up is why there's no door"*; otherwise, with reminders off, the existing W6 words.
 */
export function replyNoDoorNoteFor(input: {
  state: PersonState | string;
  reasons: readonly (PersonReason | string)[];
  choices: readonly number[];
  paceOff: boolean;
  followUpSpent: boolean;
}): string | null {
  if (input.state !== 'RED' || !input.reasons.includes('REPLIED') || input.choices.length > 0) {
    return null;
  }
  if (input.followUpSpent) return FOLLOW_UP_SPENT_CHASE_NOTE;
  if (input.paceOff) return PACE_OFF_CHASE_NOTE;
  return null;
}

/**
 * R3, ruled 2026-10-02 — a carried child's card, when its carrier's reply ended the chase. The words
 * are on the carrier's card, where the reply is kept (note 8).
 */
export const CARRIED_CHILD_REPLY_WORDS = (carrier: string) =>
  `Their ask is in ${carrier}'s message, and ${carrier} replied. You can read it on ${carrier}'s card.`;

export function carriedChildReplyNoteFor(input: {
  reasons: readonly string[];
  carrierName: string | null;
}): string | null {
  if (!input.reasons.includes('REPLIED') || !input.carrierName) return null;
  return CARRIED_CHILD_REPLY_WORDS(firstNameOf(input.carrierName));
}
