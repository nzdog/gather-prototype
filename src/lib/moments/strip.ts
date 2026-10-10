/**
 * [[GTC-367]] — GETTING AROUND THE MOMENTS: where a tap on the Moments strip goes, and the words of
 * every way back and way out of the Moment flow.
 *
 * The founder, at the walkthrough sort (GTC-189's Fourth ruling), on the strip: *"Both now: show it
 * and make it tappable"*. Ruled at GTC-367's plan (PLAN RULINGS 2026-10-08): a Moment she can reach
 * opens; one she can't reach yet says why and goes nowhere (Q5); Moment 4 before the press opens the
 * pre-flight only once the plan is held (Q6). A tap never approves, holds or sends: approving stays
 * with "Plan looks good →", holding with Moment 3's "Move on →", sending with the pre-flight's Send.
 * After the press every screen a tap reaches still asks the why prompt (GTC-202), because a tap only
 * reaches screens she could already reach.
 *
 * ONE RULE, so the strip on every screen and "On to the plan →" cannot send her two places for the
 * same facts. The setup page turns a door into a stage; the pre-flight turns it into an address.
 *
 * CLIENT-SAFE: no imports. The words are W1 to W9b of the plan rulings, verbatim; change none of them
 * without a ruling (`tests/walkthrough-batch5-test.tsx` types every one of them again).
 */

export const STRIP_WORDS = {
  /** W1 — the way out of every overlay (the words Moment 1's form already used, GTC-235). */
  YOUR_EVENTS: '← Your events',
  /** W2 — Moment 2's opening and questions, back to Moment 1. */
  BACK_TO_PEOPLE: '← Back to the people',
  /** W3 — the plan view, back to Moment 2's questions (was "← Back to event setup"). */
  BACK_TO_QUESTIONS: '← Back to the questions',
  /** W4 — the pre-flight before the press, back to Moment 3. */
  BACK_TO_WHOS_ON_WHAT: '← Back to who’s on what',
  /** W5 — "Who I chase", back to the board. */
  BACK_TO_BOARD: '← Back to the board',
  /** W6 — Moment 2 before her own household is saved. */
  LOCKED_PLAN: 'You’ll get to “What’s the plan?” once your own household is saved.',
  /** W7 — Moment 3 before the plan is approved. */
  LOCKED_WHOS_ON_WHAT: 'You’ll get to “Who’s on what?” once you’ve said the plan looks good.',
  /** W8 — Moment 4 before the plan is held. */
  LOCKED_SORTED:
    'You’ll get to “Is everyone sorted?” when you finish “Who’s on what?” and move on.',
  /** W9 — a new household typed and not saved (it has no Clear button: the founder's fix). */
  SAVE_NEW_HOUSEHOLD: 'Save this household first, or clear what you’ve typed.',
  /** W9b — a saved household being changed and not saved (it has Cancel). */
  SAVE_CHANGES: 'Save your changes first, or press Cancel.',
  /** [[GTC-374]] W6 — after the label of Moments 2 and 3 on an invites-only event. */
  NOT_NEEDED: 'not needed',
  /** [[GTC-374]] W8 — a tap on a not-needed Moment after the press: invites only is fixed then. */
  NOT_NEEDED_AFTER_PRESS: 'The invitations have gone as invites only, so there’s no plan to make.',
  /** [[GTC-374]] W9 — the pre-flight's way back on an invites-only event, to Moment 2's opening. */
  BACK_TO_WHATS_THE_PLAN: '← Back to “What’s the plan?”',
} as const;

export type MomentNumber = 1 | 2 | 3 | 4;

/** Where an open door leads. `moment2-opening` and `plan` are both Moment 2: which one is the facts'. */
export type StripTarget =
  | 'moment1'
  | 'moment2-opening'
  | 'plan'
  | 'moment3'
  | 'preflight'
  | 'board';

export type StripDoor =
  | { kind: 'go'; target: StripTarget }
  | { kind: 'locked'; line: string }
  /**
   * [[GTC-374]] — Moments 2 and 3 on an invites-only event (founder: *"Shown as not needed"*). Before
   * the press a tap opens Moment 2's opening, where "Let’s do this →" starts a plan; the tap itself
   * writes nothing (plan Q6). After the press it says W8 and goes nowhere (Q7).
   */
  | { kind: 'not-needed'; target: 'moment2-opening' }
  | { kind: 'not-needed'; line: string };

export interface StripFacts {
  /** Her own household is saved (GTC-256: it comes first, so Moment 2 waits for it). */
  hostSaved: boolean;
  /** A generated plan exists (`hasGeneratedPlan`, the entry rule's own predicate). */
  hasPlan: boolean;
  /** `EventSetup.planApprovedAt` is set: she has said "Plan looks good →". */
  planApproved: boolean;
  /** The plan is held: the event is out of DRAFT (Moment 3's "Move on →", GTC-360). */
  held: boolean;
  /** `Event.sentAt` is set: the invitations have gone. */
  sent: boolean;
  /** [[GTC-374]] — `EventSetup.invitesOnly`. Optional: absent is a planned event, as before. */
  invitesOnly?: boolean;
}

/** Each Moment's door, for these facts. Moment 1 is never locked; nothing opens the questions. */
export function stripDoors(f: StripFacts): Record<MomentNumber, StripDoor> {
  if (f.invitesOnly) {
    const notNeeded: StripDoor = f.sent
      ? { kind: 'not-needed', line: STRIP_WORDS.NOT_NEEDED_AFTER_PRESS }
      : { kind: 'not-needed', target: 'moment2-opening' };
    return {
      1: { kind: 'go', target: 'moment1' },
      2: notNeeded,
      3: notNeeded,
      4: f.sent
        ? { kind: 'go', target: 'board' }
        : f.held
          ? { kind: 'go', target: 'preflight' }
          : { kind: 'locked', line: STRIP_WORDS.LOCKED_SORTED },
    };
  }
  return {
    1: { kind: 'go', target: 'moment1' },
    2:
      f.hostSaved || f.hasPlan || f.sent
        ? { kind: 'go', target: f.hasPlan ? 'plan' : 'moment2-opening' }
        : { kind: 'locked', line: STRIP_WORDS.LOCKED_PLAN },
    3: f.planApproved
      ? { kind: 'go', target: 'moment3' }
      : { kind: 'locked', line: STRIP_WORDS.LOCKED_WHOS_ON_WHAT },
    4: f.sent
      ? { kind: 'go', target: 'board' }
      : f.held
        ? { kind: 'go', target: 'preflight' }
        : { kind: 'locked', line: STRIP_WORDS.LOCKED_SORTED },
  };
}

/**
 * A tap from another page (the pre-flight) opens the setup page at a Moment by its address:
 * `?at=people` or `?at=plan`. Read once, on arrival. `people` is Moment 1; `plan` is the plan view,
 * and only when there is one. Anything else is null: the entry rule (`resolveSetupStage`) decides,
 * as it does for every other arrival.
 */
export type RequestedStage = 'moment1' | 'plan' | 'moment2-opening';
export const AT_PEOPLE = 'people';
export const AT_PLAN = 'plan';
/**
 * [[GTC-374]] — Moment 2's opening, from the pre-flight of an invites-only event (W9 and the strip's
 * not-needed Moments). Without it `?at=plan` with no plan falls to the entry rule, which sends an
 * invites-only event straight back to the pre-flight. Only while there is no plan.
 */
export const AT_OPENING = 'opening';

export function requestedStage(
  at: string | null | undefined,
  facts: { hasPlan: boolean }
): RequestedStage | null {
  if (at === AT_PEOPLE) return 'moment1';
  if (at === AT_PLAN && facts.hasPlan) return 'plan';
  if (at === AT_OPENING && !facts.hasPlan) return 'moment2-opening';
  return null;
}

/** The setup page's address for a Moment, from another page. Moment 3 needs none: it opens there. */
export function setupHref(
  eventId: string,
  at?: typeof AT_PEOPLE | typeof AT_PLAN | typeof AT_OPENING
): string {
  return at ? `/plan/${eventId}/setup?at=${at}` : `/plan/${eventId}/setup`;
}
