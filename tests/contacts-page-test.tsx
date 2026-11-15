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
const NEW_FILES = [
  PAGE,
  SCREEN,
  'src/lib/contacts/store.ts',
  'src/lib/contacts/words.ts',
  'src/lib/contacts/address.ts',
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

// ── Nothing may reach the network ────────────────────────────────────────────
let fetchCalls = 0;
globalThis.fetch = (async () => {
  fetchCalls++;
  throw new Error('the contacts page must not call fetch');
}) as typeof fetch;

// ── Browser storage, in memory, that can be told to fail ─────────────────────
class MemStore {
  m = new Map<string, string>();
  calls = 0;
  failRead = false;
  failWrite = false;
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
    if (this.failWrite) throw new Error('blocked');
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
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
  location: { search: string };
  listeners: Record<string, Array<(e: any) => void>>;
  confirmCalls: number;
  addEventListener(t: string, f: (e: any) => void): void;
  removeEventListener(t: string, f: (e: any) => void): void;
  confirm(): boolean;
}
function makeWindow(over: { search?: string; local?: MemStore; session?: MemStore } = {}): Win {
  const w: Win = {
    localStorage: over.local ?? new MemStore(),
    sessionStorage: over.session ?? new MemStore(),
    location: { search: over.search ?? '' },
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
const LIVE = new Set([SCREEN, PAGE, FORM]);
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
  (globalThis as any).window = w;
  try {
    return fn();
  } finally {
    delete (globalThis as any).window;
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
const screen = (viewerId: string | null, o: { local?: MemStore; search?: string } = {}) =>
  mount(SCREEN, SCREEN_PROPS, {
    viewerId,
    win: makeWindow({ local: o.local, search: o.search }),
  });
const countOf = (i: Inst) => textOf(byAttr(i.tree(), 'data-contacts-count'));
const clearButton = (i: Inst) => buttonText(i.tree(), 'Clear all contacts');
const rows = (i: Inst) => all(i.tree(), (e) => 'data-contact-id' in e.props);
const confirmBlock = (i: Inst) => byAttr(i.tree(), 'data-contacts-confirm');

function main() {
  // The request spy sees a call, so "the page made no request" (F.3, at the end) is not green for nothing.
  void globalThis.fetch('spy').catch(() => {});
  check('F.0', 'the request spy sees a call (so F.3 means something)', () => {
    const seen = fetchCalls === 1;
    fetchCalls = 0;
    return { ok: seen, got: seen };
  });

  // ══ W — THE WORDS ARE THE RULED WORDS ═══════════════════════════════════════
  section('W — the words are the ruled W-lines (A5, W10 to W15, W16, W18, W20, W31, W41)');
  check('W.1', 'the ticket section with the ruled W-lines was found', () => ({
    ok: wordsSection.length > 2000,
    got: wordsSection.length,
  }));
  check(
    'W.2',
    'words.ts says A5, W10 to W16, W18, W20 and W31 exactly as the ticket rules them',
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
  check('P.1', 'the page is a client page that draws the screen and nothing else', () => {
    const src = read(PAGE);
    const page = loadLive(PAGE).default;
    const tree = page({});
    const screenFn = loadLive(SCREEN).default;
    return {
      ok: /^\s*'use client';/.test(src) && isEl(tree) && tree.type === screenFn,
      got: String(tree?.type?.name),
    };
  });
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
        if (FORBIDDEN_CODE.test(code)) bad.push(`${rel}: forbidden code`);
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
  check('F.3', 'through all of the above the page made no request', () => ({
    ok: fetchCalls === 0,
    got: fetchCalls,
  }));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
