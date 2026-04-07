import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { sendSms } from '@/lib/sms/send-sms';
import { sendNudgeEmail } from '@/lib/email';
import { logInviteEvent } from '@/lib/invite-events';
import { isSmsEnabled } from '@/lib/sms/twilio-client';
import { isValidNZNumber } from '@/lib/phone';

type NudgeVariant = 'warm' | 'casual' | 'gentle' | 'direct';
const VALID_VARIANTS: NudgeVariant[] = ['warm', 'casual', 'gentle', 'direct'];
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function POST(
  request: NextRequest,
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
    // Parse and validate request body
    const body = await request.json();
    const { template, message } = body as { template: string; message: string };

    if (!template || !VALID_VARIANTS.includes(template as NudgeVariant)) {
      return NextResponse.json(
        { error: 'Invalid template variant. Must be one of: warm, casual, gentle, direct' },
        { status: 400 }
      );
    }

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // Load person with event context
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: {
        id: true,
        name: true,
        email: true,
        phoneNumber: true,
        smsOptedOut: true,
      },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, hostId: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check 24hr cooldown
    const recentNudge = await prisma.inviteEvent.findFirst({
      where: {
        eventId,
        personId,
        type: 'NUDGE_SENT_HOST',
        createdAt: { gt: new Date(Date.now() - COOLDOWN_MS) },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (recentNudge) {
      const retryAfter = new Date(recentNudge.createdAt.getTime() + COOLDOWN_MS);
      return NextResponse.json(
        {
          error: 'Nudge sent less than 24 hours ago',
          lastNudgeAt: recentNudge.createdAt.toISOString(),
          retryAfter: retryAfter.toISOString(),
        },
        { status: 429 }
      );
    }

    // Determine contact method and send
    let contactMethod: 'sms' | 'email';
    let sendResult: { success: boolean; error?: string; messageId?: string };

    const canSms =
      person.phoneNumber &&
      isValidNZNumber(person.phoneNumber) &&
      !person.smsOptedOut &&
      isSmsEnabled();

    if (canSms) {
      contactMethod = 'sms';
      // Check per-host opt-out
      const optOut = await prisma.smsOptOut.findUnique({
        where: {
          phoneNumber_hostId: {
            phoneNumber: person.phoneNumber!,
            hostId: event.hostId,
          },
        },
      });

      if (optOut) {
        // Fall through to email
        if (person.email) {
          contactMethod = 'email';
          sendResult = await sendNudgeEmail({
            to: person.email,
            subject: `Reminder about ${event.name}`,
            body: message.trim(),
            eventId,
            personId,
          });
        } else {
          return NextResponse.json(
            { error: 'No contact method available — guest has opted out of SMS and has no email' },
            { status: 400 }
          );
        }
      } else {
        sendResult = await sendSms({
          to: person.phoneNumber!,
          message: message.trim(),
          eventId,
          personId,
          metadata: { source: 'host_nudge', template },
        });
      }
    } else if (person.email) {
      contactMethod = 'email';
      sendResult = await sendNudgeEmail({
        to: person.email,
        subject: `Reminder about ${event.name}`,
        body: message.trim(),
        eventId,
        personId,
      });
    } else {
      return NextResponse.json({ error: 'No contact method available' }, { status: 400 });
    }

    if (!sendResult!.success) {
      return NextResponse.json(
        { error: 'Failed to send nudge', detail: sendResult!.error },
        { status: 502 }
      );
    }

    // Log the host nudge event (in addition to any auto-log from sendSms)
    const sentAt = new Date();
    await logInviteEvent({
      eventId,
      personId,
      type: 'NUDGE_SENT_HOST',
      metadata: {
        template,
        contactMethod: contactMethod!,
        messagePreview: message.trim().substring(0, 100),
        messageId: sendResult!.messageId,
      },
    });

    return NextResponse.json({
      success: true,
      contactMethod: contactMethod!,
      sentAt: sentAt.toISOString(),
    });
  } catch (error) {
    console.error('Error sending host nudge:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
