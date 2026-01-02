// POST /api/events/[id]/generate - Generate plan with AI
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // For now, create a simple demo team and items
    // In production, this would call AI to generate a full plan

    // Create a demo team
    const team = await prisma.team.create({
      data: {
        name: 'Main Dishes',
        scope: 'Responsible for main course items',
        eventId,
        coordinatorId: event.hostId, // Use host as coordinator for demo
      },
    });

    // Create demo items - use separate creates to handle optional fields properly
    await prisma.item.create({
      data: {
        name: 'Roast Turkey',
        teamId: team.id,
        critical: true,
        quantityState: 'PLACEHOLDER',
        quantityText: 'TBD based on final guest count',
        placeholderAcknowledged: false,
      },
    });

    await prisma.item.create({
      data: {
        name: 'Stuffing',
        teamId: team.id,
        critical: false,
        quantityAmount: 5,
        quantityUnit: 'KG',
        quantityState: 'SPECIFIED',
      },
    });

    await prisma.item.create({
      data: {
        name: 'Gravy',
        teamId: team.id,
        critical: true,
        quantityState: 'PLACEHOLDER',
        quantityText: 'Enough for all guests',
        placeholderAcknowledged: false,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Plan generated successfully',
      teams: 1,
      items: 3,
    });
  } catch (error) {
    console.error('Error generating plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
