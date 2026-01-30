import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';

export interface ProxyNudgeCandidate {
  householdId: string;
  householdName: string | null;
  proxyPersonId: string;
  proxyName: string;
  proxyPhone: string;
  eventId: string;
  eventName: string;
  hostId: string;
  createdAt: Date;
  unclaimedCount: number;
  unclaimedMembers: string[];
  proxyNudgeCount: number;
  lastProxyNudgeAt: Date | null;
}

export interface ProxyEligibilityResult {
  eligible24h: ProxyNudgeCandidate[];
  eligible48h: ProxyNudgeCandidate[];
  eligibleEscalation: ProxyNudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * Find all households eligible for proxy nudges
 */
export async function findProxyNudgeCandidates(): Promise<ProxyEligibilityResult> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Find all households in CONFIRMING events with unclaimed members
  const households = await prisma.household.findMany({
    where: {
      event: {
        status: 'CONFIRMING',
      },
      members: {
        some: {
          claimedAt: null,
          escalatedAt: null,
        },
      },
    },
    include: {
      event: true,
      proxyPerson: {
        include: {
          eventMemberships: true,
        },
      },
      members: {
        where: {
          claimedAt: null,
          escalatedAt: null,
        },
      },
    },
  });

  const eligible24h: ProxyNudgeCandidate[] = [];
  const eligible48h: ProxyNudgeCandidate[] = [];
  const eligibleEscalation: ProxyNudgeCandidate[] = [];
  const skipReasons: Map<string, number> = new Map();

  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const household of households) {
    // Skip if no unclaimed members (shouldn't happen due to query filter)
    if (household.members.length === 0) {
      addSkip('No unclaimed members');
      continue;
    }

    // Check if proxy has valid phone
    if (!household.proxyPerson.phoneNumber) {
      addSkip('Proxy has no phone');
      continue;
    }

    if (!isValidNZNumber(household.proxyPerson.phoneNumber)) {
      addSkip('Proxy has invalid/non-NZ phone');
      continue;
    }

    // Check if proxy has SMS contact method for this event
    const proxyPersonEvent = household.proxyPerson.eventMemberships.find(
      (pe: any) => pe.eventId === household.eventId
    );
    if (!proxyPersonEvent || proxyPersonEvent.contactMethod !== 'SMS') {
      addSkip('Proxy contact method not SMS');
      continue;
    }

    // Check opt-out
    const optedOut = await isOptedOut(household.proxyPerson.phoneNumber, household.event.hostId);
    if (optedOut) {
      addSkip('Proxy opted out');
      continue;
    }

    // Get the highest nudge count among unclaimed members
    // (they should all have the same count, but use max for safety)
    const maxNudgeCount = Math.max(...household.members.map((m) => m.proxyNudgeCount), 0);

    const lastNudgeAt = household.members
      .map((m) => m.lastProxyNudgeAt)
      .filter((d): d is Date => d !== null)
      .sort((a, b) => b.getTime() - a.getTime())[0];

    const candidate: ProxyNudgeCandidate = {
      householdId: household.id,
      householdName: household.name,
      proxyPersonId: household.proxyPersonId,
      proxyName: household.proxyPerson.name,
      proxyPhone: household.proxyPerson.phoneNumber,
      eventId: household.eventId,
      eventName: household.event.name,
      hostId: household.event.hostId,
      createdAt: household.createdAt,
      unclaimedCount: household.members.length,
      unclaimedMembers: household.members.map((m) => m.name),
      proxyNudgeCount: maxNudgeCount,
      lastProxyNudgeAt: lastNudgeAt || null,
    };

    // Check 24h eligibility (first nudge)
    if (candidate.createdAt <= twentyFourHoursAgo && candidate.proxyNudgeCount === 0) {
      eligible24h.push(candidate);
      continue;
    }

    // Check 48h eligibility (second nudge)
    if (candidate.createdAt <= fortyEightHoursAgo && candidate.proxyNudgeCount === 1) {
      eligible48h.push(candidate);
      continue;
    }

    // Check escalation eligibility (after 2 nudges)
    if (candidate.proxyNudgeCount === 2) {
      eligibleEscalation.push(candidate);
      continue;
    }
  }

  return {
    eligible24h,
    eligible48h,
    eligibleEscalation,
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({
      reason,
      count,
    })),
  };
}

/**
 * Find proxy nudge candidates for a specific event
 */
export async function findProxyNudgeCandidatesForEvent(
  eventId: string
): Promise<ProxyEligibilityResult> {
  const allCandidates = await findProxyNudgeCandidates();

  return {
    eligible24h: allCandidates.eligible24h.filter((c) => c.eventId === eventId),
    eligible48h: allCandidates.eligible48h.filter((c) => c.eventId === eventId),
    eligibleEscalation: allCandidates.eligibleEscalation.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
