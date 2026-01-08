import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { AssignmentResponse } from '@prisma/client';

/**
 * POST /api/p/[token]/ack/[assignmentId]
 *
 * Records participant response (Accept or Decline) for an assignment.
 *
 * CRITICAL: Idempotent + race-safe implementation.
 * - Ownership check performed inside transaction
 * - Allows response changes (PENDING → ACCEPTED, PENDING → DECLINED, etc.)
 * - Audit logged on response change
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; assignmentId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
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

  // Update response inside transaction
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: params.assignmentId },
    });

    // Verify assignment exists and belongs to this participant
    if (!assignment || assignment.personId !== context.person.id) {
      return { found: false };
    }

    // If response unchanged, do nothing (idempotent)
    if (assignment.response === response) {
      return { found: true, changed: false };
    }

    // Update response and log
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
      details: `${response === 'ACCEPTED' ? 'Accepted' : 'Declined'} assignment for item ${assignment.itemId}`,
    });

    return { found: true, changed: true };
  });

  if (!result.found) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
