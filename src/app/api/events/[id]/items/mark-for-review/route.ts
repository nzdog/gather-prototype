// POST /api/events/[id]/items/mark-for-review - Mark all items as AI-generated and unconfirmed for review
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SECURITY: Require HOST role to mark items for review
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // Mark all items for this event as aiGenerated: true and userConfirmed: false
    // This allows them to show up in the review panel
    const result = await prisma.item.updateMany({
      where: {
        team: {
          eventId,
        },
      },
      data: {
        aiGenerated: true,
        userConfirmed: false,
      },
    });

    return NextResponse.json({
      success: true,
      markedCount: result.count,
    });
  } catch (error) {
    console.error('[Mark for Review] Error marking items:', error);
    return NextResponse.json(
      {
        error: 'Failed to mark items for review',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
