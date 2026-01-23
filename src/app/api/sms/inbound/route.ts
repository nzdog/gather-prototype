import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isOptOutMessage, getOptOutKeyword } from '@/lib/sms/opt-out-keywords';
import { normalizePhoneNumber } from '@/lib/phone';
import { logInviteEvent } from '@/lib/invite-events';

/**
 * Webhook endpoint for inbound SMS messages from Twilio
 *
 * Twilio sends POST requests with form-encoded data:
 * - From: Sender's phone number
 * - Body: Message text
 * - MessageSid: Unique message identifier
 */
export async function POST(request: NextRequest) {
  try {
    // Parse form data (Twilio sends application/x-www-form-urlencoded)
    const formData = await request.formData();

    const from = formData.get('From') as string;
    const body = formData.get('Body') as string;
    const messageSid = formData.get('MessageSid') as string;

    // Log for debugging
    console.log(`[SMS Inbound] From: ${from}, Body: "${body}", SID: ${messageSid}`);

    if (!from || !body) {
      console.warn('[SMS Inbound] Missing From or Body');
      return new NextResponse('OK', { status: 200 });
    }

    // Normalize the phone number
    const normalizedPhone = normalizePhoneNumber(from);

    if (!normalizedPhone) {
      console.warn(`[SMS Inbound] Could not normalize phone: ${from}`);
      return new NextResponse('OK', { status: 200 });
    }

    // Check if this is an opt-out message
    if (!isOptOutMessage(body)) {
      // Not an opt-out - log and ignore
      console.log(`[SMS Inbound] Non-opt-out message from ${normalizedPhone}: "${body}"`);
      return new NextResponse('OK', { status: 200 });
    }

    // Process opt-out
    const keyword = getOptOutKeyword(body);
    console.log(`[SMS Inbound] Processing opt-out from ${normalizedPhone}, keyword: ${keyword}`);

    // Find the most recent host who sent to this number
    // by looking at recent NUDGE_SENT_AUTO events
    const recentNudge = await prisma.inviteEvent.findFirst({
      where: {
        type: 'NUDGE_SENT_AUTO',
        metadata: {
          path: ['phoneNumber'],
          equals: normalizedPhone,
        },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        event: {
          select: {
            id: true,
            hostId: true,
            host: { select: { name: true } },
          },
        },
      },
    });

    if (!recentNudge || !recentNudge.event) {
      console.log(
        `[SMS Inbound] No recent nudge found for ${normalizedPhone}, cannot determine host`
      );
      // Still return 200 - don't retry
      return new NextResponse('OK', { status: 200 });
    }

    const hostId = recentNudge.event.hostId;
    const eventId = recentNudge.event.id;

    // Find the person record for this phone number in this event
    const person = await prisma.person.findFirst({
      where: {
        phoneNumber: normalizedPhone,
        eventMemberships: {
          some: {
            eventId: eventId,
          },
        },
      },
      select: { id: true, name: true },
    });

    // Create or update opt-out record
    await prisma.smsOptOut.upsert({
      where: {
        phoneNumber_hostId: {
          phoneNumber: normalizedPhone,
          hostId: hostId,
        },
      },
      create: {
        phoneNumber: normalizedPhone,
        hostId: hostId,
        rawMessage: body,
      },
      update: {
        optedOutAt: new Date(),
        rawMessage: body,
      },
    });

    // Also update Person.smsOptedOut for UI display
    if (person) {
      await prisma.person.update({
        where: { id: person.id },
        data: {
          smsOptedOut: true,
          smsOptedOutAt: new Date(),
        },
      });
    }

    // Log the opt-out event
    await logInviteEvent({
      eventId: eventId,
      personId: person?.id,
      type: 'SMS_OPT_OUT_RECEIVED',
      metadata: {
        phoneNumber: normalizedPhone,
        keyword: keyword,
        messageSid: messageSid,
        rawMessage: body,
        hostId: hostId,
        hostName: recentNudge.event.host?.name,
      },
    });

    console.log(`[SMS Inbound] Opt-out processed for ${normalizedPhone} from host ${hostId}`);

    // Return 200 to acknowledge receipt
    // Optionally, you could return TwiML to send a confirmation message
    return new NextResponse('OK', { status: 200 });
  } catch (error) {
    console.error('[SMS Inbound] Error processing webhook:', error);
    // Still return 200 to prevent Twilio retries
    return new NextResponse('OK', { status: 200 });
  }
}

// Also handle GET for Twilio's webhook validation
export async function GET() {
  return new NextResponse('SMS webhook endpoint', { status: 200 });
}
