import type { OutboundWithheldWhy } from '@/lib/press/dispatch';
import type { ResendOutcomeKind } from '@/lib/email-delivery/resend-delivery-contract';
import type { AskRoute } from '@/lib/eligibility/channel-chooser';
import { firstNameOf } from '@/lib/messages/ask-register';
import type { DeliveryFact } from './state';

/**
 * GTC-189 SLICE 7a — TRANSLATING WHAT THE PRESS RECORDED INTO WHAT THE BOARD SHOWS.
 *
 * The fourth and fifth reds need one fact per person: did their ask fail, and in which of the two
 * ways. This is where the press's vocabulary becomes the glance's, and it is a separate file because
 * it is the only place the two meet — `state.ts` must not learn what a bounce is, and `dispatch.ts`
 * must not learn what red means.
 *
 * ── ⚠ THE FACT IS READ BACK, NOT RE-DERIVED. THAT IS THE WHOLE DESIGN ─────────
 *
 * Founder ruling, 2026-09-19, superseding ruling M's aside that `read.ts` would consume slice 1's
 * chooser: **the press already recorded both facts, per person, on the row it wrote** — a delivery
 * state for the message that failed, a withheld code for the person who could never be sent to. So
 * the board reads them, and *"the board and the press cannot disagree by construction."*
 *
 * ⚠ THE COST, ACCEPTED AT THE RULING: before the press there are no rows, so neither red shows. The
 * pre-flight is where an unmessageable person is seen beforehand — slice 5b built exactly that — and
 * the two surfaces divide cleanly.
 */

/**
 * WHAT EACH WITHHELD CODE MEANS ON THE BOARD.
 *
 * ⚠ THE NAME IS OLDER THAN ITS SECOND VALUE. Built when a withholding could say only UNREACHABLE or
 * nothing; [[GTC-340]] gave one code NOT_DELIVERED and kept the name its readers import.
 *
 * ⚠ A `Record` OVER THE PRESS'S OWN UNION, so a fifteenth code does not compile until somebody
 * decides whether it makes a person unreachable. The alternative — an array of the ones that do —
 * silently answers "no" for anything added later, and answering no here means a person whose ask
 * went nowhere reads AMBER, which is the exact falsehood ruling J called wrong.
 *
 * THE TEST APPLIED TO EACH: **is this a fact about the PERSON, or about GATHER?** It decides
 * UNREACHABLE. Ruling M's red says *"Gather is out of moves and this is yours"* — it hands the host a
 * job. A code that describes our own broken configuration hands her a job she cannot do and tells her
 * something false about her guest. [[GTC-340]]: when that configuration stopped a message before it
 * left, the red is NOT_DELIVERED, which is true of the guest — see `SMS_DISABLED`.
 */
export const WITHHELD_MEANS_UNREACHABLE: Record<OutboundWithheldWhy, DeliveryFact['failure']> = {
  /*
   * ⚠ [[GTC-296]] — null, AND THE null IS A FOUNDER RULING (correction R6, 2026-09-20) RATHER
   * THAN A DEFAULT. It is the one entry in this map that is neither *about the person's
   * channels* nor *about Gather*, so this module's own test — *is this a fact about the PERSON,
   * or about GATHER?* — does not reach it. The property that test is reaching for is **has
   * Gather a next move**, and here the answer is: it has one and has been told not to take it.
   *
   * Both alternatives were offered at the ruling and both were refused:
   *
   *   'UNREACHABLE' renders *"nowhere to send"*, which is FALSE of somebody holding a live
   *   address they have just used. Same false-sentence family as `SMS_DISABLED`'s, and this
   *   ledger has refused it repeatedly.
   *
   *   A sixth red FAMILY would be true, and it would hand slice 7b's door to this row — the
   *   door whose actions include *"send it again"* and *"send to the phone instead"*, offered
   *   about the person who just unsubscribed. *"That is exactly wrong."*
   *
   * ✅ WHAT null USED TO COST IS CLOSED BY [[GTC-305]], WHICH ABSORBED [[GTC-327]] — AND NOT
   * HERE. The strip read AMBER with nothing saying why. The red now comes from the chase chooser
   * (`CHASE_REFUSAL_MEANS` in `chase-fact.ts`), which also reaches the guest who opted out after
   * her invitation was delivered, whose row carries no withholding at all. This entry stays null,
   * which is R6 still standing.
   */
  EMAIL_OPTED_OUT: null,
  /*
   * [[GTC-189]] slice 8a. REPORTED is null on R6's ground exactly: the guest's own no, and a red would
   * hand this row the door whose actions include "send it again". BLOCKED is UNREACHABLE (W9, ruled
   * 2026-09-27): there is no address Gather may email and no mobile to fall to, which is ruling M's
   * red — and the door it opens offers "Add a way to reach them" and, where it may, a text.
   */
  EMAIL_REPORTED: null,
  EMAIL_REPORTED_SMS_OPTED_OUT: null,
  EMAIL_BLOCKED: 'UNREACHABLE',
  EMAIL_BLOCKED_SMS_OPTED_OUT: 'UNREACHABLE',
  /*
   * [[GTC-189]] slice 8b — the chase's own refusals. They are only ever written on a CHASE row, and
   * the board reads ASK rows only (F2), so none can colour a strip; null all the same, because each
   * is a decision — the host's, or the guest's answer — and none is a person Gather cannot reach.
   */
  MARKED_DONT_CHASE: null,
  // [[GTC-251]] slice 251c — the host turned reminders off: her decision, a CHASE row only.
  PACE_OFF: null,
  HOST_AS_CARRIER: null,
  HANDED_TO_HOST: null,
  ANSWERED: null,

  // ── About the person: the chooser found no way to reach them.
  NO_CHANNEL: 'UNREACHABLE',
  // No email and a phone they have opted out of. Zone 7 keeps the phone unused, so for the ask there
  // is no channel at all — the chooser's own words.
  SMS_OPTED_OUT: 'UNREACHABLE',
  OPTED_OUT: 'UNREACHABLE',
  // No email and a number nothing can send to.
  PHONE_UNUSABLE: 'UNREACHABLE',
  INVALID_NUMBER: 'UNREACHABLE',

  /*
   * ── About GATHER, not about the person. None of these is ruling M's red.
   *
   * ⚠ `SMS_DISABLED` IS RED, "never got it". Founder ruling [[GTC-340]], 2026-10-01: *"Texts join
   * emails: red 'never got it', with 'Send it again'. It's true, the host can see who missed out,
   * and once the setup is fixed she can resend, or send to an email address instead."* Gather's own
   * setup stopped the text before it left: no provider for the number, or [[GTC-274]]'s live switch
   * off. An email stopped the same way is a rejection with no provider code, which `deliveryFactFrom`
   * already reads NOT_DELIVERED; this is its twin.
   *
   * ⚠ NEVER UNREACHABLE: "nowhere to send" is false of a guest holding a live number. Amber was false
   * too: amber means Gather is chasing ([[GTC-305]]), and a text that never left is never chased —
   * the drain stamps `PersonEvent.sentAt` only on acceptance. The dispatcher still records a
   * withholding (rule 1 in `dispatch.ts`); the red is this reading's.
   */
  SMS_DISABLED: 'NOT_DELIVERED',
  // The host's account went away in the window; the person is reachable and Gather lost its sender.
  NO_REPLY_TO: null,
  // Issuance did not produce a link. Reachable, and nothing to send them. ⚠ Arguably its own red and
  // it is NOT ruled as one — the pre-flight has words for it (slice 5b) and ruling M does not reach
  // it. Left alone deliberately rather than folded in.
  NO_LINK: null,
  // The route changed between the press and the drain: somebody else was messaged instead.
  NOT_THIS_RECIPIENT: null,
  // She never receives her own ask (GTC-256 ruling 5), and `isHost` already keeps her green.
  HOST_OWN_ASK: null,

  /*
   * ── The child routing codes, which cannot appear on a row at all.
   *
   * A child is never a recipient — `pressWillMessage` excludes them — so these whys live on the
   * PREVIEW's host list and never on an `OutboundMessage`. Entered as null because a null here is
   * "this is not a claim that the person is unreachable", which is true of all four; if a child ever
   * does get a row, ruling M's red for a child with no carrier is unruled and is named in the
   * slice's evidence rather than guessed at.
   */
  NO_CARRIER: null,
  HOUSEHOLD_MUTED: null,
  HOST_HOUSEHOLD_CHILD: null,
  CHILD_WITHOUT_ITEM: null,

  /*
   * ⚠ [[GTC-322]]'s BACKFILL — `null`, AND THE CHOICE IS A RULING THE FOUNDER HAS NOT MADE YET.
   * Entered as null because null is the only value that asserts nothing while it is open.
   *
   * THE TEST THIS MODULE APPLIES — *is this a fact about the PERSON, or about GATHER?* — answers
   * GATHER, and since [[GTC-340]] that settles nothing: `SMS_DISABLED` is about Gather and reads
   * NOT_DELIVERED, while the other Gather codes read null. ⚠ AND THIS IS THE CODE THAT SHOWS THE
   * TEST IS A PROXY. `SMS_DISABLED` is about Gather AND TEMPORARY: once the setup is fixed the host
   * can send it again. `PREDATES_SENDER` is about Gather and
   * PERMANENT — nothing will ever create an ask row for these people, which is the whole of
   * GTC-322 shape 3 — so ruling M's red is true of them in its own words: *Gather is out of moves
   * and this is yours.* The property the test is reaching for is **has Gather a next move**, and
   * whose fault it is happens to answer that correctly everywhere else.
   *
   * ⚠ THE COLOUR IS STILL A RULING, THOUGH ITS MECHANISM NOW EXISTS. Until [[GTC-340]] this
   * `Record`'s value type was `'UNREACHABLE' | null`; GTC-340 widened it to admit NOT_DELIVERED for
   * `SMS_DISABLED`, so (c) is now one value here. The options, as they were put, none free:
   *
   *   (a) null, as built — the record is repaired and no strip moves.
   *   (b) 'UNREACHABLE' — red, with the why-line *"nowhere to send"*, which is FALSE of people
   *       who hold live addresses. That is the false-sentence family this ledger has caught
   *       repeatedly, and it is refused rather than deferred.
   *   (c) widen this `Record` so a withholding may also mean `NOT_DELIVERED` — red, with
   *       *"never got it"*, which is TRUE of them: 7a named that reason for three mechanisms
   *       because they are *"one fact to the host: it did not arrive"*, and never-sent is a
   *       fourth of the same kind. It changed the shape of this mapping, which [[GTC-325]]'s
   *       scope reserved to a ruling; [[GTC-340]]'s ruling made that change, for `SMS_DISABLED`
   *       only.
   *
   * ⚠ AND (c) HAS A CONSEQUENCE NOBODY HAS SEEN: a `NOT_DELIVERED` strip is a DOOR (slice 7b), so
   * red here puts a one-press "send it again" on 86 people across eight legacy boards — three of
   * them security-test events and two seeded demo boards (72 rows on five boards in `gather_dev`
   * on 2026-10-01). That may be exactly the affordance the
   * host wants; it is not a side effect a record repair should acquire unruled.
   */
  PREDATES_SENDER: null,
};

/**
 * WHICH DELIVERY STATES MEAN THE MESSAGE DID NOT ARRIVE.
 *
 * ⚠ A `Record` over [[GTC-289]]'s kinds, for the same reason: a thirteenth `last_event` becomes a
 * tenth kind, and a new kind must not default to "arrived".
 *
 * ⚠ `COMPLAINED` IS NOT A DELIVERY FAILURE, and GTC-289 phase 1 ruled why: a complaint is a LIVE
 * address whose owner does not want mail, which is the opposite problem from a dead channel. What it
 * should do instead is [[GTC-324]]'s, High and unruled.
 *
 * ⚠ AND `UNRECOGNISED` IS NOT ONE EITHER. A value the installed SDK does not declare means the SDK
 * and the live API have diverged; it is a fact to read, not a fact about the message.
 */
export const DELIVERY_STATE_MEANS: Record<ResendOutcomeKind, 'NOT_DELIVERED' | null> = {
  BOUNCED: 'NOT_DELIVERED',
  PROVIDER_FAILED: 'NOT_DELIVERED',
  SUPPRESSED: 'NOT_DELIVERED',
  CANCELLED: 'NOT_DELIVERED',
  COMPLAINED: null,
  IN_FLIGHT: null,
  PROVIDER_REPORTS_DELIVERED: null,
  ENGAGEMENT_REPORTED: null,
  UNRECOGNISED: null,
};

/** One outbound row, as this translation needs it. Structural, so a narrow `select` works. */
export interface DeliveryRowInput {
  personEventId: string;
  createdAt: Date;
  rejectedAt: Date | null;
  withheldAt: Date | null;
  withheldWhy: string | null;
  deliveryState: string | null;
}

/**
 * What one row says about its recipient.
 *
 * ⚠ A REJECTION AT SUBMISSION IS THE SAME RED AS A BOUNCE. [[GTC-189]]'s own note: *"a rejection at
 * submission is the fourth red at once."* The provider refused to take it; it did not arrive. That is
 * the third of the three mechanisms `NOT_DELIVERED` is named for rather than `BOUNCED`.
 *
 * ⚠ AND A STOP BY GATHER'S OWN SETUP IS THE SAME RED ([[GTC-340]]): an email as a rejection with no
 * provider code, a text as the withholding `SMS_DISABLED`.
 */
export function deliveryFactFrom(row: DeliveryRowInput | null | undefined): DeliveryFact {
  if (!row) return { failure: null };
  if (row.rejectedAt) return { failure: 'NOT_DELIVERED' };
  if (row.withheldAt && row.withheldWhy) {
    const withheld = (
      WITHHELD_MEANS_UNREACHABLE as Record<string, DeliveryFact['failure'] | undefined>
    )[row.withheldWhy];
    return { failure: withheld ?? null };
  }
  if (row.deliveryState) {
    const state = (DELIVERY_STATE_MEANS as Record<string, 'NOT_DELIVERED' | null | undefined>)[
      row.deliveryState
    ];
    return { failure: state ?? null };
  }
  return { failure: null };
}

/** One outbound row with the time the poll last read it — what the rewind needs beside the rest. */
export interface TimedDeliveryRowInput extends DeliveryRowInput {
  id: string;
  deliveryCheckedAt: Date | null;
}

/**
 * [[GTC-335]] — ONE ROW AS IT STOOD AT `since`, BY THE TIMES GATHER RECORDED.
 *
 * Founder ruling, SCOPED 2026-10-01: *"The first time you open the board after it happened, it plays
 * as a step, using the time Gather recorded it. After that it's just part of the board."* So each of
 * the three doors is dropped when it was recorded after `since`, and the row itself when it was made
 * after `since`. `deliveryFactFrom` then reads the past row exactly as it reads today's.
 *
 * ⚠ `deliveryCheckedAt` IS WHEN THE FAILURE WAS READ, AND THAT RESTS ON THE POLL. The poll writes it
 * on every read, but every state `DELIVERY_STATE_MEANS` calls NOT_DELIVERED is in
 * `TERMINAL_FOR_POLLING` (`src/lib/email-delivery/delivery-poll.ts`), so the read that found the
 * failure is the row's last. A failure-mapped state added outside that set would break this.
 *
 * ⚠ A STATE WITH NO TIME IS HELD (ruling point 3). Nothing in the poll writes one, but a row that has
 * one carries no evidence of when it changed, so it stands at `since` as it stands now — the replay's
 * fail-safe silence.
 */
export function deliveryRowAsAt<T extends TimedDeliveryRowInput>(row: T, since: Date): T | null {
  const t = since.getTime();
  const after = (at: Date | null) => at !== null && at.getTime() > t;
  if (row.createdAt.getTime() > t) return null;
  return {
    ...row,
    rejectedAt: after(row.rejectedAt) ? null : row.rejectedAt,
    withheldAt: after(row.withheldAt) ? null : row.withheldAt,
    withheldWhy: after(row.withheldAt) ? null : row.withheldWhy,
    deliveryState: after(row.deliveryCheckedAt) ? null : row.deliveryState,
  };
}

/**
 * [[GTC-335]] point 5 — WHEN THIS ROW'S FAILURE WAS RECORDED, so its step keeps the order things
 * happened in. Null when the row says nothing failed. The doors are asked in `deliveryFactFrom`'s own
 * order, so the time is the one belonging to the fact the board shows.
 */
export function deliveryFailureRecordedAt(row: TimedDeliveryRowInput): Date | null {
  if (!deliveryFactFrom(row).failure) return null;
  if (row.rejectedAt) return row.rejectedAt;
  if (row.withheldAt && row.withheldWhy) return row.withheldAt;
  return row.deliveryCheckedAt;
}

/**
 * THE LATEST ROW PER MEMBERSHIP, AND THIS IS NOT TIDINESS.
 *
 * ⚠ READING "ANY ROW EVER FAILED" WOULD MAKE SLICE 7b's DOOR UNABLE TO CLEAR THE RED IT OPENS. Ruling
 * U's three actions each write a NEW row for the same membership — the schema allows it on purpose,
 * and its own note says a `@@unique([personEventId, kind])` *"would have broken ruling U's resend"*.
 * So the host resends, it works, and a board reading the older row goes on saying the message never
 * arrived. **The fact is about the most recent attempt, or the door is a button that changes nothing.**
 *
 * Ties break on `id` so the answer is stable rather than whichever row the planner returned first —
 * the unordered-`findFirst` trap [[GTC-192]]'s standing warning names, avoided in advance.
 */
export function latestRowByMembership<T extends DeliveryRowInput & { id: string }>(
  rows: readonly T[]
): Map<string, T> {
  const latest = new Map<string, T>();
  for (const row of rows) {
    const held = latest.get(row.personEventId);
    if (
      !held ||
      row.createdAt.getTime() > held.createdAt.getTime() ||
      (row.createdAt.getTime() === held.createdAt.getTime() && row.id > held.id)
    ) {
      latest.set(row.personEventId, row);
    }
  }
  return latest;
}

/**
 * RULING S — WHOSE FAILURE REACHES A CHILD'S ROWS, AS [[GTC-336]] Q2 RULED IT.
 *
 * *"Ollie's strip goes red when the message carrying his ask bounced."* A child is never a recipient,
 * so the only delivery fact they can have belongs to whoever carried the ask. Founder ruling Q2,
 * 2026-09-30: *"A child goes red only if their ask actually went in the message that bounced, worked
 * out the same way Gather chose who to send it to."* So the carrier is the one `chooseAskRoute` names.
 *
 * ⚠ BOTH ROUTES THAT NAME ONE, AND THE SECOND IS NOT A NICETY. `CARRIED` names its recipient. But
 * after a bounce the delivery poll blocks the address (Zone 9), and from then on the chooser answers
 * `HOST_LIST` with `carrierId` for a carrier who holds no usable mobile — the same person, whose
 * message it was. Reading `CARRIED` alone would drop ruling S's red in its commonest case.
 *
 * ⚠ AND NO OTHER ROUTE NAMES A CARRIER, WHICH IS THE RULING. A child of the host's own household, a
 * child holding nothing, a child of a switched-off household or of one with no adult: no message
 * carried their ask, so no message's failure is theirs. The household-contact lookup this replaces
 * (`carrierMembershipFor`, GTC-189 slice 7a) reached all four.
 *
 * ⚠ IT STILL DOES NOT CALL `resolveCarriedSubjects`, whose wrapper runs five queries per carrier. The
 * route comes from `readAskPreview`'s `askRoutes` — the walk the board already runs for the chase
 * answers (GTC-305), recorded rather than recomputed, so the board pays no query for it.
 */
export function carrierOfAsk(route: AskRoute | undefined): string | null {
  if (!route) return null;
  if (route.kind === 'CARRIED') return route.recipientId;
  if (route.kind === 'HOST_LIST') return route.carrierId ?? null;
  return null;
}

/**
 * [[GTC-336]] Q4 — WHAT A CARRIED CHILD'S CARD SAYS, ruled by the founder 2026-09-30, verbatim.
 *
 * Q1: *"The child's card stays red but offers no door. It says whose message carried their ask, and
 * you fix it from that person's card, where the door already works."* So each sentence names the
 * carrier and points at the carrier's card — except the host's, whose own card is always green and
 * has no door (plan question 2): that one names no card. Keyed on the red the child reads, and for
 * `UNREACHABLE` on whether the carrier is textable, which is what the strip's why-line reads too.
 *
 * ⚠ W3 SAYS "is in", NOT "went in". The founder's change at the ruling: *"Kay's message never went
 * out in this case, so 'went in' isn't true."* ⚠ AND SINCE [[GTC-340]] Q4 SO DO W1 AND W4: a message
 * Gather's own setup stopped (an email rejected with no code, a text withheld `SMS_DISABLED`) never
 * went out either, and "is in" is true of a bounced, refused or stopped message alike.
 */
export const CARRIED_CHILD_WORDS = {
  NOT_DELIVERED: (carrier: string) =>
    `Their ask is in ${carrier}'s message, and it didn't arrive. You can send it again from ${carrier}'s card.`,
  UNREACHABLE: (carrier: string) =>
    `${carrier} would pass it on, but I can't reach ${carrier}. You can add a way to reach ${carrier} from ${carrier}'s card.`,
  UNREACHABLE_TEXTABLE: (carrier: string) =>
    `Their ask is in ${carrier}'s message, but I can't email ${carrier}. You can send it another way from ${carrier}'s card.`,
  HOST: "Their ask is in your message, and it didn't arrive.",
} as const;

/**
 * The sentence for one child's card, or null. Set only when the child reads one of the door's two
 * reds and a carrier is named; `reasons` is the derivation's, so an answered row or a grey is never
 * annotated.
 */
export function carriedChildNoteFor(input: {
  reasons: readonly string[];
  /** The carrier's full name, as stored. Addressed by first name. */
  carrierName: string | null;
  carrierIsHost: boolean;
  /** The carrier's `textable`, as the strip's why-line reads it. */
  textable: boolean;
}): string | null {
  const failure = input.reasons.includes('NOT_DELIVERED')
    ? 'NOT_DELIVERED'
    : input.reasons.includes('UNREACHABLE')
      ? 'UNREACHABLE'
      : null;
  if (!failure || !input.carrierName) return null;
  if (input.carrierIsHost) return CARRIED_CHILD_WORDS.HOST;
  const carrier = firstNameOf(input.carrierName);
  if (failure === 'NOT_DELIVERED') return CARRIED_CHILD_WORDS.NOT_DELIVERED(carrier);
  return input.textable
    ? CARRIED_CHILD_WORDS.UNREACHABLE_TEXTABLE(carrier)
    : CARRIED_CHILD_WORDS.UNREACHABLE(carrier);
}
