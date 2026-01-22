import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// GET /api/events/[id]/assignments - List all assignments
// SECURITY: Requires event role authentication
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;

    // SECURITY: Require HOST or COORDINATOR role to view assignments
    const auth = await requireEventRole(eventId, ['HOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

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
