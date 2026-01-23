import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { requireEventRole } from '@/lib/auth/guards'
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  const { id: eventId, personId } = params;

  // TODO: Add authentication when session is properly configured
  // For now, allow open access to match the invite-status endpoint pattern
  // const authResult = await requireEventRole(eventId, ['HOST'])
  // if (authResult instanceof NextResponse) {
  //   return authResult
  // }

  // Parse body
  let response: 'ACCEPTED' | 'DECLINED';
  let reason = '';

  try {
    const body = await request.json();
    response = body.response;
    reason = body.reason || '';
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  // Validate response parameter
  if (!response || !['ACCEPTED', 'DECLINED'].includes(response)) {
    return NextResponse.json({ error: 'response must be ACCEPTED or DECLINED' }, { status: 400 });
  }

  // Set default reason if not provided
  if (!reason) {
    reason = response === 'ACCEPTED' ? 'Manual confirmation by host' : 'Manual decline by host';
  }

  const person = await prisma.person.findUnique({
    where: { id: personId },
    include: {
      assignments: {
        where: {
          item: {
            team: {
              eventId: eventId,
            },
          },
        },
      },
    },
  });

  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }

  // Update all their assignments to the specified response
  const updatedAssignments = await prisma.assignment.updateMany({
    where: {
      personId: personId,
      item: {
        team: {
          eventId: eventId,
        },
      },
      response: { not: response },
    },
    data: {
      response: response,
    },
  });

  // Log the manual override
  await logInviteEvent({
    eventId,
    personId,
    type: 'MANUAL_OVERRIDE_MARKED',
    metadata: {
      response,
      reason,
      assignmentsUpdated: updatedAssignments.count,
      previousResponses: person.assignments.map((a) => ({
        itemId: a.itemId,
        previousResponse: a.response,
      })),
    },
  });

  return NextResponse.json({
    success: true,
    assignmentsUpdated: updatedAssignments.count,
    message: `${person.name} marked as ${response === 'ACCEPTED' ? 'confirmed' : 'declined'}`,
  });
}
