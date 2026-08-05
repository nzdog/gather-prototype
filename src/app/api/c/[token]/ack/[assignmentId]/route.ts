import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { parseAssignmentResponse } from '@/lib/attendance';

/**
 * POST /api/c/[token]/ack/[assignmentId]
 *
 * Coordinator records the response to their OWN assignment: accept, decline, or maybe.
 *
 * GTC-174 (D1): a coordinator answering their own item is a guest answering an item —
 * same model, same three ways (Hinge §3). This is not the host-override path, which
 * stays binary because a host never records a maybe on someone else's behalf.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string; assignmentId: string }> }
) {
  const { token, assignmentId } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Parse request body for response type
  const body = await request.json();
  const response = parseAssignmentResponse(body?.response);

  if (response === null) {
    return NextResponse.json(
      { error: 'Invalid response. Must be ACCEPTED, DECLINED or MAYBE' },
      { status: 400 }
    );
  }

  // Verify assignment belongs to this person
  const assignment = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    include: {
      item: true,
    },
  });

  if (!assignment || assignment.personId !== resolvedContext.person.id) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // If response unchanged, do nothing (idempotent)
  if (assignment.response === response) {
    return NextResponse.json({ success: true });
  }

  // Update response in transaction
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { response },
    });

    const verb =
      response === 'ACCEPTED' ? 'Accepted' : response === 'DECLINED' ? 'Declined' : 'Maybe on';

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType:
        response === 'ACCEPTED'
          ? 'ACCEPT_ASSIGNMENT'
          : response === 'DECLINED'
            ? 'DECLINE_ASSIGNMENT'
            : 'MAYBE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: assignmentId,
      details: `${verb} ${assignment.item.name}`,
    });
  });

  return NextResponse.json({ success: true });
}
