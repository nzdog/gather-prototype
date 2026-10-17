/**
 * [[GTC-288]] — where a parsed reply is STORED: a STOP, a START, or a kept reply.
 *
 * The step after `./tnz-reply-contract.ts`, as `./tnz-delivery-record.ts` follows the delivery
 * interpreter. THIS IS THE REPLY PATH'S ONLY WRITER OF DO-NOT-TOUCH ZONE 7 (`SmsOptOut` and
 * `Person.smsOptedOut`), released by the founder's rulings of 2026-09-12 and 2026-10-01 and the
 * plan's (all verbatim in GTC-288).
 *
 * ── A STOP — account-wide, on the number, always ─────────────────────────────────────────────
 * 2026-09-12: *"an opt-out is account-wide, on the phone number, not per host. A STOP that matches
 * no message is still recorded, with its link to a person and event marked unresolved."* So, in one
 * transaction: a row in force on the sender's number; the flag on EVERY Person holding that number,
 * under every host (plan ruling D7); and, when the MessageID resolves, the link and one
 * `SMS_OPT_OUT_RECEIVED` on that event. A STOP while one is already in force writes nothing (D9),
 * so its times never move and the replay never re-fires.
 *
 * ── A START — undoes it for every host, and keeps the history ────────────────────────────────
 * 2026-10-01 Q4 and plan ruling D2: every row in force for the number is CLOSED (`optedInAt`) and
 * kept, and every flag on that number is cleared. Nothing in force: nothing written.
 *
 * ── Any other reply — kept only when TNZ's MessageID ties it to a guest and an event ──────────
 * 2026-10-01 Q1/Q2, narrowed at the plan: *"keep a reply only when you can tie it to a guest and an
 * event by MessageID … An unmatched reply is not kept."* Never a guess: a wrong guess would show one
 * host's guest's words to another host.
 *
 * ── THE JOIN — MessageID to the text's send record ─────────────────────────────────────────────
 * ⚠ MOVED BY [[GTC-258]] (plan ruling Q5, 2026-10-02). It was the `NUDGE_SENT_AUTO` InviteEvent
 * `sendSms` wrote, the only store that then held every text's id (plan ruling D6). Every text path
 * now records its send on an `OutboundMessage` with `providerMessageId` and `destination`, and
 * `sendSms` writes no `NUDGE_SENT_AUTO`; so the join is the TEXT row, the same lookup
 * `recordTnzDeliveryReport` makes. The `inviteEventId` pointers below are written null from then on.
 * No newest-wins fallback by number (D5). A link is made only when the send went to the number the
 * reply came from — TNZ contradicting itself is unresolved, never resolved by us.
 *
 * ── RETRIES ─────────────────────────────────────────────────────────────────────────────────────
 * TNZ retry any non-2xx every five minutes for 24 hours. Each write set is one transaction, so a
 * retry only follows a write that did not happen. A duplicate DELIVERY is caught on TNZ's
 * `ReceivedID`: a STOP's on `providerReceivedId`, a START's on `optedInReceivedId` (so a START
 * delivered twice cannot close a later STOP's row), a reply's on `TextReply.providerReceivedId` —
 * or, when TNZ send it blank, on (MessageID, words). Idempotency lives here, on an index, not in a
 * unique constraint: GTC-264's reasoning for `SmsDeliveryReport`.
 *
 * ⚠ NOTHING HERE LOGS. The route logs the outcome and TNZ's MessageID, never words or a number.
 */

import type { PrismaClient } from '@prisma/client';
import type { ParsedTnzReply } from './tnz-reply-contract';
import { SMS_OPT_OUT_IN_FORCE } from './opt-out-service';

/** How an opt-out's link was made — `SmsOptOut.attribution`. NULL on a row from before GTC-288. */
export type SmsOptOutAttribution = 'MESSAGE_ID' | 'UNRESOLVED' | 'MANUAL';

/** Why a reply was acknowledged with nothing written. Safe to log: no content. */
export type TnzReplyNotRecorded =
  | 'ALREADY_OPTED_OUT'
  | 'NOTHING_IN_FORCE'
  | 'EMPTY'
  | 'NO_MATCHING_TEXT'
  | 'NO_PERSON'
  | 'NUMBER_DISAGREES';

export type TnzReplyRecordResult =
  | { readonly outcome: 'OPTED_OUT'; readonly recorded: true; readonly linked: boolean }
  | { readonly outcome: 'OPTED_IN'; readonly recorded: true; readonly closed: number }
  | { readonly outcome: 'KEPT'; readonly recorded: true }
  | { readonly outcome: 'DUPLICATE'; readonly recorded: false }
  | {
      readonly outcome: 'NOT_RECORDED';
      readonly recorded: false;
      readonly why: TnzReplyNotRecorded;
    };

interface ResolvedSend {
  /** [[GTC-258]]: always null — the send is an `OutboundMessage` now, not an InviteEvent. */
  readonly inviteEventId: null;
  readonly eventId: string;
  readonly personId: string | null;
  readonly sentTo: string | null;
}

async function findSend(db: PrismaClient, messageId: string | null): Promise<ResolvedSend | null> {
  if (messageId === null) return null;
  const send = await db.outboundMessage.findFirst({
    where: { providerMessageId: messageId, channel: 'TEXT' },
    orderBy: { createdAt: 'desc' },
    select: { eventId: true, destination: true, personEvent: { select: { personId: true } } },
  });
  if (!send) return null;
  return {
    inviteEventId: null,
    eventId: send.eventId,
    personId: send.personEvent.personId,
    sentTo: send.destination,
  };
}

export async function recordTnzReply(
  db: PrismaClient,
  reply: ParsedTnzReply
): Promise<TnzReplyRecordResult> {
  if (reply.intent === 'OPT_OUT') return recordOptOut(db, reply);
  if (reply.intent === 'OPT_IN') return recordOptIn(db, reply);
  return keepReply(db, reply);
}

async function recordOptOut(
  db: PrismaClient,
  reply: ParsedTnzReply
): Promise<TnzReplyRecordResult> {
  const phoneNumber = reply.sender!; // the contract refuses a STOP without one
  if (reply.providerReceivedId !== null) {
    const seen = await db.smsOptOut.findFirst({
      where: { providerReceivedId: reply.providerReceivedId },
      select: { id: true },
    });
    if (seen) return { outcome: 'DUPLICATE', recorded: false };
  }
  const inForce = await db.smsOptOut.findFirst({
    where: { phoneNumber, ...SMS_OPT_OUT_IN_FORCE },
    select: { id: true },
  });
  if (inForce) return { outcome: 'NOT_RECORDED', recorded: false, why: 'ALREADY_OPTED_OUT' };

  const send = await findSend(db, reply.providerMessageId);
  const link = send && send.personId !== null && send.sentTo === phoneNumber ? send : null;
  const attribution: SmsOptOutAttribution = link ? 'MESSAGE_ID' : 'UNRESOLVED';

  await db.$transaction(async (tx) => {
    await tx.smsOptOut.create({
      data: {
        phoneNumber,
        rawMessage: reply.body,
        attribution,
        providerMessageId: reply.providerMessageId,
        providerReceivedId: reply.providerReceivedId,
        eventId: link?.eventId ?? null,
        personId: link?.personId ?? null,
        inviteEventId: link?.inviteEventId ?? null,
      },
    });
    // Every Person holding the number, under every host. One already flagged keeps its time.
    await tx.person.updateMany({
      where: { phoneNumber, smsOptedOut: false },
      data: { smsOptedOut: true, smsOptedOutAt: new Date() },
    });
    if (link) {
      // The words and the number stay off the ledger (plan ruling D12): they are on the row.
      await tx.inviteEvent.create({
        data: {
          eventId: link.eventId,
          personId: link.personId,
          type: 'SMS_OPT_OUT_RECEIVED',
          metadata: {
            keyword: reply.keyword,
            providerMessageId: reply.providerMessageId,
            providerReceivedId: reply.providerReceivedId,
            attribution,
          },
        },
      });
    }
  });
  return { outcome: 'OPTED_OUT', recorded: true, linked: link !== null };
}

async function recordOptIn(db: PrismaClient, reply: ParsedTnzReply): Promise<TnzReplyRecordResult> {
  const phoneNumber = reply.sender!; // the contract refuses a START without one
  if (reply.providerReceivedId !== null) {
    const seen = await db.smsOptOut.findFirst({
      where: { optedInReceivedId: reply.providerReceivedId },
      select: { id: true },
    });
    if (seen) return { outcome: 'DUPLICATE', recorded: false };
  }
  const closed = await db.$transaction(async (tx) => {
    const rows = await tx.smsOptOut.updateMany({
      where: { phoneNumber, ...SMS_OPT_OUT_IN_FORCE },
      data: { optedInAt: new Date(), optedInReceivedId: reply.providerReceivedId },
    });
    if (rows.count > 0) {
      await tx.person.updateMany({
        where: { phoneNumber },
        data: { smsOptedOut: false, smsOptedOutAt: null },
      });
    }
    return rows.count;
  });
  if (closed === 0) return { outcome: 'NOT_RECORDED', recorded: false, why: 'NOTHING_IN_FORCE' };
  return { outcome: 'OPTED_IN', recorded: true, closed };
}

async function keepReply(db: PrismaClient, reply: ParsedTnzReply): Promise<TnzReplyRecordResult> {
  if (reply.body.trim() === '') return { outcome: 'NOT_RECORDED', recorded: false, why: 'EMPTY' };
  const send = await findSend(db, reply.providerMessageId);
  if (!send) return { outcome: 'NOT_RECORDED', recorded: false, why: 'NO_MATCHING_TEXT' };
  if (send.personId === null) return { outcome: 'NOT_RECORDED', recorded: false, why: 'NO_PERSON' };
  if (reply.sender === null || send.sentTo !== reply.sender)
    return { outcome: 'NOT_RECORDED', recorded: false, why: 'NUMBER_DISAGREES' };

  const seen = await db.textReply.findFirst({
    where:
      reply.providerReceivedId !== null
        ? { providerReceivedId: reply.providerReceivedId }
        : {
            providerMessageId: reply.providerMessageId!,
            body: reply.body,
            providerReceivedId: null,
          },
    select: { id: true },
  });
  if (seen) return { outcome: 'DUPLICATE', recorded: false };

  await db.textReply.create({
    data: {
      provider: 'tnz',
      providerMessageId: reply.providerMessageId!,
      providerReceivedId: reply.providerReceivedId,
      body: reply.body,
      eventId: send.eventId,
      personId: send.personId,
      inviteEventId: send.inviteEventId,
    },
  });
  return { outcome: 'KEPT', recorded: true };
}
