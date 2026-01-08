import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/h/[token]/team/[teamId]
 *
 * Returns team items for host view (read-only).
 * Host can see but not alter coordinator's team items.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: { token: string; teamId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify team belongs to this event
  const team = await prisma.team.findUnique({
    where: { id: params.teamId },
    include: {
      coordinator: true,
    },
  });

  if (!team || team.eventId !== context.event.id) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Fetch team items with assignments
  const items = await prisma.item.findMany({
    where: { teamId: params.teamId },
    include: {
      assignment: {
        include: {
          person: true,
        },
      },
      day: true,
    },
    orderBy: [{ critical: 'desc' }, { name: 'asc' }],
  });

  return NextResponse.json({
    event: {
      id: context.event.id,
      name: context.event.name,
      startDate: context.event.startDate.toISOString(),
      endDate: context.event.endDate.toISOString(),
      status: context.event.status,
    },
    team: {
      id: team.id,
      name: team.name,
      coordinator: {
        id: team.coordinator.id,
        name: team.coordinator.name,
      },
    },
    items: items.map((item) => ({
      id: item.id,
      name: item.name,
      quantity: item.quantity,
      description: item.description,
      critical: item.critical,
      glutenFree: item.glutenFree,
      dairyFree: item.dairyFree,
      vegetarian: item.vegetarian,
      notes: item.notes,
      dropOffAt: item.dropOffAt?.toISOString() || null,
      dropOffLocation: item.dropOffLocation,
      dropOffNote: item.dropOffNote,
      day: item.day
        ? {
            id: item.day.id,
            name: item.day.name,
            date: item.day.date.toISOString(),
          }
        : null,
      assignment: item.assignment
        ? {
            id: item.assignment.id,
            response: item.assignment.response,
            person: {
              id: item.assignment.person.id,
              name: item.assignment.person.name,
            },
          }
        : null,
    })),
  });
}
