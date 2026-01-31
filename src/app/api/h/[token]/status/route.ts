import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canTransition, logAudit } from '@/lib/workflow';

/**
 * PATCH /api/h/[token]/status
 *
 * Changes event workflow status.
 *
 * CRITICAL:
 * - Capture fromStatus BEFORE any updates (for audit and transition validation)
 * - Validate transition with canTransition()
 * - Freeze warnings are handled by /api/events/[id]/transition endpoint (soft warnings, don't block)
 * - Transaction: update + audit + optional override log
 * - Log override when unfreezing (FROZEN → CONFIRMING)
 */
export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Capture old status BEFORE any updates
  const fromStatus = context.event.status;

  const body = await request.json();
  const { status, guestCount, unfreezeReason } = body;

  // Build update data from provided fields
  const updateData: any = {};

  if (status !== undefined) {
    // Block status changes on completed events
    if (fromStatus === 'COMPLETE') {
      return NextResponse.json({ error: 'Cannot modify completed event status' }, { status: 403 });
    }

    // Validate unfreeze reason if unfreezing
    if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
      if (!unfreezeReason || unfreezeReason.trim() === '') {
        return NextResponse.json(
          {
            error: 'A reason is required to unfreeze the event',
          },
          { status: 400 }
        );
      }
    }

    // Validate state transition
    if (!canTransition(fromStatus, status)) {
      return NextResponse.json(
        {
          error: `Invalid transition from ${fromStatus} to ${status}`,
        },
        { status: 400 }
      );
    }

    // Note: Hard freeze gate removed - now using soft warnings in /api/events/[id]/transition
    // Warnings inform but don't block freeze action

    updateData.status = status;
  }

  if (guestCount !== undefined) {
    updateData.guestCount = guestCount;
  }

  // Require at least one field to update
  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  // Single transaction for update + all audit logs
  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: context.event.id },
      data: updateData,
    });

    // Only log if status changed (not for guest count changes)
    if (status !== undefined) {
      await logAudit(tx, {
        eventId: context.event.id,
        actorId: context.person.id,
        actionType: 'EVENT_STATUS_CHANGE',
        targetType: 'Event',
        targetId: context.event.id,
        details: `Changed status from ${fromStatus} to ${status}`,
      });

      // Log override in same transaction with reason
      if (fromStatus === 'FROZEN' && status === 'CONFIRMING') {
        await logAudit(tx, {
          eventId: context.event.id,
          actorId: context.person.id,
          actionType: 'OVERRIDE_UNFREEZE',
          targetType: 'Event',
          targetId: context.event.id,
          details: `Host unfroze event. Reason: ${unfreezeReason}`,
        });
      }
    }

    return event;
  });

  return NextResponse.json({ event: updated });
}
