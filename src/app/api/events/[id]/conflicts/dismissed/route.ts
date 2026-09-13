// GET /api/events/[id]/conflicts/dismissed - List dismissed conflicts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // GTC-267: unauthenticated before this.
  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get all dismissed conflicts
    const dismissedConflicts = await prisma.conflict.findMany({
      where: {
        eventId,
        status: 'DISMISSED',
      },
      orderBy: { dismissedAt: 'desc' },
    });

    return NextResponse.json({ conflicts: dismissedConflicts });
  } catch (error) {
    console.error('Error fetching dismissed conflicts:', error);
    return NextResponse.json({ error: 'Failed to fetch dismissed conflicts' }, { status: 500 });
  }
}
