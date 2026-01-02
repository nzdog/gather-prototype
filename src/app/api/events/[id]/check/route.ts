// POST /api/events/[id]/check - Check plan for conflicts
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

    // Update check plan tracking
    await prisma.event.update({
      where: { id: eventId },
      data: {
        checkPlanInvocations: { increment: 1 },
        lastCheckPlanAt: new Date(),
        firstCheckPlanAt: event.firstCheckPlanAt || new Date(),
        checkPlanBeforeGate: true,
      },
    });

    // For now, create a demo conflict if there are critical placeholders
    const criticalPlaceholders = await prisma.item.findMany({
      where: {
        team: { eventId },
        critical: true,
        quantityState: 'PLACEHOLDER',
        placeholderAcknowledged: false,
      },
    });

    if (criticalPlaceholders.length > 0) {
      // Create or update a conflict about placeholder quantities
      const fingerprint = `placeholder-quantities-${eventId}`;

      const existingConflict = await prisma.conflict.findFirst({
        where: { eventId, fingerprint },
      });

      if (!existingConflict) {
        await prisma.conflict.create({
          data: {
            eventId,
            fingerprint,
            type: 'QUANTITY',
            severity: 'CRITICAL',
            claimType: 'SPEC_INCOMPLETE',
            resolutionClass: 'DEFER_OR_SPECIFY',
            title: 'Critical Items Have Placeholder Quantities',
            description: `${criticalPlaceholders.length} critical item(s) have placeholder quantities that need to be specified or acknowledged before transitioning.`,
            affectedItems: criticalPlaceholders.map(i => i.id) as any,
            status: 'OPEN',
          },
        });
      }
    }

    // Get all conflicts
    const conflicts = await prisma.conflict.findMany({
      where: { eventId },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      message: 'Plan check complete',
      conflicts: conflicts.length,
    });
  } catch (error) {
    console.error('Error checking plan:', error);
    return NextResponse.json(
      {
        error: 'Failed to check plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
