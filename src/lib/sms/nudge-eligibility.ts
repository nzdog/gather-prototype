import { prisma } from '@/lib/prisma';
import { isValidNZNumber } from '@/lib/phone';
import { isOptedOut } from '@/lib/sms/opt-out-service';
import { SENT_AND_LIVE } from '@/lib/lifecycle';
import {
  MESSAGEABLE_PERSON_EVENT,
  isMessageableRole,
  CHILD_SKIP_REASON,
} from '@/lib/eligibility/child-exclusion';

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

export interface RsvpFollowupCandidate {
  personEventId: string;
  personId: string;
  personName: string;
  phoneNumber: string;
  eventId: string;
  eventName: string;
  hostId: string;
  hostName: string;
  rsvpRespondedAt: Date;
  participantToken: string;
}

export interface EligibilityResult {
  eligible24h: NudgeCandidate[];
  eligible48h: NudgeCandidate[];
  eligibleRsvpFollowup?: RsvpFollowupCandidate[];
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

  // Find all people in SENT, not-yet-past events with their anchor set.
  //
  // GTC-169 (A3a): this filter was `status: 'CONFIRMING'`, which meant FREEZING AN
  // EVENT STOPPED ITS NUDGES — exactly backwards from the ruled model, where the send
  // is when the chasing starts (Moment 4 §4; Hinge §6 "I'll tell you the moment
  // anything comes back").
  //
  // The endDate half is load-bearing, not cosmetic: after A3a no event ever leaves
  // CONFIRMING, so a status-only filter would keep matching events whose date had
  // passed and fire nudges after the event — which Moment 4 §10.1 forbids outright
  // ("Post-date: nudges dead"). The security suite asserts this directly.
  //
  // GTC-172 (C1): the child rule (Moment 4 §10.6). This query roots on `Person`, but
  // `householdRole` lives on `PersonEvent` — so the exclusion has to go in BOTH the
  // `some` (which decides whether the person is loaded at all) and the include's
  // `where` (which decides which memberships come back). Filtering only the `some`
  // would load the person for their adult membership and then still emit a candidate
  // for their CHILD one.
  const candidates = await prisma.person.findMany({
    where: {
      inviteAnchorAt: { not: null },
      phoneNumber: { not: null },
      eventMemberships: {
        some: {
          event: SENT_AND_LIVE(now),
          ...MESSAGEABLE_PERSON_EVENT,
        },
      },
    },
    include: {
      eventMemberships: {
        where: {
          event: SENT_AND_LIVE(now),
          ...MESSAGEABLE_PERSON_EVENT,
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

      // GTC-172 (C1): belt and braces. The SQL above already excludes CHILD; this
      // re-checks in JS so that if anyone ever loosens the query, the child rule still
      // holds and the skip is recorded rather than silently sending.
      if (!isMessageableRole(membership.householdRole)) {
        addSkip(CHILD_SKIP_REASON);
        continue;
      }

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

  // Find RSVP followup candidates
  const rsvpFollowupResult = await findRsvpFollowupCandidates();

  return {
    eligible24h,
    eligible48h,
    eligibleRsvpFollowup: rsvpFollowupResult.eligible,
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
    eligibleRsvpFollowup: allCandidates.eligibleRsvpFollowup?.filter((c) => c.eventId === eventId),
    skipped: allCandidates.skipped,
  };
}

/**
 * NEUTRALISED BY GTC-174 (D1). Always returns no candidates.
 *
 * This found PersonEvents sitting at `rsvpStatus = NOT_SURE` for 48h and sent them a
 * forced-conversion SMS. Every premise it rested on is now gone:
 *
 *  - Hinge §8 rules a maybe explicitly NO-NUDGE. "The silence cadence asks *did you see
 *    this?*; wrong question — he saw it. A maybe needs *time to decide*." What a maybe
 *    gets instead is a decide-by clock, which is D2's (GTC-175), not a chase.
 *  - Hinge §3 retires `rsvpStatus` as a guest-facing question altogether, so NOT_SURE
 *    can no longer be produced. D1 leaves the column retained-but-unwritten.
 *
 * It is emptied rather than deleted because deleting it is GTC-178's (E1) job, and E1
 * removes the caller and the sender with it. Emptying now closes the live path: without
 * this, a LEGACY NOT_SURE row still in the database would keep matching and fire a
 * message that contradicts the very ruling this ticket implements. The migration
 * deliberately does not clear those rows (they are evidence), so the guard belongs here.
 *
 * The signature is unchanged so callers keep compiling. Opt-out handling (zone 7) is not
 * touched by this: no send decision moves, because no send happens.
 */
export async function findRsvpFollowupCandidates(): Promise<{
  eligible: RsvpFollowupCandidate[];
  skipped: { reason: string; count: number }[];
}> {
  return { eligible: [], skipped: [] };
}
