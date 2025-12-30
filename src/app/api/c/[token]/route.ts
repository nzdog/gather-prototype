import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTeamStatusFromItems } from '@/lib/workflow';

/**
 * GET /api/c/[token]
 *
 * Returns coordinator's team + items + other teams' statuses.
 *
 * CRITICAL:
 * - All queries scoped to token.teamId only
 * - No repair loop (GET route - no DB writes)
 * - Compute status synchronously (no await)
 * - Other teams' statuses via item.groupBy aggregate only
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR' || !context.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // 1. Fetch coordinator's own team items (scoped to token.teamId)
  const myItems = await prisma.item.findMany({
    where: { teamId: context.team.id },
    include: {
      assignment: {
        include: {
          person: true
        }
      },
      day: true
    },
    orderBy: [
      { critical: 'desc' },
      { name: 'asc' }
    ]
  });

  // Compute status from assignment existence (SYNCHRONOUS - no await)
  const myStatus = computeTeamStatusFromItems(myItems);

  // 2. Fetch other teams (id + name only)
  const otherTeams = await prisma.team.findMany({
    where: {
      eventId: context.event.id,
      id: { not: context.team.id }
    },
    select: { id: true, name: true }
  });

  // 3. Count critical gaps per team via groupBy on Item
  // This queries assignment: null (not status field) for accuracy
  const gapCounts = await prisma.item.groupBy({
    by: ['teamId'],
    where: {
      teamId: { in: otherTeams.map(t => t.id) },
      critical: true,
      assignment: null,
    },
    _count: { _all: true },
  });

  const gapByTeam = new Map(gapCounts.map(g => [g.teamId, g._count._all]));

  // 4. Map to status enum (simplified: CRITICAL_GAP or SORTED only)
  const otherTeamsStatus = otherTeams.map(t => ({
    id: t.id,
    name: t.name,
    status: (gapByTeam.get(t.id) ?? 0) > 0 ? 'CRITICAL_GAP' : 'SORTED',
  }));

  // 5. Get team members for assignment dropdown
  const teamMembers = await prisma.personEvent.findMany({
    where: {
      eventId: context.event.id,
      teamId: context.team.id
    },
    include: {
      person: true
    }
  });

  // 6. Get host information
  const hostToken = await prisma.accessToken.findFirst({
    where: {
      eventId: context.event.id,
      scope: 'HOST'
    },
    include: {
      person: true
    }
  });

  return NextResponse.json({
    event: {
      id: context.event.id,
      name: context.event.name,
      status: context.event.status,
    },
    team: {
      id: context.team.id,
      name: context.team.name,
      scope: context.team.scope,
    },
    host: hostToken ? {
      name: hostToken.person.name,
    } : null,
    myStatus,
    items: myItems.map(item => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      description: item.description,
      critical: item.critical,
      status: item.status,
      glutenFree: item.glutenFree,
      dairyFree: item.dairyFree,
      vegetarian: item.vegetarian,
      notes: item.notes,
      dropOffAt: item.dropOffAt,
      dropOffLocation: item.dropOffLocation,
      dropOffNote: item.dropOffNote,
      day: item.day ? {
        id: item.day.id,
        name: item.day.name,
        date: item.day.date,
      } : null,
      assignment: item.assignment ? {
        id: item.assignment.id,
        acknowledged: item.assignment.acknowledged,
        person: {
          id: item.assignment.person.id,
          name: item.assignment.person.name,
        }
      } : null,
    })),
    teamMembers: teamMembers.map(m => ({
      id: m.person.id,
      name: m.person.name,
    })),
    otherTeams: otherTeamsStatus, // Status only, no items
  });
}
