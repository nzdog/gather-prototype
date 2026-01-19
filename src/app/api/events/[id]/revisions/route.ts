// POST /api/events/[id]/revisions - Create manual revision snapshot
// GET /api/events/[id]/revisions - List revisions (last 5)
// SECURITY: POST requires HOST role, derives actorId from session

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRevision } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';

/**
 * GET /api/events/[id]/revisions
 * List revisions for an event (last 5)
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Get last 5 revisions
    const revisions = await prisma.planRevision.findMany({
      where: { eventId },
      orderBy: { revisionNumber: 'desc' },
      take: 5,
      select: {
        id: true,
        revisionNumber: true,
        createdAt: true,
        createdBy: true,
        reason: true,
      },
    });

    return NextResponse.json({
      revisions,
    });
  } catch (error) {
    console.error('Error fetching revisions:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch revisions',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/events/[id]/revisions
 * Create a manual revision snapshot
 * SECURITY: Derives actorId from authenticated session user
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SECURITY: Require HOST role for creating revisions
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

    const body = await request.json();
    const { reason } = body;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Create revision
    const revisionId = await createRevision(eventId, actorId, reason);

    // Get the created revision details
    const revision = await prisma.planRevision.findUnique({
      where: { id: revisionId },
      select: {
        id: true,
        revisionNumber: true,
        createdAt: true,
        createdBy: true,
        reason: true,
      },
    });

    return NextResponse.json({
      success: true,
      revision,
    });
  } catch (error) {
    console.error('Error creating revision:', error);
    return NextResponse.json(
      {
        error: 'Failed to create revision',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
