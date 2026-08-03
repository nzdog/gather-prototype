import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(_req: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);
  if (!resolvedContext || resolvedContext.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const eventId = resolvedContext.event.id;

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

  // GTC-169 (A3a): the press happens once (Hinge §7). Freezing used to be what
  // prevented a second press; with FROZEN gone the guard is explicit.
  if (event.sentAt) {
    return NextResponse.json({ error: 'This event has already been sent' }, { status: 400 });
  }

  if (event.status !== 'CONFIRMING') {
    return NextResponse.json({ error: 'Event must be in CONFIRMING status' }, { status: 400 });
  }

  const now = new Date();

  await prisma.event.update({
    where: { id: eventId },
    data: { sentAt: now },
  });

  // GTC-196 (A3b): the press stamps every existing member's personal clock at once.
  await prisma.personEvent.updateMany({
    where: { eventId, sentAt: null },
    data: { sentAt: now },
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
