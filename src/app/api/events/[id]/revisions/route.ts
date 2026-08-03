// POST /api/events/[id]/revisions - Create manual revision snapshot
// GET /api/events/[id]/revisions - List revisions (uncapped, cursor-paginated)
// SECURITY: POST requires HOST role, derives actorId from session

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createRevision } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';

/**
 * Page size when the caller does not ask for one. A DEFAULT, not a cap — `?limit=`
 * raises it and `?cursor=` walks the rest.
 */
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/**
 * GET /api/events/[id]/revisions
 * List revisions for an event, newest first. Cursor-paginated, uncapped.
 *
 * GTC-168 (A2): the previous `take: 5` was a hard cap — the API could not return a
 * sixth revision at all, so history older than five steps was unreachable by any
 * caller. Hinge §2 requires "the complete history always reachable whatever the
 * display defaults to". The UI may still show five; the API may not.
 *
 * Query params: `?limit=` (default 25, max 200) and `?cursor=` (a revision id;
 * results continue after it). `nextCursor` is null on the last page.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    const { searchParams } = request.nextUrl;
    const rawLimit = Number.parseInt(searchParams.get('limit') ?? '', 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursor = searchParams.get('cursor');

    // Fetch one extra row to learn whether a next page exists without a second query.
    const rows = await prisma.planRevision.findMany({
      where: { eventId },
      orderBy: { revisionNumber: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        revisionNumber: true,
        createdAt: true,
        createdBy: true,
        reason: true,
      },
    });

    const hasMore = rows.length > limit;
    const revisions = hasMore ? rows.slice(0, limit) : rows;

    const total = await prisma.planRevision.count({ where: { eventId } });

    return NextResponse.json({
      revisions,
      nextCursor: hasMore ? revisions[revisions.length - 1].id : null,
      total,
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
