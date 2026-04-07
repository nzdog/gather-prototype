// POST /api/events/[id]/wrap-up
// Host confirms wrap-up: transitions event to COMPLETE, generates WrapUpLinks for all guests
// SECURITY: Requires HOST role

import { NextRequest, NextResponse } from 'next/server';
import { requireEventRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { generateWrapUpLinks } from '@/lib/wrap-up';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check first — must be HOST
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        host: true,
        people: {
          include: {
            person: {
              include: {
                assignments: {
                  include: { item: true },
                },
              },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Must be FROZEN to wrap up
    if (event.status !== 'FROZEN') {
      return NextResponse.json(
        { error: `Cannot wrap up event in ${event.status} status. Event must be FROZEN.` },
        { status: 400 }
      );
    }

    // Warn if event date hasn't passed yet
    const eventDatePassed = event.endDate < new Date();
    const body = await _request.json().catch(() => ({}));
    if (!eventDatePassed && !body.confirmEarly) {
      return NextResponse.json(
        {
          warning: true,
          message: "Your event date hasn't passed yet — are you sure?",
          requiresConfirmation: true,
        },
        { status: 200 }
      );
    }

    // Derive actorId from authenticated session
    let person = await prisma.person.findFirst({
      where: { userId: auth.user.id },
    });
    if (!person) {
      person = await prisma.person.create({
        data: {
          name: auth.user.email.split('@')[0],
          email: auth.user.email,
          userId: auth.user.id,
        },
      });
    }

    // Transition to COMPLETE
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          status: 'COMPLETE',
          wrappedAt: new Date(),
        },
      });

      await logAudit(tx, {
        eventId,
        actorId: person!.id,
        actionType: 'TRANSITION_TO_COMPLETE',
        targetType: 'Event',
        targetId: eventId,
        details: `Host wrapped up event. ${event.people.length} guests to notify.`,
      });
    });

    // Build guest list for link generation
    const guests = event.people
      .filter((pe) => pe.personId !== event.hostId) // exclude host
      .map((pe) => ({
        person: {
          id: pe.person.id,
          name: pe.person.name,
          email: pe.person.email,
          phone: pe.person.phone,
          phoneNumber: pe.person.phoneNumber,
          smsOptedOut: pe.person.smsOptedOut,
        },
        assignments: pe.person.assignments.map((a) => ({
          item: { name: a.item.name },
          response: a.response,
        })),
      }));

    const linkResult = await generateWrapUpLinks(eventId, guests);

    return NextResponse.json({
      success: true,
      message: `Done — thank-you messages are on their way to your ${linkResult.created} guests.`,
      guestsToNotify: linkResult.created,
      guestsSkipped: linkResult.skipped,
      eventStatus: 'COMPLETE',
    });
  } catch (error) {
    console.error('Error wrapping up event:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
