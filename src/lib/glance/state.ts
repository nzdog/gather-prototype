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
 * `EXHAUSTED_SILENCE` is declared here and has no producer yet — [[GTC-251]] (E6) owns the
 * counter and the exhausted predicate and is open. It is in the vocabulary from birth so
 * that E6 plugs a fact into an existing door rather than inventing a second one.
 */
export const RED_REASONS = ['DECIDE_BY_EXPIRED', 'REVERSAL', 'EXHAUSTED_SILENCE'] as const;
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
  | 'ATTENDANCE_NO';

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
 * NULL IS NOT FALSE. Null means E6 has not landed and no exhaustion signal exists; this
 * module therefore claims nothing about exhaustion, rather than claiming "not exhausted".
 */
export interface ExhaustionFact {
  exhausted: boolean;
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
 * headcount — "3 need you. Gather is on 9. 28 settled." is three facts, not a partition.
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
    return isDecideByExpired({ response: input.response }, input.item, event, now)
      ? { state: 'RED', reason: 'DECIDE_BY_EXPIRED' }
      : { state: 'AMBER', reason: 'MAYBE_LIVE' };
  }

  if (context.isHost) return { state: 'GREEN', reason: 'ACCEPTED' };

  // ANCHOR(GTC-251): the exhaustion door. E6 supplies the fact; this is where it lands.
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
 */
export function derivePersonState(
  person: GlancePersonInput,
  event: GlanceEvent,
  now: Date = new Date()
): { state: PersonState; reasons: PersonReason[] } {
  const attendance = deriveAttendance(person.items, person.attendanceAnswer);
  if (attendance === 'NO') return { state: 'OUT', reasons: ['ATTENDANCE_NO'] };

  const derived = person.items.map((i) => deriveItemState(i, event, person, now));
  const worst = worstItemState(derived.map((d) => d.state));

  if (worst === null) {
    return person.isHost
      ? { state: 'GREEN', reasons: ['ACCEPTED'] }
      : { state: 'AMBER', reasons: ['AWAITING_REPLY'] };
  }

  const reasons = Array.from(
    new Set(derived.filter((d) => d.state === worst).map((d) => d.reason))
  ) as PersonReason[];

  // Ruling 14. Deliberately `!== 'GREEN'` rather than a list of red reasons: a reason list
  // would have to be extended by every future red source, and the ruling says there are no
  // exceptions.
  if (worst !== 'GREEN' && person.nudgeMark === 'DONT_CHASE') {
    return { state: 'NOT_CHASED', reasons: ['DONT_CHASE'] };
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
