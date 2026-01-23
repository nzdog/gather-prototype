import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { requireEventRole } from '@/lib/auth/guards'

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  const { id: eventId, personId } = params;

  // TODO: Add authentication when session is properly configured
  // For now, allow open access to match the invite-status endpoint pattern
  // const authResult = await requireEventRole(eventId, ['HOST'])
  // if (authResult instanceof NextResponse) {
  //   return authResult
  // }

  // Query the person with all needed relations
  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      tokens: {
        where: {
          scope: 'PARTICIPANT',
          eventId: eventId,
        },
        select: {
          openedAt: true,
          claimedAt: true,
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
      inviteEvents: {
        where: {
          eventId: eventId,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          type: true,
          createdAt: true,
          metadata: true,
        },
      },
    },
  });

  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }

  const token = person.tokens[0];
  const hasResponded = person.assignments.some((a) => a.response !== 'PENDING');
  const respondedAssignment = person.assignments.find((a) => a.response !== 'PENDING');

  // Determine status
  let status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
  if (hasResponded) {
    status = 'RESPONDED';
  } else if (token?.openedAt) {
    status = 'OPENED';
  } else if (person.inviteAnchorAt) {
    status = 'SENT';
  } else {
    status = 'NOT_SENT';
  }

  // Get response type
  const response = respondedAssignment?.response || 'PENDING';

  // Check opt-out
  const optOut = person.phoneNumber
    ? await prisma.smsOptOut.findFirst({
        where: {
          phoneNumber: person.phoneNumber,
          hostId: (
            await prisma.event.findUnique({
              where: { id: eventId },
              select: { hostId: true },
            })
          )?.hostId,
        },
      })
    : null;

  return NextResponse.json({
    id: person.id,
    name: person.name,
    email: person.email,
    phoneNumber: person.phoneNumber,
    status,
    response,
    inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
    openedAt: token?.openedAt?.toISOString() || null,
    claimedAt: token?.claimedAt?.toISOString() || null,
    respondedAt: respondedAssignment?.createdAt?.toISOString() || null,
    hasPhone: !!person.phoneNumber,
    smsOptedOut: !!optOut,
    canReceiveSms: !!person.phoneNumber && !optOut,
    nudge24hSentAt: person.nudge24hSentAt?.toISOString() || null,
    nudge48hSentAt: person.nudge48hSentAt?.toISOString() || null,
    inviteEvents: person.inviteEvents.map((e) => ({
      type: e.type,
      createdAt: e.createdAt.toISOString(),
      metadata: e.metadata,
    })),
  });
}
