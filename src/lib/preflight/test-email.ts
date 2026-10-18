/**
 * [[GTC-388]] (item 64) — "SEND ME A TEST EMAIL": the words, the email's shape and the limit's rule.
 *
 * Founder plan rulings, 2026-10-16 (Q1 to Q15, W1 to W19, and the build-stop rulings Q24, Q25). The
 * host, or a co-host, sends HERSELF the message the person she is reading as in step 4 will get:
 * one email, to her own account address, never one typed in (Q1).
 *
 * CLIENT-SAFE, like `ask-preview-compose.ts`: the page draws these words, and the server module
 * composes the email with the same function, so the two cannot drift. No database, no email module.
 *
 * ⚠ BOTH OF THE GUEST'S LINKS ARE STAND-INS (Q6), and that is the safety of the whole feature. On a
 * held event step 4 shows each guest's REAL link (tokens are issued at the hold), and opening one
 * answers for the guest; the way-out link opts somebody out. So the test carries neither, and no
 * unsubscribe header: nothing in it can answer for a guest or switch anyone's email off.
 *
 * The screen's words have curly apostrophes; the email's keep straight ones, like the message it
 * copies (ruled with the W-lines).
 */

import { guestEmailFooter } from '@/lib/email-footer';

/** What the test request answers with. The page turns each into words here, never the server. */
export const TEST_EMAIL_OUTCOMES = [
  'SENT',
  'LIVE_OFF',
  'NOT_SENT',
  'REFUSED',
  'BLOCKED',
  'OPTED_OUT',
  'NO_ADDRESS',
  'TOO_OFTEN',
  'NO_MESSAGE',
  'AFTER_PRESS',
  // [[GTC-392]] — a sample event: refused before the message is read.
  'DEMO',
] as const;
export type TestEmailOutcome = (typeof TEST_EMAIL_OUTCOMES)[number];

/** W1, W4, W12, W13. */
export const TEST_EMAIL_WORDS = {
  BUTTON: 'Send me a test email',
  SENDING: 'Sending…',
  /** Q5: the button waits while her line has an unsaved change. */
  SAVE_FIRST: 'Save your line first, so the test shows what they’ll get.',
  /** Unreachable today: every account has an address (correction 5). Kept, failing closed. */
  NO_ADDRESS: 'There’s no email address on your account, so I can’t send you a test.',
} as const;

/** W2 — under the button. `name` is the first name of the person she is reading as. */
export function testEmailLead(name: string, address: string): string {
  return `I’ll email ${name}’s message to you at ${address}, as they’ll get it. Nobody else gets anything.`;
}

/** W3 — added to W2 when that person gets a text (Q4). */
export function testEmailTextNote(name: string): string {
  return `${name} gets this as a text; I’ll email you the same words.`;
}

/** W5 to W11, W13 to W15 — one line per outcome. `address` is her own. */
export function testEmailOutcomeLine(outcome: TestEmailOutcome, address: string): string {
  const lines: Record<TestEmailOutcome, string> = {
    SENT: `Sent to ${address}. It can take a minute or two to arrive.`,
    LIVE_OFF:
      'I didn’t send it: sending is switched off on this copy of Gather. Test emails go out only from the live Gather.',
    NOT_SENT: 'I couldn’t send it just now. Try again in a minute.',
    REFUSED: 'The email service turned it down, so it didn’t go. Try again later.',
    BLOCKED: `I can’t email ${address} anymore, so I didn’t send it.`,
    OPTED_OUT: 'You’ve turned off email about this event, so I didn’t send it.',
    TOO_OFTEN: 'You’ve sent yourself three tests in the last hour. Try again later.',
    NO_ADDRESS: TEST_EMAIL_WORDS.NO_ADDRESS,
    NO_MESSAGE: 'There’s no message to test for them.',
    AFTER_PRESS: 'The invitations have gone, so there’s nothing to test.',
    // [[GTC-392]] W4, approved 2026-10-18.
    DEMO: 'Test emails are off in a sample event.',
  };
  return lines[outcome];
}

/** W18 — where their own link goes. */
export function testLinkStandIn(name: string): string {
  return `[${name}'s own link goes here]`;
}

/** W19 — where the stop-emails link goes, in the footer's "Don't want emails…" line. Email only. */
export const TEST_STOP_LINK_STAND_IN = '[their own link to stop these emails]';

/** W16 — the subject: the guest's own, after "Test: "; a text has none, so it says so. */
export function testEmailSubject(subject: string | null, name: string, texted: boolean): string {
  return texted ? `Test: the text ${name} will get` : `Test: ${subject ?? ''}`;
}

/** W17 — the top line. */
export function testEmailTopLine(name: string, texted: boolean): string {
  return texted
    ? `This is a test, sent only to you. It's the text ${name} will get when you send, word for word, except that their own link is left out.`
    : `This is a test, sent only to you. It's the email ${name} will get when you send, word for word, except that their own links are left out.`;
}

/**
 * The test email itself. `text` is the guest's message exactly as the send composes it, with the
 * stand-in already in the link's place: for an email, the ask; for a text, the text as sent, with
 * its "Reply STOP" line.
 *
 * An email test ends with the guest's own footer, W19 standing where the way-out link goes, then
 * the contact line. A text test (Q25) has NO footer: a text carries none, and W19 would name a link
 * the text does not have.
 */
export function composeTestEmail(input: {
  name: string;
  texted: boolean;
  subject: string | null;
  text: string;
}): { subject: string; body: string } {
  const top = testEmailTopLine(input.name, input.texted);
  const message = `${top}\n\n${input.text}`;
  return {
    subject: testEmailSubject(input.subject, input.name, input.texted),
    body: input.texted ? message : `${message}\n${guestEmailFooter(TEST_STOP_LINK_STAND_IN)}`,
  };
}

/** Q8 — three tests per person per event in any hour. */
export const TESTS_PER_HOUR = 3;
export const TEST_WINDOW_MS = 60 * 60 * 1000;

/** The presses that still count at `now`: within the last hour, and none from a time not yet come. */
export function testsInWindow(times: readonly number[], now: number): number[] {
  return times.filter((t) => t <= now && now - t < TEST_WINDOW_MS);
}

/** Whether one more test may go at `now`. */
export function mayTestAgain(times: readonly number[], now: number): boolean {
  return testsInWindow(times, now).length < TESTS_PER_HOUR;
}
