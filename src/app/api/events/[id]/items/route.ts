// GET /api/events/[id]/items - Get all items for an event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // GTC-267: unauthenticated before this, and the widest of the nine by content —
  // it returns every guest's name against the item they were asked to bring.
  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const items = await prisma.item.findMany({
      where: {
        team: { eventId },
      },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            displayOrder: true,
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
      orderBy: [{ team: { name: 'asc' } }, { displayOrder: 'asc' }, { createdAt: 'asc' }],
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
