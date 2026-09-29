/**
 * [[GTC-274]] — THE LIVE SWITCH. Gather sends for real only where this says it is live.
 *
 * Founder ruling, 2026-09-29, verbatim as chosen:
 *
 * > *"Gather only sends for real where a setting says it's live: production. Anywhere else,
 * > including your Mac, every text and email stops at the last step, whatever keys are there, and
 * > tests still run in full. Costs one extra setting on Railway, checked at deploy (without it
 * > production sends nothing). A deliberate live test to your own address means turning it on for
 * > that one run."*
 *
 * ⚠ IT IS A LIVE PREDICATE THAT ONLY PRODUCTION SETS, NOT A TEST-MODE PREDICATE THAT A SUITE SETS.
 * The ruling declined "tests turn sending off" because a test written later that forgot the switch
 * could still send. With this polarity, forgetting it sends nothing.
 *
 * ⚠ ONLY THE EXACT STRING `on` IS ON. Unset, empty, `true`, `1`, `yes` are all off, so a value typed
 * wrong fails safe. It is READ AT EVERY CALL and never captured at module scope (unlike the providers'
 * own configuration), so no process can hold a stale "on".
 *
 * WHERE THE GATE SITS — the last step before each provider call, after the opt-out checks (Zone 7,
 * whose order in `sendSms` is load-bearing) and after provider choice and configuration, so every
 * outcome the suites assert today still holds:
 *   - `sendSms` in `src/lib/sms/send-sms.ts`, before `sendViaTnz` and Twilio's `messages.create`;
 *   - `sendViaTnz` in `src/lib/sms/tnz-client.ts`, before its fetch (what `live:tnz-sms` calls);
 *   - `getResendClient` in `src/lib/email.ts`, after the client is built (a missing key still throws
 *     first), so every Resend caller is behind it — the claim route in Zone 2 without being edited.
 *
 * A STOPPED SEND IS NEVER RECORDED OR REPORTED AS SENT: a text returns `SMS_DISABLED` with
 * `LIVE_SENDS_OFF` and writes no InviteEvent; an email returns `success: false` with no provider
 * code, which `SendResult` already reads as "the request never left the process".
 *
 * PRODUCTION SETS IT on Railway, and the deploy checks it: `scripts/check-live-sends.mjs` is the
 * first step of `build`. The only other way on is `liveBehindTrap` in
 * `tests/helpers/provider-trap.ts`, behind walls that stop every request leaving the process.
 */

export const LIVE_SENDS_VAR = 'GATHER_LIVE_SENDS';

/** The words every stopped send carries. Deliberately free of any word the retry predicate reads as transient. */
export const LIVE_SENDS_OFF = "Not sent: live sending is off (GATHER_LIVE_SENDS is not 'on')";

export function isLiveSendingOn(): boolean {
  return process.env[LIVE_SENDS_VAR] === 'on';
}

/** Thrown by `getResendClient` when the switch is off: the email senders' `catch` reports it. */
export class LiveSendsOffError extends Error {
  constructor() {
    super(LIVE_SENDS_OFF);
    this.name = 'LiveSendsOffError';
  }
}
