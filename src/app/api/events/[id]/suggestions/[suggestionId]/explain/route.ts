// GET /api/events/[id]/suggestions/[suggestionId]/explain - Get explanation
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

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

    // Generate explanation based on conflict type
    const explanation = generateExplanation(conflict);

    return NextResponse.json({
      explanation,
    });
  } catch (error) {
    console.error('Error generating explanation:', error);
    return NextResponse.json(
      {
        error: 'Failed to generate explanation',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

function generateExplanation(conflict: any) {
  const baseExplanation = {
    id: conflict.id,
    claimType: conflict.claimType,
    source: getSource(conflict),
    confidence: getConfidence(conflict),
    reasoning: getReasoning(conflict),
  };

  return baseExplanation;
}

function getSource(conflict: any): string {
  switch (conflict.type) {
    case 'QUANTITY_MISSING':
      return 'Critical items analysis - items marked as critical must have specified quantities before proceeding';
    case 'TIMING':
      return 'Equipment capacity analysis - based on venue equipment count and item timing requirements';
    case 'DIETARY_GAP':
      return 'Dietary requirements - based on guest dietary needs specified in event details';
    case 'COVERAGE_GAP':
      return 'Occasion patterns - based on typical food categories for this type of event';
    default:
      return 'Plan analysis';
  }
}

function getConfidence(conflict: any): 'high' | 'medium' | 'low' {
  switch (conflict.claimType) {
    case 'CONSTRAINT':
      return 'high'; // Hard constraints
    case 'RISK':
      return 'medium'; // Potential issues
    case 'PATTERN':
      return 'medium'; // Based on common patterns
    case 'PREFERENCE':
      return 'low'; // Suggestions only
    case 'ASSUMPTION':
      return 'low'; // Assumptions that might not apply
    default:
      return 'medium';
  }
}

function getReasoning(conflict: any): string {
  switch (conflict.type) {
    case 'QUANTITY_MISSING':
      return `This is a hard constraint: critical items must have specified quantities before the event can transition to the next phase. Without specified quantities, coordinators cannot properly prepare and shopping lists will be incomplete. You can either specify the exact quantity needed, or acknowledge the placeholder if the coordinator will determine the final amount.`;

    case 'TIMING':
      return `This is a capacity constraint: ${conflict.description} Simultaneous cooking requirements exceed available equipment. This could lead to delays, cold food, or coordination issues. Consider staggering cooking times, using alternative cooking methods (BBQ, stovetop), or preparing some items in advance.`;

    case 'DIETARY_GAP':
      return `This is a dietary constraint: You specified ${conflict.guestCount} guest(s) with ${conflict.dietaryType} dietary needs, but the current plan has no items to accommodate them. This is a critical issue as these guests would have nothing suitable to eat. Add ${conflict.dietaryType} options to ensure all guests are catered for.`;

    case 'COVERAGE_GAP':
      return `This is based on typical patterns for ${conflict.category} events. While not required, most ${conflict.category} gatherings include these categories to provide a complete meal experience. You can add these categories, or dismiss this suggestion if your event doesn't need them.`;

    default:
      return conflict.description;
  }
}
