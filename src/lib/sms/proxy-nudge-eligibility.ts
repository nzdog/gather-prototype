import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import { isMessageableRole, CHILD_SKIP_REASON } from '@/lib/eligibility/child-exclusion';
import { resolveHouseholdChannel } from '@/lib/households/channel';

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
  // GTC-169 (A3a): see nudge-eligibility.ts — the send starts the chasing, and the
  // event date ends it (Moment 4 §10.1).
  //
  // GTC-172 (C1): the recipient is now the household's CHANNEL (Moment 4 §10.7), not
  // "the primary contact" by definition. All members are loaded rather than just
  // PRIMARY_CONTACT, because the picked channel may be any adult — including one in a
  // DIFFERENT household, which is why the channel is resolved against a separate
  // lookup below rather than against `household.members`.
  const households = await prisma.household.findMany({
    where: {
      event: SENT_AND_LIVE(new Date()),
    },
    include: {
      event: true,
      members: {
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
    const channelId = resolveHouseholdChannel(household);
    if (!channelId) {
      addSkip('No primary contact');
      continue;
    }

    // The channel may live in another household (§10.7), so it is resolved from the
    // event rather than from this household's members.
    const primaryContact =
      household.members.find((m) => m.id === channelId) ??
      (await prisma.personEvent.findUnique({
        where: { id: channelId },
        include: { person: true },
      }));

    if (!primaryContact || primaryContact.eventId !== household.eventId) {
      addSkip('Household channel not found in this event');
      continue;
    }

    // GTC-172 (C1): the child rule (§10.6), and it FAILS CLOSED. A channel pointing at
    // a CHILD is corrupt data — the picker omits children and the API rejects them —
    // so the household is skipped outright rather than quietly falling back to the
    // primary contact. Falling back would message somebody the host never picked and
    // would hide the corruption for as long as it existed.
    if (!isMessageableRole(primaryContact.householdRole)) {
      addSkip(CHILD_SKIP_REASON);
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
