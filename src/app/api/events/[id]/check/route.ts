// POST /api/events/[id]/check - Check plan for conflicts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { detectConflicts, saveConflicts } from '@/lib/ai/check';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SECURITY: Require HOST role for AI conflict check (high-cost operation)
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

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

    // Detect all conflicts using AI logic
    const detectedConflicts = await detectConflicts(eventId);

    // Save conflicts to database
    await saveConflicts(eventId, detectedConflicts);

    // Get all conflicts
    const conflicts = await prisma.conflict.findMany({
      where: { eventId },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({
      success: true,
      message: 'Plan check complete',
      conflicts: conflicts.length,
      detected: detectedConflicts.length,
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
