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
export async function GET(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Track first link open (non-blocking)
  prisma.accessToken
    .findFirst({
      where: {
        token: token,
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
            eventId: resolvedContext.event.id,
            personId: resolvedContext.person.id,
            type: 'LINK_OPENED',
            metadata: {
              tokenScope: resolvedContext.scope,
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
      personId: resolvedContext.person.id,
      item: {
        team: {
          eventId: resolvedContext.event.id,
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
      personId: resolvedContext.person.id,
      eventId: resolvedContext.event.id,
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
      id: resolvedContext.person.id,
      name: resolvedContext.person.name,
    },
    event: {
      id: resolvedContext.event.id,
      name: resolvedContext.event.name,
      startDate: resolvedContext.event.startDate,
      endDate: resolvedContext.event.endDate,
      status: resolvedContext.event.status,
      guestCount: resolvedContext.event.guestCount,
      venueName: resolvedContext.event.venueName,
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
export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'PARTICIPANT') {
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
      personId: resolvedContext.person.id,
      eventId: resolvedContext.event.id,
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
