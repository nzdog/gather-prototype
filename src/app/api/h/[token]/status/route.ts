import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canFreeze, getCriticalGapCount, canTransition, logAudit } from '@/lib/workflow';

/**
 * PATCH /api/h/[token]/status
 *
 * Changes event workflow status.
 *
 * CRITICAL:
 * - Capture fromStatus BEFORE any updates (for audit and transition validation)
 * - Validate transition with canTransition()
 * - If FROZEN: check canFreeze() (queries assignment:null)
 * - Transaction: update + audit + optional override log
 * - Log override when unfreezing (FROZEN → CONFIRMING)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Capture old status BEFORE any updates
  const fromStatus = context.event.status;

  if (fromStatus === 'COMPLETE') {
    return NextResponse.json({ error: 'Cannot modify completed event' }, { status: 403 });
  }

  const body = await request.json();
  const { status, unfreezeReason } = body;

  if (!status) {
    return NextResponse.json({ error: 'status is required' }, { status: 400 });
  }

  // Validate unfreeze reason if unfreezing
  if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
    if (!unfreezeReason || unfreezeReason.trim() === '') {
      return NextResponse.json({
        error: 'A reason is required to unfreeze the event'
      }, { status: 400 });
    }
  }

  // Validate state transition
  if (!canTransition(fromStatus, status)) {
    return NextResponse.json({
      error: `Invalid transition from ${fromStatus} to ${status}`
    }, { status: 400 });
  }

  // Freeze gate check
  if (status === 'FROZEN') {
    const allowed = await canFreeze(context.event.id);
    if (!allowed) {
      const gaps = await getCriticalGapCount(context.event.id);
      return NextResponse.json({
        error: `Cannot freeze: ${gaps} critical gaps`
      }, { status: 400 });
    }
  }

  // Single transaction for update + all audit logs
  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: context.event.id },
      data: { status }
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'EVENT_STATUS_CHANGE',
      targetType: 'Event',
      targetId: context.event.id,
      details: `Changed status from ${fromStatus} to ${status}`
    });

    // Log override in same transaction with reason
    if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
      await logAudit(tx, {
        eventId: context.event.id,
        actorId: context.person.id,
        actionType: 'OVERRIDE_UNFREEZE',
        targetType: 'Event',
        targetId: context.event.id,
        details: `Host unfroze event. Reason: ${unfreezeReason}`
      });
    }

    return event;
  });

  return NextResponse.json({ event: updated });
}
