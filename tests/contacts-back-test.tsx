/**
 * [[GTC-470]] — THE CONTACTS PAGES GET "← Your events", THE FOUR MOMENTS, AND A "Go back" BUTTON.
 *
 * WHAT THIS PINS, IN PLAIN WORDS. Both contacts pages (the real screen, and the note a sample visitor
 * sees) draw one top bar: "← Your events" on the left, a "Go back" button on the right, and, only when
 * she came from an event, the four Moments row under them. Go back goes one of three places (the
 * household form she left, the screen she was on, or Your events). The Moments row is tappable: its
 * doors come from the same one rule the setup page uses (`stripDoors`), worked out from three plain
 * reads (the event's households, the event, its summary); while they load, and if any fails, it is a
 * plain display. A household she left half typed keeps the setup page's own guard (W9 and W9b), told
 * by a read-only "is a draft kept" helper that never writes, removes or returns what was typed.
 *
 *   B  the words and the bar: "Go back" (W18 as ruled by R4), "← Your events" (W1 of GTC-367)
 *   R  the real screen: from an event, with no event, signed out, and the bar's place in the page
 *   T  the tappable row: the doors, the facts, the three reads, the guard, the real drawing, the helper
 *   G  the rule for Go back; and what this ticket may not touch
 *
 * Every expected value is typed here by hand, never taken from the code under test. HOW IT IS RUN: no
 * browser, no database, no server, no network. As `contacts-page-test.tsx` does, it compiles the LIVE
 * source of the screen with esbuild, gives it a small stand-in for React's hooks and a window that keeps
 * a record of what it is told, walks the element tree and calls the real handlers. A file that is not
 * there yet is a red check that says so, not a crash.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-back-test.tsx  (npm run test:contacts-back)
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { isDeepStrictEqual } from 'util';
import * as ReactAll from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import { ViewerIdContext } from '../src/components/shared/Providers';
import { writeDraft, draftKey } from '../src/lib/households/form-draft';

const ROOT = path.join(__dirname, '..');
/** Main's tip when this ticket was planned (the merge of pull request 111). */
const BASE = '2491795';
/** [[GTC-474]] (ruling 3): this ticket's own code commit, where G3 reads its diff. */
const GTC470_CODE = '0754b6e32889bccb97ed971c39f98a8662d28bcd';
const TICKET = 'docs/tickets/GTC-460.md';
const SCREEN = 'src/components/contacts/ContactsScreen.tsx';
const NOTE = 'src/components/contacts/SampleContactsNote.tsx';
const TOPBAR = 'src/components/contacts/TopBar.tsx';
const WORDS = 'src/lib/contacts/words.ts';
const ADDRESS = 'src/lib/contacts/address.ts';
const FACTS = 'src/lib/contacts/strip-facts.ts';
const KEPT = 'src/lib/contacts/draft-kept.ts';
const HREFS = 'src/lib/moments/strip-hrefs.ts';

// ── The words, typed by hand ─────────────────────────────────────────────────
const YOUR_EVENTS = '← Your events';
const GO_BACK = 'Go back';
/** W6, W7, W8 of GTC-367: the three locks. W9 and W9b: a household typed, or being changed. */
const W6 = 'You’ll get to “What’s the plan?” once your own household is saved.';
const W7 = 'You’ll get to “Who’s on what?” once you’ve said the plan looks good.';
const W8 = 'You’ll get to “Is everyone sorted?” when you finish “Who’s on what?” and move on.';
const W9 = 'Save this household first, or clear what you’ve typed.';
const W9B = 'Save your changes first, or press Cancel.';
/**
 * [[GTC-471]] W44 and W45, the founder's words (22 Nov 2026), straight apostrophe: what the contacts page says
 * under the Moments row while a household is half done. It has no Save or Cancel of its own, so each sends her
 * back first. Moment 1's own W9 and W9b above are unchanged and still say what they said.
 */
const W44 = 'Go back and save your changes first, or press Cancel.';
const W45 = "Go back and save this household first, or clear what you've typed.";
/** GTC-374 W8: a tap on a not-needed Moment after the press. */
const AFTER_PRESS = 'The invitations have gone as invites only, so there’s no plan to make.';
/** The classes of the seven "← Your events" links on the event screens. */
const LINK_CLASSES =
  'inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
function assert(id: string, label: string, condition: boolean, got?: unknown) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 500)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
function check(id: string, label: string, fn: () => boolean | { ok: boolean; got?: unknown }) {
  try {
    const r = fn();
    if (typeof r === 'boolean') assert(id, label, r);
    else assert(id, label, r.ok, r.got);
  } catch (e) {
    assert(id, label, false, `threw: ${String((e as Error).message).slice(0, 300)}`);
  }
}
async function acheck(
  id: string,
  label: string,
  fn: () => Promise<boolean | { ok: boolean; got?: unknown }>
) {
  try {
    const r = await fn();
    if (typeof r === 'boolean') assert(id, label, r);
    else assert(id, label, r.ok, r.got);
  } catch (e) {
    assert(id, label, false, `threw: ${String((e as Error).message).slice(0, 300)}`);
  }
}

const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const flat = (s: string) => s.replace(/\s+/g, ' ');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(read(rel));
/** Load a file for real (not through the stand-in); a missing file reads "not there yet". */
const real = (rel: string): any => {
  if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`${rel} is not there yet`);
  return require(path.join(ROOT, rel));
};

// ── git, read only ───────────────────────────────────────────────────────────
const git = (args: string[]): string =>
  execFileSync('git', args, {
    cwd: ROOT,
    maxBuffer: 1 << 28,
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
let baseOk = false;
try {
  git(['cat-file', '-e', `${BASE}^{commit}`]);
  baseOk = true;
} catch {
  baseOk = false;
}
const atBase = (rel: string): string => {
  try {
    return git(['show', `${BASE}:${rel}`]);
  } catch {
    return '';
  }
};

// ── The network: three addresses, each answered (or made to fail) on its own ──
type Answer = { status: number | 'throws'; body: unknown };
const requests: Array<{ url: string; init: unknown }> = [];
const answers: { households: Answer; event: Answer; summary: Answer } = {
  households: { status: 404, body: {} },
  event: { status: 404, body: {} },
  summary: { status: 404, body: {} },
};
globalThis.fetch = (async (url: unknown, init?: unknown) => {
  const u = String(url);
  requests.push({ url: u, init });
  const a = /^\/api\/events\/[A-Za-z0-9_-]{1,64}\/summary$/.test(u)
    ? answers.summary
    : /^\/api\/events\/[A-Za-z0-9_-]{1,64}\/households$/.test(u)
      ? answers.households
      : /^\/api\/events\/[A-Za-z0-9_-]{1,64}$/.test(u)
        ? answers.event
        : { status: 404, body: {} };
  if (a.status === 'throws') throw new Error('offline');
  const status = a.status as number;
  return { ok: status === 200, status, json: async () => a.body };
}) as unknown as typeof fetch;
const noAnswers = () => {
  answers.households = { status: 404, body: {} };
  answers.event = { status: 404, body: {} };
  answers.summary = { status: 404, body: {} };
};

// ── Browser storage, in memory, that counts what it is told ──────────────────
class MemStore {
  m = new Map<string, string>();
  calls = 0;
  sets = 0;
  removes = 0;
  failRead = false;
  get length() {
    this.calls++;
    return this.m.size;
  }
  key(i: number) {
    this.calls++;
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.calls++;
    if (this.failRead) throw new Error('SecurityError');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.calls++;
    this.sets++;
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
    this.removes++;
    this.m.delete(k);
  }
  snapshot() {
    return JSON.stringify([...this.m]);
  }
}

interface Win {
  localStorage: MemStore;
  sessionStorage: MemStore;
  location: { search: string; origin: string; assign(href: string): void };
  history: { length: number; back(): void };
  document: { referrer: string };
  assigned: string[];
  backs: number;
  listeners: Record<string, Array<(e: any) => void>>;
  addEventListener(t: string, f: (e: any) => void): void;
  removeEventListener(t: string, f: (e: any) => void): void;
}
interface WinOpts {
  search?: string;
  local?: MemStore;
  session?: MemStore;
  referrer?: string;
  origin?: string;
  historyLength?: number;
}
const SITE = 'https://gather.example';
function makeWindow(o: WinOpts = {}): Win {
  const w: Win = {
    localStorage: o.local ?? new MemStore(),
    sessionStorage: o.session ?? new MemStore(),
    location: {
      search: o.search ?? '',
      origin: o.origin ?? SITE,
      assign(href: string) {
        w.assigned.push(href);
      },
    },
    history: {
      length: o.historyLength ?? 1,
      back() {
        w.backs++;
      },
    },
    document: { referrer: o.referrer ?? '' },
    assigned: [],
    backs: 0,
    listeners: {},
    addEventListener(t, f) {
      (w.listeners[t] ??= []).push(f);
    },
    removeEventListener(t, f) {
      w.listeners[t] = (w.listeners[t] ?? []).filter((x) => x !== f);
    },
  };
  return w;
}

// ── A stand-in for React's hooks: state kept between renders, effects run after each ──
interface Fiber {
  comp: (props: any) => any;
  slots: any[];
  pos: number;
  pending: Array<{ i: number; fn: () => void | (() => void) }>;
  dirty: boolean;
  viewerId: string | null;
  win: Win;
  props: Record<string, any>;
  tree: any;
}
let cur: Fiber | null = null;
const Real: any = ReactAll;
const depsChanged = (a?: unknown[], b?: unknown[]) =>
  !a || !b || a.length !== b.length || a.some((x, i) => !Object.is(x, b[i]));
function memo(fn: () => any, deps?: unknown[]) {
  const f = cur!;
  const i = f.pos++;
  const prev = f.slots[i];
  if (prev && !depsChanged(prev.deps, deps)) return prev.v;
  const v = fn();
  f.slots[i] = { deps, v };
  return v;
}
function effect(fn: () => void | (() => void), deps?: unknown[]) {
  const f = cur!;
  const i = f.pos++;
  const prev = f.slots[i];
  const changed = !prev || depsChanged(prev.deps, deps);
  f.slots[i] = { deps, cleanup: prev?.cleanup };
  if (changed) f.pending.push({ i, fn });
}
const FAKE_REACT: any = {
  ...ReactAll,
  useState(init: any) {
    if (!cur) return Real.useState(init);
    const f = cur;
    const i = f.pos++;
    let s = f.slots[i];
    if (!s) {
      s = f.slots[i] = { v: typeof init === 'function' ? init() : init };
      s.set = (u: any) => {
        const nv = typeof u === 'function' ? u(s.v) : u;
        if (!Object.is(nv, s.v)) {
          s.v = nv;
          f.dirty = true;
        }
      };
    }
    return [s.v, s.set];
  },
  useRef(init: any) {
    if (!cur) return Real.useRef(init);
    const i = cur.pos++;
    return (cur.slots[i] ??= { current: init });
  },
  useMemo(fn: () => any, deps?: unknown[]) {
    return cur ? memo(fn, deps) : Real.useMemo(fn, deps);
  },
  useCallback(fn: any, deps?: unknown[]) {
    return cur ? memo(() => fn, deps) : Real.useCallback(fn, deps);
  },
  useEffect(fn: any, deps?: unknown[]) {
    return cur ? effect(fn, deps) : Real.useEffect(fn, deps);
  },
  useLayoutEffect(fn: any, deps?: unknown[]) {
    return cur ? effect(fn, deps) : Real.useLayoutEffect(fn, deps);
  },
  useContext(ctx: any) {
    if (!cur) return Real.useContext(ctx);
    return ctx === ViewerIdContext ? cur.viewerId : ctx._currentValue;
  },
};
let refreshCalls = 0;
const NAV_STUB = {
  useRouter: () => ({
    refresh: () => void refreshCalls++,
    push() {},
    replace() {},
    back() {},
  }),
};

// ── The live source of the screen, compiled; everything else is loaded for real ──
const LIVE = new Set([SCREEN]);
const compiled = new Map<string, any>();
function resolveFile(target: string): string | null {
  for (const ext of ['.tsx', '.ts']) {
    if (fs.existsSync(path.join(ROOT, target + ext))) return target + ext;
  }
  return null;
}
function loadLive(rel: string): any {
  if (compiled.has(rel)) return compiled.get(rel);
  const source = read(rel);
  if (!source) throw new Error(`${rel} is not there yet`);
  const out = transformSync(source, {
    loader: rel.endsWith('x') ? 'tsx' : 'ts',
    format: 'cjs',
    jsx: 'automatic',
    target: 'es2020',
  }).code;
  const m: { exports: any } = { exports: {} };
  compiled.set(rel, m.exports);
  const dir = path.dirname(rel);
  const need = (target: string): any => {
    const file = resolveFile(target);
    if (!file) throw new Error(`${target} is not there yet`);
    return LIVE.has(file) ? loadLive(file) : require(path.join(ROOT, file));
  };
  const req = (id: string): any => {
    if (id === 'react') return FAKE_REACT;
    if (id === 'next/navigation') return NAV_STUB;
    if (id.startsWith('@/')) return need('src/' + id.slice(2));
    if (id.startsWith('./') || id.startsWith('../')) return need(path.join(dir, id));
    return require(id);
  };
  new Function('require', 'module', 'exports', out)(req, m, m.exports);
  compiled.set(rel, m.exports);
  return m.exports;
}

function withWindow<T>(w: Win, fn: () => T): T {
  const g = globalThis as any;
  const before = { window: g.window, document: g.document };
  g.window = w;
  g.document = w.document;
  try {
    return fn();
  } finally {
    for (const k of ['window', 'document'] as const) {
      if (before[k] === undefined) delete g[k];
      else g[k] = before[k];
    }
  }
}
function renderOnce(f: Fiber) {
  cur = f;
  f.pos = 0;
  f.pending = [];
  try {
    withWindow(f.win, () => {
      f.tree = f.comp(f.props);
    });
  } finally {
    cur = null;
  }
}
function flushEffects(f: Fiber) {
  withWindow(f.win, () => {
    for (const { i, fn } of f.pending) {
      const slot = f.slots[i];
      if (typeof slot.cleanup === 'function') slot.cleanup();
      const c = fn();
      slot.cleanup = typeof c === 'function' ? c : undefined;
    }
  });
  f.pending = [];
}
function settle(f: Fiber) {
  for (let n = 0; n < 60; n++) {
    f.dirty = false;
    renderOnce(f);
    flushEffects(f);
    if (!f.dirty) return;
  }
  throw new Error('did not settle after 60 renders');
}

// ── The element tree ─────────────────────────────────────────────────────────
type El = { type: any; props: Record<string, any> };
const isEl = (n: any): n is El => !!n && typeof n === 'object' && 'props' in n && 'type' in n;
function* walk(n: any): Generator<El> {
  if (n == null || typeof n === 'boolean') return;
  if (Array.isArray(n)) {
    for (const c of n) yield* walk(c);
    return;
  }
  if (isEl(n)) {
    yield n;
    yield* walk(n.props.children);
  }
}
function textOf(n: any): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  return isEl(n) ? textOf(n.props.children) : '';
}
const all = (tree: any, pred: (e: El) => boolean) => [...walk(tree)].filter(pred);
const byAttr = (tree: any, attr: string) => all(tree, (e) => attr in e.props)[0];
const buttons = (tree: any) => all(tree, (e) => e.type === 'button');
const goBackButton = (tree: any) => buttons(tree).find((b) => textOf(b).trim() === GO_BACK);
const links = (tree: any) => all(tree, (e) => e.type === 'a');
/** The Moments row: the wrapper's attribute, then the strip inside it. */
const rowWrap = (tree: any) => byAttr(tree, 'data-contacts-moments');
const arcOf = (tree: any) => {
  const w = rowWrap(tree);
  return w ? all(w, (e) => 'currentMoment' in e.props)[0] : undefined;
};

interface Inst {
  f: Fiber;
  win: Win;
  first: any;
  tree: () => any;
  act: (fn: () => unknown) => void;
  settleAsync: () => Promise<void>;
}
function mountScreen(viewerId: string | null, o: WinOpts = {}): Inst {
  refreshCalls = 0;
  const comp = loadLive(SCREEN).default;
  const win = makeWindow(o);
  const f: Fiber = {
    comp,
    slots: [],
    pos: 0,
    pending: [],
    dirty: false,
    viewerId,
    win,
    props: {},
    tree: null,
  };
  renderOnce(f);
  const first = f.tree;
  flushEffects(f);
  settle(f);
  return {
    f,
    win,
    first,
    tree: () => f.tree,
    act(fn) {
      withWindow(win, fn);
      settle(f);
    },
    async settleAsync() {
      for (let n = 0; n < 8; n++) {
        await new Promise((r) => setTimeout(r, 0));
        withWindow(win, () => settle(f));
      }
    },
  };
}
const press = (i: Inst, el: El | undefined) => {
  if (!el) throw new Error('a control to press is not on screen');
  i.act(() => el.props.onClick({ preventDefault() {} }));
};

// ── Replies the three reads can bring, typed by hand ─────────────────────────
const eventBody = (
  over: Record<string, unknown> = {},
  setup: Record<string, unknown> | null = {}
) => ({
  event: {
    id: 'ev1',
    status: 'DRAFT',
    sentAt: null,
    ...over,
    setup:
      setup === null
        ? null
        : {
            id: 's1',
            planApprovedAt: null,
            eventType: null,
            eventTypeOther: null,
            invitesOnly: false,
            ...setup,
          },
  },
});
const summaryBody = (teamCount: number) => ({
  teamCount,
  itemCount: 0,
  taskCount: 0,
  criticalItemCount: 0,
  criticalAssignedCount: 0,
  criticalUnassignedCount: 0,
  acknowledgedConflictsCount: 0,
  criticalPlaceholderCount: 0,
});
const hostHousehold = {
  id: 'hh1',
  members: [
    { id: 'pe1', role: 'HOST', householdRole: 'PRIMARY_CONTACT', person: { name: 'Kate' } },
  ],
};
/** All three reads good. `hosted`: her own household is saved. */
function answerAll(
  opts: {
    event?: Record<string, unknown>;
    setup?: Record<string, unknown> | null;
    teams?: number;
    hosted?: boolean;
  } = {}
) {
  answers.event = {
    status: 200,
    body: eventBody(opts.event ?? {}, opts.setup === undefined ? {} : opts.setup),
  };
  answers.summary = { status: 200, body: summaryBody(opts.teams ?? 0) };
  answers.households = { status: 200, body: { households: opts.hosted ? [hostHousehold] : [] } };
}
const STATE = {
  name: 'Kate',
  email: '',
  phone: '',
  showPartner: false,
  partner: { name: '', email: '', phone: '' },
  helpers: [],
  showLittles: false,
  littleCount: 1,
  guests: [],
  order: [],
  contactPersonEventId: null,
  hostingAlone: false,
  messagesMuted: false,
};
const FACTS0 = {
  hostSaved: false,
  hasPlan: false,
  planApproved: false,
  held: false,
  sent: false,
  invitesOnly: false,
};

async function main() {
  // The request spy sees a call, so "no request" below is not green for nothing.
  void globalThis.fetch('/spy');
  check('S0', 'the request spy sees a call (so every "no request" below means something)', () => {
    const seen = requests.length === 1;
    requests.length = 0;
    return { ok: seen, got: seen };
  });

  // ══ B — THE WORDS AND THE BAR ═══════════════════════════════════════════════
  section('B — the words and the bar');
  check(
    'B1',
    'W18 says "Go back" in words.ts and in the ticket\'s W-list, and "Back to your households" is nowhere under src',
    () => {
      const W = real(WORDS).CONTACTS_WORDS;
      const ticket = flat(read(TICKET));
      const a = ticket.indexOf('#### 7. The W-lines, for the founder');
      const b = ticket.indexOf('#### 8. The tests');
      const section7 = a >= 0 && b > a ? ticket.slice(a, b) : '';
      const holders: string[] = [];
      const walkSrc = (dir: string) => {
        for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
          const rel = `${dir}/${e.name}`;
          if (e.isDirectory()) walkSrc(rel);
          else if (/\.(ts|tsx)$/.test(e.name) && read(rel).includes('Back to your households'))
            holders.push(rel);
        }
      };
      walkSrc('src');
      return {
        ok: W.BACK === GO_BACK && section7.includes(`*"${GO_BACK}"*`) && holders.length === 0,
        got: { back: W.BACK, inTicket: section7.includes(`*"${GO_BACK}"*`), holders },
      };
    }
  );
  check(
    'B2',
    '"← Your events" is STRIP_WORDS.YOUR_EVENTS, a plain link to /plan/events in the event screens\' classes',
    () => {
      const strip = real('src/lib/moments/strip.ts').STRIP_WORDS;
      const bar = real(TOPBAR).renderTopBar({ showMoments: false, doors: null, onGoBack() {} });
      const a = links(bar);
      return {
        ok:
          strip.YOUR_EVENTS === YOUR_EVENTS &&
          a.length === 1 &&
          textOf(a[0]) === YOUR_EVENTS &&
          a[0].props.href === '/plan/events' &&
          !('target' in a[0].props) &&
          !('onClick' in a[0].props) &&
          a[0].props.className === LINK_CLASSES,
        got: a.map((x) => [x.props.href, x.props.className, textOf(x)]),
      };
    }
  );
  check(
    'B3',
    'the bar\'s only words are "← Your events" and "Go back" (the row\'s labels are MomentArc\'s own)',
    () => {
      const topBar = real(TOPBAR);
      const withRow = topBar.renderTopBar({ showMoments: true, doors: {}, onGoBack() {} });
      const noRow = topBar.renderTopBar({ showMoments: false, doors: null, onGoBack() {} });
      return {
        ok:
          textOf(withRow) === `${YOUR_EVENTS}${GO_BACK}` &&
          textOf(noRow) === `${YOUR_EVENTS}${GO_BACK}`,
        got: [textOf(withRow), textOf(noRow)],
      };
    }
  );

  check(
    'B4',
    'W44 and W45 are exactly the two sentences ruled for the contacts page (straight apostrophe, each beginning "Go back and"), they are in the GTC-460 word list, and Moment 1\'s own two lines are exactly as they were',
    () => {
      const W = real(WORDS).CONTACTS_WORDS;
      const strip = real('src/lib/moments/strip.ts').STRIP_WORDS;
      const ticket = flat(read(TICKET));
      const a = ticket.indexOf('#### 7. The W-lines, for the founder');
      const b = ticket.indexOf('#### 8. The tests');
      const section7 = a >= 0 && b > a ? ticket.slice(a, b) : '';
      const rows: Array<[string, boolean]> = [
        ['W44 in words.ts', W.LOCKED_CHANGING === W44],
        ['W45 in words.ts', W.LOCKED_TYPED === W45],
        ['no curly apostrophe in either', !/[‘’]/.test(`${W.LOCKED_CHANGING}${W.LOCKED_TYPED}`)],
        [
          'each begins "Go back and"',
          W44.startsWith('Go back and ') && W45.startsWith('Go back and '),
        ],
        ['W44 in the ticket list', section7.includes(`*"${W44}"*`)],
        ['W45 in the ticket list', section7.includes(`*"${W45}"*`)],
        ['Moment 1 says W9b as before', strip.SAVE_CHANGES === W9B],
        ['Moment 1 says W9 as before', strip.SAVE_NEW_HOUSEHOLD === W9],
      ];
      const wrong = rows.filter(([, good]) => !good).map(([n]) => n);
      return { ok: wrong.length === 0, got: wrong };
    }
  );

  // ══ R — THE REAL SCREEN ═════════════════════════════════════════════════════
  section('R — the real screen');
  const ADDRESSES: Array<[string, string]> = [
    ['?event=ev1', '/plan/ev1/setup?at=people'],
    ['?event=ev1&form=host', '/plan/ev1/setup?at=people'],
    ['?event=ev1&edit=hh1', '/plan/ev1/setup?at=people&edit=hh1'],
  ];
  await acheck(
    'R1',
    "from an event (plain, her own household's step, a household being changed): the link, the Moments row (Moment 1, no ticks) and Go back; Go back goes to the form she left, changes nothing stored, and does not use the browser's back",
    async () => {
      noAnswers();
      const bad: unknown[] = [];
      for (const [search, to] of ADDRESSES) {
        const local = new MemStore();
        const session = new MemStore();
        local.m.set(
          'gather:contacts:v1:user-a',
          JSON.stringify({ v: 1, userId: 'user-a', contacts: [] })
        );
        const i = mountScreen('user-a', {
          search,
          local,
          session,
          referrer: `${SITE}/plan/events`,
          historyLength: 5,
        });
        await i.settleAsync();
        const arc = arcOf(i.tree());
        const before = [local.snapshot(), session.snapshot()];
        const btn = goBackButton(i.tree());
        if (btn) press(i, btn);
        const after = [local.snapshot(), session.snapshot()];
        const okHere =
          links(i.tree()).some(
            (a) => textOf(a) === YOUR_EVENTS && a.props.href === '/plan/events'
          ) &&
          !!btn &&
          !!arc &&
          arc.props.currentMoment === 1 &&
          arc.props.completedMoments === undefined &&
          typeof arc.props.doors === 'object' &&
          i.win.assigned.join() === to &&
          i.win.backs === 0 &&
          isDeepStrictEqual(before, after);
        if (!okHere)
          bad.push({
            search,
            assigned: i.win.assigned,
            backs: i.win.backs,
            row: !!arc,
            btn: !!btn,
          });
      }
      return { ok: bad.length === 0, got: bad };
    }
  );
  await acheck(
    'R2',
    "with no event or a bad id: the link and Go back, no Moments row; Go back follows the rule (the browser's back for a page of this site with history, else Your events)",
    async () => {
      noAnswers();
      const bad: unknown[] = [];
      const noEvent = [
        '',
        '?event=',
        '?event=../../x',
        '?event=a b',
        '?event=javascript:alert(1)',
        '?edit=hh1',
      ];
      const cases: Array<{ label: string; o: WinOpts; backs: number; assigned: string[] }> = [
        {
          label: 'a page of this site, with history',
          o: { referrer: `${SITE}/plan/new`, historyLength: 3 },
          backs: 1,
          assigned: [],
        },
        {
          label: 'no referrer (typed address, new tab)',
          o: { referrer: '', historyLength: 2 },
          backs: 0,
          assigned: ['/plan/events'],
        },
        {
          label: 'another site',
          o: { referrer: 'https://other.example/x', historyLength: 4 },
          backs: 0,
          assigned: ['/plan/events'],
        },
        {
          label: 'a lookalike host',
          o: { referrer: 'https://gather.example.evil.com/x', historyLength: 4 },
          backs: 0,
          assigned: ['/plan/events'],
        },
        {
          label: 'a javascript: referrer',
          o: { referrer: 'javascript:alert(1)', historyLength: 4 },
          backs: 0,
          assigned: ['/plan/events'],
        },
        {
          label: 'this site but a tab with one page',
          o: { referrer: `${SITE}/plan/new`, historyLength: 1 },
          backs: 0,
          assigned: ['/plan/events'],
        },
      ];
      for (const search of noEvent) {
        for (const c of cases) {
          const i = mountScreen('user-a', { search, ...c.o });
          await i.settleAsync();
          const btn = goBackButton(i.tree());
          if (btn) press(i, btn);
          const okHere =
            !!btn &&
            !rowWrap(i.tree()) &&
            links(i.tree()).some((a) => textOf(a) === YOUR_EVENTS) &&
            i.win.backs === c.backs &&
            isDeepStrictEqual(i.win.assigned, c.assigned);
          if (!okHere)
            bad.push({
              search,
              case: c.label,
              backs: i.win.backs,
              assigned: i.win.assigned,
              btn: !!btn,
              row: !!rowWrap(i.tree()),
            });
        }
      }
      return { ok: bad.length === 0, got: bad.slice(0, 4) };
    }
  );
  await acheck(
    'R3',
    'signed out, a browser that refuses storage, an empty list: the bar is still drawn, and pressing touches no storage and makes no request',
    async () => {
      noAnswers();
      const bad: unknown[] = [];
      const kinds: Array<[string, string | null, (l: MemStore) => void]> = [
        ['signed out', null, () => {}],
        ['storage refused', 'user-a', (l) => (l.failRead = true)],
        ['empty list', 'user-a', () => {}],
      ];
      for (const [label, viewer, prep] of kinds) {
        const local = new MemStore();
        prep(local);
        const i = mountScreen(viewer, { local, referrer: `${SITE}/plan/events`, historyLength: 3 });
        await i.settleAsync();
        requests.length = 0;
        const callsBefore = local.calls;
        const btn = goBackButton(i.tree());
        if (btn) press(i, btn);
        const okHere =
          !!btn &&
          links(i.tree()).some((a) => textOf(a) === YOUR_EVENTS) &&
          i.win.backs === 1 &&
          local.calls === callsBefore &&
          local.sets === 0 &&
          local.removes === 0 &&
          requests.length === 0;
        if (!okHere)
          bad.push({
            label,
            btn: !!btn,
            backs: i.win.backs,
            calls: local.calls - callsBefore,
            requests: requests.length,
          });
      }
      return { ok: bad.length === 0, got: bad };
    }
  );
  await acheck(
    'R4',
    'the bar is above the title; Go back is a real button (type="button", its own words as its name, no aria-label)',
    async () => {
      noAnswers();
      const i = mountScreen('user-a', { search: '?event=ev1' });
      await i.settleAsync();
      const order = [...walk(i.tree())];
      const at = (pred: (e: El) => boolean) => order.findIndex(pred);
      const link = at((e) => e.type === 'a' && textOf(e) === YOUR_EVENTS);
      const btnAt = at((e) => e.type === 'button' && textOf(e).trim() === GO_BACK);
      const h1 = at((e) => e.type === 'h1');
      const btn = order[btnAt];
      return {
        ok:
          link >= 0 &&
          link < btnAt &&
          btnAt < h1 &&
          btn?.props.type === 'button' &&
          !('aria-label' in btn.props) &&
          'data-contacts-back' in btn.props,
        got: { link, btnAt, h1, type: btn?.props.type },
      };
    }
  );

  // ══ T — THE TAPPABLE ROW ════════════════════════════════════════════════════
  section('T — the tappable Moments row');
  const mod = (rel: string) => real(rel);
  check(
    'T1',
    'the doors from the facts: fresh (W6, W7, W8 locked), host saved, plan made, approved, held, sent, invites only before and after the press, and the guard (W9, W9b)',
    () => {
      const { momentDoors } = mod(HREFS);
      const d = (
        current: 1 | 2 | 3 | 4,
        f: Partial<typeof FACTS0>,
        blocked: string | null = null
      ) => momentDoors('ev1', current, { ...FACTS0, ...f }, blocked);
      const cases: Array<[string, unknown, unknown]> = [
        ['fresh', d(1, {}), { 2: { locked: W6 }, 3: { locked: W7 }, 4: { locked: W8 } }],
        [
          'host saved',
          d(1, { hostSaved: true }),
          { 2: { href: '/plan/ev1/setup?at=opening' }, 3: { locked: W7 }, 4: { locked: W8 } },
        ],
        [
          'plan made',
          d(1, { hostSaved: true, hasPlan: true }),
          { 2: { href: '/plan/ev1/setup?at=plan' }, 3: { locked: W7 }, 4: { locked: W8 } },
        ],
        [
          'approved',
          d(1, { hostSaved: true, hasPlan: true, planApproved: true }),
          {
            2: { href: '/plan/ev1/setup?at=plan' },
            3: { href: '/plan/ev1/setup' },
            4: { locked: W8 },
          },
        ],
        [
          'held',
          d(1, { hostSaved: true, hasPlan: true, planApproved: true, held: true }),
          {
            2: { href: '/plan/ev1/setup?at=plan' },
            3: { href: '/plan/ev1/setup' },
            4: { href: '/plan/ev1/pre-flight' },
          },
        ],
        [
          'sent',
          d(1, { hostSaved: true, hasPlan: true, planApproved: true, held: true, sent: true }),
          {
            2: { href: '/plan/ev1/setup?at=plan' },
            3: { href: '/plan/ev1/setup' },
            4: { href: '/plan/ev1/glance' },
          },
        ],
        [
          'invites only, before the press',
          d(1, { hostSaved: true, invitesOnly: true }),
          {
            2: { href: '/plan/ev1/setup?at=opening', notNeeded: true },
            3: { href: '/plan/ev1/setup?at=opening', notNeeded: true },
            4: { locked: W8 },
          },
        ],
        [
          'invites only, after the press',
          d(1, { hostSaved: true, invitesOnly: true, held: true, sent: true }),
          {
            2: { locked: AFTER_PRESS, notNeeded: true },
            3: { locked: AFTER_PRESS, notNeeded: true },
            4: { href: '/plan/ev1/glance' },
          },
        ],
        [
          'guard W9 over open doors, W8 stays',
          d(1, { hostSaved: true, hasPlan: true, planApproved: true }, W9),
          { 2: { locked: W9 }, 3: { locked: W9 }, 4: { locked: W8 } },
        ],
        [
          'guard W9b, with a not-needed Moment',
          d(1, { hostSaved: true, invitesOnly: true }, W9B),
          {
            2: { locked: W9B, notNeeded: true },
            3: { locked: W9B, notNeeded: true },
            4: { locked: W8 },
          },
        ],
        [
          'the current Moment has no door',
          momentDoors('ev1', 3, { ...FACTS0, hostSaved: true, hasPlan: true, planApproved: true }),
          {
            1: { href: '/plan/ev1/setup?at=people' },
            2: { href: '/plan/ev1/setup?at=plan' },
            4: { locked: W8 },
          },
        ],
      ];
      const wrong = cases
        .filter(([, got, want]) => !isDeepStrictEqual(got, want))
        .map(([n, got]) => ({ n, got }));
      const noHandlers = cases.every(([, got]) =>
        Object.values(got as Record<string, object>).every((x) => !('onGo' in x))
      );
      return { ok: wrong.length === 0 && noHandlers, got: wrong.slice(0, 2) };
    }
  );
  check(
    'T2',
    "momentDoors agrees with moment4Doors (the glance board's) for Moment 4's facts, all four ways",
    () => {
      const { momentDoors, moment4Doors } = mod(HREFS);
      const bad: unknown[] = [];
      for (const sent of [false, true]) {
        for (const invitesOnly of [false, true]) {
          const a = momentDoors('ev1', 4, {
            hostSaved: true,
            hasPlan: true,
            planApproved: true,
            held: true,
            sent,
            invitesOnly,
          });
          const b = moment4Doors('ev1', { sent, invitesOnly });
          if (!isDeepStrictEqual(a, b)) bad.push({ sent, invitesOnly, a, b });
        }
      }
      return { ok: bad.length === 0, got: bad };
    }
  );
  check(
    'T3',
    "the replies to the six facts (the setup page's own rules); a record-less event, a missing, garbled or odd reply gives none",
    () => {
      const { stripFactsFrom } = mod(FACTS);
      const f = (event: unknown, summary: unknown, households: unknown) =>
        stripFactsFrom({ event, summary, households });
      const ok = (e: unknown, s: unknown, h: unknown, want: Partial<typeof FACTS0>) =>
        isDeepStrictEqual(f(e, s, h), { ...FACTS0, ...want });
      const none = (e: unknown, s: unknown, h: unknown) => f(e, s, h) === null;
      const E = eventBody();
      const S = summaryBody(0);
      const rows: Array<[string, boolean]> = [
        ['fresh', ok(E, S, [], {})],
        [
          'a kind chosen: Moment 2 has begun, so her household counts as saved',
          ok(eventBody({}, { eventType: 'CHRISTMAS' }), S, [], { hostSaved: true }),
        ],
        ['a HOST member in a household', ok(E, S, [hostHousehold], { hostSaved: true })],
        [
          'a member who is not the host does not count',
          ok(E, S, [{ id: 'hh2', members: [{ role: 'PARTICIPANT' }] }], {}),
        ],
        ['a section (any section or any item)', ok(E, summaryBody(3), [], { hasPlan: true })],
        [
          'approved',
          ok(eventBody({}, { planApprovedAt: '2026-11-20T00:00:00.000Z' }), S, [], {
            hostSaved: true,
            planApproved: true,
          }),
        ],
        [
          'held: any status but DRAFT',
          ok(eventBody({ status: 'CONFIRMING' }), S, [], { held: true }),
        ],
        ['sent', ok(eventBody({ sentAt: '2026-11-21T00:00:00.000Z' }), S, [], { sent: true })],
        [
          'invites only',
          ok(eventBody({}, { invitesOnly: true }), S, [], { hostSaved: true, invitesOnly: true }),
        ],
        ['no setup record (an old-style event)', none(eventBody({}, null), S, [])],
        ['no event key', none({}, S, [])],
        ['event null', none(null, S, [])],
        ['summary null', none(E, null, [])],
        ['teamCount missing', none(E, {}, [])],
        ['teamCount a string', none(E, { teamCount: '3' }, [])],
        ['teamCount negative', none(E, { teamCount: -1 }, [])],
        ['teamCount not finite', none(E, { teamCount: Infinity }, [])],
        ['households null', none(E, S, null)],
        ['households an object', none(E, S, {})],
        ['everything a string', none('x', 'y', 'z')],
        ['arrays where objects go', none([], [], [])],
        ['status missing', none({ event: { sentAt: null, setup: {} } }, S, [])],
      ];
      const wrong = rows.filter(([, good]) => !good).map(([n]) => n);
      return { ok: wrong.length === 0, got: wrong };
    }
  );
  check(
    'T3b',
    "the guard's line: edit gives W44 (even with no draft), her own household's step none, the new-household form W45 only when a draft is kept, no event none",
    () => {
      const { blockedLine } = mod(FACTS);
      const a = (over: Record<string, unknown>) => ({
        eventId: 'ev1',
        form: null,
        editId: null,
        ...over,
      });
      const rows: Array<[string, unknown, unknown]> = [
        ['edit, no draft', blockedLine(a({ editId: 'hh1' }), false), W44],
        ['edit, draft kept: edit wins', blockedLine(a({ editId: 'hh1' }), true), W44],
        ['host step, draft kept', blockedLine(a({ form: 'host' }), true), null],
        ['host step, none kept', blockedLine(a({ form: 'host' }), false), null],
        ['plain, draft kept', blockedLine(a({}), true), W45],
        ['plain, none kept', blockedLine(a({}), false), null],
        ['no event', blockedLine({ eventId: null, form: null, editId: null }, true), null],
      ];
      const wrong = rows.filter(([, got, want]) => got !== want).map(([n, got]) => [n, got]);
      return { ok: wrong.length === 0, got: wrong };
    }
  );

  // The doors of an event whose plan is approved and not yet held, and the same under the guard: typed
  // here by hand, never asked of the code under test (a broken momentDoors must not agree with itself).
  const OPEN_DOORS = {
    2: { href: '/plan/ev1/setup?at=plan' },
    3: { href: '/plan/ev1/setup' },
    4: { locked: W8 },
  };
  const lockedBy = (line: string) => ({
    2: { locked: line },
    3: { locked: line },
    4: { locked: W8 },
  });
  await acheck(
    'T4',
    'from an event: three plain GETs and no others; the row is a plain display while they load and has its doors when all three are good; each failing in turn, an offline throw, a refusal or a record-less event leave it plain, with no words and no ticks',
    async () => {
      const problems: unknown[] = [];
      // The three reads, from an event only.
      answerAll({
        teams: 2,
        hosted: true,
        event: { status: 'DRAFT' },
        setup: { planApprovedAt: '2026-11-20T00:00:00.000Z' },
      });
      requests.length = 0;
      const i = mountScreen('user-a', { search: '?event=ev1' });
      const waiting = arcOf(i.tree());
      const waitingPlain = !!waiting && isDeepStrictEqual(waiting.props.doors, {});
      await i.settleAsync();
      const asked = requests
        .map((r) => [r.url, r.init === undefined])
        .sort((x, y) => ((x[0] as string) < (y[0] as string) ? -1 : 1));
      if (
        !isDeepStrictEqual(asked, [
          ['/api/events/ev1', true],
          ['/api/events/ev1/households', true],
          ['/api/events/ev1/summary', true],
        ])
      )
        problems.push({ asked });
      if (!waitingPlain) problems.push({ whileLoading: waiting?.props.doors });
      const arc = arcOf(i.tree());
      const want = OPEN_DOORS;
      if (!arc || !isDeepStrictEqual(arc.props.doors, want))
        problems.push({ doors: arc?.props.doors, want });
      if (arc && arc.props.completedMoments !== undefined)
        problems.push({ ticks: arc.props.completedMoments });
      // None of the reads without an event, with a bad id, or signed out.
      for (const [search, viewer] of [
        ['', 'user-a'],
        ['?event=../x', 'user-a'],
        ['?event=ev1', null],
      ] as Array<[string, string | null]>) {
        requests.length = 0;
        const j = mountScreen(viewer, { search });
        await j.settleAsync();
        if (requests.length !== 0)
          problems.push({ search, viewer, requests: requests.map((r) => r.url) });
        if (search === '?event=ev1' && viewer === null) {
          const r = arcOf(j.tree());
          if (r && !isDeepStrictEqual(r.props.doors, {}))
            problems.push({ signedOutDoors: r.props.doors });
        }
      }
      // Each way a read can go wrong leaves a plain display: the row stays, no taps, no words.
      const breakers: Array<[string, () => void]> = [
        ['households refused', () => (answers.households = { status: 500, body: {} })],
        ['event refused', () => (answers.event = { status: 403, body: {} })],
        ['summary refused', () => (answers.summary = { status: 500, body: {} })],
        ['households offline', () => (answers.households = { status: 'throws', body: {} })],
        ['event offline', () => (answers.event = { status: 'throws', body: {} })],
        ['summary offline', () => (answers.summary = { status: 'throws', body: {} })],
        ['a record-less event', () => (answers.event = { status: 200, body: eventBody({}, null) })],
        [
          'a garbled summary',
          () => (answers.summary = { status: 200, body: { teamCount: 'many' } }),
        ],
        ['a garbled event', () => (answers.event = { status: 200, body: { event: 'no' } })],
      ];
      for (const [label, breakIt] of breakers) {
        answerAll({ teams: 2, hosted: true });
        breakIt();
        const j = mountScreen('user-a', { search: '?event=ev1' });
        await j.settleAsync();
        const r = arcOf(j.tree());
        const wrap = rowWrap(j.tree());
        const noWords = ![W6, W7, W8, W9, W9B, W44, W45, AFTER_PRESS].some((w) =>
          flat(textOf(j.tree())).includes(w)
        );
        if (
          !r ||
          !isDeepStrictEqual(r.props.doors, {}) ||
          r.props.completedMoments !== undefined ||
          !wrap ||
          textOf(wrap) !== '' ||
          !noWords
        ) {
          problems.push({ label, doors: r?.props.doors });
        }
      }
      noAnswers();
      return { ok: problems.length === 0, got: problems.slice(0, 3) };
    }
  );

  // ── T5: the guard, with drafts kept in this browser by the form's own writer ──
  const keep = (
    store: MemStore,
    who: string,
    eventId: string,
    form: 'new' | `edit:${string}` | 'host',
    now?: number
  ) => writeDraft(store as any, who, eventId, form, STATE as any, undefined, now);
  const doorsAfter = async (
    search: string,
    local: MemStore,
    facts: Parameters<typeof answerAll>[0] = {
      teams: 2,
      hosted: true,
      setup: { planApprovedAt: '2026-11-20T00:00:00.000Z' },
    }
  ) => {
    answerAll(facts);
    const i = mountScreen('user-a', { search, local });
    await i.settleAsync();
    return { doors: arcOf(i.tree())?.props.doors, i };
  };
  await acheck(
    'T5',
    "the guard: a household being changed gives W44; her own household's step is not blocked; the new-household form gives W45 only while a draft is kept for this event; another event's or person's draft, a stale one and a malformed one do not block, and none of them is removed or rewritten",
    async () => {
      const problems: unknown[] = [];
      const expect = async (
        label: string,
        search: string,
        prep: (l: MemStore) => void,
        want: unknown
      ) => {
        const local = new MemStore();
        prep(local);
        const before = local.snapshot();
        const setsBefore = local.sets;
        const { doors } = await doorsAfter(search, local);
        if (
          !isDeepStrictEqual(doors, want) ||
          local.snapshot() !== before ||
          local.sets !== setsBefore ||
          local.removes !== 0
        ) {
          problems.push({ label, doors, sets: local.sets - setsBefore, removes: local.removes });
        }
      };
      const blockedW45 = lockedBy(W45);
      const blockedW44 = lockedBy(W44);
      const open = OPEN_DOORS;
      await expect('edit, no draft', '?event=ev1&edit=hh1', () => {}, blockedW44);
      await expect(
        'edit, a draft kept: edit wins',
        '?event=ev1&edit=hh1',
        (l) => keep(l, 'user-a', 'ev1', 'new'),
        blockedW44
      );
      await expect(
        "her own household's step, a draft kept",
        '?event=ev1&form=host',
        (l) => keep(l, 'user-a', 'ev1', 'host'),
        open
      );
      await expect(
        'plain, a new-household draft kept',
        '?event=ev1',
        (l) => keep(l, 'user-a', 'ev1', 'new'),
        blockedW45
      );
      await expect('plain, none kept', '?event=ev1', () => {}, open);
      await expect(
        'plain, a draft for another event',
        '?event=ev1',
        (l) => keep(l, 'user-a', 'ev2', 'new'),
        open
      );
      await expect(
        'plain, a draft for another person',
        '?event=ev1',
        (l) => keep(l, 'user-b', 'ev1', 'new'),
        open
      );
      await expect(
        'plain, only a changed-household draft kept (as the setup page, until "Carry on")',
        '?event=ev1',
        (l) => keep(l, 'user-a', 'ev1', 'edit:hh1'),
        open
      );
      await expect(
        'plain, a stale draft (8 days old): open, and not removed',
        '?event=ev1',
        (l) => keep(l, 'user-a', 'ev1', 'new', Date.now() - 8 * 24 * 60 * 60 * 1000),
        open
      );
      await expect(
        'plain, a malformed draft: open, and not removed',
        '?event=ev1',
        (l) => l.m.set(draftKey('user-a', 'ev1', 'new'), '{not json'),
        open
      );
      noAnswers();
      return { ok: problems.length === 0, got: problems.slice(0, 3) };
    }
  );

  check(
    'T6',
    'drawn for real: an open door is a plain link and a locked door a button that goes nowhere; the bar draws the link, Go back and the row once',
    () => {
      const { renderTopBar } = real(TOPBAR);
      const doors = {
        2: { href: '/plan/ev1/setup?at=plan' },
        3: { locked: W7 },
        4: { locked: W8 },
      };
      const html = renderToStaticMarkup(
        createElement('div', null, renderTopBar({ showMoments: true, doors, onGoBack() {} }))
      );
      const anchors = [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"/g)].map((m) => m[1]);
      const lockedButtons = [...html.matchAll(/<button\b[^>]*aria-disabled="true"/g)].length;
      const goBacks = [...html.matchAll(/<button\b[^>]*data-contacts-back/g)].length;
      const strips = [...html.matchAll(/data-moment-strip/g)].length;
      const plain = renderToStaticMarkup(
        createElement('div', null, renderTopBar({ showMoments: true, doors: null, onGoBack() {} }))
      );
      return {
        ok:
          isDeepStrictEqual(anchors.sort(), ['/plan/ev1/setup?at=plan', '/plan/events']) &&
          lockedButtons === 2 &&
          goBacks === 1 &&
          strips === 1 &&
          plain.includes('aria-current="step"') &&
          [...plain.matchAll(/<a\b/g)].length === 1 &&
          !plain.includes('aria-disabled'),
        got: { anchors, lockedButtons, goBacks, strips },
      };
    }
  );

  check(
    'T7',
    'draft-kept.ts only asks: it imports the reader and the store type and nothing else from the draft module, never writes, removes or sweeps, returns true or false only, and leaves the store as it found it',
    () => {
      const src = read(KEPT);
      if (!src) throw new Error(`${KEPT} is not there yet`);
      const imports = [...src.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g)].map(
        (m) => [
          m[2],
          m[1]
            .split(',')
            .map((x) => x.trim().replace(/^type\s+/, ''))
            .filter(Boolean)
            .sort(),
        ]
      );
      const fromDraft = imports.filter(([from]) => /form-draft/.test(from as string));
      const importsOk =
        fromDraft.length === 1 &&
        isDeepStrictEqual(fromDraft[0][1], ['DraftStore', 'browserDraftStore', 'readDraft'].sort());
      const body = stripComments(src);
      const writes = /\b(writeDraft|removeDraft|sweepDrafts|latestEditDraft)\b/.test(body);
      const { newHouseholdDraftKept } = real(KEPT);
      const results: unknown[] = [];
      const probe = (prep: (s: MemStore) => void, who: string | null, ev: string | null) => {
        const s = new MemStore();
        prep(s);
        const before = s.snapshot();
        const [setsBefore, removesBefore] = [s.sets, s.removes];
        const got = withWindow({ ...makeWindow({ local: s }) }, () =>
          newHouseholdDraftKept(who, ev)
        );
        results.push([
          got,
          s.snapshot() === before,
          s.sets === setsBefore,
          s.removes === removesBefore,
        ]);
        return got;
      };
      const yes = probe((s) => keep(s, 'user-a', 'ev1', 'new'), 'user-a', 'ev1');
      const stale = probe(
        (s) => keep(s, 'user-a', 'ev1', 'new', Date.now() - 8 * 86400000),
        'user-a',
        'ev1'
      );
      const junk = probe((s) => s.m.set(draftKey('user-a', 'ev1', 'new'), 'junk'), 'user-a', 'ev1');
      const other = probe((s) => keep(s, 'user-a', 'ev2', 'new'), 'user-a', 'ev1');
      const nobody = probe((s) => keep(s, 'user-a', 'ev1', 'new'), null, 'ev1');
      const noEvent = probe((s) => keep(s, 'user-a', 'ev1', 'new'), 'user-a', null);
      const untouched = results.every((r) => (r as boolean[]).slice(1).every(Boolean));
      return {
        ok:
          importsOk &&
          !writes &&
          yes === true &&
          stale === false &&
          junk === false &&
          other === false &&
          nobody === false &&
          noEvent === false &&
          untouched,
        got: { imports: fromDraft, writes, results },
      };
    }
  );
  check(
    'T7b',
    "the screen reaches the draft only through that helper, names no draft module of its own, and its requests carry nothing but the event's id",
    () => {
      const screen = read(SCREEN);
      const c = stripComments(screen);
      const mentions = (screen.match(/draft-kept/g) ?? []).length;
      const noDraftModule =
        !screen.includes('households/form-draft') &&
        !/\b(writeDraft|removeDraft|readDraft)\b/.test(c);
      const fetches = c.match(/fetch\([^)]*\)/g) ?? [];
      const plain =
        fetches.length === 3 &&
        fetches.every((f) =>
          /^fetch\(`\/api\/events\/\$\{address\.eventId\}(?:\/households|\/summary)?`\)$/.test(f)
        );
      return { ok: mentions >= 1 && noDraftModule && plain, got: { mentions, fetches } };
    }
  );

  check(
    'T8',
    "the three routes still return what the page reads (read as text): the event (status, sentAt, planApprovedAt, eventType, invitesOnly), the summary (teamCount), a household's members with their role; the schema still has the HOST role, the DRAFT status, and an item that must have a section",
    () => {
      const wire = flat(read('src/lib/events/wire-select.ts'));
      const summary = flat(read('src/app/api/events/[id]/summary/route.ts'));
      const households = flat(read('src/app/api/events/[id]/households/route.ts'));
      const schema = read('prisma/schema.prisma');
      const block = (name: string) =>
        schema.match(new RegExp(`model ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      const enumBlock = (name: string) =>
        schema.match(new RegExp(`enum ${name} \\{[\\s\\S]*?\\n\\}`))?.[0] ?? '';
      const setupSelect = wire.slice(wire.indexOf('setup: { select: {'));
      const rows: Array<[string, boolean]> = [
        [
          'status and sentAt on the event',
          /\bstatus: true\b/.test(wire) && /\bsentAt: true\b/.test(wire),
        ],
        [
          'the setup fields',
          ['planApprovedAt', 'eventType', 'invitesOnly'].every((k) =>
            setupSelect.includes(`${k}: true`)
          ),
        ],
        [
          "the summary counts the event's sections",
          /prisma\.team\.count\(\{ where: \{ eventId \},? \}\)/.test(summary) &&
            /NextResponse\.json\(\{ teamCount,/.test(summary),
        ],
        [
          'the households come back with their members',
          /prisma\.household\.findMany\(\{ where: \{ eventId \}, include: \{ members: \{ include: \{ person:/.test(
            households
          ),
        ],
        [
          'a member has a role, and HOST is one',
          /\n\s+role\s+PersonRole\b/.test(block('PersonEvent')) &&
            /\bHOST\b/.test(enumBlock('PersonRole')),
        ],
        ['an event can be DRAFT', /\bDRAFT\b/.test(enumBlock('EventStatus'))],
        [
          'an item has a required section (the plan test is "teamCount above zero")',
          /\n\s+teamId\s+String\s*\n/.test(block('Item')) &&
            /\n\s+eventId\s+String\s*\n/.test(block('Team')),
        ],
      ];
      const wrong = rows.filter(([, good]) => !good).map(([n]) => n);
      return { ok: wrong.length === 0, got: wrong };
    }
  );

  // ══ G — THE RULE FOR GO BACK, AND WHAT THIS TICKET MAY NOT TOUCH ════════════
  section('G — the rule for Go back, and what may not be touched');
  check(
    'G1',
    "the rule for Go back: the form she left first; then the browser's back for a page of this site with history; else Your events; hostile referrers never pass",
    () => {
      const { goBackAction } = real(ADDRESS);
      const env = (referrer: string, historyLength: number, origin = SITE) => ({
        referrer,
        origin,
        historyLength,
      });
      const none = { eventId: null, form: null, editId: null };
      const ev = (over: Record<string, unknown> = {}) => ({
        eventId: 'ev1',
        form: null,
        editId: null,
        ...over,
      });
      const go = (href: string) => ({ kind: 'go', href });
      const back = { kind: 'history' };
      const rows: Array<[string, unknown, unknown]> = [
        ['event, plain', goBackAction(ev(), env('', 1)), go('/plan/ev1/setup?at=people')],
        [
          'event, with a household being changed',
          goBackAction(ev({ editId: 'hh1' }), env(`${SITE}/x`, 5)),
          go('/plan/ev1/setup?at=people&edit=hh1'),
        ],
        [
          "event, her own household's step",
          goBackAction(ev({ form: 'host' }), env(`${SITE}/x`, 5)),
          go('/plan/ev1/setup?at=people'),
        ],
        ['no address (the sample page)', goBackAction(null, env(`${SITE}/plan/events`, 3)), back],
        ['no event', goBackAction(none, env(`${SITE}/plan/events`, 3)), back],
        ['this site, two pages', goBackAction(none, env(`${SITE}/a`, 2)), back],
        ['this site, one page', goBackAction(none, env(`${SITE}/a`, 1)), go('/plan/events')],
        ['this site, none counted', goBackAction(none, env(`${SITE}/a`, 0)), go('/plan/events')],
        ['no referrer', goBackAction(none, env('', 9)), go('/plan/events')],
        ['another site', goBackAction(none, env('https://other.example/', 9)), go('/plan/events')],
        [
          'same host, another scheme',
          goBackAction(none, env('http://gather.example/', 9)),
          go('/plan/events'),
        ],
        [
          'same host, another port',
          goBackAction(none, env('https://gather.example:8443/', 9)),
          go('/plan/events'),
        ],
        [
          'a lookalike host',
          goBackAction(none, env('https://gather.example.evil.com/', 9)),
          go('/plan/events'),
        ],
        [
          'a host that starts the same',
          goBackAction(none, env('https://gather.exampleevil.com/', 9), 'https://gather.example'),
          go('/plan/events'),
        ],
        [
          'a user-info trick',
          goBackAction(none, env('https://gather.example@evil.com/', 9)),
          go('/plan/events'),
        ],
        [
          'a javascript: address',
          goBackAction(none, env('javascript:alert(1)', 9)),
          go('/plan/events'),
        ],
        ['a data: address', goBackAction(none, env('data:text/html,x', 9)), go('/plan/events')],
        ['not an address at all', goBackAction(none, env('not a url', 9)), go('/plan/events')],
        ['our own origin unknown', goBackAction(none, env(`${SITE}/a`, 9, '')), go('/plan/events')],
        ['our own origin "null"', goBackAction(none, env('null', 9, 'null')), go('/plan/events')],
      ];
      const wrong = rows
        .filter(([, got, want]) => !isDeepStrictEqual(got, want))
        .map(([n, got]) => [n, got]);
      return { ok: wrong.length === 0, got: wrong };
    }
  );
  check(
    'G2',
    'moment4Doors and its helper are byte for byte main\'s (the glance board and "Who I nudge" do not move), and MomentArc.tsx, strip.ts and entry-stage.ts are main\'s',
    () => {
      if (!baseOk) return { ok: false, got: `${BASE} is not in this checkout` };
      const slice = (s: string, from: string, to: string) => {
        const a = s.indexOf(from);
        const b = s.indexOf(to, a);
        return a >= 0 && b > a ? s.slice(a, b) : '';
      };
      const now = read(HREFS);
      const then = atBase(HREFS);
      const helper = (s: string) =>
        slice(s, 'function hrefOf(', '/** The doors of a Moment 4 screen');
      const m4 = (s: string) => s.slice(s.indexOf('/** The doors of a Moment 4 screen'));
      const same = [
        'src/components/plan/MomentArc.tsx',
        'src/lib/moments/strip.ts',
        'src/lib/setup/entry-stage.ts',
      ].map((f) => [f, read(f) === atBase(f) && read(f).length > 0]);
      const rows: Array<[string, boolean]> = [
        ["hrefOf is main's", helper(then).length > 100 && helper(now) === helper(then)],
        [
          "moment4Doors is main's",
          m4(then).includes('export function moment4Doors') && now.includes(m4(then)),
        ],
        ...(same as Array<[string, boolean]>),
      ];
      const wrong = rows.filter(([, good]) => !good).map(([n]) => n);
      return { ok: wrong.length === 0, got: wrong };
    }
  );
  check(
    'G3',
    "the files this ticket may not touch are not in the diff against main (and the diff is not empty: it holds the new bar), read at GTC-470's code commit 0754b6e",
    () => {
      if (!baseOk) return { ok: false, got: `${BASE} is not in this checkout` };
      try {
        git(['cat-file', '-e', `${GTC470_CODE}^{commit}`]);
      } catch {
        return { ok: false, got: `${GTC470_CODE.slice(0, 7)} is not in this checkout` };
      }
      const names = (s: string) => s.split('\0').filter(Boolean);
      // [[GTC-474]] re-base (ruling 3), as GTC-431 did for tweaks-b S4: GTC-470's own code commit,
      // fixed, instead of the working folder, so a later ticket's edit to the form no longer turns
      // this red. Same forbidden list and strictness, for the work this check was written about.
      const changed = names(
        git(['diff', '--no-renames', '--name-only', '-z', BASE, GTC470_CODE, '--'])
      );
      const FORBIDDEN_PATHS = [
        'src/components/plan/MomentArc.tsx',
        'src/lib/moments/strip.ts',
        'src/lib/setup/entry-stage.ts',
        'src/app/plan/[eventId]/setup/page.tsx',
        'src/components/plan/Moment1InputForm.tsx',
        'src/components/shared/Providers.tsx',
        'src/components/shared/Navigation.tsx',
        'src/app/plan/contacts/page.tsx',
        'src/app/api/',
        'route-classifications.json',
        'prisma/',
        'middleware.ts',
        'src/lib/auth',
      ];
      // [[GTC-475]] (founder ruling A, 23 Nov 2026: "remove GTC-472's named list from G3 only if G3 is green
      // without it"): GTC-472's three named exceptions (the share route, the guest read route and
      // route-classifications.json) are gone. Since GTC-474 froze this check at GTC-470's code commit it reads
      // that commit's diff, which touches none of the three, so the list excluded nothing. Same forbidden list,
      // same strictness.
      const hits = changed.filter((p) => FORBIDDEN_PATHS.some((x) => p === x || p.startsWith(x)));
      return {
        ok:
          hits.length === 0 &&
          changed.includes('src/components/contacts/TopBar.tsx') &&
          changed.length >= 8,
        got: { hits, changed: changed.length },
      };
    }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.log(String(e));
  process.exit(1);
});
