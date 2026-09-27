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
 * WIRED AT GTC-189 SLICE 3. `readAskPreview` in `src/lib/preflight/ask-preview.ts` is the first
 * caller; the senders (slices 5 and 8) are still to come. `contactMethod` is not touched here —
 * its removal is [[GTC-295]]'s, after slice 8.
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
 * ⚠ DECISION 15 IS ANSWERED, AND THEN REPLACED — [[GTC-311]], 2026-09-27. Ruling Y ruled it wide,
 * ruling AG made the hand-over a default the host overrides, and ruling AH turned that default ON:
 * a person with no mobile the chase can text, who holds an email, is chased by email unless the host
 * named them. The narrow line and its ANCHOR are gone; in their place `chaseChannelOf` asks
 * `resolveChaseWhenNoMobile`. When a hand-over reaches the host's list, and how it reads on the
 * board, are still not this module's — it returns why it sends nothing, never when or what colour.
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
import {
  resolveChaseWhenNoMobile,
  type ChaseWhenNoMobile,
} from '@/lib/eligibility/chase-when-no-mobile';
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
  /**
   * [[GTC-296]] — HAS THIS PERSON TAKEN THE EMAIL WAY OUT OF THIS EVENT?
   *
   * ⚠ REQUIRED, NOT OPTIONAL, AND FOR THE HAZARD `nudgeMark` DIRECTLY ABOVE RECORDS: a fact
   * left out of a narrow `select` reads as `undefined`, and `undefined` is falsy — so an
   * optional field would silently answer "no" for every caller that forgot it, which is the
   * direction that keeps sending. Required makes a forgetful caller a compile error.
   *
   * ⚠ PER EVENT. The set it is read from belongs to ONE event (ruling 1), so a context built
   * for event A must never be reused for event B. `readAskPreview` builds one per event and is
   * the only caller that assembles this from the database.
   */
  emailOptedOut: boolean;
  /**
   * [[GTC-324]] ruling 2 / [[GTC-189]] slice 8a — THE PROVIDER WILL NOT DELIVER TO THIS ADDRESS,
   * for any host. The chooser treats it as NO ADDRESS: the ask and the chase fall to text when there
   * is a usable mobile, and otherwise the person is the host's.
   *
   * ⚠ REQUIRED, FOR `emailOptedOut`'s REASON DIRECTLY ABOVE: a narrow select that left it out would
   * read as "not blocked" — the direction that keeps emailing an address that will never deliver,
   * which is the failure that costs every other host (GTC-324's lead sentence).
   */
  emailBlocked: boolean;
  /**
   * [[GTC-324]] rulings 1 and 3, D4 — THE COMPLAINT WAS ABOUT THIS EVENT'S MESSAGE. Implies
   * `emailBlocked`. Its own code, ahead of `EMAIL_OPTED_OUT`, only so the host of this event is shown
   * ruling 3's middle sentence; the behaviour is the opt-out's, chase-wide. Required, as above.
   */
  emailReported: boolean;
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
  /**
   * Whether this membership holds at least one row on this event — of EITHER kind. A job counts:
   * a child whose only row is a job, counted as holding nothing, is `CHILD_WITHOUT_ITEM` and
   * reaches no one (GTC-189 answer 6, build shape slice 3). See `readAskPreview`.
   */
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

/**
 * [[GTC-311]] — a membership as the CHASE needs it: everything the ask needs, and the host's named
 * exception.
 *
 * ⚠ REQUIRED, NOT OPTIONAL, AND ON A TYPE OF ITS OWN. Required for the hazard `nudgeMark` records: a
 * field left out of a narrow `select` reads as `undefined`, and here `undefined` would silently
 * follow the default — which under ruling AH EMAILS the person the host said she would handle. Its
 * own type because the ask never reads it (Scope: "the ask" is unchanged), so the eight callers of
 * `chooseAskRoute` are not asked to carry a field they must not use.
 */
export interface ChaseChooserMembership extends ChooserMembership {
  /** `PersonEvent.chaseException`. NULL means follow the event default. Never a polarity. */
  chaseException: ChaseWhenNoMobile | null;
}

/** The event as the chase needs it: its roster with the exceptions, and its switch. */
export interface ChaseChooserEvent extends ChooserEvent {
  memberships: readonly ChaseChooserMembership[];
  /** `Event.chaseWhenNoMobileDefault`. NULL means not set — the system default, BY_EMAIL. */
  chaseWhenNoMobileDefault: ChaseWhenNoMobile | null;
}

/** Why a person's item is a line on the host's list (GTC-189 THE ASK, ruling A). */
export type HostListWhy =
  // [[GTC-324]] ruling 1 — a spam report on THIS event's message, which is GTC-296's no arriving
  // by another door. Split from EMAIL_OPTED_OUT for the words only (ruling 3, D4).
  | 'EMAIL_REPORTED'
  | 'EMAIL_REPORTED_SMS_OPTED_OUT'
  // [[GTC-296]] ruling 1 — she said no to email for this event. FIRST in the union because it
  // is first in the ladder: a guest's own no outranks every fact about their channels.
  | 'EMAIL_OPTED_OUT'
  // [[GTC-324]] ruling 2 — the address is blocked and there is no mobile Gather may text. Not
  // NO_CHANNEL, whose words say "No email", which is false of somebody who has one.
  | 'EMAIL_BLOCKED'
  | 'EMAIL_BLOCKED_SMS_OPTED_OUT'
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
  // [[GTC-324]] ruling 1 — the reported event: GTC-296's chase-wide no, with ruling 3's words.
  | 'EMAIL_REPORTED'
  // [[GTC-324]] ruling 2 — a blocked address and no mobile the chase can text.
  | 'EMAIL_BLOCKED'
  // [[GTC-296]] ruling 3 — CHASE-WIDE. An email no stops the chase on EVERY channel for that
  // event, the text chase included. Ruling O of [[GTC-189]] read straight: *"a no to one
  // channel is treated as a no to being chased."*
  | 'EMAIL_OPTED_OUT'
  | NotRecipientWhy
  | 'HOST_HOUSEHOLD_CHILD'
  | 'NO_CARRIER'
  | 'HOUSEHOLD_MUTED'
  | 'HOST_AS_CARRIER'
  | 'SMS_OPTED_OUT'
  | 'MARKED_DONT_CHASE'
  | 'PHONE_UNUSABLE'
  | 'NO_CHANNEL'
  // [[GTC-311]] — the host took them: no mobile the chase can text, an email it could use, and
  // `resolveChaseWhenNoMobile` answered HAND_TO_HOST — by her named exception, or by her switch.
  // A fact about HER decision, not about the person's channels, which is why it is not NO_CHANNEL.
  | 'HANDED_TO_HOST';

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
function resolveCarrier<M extends ChooserMembership>(
  child: M,
  event: Omit<ChooserEvent, 'memberships'> & { memberships: readonly M[] }
):
  | { ok: true; carrier: M }
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
type AskRefusalWhy =
  | 'EMAIL_REPORTED'
  | 'EMAIL_REPORTED_SMS_OPTED_OUT'
  | 'EMAIL_OPTED_OUT'
  | 'EMAIL_BLOCKED'
  | 'EMAIL_BLOCKED_SMS_OPTED_OUT'
  | 'NO_CHANNEL'
  | 'SMS_OPTED_OUT'
  | 'PHONE_UNUSABLE';

function askChannelOf(person: ChooserPerson): Reached | Refusal<AskRefusalWhy> {
  /*
   * ⚠ [[GTC-296]] RULING 1 AND CORRECTION R1 — IT REFUSES, IT DOES NOT FALL TO TEXT, AND THE
   * POSITION ABOVE `person.email` IS THE WHOLE OF IT.
   *
   * Below the email branch this line would be unreachable for everybody it is about. Below the
   * PHONE branch it would be worse than unreachable: a person who unsubscribed from email and
   * holds a usable number would be TEXTED the invitation instead — *"silently keeps sending on
   * a different channel"*, which is the pattern [[GTC-324]] was raised against and which
   * correction R1 refused by name. The fixture in `tests/email-opt-out-test.ts` gives its
   * subject a live +64 number precisely so that implementation cannot pass.
   */
  // [[GTC-324]] ruling 1: the reported event. Above EMAIL_OPTED_OUT, which the same complaint also
  // wrote, so the host of this event reads ruling 3's words rather than GTC-296's.
  if (person.emailReported) {
    return {
      ok: false,
      why: person.smsOptedOut ? 'EMAIL_REPORTED_SMS_OPTED_OUT' : 'EMAIL_REPORTED',
    };
  }
  if (person.emailOptedOut) return { ok: false, why: 'EMAIL_OPTED_OUT' };
  // [[GTC-324]] ruling 2: a blocked address is NO address — it falls to the phone below.
  if (person.email && !person.emailBlocked) return { ok: true, channel: 'EMAIL' };
  const blocked = !!person.email;
  if (!person.phoneNumber) return { ok: false, why: blocked ? 'EMAIL_BLOCKED' : 'NO_CHANNEL' };
  // Zone 7: an opted-out phone is never texted, so for the ask it is no channel at all.
  if (person.smsOptedOut) {
    return { ok: false, why: blocked ? 'EMAIL_BLOCKED_SMS_OPTED_OUT' : 'SMS_OPTED_OUT' };
  }
  // GTC-189 slice 1 answer 2, a founder ruling: a text that will be rejected is worse than saying
  // plainly that Gather cannot reach him. That `isValidNZNumber` rejects +61 is [[GTC-300]].
  if (!isValidNZNumber(person.phoneNumber)) {
    return { ok: false, why: blocked ? 'EMAIL_BLOCKED' : 'PHONE_UNUSABLE' };
  }
  return { ok: true, channel: 'TEXT' };
}

/**
 * THE CHASE: text first; email for a person with no mobile it can text, unless the host took them.
 *
 * ⚠ THE WHOLE ORDER, STATED ONCE — RULED 2026-09-27 ([[GTC-311]] plan, flag B):
 *
 *   1. SMS OPT-OUT      Zone 7. Guest-set, legally binding.            → SMS_OPTED_OUT
 *   2. EMAIL OPT-OUT    [[GTC-296]]. Guest-set, per event.             → EMAIL_OPTED_OUT
 *   3. DON'T-CHASE      `nudge-mark.ts`. Host-set.                     → MARKED_DONT_CHASE
 *   4. A USABLE MOBILE  the chase texts, and the exception is never read → TEXT
 *   5. AN EMAIL         `resolveChaseWhenNoMobile`                     → EMAIL | HANDED_TO_HOST
 *   6. NEITHER                                                          → PHONE_UNUSABLE | NO_CHANNEL
 *
 * ⚠ THE MARK IS ABOVE THE RESOLVER, AND THE BRIEF HAD IT BELOW. Ruling AL (iii) says the mark
 * composes *"downstream of both"*: a person handed to the host is not chased whatever the mark says,
 * and a don't-chase person is not chased whatever the exception says. That is a statement about the
 * OUTCOME, and both orders give it — nobody in 1 to 3 is chased. What the order decides is the
 * REPORTED reason, and the mark first keeps ruling T and GTC-192 Ruling 14's grey: a person she has
 * taken over is grey, whatever else is true. The founder ruled it so on 2026-09-27.
 *
 * ⚠ "NO MOBILE IT CAN TEXT" INCLUDES AN UNUSABLE ONE — ruled 2026-09-27 (flag A), and it NARROWS
 * RULING P. The London cousin with an email is in the email chase by default, because ruling AH was
 * measured on exactly that population (decision 25's 95.1% counted the unusable numbers). Without an
 * email he still comes to the host, as ruling P ruled.
 */
function chaseChannelOf(
  membership: ChaseChooserMembership,
  eventDefault: ChaseWhenNoMobile | null
):
  | Reached
  | Refusal<
      | 'EMAIL_REPORTED'
      | 'EMAIL_OPTED_OUT'
      | 'SMS_OPTED_OUT'
      | 'MARKED_DONT_CHASE'
      | 'PHONE_UNUSABLE'
      | 'NO_CHANNEL'
      | 'HANDED_TO_HOST'
      | 'EMAIL_BLOCKED'
    > {
  const { person } = membership;

  // 1. Ruling O: a no to one channel is a no to being chased — the refusal, not the number, so it
  // stands after the number is removed. First, as `nudge-mark.ts` requires wherever both apply.
  if (person.smsOptedOut) return { ok: false, why: 'SMS_OPTED_OUT' };

  /*
   * 2. ⚠ [[GTC-296]] RULING 3 — CHASE-WIDE, AND THIS IS THE LINE THAT MAKES IT CHANNEL-AGNOSTIC.
   *
   * The chase prefers TEXT, so an email opt-out checked anywhere below the phone branch would
   * leave the text chase running for somebody who asked not to be chased. Ruling 3 is explicit:
   * it stops *"the automatic chase on EVERY channel for that event, including the text chase"* —
   * ruling O of [[GTC-189]] read straight and applied to the email side.
   *
   * ⚠ BELOW ZONE 7's LINE AND ABOVE THE MARK, WHICH IS A FOUNDER RULING (correction R2) AND NOT
   * THE EXECUTOR'S FIRST GUESS. The outcome is identical either way — the chase refuses — and what
   * the order decides is which REASON a person carrying both conditions is reported under.
   * `SmsOptOut` is Zone 7 and legally binding; it keeps the top.
   */
  // [[GTC-324]] ruling 1 — the reported event is GTC-296's no; its own code for ruling 3's words.
  if (person.emailReported) return { ok: false, why: 'EMAIL_REPORTED' };
  if (person.emailOptedOut) return { ok: false, why: 'EMAIL_OPTED_OUT' };

  // 3. Ruling T: she has taken him over. Ahead of the channel facts AND the resolver, so a person
  // both marked and excepted reports the mark — the same precedence Ruling 14's grey has over red.
  if (!isChaseable(membership.nudgeMark)) return { ok: false, why: 'MARKED_DONT_CHASE' };

  // 4. A mobile the chase can use. The exception is about people it CANNOT text, so it is not read.
  if (person.phoneNumber && isValidNZNumber(person.phoneNumber)) {
    return { ok: true, channel: 'TEXT' };
  }

  // 5. [[GTC-311]] — THE NAMED EXCEPTION WINS (ruling AL), through its own module.
  // [[GTC-324]] ruling 2: a blocked address is no address, so the resolver is never asked about it.
  if (person.email && !person.emailBlocked) {
    return resolveChaseWhenNoMobile({ exception: membership.chaseException, eventDefault }) ===
      'BY_EMAIL'
      ? { ok: true, channel: 'EMAIL' }
      : { ok: false, why: 'HANDED_TO_HOST' };
  }

  // 5b. [[GTC-324]] ruling 2: an address the provider will not deliver to, and no mobile to text.
  if (person.email) return { ok: false, why: 'EMAIL_BLOCKED' };

  // 6. Ruling P: a phone the chase cannot use, and nothing else to chase by, hands over.
  return { ok: false, why: person.phoneNumber ? 'PHONE_UNUSABLE' : 'NO_CHANNEL' };
}

/**
 * GTC-189 SLICE 7b, RULING U'S THIRD ACTION — *"send to the phone instead"*.
 *
 * WOULD THE ASK REACH THIS PERSON BY TEXT IF THEY HELD NO ADDRESS? `askChannelOf` above answers
 * EMAIL for anybody holding one and stops, so the chooser can never produce a TEXT route for the
 * very people this action exists for: somebody whose live address has just bounced.
 *
 * ⚠ IT IS THE SAME LADDER WITH THE EMAIL SET ASIDE, NOT A SECOND COPY OF IT. The alternative was
 * a predicate in the door reading `smsOptedOut` and `isValidNZNumber` for itself — a second
 * spelling of Do-Not-Touch Zone 7's ask-side rule, living in the one module that must never be
 * the place it drifts. So this calls `askChannelOf` with `email: null` and passes its refusal
 * through unchanged, which means a mutation to Zone 7's line in that function fails the door's
 * suite as well as the chooser's. That is the property, not a convenience.
 *
 * ⚠ AND IT IS NOT A ROUTE. It answers whether an offer may be made; `chooseAskRoute` still owns
 * what the press and the drain do. Ruling U's third action is the HOST overriding the channel
 * the chooser chose, and the override lives on the `OutboundMessage` row rather than here.
 */
export type TextAskReach =
  | { ok: true }
  // [[GTC-296]]: the ladder it calls can now refuse for an email opt-out, and the refusal is
  // passed through unchanged rather than translated — which is this function's stated property.
  // Ruling U's *"send to the phone instead"* must not become a way round ruling 1.
  | { ok: false; why: AskRefusalWhy };

export function textAskReachOf(person: ChooserPerson): TextAskReach {
  const reach = askChannelOf({ ...person, email: null });
  return reach.ok ? { ok: true } : { ok: false, why: reach.why };
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

/**
 * How this membership's items are chased — or why they are not.
 *
 * [[GTC-311]]: the pre-flight reads this, and [[GTC-189]] slice 8's chase is to read it too — one
 * answer from one place. A carried child's chase goes to the carrier, so it is the CARRIER's named
 * exception that decides; a value on the child's own row decides nothing.
 */
export function chooseChaseRoute(
  subject: ChaseChooserMembership,
  event: ChaseChooserEvent
): ChaseRoute {
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

    const reach = chaseChannelOf(found.carrier, event.chaseWhenNoMobileDefault);
    return reach.ok
      ? { kind: 'CARRIED', channel: reach.channel, recipientId: found.carrier.id }
      : { kind: 'NONE', why: reach.why, carrierId: found.carrier.id };
  }

  if (isHostMembership(subject, event.hostId)) return { kind: 'NONE', why: 'HOST_OWN_ASK' };

  const reach = chaseChannelOf(subject, event.chaseWhenNoMobileDefault);
  return reach.ok
    ? { kind: 'DIRECT', channel: reach.channel, recipientId: subject.id }
    : { kind: 'NONE', why: reach.why };
}
