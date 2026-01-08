import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { AssignmentResponse } from '@prisma/client';

/**
 * POST /api/c/[token]/ack/[assignmentId]
 *
 * Coordinator records response (Accept or Decline) for their own assignment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; assignmentId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Parse request body for response type
  const body = await request.json();
  const { response } = body;

  // Validate response type
  if (!response || !['ACCEPTED', 'DECLINED'].includes(response)) {
    return NextResponse.json(
      { error: 'Invalid response. Must be ACCEPTED or DECLINED' },
      { status: 400 }
    );
  }

  // Verify assignment belongs to this person
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      item: true,
    },
  });

  if (!assignment || assignment.personId !== context.person.id) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // If response unchanged, do nothing (idempotent)
  if (assignment.response === response) {
    return NextResponse.json({ success: true });
  }

  // Update response in transaction
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: params.assignmentId },
      data: { response: response as AssignmentResponse },
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: response === 'ACCEPTED' ? 'ACCEPT_ASSIGNMENT' : 'DECLINE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: params.assignmentId,
      details: `${response === 'ACCEPTED' ? 'Accepted' : 'Declined'} ${assignment.item.name}`,
    });
  });

  return NextResponse.json({ success: true });
}
