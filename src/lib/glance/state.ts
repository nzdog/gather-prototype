/**
 * GTC-192 (J1, phase 1) — the glance colour encoding.
 *
 * [[GTC-175]] records twice that "J1 (GTC-192) owns the person-grid colour encoding", so
 * this module is where the vocabulary is fixed. Ruling 12 and Ruling 13 (2026-08-30) name
 * the middle state AMBER everywhere, one state and one name across both specs.
 *
 *   RED         yours          §3 "Red — only you can do this"
 *   AMBER       with Gather    the system has a next move and is making it
 *   GREEN       settled        §3 "Green — nothing is yours"
 *   NOT_CHASED  unbothered     §10.3's per-person off-switch, deliberately left alone
 *   OUT         absent         Ruling 7 — a declined guest is NOT green
 *
 * ── WHAT THIS MODULE IS NOT ALLOWED TO GROW ───────────────────────────────────
 *
 * A HOUSEHOLD-LEVEL COLOUR. The chosen design's card is neutral precisely so no merge
 * rule is needed (`docs/design/moment4-glance-reference.md`, open item 7; this ticket's
 * "Still open after these thirteen" item 3). Worst-colour-wins applies to the PERSON and
 * is deliberately not inherited upward. `tests/glance-read-test.ts` asserts the absence
 * both on the emitted objects and on the `GlanceHousehold` declaration below, because a
 * convenience export is how the rule would arrive without ever being ruled.
 *
 * A BEHAVIOUR TERM. Ruling 1: "The replay may only ever show state changes (resolutions),
 * never behaviour. No opens, no views, no hesitations, ever." That is stated for phase 6's
 * replay and applied here from birth, because a payload that already carries the field
 * only needs somebody to render it. The same test carries the denylist.
 *
 * ⚠ ONE RULED EXCEPTION, [[GTC-350]] Q2 (2026-10-02): a guest's own text replies, every one, with
 * when each came — as words and a line the server wrote (`GlanceReply`), never the instant, the
 * reply row, TNZ's ids or the number. `REPLY_FENCE_DENYLIST` in `tests/glance-fence.ts` holds the rest.
 *
 * A RATE. Ruling 2: whole numbers of people, never rates, never proportions — a percentage
 * would grade her family and crosses into §3's refused analytics.
 *
 * ── CLIENT-SAFE ───────────────────────────────────────────────────────────────
 *
 * No database handle, for the reason `nudge-cadence.ts` and `decide-by.ts` both record:
 * the grid and the server must read one definition of the colours rather than a server one
 * and a client one that drift.
 */

import { decideBy, isDecideByExpired, type DecideByEvent, type DecideByItem } from '../decide-by';
import { deriveAttendance, type StoredAttendanceAnswer } from '../attendance';
import {
  nextNudgeAt,
  resolveNudgeOffsetDays,
  type NudgeMark,
  type NudgePace,
} from '../nudge-cadence';

/**
 * The decide-by instant, re-exported rather than recomputed.
 *
 * D2's ruling (a) is that there is ONE derivation; the grid and the sweep must not hold
 * two. Nothing stores this — see `Item.decideByOffsetHours`'s schema docstring for why a
 * stored instant would drift.
 */
export { decideBy as decideByFor };

/** What a single held row contributes. Three, because a row is not a person. */
export type ItemState = 'RED' | 'AMBER' | 'GREEN';

/** What a strip shows. Five, per the chosen design's states table as corrected by Ruling 11. */
export type PersonState = ItemState | 'NOT_CHASED' | 'OUT';

/**
 * Why a row is red.
 *
 * ONE DOOR, NOT THREE. §8.1: "the calendar is a second way to exhaust, not a new meaning
 * for red." These are the ways in; the red they reach is the same red.
 *
 * `EXHAUSTED_SILENCE` was declared here from birth so that E6 would plug a fact into an existing
 * door rather than invent a second one. ✅ [[GTC-251]] slice 251a gives it its producer:
 * `exhaustionFor` in `src/lib/chase-exhaustion.ts`, read in by `readEventGlance`.
 */
export const RED_REASONS = [
  'DECIDE_BY_EXPIRED',
  'REVERSAL',
  'EXHAUSTED_SILENCE',
  /*
   * GTC-189 SLICE 7a — THE FOURTH AND FIFTH REDS. Ruling M and ruling S, 2026-09-14; words ruled
   * 2026-09-19.
   *
   * ⚠ `NOT_DELIVERED` AND NOT `BOUNCED`, AND THE NAME IS A RULING. It covers THREE mechanisms — a
   * rejection at submission, a bounce after acceptance, and a provider failure — which are one fact
   * to the host: **it did not arrive.** Naming it for one of the three would make the other two read
   * as a different red, and they are not. ⚠ AND A STOP BY GATHER'S OWN SETUP IS THE SAME RED
   * ([[GTC-340]]): an email as a rejection with no provider code, a text as the withholding
   * `SMS_DISABLED`.
   *
   * `UNREACHABLE` is ruling M's own word: *"a person nobody can reach"*, red from the press, because
   * *"red already means Gather is out of moves and this is yours."*
   *
   * ⚠ THEY ARE TWO REASONS AND ONE RED. §8.1's rule holds — *"the calendar is a second way to
   * exhaust, not a new meaning for red"* — and these are two more ways in. No new colour, no new
   * state, and ruling M turned down both of those offers by name.
   */
  'NOT_DELIVERED',
  'UNREACHABLE',
  /*
   * [[GTC-296]] — THE GUEST TOOK THE EMAIL WAY OUT OF THIS EVENT.
   *
   * ⚠ DECLARED WITH NO PRODUCER, WHICH IS `EXHAUSTED_SILENCE`'s ARRANGEMENT DIRECTLY ABOVE AND
   * IS THE SAME BARGAIN: *"in the vocabulary from birth so that E6 plugs a fact into an
   * existing door rather than inventing a second one."*
   *
   * It is here because correction R7 puts a short line in `WHY_LINES`, and that map is a
   * `Record` over `WHY_PRECEDENCE` — so the words have nowhere to live unless the reason is in
   * the vocabulary. It has no producer because correction R6 maps `EMAIL_OPTED_OUT` to `null`
   * in `WITHHELD_MEANS_UNREACHABLE`: the outbound row records the withholding, and the strip
   * stays amber. The two corrections read as contradictory and are not — this is the shape that
   * satisfies both, and the ⚠ below is the cost.
   *
   * ✅ PRODUCED SINCE [[GTC-305]], WHICH ABSORBED [[GTC-327]] — and not by the "one edit" GTC-327
   * proposed. The producer is the chase chooser's EMAIL_OPTED_OUT and EMAIL_REPORTED, through
   * `CHASE_REFUSAL_MEANS` in `chase-fact.ts`, so it reaches the guest who opted out AFTER her
   * invitation went out, whose ask row is not withheld at all. `WITHHELD_MEANS_UNREACHABLE` keeps
   * null (R6). It never means UNREACHABLE — "nowhere to send" is false of a live address — and it
   * is not a door reason: slice 7b's door must never offer to send it again.
   */
  'EMAIL_OPTED_OUT',
  /*
   * [[GTC-251]] Q5 (founder, 2026-09-29) — A CHANNEL LOST AFTER THE ASK: *"Red straight away, handed
   * to you, with a short reason."* The ask arrived, so this is not the delivery fact's
   * `UNREACHABLE`; the chase chooser now refuses (`EMAIL_BLOCKED`, `NO_CHANNEL`, `PHONE_UNUSABLE`),
   * so Gather has no way to reach them again.
   *
   * ⚠ A SEPARATE REASON WITH THE SAME WORDS, AND THE DOOR IS WHY. `UNREACHABLE` opens slice 7b's
   * resend door, which answers `NOTHING_FAILED` for an ask that did not fail ([[GTC-336]]'s defect).
   * Sharing the reason would offer that dead door; sharing the words (`WHY_LINES` in `strip.ts`)
   * keeps Q5's "nothing new to approve".
   */
  'CHASE_UNREACHABLE',
  /*
   * [[GTC-350]] Q1 (founder, 2026-10-02) — A GUEST'S TEXT REPLY ENDED GATHER'S CHASE: *"Their card
   * turns red and shows their words and when they came, because only you can read what they said."*
   * Its producer is `replyFactFor` in `src/lib/chase-reply.ts`. Below the door reds and
   * CHASE_UNREACHABLE, above "gone quiet", which is false of somebody who replied (note 4; plan Q-I).
   */
  'REPLIED',
] as const;
export type RedReason = (typeof RED_REASONS)[number];

/** Why a row is amber or green. */
export type SettledReason = 'ACCEPTED';
export type MovingReason = 'AWAITING_REPLY' | 'MAYBE_LIVE';

/** Why a PERSON reads as they do, including the two reasons no row can carry. */
export type PersonReason =
  | RedReason
  | MovingReason
  | SettledReason
  | 'DONT_CHASE'
  | 'ATTENDANCE_NO'
  | GreyChaseStanding;

/**
 * [[GTC-305]] — WHAT THE CHASE CHOOSER'S REFUSAL MEANS ON THE BOARD, as this module consumes it.
 *
 * The principle, SCOPED 2026-09-28: *amber means Gather is chasing someone, and nobody else is
 * amber.* The GREY standings are people Gather invites and will never remind (rulings 1 and 3, R4
 * and R6); `EMAIL_OPTED_OUT` is ruling 3's red, a guest's no that is news to the host. The
 * translation from the chooser's vocabulary lives in `src/lib/glance/chase-fact.ts`.
 */
export type GreyChaseStanding =
  | 'HANDED_TO_HOST'
  | 'SMS_OPTED_OUT'
  | 'HOST_AS_CARRIER'
  | 'HOST_HOUSEHOLD_CHILD'
  | 'CHILD_WITHOUT_ITEM'
  /*
   * [[GTC-251]] 4.7, founder 2026-09-30 — the host turned reminders off for the event, so amber
   * ("Gather is chasing") is false; red would tell her what she told Gather first (GTC-305 ruling
   * 1's ground). Not a chooser refusal: pace is the cadence's, so `chaseFactFrom` sets it.
   */
  | 'PACE_OFF';
export type ChaseStanding = GreyChaseStanding | 'EMAIL_OPTED_OUT' | 'CHASE_UNREACHABLE';

/**
 * [[GTC-305]] — the chase fact. THE SAME SHAPE AS `DeliveryFact` AND FOR THE SAME REASON: a decision
 * handed in, so this module never learns the chooser's ladder. Null claims nothing.
 *
 * ⚠ IT ANSWERS WHETHER GATHER *WILL* CHASE — what the chase itself asks the chooser on every run.
 * Whether a message REACHED someone stays with the rows the press wrote (`DeliveryFact`, slice 7a).
 */
export interface ChaseFact {
  standing: ChaseStanding | null;
  /**
   * POINT 2, founder ruling 2026-09-28: the child's CARRIER carries the don't-chase mark. Ruling 14's
   * own ground reaches the child — *"the fix-it action a red would offer is the exact thing the mark
   * forbids"* — so the carrier's mark covers the child in full. Keyed on the carrier's own mark, not
   * on the route's reason, so a carrier who is also opted out still covers the child.
   */
  carrierMarked: boolean;
}

/** The grey standings, as a set, for the one derivation that asks. */
const GREY_STANDINGS: ReadonlySet<string> = new Set<GreyChaseStanding>([
  'HANDED_TO_HOST',
  'SMS_OPTED_OUT',
  'HOST_AS_CARRIER',
  'HOST_HOUSEHOLD_CHILD',
  'CHILD_WITHOUT_ITEM',
  'PACE_OFF',
]);

/**
 * [[GTC-251]] — the greys whose live maybe gets no decide-by follow-up, so amber would be false of
 * it too (GTC-305's R1 gap, given to this ticket; Q4a for the text-opted-out). PACE_OFF is not
 * among them: pace is the silence cadence's, and a maybe has none — its follow-up still comes.
 */
const MAYBE_UNFOLLOWED: ReadonlySet<string> = new Set<GreyChaseStanding>([
  'HANDED_TO_HOST',
  'SMS_OPTED_OUT',
  'HOST_AS_CARRIER',
  'HOST_HOUSEHOLD_CHILD',
  'CHILD_WITHOUT_ITEM',
]);

function greyStandingOf(chase: ChaseFact | null | undefined): GreyChaseStanding | null {
  const standing = chase?.standing ?? null;
  return standing !== null && GREY_STANDINGS.has(standing) ? (standing as GreyChaseStanding) : null;
}

/**
 * [[GTC-305]] — GTC-192 RULING 32 AMENDED, founder 2026-09-28, on Ruling 32's own reason: *she
 * should be able to check what someone is bringing without leaving the board.* A hand-over means
 * "I'll do the follow-up" (GTC-305 ruling 2), so these greys open the READING room.
 *
 * ⚠ A NAMED LIST, SO EVERY OTHER GREY STAYS SEALED BY DEFAULT: the don't-chase mark (Ruling 17's
 * second sentence, unchanged, a carrier's mark included) and CHILD_WITHOUT_ITEM, whose panel would
 * hold nothing to check (Ruling 17's first sentence). A grey added later seals until it is ruled.
 */
export const READING_GREYS: readonly GreyChaseStanding[] = [
  'HANDED_TO_HOST',
  'SMS_OPTED_OUT',
  'HOST_AS_CARRIER',
  'HOST_HOUSEHOLD_CHILD',
  // [[GTC-251]] 4.7 — she can still check what they are bringing; W6 says why nobody is chasing.
  'PACE_OFF',
];

/** Does this NOT_CHASED person open the reading room? Only for the four ruled greys. */
export function greyOpensReading(reasons: readonly PersonReason[]): boolean {
  return reasons.some((r) => (READING_GREYS as readonly string[]).includes(r));
}

export type ItemReason = RedReason | MovingReason | SettledReason;

/**
 * [[GTC-251]]'s (E6) fact, as this module will consume it.
 *
 * A DECISION, NOT TELEMETRY. E6 must distinguish NO cadence from a SPENT one — a
 * `DONT_CHASE` person resolves to an empty cadence and `nextNudgeAt` returns null from
 * moment zero, so "null means exhausted" would turn every don't-chase person red the
 * instant Kate marked them (GTC-179's recorded warning, absorbed by GTC-251). Taking the
 * answer rather than the raw send stamps is what keeps that derivation in one place.
 *
 * NULL IS NOT FALSE. Null means no signal — the host, whom Gather never chases, or a caller
 * that built a context by hand; this module then claims nothing about exhaustion. Since
 * [[GTC-251]] slice 251a every chased membership gets a real answer from `exhaustionFor`
 * (`src/lib/chase-exhaustion.ts`).
 */
export interface ExhaustionFact {
  exhausted: boolean;
}

/**
 * GTC-189 SLICE 7a — WHAT HAPPENED TO THIS PERSON'S MESSAGE, as this module needs it.
 *
 * THE SAME SHAPE AS `ExhaustionFact` ABOVE, AND FOR THE SAME REASON: a DECISION handed in rather
 * than telemetry to interpret. The derivation must not learn what a bounce is, what a provider
 * rejection is, or which withheld codes mean "unsendable" — that vocabulary belongs to the press
 * and to [[GTC-289]], and a second reading of it here is a second place for it to drift.
 *
 * ⚠ NULL IS NOT "IT ARRIVED". A null fact means nothing is known — most often because the press
 * has not happened, so no row exists to read. This module then claims nothing, exactly as it claims
 * nothing about exhaustion before [[GTC-251]] lands. **A null failure inside a present fact means
 * the same thing for the opposite reason:** a row exists and has not failed, which is still not a
 * claim that anybody read the message.
 *
 * ⚠ AND ITS SOURCE IS THE ROW THE PRESS WROTE, which is the whole reason it is one field. Founder
 * ruling, 2026-09-19: the press already recorded both facts per person — a delivery state for the
 * bounce, a withheld code for the unsendable — and *"reading them back means the board and the press
 * cannot disagree by construction."* See `readEventGlance`.
 */
export interface DeliveryFact {
  failure: 'NOT_DELIVERED' | 'UNREACHABLE' | null;
}

/**
 * [[GTC-350]] — IS A TEXT REPLY IN FORCE, ENDING GATHER'S CHASE? A decision handed in, the shape
 * `ExhaustionFact` has, from `replyFactFor` (`src/lib/chase-reply.ts`); the reply's instant never
 * reaches this module. Null claims nothing.
 */
export interface ReplyFact {
  ended: boolean;
}

/**
 * [[GTC-350]] Q2 — one text reply as the board shows it: the guest's words, and when it came as a
 * line the server wrote (R5, "Fri 2 Oct, 2:14pm"). TWO FIELDS AND NO MORE: no instant, no reply id,
 * no TNZ id, no number.
 */
export interface GlanceReply {
  words: string;
  when: string;
}

/** A row as the derivation needs it. Structural, so a narrow `select` works. */
export interface GlanceItemInput {
  itemId: string;
  assignmentId: string;
  name: string;
  /** GTC-170 (B1). Carried for J2's badge; §8.2 rules it changes no colour and no order. */
  critical: boolean;
  /** `Assignment.response`. */
  response: string;
  /**
   * `Item.kind` and `Item.teamId` — phase 4. NOT colour inputs: nothing below reads
   * either, and a mutation that made a TASK row a different colour would fail the suite.
   * They are carried because they are the two halves of `SameTeamItem`
   * (`src/lib/assignment/same-team.ts`), so the tapped surface can CALL GTC-171's rule
   * rather than write a second copy of it that is free to drift.
   */
  kind: string;
  teamId: string;
  /**
   * RULING 32 (amended 2026-09-11) — what the person is BRINGING, for the read-only panel.
   *
   * NOT COLOUR INPUTS, exactly like `kind` and `teamId` above: nothing in `deriveItemState`
   * reads them and a mutation that made a quantity change a tint fails the suite. They are
   * carried because a green strip "tells her someone is sorted but not what they are sorted
   * FOR", and the panel that answers that needs the number.
   *
   * ⚠ THREE FIELDS, NOT THE TWO THE BRIEF NAMED, AND THE THIRD IS NOT EXTRA INFORMATION.
   * `QuantityUnit` is an enum whose ninth member is `CUSTOM`; when it is CUSTOM the unit's
   * actual word lives in `quantityUnitCustom`. Carrying two would render a custom unit as the
   * literal string "CUSTOM". The third field IS the unit, in the case where the enum cannot
   * hold it — not a fourth fact about the item.
   *
   * ⚠ AND WHAT IS DELIBERATELY LEFT BEHIND: `quantityText`, `quantityState`, `quantityLabel`,
   * `quantitySource`, `quantityDeferredTo`. An item whose quantity is a PLACEHOLDER, or is
   * free text ("a big bowl"), therefore shows NO quantity rather than showing that it has one
   * nobody has settled. That is a stated cost of "quantity and unit only" — see
   * `quantityLabel` in `src/components/glance/strip.ts`.
   */
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  item: DecideByItem;
}

/** The facts about a person that bear on their colour, beyond the rows they hold. */
export interface GlancePersonContext {
  /**
   * GTC-256 Ruling 5: the host never receives her own ask. An unanswered row of hers is
   * therefore not a row Gather is chasing — see `deriveItemState`.
   */
  isHost: boolean;
  exhaustion: ExhaustionFact | null;
  /**
   * GTC-189 slice 7a. Optional rather than required, deliberately: every existing caller that
   * builds a context by hand — and there are several, in tests and in the replay — goes on meaning
   * *"nothing known about delivery"* without being edited to say so. The same courtesy
   * `exhaustion: null` gets, one field further on.
   *
   * ⚠ AND FOR A CHILD IT IS THE CARRIER'S FACT. Ruling S: *"Ollie's strip goes red when the message
   * carrying his ask bounced."* Children are never recipients, so the only delivery fact a child can
   * have is the one belonging to whoever carried the ask. `readEventGlance` resolves that.
   */
  delivery?: DeliveryFact | null;
  /**
   * [[GTC-305]]. Optional for `delivery`'s reason directly above: every caller that builds a context
   * by hand goes on meaning *"nothing known about the chase"*.
   */
  chase?: ChaseFact | null;
  /**
   * [[GTC-350]]. Optional for `delivery`'s reason: a context built by hand goes on meaning *"no reply
   * in force"*. For a child it is the carrier's (the reminder carrying the child's ask is the carrier's).
   */
  reply?: ReplyFact | null;
}

export interface GlancePersonInput extends GlancePersonContext {
  nudgeMark: NudgeMark | null;
  attendanceAnswer: StoredAttendanceAnswer;
  items: GlanceItemInput[];
}

/** The event half. `nudgePace` joins `DecideByEvent` so one object serves both clocks. */
export interface GlanceEvent extends DecideByEvent {
  nudgePace?: NudgePace | null;
}

export interface GlanceItem {
  itemId: string;
  assignmentId: string;
  name: string;
  critical: boolean;
  /** Phase 4: `SameTeamItem`'s two fields, so REASSIGN's picker asks the shared rule. */
  kind: string;
  teamId: string;
  /** RULING 32 — the read-only panel's "what they are bringing". See `GlanceItemInput`. */
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  state: ItemState;
  reason: ItemReason;
  /**
   * Derived on every read, never stored. Non-null only for a maybe: Hinge §8 gives the
   * instant its meaning, and on any other row it would be a deadline nobody is under.
   */
  decideByAt: string | null;
}

export interface GlancePerson {
  personEventId: string;
  personId: string;
  name: string;
  isHost: boolean;
  householdRole: string | null;
  /**
   * `PersonEvent.role` and `PersonEvent.teamId` — phase 4, and the other half of
   * `SameTeamSubject`. `isHost` above is this module's own derivation and is deliberately
   * NOT substituted for `role`: `mayHoldRow` takes the raw row, and handing it a
   * reconstructed one would be this module quietly re-deciding who the host is.
   */
  role: string;
  teamId: string | null;
  /**
   * `PersonEvent.nudgeMark` — §10.3's hosting judgement, phase 4.
   *
   * A DECISION KATE MADE, NOT SOMETHING A GUEST DID, so Ruling 1's fence is untouched by
   * it. It is on the wire because `state` is a lossy encoding of it: Ruling 14 greys only
   * a person whose worst row is not green, so a settled marked person reads GREEN and the
   * mark would be invisible to a caller reading colour alone. The action layer asks
   * `isChaseable` (`src/lib/eligibility/nudge-mark.ts`) — the same predicate the nudge
   * sweeps ask — rather than inferring the mark back out of the tint.
   */
  nudgeMark: NudgeMark | null;
  state: PersonState;
  /**
   * Ruling 4: reds carry their why. Machine-readable here; the strip's wording is phase
   * 2's, so the copy and the derivation cannot disagree about which reds have a why.
   */
  reasons: PersonReason[];
  /**
   * E1's next scheduled leg — what Hinge §6's "nudge in 2 days" renders from.
   *
   * NULL DOES NOT MEAN RED, and this is the site GTC-179's warning is about: a
   * don't-chase person is null from moment zero.
   */
  nextNudgeAt: string | null;
  items: GlanceItem[];
  /**
   * [[GTC-189]] slice 8a, D3 — ruling 3's sentence, or its neutral form, when the provider will not
   * deliver to this person's address. A SENTENCE, NEVER THE ADDRESS: the server decides and ships
   * only the words (`readEmailNotes` in `src/lib/glance/email-note.ts`). Not a colour.
   */
  emailNote: string | null;
  /**
   * [[GTC-258]] — why this person's TEXT invitation didn't arrive, when TNZ reported it failed: W1 to
   * W3 (`textNoteFor` in `src/lib/glance/text-note.ts`). A SENTENCE, NEVER THE NUMBER. Null when the
   * invitation went by email, arrived, or an `emailNote` already says it.
   */
  textNote: string | null;
  /**
   * [[GTC-189]] slice 8a — MAY GATHER TEXT THIS PERSON? A usable mobile not opted out of texts; for a
   * child, their carrier's (ruling S). A BOOLEAN DERIVED ON THE SERVER, NEVER THE NUMBER. It exists for
   * one reader: the strip's UNREACHABLE line, which says "nowhere to send" and is false of somebody
   * Gather can text — the case the dispatcher's fence produces for an invitation queued before the
   * block was learned (founder ruling, 2026-09-27). False unless the address is blocked.
   */
  textable: boolean;
  /**
   * [[GTC-305]] — the chase fact this person was derived with. On the wire for ONE reader: the replay,
   * which hands it to the past unrewound, exactly as it hands over the mark (Finding 2). No contact
   * detail rides in it.
   */
  chase: ChaseFact | null;
  /**
   * [[GTC-305]] — the ruled sentence saying why Gather will not chase this person, composed on the
   * server as `emailNote` is (`chaseNoteFor` in `src/lib/glance/chase-fact.ts`). Set only for a grey
   * that opens the reading room and for the opted-out red; null everywhere else.
   */
  chaseNote: string | null;
  /**
   * [[GTC-336]] Q1 and Q4 — whose message carried a child's ask, on the card of a child whose carrier's
   * message failed. The child's card offers no door, so this says where the fix is: the carrier's
   * card. Composed on the server (`carriedChildNoteFor` in `src/lib/glance/delivery-fact.ts`); null
   * for every adult and for every child not reading one of the door's two reds.
   */
  carrierNote: string | null;
  /**
   * [[GTC-350]] Q2 — every text reply this person sent on this event, newest first. Filled only on
   * the HOST's board, first paint and poll (plan Q-F, fix 2): Q5 tells the guest their reply is shown
   * to the person who invited them. Empty for everyone else, and on a co-host's board.
   */
  replies: GlanceReply[];
  /**
   * [[GTC-251]] Q3 and [[GTC-350]] — the hand-back's choices this red offers (`handBackChoicesFor` in
   * `src/lib/chase-reply.ts`). Empty means no door: a hand-back that would send nothing is not offered.
   */
  handBackChoices: number[];
}

/**
 * A card. The design's framing draws the model: card = channel, strip = person — messages
 * go to households, states belong to people.
 *
 * IT CARRIES NO STATE, AND THAT IS THE POINT. See this module's header.
 */
export interface GlanceHousehold {
  householdId: string;
  /**
   * The card's label. Households have no name column; the existing surfaces
   * (`HouseholdCardList`) title a household by its primary contact, and this follows that
   * rather than inventing a second convention.
   */
  primaryContactName: string | null;
  /** Ruling 3's anchor: the host's own household holds first position. */
  isHostHousehold: boolean;
  members: GlancePerson[];
}

/**
 * Ruling 2's sentence, as three whole numbers of people.
 *
 * NOT_CHASED and OUT are counted in none of the three, so these need not sum to the
 * headcount — "3 need you. I’m looking after 9. 28 settled." is three facts, not a partition.
 */
export interface GlanceSummary {
  needYou: number;
  withGather: number;
  settled: number;
}

/**
 * An item nobody holds. Ruling 8's subject.
 *
 * TWO FIELDS, AND NO MORE. The strip names it and nothing else; a quantity, a team, a
 * criticalReason or a dropOffAt would all be plan content, which §3 refuses on this
 * surface.
 */
export interface GlanceUnassignedItem {
  itemId: string;
  name: string;
}

export interface EventGlance {
  eventId: string;
  /**
   * `Event.hostId` — a **Person** id (schema.prisma, `host Person @relation("EventHost")`).
   *
   * Phase 4: TAKE OVER's target, and `mayHoldRow`'s `hostPersonId`. Named rather than
   * recovered by scanning the cards for `isHost`, because on events created before
   * [[GTC-256]] no `PersonEvent` carries `role: HOST` at all — the scan would come back
   * empty and the self-pick exemption would silently disappear on exactly those events.
   */
  hostPersonId: string;
  /** The instant the states were derived against, so a caller can reason about staleness. */
  asOf: string;
  summary: GlanceSummary;
  households: GlanceHousehold[];
  /**
   * People on the event with no household. `PersonEvent.householdId` is nullable and the
   * majority of rows in `gather_dev` are null, so this is the common case rather than an
   * edge one. They are surfaced rather than filed into an invented card: where they render
   * is a layout question no ruling has answered, and phase 2 should not inherit an answer
   * from phase 1's data shape.
   */
  unhoused: GlancePerson[];
  /**
   * Ruling 8: unassigned CRITICAL items, above the grid.
   *
   * THE ONE THING ON THIS BOARD THAT IS NOT A PERSON, and it is deliberate rather than a
   * crack in §10.8: these have no holder, so person-primary gives them nowhere to live,
   * and an ownerless critical is genuinely the host's move. Named, because a count would
   * not tell her which.
   *
   * "Unassigned" is the ABSENCE OF AN ASSIGNMENT ROW — the house predicate
   * (`assignment: null`), never `Item.status`, which is a presence cache that is never
   * consulted for status (architecture-contract §6).
   *
   * ⚠ NARROWER THAN "critical without an ACCEPTED assignment". That wider set is a
   * different fact and the pre-flight already shows it, saying so in its own comment. A
   * critical held by someone who declined it has a person, reads RED on their strip, and
   * is not ownerless.
   */
  unassignedCritical: GlanceUnassignedItem[];
  /**
   * Ruling 8's quiet door: ordinary unassigned items, COUNTED and never named. "Ordinary
   * unassigned items stay the plan's and pre-flight's business; the glance does not nag
   * about what can wait."
   */
  unassignedOrdinaryCount: number;
}

/**
 * Worst-colour-wins (§10.8), as an ordering rather than a chain of comparisons, so a
 * ruling that changes it changes one array.
 */
export const ITEM_STATE_SEVERITY: readonly ItemState[] = ['RED', 'AMBER', 'GREEN'];

/** The worst of a person's rows, or null when they hold none. */
export function worstItemState(states: readonly ItemState[]): ItemState | null {
  for (const candidate of ITEM_STATE_SEVERITY) {
    if (states.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * The colour of one held row.
 *
 * DECLINED IS RED. §8.6: "a withdrawn or broken claim reverts red at once, through the
 * standard door... this isn't a silence to chase, it's a fact the system can't fix — it
 * notes it and sends it to her." Declining leaves the row on the person (see the ack
 * routes), so the row is held by somebody who will not do it, and only Kate can move it.
 *
 * A LIVE MAYBE IS AMBER AND AN EXPIRED ONE IS RED, read through `isDecideByExpired` rather
 * than a second definition of the clock — D2's ruling (a) put the predicate there for this.
 * Ruling 15 (2026-08-31) settles the timing as `isDecideByExpired` already has it and adds
 * no offset here. ⚠ That ruling's stated rationale — "end of the decide-by day" — and the
 * predicate's actual boundary are not the same instant; the divergence is measured and
 * recorded under "Ruling 15 — measured divergence" in `docs/tickets/GTC-192.md`, and the
 * boundary itself is pinned by the `Ruling 15` assertions in `tests/glance-read-test.ts`.
 *
 * THE HOST'S UNANSWERED ROW IS NOT AMBER. Amber means Gather has a next move; GTC-256
 * Ruling 5 says it never has one for her, and Ruling 4 says she holds items "silently:
 * they appear on her own plan rather than arriving as an ask". So the pick is the decision,
 * and PENDING on her row is settled rather than awaited. Every other response reads the
 * same for her as for anyone.
 */
export function deriveItemState(
  input: GlanceItemInput,
  event: GlanceEvent,
  context: GlancePersonContext,
  now: Date = new Date()
): { state: ItemState; reason: ItemReason } {
  if (input.response === 'ACCEPTED') return { state: 'GREEN', reason: 'ACCEPTED' };
  if (input.response === 'DECLINED') return { state: 'RED', reason: 'REVERSAL' };

  if (input.response === 'MAYBE') {
    if (isDecideByExpired({ response: input.response }, input.item, event, now)) {
      return { state: 'RED', reason: 'DECIDE_BY_EXPIRED' };
    }
    // [[GTC-251]] Q5 — no channel is left for the maybe's follow-up either, so amber would promise
    // a message that cannot come. The greys with no follow-up are handled per person, below.
    if (context.chase?.standing === 'CHASE_UNREACHABLE') {
      return { state: 'RED', reason: 'CHASE_UNREACHABLE' };
    }
    // [[GTC-350]] plan Q-A — a reply in force stops the maybe's follow-up too, so amber would promise
    // a message that will not come.
    if (context.reply?.ended) return { state: 'RED', reason: 'REPLIED' };
    return { state: 'AMBER', reason: 'MAYBE_LIVE' };
  }

  if (context.isHost) return { state: 'GREEN', reason: 'ACCEPTED' };

  /*
   * [[GTC-305]] RULING 3 — THE RED "opted out", AND IT SITS ABOVE THE DELIVERY FAILURE ON PURPOSE.
   * Both are red, so the colour is the same either way; what the order decides is the DOOR. Slice
   * 7b's door opens on NOT_DELIVERED and offers "send it again", and it must never open on somebody
   * who said stop. Below the answers, like every red here: a guest who answered shows the answer.
   */
  if (context.chase?.standing === 'EMAIL_OPTED_OUT') {
    return { state: 'RED', reason: 'EMAIL_OPTED_OUT' };
  }

  /*
   * ANCHOR(GTC-189 slice 7a): the delivery door. The press supplies the fact; this is where it lands.
   *
   * ⚠ BELOW THE THREE RESPONSE BRANCHES, AND THAT ORDER IS THE POINT: AN ANSWER IS PROOF THE ASK
   * ARRIVED. A row somebody accepted, declined or answered MAYBE is not reddened by a delivery
   * failure — they plainly got it, or they answered another way, and either way the answer is the
   * fact. Only an unanswered row can be explained by a message that never landed.
   *
   * ⚠ BELOW `isHost` TOO. GTC-256 ruling 5 keeps her own rows green, and ruling A2 makes her a
   * CARRIER — so when her carried message fails it is the CHILD's rows that go red (ruling S), never
   * hers.
   *
   * ⚠ AND ABOVE EXHAUSTION, WHICH IS A CHOICE ABOUT THE WHY-LINE. Both are red, so the colour is
   * the same either way; the REASON is what the strip says. *"Gone quiet"* is false of somebody who
   * never got the message — the silence has a cause and this is it — so the explaining reason wins.
   */
  if (context.delivery?.failure) {
    return { state: 'RED', reason: context.delivery.failure };
  }

  /*
   * [[GTC-251]] Q5 — below the delivery failure, whose door can still act on the ask, and above
   * exhaustion for the same reason the delivery failure is: "gone quiet" is false of somebody
   * Gather can no longer reach — the silence has a cause, and this is it.
   */
  if (context.chase?.standing === 'CHASE_UNREACHABLE') {
    return { state: 'RED', reason: 'CHASE_UNREACHABLE' };
  }

  /*
   * [[GTC-350]] Q1 — A REPLY IN FORCE: Gather's chase is over and the guest is the host's. Below the
   * delivery failure (its door can still act on the ask) and CHASE_UNREACHABLE (a hand-back there
   * would be a dead door); above exhaustion, because "gone quiet" is false of somebody who replied.
   */
  if (context.reply?.ended) return { state: 'RED', reason: 'REPLIED' };

  // [[GTC-251]] Q2 — the exhaustion door, with its producer (`exhaustionFor`).
  if (context.exhaustion?.exhausted) return { state: 'RED', reason: 'EXHAUSTED_SILENCE' };

  return { state: 'AMBER', reason: 'AWAITING_REPLY' };
}

/**
 * The colour of a person: worst-colour-wins over their rows, then the two person-level
 * facts that displace it.
 *
 * OUT DISPLACES EVERYTHING. Ruling 7: a declined guest fades — "absence receding to a
 * ghost" — and Ruling 11 fixed the design reference at source, because OUT is not green.
 * They have answered; nothing on the board is waiting on them.
 *
 * NOT_CHASED DISPLACES EVERY RED SOURCE — Ruling 14 (2026-08-31), which supersedes this
 * ticket's phase-1 position that the mark displaced amber only. The reason it gives is the
 * one that generalises: Kate marks her mother don't-chase because Kate is handling her
 * personally, and the fix-it action a red offers is the exact thing the mark forbids. So
 * grey wins over the reversal, over exhaustion, over the expired maybe — and over any red
 * source added later, because the mark is applied AFTER worst-colour-wins rather than
 * being enumerated against the reasons. "No exceptions; if one is ever wanted, it gets its
 * own ruling."
 *
 * IT GREYS THE STRIP, NOT THE ROWS. The items keep their own colours and stay visible on
 * tap (§10.8) — the mark suppresses escalation to Kate, not the truth about the item.
 *
 * TWO STATES IT DOES NOT TOUCH, NEITHER OF WHICH IS A RED SOURCE. GREEN: a settled person
 * is not being chased in the first place, and hiding her would empty the wall of names
 * Ruling 5 keeps. OUT: they answered, and absence is not an escalation.
 *
 * AN ITEMLESS UNDECIDED PERSON IS AMBER — Ruling 16 (2026-08-31): "the ask is real even
 * when the hands are empty... attendance-only is a state of the ask, not an absence from
 * the board." The host is the exception, by GTC-256 Ruling 5.
 *
 * [[GTC-305]] — AMBER MEANS GATHER IS CHASING SOMEONE, AND NOBODY ELSE IS AMBER. The chase fact
 * greys the people Gather invites and never reminds, in AMBER's place only, and gives ruling 3's
 * "opted out" its producer. A carrier's don't-chase mark covers the child it carries, and the
 * itemless branch now reads the mark and a yes (Finding 1 and the itemless-yes ruling).
 */
export function derivePersonState(
  person: GlancePersonInput,
  event: GlanceEvent,
  now: Date = new Date()
): { state: PersonState; reasons: PersonReason[] } {
  const attendance = deriveAttendance(person.items, person.attendanceAnswer);
  if (attendance === 'NO') return { state: 'OUT', reasons: ['ATTENDANCE_NO'] };

  // Ruling 14's mark, and since [[GTC-305]] (point 2) a carrier's mark covering the child it carries.
  const marked = person.nudgeMark === 'DONT_CHASE' || person.chase?.carrierMarked === true;
  const grey = greyStandingOf(person.chase);

  const derived = person.items.map((i) => deriveItemState(i, event, person, now));
  const worst = worstItemState(derived.map((d) => d.state));

  if (worst === null) {
    if (person.isHost) return { state: 'GREEN', reasons: ['ACCEPTED'] };
    /*
     * [[GTC-305]], founder ruling 2026-09-28 — THE ITEMLESS YES IS SETTLED. Ruling 16 makes an
     * itemless UNDECIDED person amber; somebody who answered yes has decided, and `stillUnanswered`
     * already stops the chase for them. Above the delivery failure because an answer is proof the
     * ask arrived (the answer branches in `deriveItemState` rest on the same ground), and above the
     * mark because Ruling 14 leaves GREEN alone.
     */
    if (attendance === 'YES') return { state: 'GREEN', reasons: ['ACCEPTED'] };
    /*
     * [[GTC-305]], FINDING 1, fixed on founder ruling — THIS BRANCH USED TO RETURN BEFORE RULING 14,
     * so an itemless marked person read amber and a delivery red beat the mark. Ruling 14: *"No
     * exceptions; if one is ever wanted, it gets its own ruling."* The order below is the rows'.
     */
    if (marked) return { state: 'NOT_CHASED', reasons: ['DONT_CHASE'] };
    if (person.chase?.standing === 'EMAIL_OPTED_OUT') {
      return { state: 'RED', reasons: ['EMAIL_OPTED_OUT'] };
    }
    /*
     * ⚠ GTC-189 SLICE 7a — THE DELIVERY FACT IS APPLIED AT THE PERSON LEVEL TOO, AND THIS BRANCH IS
     * WHY IT HAS TO BE.
     *
     * An itemless person has NO ROW to carry a colour, so a fact that only ever reached
     * `deriveItemState` would leave them AMBER — and amber for somebody who never got the message is
     * exactly the falsehood ruling J called wrong and ruling M answered. Ruling 16 makes an itemless
     * undecided person amber because *"the ask is real even when the hands are empty"*; when the ask
     * did not arrive, the same sentence is the reason they are RED.
     *
     * ⚠ THE EXHAUSTION FACT HAD THE IDENTICAL HOLE, left here for [[GTC-251]]. ✅ Closed by its
     * slice 251a, with Q5's red beside it and in the rows' order: Ruling 16's ask is chased like
     * any other, so its silence can run out like any other.
     */
    if (person.delivery?.failure) {
      return { state: 'RED', reasons: [person.delivery.failure] };
    }
    if (person.chase?.standing === 'CHASE_UNREACHABLE') {
      return { state: 'RED', reasons: ['CHASE_UNREACHABLE'] };
    }
    // [[GTC-350]] — in the rows' order: Ruling 16's ask is chased like any other, so a reply ends it.
    if (person.reply?.ended) return { state: 'RED', reasons: ['REPLIED'] };
    if (person.exhaustion?.exhausted) return { state: 'RED', reasons: ['EXHAUSTED_SILENCE'] };
    if (grey) return { state: 'NOT_CHASED', reasons: [grey] };
    return { state: 'AMBER', reasons: ['AWAITING_REPLY'] };
  }

  const reasons = Array.from(
    new Set(derived.filter((d) => d.state === worst).map((d) => d.reason))
  ) as PersonReason[];

  // Ruling 14. Deliberately `!== 'GREEN'` rather than a list of red reasons: a reason list
  // would have to be extended by every future red source, and the ruling says there are no
  // exceptions.
  if (worst !== 'GREEN' && marked) {
    return { state: 'NOT_CHASED', reasons: ['DONT_CHASE'] };
  }

  /*
   * [[GTC-305]] RULING 2 — THE GREY REPLACES AMBER, AND NOTHING ELSE. Only when the worst is AMBER
   * and every amber row is one Gather will not follow up: any red still wins and an answered row
   * shows its answer.
   *
   * [[GTC-251]] — THE LIVE MAYBE WITH NOTHING COMING. GTC-305 kept it amber (R1) and gave the gap to
   * this ticket. For these greys no decide-by follow-up comes (a hand-over is the host's; Q4a: a
   * text opt-out gets none), so amber is false of the maybe too, and it greys with the rest.
   */
  const unfollowed = (d: { state: ItemState; reason: ItemReason }) =>
    d.reason === 'AWAITING_REPLY' ||
    (d.reason === 'MAYBE_LIVE' && !!grey && MAYBE_UNFOLLOWED.has(grey));
  if (grey && worst === 'AMBER' && derived.every((d) => d.state !== 'AMBER' || unfollowed(d))) {
    return { state: 'NOT_CHASED', reasons: [grey] };
  }

  return { state: worst, reasons };
}

/**
 * E1's next scheduled leg for this person, or null when the cadence has nothing further.
 *
 * Composed through `resolveNudgeOffsetDays` rather than read off a column, so the strip
 * and the sweep cannot disagree about the pace (GTC-179 Ruling 4, quieter-wins).
 */
export function nextNudgeFor(
  personSentAt: Date | null,
  nudgeMark: NudgeMark | null,
  event: GlanceEvent,
  now: Date = new Date()
): Date | null {
  if (personSentAt === null) return null;
  return nextNudgeAt(
    personSentAt,
    now,
    resolveNudgeOffsetDays({ person: { nudgeMark }, event: { nudgePace: event.nudgePace } })
  );
}

/**
 * Ruling 2's three counts.
 *
 * COUNTED, NOT DIVIDED — the test asserts on this function's body that no division or
 * modulo appears in it, because "3 need you" becoming "27% need you" is one careless edit
 * away and would grade her family.
 */
export function summarisePeople(states: readonly PersonState[]): GlanceSummary {
  let needYou = 0;
  let withGather = 0;
  let settled = 0;
  for (const state of states) {
    if (state === 'RED') needYou++;
    else if (state === 'AMBER') withGather++;
    else if (state === 'GREEN') settled++;
  }
  return { needYou, withGather, settled };
}

/**
 * The rendering-stable order of members inside a card.
 *
 * NOT A RULING. Ruling 3 fixes the order of HOUSEHOLDS and says nothing about the order of
 * strips inside one; this is a deterministic default so that "fixed positions" holds all
 * the way down, and it is recorded as a default rather than presented as settled.
 * `PersonEvent` carries no `createdAt`, so capture order is not available to sort on.
 */
export const HOUSEHOLD_ROLE_ORDER: readonly string[] = [
  'PRIMARY_CONTACT',
  'PARTNER',
  'GUEST',
  'CHILD',
];

export function memberRank(householdRole: string | null): number {
  const at = HOUSEHOLD_ROLE_ORDER.indexOf(householdRole ?? '');
  return at === -1 ? HOUSEHOLD_ROLE_ORDER.length : at;
}

/** The decide-by instant a maybe is under, as an ISO string; null on any other row. */
export function decideByAtFor(
  response: string,
  item: DecideByItem,
  event: GlanceEvent
): string | null {
  if (response !== 'MAYBE') return null;
  return decideBy(item, event).toISOString();
}
