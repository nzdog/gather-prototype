// GET /api/events/[id]/days - Get days for an event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // GTC-267: unauthenticated before this.
  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    // Fetch days for this event
    const days = await prisma.day.findMany({
      where: { eventId },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        name: true,
        date: true,
      },
    });

    return NextResponse.json({ days });
  } catch (error) {
    console.error('Error fetching days:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch days',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
