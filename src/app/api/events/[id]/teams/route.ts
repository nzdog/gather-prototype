// GET /api/events/[id]/teams - Get teams for an event
// POST /api/events/[id]/teams - Create a new team
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const teams = await prisma.team.findMany({
      where: { eventId },
      include: {
        coordinator: {
          select: {
            id: true,
            name: true,
          },
        },
        _count: {
          select: {
            items: true,
            members: true,
          },
        },
        items: {
          select: {
            id: true,
            assignment: {
              select: {
                id: true,
              },
            },
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });

    // Calculate unassigned count for each team
    const teamsWithUnassignedCount = teams.map((team) => {
      const unassignedCount = team.items.filter((item) => !item.assignment).length;
      const { items, ...teamWithoutItems } = team;
      return {
        ...teamWithoutItems,
        unassignedCount,
      };
    });

    return NextResponse.json({
      teams: teamsWithUnassignedCount,
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

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Only HOST and COHOST can create teams
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    const { name, scope, domain, coordinatorId } = body;

    // SECURITY: Validate name
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    if (name.length > 100) {
      return NextResponse.json({ error: 'Name too long (max 100 characters)' }, { status: 400 });
    }

    // SECURITY: Validate scope (optional)
    if (scope !== undefined && scope !== null) {
      if (typeof scope !== 'string') {
        return NextResponse.json({ error: 'Scope must be a string' }, { status: 400 });
      }
      if (scope.length > 50) {
        return NextResponse.json({ error: 'Scope too long (max 50 characters)' }, { status: 400 });
      }
    }

    // SECURITY: Validate domain (optional, must be valid enum value)
    const validDomains = [
      'PROTEINS',
      'VEGETARIAN_MAINS',
      'SIDES',
      'SALADS',
      'STARTERS',
      'DESSERTS',
      'DRINKS',
      'LATER_FOOD',
      'SETUP',
      'CLEANUP',
    ];
    if (domain !== undefined && domain !== null && !validDomains.includes(domain)) {
      return NextResponse.json({ error: 'Invalid domain value' }, { status: 400 });
    }

    // SECURITY: Validate coordinatorId
    if (!coordinatorId || typeof coordinatorId !== 'string' || coordinatorId.trim().length === 0) {
      return NextResponse.json({ error: 'Coordinator ID is required' }, { status: 400 });
    }

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Create team with sanitized inputs
    const team = await prisma.team.create({
      data: {
        name: name.trim(),
        scope: scope?.trim() || null,
        domain: domain || null,
        domainConfidence: domain ? 'HIGH' : 'MEDIUM',
        source: 'MANUAL',
        eventId,
        coordinatorId: coordinatorId.trim(),
      },
      include: {
        coordinator: {
          select: {
            id: true,
            name: true,
          },
        },
      },
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
