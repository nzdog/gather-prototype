/**
 * GTC-192 (J1, phase 7) — THE READING PANEL'S CONTENT, as a payload of its own.
 *
 * Rulings 32, 34 and 36. Pure: no React, no data access, so the fence and the no-date rule can
 * be run over the OBJECT rather than scraped out of markup.
 *
 * ── WHY THIS IS ITS OWN FILE, AND WHY THAT IS NOT ROUTING AROUND A GUARD ──────────────────
 *
 * It began inside `strip.ts`. **Ruling 33 takes the clock off the strip and requires that
 * `strip.ts` be PROVABLY FREE of `nextNudgeAt` again** — the guard at
 * `tests/glance-grid-test.tsx` is restored verbatim to say exactly that. **Ruling 34 then puts
 * the nudge day in the PANEL.** Both cannot be true with the panel's model living in the
 * strip's file.
 *
 * ⚠ SO THE MOVE IS THE RULINGS' OWN SHAPE, NOT A DODGE — and the difference is testable rather
 * than asserted in prose. A dodge would leave the guard green while the forbidden thing
 * shipped. Here the forbidden thing is **a clock on a strip**, and that is guarded by its own
 * positive mechanism as well as by the name scan: the rendered board carries no
 * `data-strip-clock`, and a strip's body is exactly a name, its optional state-words, and an
 * optional chevron. Re-adding a clock to a strip fails that whether or not `nextNudgeAt` is
 * the name used to do it.
 *
 * The file boundary now matches the rulings: `strip.ts` is the STRIP's tone and words, and it
 * knows nothing about cadence. This is the PANEL's content, and the nudge day is its business.
 */

import {
  greyOpensReading,
  type GlanceItem,
  type GlancePerson,
  type GlanceReply,
  type PersonReason,
  type PersonState,
} from '@/lib/glance/state';
import { personDoorHref } from '@/lib/events/home-href';
import { CHASE_DOOR_LINK, chaseDoorHref } from '@/lib/preflight/after-press-words';

export interface ReadingRow {
  itemId: string;
  name: string;
  /** Already formatted. A number and a unit never reach the panel as separate facts. */
  quantity: string | null;
  critical: boolean;
}

export interface ReadingPanel {
  name: string;
  /** Ruling 32's "status in a word". */
  status: string;
  /** RULING 34 — the nudge day, on amber people only. Null on green and on a spent cadence. */
  nudge: string | null;
  rows: ReadingRow[];
  /**
   * [[GTC-305]] — Ruling 32 AMENDED, founder 2026-09-28: a grey that opens this room carries the
   * ruled sentence saying why Gather will not chase them, and ruling 3's `emailNote` where there is
   * one. ALWAYS EMPTY FOR GREEN AND AMBER, whose panels stay exactly as ruled — the list is filled
   * from the state and reasons, never from whatever the person object happens to carry.
   */
  notes: string[];
  /**
   * [[GTC-350]] Q2 — every text reply they sent, newest first: their words, and when each came as a
   * line the server wrote (R5). The one ruled exception to this panel's no-date rule: a written line,
   * never an instant. Empty on a co-host's board and for anyone who sent none.
   */
  replies: GlanceReply[];
  /**
   * [[GTC-387]] (item 70) — the way to where this grey is changed, as a link styled as a button:
   * "Give them a job" for a child holding nothing (Moment 3, the child picked; none on an
   * invites-only event, Q13), "Change who I nudge" for the don't-nudge mark (the pre-flight, before
   * the press as well as after, Q14). NULL for everyone else, and always present.
   */
  door: { label: string; href: string } | null;
}

/** Where the board is: what the reading room's door needs to name an address. */
export interface ReadingPlace {
  eventId: string;
  /** No plan, so no jobs: the child's door is not drawn (Q13). */
  invitesOnly: boolean;
}

/** [[GTC-387]] W25 — the status word for a child holding nothing. */
export const CHILD_NO_JOB_STATUS = 'No job yet';
/** [[GTC-350]] R6 — the status word for not coming. */
export const NOT_COMING_STATUS = 'Not coming';
/** [[GTC-387]] W27 — the child's door (ruled). */
export const GIVE_JOB_DOOR = 'Give them a job';

/** The three greys [[GTC-387]] Q11 opens, by the one reason each is told apart by. */
export type OpenedGrey = 'CHILD_WITHOUT_ITEM' | 'DONT_CHASE' | 'OUT';

/** [[GTC-387]] W26, W29 and W32 — each grey's one sentence, in its pop-up. */
export const GREY_NOTES: Record<OpenedGrey, string> = {
  CHILD_WITHOUT_ITEM: 'I haven’t asked anyone about them, so there’s nothing to follow up.',
  DONT_CHASE: 'You marked them don’t-nudge, so I won’t follow them up.',
  OUT: 'They told me they can’t come, so I won’t nudge them.',
};

/**
 * Which of the three a strip is, or null. [[GTC-305]]'s four greys are asked first, as the status
 * word always has, so a grey that already opened keeps its own room.
 */
export function openedGreyOf(
  state: PersonState,
  reasons: readonly PersonReason[]
): OpenedGrey | null {
  if (state === 'OUT') return 'OUT';
  if (state !== 'NOT_CHASED' || greyOpensReading(reasons)) return null;
  if (reasons.includes('DONT_CHASE')) return 'DONT_CHASE';
  if (reasons.includes('CHILD_WITHOUT_ITEM')) return 'CHILD_WITHOUT_ITEM';
  return null;
}

/** [[GTC-350]] R4, ruled 2026-10-02 — the heading over the replies, in both rooms. Never a count. */
export const REPLIES_HEADING = 'Their replies';

/**
 * Ruling 32's status word: "confirmed for green, no answer yet for amber."
 *
 * ⚠ TWO STATES AND NO OTHERS, BY CONSTRUCTION RATHER THAN BY A DEFAULT BRANCH. `panelFor`
 * opens this panel for GREEN and AMBER alone, so a third word would be a word for a case that
 * cannot reach here — and a `default:` returning something plausible is how a case that
 * *later* can reach here arrives silently wearing the wrong label. It throws instead.
 */
export function readingStatusWord(
  state: PersonState,
  reasons: readonly PersonReason[] = []
): string {
  if (state === 'GREEN') return 'Confirmed';
  if (state === 'AMBER') return 'No answer yet';
  // [[GTC-305]] — Ruling 32 as amended opens this room for four greys. They have not answered, so
  // amber's own word is the true one; the grey already says nobody is chasing them.
  if (state === 'NOT_CHASED' && greyOpensReading(reasons)) return 'No answer yet';
  /*
   * [[GTC-350]] R6, ruled 2026-10-02 — the words for not coming and the mark. Until [[GTC-387]] they
   * were said only when replies opened the strip (plan Q-G); Q11 opens both with or without replies,
   * so the same R6 words, always. And W25 for a child holding nothing.
   */
  const grey = openedGreyOf(state, reasons);
  if (grey === 'OUT') return NOT_COMING_STATUS;
  if (grey === 'DONT_CHASE') return "You're handling them";
  if (grey === 'CHILD_WITHOUT_ITEM') return CHILD_NO_JOB_STATUS;
  throw new Error(`readingStatusWord: no word for ${state} — panelFor does not open it`);
}

/** Local calendar day, as an integer — what "today" and "tomorrow" are counted in. */
function localDayIndex(d: Date): number {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60_000) / 86_400_000);
}

/**
 * When the next nudge fires, as a WEEKDAY and never as a count.
 *
 * ⚠ "A COUNT IS A COUNTDOWN BY ANOTHER NAME AND THIS RULING IS ABOUT NOT HAVING ONE."
 * Hinge §6's own wording is *"nudge in 2 days"*, and Ruling 34 refuses it in those words. The
 * guard is mechanical rather than a promise: `tests/glance-grid-test.tsx` asserts this line
 * contains NO DIGIT, at any amber, which a count cannot satisfy and a date cannot either.
 */
function nudgeWhen(at: Date, now: Date): string {
  const days = localDayIndex(at) - localDayIndex(now);
  if (days <= 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days < 7) return at.toLocaleDateString('en-NZ', { weekday: 'short' });
  // Beyond a week a weekday is ambiguous — "Sat" could be either one. The MONTH NAME keeps it
  // a date rather than a count, and the assertion that there is no digit holds: a cadence more
  // than a week out cannot arise from [4, 7] days, so this is the unreachable-but-honest arm
  // rather than a second format anyone will see. It names the day, never a number of them.
  return at.toLocaleDateString('en-NZ', { weekday: 'long' });
}

/**
 * RULING 34 — the nudge day, and the reason it is allowed here and nowhere else.
 *
 * The founder, verbatim: *"the same fact is a countdown on a strip she did not ask for and an
 * answer in a panel she chose to open. Where it sits is what changes it."*
 *
 * ⚠ AMBER ONLY. *"Green has nothing pending and gets no line."* A settled person is not being
 * chased, so a promise about the next chase is a promise about nothing.
 *
 * ⚠ A SPENT CADENCE RENDERS NOTHING, AND SAYS NOTHING ABOUT BEING SPENT. `nextNudgeAt` returns
 * null for an exhausted cadence AND for a DONT_CHASE person from moment zero (GTC-179's
 * warning, which `state.ts` repeats at the field). A line reading "no more nudges" would decide
 * the exhaustion question [[GTC-251]] owns, by stealth, from a display module. Null is null.
 */
export function nudgeDayFor(person: GlancePerson, now: Date): string | null {
  if (person.state !== 'AMBER') return null;
  if (person.nextNudgeAt === null) return null;
  const at = new Date(person.nextNudgeAt);
  if (Number.isNaN(at.getTime())) return null;
  return `nudge ${nudgeWhen(at, now)}`;
}

/**
 * Singular and plural, for the units that are WORDS rather than symbols.
 *
 * "1 tray", not "1 trays" — the founder's own correction from the walk.
 *
 * ⚠ THE SYMBOL UNITS ARE NOT PLURALISED AND MUST NOT BE. "2 kgs" and "2 mls" are wrong in a way
 * "2 trays" is not: kg, g, l and ml are symbols, and a symbol has no plural. COUNT never
 * reaches here — it is dropped entirely below, because "6 COUNT" reads as a database row.
 *
 * ⚠ AND A CUSTOM UNIT IS THE HOST'S OWN WORD, LEFT EXACTLY AS SHE TYPED IT. Pluralising
 * someone's free text is inventing — "2 big bowl" is her wording and "2 big bowls" is ours.
 * Stated rather than discovered: this is the one place a quantity can read ungrammatically, and
 * it reads that way because the alternative is editing her.
 */
const UNIT_SINGULAR: Record<string, string> = {
  TRAYS: 'tray',
  PACKS: 'pack',
  SERVINGS: 'serving',
};

/**
 * "quantity and unit, and nothing else."
 *
 * ⚠ WHAT THIS RETURNS NULL FOR — A STATED DECISION WITH ITS COST NAMED, RULED 2026-09-11 rather
 * than left as an oversight. The founder: *"A settled placeholder and a genuine absence both
 * render blank, and I accept that rather than widen the payload further."*
 *
 * `quantityState`, `quantityText` and `quantityLabel` are deliberately NOT on the wire. So an
 * item whose quantity is a PLACEHOLDER — a number nobody has settled — renders exactly like an
 * item that genuinely has none, and like one whose quantity is free text. **The cost is that
 * the panel cannot tell her a quantity is still open.** Both cases stand side by side on the
 * seeded board (Sarah's wine is a placeholder; Connor's crackers have none) so the cost is
 * visible rather than described.
 *
 * ⚠ AND IT IS NOT THE PLAN'S FORMATTER, BECAUSE THERE IS NO SHARED ONE. The only quantity
 * renderer in the tree is a four-line local in `ItemReviewCard`, which ignores
 * `quantityUnitCustom` — so a custom unit renders there as nothing at all. Reusing it would
 * import that bug; extracting it is a refactor of a V1 surface this phase does not touch.
 */
export function quantityLabel(
  item: Pick<GlanceItem, 'quantityAmount' | 'quantityUnit' | 'quantityUnitCustom'>
): string | null {
  const amount = item.quantityAmount;
  if (amount === null) return null;
  // COUNT is a counting unit, not a word anyone says: "12 COUNT" reads as a database row.
  if (item.quantityUnit === 'COUNT' || item.quantityUnit === null) return `${amount}`;
  if (item.quantityUnit === 'CUSTOM') {
    const custom = item.quantityUnitCustom;
    return custom ? `${amount} ${custom}` : `${amount}`;
  }
  const word = amount === 1 ? (UNIT_SINGULAR[item.quantityUnit] ?? null) : null;
  return `${amount} ${(word ?? item.quantityUnit).toLowerCase()}`;
}

/**
 * The whole panel, as data.
 *
 * ⚠ A NARROWED OBJECT, NOT A `GlancePerson`, AND THAT IS THE MECHANISM OF THE PANEL'S DATE
 * FENCE RATHER THAN A TIDINESS CHOICE. `GlancePerson` carries `nextNudgeAt` and a `decideByAt`
 * on every row. Handing the panel the person and asserting it does not render them is the
 * assertion §5 layer 3 exists to refuse: a field in hand and not rendered is one careless JSX
 * edit from being rendered. Here they never arrive — the only date-derived thing that crosses
 * is `nudge`, and it is a WEEKDAY WORD with no digit in it.
 */
export function readingPanelFor(
  person: GlancePerson,
  now: Date,
  place?: ReadingPlace
): ReadingPanel {
  const grey = openedGreyOf(person.state, person.reasons);
  return {
    name: person.name,
    status: readingStatusWord(person.state, person.reasons),
    nudge: nudgeDayFor(person, now),
    notes:
      person.state === 'NOT_CHASED' && greyOpensReading(person.reasons)
        ? [person.chaseNote, person.emailNote].filter((n): n is string => !!n)
        : grey
          ? [GREY_NOTES[grey]]
          : [],
    replies: person.replies ?? [],
    door: readingDoorFor(grey, person.personId, place),
    rows: person.items.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      quantity: quantityLabel(row),
      critical: row.critical,
    })),
  };
}

/** [[GTC-387]] — the pop-up's one link, or none. */
function readingDoorFor(
  grey: OpenedGrey | null,
  personId: string,
  place: ReadingPlace | undefined
): ReadingPanel['door'] {
  if (!place) return null;
  if (grey === 'CHILD_WITHOUT_ITEM' && !place.invitesOnly) {
    return { label: GIVE_JOB_DOOR, href: personDoorHref(place.eventId, personId) };
  }
  if (grey === 'DONT_CHASE') return { label: CHASE_DOOR_LINK, href: chaseDoorHref(place.eventId) };
  return null;
}
