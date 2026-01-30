// POST /api/events/[id]/transition
// Transitions event between statuses:
// - DRAFT → CONFIRMING: Runs gate check, creates snapshot, locks structure
// - CONFIRMING → FROZEN: Checks freeze readiness, returns warnings (doesn't block)
// SECURITY: Requires HOST role, derives actorId from authenticated session

import { NextRequest, NextResponse } from 'next/server';
import {
  transitionToConfirming,
  checkFreezeReadiness,
  canTransition,
  logAudit,
} from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

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

  try {
    // SECURITY: Derive actorId from authenticated session user (never trust request body)
    let person = await prisma.person.findFirst({
      where: { userId: auth.user.id },
    });

    if (!person) {
      // Create Person record if it doesn't exist (migration support)
      person = await prisma.person.create({
        data: {
          name: auth.user.email.split('@')[0],
          email: auth.user.email,
          userId: auth.user.id,
        },
      });
    }

    const actorId = person.id;

    // Get current event status
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Handle DRAFT → CONFIRMING transition
    if (event.status === 'DRAFT') {
      const result = await transitionToConfirming(eventId, actorId);

      if (!result.success) {
        return NextResponse.json(
          {
            success: false,
            blocks: result.blocks,
            error: result.error,
          },
          { status: result.blocks ? 400 : 500 }
        );
      }

      return NextResponse.json({
        success: true,
        snapshotId: result.snapshotId,
        message: 'Event successfully transitioned to CONFIRMING status',
      });
    }

    // Handle CONFIRMING → FROZEN transition
    if (event.status === 'CONFIRMING') {
      // Check freeze readiness (warnings only, doesn't block)
      const freezeCheck = await checkFreezeReadiness(eventId);

      // Validate transition is allowed
      if (!canTransition(event.status, 'FROZEN')) {
        return NextResponse.json(
          { error: 'Can only freeze from CONFIRMING status' },
          { status: 400 }
        );
      }

      // Perform transition
      await prisma.$transaction(async (tx) => {
        await tx.event.update({
          where: { id: eventId },
          data: { status: 'FROZEN' },
        });

        await logAudit(tx, {
          eventId,
          actorId,
          actionType: 'TRANSITION_TO_FROZEN',
          targetType: 'Event',
          targetId: eventId,
          details: `Transitioned event to FROZEN status. Compliance: ${freezeCheck.complianceRate}%. Warnings: ${freezeCheck.warnings.length}`,
        });
      });

      // Fetch updated event
      const updatedEvent = await prisma.event.findUnique({
        where: { id: eventId },
      });

      return NextResponse.json({
        success: true,
        event: updatedEvent,
        freezeWarnings: freezeCheck.warnings,
        complianceRate: freezeCheck.complianceRate,
        message: 'Event successfully transitioned to FROZEN status',
      });
    }

    // Invalid transition
    return NextResponse.json(
      { error: `Cannot transition from ${event.status} status` },
      { status: 400 }
    );
  } catch (error) {
    // SECURITY: Never expose internal error details (no Prisma errors)
    console.error('Error transitioning event:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
