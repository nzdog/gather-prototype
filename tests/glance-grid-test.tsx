/**
 * GTC-192 (J1, phase 2) — the static grid.
 *
 * Rulings 2, 3, 4, 5 and 7 made visible, against `docs/design/moment4-glance-reference.md`
 * and the mockup beside it. This file proves the render logic without a browser: the copy
 * and the tones are pure functions, and `GlanceBoard` is a presentational component with
 * no data access and no client hooks, so `renderToStaticMarkup` is the whole surface.
 *
 * FOUR LAYERS:
 *  1. Pure — the sentence, the why-lines, the two greys. No React, no database.
 *  2. Markup — `GlanceBoard` rendered over a hand-built payload. Ruling 5's no-folding and
 *     Ruling 7's fence are assertions about what actually reaches the page.
 *  3. DB — the ORDER ANCHOR. Two reads of one event with states permuted in between must
 *     give byte-identical ordering; "fixed positions" is worth nothing if a reply moves a
 *     card.
 *  4. Structural — the page's auth, the absence of client hooks, and the absence of any
 *     phase 3/4/6/7 surface (alert strip, tap, polling, clock-lines).
 *
 * Ruling 1's behaviour fence is NOT duplicated here. It lives in
 * `tests/glance-read-test.ts`, which phase 2 extends to cover the page and the component,
 * so the denylist stays in one place.
 *
 * Run: npm run test:glance-grid  (needs tests/tsconfig.json's react-jsx — tsx would
 * otherwise fall back to the classic transform and the component has no React import)
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

function raw(rel: string): string {
  try {
    return readFileSync(join(__dirname, '..', rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped — prose about a rule must not satisfy an assertion. */
function code(rel: string): string {
  return raw(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function functionBody(src: string, name: string): string {
  const m = new RegExp(`export function ${name}[\\s\\S]*?\\n\\}`).exec(src);
  return m ? m[0] : '';
}

/** A person, as the payload shapes one. Only the fields the render logic reads. */
function person(over: Record<string, unknown> = {}): any {
  return {
    personEventId: `pe-${Math.random().toString(36).slice(2)}`,
    personId: 'p',
    name: 'Someone',
    isHost: false,
    householdRole: 'GUEST',
    state: 'GREEN',
    reasons: ['ACCEPTED'],
    nextNudgeAt: null,
    items: [],
    ...over,
  };
}

/** The strip element that renders `label`, exactly — not a fixed-width slice around it. */
function stripFor(html: string, label: string): string {
  const at = html.indexOf(`<span>${label}</span>`);
  if (at < 0) return '';
  const start = html.lastIndexOf('<div data-strip-state', at);
  return start < 0 ? '' : html.slice(start, at);
}

function redItem(reason: string, critical = false, name = 'The pavlova'): any {
  return {
    itemId: `i-${reason}-${Math.random().toString(36).slice(2)}`,
    assignmentId: 'a',
    name,
    critical,
    state: 'RED',
    reason,
    decideByAt: null,
  };
}

/** A person who trips the assistant's condition: RED, holding a RED critical row. */
function criticalRedPerson(name: string, itemName: string): any {
  return person({
    name,
    state: 'RED',
    reasons: ['EXHAUSTED_SILENCE'],
    items: [redItem('EXHAUSTED_SILENCE', true, itemName)],
  });
}

async function main() {
  const createdEventIds: string[] = [];
  const createdPersonIds: string[] = [];
  const createdUserIds: string[] = [];

  let SP: any = null; // src/components/glance/strip
  let AS: any = null; // src/components/glance/assistant
  let GB: any = null; // src/components/glance/GlanceBoard
  let R: any = null; // src/lib/glance/read
  let GR: any = null; // src/components/glance/GlanceReplay — phase 6 slice 6c's island
  // Each import stands alone. A shared try{} lets one missing module abort the rest, and
  // the RED run then reports forty failures that are really one — a legible RED is the
  // whole point of taking one.
  const modules: [string, () => Promise<unknown>, (m: unknown) => void][] = [
    ['strip', () => import('../src/components/glance/strip'), (m) => (SP = m)],
    ['assistant', () => import('../src/components/glance/assistant'), (m) => (AS = m)],
    ['GlanceBoard', () => import('../src/components/glance/GlanceBoard'), (m) => (GB = m)],
    ['read', () => import('../src/lib/glance/read'), (m) => (R = m)],
    ['GlanceReplay', () => import('../src/components/glance/GlanceReplay'), (m) => (GR = m)],
  ];

  /**
   * The island rendered on its own, as the page renders it beside the board.
   *
   * `renderToStaticMarkup` runs no effects, so what comes back is the island's FIRST PAINT —
   * which is the thing under test: nothing at all when there are no steps, and an inert
   * overlay when there are. The animation itself is a browser property and is walked, not
   * asserted; see the browser walk in the ticket.
   */
  function islandHtml(eventId: string, steps: unknown[]): string {
    return GR ? renderToStaticMarkup(createElement(GR.default, { eventId, steps } as any)) : '';
  }
  for (const [name, load, set] of modules) {
    try {
      set(await load());
    } catch (err) {
      console.error(
        `\x1b[31m!\x1b[0m ${name} failed to load: ${String((err as Error).message).split('\n')[0]}`
      );
    }
  }

  try {
    // ══ LAYER 1 — the copy and the tones ═════════════════════════════════

    // ── Ruling 2: the summary sentence, whole numbers only ────────────────
    assert(
      'Ruling 2',
      'the reference sentence, verbatim — "3 need you. Gather is on 9. 28 settled."',
      ok(
        () =>
          SP.summarySentence({ needYou: 3, withGather: 9, settled: 28 }) ===
          '3 need you. Gather is on 9. 28 settled.'
      )
    );
    assert(
      'Ruling 2',
      'the ZERO case is worded, not counted — "Nothing needs you", never "0 need you"',
      ok(() => {
        const s = SP.summarySentence({ needYou: 0, withGather: 9, settled: 28 });
        return s === 'Nothing needs you. Gather is on 9. 28 settled.' && !s.includes('0 need');
      })
    );
    assert(
      'Ruling 2',
      'ONE needs you, not one need you — the count agrees with its verb',
      ok(() => SP.summarySentence({ needYou: 1, withGather: 0, settled: 0 }) === '1 needs you.')
    );
    assert(
      'Ruling 2',
      'an empty board still answers the four-second question rather than saying nothing',
      ok(
        () => SP.summarySentence({ needYou: 0, withGather: 0, settled: 0 }) === 'Nothing needs you.'
      )
    );
    assert(
      'Ruling 2',
      'zero clauses are dropped, never rendered as "Gather is on 0"',
      ok(() => {
        const s = SP.summarySentence({ needYou: 2, withGather: 0, settled: 5 });
        return s === '2 need you. 5 settled.' && !s.includes('on 0');
      })
    );
    assert(
      'Ruling 2',
      'the sentence is built by counting — no division, no modulo, no percentage in its body',
      ok(() => {
        const body = functionBody(code('src/components/glance/strip.ts'), 'summarySentence');
        return body.length > 0 && !/[/%]/.test(body.replace(/=>/g, ''));
      })
    );

    // ── Ruling 4: reds carry their why; amber and green stay bare ─────────
    assert(
      'Ruling 4',
      'a REVERSAL red says what happened, and says it in the singular for one row',
      ok(
        () =>
          SP.whyLineFor(
            person({ state: 'RED', reasons: ['REVERSAL'], items: [redItem('REVERSAL')] })
          ) === 'handed it back'
      )
    );
    assert(
      'Ruling 4',
      'and counts the rows when there is more than one — a move needs a direction',
      ok(
        () =>
          SP.whyLineFor(
            person({
              state: 'RED',
              reasons: ['REVERSAL'],
              items: [redItem('REVERSAL'), redItem('REVERSAL')],
            })
          ) === 'handed 2 back'
      )
    );
    assert(
      'Ruling 4',
      'an expired maybe blames the clock, not the guest — and fits ONE short line',
      ok(
        () =>
          SP.whyLineFor(
            person({
              state: 'RED',
              reasons: ['DECIDE_BY_EXPIRED'],
              items: [redItem('DECIDE_BY_EXPIRED')],
            })
          ) === 'maybe timed out'
      )
    );
    assert(
      'Ruling 4',
      'every why fits a strip — Ruling 4 asks for one short line, and 160px columns are the reference’s',
      ok(() =>
        ['REVERSAL', 'DECIDE_BY_EXPIRED', 'EXHAUSTED_SILENCE'].every((reason) => {
          const line = SP.whyLineFor(
            person({ state: 'RED', reasons: [reason], items: [redItem(reason)] })
          );
          return typeof line === 'string' && line.length <= 16;
        })
      )
    );
    assert(
      'Ruling 4',
      'the GTC-251 red has its line waiting too — the seam reaches the strip, not just the payload',
      ok(
        () =>
          typeof SP.whyLineFor(
            person({
              state: 'RED',
              reasons: ['EXHAUSTED_SILENCE'],
              items: [redItem('EXHAUSTED_SILENCE')],
            })
          ) === 'string'
      )
    );
    for (const state of ['AMBER', 'GREEN', 'NOT_CHASED', 'OUT']) {
      assert(
        'Ruling 4',
        `${state} stays BARE — only a red carries a why`,
        ok(() => SP.whyLineFor(person({ state, reasons: ['AWAITING_REPLY'] })) === null)
      );
    }
    assert(
      'phase 7 held back',
      'no amber clock-line — the variant is phase 7 and shipping it would settle it by stealth',
      ok(() => {
        const src =
          code('src/components/glance/strip.ts') + code('src/components/glance/GlanceBoard.tsx');
        return src.length > 0 && !/nextNudgeAt/.test(src);
      })
    );

    // ── Ruling 7: the two greys are a deliberate pair ─────────────────────
    assert(
      'Ruling 7',
      'OUT carries "— out" in its TEXT, which is what makes the fade legible',
      ok(() => SP.stripLabel(person({ state: 'OUT', name: 'Ray Dalton' })) === 'Ray Dalton — out')
    );
    assert(
      'Ruling 7',
      'and every other state is the bare name',
      ok(() =>
        ['RED', 'AMBER', 'GREEN', 'NOT_CHASED'].every(
          (state) => SP.stripLabel(person({ state, name: 'Ray Dalton' })) === 'Ray Dalton'
        )
      )
    );

    // ── 6c / finding 1: the words that describe the CURRENT state, named as one thing ──
    //
    // The replay rewinds a strip's TINT and cannot rewind its WORDS: the past `reasons` are not
    // on the wire and `ReplayStep` is exactly four keys. So the words are suppressed while a
    // step is pending and appear as it lands — which needs the two kinds of state-describing
    // words to be ONE concept the island can address. They are Ruling 7's "— out" and Ruling
    // 4's why; the name is never one of them.
    assert(
      'finding 1',
      'the state-words are one concept — Ruling 7’s "— out" and Ruling 4’s why, and nothing else',
      ok(
        () =>
          SP.stripStateWords(person({ state: 'OUT', name: 'Ray Dalton' })) === '— out' &&
          SP.stripStateWords(
            person({ state: 'RED', reasons: ['DECIDE_BY_EXPIRED'], items: [] })
          ) === '— maybe timed out'
      )
    );
    assert(
      'finding 1',
      'and a state with nothing to say has none — the bare name is the whole strip',
      ok(() =>
        ['AMBER', 'GREEN', 'NOT_CHASED'].every(
          (state) => SP.stripStateWords(person({ state })) === null
        )
      )
    );
    assert(
      'finding 1',
      'ONE definition of "— out": the label is composed from the state-words, never a second copy',
      ok(() => {
        const src = code('src/components/glance/strip.ts');
        return src.length > 0 && (src.match(/— out/g) ?? []).length === 1;
      })
    );
    assert(
      'Ruling 7',
      'OUT fades entirely and has NO border — absence receding to a ghost',
      ok(() => {
        const t = SP.STRIP_TONE.OUT.className;
        return /opacity-/.test(t) && !/border-\[/.test(t);
      })
    );
    assert(
      'Ruling 7',
      'NOT_CHASED keeps a hairline border and full-strength text — expected, just unbothered',
      ok(() => {
        const t = SP.STRIP_TONE.NOT_CHASED.className;
        return /border-\[/.test(t) && !/opacity-/.test(t);
      })
    );
    assert(
      'Ruling 7',
      'the two greys are visibly different, not one grey used twice',
      ok(() => SP.STRIP_TONE.OUT.className !== SP.STRIP_TONE.NOT_CHASED.className)
    );
    assert(
      'tones',
      'red is the danger tint, amber the warning tint, green the success tint (the reference’s hexes)',
      ok(
        () =>
          SP.STRIP_TONE.RED.className.includes('#FCEBEB') &&
          SP.STRIP_TONE.AMBER.className.includes('#FAEEDA') &&
          SP.STRIP_TONE.GREEN.className.includes('#EAF3DE')
      )
    );

    // ══ LAYER 2 — the rendered markup ════════════════════════════════════
    const board = (glance: any, eventName = 'Henderson family Christmas') =>
      renderToStaticMarkup(
        createElement(GB.default, {
          glance,
          eventName,
          // Phase 4: the viewer's own authority and the date the remind copy needs. Both
          // are the PAGE's to know — neither is board state, so neither is in the payload.
          actorRole: 'HOST',
          eventDate: 'Thursday 25 December',
        })
      );

    const mixed = {
      eventId: 'e1',
      hostPersonId: 'p-kate',
      asOf: new Date('2026-08-31T12:00:00Z').toISOString(),
      summary: { needYou: 2, withGather: 1, settled: 2 },
      households: [
        {
          householdId: 'hh-host',
          primaryContactName: 'Kate Whittaker',
          isHostHousehold: true,
          members: [
            person({ name: 'Kate Whittaker', isHost: true, state: 'GREEN' }),
            person({ name: 'Sam Whittaker', state: 'AMBER', reasons: ['AWAITING_REPLY'] }),
          ],
        },
        {
          householdId: 'hh-turner',
          primaryContactName: 'Amelia Turner',
          isHostHousehold: false,
          members: [
            person({
              name: 'Amelia Turner',
              state: 'RED',
              reasons: ['DECIDE_BY_EXPIRED'],
              items: [redItem('DECIDE_BY_EXPIRED', true)],
            }),
            person({ name: 'Charlotte Turner', state: 'GREEN' }),
          ],
        },
        {
          householdId: 'hh-dalton',
          primaryContactName: 'Ray Dalton',
          isHostHousehold: false,
          members: [
            person({ name: 'Ray Dalton', state: 'OUT', reasons: ['ATTENDANCE_NO'] }),
            person({ name: 'Aoife Dalton', state: 'NOT_CHASED', reasons: ['DONT_CHASE'] }),
            person({
              name: 'Sarah Dalton',
              state: 'RED',
              reasons: ['REVERSAL'],
              items: [redItem('REVERSAL')],
            }),
          ],
        },
      ],
      unhoused: [person({ name: 'Bob Unhoused', state: 'GREEN', householdRole: null })],
      unassignedCritical: [
        { itemId: 'c1', name: 'the glazed ham' },
        { itemId: 'c2', name: 'the marquee' },
      ],
      unassignedOrdinaryCount: 4,
    };

    const html = GB ? board(mixed) : '';

    assert(
      'markup',
      'the board renders, and every person on the payload reaches it',
      ok(() =>
        [
          'Kate Whittaker',
          'Sam Whittaker',
          'Amelia Turner',
          'Charlotte Turner',
          'Ray Dalton',
          'Aoife Dalton',
          'Sarah Dalton',
          'Bob Unhoused',
        ].every((n) => html.includes(n))
      )
    );
    assert(
      'Ruling 2',
      'the summary sentence is on the surface, ABOVE the grid — it is the four-second answer',
      ok(() => {
        const at = html.indexOf('data-summary="2 need you. Gather is on 1. 2 settled."');
        const grid = html.indexOf('data-household-card');
        return at >= 0 && grid >= 0 && at < grid;
      })
    );
    assert(
      'Ruling 2',
      'and no percentage sign reaches the rendered output (§3’s refused analytics)',
      ok(() => html.length > 0 && !html.includes('%'))
    );
    assert(
      'Ruling 4',
      'the red strips carry their whys',
      ok(() => html.includes('maybe timed out') && html.includes('handed it back'))
    );
    assert(
      'Ruling 4',
      'and the amber and green strips carry none — no why-line text anywhere near them',
      ok(() => {
        const whys = ['maybe timed out', 'handed it back', 'gone quiet'];
        const at = html.indexOf('Sam Whittaker');
        const green = html.indexOf('Charlotte Turner');
        if (at < 0 || green < 0) return false;
        return [html.slice(at, at + 220), html.slice(green, green + 220)].every((chunk) =>
          whys.every((w) => !chunk.includes(w))
        );
      })
    );
    assert(
      'Ruling 7',
      'OUT renders faded, with "— out" in its text and no border class',
      ok(() => {
        // ⚠ THE LOOKUP MOVED IN 6c AND THE ASSERTION DID NOT. `stripFor` finds the strip by its
        // NAME span, and 6c split Ruling 7's "— out" out of that span into its own so the
        // replay can suppress it (finding 1). The text half is asserted explicitly rather than
        // riding on the lookup, which is what it used to do.
        const strip = stripFor(html, 'Ray Dalton');
        const at = html.indexOf('<span>Ray Dalton</span>');
        return (
          strip.length > 0 &&
          /opacity-/.test(strip) &&
          !/border-\[/.test(strip) &&
          html.slice(at, at + 100).includes('— out')
        );
      })
    );
    assert(
      'Ruling 7',
      'NOT_CHASED renders bordered and unfaded, right beside it — the pair is visible',
      ok(() => {
        const strip = stripFor(html, 'Aoife Dalton');
        return strip.length > 0 && /border-\[/.test(strip) && !/opacity-/.test(strip);
      })
    );
    assert(
      'no card colour',
      'the household CARD carries none of the three tints — it is neutral by ruling',
      ok(() => {
        const cards = html
          .split('data-household-card')
          .slice(1)
          .map((c) => c.slice(0, c.indexOf('>')));
        return cards.length === 3 && cards.every((c) => !/#FCEBEB|#FAEEDA|#EAF3DE/.test(c));
      })
    );
    assert(
      'Ruling 3',
      'the host’s household card is rendered FIRST — the board is a map, not a queue',
      ok(
        () =>
          html.indexOf('hh-host') < html.indexOf('hh-turner') &&
          html.indexOf('hh-turner') < html.indexOf('hh-dalton')
      )
    );
    assert(
      'host',
      'the host gets NO special-casing in the view — her strip is whatever the payload says',
      ok(() => {
        const strip = stripFor(html, 'Kate Whittaker');
        return strip.length > 0 && strip.includes('#EAF3DE') && strip.includes('"GREEN"');
      })
    );

    // Ruling 5 — no folding, at any size.
    const big = {
      ...mixed,
      summary: { needYou: 0, withGather: 0, settled: 60 },
      households: [
        {
          householdId: 'hh-big',
          primaryContactName: 'Big Household',
          isHostHousehold: true,
          members: Array.from({ length: 60 }, (_, i) => person({ name: `Settled Person ${i}` })),
        },
      ],
      unhoused: [],
      unassignedCritical: [],
      unassignedOrdinaryCount: 0,
    };
    const bigHtml = GB ? board(big) : '';
    assert(
      'Ruling 5',
      'green NEVER folds — 60 settled people are 60 strips, not a count',
      ok(() => {
        return bigHtml.split('data-strip-state="GREEN"').length - 1 === 60;
      })
    );
    assert(
      'Ruling 5',
      'and the last name in a long house is still on the board',
      ok(() => bigHtml.includes('Settled Person 59'))
    );

    // Refusals — §3's list plus Ruling 1's general test.
    assert(
      'refusals',
      'no countdown reaches the surface — §3 refuses it, and the MOCKUP carries one',
      ok(() => html.length > 0 && !/days to go|days left|countdown/i.test(html))
    );
    assert(
      'refusals',
      'no progress bar, no percentage, no response-rate reporting',
      ok(
        () => html.length > 0 && !/<progress|role="progressbar"|progress bar|\brate\b|%/i.test(html)
      )
    );
    // The phase-2 guard "no alert strip — unassigned criticals are phase 3" is RETIRED
    // here rather than deleted quietly: it held its line until phase 3 arrived, and the
    // Ruling 8 assertions below are what replaces it.
    // The two phase-2 guards here — "strips are NOT interactive" and "nothing on the
    // surface is a button" — are RETIRED by phase 4 rather than deleted quietly. They held
    // their line until tap-for-actions arrived; what replaces them is narrower and says
    // the same thing about everything that is still not a door: ONLY REDS OPEN.
    /** The tag name of the element whose opening tag contains the character at `at`. */
    const tagAt = (src: string, at: number) =>
      src.slice(src.lastIndexOf('<', at)).split(/[\s>]/)[0];
    /** Every index at which `needle` occurs in `src`. */
    const everyAt = (src: string, needle: string) => {
      const out: number[] = [];
      for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) out.push(i);
      return out;
    };

    assert(
      'phase 4',
      'a RED strip is a door — a real button, so it is reachable by tap AND by keyboard',
      ok(() => {
        const reds = everyAt(html, 'data-strip-state="RED"');
        return reds.length === 2 && reds.every((at) => tagAt(html, at) === '<button');
      })
    );
    assert(
      'phase 4',
      'and EVERY red is one — two reds on this board, two doors, no red left undoored',
      ok(() => {
        const doors = everyAt(html, 'data-strip-door');
        return doors.length === 2 && doors.every((at) => tagAt(html, at) === '<button');
      })
    );
    assert(
      'phase 4',
      'amber, green and the two greys are NOT — no button, no handler, no link on any of them',
      ok(() => {
        const others = ['AMBER', 'GREEN', 'OUT', 'NOT_CHASED'].flatMap((state) =>
          html.split(`data-strip-state="${state}"`).slice(1)
        );
        // GATED ON THE POSITIVE CASE. "Nothing here is a door" is trivially true of a
        // board with no doors at all, so this cannot go green until the reds have theirs.
        return (
          html.includes('data-strip-door') &&
          others.length === 6 &&
          others.every((chunk) => {
            const el = chunk.slice(0, chunk.indexOf('</div>'));
            return !/<button|<a |onclick|role="button"|data-strip-door/i.test(el);
          })
        );
      })
    );
    assert(
      'phase 4',
      'the CLOSED surface shows state only — no action affordance renders until a red is tapped',
      ok(
        () =>
          html.includes('data-strip-door') &&
          !/Remind|Move to|I’ll do it|Take over|Reassign/i.test(html)
      )
    );
    assert(
      'phase 7 held back',
      'the red strip is NOT styled as a button — same tint, same text, no hover, no cursor',
      ok(() => {
        const at = html.indexOf('data-strip-door');
        const el = html.slice(html.lastIndexOf('<', at), html.indexOf('>', at));
        return (
          at > 0 &&
          el.includes(SP.STRIP_TONE.RED.className) &&
          !/hover:|cursor-|chevron|→|›/.test(html)
        );
      })
    );

    // ══ PHASE 3 — Ruling 8's alert strip ═════════════════════════════════
    assert(
      'Ruling 8',
      'the reference line, verbatim — "2 critical items have no owner — the glazed ham · the marquee"',
      ok(
        () =>
          SP.criticalStripText([
            { itemId: 'a', name: 'the glazed ham' },
            { itemId: 'b', name: 'the marquee' },
          ]) === '2 critical items have no owner — the glazed ham · the marquee'
      )
    );
    assert(
      'Ruling 8',
      'ONE critical item HAS no owner — the noun and the verb both agree with the count',
      ok(
        () =>
          SP.criticalStripText([{ itemId: 'a', name: 'the ham' }]) ===
          '1 critical item has no owner — the ham'
      )
    );
    assert(
      'Ruling 8',
      'no criticals means NO STRIP — null, not an empty banner and not a green all-clear',
      ok(() => SP.criticalStripText([]) === null)
    );
    assert(
      'Ruling 8',
      'the door counts the ordinary ones and says so quietly',
      ok(() => SP.unassignedDoorText(7) === 'and 7 more unassigned')
    );
    assert(
      'Ruling 8',
      'and at zero there is NO DOOR at all',
      ok(() => SP.unassignedDoorText(0) === null && SP.unassignedDoorText(-1) === null)
    );

    // ── Ruling 8, rendered ────────────────────────────────────────────────
    assert(
      'Ruling 8',
      'the alert strip renders ABOVE the grid and below the summary — the mockup’s order',
      ok(() => {
        const sum = html.indexOf('data-summary');
        const strip = html.indexOf('data-critical-strip');
        const grid = html.indexOf('data-household-card');
        return sum >= 0 && strip > sum && strip < grid;
      })
    );
    assert(
      'Ruling 8',
      'it names the criticals, and is danger-tinted',
      ok(() => {
        const at = html.indexOf('data-critical-strip');
        const el = html.slice(at, at + 400);
        return (
          el.includes('#FCEBEB') && el.includes('the glazed ham') && el.includes('the marquee')
        );
      })
    );
    assert(
      'Ruling 8',
      'CRITICALS ONLY — no ordinary unassigned item is ever named on the glance',
      ok(
        () =>
          html.includes('data-critical-strip') &&
          !html.includes('the paper cups') &&
          !html.includes('the serviettes')
      )
    );
    assert(
      'Ruling 8',
      'the door reports the right N and hands off to the plan’s Teams section',
      ok(() => {
        const at = html.indexOf('data-unassigned-door');
        if (at < 0) return false;
        const el = html.slice(Math.max(0, at - 200), at + 200);
        return el.includes('and 4 more unassigned') && el.includes('?expand=teams');
      })
    );
    assert(
      'Ruling 2',
      'the summary sentence is UNCHANGED by the strip — it counts people, and a loose item is not one',
      ok(() => html.includes('data-summary="2 need you. Gather is on 1. 2 settled."'))
    );

    const noCriticals = { ...mixed, unassignedCritical: [], unassignedOrdinaryCount: 9 };
    const noCritHtml = GB ? board(noCriticals) : '';
    assert(
      'Ruling 8',
      'NO STRIP when nothing critical is ownerless — the good state is silence, not a green banner',
      ok(
        () =>
          // gated on the strip existing at all, so this cannot pass by nothing being built
          html.includes('data-critical-strip') &&
          noCritHtml.length > 0 &&
          !noCritHtml.includes('data-critical-strip') &&
          !/no owner|all covered|nothing unassigned/i.test(noCritHtml)
      )
    );
    assert(
      'Ruling 8',
      'and no door either — with no ownerless critical the glance does not nag about what can wait',
      ok(
        () =>
          html.includes('data-unassigned-door') &&
          noCritHtml.length > 0 &&
          !noCritHtml.includes('data-unassigned-door')
      )
    );

    const noDoor = { ...mixed, unassignedOrdinaryCount: 0 };
    const noDoorHtml = GB ? board(noDoor) : '';
    assert(
      'Ruling 8',
      'the strip stands alone when every ordinary item has an owner — strip yes, door no',
      ok(
        () =>
          noDoorHtml.includes('data-critical-strip') && !noDoorHtml.includes('data-unassigned-door')
      )
    );

    // ══ §3 — the assistant's one critical-red message ════════════════════
    //
    // The condition is TWO clauses and both earn their place: the ITEM must be critical
    // and red, and the PERSON holding it must be red. The person clause is what excludes a
    // DONT_CHASE holder — Ruling 14 greys the strip while the row stays red — and it does
    // so BY CONSTRUCTION, without this module ever naming the mark.
    const hitsOf = (g: any) => (AS ? AS.findCriticalRedHits(g) : null);

    const oneHit = {
      ...mixed,
      households: [
        {
          householdId: 'h1',
          primaryContactName: 'Amelia Turner',
          isHostHousehold: true,
          members: [criticalRedPerson('Amelia Turner', 'the pavlova')],
        },
      ],
      unhoused: [],
      unassignedCritical: [],
      unassignedOrdinaryCount: 0,
    };
    assert(
      '§3 assistant',
      'FIRES on a critical row that is red, held by a red person',
      ok(() => {
        const h = hitsOf(oneHit);
        return (
          h.length === 1 && h[0].personName === 'Amelia Turner' && h[0].itemName === 'the pavlova'
        );
      })
    );
    assert(
      '§3 assistant',
      'SILENT on a critical row held by an AMBER person — that is still Gather’s business',
      ok(
        () =>
          hitsOf({
            ...oneHit,
            households: [
              {
                ...oneHit.households[0],
                members: [
                  person({
                    name: 'Grace',
                    state: 'AMBER',
                    reasons: ['AWAITING_REPLY'],
                    items: [
                      {
                        ...redItem('EXHAUSTED_SILENCE', true, 'the ham'),
                        state: 'AMBER',
                        reason: 'AWAITING_REPLY',
                      },
                    ],
                  }),
                ],
              },
            ],
          }).length === 0
      )
    );
    assert(
      '§3 assistant',
      'SILENT on an ORDINARY red row held by a red person — §8.2, non-critical reds sit in the grid',
      ok(
        () =>
          hitsOf({
            ...oneHit,
            households: [
              {
                ...oneHit.households[0],
                members: [
                  person({
                    name: 'Sarah',
                    state: 'RED',
                    reasons: ['REVERSAL'],
                    items: [redItem('REVERSAL', false)],
                  }),
                ],
              },
            ],
          }).length === 0
      )
    );
    assert(
      '§3 assistant',
      'SILENT on a critical red row held by a DONT_CHASE person — Ruling 14, grey beats red',
      ok(
        () =>
          hitsOf({
            ...oneHit,
            households: [
              {
                ...oneHit.households[0],
                members: [
                  person({
                    name: 'Aoife',
                    state: 'NOT_CHASED',
                    reasons: ['DONT_CHASE'],
                    items: [redItem('DECIDE_BY_EXPIRED', true, 'the cake')],
                  }),
                ],
              },
            ],
          }).length === 0
      )
    );
    assert(
      '§3 assistant',
      'and that exclusion is BY CONSTRUCTION — the module never names the mark, it reads the state',
      ok(() => {
        const src = code('src/components/glance/assistant.ts');
        return src.length > 0 && !/DONT_CHASE|nudgeMark/.test(src);
      })
    );
    assert(
      '§3 assistant',
      'DISAPPEARS when the person answers — a settled holder ends it',
      ok(
        () =>
          hitsOf({
            ...oneHit,
            households: [
              {
                ...oneHit.households[0],
                members: [
                  person({
                    name: 'Amelia Turner',
                    state: 'GREEN',
                    reasons: ['ACCEPTED'],
                    items: [
                      {
                        ...redItem('EXHAUSTED_SILENCE', true, 'the pavlova'),
                        state: 'GREEN',
                        reason: 'ACCEPTED',
                      },
                    ],
                  }),
                ],
              },
            ],
          }).length === 0
      )
    );
    assert(
      '§3 assistant',
      'DISAPPEARS when the item moves — the row is gone from that person’s hands',
      ok(
        () =>
          hitsOf({
            ...oneHit,
            households: [
              {
                ...oneHit.households[0],
                members: [
                  person({
                    name: 'Amelia Turner',
                    state: 'RED',
                    reasons: ['REVERSAL'],
                    items: [redItem('REVERSAL', false)],
                  }),
                ],
              },
            ],
          }).length === 0
      )
    );
    assert(
      '§3 assistant',
      'an unhoused person is on the board for this too — no household is not no person',
      ok(
        () =>
          hitsOf({ ...oneHit, households: [], unhoused: [criticalRedPerson('Bob', 'the ice')] })
            .length === 1
      )
    );

    const several = {
      ...oneHit,
      households: [
        {
          householdId: 'h1',
          primaryContactName: 'Amelia Turner',
          isHostHousehold: true,
          members: [criticalRedPerson('Amelia Turner', 'the pavlova')],
        },
        {
          householdId: 'h2',
          primaryContactName: 'Sarah Dalton',
          isHostHousehold: false,
          members: [criticalRedPerson('Sarah Dalton', 'the ham')],
        },
      ],
    };
    assert(
      '§3 assistant',
      'the wording, ONE — names the thing, admits what the system could not do, hands it over',
      ok(
        () =>
          AS.assistantMessage(hitsOf(oneHit)) ===
          'Gather is out of moves — the pavlova, with Amelia Turner. It’s yours now.'
      )
    );
    assert(
      '§3 assistant',
      'the wording, SEVERAL — ONE message covering all, never a stack',
      ok(
        () =>
          AS.assistantMessage(hitsOf(several)) ===
          'Gather is out of moves on 2 critical items — the pavlova with Amelia Turner · ' +
            'the ham with Sarah Dalton. They’re yours now.'
      )
    );
    assert(
      '§3 assistant',
      'the item name NEVER sits at a sentence boundary — it follows the em-dash, in both ' +
        'cases, because host-authored names arrive capitalised AND lower-case',
      ok(() =>
        [
          ['The pavlova', 'The'],
          ['the glazed ham', 'the'],
        ].every(([name, first]) => {
          const one = AS.assistantMessage([{ personName: 'Sarah', itemName: name }]);
          const many = AS.assistantMessage([
            { personName: 'Sarah', itemName: name },
            { personName: 'Amy', itemName: name },
          ]);
          return (
            one.includes(`— ${name},`) &&
            many.includes(`— ${name} with`) &&
            !one.startsWith(first) &&
            !many.startsWith(first)
          );
        })
      )
    );
    assert(
      '§3 assistant',
      'no message when nothing qualifies',
      ok(() => AS.assistantMessage([]) === null)
    );
    assert(
      '§3 assistant',
      'plain register — no exclamation mark, no urgency theatre',
      ok(() =>
        [AS.assistantMessage(hitsOf(oneHit)), AS.assistantMessage(hitsOf(several))].every(
          (m: string) => !/[!]|urgent|immediately|asap|hurry|attention/i.test(m)
        )
      )
    );
    assert(
      '§3 assistant',
      'it does not borrow the summary’s verb — "N need you" counts PEOPLE and must stay unambiguous',
      ok(() => !/need(s)? you/i.test(AS.assistantMessage(hitsOf(several))))
    );

    // ── rendered ──────────────────────────────────────────────────────────
    const severalHtml = GB ? board(several) : '';
    assert(
      '§3 assistant',
      'EXACTLY ONCE in the DOM, however many reds it covers (this ticket’s acceptance)',
      ok(() => severalHtml.split('data-assistant-message').length - 1 === 1)
    );
    assert(
      '§3 assistant',
      'it renders BETWEEN the strip and the grid on the mixed board',
      ok(() => {
        const strip = html.indexOf('data-critical-strip');
        const msg = html.indexOf('data-assistant-message');
        const grid = html.indexOf('data-household-card');
        return strip >= 0 && msg > strip && msg < grid;
      })
    );
    assert(
      '§3 assistant',
      'and it does NOT dilute the strip — the strip stays the only FILLED danger band above the grid',
      ok(() => {
        const above = html.slice(0, html.indexOf('data-household-card'));
        return (above.match(/bg-\[#FCEBEB\]/g) ?? []).length === 1;
      })
    );
    assert(
      '§3 assistant',
      'absent entirely when nothing qualifies — no reassuring all-clear',
      ok(() => {
        const quiet = GB ? board({ ...oneHit, households: [], unhoused: [] }) : '';
        return (
          html.includes('data-assistant-message') &&
          quiet.length > 0 &&
          !quiet.includes('data-assistant-message')
        );
      })
    );

    // ══ LAYER 3 — the ORDER ANCHOR ═══════════════════════════════════════
    //
    // "Fixed" has to be anchored to something that does not move when a reply lands.
    const stamp = Date.now();
    const user = await prisma.user.create({ data: { email: `gtc192-p2+${stamp}@example.com` } });
    createdUserIds.push(user.id);
    const hostPerson = await prisma.person.create({
      data: { name: 'Kate Order', email: user.email, userId: user.id },
    });
    createdPersonIds.push(hostPerson.id);

    const NOW = new Date('2026-08-31T12:00:00.000Z');
    const sentAt = new Date(NOW.getTime() - 10 * DAY);
    const dbEvent = await prisma.event.create({
      data: {
        name: 'GTC-192 phase 2 order anchor',
        startDate: new Date(NOW.getTime() + 100 * HOUR),
        endDate: new Date(NOW.getTime() + 130 * HOUR),
        hostId: hostPerson.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    createdEventIds.push(dbEvent.id);
    const team = await prisma.team.create({ data: { eventId: dbEvent.id, name: 'Mains' } });

    // Four households created in a deliberate order, the host's created LAST so that
    // "host first" cannot be an accident of capture order.
    const madeHouseholds: string[] = [];
    const madeAssignments: { id: string; personId: string }[] = [];
    for (const label of ['Alpha', 'Bravo', 'Charlie', 'HostHouse']) {
      const hh = await prisma.household.create({ data: { eventId: dbEvent.id } });
      madeHouseholds.push(hh.id);
      const isHostHouse = label === 'HostHouse';
      for (const suffix of ['One', 'Two']) {
        const isHostRow = isHostHouse && suffix === 'One';
        const p = isHostRow
          ? hostPerson
          : await prisma.person.create({
              data: {
                name: `${label} ${suffix}`,
                email: `gtc192p2+${stamp}+${label}${suffix}@example.com`,
              },
            });
        if (!isHostRow) createdPersonIds.push(p.id);
        await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: dbEvent.id,
            role: isHostRow ? 'HOST' : 'PARTICIPANT',
            householdId: hh.id,
            householdRole: suffix === 'One' ? 'PRIMARY_CONTACT' : 'PARTNER',
            sentAt,
          },
        });
        const item = await prisma.item.create({
          data: { teamId: team.id, name: `${label} ${suffix} item`, kind: 'ITEM' },
        });
        const a = await prisma.assignment.create({
          data: { itemId: item.id, personId: p.id, response: 'PENDING' },
        });
        madeAssignments.push({ id: a.id, personId: p.id });
      }
    }

    const order = (g: any) => ({
      households: g.households.map((h: any) => h.householdId),
      members: g.households.map((h: any) => h.members.map((m: any) => m.personEventId)),
    });

    const before = R ? await R.readEventGlance(prisma, dbEvent.id, NOW) : null;

    // Permute the states as hard as the model allows: accept some, decline others.
    for (const [i, a] of madeAssignments.entries()) {
      await prisma.assignment.update({
        where: { id: a.id },
        data: { response: i % 3 === 0 ? 'ACCEPTED' : i % 3 === 1 ? 'DECLINED' : 'MAYBE' },
      });
    }
    const after = R ? await R.readEventGlance(prisma, dbEvent.id, NOW) : null;

    assert(
      'order anchor',
      'the states genuinely changed between the two reads — the assertion is not vacuous',
      ok(
        () =>
          JSON.stringify(before.households.map((h: any) => h.members.map((m: any) => m.state))) !==
          JSON.stringify(after.households.map((h: any) => h.members.map((m: any) => m.state)))
      )
    );
    assert(
      'order anchor',
      'and NOTHING MOVED — household order and member order are byte-identical',
      ok(() => JSON.stringify(order(before)) === JSON.stringify(order(after)))
    );
    assert(
      'Ruling 3',
      'the host’s household is first even though it was created LAST — the anchor is not capture order alone',
      ok(
        () =>
          after.households[0].isHostHousehold === true &&
          after.households[0].householdId === madeHouseholds[3]
      )
    );
    assert(
      'Ruling 3',
      'and the rest hold capture order behind her — Alpha, Bravo, Charlie',
      ok(
        () =>
          JSON.stringify(after.households.slice(1).map((h: any) => h.householdId)) ===
          JSON.stringify(madeHouseholds.slice(0, 3))
      )
    );
    assert(
      'order anchor',
      'no comparator in the reader reads `state` — the order cannot depend on the colours',
      ok(() => {
        const src = code('src/lib/glance/read.ts');
        const sorts = src.match(/\.sort\(([\s\S]*?)\n\s*\)/g) ?? [];
        return sorts.length > 0 && sorts.every((s) => !/\bstate\b/.test(s));
      })
    );

    // ══ LAYER 4 — structural ═════════════════════════════════════════════
    const pageSrc = code('src/app/plan/[eventId]/glance/page.tsx');
    const boardSrc = code('src/components/glance/GlanceBoard.tsx');
    // Phase 6 slice 6c. Gated on rather than assumed: the three successors below are claims
    // about an island, and a missing island must read as a failure, never as a pass.
    const replayIslandSrc = code('src/components/glance/GlanceReplay.tsx');
    // Phase 6 slice 6e. The SAME treatment, for the same reason: the successors below are now
    // claims about TWO islands, and a missing one must read as a failure rather than a pass.
    const liveIslandSrc = code('src/components/glance/GlanceLive.tsx');
    const paintSrc = code('src/components/glance/paint.ts');

    assert(
      'page',
      'the page exists under /plan/[eventId]/glance',
      pageSrc.length > 0 && boardSrc.length > 0
    );
    assert(
      'page auth',
      'it reuses requireEventRole(HOST, COHOST) — the same guard the route uses, unmodified',
      /requireEventRole\(\s*eventId\s*,\s*\['HOST',\s*'COHOST'\]\s*\)/.test(pageSrc)
    );
    assert(
      'page auth',
      'and it fails closed before any read — the guard’s refusal short-circuits',
      pageSrc.length > 0 && /instanceof NextResponse/.test(pageSrc)
    );
    assert(
      'page',
      'it is a SERVER component — the board is right on first paint, not after a fetch',
      pageSrc.length > 0 && !/'use client'/.test(pageSrc)
    );
    assert(
      'page',
      'and it calls readEventGlance directly rather than re-deriving anything',
      /readEventGlance\(/.test(pageSrc) &&
        !/derivePersonState|worstItemState|summarisePeople/.test(pageSrc)
    );
    assert(
      'component',
      'GlanceBoard is presentational — no client hooks, no data access',
      boardSrc.length > 0 && !/'use client'|useState|useEffect|prisma|fetch\(/.test(boardSrc)
    );
    // ⚠ `[phase 6 held back]` IS RETIRED HERE, IN 6c, WITH THREE SUCCESSORS NAMED AT THE SITE
    // — 6b's own promise kept: "6c retires this successor in turn, when the island and the
    // animation land." They have landed. This is the treatment phase 3 gave phase 2's
    // alert-strip guard and 6b gave 6a's; the guard is retired, never deleted quietly.
    //
    //   was:  THE BOARD gains no polling and no replay
    //   now:  the three below.
    //
    // WHY IT HAD TO GO. The guard scanned the board for `/replay/i`, and it was already
    // narrowed once because 6b's page had to name the replay to compute it. 6c ships the
    // island itself, so the word now belongs on the surface by design; a guard that forbids
    // it would have to be lied to rather than kept.
    //
    // ⚠ AND THESE THREE ARE NOT HELD-BACK GUARDS. The one they replace existed to hold a line
    // until a slice arrived, and named its own retirer each time. These encode Ruling 6 and
    // phase 2's own property — one definition of what the board is and one of what "seen"
    // means — so NO SLICE IS SCHEDULED TO RETIRE THEM. If a later slice needs one gone, that
    // is a ruling, not a narrowing.
    // ⚠ THE CONTENTS OF THIS ASSERTION ARE UNCHANGED IN 6e AND ONLY ITS GATE WIDENS, WHICH IS
    // THE WHOLE POINT OF THE NOTE ABOVE. This is one of the three the ticket says no slice
    // retires. 6e is the slice under the most pressure to break it — polling wants the board to
    // re-render, and the shortest road to that is making `GlanceBoard` a client component — so
    // it is asserted against BOTH islands existing: the board starts no timer, and the timer
    // that now exists lives in an island beside it.
    assert(
      'phase 6 successor',
      'THE BOARD STILL HAS NO CLIENT HOOKS AND STARTS NO TIMER — the replay AND the polling are ISLANDS beside it, phase 4’s pattern',
      boardSrc.length > 0 &&
        replayIslandSrc.length > 0 &&
        liveIslandSrc.length > 0 &&
        !/'use client'|useState|useEffect|useLayoutEffect|setInterval|setTimeout/.test(boardSrc)
    );
    assert(
      'phase 6 successor',
      'THE ISLAND RENDERS NOTHING WHEN THERE ARE NO STEPS — "no fake fireworks: if nothing changed, nothing plays"',
      ok(() => GR !== null && islandHtml('e1', []) === '')
    );
    assert(
      'phase 6 successor',
      'NO ACKNOWLEDGE CONTROL ANYWHERE — not on the board, not in the island; "seen" means the replay played (Ruling 6)',
      ok(() => {
        const island = GR
          ? islandHtml('e1', [{ personEventId: 'pe1', from: 'AMBER', to: 'GREEN', spark: true }])
          : null;
        return (
          island !== null &&
          island.length > 0 &&
          !/<button|<a\s|role="button"/i.test(island) &&
          !/acknowledge|dismiss|got it|mark as seen|skip/i.test(island + html)
        );
      })
    );
    // ⚠ EXTENDED IN 6e, NOT NARROWED. The scan above reads MARKUP, and 6e's live island renders
    // none at all — so a "Refresh now" button, a "live" badge or a failed-poll banner would sit
    // entirely outside it and the guard would stay green. The negative the brief actually names
    // — a failed poll says NOTHING — is asserted on the live island's SOURCE instead, which is
    // the only place such a control could be written.
    assert(
      'phase 6 successor',
      'AND NO CONTROL IN THE LIVE ISLAND EITHER — no button, no retry, and no "offline"/"stale"/"reconnecting" wording; a failed poll makes her lean in and Ruling 1 refuses it',
      liveIslandSrc.length > 0 &&
        paintSrc.length > 0 &&
        !/<button|<a\s|role="button"|onClick|onKeyDown/i.test(liveIslandSrc) &&
        !/acknowledge|dismiss|got it|mark as seen|skip|offline|reconnect|stale|retry|try again/i.test(
          liveIslandSrc
        )
    );
    // Slice 6e writes the state-words back into the DOM from a polled payload, so the class the
    // board renders them with has to be readable rather than a literal in two places.
    assert(
      'phase 6 successor',
      'and the state-words carry ONE class definition — the board and the live repaint read the same constant, so a polled strip cannot render in a different weight',
      ok(() => {
        const strip = code('src/components/glance/strip.ts');
        const board = code('src/components/glance/GlanceBoard.tsx');
        return (
          strip.length > 0 &&
          board.length > 0 &&
          /STRIP_WORDS_CLASS/.test(strip) &&
          /STRIP_WORDS_CLASS/.test(board) &&
          /STRIP_WORDS_CLASS/.test(paintSrc) &&
          !/className="font-normal"|className={'font-normal'}/.test(board)
        );
      })
    );
    // ── 6c / finding 1, on the rendered markup ───────────────────────────
    assert(
      'finding 1',
      'the state-words are MARKED in the markup — a red’s why and an OUT’s "— out" both carry data-strip-words',
      ok(() => {
        const amelia = html.indexOf('Amelia Turner');
        const ray = html.indexOf('Ray Dalton');
        return (
          amelia > 0 &&
          ray > 0 &&
          /<span data-strip-words="" class="font-normal"> — maybe timed out<\/span>/.test(html) &&
          /<span data-strip-words="" class="font-normal"> — out<\/span>/.test(html)
        );
      })
    );
    assert(
      'finding 1',
      'and a strip with nothing to say carries none — there is nothing there to suppress',
      ok(() => {
        const at = html.indexOf('<span>Charlotte Turner</span>');
        return at > 0 && !html.slice(at, at + 120).includes('data-strip-words');
      })
    );
    assert(
      'finding 1',
      'the strip still READS the same — splitting the words into their own span changed no text',
      ok(
        () =>
          html.includes(
            '<span>Ray Dalton</span><span data-strip-words="" class="font-normal"> — out</span>'
          ) && html.includes('Amelia Turner')
      )
    );

    // The island paints strips it does not own, so the board has to make them findable. This
    // is the seam between the two, asserted on the rendered markup rather than on intent.
    assert(
      'phase 6 island',
      'and every strip is ADDRESSABLE — the board marks each with its personEventId so the island can find it',
      ok(() => {
        const ids = mixed.households.flatMap((h: any) =>
          h.members.map((m: any) => m.personEventId)
        );
        return (
          html.length > 0 &&
          ids.length === 7 &&
          ids.every((id: string) => html.includes(`data-person-event-id="${id}"`))
        );
      })
    );
    // The replay's particles are drawn in a bare DOM layer that cannot take a Tailwind class,
    // so they need the colour itself. `stripHexes` reads it out of the tone rather than
    // restating it — and this pins the answers, so an extraction that silently returned
    // nothing (invisible sparks) fails here rather than in front of the founder.
    assert(
      'phase 6 island',
      'the spark ramp is DERIVED from the tones — the green/amber hexes come out of the strips themselves, never a second copy',
      ok(
        () =>
          JSON.stringify(SP.stripHexes('AMBER')) === JSON.stringify(['#FAEEDA', '#854F0B']) &&
          JSON.stringify(SP.stripHexes('GREEN')) === JSON.stringify(['#EAF3DE', '#3B6D11'])
      )
    );
    assert(
      'phase 6 island',
      'the island’s overlay is INERT — aria-hidden and pointer-events-none, so it never intercepts a tap on the board beneath',
      ok(() => {
        const island = GR
          ? islandHtml('e1', [{ personEventId: 'pe1', from: 'AMBER', to: 'GREEN', spark: true }])
          : '';
        return (
          island.length > 0 &&
          /aria-hidden="true"/.test(island) &&
          /pointer-events-none/.test(island) &&
          /data-glance-replay="1"/.test(island)
        );
      })
    );
    assert(
      'V1 untouched',
      'the V1 dashboard god file is not modified by this phase',
      raw('src/app/plan/[eventId]/page.tsx').length > 0 &&
        !/glance/i.test(raw('src/app/plan/[eventId]/page.tsx'))
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    if (createdPersonIds.length) {
      await prisma.person.deleteMany({ where: { id: { in: createdPersonIds } } });
    }
    if (createdUserIds.length) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — the grid: fixed positions, whys on red, two greys, whole numbers.\x1b[0m'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
