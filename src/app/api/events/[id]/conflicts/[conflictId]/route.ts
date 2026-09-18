// GET /api/events/[id]/conflicts/[conflictId] - Get conflict details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; conflictId: string }> }
) {
  const { id: eventId, conflictId } = await context.params;

  // GTC-267: unauthenticated before this. The guard runs before the lookup, so a
  // bogus conflictId is refused rather than answered with a 404 that confirms it.
  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
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
      return NextResponse.json({ error: 'Conflict not found' }, { status: 404 });
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
    return NextResponse.json({ error: 'Failed to fetch conflict' }, { status: 500 });
  }
}
