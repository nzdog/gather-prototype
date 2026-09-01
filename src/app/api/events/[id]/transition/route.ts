// POST /api/events/[id]/transition
// The ONE authored transition that survives the send-lock model (GTC-169):
// - DRAFT → CONFIRMING: Runs gate check, creates snapshot, locks structure,
//   generates access tokens
// SECURITY: Requires HOST role, derives actorId from authenticated session

import { NextRequest, NextResponse } from 'next/server';
import { transitionToConfirming } from '@/lib/workflow';
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

    // GTC-169 (A3a): the CONFIRMING → FROZEN and FROZEN → COMPLETE branches were
    // DELETED. Neither destination exists in the send-lock model:
    //
    //   - The press is not a transition. It stamps Event.sentAt (see
    //     /api/events/[id]/confirm-invites-sent, and GTC-189 / I2 for the real
    //     Hinge). FROZEN was a second ceremony bolted on after the send that
    //     already existed.
    //   - COMPLETE is derived from the calendar, not declared. "No one declares it.
    //     The calendar does the transition, silently" (Moment 4 §10.1). See
    //     isComplete() in src/lib/lifecycle.ts.
    //
    // The <80%-compliance-requires-a-freeze-reason rule went with them: demanding
    // justification at a threshold is what Moment 4 §7 forbids outright.

    // Invalid transition — DRAFT → CONFIRMING is the only one left.
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
