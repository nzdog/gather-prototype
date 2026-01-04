// GET /api/events/[id]/teams/[teamId]/items - Get items for a team
// POST /api/events/[id]/teams/[teamId]/items - Create a new item for a team
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const { id: eventId, teamId } = await context.params;

    // Verify team exists and belongs to event
    const team = await prisma.team.findUnique({
      where: { id: teamId },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.eventId !== eventId) {
      return NextResponse.json({ error: 'Team does not belong to this event' }, { status: 400 });
    }

    // Fetch items for this team
    const items = await prisma.item.findMany({
      where: { teamId },
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
        assignment: {
          include: {
            person: true,
          },
        },
        day: true,
      },
      orderBy: [{ critical: 'desc' }, { name: 'asc' }],
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('Error fetching team items:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const { id: eventId, teamId } = await context.params;
    const body = await request.json();

    const { name, description, quantityAmount, quantityUnit, critical, dietaryTags } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Verify team exists and belongs to event
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: { event: true },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.eventId !== eventId) {
      return NextResponse.json({ error: 'Team does not belong to this event' }, { status: 400 });
    }

    // Create item
    const itemData: any = {
      name,
      description: description || null,
      critical: critical || false,
      criticalSource: critical ? 'HOST' : null,
      source: 'MANUAL',
      status: 'UNASSIGNED',
      teamId,
    };

    // Add quantity if provided
    if (quantityAmount && quantityUnit) {
      itemData.quantityAmount = quantityAmount;
      itemData.quantityUnit = quantityUnit;
      itemData.quantityState = 'SPECIFIED';
    }

    // Add dietary tags if provided
    if (dietaryTags && Array.isArray(dietaryTags)) {
      itemData.dietaryTags = dietaryTags;

      // Also set boolean flags for backward compatibility
      if (dietaryTags.includes('vegetarian')) itemData.vegetarian = true;
      if (dietaryTags.includes('glutenFree')) itemData.glutenFree = true;
      if (dietaryTags.includes('dairyFree')) itemData.dairyFree = true;
    }

    const item = await prisma.item.create({
      data: itemData,
      include: {
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error('Error creating item:', error);
    return NextResponse.json(
      {
        error: 'Failed to create item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
