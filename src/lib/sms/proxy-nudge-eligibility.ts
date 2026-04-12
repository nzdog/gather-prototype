import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';

export interface ProxyNudgeCandidate {
  householdId: string;
  primaryContactPersonId: string;
  primaryContactName: string;
  primaryContactPhone: string;
  eventId: string;
  eventName: string;
  hostId: string;
  createdAt: Date;
  memberCount: number;
}

export interface ProxyEligibilityResult {
  eligible: ProxyNudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * Find all households eligible for proxy nudges.
 *
 * The Moment 1 redesign replaced HouseholdMember with direct PersonEvent
 * membership (householdId + householdRole). Proxy nudge tracking fields
 * (proxyNudgeCount, lastProxyNudgeAt, claimedAt, escalatedAt) no longer
 * exist on the schema. This function returns basic candidates; nudge
 * scheduling logic needs redesign in a future ticket.
 */
export async function findProxyNudgeCandidates(): Promise<ProxyEligibilityResult> {
  const households = await prisma.household.findMany({
    where: {
      event: {
        status: 'CONFIRMING',
      },
    },
    include: {
      event: true,
      members: {
        where: {
          householdRole: 'PRIMARY_CONTACT',
        },
        include: {
          person: true,
        },
      },
    },
  });

  const eligible: ProxyNudgeCandidate[] = [];
  const skipReasons: Map<string, number> = new Map();

  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const household of households) {
    const primaryContact = household.members[0];
    if (!primaryContact) {
      addSkip('No primary contact');
      continue;
    }

    if (!primaryContact.person.phoneNumber) {
      addSkip('Primary contact has no phone');
      continue;
    }

    if (!isValidNZNumber(primaryContact.person.phoneNumber)) {
      addSkip('Primary contact has invalid/non-NZ phone');
      continue;
    }

    if (primaryContact.contactMethod !== 'SMS') {
      addSkip('Primary contact method not SMS');
      continue;
    }

    const optedOut = await isOptedOut(primaryContact.person.phoneNumber, household.event.hostId);
    if (optedOut) {
      addSkip('Primary contact opted out');
      continue;
    }

    const allMembers = await prisma.personEvent.findMany({
      where: { householdId: household.id },
    });

    eligible.push({
      householdId: household.id,
      primaryContactPersonId: primaryContact.person.id,
      primaryContactName: primaryContact.person.name,
      primaryContactPhone: primaryContact.person.phoneNumber,
      eventId: household.eventId,
      eventName: household.event.name,
      hostId: household.event.hostId,
      createdAt: household.createdAt,
      memberCount: allMembers.length,
    });
  }

  return {
    eligible,
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
    eligible: allCandidates.eligible.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
