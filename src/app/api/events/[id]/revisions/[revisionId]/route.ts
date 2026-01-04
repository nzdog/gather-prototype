// GET /api/events/[id]/revisions/[revisionId] - Get revision snapshot

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/events/[id]/revisions/[revisionId]
 * Get a specific revision snapshot with full details
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const { id: eventId, revisionId } = await context.params;

    // Get the revision
    const revision = await prisma.planRevision.findUnique({
      where: { id: revisionId },
    });

    if (!revision) {
      return NextResponse.json({ error: 'Revision not found' }, { status: 404 });
    }

    if (revision.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Revision does not belong to this event' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      revision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        createdAt: revision.createdAt,
        createdBy: revision.createdBy,
        reason: revision.reason,
        teams: revision.teams,
        items: revision.items,
        days: revision.days,
        conflicts: revision.conflicts,
        acknowledgements: revision.acknowledgements,
      },
    });
  } catch (error) {
    console.error('Error fetching revision:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch revision',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
