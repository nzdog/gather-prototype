/**
 * GTC-192 (J1, phase 2) — the strip's tone and its words.
 *
 * Pure. No React, no data access, so the copy and the two greys can be asserted directly
 * rather than scraped out of markup — `tests/glance-grid-test.tsx` layer 1.
 *
 * The tones are the reference's own hexes (`docs/design/moment4-glance-reference.md`, and
 * the mockup beside it): danger #FCEBEB/#A32D2D, warning #FAEEDA/#854F0B, success
 * #EAF3DE/#3B6D11, surfaces #ffffff/#f5f4ef, hairline #dcdad2. They are written as LITERAL
 * class strings rather than composed from a hex variable because Tailwind scans source
 * text — an interpolated arbitrary value generates no CSS.
 *
 * WHY THE PALETTE IS NOT IN `tailwind.config.js` OR `globals.css`: those are shared by the
 * V1 dashboard, and this phase's scope is explicit that V1 is not touched. One screen's
 * palette living beside that screen costs nothing and reverts cleanly.
 */

import { isChildMembership } from '@/lib/eligibility/child-exclusion';
import {
  greyOpensReading,
  type GlancePerson,
  type GlanceSummary,
  type GlanceUnassignedItem,
  type PersonState,
} from '@/lib/glance/state';

export interface StripTone {
  className: string;
}

/**
 * One tone per state. Five, matching the reference's states table as Ruling 11 corrected
 * it.
 *
 * THE TWO GREYS ARE A DELIBERATE PAIR AND MUST STAY DISTINGUISHABLE (Ruling 7).
 * NOT_CHASED is *expected, just unbothered*: it keeps a hairline border and full-strength
 * text. OUT is *absent*: it fades entirely, text included, and drops its border — "absence
 * receding to a ghost". Opacity is what carries "text included"; a faded foreground colour
 * alone would leave the name at full weight against the card.
 */
export const STRIP_TONE: Record<PersonState, StripTone> = {
  RED: { className: 'bg-[#FCEBEB] text-[#A32D2D] font-medium' },
  AMBER: { className: 'bg-[#FAEEDA] text-[#854F0B]' },
  GREEN: { className: 'bg-[#EAF3DE] text-[#3B6D11]' },
  NOT_CHASED: { className: 'bg-[#ffffff] text-[#5f5e5a] border-[0.5px] border-[#dcdad2]' },
  OUT: { className: 'bg-transparent text-[#5f5e5a] opacity-50' },
};

/**
 * The hexes a state's tint is actually made of, read back out of its own class string.
 *
 * GTC-192 phase 6 slice 6c. The replay's spark throws "~18 particles per flip in the
 * green/amber ramp hexes" (`docs/design/moment4-glance-reference.md`), and particles are
 * painted in a canvas-free DOM layer that cannot be given a Tailwind class — it needs the
 * colour itself.
 *
 * ⚠ DERIVED, NOT RESTATED, AND THAT IS THE WHOLE POINT OF THE FUNCTION. A second copy of
 * `#EAF3DE` in the island is a second definition of the palette: change the green here and the
 * sparks keep throwing the old one, with nothing failing. So the island asks the tone what
 * colour it is. `tests/glance-grid-test.tsx` pins the answers, so a silent extraction failure
 * (an empty ramp, invisible particles) fails the suite rather than the eye.
 */
export function stripHexes(state: PersonState): string[] {
  return STRIP_TONE[state].className.match(/#[0-9A-Fa-f]{6}/g) ?? [];
}

/**
 * The strip's own words.
 *
 * Ruling 7 puts the meaning of the fade in the TEXT — "the '— out' text carries the
 * meaning for anyone the fade confuses" — so it is here rather than in the styling, where
 * a viewer who cannot see the fade would lose it.
 */
export function stripLabel(person: GlancePerson): string {
  const words = person.state === 'OUT' ? stripStateWords(person) : null;
  return words ? `${person.name} ${words}` : person.name;
}

/**
 * The trailing half of a strip: THE WORDS THAT DESCRIBE THE PERSON'S STATE NOW.
 *
 * Two kinds and no others — Ruling 7's "— out" and Ruling 4's why on a red. The NAME is never
 * one of them, which is the whole point of the split.
 *
 * ── WHY THEY ARE ONE CONCEPT (GTC-192 phase 6 slice 6c, finding 1) ───────────────────────
 *
 * The arrival replay rewinds a strip's TINT and cannot rewind its WORDS: the past `reasons` are
 * not on the wire, and `ReplayStep` is exactly four keys by §5 layer 2's allowlist. So during
 * the rewind a strip painted GREEN was still reading "— out", and one painted AMBER was still
 * carrying "maybe timed out" — the founder's ruling on it: *"a green strip reading 'out' is
 * incoherent and the words are the truthful half."*
 *
 * The answer is to SUPPRESS them while a step is pending and let them appear as it lands, and
 * that needs the island to be able to address them — hence one function, one name, and one
 * `data-strip-words` in the markup. **Rewriting them would need the fifth key the allowlist
 * refuses; hiding them needs nothing on the wire at all.**
 *
 * ⚠ THE INVERSE CASE IS ACCEPTED AND IS NOT A BUG. A strip going RED → GREEN shows no why
 * during the rewind, because its words are computed from GREEN and GREEN has none. Missing is
 * the truthful direction: we do not know what her why WAS, and inventing one is the thing the
 * allowlist exists to prevent.
 */
/**
 * The class the state-words render in — one definition, because 6e writes them twice.
 *
 * Phase 6 slice 6e. A live poll repaints a strip's words from the polled payload, and a strip
 * that GAINS words (an amber going red picks up Ruling 4's why) has no `data-strip-words` span
 * in the markup to write into, because the board only emits one when there is something to say.
 * So the live repaint has to make the span — and a second `'font-normal'` written in the island
 * is a strip whose words could quietly render in a different weight depending on whether they
 * arrived at first paint or twenty seconds later. `tests/glance-grid-test.tsx` asserts both
 * sites read this.
 */
export const STRIP_WORDS_CLASS = 'font-normal';

export function stripStateWords(person: GlancePerson): string | null {
  if (person.state === 'OUT') return '— out';
  const why = whyLineFor(person);
  return why ? `— ${why}` : null;
}

/**
 * Display precedence when a person's red has more than one source.
 *
 * NOT `RED_REASONS`' order, deliberately. That array is the vocabulary; this is a choice
 * about which of two true things to say in one short line, and the loose row wins because
 * it is the one with a move attached. A rendering default, not a ruling.
 */
export const WHY_PRECEDENCE = [
  'ATTENDANCE_NO',
  /*
   * GTC-189 slice 7a — the two delivery reasons sit HERE, above the three that presume the ask
   * landed, and the placement has one reason behind it:
   *
   * ⚠ THEY ARE THE ONLY LINES ON THIS LIST THAT SAY THE PERSON MAY NOT KNOW THEY WERE ASKED. *Handed
   * it back*, *maybe timed out* and *gone quiet* all describe somebody responding to an ask they
   * received — or failing to. A message that never arrived is a fact ABOUT THE ASK, and saying
   * anything else first would describe a silence as a choice.
   *
   * Still a rendering default rather than a ruling, exactly as the note above says of the whole list.
   */
  'NOT_DELIVERED',
  'UNREACHABLE',
  // [[GTC-251]] Q5 — the same fact after the ask, so it sits beside it: a cause, before any silence.
  'CHASE_UNREACHABLE',
  // [[GTC-296]], beside the two delivery reasons and for their reason: the three below presume
  // the ask landed and was answered or not. This one says the person declined to be asked.
  'EMAIL_OPTED_OUT',
  // [[GTC-350]] plan Q-I — before "handed it back": what they wrote probably explains it.
  'REPLIED',
  'REVERSAL',
  'DECIDE_BY_EXPIRED',
  'EXHAUSTED_SILENCE',
] as const;

/**
 * Ruling 6's own words for the reversal, and the reference's: "Ray — was in, now out".
 *
 * ⚠ THIS LINE WAS UNBUILDABLE UNTIL PHASE 5 LANDED, AND THE NOTE THAT SAID SO IS REPLACED BY IT
 * RATHER THAN LEFT STANDING. It read: *"'Ray — was in, now out' is the attendance reversal
 * Ruling 6 fences behind phase 5's last-seen record."* That was exactly right — a why-line for a
 * reversal needs to know whether THIS VIEWER has been shown it, and until `EventRole.glanceSeenAt`
 * existed there was nobody to ask. Slice 6d asks it: `stickyReversals` off her own replay.
 */
export const REVERSAL_WHY = 'was in, now out';

/**
 * RULING 23's OVERLAY — the sticky red, as one field on top of the ordinary derivation.
 *
 * Verbatim: "the sticky red is an OVERLAY on top of the ordinary derivation. Playing the replay
 * removes the overlay; what is revealed is whatever the person's state already derives to
 * underneath. This invents no new colour and needs no definition of 'settled' beyond the overlay
 * lifting." And: "DERIVED, never a write. A write makes looking become operating, and the glance
 * is a place she looks, not a place she operates."
 *
 * ── WHY IT IS HERE AND NOT IN `state.ts` ─────────────────────────────────────────────────
 *
 * `derivePersonState` is THE ORDINARY DERIVATION, and Ruling 23's whole point is that this is not
 * part of it. A reversed person still derives to OUT — `tests/glance-replay-test.ts` asserts the
 * two side by side on the same inputs — and what changes is what a strip DISPLAYS to a viewer who
 * has not been shown the news yet. Put this next to `derivePersonState` and the next reader has
 * to work out which of the two is the colour rule; put it next to the tones and the words it
 * changes, and it is obviously a display overlay.
 *
 * ── ONE FIELD, AND `reasons` IS DELIBERATELY UNTOUCHED ───────────────────────────────────
 *
 * The person keeps her own `ATTENDANCE_NO`, which is the true reason and is what `whyLineFor`
 * below reads to say "was in, now out". Writing a reason in here would be the overlay inventing a
 * fact about her; leaving hers alone means the why is hers. It also makes the overlay reversible
 * by construction: drop the one field and the ordinary derivation is what is left.
 *
 * NOT A MUTATION. A new object every time, so the payload the summary, the assistant's message
 * and the reassign pool read cannot be edited by rendering a strip.
 */
export function overlayReversal(person: GlancePerson): GlancePerson {
  return { ...person, state: 'RED' };
}

/**
 * Ruling 4: "reds carry their why... A red is her move, and a move needs a direction."
 * Amber and green stay bare, and so do the two greys — NOT_CHASED because Ruling 14 says
 * the mark suppresses escalation, and OUT because its "— out" already carries it.
 *
 * ⚠ ONE OF THE REFERENCE'S TWO EXAMPLES IS NOW RENDERED, AND THE OTHER STILL IS NOT.
 * "Ray — was in, now out" is built as of slice 6d: it is the attendance reversal, and it was
 * fenced behind phase 5's last-seen record because a sticky red needs a viewer to be sticky FOR.
 * See `REVERSAL_WHY` and `overlayReversal` above. "Amelia — quiet after 2 nudges" is rendered as
 * "gone quiet": [[GTC-251]]'s W1 ruled the line final without a count.
 *
 * The register is deliberate: `maybe timed out` puts the clock at fault rather than the
 * guest, which is the voice §8 uses about a maybe.
 *
 * AND EVERY LINE IS SHORT ENOUGH TO BE ONE. Ruling 4 asks for a why, not a sentence, and
 * the reference's columns are `minmax(160px, 1fr)`; the browser walk on 2026-08-31 showed
 * a longer line wrapping a red strip to three rows, which makes the loudest thing on the
 * board also the untidiest. The test caps these at 16 characters so the next line added
 * here is measured against the strip rather than against the writer's ear.
 */
/**
 * ONE LINE PER REASON, AS A `Record` OVER THE PRECEDENCE UNION — GTC-189 slice 7a.
 *
 * ⚠ IT REPLACED A CHAIN THAT ENDED IN A BARE `return 'gone quiet'`, AND THAT FALL-THROUGH WAS A
 * SILENT FALSEHOOD WAITING FOR THIS SLICE. Any reason added to `WHY_PRECEDENCE` without its own
 * branch rendered *"gone quiet"* — which is false of a message that never arrived and false of
 * somebody with no address at all. And a reason left OUT of the list rendered no why at all, against
 * [[GTC-192]] Ruling 4, which is the gap ruling M recorded when it asked for a reason of its own.
 *
 * **Two silent failure modes, one absent and one FALSE, and the false one is the worse.** A `Record`
 * keyed on the union closes both: a new precedence member with no line does not compile, and there is
 * no default to fall into. Founder instruction, 2026-09-19: *"The fall-through closes in the same
 * edit."*
 *
 * A function per line rather than a string, because some lines read the person.
 */
const WHY_LINES: Record<(typeof WHY_PRECEDENCE)[number], (person: GlancePerson) => string> = {
  // RULING 6, THROUGH RULING 23's OVERLAY, AND UNREACHABLE WITHOUT IT. `derivePersonState` pairs
  // `ATTENDANCE_NO` with OUT and with nothing else, so RED-plus-ATTENDANCE_NO is exactly and only an
  // overlaid reversal. It leads the precedence because it is the news: a person who has left is not
  // first of all a person who handed one row back.
  ATTENDANCE_NO: () => REVERSAL_WHY,
  // GTC-189 slice 7a, ruling S and the fourth red. THREE mechanisms, one sentence: a rejection at
  // submission, a bounce after acceptance and a provider failure are all "it did not arrive".
  NOT_DELIVERED: () => 'never got it',
  // Ruling M's red. ⚠ RULED AS "nowhere to send it" AND SHORTENED BY ONE WORD: at 18 characters it
  // broke the ≤16 pin every other why-line is held to, which comes from the reference's 160px
  // columns. The pin caught the proposal; the sense is unchanged.
  //
  // ⚠ [[GTC-189]] slice 8a — IT READS THE PERSON NOW. Founder ruling, 2026-09-27: *"'Nowhere to
  // send' is false of someone Gather can text."* The dispatcher's fence withholds an invitation
  // queued before the provider's block was learned, and that guest may hold a usable mobile; for
  // them the red is about the address, and the door offers "Send it as a text". 11 characters.
  UNREACHABLE: (person) => (person.textable ? "can't email" : 'nowhere to send'),
  // [[GTC-251]] Q5, founder 2026-09-29: *"Those words already exist on the board for the same problem
  // at the invitation, so nothing new to approve."* The same words, read the same way.
  CHASE_UNREACHABLE: (person) => (person.textable ? "can't email" : 'nowhere to send'),
  /*
   * [[GTC-296]] correction R7. The founder proposed *"no email"* (8) and offered *"opted out"*
   * (9) *"if it reads better"*.
   *
   * ⚠ *"no email"* IS TAKEN, AND WORSE THAN TAKEN — IT IS `NO_CHANNEL`'s MEANING. Next to
   * `ADULT_WHY.NO_CHANNEL`'s *"No email or mobile number."* it would read as *this person has
   * no address*, which is false of somebody who has one, used it, and asked Gather to stop. The
   * nine-character line says what happened.
   *
   * ✅ PRODUCED SINCE [[GTC-305]] (ruling 3), which absorbed [[GTC-327]]: the chase chooser's
   * EMAIL_OPTED_OUT and EMAIL_REPORTED, through `CHASE_REFUSAL_MEANS` in
   * `src/lib/glance/chase-fact.ts`. The words written ahead of it were used unchanged.
   */
  EMAIL_OPTED_OUT: () => 'opted out',
  // [[GTC-350]] R1 and R2, ruled 2026-10-02. A child is never texted, so "replied by text" would be
  // false of one: the reply is its carrier's, and R3 on the child's card says whose.
  REPLIED: (person) =>
    isChildMembership(person.householdRole) ? 'reply came in' : 'replied by text',
  REVERSAL: (person) => {
    const handedBack = person.items.filter((i) => i.reason === 'REVERSAL').length;
    return handedBack > 1 ? `handed ${handedBack} back` : 'handed it back';
  },
  DECIDE_BY_EXPIRED: () => 'maybe timed out',
  // [[GTC-251]] W1, ruled 2026-09-30 as final: no count. A count differs by pace (one reminder for
  // "go gentle"), "nudges" is not the host's word, and "quiet after 2 nudges" breaks the 16 cap.
  EXHAUSTED_SILENCE: () => 'gone quiet',
};

export function whyLineFor(person: GlancePerson): string | null {
  if (person.state !== 'RED') return null;

  for (const reason of WHY_PRECEDENCE) {
    if (!person.reasons.includes(reason)) continue;
    return WHY_LINES[reason](person);
  }
  return null;
}

/**
 * Ruling 2's sentence, in two parts: the clause that answers "is anything mine to do",
 * and the rest.
 *
 * WHOLE NUMBERS OF PEOPLE, NEVER RATES. A percentage would grade her family and crosses
 * into §3's refused analytics — `tests/glance-grid-test.tsx` asserts on this function's
 * body that no division or modulo appears in it.
 *
 * THE ZERO CASE IS WORDED, NOT COUNTED. "Nothing needs you" rather than "0 need you": the
 * lead clause is the four-second answer and it should read as relief, not as a tally at
 * zero. The other two clauses are DROPPED at zero rather than reworded, because "I’m looking
 * after 0" and "0 settled" are noise — a clause that says nothing should not be there. The lead
 * clause is never dropped: absent it, an empty board would say nothing at all.
 */
export function summaryClauses(summary: GlanceSummary): { lead: string; rest: string } {
  const lead =
    summary.needYou === 0
      ? 'Nothing needs you.'
      : summary.needYou === 1
        ? '1 needs you.'
        : `${summary.needYou} need you.`;

  const rest: string[] = [];
  // GTC-363 (item 7, W2): the founder's words replace GTC-192's "Gather is on N".
  if (summary.withGather > 0) rest.push(`I’m looking after ${summary.withGather}.`);
  if (summary.settled > 0) rest.push(`${summary.settled} settled.`);

  return { lead, rest: rest.join(' ') };
}

/** The same sentence as one string — what a screen reader and the tests both read. */
export function summarySentence(summary: GlanceSummary): string {
  const { lead, rest } = summaryClauses(summary);
  return rest ? `${lead} ${rest}` : lead;
}

/**
 * Ruling 8's alert strip, in two parts: the count phrase and the names.
 *
 * NULL WHEN THERE IS NOTHING TO SAY. The absence of the strip IS the good news — an
 * "all criticals covered" banner would be a green tick nobody asked for, sitting where a
 * danger tint lives, and Ruling 1's general test refuses anything that makes the host lean
 * in. Silence is the calmer signal and it is the one the reference draws.
 *
 * The noun and the verb both agree with the count: one critical item HAS no owner; two
 * critical items HAVE none.
 */
export function criticalStripClauses(
  items: readonly GlanceUnassignedItem[]
): { lead: string; names: string } | null {
  if (items.length === 0) return null;
  const noun = items.length === 1 ? 'critical item has' : 'critical items have';
  return {
    lead: `${items.length} ${noun} no owner`,
    names: items.map((i) => i.name).join(' · '),
  };
}

/** The same line as one string — what a screen reader and the tests both read. */
export function criticalStripText(items: readonly GlanceUnassignedItem[]): string | null {
  const clauses = criticalStripClauses(items);
  return clauses ? `${clauses.lead} — ${clauses.names}` : null;
}

/**
 * Ruling 8's quiet door.
 *
 * NULL AT ZERO — there is no door to a list with nothing in it. The count is of ORDINARY
 * unassigned items; the criticals are named above it and are not counted again here.
 */
export function unassignedDoorText(ordinaryCount: number): string | null {
  if (ordinaryCount <= 0) return null;
  return `and ${ordinaryCount} more unassigned`;
}

/**
 * Where the door goes: the plan's Teams section.
 *
 * THE HOUSE DESTINATION, NOT A NEW ONE. `?expand=teams` is a live contract the plan page
 * already honours, and the pre-flight already sends the host there for exactly this errand.
 * Reusing it means the glance hands off rather than growing a second place to fix coverage —
 * which is Ruling 8's own sentence: ordinary unassigned items stay the plan's and
 * pre-flight's business.
 */
export function unassignedDoorHref(eventId: string): string {
  return `/plan/${eventId}?expand=teams`;
}

/* ══════════════════════════════════════════════════════════════════════════════════════════
   PHASE 7 — RULED AND SHIPPED. Rulings 33, 34, 35 and 36, 2026-09-11.

   THERE IS NO VARIANT SWITCH. Ruling 36: "Nothing in this phase ships behind a flag. Shipping a
   variant as a default was the thing phase 7 existed to prevent, and a switch left in the tree
   is a variant nobody ruled on." `?variant`, `GlanceVariant`, `GLANCE_VARIANTS` and
   `parseVariant` are DELETED, not disabled.

   WHAT WAS RULED AGAINST AND IS GONE FROM THE TREE:

     · the amber clock-line on the strip, in BOTH its forms (`a` and `a2`) — RULING 33. The
       clock-line, its two classes, the weekday formatter and both variant members are deleted
       from this file, and the guard that forbade them is RESTORED VERBATIM in
       `tests/glance-grid-test.tsx` with the successors written for its relaxation deleted too.
       ⚠ THE FACT ITSELF SURVIVES, SOMEWHERE ELSE: Ruling 34 puts the nudge day in the READING
       PANEL, on amber people only. See `reading.ts`. "The same fact is a countdown on a strip
       she did not ask for and an answer in a panel she chose to open."

     · the `b-red` / `b-all` pair — RULING 35 supersedes both with ONE rule, below.

   ══════════════════════════════════════════════════════════════════════════════════════════ */

/**
 * RULING 32 — WHICH ROOM A STRIP OPENS. Two rooms, and they are not the same room.
 *
 *   acting   `PersonSurface`       — Move to… / Move / I'll do it / Remind them. RED only.
 *   reading  `GlancePersonReading` — name, status, nudge day, what they are bringing. No
 *                                    controls of any kind. GREEN and AMBER.
 *   null     a sealed `<div>`      — OUT, and NOT_CHASED for the mark and a child holding
 *                                    nothing. [[GTC-305]] opens four other greys onto the
 *                                    reading room — see `panelFor`.
 *
 * ⚠ RULING 17's SECOND SENTENCE IS WHAT KEEPS THE LAST LINE TRUE, AND IT IS UNTOUCHED BY EVERY
 * RULING IN THIS PHASE: *"The don't-chase mark is revisited where it is set (the pre-flight),
 * not here."* A person Kate has taken off the system's hands, and a person who has answered no,
 * open nothing. Asserted in both directions.
 *
 * ⚠ AND IT NO LONGER TAKES A VARIANT, WHICH IS RULING 36 IN ONE SIGNATURE. There is one board.
 */
export type GlancePanel = 'acting' | 'reading';

/**
 * ⚠ [[GTC-305]] — RULING 32 AMENDED, founder 2026-09-28, on Ruling 32's own reason: *she should be
 * able to check what someone is bringing without leaving the board.* The greys Gather invites and
 * never reminds — handed over, opted out of texts, the host as carrier, the host's own household —
 * open the READING room, because a hand-over means "I'll do the follow-up" (GTC-305 ruling 2).
 * The don't-chase grey stays sealed (Ruling 17's second sentence, untouched), and so does a child
 * holding nothing (its panel would hold nothing to check). The list is `READING_GREYS` in
 * `state.ts`, so every other grey seals by default.
 *
 * It takes the PERSON rather than the state because the two greys are one state told apart by their
 * reason. Still one argument.
 */
export type PanelSubject = Pick<GlancePerson, 'state' | 'reasons'> & {
  replies?: readonly unknown[];
};

export function panelFor(person: PanelSubject): GlancePanel | null {
  if (person.state === 'RED') return 'acting';
  if (person.state === 'GREEN' || person.state === 'AMBER') return 'reading';
  if (person.state === 'NOT_CHASED' && greyOpensReading(person.reasons)) return 'reading';
  /*
   * [[GTC-350]] plan ruling Q-G — an OUT strip and a don't-chase strip open the reading room when,
   * and only when, they carry replies: Q2 puts every reply on the board, and a sealed strip would
   * hide them. Without replies both stay sealed (Rulings 7, 17 and 32).
   */
  const hasReplies = (person.replies?.length ?? 0) > 0;
  if (hasReplies && person.state === 'OUT') return 'reading';
  if (hasReplies && person.state === 'NOT_CHASED' && person.reasons.includes('DONT_CHASE')) {
    return 'reading';
  }
  return null;
}

/* ── RULING 35 — THE DOOR TREATMENT, ON EVERY STRIP THAT OPENS SOMETHING ─────────────────────
 *
 * The founder's reason, verbatim:
 *
 *   "a chevron is a promise that something opens. With variant c in, nine of eleven strips open
 *    something, so the treatment is honest on all nine. The two that open nothing must not wear
 *    it."
 *
 * ⚠ SO THE RULE IS `panelFor` AND NOT A LIST OF STATES, AND THAT IS THE WHOLE POINT. A list
 * would have to be kept in step with the routing by hand, and "a guarantee maintained in two
 * places is a guarantee that is false somewhere" — this ticket's own lesson, from the fence
 * that had a hole in it for three slices. Here the promise IS the routing: a strip wears the
 * chevron exactly when it has something to open, because the same function decides both.
 * Asserted both ways — every treated strip opens something, and every sealed strip is
 * untreated.
 *
 * ⚠ THIS SUPERSEDES `b-red` AND `b-all`. Phase 4 shipped a red door with no border, no chevron,
 * no hover and no cursor class, and said so at the site; that held the line until this ruling.
 * The `:672` guard which enforced it is NARROWED, not deleted — see the site for what it still
 * protects.
 */

/**
 * The treatment, as the reference and the ticket both name it: border, chevron, hover, cursor.
 *
 * The hover is `brightness`, not a second colour: a hover tint written as a hex would be a
 * fifth palette entry per state, free to drift from the four `STRIP_TONE` already holds.
 */
export const DOOR_TREATMENT_CLASS =
  'relative pr-6 cursor-pointer transition-[filter] duration-150 hover:brightness-[0.965]';

/**
 * The border half.
 *
 * ⚠ HELD APART, AND STILL CHECKED, THOUGH NOTHING CAN TRIP IT TODAY. Ruling 7 gives NOT_CHASED
 * a hairline of its own and forbids OUT one — and two `border-width` utilities on one element
 * are resolved by stylesheet order, not class order, so a treated grey would be visually
 * indeterminate. Neither grey is treated any more, so the hazard cannot arise; the guard in
 * `tests/glance-grid-test.tsx` asserts that no TREATED state's tone already carries a border,
 * so a future state that does cannot quietly acquire a second one.
 */
export const DOOR_BORDER_CLASS = 'border border-[#00000014]';

/** The chevron: an element, not a `::after`, so the painters' `appendChild` cannot land after it. */
export const DOOR_CHEVRON = '›';
export const DOOR_CHEVRON_CLASS =
  'pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] leading-none opacity-60';

/** RULING 35: does this strip wear the promise? Exactly when it has something to open. */
export function doorTreatmentReaches(person: PanelSubject): boolean {
  return panelFor(person) !== null;
}

/**
 * The classes this strip gains — the empty string when it gains none.
 *
 * ONE FUNCTION, ONE SITE. `GlanceBoard` appends whatever this returns and decides nothing of
 * its own, which is what keeps the treatment out of the element branch: an acting door, a
 * reading door and a sealed strip are handed the same string by the same rule.
 */
export function doorTreatmentFor(person: PanelSubject): string {
  if (!doorTreatmentReaches(person)) return '';
  // [[GTC-350]] — an OUT strip opened by its replies keeps Ruling 7's "no border": the chevron, the
  // hover and the cursor, and nothing that makes a ghost look present.
  if (person.state === 'OUT') return DOOR_TREATMENT_CLASS;
  /*
   * [[GTC-305]] — THE HAZARD `DOOR_BORDER_CLASS` WAS HELD APART FOR HAS NOW ARRIVED. Ruling 32 as
   * amended treats a NOT_CHASED strip, whose tone already carries Ruling 7's hairline, and two
   * border-width utilities on one element resolve by stylesheet order. So a tone with a border of
   * its own keeps it, and gets the chevron, hover and cursor without a second one.
   */
  if (/(^|\s)border(-\[[\d.]+px\])?(\s|$)/.test(STRIP_TONE[person.state].className)) {
    return DOOR_TREATMENT_CLASS;
  }
  return `${DOOR_TREATMENT_CLASS} ${DOOR_BORDER_CLASS}`;
}
