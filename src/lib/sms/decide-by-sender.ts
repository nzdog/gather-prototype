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

/**
 * GTC-175 (D2) — sending the maybe's one follow-up.
 *
 * Every send goes through `sendSms`, never TNZ or Twilio directly. That is not tidiness:
 * `sendSms` re-checks opt-out before the provider config (Do-Not-Touch zone 7), routes
 * +64/+61 to TNZ, and writes the `NUDGE_SENT_AUTO` InviteEvent that carries TNZ's
 * `MessageID`. [[GTC-264]]'s delivery store joins a delivery report to its send on that
 * id, and [[GTC-288]]'s reply store joins a STOP or a reply on it. (The Twilio-shaped
 * `sms/inbound` route that once read this row was deleted at GTC-264 / GTC-229.) A
 * bespoke send path would silently break both.
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
