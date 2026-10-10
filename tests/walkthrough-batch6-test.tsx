/**
 * GTC-373 — walkthrough batch 6: the two searches.
 *
 * The founder walked the Moment flow himself and sorted what he found (GTC-189's Fourth ruling).
 * This suite pins batch 6 to the words he ruled on the plan (GTC-373, PLAN RULINGS 2026-10-08:
 * "Approve all (Recommended)", so W1 to W24 as proposed) and to the behaviour he chose (Q1 to Q24
 * as recommended):
 *
 *   23  a search for Moment 2's menu, in the questions' own flow above "Food": a tap on a dish ticks
 *       it (and its style if needed), opens its section and shows it; nothing new reaches the server
 *   13  a search of the event, on the board behind a closed "Find someone or something": an item
 *       answers who's bringing it, a person what they're bringing, and a tap on a person takes her to
 *       their card. It only finds.
 *
 * Layers M, T, R, E and B run in memory. Layers LM and LB drive the dev server in the walled-off
 * headless Chrome, on fixtures of its own (example.com addresses, no phones; the sent event written
 * directly, with nothing queued), behind the three safeguards of GATHER-BUILD-CONSTANTS.md
 * ("Looking on screen") and the fourth wall: the browser fails every plan-making request and every
 * request to a door that sends before it leaves the page (both proven on probe URLs first); every
 * click is `clickGuarded`; a "leave site?" dialog is the only kind answered, and every dialog is
 * logged. Never pressed: Send, Generate, Regenerate, Move on, New Event, a print dialog. Every
 * fixture row is counted while it exists and removed by id; the InviteEvent and OutboundMessage
 * totals are asserted as found.
 *
 * Every new assertion carries a presence clause (the box exists, the tap happened), so a check of
 * something absent cannot pass before the build. A target that is missing is not a click refusal:
 * `tap` reports it as 'absent' without clicking.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import {
  CONFIG_EVENT_TYPES,
  getCategoryLevels,
  getUpFrontCategories,
  withoutOrphanedChoices,
} from '../src/lib/ai/config-loader';
import GlanceBoard from '../src/components/glance/GlanceBoard';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
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
    return readFileSync(join(process.cwd(), rel), 'utf8');
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
const count = (hay: string, needle: string) => hay.split(needle).length - 1;

// ── The ruled words, verbatim (GTC-373, PLAN RULINGS 2026-10-08) ─────────────
const W1 = 'Find a dish';
const W2 = 'For example, turkey or pavlova';
const W5 = 'Section';
const W6 = 'Dietary requirements';
const W10 = (n: number) => `${n} more. Keep typing to narrow it.`;
const W11 = (q: string) =>
  `Nothing on the menu matches “${q}”. You can add your own in any section’s “Other” box.`;
const W13 = 'Find someone or something';

/** The food sections Moment 2 shows, in its own order (Moment2Step1Modal's list). */
const FOOD = [
  'mains',
  'entree_starters',
  'sides_salads',
  'dessert',
  'cake',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'breakfast_brunch',
];
/** The questions' on-screen order: the sections shown up front, then those behind "Show more". */
const keysFor = (type: string) => {
  const up = new Set(getUpFrontCategories(type));
  return [...FOOD.filter((k) => up.has(k)), ...FOOD.filter((k) => !up.has(k))];
};

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  const MS = await load('../src/lib/moments/menu-search');
  const MSC = await load('../src/components/plan/MenuSearch');
  const ES = await load('../src/lib/search/event-search');

  // ── Layer M — finding on the menu ──────────────────────────────────────────
  const xmas = ok(() => Array.isArray(MS?.buildMenuIndex('Christmas', keysFor('Christmas'))))
    ? MS.buildMenuIndex('Christmas', keysFor('Christmas'))
    : [];
  const find = (q: string): any[] => {
    try {
      return MS.findInMenu(xmas, q) ?? [];
    } catch {
      return [];
    }
  };
  const words = (rows: any[]) => rows.map((r) => r.words);
  const kinds = CONFIG_EVENT_TYPES.filter((t) => t !== 'Other');

  assert(
    'M',
    'M1 the index holds 257 rows for each of the ten kinds (9 sections, 45 styles, 195 dishes, 3 drinks considerations, 5 Dietary choices)',
    ok(
      () =>
        kinds.length === 10 && kinds.every((t) => MS.buildMenuIndex(t, keysFor(t)).length === 257)
    )
  );
  assert(
    'M',
    'M2 nothing from cleanup, furniture, decorations or activities: "hangi" does not find "Hangi equipment", and every row is a food section’s or Dietary’s',
    ok(
      () =>
        xmas.length > 0 &&
        find('hangi').length > 0 &&
        !words(find('hangi')).includes('Hangi equipment') &&
        xmas.every(
          (r: any) => (r.kind === 'dietary' && r.section === null) || FOOD.includes(r.section)
        )
    )
  );
  assert(
    'M',
    'M3 "Other", an unknown kind and no kind give no index (Q2)',
    ok(
      () =>
        xmas.length > 0 &&
        MS.buildMenuIndex('Other', keysFor('Other')).length === 0 &&
        MS.buildMenuIndex('christmas', FOOD).length === 0 &&
        MS.buildMenuIndex(null, FOOD).length === 0
    )
  );
  const HANGI = [
    'Hangi-inspired',
    'Pork and chicken hangi',
    'Full traditional hangi',
    'Modern hangi-style roast',
    'Vegetable hangi',
  ];
  assert(
    'M',
    'M4 accents and case are ignored on both sides: "hāngī" and "HANGI" find the same 5; "canape" finds 2 (Q4, C3)',
    ok(
      () =>
        same(words(find('hāngī')), HANGI) &&
        same(words(find('HANGI')), HANGI) &&
        same(words(find('canape')), ['Finger food canapés', 'Mixed canapés'])
    )
  );
  assert(
    'M',
    'M5 every word typed must appear, in any order: "roast tur" finds Roast turkey only',
    ok(() => same(words(find('roast tur')), ['Roast turkey']))
  );
  assert(
    'M',
    'M6 "roast": 15 found in on-screen order; 8 show, then W10 for the 7 more',
    ok(
      () =>
        find('roast').length === 15 &&
        same(words(find('roast')).slice(0, 6), [
          'Traditional roast',
          'Roast lamb',
          'Roast chicken',
          'Roast beef',
          'Roast pork',
          'Roast turkey',
        ]) &&
        MS.MENU_SHOWN === 8 &&
        MS.MENU_WORDS.more(7) === W10(7)
    )
  );
  assert(
    'M',
    'M7 one letter finds nothing; two letters start the results',
    ok(() => find('r').length === 0 && find('ro').length > 0)
  );
  const row = (w: string, kind?: string) =>
    xmas.find((r: any) => r.words === w && (!kind || r.kind === kind));
  assert(
    'M',
    'M8 the second lines read as W3 to W6: "Mains · Traditional roast", "Mains", "Section", "Dietary requirements", and "Alcoholic Drinks" for a consideration',
    ok(
      () =>
        row('Roast turkey')?.where === 'Mains · Traditional roast' &&
        row('Traditional roast')?.where === 'Mains' &&
        row('Mains', 'section')?.where === W5 &&
        row('Vegan', 'dietary')?.where === W6 &&
        row('Under-18s will be present')?.where === 'Alcoholic Drinks'
    )
  );
  assert(
    'M',
    'M9 "Roast potatoes", under two Christmas sides styles, is one row naming both (C5)',
    ok(
      () =>
        find('roast potatoes').length === 1 &&
        same(find('roast potatoes')[0].styles, [
          'Roast vegetables',
          'Traditional sides (potatoes, kumara)',
        ])
    )
  );

  // ── Layer T — a tap's ticks ────────────────────────────────────────────────
  const mains = getCategoryLevels('Christmas', 'mains') ?? [];
  const sides = getCategoryLevels('Christmas', 'sides_salads') ?? [];
  const drinks = getCategoryLevels('Christmas', 'drinks_alcoholic') ?? [];
  const sel = (...lv: (string[] | undefined)[]) => {
    const out: Record<number, { options: string[]; freeText: string }> = {};
    lv.forEach((o, i) => {
      if (o) out[i] = { options: o, freeText: '' };
    });
    return out;
  };
  const tick = (levels: any, s: any, w: string, kind?: string) => {
    try {
      return MS.tickFromSearch(levels, s, row(w, kind));
    } catch {
      return null;
    }
  };
  const outs: [any, any][] = [];
  const keep = (levels: any, out: any) => {
    outs.push([levels, out]);
    return out;
  };

  const t1 = keep(
    mains,
    tick(
      mains,
      {
        0: { options: ['Seafood spread'], freeText: 'x' },
        ...{ 1: { options: ['Prawns and shrimp'], freeText: '' } },
      },
      'Roast turkey'
    )
  );
  assert(
    'T',
    'T1 a dish whose style is not ticked: both are ticked, and nothing else changes',
    ok(() =>
      same(t1, {
        0: { options: ['Seafood spread', 'Traditional roast'], freeText: 'x' },
        1: { options: ['Prawns and shrimp', 'Roast turkey'], freeText: '' },
      })
    )
  );
  const t2 = keep(mains, tick(mains, sel(['Traditional roast'], ['Glazed ham']), 'Roast turkey'));
  assert(
    'T',
    'T2 a dish whose style is ticked: only the dish is added',
    ok(() => same(t2, sel(['Traditional roast'], ['Glazed ham', 'Roast turkey'])))
  );
  const t3 = keep(sides, tick(sides, {}, 'Roast potatoes'));
  assert(
    'T',
    'T3 Roast potatoes with neither style ticked: the first listed, "Roast vegetables", is ticked (Q5)',
    ok(() => same(t3, sel(['Roast vegetables'], ['Roast potatoes'])))
  );
  const t4 = keep(
    sides,
    tick(sides, sel(['Traditional sides (potatoes, kumara)']), 'Roast potatoes')
  );
  assert(
    'T',
    'T4 Roast potatoes with its second style ticked: only the dish is added (Q5)',
    ok(() => same(t4, sel(['Traditional sides (potatoes, kumara)'], ['Roast potatoes'])))
  );
  const already = sel(['Traditional roast'], ['Roast turkey']);
  const t5 = tick(mains, already, 'Roast turkey');
  assert(
    'T',
    'T5 a row already ticked: the selections come back unchanged, the same object — a tap never unticks (Q6)',
    ok(() => t5 === already && same(t5, sel(['Traditional roast'], ['Roast turkey'])))
  );
  const t6 = keep(mains, tick(mains, {}, 'Hangi-inspired', 'style'));
  assert(
    'T',
    'T6 a style: the style is ticked (Q7)',
    ok(() => same(t6, sel(['Hangi-inspired'])))
  );
  const t7 = keep(drinks, tick(drinks, {}, 'Under-18s will be present'));
  assert(
    'T',
    'T7 a drinks consideration: it is ticked alone, on its own level (C4)',
    ok(() => same(t7, { 2: { options: ['Under-18s will be present'], freeText: '' } }))
  );
  assert(
    'T',
    'T8 every result is stable through withoutOrphanedChoices (GTC-364 Q5)',
    ok(
      () =>
        outs.length === 6 &&
        outs.every(([lv, out]) => out !== null && same(withoutOrphanedChoices(lv, out), out))
    )
  );
  const none = { status: 'confirmed_none', requirements: [], other: '' };
  assert(
    'T',
    'T9 Dietary: the need is added with confirmed_needs; while "No dietary needs" is ticked nothing changes (Q8)',
    ok(
      () =>
        same(MS.dietaryFromSearch({ status: 'unanswered', requirements: [], other: '' }, 'Vegan'), {
          status: 'confirmed_needs',
          requirements: ['Vegan'],
          other: '',
        }) && MS.dietaryFromSearch(none, 'Vegan') === none
    )
  );

  // ── Layer R — the box rendered ─────────────────────────────────────────────
  const box = (q: string, rows: any[] = xmas) =>
    MSC?.default
      ? render(
          createElement(MSC.default, {
            rows,
            isTicked: () => false,
            dietaryNone: false,
            onPick: () => {},
            initialQuery: q,
          })
        )
      : '';
  const empty = box('');
  assert(
    'R',
    'R1 the box carries W1 (its label) and W2 (its placeholder)',
    empty.includes(`>${W1}<`) && empty.includes(`placeholder="${W2}"`)
  );
  assert(
    'R',
    'R2 an empty box shows no list',
    empty.includes(`>${W1}<`) && !empty.includes('<ul') && !empty.includes('<li')
  );
  assert('R', 'R3 W11 when nothing matches', box('haggis').includes(W11('haggis')));
  const roast = box('roast');
  assert(
    'R',
    'R4 the results are ul > li > button, 8 of them, then W10; no div.rounded-lg > button, no aria-label="Close" (C6)',
    count(roast, '<li') === 8 &&
      /<ul[^>]*>\s*<li[^>]*>\s*<button/.test(roast) &&
      roast.includes(W10(7)) &&
      !/<div[^>]*class="[^"]*\brounded-lg\b[^"]*"[^>]*>\s*<button/.test(roast) &&
      !roast.includes('aria-label="Close"')
  );
  assert(
    'R',
    'R5 nothing renders for "Other" (no menu, Q2)',
    !!MSC?.default &&
      ok(() => MS.buildMenuIndex('Other', keysFor('Other')).length === 0) &&
      box('', MS.buildMenuIndex('Other', keysFor('Other'))) === ''
  );

  // ── Layer E — finding on the event ─────────────────────────────────────────
  const P = (name: string, extra: Record<string, unknown> = {}) => ({
    personEventId: `pe-${name.split(' ')[0].toLowerCase()}`,
    personId: `p-${name.split(' ')[0].toLowerCase()}`,
    name,
    state: 'GREEN',
    justAttending: false,
    ...extra,
  });
  const people = [
    P('Kate Lowe'),
    P('Gus Henderson'),
    P('Aroha Henderson', { justAttending: true, state: 'AMBER' }),
    P('Mia Henderson', { state: 'AMBER' }),
    P('Josie Walker', { state: 'RED' }),
    P('Ross Walker', { state: 'AMBER' }),
    P('Rewi Tane', { state: 'OUT' }),
    P('Hamish Lowe', { state: 'AMBER' }),
  ];
  const rawRow = (name: string, who: string | null, response = 'ACCEPTED') => ({
    id: `i-${name}`,
    name,
    quantityAmount: 2,
    decideByOffsetHours: null,
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
    rawRow('Glazed ham', 'kate'),
    rawRow('Roast turkey', 'gus'),
    rawRow('Bread rolls', 'mia', 'PENDING'),
    rawRow('Gravy', null),
    rawRow('Classic pavlova with cream', 'josie', 'DECLINED'),
    rawRow('Trifle', 'josie', 'MAYBE'),
  ];
  const items = ok(() => Array.isArray(ES?.narrowItems(raw))) ? ES.narrowItems(raw) : [];
  const lines = (q: string, ppl: any[] = people, its: any[] = items): string[] => {
    try {
      return ES.findInEvent(ppl, its, q).map((h: any) => ES.hitLine(h));
    } catch {
      return [];
    }
  };
  const hits = (q: string): any[] => {
    try {
      return ES.findInEvent(people, items, q);
    } catch {
      return [];
    }
  };
  assert(
    'E',
    'E1 W15 — an item someone holds: "Roast turkey: Gus Henderson", tappable to his card',
    same(lines('turkey'), ['Roast turkey: Gus Henderson']) && hits('turkey')[0]?.target === 'pe-gus'
  );
  assert(
    'E',
    'E2 W16 — an item nobody holds: "Gravy: Nobody yet", not tappable (Q20)',
    same(lines('gravy'), ['Gravy: Nobody yet']) && hits('gravy')[0]?.target === null
  );
  assert(
    'E',
    'E3 W17 — an item handed back: "Classic pavlova with cream: Nobody yet (Josie Walker handed it back)"',
    same(lines('pav'), ['Classic pavlova with cream: Nobody yet (Josie Walker handed it back)']) &&
      hits('pav')[0]?.target === null
  );
  assert(
    'E',
    'E4 W18 — a person holding two, in plan order, the one handed back marked',
    same(lines('josie'), ['Josie Walker: Classic pavlova with cream (handed it back), Trifle']) &&
      hits('josie')[0]?.target === 'pe-josie'
  );
  assert(
    'E',
    'E5 W19 for a person holding nothing, W20 for a person marked "Just attending" (Q16)',
    same(lines('ross'), ['Ross Walker: Nothing yet']) &&
      same(lines('aroha'), ['Aroha Henderson: Just attending'])
  );
  assert(
    'E',
    'E6 a child and the host read like anyone (Q18)',
    same(lines('mia'), ['Mia Henderson: Bread rolls']) &&
      same(lines('kate'), ['Kate Lowe: Glazed ham'])
  );
  assert(
    'E',
    'E7 W21 — someone who said they’re not coming (Q17)',
    same(lines('rewi'), ['Rewi Tane: Not coming'])
  );
  const cousins = Array.from({ length: 10 }, (_, i) =>
    P(`Cousin ${i + 1}`, { personEventId: `pe-c${i}` })
  );
  assert(
    'E',
    'E8 accents and case ignored; items before people (Q14); 8 show, then W10',
    same(lines('HÉNDERSON'), [
      'Gus Henderson: Roast turkey',
      'Aroha Henderson: Just attending',
      'Mia Henderson: Bread rolls',
    ]) &&
      same(lines('ham'), ['Glazed ham: Kate Lowe', 'Hamish Lowe: Nothing yet']) &&
      lines('cousin', cousins, []).length === 10 &&
      ES.EVENT_SHOWN === 8 &&
      ES.EVENT_WORDS.more(2) === W10(2)
  );
  assert(
    'E',
    'E9 a raw …/items row is narrowed to name, holder and handed-back, with no other key (Q13; decideByFollowupSentAt never kept)',
    items.length === 6 &&
      items.every((i: any) => same(Object.keys(i).sort(), ['handedBack', 'holderId', 'name'])) &&
      !JSON.stringify(items).includes('decideByFollowupSentAt')
  );

  // ── Layer B — the board rendered, and its island's source ──────────────────
  const person = (name: string, pe: string, over: Record<string, unknown> = {}) => ({
    personEventId: pe,
    personId: `p-${pe}`,
    name,
    isHost: false,
    householdRole: 'GUEST',
    role: 'PARTICIPANT',
    teamId: null,
    nudgeMark: null,
    state: 'GREEN',
    reasons: ['ACCEPTED'],
    nextNudgeAt: null,
    items: [],
    emailNote: null,
    textNote: null,
    textable: false,
    chase: null,
    chaseNote: null,
    ...over,
  });
  const glanceOf = (households: any[]) => ({
    eventId: 'e-373',
    hostPersonId: 'p-pe-kate',
    asOf: new Date('2026-12-01T00:00:00Z').toISOString(),
    summary: { needYou: 0, withGather: 0, settled: households.length },
    households,
    unhoused: [],
    unassignedCritical: [],
    unassignedOrdinaryCount: 0,
  });
  const boardHtml = (households: any[]) =>
    render(
      createElement(GlanceBoard as any, {
        glance: glanceOf(households),
        eventName: 'GTC-373 board',
        actorRole: 'HOST',
        eventDate: 'Friday, 18 December',
        stickyReversals: [],
        now: new Date('2026-12-01T00:00:00Z'),
      })
    );
  const html = boardHtml([
    {
      householdId: 'h1',
      primaryContactName: 'Kate Lowe',
      isHostHousehold: true,
      members: [person('Kate Lowe', 'pe-kate', { isHost: true, role: 'HOST' })],
    },
    {
      householdId: 'h2',
      primaryContactName: 'Gus Henderson',
      isHostHousehold: false,
      members: [person('Gus Henderson', 'pe-gus')],
    },
  ]);
  const at13 = html.indexOf(W13);
  assert(
    'B',
    'B1 W13 appears once, after the last strip and before "What this does" (Q11)',
    count(html, W13) === 1 &&
      at13 > html.lastIndexOf('data-person-event-id') &&
      at13 < html.indexOf('data-moment-words')
  );
  assert(
    'B',
    'B2 with W13 present, the closed markup has no search box and no result (closed on every visit, Q12)',
    count(html, W13) === 1 &&
      !html.includes('type="search"') &&
      !html.includes('Nobody yet') &&
      !html.includes('data-event-hit')
  );
  assert(
    'B',
    'B3 the board still renders on an empty glance (after-the-press’s shape), with W13 present',
    boardHtml([]).includes(W13)
  );
  const island = codeOnly(read('src/components/glance/EventSearch.tsx'));
  const fetches = island.match(/\bfetch\(/g) ?? [];
  assert(
    'B',
    'B4 the island’s source: a client file whose one fetch is a GET of …/items; no method, popovertarget, setInterval, data-strip-/data-person-event-id attribute written, or <a> (Q13, Q19)',
    island.length > 0 &&
      /^\s*['"]use client['"]/.test(read('src/components/glance/EventSearch.tsx')) &&
      fetches.length === 1 &&
      /fetch\(`\/api\/events\/\$\{eventId\}\/items`\)/.test(island) &&
      !/\bmethod\s*:/.test(island) &&
      !/popovertarget/i.test(island) &&
      !/setInterval/.test(island) &&
      !/data-(strip-[a-z-]+|person-event-id)=\{/.test(island) &&
      !/<a\b/.test(island)
  );
}

// ══ LIVE ═════════════════════════════════════════════════════════════════════
const created = {
  events: [] as string[],
  people: [] as string[],
  users: [] as string[],
};

async function runLive() {
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('K', 'K1 CONTROL: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc373-${l}-${stamp}@example.com`;
  const mkUser = async (l: string, name: string | null) => {
    const user = await prisma.user.create({ data: { email: mail(l) } });
    created.users.push(user.id);
    let personId: string | null = null;
    if (name) {
      const p = await prisma.person.create({ data: { name, email: user.email, userId: user.id } });
      created.people.push(p.id);
      personId = p.id;
    }
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
    });
    return { user, personId: personId as string, token };
  };
  const kate = await mkUser('kate', 'Kate Lowe');
  const cohost = await mkUser('cohost', null);
  const start = new Date(Date.now() + 20 * 864e5);

  const mkEvent = async (name: string, extra: Record<string, unknown> = {}) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.personId,
        status: 'DRAFT',
        ...extra,
      } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: kate.user.id, role: 'HOST' } });
    return ev;
  };
  const pe: Record<string, string> = {};
  const pid: Record<string, string> = {};
  let n = 0;
  /** A household; the first member is the host herself when `host` is set. */
  const addHousehold = async (
    eventId: string,
    members: [string, string, Record<string, unknown>?][],
    sent: Date | null,
    host = false
  ) => {
    const h = await prisma.household.create({ data: { eventId } });
    for (const [i, [nm, role, extra]] of members.entries()) {
      let personId = kate.personId;
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
      pid[nm] = personId;
    }
  };

  // Moment 2's questions with no kind yet, and with Christmas (Dessert still deciding).
  const evNoKind = await mkEvent('GTC-373 b6 — no kind');
  await addHousehold(evNoKind.id, [['Kate Lowe', 'PRIMARY_CONTACT']], null, true);
  await prisma.eventSetup.create({ data: { eventId: evNoKind.id } as any });
  const evQ = await mkEvent('GTC-373 b6 — the menu');
  await addHousehold(evQ.id, [['Kate Lowe', 'PRIMARY_CONTACT']], null, true);
  await addHousehold(evQ.id, [['Gus Henderson', 'PRIMARY_CONTACT']], null);
  await prisma.eventSetup.create({
    data: {
      eventId: evQ.id,
      eventType: 'Christmas',
      extendedCategoriesData: { dessert: { selections: {}, stillDeciding: true } },
    } as any,
  });

  // The board: sent, the press's stamps written directly, nothing queued.
  const sentAt = new Date(Date.now() - 2 * 864e5);
  const evB = await mkEvent('GTC-373 b6 — the board', { status: 'CONFIRMING', sentAt });
  await prisma.eventRole.create({
    data: { eventId: evB.id, userId: cohost.user.id, role: 'COHOST' },
  });
  await addHousehold(evB.id, [['Kate Lowe', 'PRIMARY_CONTACT']], sentAt, true);
  await addHousehold(
    evB.id,
    [
      ['Gus Henderson', 'PRIMARY_CONTACT'],
      ['Aroha Henderson', 'PARTNER', { justAttending: true }],
      ['Mia Henderson', 'CHILD'],
    ],
    sentAt
  );
  await addHousehold(
    evB.id,
    [
      ['Josie Walker', 'PRIMARY_CONTACT'],
      ['Ross Walker', 'PARTNER'],
    ],
    sentAt
  );
  await addHousehold(
    evB.id,
    [['Rewi Tane', 'PRIMARY_CONTACT', { attendanceAnswer: 'NO' }]],
    sentAt
  );
  await prisma.eventSetup.create({
    data: { eventId: evB.id, eventType: 'Christmas', planApprovedAt: new Date() } as any,
  });
  const teamMains = await prisma.team.create({
    data: {
      name: 'Mains',
      eventId: evB.id,
      displayOrder: 0,
      source: 'GENERATED',
      coordinatorId: kate.personId,
    } as any,
  });
  const teamDessert = await prisma.team.create({
    data: {
      name: 'Dessert',
      eventId: evB.id,
      displayOrder: 1,
      source: 'GENERATED',
      coordinatorId: kate.personId,
    } as any,
  });
  const plan: [string, string, string | null, string | null, boolean][] = [
    ['Glazed ham', teamMains.id, 'Kate Lowe', 'ACCEPTED', true],
    ['Roast turkey', teamMains.id, 'Gus Henderson', 'ACCEPTED', false],
    ['Bread rolls', teamMains.id, 'Mia Henderson', 'PENDING', false],
    ['Gravy', teamMains.id, null, null, true],
    ['Classic pavlova with cream', teamDessert.id, 'Josie Walker', 'DECLINED', false],
    ['Trifle', teamDessert.id, 'Josie Walker', 'MAYBE', false],
    ['Ice', teamDessert.id, null, null, false],
  ];
  for (const [i, [name, teamId, who, response, critical]] of plan.entries()) {
    const item = await prisma.item.create({
      data: {
        name,
        teamId,
        source: 'GENERATED',
        aiGenerated: true,
        critical,
        status: who ? 'ASSIGNED' : 'UNASSIGNED',
        displayOrder: i,
      } as any,
    });
    if (who) {
      await prisma.assignment.create({
        data: { itemId: item.id, personId: pid[who], response: response as any },
      });
    }
  }

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
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const boardFacts = async () =>
    JSON.stringify(
      await prisma.item.findMany({
        where: { team: { eventId: evB.id } },
        orderBy: { name: 'asc' },
        select: {
          name: true,
          updatedAt: true,
          assignment: { select: { response: true, personId: true } },
        },
      })
    );
  const factsBefore = await boardFacts();
  const whileExists = await rows();

  const refusals: string[] = [];
  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: 9473 });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    // The dialog rule: only a "leave site?" is answered (by leaving); every dialog is logged.
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc373-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc373-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    await c.setSessionCookie(kate.token);
    await c.setViewport(1280, 900, false);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    /** Tag what `js` finds, then click it — guarded. 'absent' (not a refusal) when not found. */
    const tap = async (js: string, settleMs = 900) => {
      const found = await ev<boolean>(
        `(() => { document.querySelectorAll('[data-t]').forEach(e => e.removeAttribute('data-t')); const el = ${js}; if (!el) return false; el.setAttribute('data-t', 'x'); return true; })()`
      );
      if (!found) return 'absent';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    /** Empties the box the way typing would, taps into it, and types `q`. False if no box. */
    const typeInto = async (inputSel: string, q: string) => {
      const there = await ev<boolean>(
        `(() => { const i = document.querySelector(${JSON.stringify(inputSel)}); if (!i) return false;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, '');
          i.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`
      );
      if (!there) return false;
      if ((await tap(`document.querySelector(${JSON.stringify(inputSel)})`, 200)) !== null)
        return false;
      await c.insertText(q);
      await sleep(300);
      return true;
    };
    const logFetches = () =>
      ev(`(() => { window.__log = []; const f = window.fetch.bind(window);
        window.fetch = (u, o) => { window.__log.push(((o && o.method) || 'GET') + ' ' + String(u)); return f(u, o); }; return true; })()`);
    const fetchLog = () => ev<string[]>('window.__log || []');
    const setupNow = () =>
      prisma.eventSetup.findUnique({ where: { eventId: evQ.id } }) as Promise<any>;
    const MENU_IN = '[data-menu-search] input';
    const menuRow = (id: string) =>
      `document.querySelector('[data-menu-row=${JSON.stringify(id)}]')`;
    const expanded = (acc: string) =>
      ev<boolean>(
        `document.querySelector('[data-accordion="${acc}"] > button')?.getAttribute('aria-expanded') === 'true'`
      );
    /** The option's label: on screen, centred, ringed, its box focused and ticked. */
    const arrived = (acc: string, opt: string) =>
      ev<boolean>(`(() => { const l = document.querySelector('[data-accordion="${acc}"] [data-option=${JSON.stringify(opt)}]');
        if (!l) return false; const b = l.getBoundingClientRect(); const cy = b.top + b.height / 2; const h = window.innerHeight;
        const box = l.querySelector('input');
        return cy > h * 0.2 && cy < h * 0.75 && l.className.includes('ring-2') && document.activeElement === box && box.checked; })()`);

    // ── Layer LM — the menu, live ────────────────────────────────────────────
    await c.navigate(`/plan/${evNoKind.id}/setup`, 7000);
    const noKind =
      (await ev<boolean>(
        `document.body.innerText.includes('What kind of event are you planning?')`
      )) && !(await ev<boolean>(`!!document.querySelector('[data-menu-search]')`));
    await c.navigate(`/plan/${evQ.id}/setup`, 8000);
    r.K4 = await ev<boolean>(`!!document.querySelector('[data-accordion="mains"]')`);
    await logFetches();
    r.LM1 =
      noKind &&
      (await ev<boolean>(`(() => { const box = document.querySelector('[data-menu-search]'); if (!box) return false;
        const fb = [...document.querySelectorAll('p')].find(p => p.textContent.startsWith('Christmas for '));
        const food = [...document.querySelectorAll('div')].find(d => d.textContent.trim() === 'Food' && d.className.includes('uppercase'));
        return !!fb && !!food && !!(fb.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING)
          && !!(box.compareDocumentPosition(food) & Node.DOCUMENT_POSITION_FOLLOWING); })()`));

    // LM2/LM3 — "roast turkey", then a tap on the dish.
    const typed2 = await typeInto(MENU_IN, 'roast turkey');
    const tap2 = typed2 ? await tap(menuRow('choice:mains:1:Roast turkey'), 1200) : 'absent';
    r.LM2 =
      tap2 === null &&
      (await expanded('mains')) &&
      (await arrived('mains', '1:Roast turkey')) &&
      (await ev<boolean>(
        `document.querySelector('[data-accordion="mains"] [data-option="0:Traditional roast"] input')?.checked === true`
      )) &&
      (await ev<string>(`document.querySelector(${JSON.stringify(MENU_IN)})?.value ?? 'x'`)) === '';
    await sleep(1200);
    const s3 = await setupNow();
    r.LM3 =
      tap2 === null &&
      same(s3?.mainsData?.selections?.[0]?.options, ['Traditional roast']) &&
      same(s3?.mainsData?.selections?.[1]?.options, ['Roast turkey']) &&
      s3?.mainsData?.stillDeciding === false;
    detail.LM3 = JSON.stringify(s3?.mainsData ?? null);

    // LM4 — a dish in a section behind "Show more" (Christmas: Breakfast & Brunch).
    const brunch = getCategoryLevels('Christmas', 'breakfast_brunch') ?? [];
    const bStyle = brunch[0]?.options?.[0] ?? '';
    const bDish = brunch[1]?.dependsOn?.[bStyle]?.[0] ?? '';
    const hiddenBefore = !(await ev<boolean>(
      `!!document.querySelector('[data-accordion="breakfast_brunch"]')`
    ));
    const typed4 = await typeInto(MENU_IN, bDish);
    const tap4 = typed4 ? await tap(menuRow(`choice:breakfast_brunch:1:${bDish}`), 1200) : 'absent';
    const shown4 =
      tap4 === null &&
      (await expanded('breakfast_brunch')) &&
      (await arrived('breakfast_brunch', `1:${bDish}`));
    await sleep(1200);
    const s4 = await setupNow();
    r.LM4 =
      hiddenBefore &&
      shown4 &&
      same(s4?.extendedCategoriesData?.breakfast_brunch?.selections?.[0]?.options, [bStyle]) &&
      same(s4?.extendedCategoriesData?.breakfast_brunch?.selections?.[1]?.options, [bDish]);
    detail.LM4 = `${bDish} ${hiddenBefore} ${shown4} ${JSON.stringify(s4?.extendedCategoriesData?.breakfast_brunch ?? null)}`;

    // LM5 — a pavlova in Dessert, which is still deciding: the tap ends still deciding.
    const dessert = getCategoryLevels('Christmas', 'dessert') ?? [];
    const pavStyle =
      (dessert[0]?.options ?? []).find((s) =>
        (dessert[1]?.dependsOn?.[s] ?? []).some((d) => /pavlova/i.test(d))
      ) ?? '';
    const pav = (dessert[1]?.dependsOn?.[pavStyle] ?? []).find((d) => /pavlova/i.test(d)) ?? '';
    const typed5 = await typeInto(MENU_IN, pav);
    const tap5 = typed5 ? await tap(menuRow(`choice:dessert:1:${pav}`), 1200) : 'absent';
    await sleep(1200);
    const s5 = await setupNow();
    r.LM5 =
      tap5 === null &&
      s5?.extendedCategoriesData?.dessert?.stillDeciding === false &&
      (s5?.extendedCategoriesData?.dessert?.selections?.[1]?.options ?? []).includes(pav);
    detail.LM5 = `${pav} ${JSON.stringify(s5?.extendedCategoriesData?.dessert ?? null)}`;

    // LM6 — "vegan", then the Dietary row.
    const typed6 = await typeInto(MENU_IN, 'vegan');
    const tap6 = typed6 ? await tap(menuRow('dietary::-1:Vegan'), 1200) : 'absent';
    const open6 = tap6 === null && (await expanded('dietary'));
    await sleep(1200);
    const s6 = await setupNow();
    r.LM6 = open6 && (s6?.dietaryData?.requirements ?? []).includes('Vegan');

    // LM7 — nothing found.
    const typed7 = await typeInto(MENU_IN, 'haggis');
    r.LM7 =
      typed7 &&
      (await ev<string>(`document.querySelector('[data-menu-search]')?.innerText ?? ''`)).includes(
        W11('haggis')
      );

    // LM8 — what the taps sent: the questions' own save, nothing else, nothing blocked.
    const log8 = await fetchLog();
    r.LM8 =
      [tap2, tap4, tap5, tap6].every((t) => t === null) &&
      log8.length >= 4 &&
      log8.every((l) => l === `POST /api/events/${evQ.id}/setup`) &&
      c.planMakingBlocked().every((b) => b.includes('gtc373-probe'));
    detail.LM8 = log8.join(' | ');

    // LM10 — Escape empties the box.
    const typed10 = await typeInto(MENU_IN, 'ro');
    if (typed10) await c.pressKey('Escape');
    r.LM10 =
      typed10 &&
      (await ev<string>(`document.querySelector(${JSON.stringify(MENU_IN)})?.value ?? 'x'`)) === '';

    // LM9 — at 390, with the list open, nothing runs past the screen.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${evQ.id}/setup`, 8000);
    const typed9 = await typeInto(MENU_IN, 'roast');
    r.LM9 =
      typed9 &&
      (await ev<boolean>(`(() => { const box = document.querySelector('[data-menu-search]'); const ul = box && box.querySelector('ul');
        if (!box || !ul) return false; const b = box.getBoundingClientRect(); const u = ul.getBoundingClientRect();
        const scroller = box.closest('.overflow-y-auto');
        return b.left >= 0 && b.right <= 390 && u.right <= 390 && !!scroller && scroller.scrollWidth <= 390; })()`));
    // [[GTC-378]] — LM9 went red once in the gate: say what it saw, read after the check, nothing
    // clicked. A page that had not loaded (no Mains) reads apart from a width problem.
    detail.LM9 = `typed ${typed9}, ${await ev<string>(`JSON.stringify((() => {
        const box = document.querySelector('[data-menu-search]'); const ul = box && box.querySelector('ul');
        const input = document.querySelector(${JSON.stringify(MENU_IN)});
        const b = box ? box.getBoundingClientRect() : null; const u = ul ? ul.getBoundingClientRect() : null;
        const scroller = box && box.closest('.overflow-y-auto');
        return { value: input ? input.value : null, box: !!box, list: !!ul,
          boxLeft: b && b.left, boxRight: b && b.right, listRight: u && u.right,
          scrollWidth: scroller ? scroller.scrollWidth : null, clientWidth: scroller ? scroller.clientWidth : null,
          innerWidth: window.innerWidth, mains: !!document.querySelector('[data-accordion="mains"]') };
      })())`)}`;
    await c.setViewport(1280, 900, false);

    // ── Layer LB — the board, live ───────────────────────────────────────────
    const gus = pe[`${evB.id}:Gus Henderson`];
    const BTN = '[data-event-search-button]';
    const IN = '[data-event-search] input';
    const results = () =>
      ev<string[]>(
        `[...document.querySelectorAll('[data-event-search] [data-event-hit]')].map(li => li.innerText.trim())`
      );
    const closedNow = () =>
      ev<boolean>(`(() => { const b = document.querySelector('${BTN}');
        return !!b && b.innerText.trim() === ${JSON.stringify(W13)} && b.getAttribute('aria-expanded') === 'false'
          && !document.querySelector('${IN}'); })()`);
    await c.navigate(`/plan/${evB.id}/glance`, 8000);
    r.K5 = await ev<boolean>(`!!document.querySelector('[data-person-event-id="${gus}"]')`);
    await logFetches();
    r.LB1 = await closedNow();
    const tapB = await tap(`document.querySelector('${BTN}')`, 1500);
    const log2 = await fetchLog();
    r.LB2 =
      tapB === null &&
      (await ev<boolean>(
        `document.querySelector('${BTN}')?.getAttribute('aria-expanded') === 'true' && document.activeElement === document.querySelector('${IN}')`
      )) &&
      log2.filter((l) => l === `GET /api/events/${evB.id}/items`).length === 1;
    detail.LB2 = log2.join(' | ');

    const said: Record<string, string[]> = {};
    for (const q of ['turkey', 'gravy', 'pav', 'henderson']) {
      said[q] = (await typeInto(IN, q)) ? await results() : [];
    }
    r.LB3 =
      same(said.turkey, ['Roast turkey: Gus Henderson']) &&
      same(said.gravy, ['Gravy: Nobody yet']) &&
      same(said.pav, ['Classic pavlova with cream: Nobody yet (Josie Walker handed it back)']) &&
      same(said.henderson, [
        'Gus Henderson: Roast turkey',
        'Aroha Henderson: Just attending',
        'Mia Henderson: Bread rolls',
      ]);
    detail.LB3 = JSON.stringify(said);

    // LB4 — a tap on Gus: his strip centred and ringed, the ring gone after, no door opened.
    const typedG = await typeInto(IN, 'gus');
    const tapG = typedG
      ? await tap(
          `document.querySelector('[data-event-search] [data-search-target="${gus}"]')`,
          1000
        )
      : 'absent';
    const ringed =
      await ev<boolean>(`(() => { const s = document.querySelector('[data-person-event-id="${gus}"]'); if (!s) return false;
      const b = s.getBoundingClientRect(); const cy = b.top + b.height / 2; const h = window.innerHeight;
      return cy > h * 0.2 && cy < h * 0.8 && s.style.outline !== '' && ![...document.querySelectorAll('[role="dialog"]')].some(d => d.checkVisibility()); })()`);
    await sleep(2500);
    const unringed = await ev<boolean>(
      `document.querySelector('[data-person-event-id="${gus}"]')?.style.outline === ''`
    );
    r.LB4 =
      tapG === null &&
      ringed &&
      unringed &&
      !(await ev<boolean>(
        `!![...document.querySelectorAll('[role="dialog"]')].some(d => d.checkVisibility())`
      ));

    // LB5 — it only finds: GETs only, and nothing on the event moved.
    const log5 = await fetchLog();
    const mid = await totals();
    r.LB5 =
      tapB === null &&
      log5.length >= 1 &&
      log5.every((l) => l.startsWith('GET ')) &&
      (await boardFacts()) === factsBefore &&
      mid.invite === before.invite &&
      mid.outbound === before.outbound;
    detail.LB5 = log5.join(' | ');

    // LB8 — after a reload, closed again.
    await c.navigate(`/plan/${evB.id}/glance`, 8000);
    r.LB8 = tapB === null && (await closedNow());

    // LB7 — at 390, closed and open, nothing runs past the screen.
    await c.setViewport(390, 844, true);
    await c.navigate(`/plan/${evB.id}/glance`, 8000);
    const fits = () =>
      ev<boolean>(`(() => { const s = document.querySelector('[data-event-search]'); if (!s) return false;
        const b = s.getBoundingClientRect(); return b.left >= 0 && b.right <= 390 && document.documentElement.scrollWidth <= 390; })()`);
    const closedFits = (await closedNow()) && (await fits());
    const tap7 = await tap(`document.querySelector('${BTN}')`, 1500);
    const typed7b = tap7 === null && (await typeInto(IN, 'henderson'));
    r.LB7 = closedFits && typed7b && (await results()).length === 3 && (await fits());
    await c.setViewport(1280, 900, false);

    // LB6 — a co-host's session sees the same results.
    await c.setSessionCookie(cohost.token);
    await c.navigate(`/plan/${evB.id}/glance`, 8000);
    const tap6b = await tap(`document.querySelector('${BTN}')`, 1500);
    const co: Record<string, string[]> = {};
    for (const q of ['turkey', 'aroha']) {
      co[q] = tap6b === null && (await typeInto(IN, q)) ? await results() : [];
    }
    r.LB6 =
      same(co.turkey, ['Roast turkey: Gus Henderson']) &&
      same(co.aroha, ['Aroha Henderson: Just attending']);
    detail.LB6 = JSON.stringify(co);
  } catch (e) {
    console.error('live layer threw:', (e as Error).message);
  } finally {
    chrome?.close();
  }

  const lm = [
    [
      'LM1',
      'LM1 the box sits after the feedback line and before Food, and is not there before a kind is chosen (Q2, Q3)',
    ],
    [
      'LM2',
      'LM2 "roast turkey", then a tap: Mains opens, the dish is centred, ringed and focused, the dish and its style ticked, the box emptied (Q9)',
    ],
    ['LM3', 'LM3 the save lands: both in mainsData.selections, not still deciding'],
    [
      'LM4',
      'LM4 a dish behind "Show more": its section comes out and opens, and it is saved in extendedCategoriesData',
    ],
    [
      'LM5',
      'LM5 a still-deciding Dessert: a tap on a pavlova saves it ticked and stillDeciding false',
    ],
    ['LM6', 'LM6 "vegan", then the Dietary row: Dietary opens and Vegan is saved (Q8)'],
    ['LM7', 'LM7 W11 for "haggis"'],
    [
      'LM8',
      'LM8 the taps made only the questions’ own save (POST …/setup), and nothing was blocked',
    ],
    ['LM9', 'LM9 at 390, with the list open, the box fits and nothing scrolls sideways'],
    ['LM10', 'LM10 Escape empties the box'],
  ];
  for (const [k, label] of lm) assert('LM', label, r[k] === true, detail[k]);
  const lb = [
    ['LB1', 'LB1 W13 shows on load, closed, with no box'],
    [
      'LB2',
      'LB2 a tap opens it, focus goes to the box, and …/items is read once, after the tap (Q13)',
    ],
    ['LB3', 'LB3 turkey, gravy, pav and henderson read as W15 to W18 and W20'],
    [
      'LB4',
      'LB4 a tap on Gus: his strip centred and ringed, the ring gone after 2.5 s, no door opened (Q19)',
    ],
    [
      'LB5',
      'LB5 only GETs from the search: totals as found, the fixture’s items and assignments unchanged',
    ],
    ['LB6', 'LB6 a co-host’s session sees the same results (Q21)'],
    ['LB7', 'LB7 at 390, closed and open, it fits and nothing scrolls sideways'],
    ['LB8', 'LB8 after a reload it is closed again (Q12)'],
  ];
  for (const [k, label] of lb) assert('LB', label, r[k] === true, detail[k]);

  assert(
    'K',
    'K2 CONTROL: the plan-making probe failed in the browser',
    probes.plan === 'failed',
    probes.plan
  );
  assert(
    'K',
    'K3 CONTROL: the send probe failed in the browser',
    probes.send === 'failed',
    probes.send
  );
  assert(
    'K',
    'K4 CONTROL: Moment 2’s questions are reached (data-accordion="mains")',
    r.K4 === true
  );
  assert('K', 'K5 CONTROL: the board is reached (Gus’s strip)', r.K5 === true);
  const hosts = chrome ? chrome.hostsRequested() : [];
  assert(
    'K',
    'K6 CONTROL: headless Chrome requested only localhost:3000',
    hosts.length > 0 && hosts.every((h) => h === 'localhost:3000'),
    hosts.join(',')
  );
  assert(
    'K',
    'K7 CONTROL: no click was refused (a missing target is not a refusal)',
    refusals.length === 0,
    refusals.join(' | ')
  );
  const dialogs = chrome ? chrome.dialogs() : ['no chrome'];
  assert('K', 'K8 CONTROL: no dialog opened', dialogs.length === 0, dialogs.join(','));
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  assert(
    'K',
    'K9 CONTROL: aiCallsUsed 0 on every fixture event',
    ai.length === 3 && ai.every((e) => e.aiCallsUsed === 0)
  );
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    `K10 CONTROL: the totals are as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    after.invite === before.invite && after.outbound === before.outbound
  );
  assert(
    'K',
    `K11 CONTROL: the fixture was counted while it existed (${whileExists}) and every row removed by id`,
    whileExists.split(',').length === 14 &&
      whileExists.startsWith('3,') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0',
    `left ${left}`
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const evIds = created.events;
  // Every row below was made by this suite: its events and what hangs off them (including any guest
  // links a page minted), its people, its two users and their sessions.
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
    for (const r of redAssertions) console.log(`  ${r}`);
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
