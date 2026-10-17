import type { OutboundWithheldWhy } from '@/lib/press/dispatch';
import type { PrismaClient } from '@prisma/client';
import type { SendSmsResult } from './send-sms';
import { blockedToWithheld } from '@/lib/press/dispatch';
import { applyStoredTnzReports } from './tnz-delivery-record';
import { TEXT_DELIVERY_STATE_MEANS } from '@/lib/glance/delivery-fact';
import type { TextOutcomeKind } from './text-outcome';

/**
 * [[GTC-258]] — THE SEND RECORD FOR THE THREE TEXT PATHS OUTSIDE THE DISPATCHER, AND THE ONE RETRY.
 *
 * Plan ruling Q5 (2026-10-02): the "please decide" follow-up, the thank-you and the host's own nudge
 * record each text on an `OutboundMessage` of their own kind, as the dispatcher's ask and chase do.
 * It is the record TNZ's report and a guest's reply join to (by MessageID), and the one that can carry
 * what TNZ reported. `sendSms` records nothing of its own any more.
 *
 * ⚠ THESE ROWS ARE RECORDS, NOT QUEUE ENTRIES. Each is born with `attemptedAt` set, so the drain —
 * which takes only `attemptedAt IS NULL`, or a due `nextAttemptAt` — never selects one. The three
 * doors that end a row are the dispatcher's own: accepted, withheld, or rejected.
 */

/**
 * Open the record just before `sendSms` runs. Null when the person holds no membership row on the
 * event: then nothing is written, and a later report is stored unmatched, as before this ticket.
 */
export async function openTextSend(
  db: PrismaClient,
  args: {
    eventId: string;
    personId: string;
    kind: 'DECIDE_BY_FOLLOWUP' | 'THANK_YOU' | 'HOST_NUDGE';
    destination: string | null;
  }
): Promise<string | null> {
  const membership = await db.personEvent.findUnique({
    where: { personId_eventId: { personId: args.personId, eventId: args.eventId } },
    select: { id: true },
  });
  if (!membership) return null;
  const now = new Date();
  const row = await db.outboundMessage.create({
    data: {
      eventId: args.eventId,
      personEventId: membership.id,
      kind: args.kind,
      channel: 'TEXT',
      attemptedAt: now,
      attemptCount: 1,
      destination: args.destination,
    },
    select: { id: true },
  });
  return row.id;
}

/**
 * End the record from `sendSms`'s answer — the dispatcher's three doors. Accepted: the provider and
 * its MessageID, and then any report that arrived first (note 7). A refusal before any provider call
 * is a withholding with `blockedToWithheld`'s code; a provider refusal is a rejection, in its words.
 */
export async function closeTextSend(
  db: PrismaClient,
  id: string | null,
  result: Pick<SendSmsResult, 'success' | 'messageId' | 'provider' | 'blocked' | 'error'>
): Promise<void> {
  if (!id) return;
  if (result.success) {
    await db.outboundMessage.update({
      where: { id },
      data: {
        acceptedAt: new Date(),
        provider: result.provider ?? 'tnz',
        providerMessageId: result.messageId ?? null,
      },
    });
    if ((result.provider ?? 'tnz') === 'tnz' && result.messageId) {
      await applyStoredTnzReports(db, result.messageId);
    }
    return;
  }
  const why = result.blocked ? blockedToWithheld(result.blocked) : null;
  if (why) {
    await db.outboundMessage.update({
      where: { id },
      data: { withheldAt: new Date(), withheldWhy: why },
    });
    return;
  }
  await db.outboundMessage.update({
    where: { id },
    data: {
      rejectedAt: new Date(),
      provider: 'tnz',
      providerError: result.error ?? 'Unknown SMS error',
    },
  });
}

// ─── The one retry ────────────────────────────────────────────────────────────────────────────

/**
 * How long after Gather recorded a text's failure a retry is still looked for. Founder-approved
 * 2026-10-02 as "texts accepted in the last 48 hours"; ⚠ [[GTC-290]] plan ruling Q4 moved it from
 * acceptance to when the failure was recorded (`deliveryCheckedAt`), because the status poll records
 * a credit hold's failure 48 hours after acceptance. For a webhook report the two are minutes apart.
 */
export const TEXT_RETRY_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * CLAIM THE RETRY FOR ONE FAILED TEXT, by inserting its EMAIL row — `retryOfId` is unique, so a second
 * claim for the same text fails, and two overlapping runs cannot both send. Null when another run
 * holds it. With a `why`, the row is born withheld: the retry is spent and visible, and nothing sends.
 */
export async function claimTextRetry(
  db: PrismaClient,
  failed: {
    id: string;
    eventId: string;
    personEventId: string;
    kind: 'DECIDE_BY_FOLLOWUP' | 'THANK_YOU';
  },
  why?: OutboundWithheldWhy
): Promise<string | null> {
  const now = new Date();
  try {
    const row = await db.outboundMessage.create({
      data: {
        eventId: failed.eventId,
        personEventId: failed.personEventId,
        kind: failed.kind,
        channel: 'EMAIL',
        retryOfId: failed.id,
        ...(why ? { withheldAt: now, withheldWhy: why } : { attemptedAt: now, attemptCount: 1 }),
      },
      select: { id: true },
    });
    return row.id;
  } catch (err) {
    // P2002: the unique on retryOfId — another run claimed this retry first.
    if ((err as { code?: string }).code === 'P2002') return null;
    throw err;
  }
}

/** End a claimed retry from the email sender's answer: accepted, or refused in Resend's words. */
export async function closeTextRetry(
  db: PrismaClient,
  id: string,
  result: {
    success: boolean;
    providerMessageId?: string;
    error?: string;
    providerErrorCode?: string;
  }
): Promise<void> {
  await db.outboundMessage.update({
    where: { id },
    data: result.success
      ? {
          acceptedAt: new Date(),
          provider: 'resend',
          providerMessageId: result.providerMessageId ?? null,
        }
      : {
          rejectedAt: new Date(),
          provider: 'resend',
          providerError: result.error ?? 'Unknown Resend error',
          providerErrorCode: result.providerErrorCode ? result.providerErrorCode : null,
        },
  });
}

// ─── The person modal's reading ───────────────────────────────────────────────────────────────

/**
 * [[GTC-258]] — DID TNZ REPORT THE LATEST TEXT OF EACH KIND FAILED, for one membership? The plan
 * page's person modal reads it to say a reminder or a nudge "didn't arrive" (W5, W6) where it used to
 * say "sent". Failed means what the board means by it: `TEXT_DELIVERY_STATE_MEANS` NOT_DELIVERED.
 */
export async function readTextFailures(
  db: PrismaClient,
  personEventId: string
): Promise<{ firstReminder: boolean; secondReminder: boolean; hostNudge: boolean }> {
  const rows = await db.outboundMessage.findMany({
    where: {
      personEventId,
      channel: 'TEXT',
      kind: { in: ['CHASE_FIRST', 'CHASE_SECOND', 'HOST_NUDGE'] },
    },
    orderBy: { createdAt: 'desc' },
    select: { kind: true, deliveryState: true },
  });
  const failed = (kind: string) => {
    const latest = rows.find((r) => r.kind === kind);
    const state = latest?.deliveryState as TextOutcomeKind | null | undefined;
    return !!state && TEXT_DELIVERY_STATE_MEANS[state] === 'NOT_DELIVERED';
  };
  return {
    firstReminder: failed('CHASE_FIRST'),
    secondReminder: failed('CHASE_SECOND'),
    hostNudge: failed('HOST_NUDGE'),
  };
}
