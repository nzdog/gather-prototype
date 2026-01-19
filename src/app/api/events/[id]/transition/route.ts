// POST /api/events/[id]/transition
// Transitions event from DRAFT to CONFIRMING
// - Runs gate check first
// - If passed: creates PlanSnapshot, updates event status to CONFIRMING, sets structureMode to LOCKED
// - Records transitionAttempt with result
// SECURITY: Requires HOST role, derives actorId from authenticated session

import { NextRequest, NextResponse } from 'next/server';
import { transitionToConfirming } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    // Perform transition
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
