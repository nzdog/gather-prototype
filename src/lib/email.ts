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
import { listUnsubscribeHeaders, withGuestEmailFooter } from '@/lib/email-footer';
import { unsubscribeUrls } from '@/lib/unsubscribe-token';
import { isLiveSendingOn, LiveSendsOffError } from '@/lib/live-sends';

/** What every sender in this file returns. Callers decide what it means. */
export interface SendResult {
  success: boolean;
  error?: string;
  /*
   * Resend's own id for the accepted message — GTC-189 slice 4b.
   *
   * WHY IT IS SLICE 4'S AND NOT SLICE 6'S. Slice 5's dispatcher writes it onto
   * `OutboundMessage.providerMessageId` at acceptance, so the sender has to
   * return it BEFORE slice 5's code is written. Slice 6 reads the STORED id off
   * that row when a bounce webhook arrives, and never touches this return
   * value. The consumer is slice 5.
   *
   * OPTIONAL, AND ADDITIVE ON PURPOSE. Present only on success, because only an
   * accepted send has one. ⚠ NEVER A PLACEHOLDER on failure: slice 6 joins on
   * this value, so a value that is not the provider's would match nothing and
   * read as a lost bounce rather than as a send that never happened.
   *
   * NOTHING READS IT YET. No caller of any sender in this file touches it, and
   * `tests/email-send-result-test.ts` layer 2b asserts that.
   */
  providerMessageId?: string;
  /*
   * Resend's own error CODE and HTTP status — GTC-289 phase 2 ([[GTC-189]] slice 6).
   *
   * ⚠ WHY THEY WERE ADDED: slice 5c's `isRetryableProviderError` matched this interface's `error`
   * STRING, because that was all there was. The SDK declares `ErrorResponse { message; statusCode;
   * name }` where `name` is a closed 21-value union, so the dispatcher was reading prose where a code
   * existed. Founder ruling, 2026-09-19 — it goes before the migration, because a shipped predicate
   * known to be reading the wrong field should not wait behind a rehearsal.
   *
   * PRESENT ONLY ON A PROVIDER REFUSAL, and absent on both other outcomes:
   *
   *   - absent on success, because an accepted send has no error at all;
   *   - ⚠ absent on the THROWN path, and that absence is load-bearing. `getResendClient()` throws
   *     when the key is missing, and a thrown `Error` has a `.name` too — `TypeError`, `AbortError`.
   *     Putting that in this field would say the provider answered when the provider was never
   *     called. So no `catch` block in this file sets either field, and on an EMAIL row a failure
   *     with NO code means the request never left the process.
   *
   * ⚠ TYPED `string`, NOT AS THE SDK'S 21-VALUE UNION, DELIBERATELY. Typing the return as the union
   * would assert that the live API only ever answers with a declared code, which is exactly the
   * unobserved-shape limit [[GTC-323]] exists for. Verbatim in; classified by
   * `src/lib/email-delivery/resend-error-contract.ts`, which is where an unrecognised code is handled.
   */
  providerErrorCode?: string;
  providerStatusCode?: number;
}

/** Resend returns its failure; it does not throw it. This is the read. */
function resultOf(
  label: string,
  to: string,
  response: {
    data?: { id?: string } | null;
    error?: { message?: string; name?: string; statusCode?: number | null } | null;
  }
): SendResult {
  const err = response?.error;
  // GTC-189 slice 4b: the id rides back with the success, for slice 5 to store.
  if (!err) return { success: true, providerMessageId: response?.data?.id };
  const message = err.message ?? err.name ?? 'Unknown Resend error';
  console.error(`[Email] ${label} to ${to} REJECTED by Resend:`, {
    name: err.name,
    statusCode: err.statusCode,
    message,
  });
  /*
   * GTC-289 phase 2 — the two fields the log has printed since GTC-265 now also come BACK.
   *
   * ⚠ OBSERVED, 2026-09-19, with a deliberately invalid sentinel key and nothing delivered:
   * `{ statusCode: 401, name: 'validation_error', message: 'API key is invalid' }`. Three fields,
   * those names, `statusCode` a number — so this read is against a shape that has been seen, which
   * is more than slice 4b could say about the success envelope.
   *
   * Each field is set only when the provider actually gave it. An `err.statusCode` of `null` is
   * declared in the SDK and means the provider gave none, so it is left ABSENT rather than coerced
   * to 0 — the dispatcher reads an absent status as "fall through to the message" and a 0 would
   * read as "not retryable".
   */
  const failure: SendResult = { success: false, error: message };
  if (typeof err.name === 'string' && err.name.length > 0) failure.providerErrorCode = err.name;
  if (typeof err.statusCode === 'number') failure.providerStatusCode = err.statusCode;
  return failure;
}

// Initialize Resend client lazily to ensure env vars are loaded
let resendClient: Resend | null = null;

/*
 * [[GTC-274]] — THE LIVE SWITCH FOR EMAIL. The one door to Resend, so the one place to stop it.
 *
 * ⚠ ORDER: the client is built first, so a missing key still throws "Missing API key" as it always
 * has — the configuration check — and only then does the switch throw `LiveSendsOffError`. Every
 * sender's `catch` below reports either as `{ success: false, error }` with NO provider code, which
 * this file's `SendResult` already reads as "the request never left the process". The claim route
 * (`src/app/api/auth/claim/route.ts`, Zone 2) calls this directly and is covered without an edit.
 * The delivery poll's reads stop too: a machine that is not live has no accepted send to read.
 */
export function getResendClient(): Resend {
  if (!resendClient) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  if (!isLiveSendingOn()) {
    throw new LiveSendsOffError();
  }
  return resendClient;
}

/**
 * ⚠ [[GTC-296]] RULING 6 — EXEMPT, AND DO NOT "FIX" THIS BY ADDING THE HEADER.
 *
 * *"Not host-to-guest mail — a direct response to something the account holder just did."*
 * Same reading commercial-mail law gives transactional mail. And the specific absurdity here
 * is worth naming: an unsubscribe link on a sign-in email offers to switch off the only way
 * back in. `tests/email-opt-out-test.ts` layer G asserts the absence, with a subject opted out
 * of every event that exists.
 */
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

/**
 * [[GTC-296]] — THE WAY OUT, ATTACHED WHERE IT CANNOT BE FORGOTTEN.
 *
 * ⚠ THE SENDER MINTS, NOT THE CALLER, AND THAT IS A DELIBERATE DEPARTURE FROM THE APPROVED
 * PLAN. The plan had each caller build the URL and pass it in. Building it here instead makes
 * ruling Q — *"every email carries a way out"* — TRUE BY CONSTRUCTION rather than by every
 * caller remembering: a guest sender cannot compose a message without one, because the only
 * inputs it needs are the two ids it already takes.
 *
 * ⚠ AND IT DOES NOT BREAK GTC-265's RULE AT THE TOP OF THIS FILE. Minting a URL is
 * COMPOSITION, not a decision about a failure. The sender still returns its result and still
 * decides nothing for its caller.
 *
 * ⚠ IT THROWS WHEN `UNSUBSCRIBE_TOKEN_SECRET` IS UNSET, AND THE THROW IS THE POINT. It is the
 * same door `getResendClient()` uses for a missing `RESEND_API_KEY`, caught by the same
 * `try/catch` below and reported the same way — so a Gather with no secret configured sends no
 * guest email AT ALL rather than sending one with no way out of it. Failing closed, following
 * [[GTC-270]]'s precedent for `CRON_SECRET`.
 *
 * ⚠ NOT USED BY `sendMagicLinkEmail` OR `sendWelcomeEmail` — ruling 6 exempts both. See the
 * note on each.
 */
function guestEmailParts(
  body: string,
  personId: string,
  eventId: string
): { text: string; headers: Record<string, string> } {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const { pageUrl, oneClickUrl } = unsubscribeUrls(baseUrl, personId, eventId);
  return {
    text: withGuestEmailFooter(body, pageUrl),
    headers: listUnsubscribeHeaders(oneClickUrl),
  };
}

/**
 * GTC-189 slice 5c — THE ASK. A new sender, and it is slice 4b's first caller.
 *
 * ⚠ WHY `sendNudgeEmail` COULD NOT BE REUSED, which is the reason this exists at all:
 *
 *  - It sends from `EMAIL_FROM` with no per-message display name, and ruling F wants the
 *    message to carry THE HOST'S name as sender.
 *  - It sets no `reply_to`, and ruling F wants `User.email` there — "her address as
 *    reply-to, sent from our verified domain because it cannot be sent from hers."
 *
 * ⚠ THE SEAM HINGE §5 DESCRIBES IS WHAT MAKES THIS HONEST RATHER THAN A PRETENCE. The
 * message arrives under her name on Gather's domain, and the second movement names
 * Gather. THE ADDRESS IS NOT HERS AND IS NOT PRESENTED AS HERS — the display name is
 * hers, the address is ours, and replies go to her. Do not "improve" this by putting her
 * address in `from`: it would fail SPF/DKIM on a domain she does not control, and it
 * would be a pretence the founder ruling explicitly declines.
 *
 * ⚠ AND `EMAIL_FROM` HERE IS `"Gather <onboarding@resend.dev>"` — Resend's SANDBOX
 * sender, not a verified Gather domain. So ruling F's "our verified domain" has nothing
 * behind it in this environment, and neither the display name nor the reply-to can be
 * observed arriving. [[GTC-247]].
 *
 * It answers through the same `resultOf` as the other three, so it inherits slice 4b's
 * `providerMessageId` rather than getting a second reading of Resend's envelope.
 */
/** The ask and the chase share one shape: her name on Gather's address, replies to her. */
interface HostVoicedEmail {
  to: string;
  subject: string;
  body: string;
  /** `User.email` (ruling F). Where a reply goes. */
  replyTo: string;
  /** The host's name, as the display name on Gather's address. Never her address. */
  fromName: string;
  /**
   * [[GTC-296]] — the recipient and the event, for the way out. REQUIRED, so a future caller
   * cannot compose a guest email without one; `tsc` is the guard, as it is for every
   * `Record`-keyed map in this tree.
   */
  personId: string;
  eventId: string;
}

export async function sendAskEmail(params: HostVoicedEmail): Promise<SendResult> {
  return sendHostVoiced('ask', params);
}

/**
 * [[GTC-189]] slice 8b — THE CHASE'S EMAIL LEG. The ask's sender under its own name, so a reader
 * of a log or a call site never has to learn that "ask" also meant "reminder" — two questions
 * sharing one answer because they share a word, which this ticket has caught five times. The
 * reminder is her follow-up to her own invitation, so it carries the same display name and the
 * same reply-to (ruling F), and the same way out (ruling Q).
 */
export async function sendChaseEmail(params: HostVoicedEmail): Promise<SendResult> {
  return sendHostVoiced('chase', params);
}

/**
 * [[GTC-251]] slice 251b — THE DECIDE-BY FOLLOW-UP'S EMAIL LEG (Q4). Her follow-up to her own
 * invitation, so the same display name, reply-to and way out as the ask and the reminders.
 *
 * ⚠ ZONE 9: like `sendChaseEmail`, it does not itself read the opt-out or the block. Its one caller,
 * `sendDecideByFollowup`, sends only where the chase chooser answered EMAIL (which read both) and
 * re-reads the block immediately before calling this.
 */
export async function sendDecideByEmail(params: HostVoicedEmail): Promise<SendResult> {
  return sendHostVoiced('decide-by', params);
}

async function sendHostVoiced(
  label: 'ask' | 'chase' | 'decide-by',
  params: HostVoicedEmail
): Promise<SendResult> {
  try {
    const resend = getResendClient();
    const configured = process.env.EMAIL_FROM || 'Gather <noreply@gather.app>';
    // The configured value may be "Name <addr>" or a bare address; the host's name replaces
    // the display part and the address is always ours.
    const match = configured.match(/<([^>]+)>/);
    const address = match ? match[1] : configured;
    const { text, headers } = guestEmailParts(params.body, params.personId, params.eventId);
    const response = await resend.emails.send({
      from: `${params.fromName} <${address}>`,
      to: params.to,
      replyTo: params.replyTo,
      subject: params.subject,
      text,
      headers,
    });
    return resultOf(label, params.to, response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[Email] Failed to send ${label} to ${params.to}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * The by-hand nudge and the wrap-up thank-you.
 *
 * ⚠ [[GTC-296]]: A GUEST SENDER, SO IT CARRIES THE WAY OUT — and it already took the two ids
 * needed to mint one, which is why this sender needed no new argument and the ask did.
 *
 * ⚠ IT DOES NOT ITSELF CHECK THE OPT-OUT, AND THAT IS GTC-265's RULE RATHER THAN AN OVERSIGHT.
 * Its two callers answer the question differently by founder ruling — the manual nudge
 * OVERRIDES an opt-out and says what it is overriding (ruling 4), the wrap-up thank-you does
 * not send at all (ruling 5, as corrected by R3). A sender that refused for both would be
 * wrong for one of them, which is exactly the shape this file's header warns about.
 */
export async function sendNudgeEmail(params: {
  to: string;
  subject: string;
  body: string;
  eventId: string;
  personId: string;
}): Promise<SendResult> {
  try {
    const resend = getResendClient();
    const { text, headers } = guestEmailParts(params.body, params.personId, params.eventId);
    const response = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to: params.to,
      subject: params.subject,
      text,
      headers,
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
 *
 * ⚠ [[GTC-296]] RULING 6 — EXEMPT, like the magic link above. It goes to the HOST at event
 * creation, about the account she just made, and it carries a sign-in link. It reads no
 * opt-out and gains no header.
 */
export async function sendWelcomeEmail(
  email: string,
  eventName: string,
  eventId: string,
  options: { alreadySignedIn?: boolean } = {}
): Promise<SendResult> {
  /*
   * GTC-280 — `alreadySignedIn` exists because the old copy became false for
   * exactly the person who now depends on this link.
   *
   * It read "You're currently logged in, but save this link to return
   * anytime". That was true when `POST /api/events` handed every payer a
   * session. It no longer does, so a signed-out host reaches the event she has
   * just paid for ONLY through this link, and telling her she is already
   * logged in is both wrong and the least helpful thing to say.
   *
   * ⚠ ZONE 2 IS CALL-ONLY AND THIS STAYS INSIDE IT. The `magicLink.create`
   * below, its token and its 30-day expiry are untouched — only the prose
   * around the same link changes. The expiry is GTC-282's.
   */
  const alreadySignedIn = options.alreadySignedIn === true;
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
      html: alreadySignedIn
        ? `
      <h1>Your event is created!</h1>
      <p>Thanks for using Gather. Your event "${eventName}" is all set up.</p>
      <p>You're currently logged in, but save this link to return anytime:</p>
      <p><a href="${magicLinkUrl}">Access your event →</a></p>
      <p>This link expires in 30 days. You can always request a new one from the sign-in page.</p>
    `
        : `
      <h1>Your event is created!</h1>
      <p>Thanks for using Gather. Your payment went through and your event "${eventName}" is all set up.</p>
      <p>Open this link to sign in and start planning:</p>
      <p><a href="${magicLinkUrl}">Sign in and open your event →</a></p>
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
