/**
 * [[GTC-468]] — "YOUR CONTACTS" IN THE DEMO: a pop-up says it is not part of the demo.
 *
 * WHAT THIS PINS, IN PLAIN WORDS. A visitor to the sample (a throwaway account whose address ends
 * demo-copy.invalid, or any sample event) must not be able to load a contacts list, because the list
 * would stay in her browser after Gather deletes the sample (W58 says it deletes "everything you type
 * into it"). So, in a sample: the menu bar's "Your contacts" and Moment 1's two links show a notice
 * (R2, the founder's own words) and go nowhere; /plan/contacts shows only its title and that notice;
 * and the /demo explainer says a real event has contacts (ruling B). A real host sees none of this.
 *
 * Founder rulings, 22 Nov 2026: R1, R2, A (Q1, Q2, Q3, Q6 option 1, Q7, Q8, Q9), B (the explainer's
 * sentence), C (the picture is retaken in this ticket), D (the pre-build check on gather_dev).
 *
 *   S1  the sentence is R2, character for character
 *   S2  a sample press stops the click and shows R2 once, for 8 seconds
 *   S3  a real account's press is left alone
 *   S4  Navigation: the sample check, both links wired, the list of items unchanged
 *   S5  Moment 1 given the prop: all three links stop the click, call it, keep no draft
 *   S6  Moment 1 without the prop: as before (the draft is kept, the click is not stopped)
 *   S7  the setup page gives the prop on both mounts, only for an isDemo event
 *   S8  the contacts page: the note for a sample, the screen for anyone else
 *   S9  the note: title and R2 only; no loading box, no storage, no request
 *   S10 the sample flag: default "not a sample"; the layout feeds it from the account
 *   S11 the explainer holds ruling B's sentence once, after the "Add a crowd" picture, and not W58
 *   S12 every explainer picture exists and its real pixel size is the size written for it
 *
 * HOW IT IS RUN. No browser, no database, no server, no network: as `contacts-page-test.tsx` does, it
 * compiles the LIVE source of the page and Moment 1 with esbuild, gives them a small stand-in for
 * React's hooks, walks the element tree they return and calls their real handlers. A missing file is
 * a red check that says "not there yet", not a crash.
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/contacts-sample-test.tsx
 *      (npm run test:contacts-sample)
 */
import fs from 'fs';
import path from 'path';
import * as ReactAll from 'react';
import { transformSync } from 'esbuild';
import * as FormDraft from '../src/lib/households/form-draft';
import { ViewerIdContext } from '../src/components/shared/Providers';

const ROOT = path.join(__dirname, '..');
const WORDS = 'src/lib/demo/contacts-sample-words.ts';
const VIEWER = 'src/components/shared/SampleViewer.tsx';
const NOTE = 'src/components/contacts/SampleContactsNote.tsx';
const PAGE = 'src/app/plan/contacts/page.tsx';
const SCREEN = 'src/components/contacts/ContactsScreen.tsx';
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const NAV = 'src/components/shared/Navigation.tsx';
const LAYOUT = 'src/app/layout.tsx';
const SETUP_PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
const EXPLAINER = 'src/lib/demo/explainer-words.ts';

/** R2, the founder's words (22 Nov 2026), not to be reworded. */
const R2 =
  "Your contacts isn't part of the demo. In a real event you can load your guests from your phone or a spreadsheet, then pick them as you type.";
/** Ruling B, the explainer's sentence, with the curly quotes and apostrophe the explainer file uses. */
const RULING_B =
  'On a real event, “Your contacts” lets you load your guests from your phone or a spreadsheet and pick them as you type. It isn’t part of the demo.';
/** W58, the sample's privacy line (src/app/demo/new/page.tsx): it must not be repeated in the explainer. */
const W58_START = 'Only you can see your sample.';

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
/** Run one check; a thrown error is a red check that says why (a missing file reads "not there yet"). */
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
const code = (rel: string) => flat(stripComments(read(rel)));
/** Load a file for real (not through the stand-in); throws "not there yet" if it does not exist. */
const real = (rel: string): any => {
  if (!fs.existsSync(path.join(ROOT, rel))) throw new Error(`${rel} is not there yet`);
  return require(path.join(ROOT, rel));
};

// ── Nothing here may reach the network ───────────────────────────────────────
const requests: string[] = [];
globalThis.fetch = (async (url: unknown) => {
  requests.push(String(url));
  return { ok: true, status: 200, json: async () => ({ households: [] }) };
}) as unknown as typeof fetch;

// ── Browser storage, in memory ───────────────────────────────────────────────
class MemStore {
  m = new Map<string, string>();
  calls = 0;
  sets = 0;
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
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.calls++;
    this.sets++;
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.calls++;
    this.m.delete(k);
  }
}
interface Win {
  localStorage: MemStore;
  sessionStorage: MemStore;
  location: { search: string; assign(href: string): void };
  assigned: string[];
  listeners: Record<string, Array<(e: any) => void>>;
  addEventListener(t: string, f: (e: any) => void): void;
  removeEventListener(t: string, f: (e: any) => void): void;
}
function makeWindow(): Win {
  const w: Win = {
    localStorage: new MemStore(),
    sessionStorage: new MemStore(),
    location: {
      search: '',
      assign(href: string) {
        w.assigned.push(href);
      },
    },
    assigned: [],
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
  sample: boolean;
  draftStore: FormDraft.DraftStore | null;
  win: Win;
  props: Record<string, any>;
  tree: any;
}
let cur: Fiber | null = null;
let activeDraftStore: FormDraft.DraftStore | null = null;
/** The sample flag's context object, once SampleViewer.tsx exists (loaded for real, so it is one object). */
let sampleCtx: unknown = null;
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
    if (ctx === ViewerIdContext) return cur.viewerId;
    if (sampleCtx && ctx === sampleCtx) return cur.sample;
    return ctx._currentValue;
  },
};
const NAV_STUB = {
  useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {} }),
};
const DRAFT_SHIM = { ...FormDraft, browserDraftStore: () => activeDraftStore };

// ── The live source, compiled; the files under test get the stand-in React ───
const LIVE = new Set([PAGE, FORM]);
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
    if (id === '@/lib/households/form-draft') return DRAFT_SHIM;
    if (id.startsWith('@/')) return need('src/' + id.slice(2));
    if (id.startsWith('./') || id.startsWith('../')) return need(path.join(dir, id));
    return require(id);
  };
  new Function('require', 'module', 'exports', out)(req, m, m.exports);
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

interface Inst {
  f: Fiber;
  first: any;
  tree: () => any;
  act: (fn: () => unknown) => void;
}
function mount(
  rel: string,
  props: Record<string, any>,
  opts: {
    viewerId?: string | null;
    sample?: boolean;
    draftStore?: FormDraft.DraftStore | null;
  } = {}
): Inst {
  const comp = loadLive(rel).default;
  const win = makeWindow();
  const f: Fiber = {
    comp,
    slots: [],
    pos: 0,
    pending: [],
    dirty: false,
    viewerId: opts.viewerId ?? null,
    sample: opts.sample ?? false,
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
    first,
    tree: () => f.tree,
    act(fn) {
      withWindow(win, fn);
      settle(f);
    },
  };
}

/** A toast stand-in that records what it was told. */
const makeToast = () => {
  const calls: Array<{ message: string; options?: { duration?: number } }> = [];
  return {
    calls,
    info: (message: string, options?: { duration?: number }) =>
      void calls.push({ message, options }),
  };
};
/** A click that records whether it was stopped. */
const makeClick = (over: Record<string, unknown> = {}) => {
  const ev = {
    button: 0,
    prevented: 0,
    preventDefault() {
      ev.prevented++;
    },
    ...over,
  };
  return ev;
};

function main() {
  // The request spy sees a call, so "no request" in S9 means something.
  void globalThis.fetch('spy');
  check('S0', 'the request spy sees a call (so S9 means something)', () => {
    const seen = requests.length === 1;
    requests.length = 0;
    return seen;
  });

  // ══ S1 to S3 — the sentence and the press ═══════════════════════════════════
  section('S1 to S3 — the sentence, and a press in a sample or not');
  check('S1', 'the sentence is R2, character for character, and stays 8 seconds on screen', () => {
    const { CONTACTS_SAMPLE } = real(WORDS);
    return {
      ok: CONTACTS_SAMPLE.TOAST === R2 && CONTACTS_SAMPLE.TOAST_MS === 8000,
      got: [CONTACTS_SAMPLE.TOAST, CONTACTS_SAMPLE.TOAST_MS],
    };
  });
  check('S2', 'a press in a sample stops the click and shows R2 once, for 8 seconds', () => {
    const { contactsPress } = real(WORDS);
    const toast = makeToast();
    const ev = makeClick();
    const handled = contactsPress(true, ev, toast);
    return {
      ok:
        handled === true &&
        ev.prevented === 1 &&
        toast.calls.length === 1 &&
        toast.calls[0].message === R2 &&
        toast.calls[0].options?.duration === 8000,
      got: { handled, prevented: ev.prevented, calls: toast.calls },
    };
  });
  check('S3', "a real account's press is left alone: no stop, no notice", () => {
    const { contactsPress } = real(WORDS);
    const toast = makeToast();
    const ev = makeClick();
    const handled = contactsPress(false, ev, toast);
    return {
      ok: handled === false && ev.prevented === 0 && toast.calls.length === 0,
      got: { handled, prevented: ev.prevented, calls: toast.calls.length },
    };
  });

  // ══ S4 — the menu bar ═══════════════════════════════════════════════════════
  section('S4 — the menu bar (Navigation.tsx)');
  check(
    'S4',
    'the sample check, the notice and both "Your contacts" links, and the items unchanged',
    () => {
      const nav = code(NAV);
      const items = nav.slice(
        nav.indexOf('const navItems = ['),
        nav.indexOf('];', nav.indexOf('const navItems = ['))
      );
      const bar = nav.slice(
        nav.indexOf('hidden xl:flex items-center gap-1'),
        nav.indexOf('aria-label={menuOpen')
      );
      const menu = nav.slice(nav.indexOf('id="site-menu"'));
      const wired = /onClick=\{[\s\S]*?pressContacts/;
      return {
        ok:
          /import \{ useToast \} from '@\/contexts\/ToastContext';/.test(nav) &&
          /import \{ contactsPress \} from '@\/lib\/demo\/contacts-sample-words';/.test(nav) &&
          nav.includes('const sample = isCopyAddress(user?.email);') &&
          nav.includes('const toast = useToast();') &&
          /const pressContacts = \(e: \{ preventDefault: \(\) => void \}\) => contactsPress\(sample, e, toast\)/.test(
            nav
          ) &&
          wired.test(bar) &&
          wired.test(menu) &&
          items.includes("href: '/plan/events'") &&
          items.includes("href: '/plan/new'") &&
          items.includes("href: '/plan/contacts', label: 'Your contacts'") &&
          (items.match(/href:/g) ?? []).length === 3 &&
          nav.indexOf('const toast = useToast();') < nav.indexOf('if (isTokenView)'),
        got: { hasHook: nav.includes('useToast'), hasSample: nav.includes('user?.email') },
      };
    }
  );

  // ══ S5 and S6 — Moment 1 ════════════════════════════════════════════════════
  section("S5 and S6 — Moment 1's two links, in a sample and not");
  const formProps = (over: Record<string, unknown> = {}) => ({
    eventId: 'ev1',
    eventName: 'Boxing Day',
    onComplete() {},
    onAddPerson: async () => {},
    onEditSave: async () => {},
    onSaveHostHousehold: async () => {},
    channelCandidates: [],
    ...over,
  });
  const resume = (ids: string[] | null) => ({ resumeEdit: { savedIds: ids, open() {} } });
  const variants: Array<[string, Record<string, unknown>, string]> = [
    ['the large block (only her own household saved)', resume(['hh-own']), 'large'],
    ['the small link (others are saved)', resume(['hh-own', 'hh-2']), 'small'],
    [
      "the small link on her own household's step",
      { hostMode: { name: 'Sam', email: null, phone: null } },
      'small',
    ],
  ];
  const typeName = (i: Inst, v: string) =>
    i.act(() =>
      all(
        i.tree(),
        (e) => e.type === 'input' && e.props.placeholder === 'e.g. Sarah Mitchell'
      )[0].props.onChange({ target: { value: v } })
    );
  const entryLink = (i: Inst) => {
    const e = byAttr(i.tree(), 'data-contacts-entry');
    return { e, link: all(e, (x) => x.type === 'a')[0] };
  };
  for (const [label, over, kind] of variants) {
    check('S5', `given the prop, ${label}: stops the click, calls it once, keeps no draft`, () => {
      let called = 0;
      const drafts = new MemStore();
      const i = mount(FORM, formProps({ ...over, onSampleContacts: () => void called++ }), {
        viewerId: 'user-a',
        draftStore: drafts,
      });
      if (!('hostMode' in over)) typeName(i, 'Mere');
      const { e, link } = entryLink(i);
      const ev = makeClick();
      let writesByClick = -1;
      i.act(() => {
        const before = drafts.sets;
        link.props.onClick(ev);
        writesByClick = drafts.sets - before;
      });
      return {
        ok:
          e?.props['data-contacts-entry'] === kind &&
          ev.prevented === 1 &&
          called === 1 &&
          writesByClick === 0,
        got: {
          kind: e?.props['data-contacts-entry'],
          prevented: ev.prevented,
          called,
          writesByClick,
        },
      };
    });
  }
  check(
    'S6',
    'without the prop it is as before: a typed name is kept as a draft and the click is not stopped',
    () => {
      const drafts = new MemStore();
      const i = mount(FORM, formProps(resume(['hh-own'])), {
        viewerId: 'user-a',
        draftStore: drafts,
      });
      typeName(i, 'Mere');
      const { link } = entryLink(i);
      const ev = makeClick();
      let writesByClick = -1;
      i.act(() => {
        const before = drafts.sets;
        link.props.onClick(ev);
        writesByClick = drafts.sets - before;
      });
      return {
        ok:
          read(FORM).includes('onSampleContacts?: () => void') &&
          ev.prevented === 0 &&
          writesByClick > 0,
        got: { prevented: ev.prevented, writesByClick },
      };
    }
  );

  // ══ S7 — the setup page ═════════════════════════════════════════════════════
  section('S7 — the setup page gives the prop, only for an isDemo event');
  check(
    'S7',
    'both Moment 1 mounts get onSampleContacts from event.isDemo, and nothing else changes',
    () => {
      const setup = code(SETUP_PAGE);
      const mounts = setup.match(/<Moment1InputForm /g) ?? [];
      const given =
        setup.match(
          /onSampleContacts=\{\s*event\.isDemo\s*\?\s*\(\)\s*=>\s*showSampleContactsToast\(toast\)\s*:\s*undefined\s*\}/g
        ) ?? [];
      return {
        ok:
          mounts.length === 2 &&
          given.length === 2 &&
          /import \{ showSampleContactsToast \} from '@\/lib\/demo\/contacts-sample-words';/.test(
            setup
          ),
        got: { mounts: mounts.length, given: given.length },
      };
    }
  );

  // ══ S8 and S9 — the contacts page and its note ══════════════════════════════
  section('S8 and S9 — /plan/contacts: the note for a sample, the screen for anyone else');
  check(
    'S8',
    'a sample sees the note; anyone else sees the contacts screen; still a client page',
    () => {
      sampleCtx = real(VIEWER).SampleViewerContext;
      const noteFn = real(NOTE).default;
      const screenFn = real(SCREEN).default;
      const src = read(PAGE);
      const sample = mount(PAGE, {}, { viewerId: 'user-a', sample: true }).first;
      const other = mount(PAGE, {}, { viewerId: 'user-a', sample: false }).first;
      return {
        ok:
          /^\s*'use client';/.test(src) &&
          isEl(sample) &&
          sample.type === noteFn &&
          isEl(other) &&
          other.type === screenFn &&
          /useContext\(SampleViewerContext\)/.test(code(PAGE)),
        got: [String((sample as any)?.type?.name), String((other as any)?.type?.name)],
      };
    }
  );
  check(
    'S9',
    'the note: the title and R2 only; no paste box, file choice, button or list; no storage, no request',
    () => {
      const { CONTACTS_WORDS } = real('src/lib/contacts/words.ts');
      const tree = real(NOTE).default();
      const text = textOf(tree);
      const controls = all(tree, (e) =>
        ['input', 'textarea', 'button', 'ul', 'li', 'select'].includes(e.type)
      );
      const src = code(NOTE);
      const win = makeWindow();
      return {
        ok:
          text.includes(CONTACTS_WORDS.TITLE) &&
          text.includes(R2) &&
          controls.length === 0 &&
          !/localStorage|sessionStorage|fetch|readContacts|browserContactsStore|ViewerIdContext|ContactsScreen/.test(
            src
          ) &&
          requests.length === 0 &&
          win.localStorage.calls === 0,
        got: { text: text.slice(0, 160), controls: controls.length, requests: requests.length },
      };
    }
  );

  // ══ S10 — the sample flag ═══════════════════════════════════════════════════
  section('S10 — the sample flag, and the layout that sets it');
  check(
    'S10',
    'default "not a sample"; the provider passes its value; the layout feeds it from the account',
    () => {
      const mod = real(VIEWER);
      const defaultValue = (mod.SampleViewerContext as any)._currentValue;
      const el = mod.SampleViewer({ isSample: true, children: 'x' });
      const layout = code(LAYOUT);
      return {
        ok:
          defaultValue === false &&
          isEl(el) &&
          el.props.value === true &&
          layout.includes('<Providers viewerId={user?.id ?? null}>') &&
          /<SampleViewer isSample=\{isCopyAddress\(user\?\.email\)\}> <Navigation user=\{user\} \/> \{children\} <\/SampleViewer>/.test(
            layout
          ) &&
          /import \{ SampleViewer \} from '@\/components\/shared\/SampleViewer';/.test(layout) &&
          /import \{ isCopyAddress \} from '@\/lib\/demo\/copy-address';/.test(layout),
        got: { defaultValue, layoutHasFlag: layout.includes('SampleViewer') },
      };
    }
  );

  // ══ S11 and S12 — the explainer and its pictures ════════════════════════════
  section('S11 and S12 — the /demo explainer');
  const explainer = (): readonly any[] =>
    require('../src/lib/demo/explainer-words').EXPLAINER_STEPS;
  check(
    'S11',
    'Moment 1 holds ruling B\'s sentence once, after the "Add a crowd" picture, and not W58',
    () => {
      const steps = explainer();
      const m1 = steps.find((s) => s.eyebrow === 'Moment 1');
      const blocks: any[] = m1?.blocks ?? [];
      const at = blocks.findIndex((b) => b.kind === 'p' && b.text === RULING_B);
      const crowd = blocks.findIndex((b) => b.kind === 'figure' && /m1-add-crowd/.test(b.src));
      const everyText = steps
        .flatMap((s) => s.blocks)
        .filter((b: any) => b.kind === 'p')
        .map((b: any) => b.text);
      return {
        ok:
          at >= 0 &&
          crowd >= 0 &&
          at > crowd &&
          blocks.filter((b) => b.kind === 'p' && b.text === RULING_B).length === 1 &&
          everyText.every((t: string) => !t.includes(W58_START)),
        got: { at, crowd },
      };
    }
  );

  /** A picture's real size, read from its header in plain Node. */
  function sizeOf(file: string): { w: number; h: number } | null {
    const b = fs.readFileSync(file);
    if (b.length > 24 && b.readUInt32BE(0) === 0x89504e47) {
      return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      let o = 2;
      while (o + 9 < b.length) {
        if (b[o] !== 0xff) {
          o++;
          continue;
        }
        const marker = b[o + 1];
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { h: b.readUInt16BE(o + 5), w: b.readUInt16BE(o + 7) };
        }
        o += 2 + b.readUInt16BE(o + 2);
      }
    }
    return null;
  }
  check(
    'S12',
    'every explainer picture exists and its real pixel size is the size written for it',
    () => {
      const figures = explainer()
        .flatMap((s) => s.blocks)
        .filter((b: any) => b.kind === 'figure');
      const bad: unknown[] = [];
      for (const f of figures) {
        const file = path.join(ROOT, 'public', f.src.replace(/^\//, ''));
        if (!fs.existsSync(file)) {
          bad.push({ src: f.src, problem: 'missing' });
          continue;
        }
        const s = sizeOf(file);
        if (!s || s.w !== f.width || s.h !== f.height)
          bad.push({ src: f.src, real: s, written: [f.width, f.height] });
      }
      return { ok: figures.length >= 7 && bad.length === 0, got: bad };
    }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main();
