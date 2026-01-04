// POST /api/events/[id]/conflicts/[conflictId]/delegate - Delegate conflict to coordinator
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

    // Verify conflict can be delegated
    if (!conflict.canDelegate) {
      return NextResponse.json({ error: 'This conflict cannot be delegated' }, { status: 400 });
    }

    // Update conflict status to delegated
    const updatedConflict = await prisma.conflict.update({
      where: { id: conflictId },
      data: {
        status: 'DELEGATED',
        delegatedTo: 'COORDINATOR',
        delegatedAt: new Date(),
      },
    });

    return NextResponse.json({ conflict: updatedConflict });
  } catch (error) {
    console.error('Error delegating conflict:', error);
    return NextResponse.json({ error: 'Failed to delegate conflict' }, { status: 500 });
  }
}
