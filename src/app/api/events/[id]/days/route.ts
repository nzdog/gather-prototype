// GET /api/events/[id]/days - Get days for an event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // Fetch days for this event
    const days = await prisma.day.findMany({
      where: { eventId },
      orderBy: { date: 'asc' },
      select: {
        id: true,
        name: true,
        date: true,
      }
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
