/**
 * [[GTC-421]] — TICKET G, THE BOARD (tweak 10, the founder's ruling of 28 Oct 2026, Batch 2 Part B).
 * One file changes: src/components/glance/PlanLists.tsx, the island that draws "See menu" and "See
 * assignments".
 *
 * THE RULING THIS SUITE PINS
 *   - Part 2, hide "Invites & people": ONLY IF each guest's own link and each guest's invite status
 *     can be reached another way, on the board or one tap from it. Part 1 found both on the old
 *     dashboard only, so part 2 is SKIPPED: the door stays exactly as it was.
 *   - Part 3: "See menu" and "See assignments" fold out IN PLACE with the browser's own fold-out
 *     (details and summary), their words, order and contents unchanged; the board keeps no hook and
 *     no state is added; "Change who's on what" and "Print the list" stay as they are; neither shows
 *     on an invites-only event; the keyboard opens and closes it (the browser's own).
 *
 * THE LAYERS
 *   P  the sources, against Part A's tip (4851b3f, a fixed commit): the board, the door's words and
 *      address, the print door and the two list libraries byte for byte as they were; the island's
 *      hooks and markup.
 *   R  the island drawn here, the island as it is now and as it was at 4851b3f both compiled here
 *      (esbuild) with React's state answered by this suite: closed, and open in eight states (each
 *      list with rows, loading, failed, empty). What each fold-out holds is compared, byte for
 *      byte, with what the pop-up held.
 *   T  the island's handlers, called with stand-in events: opening reads the items and folds the
 *      other one; folding draws nothing; Close folds and puts the focus back; a late list is not
 *      drawn.
 *   B  the whole board drawn here, with the island now and with the island as it was: the door row
 *      in order, the door itself, "Change who's on what" and "Print the list" exactly as they were,
 *      the rest of the board identical, invites-only as before.
 *   U  CONTROL: between fixed commits, the code commit changed only the island, the re-base commit
 *      only walkthrough-batch18; package.json differs by this suite's one script line; the two
 *      untracked scripts are in no commit.
 *
 * No database, no server, no provider, no request. Every condition lives in CHECKS, so it can be
 * dry-run on a passing and a failing input (TWEAKS_G_DRY_RUN=1 imports CHECKS and the helpers only).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as ReactAll from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

const ROOT = path.join(__dirname, '..');

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

// ── Files and commits ────────────────────────────────────────────────────────
const ISLAND = 'src/components/glance/PlanLists.tsx';
const BOARD = 'src/components/glance/GlanceBoard.tsx';
const HOME = 'src/lib/events/home-href.ts';
const PRINT_DOOR = 'src/components/glance/PrintListDoor.tsx';
const PRINT_LIB = 'src/lib/print/item-list.ts';
const LISTS_LIB = 'src/lib/print/plan-lists.ts';
const MOMENT2 = 'src/components/plan/Moment2PlanView.tsx';
const OLD_DASHBOARD = 'src/app/plan/[eventId]/page.tsx';
const BATCH18 = 'tests/walkthrough-batch18-test.tsx';
const SUITE = 'tests/tweaks-g-test.tsx';
/** Part A's tip (GTC-420's ticket commit), where this ticket starts: a fixed commit. */
const BASE = '4851b3f3701068ae4faa0d10a99664fbc2a94fcf';
/** Ticket G's code commit: a fixed commit. */
const CODE_G = '60cf51a4800a11e29a48cdec6fa8ad1b311f381d';
/** Ticket G's re-base commit (walkthrough-batch18 S11 and C6 to C12): a fixed commit. */
const REBASE_G = '0192c35274a9fe293bac68f162a6cf5408a725e1';
const CODE_FILES = [ISLAND];
const REBASE_FILES = [BATCH18];
const UNCHANGED = [BOARD, HOME, PRINT_DOOR, PRINT_LIB, LISTS_LIB, MOMENT2, OLD_DASHBOARD];
const NEW_SCRIPT = 'test:tweaks-g';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-g-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The words, typed by hand ─────────────────────────────────────────────────
const MENU_DOOR = 'See menu';
const ASSIGNMENTS_DOOR = 'See assignments';
const DOOR_ROW = [
  MENU_DOOR,
  ASSIGNMENTS_DOOR,
  "Change who's on what",
  'Invites & people',
  'Print the list',
];
const LIST_WORDS = [
  'The menu',
  'Who’s on what',
  'Getting the list…',
  'That didn’t work. Close this and try again.',
  'Nothing on the menu yet.',
  'Nobody yet',
  'Nobody has anything yet.',
  'Not given to anyone yet',
];
const EVENT_ID = 'gtc421-made-up-event';
/** The board's own door class, as GlanceBoard hands it to the island (unchanged). */
const BOARD_DOOR_CLASS =
  'inline-block cursor-pointer text-[12px] text-[#888780] underline underline-offset-2';
/** The closed island, typed by hand: two fold-out lines and nothing else (React writes & as &amp;). */
const fold = (which: string, words: string, cls: string) =>
  `<details data-plan-list-fold="${which}" name="plan-lists" class="open:basis-full">` +
  `<summary data-plan-list-door="${which}" class="${cls} list-none [&amp;::-webkit-details-marker]:hidden">${words}</summary>` +
  `</details>`;
const CLOSED = (cls: string) =>
  fold('menu', MENU_DOOR, cls) + fold('assignments', ASSIGNMENTS_DOOR, cls);
/** The door and its two neighbours on the board, typed by hand as they were at 4851b3f. */
const DOOR_HTML = `<a data-back-room-door="" href="/plan/${EVENT_ID}" class="inline-block text-[12px] text-[#888780] underline underline-offset-2">Invites &amp; people</a>`;
const PLAN_DOOR_HTML = `<a data-plan-door="" href="/plan/${EVENT_ID}/setup" class="inline-block text-[12px] text-[#888780] underline underline-offset-2">Change who&#x27;s on what</a>`;
const PRINT_DOOR_HTML = `<button type="button" data-print-door="" class="${BOARD_DOOR_CLASS}">Print the list</button>`;

// ── Made-up lists, typed here ────────────────────────────────────────────────
const ITEMS = [
  {
    id: 'i-ham',
    name: 'Glazed ham',
    amount: '1 ham',
    section: 'Mains',
    sectionOrder: 1,
    holder: { id: 'p-kate', name: 'Kate Lowe' },
    answer: 'Said yes',
  },
  {
    id: 'i-salad',
    name: 'Potato salad',
    amount: null,
    section: 'Sides',
    sectionOrder: 2,
    holder: { id: 'p-tom', name: 'Tom Reid' },
    answer: 'Not answered yet',
  },
  {
    id: 'i-fruit',
    name: 'Fruit salad',
    amount: '1 bowl',
    section: 'Desserts',
    sectionOrder: 3,
    holder: null,
    answer: null,
  },
  {
    id: 'i-rolls',
    name: 'Bread rolls',
    amount: '24 rolls',
    section: 'Mains',
    sectionOrder: 1,
    holder: { id: 'p-kate', name: 'Kate Lowe' },
    answer: 'Said yes',
  },
];
export interface OpenState {
  key: string;
  which: 'menu' | 'assignments';
  items: unknown[] | null;
  failed: boolean;
  /** Words this state must show. */
  shows: string[];
}
export const OPEN_STATES: OpenState[] = [
  {
    key: 'menu',
    which: 'menu',
    items: ITEMS,
    failed: false,
    shows: ['The menu', 'Glazed ham', 'Nobody yet'],
  },
  {
    key: 'assignments',
    which: 'assignments',
    items: ITEMS,
    failed: false,
    shows: ['Who’s on what', 'Kate Lowe', 'Not given to anyone yet'],
  },
  { key: 'menu-loading', which: 'menu', items: null, failed: false, shows: ['Getting the list…'] },
  {
    key: 'assignments-loading',
    which: 'assignments',
    items: null,
    failed: false,
    shows: ['Getting the list…'],
  },
  {
    key: 'menu-failed',
    which: 'menu',
    items: null,
    failed: true,
    shows: ['That didn’t work. Close this and try again.'],
  },
  {
    key: 'assignments-failed',
    which: 'assignments',
    items: ITEMS,
    failed: true,
    shows: ['That didn’t work. Close this and try again.'],
  },
  {
    key: 'menu-empty',
    which: 'menu',
    items: [],
    failed: false,
    shows: ['Nothing on the menu yet.'],
  },
  {
    key: 'assignments-empty',
    which: 'assignments',
    items: [],
    failed: false,
    shows: ['Nobody has anything yet.'],
  },
];

// ══ The island in this process ═══════════════════════════════════════════════
/** React's state, answered by this suite: the slots are open, items, failed, in that order. */
let slots: unknown[] | null = null;
let slot = 0;
export const sets: Array<{ slot: number; value: unknown }> = [];
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    if (slots === null) return ReactAll.useState(init);
    const i = slot++;
    return [
      i < slots.length ? slots[i] : init,
      (value: unknown) => {
        sets.push({ slot: i, value });
      },
    ];
  },
  useEffect: (...a: Parameters<typeof ReactAll.useEffect>) =>
    slots === null ? ReactAll.useEffect(...a) : undefined,
  useRef: (v: unknown) => (slots === null ? ReactAll.useRef(v) : { current: v }),
};
type Component = (props: Record<string, unknown>) => ReactAll.ReactElement;
/** Compiles a version of a file here, with `react` answered by `reactFor` and `./PlanLists` by `island`. */
function compile(source: string, dir: string, island?: Component): Component | null {
  if (source.length < 500) return null;
  try {
    const out = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (id === 'react') return FAKE_REACT;
      if (id === './PlanLists' && island) return { __esModule: true, default: island };
      if (id.startsWith('@/')) return require(path.join(ROOT, 'src', id.slice(2)));
      if (id.startsWith('./')) return require(path.join(ROOT, dir, id.slice(2)));
      return require(id);
    };
    new Function('require', 'module', 'exports', out.code)(req, m, m.exports);
    return m.exports.default;
  } catch (e) {
    console.error('    did not load:', (e as Error).message.split('\n')[0]);
    return null;
  }
}
/** The island drawn with its state set (open, items, failed), or with React's own state if null. */
export function drawIsland(View: Component, state: unknown[] | null, cls = BOARD_DOOR_CLASS) {
  slots = state;
  slot = 0;
  try {
    return renderToStaticMarkup(createElement(View, { eventId: EVENT_ID, className: cls }));
  } finally {
    slots = null;
  }
}
/** The island's element tree with its state set, for its handlers. */
function treeOf(View: Component, state: unknown[]) {
  slots = state;
  slot = 0;
  try {
    return View({ eventId: EVENT_ID, className: BOARD_DOOR_CLASS });
  } finally {
    slots = null;
  }
}
function findAll(node: any, pred: (el: any) => boolean, out: any[] = []): any[] {
  if (node == null || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach((n) => findAll(n, pred, out));
    return out;
  }
  if (node.props) {
    if (pred(node)) out.push(node);
    findAll(node.props.children, pred, out);
  }
  return out;
}
/** The open list's inside, as the fold-out draws it: between its opening tag and `</div></details>`. */
export function foldInside(html: string, which: string) {
  const open = html.indexOf(`<div data-plan-list="${which}" `);
  if (open < 0) return null;
  const start = html.indexOf('>', open) + 1;
  const end = html.indexOf('</div></details>', start);
  return end < 0 ? null : html.slice(start, end);
}
/** The open list's inside, as the pop-up drew it: inside the dialog, which closes the island. */
export function dialogInside(html: string, which: string) {
  const open = html.search(
    new RegExp(`<div role="dialog" aria-modal="true" aria-label="[^"]*" data-plan-list="${which}" `)
  );
  if (open < 0) return null;
  const start = html.indexOf('>', open) + 1;
  return html.endsWith('</div></div>')
    ? html.slice(start, html.length - '</div></div>'.length)
    : null;
}

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** P1, P3 — files byte for byte as they were at the base. */
  same(now: string, base: string) {
    return base.length > 200 && now === base;
  },
  /** P2 — the board keeps phase 2's property: no hook, no client marker, no fetch. */
  noHook(board: string) {
    const code = codeOnly(board);
    return (
      code.length > 2000 &&
      !/\buse[A-Z]\w*\(/.test(code) &&
      !/^['"]use client['"]/.test(board.trim()) &&
      !/\bfetch\(/.test(code)
    );
  },
  /** P4 — the island: no state added (the same three, the same counter), one hook fewer. */
  sameState(now: string, base: string) {
    const n = codeOnly(now);
    const b = codeOnly(base);
    const hooks = (s: string) => [...new Set(s.match(/\buse[A-Z]\w*(?=\()/g) ?? [])].sort();
    return (
      b.length > 1000 &&
      count(n, 'useState<') + count(n, 'useState(') === 3 &&
      count(b, 'useState<') + count(b, 'useState(') === 3 &&
      count(n, 'useRef(') === 1 &&
      count(b, 'useRef(') === 1 &&
      count(n, 'useEffect(') === 0 &&
      count(b, 'useEffect(') === 1 &&
      hooks(n).every((h) => hooks(b).includes(h)) &&
      JSON.stringify(hooks(n)) === '["useRef","useState"]'
    );
  },
  /** P5 — the browser's own fold-out, and nothing of the pop-up left; the keyboard is the browser's. */
  foldOut(now: string) {
    const n = codeOnly(now);
    return (
      /^['"]use client['"]/.test(now.trim()) &&
      count(n, '<details') === 1 &&
      count(n, '<summary') === 1 &&
      /<details\s+data-plan-list-fold=\{which\}\s+name="plan-lists"\s+onToggle=\{toggled\(which\)\}/.test(
        n
      ) &&
      /<\/summary>\s*\{open === which \? \(/.test(n) &&
      (n.match(/\bfetch\(/g) ?? []).length === 1 &&
      !/role="dialog"|aria-modal|aria-haspopup|data-plan-list-backdrop|fixed inset-0|'Escape'/.test(
        n
      ) &&
      !/onKey|keydown|tabIndex|preventDefault/.test(n) &&
      !/<a\b|href=/.test(n)
    );
  },
  /** R1 — closed: the two fold-out lines, in order, and nothing else at all. */
  closed(html: string) {
    return html === CLOSED(BOARD_DOOR_CLASS);
  },
  /** R1 (base) — the pop-up's two closed buttons carried the same words in the same order. */
  baseClosedWords(html: string) {
    const words = [
      ...html.matchAll(
        /<button[^>]*data-plan-list-door="(menu|assignments)"[^>]*>([^<]*)<\/button>/g
      ),
    ].map((m) => `${m[1]}:${m[2]}`);
    return (
      JSON.stringify(words) ===
      JSON.stringify([`menu:${MENU_DOOR}`, `assignments:${ASSIGNMENTS_DOOR}`])
    );
  },
  /** R2 — open: the fold-out holds exactly what the pop-up held, under its own line, in place. */
  sameInside(now: string, base: string, s: OpenState) {
    const inside = foldInside(now, s.which);
    const other = s.which === 'menu' ? 'assignments' : 'menu';
    const otherWords = other === 'menu' ? MENU_DOOR : ASSIGNMENTS_DOOR;
    const mineWords = s.which === 'menu' ? MENU_DOOR : ASSIGNMENTS_DOOR;
    return (
      inside !== null &&
      inside === dialogInside(base, s.which) &&
      s.shows.every((w) => inside.includes(w)) &&
      inside.includes('aria-label="Close"') &&
      count(now, 'data-plan-list=') === 1 &&
      now.indexOf(`>${mineWords}</summary><div data-plan-list="${s.which}" `) > 0 &&
      now.includes(fold(other, otherWords, BOARD_DOOR_CLASS)) &&
      !now.includes('role="dialog"') &&
      !now.includes('data-plan-list-backdrop')
    );
  },
  /** T — the calls a handler made. */
  calls(got: unknown, want: unknown) {
    return JSON.stringify(got) === JSON.stringify(want);
  },
  /** B1 — the board's door row, in order, by its marked elements. */
  doorRow(html: string, expected: string[]) {
    const marks = [
      ...html.matchAll(
        /<(?:summary|a|button)\b[^>]*data-(plan-list-door="[a-z]+"|plan-door=""|back-room-door=""|print-door="")[^>]*>([^<]*)<\/(?:summary|a|button)>/g
      ),
    ].map((m) => m[2].replace(/&#x27;/g, "'").replace(/&amp;/g, '&'));
    return JSON.stringify(marks) === JSON.stringify(expected);
  },
  /** B2, B3 — one exact element, once. */
  once(html: string, el: string) {
    return count(html, el) === 1;
  },
  /** B4 — CONTROL: the board now is the board with the old island, but for the island itself. */
  onlyTheIsland(now: string, base: string, islandNow: string, islandBase: string) {
    return (
      islandNow.length > 0 &&
      islandBase.length > 0 &&
      count(now, islandNow) === 1 &&
      count(base, islandBase) === 1 &&
      now.replace(islandNow, '@@') === base.replace(islandBase, '@@')
    );
  },
  /** B6 — the closed board draws no list and no pop-up. */
  nothingOpen(html: string) {
    return (
      html.length > 1000 &&
      !html.includes('data-plan-list=') &&
      !html.includes('data-plan-list-backdrop') &&
      !LIST_WORDS.some((w) => html.includes(w.replace(/’/g, '’')))
    );
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

function layerP(island: string, islandBase: string) {
  section('P — the sources, against Part A’s tip (4851b3f)');
  const changedSince = UNCHANGED.filter((f) => !CHECKS.same(read(f), atRef(BASE, f)));
  assert(
    'P',
    'P1 part 2 SKIPPED: the board, the door’s words and address (home-href.ts), the print door, the print and list libraries, Moment 2 ("Invites, people and nudges") and the old dashboard are byte for byte as at 4851b3f',
    changedSince.length === 0,
    changedSince.join(', ')
  );
  assert(
    'P',
    'P2 the board file keeps no hook, no client marker and no fetch',
    CHECKS.noHook(read(BOARD))
  );
  assert(
    'P',
    'P3 CONTROL: the door is still "Invites & people", to /plan/<id>; "Change who’s on what" still to /setup (the module, loaded)',
    ok(() => {
      const H = require(path.join(ROOT, 'src/lib/events/home-href'));
      return (
        H.BACK_ROOM_LINK === 'Invites & people' &&
        H.backRoomHref('x') === '/plan/x' &&
        H.PLAN_DOOR_LINK === "Change who's on what" &&
        H.planDoorHref('x') === '/plan/x/setup'
      );
    })
  );
  assert(
    'P',
    'P4 the island adds no state: the same three useState and the one useRef as at 4851b3f, and its one useEffect (the Escape listener) gone',
    CHECKS.sameState(island, islandBase)
  );
  assert(
    'P',
    'P5 the island is the browser’s own fold-out: one <details> and one <summary> drawn per list, the list only while open, one items read; no dialog, backdrop, overlay or Escape; no key handling of its own and no link',
    CHECKS.foldOut(island)
  );
}

function layerR(Now: Component | null, Base: Component | null) {
  section('R — the island drawn here, now and as it was at 4851b3f');
  const loaded = !!Now && !!Base;
  assert(
    'R',
    'R1 closed: exactly two fold-out lines, "See menu" then "See assignments", with the board’s door class, and nothing else; the pop-up’s two buttons carried the same words in the same order',
    loaded &&
      ok(
        () =>
          CHECKS.closed(drawIsland(Now!, null)) && CHECKS.baseClosedWords(drawIsland(Base!, null))
      ),
    loaded ? drawIsland(Now!, null) : 'did not load'
  );
  const red: string[] = [];
  for (const s of OPEN_STATES) {
    if (!loaded) break;
    const good = ok(() => {
      const state = [s.which, s.items, s.failed];
      return CHECKS.sameInside(drawIsland(Now!, state), drawIsland(Base!, state), s);
    });
    if (!good) red.push(s.key);
  }
  assert(
    'R',
    `R2 open, in ${OPEN_STATES.length} states (each list with rows, loading, failed, empty): the fold-out holds byte for byte what the pop-up held (heading, Close, the lines and rows), in place under its own line, the other line closed; no dialog, no backdrop`,
    loaded && red.length === 0,
    loaded ? red.join(', ') : 'did not load'
  );
}

async function layerT(Now: Component | null) {
  section('T — the island’s handlers, called with stand-in events');
  if (!Now) {
    ['T1', 'T2', 'T3', 'T4'].forEach((k) => assert('T', `${k} the island did not load`, false));
    return;
  }
  const realFetch = globalThis.fetch;
  const asked: string[] = [];
  const answers: Array<(v: unknown) => void> = [];
  (globalThis as any).fetch = (url: string) => {
    asked.push(url);
    return new Promise((res) => answers.push(res));
  };
  try {
    const tree = treeOf(Now, [null, null, false]);
    const folds = findAll(tree, (el) => el.type === 'details');
    const toggle = (which: string) =>
      folds.find((f) => f.props['data-plan-list-fold'] === which)?.props.onToggle;
    // T1 — opening the menu: the other one folds, the items are read, the menu is shown loading.
    sets.length = 0;
    const other = { open: true };
    const self: any = { open: true };
    const asks: string[] = [];
    self.parentElement = {
      querySelectorAll: (sel: string) => {
        asks.push(sel);
        return [self, other];
      },
    };
    toggle('menu')({ currentTarget: self });
    const t1 = {
      other: other.open,
      self: self.open,
      asks,
      asked: [...asked],
      sets: sets.map((s) => ({ ...s })),
    };
    assert(
      'T',
      'T1 opening "See menu" (a tap, or Enter or Space on its line) folds the other one, reads the items once, and shows the menu loading',
      CHECKS.calls(t1, {
        other: false,
        self: true,
        asks: ['details[data-plan-list-fold][open]'],
        asked: [`/api/events/${EVENT_ID}/items`],
        sets: [
          { slot: 0, value: 'menu' },
          { slot: 1, value: null },
          { slot: 2, value: false },
        ],
      }),
      JSON.stringify(t1)
    );
    // T2 — a late list is not drawn: open assignments, then the menu's answer arrives first.
    const self2: any = { open: true, parentElement: { querySelectorAll: () => [] } };
    toggle('assignments')({ currentTarget: self2 });
    sets.length = 0;
    const answer = (items: unknown[]) => ({ ok: true, json: async () => ({ items: items }) });
    answers[0](answer([{ id: 'late' }]));
    await new Promise((r) => setTimeout(r, 20));
    const afterLate = sets.length;
    answers[1](answer([]));
    await new Promise((r) => setTimeout(r, 20));
    assert(
      'T',
      'T2 a list that arrives after she opened the other is not drawn; the other’s own list is',
      afterLate === 0 && CHECKS.calls(sets, [{ slot: 1, value: [] }]),
      JSON.stringify({ afterLate, sets })
    );
    // T3 — folding draws nothing and reads nothing; it lets go of its own list only.
    sets.length = 0;
    const before = asked.length;
    toggle('menu')({ currentTarget: { open: false } });
    const fn = sets[0]?.value as ((v: unknown) => unknown) | undefined;
    assert(
      'T',
      'T3 folding a list reads nothing and lets go of that list only (menu folded: menu -> nothing, who’s on what stays)',
      sets.length === 1 &&
        typeof fn === 'function' &&
        fn('menu') === null &&
        fn('assignments') === 'assignments' &&
        asked.length === before,
      JSON.stringify(sets)
    );
    // T4 — Close folds it away and puts the focus back on its line.
    const openTree = treeOf(Now, ['menu', ITEMS, false]);
    const close = findAll(
      openTree,
      (el) => el.type === 'button' && el.props['aria-label'] === 'Close'
    );
    let focused = 0;
    const holder: any = {
      open: true,
      querySelector: (s: string) => (s === 'summary' ? { focus: () => focused++ } : null),
    };
    sets.length = 0;
    close[0]?.props.onClick({
      currentTarget: { closest: (s: string) => (s === 'details' ? holder : null) },
    });
    assert(
      'T',
      'T4 Close (the one button inside, as in the pop-up) folds the list away and puts the focus back on its line; it reads nothing',
      close.length === 1 &&
        holder.open === false &&
        focused === 1 &&
        sets.length === 0 &&
        asked.length === before,
      JSON.stringify({ closes: close.length, open: holder.open, focused })
    );
  } finally {
    (globalThis as any).fetch = realFetch;
  }
}

function layerB(islandNow: Component | null, islandBase: Component | null) {
  section('B — the whole board drawn here, with the island now and as it was');
  const boardSrc = read(BOARD);
  const BoardNow = islandNow ? compile(boardSrc, 'src/components/glance', islandNow) : null;
  const BoardBase = islandBase ? compile(boardSrc, 'src/components/glance', islandBase) : null;
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
  const households = [
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
  ];
  const props = (over: Record<string, unknown>) => ({
    glance: {
      eventId: EVENT_ID,
      hostPersonId: 'p-pe-kate',
      asOf: new Date('2026-12-01T00:00:00Z').toISOString(),
      summary: { needYou: 0, withGather: 0, settled: 3 },
      households,
      unhoused: [],
      unassignedCritical: [],
      unassignedOrdinaryCount: 0,
    },
    eventName: 'GTC-421 board',
    actorRole: 'HOST',
    eventDate: 'Friday, 18 December',
    stickyReversals: [],
    now: new Date('2026-12-01T00:00:00Z'),
    afterPress: true,
    printDate: 'Friday, 18 December',
    ...over,
  });
  const draw = (B: Component | null, over: Record<string, unknown> = {}) =>
    B ? renderToStaticMarkup(createElement(B, props(over))) : '';
  const planned = draw(BoardNow);
  const plannedBase = draw(BoardBase);
  const io = draw(BoardNow, { invitesOnly: true });
  const ioBase = draw(BoardBase, { invitesOnly: true });
  const loaded = planned.length > 0 && plannedBase.length > 0;
  assert(
    'B',
    'B1 the door row, in order: See menu, See assignments, Change who’s on what, Invites & people, Print the list (as at 4851b3f, where the first two were buttons)',
    loaded &&
      CHECKS.doorRow(planned, DOOR_ROW) &&
      CHECKS.doorRow(plannedBase, DOOR_ROW) &&
      planned.indexOf('data-plan-list-fold="menu"') < planned.indexOf('data-plan-door'),
    loaded ? '' : 'the board did not draw'
  );
  assert(
    'B',
    'B2 part 2 SKIPPED: the door "Invites & people", to /plan/<id>, is drawn once, exactly as at 4851b3f, on a planned and an invites-only board',
    loaded &&
      CHECKS.once(planned, DOOR_HTML) &&
      CHECKS.once(plannedBase, DOOR_HTML) &&
      CHECKS.once(io, DOOR_HTML)
  );
  assert(
    'B',
    'B3 "Change who’s on what" and "Print the list" exactly as they were, each once',
    loaded &&
      CHECKS.once(planned, PLAN_DOOR_HTML) &&
      CHECKS.once(planned, PRINT_DOOR_HTML) &&
      CHECKS.once(plannedBase, PLAN_DOOR_HTML) &&
      CHECKS.once(plannedBase, PRINT_DOOR_HTML)
  );
  assert(
    'B',
    'B4 CONTROL: the board drawn now is the board drawn with the old island but for the island itself (the closed fold-outs where the two buttons were)',
    loaded &&
      ok(() =>
        CHECKS.onlyTheIsland(
          planned,
          plannedBase,
          drawIsland(islandNow!, null),
          drawIsland(islandBase!, null)
        )
      )
  );
  assert(
    'B',
    'B5 invites-only: neither fold-out, no plan door, no print, the door alone; and that board is the same as at 4851b3f',
    io.length > 1000 &&
      !io.includes('data-plan-list') &&
      !io.includes('<details data-plan-list-fold') &&
      !io.includes('data-plan-door') &&
      !io.includes('data-print-door') &&
      CHECKS.doorRow(io, ['Invites & people']) &&
      io === ioBase
  );
  assert(
    'B',
    'B6 the closed board draws no list and no pop-up: none of the lists’ words, no data-plan-list, no backdrop',
    CHECKS.nothingOpen(planned)
  );
}

function layerU() {
  section('U — CONTROL: what Ticket G touched, between fixed commits');
  const d1 = git(['diff', '--name-only', BASE, CODE_G]);
  assert(
    'U',
    `U1 the files changed between Part A’s tip (4851b3f) and Ticket G’s code commit (${CODE_G.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')}`,
    CHECKS.sameList(d1.status === 0 ? d1.stdout : null, CODE_FILES),
    d1.stdout
  );
  assert(
    'U',
    'U2 the code commit stands straight on Part A’s tip (its one parent)',
    git(['rev-parse', `${CODE_G}^@`]).stdout.trim() === BASE
  );
  const d3 = git(['diff', '--name-only', CODE_G, REBASE_G]);
  assert(
    'U',
    `U3 the re-base commit (${REBASE_G.slice(0, 7)}) stands on the code commit and changed exactly: ${REBASE_FILES.join(', ')}`,
    git(['rev-parse', `${REBASE_G}^@`]).stdout.trim() === CODE_G &&
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
    `U4 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from Part A’s tip by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U5 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since the base',
    tracked.length === 0,
    tracked.join(', ')
  );
}

async function main() {
  const island = read(ISLAND);
  const islandBase = atRef(BASE, ISLAND);
  const Now = compile(island, 'src/components/glance');
  const Base = compile(islandBase, 'src/components/glance');
  layerP(island, islandBase);
  layerR(Now, Base);
  await layerT(Now);
  layerB(Now, Base);
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS and the helpers only (TWEAKS_G_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_G_DRY_RUN !== '1') void main();
