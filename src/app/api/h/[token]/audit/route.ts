import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/h/[token]/audit
 *
 * Returns audit log entries for the event.
 * Supports filtering by actionType.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Get filter from query params
  const { searchParams } = new URL(request.url);
  const actionTypeFilter = searchParams.get('actionType');

  // Build where clause
  const where: any = {
    eventId: context.event.id
  };

  if (actionTypeFilter && actionTypeFilter !== 'ALL') {
    where.actionType = actionTypeFilter;
  }

  // Fetch audit entries
  const entries = await prisma.auditEntry.findMany({
    where,
    include: {
      actor: true
    },
    orderBy: {
      timestamp: 'desc'
    },
    take: 100 // Limit to last 100 entries
  });

  // Get unique action types for filter dropdown
  const actionTypes = await prisma.auditEntry.findMany({
    where: {
      eventId: context.event.id
    },
    select: {
      actionType: true
    },
    distinct: ['actionType']
  });

  return NextResponse.json({
    entries: entries.map(entry => ({
      id: entry.id,
      timestamp: entry.timestamp,
      actionType: entry.actionType,
      targetType: entry.targetType,
      targetId: entry.targetId,
      details: entry.details,
      actor: {
        id: entry.actor.id,
        name: entry.actor.name
      }
    })),
    actionTypes: actionTypes.map(at => at.actionType).sort()
  });
}
