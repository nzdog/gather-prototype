// POST /api/events/[id]/transition
// Transitions event from DRAFT to CONFIRMING
// - Runs gate check first
// - If passed: creates PlanSnapshot, updates event status to CONFIRMING, sets structureMode to LOCKED
// - Records transitionAttempt with result

import { NextRequest, NextResponse } from 'next/server';
import { transitionToConfirming } from '@/lib/workflow';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // Parse request body to get actorId
    const body = await request.json();
    const actorId = body.actorId;

    if (!actorId) {
      return NextResponse.json(
        { error: 'actorId is required in request body' },
        { status: 400 }
      );
    }

    // Perform transition
    const result = await transitionToConfirming(eventId, actorId);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          blocks: result.blocks,
          error: result.error
        },
        { status: result.blocks ? 400 : 500 }
      );
    }

    return NextResponse.json({
      success: true,
      snapshotId: result.snapshotId,
      message: 'Event successfully transitioned to CONFIRMING status'
    });
  } catch (error) {
    console.error('Error transitioning event:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to transition event',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
