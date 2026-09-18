import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { logInviteEvent } from '@/lib/invite-events';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  // Invalid/missing auth must return 401, not 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    // If auth throws (should not happen, but fail-closed), return 401
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

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

  // A manual override sets a response ON SOMEONE'S BEHALF, so it moves their claim —
  // recorded as a T1-shaped change carrying the host's why.
  if (updatedAssignments.count > 0) {
    const overrideActor = await ledgerActorForUser(auth.user, auth.role);
    await prisma.$transaction((tx) =>
      recordChange(tx, {
        eventId,
        actor: overrideActor,
        reason: reason ?? null,
        changes: [
          {
            action: 'MOVE_ASSIGNMENT',
            targetType: 'Assignment',
            targetId: personId,
            before: null,
            after: { response, assignmentsUpdated: updatedAssignments.count },
            context: { assignmentResponse: 'PENDING' },
          },
        ],
      })
    );
  }

  return NextResponse.json({
    success: true,
    assignmentsUpdated: updatedAssignments.count,
    message: `${person.name} marked as ${response === 'ACCEPTED' ? 'confirmed' : 'declined'}`,
  });
}
