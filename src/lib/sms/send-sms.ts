import { getTwilioClient, isSmsEnabled, getSendingNumber } from './twilio-client';
import { sendViaTnz, isTnzEnabled } from './tnz-client';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';

/**
 * Country codes routed to TNZ. Twilio does not deliver to NZ (+64); AU (+61)
 * is also routed to TNZ so a single regional provider handles both markets.
 * All other country codes fall through to Twilio.
 */
const TNZ_COUNTRY_CODES = ['+64', '+61'] as const;

function isE164(phone: string): boolean {
  return /^\+\d{8,15}$/.test(phone);
}

function shouldUseTnz(phone: string): boolean {
  return TNZ_COUNTRY_CODES.some((code) => phone.startsWith(code));
}

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

  // Validate E.164 format up-front. Country-code routing relies on the '+'
  // prefix, so any other format is rejected before touching a provider.
  if (!isE164(to)) {
    await logInviteEvent({
      eventId,
      personId,
      type: 'SMS_BLOCKED_INVALID',
      metadata: {
        phoneNumber: to,
        reason: 'Not in E.164 format',
        ...metadata,
      },
    });

    return {
      success: false,
      blocked: 'INVALID_NUMBER',
      error: 'Invalid phone number format',
    };
  }

  const useTnz = shouldUseTnz(to);

  // Check for opt-out FIRST — opt-out is a hard user-level promise and
  // must apply regardless of which provider is configured. Running this
  // before the provider-config check means a missing TNZ_AUTH_TOKEN never
  // masks an OPTED_OUT signal the caller needs for audit/UX.
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

  // Check configuration for the selected provider. If the destination is
  // routed to Twilio but Twilio is not configured, log a warning so the
  // caller's email fallback path can take over.
  if (useTnz) {
    if (!isTnzEnabled()) {
      return {
        success: false,
        blocked: 'SMS_DISABLED',
        error: 'TNZ not configured (TNZ_AUTH_TOKEN missing)',
      };
    }
  } else {
    if (!isSmsEnabled()) {
      console.warn(
        `[SMS] Twilio not configured; cannot deliver to ${to}. Caller should fall back to email.`
      );
      return {
        success: false,
        blocked: 'SMS_DISABLED',
        error: 'Twilio not configured for non-NZ/AU destination',
      };
    }
  }

  // Dispatch to the selected provider
  try {
    let messageId: string | undefined;
    let provider: 'tnz' | 'twilio';

    if (useTnz) {
      provider = 'tnz';
      const result = await sendViaTnz({ to, message });
      if (!result.success) {
        throw new Error(result.error || 'TNZ send failed');
      }
      messageId = result.messageId;
    } else {
      provider = 'twilio';
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
      messageId = result.sid;
    }

    // Log success
    await logInviteEvent({
      eventId,
      personId,
      type: 'NUDGE_SENT_AUTO',
      metadata: {
        messageId,
        provider,
        phoneNumber: to,
        messageLength: message.length,
        ...metadata,
      },
    });

    return {
      success: true,
      messageId,
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
        provider: useTnz ? 'tnz' : 'twilio',
        error: errorMessage,
        ...metadata,
      },
    });

    console.error(`[SMS] Failed to send to ${to} via ${useTnz ? 'TNZ' : 'Twilio'}:`, errorMessage);

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
