import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';

/**
 * POST /api/p/[token]/ack/[assignmentId]
 *
 * Acknowledges an assignment.
 *
 * CRITICAL: Idempotent + race-safe implementation.
 * - Ownership check and "already acknowledged" check performed inside transaction
 * - Audit logged only on first ACK
 * - Second call returns success but logs nothing
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: { token: string; assignmentId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Idempotent ACK: check and update inside transaction to avoid race conditions
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: params.assignmentId },
    });

    // Verify assignment exists and belongs to this participant
    if (!assignment || assignment.personId !== context.person.id) {
      return { found: false };
    }

    // If already acknowledged, do nothing (idempotent)
    if (assignment.acknowledged) {
      return { found: true, alreadyAcked: true };
    }

    // Update and log
    await tx.assignment.update({
      where: { id: params.assignmentId },
      data: { acknowledged: true },
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'ACK_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: params.assignmentId,
      details: `Acknowledged assignment for item ${assignment.itemId}`,
    });

    return { found: true, alreadyAcked: false };
  });

  if (!result.found) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
