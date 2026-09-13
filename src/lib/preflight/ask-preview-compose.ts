/**
 * GTC-189 slice 3 — the preview, composed: every recipient's message through `composeAsk`, and
 * the facts the screen shows beside it.
 *
 * CLIENT-SAFE, like `ask-register.ts`, and for the same reason: the screen composes the message
 * the send will produce, and re-composes it live as the host edits her line. The types come from
 * `./ask-preview` as types only, so no database or token module reaches the browser.
 *
 * WHAT IS SHOWN FOR WHOM:
 *  - A segment count only for a recipient being TEXTED, and the event's "longest is N texts"
 *    only over them. An email has no segments.
 *  - A subject and the reply-to only for a recipient being EMAILED. A text carries neither;
 *    replies to a text land at the provider, not in her inbox.
 *  - The host as carrier (ruling A2) is shown, with the child's ask she carries, and her message
 *    is NOT composed: movements 1 and 2 are voiced as the host, so which voice a message to her is
 *    in is decision 20, unruled.
 */

import { composeAsk, firstNameOf, type ComposedAsk } from '@/lib/messages/ask-register';
import type { AskPreview, HostListLine, PreviewRecipient } from './ask-preview';

/** Where the link goes for a guest whose token the press will issue. */
export const LINK_AT_PRESS = '[link issued at the press]';

/**
 * Where the link goes for a coordinator, who the press issues no guest link ([[GTC-294]]).
 * Deliberately not `LINK_AT_PRESS`: that one promises a link, and this one would never arrive.
 * Kept by founder ruling (GTC-189 slice 3 answer 2): "Honest beats a promise that never arrives."
 * [[GTC-294]] owns the fix; once it issues coordinators a token, they read AT_PRESS with no change here.
 */
export const LINK_NONE = '[no guest link yet]';

export interface PreviewRow {
  recipient: PreviewRecipient;
  /** Null for the host as carrier — decision 20. */
  ask: ComposedAsk | null;
  /** Texted recipients only. */
  segments: number | null;
  narrowSegments: boolean;
  /** Emailed recipients only. */
  subject: string | null;
  replyTo: string | null;
}

export interface ComposedPreview {
  rows: PreviewRow[];
  /** The most segments any texted message costs; null when nobody is texted. */
  longestText: number | null;
}

type WireDate<T> = Omit<T, 'event'> & {
  event: Omit<AskPreview['event'], 'startDate'> & { startDate: Date | string };
};

export function composePreview(
  preview: AskPreview | WireDate<AskPreview>,
  authorLine: string | null
): ComposedPreview {
  const event = { ...preview.event, startDate: new Date(preview.event.startDate) };

  const rows = preview.recipients.map((recipient): PreviewRow => {
    if (recipient.hostAsCarrier) {
      return {
        recipient,
        ask: null,
        segments: null,
        narrowSegments: false,
        subject: null,
        replyTo: null,
      };
    }
    const ask = composeAsk({
      event,
      hostName: preview.hostName,
      recipient: {
        firstName: firstNameOf(recipient.name),
        itemNames: recipient.itemNames,
        jobNames: recipient.jobNames,
        carried: recipient.carried.map((c) => ({
          childFirstName: c.firstName,
          itemNames: c.itemNames,
          jobNames: c.jobNames,
        })),
        link:
          recipient.linkState === 'READY' && recipient.link
            ? recipient.link
            : recipient.linkState === 'AT_PRESS'
              ? LINK_AT_PRESS
              : LINK_NONE,
      },
      storedAuthorLine: authorLine,
    });
    const texted = recipient.channel === 'TEXT';
    return {
      recipient,
      ask,
      segments: texted ? ask.segments : null,
      narrowSegments: texted && ask.narrowSegments,
      subject: texted ? null : ask.subject,
      replyTo: texted ? null : preview.replyTo,
    };
  });

  const texts = rows.flatMap((r) => (r.segments === null ? [] : [r.segments]));
  return { rows, longestText: texts.length === 0 ? null : Math.max(...texts) };
}

// ─── The words on this screen — ruled at GTC-189 slice 3 ─────────────────────
//
// GATHER SAYS "I", NOT "WE" (founder ruling, "Founder answers — the slice 3 words", answer 1): the
// preview is the voice the guest's message already uses — "I'll check back if I haven't heard from
// you" — talking to the host instead, and "we" implies a team behind it that there isn't. A reason
// that names Gather says "I" as well. The page renders these and keeps no copy of its own.

/** The host's list. "It names nobody, so it needs no voice." Kept as the founder ruled it. */
export const HOST_LIST_HEADING = 'Yours to handle';
export const HOST_LIST_BLURB =
  'Gather will not message these people. Each is named with what they have been asked for, and why it comes to you.';
export const HOST_LIST_EMPTY = 'Nobody.';

/**
 * Where a text reply goes. RULED (GTC-189, slice 3 words, second pass): "It is true today and true
 * after GTC-288, which is exactly what 'yet' was not."
 *
 * ⚠ DO NOT ADD "YET". A text reply does not go nowhere temporarily: the inbound route speaks
 * Twilio's shape and not TNZ's; [[GTC-229]] is unbuilt and blocks [[GTC-288]]; [[GTC-288]] reads a
 * reply only far enough to catch STOP, and nothing decides whether any other reply is kept; and on
 * a shared shortcode some replies reach a different TNZ customer entirely. "Yet" implied one fix;
 * it is three tickets and a possible shortcode purchase. Why, in full: GTC-189.
 */
const TEXT_REPLY = "A text reply won't reach you — I have no way to pass it on.";

/** The reply-to line (ruling F, and slice 3 words answer 3, change 4). */
export function replyToLine(replyTo: string): string {
  return `Replies to an email come to ${replyTo}. ${TEXT_REPLY}`;
}

/** Shown when the host has no `User`, so no `User.email`. Decision 12 decides the press, not this. */
export const NO_REPLY_TO_LINE =
  'No reply-to address: this event’s host has no account, so there is no email for replies to go to. What the press does then is not decided (GTC-189 decision 12).';

/**
 * Why a line is on the host's list, in words for her.
 *
 * A child whose carrier cannot be reached gets ONE sentence, whatever the carrier's problem is — the
 * carrier's own reason sits on the carrier's own line (slice 3 words, answer 3, change 1).
 */
export function hostListReason(line: Pick<HostListLine, 'why' | 'child' | 'carrierName'>): string {
  if (line.child && line.carrierName) {
    const carrier = firstNameOf(line.carrierName);
    return `${carrier} would pass it on, but I can't reach ${carrier}.`;
  }
  return (line.child ? CHILD_WHY : ADULT_WHY)[line.why];
}

/*
 * ⚠ EVERY CASE HAS WORDS, INCLUDING SIX THE CHOOSER CANNOT PRODUCE TODAY. DO NOT DELETE THEM AS DEAD.
 * They are kept by founder ruling (slice 3 words, answer 4) so that a new route through
 * `chooseAskRoute` cannot put a line on the host's list with no words on it. The `Record` types make
 * a missing case a compile error; `tests/ask-preview-test.ts` pins each one `[UNREACHABLE kept]`.
 *
 * Unreachable as of GTC-189 slice 3, because an adult is refused only by the channel checks and a
 * child's channel refusal always names the carrier:
 *   ADULT_WHY.HOST_HOUSEHOLD_CHILD, ADULT_WHY.NO_CARRIER, ADULT_WHY.HOUSEHOLD_MUTED,
 *   CHILD_WHY.NO_CHANNEL, CHILD_WHY.SMS_OPTED_OUT, CHILD_WHY.PHONE_UNUSABLE.
 */
const ADULT_WHY: Record<HostListLine['why'], string> = {
  NO_CHANNEL: 'No email or mobile number.',
  SMS_OPTED_OUT: 'No email, and has opted out of texts.',
  PHONE_UNUSABLE: "No email, and I can't text that number.",
  HOST_HOUSEHOLD_CHILD: 'Yours — in your own household.', // unreachable today
  NO_CARRIER: 'No one to pass it on.', // unreachable today
  HOUSEHOLD_MUTED: 'Messages to their household are switched off.', // unreachable today
};

const CHILD_WHY: Record<HostListLine['why'], string> = {
  NO_CHANNEL: 'No one in their household can be reached.', // unreachable today
  SMS_OPTED_OUT: 'No one in their household can be reached.', // unreachable today
  PHONE_UNUSABLE: 'No one in their household can be reached.', // unreachable today
  HOST_HOUSEHOLD_CHILD: 'Yours — in your own household.',
  NO_CARRIER: 'Their household has no adult to pass it on.',
  HOUSEHOLD_MUTED: 'Messages to their household are switched off.',
};
