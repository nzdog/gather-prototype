import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { requireEventRole } from '@/lib/auth/guards'

export type InviteStatus = 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';

interface PersonInviteStatus {
  id: string;
  name: string;
  status: InviteStatus;
  inviteAnchorAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  hasPhone: boolean;
  smsOptedOut: boolean;
  claimedAt: string | null;
  claimedBy: string | null;
}

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id: eventId } = params;

  // TODO: Add authentication when session is properly configured
  // For now, allow open access to match the event endpoint pattern

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      people: {
        include: {
          person: {
            include: {
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

    return {
      id: person.id,
      name: person.name,
      status,
      inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
      openedAt: token?.openedAt?.toISOString() || null,
      respondedAt: respondedAssignment?.createdAt?.toISOString() || null,
      hasPhone: !!person.phoneNumber,
      smsOptedOut: person.smsOptedOut,
      claimedAt: token?.claimedAt?.toISOString() || null,
      claimedBy: token?.claimedBy || null,
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
    people: peopleStatus,
  });
}
