import { prisma } from '@/lib/prisma';
import { sendSms } from './send-sms';
import { logInviteEvent } from '@/lib/invite-events';
import { isQuietHours, getMinutesUntilQuietEnd } from './quiet-hours';
import { get24hNudgeMessage, get48hNudgeMessage, getMessageInfo } from './nudge-templates';
import { NudgeCandidate } from './nudge-eligibility';

export interface NudgeSendResult {
  personId: string;
  personName: string;
  nudgeType: '24h' | '48h';
  success: boolean;
  messageId?: string;
  error?: string;
  deferred?: boolean;
  deferredUntil?: Date;
}

/**
 * Send a single nudge to a person
 */
export async function sendNudge(
  candidate: NudgeCandidate,
  nudgeType: '24h' | '48h'
): Promise<NudgeSendResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/p/${candidate.participantToken}`;

  // Get message template
  const message =
    nudgeType === '24h'
      ? get24hNudgeMessage({
          hostName: candidate.hostName,
          eventName: candidate.eventName,
          link,
        })
      : get48hNudgeMessage({
          hostName: candidate.hostName,
          eventName: candidate.eventName,
          link,
        });

  const messageInfo = getMessageInfo(message);

  // Send SMS
  const result = await sendSms({
    to: candidate.phoneNumber,
    message,
    eventId: candidate.eventId,
    personId: candidate.personId,
    metadata: {
      nudgeType,
      messageLength: messageInfo.length,
      messageSegments: messageInfo.segments,
    },
  });

  if (result.success) {
    // Update person record to mark nudge as sent
    const updateData =
      nudgeType === '24h' ? { nudge24hSentAt: new Date() } : { nudge48hSentAt: new Date() };

    await prisma.person.update({
      where: { id: candidate.personId },
      data: updateData,
    });

    return {
      personId: candidate.personId,
      personName: candidate.personName,
      nudgeType,
      success: true,
      messageId: result.messageId,
    };
  } else {
    return {
      personId: candidate.personId,
      personName: candidate.personName,
      nudgeType,
      success: false,
      error: result.error,
    };
  }
}

/**
 * Process all eligible nudges
 * Returns summary of what was sent/skipped
 */
export async function processNudges(candidates: {
  eligible24h: NudgeCandidate[];
  eligible48h: NudgeCandidate[];
}): Promise<{
  sent: NudgeSendResult[];
  deferred: number;
  deferredUntilMinutes: number;
}> {
  // Check quiet hours
  if (isQuietHours()) {
    const minutesUntil = getMinutesUntilQuietEnd();

    // Log deferral for each candidate
    const allCandidates = [...candidates.eligible24h, ...candidates.eligible48h];

    for (const candidate of allCandidates) {
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.personId,
        type: 'NUDGE_DEFERRED_QUIET',
        metadata: {
          deferredMinutes: minutesUntil,
          phoneNumber: candidate.phoneNumber,
        },
      });
    }

    console.log(
      `[Nudge] Quiet hours - deferring ${allCandidates.length} nudges for ${minutesUntil} minutes`
    );

    return {
      sent: [],
      deferred: allCandidates.length,
      deferredUntilMinutes: minutesUntil,
    };
  }

  const results: NudgeSendResult[] = [];

  // Send 24h nudges
  for (const candidate of candidates.eligible24h) {
    const result = await sendNudge(candidate, '24h');
    results.push(result);

    // Small delay between sends to avoid rate limiting
    await sleep(500);
  }

  // Send 48h nudges
  for (const candidate of candidates.eligible48h) {
    const result = await sendNudge(candidate, '48h');
    results.push(result);

    await sleep(500);
  }

  return {
    sent: results,
    deferred: 0,
    deferredUntilMinutes: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
