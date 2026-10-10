/**
 * [[GTC-264]] Phase 3 — where a parsed TNZ delivery report is STORED; and since [[GTC-258]], APPLIED.
 *
 * The third step after the envelope parse (`./tnz-webhook-envelope.ts`) and the delivery
 * interpreter (`./tnz-delivery-contract.ts`). It writes `SmsDeliveryReport`, and — GTC-258 — the
 * outcome onto the send's own record (`OutboundMessage.deliveryState`, through `./text-outcome.ts`)
 * and, for a number TNZ said is dead or on their opt-out list, a `TextBlock`. It never reads a
 * reply, and NEVER touches the opt-out table or the person's flag (Zone 7): a delivery report is not
 * licence to write either (`tnz-delivery-contract.ts`).
 *
 * THREE DECISIONS.
 *
 * 1. IDEMPOTENCY LIVES HERE, ON A NATURAL KEY, NOT IN A CONSTRAINT. TNZ retry a failed webhook
 *    every five minutes for up to 24 hours, so the same report arriving twice is expected. The
 *    key is (providerMessageId, destination, status, result): a retry repeats all four, and a
 *    PENDING followed by a SUCCESS differs in two, so it is two rows, as it should be. Two
 *    identical retries racing could still both insert; that is a duplicate row, which the model
 *    comment chose over silent loss, and a reader can collapse it.
 *
 * 2. A REPORT THAT MATCHES NO SEND IS STORED, NOT THROWN. ⚠ [[GTC-258]]: THE JOIN IS THE SEND RECORD.
 *    It was the `NUDGE_SENT_AUTO` InviteEvent's `metadata.messageId`, because that row was the only
 *    store holding every text's MessageID. Every text path now records its send on an
 *    `OutboundMessage` (plan ruling Q5), so the report finds the TEXT row whose `providerMessageId`
 *    is its MessageID — an indexed column, not a JSON path. `inviteEventId` is written null from
 *    GTC-258 on: it is the record of rows before it. A send can still be accepted with no id at all,
 *    and a report can arrive for something we never recorded: both are rows with null links.
 *
 * 3. ⚠ [[GTC-258]] note 7 — A REPORT CAN ARRIVE BEFORE THE SEND'S RECORD HOLDS ITS MESSAGEID. TNZ are
 *    fast, and `providerMessageId` is written only after `sendSms` returns. So BOTH SIDES WRITE, COMMIT,
 *    AND THEN READ: the webhook stores the report and then looks for the record (`linkAndApply`); the
 *    sender writes the MessageID and then looks for unmatched reports (`applyStoredTnzReports`).
 *    Whatever the interleaving, the side that reads second sees the other's commit, so no report is
 *    missed. The number's block needs no join: it is written from the report's own Destination when
 *    that is E.164, and from the record's `destination` once matched.
 */

import type { PrismaClient } from '@prisma/client';
import {
  interpretTnzResult,
  type ParsedTnzDeliveryReport,
  type TnzResultVerdict,
} from './tnz-delivery-contract';
import { applyTextOutcome, textOutcomeOf, TEXT_OUTCOME_BLOCKS } from './text-outcome';
import { recordTextBlock } from '@/lib/eligibility/text-block';
import { isE164 } from '@/lib/phone';

export type TnzDeliveryRecordResult =
  | {
      readonly recorded: true;
      readonly id: string;
      readonly matched: boolean;
      /** Never payload content, and never the destination number. */
      readonly warnings: readonly string[];
    }
  | { readonly recorded: false; readonly duplicateOf: string };

export async function recordTnzDeliveryReport(
  db: PrismaClient,
  report: ParsedTnzDeliveryReport
): Promise<TnzDeliveryRecordResult> {
  const existing = await db.smsDeliveryReport.findFirst({
    where: {
      // [[GTC-290]]: a report is a duplicate of one from the same source. The status poll stores its
      // own rows ('tnz-poll'), and a webhook report after a poll must still be kept as its own.
      provider: report.provider,
      providerMessageId: report.providerMessageId,
      destination: report.destination,
      status: report.status,
      result: report.result,
    },
    select: { id: true, eventId: true },
  });
  if (existing) {
    // A retry of a report whose first delivery was stored but not applied (the step after the
    // store failed, and TNZ retried on the 500): apply it now. Applying is idempotent.
    if (existing.eventId === null) await linkAndApply(db, existing.id);
    return { recorded: false, duplicateOf: existing.id };
  }

  const row = await db.smsDeliveryReport.create({
    data: {
      provider: report.provider,
      providerMessageId: report.providerMessageId,
      destination: report.destination,
      status: report.status,
      result: report.result,
      detail: report.detail,
      providerJobNumber: report.providerJobNumber,
      providerSentAt: report.providerSentAt,
      inviteEventId: null,
    },
    select: { id: true },
  });

  const applied = await linkAndApply(db, row.id);
  return { recorded: true, id: row.id, matched: applied.matched, warnings: applied.warnings };
}

/** The verdict a stored report carries, re-read from its two verbatim fields. */
function verdictOf(row: { status: string; result: string | null }): TnzResultVerdict {
  return interpretTnzResult(row.status, row.result);
}

/**
 * LINK ONE STORED REPORT TO ITS SEND, AND APPLY WHAT IT SAYS — in one transaction, so the link, the
 * outcome and the block land together or not at all.
 *
 * With no send record yet, the block is still written when the report names an E.164 number: "not
 * texted again" must not wait for a join the record may not be able to make for seconds yet.
 */
async function linkAndApply(
  db: PrismaClient,
  reportId: string
): Promise<{ matched: boolean; warnings: string[] }> {
  return db.$transaction(async (tx) => {
    const report = await tx.smsDeliveryReport.findUniqueOrThrow({ where: { id: reportId } });
    const outcome = textOutcomeOf(verdictOf(report));
    const block = outcome ? TEXT_OUTCOME_BLOCKS[outcome] : null;
    const send = await tx.outboundMessage.findFirst({
      where: { providerMessageId: report.providerMessageId, channel: 'TEXT' },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        eventId: true,
        destination: true,
        personEvent: { select: { personId: true } },
      },
    });

    const warnings: string[] = [];
    if (!send) {
      if (block && isE164(report.destination)) {
        await recordTextBlock(tx, {
          phoneNumber: report.destination,
          reason: block,
          outboundMessageId: null,
          eventId: null,
        });
      }
      return { matched: false, warnings };
    }

    if (send.destination && send.destination !== report.destination) {
      warnings.push(
        'the report’s Destination differs from the number its send recorded; the row is linked by MessageID regardless.'
      );
    }
    await tx.smsDeliveryReport.update({
      where: { id: reportId },
      data: { eventId: send.eventId, personId: send.personEvent.personId },
    });
    if (outcome) {
      await applyTextOutcome(tx, {
        outboundMessageId: send.id,
        outcome,
        providerLastEvent: report.result ?? report.status,
      });
    }
    const number = send.destination ?? (isE164(report.destination) ? report.destination : null);
    if (block && number) {
      await recordTextBlock(tx, {
        phoneNumber: number,
        reason: block,
        outboundMessageId: send.id,
        eventId: send.eventId,
      });
    }
    return { matched: true, warnings };
  });
}

/**
 * [[GTC-290]] — A FINISHED RECIPIENT READ BY THE STATUS POLL, stored and applied the webhook's way.
 *
 * Plan ruling Q10: the poll's answer is an `SmsDeliveryReport` row with provider `'tnz-poll'`, so a
 * polled result is told from a pushed one by the row itself. It is then linked and applied by
 * `linkAndApply` above — the same outcome, the same number block, the same transaction, Zone 7
 * untouched — so the two channels cannot drift apart. TNZ's GET carries no `Detail`.
 */
export async function recordPolledTnzResult(
  db: PrismaClient,
  args: {
    providerMessageId: string;
    destination: string;
    status: string;
    result: string | null;
    providerJobNumber: string | null;
    providerSentAt: Date | null;
  }
): Promise<{ id: string; matched: boolean }> {
  const row = await db.smsDeliveryReport.create({
    data: {
      provider: 'tnz-poll',
      providerMessageId: args.providerMessageId,
      destination: args.destination,
      status: args.status,
      result: args.result,
      detail: null,
      providerJobNumber: args.providerJobNumber,
      providerSentAt: args.providerSentAt,
      inviteEventId: null,
    },
    select: { id: true },
  });
  const applied = await linkAndApply(db, row.id);
  return { id: row.id, matched: applied.matched };
}

/**
 * [[GTC-258]] note 7 — THE CATCH-UP. Called once a TEXT record's `providerMessageId` is written (by
 * `recordAcceptance` in the dispatcher and by `closeTextSend`), AFTER that write has committed. It
 * links and applies every report for that MessageID that arrived first and was stored unmatched, in
 * the order they arrived. Returns how many it linked.
 */
export async function applyStoredTnzReports(
  db: PrismaClient,
  providerMessageId: string
): Promise<number> {
  const waiting = await db.smsDeliveryReport.findMany({
    where: { providerMessageId, eventId: null },
    orderBy: { receivedAt: 'asc' },
    select: { id: true },
  });
  let linked = 0;
  for (const r of waiting) {
    if ((await linkAndApply(db, r.id)).matched) linked++;
  }
  return linked;
}
