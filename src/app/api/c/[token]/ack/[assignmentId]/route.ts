import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';

/**
 * POST /api/c/[token]/ack/[assignmentId]
 *
 * Coordinator acknowledges their own assignment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; assignmentId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify assignment belongs to this person
  const assignment = await prisma.assignment.findUnique({
    where: { id: params.assignmentId },
    include: {
      item: true
    }
  });

  if (!assignment || assignment.personId !== context.person.id) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  if (assignment.acknowledged) {
    return NextResponse.json({ error: 'Already acknowledged' }, { status: 400 });
  }

  // Acknowledge in transaction
  await prisma.$transaction(async (tx) => {
    await tx.assignment.update({
      where: { id: params.assignmentId },
      data: { acknowledged: true }
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'ACKNOWLEDGE_ITEM',
      targetType: 'Assignment',
      targetId: params.assignmentId,
      details: `Acknowledged ${assignment.item.name}`
    });
  });

  return NextResponse.json({ success: true });
}
