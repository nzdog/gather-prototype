// POST /api/events/[id]/revisions/[revisionId]/restore - Restore to revision
// SECURITY: Requires HOST role, derives actorId from session

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { restoreFromRevision } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';

/**
 * POST /api/events/[id]/revisions/[revisionId]/restore
 * Restore event to a previous revision state
 * SECURITY: Derives actorId from authenticated session user
 */
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; revisionId: string }> }
) {
  try {
    const { id: eventId, revisionId } = await context.params;

    // SECURITY: Require HOST role for restoring revisions (state mutation)
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // SECURITY: Derive actorId from authenticated session user
    let person = await prisma.person.findFirst({
      where: { userId: auth.user.id },
    });

    if (!person) {
      // Create Person record if it doesn't exist (migration support)
      person = await prisma.person.create({
        data: {
          name: auth.user.email.split('@')[0],
          email: auth.user.email,
          userId: auth.user.id,
        },
      });
    }

    const actorId = person.id;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, status: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Verify revision exists and belongs to this event
    const revision = await prisma.planRevision.findUnique({
      where: { id: revisionId },
      select: { id: true, eventId: true, revisionNumber: true, reason: true },
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

    // Perform restore
    await restoreFromRevision(eventId, revisionId, actorId);

    return NextResponse.json({
      success: true,
      message: `Event restored to revision #${revision.revisionNumber}`,
      revision: {
        id: revision.id,
        revisionNumber: revision.revisionNumber,
        reason: revision.reason,
      },
    });
  } catch (error) {
    console.error('Error restoring revision:', error);
    return NextResponse.json(
      {
        error: 'Failed to restore revision',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
