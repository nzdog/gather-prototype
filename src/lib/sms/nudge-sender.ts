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
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
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
    // GTC-178 (E1, phase 4): STAMP THE MEMBERSHIP, NOT THE PERSON.
    //
    // This wrote `Person.nudge24hSentAt`/`nudge48hSentAt`, which are global per person.
    // One person in two live events, nudged for event A, went permanently silent for
    // event B — a different host, a different occasion, its own send. Nobody was nudged
    // twice; somebody was never nudged at all. `personEventId` is carried on the
    // candidate precisely so this write does not have to re-derive the row.
    //
    // Stamped ONLY on success, unchanged: a send that failed leaves no stamp and the
    // next tick retries it. That is also why the write side is asserted structurally in
    // tests/nudge-dedup-scope-test.ts — with no SMS provider configured `result.success`
    // is never true locally, so no runtime assertion could reach this branch.
    const updateData =
      nudgeType === '24h' ? { firstNudgeSentAt: new Date() } : { secondNudgeSentAt: new Date() };

    await prisma.personEvent.update({
      where: { id: candidate.personEventId },
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
