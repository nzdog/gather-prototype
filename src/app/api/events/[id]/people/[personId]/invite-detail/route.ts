import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Query the person with all needed relations
    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        tokens: {
          where: {
            scope: 'PARTICIPANT',
            eventId: eventId,
          },
          select: {
            openedAt: true,
            claimedAt: true,
          },
        },
        assignments: {
          where: {
            item: {
              team: {
                eventId: eventId,
              },
            },
          },
          select: {
            response: true,
            createdAt: true,
            item: {
              select: {
                name: true,
              },
            },
          },
        },
        inviteEvents: {
          where: {
            eventId: eventId,
          },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            type: true,
            createdAt: true,
            metadata: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // Fetch event name and date for nudge template personalisation
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { name: true, startDate: true, hostId: true },
    });

    // GTC-178 (E1, phase 4): the nudge stamps moved to the membership row, and this
    // route roots on `Person` with no PersonEvent in its query — so the row has to be
    // fetched. `personId_eventId` is the model's own compound unique, so this is a
    // single indexed lookup, not a scan.
    //
    // Nullable on purpose: this route answers for a (person, event) pair the caller
    // supplies, and a person with no membership row for this event is a real 404-ish
    // state the existing code already tolerates elsewhere. No membership means no
    // per-event nudge history, which renders as "none sent" rather than throwing.
    const personEvent = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId, eventId } },
      select: { firstNudgeSentAt: true, secondNudgeSentAt: true },
    });

    // Fetch most recent host nudge for this person+event
    const lastHostNudge = await prisma.inviteEvent.findFirst({
      where: {
        eventId,
        personId,
        type: 'NUDGE_SENT_HOST',
      },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    const token = person.tokens[0];
    const hasResponded = person.assignments.some((a) => a.response !== 'PENDING');
    const respondedAssignment = person.assignments.find((a) => a.response !== 'PENDING');

    // Determine status
    let status: 'NOT_SENT' | 'SENT' | 'OPENED' | 'RESPONDED';
    if (hasResponded) {
      status = 'RESPONDED';
    } else if (token?.openedAt) {
      status = 'OPENED';
    } else if (person.inviteAnchorAt) {
      status = 'SENT';
    } else {
      status = 'NOT_SENT';
    }

    // Get response type
    const response = respondedAssignment?.response || 'PENDING';

    // Check opt-out (reuse event.hostId fetched above)
    const optOut = person.phoneNumber
      ? await prisma.smsOptOut.findFirst({
          where: {
            phoneNumber: person.phoneNumber,
            hostId: event?.hostId,
          },
        })
      : null;

    return NextResponse.json({
      id: person.id,
      name: person.name,
      email: person.email,
      phoneNumber: person.phoneNumber,
      status,
      response,
      inviteAnchorAt: person.inviteAnchorAt?.toISOString() || null,
      openedAt: token?.openedAt?.toISOString() || null,
      claimedAt: token?.claimedAt?.toISOString() || null,
      respondedAt: respondedAssignment?.createdAt?.toISOString() || null,
      hasPhone: !!person.phoneNumber,
      smsOptedOut: !!optOut,
      canReceiveSms: !!person.phoneNumber && !optOut,
      firstNudgeSentAt: personEvent?.firstNudgeSentAt?.toISOString() || null,
      secondNudgeSentAt: personEvent?.secondNudgeSentAt?.toISOString() || null,
      lastHostNudgeAt: lastHostNudge?.createdAt?.toISOString() || null,
      eventName: event?.name || null,
      eventDate: event?.startDate?.toISOString() || null,
      assignments: person.assignments.map((a: any) => ({
        response: a.response,
        itemName: a.item?.name || null,
      })),
      inviteEvents: person.inviteEvents.map((e) => ({
        type: e.type,
        createdAt: e.createdAt.toISOString(),
        metadata: e.metadata,
      })),
    });
  } catch (error) {
    console.error('Error getting invite detail:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
