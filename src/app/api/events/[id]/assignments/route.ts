import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/events/[id]/assignments - List all assignments
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;

    const assignments = await prisma.assignment.findMany({
      where: {
        item: {
          team: {
            eventId,
          },
        },
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            name: true,
            critical: true,
            team: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ assignments });
  } catch (error: any) {
    console.error('Error loading assignments:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
