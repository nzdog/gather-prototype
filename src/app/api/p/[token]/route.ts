import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { RsvpStatus } from '@prisma/client';

/**
 * GET /api/p/[token]
 *
 * Returns participant's assignments + event context.
 *
 * CRITICAL: No repair loop. This is a GET route - no DB writes.
 * Status is read as-is from database.
 */
export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Track first link open (non-blocking)
  prisma.accessToken
    .findFirst({
      where: {
        token: params.token,
        openedAt: null,
      },
      select: { id: true },
    })
    .then(async (accessToken) => {
      if (accessToken) {
        const userAgent = request.headers.get('user-agent') || 'unknown';
        await Promise.all([
          prisma.accessToken.update({
            where: { id: accessToken.id },
            data: { openedAt: new Date() },
          }),
          logInviteEvent({
            eventId: context.event.id,
            personId: context.person.id,
            type: 'LINK_OPENED',
            metadata: {
              tokenScope: context.scope,
              userAgent: userAgent.substring(0, 200),
            },
          }),
        ]);
      }
    })
    .catch((err) => console.error('[LinkOpen] Failed to track:', err));

  // Fetch participant's assignments
  const assignments = await prisma.assignment.findMany({
    where: {
      personId: context.person.id,
      item: {
        team: {
          eventId: context.event.id,
        },
      },
    },
    include: {
      item: {
        include: {
          day: true,
          team: {
            include: {
              coordinator: true,
            },
          },
        },
      },
    },
    orderBy: {
      item: {
        name: 'asc',
      },
    },
  });

  // Get team info (participant belongs to one team)
  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: context.person.id,
      eventId: context.event.id,
    },
    include: {
      team: {
        include: {
          coordinator: true,
        },
      },
    },
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
    team: personEvent?.team
      ? {
          id: personEvent.team.id,
          name: personEvent.team.name,
          coordinator: personEvent.team.coordinator
            ? {
                id: personEvent.team.coordinator.id,
                name: personEvent.team.coordinator.name,
              }
            : null,
        }
      : null,
    rsvpStatus: personEvent?.rsvpStatus || 'PENDING',
    rsvpRespondedAt: personEvent?.rsvpRespondedAt?.toISOString() || null,
    rsvpFollowupSentAt: personEvent?.rsvpFollowupSentAt?.toISOString() || null,
    assignments: assignments.map((a) => ({
      id: a.id,
      response: a.response,
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
        day: a.item.day
          ? {
              id: a.item.day.id,
              name: a.item.day.name,
              date: a.item.day.date,
            }
          : null,
      },
    })),
  });
}

/**
 * PATCH /api/p/[token]
 *
 * Updates participant's RSVP status.
 */
export async function PATCH(request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { rsvpStatus } = body;

  // Validate rsvpStatus
  const validStatuses: RsvpStatus[] = ['YES', 'NO', 'NOT_SURE'];
  if (!rsvpStatus || !validStatuses.includes(rsvpStatus)) {
    return NextResponse.json(
      { error: 'Invalid RSVP status. Must be YES, NO, or NOT_SURE' },
      { status: 400 }
    );
  }

  // Find PersonEvent
  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: context.person.id,
      eventId: context.event.id,
    },
  });

  if (!personEvent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Update RSVP status
  const updated = await prisma.personEvent.update({
    where: { id: personEvent.id },
    data: {
      rsvpStatus,
      rsvpRespondedAt: new Date(),
    },
  });

  return NextResponse.json({
    success: true,
    rsvpStatus: updated.rsvpStatus,
    rsvpRespondedAt: updated.rsvpRespondedAt?.toISOString() || null,
  });
}
