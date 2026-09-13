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

import type { GlanceItem, GlancePerson, PersonState } from '@/lib/glance/state';

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
}

/**
 * Ruling 32's status word: "confirmed for green, no answer yet for amber."
 *
 * ⚠ TWO STATES AND NO OTHERS, BY CONSTRUCTION RATHER THAN BY A DEFAULT BRANCH. `panelFor`
 * opens this panel for GREEN and AMBER alone, so a third word would be a word for a case that
 * cannot reach here — and a `default:` returning something plausible is how a case that
 * *later* can reach here arrives silently wearing the wrong label. It throws instead.
 */
export function readingStatusWord(state: PersonState): string {
  if (state === 'GREEN') return 'Confirmed';
  if (state === 'AMBER') return 'No answer yet';
  throw new Error(`readingStatusWord: no word for ${state} — panelFor opens GREEN and AMBER only`);
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
export function readingPanelFor(person: GlancePerson, now: Date): ReadingPanel {
  return {
    name: person.name,
    status: readingStatusWord(person.state),
    nudge: nudgeDayFor(person, now),
    rows: person.items.map((row) => ({
      itemId: row.itemId,
      name: row.name,
      quantity: quantityLabel(row),
      critical: row.critical,
    })),
  };
}
