// GET /api/events/[id]/review-items - Get AI-generated items for review
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Fetch all AI-generated items that haven't been confirmed yet
    const items = await prisma.item.findMany({
      where: {
        team: {
          eventId,
        },
        aiGenerated: true,
        userConfirmed: false,
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
            person: true,
          },
        },
      },
      orderBy: [{ team: { name: 'asc' } }, { name: 'asc' }],
    });

    // Group items by team
    const teamGroups: Record<
      string,
      {
        teamName: string;
        items: any[];
      }
    > = {};

    for (const item of items) {
      const teamName = item.team.name;
      if (!teamGroups[teamName]) {
        teamGroups[teamName] = {
          teamName,
          items: [],
        };
      }

      // Check if item was created in the last 30 seconds (newly regenerated)
      const isNew = new Date().getTime() - new Date(item.createdAt).getTime() < 30000;

      teamGroups[teamName].items.push({
        id: item.id,
        name: item.name,
        quantityAmount: item.quantityAmount,
        quantityUnit: item.quantityUnit,
        assignedTo: item.assignment?.person.name,
        teamName,
        isNew, // Flag to indicate if this is a newly regenerated item
      });
    }

    const groupsArray = Object.values(teamGroups);

    return NextResponse.json({
      success: true,
      teamGroups: groupsArray,
      totalItems: items.length,
    });
  } catch (error) {
    console.error('[Review Items] Error fetching items:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch review items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// POST /api/events/[id]/review-items - Confirm all items
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Mark all AI-generated items for this event as confirmed
    const result = await prisma.item.updateMany({
      where: {
        team: {
          eventId,
        },
        aiGenerated: true,
        userConfirmed: false,
      },
      data: {
        userConfirmed: true,
      },
    });

    return NextResponse.json({
      success: true,
      confirmedCount: result.count,
    });
  } catch (error) {
    console.error('[Review Items] Error confirming items:', error);
    return NextResponse.json(
      {
        error: 'Failed to confirm items',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
