import { sendSms } from './send-sms';
import { logInviteEvent } from '@/lib/invite-events';
import { isQuietHours, getMinutesUntilQuietEnd } from './quiet-hours';
import { getProxyHouseholdReminderMessage, getMessageInfo } from './nudge-templates';
import { ProxyNudgeCandidate } from './proxy-nudge-eligibility';

export interface ProxyNudgeSendResult {
  householdId: string;
  primaryContactPersonId: string;
  primaryContactName: string;
  success: boolean;
  messageId?: string;
  error?: string;
  deferred?: boolean;
  deferredUntil?: Date;
}

/**
 * Send a proxy nudge for a household's primary contact.
 *
 * The Moment 1 redesign removed HouseholdMember-level nudge tracking
 * (proxyNudgeCount, lastProxyNudgeAt). Nudge frequency limiting needs
 * redesign in a future ticket.
 */
export async function sendProxyNudge(
  candidate: ProxyNudgeCandidate
): Promise<ProxyNudgeSendResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardLink = `${baseUrl}/plan/${candidate.eventId}`;

  // GTC-256 (phase 3), Ruling 5: `checkInCount`, not `memberCount`. The host is never
  // among the people her household's channel is asked to check in with — see the count's
  // derivation in proxy-nudge-eligibility.ts. `memberCount` stays the true household size
  // and is still what the send metadata below records.
  const message = getProxyHouseholdReminderMessage({
    eventName: candidate.eventName,
    unclaimedCount: candidate.checkInCount,
    dashboardLink,
  });

  const messageInfo = getMessageInfo(message);

  const result = await sendSms({
    to: candidate.primaryContactPhone,
    message,
    eventId: candidate.eventId,
    personId: candidate.primaryContactPersonId,
    metadata: {
      nudgeType: 'proxy_household',
      householdId: candidate.householdId,
      memberCount: candidate.memberCount,
      messageLength: messageInfo.length,
      messageSegments: messageInfo.segments,
    },
  });

  if (result.success) {
    await logInviteEvent({
      eventId: candidate.eventId,
      personId: candidate.primaryContactPersonId,
      type: 'PROXY_NUDGE_SENT',
      metadata: {
        householdId: candidate.householdId,
        memberCount: candidate.memberCount,
      },
    });

    return {
      householdId: candidate.householdId,
      primaryContactPersonId: candidate.primaryContactPersonId,
      primaryContactName: candidate.primaryContactName,
      success: true,
      messageId: result.messageId,
    };
  } else {
    return {
      householdId: candidate.householdId,
      primaryContactPersonId: candidate.primaryContactPersonId,
      primaryContactName: candidate.primaryContactName,
      success: false,
      error: result.error,
    };
  }
}

/**
 * Process all eligible proxy nudges
 */
export async function processProxyNudges(candidates: { eligible: ProxyNudgeCandidate[] }): Promise<{
  sent: ProxyNudgeSendResult[];
  deferred: number;
  deferredUntilMinutes: number;
}> {
  if (isQuietHours()) {
    const minutesUntil = getMinutesUntilQuietEnd();

    for (const candidate of candidates.eligible) {
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.primaryContactPersonId,
        type: 'PROXY_NUDGE_DEFERRED_QUIET',
        metadata: {
          householdId: candidate.householdId,
          deferredMinutes: minutesUntil,
          phoneNumber: candidate.primaryContactPhone,
        },
      });
    }

    return {
      sent: [],
      deferred: candidates.eligible.length,
      deferredUntilMinutes: minutesUntil,
    };
  }

  const sentResults: ProxyNudgeSendResult[] = [];

  for (const candidate of candidates.eligible) {
    const result = await sendProxyNudge(candidate);
    sentResults.push(result);
    await sleep(500);
  }

  return {
    sent: sentResults,
    deferred: 0,
    deferredUntilMinutes: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
