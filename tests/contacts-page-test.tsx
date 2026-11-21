/**
 * [[GTC-460]] Stage 3, step 3a — THE CONTACTS PAGE, ITS WAY IN AND ITS WAY BACK.
 *
 * WHAT 3a BUILDS, IN PLAIN WORDS. One page for the host, at /plan/contacts (ruling 157): the title,
 * one line saying where her contacts live (A5, ruling 155), a count that is always on screen, a
 * Clear button that is always drawn and asks first, the list with a Remove button on each person,
 * and three plain lines for the empty list, for nobody signed in, and for a browser that will not
 * keep them. A link in the menu bar ("Your contacts", W41). A block under the household form's
 * opening paragraph that leads to the page, and the page's link back to the household list. Nothing
 * can be LOADED yet (that is 3b), so every list here is put in storage by the test.
 *
 * HOW IT IS RUN WITHOUT A BROWSER. The estate has no jsdom, so, as `decide-later-form-test.ts` does
 * for the household form, this file compiles the LIVE source of the screen, the page and the form
 * with esbuild, gives them a small stand-in for React's hooks that keeps state between renders and
 * runs effects after each, and drives them the way a browser would: it walks the element tree they
 * return, finds the real controls by their text and attributes, and calls their real handlers.
 * Stood in for: React's hooks; a `window` with a storage, an address and a record of its listeners;
 * `next/navigation`'s router; and the browser's draft store. Nothing here reads a database, calls
 * the network, or can send: a `fetch` that is called at all is a red check.
 *
 * THE WORDS are read out of the ticket (section 7 of the Stage 3 plan, the ruled entries) and the
 * code must say exactly those. Test helpers read text from the element tree, never by stripping tags.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-page-test.tsx  (npm run test:contacts-page)
 */
import fs from 'fs';
import path from 'path';
import * as ReactAll from 'react';
import { transformSync } from 'esbuild';
import * as FormDraft from '../src/lib/households/form-draft';
import { ViewerIdContext } from '../src/components/shared/Providers';

const ROOT = path.join(__dirname, '..');
const TICKET = 'docs/tickets/GTC-460.md';
const SCREEN = 'src/components/contacts/ContactsScreen.tsx';
const PAGE = 'src/app/plan/contacts/page.tsx';
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const NAV = 'src/components/shared/Navigation.tsx';
const SETUP_PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
const LOAD_BOX = 'src/components/contacts/LoadBox.tsx';
const ROW = 'src/components/contacts/ContactRow.tsx';
const NEW_FILES = [
  PAGE,
  SCREEN,
  LOAD_BOX,
  ROW,
  'src/lib/contacts/store.ts',
  'src/lib/contacts/words.ts',
  'src/lib/contacts/address.ts',
  'src/lib/contacts/load.ts',
  'src/lib/contacts/read-picked.ts',
  'src/lib/contacts/picker.ts',
];

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
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 300)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
/** Run one check; a thrown error is a red check that says why (a missing file reads as "not there"). */
function check(id: string, label: string, fn: () => boolean | { ok: boolean; got?: unknown }) {
  try {
    const r = fn();
    if (typeof r === 'boolean') assert(id, label, r);
    else assert(id, label, r.ok, r.got);
  } catch (e) {
    assert(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
  }
}
/** Like `check`, for a check that waits (a file read, the phone's picker). */
async function checkAsync(
  id: string,
  label: string,
  fn: () => Promise<boolean | { ok: boolean; got?: unknown }>
) {
  try {
    const r = await fn();
    if (typeof r === 'boolean') assert(id, label, r);
    else assert(id, label, r.ok, r.got);
  } catch (e) {
    assert(id, label, false, `threw: ${String((e as Error).message).slice(0, 200)}`);
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

/** What the plan forbids in the new files: raw markup, a regular expression built from typing, a request, a log. */
const FORBIDDEN_CODE =
  /dangerouslySetInnerHTML|innerHTML|\beval\(|new RegExp|\bfetch\(|XMLHttpRequest|sendBeacon|\bconsole\./;

// ── Nothing may reach the network but ONE read: the screen's GET of the event's households ──
const requests: Array<{ url: string; init: unknown }> = [];
let nextAnswer: { status: number | 'throws'; body: unknown } = {
  status: 200,
  body: { households: [] },
};
globalThis.fetch = (async (url: unknown, init?: unknown) => {
  requests.push({ url: String(url), init });
  if (nextAnswer.status === 'throws') throw new Error('offline');
  const status = nextAnswer.status as number;
  return { ok: status === 200, status, json: async () => nextAnswer.body };
}) as unknown as typeof fetch;

// ── Browser storage, in memory, that can be told to fail ─────────────────────
class MemStore {
  m = new Map<string, string>();
  calls = 0;
  failRead = false;
  failWrite = false;
  failRemove = false;
  /** What a failed write or remove throws: a plain refusal, or the browser's "no room left" error. */
  failWith: 'refused' | 'full' = 'refused';
  private boom(): Error {
    const e = new Error(this.failWith === 'full' ? 'The quota has been exceeded.' : 'blocked');
    if (this.failWith === 'full') e.name = 'QuotaExceededError';
    return e;
  }
  get length() {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return this.m.size;
  }
  key(i: number) {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    this.calls++;
    if (this.failRead) throw new Error('blocked');
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.calls++;
    if (this.failWrite) throw this.boom();
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
    if (this.failRemove) throw this.boom();
    this.m.delete(k);
  }
}
const LIST_KEY = (userId: string) => `gather:contacts:v1:${userId}`;
const person = (i: number, over: Record<string, unknown> = {}) => ({
  id: `c${i}`,
  name: `Person ${i}`,
  email: `p${i}@example.com`,
  phone: `021 555 000${i}`,
  ...over,
});
/** A list put in storage by the test, in the ruled shape (one value under the person's key). */
function seed(store: MemStore, userId: string, n: number) {
  const contacts = Array.from({ length: n }, (_, i) => person(i + 1));
  store.m.set(LIST_KEY(userId), JSON.stringify({ v: 1, userId, contacts }));
}

// ── A window: its storages, its address, and a record of what is listened for ────
interface Win {
  localStorage: MemStore;
  sessionStorage: MemStore;
  location: { search: string; assign(href: string): void };
  /** Every address the page was sent to (window.location.assign). */
  assigned: string[];
  listeners: Record<string, Array<(e: any) => void>>;
  confirmCalls: number;
  addEventListener(t: string, f: (e: any) => void): void;
  removeEventListener(t: string, f: (e: any) => void): void;
  confirm(): boolean;
  /** A pretend phone: only present when a test gives them (a plain window has none, like a laptop's). */
  navigator?: unknown;
  ContactsManager?: unknown;
  isSecureContext?: boolean;
}
function makeWindow(
  over: {
    search?: string;
    local?: MemStore;
    session?: MemStore;
    navigator?: unknown;
    ContactsManager?: unknown;
    isSecureContext?: boolean;
  } = {}
): Win {
  const w: Win = {
    localStorage: over.local ?? new MemStore(),
    sessionStorage: over.session ?? new MemStore(),
    location: {
      search: over.search ?? '',
      assign(href: string) {
        w.assigned.push(href);
      },
    },
    assigned: [],
    listeners: {},
    confirmCalls: 0,
    addEventListener(t, f) {
      (w.listeners[t] ??= []).push(f);
    },
    removeEventListener(t, f) {
      w.listeners[t] = (w.listeners[t] ?? []).filter((x) => x !== f);
    },
    confirm() {
      w.confirmCalls++;
      return true;
    },
  };
  if ('navigator' in over) w.navigator = over.navigator;
  if ('ContactsManager' in over) w.ContactsManager = over.ContactsManager;
  if ('isSecureContext' in over) w.isSecureContext = over.isSecureContext;
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
  draftStore: FormDraft.DraftStore | null;
  win: Win;
  props: Record<string, any>;
  tree: any;
}
let cur: Fiber | null = null;
let activeDraftStore: FormDraft.DraftStore | null = null;
let refreshCalls = 0;
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
const NAV_STUB = {
  useRouter: () => ({
    refresh: () => void refreshCalls++,
    push() {},
    replace() {},
    back() {},
  }),
};
const DRAFT_SHIM = { ...FormDraft, browserDraftStore: () => activeDraftStore };

// ── The live source, compiled; the three files under test get the stand-in React ──────
const LIVE = new Set([SCREEN, PAGE, FORM, LOAD_BOX, ROW]);
const compiled = new Map<string, any>();
/** Source text used instead of a file's own, in memory only (the break proofs); the real file is never edited. */
const OVERRIDE = new Map<string, string>();
/** Run `fn` with one live file's source replaced by `source`; the real files are read again afterwards. */
function withSource<T>(rel: string, source: string, fn: () => T): T {
  OVERRIDE.set(rel, source);
  compiled.clear();
  try {
    return fn();
  } finally {
    OVERRIDE.delete(rel);
    compiled.clear();
  }
}
const withScreenSource = <T,>(source: string, fn: () => T): T => withSource(SCREEN, source, fn);
/** The same, for a run that waits: the swap stays until the run is over. */
async function withSourceAsync<T>(rel: string, source: string, fn: () => Promise<T>): Promise<T> {
  OVERRIDE.set(rel, source);
  compiled.clear();
  try {
    return await fn();
  } finally {
    OVERRIDE.delete(rel);
    compiled.clear();
  }
}
function resolveFile(target: string): string | null {
  for (const ext of ['.tsx', '.ts']) {
    if (fs.existsSync(path.join(ROOT, target + ext))) return target + ext;
  }
  return null;
}
function loadLive(rel: string): any {
  if (compiled.has(rel)) return compiled.get(rel);
  const source = OVERRIDE.get(rel) ?? read(rel);
  if (!source) throw new Error(`${rel} is not there yet`);
  const code = transformSync(source, {
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
    if (id === '@/lib/households/form-draft') return DRAFT_SHIM;
    if (id.startsWith('@/')) return need('src/' + id.slice(2));
    if (id.startsWith('./') || id.startsWith('../')) return need(path.join(dir, id));
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(req, m, m.exports);
  compiled.set(rel, m.exports);
  return m.exports;
}

function withWindow<T>(w: Win, fn: () => T): T {
  const before = (globalThis as any).window;
  (globalThis as any).window = w;
  try {
    return fn();
  } finally {
    if (before === undefined) delete (globalThis as any).window;
    else (globalThis as any).window = before;
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
  activeDraftStore = f.draftStore;
  for (let n = 0; n < 60; n++) {
    f.dirty = false;
    renderOnce(f);
    flushEffects(f);
    if (!f.dirty) return;
  }
  throw new Error('did not settle after 60 renders');
}

// ── The element tree: walking it, reading its text, finding its controls ─────
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
const buttonText = (tree: any, text: string) =>
  buttons(tree).find((b) => textOf(b).trim() === text);
const linkText = (tree: any, text: string) =>
  all(tree, (e) => e.type === 'a').find((a) => textOf(a).trim() === text);

interface Inst {
  f: Fiber;
  win: Win;
  /** The first paint: what the server draws, before any effect has run. */
  first: any;
  tree: () => any;
  act: (fn: () => unknown) => void;
  /** Like `act`, for a handler that finishes later (a file read, the phone's picker): waits for it. */
  actAsync: (fn: () => unknown) => Promise<void>;
}
function mount(
  rel: string,
  props: Record<string, any>,
  opts: { viewerId?: string | null; win?: Win; draftStore?: FormDraft.DraftStore | null } = {}
): Inst {
  refreshCalls = 0;
  const comp = loadLive(rel).default;
  const win = opts.win ?? makeWindow();
  const f: Fiber = {
    comp,
    slots: [],
    pos: 0,
    pending: [],
    dirty: false,
    viewerId: opts.viewerId ?? null,
    draftStore: opts.draftStore ?? null,
    win,
    props,
    tree: null,
  };
  activeDraftStore = f.draftStore;
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
    async actAsync(fn) {
      const before = (globalThis as any).window;
      (globalThis as any).window = win;
      try {
        await fn();
        for (let n = 0; n < 6; n++) {
          await new Promise((r) => setTimeout(r, 0));
          settle(f);
        }
      } finally {
        if (before === undefined) delete (globalThis as any).window;
        else (globalThis as any).window = before;
      }
    },
  };
}
const press = (i: Inst, el: El | undefined, ev: Record<string, unknown> = {}) => {
  if (!el) throw new Error('a control to press is not on screen');
  i.act(() => el.props.onClick({ preventDefault() {}, ...ev }));
};

// ── The ruled words, read out of the ticket (section 7 of the Stage 3 plan) ───
const ticketText = flat(read(TICKET));
const wordsSection = (() => {
  const a = ticketText.indexOf('#### 7. The W-lines, for the founder');
  const b = ticketText.indexOf('#### 8. The tests');
  return a >= 0 && b > a ? ticketText.slice(a, b) : '';
})();
const ruled = (s: string) => wordsSection.includes(`*"${s}"*`);

// ── Page-side helpers ────────────────────────────────────────────────────────
const SCREEN_PROPS = {};
const screen = (
  viewerId: string | null,
  o: { local?: MemStore; search?: string; phone?: Record<string, unknown> } = {}
) =>
  mount(SCREEN, SCREEN_PROPS, {
    viewerId,
    win: makeWindow({ local: o.local, search: o.search, ...(o.phone ?? {}) }),
  });
const countOf = (i: Inst) => textOf(byAttr(i.tree(), 'data-contacts-count'));
const clearButton = (i: Inst) => buttonText(i.tree(), 'Clear all contacts');
const rows = (i: Inst) => all(i.tree(), (e) => 'data-contact-id' in e.props);
const confirmBlock = (i: Inst) => byAttr(i.tree(), 'data-contacts-confirm');

async function main() {
  // The request spy sees a call, so "the page made no request" (F.3, at the end) is not green for nothing.
  void globalThis.fetch('spy').catch(() => {});
  check('F.0', 'the request spy sees a call (so F.3 means something)', () => {
    const seen = requests.length === 1;
    requests.length = 0;
    return { ok: seen, got: seen };
  });

  // ══ W — THE WORDS ARE THE RULED WORDS ═══════════════════════════════════════
  section('W — the words are the ruled W-lines (A5, W10 to W16, W18, W20, W31, W41, W42)');
  check('W.1', 'the ticket section with the ruled W-lines was found', () => ({
    ok: wordsSection.length > 2000,
    got: wordsSection.length,
  }));
  check(
    'W.2',
    'words.ts says A5, W10 to W16, W18, W20, W31 and W42 exactly as the ticket rules them',
    () => {
      const {
        CONTACTS_WORDS: W,
        countWords,
        clearAsk,
        removeLabel,
      } = require('../src/lib/contacts/words');
      const wanted: Array<[string, string]> = [
        ['A5', W.A5],
        ['W10', W.TITLE],
        ['W11 n', countWords(5).replace('5', '{n}')],
        ['W11 one', countWords(1)],
        ['W11 zero', countWords(0)],
        ['W12', W.CLEAR],
        ['W13 n', clearAsk(5).replace('5', '{n}')],
        ['W13 one', clearAsk(1)],
        ['W13 yes', W.CLEAR_YES],
        ['W13 keep', W.CLEAR_KEEP],
        ['W14', W.EMPTY],
        ['W15', W.SIGNED_OUT],
        ['W16', W.REFUSED],
        ['W18', W.BACK],
        ['W20', W.REMOVE],
        ['W20 read out', removeLabel('{name}')],
        ['W42', W.SAVE_FAILED],
        ['W31 sentence', W.ENTRY_LARGE],
        ['W31 button', W.ENTRY_LINK],
      ];
      const missing = wanted
        .filter(([id, s]) => id !== 'W20 read out' && !ruled(s))
        .map(([id]) => id);
      return {
        ok: missing.length === 0 && removeLabel('{name}') === 'Remove {name}',
        got: missing,
      };
    }
  );
  check(
    'W.3',
    'A5 is the line ruling 155 gave, word for word, and no word has a curly apostrophe',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const ruling155 = `reads exactly: ${W.A5}`;
      const curly = Object.values(W as Record<string, string>).filter((s) => /[‘’]/.test(s));
      return { ok: ticketText.includes(ruling155) && curly.length === 0, got: curly };
    }
  );
  check(
    'W.4',
    'the nav item says W41 and the sign-in link says what the menu bar already says',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const nav = read(NAV);
      const signIn = nav.match(/const signIn = \{ href: '([^']*)', label: '([^']*)' \}/);
      return {
        ok:
          ruled(W.NAV) && !!signIn && W.SIGN_IN_LABEL === signIn[2] && W.SIGN_IN_HREF === signIn[1],
        got: signIn?.slice(1),
      };
    }
  );

  // ══ P — THE PAGE FILE AND ITS FIRST PAINT ═══════════════════════════════════
  section('P — the page and what it draws before it has mounted');
  // [[GTC-468]] (ruling A, Q8, amendment T2): the page now reads the sample flag with React's
  // `useContext`, which needs a draw, so the tree comes from `mount`, not a bare call. The flag's
  // default is "not a sample", so anyone but a sample visitor is still given the screen.
  check(
    'P.1',
    'the page is a client page that draws the screen for anyone but a sample visitor (a sample sees the sample note instead)',
    () => {
      const src = read(PAGE);
      const tree = mount(PAGE, {}, { viewerId: 'user-a' }).first;
      const screenFn = loadLive(SCREEN).default;
      return {
        ok: /^\s*'use client';/.test(src) && isEl(tree) && tree.type === screenFn,
        got: String(tree?.type?.name),
      };
    }
  );
  check(
    'P.2',
    'first paint: the title and the A5 line, then a loading state with no count, button, list or sentence',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const i = screen('user-a');
      const t = i.first;
      const h1 = all(t, (e) => e.type === 'h1')[0];
      const note = byAttr(t, 'data-contacts-note');
      const loading = byAttr(t, 'data-contacts-state');
      return {
        ok:
          textOf(h1) === W.TITLE &&
          textOf(note) === W.A5 &&
          loading?.props['data-contacts-state'] === 'loading' &&
          textOf(loading) === '' &&
          !byAttr(t, 'data-contacts-count') &&
          buttons(t).length === 0 &&
          rows({ tree: () => t } as Inst).length === 0 &&
          flat(textOf(t)) === `${W.TITLE}${W.A5}`,
        got: flat(textOf(t)).slice(0, 160),
      };
    }
  );
  check('P.3', 'the A5 line sits right under the title, once', () => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const i = screen('user-a');
    const texts = all(i.tree(), (e) => e.type === 'p').map((p) => textOf(p));
    return { ok: texts.filter((x) => x === W.A5).length === 1, got: texts.length };
  });

  // ══ S — THE STATES ══════════════════════════════════════════════════════════
  section('S — signed out, empty, refused, and a list');
  check(
    'S.1',
    'signed out: W15 and the existing sign-in link; no count, no Clear, no list; storage not touched',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const local = new MemStore();
      seed(local, 'user-a', 2);
      const i = screen(null, { local });
      const line = byAttr(i.tree(), 'data-contacts-state');
      const a = linkText(i.tree(), W.SIGN_IN_LABEL);
      return {
        ok:
          line?.props['data-contacts-state'] === 'signed-out' &&
          flat(textOf(line)).startsWith(W.SIGNED_OUT) &&
          a?.props.href === W.SIGN_IN_HREF &&
          !byAttr(i.tree(), 'data-contacts-count') &&
          !clearButton(i) &&
          rows(i).length === 0 &&
          local.calls === 0,
        got: { text: flat(textOf(i.tree())).slice(0, 120), calls: local.calls },
      };
    }
  );
  check(
    'S.2',
    'nobody signed in: the page asks the router to refresh once (the stale sign-in state); signed in, never',
    () => {
      screen(null);
      const signedOut = refreshCalls;
      screen('user-a');
      return { ok: signedOut === 1 && refreshCalls === 0, got: [signedOut, refreshCalls] };
    }
  );
  check('S.3', 'empty: "0 contacts", Clear drawn but greyed, W14 shown', () => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const i = screen('user-a');
    return {
      ok:
        countOf(i) === '0 contacts' &&
        !!clearButton(i) &&
        clearButton(i)!.props.disabled === true &&
        textOf(byAttr(i.tree(), 'data-contacts-state')) === W.EMPTY &&
        rows(i).length === 0,
      got: [countOf(i), clearButton(i)?.props.disabled],
    };
  });
  check(
    'S.4',
    'storage refuses reading: W16 is shown, nothing throws, the count is 0, Clear is greyed, W14 is not shown',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const local = new MemStore();
      local.failRead = true;
      const i = screen('user-a', { local });
      const states = all(i.tree(), (e) => 'data-contacts-state' in e.props).map((e) => textOf(e));
      return {
        ok:
          states.includes(W.REFUSED) &&
          !states.includes(W.EMPTY) &&
          countOf(i) === '0 contacts' &&
          clearButton(i)?.props.disabled === true,
        got: states,
      };
    }
  );
  check(
    'S.5',
    'no storage object at all (the browser throws when asked for it): the same, nothing thrown',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const win = makeWindow();
      Object.defineProperty(win, 'localStorage', {
        get() {
          throw new Error('SecurityError');
        },
      });
      const i = mount(SCREEN, SCREEN_PROPS, { viewerId: 'user-a', win });
      const states = all(i.tree(), (e) => 'data-contacts-state' in e.props).map((e) => textOf(e));
      return { ok: states.includes(W.REFUSED) && countOf(i) === '0 contacts', got: states };
    }
  );
  check(
    'S.6',
    'a list: the count, each person with name, email and number, a Remove button read out with the name, Clear on',
    () => {
      const local = new MemStore();
      seed(local, 'user-a', 3);
      const i = screen('user-a', { local });
      const r = rows(i);
      const first = r[0];
      const remove = first ? buttons(first)[0] : undefined;
      return {
        ok:
          countOf(i) === '3 contacts' &&
          r.length === 3 &&
          textOf(first).includes('Person 1') &&
          textOf(first).includes('p1@example.com') &&
          textOf(first).includes('021 555 0001') &&
          textOf(remove) === 'Remove' &&
          remove?.props['aria-label'] === 'Remove Person 1' &&
          clearButton(i)?.props.disabled === false &&
          !byAttr(i.tree(), 'data-contacts-confirm'),
        got: [countOf(i), r.length, remove?.props['aria-label']],
      };
    }
  );
  check(
    'S.7',
    "another person's list on this device is not shown to me, and is not touched",
    () => {
      const local = new MemStore();
      seed(local, 'user-b', 3);
      const before = local.m.get(LIST_KEY('user-b'));
      const i = screen('user-a', { local });
      return {
        ok: countOf(i) === '0 contacts' && local.m.get(LIST_KEY('user-b')) === before,
        got: countOf(i),
      };
    }
  );

  // ══ R — REMOVE ONE, AND CLEAR ═══════════════════════════════════════════════
  section('R — remove one person; Clear asks first');
  check(
    'R.1',
    'Remove takes out that person only, the count goes down at once, and nothing is asked',
    () => {
      const local = new MemStore();
      seed(local, 'user-a', 3);
      const i = screen('user-a', { local });
      press(i, buttons(rows(i)[1])[0]);
      const stored = JSON.parse(local.m.get(LIST_KEY('user-a')) ?? '{}').contacts?.map(
        (c: any) => c.id
      );
      return {
        ok:
          countOf(i) === '2 contacts' &&
          rows(i).length === 2 &&
          String(stored) === 'c1,c3' &&
          !confirmBlock(i) &&
          i.win.confirmCalls === 0,
        got: [countOf(i), stored],
      };
    }
  );
  check(
    'R.2',
    'Clear asks first, in the page: W13 with the count and the two buttons; nothing is removed yet; no browser pop-up',
    () => {
      const { CONTACTS_WORDS: W, clearAsk } = require('../src/lib/contacts/words');
      const local = new MemStore();
      seed(local, 'user-a', 3);
      const i = screen('user-a', { local });
      press(i, clearButton(i));
      const ask = confirmBlock(i);
      return {
        ok:
          !!ask &&
          flat(textOf(ask)).includes(clearAsk(3)) &&
          !!buttonText(ask, W.CLEAR_YES) &&
          !!buttonText(ask, W.CLEAR_KEEP) &&
          clearAsk(3) === 'Clear 3 contacts? You would need to load them again.' &&
          countOf(i) === '3 contacts' &&
          local.m.has(LIST_KEY('user-a')) &&
          i.win.confirmCalls === 0,
        got: flat(textOf(ask)),
      };
    }
  );
  check('R.3', '"Keep them" keeps the list and the ask goes away', () => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const local = new MemStore();
    seed(local, 'user-a', 3);
    const i = screen('user-a', { local });
    press(i, clearButton(i));
    press(i, buttonText(confirmBlock(i), W.CLEAR_KEEP));
    return {
      ok: !confirmBlock(i) && countOf(i) === '3 contacts' && local.m.has(LIST_KEY('user-a')),
    };
  });
  check(
    'R.4',
    '"Yes, clear" empties the list, my placements and my hand-off, and nobody else\'s; the count is 0 and W14 is back',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const local = new MemStore();
      const session = new MemStore();
      seed(local, 'user-a', 3);
      seed(local, 'user-b', 2);
      local.m.set('gather:contact-placed:v1:user-a:ev1', '[]');
      local.m.set('gather:contact-placed:v1:user-b:ev1', '[]');
      session.m.set('gather:contact-handoff:v1:user-a:ev1', '{}');
      session.m.set('gather:contact-handoff:v1:user-b:ev1', '{}');
      const win = makeWindow({ local, session });
      const i = mount(SCREEN, SCREEN_PROPS, { viewerId: 'user-a', win });
      press(i, clearButton(i));
      press(i, buttonText(confirmBlock(i), W.CLEAR_YES));
      const left = [...local.m.keys(), ...[...session.m.keys()].map((k) => `tab:${k}`)].sort();
      return {
        ok:
          countOf(i) === '0 contacts' &&
          textOf(byAttr(i.tree(), 'data-contacts-state')) === W.EMPTY &&
          !confirmBlock(i) &&
          clearButton(i)?.props.disabled === true &&
          left.join() ===
            [
              LIST_KEY('user-b'),
              'gather:contact-placed:v1:user-b:ev1',
              'tab:gather:contact-handoff:v1:user-b:ev1',
            ]
              .sort()
              .join(),
        got: left,
      };
    }
  );
  check('R.5', 'the ask for one person reads in the singular (W13)', () => {
    const { clearAsk } = require('../src/lib/contacts/words');
    const local = new MemStore();
    seed(local, 'user-a', 1);
    const i = screen('user-a', { local });
    press(i, clearButton(i));
    return {
      ok:
        countOf(i) === '1 contact' &&
        flat(textOf(confirmBlock(i))).includes(
          'Clear 1 contact? You would need to load it again.'
        ) &&
        clearAsk(1) === 'Clear 1 contact? You would need to load it again.',
      got: flat(textOf(confirmBlock(i))),
    };
  });

  // ── A Remove or a Clear that cannot save (ruling 172, W42) ───────────────────
  const stateLines = (i: Inst) =>
    all(i.tree(), (e) => 'data-contacts-state' in e.props).map((e) => textOf(e));
  const fireStorage = (i: Inst, key: string | null) =>
    i.act(() => (i.win.listeners['storage'] ?? []).forEach((f) => f({ key })));
  /** Remove one person while the browser will not save (refused) or has no room (full). */
  const failedRemove = (mode: 'refused' | 'full') => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const local = new MemStore();
    seed(local, 'user-a', 3);
    const before = local.m.get(LIST_KEY('user-a'));
    const i = screen('user-a', { local });
    local.failWrite = true;
    local.failWith = mode;
    press(i, buttons(rows(i)[1])[0]);
    const lines = stateLines(i);
    return {
      ok:
        lines.includes(W.SAVE_FAILED) &&
        !lines.includes(W.REFUSED) &&
        !lines.includes(W.EMPTY) &&
        countOf(i) === '3 contacts' &&
        rows(i).length === 3 &&
        local.m.get(LIST_KEY('user-a')) === before,
      got: [lines, countOf(i), rows(i).length],
    };
  };
  /** Clear (and "Yes, clear") while the browser will not remove (refused) or answers "no room" (full). */
  const failedClear = (mode: 'refused' | 'full') => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const local = new MemStore();
    seed(local, 'user-a', 3);
    const before = local.m.get(LIST_KEY('user-a'));
    const i = screen('user-a', { local });
    press(i, clearButton(i));
    local.failRemove = true;
    local.failWith = mode;
    press(i, buttonText(confirmBlock(i), W.CLEAR_YES));
    const lines = stateLines(i);
    return {
      ok:
        lines.includes(W.SAVE_FAILED) &&
        !lines.includes(W.REFUSED) &&
        !confirmBlock(i) &&
        countOf(i) === '3 contacts' &&
        rows(i).length === 3 &&
        clearButton(i)?.props.disabled === false &&
        local.m.get(LIST_KEY('user-a')) === before,
      got: [lines, countOf(i), rows(i).length, !!confirmBlock(i)],
    };
  };
  /** The line belongs to the last try: not there before, gone once a change saves or her list is read again. */
  const lineComesAndGoes = () => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const local = new MemStore();
    seed(local, 'user-a', 4);
    const i = screen('user-a', { local });
    const notYet = !stateLines(i).includes(W.SAVE_FAILED);
    local.failWrite = true;
    press(i, buttons(rows(i)[0])[0]);
    const shown = stateLines(i).includes(W.SAVE_FAILED);
    local.failWrite = false;
    press(i, buttons(rows(i)[0])[0]);
    const goneAfterSave = !stateLines(i).includes(W.SAVE_FAILED) && countOf(i) === '3 contacts';
    local.failWrite = true;
    press(i, buttons(rows(i)[0])[0]);
    const shownAgain = stateLines(i).includes(W.SAVE_FAILED);
    local.failWrite = false;
    fireStorage(i, LIST_KEY('user-a'));
    const goneAfterRead = !stateLines(i).includes(W.SAVE_FAILED);
    return {
      ok: notYet && shown && goneAfterSave && shownAgain && goneAfterRead,
      got: { notYet, shown, goneAfterSave, shownAgain, goneAfterRead },
    };
  };
  check(
    'R.6',
    'Remove while the browser refuses to save: W42 is shown, not W16; the person is still listed; nothing stored changed',
    () => failedRemove('refused')
  );
  check(
    'R.7',
    'Remove while the browser is full: the same W42, the person still listed, nothing stored changed',
    () => failedRemove('full')
  );
  check(
    'R.8',
    'Clear while the browser refuses to remove: W42, the question closes, the whole list is still there, Clear is live again',
    () => failedClear('refused')
  );
  check(
    'R.9',
    'Clear when the browser answers "no room": the same W42 and the same list (Clear never writes, so this is the one error the store reports as refused)',
    () => failedClear('full')
  );
  check(
    'R.10',
    'W42 is not there before a failed try, goes when the next change saves, and goes when her list is read again',
    lineComesAndGoes
  );
  check(
    'R.11',
    'break proofs (on in-memory copies of the screen): each fault below turns exactly the checks named red and leaves the others green',
    () => {
      const runs: Record<string, () => { ok: boolean }> = {
        'R.6': () => failedRemove('refused'),
        'R.7': () => failedRemove('full'),
        'R.8': () => failedClear('refused'),
        'R.9': () => failedClear('full'),
        'R.10': lineComesAndGoes,
      };
      const verdict = (id: string) => {
        try {
          return runs[id]().ok ? 'green' : 'red';
        } catch {
          return 'threw';
        }
      };
      // [what is wrong, the text it replaces (exactly once), the replacement, checks that go red]
      const faults: Array<[string, string, string, string[]]> = [
        [
          'the line is never drawn',
          '{saveFailed && !refused && (',
          '{false && (',
          ['R.6', 'R.7', 'R.8', 'R.9', 'R.10'],
        ],
        [
          'the old W16 is drawn instead of W42',
          '{W.SAVE_FAILED}',
          '{W.REFUSED}',
          ['R.6', 'R.7', 'R.8', 'R.9', 'R.10'],
        ],
        [
          'a Remove that fails as "full" is not counted as a failure',
          "const removeFailed = done.status !== 'ok';",
          "const removeFailed = done.status === 'refused';",
          ['R.7'],
        ],
        [
          'the person leaves the screen though the save failed',
          'if (!removeFailed) setContacts(done.contacts);',
          'setContacts(contacts.filter((c) => c.id !== id));',
          ['R.6', 'R.7', 'R.10'],
        ],
        [
          'a failed Clear says nothing',
          "const clearFailed = done.status !== 'ok';",
          'const clearFailed = false;',
          ['R.8', 'R.9'],
        ],
        [
          'a good save does not take the line away',
          'setSaveFailed(removeFailed);',
          'if (removeFailed) setSaveFailed(true);',
          ['R.10'],
        ],
        [
          'reading her list again does not take the line away',
          'setSaveFailed(false); // her list was read again: the old line is out of date',
          '',
          ['R.10'],
        ],
      ];
      const src = read(SCREEN);
      const report = faults.map(([what, from, to, red]) => {
        const once = src.split(from).length === 2;
        if (!once) return `${what}: its anchor is not in the screen exactly once`;
        const bad = withScreenSource(
          src.replace(from, () => to),
          () =>
            Object.keys(runs)
              .map((id) => [id, verdict(id)] as const)
              .filter(([id, v]) => v !== (red.includes(id) ? 'red' : 'green'))
        );
        return bad.length === 0 ? '' : `${what}: ${bad.map(([id, v]) => `${id} ${v}`).join(', ')}`;
      });
      const wrong = report.filter(Boolean);
      return { ok: wrong.length === 0, got: wrong };
    }
  );

  // ══ T — TWO TABS ════════════════════════════════════════════════════════════
  section('T — two tabs of the page keep in step');
  check(
    'T.1',
    "a change to my list in another tab shows here; another person's change does not",
    () => {
      const local = new MemStore();
      seed(local, 'user-a', 2);
      const i = screen('user-a', { local });
      seed(local, 'user-a', 4);
      const fire = (key: string | null) =>
        i.act(() => (i.win.listeners['storage'] ?? []).forEach((f) => f({ key })));
      fire(LIST_KEY('user-b'));
      const untouched = countOf(i);
      fire(LIST_KEY('user-a'));
      const updated = countOf(i);
      local.m.clear();
      fire(null);
      return {
        ok: untouched === '2 contacts' && updated === '4 contacts' && countOf(i) === '0 contacts',
        got: [untouched, updated, countOf(i)],
      };
    }
  );

  // ══ E — THE ADDRESS AND THE WAY BACK ════════════════════════════════════════
  section('E — the way back to the household list');
  check(
    'E.1',
    'from an event: "Back to your households" goes to that event\'s Moment 1; with a household being changed, to it',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const plain = screen('user-a', { search: '?event=ev1' });
      const withEdit = screen('user-a', { search: '?event=ev1&edit=hh1' });
      const host = screen('user-a', { search: '?event=ev1&form=host' });
      const hrefOf = (i: Inst) => linkText(i.tree(), W.BACK)?.props.href;
      return {
        ok:
          hrefOf(plain) === '/plan/ev1/setup?at=people' &&
          hrefOf(withEdit) === '/plan/ev1/setup?at=people&edit=hh1' &&
          hrefOf(host) === '/plan/ev1/setup?at=people',
        got: [hrefOf(plain), hrefOf(withEdit), hrefOf(host)],
      };
    }
  );
  check('E.2', 'no event in the address, or one that is not an id: no way back is drawn', () => {
    const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
    const none = screen('user-a');
    const bad = [
      '?event=',
      '?event=../../x',
      '?event=a b',
      '?event=javascript:alert(1)',
      '?event=ev1&edit=a@b.c',
      '?edit=hh1',
    ].map((s) => linkText(screen('user-a', { search: s }).tree(), W.BACK)?.props.href);
    return {
      ok:
        !linkText(none.tree(), W.BACK) &&
        bad[0] === undefined &&
        bad[1] === undefined &&
        bad[2] === undefined &&
        bad[3] === undefined &&
        bad[5] === undefined &&
        bad[4] === '/plan/ev1/setup?at=people',
      got: bad,
    };
  });
  check('E.3', 'the address functions put ids and nothing else in an address', () => {
    const { contactsHref, readAddress } = require('../src/lib/contacts/address');
    const a = contactsHref({ eventId: 'ev1' });
    const b = contactsHref({ eventId: 'ev1', form: 'host' });
    const c = contactsHref({ eventId: 'ev1', editId: 'hh1' });
    const back = readAddress('?event=ev1&edit=hh1');
    const junk = readAddress('?event=ev1&edit=Kate%20Smith&form=nonsense');
    return {
      ok:
        a === '/plan/contacts?event=ev1' &&
        b === '/plan/contacts?event=ev1&form=host' &&
        c === '/plan/contacts?event=ev1&edit=hh1' &&
        back.eventId === 'ev1' &&
        back.editId === 'hh1' &&
        junk.eventId === 'ev1' &&
        junk.editId === null &&
        junk.form === null,
      got: [a, b, c, back, junk],
    };
  });

  // The setup page reads one more address word, `edit`, once (plan section 13, item 1). It has to be
  // read EARLY, in the arrival block, because that block puts the address back to the bare page.
  const setupSource = read(SETUP_PAGE);
  const arrival = (src: string) => {
    const code = stripComments(src);
    const flatCode = flat(code);
    const reads = (code.match(/get\('edit'\)/g) ?? []).length;
    const replaces = (code.match(/window\.history\.replaceState\(/g) ?? []).length;
    return {
      readsOnce: reads === 1,
      beforeTheAddressIsEmptied:
        reads === 1 && code.indexOf("get('edit')") < code.indexOf('window.history.replaceState('),
      joinsTheOneReplace:
        replaces === 1 &&
        /if \(at !== null \|\| askedItem !== null \|\| askedPerson !== null \|\| askedEdit !== null\) \{/.test(
          flatCode
        ),
      heldForTheList: /if \(stage === 'moment1' && askedEdit\) setArriveAtEdit\(askedEdit\);/.test(
        flatCode
      ),
      noSearchParamsHook: !/useSearchParams/.test(code),
      noScrollTokens: !/scrollIntoView|window\.scrollTo|scrollTop|scrollBy/.test(
        code.slice(code.indexOf('arriveAtEdit'), code.indexOf('arriveAtEdit') + 400)
      ),
    };
  };
  check(
    'E.4',
    'the setup page reads edit once, early (before the address is emptied), in the one block with at, item and person',
    () => {
      const a = arrival(setupSource);
      return { ok: Object.values(a).every(Boolean), got: a };
    }
  );
  /** The effect that opens the household, cut out of the page and run on its own. */
  const runOpenEffect = (
    src: string,
    word: string | null,
    loaded: boolean,
    list: Array<{ id: string }>
  ) => {
    const code = stripComments(src);
    const m = code.match(
      /useEffect\(\(\) => \{\s*(if \(!arriveAtEdit \|\| !householdsLoaded\) return;[\s\S]*?)\}, \[arriveAtEdit, householdsLoaded, households\]\);/
    );
    if (!m) throw new Error('the effect that opens the household is not in the page');
    const calls: string[] = [];
    new Function(
      'arriveAtEdit',
      'householdsLoaded',
      'households',
      'setArriveAtEdit',
      'setEditingHousehold',
      m[1]
    )(
      word,
      loaded,
      list,
      (v: unknown) => calls.push(`word:${v}`),
      (v: any) => calls.push(`open:${v?.id}`)
    );
    return calls.join();
  };
  check(
    'E.5',
    'once the list has loaded the named household opens, once; an id not in the list is ignored; before the list, nothing',
    () => {
      const list = [{ id: 'hh1' }, { id: 'hh2' }];
      const r = [
        runOpenEffect(setupSource, 'hh2', true, list),
        runOpenEffect(setupSource, 'nope', true, list),
        runOpenEffect(setupSource, 'hh2', false, list),
        runOpenEffect(setupSource, null, true, list),
      ];
      return {
        ok: r[0] === 'word:null,open:hh2' && r[1] === 'word:null' && r[2] === '' && r[3] === '',
        got: r,
      };
    }
  );
  check(
    'E.6',
    'break proofs: the read put after the address is emptied, or left out of the one replace, turns E.4 red',
    () => {
      const late = setupSource.replace(
        'const askedEdit =',
        "window.history.replaceState(null, '', '/'); const askedEdit ="
      );
      const apart = setupSource.replace(' || askedEdit !== null) {', ') {');
      return {
        ok:
          late !== setupSource &&
          apart !== setupSource &&
          !Object.values(arrival(late)).every(Boolean) &&
          !Object.values(arrival(apart)).every(Boolean),
      };
    }
  );

  // ══ N — THE MENU BAR ════════════════════════════════════════════════════════
  section('N — the menu bar item (W41), in the computer bar and the phone menu');
  check(
    'N.1',
    '"Your contacts" is the last item of the one list both bars draw, a plain link to /plan/contacts',
    () => {
      const nav = stripComments(read(NAV));
      const at = nav.indexOf('const navItems = [');
      const list = at < 0 ? '' : nav.slice(at, nav.indexOf('];', at));
      const items = [...list.matchAll(/\{\s*href:\s*'([^']*)',\s*label:\s*'([^']*)'/g)].map((m) => [
        m[1],
        m[2],
      ]);
      const last = items[items.length - 1];
      const bars = (nav.match(/navItems\.map\(/g) ?? []).length;
      return {
        ok:
          items.length === 3 &&
          last?.[0] === '/plan/contacts' &&
          last?.[1] === 'Your contacts' &&
          ruled('Your contacts') &&
          bars >= 2 &&
          !/<Link\b/.test(nav),
        got: [items, bars],
      };
    }
  );

  // ══ H — THE ENTRY ON THE HOUSEHOLD FORM ═════════════════════════════════════
  section(
    'H — the way in from the household form (W31), and leaving without losing what was typed'
  );
  const form = (
    over: Record<string, unknown> = {},
    opts: { viewerId?: string | null; draftStore?: FormDraft.DraftStore | null } = {}
  ) =>
    mount(
      FORM,
      {
        eventId: 'ev1',
        eventName: 'Boxing Day',
        onComplete() {},
        onAddPerson: async () => {},
        onEditSave: async () => {},
        onSaveHostHousehold: async () => {},
        channelCandidates: [],
        ...over,
      },
      opts
    );
  const resume = (ids: string[] | null) => ({ resumeEdit: { savedIds: ids, open() {} } });
  const entry = (i: Inst) => byAttr(i.tree(), 'data-contacts-entry');
  const entryLink = (i: Inst) => all(entry(i), (e) => e.type === 'a')[0];
  const typeName = (i: Inst, v: string) =>
    i.act(() =>
      all(
        i.tree(),
        (e) => e.type === 'input' && e.props.placeholder === 'e.g. Sarah Mitchell'
      )[0].props.onChange({ target: { value: v } })
    );
  check(
    'H.1',
    'only her own household saved: the large block, with the W31 sentence and a link "Your contacts" to this event',
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const i = form(resume(['hh-own']));
      const e = entry(i);
      return {
        ok:
          e?.props['data-contacts-entry'] === 'large' &&
          textOf(e).includes(W.ENTRY_LARGE) &&
          textOf(entryLink(i)).trim() === W.ENTRY_LINK &&
          entryLink(i)?.props.href === '/plan/contacts?event=ev1',
        got: [e?.props['data-contacts-entry'], entryLink(i)?.props.href],
      };
    }
  );
  check(
    'H.2',
    "others saved, or the list not loaded, or her own household's step: only the small link, without the W31 sentence",
    () => {
      const { CONTACTS_WORDS: W } = require('../src/lib/contacts/words');
      const many = form(resume(['hh-own', 'hh-2']));
      const unknown = form(resume(null));
      const noResume = form();
      const host = form({ hostMode: { name: 'Kate', email: 'kate@example.com' } });
      const small = [many, unknown, noResume, host].map(
        (i) =>
          entry(i)?.props['data-contacts-entry'] === 'small' &&
          !textOf(entry(i)).includes(W.ENTRY_LARGE) &&
          textOf(entryLink(i)).trim() === W.ENTRY_LINK
      );
      return { ok: small.every(Boolean), got: small };
    }
  );
  check(
    'H.3',
    'the address says which form she left: her own step adds form=host; a household being changed adds edit=<id>',
    () => {
      const host = form({ hostMode: { name: 'Kate', email: 'kate@example.com' } });
      const editing = form({
        editingHousehold: {
          id: 'hh-9',
          primaryContact: { name: 'Mere Tane', email: '', phone: '' },
          helpers: [],
          littleCount: 0,
          guests: [],
          contactPersonEventId: null,
        },
        onCancelEdit() {},
        ...resume(['hh-own', 'hh-9']),
      });
      return {
        ok:
          entryLink(host)?.props.href === '/plan/contacts?event=ev1&form=host' &&
          entryLink(editing)?.props.href === '/plan/contacts?event=ev1&edit=hh-9',
        got: [entryLink(host)?.props.href, entryLink(editing)?.props.href],
      };
    }
  );
  check(
    'H.4',
    'the address holds no name, email or number, even with a name and an email typed',
    () => {
      const i = form(resume(['hh-own']), { viewerId: 'user-a', draftStore: new MemStore() });
      typeName(i, 'Kate Smith');
      const href = String(entryLink(i)?.props.href);
      return {
        ok: href === '/plan/contacts?event=ev1' && !/Kate|Smith|@|\d{5}/.test(href),
        got: href,
      };
    }
  );
  check('H.5', "the link is a plain link, like the menu bar's (a full page load)", () => {
    const i = form(resume(['hh-own']));
    const a = entryLink(i);
    return {
      ok: a?.type === 'a' && typeof a?.props.href === 'string' && !('target' in a.props),
      got: a?.type,
    };
  });

  const click = (i: Inst, ev: Record<string, unknown> = {}) => {
    const timers: Array<() => void> = [];
    const realSet = globalThis.setTimeout;
    (globalThis as any).setTimeout = (fn: () => void) => {
      timers.push(fn);
      return 0;
    };
    try {
      press(i, entryLink(i), {
        button: 0,
        metaKey: false,
        ctrlKey: false,
        shiftKey: false,
        altKey: false,
        ...ev,
      });
    } finally {
      globalThis.setTimeout = realSet;
    }
    return timers;
  };
  const asks = (i: Inst) => {
    let prevented = false;
    for (const f of i.win.listeners['beforeunload'] ?? [])
      f({ preventDefault: () => (prevented = true) });
    return prevented;
  };
  const draftKeys = (s: MemStore) =>
    [...s.m.keys()].filter((k) => k.startsWith(FormDraft.DRAFT_PREFIX));
  check(
    'H.6',
    'pressing the link keeps what was typed and leaves without "Leave site?"; before it, and for every other exit, the question stands',
    () => {
      const drafts = new MemStore();
      const i = form(resume(['hh-own']), { viewerId: 'user-a', draftStore: drafts });
      typeName(i, 'Kate Smith');
      const askedBefore = asks(i);
      click(i);
      return {
        ok: askedBefore === true && draftKeys(drafts).length === 1 && asks(i) === false,
        got: [askedBefore, draftKeys(drafts).length],
      };
    }
  );
  check('H.7', 'if the browser would not keep the draft, the question still shows', () => {
    const drafts = new MemStore();
    const i = form(resume(['hh-own']), { viewerId: 'user-a', draftStore: drafts });
    drafts.failWrite = true;
    typeName(i, 'Kate Smith');
    click(i);
    return { ok: asks(i) === true && draftKeys(drafts).length === 0 };
  });
  check(
    'H.8',
    'the "skip the question" lasts moments only, and a press with a modifier key (a new tab) never starts it',
    () => {
      const drafts = new MemStore();
      const i = form(resume(['hh-own']), { viewerId: 'user-a', draftStore: drafts });
      typeName(i, 'Kate Smith');
      click(i, { ctrlKey: true });
      const afterNewTab = asks(i);
      const timers = click(i);
      const quiet = asks(i);
      timers.forEach((t) => t());
      return {
        ok: afterNewTab === true && quiet === false && timers.length === 1 && asks(i) === true,
        got: [afterNewTab, quiet, timers.length],
      };
    }
  );
  check('H.9', 'a form with nothing typed: pressing the link writes no draft', () => {
    const drafts = new MemStore();
    const i = form(resume(['hh-own']), { viewerId: 'user-a', draftStore: drafts });
    click(i);
    return { ok: draftKeys(drafts).length === 0 && asks(i) === false };
  });

  // ══ L — LOADING: PASTE, FILE, THE PHONE'S PICKER, AND A ROW WITH A PROBLEM (step 3b) ═══════
  section('L — loading people: the paste box, the file choice, the phone picker, flagged rows');
  /** Registers a loading check so it can be run again on a broken copy of the screen (L.21), and runs it. */
  const lRuns: Record<string, () => Promise<{ ok: boolean; got?: unknown }>> = {};
  const lcheck = async (
    id: string,
    label: string,
    fn: () =>
      | boolean
      | { ok: boolean; got?: unknown }
      | Promise<boolean | { ok: boolean; got?: unknown }>
  ) => {
    lRuns[id] = async () => {
      const r = await fn();
      return typeof r === 'boolean' ? { ok: r } : r;
    };
    await checkAsync(id, label, () => lRuns[id]());
  };
  const WD = () => require('../src/lib/contacts/words');
  const WW = () => WD().CONTACTS_WORDS;
  const G448 = () => require('../src/lib/contact-import/types').WORDS;
  const pasteBox = (i: Inst) => all(i.tree(), (e) => e.type === 'textarea')[0];
  const typePaste = (i: Inst, v: string) =>
    i.act(() => pasteBox(i).props.onChange({ target: { value: v } }));
  const pasteButton = (i: Inst) => buttonText(i.tree(), WW().PASTE_BUTTON);
  const fileInput = (i: Inst) =>
    all(i.tree(), (e) => e.type === 'input' && e.props.type === 'file')[0];
  const fileButton = (i: Inst) => buttonText(i.tree(), WW().FILE_BUTTON);
  const pickerButton = (i: Inst) => buttonText(i.tree(), WW().PICKER_BUTTON);
  const loadArea = (i: Inst) => byAttr(i.tree(), 'data-contacts-load');
  const summaryOf = (i: Inst) =>
    all(byAttr(i.tree(), 'data-contacts-summary'), (e) => e.type === 'p').map((p) => textOf(p));
  const storedList = (local: MemStore, u = 'user-a'): any[] =>
    JSON.parse(local.m.get(LIST_KEY(u)) ?? '{}').contacts ?? [];
  const rowOf = (i: Inst, name: string) => rows(i).find((r) => textOf(r).includes(name));
  const fakeFile = (name: string, type: string, size: number, text: string) => {
    const f = {
      name,
      type,
      size,
      reads: 0,
      text() {
        f.reads++;
        return Promise.resolve(text);
      },
    };
    return f;
  };
  const chooseFile = (i: Inst, f: unknown) => {
    const target = { files: [f], value: 'C:\\fakepath\\chosen' };
    return i.actAsync(() => fileInput(i).props.onChange({ target })).then(() => target);
  };
  const SAMPLE = [
    'Sam Overseas, +44 20 7946 0958',
    'Bad Email, 021 555 0150, bad@email',
    'Just A Name',
    'Mere Tane, 021 555 0147, mere@example.com',
  ].join('\n');
  const loaded = (text = SAMPLE, o: { local?: MemStore } = {}) => {
    const local = o.local ?? new MemStore();
    const i = screen('user-a', { local });
    typePaste(i, text);
    press(i, pasteButton(i));
    return { i, local };
  };
  /** The page's markup as plain text, without its handlers: to compare one page with another. */
  const markup = (n: any): string => {
    if (n == null || typeof n === 'boolean') return '';
    if (typeof n === 'string' || typeof n === 'number') return String(n);
    if (Array.isArray(n)) return n.map(markup).join('');
    if (!isEl(n)) return '';
    const attrs = Object.keys(n.props)
      .filter(
        (k) =>
          k !== 'children' && typeof n.props[k] !== 'function' && typeof n.props[k] !== 'object'
      )
      .sort()
      .map((k) => `${k}=${String(n.props[k])}`)
      .join(' ');
    return `<${typeof n.type === 'string' ? n.type : 'C'} ${attrs}>${markup(n.props.children)}</>`;
  };
  /** A pretend Android phone: select() records its calls and returns what the test scripts. */
  const androidPhone = (script: (calls: any[]) => unknown) => {
    const calls: any[] = [];
    const contacts = {
      select(this: unknown, props: unknown, options: unknown) {
        calls.push({ props, options, self: this });
        return script(calls);
      },
    };
    return {
      calls,
      contacts,
      phone: {
        navigator: { contacts },
        ContactsManager: function ContactsManager() {},
        isSecureContext: true,
      },
    };
  };
  const named = (name: string) => {
    const e = new Error('x');
    e.name = name;
    return e;
  };

  await lcheck(
    'L.1',
    'signed in: the paste box (label, help, the example in the empty box, button), the file choice with its help, the laptop note; nothing for a phone picker',
    () => {
      const W = WW();
      const i = screen('user-a');
      const area = loadArea(i);
      const label = all(area, (e) => e.type === 'label').find(
        (l) => textOf(l).trim() === W.PASTE_LABEL
      );
      const box = pasteBox(i);
      const t = flat(textOf(area));
      return {
        ok:
          !!area &&
          !!label &&
          label.props.htmlFor === box?.props.id &&
          !!box?.props.id &&
          box.props.placeholder === W.PASTE_EXAMPLE &&
          t.includes(W.PASTE_HELP) &&
          !!pasteButton(i) &&
          !!fileButton(i) &&
          t.includes(W.FILE_HELP) &&
          flat(textOf(byAttr(i.tree(), 'data-contacts-laptop'))) === W.LAPTOP_NOTE &&
          fileInput(i)?.props.accept?.includes('.csv') &&
          fileInput(i)?.props.accept?.includes('.vcf') &&
          !pickerButton(i) &&
          flat(textOf(i.first)) === `${W.TITLE}${W.A5}`,
        got: [!!area, !!label, !!pasteButton(i), !!fileButton(i)],
      };
    }
  );
  await lcheck(
    'L.2',
    'nobody signed in: no loading area at all; storage refused: the area is drawn and every loading button is disabled',
    () => {
      const out = screen(null);
      const local = new MemStore();
      local.failRead = true;
      const i = screen('user-a', { local, phone: androidPhone(() => Promise.resolve([])).phone });
      return {
        ok:
          !loadArea(out) &&
          !pasteBox(out) &&
          !!loadArea(i) &&
          pasteButton(i)?.props.disabled === true &&
          fileButton(i)?.props.disabled === true &&
          pickerButton(i)?.props.disabled === true,
        got: [!!loadArea(out), pasteButton(i)?.props.disabled, fileButton(i)?.props.disabled],
      };
    }
  );
  await lcheck(
    'L.3',
    'paste: the people appear in order, the count follows, they are stored whole, the summary says so, and the box empties',
    () => {
      const { i, local } = loaded();
      const stored = storedList(local);
      return {
        ok:
          rows(i).length === 4 &&
          countOf(i) === '4 contacts' &&
          stored.map((c) => c.name).join() === 'Sam Overseas,Bad Email,Just A Name,Mere Tane' &&
          JSON.stringify(summaryOf(i)).includes('Added 4 people.') &&
          pasteBox(i).props.value === '',
        got: [rows(i).length, countOf(i), summaryOf(i), stored.length],
      };
    }
  );
  await lcheck(
    'L.4',
    'paste with nobody in it: "We couldn\'t find anyone in that.", the text stays in the box, nothing is stored; a name-less line is counted',
    () => {
      const W = WW();
      const a = loaded('   \n  ');
      const b = loaded('021 555 0151, x@y.co');
      return {
        ok:
          summaryOf(a.i).join('|') === W.NOTHING_FOUND &&
          storedList(a.local).length === 0 &&
          pasteBox(a.i).props.value === '   \n  ' &&
          summaryOf(b.i).join('|') === `${W.NOTHING_FOUND}|1 had no name, so they were left out.` &&
          pasteBox(b.i).props.value === '021 555 0151, x@y.co',
        got: [summaryOf(a.i), summaryOf(b.i)],
      };
    }
  );
  await lcheck(
    'L.5',
    'the summary lines: added, names turned round, and each left-out count only when above zero',
    () => {
      const { i } = loaded(
        'Brown, Tui, 022 555 0149\nMere Tane, 021 555 0147\n021 555 0151, x@y.co\n022 555 0152, z@y.co\n' +
          `${'N'.repeat(201)}, 021 555 0153`
      );
      return {
        ok:
          summaryOf(i).join('|') ===
          [
            'Added 2 people.',
            'We turned 1 name around from “Last, First” to “First Last”.',
            '2 had no name, so they were left out.',
            "1 couldn't be read, so it was left out.",
          ].join('|'),
        got: summaryOf(i),
      };
    }
  );
  await lcheck(
    'L.6',
    'pasted text: 100,000 characters are read, 100,001 are refused with the ruled sentence and nothing is read or stored',
    () => {
      const W = WW();
      const over = loaded('x'.repeat(100001));
      const exact = loaded('x'.repeat(100000));
      return {
        ok:
          summaryOf(over.i).join('|') === W.TOO_LONG &&
          storedList(over.local).length === 0 &&
          !summaryOf(exact.i).includes(W.TOO_LONG) &&
          summaryOf(exact.i).length > 0,
        got: [summaryOf(over.i), summaryOf(exact.i)],
      };
    }
  );
  await lcheck(
    'L.7',
    'a CSV and a vCard file are read in the browser and added; the chooser is reset so the same file can be chosen again',
    async () => {
      const csv = fakeFile(
        'friends.csv',
        'text/csv',
        200,
        'First Name,Last Name,Email,Phone\nMere,Tane,mere@example.com,021 555 0147\nHone,Rata,,\n'
      );
      const vcf = fakeFile(
        'friends.vcf',
        'text/vcard',
        200,
        'BEGIN:VCARD\nVERSION:3.0\nFN:Aroha Smith\nTEL:021 555 0148\nEND:VCARD\n'
      );
      const local = new MemStore();
      const i = screen('user-a', { local });
      const t1 = await chooseFile(i, csv);
      const afterCsv = [rows(i).length, summaryOf(i).join('|')];
      const t2 = await chooseFile(i, vcf);
      return {
        ok:
          csv.reads === 1 &&
          vcf.reads === 1 &&
          afterCsv[0] === 2 &&
          afterCsv[1] === 'Added 2 people.' &&
          rows(i).length === 3 &&
          summaryOf(i).join('|') === 'Added 1 person.' &&
          storedList(local)
            .map((c) => c.name)
            .join() === 'Mere Tane,Hone Rata,Aroha Smith' &&
          t1.value === '' &&
          t2.value === '',
        got: [afterCsv, rows(i).length, t1.value],
      };
    }
  );
  await lcheck(
    'L.8',
    'a file refused before it is read (over 5 MB, the wrong kind) says so in the ruled words and is never read; one that cannot be read says that',
    async () => {
      const W = WW();
      const big = fakeFile('big.vcf', 'text/vcard', 5 * 1024 * 1024 + 1, 'x');
      const wrong = fakeFile('notes.txt', 'text/plain', 10, 'x');
      const broken = {
        name: 'a.csv',
        type: 'text/csv',
        size: 10,
        text: () => Promise.reject(new Error('read failed')),
      };
      const local = new MemStore();
      const i = screen('user-a', { local });
      await chooseFile(i, big);
      const a = summaryOf(i).join('|');
      await chooseFile(i, wrong);
      const b = summaryOf(i).join('|');
      await chooseFile(i, broken);
      const c = summaryOf(i).join('|');
      return {
        ok:
          big.reads === 0 &&
          wrong.reads === 0 &&
          a === W.TOO_BIG &&
          b === W.WRONG_TYPE &&
          c === W.FILE_UNREADABLE &&
          storedList(local).length === 0,
        got: [a, b, c],
      };
    }
  );
  await lcheck(
    'L.9',
    '"Choose a file" opens the chooser (it presses the hidden file input) and does nothing else',
    () => {
      const i = screen('user-a');
      let clicks = 0;
      fileInput(i).props.ref.current = { click: () => clicks++ };
      press(i, fileButton(i));
      return { ok: clicks === 1 && rows(i).length === 0 && summaryOf(i).length === 0, got: clicks };
    }
  );
  await lcheck(
    'L.10',
    'a row with a problem shows the reader\'s own sentence, "Gather will take care of this." and the three ways forward; a row with none shows nothing extra',
    () => {
      const W = WW();
      const g = G448();
      const { i } = loaded();
      const sam = rowOf(i, 'Sam Overseas');
      const bad = rowOf(i, 'Bad Email');
      const bare = rowOf(i, 'Just A Name');
      const mere = rowOf(i, 'Mere Tane');
      const probs = (r: El | undefined) =>
        all(byAttr(r, 'data-contact-problems'), (e) => e.type === 'p').map((p) => textOf(p));
      const ways = (r: El | undefined) =>
        buttons(byAttr(r, 'data-contact-ways')).map((b) => textOf(b).trim());
      return {
        ok:
          probs(sam).join('|') === g.W2 &&
          probs(bad).join('|') === g.W1 &&
          textOf(byAttr(sam, 'data-contact-care')) === W.FLAG_CARE &&
          ways(sam).join('|') === [W.DOUBLE_CHECK, W.SKIP_IT, W.DIFFERENT_WAY].join('|') &&
          ways(bad).length === 3 &&
          textOf(sam).includes('+44 20 7946 0958') &&
          [bare, mere].every(
            (r) =>
              !byAttr(r, 'data-contact-problems') &&
              !byAttr(r, 'data-contact-care') &&
              !byAttr(r, 'data-contact-ways')
          ) &&
          buttons(bare).length === 1 &&
          textOf(buttons(bare)[0]) === 'Remove',
        got: [probs(sam), ways(sam), buttons(bare).length],
      };
    }
  );
  await lcheck(
    'L.11',
    'Skip it: the flagged detail is left out, the person and the good details stay, the flag goes, and it is stored',
    () => {
      const W = WW();
      const { i, local } = loaded();
      press(i, buttonText(rowOf(i, 'Bad Email'), W.SKIP_IT));
      const bad = rowOf(i, 'Bad Email');
      const s = storedList(local).find((c) => c.name === 'Bad Email');
      return {
        ok:
          !!bad &&
          !textOf(bad).includes('bad@email') &&
          textOf(bad).includes('+64215550150') &&
          !byAttr(bad, 'data-contact-problems') &&
          !('email' in s) &&
          s.phone === '+64215550150' &&
          !('problems' in s) &&
          rows(i).length === 4 &&
          !!byAttr(rowOf(i, 'Sam Overseas'), 'data-contact-problems'),
        got: s,
      };
    }
  );
  await lcheck(
    'L.12',
    'Double-check it: boxes labelled Name, Email and Phone, the checks run again as she types, and Done saves it',
    () => {
      const W = WW();
      const g = G448();
      const { i, local } = loaded();
      press(i, buttonText(rowOf(i, 'Bad Email'), W.DOUBLE_CHECK));
      const panel = () => byAttr(rowOf(i, 'Bad Email'), 'data-contact-panel');
      const field = (label: string) => {
        const l = all(panel(), (e) => e.type === 'label').find((x) => textOf(x).trim() === label);
        return all(panel(), (e) => e.type === 'input').find((x) => x.props.id === l?.props.htmlFor);
      };
      const opened = [
        field(W.FIELD_NAME)?.props.value,
        field(W.FIELD_EMAIL)?.props.value,
        field(W.FIELD_PHONE)?.props.value,
      ];
      const live1 = () =>
        all(panel(), (e) => 'data-contact-live' in e.props)
          .map((p) => textOf(p))
          .join('|');
      const stillBad = live1();
      i.act(() => field(W.FIELD_EMAIL)!.props.onChange({ target: { value: 'Bad@Email.co' } }));
      const fixedLive = live1();
      const done = () => buttonText(panel(), W.DONE);
      i.act(() => field(W.FIELD_NAME)!.props.onChange({ target: { value: '   ' } }));
      const blankDisabled = done()?.props.disabled === true;
      i.act(() => field(W.FIELD_NAME)!.props.onChange({ target: { value: 'Bad  Email Two' } }));
      press(i, done());
      const s = storedList(local)[1];
      return {
        ok:
          opened.join('|') === 'Bad Email|bad@email|+64215550150' &&
          stillBad === g.W1 &&
          fixedLive === '' &&
          blankDisabled &&
          !panel() &&
          s.name === 'Bad Email Two' &&
          s.email === 'bad@email.co' &&
          !('problems' in s) &&
          !byAttr(rowOf(i, 'Bad Email Two'), 'data-contact-problems'),
        got: [opened, stillBad, fixedLive, blankDisabled, s],
      };
    }
  );
  await lcheck(
    'L.13',
    'Use a different way: one box, "Another number or email"; Done replaces the flagged detail and stores it',
    () => {
      const W = WW();
      const { i, local } = loaded();
      press(i, buttonText(rowOf(i, 'Sam Overseas'), W.DIFFERENT_WAY));
      const panel = () => byAttr(rowOf(i, 'Sam Overseas'), 'data-contact-panel');
      const l = all(panel(), (e) => e.type === 'label').find(
        (x) => textOf(x).trim() === W.FIELD_OTHER
      );
      const box = all(panel(), (e) => e.type === 'input').find(
        (x) => x.props.id === l?.props.htmlFor
      );
      i.act(() => box!.props.onChange({ target: { value: '022 555 0124' } }));
      press(i, buttonText(panel(), W.DONE));
      const s = storedList(local).find((c) => c.name === 'Sam Overseas');
      return {
        ok:
          !!l &&
          !!box &&
          !panel() &&
          s.phone === '+64225550124' &&
          !('problems' in s) &&
          !byAttr(rowOf(i, 'Sam Overseas'), 'data-contact-problems') &&
          textOf(rowOf(i, 'Sam Overseas')).includes('+64225550124'),
        got: s,
      };
    }
  );
  await lcheck(
    'L.14',
    'a fix the browser cannot save shows W42 and leaves the row exactly as it was',
    () => {
      const W = WW();
      const { i, local } = loaded();
      const before = local.m.get(LIST_KEY('user-a'));
      local.failWrite = true;
      press(i, buttonText(rowOf(i, 'Bad Email'), W.SKIP_IT));
      const lines = all(i.tree(), (e) => 'data-contacts-state' in e.props).map((e) => textOf(e));
      return {
        ok:
          lines.includes(W.SAVE_FAILED) &&
          local.m.get(LIST_KEY('user-a')) === before &&
          !!byAttr(rowOf(i, 'Bad Email'), 'data-contact-problems') &&
          textOf(rowOf(i, 'Bad Email')).includes('bad@email'),
        got: lines,
      };
    }
  );
  await lcheck(
    'L.15',
    'a load the browser cannot keep adds nothing: full says W17; refused says W16 and the loading buttons go grey',
    () => {
      const W = WW();
      const local = new MemStore();
      const i = screen('user-a', { local });
      local.failWrite = true;
      local.failWith = 'full';
      typePaste(i, SAMPLE);
      press(i, pasteButton(i));
      const full = [summaryOf(i).join('|'), rows(i).length, pasteBox(i).props.value === SAMPLE];
      local.failWith = 'refused';
      press(i, pasteButton(i));
      const states = all(i.tree(), (e) => 'data-contacts-state' in e.props).map((e) => textOf(e));
      return {
        ok:
          full[0] === W.FULL &&
          full[1] === 0 &&
          full[2] === true &&
          states.includes(W.REFUSED) &&
          rows(i).length === 0 &&
          pasteButton(i)?.props.disabled === true &&
          fileButton(i)?.props.disabled === true &&
          storedList(local).length === 0,
        got: [full, states],
      };
    }
  );
  await lcheck(
    'L.16',
    'under the cap: the people who fit are added, the rest counted in the ruled words, none dropped silently',
    () => {
      const local = new MemStore();
      const seed = Array.from({ length: 1998 }, (_, n) => ({ id: `old${n}`, name: `Old ${n}` }));
      local.m.set(LIST_KEY('user-a'), JSON.stringify({ v: 1, userId: 'user-a', contacts: seed }));
      const { i } = loaded('A One\nB Two\nC Three\nD Four\nE Five', { local });
      return {
        ok:
          countOf(i) === '2000 contacts' &&
          summaryOf(i).join('|') ===
            "Added 2 people.|3 didn't fit. This page holds up to 2,000 contacts.",
        got: [countOf(i), summaryOf(i)],
      };
    }
  );
  await lcheck(
    'L.17',
    'loading the same list twice doubles it (ruling 161): no person is skipped for being there already',
    () => {
      const { i, local } = loaded('Mere Tane, 021 555 0147\nHone Rata, 021 555 0148');
      typePaste(i, 'Mere Tane, 021 555 0147\nHone Rata, 021 555 0148');
      press(i, pasteButton(i));
      return {
        ok: countOf(i) === '4 contacts' && new Set(storedList(local).map((c) => c.id)).size === 4,
        got: countOf(i),
      };
    }
  );
  await lcheck(
    'L.18',
    'where the picker is not there (laptop, iPhone, an insecure page, no manager, no select) the page is the same as with no support at all: no button, no greyed button, no sentence, no wrapper',
    () => {
      const W = WW();
      const base = markup(screen('user-a').tree());
      const select = () => Promise.resolve([]);
      const shapes: Record<string, Record<string, unknown>> = {
        laptop: { navigator: {}, isSecureContext: true },
        iphone: { navigator: { userAgent: 'iPhone' }, isSecureContext: true },
        insecure: {
          navigator: { contacts: { select } },
          ContactsManager: function () {},
          isSecureContext: false,
        },
        noManager: { navigator: { contacts: { select } }, isSecureContext: true },
        noSelect: {
          navigator: { contacts: {} },
          ContactsManager: function () {},
          isSecureContext: true,
        },
        broken: { navigator: null, isSecureContext: true },
      };
      const same = Object.entries(shapes).filter(
        ([, phone]) => markup(screen('user-a', { phone }).tree()) !== base
      );
      const there = markup(screen('user-a', { phone: androidPhone(select).phone }).tree());
      return {
        ok:
          same.length === 0 &&
          !base.includes(W.PICKER_BUTTON) &&
          there.includes(W.PICKER_BUTTON) &&
          there !== base,
        got: same.map(([k]) => k),
      };
    }
  );
  await lcheck(
    'L.19',
    'the picker: the button shows where it exists; one tap makes one call, exactly select(["name","email","tel"], {multiple:true}), before any wait; the button is off while it is open; the people picked are added',
    async () => {
      const W = WW();
      let finish: (v: unknown) => void = () => {};
      const a = androidPhone(() => new Promise((res) => (finish = res)));
      const local = new MemStore();
      const i = screen('user-a', { local, phone: a.phone });
      const present = !!pickerButton(i) && pickerButton(i)!.props.disabled !== true;
      i.act(() => pickerButton(i)!.props.onClick({ preventDefault() {} }));
      const afterTap = a.calls.length; // before anything has been waited for
      const offWhileOpen = pickerButton(i)?.props.disabled === true;
      i.act(() => pickerButton(i)!.props.onClick({ preventDefault() {} }));
      const once = a.calls.length === 1;
      finish([
        { name: ['Pia Test'], tel: ['021 555 0111'] },
        { name: ['Smith, John'], email: ['js@example.com'], tel: [] },
      ]);
      await i.actAsync(async () => {});
      return {
        ok:
          present &&
          afterTap === 1 &&
          once &&
          offWhileOpen &&
          JSON.stringify(a.calls[0].props) === JSON.stringify(['name', 'email', 'tel']) &&
          JSON.stringify(a.calls[0].options) === JSON.stringify({ multiple: true }) &&
          a.calls[0].self === a.contacts &&
          countOf(i) === '2 contacts' &&
          storedList(local)
            .map((c) => c.name)
            .join() === 'Pia Test,John Smith' &&
          summaryOf(i).join('|') ===
            'Added 2 people.|We turned 1 name around from “Last, First” to “First Last”.' &&
          pickerButton(i)?.props.disabled !== true,
        got: {
          present,
          afterTap,
          offWhileOpen,
          once,
          count: countOf(i),
          summary: summaryOf(i),
          W: !!W,
        },
      };
    }
  );
  await lcheck(
    'L.20',
    'the picker ends: cancelled changes nothing and says nothing; refused or failed says W24, adds nothing and leaves the button usable; a full or refusing browser after picking says W17 or W16',
    async () => {
      const W = WW();
      const pickOnce = async (script: () => unknown, local = new MemStore()) => {
        const a = androidPhone(script);
        const i = screen('user-a', { local, phone: a.phone });
        await i.actAsync(() => pickerButton(i)!.props.onClick({ preventDefault() {} }));
        return i;
      };
      const people = [{ name: ['Pia Test'], tel: ['021 555 0111'] }];
      const cancelled = await pickOnce(() => Promise.resolve([]));
      const denied = await pickOnce(() => Promise.reject(named('NotAllowedError')));
      const thrown = await pickOnce(() => {
        throw new TypeError('not allowed here');
      });
      const odd = await pickOnce(() => Promise.reject('no thanks'));
      const fullLocal = new MemStore();
      const fullPhone = androidPhone(() => Promise.resolve(people));
      const fullI = screen('user-a', { local: fullLocal, phone: fullPhone.phone });
      fullLocal.failWrite = true;
      fullLocal.failWith = 'full';
      await fullI.actAsync(() => pickerButton(fullI)!.props.onClick({ preventDefault() {} }));
      const refLocal = new MemStore();
      const refPhone = androidPhone(() => Promise.resolve(people));
      const refI = screen('user-a', { local: refLocal, phone: refPhone.phone });
      refLocal.failWrite = true;
      await refI.actAsync(() => pickerButton(refI)!.props.onClick({ preventDefault() {} }));
      const refStates = all(refI.tree(), (e) => 'data-contacts-state' in e.props).map((e) =>
        textOf(e)
      );
      return {
        ok:
          summaryOf(cancelled).length === 0 &&
          countOf(cancelled) === '0 contacts' &&
          pickerButton(cancelled)?.props.disabled !== true &&
          [denied, thrown, odd].every(
            (x) =>
              summaryOf(x).join('|') === W.PICKER_FAILED &&
              countOf(x) === '0 contacts' &&
              pickerButton(x)?.props.disabled !== true
          ) &&
          summaryOf(fullI).join('|') === W.FULL &&
          countOf(fullI) === '0 contacts' &&
          refStates.includes(W.REFUSED) &&
          countOf(refI) === '0 contacts' &&
          pickerButton(refI)?.props.disabled === true,
        got: [
          summaryOf(cancelled),
          summaryOf(denied),
          summaryOf(thrown),
          summaryOf(odd),
          summaryOf(fullI),
          refStates,
        ],
      };
    }
  );

  await lcheck(
    'L.22',
    'W43 (odd letters in a file) is drawn under the file choice and its help line, before the laptop note, with or without a picker, and when storage is refused',
    () => {
      const W = WW();
      const order = (i: Inst) =>
        all(loadArea(i), (e) => e.type === 'p' || e.type === 'button').map((e) => textOf(e).trim());
      const at = (list: string[], t: string) => list.indexOf(t);
      const ok = (list: string[]) =>
        at(list, W.FILE_BUTTON) >= 0 &&
        at(list, W.FILE_HELP) > at(list, W.FILE_BUTTON) &&
        at(list, W.FILE_ODD_LETTERS) === at(list, W.FILE_HELP) + 1 &&
        at(list, W.LAPTOP_NOTE) > at(list, W.FILE_ODD_LETTERS);
      const plain = order(screen('user-a'));
      const withPicker = order(
        screen('user-a', { phone: androidPhone(() => Promise.resolve([])).phone })
      );
      const refusedLocal = new MemStore();
      refusedLocal.failRead = true;
      const refused = order(screen('user-a', { local: refusedLocal }));
      return {
        ok:
          W.FILE_ODD_LETTERS ===
            'If names show odd letters, save the file as CSV UTF-8 and choose it again.' &&
          ok(plain) &&
          ok(withPicker) &&
          ok(refused) &&
          !textOf(screen(null).tree()).includes(W.FILE_ODD_LETTERS),
        got: { plain, withPicker: withPicker.length, refused: refused.length },
      };
    }
  );
  const addButton = (r: El | undefined) => buttonText(r, WW().ADD_TO_HOUSEHOLD);
  const seedList = (local: MemStore) => {
    seed(local, 'user-a', 3);
    return local;
  };
  await lcheck(
    'L.23',
    'from an event each person has "Add to this household" (W19), after Remove; with no event, or one that is not an id, none is drawn',
    () => {
      const withEvent = screen('user-a', { local: seedList(new MemStore()), search: '?event=ev1' });
      const noEvent = screen('user-a', { local: seedList(new MemStore()) });
      const badEvent = screen('user-a', { local: seedList(new MemStore()), search: '?event=../x' });
      const first = rows(withEvent)[0];
      const labels = buttons(first).map((b) => textOf(b).trim());
      return {
        ok:
          rows(withEvent).length === 3 &&
          rows(withEvent).every((r) => !!addButton(r)) &&
          labels[0] === 'Remove' &&
          labels[1] === WW().ADD_TO_HOUSEHOLD &&
          WW().ADD_TO_HOUSEHOLD === 'Add to this household' &&
          rows(noEvent).every((r) => !addButton(r)) &&
          rows(badEvent).every((r) => !addButton(r)),
        got: labels,
      };
    }
  );
  await lcheck(
    'L.24',
    'pressing it leaves one note in this tab (no name, email or number) for the right form and goes back to that form in the same tab, even if the note cannot be kept',
    () => {
      const trip = (search: string) => {
        const local = seedList(new MemStore());
        const session = new MemStore();
        const win = makeWindow({ local, session, search });
        const i = mount(SCREEN, SCREEN_PROPS, { viewerId: 'user-a', win });
        press(i, addButton(rows(i)[1]));
        return { win, notes: [...session.m.entries()], local };
      };
      const plain = trip('?event=ev1');
      const host = trip('?event=ev1&form=host');
      const edit = trip('?event=ev1&edit=hh7');
      const parsed = (t: ReturnType<typeof trip>) =>
        t.notes.length === 1 ? JSON.parse(t.notes[0][1]) : null;
      const p = parsed(plain);
      const refusing = new MemStore();
      refusing.failWrite = true;
      const winR = makeWindow({
        local: seedList(new MemStore()),
        session: refusing,
        search: '?event=ev1',
      });
      const iR = mount(SCREEN, SCREEN_PROPS, { viewerId: 'user-a', win: winR });
      press(iR, addButton(rows(iR)[0]));
      const text = JSON.stringify(plain.notes);
      return {
        ok:
          plain.notes.length === 1 &&
          plain.notes[0][0] === 'gather:contact-handoff:v1:user-a:ev1' &&
          p.contactId === 'c2' &&
          p.form === 'new' &&
          p.userId === 'user-a' &&
          p.eventId === 'ev1' &&
          Object.keys(p).sort().join() === 'at,contactId,eventId,form,userId,v' &&
          !text.includes('Person 2') &&
          !text.includes('@example.com') &&
          !text.includes('021 555') &&
          plain.win.assigned.join() === '/plan/ev1/setup?at=people' &&
          parsed(host)?.form === 'host' &&
          host.win.assigned.join() === '/plan/ev1/setup?at=people' &&
          parsed(edit)?.form === 'edit:hh7' &&
          edit.win.assigned.join() === '/plan/ev1/setup?at=people&edit=hh7' &&
          storedList(plain.local).length === 3 &&
          winR.assigned.join() === '/plan/ev1/setup?at=people',
        got: {
          notes: plain.notes.length,
          assigned: [plain.win.assigned, host.win.assigned, edit.win.assigned, winR.assigned],
        },
      };
    }
  );
  const sleep0 = () => new Promise((r) => setTimeout(r, 0));
  const hhApi = (id: string, members: Array<[string, string, string?]>) => ({
    id,
    members: members.map(([role, name, email]) => ({
      id: `pe-${name}`,
      householdRole: role,
      person: { name, email: email ?? null },
    })),
  });
  const answerWith = (status: number | 'throws', body: unknown = { households: [] }) => {
    nextAnswer = { status, body };
  };
  const PLACED_KEY = 'gather:contact-placed:v1:user-a:ev1';
  const seedPeople = (local: MemStore, people: any[], placed: any[] = []) => {
    local.m.set(LIST_KEY('user-a'), JSON.stringify({ v: 1, userId: 'user-a', contacts: people }));
    if (placed.length)
      local.m.set(
        PLACED_KEY,
        JSON.stringify({ v: 1, userId: 'user-a', eventId: 'ev1', placements: placed })
      );
  };
  const BOOK3 = [
    { id: 'p1', name: 'Mere Tane', email: 'mere@example.com', phone: '+64215550147' },
    { id: 'p2', name: 'Kiri Kid', phone: '+64215550150' },
    { id: 'p3', name: 'Hone Rata' },
    { id: 'p4', name: 'Pip Kid', email: 'pip@example.com' },
    { id: 'p5', name: 'Zed Free', email: 'zed@example.com' },
  ];
  const HH = [
    hhApi('hh1', [
      ['PRIMARY_CONTACT', 'Kate Smith', 'kate@example.com'],
      ['PARTNER', 'Mere Tane'],
      ['CHILD', 'Kiri Kid'],
      ['CHILD', 'Pip Kid'],
      ['GUEST', 'Hone Rata'],
    ]),
  ];
  const PL = [
    { contactId: 'p1', householdId: 'hh1', name: 'Mere Tane', role: 'adult' },
    { contactId: 'p2', householdId: 'hh1', name: 'Kiri Kid', role: 'kid', outcome: 'plain' },
    { contactId: 'p3', householdId: 'hh1', name: 'Hone Rata', role: 'adult' },
    { contactId: 'p4', householdId: 'hh1', name: 'Pip Kid', role: 'kid', outcome: 'message' },
  ];
  const badgeOf = (r: El | undefined) => flat(textOf(byAttr(r, 'data-contact-badge')));
  const opened = async (local: MemStore, search = '?event=ev1') => {
    const i = screen('user-a', { local, search });
    await i.actAsync(async () => {});
    return i;
  };
  await lcheck(
    'L.25',
    "from an event the page makes ONE request, a plain GET of that event's households; with no event, a bad one, or nobody signed in it makes none",
    async () => {
      answerWith(200, { households: HH });
      const asked = async (search: string, viewer: string | null = 'user-a') => {
        requests.length = 0;
        const local = new MemStore();
        seedPeople(local, BOOK3);
        const i = screen(viewer, { local, search });
        await i.actAsync(async () => {});
        return requests.map((r) => [r.url, r.init === undefined]);
      };
      const a = await asked('?event=ev1');
      const b = await asked('');
      const c = await asked('?event=../x');
      const d = await asked('?event=ev1', null);
      requests.length = 0;
      return {
        ok:
          JSON.stringify(a) === JSON.stringify([['/api/events/ev1/households', true]]) &&
          b.length === 0 &&
          c.length === 0 &&
          d.length === 0,
        got: { a, b, c, d },
      };
    }
  );
  await lcheck(
    'L.26',
    'from an event, once the households are known: each person says where they are (W40; a kid also says whether Gather can message them, W40 suffixes) or that they are not placed (W39)',
    async () => {
      const w = WW();
      const F = WD();
      answerWith(200, { households: HH });
      const local = new MemStore();
      seedPeople(local, BOOK3, PL);
      const i = await opened(local);
      const got = BOOK3.map((p) => badgeOf(rowOf(i, p.name)));
      const want = [
        F.placedWords('Kate Smith', ''),
        F.placedWords('Kate Smith', 'plain'),
        F.placedWords('Kate Smith', 'none'),
        F.placedWords('Kate Smith', 'message'),
        w.NOT_PLACED,
      ];
      return {
        ok:
          JSON.stringify(got) === JSON.stringify(want) &&
          got[0] === "In Kate Smith's household." &&
          got[1] === "In Kate Smith's household. Not messaged." &&
          got[2] === "In Kate Smith's household. No number or email yet." &&
          got[3] === "In Kate Smith's household. Gather can message them." &&
          got[4] === "Not in a household yet, so Gather won't message them.",
        got,
      };
    }
  );
  await lcheck(
    'L.27',
    'the "Add to this household" button is for people not placed; if the households cannot be read there are no badges, quietly, and the button is on everyone',
    async () => {
      answerWith(200, { households: HH });
      const a = new MemStore();
      seedPeople(a, BOOK3, PL);
      const ia = await opened(a);
      const placedNoButton = ['Mere Tane', 'Kiri Kid', 'Hone Rata', 'Pip Kid'].every(
        (n) => !addButton(rowOf(ia, n))
      );
      const freeHasButton = !!addButton(rowOf(ia, 'Zed Free'));
      const fails = async (status: number | 'throws') => {
        answerWith(status);
        const l = new MemStore();
        seedPeople(l, BOOK3, PL);
        const i = await opened(l);
        return rows(i).every((r) => !byAttr(r, 'data-contact-badge') && !!addButton(r));
      };
      const f500 = await fails(500);
      const fThrow = await fails('throws');
      return {
        ok: placedNoButton && freeHasButton && f500 && fThrow,
        got: { placedNoButton, freeHasButton, f500, fThrow },
      };
    }
  );
  await lcheck(
    'L.28',
    'NOT MATCHED BY EMAIL OR NAME: a household member with the same name and email as a contact does not place that contact; only a record made at the save does; a placement that no longer holds is ignored',
    async () => {
      const w = WW();
      answerWith(200, {
        households: [
          hhApi('hh1', [
            ['PRIMARY_CONTACT', 'Kate Smith'],
            ['GUEST', 'Zed Free', 'zed@example.com'],
            ['GUEST', 'Hone Renamed'],
          ]),
        ],
      });
      const local = new MemStore();
      // p5 (Zed Free) has a twin typed by hand in the household; p3 was placed but the member was renamed
      seedPeople(local, BOOK3, [
        { contactId: 'p3', householdId: 'hh1', name: 'Hone Rata', role: 'adult' },
        { contactId: 'p1', householdId: 'hh-gone', name: 'Mere Tane', role: 'adult' },
      ]);
      const i = await opened(local);
      const zed = badgeOf(rowOf(i, 'Zed Free'));
      const hone = badgeOf(rowOf(i, 'Hone Rata'));
      const mere = badgeOf(rowOf(i, 'Mere Tane'));
      return {
        ok:
          zed === w.NOT_PLACED &&
          hone === w.NOT_PLACED &&
          mere === w.NOT_PLACED &&
          !!addButton(rowOf(i, 'Zed Free')),
        got: [zed, hone, mere],
      };
    }
  );
  await checkAsync(
    'L.21',
    'break proofs (on in-memory copies of the screen, the loading area and the row): each fault turns exactly the checks named red and leaves the others green',
    async () => {
      const S = SCREEN;
      const LB = LOAD_BOX;
      const CR = ROW;
      // [what is wrong, the file, the text it replaces (exactly once), the replacement, checks that go red]
      const faults: Array<[string, string, string, string, string[]]> = [
        [
          'the picker is drawn everywhere',
          S,
          'if (mounted) setCanPick(pickerAvailable(window));',
          'if (mounted) setCanPick(true);',
          ['L.1', 'L.18'],
        ],
        [
          'the picker button stays on while a pick is open',
          LB,
          'disabled={p.disabled || p.picking}',
          'disabled={p.disabled}',
          ['L.19'],
        ],
        ['a second tap makes a second call', S, 'if (pickingRef.current) return;', '', ['L.19']],
        [
          'the file chooser is not reset',
          S,
          "e.target.value = ''; // so the same file can be chosen again",
          '',
          ['L.7'],
        ],
        [
          'a file is read before it is checked',
          S,
          "if ('refusal' in routed) {",
          'if (false as boolean) {',
          ['L.8'],
        ],
        [
          'Skip it does nothing',
          S,
          'onSkip: () => save(skipIt(c)),',
          'onSkip: () => save(c),',
          ['L.11'],
        ],
        [
          'every row shows the ways forward',
          CR,
          'const flagged = (c.problems?.length ?? 0) > 0;',
          'const flagged = true;',
          ['L.10', 'L.11', 'L.12', 'L.13'],
        ],
        [
          'a fix that did not save is not told',
          S,
          "const failed = done.status !== 'ok';",
          'const failed = false;',
          ['L.14'],
        ],
        [
          'Done closes the panel without saving',
          S,
          'if (next && save(next)) setPanel(null);',
          'setPanel(null);',
          ['L.12', 'L.13'],
        ],
        [
          'a full browser says nothing',
          S,
          'setSummary([W.FULL]); // W17: nothing was added',
          'setSummary([]);',
          ['L.15', 'L.20'],
        ],
        [
          'a failed pick says nothing',
          S,
          "else if (end.kind === 'failed') setSummary([W.PICKER_FAILED]); // W24; a cancel says nothing",
          '',
          ['L.20'],
        ],
        [
          'a cancelled pick says the failed sentence',
          S,
          "else if (end.kind === 'failed') setSummary([W.PICKER_FAILED]); // W24; a cancel says nothing",
          'else setSummary([W.PICKER_FAILED]);',
          ['L.20'],
        ],
        [
          'the paste box is not emptied after a load',
          S,
          "if (finish(read) && read.people.length > 0) setPasteText('');",
          'finish(read);',
          ['L.3'],
        ],
        [
          'a browser that will not save still lets her load',
          S,
          'disabled: refused,',
          'disabled: false,',
          ['L.2', 'L.15', 'L.20'],
        ],
        [
          'a placed person keeps the Add button',
          S,
          'onAdd: back && !placed ? () => addToHousehold(c) : undefined,',
          'onAdd: back ? () => addToHousehold(c) : undefined,',
          ['L.27'],
        ],
        [
          'badges are drawn before the households are known',
          S,
          'badge: live ? badgeFor(c, placed) : undefined,',
          'badge: badgeFor(c, placed),',
          ['L.27'],
        ],
        [
          'a person is placed because a household has someone of that name',
          S,
          'const placed = live?.get(c.id);',
          "const placed = live?.get(c.id) ?? (lite?.find((h) => h.memberNames.includes(c.name)) ? { placement: { role: 'adult' }, household: lite.find((h) => h.memberNames.includes(c.name)) } : undefined);",
          ['L.28'],
        ],
        [
          'the page asks for the households with no event in the address',
          S,
          'if (!mounted || !viewerId || !address.eventId) return;',
          'if (!mounted || !viewerId) return;',
          ['L.25'],
        ],
        [
          'the hand-off button is drawn without an event',
          S,
          'onAdd: back && !placed ? () => addToHousehold(c) : undefined,',
          'onAdd: () => addToHousehold(c),',
          ['L.10', 'L.23', 'L.27'],
        ],
        [
          'the hand-off goes back to the wrong place',
          S,
          'window.location.assign(back);',
          "window.location.assign('/plan');",
          ['L.24'],
        ],
        ['W43 is left out of the loading area', LB, '{W.FILE_ODD_LETTERS}', '', ['L.22']],
      ];
      const wrong: string[] = [];
      for (const [what, rel, from, to, red] of faults) {
        const src = read(rel);
        if (src.split(from).length !== 2) {
          wrong.push(`${what}: its anchor is not in ${rel} exactly once`);
          continue;
        }
        const bad = await withSourceAsync(
          rel,
          src.replace(from, () => to),
          async () => {
            const out: string[] = [];
            for (const id of Object.keys(lRuns)) {
              let v: string;
              try {
                v = (await lRuns[id]()).ok ? 'green' : 'red';
              } catch {
                v = 'red'; // a check that crashes is a red check
              }
              const want = red.includes(id) ? 'red' : 'green';
              if (v !== want) out.push(`${id} was ${v}, wanted ${want}`);
            }
            return out;
          }
        );
        wrong.push(...bad.map((b) => `${what}: ${b}`));
      }
      return { ok: wrong.length === 0, got: wrong.slice(0, 8) };
    }
  );

  // ══ F — THE NEW FILES ═══════════════════════════════════════════════════════
  section('F — the new files: no request, no raw markup, no regular expression, no draft module');
  check(
    'F.1',
    'the page, the screen and the lib files exist and hold none of the things the plan forbids',
    () => {
      const bad: string[] = [];
      for (const rel of NEW_FILES) {
        const raw = read(rel);
        if (!raw) {
          bad.push(`${rel}: not there yet`);
          continue;
        }
        const code = stripComments(raw);
        // The screen may make the one allowed GET of the households (checked by F.5); no other file may fetch.
        const scan = rel === SCREEN ? code.replace(/\bfetch\(/, '') : code;
        if (FORBIDDEN_CODE.test(scan)) bad.push(`${rel}: forbidden code`);
        if (raw.includes('households/form-draft')) bad.push(`${rel}: names the draft module`);
        if (raw.includes('@/lib/contact/contact-fix')) bad.push(`${rel}: names contact-fix`);
      }
      return { ok: bad.length === 0, got: bad };
    }
  );
  check(
    'F.4',
    'the forbidden-code scan can go red: it sees each thing it bans in a written sample, and stays quiet on a clean one',
    () => {
      const banned = [
        '<div dangerouslySetInnerHTML={{ __html: x }} />',
        'el.innerHTML = typed;',
        'eval(typed)',
        'const re = new RegExp(typed);',
        'await fetch(url)',
        'new XMLHttpRequest()',
        'navigator.sendBeacon(url)',
        'console.log(list)',
      ];
      const clean = 'const re = /abc/; const name = list.find((c) => c.id === id);';
      return {
        ok: banned.every((b) => FORBIDDEN_CODE.test(b)) && !FORBIDDEN_CODE.test(clean),
        got: banned.filter((b) => !FORBIDDEN_CODE.test(b)),
      };
    }
  );
  check('F.2', 'the store and the lib files draw nothing and import no React', () => {
    const bad = NEW_FILES.filter((f) => f.startsWith('src/lib/')).filter((f) =>
      /from 'react'|from "react"/.test(read(f))
    );
    return { ok: bad.length === 0 && read('src/lib/contacts/store.ts').length > 0, got: bad };
  });
  check(
    'F.3',
    "through all of the above the page made no request but plain GETs of an event's households",
    () => ({
      ok: requests.every(
        (r) =>
          /^\/api\/events\/[A-Za-z0-9_-]{1,64}\/households$/.test(r.url) && r.init === undefined
      ),
      got: requests
        .filter(
          (r) =>
            !/^\/api\/events\/[A-Za-z0-9_-]{1,64}\/households$/.test(r.url) || r.init !== undefined
        )
        .slice(0, 3),
    })
  );
  check(
    'F.5',
    "the screen makes exactly one request in its code: a plain GET (no method, no body, no options) of the event's households, and no other word of a write",
    () => {
      const code = stripComments(read(SCREEN));
      const calls = code.match(/\bfetch\(/g) ?? [];
      const at = code.indexOf('fetch(');
      const call = at < 0 ? '' : code.slice(at, code.indexOf(')', at) + 1);
      return {
        ok:
          calls.length === 1 &&
          /^fetch\(`\/api\/events\/\$\{[A-Za-z.]+\}\/households`\)$/.test(call) &&
          !/\b(POST|PUT|PATCH|DELETE|method|body|headers)\b/.test(code),
        got: { calls: calls.length, call },
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
