import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { getUser } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { computeTeamStatusFromItems } from '@/lib/workflow';

/**
 * GET /api/h/[token]
 *
 * Returns event overview with all teams + statuses.
 *
 * CRITICAL:
 * - Compute status for each team synchronously (no await)
 * - Freeze is always allowed (warnings shown in modal, don't block)
 * - No repair (GET route - no DB writes)
 */
export async function GET(_request: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Check if host Person has linked User account (Ticket 1.6)
  // In development mode, bypass authentication for demo purposes
  let authStatus: 'unclaimed' | 'requires_signin' | 'authenticated' = 'authenticated';

  if (process.env.NODE_ENV !== 'development') {
    const needsClaim = !context.person.userId;
    if (needsClaim) {
      authStatus = 'unclaimed';
    } else if (context.person.userId) {
      // Person has linked User - check if session matches
      const sessionUser = await getUser();
      if (!sessionUser || sessionUser.id !== context.person.userId) {
        authStatus = 'requires_signin';
      }
    }
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
      coordinator: team.coordinator
        ? {
            id: team.coordinator.id,
            name: team.coordinator.name,
          }
        : null,
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
              response: item.assignment.response,
              person: {
                id: item.assignment.person.id,
                name: item.assignment.person.name,
              },
            }
          : null,
      })),
    };
  });

  // Freeze is always allowed - warnings are shown in modal but don't block
  const freezeAllowed = true;

  // Calculate total critical gaps across all teams
  const criticalGapCount = teamsWithStatus.reduce((sum, team) => sum + team.criticalGapCount, 0);

  // Conditionally fetch invite status and people when event is in CONFIRMING status
  let inviteStatus = null;
  let people = null;

  if (context.event.status === 'CONFIRMING') {
    const eventWithPeople = await prisma.event.findUnique({
      where: { id: context.event.id },
      select: {
        inviteSendConfirmedAt: true,
        people: {
          select: {
            rsvpStatus: true,
            person: {
              select: {
                id: true,
                name: true,
                inviteAnchorAt: true,
                tokens: {
                  where: { scope: 'PARTICIPANT', eventId: context.event.id },
                  select: { openedAt: true },
                },
                assignments: {
                  where: { item: { team: { eventId: context.event.id } } },
                  select: { response: true },
                },
              },
            },
          },
        },
      },
    });

    if (eventWithPeople) {
      const peopleStatus = eventWithPeople.people.map((pe) => {
        const person = pe.person;
        const token = person.tokens[0];
        const hasResponded = person.assignments.some((a) => a.response !== 'PENDING');

        let status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
        if (hasResponded) status = 'RESPONDED';
        else if (token?.openedAt) status = 'OPENED';
        else if (person.inviteAnchorAt) status = 'SENT';
        else status = 'NOT_SENT';

        const responses = person.assignments.map((a) => a.response);
        let response: 'PENDING' | 'ACCEPTED' | 'DECLINED' = 'PENDING';
        if (responses.length > 0) {
          if (responses.every((r) => r === 'ACCEPTED')) response = 'ACCEPTED';
          else if (responses.some((r) => r === 'DECLINED')) response = 'DECLINED';
        }

        return {
          id: person.id,
          name: person.name,
          status,
          response,
          rsvpStatus: pe.rsvpStatus,
        };
      });

      inviteStatus = {
        total: peopleStatus.length,
        notSent: peopleStatus.filter((p) => p.status === 'NOT_SENT').length,
        sent: peopleStatus.filter((p) => p.status === 'SENT').length,
        opened: peopleStatus.filter((p) => p.status === 'OPENED').length,
        responded: peopleStatus.filter((p) => p.status === 'RESPONDED').length,
        inviteSendConfirmedAt: eventWithPeople.inviteSendConfirmedAt?.toISOString() ?? null,
      };
      people = peopleStatus;
    }
  }

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
    authStatus,
    teams: teamsWithStatus,
    freezeAllowed,
    criticalGapCount,
    inviteStatus,
    people,
  });
}
