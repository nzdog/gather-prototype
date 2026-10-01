/**
 * [[GTC-264]] Phase 3 — where a parsed TNZ delivery report is STORED.
 *
 * The third step after the envelope parse (`./tnz-webhook-envelope.ts`) and the delivery
 * interpreter (`./tnz-delivery-contract.ts`). It writes `SmsDeliveryReport` and nothing else.
 * It never reads a reply, never touches `SmsOptOut` or `Person.smsOptedOut` (Zone 7), and
 * rewires no consumer: the stamps, the board and the chase read what they read before
 * ([[GTC-258]], the failed-text red and [[GTC-288]] come later).
 *
 * TWO DECISIONS, BOTH THE SCHEMA'S OWN REASONING CARRIED INTO THE HANDLER.
 *
 * 1. IDEMPOTENCY LIVES HERE, ON A NATURAL KEY, NOT IN A CONSTRAINT. TNZ retry a failed webhook
 *    every five minutes for up to 24 hours, so the same report arriving twice is expected. The
 *    key is (providerMessageId, destination, status, result): a retry repeats all four, and a
 *    PENDING followed by a SUCCESS differs in two, so it is two rows, as it should be. Two
 *    identical retries racing could still both insert; that is a duplicate row, which the model
 *    comment chose over silent loss, and a reader can collapse it.
 *
 * 2. A REPORT THAT MATCHES NO SEND IS STORED, NOT THROWN. The join is the `NUDGE_SENT_AUTO`
 *    InviteEvent whose `metadata.messageId` is the report's MessageID — `sendSms` writes that row
 *    on EVERY TNZ send, where `OutboundMessage` holds only the press's. A send can be accepted
 *    with no id at all (`sendViaTnz` treats a 2xx with an unparseable body as a success), and a
 *    report can arrive for something we never recorded. Both are rows with null links.
 *
 * The lookup is a sequential scan of a JSON path, measured in Phase 1 at ~5 ms on 50,000 rows.
 */

import type { PrismaClient } from '@prisma/client';
import type { ParsedTnzDeliveryReport } from './tnz-delivery-contract';

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
      providerMessageId: report.providerMessageId,
      destination: report.destination,
      status: report.status,
      result: report.result,
    },
    select: { id: true },
  });
  if (existing) return { recorded: false, duplicateOf: existing.id };

  const send = await db.inviteEvent.findFirst({
    where: {
      type: 'NUDGE_SENT_AUTO',
      metadata: { path: ['messageId'], equals: report.providerMessageId },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, eventId: true, personId: true, metadata: true },
  });

  const warnings: string[] = [];
  const sentTo = (send?.metadata as { phoneNumber?: unknown } | null)?.phoneNumber;
  if (send && typeof sentTo === 'string' && sentTo !== report.destination) {
    warnings.push(
      'the report’s Destination differs from the number its send recorded; the row is linked by MessageID regardless.'
    );
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
      inviteEventId: send?.id ?? null,
      eventId: send?.eventId ?? null,
      personId: send?.personId ?? null,
    },
    select: { id: true },
  });

  return { recorded: true, id: row.id, matched: send !== null, warnings };
}
