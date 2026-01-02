// POST /api/events/[id]/suggestions/[suggestionId]/dismiss - Dismiss suggestion
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; suggestionId: string }> }
) {
  try {
    const { id: eventId, suggestionId } = await context.params;

    // Get conflict
    const conflict = await prisma.conflict.findUnique({
      where: { id: suggestionId },
    });

    if (!conflict) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Suggestion does not belong to this event' },
        { status: 403 }
      );
    }

    // Mark conflict as dismissed
    const updatedConflict = await prisma.conflict.update({
      where: { id: suggestionId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json({
      success: true,
      conflict: updatedConflict,
      message: 'Suggestion dismissed',
    });
  } catch (error) {
    console.error('Error dismissing suggestion:', error);
    return NextResponse.json(
      {
        error: 'Failed to dismiss suggestion',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
