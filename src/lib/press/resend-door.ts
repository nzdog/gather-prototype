import type { TextAskReach } from '@/lib/eligibility/channel-chooser';

/**
 * GTC-189 SLICE 7b — RULING U'S DOOR: what it offers, and in whose words.
 *
 * > THE BOUNCE DOOR OFFERS THREE THINGS, not one undifferentiated "try again": send again to
 * > the same address; let the host edit the address and send; send to the phone instead. They
 * > answer three different failures — a full mailbox, a wrong address, a dead one — and one
 * > button could only ever serve one.
 *
 * Slice 7a shipped two reds and WITHDREW the remind on both, on the founder's order — *"I would
 * rather ship 7a with remind withdrawn and no door for one commit than ship it with a remind
 * that emails a dead address."* This is that commit's other half.
 *
 * ── A SEPARATE FILE FROM `resend.ts`, FOR `press-words.ts`'s REASON ───────────
 *
 * ⚠ NOT TIDINESS. `PersonSurface` is a CLIENT component, and importing a VALUE from the server
 * module would pull Prisma into the browser bundle. Everything here is data and pure functions;
 * the mechanism is next door and takes a database handle. `tests/bounce-door-test.ts` asserts
 * this module names no database handle and no provider, the same fence `state.ts` carries.
 *
 * ── THE ACTION SET IS DERIVED FROM WHAT IS POSSIBLE, NOT BRANCHED ON THE RED ──
 *
 * `doorActionsFor` asks three questions — is there an address to send to, may the ask reach them
 * by text, is there a provider configured — and the two reds fall out of the answers rather than
 * out of a branch. That matters for ruling M's red in particular: EVERY withheld code slice 7a
 * maps to `UNREACHABLE` means the chooser found no email (it had to reach the phone branch to
 * say what it said) and no phone the ask may use. So an unreachable person is offered exactly
 * one action, by construction rather than by a rule written twice — and the suite asserts that
 * property over `WITHHELD_MEANS_UNREACHABLE` itself, so a sixth code cannot quietly acquire a
 * second action.
 *
 * ⚠ WHAT IS KEYED ON THE RED IS THE WORDS, and they had to be: ruling M's red is not a wrong
 * address being corrected, it is Gather being given a way to reach somebody at all.
 */

/** The three things ruling U names, and nothing else. */
export type ResendAction = 'AGAIN' | 'EDIT' | 'PHONE';

/** Which red this door is on. The two reds slice 7a built, and the two the remind was taken off. */
export type DoorReason = 'NOT_DELIVERED' | 'UNREACHABLE';

/**
 * What the door knows before it decides what to offer.
 *
 * `textReach` is the CHOOSER's answer (`textAskReachOf`), never a comparison written here —
 * Zone 7's ask-side rule has one spelling and it is not in this file.
 */
export interface DoorFacts {
  reason: DoorReason;
  /** `Person.email` is set. False after a bounce only if the address was since removed. */
  hasAddress: boolean;
  textReach: TextAskReach;
  /**
   * [[GTC-189]] slice 8a — the provider will not deliver to the address ([[GTC-324]] ruling 2).
   *
   * ⚠ F4, RULED 2026-09-27: ruling U's "send again to the same address" was ruled for a FULL
   * MAILBOX, and Resend reports a full mailbox as `delivery_delayed` — in flight, never a failure.
   * Its `bounced` is permanent by its own documentation. So after a bounce, a suppression or a
   * complaint the address is on the provider's list, and AGAIN would queue a message that is
   * accepted and never delivered. It is offered now only after a refusal at submission or a
   * provider failure — the failures that are not facts about the address.
   */
  addressBlocked: boolean;
  /**
   * FOUNDER ANSWER 1, 2026-09-19 — the fence, and it is not 5f reversed.
   *
   * > This fence prevents a FALSE improvement: the red clearing when nothing was sent and no
   * > provider was reached.
   *
   * Supplied by the server from `smsProviderConfiguredFor`, which is `sendSms`'s own branch. The
   * client never evaluates it; it renders the list the route computed, and the route re-checks
   * at the press. See `src/lib/sms/send-sms.ts` for the ruling in full.
   */
  textingConfigured: boolean;
}

export function doorActionsFor(facts: DoorFacts): ResendAction[] {
  const offered: ResendAction[] = [];
  // Nothing to send it to. On ruling M's red this is always the case, which is the whole of why
  // that door has one action.
  if (facts.hasAddress && !facts.addressBlocked) offered.push('AGAIN');
  // Always. An address is the one thing a host can supply that Gather cannot.
  offered.push('EDIT');
  if (facts.textingConfigured && facts.textReach.ok) offered.push('PHONE');
  return offered;
}

/**
 * WHAT EACH ACTION IS CALLED, KEYED ON THE RED — a `Record`, so a third red does not compile
 * until somebody writes what its door says. `press-words.ts`'s guard, and for its reason: the
 * alternative is a default, which is the door knowing more than the screen and telling her less.
 *
 * ⚠ `UNREACHABLE`'s line is the founder's, verbatim (2026-09-19): *"Its one action is capture
 * rather than correction, and the words are: 'Add a way to reach them.' Not edit, not fix —
 * nothing is being corrected."* The full stop is dropped because it is a control and not a
 * sentence; nothing else about it is the executor's.
 *
 * The `NOT_DELIVERED` labels are the executor's and are open, exactly as ruling M left its own
 * why-line open until it was ruled.
 */
export const DOOR_WORDS: Record<DoorReason, Record<ResendAction, string>> = {
  NOT_DELIVERED: {
    AGAIN: 'Send it again',
    EDIT: 'Send to a different address',
    PHONE: 'Send it as a text',
  },
  UNREACHABLE: {
    AGAIN: 'Send it again',
    EDIT: 'Add a way to reach them',
    PHONE: 'Send it as a text',
  },
};

/**
 * WHAT THE SURFACE SAYS WHEN THE ROUTE ACCEPTED IT.
 *
 * ⚠ "QUEUED", NOT "SENT", AND THE WORD IS THE POINT. The door writes a row; the two-minute cron
 * sends it. Saying "sent" would be the screen claiming the one thing this slice cannot prove.
 *
 * ⚠ AND IT PAIRS WITH THE RED CLEARING. The newest row is the fact (slice 7a's
 * `latestRowByMembership`) and it carries no failure, so the strip goes AMBER the moment the
 * board refreshes — before anything has left. That is honest by amber's own definition, *Gather
 * has a next move*, and it is recorded here rather than only in the ticket because a host who
 * presses and watches will draw a conclusion from it. `CATCH_UP_NOTE` is what tells her the
 * change she is watching is the board catching up, not the message arriving.
 */
export const RESEND_NOTES: Record<ResendAction, string> = {
  AGAIN: 'Sending it again.',
  EDIT: 'Saved, and sending.',
  PHONE: 'Sending it as a text.',
};

/**
 * WHY THE DOOR REFUSED.
 *
 * Every one of these is about STATE — the event's, the row's, the person's — except the two
 * about the address typed into the panel, and that difference is why this family carries a 400
 * where the press's does not: the press takes no input and this takes one.
 */
export type ResendRefusalCode =
  | 'EVENT_NOT_FOUND'
  | 'NOT_ON_THIS_EVENT'
  // [[GTC-336]] Q1 — a child has no row of their own; the door belongs on their carrier's card.
  | 'CHILD_NOT_MESSAGED'
  | 'NOT_PRESSED'
  | 'NOTHING_FAILED'
  | 'NO_ADDRESS'
  | 'ADDRESS_REQUIRED'
  | 'ADDRESS_TAKEN'
  | 'ADDRESS_BLOCKED'
  | 'NO_PHONE'
  | 'PHONE_OPTED_OUT'
  | 'PHONE_UNUSABLE'
  | 'TEXTING_UNAVAILABLE';

/**
 * A sentence a host can read for every one of them — a `Record` over the union, so a twelfth
 * code does not compile until somebody writes it. 5f's guard, and 5f's reason: *"The alternative
 * is a default — 'something went wrong' — for a state the press named precisely."*
 *
 * ⚠ `ADDRESS_TAKEN` IS [[GTC-293]] ARRIVING AT A BUTTON BUILT TO INVITE IT. `Person.email` was
 * `@unique` and the host's obvious fix for a dead address is the partner's address. Founder
 * ruling, 2026-09-19: GTC-293 becomes a precondition of the DEPLOY, and 7b answers with a true
 * sentence rather than fixing it. The sentence says what happened and does not promise a merge
 * Gather cannot perform.
 *
 * GTC-293 dropped the constraint (2026-09-29), so nothing produces this code any more; it stays
 * until [[GTC-338]] retires it (founder ruling, GTC-293 Q5).
 */
export const RESEND_REFUSAL_WORDS: Record<ResendRefusalCode, string> = {
  EVENT_NOT_FOUND: 'That event is no longer here.',
  NOT_ON_THIS_EVENT: 'They are not on this event any more, so there is nothing to send.',
  // [[GTC-336]] W5, ruled 2026-09-30. True of every child, carried or not — which is why it names no
  // carrier: this answers a stale board, where the card that asked may be anybody's child.
  CHILD_NOT_MESSAGED: 'Gather never messages a child, so there is nothing to send them.',
  NOT_PRESSED: 'This event has not been sent yet, so there is nothing to send again.',
  NOTHING_FAILED: 'Their last message did not fail, so Gather has nothing to try again.',
  NO_ADDRESS: 'There is no address to send to. Add one instead.',
  ADDRESS_REQUIRED: 'Type an address first.',
  ADDRESS_TAKEN: 'Somebody else already has that address, so Gather cannot move them onto it.',
  // [[GTC-189]] slice 8a, W5 — ruled 2026-09-27. Here with the door's other refusals, and not in
  // `email-block-words.ts`, so this module keeps its fence: every import `import type`.
  ADDRESS_BLOCKED: "Gather can't email this address anymore.",
  NO_PHONE: 'They have no mobile number, so there is nothing to text.',
  PHONE_OPTED_OUT: 'They have opted out of texts, so Gather will not send one.',
  PHONE_UNUSABLE: 'Gather cannot text that number.',
  TEXTING_UNAVAILABLE: 'Gather cannot send texts at the moment.',
};

/** What the panel needs when it opens: the two facts of the last look, and what it may offer. */
export interface DoorView {
  reason: DoorReason;
  /**
   * FOUNDER ANSWER 2, HALF ONE — the address it will send to.
   *
   * ⚠ FETCHED WHEN THE DOOR OPENS AND NOT CARRIED ON THE BOARD'S PAYLOAD (founder answer 6):
   * *"§3 fixed that wire's shape and a guest's contact details have never been on it; one panel
   * wanting one field is not a reason to widen it."*
   */
  address: string | null;
  /**
   * FOUNDER ANSWER 2, HALF TWO — the message it will send, composed by the walk the pre-flight
   * and the drain both run. Null on ruling M's red, where there is no recipient row to compose
   * from and a fabricated preview would be the panel inventing the thing it exists to show.
   */
  message: { subject: string | null; text: string } | null;
  actions: ResendAction[];
}
