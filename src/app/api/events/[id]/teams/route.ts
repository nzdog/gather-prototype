// GET /api/events/[id]/teams - Get teams for an event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    const teams = await prisma.team.findMany({
      where: { eventId },
      include: {
        coordinator: {
          select: {
            id: true,
            name: true,
          }
        },
        _count: {
          select: {
            items: true,
          }
        }
      },
      orderBy: {
        name: 'asc',
      }
    });

    return NextResponse.json({
      teams,
    });
  } catch (error) {
    console.error('Error fetching teams:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch teams',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
