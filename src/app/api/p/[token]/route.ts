import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { getUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { logAudit } from '@/lib/workflow';
import { deriveAttendance, isAttendanceAskable, parseAttendanceBody } from '@/lib/attendance';

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

  // Check if the viewer is the host of this event (for link preview)
  const user = await getUser();
  if (user) {
    const hostRole = await prisma.eventRole.findFirst({
      where: {
        userId: user.id,
        eventId: resolvedContext.event.id,
        role: 'HOST',
      },
    });

    if (hostRole) {
      // Fetch assignments for preview (same query as below, but skip tracking)
      const assignments = await prisma.assignment.findMany({
        where: {
          personId: resolvedContext.person.id,
          item: { team: { eventId: resolvedContext.event.id } },
        },
        include: {
          item: {
            include: {
              day: true,
            },
          },
        },
        orderBy: { item: { name: 'asc' } },
      });

      return NextResponse.json({
        isHostPreview: true,
        person: {
          id: resolvedContext.person.id,
          name: resolvedContext.person.name,
        },
        event: {
          id: resolvedContext.event.id,
          name: resolvedContext.event.name,
        },
        assignments: assignments.map((a) => ({
          id: a.id,
          response: a.response,
          item: {
            id: a.item.id,
            name: a.item.name,
            quantity: a.item.quantity,
            critical: a.item.critical,
            day: a.item.day ? { id: a.item.day.id, name: a.item.day.name } : null,
          },
        })),
      });
    }
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
    isDemo: resolvedContext.event.isDemo,
    person: {
      id: resolvedContext.person.id,
      name: resolvedContext.person.name,
    },
    event: {
      id: resolvedContext.event.id,
      name: resolvedContext.event.name,
      // GTC-198 (A3d): lifecycle inputs for the shared predicates.
      sentAt: resolvedContext.event.sentAt,
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
    // GTC-174 (D1): attendance is DERIVED, never read from a column. The guest is
    // never asked "are you coming?" except on the no path and the itemless case, so
    // there is no attendance status to send — only the inference and the two facts the
    // client needs to render the follow-up beat (Hinge §3).
    attendance: deriveAttendance(assignments, personEvent?.attendanceAnswer ?? null),
    attendanceAnswer: personEvent?.attendanceAnswer ?? null,
    attendanceAskable: isAttendanceAskable(assignments),
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
 * Records the participant's ATTENDANCE ANSWER — and only where attendance was
 * genuinely asked.
 *
 * GTC-174 (D1) — THE DIRECT-RSVP WRITE IS GONE. This route used to take
 * `{ rsvpStatus: 'YES' | 'NO' | 'NOT_SURE' }` straight from the guest and store it.
 * Hinge §3 supersedes that: the tap is the item ask, attendance is inferred from it,
 * and `PersonEvent.rsvpStatus` becomes derived state. The old body shape is rejected
 * rather than translated — NOT_SURE in particular has no target, because §8 abolishes
 * the attendance-maybe (a maybe belongs to the item, carried on Assignment.response).
 *
 * What remains is narrow and deliberate: the two moments Hinge §3 says attendance IS
 * asked — the conditional no-follow-up ("no worries — still coming?") and the itemless
 * degenerate case. The 409 below is what keeps that narrow. Without it "guests are
 * never asked attendance directly" would be a UI convention that the next screen could
 * quietly break; with it, the server refuses an answer to a question it never posed.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const answer = parseAttendanceBody(body);

  if (answer === null) {
    return NextResponse.json(
      { error: 'Invalid body. Expected { attending: boolean }' },
      { status: 400 }
    );
  }

  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: resolvedContext.person.id,
      eventId: resolvedContext.event.id,
    },
  });

  if (!personEvent) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      personId: resolvedContext.person.id,
      item: { team: { eventId: resolvedContext.event.id } },
    },
    select: { response: true },
  });

  // The guard. Attendance is answerable only where it was asked (Hinge §3): an itemless
  // guest, or one who has declined everything. A guest with an accepted item has already
  // answered it by the tap; one with a maybe has not been asked at all (§8).
  if (!isAttendanceAskable(assignments)) {
    return NextResponse.json(
      {
        error: 'Attendance was not asked. It is inferred from the item response — see Hinge §3.',
        attendance: deriveAttendance(assignments, personEvent.attendanceAnswer),
      },
      { status: 409 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.personEvent.update({
      where: { id: personEvent.id },
      data: {
        attendanceAnswer: answer,
        attendanceAnsweredAt: new Date(),
      },
    });

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'ANSWER_ATTENDANCE',
      targetType: 'PersonEvent',
      targetId: personEvent.id,
      details: answer === 'YES' ? 'Answered still coming' : 'Answered not coming',
    });

    return row;
  });

  logInviteEvent({
    eventId: resolvedContext.event.id,
    personId: resolvedContext.person.id,
    type: 'RESPONSE_SUBMITTED',
    metadata: { attendanceAnswer: answer, itemless: assignments.length === 0 },
  }).catch((err) => console.error('[AttendanceTracking] Failed to log:', err));

  return NextResponse.json({
    success: true,
    attendance: deriveAttendance(assignments, updated.attendanceAnswer),
    attendanceAnswer: updated.attendanceAnswer,
    attendanceAskable: isAttendanceAskable(assignments),
  });
}
