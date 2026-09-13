/**
 * GTC-189 slice 1 — the channel chooser: per person, how the ask reaches them and how the
 * chase does.
 *
 * WHY IT EXISTS. `PersonEvent.contactMethod` is a stored snapshot of what a person can be
 * reached on, and in gather_dev 184 of 269 adult non-host memberships carry a value their own
 * `Person` fields contradict (GTC-189 ruling C, measured 2026-09-13). It went unnoticed because
 * one path reads it. These two functions decide at the moment of sending from what the person
 * actually has, so there is nothing stored to drift. The preview (slice 3) and the senders
 * (slices 5 and 8) are to call the same two functions, which is what stops the host being shown
 * a route the send does not take.
 *
 * ⚠ DARK UNTIL GTC-189 SLICE 3. Nothing imports this module, and `tests/channel-chooser-test.ts`
 * asserts that; slice 3, the first caller, removes that assertion. `contactMethod` is not
 * touched here — its removal is [[GTC-295]]'s, after slice 8.
 *
 * TWO FUNCTIONS, NOT ONE WITH A MODE, because the ask and the chase invert (THE ASK and THE
 * CHASE, 2026-09-13): the ask prefers email, the chase prefers text. A shared preference order
 * with a flag is the shape in which one of them gets the other's order.
 *
 * THE GATES ARE CALLED FROM THEIR MODULES, NEVER RESTATED (build shape, slice 1): the child
 * rule, the host exclusion, the household contact and switch, the don't-chase mark, and what a
 * usable phone is. A second spelling of any of them is how one path lets a child through while
 * the other looks correct.
 *
 * ⚠ DECISION 15 IS OPEN, AND NOTHING HERE ANSWERS IT:
 *  - (a) how far ruling P reaches. The NARROW reading is built. Its one point of difference from
 *    the wide reading carries an ANCHOR, and deleting that line is the wide reading.
 *  - (b) and (c), when a chase hand-over reaches the host's list and how it reads on the board.
 *    The chase returns why it sends nothing and nothing about when or what colour.
 *
 * RULED ON THE READINGS THIS SLICE REPORTED (GTC-189, *Founder answers — the slice 1 flags*):
 * the host as carrier is not chased (answer 1); an unusable phone with no email is a line on the
 * host's list (answer 2); an adult with no items is asked like any adult (answer 4); a child of
 * a switched-off household comes to her list (answer 5).
 *
 * DEFECTS MET HERE AND NOT FIXED: [[GTC-300]], `isValidNZNumber` rejecting the +61 numbers
 * `sendSms` routes to TNZ; [[GTC-301]], two opt-out facts, one global and one per host.
 */

import { isMessageableRole } from '@/lib/eligibility/child-exclusion';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';
import { isChaseable } from '@/lib/eligibility/nudge-mark';
import { resolveHouseholdChannel, resolveHouseholdMuted } from '@/lib/households/channel';
import { isValidNZNumber } from '@/lib/phone';

/** The two carriers. Named for what the guest receives, not for the provider. */
export type Channel = 'EMAIL' | 'TEXT';

/** What the person has, read off `Person` at send time. */
export interface ChooserPerson {
  email: string | null;
  /** `Person.phoneNumber`, which every sender reads — never the legacy `Person.phone`. */
  phoneNumber: string | null;
  /**
   * Do-Not-Touch Zone 7. REQUIRED, not optional: a narrow select that left it out would read as
   * "not opted out", silently. The caller decides which opt-out fact this is — there are two, one
   * global and one per host, and that is [[GTC-301]].
   */
  smsOptedOut: boolean;
}

/** One membership of the event, as little of it as the decision needs. */
export interface ChooserMembership {
  /** `PersonEvent.id` — what `Household.contactPersonEventId` points at. */
  id: string;
  personId: string;
  /** `PersonEvent.role`. Writable, which is why the host rule keys on `Event.hostId` as well. */
  role: string;
  householdId: string | null;
  householdRole: string | null;
  /**
   * REQUIRED, not optional, for the hazard `resolveManualNudgeRecipient` records: a mark left
   * out of a narrow select reads as `undefined`, which `isChaseable` treats as chaseable.
   */
  nudgeMark: string | null;
  /** Whether this membership holds at least one item on this event. */
  holdsItems: boolean;
  person: ChooserPerson;
}

export interface ChooserHousehold {
  id: string;
  contactPersonEventId: string | null;
  /** NULL means not chosen. Read through `resolveHouseholdMuted`, never directly. */
  messagesMuted: boolean | null;
}

/** The event the decision is made inside: its host and its whole roster. */
export interface ChooserEvent {
  /** `Event.hostId` — a Person id. */
  hostId: string;
  memberships: readonly ChooserMembership[];
  households: readonly ChooserHousehold[];
}

/** Why a person's item is a line on the host's list (GTC-189 THE ASK, ruling A). */
export type HostListWhy =
  | 'NO_CHANNEL'
  | 'SMS_OPTED_OUT'
  | 'PHONE_UNUSABLE'
  | 'HOST_HOUSEHOLD_CHILD'
  | 'NO_CARRIER'
  | 'HOUSEHOLD_MUTED';

/** Why a membership is sent no ask at all. */
export type NotRecipientWhy = 'HOST_OWN_ASK' | 'CHILD_WITHOUT_ITEM';

/** Why the chase sends nothing. Timing and how it reads on the board are decision 15's. */
export type ChaseNoneWhy =
  | NotRecipientWhy
  | 'HOST_HOUSEHOLD_CHILD'
  | 'NO_CARRIER'
  | 'HOUSEHOLD_MUTED'
  | 'HOST_AS_CARRIER'
  | 'SMS_OPTED_OUT'
  | 'MARKED_DONT_CHASE'
  | 'PHONE_UNUSABLE'
  | 'NO_CHANNEL';

export type AskRoute =
  | { kind: 'DIRECT'; channel: Channel; recipientId: string }
  | { kind: 'CARRIED'; channel: Channel; recipientId: string }
  | { kind: 'HOST_LIST'; why: HostListWhy; carrierId?: string }
  | { kind: 'NOT_A_RECIPIENT'; why: NotRecipientWhy };

export type ChaseRoute =
  | { kind: 'DIRECT'; channel: Channel; recipientId: string }
  | { kind: 'CARRIED'; channel: Channel; recipientId: string }
  | { kind: 'NONE'; why: ChaseNoneWhy; carrierId?: string };

type Refusal<Why> = { ok: false; why: Why };
type Reached = { ok: true; channel: Channel };

/**
 * Who carries a child's item — Moment 4 §10.6 and §10.7, as GTC-189's founder ruling narrows
 * them: the household is the route by which a child's job reaches an adult, and nothing else.
 */
function resolveCarrier(
  child: ChooserMembership,
  event: ChooserEvent
):
  | { ok: true; carrier: ChooserMembership }
  | Refusal<'CHILD_WITHOUT_ITEM' | 'HOST_HOUSEHOLD_CHILD' | 'NO_CARRIER' | 'HOUSEHOLD_MUTED'> {
  if (!child.holdsItems) return { ok: false, why: 'CHILD_WITHOUT_ITEM' };

  const household = event.households.find((h) => h.id === child.householdId);
  if (!household) return { ok: false, why: 'NO_CARRIER' };
  const members = event.memberships.filter((m) => m.householdId === household.id);

  // Ruling A as corrected: a child of the host's OWN household is hers, whoever that household
  // has picked. Asked before the contact is resolved, which is also what keeps A2 narrow — the
  // host can only be reached as a carrier from a household she is not in.
  if (members.some((m) => isHostMembership(m, event.hostId))) {
    return { ok: false, why: 'HOST_HOUSEHOLD_CHILD' };
  }

  // `resolveHouseholdChannel` hands back a picked id even when it names a child, on purpose:
  // failing closed is the send decision's job, and this is a send decision.
  const carrierId = resolveHouseholdChannel({
    contactPersonEventId: household.contactPersonEventId,
    members,
  });
  const carrier = event.memberships.find((m) => m.id === carrierId);
  if (!carrier || !isMessageableRole(carrier.householdRole)) {
    return { ok: false, why: 'NO_CARRIER' };
  }

  // Since the founder ruling, "household messages" means carried child asks and nothing else. A
  // switched-off household closes the carrier route, and when the carrier route is closed the
  // item comes to the host (GTC-189 slice 1 answer 5 — the same shape as ruling A).
  if (resolveHouseholdMuted({ messagesMuted: household.messagesMuted, members }, event.hostId)) {
    return { ok: false, why: 'HOUSEHOLD_MUTED' };
  }

  return { ok: true, carrier };
}

/** THE ASK: email first, text if they have no email. */
function askChannelOf(
  person: ChooserPerson
): Reached | Refusal<'NO_CHANNEL' | 'SMS_OPTED_OUT' | 'PHONE_UNUSABLE'> {
  if (person.email) return { ok: true, channel: 'EMAIL' };
  if (!person.phoneNumber) return { ok: false, why: 'NO_CHANNEL' };
  // Zone 7: an opted-out phone is never texted, so for the ask it is no channel at all.
  if (person.smsOptedOut) return { ok: false, why: 'SMS_OPTED_OUT' };
  // GTC-189 slice 1 answer 2, a founder ruling: a text that will be rejected is worse than saying
  // plainly that Gather cannot reach him. That `isValidNZNumber` rejects +61 is [[GTC-300]].
  if (!isValidNZNumber(person.phoneNumber)) return { ok: false, why: 'PHONE_UNUSABLE' };
  return { ok: true, channel: 'TEXT' };
}

/** THE CHASE: text first, email if they have no phone — as rulings O, P and T narrow it. */
function chaseChannelOf(
  membership: ChooserMembership
): Reached | Refusal<'SMS_OPTED_OUT' | 'MARKED_DONT_CHASE' | 'PHONE_UNUSABLE' | 'NO_CHANNEL'> {
  const { person } = membership;

  // Ruling O: a no to one channel is a no to being chased — the refusal, not the number, so it
  // stands after the number is removed. First, as `nudge-mark.ts` requires wherever both apply.
  if (person.smsOptedOut) return { ok: false, why: 'SMS_OPTED_OUT' };

  // Ruling T: she has taken him over. Ahead of the channel facts, so a person both marked and
  // unreachable reports the mark — the same precedence Ruling 14's grey has over red.
  if (!isChaseable(membership.nudgeMark)) return { ok: false, why: 'MARKED_DONT_CHASE' };

  if (person.phoneNumber) {
    // Ruling P: a phone the chase cannot use hands over; it does not fall to email.
    return isValidNZNumber(person.phoneNumber)
      ? { ok: true, channel: 'TEXT' }
      : { ok: false, why: 'PHONE_UNUSABLE' };
  }

  // Decision 15 is open. This line is the narrow reading, built; deleting it is the wide one.
  // ANCHOR(GTC-189): decision 15 — narrow reading of ruling P
  if (person.email) return { ok: true, channel: 'EMAIL' };
  return { ok: false, why: 'NO_CHANNEL' };
}

/** How this membership's ask reaches an adult — or why it goes on the host's list instead. */
export function chooseAskRoute(subject: ChooserMembership, event: ChooserEvent): AskRoute {
  // The child rule leads, as in every ladder that has it: §10.6 must not become reachable
  // through a gate added after it.
  if (!isMessageableRole(subject.householdRole)) {
    const found = resolveCarrier(subject, event);
    if (!found.ok) {
      if (found.why === 'CHILD_WITHOUT_ITEM') return { kind: 'NOT_A_RECIPIENT', why: found.why };
      return { kind: 'HOST_LIST', why: found.why };
    }
    // Ruling A2 admits the host here and only here, as a carrier: her own ask is refused below
    // by the host exclusion, which this branch never reaches for her.
    const reach = askChannelOf(found.carrier.person);
    return reach.ok
      ? { kind: 'CARRIED', channel: reach.channel, recipientId: found.carrier.id }
      : { kind: 'HOST_LIST', why: reach.why, carrierId: found.carrier.id };
  }

  if (isHostMembership(subject, event.hostId)) {
    return { kind: 'NOT_A_RECIPIENT', why: 'HOST_OWN_ASK' };
  }

  const reach = askChannelOf(subject.person);
  return reach.ok
    ? { kind: 'DIRECT', channel: reach.channel, recipientId: subject.id }
    : { kind: 'HOST_LIST', why: reach.why };
}

/** How this membership's items are chased — or why they are not. */
export function chooseChaseRoute(subject: ChooserMembership, event: ChooserEvent): ChaseRoute {
  if (!isMessageableRole(subject.householdRole)) {
    const found = resolveCarrier(subject, event);
    if (!found.ok && (found.why === 'CHILD_WITHOUT_ITEM' || found.why === 'HOST_HOUSEHOLD_CHILD')) {
      return { kind: 'NONE', why: found.why };
    }
    // The child's own mark, ahead of the carrier's facts for the reason given in chaseChannelOf.
    if (!isChaseable(subject.nudgeMark)) return { kind: 'NONE', why: 'MARKED_DONT_CHASE' };
    if (!found.ok) return { kind: 'NONE', why: found.why };

    // Ruling R chases a carried ask through its carrier — but not the host (GTC-189 slice 1
    // answer 1). A2 let her receive the ask because the child's item had nowhere else to go;
    // chasing her is Gather nagging the person who pressed the button.
    // ANCHOR(GTC-189): host as carrier is not chased — slice 1 answer 1
    if (isHostMembership(found.carrier, event.hostId)) {
      return { kind: 'NONE', why: 'HOST_AS_CARRIER', carrierId: found.carrier.id };
    }

    const reach = chaseChannelOf(found.carrier);
    return reach.ok
      ? { kind: 'CARRIED', channel: reach.channel, recipientId: found.carrier.id }
      : { kind: 'NONE', why: reach.why, carrierId: found.carrier.id };
  }

  if (isHostMembership(subject, event.hostId)) return { kind: 'NONE', why: 'HOST_OWN_ASK' };

  const reach = chaseChannelOf(subject);
  return reach.ok
    ? { kind: 'DIRECT', channel: reach.channel, recipientId: subject.id }
    : { kind: 'NONE', why: reach.why };
}
