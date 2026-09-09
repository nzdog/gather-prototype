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

import type {
  GlancePerson,
  GlanceSummary,
  GlanceUnassignedItem,
  PersonState,
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
export const WHY_PRECEDENCE = ['REVERSAL', 'DECIDE_BY_EXPIRED', 'EXHAUSTED_SILENCE'] as const;

/**
 * Ruling 4: "reds carry their why... A red is her move, and a move needs a direction."
 * Amber and green stay bare, and so do the two greys — NOT_CHASED because Ruling 14 says
 * the mark suppresses escalation, and OUT because its "— out" already carries it.
 *
 * ⚠ THE REFERENCE'S OWN TWO EXAMPLES CANNOT BE RENDERED TODAY. "Amelia — quiet after 2
 * nudges" needs the count [[GTC-251]] owns, and "Ray — was in, now out" is the attendance
 * reversal Ruling 6 fences behind phase 5's last-seen record. Both doors exist in the
 * payload; the copy below is what the two live red sources can honestly say.
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
export function whyLineFor(person: GlancePerson): string | null {
  if (person.state !== 'RED') return null;

  for (const reason of WHY_PRECEDENCE) {
    if (!person.reasons.includes(reason)) continue;

    if (reason === 'REVERSAL') {
      const handedBack = person.items.filter((i) => i.reason === 'REVERSAL').length;
      return handedBack > 1 ? `handed ${handedBack} back` : 'handed it back';
    }
    if (reason === 'DECIDE_BY_EXPIRED') return 'maybe timed out';
    // GTC-251 supplies the count this line wants ("quiet after 2 nudges"); until it lands
    // the honest line is the one that claims no number.
    return 'gone quiet';
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
 * zero. The other two clauses are DROPPED at zero rather than reworded, because "Gather is
 * on 0" and "0 settled" are noise — a clause that says nothing should not be there. The
 * lead clause is never dropped: absent it, an empty board would say nothing at all.
 */
export function summaryClauses(summary: GlanceSummary): { lead: string; rest: string } {
  const lead =
    summary.needYou === 0
      ? 'Nothing needs you.'
      : summary.needYou === 1
        ? '1 needs you.'
        : `${summary.needYou} need you.`;

  const rest: string[] = [];
  if (summary.withGather > 0) rest.push(`Gather is on ${summary.withGather}.`);
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
