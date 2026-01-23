import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';

export interface NudgeCandidate {
  personId: string;
  personName: string;
  phoneNumber: string;
  eventId: string;
  eventName: string;
  hostId: string;
  hostName: string;
  anchorAt: Date;
  participantToken: string;

  // Status flags
  hasOpened: boolean;
  hasResponded: boolean;
  nudge24hSentAt: Date | null;
  nudge48hSentAt: Date | null;
}

export interface EligibilityResult {
  eligible24h: NudgeCandidate[];
  eligible48h: NudgeCandidate[];
  skipped: {
    reason: string;
    count: number;
  }[];
}

/**
 * Find all people eligible for nudges across all active events
 */
export async function findNudgeCandidates(): Promise<EligibilityResult> {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Find all people in CONFIRMING events with anchor set
  const candidates = await prisma.person.findMany({
    where: {
      inviteAnchorAt: { not: null },
      phoneNumber: { not: null },
      eventMemberships: {
        some: {
          event: {
            status: 'CONFIRMING',
          },
        },
      },
    },
    include: {
      eventMemberships: {
        where: {
          event: {
            status: 'CONFIRMING',
          },
        },
        include: {
          event: {
            select: {
              id: true,
              name: true,
              hostId: true,
              host: {
                select: { name: true },
              },
            },
          },
        },
      },
      tokens: {
        where: { scope: 'PARTICIPANT' },
        select: {
          token: true,
          openedAt: true,
          eventId: true,
        },
      },
      assignments: {
        select: {
          response: true,
          item: {
            select: {
              team: {
                select: {
                  eventId: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const eligible24h: NudgeCandidate[] = [];
  const eligible48h: NudgeCandidate[] = [];
  const skipReasons: Map<string, number> = new Map();

  const addSkip = (reason: string) => {
    skipReasons.set(reason, (skipReasons.get(reason) || 0) + 1);
  };

  for (const person of candidates) {
    // Process each event membership
    for (const membership of person.eventMemberships) {
      const event = membership.event;

      // Find token for this event
      const token = person.tokens.find((t: any) => t.eventId === event.id);

      // Skip if no participant token
      if (!token) {
        addSkip('No participant token');
        continue;
      }

      // Skip if invalid phone
      if (!isValidNZNumber(person.phoneNumber!)) {
        addSkip('Invalid/non-NZ phone');
        continue;
      }

      // Check opt-out
      const optedOut = await isOptedOut(person.phoneNumber!, event.hostId);
      if (optedOut) {
        addSkip('Opted out');
        continue;
      }

      // Check if person has responded to any assignment in this event
      const hasResponded = person.assignments.some(
        (a: any) => a.item.team.eventId === event.id && a.response !== 'PENDING'
      );

      const candidate: NudgeCandidate = {
        personId: person.id,
        personName: person.name,
        phoneNumber: person.phoneNumber!,
        eventId: event.id,
        eventName: event.name,
        hostId: event.hostId,
        hostName: event.host?.name || 'The host',
        anchorAt: person.inviteAnchorAt!,
        participantToken: token.token,
        hasOpened: !!token.openedAt,
        hasResponded,
        nudge24hSentAt: person.nudge24hSentAt,
        nudge48hSentAt: person.nudge48hSentAt,
      };

      // Check 24h eligibility
      if (
        candidate.anchorAt <= twentyFourHoursAgo && // 24h passed
        !candidate.hasOpened && // Haven't opened
        !candidate.nudge24hSentAt // Haven't sent 24h nudge
      ) {
        eligible24h.push(candidate);
      }

      // Check 48h eligibility
      if (
        candidate.anchorAt <= fortyEightHoursAgo && // 48h passed
        !candidate.hasResponded && // Haven't responded
        !candidate.nudge48hSentAt // Haven't sent 48h nudge
      ) {
        eligible48h.push(candidate);
      }
    }
  }

  return {
    eligible24h,
    eligible48h,
    skipped: Array.from(skipReasons.entries()).map(([reason, count]) => ({
      reason,
      count,
    })),
  };
}

/**
 * Find nudge candidates for a specific event
 */
export async function findNudgeCandidatesForEvent(eventId: string): Promise<EligibilityResult> {
  // Similar to above but filtered to one event
  const allCandidates = await findNudgeCandidates();

  return {
    eligible24h: allCandidates.eligible24h.filter((c) => c.eventId === eventId),
    eligible48h: allCandidates.eligible48h.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}
