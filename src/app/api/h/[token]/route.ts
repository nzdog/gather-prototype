import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { computeTeamStatusFromItems, canFreeze, getCriticalGapCount } from '@/lib/workflow';

/**
 * GET /api/h/[token]
 *
 * Returns event overview with all teams + statuses.
 *
 * CRITICAL:
 * - Compute status for each team synchronously (no await)
 * - Use canFreeze() for freeze allowed (queries assignment:null)
 * - No repair (GET route - no DB writes)
 */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Fetch all teams with items and assignments
  const teams = await prisma.team.findMany({
    where: { eventId: context.event.id },
    include: {
      coordinator: true,
      items: {
        include: {
          assignment: {
            include: {
              person: true,
            },
          },
          day: true,
        },
        orderBy: [{ critical: 'desc' }, { name: 'asc' }],
      },
    },
    orderBy: { name: 'asc' },
  });

  // Compute status for each team (SYNCHRONOUS - no await)
  const teamsWithStatus = teams.map((team) => {
    const status = computeTeamStatusFromItems(team.items);
    const unassignedCount = team.items.filter((i) => i.assignment === null).length;
    const criticalGapCount = team.items.filter((i) => i.critical && i.assignment === null).length;

    return {
      id: team.id,
      name: team.name,
      scope: team.scope,
      coordinator: {
        id: team.coordinator.id,
        name: team.coordinator.name,
      },
      status,
      itemCount: team.items.length,
      unassignedCount,
      criticalGapCount,
      items: team.items.map((item) => ({
        id: item.id,
        name: item.name,
        quantity: item.quantity,
        critical: item.critical,
        status: item.status,
        glutenFree: item.glutenFree,
        dairyFree: item.dairyFree,
        vegetarian: item.vegetarian,
        notes: item.notes,
        dropOffAt: item.dropOffAt,
        dropOffLocation: item.dropOffLocation,
        dropOffNote: item.dropOffNote,
        day: item.day
          ? {
              id: item.day.id,
              name: item.day.name,
              date: item.day.date,
            }
          : null,
        assignment: item.assignment
          ? {
              id: item.assignment.id,
              acknowledged: item.assignment.acknowledged,
              person: {
                id: item.assignment.person.id,
                name: item.assignment.person.name,
              },
            }
          : null,
      })),
    };
  });

  // Check if freeze is allowed (queries assignment:null directly)
  const freezeAllowed = await canFreeze(context.event.id);
  const criticalGapCount = freezeAllowed ? 0 : await getCriticalGapCount(context.event.id);

  return NextResponse.json({
    person: {
      id: context.person.id,
      name: context.person.name,
    },
    event: {
      id: context.event.id,
      name: context.event.name,
      startDate: context.event.startDate,
      endDate: context.event.endDate,
      status: context.event.status,
      guestCount: context.event.guestCount,
    },
    teams: teamsWithStatus,
    freezeAllowed,
    criticalGapCount,
  });
}
