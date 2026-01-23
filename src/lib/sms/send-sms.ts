import { getTwilioClient, isSmsEnabled, getSendingNumber } from './twilio-client';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { isValidNZNumber } from '@/lib/phone';

export interface SendSmsParams {
  to: string; // Phone number in E.164 format
  message: string; // SMS body (max 160 chars for single SMS)
  eventId: string; // For logging
  personId: string; // For logging
  metadata?: Record<string, unknown>; // Additional log data
}

export type SmsBlockReason =
  | 'SMS_DISABLED' // Twilio not configured
  | 'INVALID_NUMBER' // Not a valid NZ number
  | 'OPTED_OUT' // Recipient opted out from this host
  | 'SEND_FAILED'; // Twilio API error

export interface SendSmsResult {
  success: boolean;
  messageId?: string; // Twilio message SID
  blocked?: SmsBlockReason;
  error?: string;
}

/**
 * Send an SMS message with full validation and logging
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const { to, message, eventId, personId, metadata = {} } = params;

  // Check if SMS is configured
  if (!isSmsEnabled()) {
    console.log(`[SMS] Disabled - would send to ${to}: "${message.substring(0, 50)}..."`);
    return {
      success: false,
      blocked: 'SMS_DISABLED',
      error: 'SMS not configured',
    };
  }

  // Validate NZ number
  if (!isValidNZNumber(to)) {
    await logInviteEvent({
      eventId,
      personId,
      type: 'SMS_BLOCKED_INVALID',
      metadata: {
        phoneNumber: to,
        reason: 'Invalid or non-NZ number',
        ...metadata,
      },
    });

    return {
      success: false,
      blocked: 'INVALID_NUMBER',
      error: 'Invalid or non-NZ phone number',
    };
  }

  // Check for opt-out
  const isOptedOut = await checkOptOut(to, eventId);

  if (isOptedOut) {
    await logInviteEvent({
      eventId,
      personId,
      type: 'SMS_BLOCKED_OPT_OUT',
      metadata: {
        phoneNumber: to,
        ...metadata,
      },
    });

    return {
      success: false,
      blocked: 'OPTED_OUT',
      error: 'Recipient has opted out',
    };
  }

  // Send via Twilio
  try {
    const client = getTwilioClient();
    const from = getSendingNumber();

    if (!client || !from) {
      throw new Error('Twilio client not available');
    }

    const result = await client.messages.create({
      body: message,
      from: from,
      to: to,
    });

    // Log success
    await logInviteEvent({
      eventId,
      personId,
      type: 'NUDGE_SENT_AUTO',
      metadata: {
        messageId: result.sid,
        phoneNumber: to,
        messageLength: message.length,
        ...metadata,
      },
    });

    return {
      success: true,
      messageId: result.sid,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    // Log failure
    await logInviteEvent({
      eventId,
      personId,
      type: 'SMS_SEND_FAILED',
      metadata: {
        phoneNumber: to,
        error: errorMessage,
        ...metadata,
      },
    });

    console.error(`[SMS] Failed to send to ${to}:`, errorMessage);

    return {
      success: false,
      blocked: 'SEND_FAILED',
      error: errorMessage,
    };
  }
}

/**
 * Check if a phone number has opted out from a specific host
 */
async function checkOptOut(phoneNumber: string, eventId: string): Promise<boolean> {
  // Get the event's host
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { hostId: true },
  });

  if (!event) return false;

  // Check for opt-out record
  const optOut = await prisma.smsOptOut.findUnique({
    where: {
      phoneNumber_hostId: {
        phoneNumber: phoneNumber,
        hostId: event.hostId,
      },
    },
  });

  return !!optOut;
}

/**
 * Check opt-out status for multiple numbers (batch)
 * More efficient than checking one at a time
 */
export async function checkOptOutBatch(
  phoneNumbers: string[],
  hostId: string
): Promise<Set<string>> {
  const optOuts = await prisma.smsOptOut.findMany({
    where: {
      phoneNumber: { in: phoneNumbers },
      hostId: hostId,
    },
    select: { phoneNumber: true },
  });

  return new Set(optOuts.map((o) => o.phoneNumber));
}
