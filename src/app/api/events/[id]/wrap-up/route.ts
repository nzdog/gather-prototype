// POST /api/events/[id]/wrap-up
// Host confirms wrap-up: generates WrapUpLinks for all guests once the event date has
// passed. Does NOT transition status — COMPLETE is derived from the calendar
// (Moment 4 §10.1). GTC-186 (H1) turns this into a once-only, reviewed offer.
// SECURITY: Requires HOST role

import { NextRequest, NextResponse } from 'next/server';
import { requireEventRole } from '@/lib/auth/guards';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { isComplete } from '@/lib/lifecycle';
import { generateWrapUpLinks, selectWrapUpRecipients } from '@/lib/wrap-up';

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

    // GTC-169 (A3a): the gate moved from a status the host DECLARED to a fact about
    // the calendar. Moment 4 §10.1 — "the event date passing IS the state change. No
    // button, no ceremony."
    //
    // The old `confirmEarly` bypass was DELETED with it: you cannot wrap up an event
    // that has not happened, because COMPLETE is not a decision anyone gets to make
    // early. This narrows what the host can do, and it is not a §7 hard-block — §7
    // forbids the product contesting the host's JUDGEMENT, and the calendar is not a
    // judgement.
    if (!isComplete(event)) {
      return NextResponse.json(
        { error: 'Cannot wrap up before the event date has passed.' },
        { status: 400 }
      );
    }

    // GTC-209: the thank-you goes out ONCE.
    //
    // `isComplete` is `now > endDate` — permanently true once past — so it gates WHEN
    // the press is allowed and never HOW MANY TIMES. Nothing else stopped a repeat: the
    // generator had no dedupe, `WrapUpLink` has no composite unique, and the dispatcher
    // iterates rows. Two presses meant every guest got two thank-you texts.
    //
    // The `AuditEntry` composite unique looks like it would have caught this and does
    // not: `logAudit` never sets `sequence`, and Postgres treats NULLs as distinct
    // absent `NULLS NOT DISTINCT`, which no migration here declares.
    //
    // Same shape as the send press at confirm-invites-sent/route.ts:51-53 — one stored
    // timestamp, checked before the act it records.
    if (event.wrappedAt) {
      return NextResponse.json(
        { error: 'Thank-you messages have already been sent for this event.' },
        { status: 400 }
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

    // Record the wrap-up. NOT a status transition: COMPLETE is derived from endDate,
    // so nothing writes Event.status here. wrappedAt now means "the thank-you was
    // actioned", not "the event completed".
    await prisma.$transaction(async (tx) => {
      await tx.event.update({
        where: { id: eventId },
        data: {
          wrappedAt: new Date(),
        },
      });

      await logAudit(tx, {
        eventId,
        actorId: person!.id,
        actionType: 'WRAP_UP_SENT',
        targetType: 'Event',
        targetId: eventId,
        details: `Host wrapped up event. ${event.people.length} guests to notify.`,
      });
    });

    // Build guest list for link generation. The recipient decision lives in
    // selectWrapUpRecipients (GTC-172 / C1) so it is testable without this route's
    // cookie context and so the child rule has exactly one place to hold.
    const guests = selectWrapUpRecipients(event.people, event.hostId);

    const linkResult = await generateWrapUpLinks(eventId, guests);

    return NextResponse.json({
      success: true,
      message: `Done — thank-you messages are on their way to your ${linkResult.created} guests.`,
      guestsToNotify: linkResult.created,
      guestsSkipped: linkResult.skipped,
    });
  } catch (error) {
    console.error('Error wrapping up event:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
