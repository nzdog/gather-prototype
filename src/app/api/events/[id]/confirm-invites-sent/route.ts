import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

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
    // Load event with people
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        people: {
          include: {
            person: {
              select: { id: true, name: true, inviteAnchorAt: true },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // GTC-169 (A3a): the press happens ONCE. "The send happens once, for her...
    // experientially it is one act, one sentence, one handover" (Hinge §7).
    //
    // Freezing used to be what stopped a second press — after CONFIRMING → FROZEN
    // this route 400'd. Removing FROZEN removes that protection, so the idempotency
    // guard becomes explicit here rather than a side effect of a state machine.
    // People added afterwards get their own mini-send, not a re-press of the whole
    // event (Hinge §2, gap #5).
    if (event.sentAt) {
      return NextResponse.json({ error: 'This event has already been sent' }, { status: 400 });
    }

    // The plan must exist before it can be sent — a sequencing fact, not a gate on
    // the host's judgement.
    if (event.status !== 'CONFIRMING') {
      return NextResponse.json(
        { error: 'Can only confirm invites when event is in CONFIRMING status' },
        { status: 400 }
      );
    }

    const now = new Date();

    // Update event timestamp
    await prisma.event.update({
      where: { id: eventId },
      data: { sentAt: now },
    });

    // Set anchor for people who don't have one yet
    const peopleNeedingAnchor = event.people
      .filter((pe) => !pe.person.inviteAnchorAt)
      .map((pe) => pe.person.id);

    if (peopleNeedingAnchor.length > 0) {
      await prisma.person.updateMany({
        where: {
          id: { in: peopleNeedingAnchor },
        },
        data: { inviteAnchorAt: now },
      });
    }

    // Log the event
    await logInviteEvent({
      eventId,
      type: 'INVITE_SEND_CONFIRMED',
      metadata: {
        totalPeople: event.people.length,
        newAnchorsSet: peopleNeedingAnchor.length,
        previouslyAnchored: event.people.length - peopleNeedingAnchor.length,
      },
    });

    return NextResponse.json({
      success: true,
      confirmedAt: now.toISOString(),
      peopleAnchored: peopleNeedingAnchor.length,
      totalPeople: event.people.length,
    });
  } catch (error) {
    console.error('Error confirming invites sent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
