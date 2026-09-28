import { askSubject, listOf } from '@/lib/messages/ask-register';
import { withOptOutLine } from '@/lib/sms/opt-out-line';

/**
 * [[GTC-189]] SLICE 8b — THE REMINDER EMAIL. W6, W7 and W8, ruled 2026-09-27.
 *
 * ⚠ IT OPENS THE WAY THE ASK OPENS. The founder, at the 8a hold: *"W7 and W8 open the way the ask
 * opens. If the ask greets by name, so do the reminders."* The ask greets `Hi {first}`
 * (`authorLineFor` in `ask-register.ts`), so both reminders do.
 *
 * ⚠ THE CHECK-BACK PROMISE IS WHAT MAKES THIS A KEPT PROMISE AND NOT A COLD CONTACT. The ask says
 * *"I'll check back if I haven't heard from you."* (`askSystemVoice`); these are that check-back.
 *
 * ⚠ [[GTC-337]] RULING 1 — THE TEXT REMINDERS SAY THE SAME, AND NAME THE EVENT. `composeChaseText`
 * below is the text form: the email's words with the event's name where the email says "this
 * one", because a text has no subject line and every Gather text comes from one number, so a
 * guest's texts for different events share a thread. This departs from [[GTC-187]] decision 5 for
 * the reminders only, knowingly. It replaced `getFirstNudgeMessage` / `getSecondNudgeMessage`,
 * which told a guest who had answered one dish of two that the host was "waiting for your
 * response".
 *
 * The register's standing rules hold: would, never could (slice 2 answer 1); no "please" (answer
 * 5); the link ends the message (a URL followed by prose is linkified greedily).
 */

export type ChaseLeg = 'FIRST' | 'SECOND';

/** One party the reminder is about. See `ChaseParty` in `nudge-eligibility.ts`. */
export interface ChaseSubjectParty {
  state: 'WHOLE' | 'PARTIAL' | 'DONE';
  /** The rows still open, by name. Used only when PARTIAL. */
  pendingNames: string[];
}

export interface ComposeChaseInput {
  leg: ChaseLeg;
  recipientFirstName: string;
  hostFirstName: string;
  eventName: string;
  link: string;
  /** No rows of their own and none carried: the ask was whether they can make it. */
  itemless: boolean;
  /** Has the recipient answered ANYTHING — a row of theirs, a carried row, or whether they can come. */
  answeredAnything: boolean;
  /** The recipient's own rows, or — with none — whether they can come (ruling AA). */
  self: ChaseSubjectParty;
  /** Carried children with something still open, by first name (ruling R). */
  carried: (ChaseSubjectParty & { firstName: string })[];
}

export interface ComposedChase {
  subject: string;
  text: string;
}

/**
 * ⚠ THE RULE, FOUNDER 2026-09-27 AT THE 8b HOLD: *"a reminder names only what is still unanswered,
 * and never tells someone who has answered anything 'I haven't heard from you'."* Under D5 a guest
 * who answered one dish of two is reminded about the other, and *"I haven't heard from you"* would be
 * false of them, in the host's name.
 *
 * So each party contributes what is still open about it:
 *   the recipient, nothing at all answered  → "you"
 *   the recipient, anything answered        → her own open rows by name — "the pavlova and the
 *                                             salad" — or, with no rows of her own, "whether you
 *                                             can make it" (ruling AA)
 *   a child, WHOLE                          → the child — "Ollie"
 *   a child, PARTIAL                        → the child's open rows — "Ollie's trifle"
 *   anybody DONE                            → nothing
 * and *"I haven't heard from you"* is said only when "you" is the whole of it — W7's ruled sentence,
 * kept exactly where it is true.
 *
 * ✅ RULED 2026-09-28, with one change from the proposal: *"'you' is used only when nothing at all is
 * answered."* A carrier who answered for Ollie and not for herself would otherwise read "I haven't
 * heard back about you yet", which is awkward in the host's name.
 */
function outstanding(input: ComposeChaseInput): string[] {
  const parts: string[] = [];
  if (input.self.state !== 'DONE') {
    if (!input.answeredAnything) parts.push('you');
    else if (input.self.pendingNames.length > 0) {
      parts.push(listOf(input.self.pendingNames.map((n) => `the ${n}`)));
    } else parts.push('whether you can make it');
  }
  for (const c of input.carried) {
    if (c.state === 'WHOLE') parts.push(c.firstName);
    if (c.state === 'PARTIAL') parts.push(`${c.firstName}'s ${listOf(c.pendingNames)}`);
  }
  return parts;
}

function notHeard(input: ComposeChaseInput): string {
  const first = input.leg === 'FIRST';
  const parts = outstanding(input);
  if (parts.length === 1 && parts[0] === 'you') {
    return first ? `I haven't heard from you yet.` : `I still haven't heard from you.`;
  }
  const about = listOf(parts);
  return first
    ? `I haven't heard back about ${about} yet.`
    : `I still haven't heard back about ${about}.`;
}

/** `eventName` null is the email's opener, which leans on the subject line to name the event. */
function opener(input: ComposeChaseInput, eventName: string | null): string {
  if (input.leg === 'FIRST') {
    return `Hi ${input.recipientFirstName} - Gather here again, helping ${input.hostFirstName} with ${eventName ?? 'this one'}.`;
  }
  return eventName === null
    ? `Hi ${input.recipientFirstName} - Gather here, checking in once more for ${input.hostFirstName}.`
    : `Hi ${input.recipientFirstName} - Gather here, checking in once more for ${input.hostFirstName} about ${eventName}.`;
}

function body(input: ComposeChaseInput, eventName: string | null): string {
  const tap = input.itemless
    ? `One tap to say whether you can make it: ${input.link}`
    : `One tap to say yes, no or maybe: ${input.link}`;
  return [opener(input, eventName), notHeard(input), tap].join(' ');
}

export function composeChase(input: ComposeChaseInput): ComposedChase {
  return {
    subject: askSubject(input.eventName, input.hostFirstName),
    text: body(input, null),
  };
}

/**
 * [[GTC-337]] ruling 1 — the reminder as a TEXT: the second opener's home for the name was
 * proposed at scoping and not changed by the founder. Ruling 2's line ends it.
 */
export function composeChaseText(input: ComposeChaseInput): string {
  return withOptOutLine(body(input, input.eventName));
}
