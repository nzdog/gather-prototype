/**
 * [[GTC-337]] RULING 2 — EVERY TEXT GATHER SENDS ENDS WITH THE OPT-OUT LINE, ON ITS OWN LINE.
 *
 * Founder, 2026-09-28: *"every text ends with 'Reply STOP to opt out' on its own line — the
 * invitation, the thank-you, your own nudges and the 'maybe' follow-up."* No dash (which also
 * settles [[GTC-257]] ruling 1), exactly once per text.
 *
 * ⚠ WHY THIS IS NOT IN `sendSms` — Unknown 1, ruled. `sendSms` is one place, but it holds Zone 7's
 * opt-out check, and every screen that shows a text before it goes (the pre-flight's count,
 * `NudgeComposer`) would stop showing what is sent. So the composers and the text sends call
 * this, and `tests/texts-test.ts` layer H fails on any `sendSms(` call site whose message does
 * not carry it.
 *
 * ⚠ THE WORDS ONLY. This module reads and writes no opt-out state; the STOP reply itself is
 * honoured by Zone 7 (`isOptOutMessage` in `src/lib/sms/opt-out-keywords.ts`), untouched here.
 *
 * CLIENT-SAFE: `NudgeComposer` and the pre-flight import it.
 */

export const OPT_OUT_LINE = 'Reply STOP to opt out';

/*
 * A copy the body already ends with — typed by a host into her own nudge, on its own line or
 * after the old ` — ` / ` - ` suffix — is removed first, so the line is there exactly once.
 */
const TRAILING_LINE = /[\s\-–—]*Reply STOP to opt out[\s.]*$/i;

export function withOptOutLine(body: string): string {
  return `${body.replace(TRAILING_LINE, '').trimEnd()}\n${OPT_OUT_LINE}`;
}
