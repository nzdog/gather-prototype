import { listEmailBlocks } from '@/lib/eligibility/email-block';
import { EMAIL_BLOCK_FIRST } from '@/lib/eligibility/email-block-words';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { sendSms } from '@/lib/sms/send-sms';
import { sendNudgeEmail } from '@/lib/email';
import { logInviteEvent } from '@/lib/invite-events';
import {
  resolveManualNudgeRecipient,
  chooseManualNudgeChannel,
} from '@/lib/sms/manual-nudge-recipient';
import {
  EMAIL_OPT_OUT_NOT_ADDRESSABLE_MESSAGE,
  EMAIL_OPT_OUT_OVERRIDE_MESSAGE,
  getEmailOptOut,
} from '@/lib/eligibility/email-opt-out';

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

    // Load person with event context. The recipient decision lives in
    // resolveManualNudgeRecipient (GTC-172 / C1) so it is testable without this
    // route's cookie context and so the child rule has exactly one place to hold.
    const recipient = await resolveManualNudgeRecipient(eventId, personId);

    if (!recipient.ok) {
      return NextResponse.json({ error: recipient.error }, { status: recipient.status });
    }

    const person = recipient.person;

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

    /*
     * [[GTC-189]] slice 8a — [[GTC-324]] ruling 2 reaches the by-hand nudge ("anywhere"). A blocked
     * address is no address: the nudge goes by text where it can, and is refused with ruling 3's
     * first sentence where it cannot. Read here once and handed to both email doors below.
     */
    const emailBlocked = (await listEmailBlocks(prisma, [person.email])).size > 0;
    const channel = chooseManualNudgeChannel({ ...person, emailBlocked });

    /*
     * ⚠ [[GTC-296]] RULING 4 — AD's OVERRIDE SURVIVES AN EMAIL UNSUBSCRIBE, AND THIS ROUTE IS
     * THE ONLY PLACE IN THE PRODUCT WHERE IT DOES.
     *
     * Ruling 3 stops the AUTOMATIC chase on every channel. This nudge is not the automatic
     * chase — it is the host pressing a button about one person — so [[GTC-189]] ruling AD
     * still holds: *"the by-hand nudge sends, and says what it is overriding."* What ruling 4
     * narrows is HOW it sends:
     *
     *   - by text, if there is a usable number that is not SMS-opted-out, and the host is told
     *     what she is overriding;
     *   - refused with the same reason if there is no usable text channel.
     *
     * ⚠ AND THE CONSEQUENCE IS THE LINE BELOW THAT IS EASIEST TO MISS: the SMS-opt-out
     * fall-through to email, which has been here since [[GTC-172]], MUST NOT FIRE for somebody
     * who unsubscribed from email. That path is the one route in the tree that turns a text
     * refusal into an email send, and for this person email is the channel they closed.
     */
    const emailOptedOut = (await getEmailOptOut(personId, eventId)) !== null;
    let overrideNotice: string | undefined;

    if (channel === 'sms') {
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
        // Ruling 4: no usable text channel, and email is closed. Refused with the reason.
        if (emailOptedOut) {
          return NextResponse.json(
            { error: EMAIL_OPT_OUT_NOT_ADDRESSABLE_MESSAGE, reason: 'EMAIL_OPTED_OUT' },
            { status: 400 }
          );
        }
        // Fall through to email — never to an address the provider will not deliver to.
        if (person.email && emailBlocked) {
          return NextResponse.json(
            { error: EMAIL_BLOCK_FIRST, reason: 'EMAIL_BLOCKED' },
            { status: 400 }
          );
        }
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
        // Ruling 4: it sends, and it says what it is overriding.
        if (emailOptedOut) overrideNotice = EMAIL_OPT_OUT_OVERRIDE_MESSAGE;
        sendResult = await sendSms({
          to: person.phoneNumber!,
          message: message.trim(),
          eventId,
          personId,
          metadata: { source: 'host_nudge', template },
        });
      }
    } else if (channel === 'email') {
      // Ruling 4: the only channel left is the one they closed. Refused, not sent.
      if (emailOptedOut) {
        return NextResponse.json(
          { error: EMAIL_OPT_OUT_NOT_ADDRESSABLE_MESSAGE, reason: 'EMAIL_OPTED_OUT' },
          { status: 400 }
        );
      }
      contactMethod = 'email';
      sendResult = await sendNudgeEmail({
        // chooseManualNudgeChannel only returns 'email' when an address is present.
        to: person.email!,
        subject: `Reminder about ${event.name}`,
        body: message.trim(),
        eventId,
        personId,
      });
    } else if (person.email && emailBlocked) {
      return NextResponse.json(
        { error: EMAIL_BLOCK_FIRST, reason: 'EMAIL_BLOCKED' },
        { status: 400 }
      );
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
        // [[GTC-296]] ruling 4 — the override is RECORDED as well as shown. Ruling AD asks the
        // nudge to say what it is overriding; a sentence in one response tells the host who
        // pressed it and nobody afterwards.
        ...(overrideNotice ? { overrodeEmailOptOut: true } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      contactMethod: contactMethod!,
      sentAt: sentAt.toISOString(),
      // Ruling 4's notice, for the UI to show. Absent when nothing was overridden.
      ...(overrideNotice ? { override: 'EMAIL_OPTED_OUT', overrideNotice } : {}),
    });
  } catch (error) {
    console.error('Error sending host nudge:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
