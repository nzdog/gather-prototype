import type { HostListWhy } from '@/lib/eligibility/channel-chooser';
import {
  RESEND_REFUSAL_WORDS,
  type ContactOffer,
  type ContactRefusalCode,
} from '@/lib/press/resend-door';

/**
 * [[GTC-387]] — THE CONTACT BOX: one Email box and one Mobile box, on the board's "nowhere to
 * send" door (item 69) and under a name on the pre-flight's "People I’ll leave to you" (item 67).
 *
 * CLIENT-SAFE, like `resend-door.ts`: words, and one table of which boxes to show. The decision of
 * who may be texted is NOT here; the server asks the chooser at every save
 * (`src/lib/contact/contact-fix.ts`). The table only decides which boxes a screen draws.
 *
 * Every sentence below is Nigel's ruled W-line (GTC-387 plan rulings, 2026-10-16), in "I", like the
 * pre-flight and the board's colour key (Q1). The door's own refusals live in
 * `RESEND_REFUSAL_WORDS`, and the route's two extra ones are spelled here, once.
 */
export const CONTACT_BOX_WORDS = {
  /** W1, W2, W3. */
  email: 'Email',
  mobile: 'Mobile',
  mobileHint: 'e.g. 021 123 4567',
  /** W4, W5, W8. */
  save: 'Save',
  saving: 'Saving…',
  close: 'Close',
  /** W9 — on the board, in place of the Mobile box for somebody who opted out of texts (Q4). */
  noMobile: 'They’ve opted out of texts, so only an email can reach them.',
  /** W10 and W11 — the pre-flight fold's lead, both boxes or the email box alone. */
  leadBoth: 'Add their email or mobile, and I’ll message them with everyone else when you send.',
  leadEmail:
    'They’ve opted out of texts, so only an email can reach them. I’ll message them with everyone else when you send.',
  /** W22 — after a refusal when something was typed (Q3: nothing is saved). */
  nothingSaved: 'Nothing was saved.',
  /** W33 — a mobile-only save on the board with texting off (Q2 b). */
  savedNoText: 'Saved. I can’t send texts at the moment, so I haven’t sent their invitation.',
  /** W34 — the board's door when the saved mobile can't be texted yet (Q19, Q20 as ruled). */
  mobileHeld:
    'Their mobile is saved, but I can’t send texts at the moment, so their invitation hasn’t gone.',
} as const;

/** W12 — on the pre-flight, after a save: the person has moved into the messages. */
export function savedPreflightLine(name: string): string {
  return `Saved. ${name} is now in the messages above.`;
}

/** W13 — what a screen reader hears on a tappable name. */
export function nameLabel(name: string): string {
  return `${name}: add an email or mobile`;
}

/** The pre-flight route's refusals: the door's, plus W23 and W24. */
export type ContactRouteRefusal = ContactRefusalCode | 'INVITATIONS_GONE' | 'NOT_FOR_THEM';

export const CONTACT_REFUSAL_WORDS: Record<ContactRouteRefusal, string> = {
  NOTHING_TO_SAVE: RESEND_REFUSAL_WORDS.NOTHING_TO_SAVE,
  EMAIL_UNREADABLE: RESEND_REFUSAL_WORDS.EMAIL_UNREADABLE,
  EMAIL_OPTED_OUT: RESEND_REFUSAL_WORDS.EMAIL_OPTED_OUT,
  MOBILE_UNREADABLE: RESEND_REFUSAL_WORDS.MOBILE_UNREADABLE,
  ADDRESS_BLOCKED: RESEND_REFUSAL_WORDS.ADDRESS_BLOCKED,
  PHONE_OPTED_OUT: RESEND_REFUSAL_WORDS.PHONE_OPTED_OUT,
  PHONE_UNUSABLE: RESEND_REFUSAL_WORDS.PHONE_UNUSABLE,
  /** W23 — the invitations have gone; the board's door is where it is fixed now. */
  INVITATIONS_GONE: 'The invitations have gone, so change this on the board.',
  /** W24 — a child, the host, or somebody not on the event (a stale screen). */
  NOT_FOR_THEM: 'There’s nothing to change for them here.',
};

/** A box refusal's line: the refusal, then W22, except when nothing was typed (Q3). */
export function boxRefusalLine(code: string | undefined, words: string): string {
  return code === 'NOTHING_TO_SAVE' ? words : `${words} ${CONTACT_BOX_WORDS.nothingSaved}`;
}

const BOTH: ContactOffer = { email: true, mobile: true };
const EMAIL_ONLY: ContactOffer = { email: true, mobile: false };

/**
 * WHICH BOXES, BY THE CHOOSER'S REASON — ruling 2, "Only where new details could fix it", and the
 * plan's reason-by-reason table. A `Record`, so a new reason does not compile until it is placed.
 *
 *  - no email or mobile, a number Gather can't text, a blocked email: both boxes;
 *  - opted out of texts (with or without a blocked email): the Email box only — a new number would
 *    get round their STOP, and the server refuses one anyway;
 *  - their no to email, or a spam report (which writes that no too): nothing (Q10);
 *  - the three household reasons cannot be fixed by contact details: nothing.
 */
const OFFER: Record<HostListWhy, ContactOffer | null> = {
  NO_CHANNEL: BOTH,
  PHONE_UNUSABLE: BOTH,
  EMAIL_BLOCKED: BOTH,
  SMS_OPTED_OUT: EMAIL_ONLY,
  EMAIL_BLOCKED_SMS_OPTED_OUT: EMAIL_ONLY,
  EMAIL_OPTED_OUT: null,
  EMAIL_REPORTED: null,
  EMAIL_REPORTED_SMS_OPTED_OUT: null,
  HOST_HOUSEHOLD_CHILD: null,
  NO_CARRIER: null,
  HOUSEHOLD_MUTED: null,
};

export function contactFixOffer(why: HostListWhy): ContactOffer | null {
  return OFFER[why] ?? null;
}

/** A line on the pre-flight's list: a child is never tappable — their grown-up's line is. */
export function contactLineOffer(line: { why: HostListWhy; child: boolean }): ContactOffer | null {
  return line.child ? null : contactFixOffer(line.why);
}
