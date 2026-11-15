/**
 * [[GTC-460]] Stage 3, step 3c — PICKING ON THE HOUSEHOLD FORM, through the form's own live source.
 *
 * WHAT 3c ADDS, IN PLAIN WORDS. A host who has loaded contacts types a name into a box on the household
 * form and a short list drops under the box. One tap fills the row with that person. This file drives
 * the real form (compiled with esbuild, a small stand-in for React's hooks, the real controls found by
 * their hint text and their handlers called, as `decide-later-form-test.ts` does) and pins:
 *   R  which rows take a pick and which do not (rulings 39 and 51); what a pick puts in a row
 *   D  the dropdown: up to six lines, in the page flow, never a floating layer, one tap; names first;
 *      a contact already in another row is greyed (W33); the keyboard; a tap away closes it
 *   H  the hand-off from the contacts page: after the saved draft is checked, once, into an empty
 *      main contact or else a new guest row, never a kid's row; ignored quietly in every other case
 *   P  what the form SENDS is unchanged and holds no contact id; the draft keeps the mark; an older
 *      draft reads as not picked
 *   B  break proofs: the same checks on in-memory copies of the form with one rule broken
 * With no list loaded, or no storage, nothing is drawn and no sentence is added.
 *
 * No browser, no database, no network. Every store is an in-memory stand-in. Words come from the code
 * (their wording is pinned against the ticket in `contacts-match-test.ts`).
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-form-test.tsx  (npm run test:contacts-form)
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
const PICKS = 'src/components/contacts/ContactPicks.tsx';
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
  document: {
    listeners: Record<string, Array<(e: any) => void>>;
    addEventListener(t: string, f: (e: any) => void): void;
    removeEventListener(t: string, f: (e: any) => void): void;
  };
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
    document: {
      listeners: {},
      addEventListener(t, f) {
        (w.document.listeners[t] ??= []).push(f);
      },
      removeEventListener(t, f) {
        w.document.listeners[t] = (w.document.listeners[t] ?? []).filter((x) => x !== f);
      },
    },
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
const LIVE = new Set([SCREEN, PAGE, FORM, LOAD_BOX, ROW, PICKS]);
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
/** The dropdown and a row's frame are plain functions with no hooks of their own: draw them where they stand. */
const PLAIN = new Set(['ContactPicks', 'SubForm']);
const drawn = (n: El): any =>
  typeof n.type === 'function' && PLAIN.has(n.type.name) ? n.type(n.props) : null;
function* walk(n: any): Generator<El> {
  if (n == null || typeof n === 'boolean') return;
  if (Array.isArray(n)) {
    for (const c of n) yield* walk(c);
    return;
  }
  if (isEl(n)) {
    yield n;
    const d = drawn(n);
    yield* walk(d ?? n.props.children);
  }
}
function textOf(n: any): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (!isEl(n)) return '';
  const d = drawn(n);
  return textOf(d ?? n.props.children);
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
  const W = () => require('../src/lib/contacts/words').CONTACTS_WORDS;
  const MAIN = 'e.g. Sarah Mitchell';
  const PARTNER = "Partner's name";
  const KID = "Kid's name";
  const GUEST = "Guest's name";
  const BOOK = [
    { id: 'zc1', name: 'Mere Tane', email: 'mere@example.com', phone: '+64215550147' },
    { id: 'zc2', name: 'Mārama Smith', phone: '+64215550148' },
    { id: 'zc3', name: 'Hōne Rata' },
    { id: 'zc4', name: 'Aroha Tane-Brown', email: 'aroha@example.com' },
    { id: 'zc5', name: 'Sam Overseas', phone: '+44 20 7946 0958' },
    { id: 'zc6', name: 'Kiri Kid', email: 'kiri@example.com', phone: '+64215550150' },
  ];
  const MANY = Array.from({ length: 9 }, (_, n) => ({ id: `zm${n}`, name: `Person ${n}` }));
  const saved = (over: Record<string, unknown> = {}) => ({
    id: 'hh1',
    primaryContact: { name: 'Kate Smith', email: 'kate@example.com' },
    partner: { personEventId: 'pe-p', name: 'Pat Smith' },
    helpers: [{ personEventId: 'pe-h', name: 'Jo Smith' }],
    littleCount: 0,
    guests: [{ personEventId: 'pe-g', name: 'Gus Guest' }],
    ...over,
  });
  const listJson = (contacts: unknown[]) => JSON.stringify({ v: 1, userId: 'user-a', contacts });
  /** The real form, with her contacts in this browser's storage and a pretend tab. */
  const form = (
    over: Record<string, unknown> = {},
    o: {
      contacts?: unknown[] | null;
      viewerId?: string | null;
      drafts?: MemStore;
      session?: MemStore;
      local?: MemStore;
    } = {}
  ) => {
    const local = o.local ?? new MemStore();
    if (o.contacts !== null) local.m.set(LIST_KEY('user-a'), listJson(o.contacts ?? BOOK));
    const session = o.session ?? new MemStore();
    const drafts = o.drafts ?? new MemStore();
    const win = makeWindow({ local, session });
    const sent: any[] = [];
    const edits: any[] = [];
    const i = mount(
      FORM,
      {
        eventId: 'ev1',
        eventName: 'Boxing Day',
        onComplete() {},
        onAddPerson: async (p: unknown) => void sent.push(p),
        onEditSave: async (id: string, p: unknown) => void edits.push([id, p]),
        onSaveHostHousehold: async () => {},
        channelCandidates: [],
        ...over,
      },
      { viewerId: o.viewerId === undefined ? 'user-a' : o.viewerId, draftStore: drafts, win }
    );
    return { i, local, session, drafts, win, sent, edits };
  };
  const boxes = (i: Inst, ph: string) =>
    all(i.tree(), (e) => e.type === 'input' && e.props.placeholder === ph);
  const typeIn = (i: Inst, ph: string, v: string, at = 0) =>
    i.act(() => boxes(i, ph)[at].props.onChange({ target: { value: v } }));
  const picks = (i: Inst) => byAttr(i.tree(), 'data-contacts-picks');
  const lines = (i: Inst) => all(picks(i), (e) => 'data-pick-id' in e.props);
  const line = (i: Inst, name: string) => lines(i).find((l) => textOf(l).includes(name));
  const why = (i: Inst) => byAttr(i.tree(), 'data-contacts-why');
  const pickLine = (i: Inst, name: string) => press(i, buttons(line(i, name))[0]);
  const addPartner = (i: Inst) => press(i, buttonText(i.tree(), '👫 Add Partner'));
  const addKid = (i: Inst) => press(i, buttonText(i.tree(), '👦 Kid with a job'));
  const addGuest = (i: Inst) => press(i, buttonText(i.tree(), '👤 Add Guest'));
  const saveNew = async (i: Inst) =>
    i.actAsync(() =>
      buttonText(i.tree(), 'Save & add another household')!.props.onClick({ preventDefault() {} })
    );
  const key = (i: Inst, ph: string, k: string, at = 0) => {
    let prevented = false;
    i.act(() =>
      boxes(i, ph)[at].props.onKeyDown?.({ key: k, preventDefault: () => (prevented = true) })
    );
    return prevented;
  };
  const docEvent = (i: Inst, type: string, target: unknown) =>
    i.act(() => (i.win.document.listeners[type] ?? []).forEach((f) => f({ target })));
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
  const draftOf = (drafts: MemStore) => {
    const k = [...drafts.m.keys()].find((x) => x.startsWith(FormDraft.DRAFT_PREFIX));
    return k ? JSON.parse(drafts.m.get(k)!) : null;
  };
  /** Pressing the contacts link flushes the draft (the form's own way of keeping it). */
  const flushDraft = (i: Inst) => {
    const a = all(
      i.tree(),
      (e) => e.type === 'a' && String(e.props.href).startsWith('/plan/contacts')
    )[0];
    const real = globalThis.setTimeout;
    (globalThis as any).setTimeout = () => 0;
    try {
      press(i, a, { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false });
    } finally {
      globalThis.setTimeout = real;
    }
  };
  const note = (over: Record<string, unknown> = {}) => ({
    v: 1,
    userId: 'user-a',
    eventId: 'ev1',
    form: 'new',
    contactId: 'zc1',
    at: Date.now(),
    ...over,
  });
  const leaveNote = (session: MemStore, over: Record<string, unknown> = {}) =>
    session.m.set('gather:contact-handoff:v1:user-a:ev1', JSON.stringify(note(over)));

  const fRuns: Record<string, () => Promise<{ ok: boolean; got?: unknown }>> = {};
  const fcheck = async (
    id: string,
    label: string,
    fn: () =>
      | boolean
      | { ok: boolean; got?: unknown }
      | Promise<boolean | { ok: boolean; got?: unknown }>
  ) => {
    fRuns[id] = async () => {
      const r = await fn();
      return typeof r === 'boolean' ? { ok: r } : r;
    };
    await checkAsync(id, label, () => fRuns[id]());
  };

  section('R — which rows take a pick, and what a pick puts in a row');
  await fcheck(
    'R.1',
    'a new household: typing the start of a loaded name drops the list under the main contact box; one tap fills the name, email and phone exactly; the tick is untouched',
    async () => {
      const { i, sent } = form();
      typeIn(i, MAIN, 'mer');
      const shown = lines(i).map((l) => textOf(l));
      const before = shown.length > 0 && shown[0].includes('Mere Tane');
      pickLine(i, 'Mere Tane');
      const closed = !picks(i);
      const boxValue = boxes(i, MAIN)[0].props.value;
      await saveNew(i);
      const p = sent[0]?.primaryContact;
      return {
        ok:
          before &&
          closed &&
          boxValue === 'Mere Tane' &&
          p?.name === 'Mere Tane' &&
          p?.email === 'mere@example.com' &&
          p?.phone === '+64215550147',
        got: { shown, p },
      };
    }
  );
  await fcheck(
    'R.2',
    'a partner and a guest take a pick the same way; a kid with a job gets the name only; Old enough to message directly stays off and Decide later stays as it was',
    async () => {
      const { i, sent } = form();
      typeIn(i, MAIN, 'Host Person');
      addPartner(i);
      typeIn(i, PARTNER, 'aro');
      pickLine(i, 'Aroha Tane-Brown');
      addKid(i);
      typeIn(i, KID, 'kir');
      pickLine(i, 'Kiri Kid');
      addGuest(i);
      typeIn(i, GUEST, 'mar');
      pickLine(i, 'Mārama Smith');
      await saveNew(i);
      const p = sent[0];
      const h = p?.helpers?.[0];
      return {
        ok:
          p?.partner?.name === 'Aroha Tane-Brown' &&
          p?.partner?.email === 'aroha@example.com' &&
          !p?.partner?.phone &&
          h?.name === 'Kiri Kid' &&
          !h?.email &&
          !h?.phone &&
          h?.adultRoled === false &&
          h?.decideLater === false &&
          p?.guests?.[0]?.name === 'Mārama Smith' &&
          p?.guests?.[0]?.phone === '+64215550148' &&
          !p?.guests?.[0]?.email,
        got: p,
      };
    }
  );
  await fcheck(
    'R.3',
    "a pick replaces the row exactly: a typed email does not stay beside another person's number",
    async () => {
      const { i, sent } = form();
      addGuest(i);
      typeIn(i, GUEST, 'typed person');
      i.act(() => boxes(i, 'Email')[0].props.onChange({ target: { value: 'old@typed.co' } }));
      typeIn(i, GUEST, 'mar');
      pickLine(i, 'Mārama Smith');
      typeIn(i, MAIN, 'Host Person');
      await saveNew(i);
      const g = sent[0]?.guests?.[0];
      return { ok: g?.name === 'Mārama Smith' && g?.phone === '+64215550148' && !g?.email, got: g };
    }
  );
  await fcheck(
    'R.4',
    'a saved row takes none and says why (W34): a saved partner, kid or guest also hears how to use a contact instead; the saved main contact does not',
    () => {
      const { i } = form({ editingHousehold: saved() });
      const w = W();
      const out: Record<string, unknown> = {};
      for (const [k, ph] of [
        ['main', MAIN],
        ['partner', PARTNER],
        ['kid', KID],
        ['guest', GUEST],
      ] as const) {
        typeIn(i, ph, k === 'main' ? 'Kate Smith' : 'mer');
        if (k === 'main') typeIn(i, MAIN, 'mer');
        out[k] = [!!picks(i), flat(textOf(why(i)))];
      }
      const both = `${w.SAVED_ROW} ${w.SAVED_ROW_REMOVE}`;
      const ok =
        (out.main as any)[0] === false &&
        (out.main as any)[1] === w.SAVED_ROW &&
        ['partner', 'kid', 'guest'].every(
          (k) => (out[k] as any)[0] === false && (out[k] as any)[1] === both
        );
      return { ok, got: out };
    }
  );
  await fcheck(
    'R.5',
    'her own row takes none and says why (W35): on her own step, and the main contact when she changes her own household',
    () => {
      const w = W();
      const a = form({ hostMode: { name: '', email: 'me@example.com', phone: null } });
      typeIn(a.i, MAIN, 'mer');
      const b = form({ editingHousehold: saved({ isHostHousehold: true }) });
      typeIn(b.i, MAIN, 'mer');
      return {
        ok:
          !picks(a.i) &&
          flat(textOf(why(a.i))) === w.OWN_ROW &&
          !picks(b.i) &&
          flat(textOf(why(b.i))) === w.OWN_ROW,
        got: [flat(textOf(why(a.i))), flat(textOf(why(b.i)))],
      };
    }
  );
  await fcheck(
    'R.6',
    "remove and add: a removed saved guest's row is gone and a new guest row takes a pick, while the saved main contact still does not",
    () => {
      const only = saved({
        partner: undefined,
        helpers: [],
        guests: [{ personEventId: 'pe-g', name: 'Gus Guest' }],
      });
      const { i } = form({ editingHousehold: only });
      const removers = buttons(i.tree()).filter((b) => textOf(b).includes('remove'));
      press(i, removers[0]);
      const savedGuestGone = boxes(i, GUEST).length === 0 && removers.length === 1;
      addGuest(i);
      typeIn(i, GUEST, 'mer');
      const newRowPicks = !!picks(i) && !why(i);
      typeIn(i, MAIN, 'mer');
      return {
        ok: savedGuestGone && newRowPicks && !picks(i) && !!why(i),
        got: [savedGuestGone, newRowPicks],
      };
    }
  );
  await fcheck(
    'R.7',
    'with no list loaded (none stored, signed out, or storage refusing) nothing is drawn and no sentence is added; with a list and nothing typed the form is drawn the same',
    () => {
      const none = form({}, { contacts: null });
      typeIn(none.i, MAIN, 'mer');
      const signedOut = form({}, { viewerId: null });
      typeIn(signedOut.i, MAIN, 'mer');
      const refusing = new MemStore();
      refusing.failRead = true;
      const refused = form({}, { contacts: null, local: refusing });
      typeIn(refused.i, MAIN, 'mer');
      const savedRow = form({ editingHousehold: saved() }, { contacts: null });
      typeIn(savedRow.i, PARTNER, 'mer');
      const withList = form();
      const bare = form({}, { contacts: null });
      return {
        ok:
          [none, signedOut, refused, savedRow].every((x) => !picks(x.i) && !why(x.i)) &&
          markup(withList.i.tree()) === markup(bare.i.tree()),
        got: [none, signedOut, refused, savedRow].map((x) => [!!picks(x.i), !!why(x.i)]),
      };
    }
  );

  section('D — the dropdown');
  await fcheck(
    'D.1',
    'up to six lines, in the page flow right under the box (never a floating layer), each at least 44 pixels tall',
    () => {
      const { i } = form({}, { contacts: MANY });
      typeIn(i, MAIN, 'per');
      const ul = picks(i);
      const cls = String(ul?.props.className ?? '');
      const order = all(
        i.tree(),
        (e) =>
          (e.type === 'input' && e.props.placeholder === MAIN) || 'data-contacts-picks' in e.props
      );
      return {
        ok:
          lines(i).length === 6 &&
          !/\b(absolute|fixed|sticky)\b|z-\d/.test(cls) &&
          lines(i).every(
            (l) =>
              /min-h-\[44px\]/.test(String(l.props.className)) ||
              buttons(l).every((b) => /min-h-\[44px\]/.test(String(b.props.className)))
          ) &&
          order[0]?.type === 'input' &&
          order[1]?.props['data-contacts-picks'] === true,
        got: { lines: lines(i).length, cls },
      };
    }
  );
  await fcheck(
    'D.2',
    'a pick is one tap and the field keeps its place: the line reacts on press (the press is not allowed to take the cursor away); a tap on a greyed line does nothing',
    () => {
      const { i } = form();
      typeIn(i, MAIN, 'mer');
      const b = buttons(line(i, 'Mere Tane'))[0];
      let prevented = false;
      b.props.onMouseDown?.({ preventDefault: () => (prevented = true) });
      pickLine(i, 'Mere Tane');
      const closed = !picks(i);
      addGuest(i);
      typeIn(i, GUEST, 'mer');
      const greyed = line(i, 'Mere Tane');
      const gb = buttons(greyed)[0];
      const before = boxes(i, GUEST)[0].props.value;
      gb?.props.onClick?.({ preventDefault() {} });
      return {
        ok:
          prevented &&
          closed &&
          !!greyed &&
          (gb?.props.disabled === true || !gb) &&
          boxes(i, GUEST)[0].props.value === before &&
          !!picks(i),
        got: { prevented, closed },
      };
    }
  );
  await fcheck(
    'D.3',
    'it fills only on an explicit pick: typing, and moving along the list, change nothing in the boxes',
    async () => {
      const { i, sent } = form();
      typeIn(i, MAIN, 'mere');
      key(i, MAIN, 'ArrowDown');
      key(i, MAIN, 'ArrowUp');
      await saveNew(i);
      const p = sent[0]?.primaryContact;
      return { ok: p?.name === 'mere' && !p?.email && !p?.phone, got: p };
    }
  );
  await fcheck(
    'D.4',
    'a contact already in another row of this form is greyed with W33 and cannot be picked; its own row is not blocked; picking someone else in frees it',
    () => {
      const w = W();
      const { i } = form();
      typeIn(i, MAIN, 'mer');
      pickLine(i, 'Mere Tane');
      addGuest(i);
      typeIn(i, GUEST, 'mer');
      const l = line(i, 'Mere Tane');
      const greyed = flat(textOf(l)).includes(w.ALREADY_IN_FORM);
      typeIn(i, MAIN, 'mer');
      const own = line(i, 'Mere Tane');
      const ownFree = !flat(textOf(own)).includes(w.ALREADY_IN_FORM);
      typeIn(i, MAIN, 'aro');
      pickLine(i, 'Aroha Tane-Brown');
      typeIn(i, GUEST, 'mer');
      const freed = !flat(textOf(line(i, 'Mere Tane'))).includes(w.ALREADY_IN_FORM);
      return { ok: greyed && ownFree && freed, got: { greyed, ownFree, freed } };
    }
  );
  await fcheck(
    'D.5',
    'the keyboard: Down and Up move along the list, Enter picks the highlighted line, Escape closes; Enter on a greyed line picks nothing',
    () => {
      const { i } = form();
      typeIn(i, MAIN, 'tane');
      const sel = () =>
        lines(i).findIndex(
          (l) => l.props['aria-selected'] === true || l.props['aria-selected'] === 'true'
        );
      const first = sel();
      key(i, MAIN, 'ArrowDown');
      const second = sel();
      key(i, MAIN, 'ArrowUp');
      const back = sel();
      key(i, MAIN, 'ArrowDown');
      const enter = key(i, MAIN, 'Enter');
      const filled = boxes(i, MAIN)[0].props.value === 'Aroha Tane-Brown' && !picks(i);
      typeIn(i, MAIN, 'tane');
      key(i, MAIN, 'Escape');
      const escaped = !picks(i);
      addGuest(i);
      typeIn(i, GUEST, 'aro');
      key(i, GUEST, 'Enter');
      const greyedKept = boxes(i, GUEST)[0].props.value === 'aro';
      return {
        ok: first === 0 && second === 1 && back === 0 && enter && filled && escaped && greyedKept,
        got: { first, second, back, enter, filled, escaped, greyedKept },
      };
    }
  );
  await fcheck(
    'D.6',
    'a tap or a move of focus anywhere else closes the list; a tap on the list or in its own box leaves it',
    () => {
      const { i } = form();
      typeIn(i, MAIN, 'mer');
      const inside = { closest: (s: string) => (s === '[data-contacts-picks]' ? {} : null) };
      const sameBox = {
        closest: (s: string) => (s === '[data-pick-field]' ? { getAttribute: () => 'main' } : null),
      };
      const elsewhere = { closest: () => null };
      docEvent(i, 'mousedown', inside);
      const a = !!picks(i);
      docEvent(i, 'mousedown', sameBox);
      const b = !!picks(i);
      docEvent(i, 'mousedown', elsewhere);
      const c = !picks(i);
      typeIn(i, MAIN, 'mer');
      const otherBox = {
        closest: (s: string) =>
          s === '[data-pick-field]' ? { getAttribute: () => 'guest:x' } : null,
      };
      docEvent(i, 'focusin', otherBox);
      const d = !picks(i);
      const idle = form();
      const none = Object.values(idle.win.document.listeners).every((l) => l.length === 0);
      return { ok: a && b && c && d && none, got: { a, b, c, d, none } };
    }
  );
  await fcheck(
    'D.7',
    'a flagged number is carried as it is and the form\'s own check refuses it at Save, with its own "fix" line, sending nothing',
    async () => {
      const { i, sent } = form();
      typeIn(i, MAIN, 'sam');
      pickLine(i, 'Sam Overseas');
      await saveNew(i);
      const fix = flat(textOf(i.tree())).includes('Please fix 1 thing above');
      return { ok: sent.length === 0 && fix, got: { sent: sent.length, fix } };
    }
  );

  section('H — the hand-off from the contacts page');
  const withNote = (
    over: Record<string, unknown> = {},
    props: Record<string, unknown> = {},
    extra: { drafts?: MemStore; local?: MemStore } = {}
  ) => {
    const session = new MemStore();
    leaveNote(session, over);
    return form(props, { session, ...extra });
  };
  await fcheck(
    'H.1',
    'after the draft check, an empty main contact of a new household takes the person and the note is used up; the person is not put in twice',
    () => {
      const { i, session } = withNote();
      return {
        ok:
          boxes(i, MAIN)[0].props.value === 'Mere Tane' &&
          boxes(i, GUEST).length === 0 &&
          session.m.size === 0,
        got: [boxes(i, MAIN)[0].props.value, session.m.size],
      };
    }
  );
  await fcheck(
    'H.2',
    'on her own step and when changing a household, the person lands in a new guest row at the top, as Add Guest makes one; the saved rows are untouched',
    () => {
      const host = withNote(
        { form: 'host' },
        { hostMode: { name: 'Kate', email: 'k@example.com', phone: null } }
      );
      const edit = withNote({ form: 'edit:hh1' }, { editingHousehold: saved() });
      const hostGuest = boxes(host.i, GUEST).map((b) => b.props.value);
      const editGuests = boxes(edit.i, GUEST).map((b) => b.props.value);
      return {
        ok:
          hostGuest.join() === 'Mere Tane' &&
          editGuests[0] === 'Mere Tane' &&
          editGuests.includes('Gus Guest') &&
          boxes(edit.i, PARTNER)[0].props.value === 'Pat Smith' &&
          boxes(edit.i, KID)[0].props.value === 'Jo Smith' &&
          boxes(edit.i, MAIN)[0].props.value === 'Kate Smith',
        got: { hostGuest, editGuests },
      };
    }
  );
  await fcheck(
    'H.3',
    "it is applied after the saved draft is put back: with a kept draft the restored boxes stay and the person lands as a new guest; never in a kid's row",
    () => {
      const drafts = new MemStore();
      const a = form({}, { drafts });
      typeIn(a.i, MAIN, 'Kate Draft');
      addKid(a.i);
      flushDraft(a.i);
      const b = withNote({}, {}, { drafts, local: a.local });
      return {
        ok:
          boxes(b.i, MAIN)[0].props.value === 'Kate Draft' &&
          boxes(b.i, KID).length === 1 &&
          boxes(b.i, KID)[0].props.value === '' &&
          boxes(b.i, GUEST)
            .map((x) => x.props.value)
            .join() === 'Mere Tane',
        got: [
          boxes(b.i, MAIN)[0].props.value,
          boxes(b.i, KID).length,
          boxes(b.i, GUEST).map((x) => x.props.value),
        ],
      };
    }
  );
  await fcheck(
    'H.4',
    'used once and ignored quietly: a contact no longer in her list, one already in a row of this form, another event or form, a stale or unreadable note put nobody in and say nothing; each note is removed all the same',
    () => {
      const cases: Record<string, () => { i: Inst; session: MemStore }> = {
        gone: () => withNote({ contactId: 'zc-gone' }),
        otherEvent: () => withNote({ eventId: 'ev9' }),
        otherForm: () => withNote({ form: 'host' }),
        stale: () => withNote({ at: Date.now() - 6 * 60 * 1000 }),
        junk: () => {
          const session = new MemStore();
          session.m.set('gather:contact-handoff:v1:user-a:ev1', 'not json');
          return form({}, { session });
        },
        inARow: () => {
          const drafts = new MemStore();
          const a = form({}, { drafts });
          typeIn(a.i, MAIN, 'mer');
          pickLine(a.i, 'Mere Tane');
          flushDraft(a.i);
          return withNote({}, {}, { drafts, local: a.local });
        },
      };
      const bad: string[] = [];
      for (const [k, make] of Object.entries(cases)) {
        const { i, session } = make();
        const guests = boxes(i, GUEST).length;
        const mainVal = String(boxes(i, MAIN)[0].props.value);
        const emptyMain = k === 'inARow' ? mainVal === 'Mere Tane' : mainVal === '';
        if (guests !== 0 || !emptyMain || session.m.size !== 0) bad.push(k);
      }
      const once = withNote();
      const again = form({}, { session: once.session, local: once.local });
      return { ok: bad.length === 0 && boxes(again.i, MAIN)[0].props.value === '', got: bad };
    }
  );

  section('P — what the form sends, and what the draft keeps');
  await fcheck(
    'P.1',
    'what the form SENDS is unchanged and holds no contact id: a household built by picking sends exactly what the same household typed by hand sends',
    async () => {
      const typedBy = async () => {
        const { i, sent } = form({}, { contacts: null });
        typeIn(i, MAIN, 'Host Person');
        addPartner(i);
        typeIn(i, PARTNER, 'Aroha Tane-Brown');
        addKid(i);
        typeIn(i, KID, 'Kiri Kid');
        addGuest(i);
        typeIn(i, GUEST, 'Mārama Smith');
        // newest first: guest, kid, partner
        i.act(() => boxes(i, 'Phone')[0].props.onChange({ target: { value: '+64215550148' } }));
        i.act(() =>
          boxes(i, 'Email')[2].props.onChange({ target: { value: 'aroha@example.com' } })
        );
        await saveNew(i);
        return sent[0];
      };
      const pickedBy = async () => {
        const { i, sent } = form();
        typeIn(i, MAIN, 'Host Person');
        addPartner(i);
        typeIn(i, PARTNER, 'aro');
        pickLine(i, 'Aroha Tane-Brown');
        addKid(i);
        typeIn(i, KID, 'kir');
        pickLine(i, 'Kiri Kid');
        addGuest(i);
        typeIn(i, GUEST, 'mar');
        pickLine(i, 'Mārama Smith');
        await saveNew(i);
        return sent[0];
      };
      const a = await typedBy();
      const b = await pickedBy();
      const text = JSON.stringify(b);
      return {
        ok:
          !!a &&
          !!b &&
          JSON.stringify(a) === text &&
          !/zc\d/.test(text) &&
          !/contactId/i.test(text),
        got: { a: JSON.stringify(a)?.slice(0, 200), b: text.slice(0, 200) },
      };
    }
  );
  await fcheck(
    'P.2',
    'the draft keeps which row came from which contact (an id, nothing more), so the list stays greyed after the trip; an older draft with no mark reads as not picked',
    () => {
      const w = W();
      const drafts = new MemStore();
      const a = form({}, { drafts });
      typeIn(a.i, MAIN, 'mer');
      pickLine(a.i, 'Mere Tane');
      addGuest(a.i);
      typeIn(a.i, GUEST, 'aro');
      pickLine(a.i, 'Aroha Tane-Brown');
      flushDraft(a.i);
      const state = draftOf(drafts)?.state;
      const b = form({}, { drafts, local: a.local });
      addGuest(b.i);
      typeIn(b.i, GUEST, 'tane');
      const greyed = (name: string) => flat(textOf(line(b.i, name))).includes(w.ALREADY_IN_FORM);
      // an older draft: typed by hand, no marks
      const olderDrafts = new MemStore();
      const c = form({}, { drafts: olderDrafts, contacts: BOOK });
      typeIn(c.i, MAIN, 'Mere Tane');
      flushDraft(c.i);
      const d = form({}, { drafts: olderDrafts, local: c.local });
      addGuest(d.i);
      typeIn(d.i, GUEST, 'mer');
      const olderFree = !flat(textOf(line(d.i, 'Mere Tane'))).includes(w.ALREADY_IN_FORM);
      // The mark is an id and nothing more: no other key about a contact, in the form or in any row.
      const markKeys = (o: any) =>
        Object.keys(o ?? {})
          .filter((k) => /contact/i.test(k))
          .sort()
          .join();
      const extras = !(
        markKeys(state) === 'contactId,contactPersonEventId' &&
        markKeys(state?.guests?.[0]) === 'contactId' &&
        typeof state?.contactId === 'string' &&
        !JSON.stringify(state).includes('problems')
      );
      return {
        ok:
          state?.contactId === 'zc1' &&
          state?.guests?.[0]?.contactId === 'zc4' &&
          !extras &&
          greyed('Mere Tane') &&
          greyed('Aroha Tane-Brown') &&
          olderFree &&
          !('contactId' in (draftOf(olderDrafts)?.state ?? {})),
        got: {
          state: state && { main: state.contactId, guest: state.guests?.[0]?.contactId },
          olderFree,
        },
      };
    }
  );

  section(
    'B — break proofs: one rule broken in an in-memory copy of the form (or the dropdown), and the named checks go red'
  );
  await checkAsync(
    'B.1',
    'each fault turns exactly the checks named red and leaves the others green',
    async () => {
      const F = FORM;
      const PK = PICKS;
      // [what is wrong, the file, the text it replaces (exactly once), the replacement, checks that go red]
      const faults: Array<[string, string, string, string, string[]]> = [
        [
          'a saved partner takes a pick',
          F,
          "return partnerPersonEventId ? 'saved' : 'adult';",
          "return 'adult';",
          ['R.4'],
        ],
        [
          'a saved kid takes a pick',
          F,
          "return h?.personEventId ? 'saved' : 'kid';",
          "return 'kid';",
          ['R.4'],
        ],
        [
          'her own row takes a pick',
          F,
          "if (hostMode || editingHousehold?.isHostHousehold) return 'own';",
          "if (false) return 'own';",
          ['R.5'],
        ],
        [
          'a kid gets the number and email too',
          F,
          "const f = fillFrom(c, takes === 'kid' ? 'kid' : 'adult');",
          "const f = fillFrom(c, 'adult');",
          ['R.2', 'P.1'],
        ],
        [
          'a contact already in a row is not greyed',
          F,
          'usedIds(key).has(c.id) ? CONTACTS_WORDS.ALREADY_IN_FORM : undefined',
          'undefined',
          ['D.2', 'D.4', 'D.5', 'P.2'],
        ],
        [
          'a tap elsewhere does not close the list',
          F,
          "if (owner === picking.key || t?.closest?.('[data-contacts-picks]')) return;",
          'return;',
          ['D.6'],
        ],
        ['Enter does not pick', F, "if (e.key === 'Enter') {", "if (e.key === 'Tab') {", ['D.5']],
        [
          'the mark is not kept in the draft',
          F,
          '...(r.contactId ? { contactId: r.contactId } : {}),',
          '',
          ['P.2'],
        ],
        [
          'the list is shown even when nothing is loaded',
          F,
          'if (lines.length === 0) return null;',
          '',
          ['R.7'],
        ],
        [
          'moving along the list picks',
          F,
          'setPicking({ key, highlight: next });',
          'applyPick(key, lines[next].contact, takes);',
          ['D.3', 'D.5'],
        ],
        ['a line is too short to tap', PK, 'min-h-[44px]', 'min-h-[20px]', ['D.1']],
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
            for (const id of Object.keys(fRuns)) {
              let v: string;
              try {
                v = (await fRuns[id]()).ok ? 'green' : 'red';
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

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.log(String(e));
  process.exit(1);
});
