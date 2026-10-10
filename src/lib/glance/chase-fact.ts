import type { ChaseNoneWhy, ChaseRoute } from '@/lib/eligibility/channel-chooser';
import { isChaseable } from '@/lib/eligibility/nudge-mark';
import { CHASE_NONE_WHY, notChasedReason } from '@/lib/preflight/ask-preview-compose';
import {
  greyOpensReading,
  type ChaseFact,
  type ChaseStanding,
  type PersonReason,
  type PersonState,
} from './state';

/**
 * [[GTC-305]] — TRANSLATING THE CHASE CHOOSER'S ANSWER INTO WHAT THE BOARD SHOWS.
 *
 * The principle, SCOPED 2026-09-28: *amber means Gather is chasing someone, and nobody else is
 * amber.* This is where the chooser's vocabulary becomes the glance's, for the same reason
 * `delivery-fact.ts` exists beside it: `state.ts` must not learn the chooser's ladder.
 *
 * ── ONE ANSWER, ONE PLACE ─────────────────────────────────────────────────────────────────────
 *
 * The route is `readAskPreview`'s `chase.byMembership` — `chooseChaseRoute`, as the pre-flight and
 * the chase itself read it. So the board, the pre-flight and the reminder cannot disagree about who
 * Gather will chase.
 *
 * ⚠ AND THIS IS NOT THE PATH [[GTC-325]] WARNS AGAINST. That ticket records slice 7a closing "the
 * board deriving it from the chooser" for whether a message REACHED someone — a fact the press wrote
 * on its rows, which the board reads back (`delivery-fact.ts`). This answers a different question:
 * whether Gather WILL chase, which the chase asks the chooser afresh on every run.
 */

/**
 * WHAT EACH CHASE REFUSAL MEANS ON THE BOARD.
 *
 * ⚠ A `Record` OVER THE CHOOSER'S OWN UNION, so a new refusal does not compile until somebody
 * decides what it means here — the arrangement `WITHHELD_MEANS_UNREACHABLE` has. Null claims nothing,
 * and the person reads as the rest of the derivation says.
 */
export const CHASE_REFUSAL_MEANS: Record<ChaseNoneWhy, ChaseStanding | null> = {
  // SCOPED ruling 1 — she took them: grey.
  HANDED_TO_HOST: 'HANDED_TO_HOST',
  // SCOPED ruling 3 — asked by email, never chased (ruling O): grey, under ruling 2's rule.
  SMS_OPTED_OUT: 'SMS_OPTED_OUT',
  // R4, ruled — Gather never chases the host, so it never chases the child she carries.
  HOST_AS_CARRIER: 'HOST_AS_CARRIER',
  // R6, ruled — the item came to her list, in her own household.
  HOST_HOUSEHOLD_CHILD: 'HOST_HOUSEHOLD_CHILD',
  // R6, ruled — never asked and never chased. Grey, and sealed (Ruling 32 as amended).
  CHILD_WITHOUT_ITEM: 'CHILD_WITHOUT_ITEM',
  // SCOPED ruling 3 — a guest's no after the invitation went out: red, "opted out".
  EMAIL_OPTED_OUT: 'EMAIL_OPTED_OUT',
  // [[GTC-324]] ruling 1 — a report is the same no; ruling 3's own words ride on `emailNote`.
  EMAIL_REPORTED: 'EMAIL_OPTED_OUT',
  /*
   * null — THE MARK REACHES THE BOARD THROUGH RULING 14, NEVER THROUGH THIS WHY. A person's own mark
   * is read off `nudgeMark`; a carrier's mark reaches the child through `carrierMarked` below. The
   * why could not carry it anyway: a carrier who is marked AND opted out reports the opt-out, because
   * the chooser checks those first.
   */
  MARKED_DONT_CHASE: null,
  /*
   * null — [[GTC-325]]'s case 1, left open by the founder on 2026-09-19 and not this ticket's. They
   * read as before until it is ruled. See the dated note on GTC-325 for the analysis offered.
   */
  NO_CARRIER: null,
  HOUSEHOLD_MUTED: null,
  /*
   * A channel lost AFTER the ask (a hard bounce with no mobile, an address removed, a number that
   * cannot take texts and no email). Filed on [[GTC-251]] by R4 (2026-09-28) and ruled there as Q5
   * (2026-09-29): *"Red straight away, handed to you, with a short reason."*
   */
  EMAIL_BLOCKED: 'CHASE_UNREACHABLE',
  NO_CHANNEL: 'CHASE_UNREACHABLE',
  PHONE_UNUSABLE: 'CHASE_UNREACHABLE',
  // null — the host; `isHost` already keeps her green.
  HOST_OWN_ASK: null,
};

/**
 * The chase fact for one membership.
 *
 * `marks` maps a `PersonEvent` id to its `nudgeMark`, from the board's own select — no query. It is
 * read for one thing: POINT 2, the carrier named by the child's route carries the don't-chase mark.
 * The carrier is `carrierId` on a NONE route and `recipientId` on a CARRIED one; the host is never a
 * marked carrier here, because a route to her answers HOST_AS_CARRIER and her mark is not read.
 *
 * `paceOff` — [[GTC-251]] 4.7: the event's pace is OFF, so a route the chooser would chase is
 * never reminded. A refusal keeps its own standing: it says more than the pace does.
 */
export function chaseFactFrom(
  route: ChaseRoute | undefined,
  marks: ReadonlyMap<string, string | null>,
  isChild: boolean,
  paceOff: boolean = false
): ChaseFact | null {
  if (!route) return null;
  const carrierId = !isChild
    ? null
    : route.kind === 'NONE'
      ? route.why === 'HOST_AS_CARRIER'
        ? null
        : (route.carrierId ?? null)
      : route.recipientId;
  return {
    standing: route.kind === 'NONE' ? CHASE_REFUSAL_MEANS[route.why] : paceOff ? 'PACE_OFF' : null,
    carrierMarked: carrierId !== null && !isChaseable(marks.get(carrierId) ?? null),
  };
}

/** W6, ruled 2026-09-30 ([[GTC-251]]): why nobody on an OFF event is being chased. */
export const PACE_OFF_CHASE_NOTE = "Nudges are off for this event, so I won't follow them up.";

/**
 * [[GTC-350]], ruled 2026-10-02 (*"Say why (Recommended)"*): a maybe whose one follow-up has gone,
 * who then replied. Gather has nothing left to send them, so the red has no door; this says why —
 * and it is the sentence shown where reminders are also off (`replyNoDoorNoteFor` in
 * `src/lib/chase-reply.ts`).
 */
export const FOLLOW_UP_SPENT_CHASE_NOTE =
  "I've already asked them once to decide, so I won't nudge them again.";

/**
 * THE PERSON VIEW'S SENTENCE — the ruled why-map, never new words.
 *
 * Set only for a grey that opens the reading room (Ruling 32 as amended) and for the opted-out red;
 * null everywhere else, so no GREEN or AMBER panel and no sealed strip carries one.
 *
 * ⚠ THE TWO HOST-BOUND WHYS NEVER GO THROUGH `notChasedReason`. Its carrier sentence names the
 * carrier, and for HOST_AS_CARRIER the carrier is the host: she would read *"Kate gets it, but I
 * won't chase Kate."* They read `CHASE_NONE_WHY` directly. A REPORTED adult gets none: ruling 3's
 * sentence already rides on `emailNote`, and the chase sentence would repeat it.
 */
export function chaseNoteFor(input: {
  state: PersonState;
  reasons: readonly PersonReason[];
  route: ChaseRoute | undefined;
  isChild: boolean;
  carrierName: string | null;
}): string | null {
  const { route } = input;
  // [[GTC-251]] 4.7 — the OFF grey's route is one the chooser WOULD chase, so it is asked first.
  if (input.state === 'NOT_CHASED' && input.reasons.includes('PACE_OFF')) {
    return PACE_OFF_CHASE_NOTE;
  }
  if (!route || route.kind !== 'NONE') return null;
  const opens = input.state === 'NOT_CHASED' && greyOpensReading(input.reasons);
  const optedOutRed = input.state === 'RED' && input.reasons.includes('EMAIL_OPTED_OUT');
  if (!opens && !optedOutRed) return null;
  if (route.why === 'HOST_AS_CARRIER' || route.why === 'HOST_HOUSEHOLD_CHILD') {
    return CHASE_NONE_WHY[route.why];
  }
  if (input.isChild && input.carrierName) {
    return notChasedReason({ why: route.why, child: true, carrierName: input.carrierName });
  }
  if (route.why === 'EMAIL_REPORTED') return null;
  return CHASE_NONE_WHY[route.why];
}
