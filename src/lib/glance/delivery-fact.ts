import type { OutboundWithheldWhy } from '@/lib/press/dispatch';
import type { ResendOutcomeKind } from '@/lib/email-delivery/resend-delivery-contract';
import { resolveHouseholdChannel } from '@/lib/households/channel';
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
 * WHICH WITHHELD CODES MEAN NOBODY CAN REACH THIS PERSON.
 *
 * ⚠ A `Record` OVER THE PRESS'S OWN UNION, so a fifteenth code does not compile until somebody
 * decides whether it makes a person unreachable. The alternative — an array of the ones that do —
 * silently answers "no" for anything added later, and answering no here means a person whose ask
 * went nowhere reads AMBER, which is the exact falsehood ruling J called wrong.
 *
 * THE TEST APPLIED TO EACH: **is this a fact about the PERSON, or about GATHER?** Ruling M's red says
 * *"Gather is out of moves and this is yours"* — it hands the host a job. A code that describes our
 * own broken configuration hands her a job she cannot do and tells her something false about her
 * guest.
 */
export const WITHHELD_MEANS_UNREACHABLE: Record<OutboundWithheldWhy, 'UNREACHABLE' | null> = {
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
   * ⚠ `SMS_DISABLED` IS THE ONE THAT MATTERS TODAY AND IT IS THE DIFFERENTIAL THE SUITE ASSERTS.
   * `TNZ_AUTH_TOKEN` is absent from this environment ([[GTC-247]]), so every text recipient is
   * withheld for it. Reading that as UNREACHABLE would paint them "nowhere to send" — a sentence
   * about the guest that is false, caused by an operator failure. The person is perfectly reachable
   * the moment somebody sets a token.
   */
  SMS_DISABLED: null,
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
   * GATHER, which is `SMS_DISABLED`'s answer and would settle it. ⚠ BUT THIS IS THE CODE THAT
   * SHOWS THE TEST IS A PROXY. `SMS_DISABLED` is about Gather AND TEMPORARY: *"the person is
   * perfectly reachable the moment somebody sets a token."* `PREDATES_SENDER` is about Gather and
   * PERMANENT — nothing will ever create an ask row for these people, which is the whole of
   * GTC-322 shape 3 — so ruling M's red is true of them in its own words: *Gather is out of moves
   * and this is yours.* The property the test is reaching for is **has Gather a next move**, and
   * whose fault it is happens to answer that correctly everywhere else.
   *
   * ⚠ AND THE COLOUR CANNOT BE CHOSEN WITHOUT CHOOSING A MECHANISM, WHICH IS WHY IT IS RULED
   * RATHER THAN DECIDED HERE. This `Record`'s value type is `'UNREACHABLE' | null`: a withholding
   * can say *nowhere to send* or say nothing. Three options, and none is free:
   *
   *   (a) null, as built — the record is repaired and no strip moves.
   *   (b) 'UNREACHABLE' — red, with the why-line *"nowhere to send"*, which is FALSE of people
   *       who hold live addresses. That is the false-sentence family this ledger has caught
   *       repeatedly, and it is refused rather than deferred.
   *   (c) widen this `Record` so a withholding may also mean `NOT_DELIVERED` — red, with
   *       *"never got it"*, which is TRUE of them: 7a named that reason for three mechanisms
   *       because they are *"one fact to the host: it did not arrive"*, and never-sent is a
   *       fourth of the same kind. It changes the shape of this mapping, which [[GTC-325]]'s
   *       scope reserves to a ruling.
   *
   * ⚠ AND (c) HAS A CONSEQUENCE NOBODY HAS SEEN: a `NOT_DELIVERED` strip is a DOOR (slice 7b), so
   * red here puts a one-press "send it again" on 86 people across eight legacy boards — three of
   * them security-test events and two seeded demo boards. That may be exactly the affordance the
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
 */
export function deliveryFactFrom(row: DeliveryRowInput | null | undefined): DeliveryFact {
  if (!row) return { failure: null };
  if (row.rejectedAt) return { failure: 'NOT_DELIVERED' };
  if (row.withheldAt && row.withheldWhy) {
    const withheld = (
      WITHHELD_MEANS_UNREACHABLE as Record<string, 'UNREACHABLE' | null | undefined>
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
 * RULING S — WHOSE FAILURE REACHES A CHILD'S ROWS.
 *
 * *"Ollie's strip goes red when the message carrying his ask bounced."* A child is never a recipient,
 * so the only delivery fact they can have belongs to whoever carried the ask.
 *
 * ⚠ IT ASKS THE SHARED RULE RATHER THAN A SECOND COPY OF IT. `resolveHouseholdChannel` is the
 * function the capture surface, the household routes and the chooser all use to decide who a
 * household's messages go to, and it is PURE — `{ contactPersonEventId, members }`, both of which the
 * board already holds.
 *
 * ⚠ AND IT DELIBERATELY DOES NOT CALL `resolveCarriedSubjects`, WHICH IS THE OBVIOUS FUNCTION.
 * MEASURED: that wrapper runs FIVE queries per carrier — the event, every membership, every
 * household, every assignment and the opt-out list — so using it would have added five queries times
 * the number of household contacts to a read that runs six in total. The rule it wraps costs nothing.
 *
 * ⚠ ITS LIMIT, NAMED: this resolves who the household's messages GO to, not the chooser's full ladder.
 * A child whose household has no messageable contact at all gets no carrier and therefore no fact —
 * see the slice's evidence, where that gap is recorded rather than guessed at.
 */
export function carrierMembershipFor(
  child: { householdId: string | null },
  households: readonly { id: string; contactPersonEventId: string | null }[],
  memberships: readonly { id: string; householdId: string | null; householdRole: string | null }[]
): string | null {
  if (!child.householdId) return null;
  const household = households.find((h) => h.id === child.householdId);
  if (!household) return null;
  return resolveHouseholdChannel({
    contactPersonEventId: household.contactPersonEventId,
    members: memberships.filter((m) => m.householdId === household.id),
  });
}
