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

    // Only allow in CONFIRMING status
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
      data: { inviteSendConfirmedAt: now },
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
