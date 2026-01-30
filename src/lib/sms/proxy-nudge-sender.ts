import { prisma } from '@/lib/prisma';
import { sendSms } from './send-sms';
import { logInviteEvent } from '@/lib/invite-events';
import { isQuietHours, getMinutesUntilQuietEnd } from './quiet-hours';
import { getProxyHouseholdReminderMessage, getMessageInfo } from './nudge-templates';
import { ProxyNudgeCandidate } from './proxy-nudge-eligibility';

export interface ProxyNudgeSendResult {
  householdId: string;
  proxyPersonId: string;
  proxyName: string;
  nudgeType: '24h' | '48h' | 'escalation';
  success: boolean;
  messageId?: string;
  error?: string;
  deferred?: boolean;
  deferredUntil?: Date;
}

/**
 * Send a single proxy nudge for a household
 */
export async function sendProxyNudge(
  candidate: ProxyNudgeCandidate,
  nudgeType: '24h' | '48h'
): Promise<ProxyNudgeSendResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const dashboardLink = `${baseUrl}/plan/${candidate.eventId}`;

  // Get message template
  const message = getProxyHouseholdReminderMessage({
    eventName: candidate.eventName,
    unclaimedCount: candidate.unclaimedCount,
    dashboardLink,
  });

  const messageInfo = getMessageInfo(message);

  // Send SMS
  const result = await sendSms({
    to: candidate.proxyPhone,
    message,
    eventId: candidate.eventId,
    personId: candidate.proxyPersonId,
    metadata: {
      nudgeType: `proxy_${nudgeType}`,
      householdId: candidate.householdId,
      unclaimedCount: candidate.unclaimedCount,
      messageLength: messageInfo.length,
      messageSegments: messageInfo.segments,
    },
  });

  if (result.success) {
    // Update all unclaimed household members to increment nudge count
    const household = await prisma.household.findUnique({
      where: { id: candidate.householdId },
      include: {
        members: {
          where: {
            claimedAt: null,
            escalatedAt: null,
          },
        },
      },
    });

    if (household) {
      await prisma.householdMember.updateMany({
        where: {
          id: {
            in: household.members.map((m) => m.id),
          },
        },
        data: {
          proxyNudgeCount: { increment: 1 },
          lastProxyNudgeAt: new Date(),
        },
      });

      // Log invite event for the proxy
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.proxyPersonId,
        type: 'PROXY_NUDGE_SENT',
        metadata: {
          householdId: candidate.householdId,
          unclaimedCount: candidate.unclaimedCount,
          nudgeType: `proxy_${nudgeType}`,
        },
      });
    }

    return {
      householdId: candidate.householdId,
      proxyPersonId: candidate.proxyPersonId,
      proxyName: candidate.proxyName,
      nudgeType,
      success: true,
      messageId: result.messageId,
    };
  } else {
    return {
      householdId: candidate.householdId,
      proxyPersonId: candidate.proxyPersonId,
      proxyName: candidate.proxyName,
      nudgeType,
      success: false,
      error: result.error,
    };
  }
}

/**
 * Escalate a household after 2 failed nudges
 */
export async function escalateHousehold(
  candidate: ProxyNudgeCandidate
): Promise<ProxyNudgeSendResult> {
  try {
    // Update all unclaimed members to mark as escalated
    const household = await prisma.household.findUnique({
      where: { id: candidate.householdId },
      include: {
        members: {
          where: {
            claimedAt: null,
            escalatedAt: null,
          },
        },
      },
    });

    if (household) {
      await prisma.householdMember.updateMany({
        where: {
          id: {
            in: household.members.map((m) => m.id),
          },
        },
        data: {
          escalatedAt: new Date(),
        },
      });

      // Log escalation event
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.proxyPersonId,
        type: 'HOUSEHOLD_ESCALATED',
        metadata: {
          householdId: candidate.householdId,
          unclaimedCount: candidate.unclaimedCount,
          unclaimedMembers: candidate.unclaimedMembers,
        },
      });
    }

    return {
      householdId: candidate.householdId,
      proxyPersonId: candidate.proxyPersonId,
      proxyName: candidate.proxyName,
      nudgeType: 'escalation',
      success: true,
    };
  } catch (error) {
    return {
      householdId: candidate.householdId,
      proxyPersonId: candidate.proxyPersonId,
      proxyName: candidate.proxyName,
      nudgeType: 'escalation',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Process all eligible proxy nudges
 */
export async function processProxyNudges(candidates: {
  eligible24h: ProxyNudgeCandidate[];
  eligible48h: ProxyNudgeCandidate[];
  eligibleEscalation: ProxyNudgeCandidate[];
}): Promise<{
  sent: ProxyNudgeSendResult[];
  escalated: ProxyNudgeSendResult[];
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
        personId: candidate.proxyPersonId,
        type: 'PROXY_NUDGE_DEFERRED_QUIET',
        metadata: {
          householdId: candidate.householdId,
          deferredMinutes: minutesUntil,
          phoneNumber: candidate.proxyPhone,
        },
      });
    }

    console.log(
      `[Proxy Nudge] Quiet hours - deferring ${allCandidates.length} proxy nudges for ${minutesUntil} minutes`
    );

    return {
      sent: [],
      escalated: [],
      deferred: allCandidates.length,
      deferredUntilMinutes: minutesUntil,
    };
  }

  const sentResults: ProxyNudgeSendResult[] = [];
  const escalatedResults: ProxyNudgeSendResult[] = [];

  // Send 24h nudges
  for (const candidate of candidates.eligible24h) {
    const result = await sendProxyNudge(candidate, '24h');
    sentResults.push(result);

    // Small delay between sends to avoid rate limiting
    await sleep(500);
  }

  // Send 48h nudges
  for (const candidate of candidates.eligible48h) {
    const result = await sendProxyNudge(candidate, '48h');
    sentResults.push(result);

    await sleep(500);
  }

  // Process escalations
  for (const candidate of candidates.eligibleEscalation) {
    const result = await escalateHousehold(candidate);
    escalatedResults.push(result);

    await sleep(100);
  }

  return {
    sent: sentResults,
    escalated: escalatedResults,
    deferred: 0,
    deferredUntilMinutes: 0,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
