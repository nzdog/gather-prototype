// GET /api/events/[id]/conflicts - List conflicts
// Query params:
//   ?status=all - Include all conflicts (resolved, dismissed, etc.)
//   ?status=resolved - Only resolved conflicts
//   (default: active conflicts only)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ConflictStatus } from '@prisma/client';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;
    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get('status');

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json(
        { error: 'Event not found' },
        { status: 404 }
      );
    }

    // Build status filter based on query param
    let statusFilter: { in?: ConflictStatus[]; equals?: ConflictStatus } | undefined;

    if (statusParam === 'all') {
      // No filter - show all conflicts
      statusFilter = undefined;
    } else if (statusParam === 'resolved') {
      statusFilter = { equals: 'RESOLVED' };
    } else if (statusParam === 'dismissed') {
      statusFilter = { equals: 'DISMISSED' };
    } else {
      // Default: active conflicts only (not dismissed or resolved)
      statusFilter = { in: ['OPEN', 'ACKNOWLEDGED', 'DELEGATED'] };
    }

    // Get conflicts
    const conflicts = await prisma.conflict.findMany({
      where: {
        eventId,
        ...(statusFilter && { status: statusFilter }),
      },
      orderBy: [
        { severity: 'asc' }, // CRITICAL first (enum order)
        { createdAt: 'desc' },
      ],
    });

    // Build summary by status
    const summary = {
      total: conflicts.length,
      byStatus: {
        open: conflicts.filter(c => c.status === 'OPEN').length,
        acknowledged: conflicts.filter(c => c.status === 'ACKNOWLEDGED').length,
        resolved: conflicts.filter(c => c.status === 'RESOLVED').length,
        dismissed: conflicts.filter(c => c.status === 'DISMISSED').length,
        delegated: conflicts.filter(c => c.status === 'DELEGATED').length,
      },
      bySeverity: {
        critical: conflicts.filter(c => c.severity === 'CRITICAL').length,
        significant: conflicts.filter(c => c.severity === 'SIGNIFICANT').length,
        advisory: conflicts.filter(c => c.severity === 'ADVISORY').length,
      },
    };

    return NextResponse.json({
      conflicts,
      summary,
      filter: statusParam || 'active',
    });
  } catch (error) {
    console.error('Error fetching conflicts:', error);
    return NextResponse.json(
      { error: 'Failed to fetch conflicts' },
      { status: 500 }
    );
  }
}
