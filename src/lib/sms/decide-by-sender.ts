import { prisma } from '@/lib/prisma';
import { sendSms } from '@/lib/sms/send-sms';
import { isQuietHours, getMinutesUntilQuietEnd } from '@/lib/sms/quiet-hours';
import { logInviteEvent } from '@/lib/invite-events';
import {
  getDecideByFollowupMessage,
  formatDecideByDay,
  getMessageInfo,
} from '@/lib/sms/nudge-templates';
import type { DecideByFollowupCandidate } from '@/lib/sms/decide-by-eligibility';

/**
 * GTC-175 (D2) — sending the maybe's one follow-up.
 *
 * Every send goes through `sendSms`, never TNZ or Twilio directly. That is not tidiness:
 * `sendSms` re-checks opt-out before the provider config (Do-Not-Touch zone 7), routes
 * +64/+61 to TNZ, and writes the `NUDGE_SENT_AUTO` InviteEvent that the inbound STOP
 * handler later uses to work out WHICH HOST a guest is opting out from
 * (sms/inbound/route.ts:47-54). A bespoke send path would silently break opt-out
 * attribution.
 */

export interface DecideByFollowupResult {
  personId: string;
  personName: string;
  eventId: string;
  assignmentIds: string[];
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send the follow-up to one candidate and record it.
 *
 * THE STAMP IS WRITTEN ONLY ON SUCCESS, and it is written for EVERY assignment collapsed
 * into the message — not just the one the copy names. Stamping only the named item would
 * leave its siblings looking un-followed-up, and the next tick would text the same person
 * again about the same event.
 */
export async function sendDecideByFollowup(
  candidate: DecideByFollowupCandidate,
  now: Date = new Date()
): Promise<DecideByFollowupResult> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${baseUrl}/p/${candidate.participantToken}`;

  const message = getDecideByFollowupMessage({
    hostFirstName: candidate.hostName.split(' ')[0],
    itemName: candidate.itemName,
    decideByDay: formatDecideByDay(candidate.decideByAt, now),
    link,
  });

  const messageInfo = getMessageInfo(message);

  const result = await sendSms({
    to: candidate.phoneNumber,
    message,
    eventId: candidate.eventId,
    personId: candidate.personId,
    metadata: {
      type: 'decide_by_followup',
      itemName: candidate.itemName,
      decideByAt: candidate.decideByAt.toISOString(),
      assignmentCount: candidate.assignmentIds.length,
      messageLength: messageInfo.length,
      messageSegments: messageInfo.segments,
    },
  });

  const base = {
    personId: candidate.personId,
    personName: candidate.personName,
    eventId: candidate.eventId,
    assignmentIds: candidate.assignmentIds,
  };

  if (!result.success) {
    return { ...base, success: false, error: result.error || result.blocked };
  }

  await prisma.assignment.updateMany({
    where: { id: { in: candidate.assignmentIds } },
    data: { decideByFollowupSentAt: now },
  });

  return { ...base, success: true, messageId: result.messageId };
}

/**
 * Process every due follow-up.
 *
 * Quiet hours are checked ONCE at the top of the batch and nothing is sent — the house
 * idiom (nudge-sender.ts:114-138, proxy-nudge-sender.ts:90-110, wrap-up.ts:222-234). The
 * deferral is implicit and durable: no stamp is written, so the next run after 08:05 NZ
 * picks these candidates up unchanged.
 *
 * This is also why the follow-up lead has a 12-hour floor (decide-by.ts): a quiet-hours
 * deferral can cost ~11 hours, and a shorter lead could push the message past the very
 * deadline it quotes.
 */
export async function processDecideByFollowups(
  candidates: DecideByFollowupCandidate[],
  now: Date = new Date()
): Promise<{
  sent: DecideByFollowupResult[];
  deferred: number;
  deferredUntilMinutes: number;
}> {
  if (candidates.length === 0) {
    return { sent: [], deferred: 0, deferredUntilMinutes: 0 };
  }

  if (isQuietHours(now)) {
    const minutesUntil = getMinutesUntilQuietEnd(now);

    for (const candidate of candidates) {
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.personId,
        type: 'NUDGE_DEFERRED_QUIET',
        metadata: {
          nudgeType: 'decide_by_followup',
          deferredMinutes: minutesUntil,
          phoneNumber: candidate.phoneNumber,
        },
      });
    }

    return { sent: [], deferred: candidates.length, deferredUntilMinutes: minutesUntil };
  }

  const results: DecideByFollowupResult[] = [];

  for (const candidate of candidates) {
    results.push(await sendDecideByFollowup(candidate, now));

    // Small delay between sends to avoid rate limiting — the house rate.
    await sleep(500);
  }

  return { sent: results, deferred: 0, deferredUntilMinutes: 0 };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
