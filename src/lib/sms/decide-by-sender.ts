import { prisma } from '@/lib/prisma';
import { sendSms } from '@/lib/sms/send-sms';
import { isQuietHours, getMinutesUntilQuietEnd } from '@/lib/sms/quiet-hours';
import { logInviteEvent } from '@/lib/invite-events';
import {
  getDecideByFollowupMessage,
  formatDecideByDay,
  getMessageInfo,
} from '@/lib/sms/nudge-templates';
import type { DecideByFollowupCandidate } from '@/lib/sms/decide-by-eligibility';
import { sendDecideByEmail } from '@/lib/email';
import { composeDecideByEmail } from '@/lib/messages/decide-by-register';
import {
  EMAIL_BLOCK_SKIP_REASON,
  emailBlockStateOf,
  listEmailBlocks,
} from '@/lib/eligibility/email-block';
import {
  emptyTally,
  smsRefusalOutcome,
  tallySend,
  type SendOutcome,
  type SendTally,
} from '@/lib/send-health';
import {
  claimTextRetry,
  closeTextRetry,
  closeTextSend,
  openTextSend,
  TEXT_RETRY_WINDOW_MS,
} from '@/lib/sms/text-send-record';
import { retryableFor } from '@/lib/sms/text-outcome';
import { readAskPreview } from '@/lib/preflight/ask-preview';
import { getEmailOptOut } from '@/lib/eligibility/email-opt-out';
import { decideBy } from '@/lib/decide-by';
import type { OutboundWithheldWhy } from '@/lib/press/dispatch';

/**
 * GTC-175 (D2) — sending the maybe's one follow-up.
 *
 * Every send goes through `sendSms`, never TNZ or Twilio directly. That is not tidiness:
 * `sendSms` re-checks opt-out before the provider config (Do-Not-Touch zone 7), refuses a
 * number TNZ reported dead or on their list ([[GTC-258]]), and routes +64/+61 to TNZ.
 *
 * [[GTC-258]] — THE TEXT'S RECORD IS AN `OutboundMessage` OF KIND DECIDE_BY_FOLLOWUP, opened before
 * the send and closed after (`openTextSend`/`closeTextSend`). It holds TNZ's MessageID, which
 * [[GTC-264]]'s delivery store and [[GTC-288]]'s reply store join on; it used to be the
 * `NUDGE_SENT_AUTO` InviteEvent `sendSms` wrote, retired with this ticket. And when TNZ report the
 * text did not arrive, `retryUndeliveredFollowups` below sends the follow-up ONCE by email — the
 * one retry of founder ruling Q2, 2026-10-02.
 *
 * [[GTC-251]] slice 251b — AND AN EMAIL LEG (Q4), for the guest the chase chooser emails. It goes
 * through `sendDecideByEmail`, the host-voiced guest sender, so the way out, the footer and the
 * reply-to are those of every guest email.
 */

export interface DecideByFollowupResult {
  personId: string;
  personName: string;
  eventId: string;
  assignmentIds: string[];
  success: boolean;
  messageId?: string;
  error?: string;
  /** [[GTC-339]] — the channel it went by, and what it contributes to the run's health. */
  channel: 'TEXT' | 'EMAIL';
  outcome: SendOutcome;
}

/**
 * Send the follow-up to one candidate and record it.
 *
 * THE STAMP IS WRITTEN ONLY ON SUCCESS, and it is written for EVERY assignment collapsed
 * into the message — not just the one the copy names. Stamping only the named item would
 * leave its siblings looking un-followed-up, and the next tick would text the same person
 * again about the same event.
 */
export async function sendDecideByFollowup(
  candidate: DecideByFollowupCandidate,
  now: Date = new Date()
): Promise<DecideByFollowupResult> {
  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link = `${baseUrl}/p/${candidate.participantToken}`;

  const base = {
    channel: candidate.channel,
    personId: candidate.personId,
    personName: candidate.personName,
    eventId: candidate.eventId,
    assignmentIds: candidate.assignmentIds,
  };

  if (candidate.channel === 'EMAIL') {
    return sendByEmail(candidate, link, base, now);
  }

  const message = getDecideByFollowupMessage({
    hostFirstName: candidate.hostName.split(' ')[0],
    itemName: candidate.itemName,
    decideByDay: formatDecideByDay(candidate.decideByAt, now),
    link,
  });

  const messageInfo = getMessageInfo(message);

  const record = await openTextSend(prisma, {
    eventId: candidate.eventId,
    personId: candidate.personId,
    kind: 'DECIDE_BY_FOLLOWUP',
    destination: candidate.phoneNumber,
  });
  const result = await sendSms({
    to: candidate.phoneNumber ?? '',
    message,
    eventId: candidate.eventId,
    personId: candidate.personId,
    metadata: {
      type: 'decide_by_followup',
      itemName: candidate.itemName,
      decideByAt: candidate.decideByAt.toISOString(),
      assignmentCount: candidate.assignmentIds.length,
      messageLength: messageInfo.length,
      messageSegments: messageInfo.segments,
    },
  });
  await closeTextSend(prisma, record, result);

  if (!result.success) {
    return {
      ...base,
      success: false,
      error: result.error || result.blocked,
      outcome: smsRefusalOutcome(result.blocked),
    };
  }

  await stamp(candidate, now);
  return { ...base, success: true, messageId: result.messageId, outcome: 'GOT_OUT' };
}

async function stamp(candidate: DecideByFollowupCandidate, now: Date): Promise<void> {
  await prisma.assignment.updateMany({
    where: { id: { in: candidate.assignmentIds } },
    data: { decideByFollowupSentAt: now },
  });
}

/**
 * [[GTC-251]] — the email leg. ZONE 9: the chooser read the opt-out and the block when it chose
 * EMAIL; the block is read AGAIN here, immediately before the send, because a bounce learned
 * between the finding and the sending must win — the dispatcher's F5 fence, mirrored. A refusal
 * stamps nothing, as a failed text stamps nothing.
 */
async function sendByEmail(
  candidate: DecideByFollowupCandidate,
  link: string,
  base: Omit<DecideByFollowupResult, 'success' | 'outcome'>,
  now: Date
): Promise<DecideByFollowupResult> {
  if (!candidate.email || !candidate.replyTo) {
    // [[GTC-339]]: the guest's address or the host's reply-to — never counted.
    return { ...base, success: false, error: 'No address or reply-to', outcome: 'NOT_COUNTED' };
  }
  const blocks = await listEmailBlocks(prisma, [candidate.email]);
  if (emailBlockStateOf(candidate.email, candidate.eventId, blocks) !== 'NONE') {
    return { ...base, success: false, error: EMAIL_BLOCK_SKIP_REASON, outcome: 'NOT_COUNTED' };
  }

  const hostFirstName = candidate.hostName.split(' ')[0];
  const composed = composeDecideByEmail({
    recipientFirstName: candidate.personName.split(' ')[0],
    hostFirstName,
    eventName: candidate.eventName,
    itemName: candidate.itemName,
    decideByDay: formatDecideByDay(candidate.decideByAt, now),
    link,
  });
  const result = await sendDecideByEmail({
    to: candidate.email,
    subject: composed.subject,
    body: composed.text,
    replyTo: candidate.replyTo,
    fromName: candidate.hostName,
    personId: candidate.personId,
    eventId: candidate.eventId,
  });

  // [[GTC-339]]: the switch, a missing key or the provider refusing — counted as not got out.
  if (!result.success) return { ...base, success: false, error: result.error, outcome: 'NOT_OUT' };
  await stamp(candidate, now);
  return { ...base, success: true, messageId: result.providerMessageId, outcome: 'GOT_OUT' };
}

/**
 * Process every due follow-up.
 *
 * Quiet hours hold the TEXTS only, per candidate — [[GTC-251]] 4.5, the chase's own rule since
 * [[GTC-189]] slice 8b moved quiet hours into `drainOnce` (per row, text only): an email waits in
 * an inbox, a text wakes a phone. A held text is logged and nothing is written for it, so the
 * next run after 08:05 NZ picks it up unchanged.
 *
 * This is also why the follow-up lead has a 12-hour floor (decide-by.ts): a quiet-hours
 * deferral can cost ~11 hours, and a shorter lead could push the message past the very
 * deadline it quotes.
 */
export async function processDecideByFollowups(
  candidates: DecideByFollowupCandidate[],
  now: Date = new Date()
): Promise<{
  sent: DecideByFollowupResult[];
  deferred: number;
  deferredUntilMinutes: number;
  /** [[GTC-339]] — per channel, for the run's health. A held text is not counted. */
  tally: SendTally;
}> {
  if (candidates.length === 0) {
    return { sent: [], deferred: 0, deferredUntilMinutes: 0, tally: emptyTally() };
  }

  const quiet = isQuietHours(now);
  const minutesUntil = quiet ? getMinutesUntilQuietEnd(now) : 0;
  const held = quiet ? candidates.filter((c) => c.channel === 'TEXT') : [];
  const going = quiet ? candidates.filter((c) => c.channel !== 'TEXT') : candidates;

  if (held.length > 0) {
    for (const candidate of held) {
      await logInviteEvent({
        eventId: candidate.eventId,
        personId: candidate.personId,
        type: 'NUDGE_DEFERRED_QUIET',
        metadata: {
          nudgeType: 'decide_by_followup',
          deferredMinutes: minutesUntil,
          phoneNumber: candidate.phoneNumber,
        },
      });
    }
  }

  const results: DecideByFollowupResult[] = [];
  const tally = emptyTally();

  for (const candidate of going) {
    const one = await sendDecideByFollowup(candidate, now);
    results.push(one);
    tallySend(tally, one.channel === 'EMAIL' ? 'email' : 'text', one.outcome);

    // Small delay between sends to avoid rate limiting — the house rate.
    await sleep(500);
  }

  return {
    sent: results,
    deferred: held.length,
    deferredUntilMinutes: held.length > 0 ? minutesUntil : 0,
    tally,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── [[GTC-258]] — the one retry ──────────────────────────────────────────────────────────────

export interface FollowupRetryResult {
  /** Retries sent by email. */
  sent: number;
  /** Retries spent without an email: the guest answered, opted out, or has no usable address. */
  withheld: number;
  /** Retries the provider refused. */
  refused: number;
  /** Per channel, for the run's health ([[GTC-339]]): the retry emails it had to send. */
  tally: SendTally;
}

/**
 * [[GTC-258]] — A "PLEASE DECIDE" FOLLOW-UP WHOSE TEXT DID NOT ARRIVE GOES ONCE BY EMAIL.
 *
 * Founder ruling Q2, 2026-10-02: *"the 'please decide' follow-up and the thank-you only ever go once,
 * so if their text didn't arrive they're re-sent by email."* Queued by the outcome and sent here, on
 * the follow-up's own cron, never from the webhook. An email is not held by quiet hours ([[GTC-251]]
 * 4.5).
 *
 * WHICH TEXTS: kind DECIDE_BY_FOLLOWUP, an outcome `retryableFor('DECIDE_BY_FOLLOWUP')` names — not a
 * TNZ opt-out (a text opt-out stops the follow-up, Q4a) and not a cancel (plan ruling Q3) — not yet
 * retried, and accepted within `TEXT_RETRY_WINDOW_MS`. Founder-approved 2026-10-02: the sweep looks
 * only at texts accepted in the last 48 hours and SKIPS one whose decide-by has passed, writing no row
 * and using no new withheld code.
 *
 * WHEN A RETRY IS SPENT WITHOUT AN EMAIL, its row says why (the dispatcher's own codes): the guest no
 * longer holds a maybe this follow-up stamped (ANSWERED); the chase chooser now refuses them (its own
 * why — a STOP, an email opt-out or report, don't-chase, handed to the host); no address
 * (NO_CHANNEL); a blocked address (EMAIL_BLOCKED); no reply-to (NO_REPLY_TO).
 *
 * `scope` narrows it to some events — for a suite, which must never sweep `gather_dev` unscoped.
 */
export async function retryUndeliveredFollowups(
  now: Date = new Date(),
  scope?: { eventIds: string[] }
): Promise<FollowupRetryResult> {
  const out: FollowupRetryResult = { sent: 0, withheld: 0, refused: 0, tally: emptyTally() };
  const failed = await prisma.outboundMessage.findMany({
    where: {
      kind: 'DECIDE_BY_FOLLOWUP',
      channel: 'TEXT',
      deliveryState: { in: retryableFor('DECIDE_BY_FOLLOWUP') },
      retries: { none: {} },
      acceptedAt: { gte: new Date(now.getTime() - TEXT_RETRY_WINDOW_MS) },
      ...(scope ? { eventId: { in: scope.eventIds } } : {}),
    },
    orderBy: { acceptedAt: 'asc' },
    select: {
      id: true,
      eventId: true,
      personEventId: true,
      personEvent: { select: { personId: true, person: { select: { name: true, email: true } } } },
    },
  });

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  for (const row of failed) {
    const target = { ...row, kind: 'DECIDE_BY_FOLLOWUP' as const };
    const personId = row.personEvent.personId;
    const event = await prisma.event.findUnique({
      where: { id: row.eventId },
      select: {
        name: true,
        status: true,
        sentAt: true,
        endDate: true,
        decideByOffsetHours: true,
        host: { select: { name: true } },
      },
    });
    if (!event) continue;
    const maybes = await prisma.assignment.findMany({
      where: {
        personId,
        response: 'MAYBE',
        decideByFollowupSentAt: { not: null },
        item: { team: { eventId: row.eventId } },
      },
      select: { item: { select: { name: true, dropOffAt: true, decideByOffsetHours: true } } },
    });
    const withhold = async (why: OutboundWithheldWhy) => {
      if (await claimTextRetry(prisma, target, why)) out.withheld++;
    };
    if (maybes.length === 0) {
      await withhold('ANSWERED');
      continue;
    }
    // The maybe whose decide-by lands first, of those not yet passed. None left: skip, no row.
    const open = maybes
      .map((m) => ({ name: m.item.name, at: decideBy(m.item, event) }))
      .filter((m) => m.at.getTime() >= now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    if (open.length === 0) continue;

    const preview = await readAskPreview(prisma, row.eventId, baseUrl);
    const route = preview?.chase.byMembership[row.personEventId];
    if (!preview || !route) continue;
    if (route.kind === 'NONE') {
      await withhold(route.why);
      continue;
    }
    const email = row.personEvent.person.email;
    if (!email) {
      await withhold('NO_CHANNEL');
      continue;
    }
    if (await getEmailOptOut(personId, row.eventId)) {
      await withhold('EMAIL_OPTED_OUT');
      continue;
    }
    if ((await listEmailBlocks(prisma, [email])).size > 0) {
      await withhold('EMAIL_BLOCKED');
      continue;
    }
    if (!preview.replyTo) {
      await withhold('NO_REPLY_TO');
      continue;
    }

    const claimed = await claimTextRetry(prisma, target);
    if (!claimed) continue;
    const token = await prisma.accessToken.findFirst({
      where: { personId, eventId: row.eventId, scope: 'PARTICIPANT' },
      select: { token: true },
    });
    const hostFirstName = event.host.name.split(' ')[0];
    const composed = composeDecideByEmail({
      recipientFirstName: row.personEvent.person.name.split(' ')[0],
      hostFirstName,
      eventName: event.name,
      itemName: open[0].name,
      decideByDay: formatDecideByDay(open[0].at, now),
      link: `${baseUrl}/p/${token?.token ?? ''}`,
    });
    const result = await sendDecideByEmail({
      to: email,
      subject: composed.subject,
      body: composed.text,
      replyTo: preview.replyTo,
      fromName: event.host.name,
      personId,
      eventId: row.eventId,
    });
    await closeTextRetry(prisma, claimed, result);
    tallySend(out.tally, 'email', result.success ? 'GOT_OUT' : 'NOT_OUT');
    if (result.success) out.sent++;
    else out.refused++;
  }
  return out;
}
