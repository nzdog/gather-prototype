import { prisma } from '@/lib/prisma';
import { sendSms } from './send-sms';
import { logInviteEvent } from '@/lib/invite-events';
import { isQuietHours, getMinutesUntilQuietEnd } from './quiet-hours';
import { getFirstNudgeMessage, getSecondNudgeMessage, getMessageInfo } from './nudge-templates';
import { NudgeCandidate } from './nudge-eligibility';

/**
 * GTC-178 (E1, phase 5): ORDINAL. Was `'24h' | '48h'`. The legs are days 4 and 7 now and
 * GTC-179 (E2) makes even that adjustable, so the type says WHICH nudge, never when.
 *
 * This value reaches `InviteEvent.metadata.nudgeType` through `sendSms`, so it is a
 * stored vocabulary, not just an internal label — GTC-251 (E6) may count over those rows.
 * Keep it stable.
 */
export type NudgeLeg = 'first' | 'second';

export interface NudgeSendResult {
  personId: string;
  personName: string;
  nudgeType: NudgeLeg;
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
  nudgeType: NudgeLeg
): Promise<NudgeSendResult> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${baseUrl}/p/${candidate.participantToken}`;

  // Get message template
  const message =
    nudgeType === 'first'
      ? getFirstNudgeMessage({
          hostName: candidate.hostName,
          eventName: candidate.eventName,
          link,
        })
      : getSecondNudgeMessage({
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
      nudgeType === 'first' ? { firstNudgeSentAt: new Date() } : { secondNudgeSentAt: new Date() };

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
  eligibleFirst: NudgeCandidate[];
  eligibleSecond: NudgeCandidate[];
}): Promise<{
  sent: NudgeSendResult[];
  deferred: number;
  deferredUntilMinutes: number;
}> {
  // Check quiet hours
  if (isQuietHours()) {
    const minutesUntil = getMinutesUntilQuietEnd();

    // Log deferral for each candidate
    const allCandidates = [...candidates.eligibleFirst, ...candidates.eligibleSecond];

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

  // Send first-leg nudges
  for (const candidate of candidates.eligibleFirst) {
    const result = await sendNudge(candidate, 'first');
    results.push(result);

    // Small delay between sends to avoid rate limiting
    await sleep(500);
  }

  // Send second-leg nudges
  for (const candidate of candidates.eligibleSecond) {
    const result = await sendNudge(candidate, 'second');
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
