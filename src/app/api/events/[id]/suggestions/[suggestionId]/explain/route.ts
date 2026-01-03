// GET /api/events/[id]/suggestions/[suggestionId]/explain - Get explanation
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateExplanation } from '@/lib/ai/generate';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; suggestionId: string }> }
) {
  try {
    const { id: eventId, suggestionId } = await context.params;

    // Get conflict
    const conflict = await prisma.conflict.findUnique({
      where: { id: suggestionId },
    });

    if (!conflict) {
      return NextResponse.json(
        { error: 'Suggestion not found' },
        { status: 404 }
      );
    }

    if (conflict.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Suggestion does not belong to this event' },
        { status: 403 }
      );
    }

    // Generate explanation using Claude AI
    console.log('[Explain] Generating explanation for conflict:', conflict.id);

    const aiExplanation = await generateExplanation({
      type: conflict.type,
      severity: conflict.severity,
      claimType: conflict.claimType,
      description: conflict.description,
      metadata: {
        affectedItems: conflict.affectedItems,
        affectedDays: conflict.affectedDays,
        equipment: conflict.equipment,
        timeSlot: conflict.timeSlot,
        capacityAvailable: conflict.capacityAvailable,
        capacityRequired: conflict.capacityRequired,
        dietaryType: conflict.dietaryType,
        guestCount: conflict.guestCount,
        category: conflict.category,
        currentCoverage: conflict.currentCoverage,
        minimumNeeded: conflict.minimumNeeded,
      },
    });

    const explanation = {
      id: conflict.id,
      claimType: conflict.claimType,
      source: aiExplanation.source,
      confidence: aiExplanation.confidence,
      reasoning: aiExplanation.reasoning,
      suggestions: aiExplanation.suggestions,
    };

    console.log('[Explain] Successfully generated explanation');

    return NextResponse.json({
      explanation,
    });
  } catch (error) {
    console.error('[Explain] Error generating explanation:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate explanation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
