import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string; personId: string } }
) {
  const context = await resolveToken(params.token);
  if (!context || context.scope !== 'HOST') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { personId } = params;
  const eventId = context.event.id;

  let response: 'ACCEPTED' | 'DECLINED';
  let reason = '';

  try {
    const body = await request.json();
    response = body.response;
    reason =
      body.reason ||
      (response === 'ACCEPTED' ? 'Manual confirmation by host' : 'Manual decline by host');
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  }

  if (!['ACCEPTED', 'DECLINED'].includes(response)) {
    return NextResponse.json({ error: 'response must be ACCEPTED or DECLINED' }, { status: 400 });
  }

  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person) {
    return NextResponse.json({ error: 'Person not found' }, { status: 404 });
  }

  const updated = await prisma.assignment.updateMany({
    where: {
      personId,
      item: { team: { eventId } },
      response: { not: response },
    },
    data: { response },
  });

  await logInviteEvent({
    eventId,
    personId,
    type: 'MANUAL_OVERRIDE_MARKED',
    metadata: { response, reason, assignmentsUpdated: updated.count },
  });

  return NextResponse.json({ success: true, assignmentsUpdated: updated.count });
}
