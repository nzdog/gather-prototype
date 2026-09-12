// src/lib/email.ts
// Force rebuild for env var pickup

/*
 * ⚠ THE RULE FOR EVERY SENDER IN THIS FILE (GTC-265).
 *
 *   A sender RETURNS its result and does not DECIDE what to do about a
 *   failure. Each caller decides.
 *
 * Why the rule and not just "check the error": the same failure has three
 * different right answers in this tree, and a sender that picks one for all
 * of its callers is wrong for two of them.
 *
 *   - `POST /api/auth/magic-link` and `POST /api/auth/claim` must answer
 *     byte-identically whether the send worked or not. That is ENUMERATION
 *     protection — the response must not reveal which addresses exist — and
 *     it is correct. Their answer to a failure is "record it, say nothing".
 *   - The post-payment send has nothing to enumerate: the payer typed the
 *     address herself and has just been charged for it. Its answer is to
 *     fail loudly, in the response. GTC-280 makes that caller do so.
 *
 * A sender that swallowed the failure, or threw, or chose a status code,
 * would have to be unpicked to serve the other side.
 *
 * RECORD INSIDE, DECIDE OUTSIDE. A sender MAY log a failure server-side —
 * that is a record, and the gap GTC-265 names is that nobody, not even the
 * server, knew. What it may not do is choose the caller's status code,
 * swallow the failure, or throw in place of returning.
 *
 * ── WHY EVERY SEND NEEDS ITS RESULT INSPECTED, NOT ITS EXCEPTIONS CAUGHT ─────
 *
 * The Resend SDK RETURNS its error rather than throwing it:
 * `{ data: null, error: { statusCode, name, message } }`. An `await` in a
 * `try` block sees nothing wrong. Before GTC-265 every sender here reported
 * success on a rejected key, a suspended domain, a rate limit and an outage
 * alike.
 *
 * The senders' own `console.error` calls are not redundant with Resend's:
 * the SDK's internal `logError` is suppressed when NODE_ENV === 'production',
 * which is exactly where a silent failure costs the most.
 */

import { Resend } from 'resend';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

/** What every sender in this file returns. Callers decide what it means. */
export interface SendResult {
  success: boolean;
  error?: string;
}

/** Resend returns its failure; it does not throw it. This is the read. */
function resultOf(
  label: string,
  to: string,
  response: {
    error?: { message?: string; name?: string; statusCode?: number | null } | null;
  }
): SendResult {
  const err = response?.error;
  if (!err) return { success: true };
  const message = err.message ?? err.name ?? 'Unknown Resend error';
  console.error(`[Email] ${label} to ${to} REJECTED by Resend:`, {
    name: err.name,
    statusCode: err.statusCode,
    message,
  });
  return { success: false, error: message };
}

// Initialize Resend client lazily to ensure env vars are loaded
let resendClient: Resend | null = null;

export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendMagicLinkEmail(to: string, token: string): Promise<SendResult> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = `${baseUrl}/auth/verify?token=${token}`;

  try {
    const resend = getResendClient();

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to,
      subject: 'Sign in to Gather',
      text: `Click here to sign in to Gather:\n\n${link}\n\nThis link expires in 15 minutes.`,
    });

    return resultOf('magic link', to, response);
  } catch (error) {
    // getResendClient() throws when RESEND_API_KEY is missing. Same outcome,
    // different door — see the header: both must report failure.
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] magic link to ${to} could not be attempted:`, message);
    return { success: false, error: message };
  }
}

export async function sendNudgeEmail(params: {
  to: string;
  subject: string;
  body: string;
  eventId: string;
  personId: string;
}): Promise<SendResult> {
  try {
    const resend = getResendClient();
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to: params.to,
      subject: params.subject,
      text: params.body,
    });
    return resultOf('nudge', params.to, response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send nudge to ${params.to}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/*
 * ⚠ THE 30-DAY EXPIRY BELOW IS DELIBERATELY UNTOUCHED BY GTC-265, AND GTC-282
 * IS THE TICKET THAT ENDS THAT STATE.
 *
 * Every other MagicLink in the tree lives 15 minutes. This one lives a month
 * because today it is a bookmark: the host already holds a session when it is
 * sent, and the email says so. GTC-280 changes what it is — it becomes the
 * only way a signed-out host reaches the event she just paid for — and a
 * month-long single-use sign-in credential sitting in a mailbox is then the
 * wrong instrument. That decision is GTC-282's, not this file's.
 *
 * Zone 2 boundary for GTC-265: inspect the send's result, record the failure,
 * return it. Generation, expiry and consumption are not this ticket's.
 */
export async function sendWelcomeEmail(
  email: string,
  eventName: string,
  eventId: string
): Promise<SendResult> {
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await prisma.magicLink.create({
    data: { email, token, expiresAt },
  });

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const magicLinkUrl = `${baseUrl}/auth/verify?token=${token}&returnUrl=${encodeURIComponent(`/plan/${eventId}`)}`;

  try {
    const resend = getResendClient();

    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to: email,
      subject: `Your event "${eventName}" is ready!`,
      html: `
      <h1>Your event is created!</h1>
      <p>Thanks for using Gather. Your event "${eventName}" is all set up.</p>
      <p>You're currently logged in, but save this link to return anytime:</p>
      <p><a href="${magicLinkUrl}">Access your event →</a></p>
      <p>This link expires in 30 days. You can always request a new one from the sign-in page.</p>
    `,
    });

    return resultOf('welcome', email, response);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] welcome email to ${email} could not be attempted:`, message);
    return { success: false, error: message };
  }
}
