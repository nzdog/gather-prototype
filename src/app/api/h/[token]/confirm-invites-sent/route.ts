import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const eventId = context.event.id;

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      people: {
        include: {
          person: {
            select: { id: true, inviteAnchorAt: true },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Event not found' }, { status: 404 });
  }

  if (event.status !== 'CONFIRMING') {
    return NextResponse.json(
      { error: 'Event must be in CONFIRMING status' },
      { status: 400 }
    );
  }

  const now = new Date();

  await prisma.event.update({
    where: { id: eventId },
    data: { inviteSendConfirmedAt: now },
  });

  const needAnchor = event.people
    .filter((pe) => !pe.person.inviteAnchorAt)
    .map((pe) => pe.person.id);

  if (needAnchor.length > 0) {
    await prisma.person.updateMany({
      where: { id: { in: needAnchor } },
      data: { inviteAnchorAt: now },
    });
  }

  await logInviteEvent({
    eventId,
    type: 'INVITE_SEND_CONFIRMED',
    metadata: {
      totalPeople: event.people.length,
      newAnchorsSet: needAnchor.length,
    },
  });

  return NextResponse.json({ success: true, confirmedAt: now.toISOString() });
}
