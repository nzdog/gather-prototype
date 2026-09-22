import type { OutboundChannel, PrismaClient } from '@prisma/client';
import { readAskPreview, smsOptedOutFact } from '@/lib/preflight/ask-preview';
import { composePreview } from '@/lib/preflight/ask-preview-compose';
import { textAskReachOf } from '@/lib/eligibility/channel-chooser';
import { getEmailOptOut } from '@/lib/eligibility/email-opt-out';
import { deliveryFactFrom, latestRowByMembership } from '@/lib/glance/delivery-fact';
import { smsProviderConfiguredFor } from '@/lib/sms/send-sms';
import { recordChange, type LedgerActor } from '@/lib/ledger';
import {
  doorActionsFor,
  type DoorReason,
  type DoorView,
  type ResendAction,
  type ResendRefusalCode,
} from './resend-door';

/**
 * GTC-189 SLICE 7b — RULING U'S DOOR, THE MECHANISM.
 *
 * > THE BOUNCE DOOR OFFERS THREE THINGS... They answer three different failures — a full
 * > mailbox, a wrong address, a dead one — and one button could only ever serve one.
 *
 * ── WHAT EVERY ACTION DOES, AND IT IS THE SAME THING ──────────────────────────
 *
 * ⚠ EACH ACTION WRITES ONE NEW `OutboundMessage` ROW AND RETURNS. IT SENDS NOTHING. Everything
 * after that is `drainOnce` on the two-minute cron: the chooser re-run, the host-list gate, the
 * link gate, the reply-to gate, quiet hours, the claim, the real senders, the outcome. There is
 * no second send path and no branch in the dispatcher for a resend — which is slice 5e's design
 * applied again: *"this function creates the row and everything after it is `drainOnce`."*
 *
 * The tree was built expecting this, in four places, and this module is what they were expecting:
 *  - the schema refuses `@@unique([personEventId, kind])` because it *"would have broken ruling
 *    U's resend"*;
 *  - `recordAcceptance` predicates the clock on `sentAt: null`, so a resend does not restart a
 *    person's four days — *"Gather rewarding its own failure"*;
 *  - `enrolMiniSends` keys on *no ask row at all* and names ruling U's resend as *"the one case
 *    that makes a second ask row deliberately"*;
 *  - `latestRowByMembership` exists so the newest row is the fact, *"or the door is a button
 *    that changes nothing."*
 *
 * ── ⚠ WHY THIS SERVER MODULE READS THE GLANCE'S JOIN MODULE ───────────────────
 *
 * `deliveryFactFrom` decides which rows are a red. The alternative was this module deciding for
 * itself which end states count as a failure — a SECOND definition of *which reds am I the door
 * for*, and the first thing it would do is disagree with the strip the host just tapped. Slice
 * 7a put that translation in `delivery-fact.ts` precisely because it is *"the only place the
 * press's vocabulary and the glance's meet"*, and a door between the two is that meeting, not a
 * new coupling. `state.ts` still does not learn what a bounce is and `dispatch.ts` still does not
 * learn what red means.
 *
 * ── ⚠ AND WHAT THIS MODULE DOES NOT REFUSE, RECORDED BECAUSE IT WAS PROPOSED ──
 *
 * A DON'T-CHASE PERSON IS NOT REFUSED HERE, and the shape proposal said they would be, copying
 * `remindRefusal`'s. Checked against ruling T before building and the copy was wrong: *"The ask
 * still goes out. The mark is not an exclusion — he is invited like anyone else."* `chooseAskRoute`
 * consults no mark and the press sends to marked people. A remind is a CHASE and the mark
 * suppresses chasing; this is the ASK, re-sent, and the mark never touched it.
 *
 * ✅ RULED CORRECT BY THE FOUNDER, 2026-09-19, as an error of theirs corrected at the build:
 * *"I signed a refusal that would have narrowed ruling T, and you caught it by reading the ruling
 * rather than the proposal."*
 *
 * ⚠ AND THE ABSENCE IS SAFE FOR A DIFFERENT REASON THAN THE PROPOSAL GAVE. It said the refusal
 * should exist anyway *"because the rule is about the system and not about which strips happen to
 * be tappable"* — which is `remindRefusal`'s ground, carried across without checking that it
 * applied. The door IS unreachable for a marked person, because Ruling 14 greys them and only reds
 * are doors; but that is a fact about WHICH STRIPS ARE TAPPABLE, and it is NOT what makes the
 * absence correct. What makes it correct is that there is no rule here to enforce: ruling T never
 * suppressed the ask. A refusal resting on the greying would be a right answer resting on the
 * wrong reason, and a wrong answer the day a marked person's strip becomes tappable.
 */

/** Injectable for the suite alone; the default is the real predicate. See `DoorFacts`. */
export interface ResendDeps {
  /**
   * ⚠ A SEAM, AND IT EXISTS FOR ONE REASON: `isTnzEnabled` reads its env var at MODULE SCOPE, so
   * one process cannot observe both sides of founder answer 1's fence. `GlanceActionDeps`'s
   * `fetchImpl` has the same justification — *"'no request was issued' has to be a count of
   * calls, not a claim about intent."* Nothing in `src/` passes it.
   */
  textingConfiguredFor?: (to: string) => boolean;
}

export interface ResendRefusal {
  ok: false;
  /** 400 for the address typed into the panel; 404 for gone; 409 for every state refusal. */
  status: 400 | 404 | 409;
  code: ResendRefusalCode;
}

export interface DoorOpened {
  ok: true;
  view: DoorView;
}

export interface ResendDone {
  ok: true;
  action: ResendAction;
  channel: OutboundChannel;
  outboundMessageId: string;
}

const refuse = (status: 400 | 404 | 409, code: ResendRefusalCode): ResendRefusal => ({
  ok: false,
  status,
  code,
});

/**
 * A refusal decided INSIDE the transaction, thrown so it rolls back and unwrapped outside it.
 * `press.ts`'s `PressRefused`, for `press.ts`'s reason — and here it carries one case that
 * module does not have: [[GTC-293]]'s unique violation, which must leave NEITHER the address nor
 * a queued message behind.
 */
class ResendRefused extends Error {
  constructor(readonly refusal: ResendRefusal) {
    super(refusal.code);
  }
}

interface Subject {
  personEventId: string;
  personId: string;
  eventId: string;
  hostId: string;
  email: string | null;
  phoneNumber: string | null;
  smsOptedOut: boolean;
  /**
   * [[GTC-296]] — HAS THIS PERSON TAKEN THE EMAIL WAY OUT OF THIS EVENT?
   *
   * ⚠ IT REACHES THE DOOR BECAUSE OF WHAT THE DOOR OFFERS. Ruling U's third action is *"send
   * to the phone instead"*, which for somebody who unsubscribed is exactly the fall-to-text
   * correction R1 refused by name. The fact is carried on the subject rather than read inside
   * `factsFor`, so both entry points resolve it *"once and identically"* — this file's own rule.
   */
  emailOptedOut: boolean;
  reason: DoorReason;
}

/**
 * Everything both entry points need, resolved once and identically.
 *
 * ⚠ THE GUARD ORDER IS THE POINT. The event, then the membership, then *has this event been
 * pressed*, then *did this person's last message actually fail*. A door that checked the failure
 * first would open on an unpressed event for a row that cannot exist.
 */
async function resolveSubject(
  db: PrismaClient,
  eventId: string,
  personId: string
): Promise<Subject | ResendRefusal> {
  const event = await db.event.findUnique({
    where: { id: eventId },
    select: { id: true, sentAt: true, hostId: true },
  });
  if (!event) return refuse(404, 'EVENT_NOT_FOUND');

  const membership = await db.personEvent.findUnique({
    where: { personId_eventId: { personId, eventId } },
    select: {
      id: true,
      personId: true,
      person: { select: { email: true, phoneNumber: true, smsOptedOut: true } },
    },
  });
  if (!membership) return refuse(404, 'NOT_ON_THIS_EVENT');

  /*
   * ⚠ `sentAt` IS NOT ENOUGH, AND `enrolMiniSends` IS WHERE THAT WAS LEARNED THE HARD WAY.
   * `Event.sentAt` has been written since [[GTC-169]] by the OLD press — the one that stamped
   * clocks and sent nothing — so an event pressed before slice 5 has `sentAt` set and ZERO
   * `OutboundMessage` rows. The predicate is *an ask row exists*: an event the NEW press wrote
   * for. Otherwise this door would offer to "send again" something that was never sent once.
   */
  const asked = await db.outboundMessage.count({ where: { eventId, kind: 'ASK' } });
  if (!event.sentAt || asked === 0) return refuse(409, 'NOT_PRESSED');

  /*
   * WHICH RED, ASKED OF THE SAME FUNCTION THE BOARD ASKS.
   *
   * ⚠ AND OF THE SAME ROW. `latestRowByMembership` is slice 7a's, and its note says why: reading
   * "any row ever failed" would make this door unable to clear the red it opens. Here it does
   * the other half of that job — a membership whose LATEST row is fine has no door, which is
   * what stops a second press putting a second message on somebody who already has theirs.
   */
  const rows = await db.outboundMessage.findMany({
    where: { personEventId: membership.id },
    select: {
      id: true,
      personEventId: true,
      createdAt: true,
      rejectedAt: true,
      withheldAt: true,
      withheldWhy: true,
      deliveryState: true,
    },
  });
  const failure = deliveryFactFrom(latestRowByMembership(rows).get(membership.id)).failure;
  if (!failure) return refuse(409, 'NOTHING_FAILED');

  return {
    personEventId: membership.id,
    personId: membership.personId,
    eventId,
    hostId: event.hostId,
    email: membership.person.email,
    phoneNumber: membership.person.phoneNumber,
    smsOptedOut: membership.person.smsOptedOut,
    emailOptedOut: (await getEmailOptOut(membership.personId, eventId)) !== null,
    reason: failure,
  };
}

/**
 * [[GTC-301]]'s two opt-out facts, for ONE number, through the one definition of the merge.
 *
 * The pre-flight reads every number on the event in a single query; this reads one. The RULE is
 * shared and the fetch is not — see `smsOptedOutFact`.
 */
async function optedOut(db: PrismaClient, subject: Subject): Promise<boolean> {
  if (!subject.phoneNumber) return subject.smsOptedOut;
  const rows = await db.smsOptOut.findMany({
    where: { hostId: subject.hostId, phoneNumber: subject.phoneNumber },
    select: { phoneNumber: true },
  });
  return smsOptedOutFact(
    { smsOptedOut: subject.smsOptedOut, phoneNumber: subject.phoneNumber },
    new Set(rows.map((r) => r.phoneNumber))
  );
}

async function factsFor(db: PrismaClient, subject: Subject, deps: ResendDeps) {
  const configured = deps.textingConfiguredFor ?? smsProviderConfiguredFor;
  const person = {
    email: subject.email,
    phoneNumber: subject.phoneNumber,
    smsOptedOut: await optedOut(db, subject),
    emailOptedOut: subject.emailOptedOut,
  };
  return {
    reason: subject.reason,
    hasAddress: !!subject.email,
    // Zone 7 and [[GTC-300]] both live inside this call, in the module that owns them.
    textReach: textAskReachOf(person),
    // Founder answer 1's fence. `false` with no number is not a claim about the provider — the
    // reach above has already refused, and the offer needs both.
    textingConfigured: subject.phoneNumber ? configured(subject.phoneNumber) : false,
  };
}

/**
 * THE LAST LOOK — founder answer 2, 2026-09-19: *"The address it will send to, the message it
 * will send, and a press rather than a link."*
 *
 * ⚠ AND IT IS NOT [[GTC-311]]'s ONE-PERSON PRE-FLIGHT. That is a ruled object (ruling AJ,
 * decision 23) which asks a late arrival the CHASE-CHANNEL question at their own send, and it
 * does not exist. This is a panel showing two facts before a press. The founder's instruction,
 * recorded at the site it is about: *"If they later converge, that is GTC-311's to decide."*
 *
 * ⚠ THE MESSAGE IS COMPOSED BY THE WALK THE PRE-FLIGHT AND THE DRAIN BOTH RUN, never a second
 * composition — `readAskPreview` then `composePreview`, exactly as `drainOnce` does it. The cost
 * is a whole-event preview to show one person's message, on a panel open. That is accepted
 * rather than optimised: a narrower per-person composition is a second construction of the
 * chooser context, which is the drift `ask-preview.ts` records [[GTC-294]] catching in that very
 * module.
 *
 * ⚠ ON RULING M's RED THE MESSAGE IS NULL, and that is the truth rather than a gap. An
 * unreachable person is on `preview.hostList`, not in `preview.recipients`, so there is nothing
 * composed for them — Gather has no message for somebody it has no way to send to. Fabricating
 * one would be the panel inventing the thing it exists to show.
 */
export async function readDoor(
  db: PrismaClient,
  args: { eventId: string; personId: string; baseUrl: string },
  deps: ResendDeps = {}
): Promise<DoorOpened | ResendRefusal> {
  const subject = await resolveSubject(db, args.eventId, args.personId);
  if ('ok' in subject) return subject;

  const facts = await factsFor(db, subject, deps);

  let message: DoorView['message'] = null;
  const preview = await readAskPreview(db, args.eventId, args.baseUrl);
  if (preview) {
    const composed = composePreview(preview, preview.storedAuthorLine);
    const row = composed.rows.find((r) => r.recipient.personEventId === subject.personEventId);
    if (row?.ask) message = { subject: row.subject, text: row.ask.text };
  }

  return {
    ok: true,
    view: {
      reason: subject.reason,
      address: subject.email,
      message,
      actions: doorActionsFor(facts),
    },
  };
}

/**
 * THE PRESS, PER PERSON. One row, one transaction, no provider.
 *
 * ⚠ THE OFFER IS RE-DECIDED HERE AND THE PANEL'S LIST IS NOT TRUSTED. `drainOnce`'s own rule —
 * *"the chooser is re-run here and the row is not trusted"* — applied to a screen instead of a
 * row: a door opened before somebody opted out must not be pressable after it. So every refusal
 * below can fire even though the control that reaches it was never rendered.
 */
export async function resendToPerson(
  db: PrismaClient,
  args: {
    eventId: string;
    personId: string;
    baseUrl: string;
    actor: LedgerActor;
    action: ResendAction;
    email?: string | null;
  },
  deps: ResendDeps = {}
): Promise<ResendDone | ResendRefusal> {
  const subject = await resolveSubject(db, args.eventId, args.personId);
  if ('ok' in subject) return subject;

  const facts = await factsFor(db, subject, deps);

  try {
    return await db.$transaction(async (tx) => {
      let channel: OutboundChannel = 'EMAIL';

      if (args.action === 'AGAIN') {
        // Nothing to send it to. The panel does not offer this control without an address; the
        // route refuses it anyway, because the surface may only ever be stricter.
        if (!facts.hasAddress) throw new ResendRefused(refuse(409, 'NO_ADDRESS'));
      }

      if (args.action === 'EDIT') {
        const address = (args.email ?? '').trim();
        /*
         * ⚠ THE THINNEST CHECK THAT IS TRUE. An address with no `@` cannot be sent to and the
         * host would learn that from a bounce four minutes later; a fuller grammar here would be
         * this module deciding which real addresses are real, which is the family of defect
         * [[GTC-273]] names — a detector matching a spelling rather than evaluating a thing.
         * The provider is the authority on deliverability and the row records what it said.
         */
        if (!address || !/^[^@\s]+@[^@\s]+$/.test(address)) {
          throw new ResendRefused(refuse(400, 'ADDRESS_REQUIRED'));
        }
        const before = subject.email;
        try {
          await tx.person.update({ where: { id: subject.personId }, data: { email: address } });
        } catch (e) {
          /*
           * ⚠ [[GTC-293]] ARRIVING AT THE BUTTON BUILT TO INVITE IT. `Person.email` is `@unique`
           * and the host's obvious fix for a dead address is the partner's — which is GTC-293's
           * own case. Founder ruling, 2026-09-19: that ticket becomes a precondition of the
           * DEPLOY and this catches the violation and answers with a true sentence. It does not
           * fix it: the fix is either dropping the constraint or matching differently, and both
           * are GTC-293's with a migration behind them.
           *
           * The throw leaves the transaction rolled back, so a collision writes NEITHER the
           * address nor a queued message. Half of this action landing would be the worse failure:
           * a message on its way to an address the host did not end up with.
           */
          if ((e as { code?: string }).code === 'P2002') {
            throw new ResendRefused(refuse(409, 'ADDRESS_TAKEN'));
          }
          throw e;
        }

        /*
         * FOUNDER ANSWER 5 — THE LEDGER ENTRY. *"The press starts the audit trail and this
         * changes a guest's contact detail inside the versioned window."* Inside the same
         * transaction as the write it describes, for the reason founder Q2 gave the press's
         * recipient count: a record written outside the transaction is one that can disagree
         * with what it claims to record.
         */
        await recordChange(tx, {
          eventId: args.eventId,
          actor: args.actor,
          changes: [
            {
              action: 'EDIT_PERSON_CONTACT',
              targetType: 'PersonEvent',
              targetId: subject.personEventId,
              field: 'email',
              before,
              after: address,
            },
          ],
        });
      }

      if (args.action === 'PHONE') {
        /*
         * ⚠ THE PERSON'S OWN FACTS FIRST, THE FENCE SECOND — AND THE ORDER WAS WRITTEN THE OTHER
         * WAY ROUND AND CORRECTED BY AN ASSERTION, which is worth recording rather than tidying.
         *
         * The first version put founder answer 1's fence at the top, reasoning that our own
         * broken configuration must never be dressed up as a fact about the guest. Slice 7a's
         * test, applied properly, says the opposite here: *"is this a fact about the PERSON, or
         * about GATHER?"* — and *they have no mobile number* is a fact about the person that is
         * true whatever our configuration is. Checked fence-first, a person with no phone at all
         * was told *"Gather cannot send texts at the moment"*, which is a sentence about a
         * temporary operator failure standing in front of a permanent fact, and it would have
         * her waiting for a provider that would change nothing for that guest.
         *
         * So: no usable number is the guest's fact and is said first; a usable number with no
         * provider behind it is ours, and is the only case the fence's sentence is true of.
         */
        if (!facts.textReach.ok) {
          const why = facts.textReach.why;
          throw new ResendRefused(
            refuse(
              409,
              why === 'SMS_OPTED_OUT'
                ? 'PHONE_OPTED_OUT'
                : why === 'PHONE_UNUSABLE'
                  ? 'PHONE_UNUSABLE'
                  : 'NO_PHONE'
            )
          );
        }
        if (!facts.textingConfigured) throw new ResendRefused(refuse(409, 'TEXTING_UNAVAILABLE'));
        /*
         * ⚠ THE OVERRIDE, AND THE ROW IS THE ONLY PLACE IT IS RECORDED. `askChannelOf` answers
         * EMAIL for anybody holding an address, so the chooser would never produce this row. The
         * drain branches on the STORED channel and consults the preview only for the host-list,
         * link and reply-to gates — so a TEXT row for an email-routed person sends by text, with
         * no change to the dispatcher. That seam is what makes ruling U's third action possible
         * and it is a host overriding a rule the chooser owns. Recorded here rather than left to
         * be found by whoever next asks why a row's channel disagrees with the chooser.
         *
         * ⚠ AND ITS SEGMENT COST IS UNMEASURED. `composePreview` counts SMS segments off the
         * CHOOSER's channel, not the row's, so this row carries the body the email would have
         * carried, sent as a text, at a cost the pre-flight's "the longest is N texts" never
         * counted and the host has never been shown. `composeAsk` writes one text for both
         * channels, so the BODY is fine; only the cost is unknown. Recorded, not solved — the
         * founder's instruction of 2026-09-19.
         */
        channel = 'TEXT';
      }

      const row = await tx.outboundMessage.create({
        data: {
          eventId: args.eventId,
          personEventId: subject.personEventId,
          kind: 'ASK',
          channel,
        },
        select: { id: true },
      });

      /*
       * ⚠ NOTHING ELSE IS SET, AND THAT IS WHAT MAKES THE DRAIN PICK IT UP. `attemptedAt` null
       * and `withheldAt` null is exactly `findNeverAttempted`'s predicate. The press writes its
       * rows the same way and for the same reason: every other column is a fact about an
       * ATTEMPT, and this makes none.
       *
       * ⚠ AND THE RED CLEARS THE MOMENT THE BOARD REFRESHES, BEFORE ANYTHING IS SENT. This row
       * is now the latest, it carries no end state, so `deliveryFactFrom` answers no failure and
       * the strip goes AMBER. That is honest by amber's own definition — Gather has a next move
       * and the row is waiting for the two-minute cron — and it is recorded here because a host
       * who presses and watches will draw a conclusion from what she sees change.
       */
      return { ok: true as const, action: args.action, channel, outboundMessageId: row.id };
    });
  } catch (e) {
    if (e instanceof ResendRefused) return e.refusal;
    throw e;
  }
}
