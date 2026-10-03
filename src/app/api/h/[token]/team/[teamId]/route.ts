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
  context: { params: Promise<{ token: string; teamId: string }> }
) {
  const { token, teamId } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify team belongs to this event
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      coordinator: true,
    },
  });

  if (!team || team.eventId !== resolvedContext.event.id) {
    return NextResponse.json({ error: 'Team not found' }, { status: 404 });
  }

  // Fetch team items with assignments
  const items = await prisma.item.findMany({
    where: { teamId: teamId },
    include: {
      assignment: {
        include: {
          person: true,
        },
      },
      day: true,
    },
    orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
  });

  // Fetch all people in this event for frozen edit modal
  const people = await prisma.personEvent.findMany({
    where: { eventId: resolvedContext.event.id },
    include: {
      person: { select: { id: true, name: true } },
      team: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    event: {
      id: resolvedContext.event.id,
      name: resolvedContext.event.name,
      startDate: resolvedContext.event.startDate.toISOString(),
      endDate: resolvedContext.event.endDate.toISOString(),
      status: resolvedContext.event.status,
    },
    team: {
      id: team.id,
      name: team.name,
      coordinator: team.coordinator
        ? {
            id: team.coordinator.id,
            name: team.coordinator.name,
          }
        : null,
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
    people: people.map((pe) => ({
      id: pe.person.id,
      personId: pe.person.id,
      name: pe.person.name,
      team: pe.team
        ? {
            id: pe.team.id,
            name: pe.team.name,
          }
        : { id: '', name: 'Unassigned' },
    })),
  });
}
