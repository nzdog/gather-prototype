// GET /api/events/[id]/items - Get all items for an event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const items = await prisma.item.findMany({
      where: {
        team: { eventId },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        assignment: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
        day: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [{ critical: 'desc' }, { team: { name: 'asc' } }, { name: 'asc' }],
    });

    return NextResponse.json({
      items,
    });
  } catch (error) {
    console.error('Error fetching items:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
