// GET /api/events/[id]/conflicts/[conflictId] - Get conflict details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  try {
    const { id: eventId, conflictId } = await context.params;

    const conflict = await prisma.conflict.findUnique({
      where: { id: conflictId },
      include: {
        acknowledgements: {
          where: { status: 'ACTIVE' },
          orderBy: { acknowledgedAt: 'desc' },
        },
      },
    });

    if (!conflict) {
      return NextResponse.json(
        { error: 'Conflict not found' },
        { status: 404 }
      );
    }

    // Verify conflict belongs to event
    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Conflict does not belong to this event' },
        { status: 403 }
      );
    }

    return NextResponse.json({ conflict });
  } catch (error) {
    console.error('Error fetching conflict:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conflict' },
      { status: 500 }
    );
  }
}
