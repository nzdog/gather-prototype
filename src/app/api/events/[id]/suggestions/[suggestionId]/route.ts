// GET /api/events/[id]/suggestions/[suggestionId] - Get suggestion details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; suggestionId: string }> }
) {
  try {
    const { id: eventId, suggestionId } = await context.params;

    // Get conflict (suggestion)
    const conflict = await prisma.conflict.findUnique({
      where: { id: suggestionId },
    });

    if (!conflict) {
      return NextResponse.json({ error: 'Suggestion not found' }, { status: 404 });
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Suggestion does not belong to this event' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      suggestion: {
        id: conflict.id,
        type: conflict.type,
        severity: conflict.severity,
        title: conflict.title,
        description: conflict.description,
        suggestion: conflict.suggestion,
        affectedItems: conflict.affectedItems,
        canAccept: conflict.resolutionClass === 'FIX_IN_PLAN',
        canDismiss: true,
      },
    });
  } catch (error) {
    console.error('Error fetching suggestion:', error);
    return NextResponse.json({ error: 'Failed to fetch suggestion' }, { status: 500 });
  }
}
