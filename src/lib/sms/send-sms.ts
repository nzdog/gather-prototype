import { getTwilioClient, isSmsEnabled, getSendingNumber } from './twilio-client';
import { sendViaTnz, isTnzEnabled } from './tnz-client';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { isLiveSendingOn, LIVE_SENDS_OFF } from '@/lib/live-sends';

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

/**
 * IS THERE A PROVIDER CONFIGURED THAT COULD CARRY A TEXT TO THIS NUMBER?
 *
 * GTC-189 slice 7b, founder answer 1 of 2026-09-19 — ruling U's third action is FENCED on this:
 *
 * > 5f's fence would have hidden a true failure — the board going red for a broken key — and
 * > that was the state worth seeing. This fence prevents a FALSE improvement: the red clearing
 * > when nothing was sent and no provider was reached. One is the environment telling the truth
 * > loudly; the other is the board lying quietly.
 *
 * ⚠ SO IT IS NOT 5f REVERSED, and the distinction is the ruling rather than a caveat on it.
 * Without the fence, "send to the phone instead" in this environment queues a TEXT row the drain
 * withholds `SMS_DISABLED`: the red clears when the row is queued, having reached no provider, and
 * comes back after the next drain ([[GTC-340]] reads that withholding NOT_DELIVERED). A button that
 * makes a red disappear without reaching a provider is the quiet lie, however briefly.
 *
 * ⚠ IT LIVES HERE, BESIDE `sendSms`, BECAUSE IT IS `sendSms`'S OWN BRANCH. The door asking
 * "is TNZ configured" directly would be a second reading of which provider serves which number,
 * free to drift from the one below the moment a third provider or a third country code arrives.
 * `shouldUseTnz` stays private; this is the question a caller is allowed to ask.
 *
 * ⚠ [[GTC-274]]: AND IT ASKS THE LIVE SWITCH TOO. A provider that is configured on a machine that
 * is not live cannot carry the text either — `sendSms` stops it at its last step — so answering
 * "configured" there would let the door clear a red with nothing sent: the quiet lie above.
 */
export function smsProviderConfiguredFor(to: string): boolean {
  return isLiveSendingOn() && (shouldUseTnz(to) ? isTnzEnabled() : isSmsEnabled());
}

export interface SendSmsParams {
  to: string; // Phone number in E.164 format
  message: string; // SMS body (max 160 chars for single SMS)
  eventId: string; // For logging
  personId: string; // For logging
  metadata?: Record<string, unknown>; // Additional log data
}

export type SmsBlockReason =
  | 'SMS_DISABLED' // The provider is not configured, or live sending is off (GTC-274)
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

  /*
   * [[GTC-274]] — THE LIVE SWITCH, the last step before the network (founder ruling, 2026-09-29).
   *
   * ⚠ ITS PLACE IS THE RULING, NOT A PREFERENCE. After the opt-out check above (Zone 7 — first and
   * untouched, so an opted-out number is OPTED_OUT whatever this says) and after the provider's
   * configuration (so a +64 number with no TNZ token is still SMS_DISABLED in TNZ's words). Moving it
   * ahead of either changes an outcome callers and suites depend on.
   *
   * SMS_DISABLED, NOT A FIFTH REASON: "sending is not enabled here" is what it already means, and the
   * dispatcher and the resend door already read it that way (withheld and terminal), and since
   * [[GTC-340]] the board reads it red, "never got it".
   * Told apart by `LIVE_SENDS_OFF`. Like the configuration refusal above, it writes no InviteEvent —
   * a stop is never recorded as a send.
   */
  if (!isLiveSendingOn()) {
    console.warn(`[SMS] ${LIVE_SENDS_OFF} — nothing sent to ${to}.`);
    return {
      success: false,
      blocked: 'SMS_DISABLED',
      error: LIVE_SENDS_OFF,
    };
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
