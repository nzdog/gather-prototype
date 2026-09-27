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

import type { ChaseNoneWhy } from '@/lib/eligibility/channel-chooser';
import {
  resolveChaseWhenNoMobile,
  type ChaseWhenNoMobile,
} from '@/lib/eligibility/chase-when-no-mobile';
import { composeAsk, firstNameOf, type ComposedAsk } from '@/lib/messages/ask-register';
import type {
  AskPreview,
  HostListLine,
  NotChasedLine,
  NotMessagedLinkState,
  PreviewRecipient,
} from './ask-preview';
import { pressWillMessage } from './ask-preview';

/** Where the link goes for a guest whose token the press will issue. */
export const LINK_AT_PRESS = '[link issued at the press]';

/**
 * Where the link goes for a recipient the press will issue no guest link to at all.
 * Deliberately not `LINK_AT_PRESS`: that one promises a link, and this one would never arrive.
 * Kept by founder ruling (GTC-189 slice 3 answer 2): "Honest beats a promise that never arrives."
 *
 * ⚠ IT NO LONGER MEANS "A COORDINATOR". [[GTC-294]] landed and coordinators now read AT_PRESS and
 * then READY, exactly as the note here predicted, with no change in this file. What still reaches
 * this constant is the host as carrier (`NONE_HOST_CARRIER`, whose one-off link is [[GTC-297]])
 * and `NONE_NOT_ISSUED`, the fail-closed default for a `PersonRole` the enum does not yet have.
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

/*
 * ─── WHAT THE PRESS WILL ACTUALLY SEND — GTC-189 slice 5b, decision 29 ────────
 *
 * ⚠ THE SCREEN'S ARITHMETIC WAS WRONG, AND THE FOUNDER'S OWN WORDS AT Q1 NAME IT: "the
 * pre-flight's own arithmetic says '8 messages' — two of those eight are not messages."
 *
 * The page counted `rows.length`, which is every RECIPIENT — and its no-link banner filtered
 * `NONE_NOT_ISSUED` alone, so the host as carrier was counted as a message AND went unnamed.
 * Since slice 5a that is a disagreement with the code rather than only a wording problem:
 * `pressSend` writes a row per recipient it holds a link for, so the screen promised more
 * messages than the press sends — and it was wrong in the direction that reassures, which is the
 * same direction as decision 29's original finding.
 *
 * ⚠ BOTH LISTS ARE RETURNED, AND THE NOT-MESSAGED ONE IS NOT A FILTER TO HIDE THEM. A recipient
 * the press cannot message still belongs on this screen — the host as carrier is carrying a real
 * child's ask, and slice 3 shows her deliberately. What changes is that she is no longer counted
 * as a message she will not receive.
 */

/** The rows the press will send. Split by the one predicate, never by a second comparison. */
export function messageRows(rows: PreviewRow[]): PreviewRow[] {
  return rows.filter((r) => pressWillMessage(r.recipient.linkState));
}

/** The complement: shown on the screen, sent nothing by the press. */
export function notMessagedRows(rows: PreviewRow[]): PreviewRow[] {
  return rows.filter((r) => !pressWillMessage(r.recipient.linkState));
}

/**
 * Why a recipient on this screen gets no message. RULED 2026-09-19, GTC-189 slice 5b.
 *
 * Held the way `ADULT_WHY` below is held: a `Record` keyed on a union, so a state with no words is
 * a compile error rather than a blank line (slice 3, answer 4).
 *
 * Gather says "I" here, as it does everywhere on this screen (slice 3 words, answer 1), and
 * neither line names Gather in the third person or says "we".
 *
 * `LINK_NONE`'s ground governs both: "Honest beats a promise that never arrives." A row counted
 * as a message that never comes is that promise in arithmetic rather than in prose.
 *
 * ⚠ THE FOUNDER'S REASON FOR THE FIRST LINE, KEPT BECAUSE IT IS WHAT A LATER EDITOR WOULD UNDO:
 *
 *   "The NONE_HOST_CARRIER line is the best of them: 'it's here rather than in a message' tells
 *    her where to look without explaining why, which is the register the rest of the screen
 *    holds."
 *
 * So the sentence stops where it stops ON PURPOSE. Adding the reason — that GTC-256 Ruling 8
 * gives her no guest link, that GTC-297 owns the one that will — would be true and would be the
 * wrong register for this screen. The explanation belongs here, in the code, and not on her page.
 */
export const NOT_MESSAGED_WHY: Record<NotMessagedLinkState, string> = {
  /*
   * The host, reached only as another household's picked contact (ruling A2) — the one case in
   * the model where she receives an ask at all. [[GTC-256]] Ruling 8 gives her no guest link and
   * [[GTC-297]] owns the one-off link that will, so until then the child's ask reaches her on
   * this screen and nowhere else. The sentence must not promise the message later.
   */
  NONE_HOST_CARRIER:
    "Yours to pass on — I have no link to send you, so it's here rather than in a message.",
  /*
   * Unreachable for every role `PersonRole` currently has, and kept as the fail-closed default
   * so a role added later reads as having no link rather than being promised one. Same reason
   * `LINK_NONE` survives.
   */
  NONE_NOT_ISSUED: "I can't give them a link, so I won't message them at all.",
};

/** The one-line summary the count sits in. Plural-aware, and it counts MESSAGES. */
export function messageCountLine(messages: number, emailed: number, texted: number): string {
  return `${messages} ${messages === 1 ? 'message' : 'messages'} · ${emailed} by email · ${texted} by text`;
}

// ─── The words on this screen — ruled at GTC-189 slice 3 ─────────────────────
//
// GATHER SAYS "I", NOT "WE" (founder ruling, "Founder answers — the slice 3 words", answer 1): the
// preview is the voice the guest's message already uses — "I'll check back if I haven't heard from
// you" — talking to the host instead, and "we" implies a team behind it that there isn't. A reason
// that names Gather says "I" as well. The page renders these and keeps no copy of its own.

/** The host's list. "It names nobody, so it needs no voice." Kept as the founder ruled it. */
export const HOST_LIST_HEADING = 'Yours to handle';
/**
 * ⚠ SINCE [[GTC-311]] THIS SITS UNDER GROUP A ONLY — the people Gather does not ask — because it is
 * exactly true of them and false of group B, whose asks DO go out (SCOPED ruling 6: no heading or
 * line may be false of anyone listed under it). Kept word for word, as ruled at slice 3.
 */
export const HOST_LIST_BLURB =
  'Gather will not message these people. Each is named with what they have been asked for, and why it comes to you.';
/** Shown only when BOTH groups are empty. An empty group is hidden rather than saying "Nobody." twice. */
export const HOST_LIST_EMPTY = 'Nobody.';

// ─── [[GTC-311]] — the chase channel's words. ALL RULED 2026-09-27 AS PROPOSED ──────
//
// ⚠ EVERY LABEL NAMES A BEHAVIOUR, NEVER A TICK. The control's polarity inverted on 2026-09-15
// (ruling AG to ruling AH), and a label like "chase" on a checkbox reads correctly under both while
// meaning opposite things. So each word below is keyed by the VALUE it writes.
//
// Checked at the plan against every word already ruled on this screen: *"Nobody"* is the empty
// state's word, so it is not a "Chased by" value; *"no email"* is [[GTC-296]]'s `NO_CHANNEL` trap;
// and no chase sentence repeats an `ADULT_WHY` / `CHILD_WHY` sentence (ruling AN).

/** Group A — the people Gather does not ask at all. W6. */
export const HOST_LIST_NOT_ASKED_HEADING = "I won't message them";
/** Group B — asked, and taken off the chase. W6. */
export const HOST_LIST_NOT_CHASED_HEADING = "I'll ask, but won't chase";
/** W6. True of a carried child too: the child's ask goes out, through the carrier. */
export const HOST_LIST_NOT_CHASED_BLURB =
  "Their asks go out, and I won't follow up on them. If they haven't answered, they're yours.";

/**
 * The default's own sentence — unknown 3b, ruled. W1 and W2. Stated ONCE on the screen, not per
 * row (acceptance: "states the default once, in one sentence").
 *
 * "No mobile I can text" rather than "no mobile", because an unusable number is in the population
 * (flag A, ruled 2026-09-27) — the London cousin has a mobile, and I can't text it.
 */
export const CHASE_DEFAULT_SENTENCE: Record<ChaseWhenNoMobile, string> = {
  BY_EMAIL: "When someone hasn't answered and has no mobile I can text, I'll chase them by email.",
  HAND_TO_HOST:
    "When someone hasn't answered and has no mobile I can text, I'll leave them to you.",
};

/** The event switch. W3. */
export const CHASE_DEFAULT_PILLS: Record<ChaseWhenNoMobile, string> = {
  BY_EMAIL: 'Chase them by email',
  HAND_TO_HOST: 'Leave them to me',
};

/** The per-person control. W5 — the second is ruling AH's own phrase. */
export const CHASE_PERSON_PILLS: Record<ChaseWhenNoMobile, string> = {
  BY_EMAIL: 'Chase by email',
  HAND_TO_HOST: 'Hand this one to me',
};

/** Marks whichever choice is the default, as the pace's "Not set" line does. W3. */
export const DEFAULT_SUFFIX = ' (the default)';

/** The row under "Sent by" in a recipient's facts. W4. */
export const CHASED_BY_LABEL = 'Chased by';
export const CHASED_BY_VALUE: Record<'TEXT' | 'EMAIL' | 'NONE', string> = {
  TEXT: 'Text',
  EMAIL: 'Email',
  NONE: 'Not chased — yours',
};

/**
 * RULING AM, VERBATIM — shown IN PLACE OF the control on an opted-out row, rather than the row
 * simply having no switch. `LINK_NONE` is the precedent and the founder's ground is the same:
 * *"Honest beats a promise that never arrives."*
 */
export const CHASE_OPTED_OUT_PLACEHOLDER = "[can't be chased — opted out]";

export interface ChasePill {
  value: ChaseWhenNoMobile;
  label: string;
  active: boolean;
  /** What pressing it stores on `PersonEvent.chaseException`. */
  writes: ChaseWhenNoMobile | null;
}

/**
 * The two per-person pills, as the screen draws them.
 *
 * ⚠ PICKING THE CHOICE THAT EQUALS THE EVENT DEFAULT WRITES NULL — "follow the default" — so a
 * stored value is always a real exception, and a person who follows the default moves with the
 * switch.
 *
 * ⚠ AND THAT PILL IS MARKED " (the default)" WHILE NOTHING IS STORED — founder ruling, 2026-09-27:
 * *"Without it, a host who flips the switch cannot see who moves with it."* Once an exception is
 * stored the person no longer moves with the switch, so neither pill carries the mark.
 */
export function chasePersonPills(sources: {
  exception: ChaseWhenNoMobile | null;
  eventDefault: ChaseWhenNoMobile | null;
}): ChasePill[] {
  const resolvedDefault = resolveChaseWhenNoMobile({
    exception: null,
    eventDefault: sources.eventDefault,
  });
  const current = resolveChaseWhenNoMobile(sources);
  return (['BY_EMAIL', 'HAND_TO_HOST'] as const).map((value) => ({
    value,
    label:
      CHASE_PERSON_PILLS[value] +
      (sources.exception === null && value === resolvedDefault ? DEFAULT_SUFFIX : ''),
    active: value === current,
    writes: value === resolvedDefault ? null : value,
  }));
}

/**
 * Why a person is in group B — asked, and not chased. Ruling AN: KEYED SEPARATELY from the ask's
 * `ADULT_WHY`, because the two maps answer different questions and have different true answers
 * for the same person. His ask went out by email; `ADULT_WHY.SMS_OPTED_OUT` says *"No email"*.
 *
 * A carried child gets ONE sentence naming the carrier, whatever the carrier's reason — the same
 * treatment `hostListReason` gives a carried child (slice 3 words, answer 3, change 1). The
 * carrier's own reason sits on the carrier's own line.
 */
export function notChasedReason(
  line: Pick<NotChasedLine, 'why' | 'child' | 'carrierName'>
): string {
  if (line.child && line.carrierName) {
    const carrier = firstNameOf(line.carrierName);
    return `${carrier} gets it, but I won't chase ${carrier}.`;
  }
  return CHASE_NONE_WHY[line.why];
}

/*
 * ⚠ RULING AN'S MAP, AND IT HAS ITS OWN UNREACHABLE SET — DO NOT DELETE THEM AS DEAD.
 *
 * Every `ChaseNoneWhy` has words, by the rule the founder ruled at slice 3, answer 4 — *"every case
 * has words, so a new route through the chooser cannot produce a blank line"*. The `Record` makes a
 * missing case a compile error; `tests/chase-channel-test.ts` layer T proves it with a probe.
 *
 * REACHABLE ON GROUP B as of [[GTC-311]]: SMS_OPTED_OUT (ruling AM, verbatim) and HANDED_TO_HOST.
 * Everything else is unreachable there, and why:
 *  - EMAIL_OPTED_OUT, PHONE_UNUSABLE and NO_CHANNEL refuse the ASK first, so the person is in
 *    group A with the ask's reason, never in group B;
 *  - MARKED_DONT_CHASE is grey and stays in step 3 (GTC-192 Ruling 14), so group B leaves it out;
 *  - HOST_AS_CARRIER is shown already as not messaged, and HOST_OWN_ASK, CHILD_WITHOUT_ITEM are not
 *    recipients at all;
 *  - HOST_HOUSEHOLD_CHILD, NO_CARRIER and HOUSEHOLD_MUTED refuse the carried ask first.
 *
 * ⚠ NO SENTENCE HERE MAY EQUAL ONE IN `ADULT_WHY` OR `CHILD_WHY` (ruling AN) — asserted in layer D.
 */
export const CHASE_NONE_WHY: Record<ChaseNoneWhy, string> = {
  SMS_OPTED_OUT: "They've opted out of texts — so I won't chase them at all.",
  HANDED_TO_HOST: "You're handling them yourself, so I won't chase them.",
  EMAIL_OPTED_OUT:
    "They unsubscribed from email for this event, so I won't chase them on any channel.", // unreachable today
  MARKED_DONT_CHASE: "You marked them don't-chase.", // unreachable today
  PHONE_UNUSABLE: "I can't text their number and have no email to chase them by.", // unreachable today
  NO_CHANNEL: 'I have nothing to chase them by.', // unreachable today
  HOST_AS_CARRIER: "It's with you — I don't chase you.", // unreachable today
  HOST_OWN_ASK: "Your own — I don't chase you.", // unreachable today
  HOST_HOUSEHOLD_CHILD: "In your own household, so I won't chase.", // unreachable today
  NO_CARRIER: 'No one to chase for them.', // unreachable today
  HOUSEHOLD_MUTED: "Messages to their household are switched off, so I won't chase.", // unreachable today
  CHILD_WITHOUT_ITEM: "They hold nothing, so there's nothing to chase.", // unreachable today
};

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
 *
 * ✅ AND THE `Record` CLAIM ABOVE IS NOW DEMONSTRATED RATHER THAN ASSERTED — GTC-189 slice 5b,
 * 2026-09-19. This docstring has said "the `Record` types make a missing case a compile error"
 * since slice 3, and nothing had ever produced the error. `NOT_MESSAGED_WHY` above is keyed the
 * same way, and slice 5b's mutation M5 added a fifth `LinkState` member and made `tsc` refuse the
 * tree:
 *
 *   error TS2741: Property 'NONE_SOME_NEW_GAP' is missing in type
 *   '{ NONE_HOST_CARRIER: string; NONE_NOT_ISSUED: string; }' but required in type
 *   'Record<NotMessagedLinkState, string>'
 *
 * ⚠ NOTE WHAT READ IT: `tsc`, and nothing else could have. A guard whose whole value is that the
 * tree does not compile is invisible to a mutation table that only runs suites — every other
 * mutation in this ticket was measured by a suite, and this one had to be measured by a
 * typecheck. Recorded at GTC-189 slice 5b's evidence in full.
 */
const ADULT_WHY: Record<HostListLine['why'], string> = {
  /*
   * [[GTC-296]] ruling 3, in the long form correction R7 sends here. The strip's own line is
   * eight or nine characters; this screen has room for the whole fact and needs it, because
   * this is where the host learns that the person will not be chased EITHER — which is the
   * half of ruling 3 a reader would not guess from the word "email".
   */
  EMAIL_OPTED_OUT:
    "They chose not to receive email about this event, so I won't chase them on any channel.",
  NO_CHANNEL: 'No email or mobile number.',
  SMS_OPTED_OUT: 'No email, and has opted out of texts.',
  PHONE_UNUSABLE: "No email, and I can't text that number.",
  HOST_HOUSEHOLD_CHILD: 'Yours — in your own household.', // unreachable today
  NO_CARRIER: 'No one to pass it on.', // unreachable today
  HOUSEHOLD_MUTED: 'Messages to their household are switched off.', // unreachable today
};

const CHILD_WHY: Record<HostListLine['why'], string> = {
  /*
   * ⚠ DELIBERATELY NOT THE UNIFORM *"No one in their household can be reached."* THE OTHER
   * THREE CHANNEL REFUSALS USE, AND THE DEPARTURE IS THE POINT. Those three describe a carrier
   * nobody CAN reach. This one describes a carrier who can be reached perfectly well and has
   * asked not to be — so the uniform sentence would be false about a live address, which is the
   * family of falsehood this ledger keeps catching. Reachability is not the fact here; a choice
   * is.
   */
  EMAIL_OPTED_OUT: "Their household's contact chose not to receive email about this event.",
  NO_CHANNEL: 'No one in their household can be reached.', // unreachable today
  SMS_OPTED_OUT: 'No one in their household can be reached.', // unreachable today
  PHONE_UNUSABLE: 'No one in their household can be reached.', // unreachable today
  HOST_HOUSEHOLD_CHILD: 'Yours — in your own household.',
  NO_CARRIER: 'Their household has no adult to pass it on.',
  HOUSEHOLD_MUTED: 'Messages to their household are switched off.',
};
