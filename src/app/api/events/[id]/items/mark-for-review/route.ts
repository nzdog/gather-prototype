// POST /api/events/[id]/items/mark-for-review - Mark all items as AI-generated and unconfirmed for review
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';

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

    if (result.count > 0) {
      const reviewActor = await ledgerActorForUser(auth.user, auth.role);
      await prisma.$transaction((tx) =>
        recordChange(tx, {
          eventId,
          actor: reviewActor,
          changes: [
            {
              action: 'EDIT_ITEM',
              targetType: 'Item',
              targetId: eventId,
              field: 'reviewState',
              before: null,
              after: { count: result.count, note: 'marked for review' },
            },
          ],
        })
      );
    }

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
