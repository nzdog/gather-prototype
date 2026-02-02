import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getOptOutStatuses } from '@/lib/sms/opt-out-service';
import { requireEventRole } from '@/lib/auth/guards';

export type InviteStatus = 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';

function getNudgeStatus(person: any): string {
  if (person.nudge48hSentAt) return '48h sent';
  if (person.nudge24hSentAt) return '24h sent';
  if (!person.phoneNumber) return 'no phone';
  return 'pending';
}

interface PersonInviteStatus {
  id: string;
  name: string;
  status: InviteStatus;
  response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
  inviteAnchorAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  hasPhone: boolean;
  phoneNumber: string | null;
  smsOptedOut: boolean;
  canReceiveSms: boolean;
  claimedAt: string | null;
  claimedBy: string | null;
  nudge24hSentAt: string | null;
  nudge48hSentAt: string | null;
  nudgeStatus: string;
  reachabilityTier: 'DIRECT' | 'PROXY' | 'SHARED' | 'UNTRACKABLE';
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        people: {
          select: {
            reachabilityTier: true,
            rsvpStatus: true,
            rsvpRespondedAt: true,
            person: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                inviteAnchorAt: true,
                nudge24hSentAt: true,
                nudge48hSentAt: true,
                tokens: {
                  where: {
                    scope: 'PARTICIPANT',
                    eventId: eventId,
                  },
                  select: {
                    openedAt: true,
                    claimedAt: true,
                    claimedBy: true,
                  },
                },
                assignments: {
                  where: {
                    item: {
                      team: {
                        eventId: eventId,
                      },
                    },
                  },
                  select: {
                    response: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get opt-out statuses for people with phones (per-host)
    const phonesInEvent = event.people
      .map((pe: any) => pe.person.phoneNumber)
      .filter((phone: string | null) => !!phone) as string[];

    const optOutStatuses = await getOptOutStatuses(phonesInEvent, event.hostId);

    // Calculate status for each person
    const peopleStatus: PersonInviteStatus[] = event.people.map((personEvent: any) => {
      const person = personEvent.person;
      const token = person.tokens[0];
      const hasResponded = person.assignments.some((a: any) => a.response !== 'PENDING');
      const respondedAssignment = person.assignments.find((a: any) => a.response !== 'PENDING');

      // Determine status (hierarchy: RESPONDED > OPENED > SENT > NOT_SENT)
      let status: InviteStatus;
      if (hasResponded) {
        status = 'RESPONDED';
      } else if (token?.openedAt) {
        status = 'OPENED';
      } else if (person.inviteAnchorAt) {
        status = 'SENT';
      } else {
        status = 'NOT_SENT';
      }

      const hasOptedOut = person.phoneNumber
        ? optOutStatuses.get(person.phoneNumber) || false
        : false;

      // Determine overall response (if any assignment is ACCEPTED, consider confirmed; if any DECLINED, consider declined)
      let response: 'PENDING' | 'ACCEPTED' | 'DECLINED' = 'PENDING';
      if (person.assignments.length > 0) {
        const responses = person.assignments.map((a: any) => a.response);
        if (responses.every((r: string) => r === 'ACCEPTED')) {
          response = 'ACCEPTED';
        } else if (responses.some((r: string) => r === 'DECLINED')) {
          response = 'DECLINED';
        }
      }

      return {
        id: person.id,
        name: person.name,
        status,
        response,
        inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
        openedAt: token?.openedAt?.toISOString() || null,
        respondedAt: respondedAssignment?.createdAt?.toISOString() || null,
        hasPhone: !!person.phoneNumber,
        phoneNumber: person.phoneNumber,
        smsOptedOut: hasOptedOut,
        canReceiveSms: !!person.phoneNumber && !hasOptedOut,
        claimedAt: token?.claimedAt?.toISOString() || null,
        claimedBy: token?.claimedBy || null,
        nudge24hSentAt: person.nudge24hSentAt?.toISOString() || null,
        nudge48hSentAt: person.nudge48hSentAt?.toISOString() || null,
        nudgeStatus: getNudgeStatus(person),
        reachabilityTier: personEvent.reachabilityTier as
          | 'DIRECT'
          | 'PROXY'
          | 'SHARED'
          | 'UNTRACKABLE',
      };
    });

    // Aggregate counts
    const counts = {
      total: peopleStatus.length,
      notSent: peopleStatus.filter((p) => p.status === 'NOT_SENT').length,
      sent: peopleStatus.filter((p) => p.status === 'SENT').length,
      opened: peopleStatus.filter((p) => p.status === 'OPENED').length,
      responded: peopleStatus.filter((p) => p.status === 'RESPONDED').length,
      withPhone: peopleStatus.filter((p) => p.hasPhone).length,
      optedOut: peopleStatus.filter((p) => p.smsOptedOut).length,
    };

    // SMS summary
    const smsSummary = {
      withPhone: peopleStatus.filter((p) => p.hasPhone).length,
      withoutPhone: peopleStatus.filter((p) => !p.hasPhone).length,
      optedOut: peopleStatus.filter((p) => p.smsOptedOut).length,
      canReceive: peopleStatus.filter((p) => p.canReceiveSms).length,
    };

    // Nudge summary
    const nudgeSummary = {
      sent24h: peopleStatus.filter((p) => p.nudge24hSentAt).length,
      sent48h: peopleStatus.filter((p) => p.nudge48hSentAt).length,
      pending24h: peopleStatus.filter((p) => p.canReceiveSms && !p.nudge24hSentAt && !p.openedAt)
        .length,
      pending48h: peopleStatus.filter((p) => p.canReceiveSms && !p.nudge48hSentAt && !p.respondedAt)
        .length,
    };

    // Reachability breakdown
    const reachability = {
      direct: 0,
      proxy: 0,
      shared: 0,
      untrackable: 0,
    };

    event.people.forEach((personEvent: any) => {
      const tier = personEvent.reachabilityTier;
      if (tier === 'DIRECT') {
        reachability.direct++;
      } else if (tier === 'PROXY') {
        reachability.proxy++;
      } else if (tier === 'SHARED') {
        reachability.shared++;
      } else if (tier === 'UNTRACKABLE') {
        reachability.untrackable++;
      }
    });

    // Household proxy nudge summary
    const households = await prisma.household.findMany({
      where: { eventId },
      include: {
        members: true,
      },
    });

    const proxyNudgeSummary = {
      totalHouseholds: households.length,
      householdsWithUnclaimed: households.filter((h) => h.members.some((m) => !m.claimedAt)).length,
      householdsEscalated: households.filter((h) => h.members.some((m) => m.escalatedAt)).length,
      nudgesSent: households.reduce((sum, h) => {
        const maxCount = Math.max(...h.members.map((m) => m.proxyNudgeCount), 0);
        return sum + maxCount;
      }, 0),
    };

    // RSVP breakdown
    const rsvp = {
      pending: event.people.filter((pe: any) => pe.rsvpStatus === 'PENDING').length,
      yes: event.people.filter((pe: any) => pe.rsvpStatus === 'YES').length,
      no: event.people.filter((pe: any) => pe.rsvpStatus === 'NO').length,
      notSure: event.people.filter((pe: any) => pe.rsvpStatus === 'NOT_SURE').length,
    };

    // Attendance breakdown (RSVP data excluding host)
    // Note: event.people already excludes host via PersonEvent relation
    const attendance = {
      total: event.people.length,
      yes: event.people.filter((pe: any) => pe.rsvpStatus === 'YES').length,
      no: event.people.filter((pe: any) => pe.rsvpStatus === 'NO').length,
      notSure: event.people.filter((pe: any) => pe.rsvpStatus === 'NOT_SURE').length,
      pending: event.people.filter((pe: any) => pe.rsvpStatus === 'PENDING').length,
    };

    // Items breakdown (Assignment status)
    // Fetch all items and their assignments for this event
    const allItems = await prisma.item.findMany({
      where: {
        team: {
          eventId: eventId,
        },
      },
      include: {
        assignment: {
          select: {
            response: true,
            person: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const items = {
      total: allItems.length,
      confirmed: allItems.filter((item) => item.assignment?.response === 'ACCEPTED').length,
      declined: allItems.filter((item) => item.assignment?.response === 'DECLINED').length,
      pending: allItems.filter((item) => item.assignment?.response === 'PENDING').length,
      gaps: allItems.filter((item) => !item.assignment || item.assignment.response === 'DECLINED')
        .length,
    };

    // Item details for expanded view
    const itemDetails = allItems.map((item) => ({
      id: item.id,
      name: item.name,
      status: item.assignment
        ? item.assignment.response === 'ACCEPTED'
          ? 'confirmed'
          : item.assignment.response === 'DECLINED'
            ? 'declined'
            : 'pending'
        : 'gap',
      assignee: item.assignment?.person?.name || null,
    }));

    // Calculate threshold metrics (compliance rate and readiness for freeze)
    // Get all assignments for trackable guests (exclude UNTRACKABLE)
    const allTrackableAssignments = await prisma.assignment.findMany({
      where: {
        item: {
          team: { eventId },
        },
        person: {
          eventMemberships: {
            some: {
              eventId,
              reachabilityTier: {
                not: 'UNTRACKABLE',
              },
            },
          },
        },
      },
      include: {
        person: {
          select: {
            eventMemberships: {
              where: { eventId },
              select: { reachabilityTier: true },
            },
          },
        },
      },
    });

    // Calculate compliance rate
    const totalTrackable = allTrackableAssignments.length;
    const acceptedCount = allTrackableAssignments.filter((a) => a.response === 'ACCEPTED').length;
    const complianceRate = totalTrackable === 0 ? 1.0 : acceptedCount / totalTrackable;

    // Check for critical gaps (critical items without ACCEPTED assignment)
    const criticalItems = await prisma.item.findMany({
      where: {
        team: { eventId },
        critical: true,
      },
      include: {
        assignment: true,
      },
    });

    const criticalGaps = criticalItems.filter(
      (item) => !item.assignment || item.assignment.response !== 'ACCEPTED'
    ).length;

    // Ready to freeze if compliance >= 80% AND no critical gaps
    const thresholdReached = complianceRate >= 0.8;
    const readyToFreeze = thresholdReached && criticalGaps === 0;

    return NextResponse.json({
      eventStatus: event.status,
      inviteSendConfirmedAt: event.inviteSendConfirmedAt?.toISOString() || null,
      hasUnsentPeople: counts.notSent > 0,
      sharedLinkEnabled: event.sharedLinkEnabled,
      counts,
      claimCounts: {
        claimed: peopleStatus.filter((p) => p.claimedAt).length,
        unclaimed: peopleStatus.filter((p) => !p.claimedAt).length,
      },
      smsSummary,
      nudgeSummary,
      proxyNudgeSummary,
      reachability,
      rsvp,
      attendance,
      items,
      itemDetails,
      threshold: {
        complianceRate,
        thresholdReached,
        criticalGaps,
        readyToFreeze,
      },
      people: peopleStatus,
    });
  } catch (error) {
    console.error('Error getting invite status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
