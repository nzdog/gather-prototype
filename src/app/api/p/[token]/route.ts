import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/p/[token]
 *
 * Returns participant's assignments + event context.
 *
 * CRITICAL: No repair loop. This is a GET route - no DB writes.
 * Status is read as-is from database.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Fetch participant's assignments
  const assignments = await prisma.assignment.findMany({
    where: {
      personId: context.person.id,
      item: {
        team: {
          eventId: context.event.id
        }
      }
    },
    include: {
      item: {
        include: {
          day: true,
          team: {
            include: {
              coordinator: true
            }
          }
        }
      }
    },
    orderBy: {
      item: {
        name: 'asc'
      }
    }
  });

  // Get team info (participant belongs to one team)
  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: context.person.id,
      eventId: context.event.id
    },
    include: {
      team: {
        include: {
          coordinator: true
        }
      }
    }
  });

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
    team: personEvent?.team ? {
      id: personEvent.team.id,
      name: personEvent.team.name,
      coordinator: {
        id: personEvent.team.coordinator.id,
        name: personEvent.team.coordinator.name,
      }
    } : null,
    assignments: assignments.map(a => ({
      id: a.id,
      acknowledged: a.acknowledged,
      item: {
        id: a.item.id,
        name: a.item.name,
        quantity: a.item.quantity,
        description: a.item.description,
        critical: a.item.critical,
        glutenFree: a.item.glutenFree,
        dairyFree: a.item.dairyFree,
        vegetarian: a.item.vegetarian,
        notes: a.item.notes,
        dropOffAt: a.item.dropOffAt,
        dropOffLocation: a.item.dropOffLocation,
        dropOffNote: a.item.dropOffNote,
        day: a.item.day ? {
          id: a.item.day.id,
          name: a.item.day.name,
          date: a.item.day.date,
        } : null,
      }
    }))
  });
}
