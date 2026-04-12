import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// GET /api/events/[id]/households - List households for event
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const households = await prisma.household.findMany({
      where: { eventId },
      include: {
        members: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({ households });
  } catch (error: any) {
    console.error('Error loading households:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/events/[id]/households - Create a household for this event
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { childCount } = body;

    const household = await prisma.household.create({
      data: {
        eventId,
        childCount: childCount ?? 0,
      },
      include: {
        members: true,
      },
    });

    return NextResponse.json({ household }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
