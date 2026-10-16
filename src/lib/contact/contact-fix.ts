import type { Prisma, PrismaClient } from '@prisma/client';
import {
  chooseAskRoute,
  textAskReachOf,
  type Channel,
  type ChooserMembership,
  type ChooserPerson,
} from '@/lib/eligibility/channel-chooser';
import { isChildMembership } from '@/lib/eligibility/child-exclusion';
import { emailBlockStateOf, listEmailBlocks } from '@/lib/eligibility/email-block';
import { getEmailOptOut } from '@/lib/eligibility/email-opt-out';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';
import {
  listTextBlocks,
  numberDeadOf,
  tnzOptedOutOf,
  type TextBlockFact,
} from '@/lib/eligibility/text-block';
import { recordChange, type LedgerActor } from '@/lib/ledger';
import { formatPhoneForDisplay, normalizePhoneNumber } from '@/lib/phone';
import { smsOptedOutFact } from '@/lib/preflight/ask-preview';
import { SMS_OPT_OUT_IN_FORCE } from '@/lib/sms/opt-out-service';
import type { ContactRefusalCode } from '@/lib/press/resend-door';
import type { ContactRouteRefusal } from './contact-box';

/**
 * [[GTC-387]] — THE CONTACT BOX, THE MECHANISM. One check and one write, shared by the board's
 * "nowhere to send" door (`resendToPerson`, after the press: save, then send) and the pre-flight's
 * second channel shape (`saveContactBeforePress`, before it: save only).
 *
 * ⚠ ONE PLACE DECIDES WHO MAY BE TEXTED, AND IT IS NOT THIS FILE. The person is built as they would
 * be after the save and handed to the chooser: `chooseAskRoute` says whether the invitation now
 * reaches them and by which channel, `textAskReachOf` whether a new mobile may be texted. The facts
 * come from their existing readers (the one opt-out merge `smsOptedOutFact`, the blocks, the email
 * opt-out). Nothing here compares a number or an opt-out for itself.
 *
 * ⚠ A STOP IS NEVER SHED BY CHANGING NUMBERS. The person's opt-out as it stands (the flag, or their
 * current number on an opt-out list) is carried onto the new number, so a host cannot type round a
 * guest's STOP (ruling 2; Nigel at the plan: "Do not let a new mobile be saved onto someone who has
 * opted out of texts").
 *
 * ⚠ ALL OR NOTHING (Q3). Every box is checked before anything is written; one refusal and nothing is
 * saved. The write is on the transaction the caller hands in, with its ledger line beside it.
 *
 * An empty box means "leave it as it is", never "remove it".
 */

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * [[GTC-301]]'s two opt-out facts, for ONE number, through the one definition of the merge. MOVED
 * here from `resend.ts` at GTC-387 (not copied): the door and the box read it from one place.
 * Account-wide since [[GTC-288]]; a number on TNZ's opt-out list is the guest's own STOP ([[GTC-258]]).
 */
export async function optedOutOf(
  db: Db,
  person: { smsOptedOut: boolean; phoneNumber: string | null },
  textBlocks: ReadonlyMap<string, TextBlockFact>
): Promise<boolean> {
  if (!person.phoneNumber) return person.smsOptedOut;
  const rows = await db.smsOptOut.findMany({
    where: { phoneNumber: person.phoneNumber, ...SMS_OPT_OUT_IN_FORCE },
    select: { phoneNumber: true },
  });
  const numbers = new Set(rows.map((r) => r.phoneNumber));
  if (tnzOptedOutOf(person.phoneNumber, textBlocks)) numbers.add(person.phoneNumber);
  return smsOptedOutFact(person, numbers);
}

/** The person as the box finds them. */
export interface ContactSubject {
  eventId: string;
  hostId: string;
  personEventId: string;
  personId: string;
  role: string;
  householdId: string | null;
  householdRole: string | null;
  email: string | null;
  phoneNumber: string | null;
  smsOptedOut: boolean;
}

export type ContactCheck =
  | {
      ok: true;
      /** Only the fields that change. */
      writes: { email?: string; phoneNumber?: string };
      /** The invitation's channel once saved — the chooser's answer. */
      channel: Channel;
      /** The number a TEXT invitation would go to. */
      number: string | null;
    }
  | { ok: false; status: 400 | 409; code: ContactRefusalCode };

const refuse = (status: 400 | 409, code: ContactRefusalCode) =>
  ({ ok: false, status, code }) as const;

/** The chooser's ask refusal, as the box words it. */
function boxRefusalFor(why: string): ContactRefusalCode {
  if (why === 'EMAIL_OPTED_OUT' || why === 'EMAIL_REPORTED') return 'EMAIL_OPTED_OUT';
  if (/SMS_OPTED_OUT$/.test(why)) return 'PHONE_OPTED_OUT';
  if (why === 'EMAIL_BLOCKED') return 'ADDRESS_BLOCKED';
  if (why === 'PHONE_UNUSABLE') return 'PHONE_UNUSABLE';
  return 'NOTHING_TO_SAVE';
}

/** The facts the chooser needs for one person, with this email and this number. */
async function chooserPerson(
  db: Db,
  subject: ContactSubject,
  email: string | null,
  phoneNumber: string | null,
  standingOptOut: boolean
): Promise<ChooserPerson> {
  const textBlocks = await listTextBlocks(db, [phoneNumber]);
  const numberOut = await optedOutOf(db, { smsOptedOut: false, phoneNumber }, textBlocks);
  const block = emailBlockStateOf(email, subject.eventId, await listEmailBlocks(db, [email]));
  return {
    email,
    phoneNumber,
    smsOptedOut: standingOptOut || numberOut,
    emailOptedOut: (await getEmailOptOut(subject.personId, subject.eventId)) !== null,
    emailBlocked: block !== 'NONE',
    emailReported: block === 'REPORTED',
    numberDead: numberDeadOf(phoneNumber, textBlocks),
  };
}

/**
 * THE CHECK. Reads only; writes nothing. The order is the plan's: something changed (W14); an email
 * needs an "@" (W15, the door's "thinnest check that is true"); a mobile must read as a New Zealand
 * number (W17); then the chooser accepts or refuses each filled box; then the channel.
 */
export async function checkContactChange(
  db: Db,
  subject: ContactSubject,
  change: { email?: string | null; mobile?: string | null }
): Promise<ContactCheck> {
  const typedEmail = (change.email ?? '').trim();
  const typedMobile = (change.mobile ?? '').trim();
  const writes: { email?: string; phoneNumber?: string } = {};

  if (typedEmail && typedEmail !== (subject.email ?? '')) {
    if (!/^[^@\s]+@[^@\s]+$/.test(typedEmail)) return refuse(400, 'EMAIL_UNREADABLE');
    writes.email = typedEmail;
  }
  // The box starts with what Gather holds (Q5), in display form on the board: left as it was, it
  // is unchanged — even a number Gather can't text, which would not read as a New Zealand mobile.
  const heldMobile =
    !!subject.phoneNumber &&
    (typedMobile === subject.phoneNumber ||
      typedMobile === formatPhoneForDisplay(subject.phoneNumber));
  if (typedMobile && !heldMobile) {
    const number = normalizePhoneNumber(typedMobile);
    if (!number) return refuse(400, 'MOBILE_UNREADABLE');
    if (number !== subject.phoneNumber) writes.phoneNumber = number;
  }
  if (writes.email === undefined && writes.phoneNumber === undefined) {
    return refuse(400, 'NOTHING_TO_SAVE');
  }

  // The person's opt-out as it stands, carried onto any new number.
  const standing = await optedOutOf(
    db,
    { smsOptedOut: subject.smsOptedOut, phoneNumber: subject.phoneNumber },
    await listTextBlocks(db, [subject.phoneNumber])
  );
  const membership = (person: ChooserPerson): ChooserMembership => ({
    id: subject.personEventId,
    personId: subject.personId,
    role: subject.role,
    householdId: subject.householdId,
    householdRole: subject.householdRole,
    nudgeMark: null,
    holdsItems: true,
    person,
  });
  const route = (person: ChooserPerson) =>
    chooseAskRoute(membership(person), { hostId: subject.hostId, memberships: [], households: [] });

  if (writes.email !== undefined) {
    // The email box alone: would the invitation reach them by email at this address?
    const asked = route(await chooserPerson(db, subject, writes.email, null, standing));
    if (asked.kind !== 'DIRECT' || asked.channel !== 'EMAIL') {
      return refuse(409, asked.kind === 'HOST_LIST' ? boxRefusalFor(asked.why) : 'ADDRESS_BLOCKED');
    }
  }
  if (writes.phoneNumber !== undefined) {
    // The mobile box alone: may this number be texted? Zone 7 and the blocks, in the chooser.
    const reach = textAskReachOf(
      await chooserPerson(db, subject, null, writes.phoneNumber, standing)
    );
    if (!reach.ok) return refuse(409, boxRefusalFor(reach.why));
  }

  const email = writes.email ?? subject.email;
  const number = writes.phoneNumber ?? subject.phoneNumber;
  const after = route(await chooserPerson(db, subject, email, number, standing));
  if (after.kind !== 'DIRECT') {
    return refuse(409, after.kind === 'HOST_LIST' ? boxRefusalFor(after.why) : 'NOTHING_TO_SAVE');
  }
  return { ok: true, writes, channel: after.channel, number };
}

/** THE WRITE, on the caller's transaction: the person's fields and one ledger line per field. */
export async function writeContactChange(
  tx: Prisma.TransactionClient,
  subject: ContactSubject,
  writes: { email?: string; phoneNumber?: string },
  actor: LedgerActor
): Promise<void> {
  await tx.person.update({ where: { id: subject.personId }, data: writes });
  /*
   * [[GTC-189]] slice 7b, founder answer 5 — a contact change is versioned, and never asks a why
   * (`whyTrigger` answers null for EDIT_PERSON_CONTACT). The same entry the door has always written.
   */
  await recordChange(tx, {
    eventId: subject.eventId,
    actor,
    changes: [
      ...(writes.email !== undefined
        ? [
            {
              action: 'EDIT_PERSON_CONTACT' as const,
              targetType: 'PersonEvent' as const,
              targetId: subject.personEventId,
              field: 'email',
              before: subject.email,
              after: writes.email,
            },
          ]
        : []),
      ...(writes.phoneNumber !== undefined
        ? [
            {
              action: 'EDIT_PERSON_CONTACT' as const,
              targetType: 'PersonEvent' as const,
              targetId: subject.personEventId,
              field: 'phoneNumber',
              before: subject.phoneNumber,
              after: writes.phoneNumber,
            },
          ]
        : []),
    ],
  });
}

/**
 * THE PRE-FLIGHT'S SAVE (item 67) — before the press, save only (nothing is sent before Send). Host
 * and co-host, through the pre-flight's channel route (Q8). A child, the host and somebody not on
 * the event are refused (W24); after the press the board's door is where it is fixed (W23).
 */
export async function saveContactBeforePress(
  db: PrismaClient,
  args: {
    eventId: string;
    personEventId: string;
    email?: string | null;
    mobile?: string | null;
    actor: LedgerActor;
  }
): Promise<{ ok: true } | { ok: false; status: 400 | 404 | 409; code: ContactRouteRefusal }> {
  const event = await db.event.findUnique({
    where: { id: args.eventId },
    select: { hostId: true, sentAt: true },
  });
  const membership = await db.personEvent.findUnique({
    where: { id: args.personEventId },
    select: {
      id: true,
      eventId: true,
      personId: true,
      role: true,
      householdId: true,
      householdRole: true,
      person: { select: { email: true, phoneNumber: true, smsOptedOut: true } },
    },
  });
  if (!event || !membership || membership.eventId !== args.eventId) {
    return { ok: false, status: 404, code: 'NOT_FOR_THEM' };
  }
  if (event.sentAt) return { ok: false, status: 409, code: 'INVITATIONS_GONE' };
  if (
    isChildMembership(membership.householdRole) ||
    isHostMembership({ personId: membership.personId, role: membership.role }, event.hostId)
  ) {
    return { ok: false, status: 409, code: 'NOT_FOR_THEM' };
  }
  const subject: ContactSubject = {
    eventId: args.eventId,
    hostId: event.hostId,
    personEventId: membership.id,
    personId: membership.personId,
    role: membership.role,
    householdId: membership.householdId,
    householdRole: membership.householdRole,
    email: membership.person.email,
    phoneNumber: membership.person.phoneNumber,
    smsOptedOut: membership.person.smsOptedOut,
  };
  const check = await checkContactChange(db, subject, { email: args.email, mobile: args.mobile });
  if (!check.ok) return check;
  await db.$transaction((tx) => writeContactChange(tx, subject, check.writes, args.actor));
  return { ok: true };
}
