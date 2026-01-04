// GET /api/events/[id]/suggestions - Get suggestions (open conflicts)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get all open conflicts (these are suggestions)
    const suggestions = await prisma.conflict.findMany({
      where: {
        eventId,
        status: { in: ['OPEN', 'ACKNOWLEDGED'] },
      },
      orderBy: [
        { severity: 'asc' }, // CRITICAL first
        { createdAt: 'desc' },
      ],
    });

    // Transform conflicts to suggestion format
    const formattedSuggestions = suggestions.map((conflict) => ({
      id: conflict.id,
      type: conflict.type,
      severity: conflict.severity,
      title: conflict.title,
      description: conflict.description,
      suggestion: conflict.suggestion,
      affectedItems: conflict.affectedItems,
      canAccept: conflict.resolutionClass === 'FIX_IN_PLAN',
      canDismiss: true,
    }));

    return NextResponse.json({
      suggestions: formattedSuggestions,
      count: formattedSuggestions.length,
    });
  } catch (error) {
    console.error('Error fetching suggestions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch suggestions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
