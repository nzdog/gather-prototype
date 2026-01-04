// POST /api/events/[id]/conflicts/[conflictId]/dismiss - Dismiss conflict
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;

    // Verify conflict exists and belongs to event
    const conflict = await prisma.conflict.findUnique({
      where: { id: conflictId },
    });

    if (!conflict) {
      return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Conflict does not belong to this event' },
        { status: 403 }
      );
    }

    // Update conflict status to dismissed
    // inputsReferenced is already stored on the conflict from detection
    const updatedConflict = await prisma.conflict.update({
      where: { id: conflictId },
      data: {
        status: 'DISMISSED',
        dismissedAt: new Date(),
      },
    });

    return NextResponse.json({ conflict: updatedConflict });
  } catch (error) {
    console.error('Error dismissing conflict:', error);
    return NextResponse.json({ error: 'Failed to dismiss conflict' }, { status: 500 });
  }
}
