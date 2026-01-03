// GET /api/events/[id]/teams - Get teams for an event
// POST /api/events/[id]/teams - Create a new team
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

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json();

    const { name, scope, domain, coordinatorId } = body;

    if (!name || !scope || !coordinatorId) {
      return NextResponse.json(
        { error: 'name, scope, and coordinatorId are required' },
        { status: 400 }
      );
    }

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Create team
    const team = await prisma.team.create({
      data: {
        name,
        scope,
        domain: domain || null,
        domainConfidence: domain ? 'HIGH' : 'MEDIUM',
        source: 'MANUAL',
        eventId,
        coordinatorId
      },
      include: {
        coordinator: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    return NextResponse.json({ team }, { status: 201 });
  } catch (error) {
    console.error('Error creating team:', error);
    return NextResponse.json(
      {
        error: 'Failed to create team',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
