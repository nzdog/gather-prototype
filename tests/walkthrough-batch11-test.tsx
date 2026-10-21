/**
 * GTC-380 — walkthrough batch 11: the pre-flight and the board (the 10 Oct walk's third batch).
 *
 * The founder walked the launch code on 2026-10-10 and ruled five batches (GTC-378). This suite
 * pins the third to his rulings (GTC-380, PLAN RULINGS 2026-10-11):
 *
 *   46  step 1 of the pre-flight no longer shows "The sweep’s own wording"; its three numbers,
 *       "Everything has an owner." and the loose list stay; the route is untouched (Q1)
 *   48  the pre-flight's steps 1 to 4 and step 3's household rows wear "Show" / "Hide" (W1, W2)
 *       beside a drawn chevron (ruling 3), hidden from screen readers (Q5); the whole title row,
 *       tick box included, shades under a pointer that can hover, and never on a touch screen or on
 *       the open contents (ruling 1); a sage ring on keyboard focus; the cue under the text on a
 *       phone (ruling 4); the four cues the same distance from the box's right edge (the addition);
 *       Ready, the settled steps and Moment 2's boxes unchanged (Q6)
 *   50  the board's search: a person's name opens their panel when their strip has one, otherwise
 *       the ring (Q7); every item name is a door to Moment 3 at that item, in item rows and inside
 *       a person's row (Q9, ruling 2), the line reading letter for letter as before; the arrival
 *       is read once, the row centred and outlined for two seconds, nothing picked (Q10)
 *   51  "← Back to the board" (W3) in Moment 3's bar once the invitations have gone, beside "← Back
 *       to the plan" on a desktop and under it on a phone (ruling 4); before, the bar byte for byte
 *
 * What the build is asked for, beyond the words: `src/lib/search/event-search.ts` keeps an item's
 * `id` (`narrowItems`), gives an item hit its `itemId` and a person holding items `parts` (each item
 * name with its id, the separators with none, joined equal to `answer`); `src/lib/events/home-href.ts`
 * exports `ITEM_PARAM` and `itemDoorHref(eventId, itemId)`; `AccordionShell.tsx` exports `FoldCue`
 * (`data-fold-cue`) and takes `showHide`; a folding step's tick box sits in a `data-tick-slot`;
 * Moment 3's item `<li>` carries `data-m3-item`, and its arrival lives in `bringItemIntoView`.
 *
 * Layers P, R and S run in memory. Layer C drives the dev server in the walled-off headless Chrome
 * (port 9478) at 1280 and 390, on a fixture of its own (example.com addresses, no phones, the sent
 * event's `sentAt` written directly, nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md and the send wall: the browser fails every plan-making request and every
 * request to a door that sends before it leaves the page (both proven on probe URLs first); every
 * click is `clickGuarded`; a "leave site?" dialog is the only kind answered, and every dialog is
 * logged. Inside a person's panel only its Close button is pressed. A second DevTools socket rests
 * the pointer on a row (no press) and, at 390, turns on touch emulation, so the page has no hover.
 * Never pressed: Send, Generate, Regenerate, "Move on →", New Event, a print dialog. The fixture's
 * `aiCallsUsed` is read while it exists, its rows counted, then removed by id; the totals are
 * asserted as found.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build. A target that is missing is not a click refusal: `tap` reports it as 'absent'.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9478;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
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

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** A render that never throws: an empty string when the component cannot render. */
function render(el: any): string {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// ── The ruled words, verbatim ────────────────────────────────────────────────
/** W1, W2 — GTC-380, already ruled at the sort; on a closed and an open fold-out row. */
const SHOW = 'Show';
const HIDE = 'Hide';
/** W3 — GTC-367 W5, `STRIP_WORDS.BACK_TO_BOARD`; Moment 3's bar after the press. */
const BACK_TO_BOARD = '← Back to the board';
const BACK_TO_PLAN = '← Back to the plan';
const SWEEP = 'The sweep’s own wording';

/** Moment 3's bar as it renders at `c8efed4` (Q11: before the press, byte for byte). */
const M3_BAR_AT_HEAD =
  '<div class="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4"><div class="max-w-5xl mx-auto flex items-center justify-between gap-3"><button type="button" class="text-sm text-gray-600 hover:text-gray-900 px-3 py-2">← Back to the plan</button><button type="button" data-m3="all-sorted" class="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors">All sorted →</button></div></div>';

const SHADE = /\[@media\(hover:hover\)\]:hover:bg-/;
const PLAIN_HOVER_BG = /(^|[\s"])hover:bg-/;

// ══ IN MEMORY — the pure layer, the render and the source ══════════════════════
async function runInMemory() {
  const ES = await load('../src/lib/search/event-search');
  const HH = await load('../src/lib/events/home-href');
  const PS = await load('../src/components/preflight/PreflightStep');
  const AS = await load('../src/components/plan/AccordionShell');

  // ── P — what the search keeps and says ─────────────────────────────────────
  const rawRow = (name: string, who: string | null, response = 'ACCEPTED') => ({
    id: `i-${name}`,
    name,
    quantityAmount: 2,
    team: { id: 't', name: 'Mains', displayOrder: 0 },
    assignment: who
      ? {
          id: `a-${name}`,
          response,
          decideByFollowupSentAt: '2026-10-01T00:00:00.000Z',
          personId: `p-${who}`,
          person: { id: `p-${who}`, name: who },
        }
      : null,
  });
  const raw = [
    rawRow('Roast turkey', 'gus'),
    rawRow('Gravy', null),
    rawRow('Classic pavlova with cream', 'josie', 'DECLINED'),
    rawRow('Trifle', 'josie', 'MAYBE'),
    rawRow('Brownies', 'ross', 'PENDING'),
    rawRow('Ice', 'rewi', 'PENDING'),
  ];
  const P = (name: string, state: string, over: Record<string, unknown> = {}) => ({
    personEventId: `pe-${name.split(' ')[0].toLowerCase()}`,
    personId: `p-${name.split(' ')[0].toLowerCase()}`,
    name,
    state,
    justAttending: false,
    ...over,
  });
  const people = [
    P('Gus Henderson', 'GREEN'),
    P('Aroha Henderson', 'AMBER', { justAttending: true }),
    P('Josie Walker', 'AMBER'),
    P('Ross Walker', 'AMBER'),
    P('Rewi Tane', 'OUT'),
    P('Hamish Lowe', 'AMBER'),
  ];
  const items = ok(() => Array.isArray(ES?.narrowItems(raw))) ? ES.narrowItems(raw) : [];
  const hits = (q: string, opts?: unknown): any[] => {
    try {
      return ES.findInEvent(people, items, q, opts);
    } catch {
      return [];
    }
  };
  assert(
    'P',
    'P1 the search keeps four facts of an item, its id, name, holder and handed-back, and nothing else (Q9)',
    items.length === 6 &&
      items.every((i: any) =>
        same(Object.keys(i).sort(), ['handedBack', 'holderId', 'id', 'name'])
      ) &&
      items.every((i: any, n: number) => i.id === raw[n].id) &&
      !JSON.stringify(items).includes('decideByFollowupSentAt')
  );
  assert(
    'P',
    'P2 every item row carries its item’s id, "Nobody yet" and handed back included; its holder half (target) as before',
    ok(
      () =>
        hits('turkey')[0]?.itemId === 'i-Roast turkey' &&
        hits('turkey')[0]?.target === 'pe-gus' &&
        hits('gravy')[0]?.itemId === 'i-Gravy' &&
        hits('gravy')[0]?.target === null &&
        hits('pav')[0]?.itemId === 'i-Classic pavlova with cream' &&
        hits('pav')[0]?.target === null
    )
  );
  const personHit = (q: string, opts?: unknown) => hits(q, opts).find((h) => h.kind === 'person');
  const partsOf = (h: any): { text: string; itemId?: string }[] =>
    Array.isArray(h?.parts) ? h.parts : [];
  assert(
    'P',
    'P3 a person’s row: each item they hold is a part carrying its id, the separators and "(handed it back)" carry none, the parts join to the answer letter for letter; no parts on Not coming, Just attending, Nothing yet or an invites-only answer (ruling 2)',
    ok(() => {
      const josie = personHit('josie');
      const jp = partsOf(josie);
      const ross = partsOf(personHit('ross'));
      const doors = jp.filter((p) => p.itemId);
      const plain = jp.filter((p) => !p.itemId);
      return (
        josie?.answer === 'Classic pavlova with cream (handed it back), Trifle' &&
        ES.hitLine(josie) === 'Josie Walker: Classic pavlova with cream (handed it back), Trifle' &&
        jp.map((p) => p.text).join('') === josie.answer &&
        same(
          doors.map((p) => [p.text, p.itemId]),
          [
            ['Classic pavlova with cream', 'i-Classic pavlova with cream'],
            ['Trifle', 'i-Trifle'],
          ]
        ) &&
        plain.length > 0 &&
        plain.every((p) => !/pavlova|Trifle/.test(p.text)) &&
        same(
          ross.map((p) => [p.text, p.itemId]),
          [['Brownies', 'i-Brownies']]
        ) &&
        personHit('rewi')?.answer === 'Not coming' &&
        partsOf(personHit('rewi')).length === 0 &&
        personHit('aroha')?.answer === 'Just attending' &&
        partsOf(personHit('aroha')).length === 0 &&
        personHit('hamish')?.answer === 'Nothing yet' &&
        partsOf(personHit('hamish')).length === 0 &&
        partsOf(personHit('josie', { invitesOnly: true })).length === 0
      );
    })
  );
  assert(
    'P',
    'P4 the item door’s address: ITEM_PARAM is "item", itemDoorHref("e1", "i 1") is "/plan/e1/setup?item=i%201"',
    ok(
      () => HH.ITEM_PARAM === 'item' && HH.itemDoorHref('e1', 'i 1') === '/plan/e1/setup?item=i%201'
    )
  );

  // ── R — what renders ───────────────────────────────────────────────────────
  const step = (props: Record<string, unknown>) =>
    PS?.default
      ? render(
          createElement(
            PS.default,
            {
              n: 2,
              title: 'Dietary needs',
              blurb: 'BLURB-X',
              checked: false,
              onCheck: () => {},
              ...props,
            },
            createElement('p', null, 'INSIDE-X')
          )
        )
      : '';
  const buttons = (h: string) => [...h.matchAll(/<button([^>]*)>([\s\S]*?)<\/button>/g)];
  const toggle = (h: string) => buttons(h).find((m) => /aria-expanded=/.test(m[1]));
  const cueTag = (h: string) => h.match(/<span([^>]*\bdata-fold-cue="[^"]*"[^>]*)>/)?.[1] ?? '';
  const headerClass = (h: string) => h.match(/<header[^>]*class="([^"]*)"/)?.[1] ?? '';
  const closed = step({ open: false, onToggle: () => {} });
  const open = step({ open: true, onToggle: () => {} });
  const closedSettledWord = step({ open: false, onToggle: () => {}, checkLabel: 'Settled' });
  const settled = step({ settled: true, open: false, onToggle: () => {} });
  const ready = step({ n: 5, title: 'Ready', blurb: 'The last look is done.' });
  assert(
    'R',
    'R1 a closed step: "Show" beside the drawn chevron, unturned, inside the toggle, both hidden from screen readers (W1, rulings 3 and 5)',
    ok(() => {
      const t = toggle(closed);
      return (
        !!t &&
        /aria-hidden="true"/.test(cueTag(t[2])) &&
        new RegExp(`>${SHOW}<`).test(t[2]) &&
        !new RegExp(`>${HIDE}<`).test(t[2]) &&
        /<svg\b/.test(t[2]) &&
        !t[2].includes('rotate-180') &&
        !t[2].includes('▾')
      );
    })
  );
  assert(
    'R',
    'R2 an open step: "Hide" and the chevron turned (W2, ruling 3)',
    ok(() => {
      const t = toggle(open);
      return (
        !!t &&
        /aria-hidden="true"/.test(cueTag(t[2])) &&
        new RegExp(`>${HIDE}<`).test(t[2]) &&
        !new RegExp(`>${SHOW}<`).test(t[2]) &&
        /<svg[^>]*rotate-180/.test(t[2])
      );
    })
  );
  assert(
    'R',
    'R3 the shade is the whole title row: the header, holding the toggle and the tick box, for a pointer that can hover only, closed and open, whatever the tick’s word; the open contents never shade (ruling 1)',
    ok(() => {
      const hc = headerClass(closed);
      const header = closed.match(/<header[\s\S]*?<\/header>/)?.[0] ?? '';
      return (
        SHADE.test(hc) &&
        !PLAIN_HOVER_BG.test(hc) &&
        /<label[^>]*>[\s\S]*?<input[^>]*type="checkbox"/.test(header) &&
        /aria-expanded=/.test(header) &&
        SHADE.test(headerClass(open)) &&
        SHADE.test(headerClass(closedSettledWord)) &&
        open.indexOf('id="step-2-body"') > open.indexOf('</header>') &&
        !/hover:bg-/.test(open.slice(open.indexOf('id="step-2-body"')))
      );
    })
  );
  assert(
    'R',
    'R4 the keyboard mark: a sage ring inside the toggle on keyboard focus (Q4, kept by ruling 1)',
    ok(() => {
      const t = toggle(closed);
      const cls = t?.[1].match(/class="([^"]*)"/)?.[1] ?? '';
      return (
        /(^|\s)focus-visible:ring-2(\s|$)/.test(cls) &&
        /(^|\s)focus-visible:ring-inset(\s|$)/.test(cls) &&
        /(^|\s)focus-visible:ring-accent/.test(cls)
      );
    })
  );
  assert(
    'R',
    'R5 CONTROL: a settled step and Ready have no cue, no chevron and no shade (ruling 1: a step that does not fold does not shade)',
    settled.length > 0 &&
      ready.length > 0 &&
      [settled, ready].every(
        (h) =>
          !/data-fold-cue/.test(h) &&
          !/>(Show|Hide)</.test(h) &&
          !/<svg\b/.test(h) &&
          !/hover:bg-/.test(h)
      )
  );
  const shell = (p: Record<string, unknown>) =>
    AS?.default
      ? render(
          createElement(
            AS.default,
            { id: 'hh', label: 'Gus Henderson’s household', onToggle: () => {}, ...p },
            createElement('p', null, 'CHILD')
          )
        )
      : '';
  assert(
    'R',
    'R6 a household row (AccordionShell with showHide): "Show" / "Hide" and the chevron on its button, the shade for a pointer that can hover and the sage ring; without showHide, none of it (Q6)',
    ok(() => {
      const c = buttons(shell({ open: false, showHide: true }))[0];
      const o = buttons(shell({ open: true, showHide: true }))[0];
      const plain = shell({ open: false });
      const cls = c?.[1].match(/class="([^"]*)"/)?.[1] ?? '';
      return (
        !!c &&
        !!o &&
        /aria-hidden="true"/.test(cueTag(c[2])) &&
        new RegExp(`>${SHOW}<`).test(c[2]) &&
        /<svg\b/.test(c[2]) &&
        !c[2].includes('rotate-180') &&
        new RegExp(`>${HIDE}<`).test(o[2]) &&
        /<svg[^>]*rotate-180/.test(o[2]) &&
        SHADE.test(cls) &&
        /(^|\s)focus-visible:ring-2(\s|$)/.test(cls) &&
        plain.length > 0 &&
        !/data-fold-cue/.test(plain)
      );
    })
  );
  // Imported statically, as batch9 does: a dynamic import() gave Moment 3 a second copy of the
  // toast context, so the provider did not reach it (the first RED run, R7).
  const m3 = (sentAt: string | null) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment3AssignView as any, {
          eventId: 'e1',
          event: { id: 'e1', status: 'DRAFT', sentAt },
          hostPersonId: 'p-kate',
          headcount: 4,
          categories: [
            {
              id: 'c1',
              name: 'Mains',
              emoji: '🍖',
              items: [{ id: 'i1', name: 'Ham', kind: 'ITEM', detail: '' }],
            },
          ],
          initialHolders: {},
          households: [],
          askForReason: async () => ({ proceed: true }),
          askForBatchReason: async () => ({ proceed: true }),
          onBack: () => {},
          onMoveOn: () => {},
        })
      )
    );
  const bar = (h: string) => {
    const at = h.indexOf('<div class="fixed bottom-0');
    return at < 0 ? '' : h.slice(at);
  };
  const before = m3(null);
  assert(
    'R',
    'R7 CONTROL: before the press, Moment 3’s bar renders byte for byte as it did (Q11)',
    before.length > 0 && bar(before).startsWith(M3_BAR_AT_HEAD),
    `render ${before.length} chars, bar ${bar(before).length > 0 ? 'found' : 'not found'}`
  );
  const afterHtml = m3('2026-10-01T00:00:00.000Z');
  const after = bar(afterHtml);
  assert(
    'R',
    'R8 after the press: "← Back to the board" (W3), a plain link to /plan/e1/glance, after "← Back to the plan" and before "All sorted →" (Q11)',
    ok(() => {
      const link = after.match(/<a\b[^>]*href="\/plan\/e1\/glance"[^>]*>← Back to the board<\/a>/);
      const plan = after.indexOf(`>${BACK_TO_PLAN}<`);
      const board = link ? after.indexOf(link[0]) : -1;
      const sorted = after.indexOf('data-m3="all-sorted"');
      return !!link && plan > 0 && board > plan && sorted > board;
    }),
    `render ${afterHtml.length} chars, bar ${after.length > 0 ? 'found' : 'not found'}`
  );
  const slotTag = (h: string) => h.match(/<div([^>]*\bdata-tick-slot="[^"]*"[^>]*)>/)?.[1] ?? '';
  assert(
    'R',
    'R9 on a step that folds, the tick box sits in one fixed-width slot, the same whatever its word, so every cue ends level (the addition); Ready and the settled steps have none',
    ok(
      () =>
        slotTag(closed).length > 0 &&
        slotTag(closed) === slotTag(closedSettledWord) &&
        /data-tick-slot="[^"]*"[^>]*>\s*<label/.test(closed) &&
        /data-tick-slot="[^"]*"[^>]*>\s*<label[\s\S]*?Settled/.test(closedSettledWord) &&
        !/data-tick-slot/.test(settled) &&
        !/data-tick-slot/.test(ready)
    )
  );

  // ── S — the sources ────────────────────────────────────────────────────────
  const page = codeOnly(read('src/app/plan/[eventId]/pre-flight/page.tsx'));
  assert(
    'S',
    'S1 step 1 no longer shows the sweep’s fold or reads coverage.warnings; its three numbers, "Everything has an owner." and "Refresh this list" stay (item 46)',
    page.length > 0 &&
      !/<details\b/.test(page) &&
      !/coverage\.warnings/.test(page) &&
      !/sweep/i.test(page) &&
      !/\bwarnings\s*:/.test(page) &&
      /coverage\.unassignedCount/.test(page) &&
      /coverage\.criticalUnassignedCount/.test(page) &&
      /coverage\.complianceRate/.test(page) &&
      page.includes('Everything has an owner.') &&
      page.includes('Refresh this list')
  );
  const untouched = spawnSync(
    'git',
    [
      'diff',
      '--quiet',
      'HEAD',
      '--',
      'src/app/api/events/[id]/pre-flight/route.ts',
      'src/lib/workflow.ts',
    ],
    { cwd: ROOT }
  );
  assert(
    'S',
    'S2 CONTROL: the pre-flight route and checkSendReadiness are as they were (Q1)',
    untouched.status === 0 && read('src/lib/workflow.ts').includes('checkSendReadiness')
  );
  const setup = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  assert(
    'S',
    'S3 the setup page reads the item once, in the arrival block, and puts the address back; ?at= as it was; still no useSearchParams (Q10)',
    count(setup, /\.get\(ITEM_PARAM\)/g) === 1 &&
      /import\s*\{[^}]*\bITEM_PARAM\b[^}]*\}\s*from\s*'@\/lib\/events\/home-href'/.test(setup) &&
      setup.indexOf('.get(ITEM_PARAM)') < setup.indexOf('applyStage(stage)') &&
      /requestedStage\(at,/.test(setup) &&
      count(
        setup,
        /window\.history\.replaceState\(window\.history\.state, '', window\.location\.pathname\)/g
      ) === 1 &&
      !/useSearchParams/.test(setup)
  );
  const view = codeOnly(read('src/components/plan/Moment3AssignView.tsx'));
  const arrivalAt = view.indexOf('function bringItemIntoView');
  const arrival = arrivalAt < 0 ? '' : view.slice(arrivalAt, view.indexOf('\n}\n', arrivalAt));
  assert(
    'S',
    'S4 Moment 3: the item’s row carries data-m3-item; the arrival brings it to the middle and outlines it on a timer, picking, saving and asking nothing (Q10)',
    view.includes('data-m3-item={item.id}') &&
      arrival.length > 0 &&
      arrival.includes('[data-m3-item=') &&
      arrival.includes('CSS.escape(') &&
      arrival.includes('scrollIntoView(') &&
      arrival.includes("block: 'center'") &&
      arrival.includes('.style.outline') &&
      arrival.includes('setTimeout(') &&
      !/setSelection\(|fetch\(|\bchange\(|\bsave\(/.test(arrival)
  );
  const island = codeOnly(read('src/components/glance/EventSearch.tsx'));
  assert(
    'S',
    'S5 the island: still one request, a GET of …/items; its one <a> is the item door, used for item rows and the items in a person’s row; a name with a panel is focused and pressed (Q7, Q9, ruling 2)',
    count(island, /\bfetch\(/g) === 1 &&
      /fetch\(`\/api\/events\/\$\{eventId\}\/items`\)/.test(island) &&
      !/\bmethod\s*:/.test(island) &&
      count(island, /<a\b/g) === 1 &&
      /<a\b[\s\S]{0,300}?href=\{itemDoorHref\(/.test(island) &&
      /import\s*\{[^}]*\bitemDoorHref\b[^}]*\}\s*from\s*'@\/lib\/events\/home-href'/.test(island) &&
      /hit\.parts/.test(island) &&
      /\.focus\(/.test(island) &&
      /\.click\(\)/.test(island) &&
      !/\b(sender|destination)\b/.test(island)
  );
}

// ══ LIVE — the dev server, in the walled-off headless Chrome ═══════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

/** A second DevTools socket on the same page: the pointer rests on a row; touch emulation at 390. */
async function secondSocket() {
  const list = (await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const pageT = list.find((t) => t.type === 'page');
  if (!pageT) throw new Error('no page target');
  const ws = new (globalThis as any).WebSocket(pageT.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pend = new Map<number, (m: any) => void>();
  ws.addEventListener('message', (e: { data: string }) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) {
      pend.get(m.id)!(m);
      pend.delete(m.id);
    }
  });
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pend.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return {
    async rest(x: number, y: number) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await sleep(250);
    },
    async touch(enabled: boolean) {
      await send(
        'Emulation.setTouchEmulationEnabled',
        enabled ? { enabled, maxTouchPoints: 5 } : { enabled }
      );
      await sleep(200);
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  // ── the fixture: Kate's two events, example.com addresses, no phones, nothing queued ──
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc380-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const start = new Date(Date.now() + 30 * 864e5);
  const pe: Record<string, string> = {};
  const pid: Record<string, string> = {};
  let n = 0;
  const mkEvent = async (name: string, extra: Record<string, unknown>) => {
    const ev = await prisma.event.create({
      data: { name, startDate: start, endDate: start, hostId: kate.id, ...extra } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: { eventId: ev.id, eventType: 'Christmas', planApprovedAt: new Date() } as any,
    });
    return ev.id;
  };
  const addHousehold = async (
    eventId: string,
    members: [string, string, Record<string, unknown>?][],
    sent: Date | null,
    host = false
  ) => {
    const h = await prisma.household.create({ data: { eventId } });
    for (const [i, [nm, role, extra]] of members.entries()) {
      let personId = kate.id;
      if (!(host && i === 0)) {
        const p = await prisma.person.create({
          data: {
            name: nm,
            email: role === 'CHILD' ? null : mail(`${nm.toLowerCase().replace(/\W/g, '')}-${n++}`),
          },
        });
        created.people.push(p.id);
        personId = p.id;
      }
      const row = await prisma.personEvent.create({
        data: {
          personId,
          eventId,
          role: host && i === 0 ? 'HOST' : 'PARTICIPANT',
          householdId: h.id,
          householdRole: role,
          ...(sent ? { sentAt: sent } : {}),
          ...(extra ?? {}),
        } as any,
      });
      pe[`${eventId}:${nm}`] = row.id;
      pid[`${eventId}:${nm}`] = personId;
    }
  };
  const people = async (eventId: string, sent: Date | null) => {
    await addHousehold(eventId, [['Kate Lowe', 'PRIMARY_CONTACT']], sent, true);
    await addHousehold(
      eventId,
      [
        ['Gus Henderson', 'PRIMARY_CONTACT'],
        ['Aroha Henderson', 'PARTNER', { justAttending: true }],
        ['Mia Henderson', 'CHILD'],
      ],
      sent
    );
    await addHousehold(
      eventId,
      [
        ['Josie Walker', 'PRIMARY_CONTACT'],
        ['Ross Walker', 'PARTNER'],
      ],
      sent
    );
    await addHousehold(eventId, [['Ted Parata', 'PRIMARY_CONTACT']], sent);
    await addHousehold(
      eventId,
      [['Rewi Tane', 'PRIMARY_CONTACT', sent ? { attendanceAnswer: 'NO' } : {}]],
      sent
    );
  };
  const itemIds: Record<string, string> = {};
  const plan = async (
    eventId: string,
    rows: [string, 'Mains' | 'Dessert', string | null, string | null, boolean][]
  ) => {
    const teams: Record<string, string> = {};
    for (const [i, t] of ['Mains', 'Dessert'].entries()) {
      teams[t] = (
        await prisma.team.create({
          data: {
            name: t,
            eventId,
            displayOrder: i,
            source: 'GENERATED',
            coordinatorId: kate.id,
          } as any,
        })
      ).id;
    }
    for (const [i, [name, team, who, response, critical]] of rows.entries()) {
      const item = await prisma.item.create({
        data: {
          name,
          teamId: teams[team],
          source: 'GENERATED',
          aiGenerated: true,
          critical,
          kind: 'ITEM',
          status: who ? 'ASSIGNED' : 'UNASSIGNED',
          displayOrder: i,
        } as any,
      });
      itemIds[`${eventId}:${name}`] = item.id;
      if (who) {
        await prisma.assignment.create({
          data: {
            itemId: item.id,
            personId: pid[`${eventId}:${who}`],
            response: (response ?? 'PENDING') as any,
          },
        });
      }
    }
  };
  // Held, not sent: the pre-flight (a critical item loose) and Moment 3 before the press.
  const evP = await mkEvent('GTC-380 b11 — held', { status: 'CONFIRMING' });
  await people(evP, null);
  await plan(evP, [
    ['Glazed ham', 'Mains', 'Kate Lowe', null, true],
    ['Roast turkey', 'Mains', null, null, true],
    ['Gravy', 'Mains', 'Josie Walker', null, true],
    ['Bread rolls', 'Mains', null, null, false],
    ['Classic pavlova', 'Dessert', 'Ted Parata', null, false],
    ['Trifle', 'Dessert', 'Josie Walker', null, false],
  ]);
  // Sent: the board and Moment 3 after the press (sentAt written directly; nothing queued).
  const sentAt = new Date(Date.now() - 2 * 864e5);
  const evS = await mkEvent('GTC-380 b11 — sent', { status: 'CONFIRMING', sentAt });
  await people(evS, sentAt);
  await plan(evS, [
    ['Glazed ham', 'Mains', 'Kate Lowe', 'ACCEPTED', true],
    ['Roast turkey', 'Mains', 'Gus Henderson', 'ACCEPTED', false],
    ['Gravy', 'Mains', 'Josie Walker', 'PENDING', true],
    ['Bread rolls', 'Mains', null, null, false],
    ['Classic NZ pavlova centrepiece', 'Dessert', 'Ted Parata', 'PENDING', false],
    ['Trifle', 'Dessert', 'Josie Walker', 'MAYBE', false],
    ['Brownies', 'Dessert', 'Ross Walker', 'PENDING', false],
  ]);

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: { eventId: { in: created.events } } }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  const refusals: string[] = [];
  let probes = { plan: '', send: '' };
  let hosts: string[] = [];
  let blocked: string[] = [];
  let dialogs: string[] = [];
  let nonGet: string[] = ['(never read)'];
  let chrome: Headless | null = null;
  let second: Awaited<ReturnType<typeof secondSocket>> | null = null;
  try {
    if (!up) throw new Error('no dev server');
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    // Every request the page makes, by method, kept across navigations in this tab.
    await c.addInitScript(`(() => { const f = window.fetch.bind(window);
      window.fetch = (input, init) => { const m = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if (m !== 'GET' && m !== 'HEAD') { try { const k = '__gtc380_nonget'; const l = JSON.parse(sessionStorage.getItem(k) || '[]');
          l.push(m + ' ' + (typeof input === 'string' ? input : (input && input.url) || '')); sessionStorage.setItem(k, JSON.stringify(l)); } catch {} }
        return f(input, init); }; })();`);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc380-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc380-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    // The probes are the only non-GET requests the page is meant to make: start the record after.
    await c.evaluate(`sessionStorage.removeItem('__gtc380_nonget')`);
    await c.setSessionCookie(token);
    second = await secondSocket();
    const s2 = second;
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs = 700) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    /** Rest the pointer on the middle of what `js` finds (no press); false when it is not there. */
    const restOn = async (js: string) => {
      const at = await ev<{ x: number; y: number } | null>(
        `(() => { const el = ${js}; if (!el) return null; el.scrollIntoView({ block: 'center' }); const b = el.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`
      );
      if (!at) return false;
      await s2.rest(at.x, at.y);
      return true;
    };
    const restAway = () => s2.rest(2, 2);
    const bg = (js: string) =>
      ev<string>(
        `(() => { const el = ${js}; return el ? getComputedStyle(el).backgroundColor : 'none'; })()`
      );
    const CLEAR = 'rgba(0, 0, 0, 0)';
    const typeInto = async (q: string) => {
      const IN = '[data-event-search] input';
      const there = await ev<boolean>(
        `(() => { const i = document.querySelector(${JSON.stringify(IN)}); if (!i) return false;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '');
          i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
      );
      if (!there) return false;
      if ((await tap(`document.querySelector(${JSON.stringify(IN)})`, 200)) !== null) return false;
      await c.insertText(q);
      await sleep(500);
      return true;
    };
    const openSearch = async (q: string) => {
      const t = await tap(`document.querySelector('[data-event-search-button]')`, 1500);
      return t === null && (await typeInto(q));
    };
    const results = () =>
      ev<string[]>(
        `[...document.querySelectorAll('[data-event-search] [data-event-hit]')].map(li => li.innerText.trim())`
      );
    const dialogShowing = () =>
      ev<boolean>(
        `[...document.querySelectorAll('[role="dialog"]')].some(d => d.checkVisibility())`
      );
    /** After a tap on an item door: Moment 3 at that item — the row centred, outlined, then not. */
    const arrival = async (itemId: string) => {
      let seen = false;
      for (let i = 0; i < 60 && !seen; i++) {
        await sleep(200);
        seen =
          (await ev<boolean>(
            `(() => { const li = document.querySelector('[data-m3-item="${itemId}"]'); return !!li && li.style.outline !== ''; })()`
          )) === true;
      }
      await sleep(700);
      const mid =
        await ev<any>(`(() => { const li = document.querySelector('[data-m3-item="${itemId}"]'); if (!li) return null;
        const b = li.getBoundingClientRect(); const cy = b.top + b.height / 2; const h = window.innerHeight;
        return { path: location.pathname, search: location.search, centred: cy > h * 0.2 && cy < h * 0.8, outlined: li.style.outline !== '',
          picked: !!document.querySelector('[data-m3-row][aria-pressed="true"]') }; })()`);
      await sleep(2000);
      const gone = await ev<boolean>(
        `document.querySelector('[data-m3-item="${itemId}"]')?.style.outline === ''`
      );
      return { seen, mid, gone };
    };

    for (const [w, h, mobile] of [
      [1280, 900, false],
      [390, 844, true],
    ] as [number, number, boolean][]) {
      const k = w === 1280 ? '' : 'p';
      await c.setViewport(w, h, mobile);
      await s2.touch(mobile);

      // C2 — steps 1 to 4 read "Show"; one opened reads "Hide"; the cue beside the text on a
      // desktop, under it on a phone (ruling 4).
      await c.navigate(`/plan/${evP}/pre-flight`, 7000);
      const cues =
        await ev<any>(`[1, 2, 3, 4].map(n => { const b = document.querySelector('#step-' + n + ' header button[aria-expanded]');
        const q = b && b.querySelector('[data-fold-cue]'); if (!b || !q) return null; const t = b.firstElementChild.getBoundingClientRect(); const c = q.getBoundingClientRect();
        return { word: q.textContent.trim(), beside: c.left >= t.right - 1, under: c.top >= t.bottom - 1 }; })`);
      const tap2 = await tap(`document.querySelector('#step-2 header button[aria-expanded]')`);
      await sleep(300);
      const word2 = await ev<string>(
        `document.querySelector('#step-2 header [data-fold-cue]')?.textContent.trim() ?? ''`
      );
      r[`C2${k}`] =
        Array.isArray(cues) &&
        cues.every((q: any) => q && q.word === SHOW && (mobile ? q.under : q.beside)) &&
        tap2 === null &&
        word2 === HIDE;
      detail[`C2${k}`] = JSON.stringify({ cues, tap2, word2 });

      // C5 — the four cues end the same distance from the box's right edge, within 1px.
      await c.navigate(`/plan/${evP}/pre-flight`, 7000);
      const gaps = await ev<
        number[] | null
      >(`(() => { const g = [1, 2, 3, 4].map(n => { const s = document.getElementById('step-' + n);
        const q = s && s.querySelector('header [data-fold-cue]'); return q ? s.getBoundingClientRect().right - q.getBoundingClientRect().right : null; });
        return g.every(x => x !== null) ? g : null; })()`);
      r[`C5${k}`] = !!gaps && Math.max(...gaps) - Math.min(...gaps) <= 1;
      detail[`C5${k}`] = JSON.stringify(gaps);

      // C3 — the shade (ruling 1).
      if (!mobile) {
        const H2 = `document.querySelector('#step-2 header')`;
        const base = await bg(H2);
        const onTitle = (await restOn(`document.querySelector('#step-2 header h2')`))
          ? await bg(H2)
          : 'none';
        const onTick = (await restOn(`document.querySelector('#step-2 header label')`))
          ? await bg(H2)
          : 'none';
        await restAway();
        const tapOpen = await tap(`document.querySelector('#step-2 header button[aria-expanded]')`);
        await sleep(400);
        const onBody = (await restOn(`document.querySelector('#step-2-body')`))
          ? { header: await bg(H2), body: await bg(`document.querySelector('#step-2-body')`) }
          : null;
        const onReady = (await restOn(`document.querySelector('#step-5 header')`))
          ? await bg(`document.querySelector('#step-5 header')`)
          : 'none';
        await restAway();
        r.C3 =
          base === CLEAR &&
          onTitle !== CLEAR &&
          onTitle !== 'none' &&
          onTick === onTitle &&
          tapOpen === null &&
          !!onBody &&
          onBody.header === CLEAR &&
          onBody.body === CLEAR &&
          onReady === CLEAR;
        detail.C3 = JSON.stringify({ base, onTitle, onTick, tapOpen, onBody, onReady });
      } else {
        const noHover = await ev<boolean>(`matchMedia('(hover: none)').matches`);
        const tapP = await tap(`document.querySelector('#step-2 header button[aria-expanded]')`);
        await sleep(400);
        const afterTap = await bg(`document.querySelector('#step-2 header')`);
        const cue = await ev<string>(
          `document.querySelector('#step-2 header [data-fold-cue]')?.textContent.trim() ?? ''`
        );
        r.C3p = noHover && tapP === null && afterTap === CLEAR && cue === HIDE;
        detail.C3p = JSON.stringify({ noHover, tapP, afterTap, cue });
      }

      // C4 — step 3's household rows: "Show" / "Hide"; at 1280 the pointer shades the row.
      await c.navigate(`/plan/${evP}/pre-flight`, 7000);
      const tap3 = await tap(`document.querySelector('#step-3 header button[aria-expanded]')`);
      await sleep(400);
      const rowWords = await ev<string[]>(
        `[...document.querySelectorAll('#step-3 [data-accordion] > button')].map(b => b.querySelector('[data-fold-cue]')?.textContent.trim() ?? '')`
      );
      const GUS_ROW = `[...document.querySelectorAll('#step-3 [data-accordion] > button')].find(b => b.textContent.startsWith('Gus Henderson’s household'))`;
      const tapGus = await tap(GUS_ROW);
      await sleep(400);
      const gusWord = await ev<string>(
        `(${GUS_ROW})?.querySelector('[data-fold-cue]')?.textContent.trim() ?? ''`
      );
      let rowShade = true;
      if (!mobile) {
        const KATE_ROW = `[...document.querySelectorAll('#step-3 [data-accordion] > button')].find(b => b.textContent.startsWith('Kate Lowe’s household'))`;
        const rest = await bg(KATE_ROW);
        rowShade = (await restOn(KATE_ROW)) && (await bg(KATE_ROW)) !== rest;
        await restAway();
      }
      r[`C4${k}`] =
        tap3 === null &&
        rowWords.length === 5 &&
        rowWords.every((x) => x === SHOW) &&
        tapGus === null &&
        gusWord === HIDE &&
        rowShade;
      detail[`C4${k}`] = JSON.stringify({ tap3, rowWords, tapGus, gusWord, rowShade });

      // C1 — step 1 open on the held event (a critical item loose): the numbers and the list, and no
      // sweep's fold. [[GTC-396]] item 5 (founder, 21 Oct 2026): on this fixture every assignment is
      // PENDING, so nothing is confirmed and "confirmed so far" is not drawn; the other two numbers
      // stay.
      await c.navigate(`/plan/${evP}/pre-flight`, 7000);
      const tap1 = await tap(`document.querySelector('#step-1 header button[aria-expanded]')`);
      await sleep(400);
      const s1 =
        await ev<any>(`(() => { const b = document.getElementById('step-1-body'); const s = document.getElementById('step-1');
        return { text: b ? b.innerText : '', all: s ? s.textContent : '', details: s ? s.querySelectorAll('details').length : -1 }; })()`);
      r[`C1${k}`] =
        tap1 === null &&
        /unassigned/.test(s1.text) &&
        /critical and unassigned/.test(s1.text) &&
        !/confirmed so far/.test(s1.text) &&
        /Roast turkey/.test(s1.text) &&
        /Bread rolls/.test(s1.text) &&
        !s1.all.includes(SWEEP) &&
        s1.details === 0;
      detail[`C1${k}`] = JSON.stringify({
        tap1,
        details: s1.details,
        sweep: s1.all.includes(SWEEP),
      });

      if (mobile) {
        // C12 — CONTROL: steps 1 to 4 and a household row open, nothing scrolls sideways.
        for (const n of [2, 3, 4]) {
          await tap(`document.querySelector('#step-${n} header button[aria-expanded="false"]')`);
          await sleep(300);
        }
        await tap(GUS_ROW);
        await sleep(400);
        const sw = await ev<number>(`document.documentElement.scrollWidth`);
        r.C12 = sw <= 390;
        detail.C12 = `scrollWidth ${sw}`;
      }

      // ── the board ──
      const ross = pe[`${evS}:Ross Walker`];
      const rewi = pe[`${evS}:Rewi Tane`];
      const brownies = itemIds[`${evS}:Brownies`];

      // C6 — a person's name with a panel (Ross, amber): his panel, as his row opens it.
      await c.navigate(`/plan/${evS}/glance`, 8000);
      const typed6 = await openSearch('ro');
      const res6 = typed6 ? await results() : [];
      const tap6 = typed6
        ? await tap(
            `[...document.querySelectorAll('[data-event-search] [data-event-hit] > button[data-search-target="${ross}"]')].find(b => b.innerText.trim() === 'Ross Walker')`,
            1000
          )
        : 'absent';
      const o6 =
        await ev<any>(`(() => { const s = document.querySelector('[data-person-event-id="${ross}"]'); const p = document.querySelector('[data-reading-panel="Ross Walker"]');
        return { panel: !!p && p.checkVisibility(), focused: !!s && document.activeElement === s }; })()`);
      const kept6 =
        (await ev<string>(`document.querySelector('[data-event-search] input')?.value ?? ''`)) ===
          'ro' &&
        res6.length > 0 &&
        same(await results(), res6);
      const close6 = o6.panel
        ? await tap(
            `document.querySelector('[data-reading-panel="Ross Walker"] button[aria-label="Close"]')`,
            600
          )
        : 'absent';
      const after6 = !(await dialogShowing()) && same(await results(), res6);
      r[`C6${k}`] = tap6 === null && o6.panel && o6.focused && kept6 && close6 === null && after6;
      detail[`C6${k}`] = JSON.stringify({ tap6, o6, kept6, close6, after6, res6 });

      // C7 — "Brownies" inside "Ross Walker: Brownies" is a door to that item; the line is as it was.
      const row7 = `[...document.querySelectorAll('[data-event-search] [data-event-hit]')].find(li => li.innerText.trim().startsWith('Ross Walker:'))`;
      const door7 =
        await ev<any>(`(() => { const li = ${row7}; const a = li && li.querySelector('a');
        return li ? { line: li.innerText.trim(), word: a ? a.textContent : null, href: a ? a.getAttribute('href') : null } : null; })()`);
      const tap7 =
        door7?.word === 'Brownies' ? await tap(`(${row7}).querySelector('a')`, 400) : 'absent';
      const land7 = tap7 === null ? await arrival(brownies) : null;
      r[`C7${k}`] =
        door7?.line === 'Ross Walker: Brownies' &&
        door7?.href === `/plan/${evS}/setup?item=${brownies}` &&
        tap7 === null &&
        !!land7?.seen &&
        land7?.mid?.path === `/plan/${evS}/setup` &&
        land7?.mid?.search === '' &&
        land7?.mid?.centred === true &&
        land7?.mid?.picked === false;
      detail[`C7${k}`] = JSON.stringify({ door7, tap7, land7 });

      // C8 — [[GTC-387]] Q11: Rewi (not coming) is no longer sealed. His strip is a reading door,
      // so the search's tap opens his reading room as it opens any strip's panel.
      await c.navigate(`/plan/${evS}/glance`, 8000);
      const typed8 = await openSearch('rewi');
      const tap8 = typed8
        ? await tap(
            `document.querySelector('[data-event-search] [data-search-target="${rewi}"]')`,
            1000
          )
        : 'absent';
      const open8 =
        await ev<boolean>(`(() => { const s = document.querySelector('[data-person-event-id="${rewi}"]'); if (!s) return false;
        const b = s.getBoundingClientRect(); const cy = b.top + b.height / 2; const h = window.innerHeight;
        return s.tagName === 'BUTTON' && s.hasAttribute('data-strip-reading') && cy > h * 0.2 && cy < h * 0.8; })()`);
      const panel8 = await dialogShowing();
      r[`C8${k}`] = tap8 === null && open8 && panel8;
      detail[`C8${k}`] = JSON.stringify({ typed8, tap8, open8, panel8 });

      // C9 — an item row's name: "Bread rolls" (nobody yet) at 1280, "Roast turkey" (held) at 390.
      const [q9, name9] = mobile ? ['turkey', 'Roast turkey'] : ['bread', 'Bread rolls'];
      const item9 = itemIds[`${evS}:${name9}`];
      await c.navigate(`/plan/${evS}/glance`, 8000);
      const typed9 = await openSearch(q9);
      const row9 = `[...document.querySelectorAll('[data-event-search] [data-event-hit]')].find(li => li.innerText.trim().startsWith(${JSON.stringify(name9 + ':')}))`;
      const door9 =
        await ev<any>(`(() => { const li = ${row9}; const a = li && li.querySelector('a');
        return li ? { line: li.innerText.trim(), word: a ? a.textContent : null, href: a ? a.getAttribute('href') : null } : null; })()`);
      const tap9 =
        typed9 && door9?.word === name9 ? await tap(`(${row9}).querySelector('a')`, 400) : 'absent';
      const land9 = tap9 === null ? await arrival(item9) : null;
      r[`C9${k}`] =
        door9?.href === `/plan/${evS}/setup?item=${item9}` &&
        tap9 === null &&
        !!land9?.seen &&
        land9?.mid?.path === `/plan/${evS}/setup` &&
        land9?.mid?.search === '' &&
        land9?.mid?.centred === true &&
        land9?.mid?.outlined === true &&
        land9?.mid?.picked === false &&
        land9?.gone === true;
      detail[`C9${k}`] = JSON.stringify({ door9, tap9, land9 });

      // C10 — after the press: "← Back to the board" beside (1280) or under (390) "← Back to the
      // plan", and a tap lands on the board.
      await c.navigate(`/plan/${evS}/setup`, 9000);
      const BAR = `document.querySelector('div.fixed.bottom-0')`;
      const bar10 = await ev<any>(`(() => { const bar = ${BAR}; if (!bar) return null;
        const back = [...bar.querySelectorAll('button')].find(b => b.innerText.trim() === ${JSON.stringify(BACK_TO_PLAN)});
        const a = [...bar.querySelectorAll('a')].find(x => x.innerText.trim() === ${JSON.stringify(BACK_TO_BOARD)});
        if (!back || !a) return { back: !!back, link: !!a, height: bar.getBoundingClientRect().height };
        const p = back.getBoundingClientRect(); const l = a.getBoundingClientRect();
        return { back: true, link: true, href: a.getAttribute('href'), beside: l.left >= p.right - 1 && Math.abs(l.top - p.top) < 4,
          under: l.top >= p.bottom - 1, height: bar.getBoundingClientRect().height }; })()`);
      if (mobile) {
        r.C13 = !!bar10?.link && bar10.height < 96;
        detail.C13 = JSON.stringify(bar10);
      }
      const tap10 = bar10?.link
        ? await tap(
            `[...(${BAR}).querySelectorAll('a')].find(x => x.innerText.trim() === ${JSON.stringify(BACK_TO_BOARD)})`,
            400
          )
        : 'absent';
      await sleep(6000);
      const path10 = await ev<string>(`location.pathname`);
      r[`C10${k}`] =
        !!bar10?.link &&
        bar10.href === `/plan/${evS}/glance` &&
        (mobile ? bar10.under : bar10.beside) &&
        tap10 === null &&
        path10 === `/plan/${evS}/glance`;
      detail[`C10${k}`] = JSON.stringify({ bar10, tap10, path10 });

      // C11 — CONTROL: before the press, "← Back to the plan" and no "← Back to the board".
      await c.navigate(`/plan/${evP}/setup`, 9000);
      const bar11 = await ev<any>(`(() => { const bar = ${BAR}; if (!bar) return null;
        return { back: [...bar.querySelectorAll('button')].some(b => b.innerText.trim() === ${JSON.stringify(BACK_TO_PLAN)}),
          board: document.body.innerText.includes(${JSON.stringify(BACK_TO_BOARD)}) }; })()`);
      r[`C11${k}`] = !!bar11 && bar11.back && !bar11.board;
      detail[`C11${k}`] = JSON.stringify(bar11);
    }
    await s2.touch(false);
    nonGet = await ev<string[]>(`JSON.parse(sessionStorage.getItem('__gtc380_nonget') || '[]')`);
    hosts = c.hostsRequested();
    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } catch (e) {
    console.error('live layer threw:', (e as Error).message);
  } finally {
    second?.close();
    chrome?.close();
  }

  const C_LABELS: Record<string, string> = {
    C1: 'step 1 open, a critical item loose: its two numbers (no "confirmed so far" while nothing is confirmed, GTC-396 item 5) and the list, and no "The sweep’s own wording" (item 46)',
    C2: 'steps 1 to 4 read "Show", one opened reads "Hide"; the cue beside the text on a desktop, under it on a phone (W1, W2, ruling 4)',
    C3: 'the pointer on a step’s title, and on its tick box, shades the whole title row; the open contents and Ready never shade (ruling 1)',
    C3p: 'a touch screen: no hover, and after a tap nothing shades; the cue reads "Hide" (ruling 1)',
    C4: 'step 3’s household rows read "Show", Gus’s opened reads "Hide"; at 1280 the pointer shades a row (W1, W2)',
    C5: 'the four steps’ cues end the same distance from the box’s right edge, within 1px (the addition)',
    C6: 'a person’s name with a panel (Ross): his panel, his strip focused, the search kept; closed, the search as it was (Q7)',
    C7: '"Brownies" in "Ross Walker: Brownies" is a door to that item, the line as it was; a tap lands on Moment 3 at it, centred, nothing picked (ruling 2)',
    C8: 'GTC-387 Q11: Rewi (not coming) is a reading door now: the tap centres his strip and opens his reading room',
    C9: 'an item row’s name (Bread rolls at 1280, Roast turkey at 390): Moment 3 at that item, no query left, centred and outlined, the outline gone after 2.5 s, nothing picked (Q9, Q10)',
    C10: 'after the press: "← Back to the board" beside "← Back to the plan" (under it on a phone), and a tap lands on the board (W3, Q11, ruling 4)',
    C11: 'CONTROL: before the press, "← Back to the plan" and no "← Back to the board" (Q11)',
    C12: 'CONTROL at 390: steps 1 to 4 and a household row open, nothing scrolls sideways',
    C13: 'at 390, after the press, with the new link there: the bar is under 96px tall, clear of the completion panel (C8)',
  };
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'])
    assert('C', `${id} desktop: ${C_LABELS[id]}`, r[id] === true, detail[id]);
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'])
    assert(
      'C',
      `${id}p phone: ${C_LABELS[id === 'C3' ? 'C3p' : id]}`,
      r[`${id}p`] === true,
      detail[`${id}p`]
    );
  assert('C', `C12 ${C_LABELS.C12}`, r.C12 === true, detail.C12);
  assert('C', `C13 ${C_LABELS.C13}`, r.C13 === true, detail.C13);

  // ── K — the controls ───────────────────────────────────────────────────────
  assert(
    'K',
    'K1 CONTROL: both probes failed in the browser (plan-making and sending blocked)',
    probes.plan === 'failed' && probes.send === 'failed',
    JSON.stringify(probes)
  );
  assert(
    'K',
    'K2 CONTROL: no click was refused',
    up && refusals.length === 0,
    refusals.join(' | ')
  );
  assert(
    'K',
    'K3 CONTROL: Chrome asked only localhost:3000, nothing but the two probes was blocked, and the page made no request but GETs',
    hosts.length > 0 &&
      hosts.every((x) => x === 'localhost:3000') &&
      blocked.length === 2 &&
      blocked.every((b) => /gtc380-probe/.test(b)) &&
      nonGet.length === 0,
    `${hosts.join(',')} | blocked ${blocked.join(' | ')} | non-GET ${nonGet.join(' | ')}`
  );
  assert('K', 'K4 CONTROL: no dialog opened', up && dialogs.length === 0, dialogs.join(','));
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  assert(
    'K',
    'K5 CONTROL: while the fixture exists, aiCallsUsed is 0 on both events and nothing is queued or recorded on them',
    ai.length === 2 && ai.every((x) => x === 0) && whileExists.endsWith(',0,0'),
    `ai ${ai}, rows ${whileExists}`
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K6 CONTROL: every fixture row removed by id, and the InviteEvent and OutboundMessage totals as found',
    created.events.length === 2 &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  // Every row below was made by this suite: its two events and what hangs off them, its people,
  // its user and her session.
  const evIds = created.events;
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  const sessionIds = (
    await prisma.session.findMany({
      where: { userId: { in: created.users } },
      select: { id: true },
    })
  ).map((s) => s.id);
  await del(() => prisma.session.deleteMany({ where: { id: { in: sessionIds } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  await runInMemory();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const x of redAssertions) console.log(`  ${x}`);
  }
}

main()
  .catch(async (e) => {
    console.error(e);
    failed++;
    await cleanup();
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
