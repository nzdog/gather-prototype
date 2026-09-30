import type { SmsBlockReason } from '@/lib/sms/send-sms';

/**
 * [[GTC-339]] — WHEN A SENDING CRON'S RUN HAS FAILED. One rule for the three crons that send:
 * `/api/cron/outbound-dispatch`, `/api/cron/wrap-up-dispatch` and `/api/cron/decide-by-followups`.
 *
 * Founder ruling Q1, 2026-09-30, verbatim as chosen: *"Per channel (Recommended)"* — *"Fails if it
 * tried to send texts and none got out, or tried emails and none got out, so broken texting shows up
 * even while emails go fine. Nothing to send: OK. One bad address among messages that went: OK. A
 * text stopped because texting isn't set up or the live switch is off counts as not got out. Held
 * back for a reason about the guest or you (an opt-out, your mark, an answer, a number that isn't
 * valid) never counts. The security test stays as it is."*
 *
 * WHY THIS REPLACED `success: true`: each of those routes answered 200 unless its handler threw,
 * however many of its sends failed, so a production that could send nothing read as three green
 * crons. GTC-214 had already closed that for the reminder cron; since [[GTC-189]] slice 8b that cron
 * sends nothing, and its verdict is now its own job only (ruling Q2, `runNudgeScheduler`).
 *
 * ⚠ PER CHANNEL, NOT PER RUN. A whole-run count would let working email hide broken texting — the
 * case the ruling names. ⚠ AND "NOTHING TO SEND" IS HEALTHY: `tests/security-validation.ts` suite 12
 * drives two of these routes with nothing to send and pins 200, and an idle cron is a working one.
 *
 * Pure, so every quadrant is assertable without a database or a provider.
 */

export type SendChannel = 'text' | 'email';

/**
 * What one send contributes to its run's health.
 *
 * - `GOT_OUT` — the provider accepted it.
 * - `NOT_OUT` — there was a send to make and it did not get out: the provider refused it, it is
 *   waiting to be retried, or configuration or the live switch stopped it.
 * - `NOT_COUNTED` — held back for a reason about the guest or the host, or not attempted at all
 *   (quiet hours, another run's claim). Adds nothing either way.
 */
export type SendOutcome = 'GOT_OUT' | 'NOT_OUT' | 'NOT_COUNTED';

export interface ChannelTally {
  /** Sends this run had to make on the channel, counted ones only. */
  toSend: number;
  gotOut: number;
}

export interface SendTally {
  text: ChannelTally;
  email: ChannelTally;
}

export interface SendRunHealth {
  ok: boolean;
  /** The channels that had sends to make and got none out, text first. */
  failedChannels: SendChannel[];
}

export function emptyTally(): SendTally {
  return { text: { toSend: 0, gotOut: 0 }, email: { toSend: 0, gotOut: 0 } };
}

/** Add one send's outcome to a run's tally. */
export function tallySend(tally: SendTally, channel: SendChannel, outcome: SendOutcome): void {
  if (outcome === 'NOT_COUNTED') return;
  tally[channel].toSend++;
  if (outcome === 'GOT_OUT') tally[channel].gotOut++;
}

export function sendRunHealth(tally: SendTally): SendRunHealth {
  const failedChannels = (['text', 'email'] as const).filter(
    (c) => tally[c].toSend > 0 && tally[c].gotOut === 0
  );
  return { ok: failedChannels.length === 0, failedChannels };
}

/**
 * `sendSms`'s refusals, read for health. A `Record` keyed on the union, so a reason added to
 * `SmsBlockReason` is a compile error here until somebody decides whether it counts.
 *
 * `SMS_DISABLED` counts — no provider for the number, or the live switch off (Unknown 2, ruled Q1);
 * it stays a terminal withholding in the row, and only the health reading is decided here.
 * `SEND_FAILED` is the provider refusing. The other two are facts about the guest.
 */
export const SMS_BLOCK_COUNTS: Record<SmsBlockReason, boolean> = {
  SMS_DISABLED: true,
  SEND_FAILED: true,
  OPTED_OUT: false,
  INVALID_NUMBER: false,
};

/** A text `sendSms` refused, as an outcome. */
export function smsRefusalOutcome(blocked: SmsBlockReason | undefined): SendOutcome {
  // No reason at all is a refusal nobody classified; it did not get out.
  if (!blocked) return 'NOT_OUT';
  return SMS_BLOCK_COUNTS[blocked] ? 'NOT_OUT' : 'NOT_COUNTED';
}
