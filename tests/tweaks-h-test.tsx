/**
 * [[GTC-423]] — TICKET H, THE BOARD'S ROW AS BUTTONS (tweak 10, the founder's ruling of 28 Oct 2026,
 * Batch 2 Part C). One file changes: src/components/glance/GlanceBoard.tsx.
 *
 * THE RULING THIS SUITE PINS
 *   - The board's door row keeps its five controls, their words and their order: "See menu", "See
 *     assignments", "Change who's on what", "Invites & people", "Print the list". The door "Invites
 *     & people" stays.
 *   - Each of the five gets Moment 2's secondary button look ("px-4 py-2 text-sm border
 *     border-gray-300 rounded-lg hover:bg-gray-50 transition-colors") plus "inline-flex
 *     items-center", with Moment 2's own text colour: Moment 2's button sets none and draws the
 *     page's black (measured rgb(0, 0, 0)), so "text-black"; and "cursor-pointer", so the two
 *     fold-out lines keep the pointer they had. ONE constant at the top of the board file; the row's
 *     gap is gap-2.
 *   - The two fold-outs stay the browser's own (details and summary; no hook, no state); links stay
 *     links; "Print the list" stays a button; no wrapper element is added.
 *
 * THE LAYERS
 *   P  the sources against Batch 2's tip (6b8c4ab, a fixed commit): the board is the base with
 *      exactly Ticket H's pieces, typed here by hand; the one constant, its exact class, used for
 *      all five; the board still holds no hook, no client marker and no fetch; the fold-outs, the
 *      print door, the doors' words and Moment 2's button byte for byte as at the base.
 *   R  the whole board drawn here, now and as it was at 6b8c4ab (both compiled here): the row
 *      exactly, element by element, typed here by hand (no wrapper, closed fold-outs, links and a
 *      button); invites-only; and the rest of the board identical to the base.
 *   C  the board in headless Chrome on the dev server and the demo database, at 1280 and 390, on an
 *      event this suite makes and removes: the five controls measured with the fold-outs closed and
 *      with each one open (one height, one top edge per line, lines apart, no overlap, no sideways
 *      scroll, black text); Enter and Space open each fold-out.
 *   K  CONTROL: the walls held, nothing was sent, every fixture row removed.
 *   U  CONTROL: between fixed commits, the code commit changed only the board, the re-base commit
 *      only tweaks-g; package.json gains this one script line; the two untracked scripts are in no
 *      commit; nothing under src/app/api, src/lib or prisma changed since the base.
 *
 * Needs the dev server on :3000 (layer C) and a global WebSocket (NODE_OPTIONS=
 * --experimental-websocket). No provider: the provider trap is installed and the dev server is
 * never live. TWEAKS_H_DRY_RUN=1 imports CHECKS and the helpers only.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapHits } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:3000';
const PORT = 9493;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch (e) {
    console.error('    threw:', (e as Error).message.split('\n')[0]);
    return false;
  }
}

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** The source without its comments, so a word in a comment cannot pass or fail a check. */
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
type Pairs = Array<[string, string]>;
function applyPairs(base: string, pairs: Pairs): string | null {
  let s = base;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

// ── Files and commits ────────────────────────────────────────────────────────
const BOARD = 'src/components/glance/GlanceBoard.tsx';
const ISLAND = 'src/components/glance/PlanLists.tsx';
const PRINT_DOOR = 'src/components/glance/PrintListDoor.tsx';
const HOME = 'src/lib/events/home-href.ts';
const MOMENT2 = 'src/components/plan/Moment2PlanView.tsx';
const SUITE = 'tests/tweaks-h-test.tsx';
/** Batch 2's tip (GTC-422's results commit), where this ticket starts: a fixed commit. */
const BASE = '6b8c4ab930dec04922974102247b54e85973134d';
/** Ticket H's code commit: a fixed commit. */
const CODE_H = '1abbd1bffb2736934c94de6abae78e334af4df83';
/** Ticket H's re-base commit (tweaks-g P1, B2, B3 and B4): a fixed commit. */
const REBASE_H = '6d8b7153ce0335a8dfa513623f8874f79aabeee4';
const CODE_FILES = [BOARD];
const REBASE_FILES = ['tests/tweaks-g-test.tsx'];
const UNCHANGED = [ISLAND, PRINT_DOOR, HOME, MOMENT2];
const NEW_SCRIPT = 'test:tweaks-h';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/tweaks-h-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled look, typed by hand ────────────────────────────────────────────
/** Moment 2's secondary button, as Moment2PlanView writes it (its exit, "Invites, people and nudges →"). */
const MOMENT2_SECONDARY =
  'px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors';
/** The row's one class: Moment 2's look, inline-flex and centred, black words, a pointer. */
const CLS = `${MOMENT2_SECONDARY} inline-flex items-center text-black cursor-pointer`;
/** The class the row's five carried until this ticket (the links' and the two islands'). */
const OLD_LINK = 'inline-block text-[12px] text-[#888780] underline underline-offset-2';
const OLD_ISLAND =
  'inline-block cursor-pointer text-[12px] text-[#888780] underline underline-offset-2';
const ROW_WORDS = [
  'See menu',
  'See assignments',
  "Change who's on what",
  'Invites & people',
  'Print the list',
];
const EVENT_ID = 'gtc423-made-up-event';
/** One fold-out line, closed, as the island draws it with a class (React writes & as &amp;). */
const fold = (which: string, words: string, cls: string) =>
  `<details data-plan-list-fold="${which}" name="plan-lists" class="open:basis-full">` +
  `<summary data-plan-list-door="${which}" class="${cls} list-none [&amp;::-webkit-details-marker]:hidden">${words}</summary>` +
  `</details>`;
const planDoor = (cls: string) =>
  `<a data-plan-door="" href="/plan/${EVENT_ID}/setup" class="${cls}">Change who&#x27;s on what</a>`;
const backDoor = (cls: string) =>
  `<a data-back-room-door="" href="/plan/${EVENT_ID}" class="${cls}">Invites &amp; people</a>`;
const printDoor = (cls: string) =>
  `<button type="button" data-print-door="" class="${cls}">Print the list</button>`;
/** The whole row, closed, now: five direct children, no wrapper. */
const ROW_NOW =
  '<div class="mt-2 flex flex-wrap gap-2">' +
  fold('menu', 'See menu', CLS) +
  fold('assignments', 'See assignments', CLS) +
  planDoor(CLS) +
  backDoor(CLS) +
  printDoor(CLS) +
  '</div>';
/** The row as 6b8c4ab drew it: the old gap and the old quiet-link classes. */
const ROW_BASE =
  '<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">' +
  fold('menu', 'See menu', OLD_ISLAND) +
  fold('assignments', 'See assignments', OLD_ISLAND) +
  planDoor(OLD_LINK) +
  backDoor(OLD_LINK) +
  printDoor(OLD_ISLAND) +
  '</div>';
const ROW_IO_NOW = '<div class="mt-2 flex flex-wrap gap-2">' + backDoor(CLS) + '</div>';
const ROW_IO_BASE =
  '<div class="mt-2 flex flex-wrap gap-x-4 gap-y-1">' + backDoor(OLD_LINK) + '</div>';

// ── The exact changes, typed by hand (6b8c4ab -> now) ────────────────────────
const CONST_BLOCK =
  '/**\n' +
  " * [[GTC-423]] (tweak 10, ruled 28 Oct 2026) — the five controls in the board's door row, as\n" +
  " * buttons: Moment 2's secondary button, with its black text (it sets no colour and draws the\n" +
  " * page's black) and a pointer, so the two fold-out lines look and feel like the other three.\n" +
  ' */\n' +
  'const DOOR_ROW_BUTTON_CLASS =\n' +
  `  '${CLS}';\n` +
  '\n';
const IMPORT_LINE =
  "import { MOMENT_HEADINGS, MOMENT_WORDS } from '@/lib/moments/moment-words';\n\n";
export const H_PAIRS: Pairs = [
  [IMPORT_LINE, IMPORT_LINE + CONST_BLOCK],
  [
    '        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">\n',
    '        <div className="mt-2 flex flex-wrap gap-2">\n',
  ],
  [
    '            <PlanLists\n' +
      '              eventId={glance.eventId}\n' +
      `              className="${OLD_ISLAND}"\n` +
      '            />\n',
    '            <PlanLists eventId={glance.eventId} className={DOOR_ROW_BUTTON_CLASS} />\n',
  ],
  [
    '              href={planDoorHref(glance.eventId)}\n' +
      `              className="${OLD_LINK}"\n`,
    '              href={planDoorHref(glance.eventId)}\n' +
      '              className={DOOR_ROW_BUTTON_CLASS}\n',
  ],
  [
    '            href={backRoomHref(glance.eventId)}\n' + `            className="${OLD_LINK}"\n`,
    '            href={backRoomHref(glance.eventId)}\n' +
      '            className={DOOR_ROW_BUTTON_CLASS}\n',
  ],
  [
    '              printDate={printDate}\n' + `              className="${OLD_ISLAND}"\n`,
    '              printDate={printDate}\n' + '              className={DOOR_ROW_BUTTON_CLASS}\n',
  ],
];

// ══ The board in this process ════════════════════════════════════════════════
type Component = (props: Record<string, unknown>) => any;
/** Compiles a version of the board here; its imports are today's files. */
function compile(source: string): Component | null {
  if (source.length < 2000) return null;
  try {
    const out = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (id.startsWith('@/')) return require(path.join(ROOT, 'src', id.slice(2)));
      if (id.startsWith('./'))
        return require(path.join(ROOT, 'src/components/glance', id.slice(2)));
      return require(id);
    };
    new Function('require', 'module', 'exports', out.code)(req, m, m.exports);
    return m.exports.default;
  } catch (e) {
    console.error('    did not load:', (e as Error).message.split('\n')[0]);
    return null;
  }
}
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
const boardProps = (over: Record<string, unknown>) => ({
  glance: {
    eventId: EVENT_ID,
    hostPersonId: 'p-pe-kate',
    asOf: new Date('2026-12-01T00:00:00Z').toISOString(),
    summary: { needYou: 0, withGather: 0, settled: 3 },
    households: [
      {
        householdId: 'h1',
        primaryContactName: 'Kate Lowe',
        isHostHousehold: true,
        members: [person('Kate Lowe', 'pe-kate', { isHost: true, role: 'HOST' })],
      },
      {
        householdId: 'h2',
        primaryContactName: 'Tom Reid',
        isHostHousehold: false,
        members: [person('Tom Reid', 'pe-tom'), person('Ana Reid', 'pe-ana')],
      },
    ],
    unhoused: [],
    unassignedCritical: [],
    unassignedOrdinaryCount: 0,
  },
  eventName: 'GTC-423 board',
  actorRole: 'HOST',
  eventDate: 'Friday, 18 December',
  stickyReversals: [],
  now: new Date('2026-12-01T00:00:00Z'),
  afterPress: true,
  printDate: 'Friday, 18 December',
  ...over,
});
const drawBoard = (B: Component | null, over: Record<string, unknown> = {}) =>
  B ? renderToStaticMarkup(createElement(B as any, boardProps(over))) : '';

// ── C: what the browser measures ─────────────────────────────────────────────
const MEASURE = `(() => {
  const row = document.querySelector('[data-back-room-door]')?.parentElement;
  if (!row) return null;
  const sels = ['summary[data-plan-list-door="menu"]', 'summary[data-plan-list-door="assignments"]', 'a[data-plan-door]', 'a[data-back-room-door]', 'button[data-print-door]'];
  const controls = sels.map((sel) => { const el = document.querySelector(sel); if (!el) return null;
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    return { words: el.textContent.trim(), tag: el.tagName.toLowerCase(), parentIsRow: el.parentElement === row || el.parentElement.parentElement === row,
      top: r.top, bottom: r.bottom, left: r.left, right: r.right, height: r.height,
      color: s.color, fontSize: s.fontSize, display: s.display, border: s.borderTopWidth + ' ' + s.borderTopStyle + ' ' + s.borderTopColor,
      radius: s.borderTopLeftRadius, underline: s.textDecorationLine, listStyle: s.listStyleType, cursor: s.cursor }; });
  return { controls, children: [...row.children].map((c) => c.tagName.toLowerCase()), rowGap: getComputedStyle(row).rowGap + ' ' + getComputedStyle(row).columnGap,
    scrollWidth: document.documentElement.scrollWidth,
    open: [...document.querySelectorAll('details[data-plan-list-fold][open]')].map((d) => d.getAttribute('data-plan-list-fold')),
    listDrawn: [...document.querySelectorAll('[data-plan-list]')].filter((d) => d.checkVisibility()).map((d) => d.getAttribute('data-plan-list')) };
})()`;

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export interface Measured {
  controls: Array<null | {
    words: string;
    tag: string;
    parentIsRow: boolean;
    top: number;
    bottom: number;
    left: number;
    right: number;
    height: number;
    color: string;
    fontSize: string;
    display: string;
    border: string;
    radius: string;
    underline: string;
    listStyle: string;
    cursor: string;
  }>;
  children: string[];
  rowGap: string;
  scrollWidth: number;
  open: string[];
  listDrawn: string[];
}
export const CHECKS = {
  /** P1 — the board is the base with exactly Ticket H's pieces, byte for byte. */
  exactly(now: string, base: string) {
    const expected = base.length > 2000 ? applyPairs(base, H_PAIRS) : null;
    return expected !== null && now === expected;
  },
  /** P2 — one constant holding the exact class, used for the row's four elements (five controls). */
  oneConstant(board: string, moment2: string) {
    const code = codeOnly(board);
    const tokens = CLS.split(' ');
    // the row itself: from its <div> to the details panel drawn after it
    const row = code.slice(
      code.indexOf('<div className="mt-2 flex flex-wrap gap-2">'),
      code.indexOf('<EventDetailsPanel')
    );
    return (
      count(code, 'const DOOR_ROW_BUTTON_CLASS =') === 1 &&
      count(code, `'${CLS}'`) === 1 &&
      count(code, 'DOOR_ROW_BUTTON_CLASS') === 5 &&
      row.length > 300 &&
      count(row, '{DOOR_ROW_BUTTON_CLASS}') === 4 &&
      count(row, 'className=') === 5 &&
      !row.includes('text-[') &&
      !row.includes('underline') &&
      moment2.includes(`className="${MOMENT2_SECONDARY} disabled:opacity-50"`) &&
      new Set(tokens).size === tokens.length &&
      tokens.filter((t) => t.startsWith('text-')).join(' ') === 'text-sm text-black' &&
      !tokens.some((t) => /underline|\[#|inline-block/.test(t))
    );
  },
  /** P3 — the board keeps phase 2's property: no hook, no client marker, no fetch. */
  noHook(board: string) {
    const code = codeOnly(board);
    return (
      code.length > 2000 &&
      !/\buse[A-Z]\w*\(/.test(code) &&
      !/^['"]use client['"]/.test(board.trim()) &&
      !/\bfetch\(/.test(code)
    );
  },
  /** P4 — files byte for byte as at the base. */
  same(now: string, base: string) {
    return base.length > 200 && now === base;
  },
  /** R1 — the row exactly, once (a string typed by hand). */
  once(html: string, el: string) {
    return html.length > 1000 && count(html, el) === 1;
  },
  /** R3 — CONTROL: the board now is the board at the base but for the row itself. */
  onlyTheRow(now: string, base: string, rowNow: string, rowBase: string) {
    return (
      count(now, rowNow) === 1 &&
      count(base, rowBase) === 1 &&
      now.replace(rowNow, '@@') === base.replace(rowBase, '@@')
    );
  },
  /** C1, C2 — the five controls as measured: one look, one height, one top per line, lines apart. */
  row(m: Measured | null, width: number, open: string | null) {
    if (!m || m.controls.length !== 5 || m.controls.some((c) => c === null)) return false;
    const c = m.controls as NonNullable<Measured['controls'][number]>[];
    const hs = c.map((x) => x.height);
    const h = Math.min(...hs);
    // lines: controls whose tops are within half a height of each other share a line
    const byTop = [...c].sort((a, b) => a.top - b.top);
    const lines: (typeof c)[] = [];
    for (const x of byTop) {
      const last = lines[lines.length - 1];
      if (last && Math.abs(x.top - last[0].top) < h / 2) last.push(x);
      else lines.push([x]);
    }
    const overlaps = c.some((a, i) =>
      c.some(
        (b, j) =>
          j > i && a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
      )
    );
    return (
      JSON.stringify(c.map((x) => x.words)) === JSON.stringify(ROW_WORDS) &&
      JSON.stringify(c.map((x) => x.tag)) ===
        JSON.stringify(['summary', 'summary', 'a', 'a', 'button']) &&
      c.every((x) => x.parentIsRow) &&
      JSON.stringify(m.children) === JSON.stringify(['details', 'details', 'a', 'a', 'button']) &&
      m.rowGap === '8px 8px' &&
      Math.max(...hs) - h <= 1 &&
      h >= 30 &&
      lines.every(
        (l) => Math.max(...l.map((x) => x.top)) - Math.min(...l.map((x) => x.top)) <= 1
      ) &&
      lines.every(
        (l, i) =>
          i === 0 ||
          Math.min(...l.map((x) => x.top)) - Math.max(...lines[i - 1].map((x) => x.bottom)) >= 4
      ) &&
      !overlaps &&
      m.scrollWidth <= width &&
      c.every(
        (x) =>
          x.color === 'rgb(0, 0, 0)' &&
          x.fontSize === '14px' &&
          x.border === '1px solid rgb(209, 213, 219)' &&
          x.radius === '8px' &&
          x.underline === 'none' &&
          x.cursor === 'pointer' &&
          /^(inline-)?flex$/.test(x.display)
      ) &&
      c.slice(0, 2).every((x) => x.listStyle === 'none' && x.display === 'inline-flex') &&
      JSON.stringify(m.open) === JSON.stringify(open ? [open] : []) &&
      JSON.stringify(m.listDrawn) === JSON.stringify(open ? [open] : [])
    );
  },
  /** C3 — a key on a focused line opens its fold-out (the browser's own). */
  keys(k: Record<string, boolean> | null) {
    return !!k && Object.keys(k).length === 4 && Object.values(k).every((v) => v === true);
  },
  /** U1, U3 — the files a fixed commit changed are exactly this list. */
  sameList(changed: string | null, list: string[]) {
    if (changed === null) return false;
    const got = changed.split('\n').filter(Boolean).sort();
    return JSON.stringify(got) === JSON.stringify([...list].sort());
  },
  /** U4 — package.json at the commit that added this suite differs by the one script line. */
  oneScriptLine(atAdd: string, before: string) {
    try {
      const now = JSON.parse(atAdd);
      const base = JSON.parse(before);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (base?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(base);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

function layerP() {
  section('P — the sources, against Batch 2’s tip (6b8c4ab)');
  const board = read(BOARD);
  assert(
    'P',
    'P1 the board is 6b8c4ab’s file with exactly Ticket H’s pieces, byte for byte: the one constant (and its comment) after the imports, the row’s gap-2, and the four className props of the row given the constant',
    CHECKS.exactly(board, atRef(BASE, BOARD))
  );
  assert(
    'P',
    `P2 one constant, DOOR_ROW_BUTTON_CLASS = "${CLS}" (Moment 2's secondary button, as Moment2PlanView still writes it, plus inline-flex items-center, black words and a pointer), handed to the row's four elements (the island's two lines, the two links, the print button); no other class, colour or underline left in the row`,
    CHECKS.oneConstant(board, read(MOMENT2))
  );
  assert(
    'P',
    'P3 the board file keeps no hook, no client marker and no fetch',
    CHECKS.noHook(board)
  );
  const changed = UNCHANGED.filter((f) => !CHECKS.same(read(f), atRef(BASE, f)));
  assert(
    'P',
    'P4 the fold-outs’ island (PlanLists), the print door, the doors’ words and addresses (home-href.ts) and Moment 2’s view are byte for byte as at 6b8c4ab',
    changed.length === 0,
    changed.join(', ')
  );
}

function layerR() {
  section('R — the whole board drawn here, now and as it was at 6b8c4ab');
  const Now = compile(read(BOARD));
  const Base = compile(atRef(BASE, BOARD));
  const planned = drawBoard(Now);
  const plannedBase = drawBoard(Base);
  const io = drawBoard(Now, { invitesOnly: true });
  const ioBase = drawBoard(Base, { invitesOnly: true });
  assert(
    'R',
    'R1 the row, closed, exactly: one <div class="mt-2 flex flex-wrap gap-2"> holding, as its own children and nothing else, the two closed fold-outs (details and summary, the marker hidden), the two links (their words and addresses as before) and the print button, each with the one class',
    CHECKS.once(planned, ROW_NOW),
    planned.slice(
      planned.indexOf('<div class="mt-2 flex flex-wrap'),
      planned.indexOf('<div class="mt-2 flex flex-wrap') + 400
    )
  );
  assert(
    'R',
    'R2 invites-only: the row holds "Invites & people" alone, with the one class, and the gap-2 row',
    CHECKS.once(io, ROW_IO_NOW)
  );
  assert(
    'R',
    'R3 CONTROL: at 6b8c4ab the row was the quiet links (gap-x-4 gap-y-1, small grey underlined words), and the board drawn now is the board drawn then but for the row, planned and invites-only alike',
    ok(
      () =>
        CHECKS.onlyTheRow(planned, plannedBase, ROW_NOW, ROW_BASE) &&
        CHECKS.onlyTheRow(io, ioBase, ROW_IO_NOW, ROW_IO_BASE)
    )
  );
}

// ══ C — the browser, on the demo database ════════════════════════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };
const refusals: string[] = [];

async function layerC() {
  section('C — the board in headless Chrome, on the demo database (an event made here)');
  const up = await realFetch(`${BASE_URL}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc423-${l}-${stamp}@example.com`;
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
  const jo = await prisma.person.create({ data: { name: 'Jo Lowe', email: mail('jo') } });
  created.people.push(jo.id);
  const start = new Date(Date.now() + 30 * 864e5);
  const ev = await prisma.event.create({
    data: {
      name: 'GTC-423 — the board',
      startDate: start,
      endDate: start,
      hostId: kate.id,
      status: 'CONFIRMING',
      sentAt: new Date(Date.now() - 2 * 3600e3),
      venueName: 'Kate’s place',
    },
  });
  created.events.push(ev.id);
  await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
  await prisma.eventSetup.create({ data: { eventId: ev.id, invitesOnly: false } as any });
  const hk = await prisma.household.create({ data: { eventId: ev.id } });
  await prisma.personEvent.create({
    data: {
      personId: kate.id,
      eventId: ev.id,
      householdId: hk.id,
      householdRole: 'PRIMARY_CONTACT',
      role: 'HOST',
    } as any,
  });
  const h1 = await prisma.household.create({ data: { eventId: ev.id } });
  await prisma.personEvent.create({
    data: {
      personId: jo.id,
      eventId: ev.id,
      householdId: h1.id,
      householdRole: 'PRIMARY_CONTACT',
    } as any,
  });
  const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
  const it = await prisma.item.create({
    data: { name: 'Green salad', teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
  });
  await prisma.assignment.create({ data: { itemId: it.id, personId: jo.id } });
  const outboundBefore = await prisma.outboundMessage.count();
  const inviteBefore = await prisma.inviteEvent.count();

  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  let chrome: Headless | null = null;
  let keys_: Awaited<ReturnType<typeof keySocket>> | null = null;
  let probes = { plan: '', send: '' };
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc423-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc423-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C0 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    // Walls not proven: no walk, and every C check below reads red.
    if (probes.plan !== 'failed' || probes.send !== 'failed') throw new Error('walls not proven');
    await c.setSessionCookie(token);
    keys_ = await keySocket();
    const ev_ = <T = any,>(js: string) => c.evaluate<T>(js);
    const waitFor = async (js: string, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (
          await ev_<boolean>(`(() => { try { return !!(${js}); } catch (e) { return false; } })()`)
        )
          return true;
        await sleep(150);
      }
      return false;
    };
    const closeAll = `document.querySelectorAll('details[data-plan-list-fold]').forEach((d) => { d.open = false; })`;
    for (const [w, h, mobile, k] of [
      [1280, 900, false, ''],
      [390, 844, true, 'p'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await c.navigate(`/plan/${ev.id}/glance`, 300);
      await waitFor(`document.querySelector('[data-back-room-door]')`);
      await sleep(800);
      const closed = await ev_<Measured>(MEASURE);
      r[`C1${k}`] = CHECKS.row(closed, w, null);
      detail[`C1${k}`] = JSON.stringify(closed);
      for (const which of ['menu', 'assignments']) {
        const why = await c.clickGuarded(`summary[data-plan-list-door="${which}"]`, 300);
        if (why) refusals.push(`${which}: ${why}`);
        await waitFor(
          `(() => { const d = document.querySelector('[data-plan-list="${which}"]'); return !!d && !d.querySelector('[data-plan-loading]'); })()`
        );
        await sleep(300);
        const opened = await ev_<Measured>(MEASURE);
        const key = which === 'menu' ? 'C2m' : 'C2a';
        r[`${key}${k}`] = CHECKS.row(opened, w, which);
        detail[`${key}${k}`] = JSON.stringify(opened);
        await ev_(closeAll);
        await sleep(200);
      }
      const press = async (which: string, key: 'Enter' | ' ') => {
        await ev_(
          `(${closeAll}, document.querySelector('summary[data-plan-list-door="${which}"]').focus(), true)`
        );
        await sleep(150);
        await keys_!.press(key);
        await sleep(400);
        return ev_<boolean>(
          `!!document.querySelector('details[data-plan-list-fold="${which}"]')?.open && document.activeElement === document.querySelector('summary[data-plan-list-door="${which}"]')`
        );
      };
      const keys = {
        menuEnter: await press('menu', 'Enter'),
        menuSpace: await press('menu', ' '),
        assignmentsEnter: await press('assignments', 'Enter'),
        assignmentsSpace: await press('assignments', ' '),
      };
      await ev_(closeAll);
      r[`C3${k}`] = CHECKS.keys(keys);
      detail[`C3${k}`] = JSON.stringify(keys);
    }
  } catch (e) {
    console.error('    chrome threw:', (e as Error).message.split('\n')[0]);
  }
  const blocked = chrome?.planMakingBlocked() ?? ['no chrome'];
  const hosts = chrome?.hostsRequested() ?? [];
  const dialogs = chrome?.dialogs() ?? ['no chrome'];
  keys_?.close();
  chrome?.close();
  const labels: Array<[string, string]> = [
    [
      'C1',
      'C1 the fold-outs closed: the five controls, in order, the row’s own children (details, details, a, a, button), gap 8px; one height (within 1px, at least 30px), one top edge on each line (within 1px), each wrapped line at least 4px below the last, none overlapping, no sideways scroll; each black (rgb(0, 0, 0)), 14px, a 1px grey border, 8px corners, no underline, a pointer; the two lines show no marker',
    ],
    [
      'C2m',
      'C2m "See menu" open (a real click): the list drawn under it, and the five controls as C1',
    ],
    [
      'C2a',
      'C2a "See assignments" open (a real click): the list drawn under it, and the five controls as C1',
    ],
    ['C3', 'C3 Enter and Space on each focused line open its fold-out (the browser’s own)'],
  ];
  for (const [key, label] of labels) {
    assert('C', `${label} (1280)`, r[key] === true, detail[key]);
    assert('C', `${label} (390)`, r[`${key}p`] === true, detail[`${key}p`]);
  }

  section('K — CONTROL: the walls held, nothing sent, nothing written');
  const evIn = { eventId: { in: created.events } };
  const sent = await prisma.outboundMessage.count({ where: evIn });
  const invites = await prisma.inviteEvent.count({ where: evIn });
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  assert(
    'K',
    'K1 the browser failed only the two probes; no click was refused; no dialog; no host but this Mac; no provider reached',
    JSON.stringify([...blocked].sort()) ===
      JSON.stringify(
        [
          'POST http://localhost:3000/api/events/gtc423-probe/send',
          'POST http://localhost:3000/api/gtc423-probe/finalize-plan',
        ].sort()
      ) &&
      refusals.length === 0 &&
      dialogs.length === 0 &&
      hosts.every((x) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(x)) &&
      trapHits().length === 0,
    JSON.stringify({ blocked, refusals, dialogs, hosts })
  );
  assert(
    'K',
    'K2 nothing was sent: no message and no invite event on the event, no AI call; the totals of messages and invite events are as found',
    sent === 0 &&
      invites === 0 &&
      ai.length === 1 &&
      ai[0].aiCallsUsed === 0 &&
      (await prisma.outboundMessage.count()) === outboundBefore &&
      (await prisma.inviteEvent.count()) === inviteBefore,
    JSON.stringify({ sent, invites, ai })
  );
}

/**
 * A key pressed on whatever has the focus, through a second DevTools socket on the same page: Enter
 * carries its carriage return and Space its space, as a real key press sends them (a summary opens
 * only on a key that carries its character).
 */
async function keySocket(): Promise<{
  press: (key: 'Enter' | ' ') => Promise<void>;
  close: () => void;
}> {
  const targets = (await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as any[];
  const page = targets.find((t) => t.type === 'page');
  const ws = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, () => void>();
  ws.addEventListener('message', (e: { data: string }) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!();
      pending.delete(m.id);
    }
  });
  const send = (method: string, params: Record<string, unknown>) =>
    new Promise<void>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return {
    async press(key) {
      const code = key === 'Enter' ? 'Enter' : 'Space';
      const vk = key === 'Enter' ? 13 : 32;
      const text = key === 'Enter' ? '\r' : ' ';
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: vk,
        text,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
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

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const evIds = created.events;
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  const auditIds = (
    await prisma.auditEntry.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((a) => a.id);
  await del(() => prisma.auditEntry.deleteMany({ where: { id: { in: auditIds } } }));
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
  const left =
    (await prisma.event.count({ where: { id: { in: evIds } } })) +
    (await prisma.person.count({ where: { id: { in: created.people } } })) +
    (await prisma.user.count({ where: { id: { in: created.users } } })) +
    (await prisma.session.count({ where: { userId: { in: created.users } } }));
  assert(
    'K',
    'K3 CONTROL: every fixture row removed by id (1 event and all on it, 2 people, 1 user, 1 session)',
    left === 0 && evIds.length === 1,
    String(left)
  );
}

function layerU() {
  section('U — CONTROL: what Ticket H touched, between fixed commits');
  const d1 = git(['diff', '--name-only', BASE, CODE_H]);
  assert(
    'U',
    `U1 the files changed between Batch 2’s tip (6b8c4ab) and Ticket H’s code commit (${CODE_H.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')} (PlanLists.tsx not needed: the fold-outs take the look from the class the board hands them)`,
    CHECKS.sameList(d1.status === 0 ? d1.stdout : null, CODE_FILES),
    d1.stdout
  );
  assert(
    'U',
    'U2 the code commit stands straight on Batch 2’s tip (its one parent)',
    git(['rev-parse', `${CODE_H}^@`]).stdout.trim() === BASE
  );
  const d3 = git(['diff', '--name-only', CODE_H, REBASE_H]);
  assert(
    'U',
    `U3 the re-base commit (${REBASE_H.slice(0, 7)}) stands on the code commit and changed exactly: ${REBASE_FILES.join(', ')}`,
    git(['rev-parse', `${REBASE_H}^@`]).stdout.trim() === CODE_H &&
      CHECKS.sameList(d3.status === 0 ? d3.stdout : null, REBASE_FILES),
    d3.stdout
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U4 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the re-base commit’s by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      git(['rev-parse', `${addCommit}^`]).stdout.trim() === REBASE_H &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(REBASE_H, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  const zones = git([
    'diff',
    '--name-only',
    BASE,
    'HEAD',
    '--',
    'src/app/api',
    'src/lib',
    'prisma',
  ]);
  assert(
    'U',
    'U5 neither untracked script is in any commit since the base, and nothing under src/app/api, src/lib or prisma changed since it',
    tracked.length === 0 && zones.status === 0 && zones.stdout.trim() === '',
    `${tracked.join(', ')} ${zones.stdout}`
  );
}

async function main() {
  installProviderTrap();
  layerP();
  layerR();
  try {
    await layerC();
  } finally {
    await cleanup();
  }
  layerU();
  await prisma.$disconnect();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS and the helpers only (TWEAKS_H_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_H_DRY_RUN !== '1') void main();
