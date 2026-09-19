import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { readDoor, resendToPerson } from '@/lib/press/resend';
import { RESEND_REFUSAL_WORDS, type ResendAction } from '@/lib/press/resend-door';

/**
 * GTC-189 slice 7b — RULING U'S DOOR, one route.
 *
 * `GET`  — the last look: the address it will send to and the message it will send.
 * `POST` — the press: one new `OutboundMessage` row, which the two-minute cron then drains.
 *
 * ⚠ ONE ROUTE FOR BOTH, ON DECISION 30's GROUND. The look and the press are the same door, and
 * two endpoints would let a surface read one and press another. Everything after the auth is
 * `src/lib/press/resend.ts`, because *"two routes doing the whole job is how they drift, and
 * they have already drifted once."*
 *
 * ⚠ HOST ONLY. The press is the host's and so is trying again. `requireEventRole` is the same
 * door `POST /api/events/[id]/send` uses; the manual-nudge route next door is HOST-only for the
 * same reason.
 *
 * ⚠ AND THE ROUTE WORDS NOTHING ITSELF. The refusal sentences come from the shared `Record` that
 * the panel also reads, so one refusal is not worded twice — 5f's R2 lesson, where the screen
 * showing the ROUTE's prose survived five mutations because nothing asserted the one line the
 * slice existed to place.
 */

const ACTIONS: ResendAction[] = ['AGAIN', 'EDIT', 'PHONE'];

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in a try/catch that returns 500.
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
    const outcome = await readDoor(prisma, {
      eventId,
      personId,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
    });
    if (!outcome.ok) {
      return NextResponse.json(
        { error: RESEND_REFUSAL_WORDS[outcome.code], code: outcome.code },
        { status: outcome.status }
      );
    }
    return NextResponse.json(outcome.view);
  } catch (error) {
    console.error('Error opening the bounce door:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

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
    const body = (await request.json().catch(() => ({}))) as {
      action?: string;
      email?: string | null;
    };
    /*
     * A body that names no action of ours is a malformed request rather than a state refusal,
     * so it does not borrow a code from the door's own family — every one of those is a
     * sentence about the event, the row or the person, and this is a sentence about the call.
     */
    if (!ACTIONS.includes(body.action as ResendAction)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    const actor = await ledgerActorForUser(auth.user, 'HOST');
    const outcome = await resendToPerson(prisma, {
      eventId,
      personId,
      baseUrl: process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin,
      actor,
      action: body.action as ResendAction,
      email: body.email ?? null,
    });

    if (!outcome.ok) {
      // The `code` rides beside the prose so a screen can branch on the state without parsing a
      // sentence — the press route's own rule.
      return NextResponse.json(
        { error: RESEND_REFUSAL_WORDS[outcome.code], code: outcome.code },
        { status: outcome.status }
      );
    }

    return NextResponse.json({
      success: true,
      action: outcome.action,
      channel: outcome.channel,
    });
  } catch (error) {
    console.error('Error sending again:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
