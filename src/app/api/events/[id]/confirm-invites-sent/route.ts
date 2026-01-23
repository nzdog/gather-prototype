import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
// import { requireEventRole } from '@/lib/auth/guards'
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id: eventId } = params;

  // TODO: Add authentication when session is properly configured
  // For now, allow open access to match the event endpoint pattern

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
}
