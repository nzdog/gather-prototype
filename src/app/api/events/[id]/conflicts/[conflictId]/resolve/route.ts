// POST /api/events/[id]/conflicts/[conflictId]/resolve - Mark conflict as resolved
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;

    // SECURITY: Require HOST role for conflict operations
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
    const body = await request.json();
    const { resolvedBy } = body; // Host ID

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

    // Update conflict status to resolved
    const updatedConflict = await prisma.conflict.update({
      where: { id: conflictId },
      data: {
        status: 'RESOLVED',
        resolvedBy,
        resolvedAt: new Date(),
      },
    });

    return NextResponse.json({ conflict: updatedConflict });
  } catch (error) {
    console.error('Error resolving conflict:', error);
    return NextResponse.json({ error: 'Failed to resolve conflict' }, { status: 500 });
  }
}
