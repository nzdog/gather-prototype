import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordAssignmentAnswer } from '@/lib/assignment/answer';
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

  // Update response in transaction.
  //
  // GTC-320: the write and the audit line are `recordAssignmentAnswer` in
  // src/lib/assignment/answer.ts, shared with the participant door. This route's own-row
  // check above is NOT shared — that is GTC-174's ruling and it stays here.
  await prisma.$transaction(async (tx) => {
    await recordAssignmentAnswer(tx, {
      eventId: resolvedContext.event.id,
      assignmentId,
      itemName: assignment.item.name,
      response,
      actorId: resolvedContext.person.id,
    });
  });

  return NextResponse.json({ success: true });
}
