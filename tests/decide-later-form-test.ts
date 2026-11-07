/**
 * GTC-449 S2.2 and S2.3 (form half) (ruling 76) — the form: a "Decide later" choice on a kid row,
 * and what happens when it is turned off.
 *
 * What this file pins, from "The tests" in docs/tickets/GTC-449.md: item 7 (a restored draft keeps
 * the marker), item 11 (the form's choice: offered only while the tick is off, ticking keeps what
 * is typed, choosing stores nothing until Save; and, from S2.3, turning the choice off on a row
 * saved as decide later empties its email and phone boxes), the form half of item 16 (the control
 * is not offered while the tick is on; the tick wins), the form side of item 4 (what the form
 * SENDS, and what it shows when a saved household is reopened) and, from S2.3, the page test of
 * item 18 (after a refused clear the saved card shows W9, once). The confirm line is S2.4's.
 *
 * The words are the founder's, W1 to W3 and W9 of "The W-lines, as ruled" (rulings 13, 14 and 35),
 * exactly:
 *   W1  "Decide later"
 *   W2  "Gather won't message {name} until you choose. You can change this any time."
 *   W3  "Gather is keeping {name}'s contact details for now. It won't use them unless you choose to
 *        message {name}."
 *   W9  "We kept {name}'s email address on file, because there is a no-email note for them."
 * Checks W.1 and W.2 read them out of the ticket, so a word changed in the code and not in the
 * ticket (or the other way) is red. No other new sentence is checked for, and none may be added
 * without a ruling.
 *
 * HOW THE FORM IS RUN WITHOUT A BROWSER. The estate has no jsdom (see tweaks-d-test.tsx, which
 * compiles a page with a stand-in React). This file does the same for `Moment1InputForm.tsx`: it
 * compiles the form's LIVE source with esbuild, gives it a small stand-in for React's hooks that
 * keeps state between renders and runs effects after each one, and then drives it the way a
 * browser would: it walks the element tree the form returns, finds the real controls by their
 * labels and placeholders, and calls their real `onChange` and `onClick` handlers. So a handler
 * that is wrong in the form is wrong here. The only things stood in for are: React's hooks, a
 * `window` that records its listeners, and the browser's draft store (an in-memory one, handed in
 * through the one function the form asks for, `browserDraftStore`). Nothing here reads a database,
 * calls the network or can send anything; a `fetch` that is called at all is a red check.
 *
 * `apiHouseholdToSaved` lives inside the setup page's component, so it is read out of the page's
 * live source with the TypeScript parser and run on its own. The page's `handleEditSave` (the
 * save of an edit) and its effect that drops W9 when a household is next opened are read out the
 * same way and run with stand-ins for the page's state setters and its one `fetch`, so the real
 * page code decides what the saved card carries. The real card (`HouseholdCardList`) is rendered
 * to markup to see W9 on it.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/decide-later-form-test.ts
 * Writes nothing: no rows, no files.
 */

import fs from 'fs';
import path from 'path';
import * as ReactAll from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import * as ts from 'typescript';

import HouseholdCardList from '../src/components/plan/HouseholdCardList';
import { ViewerIdContext } from '../src/components/shared/Providers';
import * as FormDraft from '../src/lib/households/form-draft';
import { moment1ChannelChoices } from '../src/components/plan/household-channel-choices';

const ROOT = path.join(__dirname, '..');
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const TICKET = 'docs/tickets/GTC-449.md';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
// A step that needs a control which is not on screen must not crash the run (the checks after it
// would never be seen). It is noted here, and the NEXT check fails and names the control, so a
// missing control reads as red and never as a pass for nothing.
const notOnScreen: string[] = [];
function assert(id: string, label: string, condition: boolean, got?: unknown) {
  const lost = notOnScreen.splice(0);
  if (lost.length) {
    condition = false;
    got = { controlsNotOnScreen: lost, got };
  }
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
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

// ── The words (W1 to W3, as ruled) ───────────────────────────────────────────
const W1 = 'Decide later';
const W2 = (n: string) =>
  `Gather won't message ${n} until you choose. You can change this any time.`;
const W3 = (n: string) =>
  `Gather is keeping ${n}'s contact details for now. It won't use them unless you choose to message ${n}.`;
// W9, ruling 35, exactly (straight apostrophe, as the ticket has it; ruling 103).
const W9 = (n: string) =>
  `We kept ${n}'s email address on file, because there is a no-email note for them.`;

// ── A fetch that must never be called ────────────────────────────────────────
let fetchCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => {
  fetchCalls++;
  throw new Error('the form must not call fetch');
}) as typeof fetch;

// ── A window that records what is listened for ───────────────────────────────
let listeners: Record<string, Array<(e: unknown) => void>> = {};
const fakeWindow = {
  addEventListener(t: string, f: (e: unknown) => void) {
    (listeners[t] ??= []).push(f);
  },
  removeEventListener(t: string, f: (e: unknown) => void) {
    listeners[t] = (listeners[t] ?? []).filter((x) => x !== f);
  },
};

// ── The browser's draft store, in memory ─────────────────────────────────────
class MemStore implements FormDraft.DraftStore {
  m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
let activeStore: FormDraft.DraftStore | null = null;
const DRAFT_SHIM = { ...FormDraft, browserDraftStore: () => activeStore };

// ── A stand-in for React's hooks: state kept between renders, effects run after each ──
interface Fiber {
  slots: any[];
  pos: number;
  pending: Array<{ i: number; fn: () => void | (() => void) }>;
  dirty: boolean;
  viewerId: string | null;
  store: FormDraft.DraftStore | null;
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

// ── The form, compiled from its live source ──────────────────────────────────
function loadForm(): any {
  const code = transformSync(read(FORM), {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'automatic',
    target: 'es2020',
  }).code;
  const m: { exports: any } = { exports: {} };
  const req = (id: string): any => {
    if (id === 'react') return FAKE_REACT;
    if (id === '@/lib/households/form-draft') return DRAFT_SHIM;
    if (id.startsWith('@/')) return require(path.join(ROOT, 'src', id.slice(2)));
    if (id.startsWith('./')) return require(path.join(ROOT, 'src/components/plan', id.slice(2)));
    return require(id);
  };
  new Function('require', 'module', 'exports', code)(req, m, m.exports);
  return m.exports;
}

function renderOnce(f: Fiber) {
  cur = f;
  f.pos = 0;
  f.pending = [];
  (globalThis as any).window = fakeWindow;
  try {
    f.tree = Form(f.props);
  } finally {
    cur = null;
    delete (globalThis as any).window;
  }
}
function flushEffects(f: Fiber) {
  (globalThis as any).window = fakeWindow;
  try {
    for (const { i, fn } of f.pending) {
      const slot = f.slots[i];
      if (typeof slot.cleanup === 'function') slot.cleanup();
      const c = fn();
      slot.cleanup = typeof c === 'function' ? c : undefined;
    }
  } finally {
    delete (globalThis as any).window;
  }
  f.pending = [];
}
function settle(f: Fiber) {
  activeStore = f.store;
  for (let n = 0; n < 60; n++) {
    f.dirty = false;
    renderOnce(f);
    flushEffects(f);
    if (!f.dirty) return;
  }
  throw new Error('the form did not settle after 60 renders');
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

interface Inst {
  f: Fiber;
  calls: { added: any[]; edited: Array<{ id: string; p: any }>; hosted: any[] };
  tree: () => any;
  press: (handler: (e?: any) => unknown) => Promise<void>;
}
function mount(
  over: Record<string, unknown> = {},
  opts: { viewerId?: string | null; store?: FormDraft.DraftStore | null } = {}
): Inst {
  const calls: Inst['calls'] = { added: [], edited: [], hosted: [] };
  listeners = {};
  const f: Fiber = {
    slots: [],
    pos: 0,
    pending: [],
    dirty: false,
    viewerId: opts.viewerId ?? null,
    store: opts.store ?? null,
    tree: null,
    props: {
      eventId: 'ev-1',
      eventName: 'Boxing Day',
      onComplete() {},
      onAddPerson: async (p: any) => void calls.added.push(p),
      onEditSave: async (id: string, p: any) => void calls.edited.push({ id, p }),
      onSaveHostHousehold: async (p: any) => void calls.hosted.push(p),
      channelCandidates: [],
      ...over,
    },
  };
  settle(f);
  return {
    f,
    calls,
    tree: () => f.tree,
    async press(handler) {
      const r = handler({ preventDefault() {}, target: {} });
      settle(f);
      await r;
      await Promise.resolve();
      settle(f);
    },
  };
}

const button = (i: Inst, text: string) =>
  all(i.tree(), (e) => e.type === 'button' && textOf(e).includes(text))[0];
const kidRows = (i: Inst) =>
  all(
    i.tree(),
    (e) =>
      typeof e.type === 'function' &&
      e.type.name === 'SubForm' &&
      String(e.props.title).startsWith('Kid with a job')
  );
const labelStarting = (row: El | undefined, start: string) =>
  row ? all(row, (e) => e.type === 'label').find((l) => textOf(l).startsWith(start)) : undefined;
const checkboxIn = (label: El | undefined) =>
  label ? all(label, (e) => e.type === 'input' && e.props.type === 'checkbox')[0] : undefined;
const tickBox = (i: Inst, n = 0) =>
  checkboxIn(labelStarting(kidRows(i)[n], 'Old enough to message directly'));
const decideLabel = (i: Inst, n = 0) => labelStarting(kidRows(i)[n], W1);
const decideBox = (i: Inst, n = 0) => checkboxIn(decideLabel(i, n));
const boxIn = (i: Inst, placeholder: string, n = 0) => {
  const row = kidRows(i)[n];
  return row
    ? all(row, (e) => e.type === 'input' && e.props.placeholder === placeholder)[0]
    : undefined;
};
const rowText = (i: Inst, n = 0) => textOf(kidRows(i)[n]);
const primaryName = (i: Inst) =>
  all(i.tree(), (e) => e.type === 'input' && e.props.placeholder === 'e.g. Sarah Mitchell')[0];

/** Type into a box, or tick a checkbox, by calling the control's own handler. */
function type(i: Inst, box: El | undefined, value: string) {
  if (!box) return void notOnScreen.push(`a box to type "${value}" into`);
  box.props.onChange({ target: { value } });
  settle(i.f);
}
function tick(i: Inst, box: El | undefined, checked: boolean) {
  if (!box) return void notOnScreen.push(`a checkbox to set to ${checked}`);
  box.props.onChange({ target: { checked } });
  settle(i.f);
}
async function pressButton(i: Inst, text: string) {
  const b = button(i, text);
  if (!b) return void notOnScreen.push(`the button "${text}"`);
  await i.press(b.props.onClick);
}

/** A new-household form, signed out, with one kid row named as given. */
async function formWithKid(kidName = 'Josh', over: Record<string, unknown> = {}) {
  const i = mount(over);
  type(i, primaryName(i), 'Kate Smith');
  await pressButton(i, 'Kid with a job');
  if (kidName) type(i, boxIn(i, "Kid's name"), kidName);
  return i;
}

/** A saved household with one kid, as the setup page hands it to the form. */
const saved = (decideLater: boolean | undefined, adultRoled = false): any => ({
  id: 'hh-1',
  primaryContact: { name: 'Kate Smith', email: 'kate@example.com', phone: '021 123 4567' },
  helpers: [
    {
      personEventId: 'pe-josh',
      name: 'Josh',
      email: 'josh@example.com',
      phone: '021 555 0199',
      adultRoled,
      ...(decideLater === undefined ? {} : { decideLater }),
    },
  ],
  littleCount: 0,
  guests: [],
  contactPersonEventId: null,
});
const editForm = (
  decideLater: boolean | undefined,
  opts: Parameters<typeof mount>[1] = {},
  adultRoled = false
) => mount({ editingHousehold: saved(decideLater, adultRoled), onCancelEdit() {} }, opts);

/** A stored draft in the shape the form writes (rows as given). */
const draftOf = (rows: any[], over: Record<string, unknown> = {}): any => ({
  name: 'Kate Smith',
  email: '',
  phone: '',
  showPartner: false,
  partner: { name: '', email: '', phone: '' },
  helpers: rows,
  showLittles: false,
  littleCount: 1,
  guests: [],
  order: rows.map((_, index) => ({ type: 'helper', index })),
  contactPersonEventId: null,
  hostingAlone: false,
  messagesMuted: true,
  ...over,
});

const FormMod = loadForm();
const Form = FormMod.default as (props: Record<string, any>) => any;

// ── The setup page's apiHouseholdToSaved, read out of its live source ────────
function loadApiHouseholdToSaved(): ((h: any) => any) | null {
  const src = read(SETUP);
  const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let text: string | null = null;
  const visit = (n: ts.Node) => {
    if (
      ts.isVariableDeclaration(n) &&
      ts.isIdentifier(n.name) &&
      n.name.text === 'apiHouseholdToSaved' &&
      n.initializer &&
      ts.isCallExpression(n.initializer) &&
      n.initializer.arguments[0]
    ) {
      text = n.initializer.arguments[0].getText(sf);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!text) return null;
  const js = transformSync(`exports.f = ${text};`, { loader: 'ts', format: 'cjs' }).code;
  const m: { exports: any } = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  return m.exports.f;
}

// ── The setup page's other pieces (S2.3), read out of its live source the same way ──────────
/**
 * Finds one piece of the page by a rule over its syntax tree, compiles it (types stripped) and
 * evaluates it with the given names in scope. Returns null when the piece is not there, so a check
 * that needs it is red and says so. The names are the page's own free variables: state setters, its
 * one `fetch`, `event`, `households` and the helpers it calls. A piece that reaches for a name not
 * given here throws, which reads as a red check, never as a pass.
 */
function compileFromPage(
  pick: (sf: ts.SourceFile) => ts.Node | null,
  scope: Record<string, unknown>
): any {
  const src = read(SETUP);
  const sf = ts.createSourceFile('page.tsx', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const node = pick(sf);
  if (!node) return null;
  const js = transformSync(`exports.f = ${node.getText(sf)};`, {
    loader: 'ts',
    format: 'cjs',
  }).code;
  const m: { exports: any } = { exports: {} };
  new Function('module', 'exports', ...Object.keys(scope), js)(
    m,
    m.exports,
    ...Object.values(scope)
  );
  return m.exports.f;
}
function findNode(sf: ts.SourceFile, test: (n: ts.Node) => ts.Node | null | undefined) {
  let found: ts.Node | null = null;
  const visit = (n: ts.Node) => {
    if (!found) found = test(n) ?? null;
    if (!found) ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}
/** The page's module-level `keptEmailNames` (the pure rule for W9), or null if it is not there. */
const loadKeptEmailNames = (): ((b: any, s: any, a: any) => string[]) | null =>
  compileFromPage(
    (sf) =>
      findNode(sf, (n) =>
        ts.isFunctionDeclaration(n) && n.name?.text === 'keptEmailNames' ? n : null
      ),
    {}
  );
/** The page's `handleEditSave` (the save of an edit), run with the given stand-ins. */
const loadHandleEditSave = (scope: Record<string, unknown>) =>
  compileFromPage(
    (sf) =>
      findNode(sf, (n) =>
        ts.isVariableDeclaration(n) &&
        ts.isIdentifier(n.name) &&
        n.name.text === 'handleEditSave' &&
        n.initializer &&
        ts.isArrowFunction(n.initializer)
          ? n.initializer
          : null
      ),
    scope
  ) as ((householdId: string, person: any) => Promise<void>) | null;
/** The page's effect that drops W9 when a household is next opened (the one that names the note). */
const loadKeptNoteEffect = (scope: Record<string, unknown>) =>
  compileFromPage(
    (sf) =>
      findNode(sf, (n) => {
        if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return null;
        if (n.expression.text !== 'useEffect') return null;
        const first = n.arguments[0];
        return first && first.getText(sf).includes('keptEmailNames') ? first : null;
      }),
    scope
  ) as (() => void) | null;

const member = (over: Record<string, unknown>) => ({
  id: 'pe-josh',
  role: 'GUEST',
  householdRole: 'CHILD',
  isYoungPerson: true,
  person: { id: 'p-josh', name: 'Josh', email: 'josh@example.com', phoneNumber: '+6421555019' },
  ...over,
});
const household = (members: any[]): any => ({
  id: 'hh-1',
  littleCount: 0,
  contactPersonEventId: null,
  messagesMuted: null,
  members: [
    {
      id: 'pe-kate',
      role: 'HOST',
      householdRole: 'PRIMARY_CONTACT',
      isYoungPerson: false,
      person: { id: 'p-kate', name: 'Kate Smith', email: 'kate@example.com', phoneNumber: null },
    },
    ...members,
  ],
});

async function main() {
  // ══ W — THE WORDS ARE THE RULED WORDS ═══════════════════════════════════════
  section('W — the words are the founder’s W1 to W3 and W9');
  const ticket = read(TICKET).replace(/\s+/g, ' ');
  assert(
    'W.1',
    'W2 and W3 as the code will say them (with {name}) are in the ticket exactly, and so is W1',
    ticket.includes(W2('{name}')) && ticket.includes(W3('{name}')) && ticket.includes(`*"${W1}"*`),
    { w2: ticket.includes(W2('{name}')), w3: ticket.includes(W3('{name}')) }
  );
  assert(
    'W.2',
    'W9 as the code will say it (with {name}) is in the ticket exactly, as ruling 35 gave it',
    ticket.includes(W9('{name}')),
    { w9: ticket.includes(W9('{name}')) }
  );

  // ══ H — THE STAND-IN RUNS THE REAL FORM ═════════════════════════════════════
  section('H — the form, run from its live source (the stand-in is sound)');
  const h = mount();
  assert(
    'H.1',
    'the form mounts and its effects settle; its primary-contact box is there',
    !!primaryName(h) && !!button(h, 'Kid with a job') && !!button(h, 'Save & add another household')
  );
  await pressButton(h, 'Kid with a job');
  assert(
    'H.2',
    '"Kid with a job" adds a kid row with its name, email and phone boxes',
    kidRows(h).length === 1 &&
      !!boxIn(h, "Kid's name") &&
      !!boxIn(h, 'Email') &&
      !!boxIn(h, 'Phone')
  );
  type(h, boxIn(h, "Kid's name"), 'Josh');
  type(h, boxIn(h, 'Email'), 'josh@example.com');
  assert(
    'H.3',
    'typing into the kid’s boxes changes the row: the boxes hold what was typed',
    boxIn(h, "Kid's name")?.props.value === 'Josh' &&
      boxIn(h, 'Email')?.props.value === 'josh@example.com'
  );
  tick(h, tickBox(h), true);
  assert(
    'H.4',
    'the "Old enough to message directly" tick turns on when ticked',
    tickBox(h)?.props.checked === true
  );

  // ══ 16 / 11 — THE CHOICE ON A KID ROW ═══════════════════════════════════════
  section('16 and 11 — the choice is offered beside the tick, only while the tick is off');
  const k = await formWithKid('Josh');
  assert(
    '16.1',
    'a kid row with the tick off offers "Decide later" (W1), unchecked, in the same row as the tick',
    !!decideBox(k) && decideBox(k)?.props.checked === false && !!tickBox(k),
    { offered: !!decideBox(k), checked: decideBox(k)?.props.checked }
  );
  tick(k, tickBox(k), true);
  assert(
    '16.3',
    'with the tick on, the choice is not offered (ruling 20)',
    tickBox(k)?.props.checked === true && !decideLabel(k) && !rowText(k).includes(W1)
  );
  tick(k, tickBox(k), false);
  assert(
    '16.4',
    'untick again and the choice is offered again, still unchecked',
    !!decideBox(k) && decideBox(k)?.props.checked === false
  );

  const c = await formWithKid('Josh');
  assert(
    '11.2',
    'W2 is not shown while the choice is off, and W3 is not either',
    !rowText(c).includes(W2('Josh')) && !rowText(c).includes(W3('Josh'))
  );
  tick(c, decideBox(c), true);
  assert(
    '11.1',
    'choosing it checks it and shows W2 with the kid’s name',
    decideBox(c)?.props.checked === true && rowText(c).includes(W2('Josh')),
    { checked: decideBox(c)?.props.checked }
  );
  assert(
    '11.5',
    'chosen, with no email and no phone on the row: W3 is not shown',
    !rowText(c).includes(W3('Josh'))
  );
  type(c, boxIn(c, 'Email'), 'josh@example.com');
  assert(
    '11.4a',
    'chosen, with an email on the row: W3 is shown (W2 too)',
    rowText(c).includes(W3('Josh')) && rowText(c).includes(W2('Josh'))
  );
  type(c, boxIn(c, 'Email'), '');
  type(c, boxIn(c, 'Phone'), '021 555 0199');
  assert(
    '11.4b',
    'chosen, with only a phone on the row: W3 is shown',
    rowText(c).includes(W3('Josh'))
  );
  // 11.7: the details are typed FIRST and the choice made AFTER, so a choice that emptied the boxes
  // would show. (Typing them after choosing, as 11.4 does, could never catch that.)
  const q = await formWithKid('Josh');
  type(q, boxIn(q, 'Email'), 'josh@example.com');
  type(q, boxIn(q, 'Phone'), '021 555 0199');
  tick(q, decideBox(q), true);
  assert(
    '11.7',
    'choosing it with an email and a phone already typed leaves both in their boxes (nothing is emptied by choosing)',
    decideBox(q)?.props.checked === true &&
      boxIn(q, 'Email')?.props.value === 'josh@example.com' &&
      boxIn(q, 'Phone')?.props.value === '021 555 0199'
  );
  tick(c, decideBox(c), false);
  assert(
    '11.8',
    'turn it off again: W2 and W3 go (the emptying of the boxes is S2.3, not here)',
    !rowText(c).includes(W2('Josh')) && !rowText(c).includes(W3('Josh')) && !!decideBox(c)
  );

  const d = await formWithKid('Josh');
  type(d, boxIn(d, 'Email'), 'josh@example.com');
  assert(
    '11.6',
    'details on the row but the choice off: W3 is not shown',
    !rowText(d).includes(W3('Josh')) && !rowText(d).includes(W2('Josh'))
  );

  const e = await formWithKid('');
  tick(e, decideBox(e), true);
  assert(
    '11.3',
    'a kid with no name yet: choosing it shows no W2 and no W3 (no new fallback wording)',
    decideBox(e)?.props.checked === true &&
      !/Gather won't message/.test(rowText(e)) &&
      !/Gather is keeping/.test(rowText(e))
  );

  const t = await formWithKid('Josh');
  type(t, boxIn(t, 'Email'), 'josh@example.com');
  type(t, boxIn(t, 'Phone'), '021 555 0199');
  tick(t, decideBox(t), true);
  tick(t, tickBox(t), true);
  assert(
    '11.9',
    'ticking while the choice is on: the tick is on, the choice is off and gone, the details stay',
    tickBox(t)?.props.checked === true &&
      !decideLabel(t) &&
      boxIn(t, 'Email')?.props.value === 'josh@example.com' &&
      boxIn(t, 'Phone')?.props.value === '021 555 0199'
  );
  tick(t, tickBox(t), false);
  assert(
    '11.9b',
    'then untick: the choice is offered again but is NOT back on (the tick turned it off for good), the details stay',
    !!decideBox(t) &&
      decideBox(t)?.props.checked === false &&
      !rowText(t).includes(W2('Josh')) &&
      boxIn(t, 'Email')?.props.value === 'josh@example.com' &&
      boxIn(t, 'Phone')?.props.value === '021 555 0199'
  );

  const n = await formWithKid('Josh');
  type(n, boxIn(n, 'Email'), 'josh@example.com');
  tick(n, tickBox(n), true);
  assert(
    '11.10',
    'ticking a kid who was never on decide later keeps the details',
    tickBox(n)?.props.checked === true && boxIn(n, 'Email')?.props.value === 'josh@example.com'
  );

  const s = await formWithKid('Josh');
  const fetchBefore = fetchCalls;
  tick(s, decideBox(s), true);
  assert(
    '11.11',
    'choosing stores nothing: no save ran, and the form called no fetch (nothing is stored until Save)',
    decideBox(s)?.props.checked === true &&
      s.calls.added.length === 0 &&
      s.calls.edited.length === 0 &&
      s.calls.hosted.length === 0 &&
      fetchCalls === fetchBefore
  );

  const a = await formWithKid('Josh');
  tick(a, decideBox(a), true);
  const ctl = decideLabel(a)!;
  const inCtl = ctl ? all(ctl, () => true) : [];
  assert(
    '16.5',
    'the new control draws no aria-invalid and no role="alert", and sits in the kid’s row with its boxes',
    !!ctl &&
      inCtl.every((x) => x.props['aria-invalid'] === undefined && x.props.role !== 'alert') &&
      !!boxIn(a, "Kid's name") &&
      !!boxIn(a, 'Email') &&
      !!boxIn(a, 'Phone')
  );

  // ══ 4 — WHAT THE FORM SENDS ═════════════════════════════════════════════════
  section('4 — what each save door’s request carries for a kid row');
  const p1 = await formWithKid('Josh');
  await pressButton(p1, 'Save & add another household');
  const row1 = p1.calls.added[0]?.helpers?.[0];
  assert(
    '4.1',
    'a plain kid is sent with decideLater as the boolean false (not left out)',
    !!row1 && row1.adultRoled === false && row1.decideLater === false,
    row1
  );
  const p2 = await formWithKid('Josh');
  tick(p2, decideBox(p2), true);
  await pressButton(p2, 'Save & add another household');
  const row2 = p2.calls.added[0]?.helpers?.[0];
  assert(
    '4.2',
    'a kid on decide later is sent with decideLater true and adultRoled false',
    !!row2 && row2.adultRoled === false && row2.decideLater === true,
    row2
  );
  const p3 = await formWithKid('Josh');
  tick(p3, tickBox(p3), true);
  await pressButton(p3, 'Save & add another household');
  const row3 = p3.calls.added[0]?.helpers?.[0];
  assert(
    '4.3',
    'a ticked kid is sent with adultRoled true and decideLater false',
    !!row3 && row3.adultRoled === true && row3.decideLater === false,
    row3
  );
  const p4 = await formWithKid('Josh');
  tick(p4, decideBox(p4), true);
  tick(p4, tickBox(p4), true);
  await pressButton(p4, 'Save & add another household');
  const row4 = p4.calls.added[0]?.helpers?.[0];
  assert(
    '4.4',
    'chosen and then ticked: the tick wins, the request carries decideLater false',
    !!row4 && row4.adultRoled === true && row4.decideLater === false,
    row4
  );
  const p5 = mount({
    hostMode: { name: 'Kate Smith', email: 'kate@example.com', phone: null },
  });
  await pressButton(p5, 'Kid with a job');
  type(p5, boxIn(p5, "Kid's name"), 'Josh');
  tick(p5, decideBox(p5), true);
  await pressButton(p5, 'Save and add everyone else');
  const row5 = p5.calls.hosted[0]?.helpers?.[0];
  assert(
    '4.5',
    'her own household’s first save (the host door) carries the kid’s decideLater too',
    !!row5 && row5.decideLater === true && row5.adultRoled === false,
    row5
  );

  const r1 = editForm(true);
  assert(
    '4.6',
    'a saved kid on decide later reopens with the choice checked and W2 showing',
    decideBox(r1)?.props.checked === true && rowText(r1).includes(W2('Josh')),
    { checked: decideBox(r1)?.props.checked }
  );
  type(r1, primaryName(r1), 'Kate Smith-Jones');
  await pressButton(r1, 'Save changes');
  const e1 = r1.calls.edited[0];
  assert(
    '4.7',
    'an edit of another field keeps it: the same kid (personEventId) is sent with decideLater true',
    !!e1 &&
      e1.id === 'hh-1' &&
      e1.p.helpers?.[0]?.personEventId === 'pe-josh' &&
      e1.p.helpers[0].decideLater === true &&
      e1.p.helpers[0].adultRoled === false,
    e1?.p.helpers
  );
  const r2 = editForm(false);
  await pressButton(r2, 'Save changes');
  const e2 = r2.calls.edited[0]?.p.helpers?.[0];
  assert(
    '4.8',
    'a saved kid not on decide later is sent with decideLater as the boolean false',
    !!e2 && e2.decideLater === false && e2.personEventId === 'pe-josh',
    e2
  );
  const r3 = editForm(true);
  tick(r3, decideBox(r3), false);
  await pressButton(r3, 'Save changes');
  const e3 = r3.calls.edited[0]?.p.helpers?.[0];
  assert(
    '4.9',
    'turning the choice off on a saved kid sends the explicit false the server needs to see a settle',
    !!e3 && e3.decideLater === false && e3.adultRoled === false && e3.personEventId === 'pe-josh',
    e3
  );
  const r4 = editForm(undefined);
  assert(
    '4.10',
    'a saved household from before the change (no decideLater on the kid) reopens with the choice off',
    !!decideBox(r4) && decideBox(r4)?.props.checked === false && !rowText(r4).includes(W2('Josh'))
  );
  const r5 = editForm(true, {}, true);
  assert(
    '4.11',
    'a saved kid with the tick on and the marker true (cannot be saved so) reopens ticked, no choice offered',
    tickBox(r5)?.props.checked === true && !decideLabel(r5)
  );

  // ══ 4 — apiHouseholdToSaved ═════════════════════════════════════════════════
  section('4 — apiHouseholdToSaved rebuilds the choice from the stored marker');
  const toSaved = await (async () => {
    try {
      return loadApiHouseholdToSaved();
    } catch (err) {
      console.log(`    could not read the function: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  })();
  assert('4.12', 'apiHouseholdToSaved is read out of the setup page’s live source', !!toSaved);
  const helperOf = (m: any) => toSaved?.(household([m])).helpers?.[0];
  const hy = toSaved ? helperOf(member({ messagingUndecided: true })) : undefined;
  assert(
    '4.13',
    'a CHILD stored with the marker yes comes back with decideLater true and adultRoled false',
    !!hy && hy.decideLater === true && hy.adultRoled === false,
    hy
  );
  const hn = toSaved ? helperOf(member({ messagingUndecided: false })) : undefined;
  assert(
    '4.14',
    'a CHILD stored with the marker no comes back with decideLater false',
    !!hn && hn.decideLater === false && hn.adultRoled === false,
    hn
  );
  const hm = toSaved ? helperOf(member({})) : undefined;
  assert(
    '4.15',
    'a member with no marker in the response (an older answer) comes back with decideLater false',
    !!hm && hm.decideLater === false,
    hm
  );
  const hs = toSaved ? helperOf(member({ messagingUndecided: 'true' })) : undefined;
  assert(
    '4.16',
    'only the boolean true counts: the text "true" comes back false',
    !!hs && hs.decideLater === false,
    hs
  );
  const hg = toSaved
    ? helperOf(member({ householdRole: 'GUEST', isYoungPerson: true, messagingUndecided: true }))
    : undefined;
  assert(
    '4.17',
    'a ticked kid (stored GUEST) never reads as decide later, whatever the marker says',
    !!hg && hg.adultRoled === true && hg.decideLater === false,
    hg
  );

  // ══ 7 — A RESTORED DRAFT KEEPS THE MARKER ═══════════════════════════════════
  section('7 — the browser draft keeps the marker');
  const row = (over: Record<string, unknown> = {}) => ({
    name: 'Josh',
    email: 'josh@example.com',
    phone: '021 555 0199',
    adultRoled: false,
    ...over,
  });
  assert(
    '7.1',
    'a draft with the marker on a kid row, or without it (an old draft), is a state the form can put back',
    FormDraft.isDraftState(draftOf([row({ decideLater: true })])) &&
      FormDraft.isDraftState(draftOf([row({ decideLater: false })])) &&
      FormDraft.isDraftState(draftOf([row()]))
  );
  assert(
    '7.2',
    'a draft whose marker is not a boolean is refused, as a bad tick is',
    !FormDraft.isDraftState(draftOf([row({ decideLater: 'yes' })])) &&
      !FormDraft.isDraftState(draftOf([row({ decideLater: 1 })]))
  );
  const mem = new MemStore();
  FormDraft.writeDraft(mem, 'u1', 'ev-1', 'new', draftOf([row({ decideLater: true })]));
  const back = FormDraft.readDraft(mem, 'u1', 'ev-1', 'new');
  assert(
    '7.3',
    'written to the store and read back, the kid row still says decideLater true',
    (back?.state.helpers[0] as any)?.decideLater === true,
    back?.state.helpers[0]
  );

  const store1 = new MemStore();
  const w = mount({}, { viewerId: 'u1', store: store1 });
  type(w, primaryName(w), 'Kate Smith');
  await pressButton(w, 'Kid with a job');
  type(w, boxIn(w, "Kid's name"), 'Josh');
  type(w, boxIn(w, 'Email'), 'josh@example.com');
  tick(w, decideBox(w), true);
  const kept = FormDraft.readDraft(store1, 'u1', 'ev-1', 'new');
  assert(
    '7.4',
    'what is typed is kept in the draft with the kid on decide later (the draft says so)',
    (kept?.state.helpers[0] as any)?.decideLater === true && kept?.state.helpers[0].name === 'Josh',
    kept?.state.helpers
  );
  const w2 = mount({}, { viewerId: 'u1', store: store1 });
  assert(
    '7.5',
    'a form opened again on that draft puts the kid back on decide later, with W2 showing',
    kidRows(w2).length === 1 &&
      boxIn(w2, "Kid's name")?.props.value === 'Josh' &&
      decideBox(w2)?.props.checked === true &&
      rowText(w2).includes(W2('Josh')),
    { rows: kidRows(w2).length, checked: decideBox(w2)?.props.checked }
  );

  const store2 = new MemStore();
  FormDraft.writeDraft(store2, 'u1', 'ev-1', 'new', draftOf([row()]));
  const o1 = mount({}, { viewerId: 'u1', store: store2 });
  assert(
    '7.6',
    'an old draft (no marker on the kid) puts the kid back as a plain child: choice off, details kept',
    kidRows(o1).length === 1 &&
      !!decideBox(o1) &&
      decideBox(o1)?.props.checked === false &&
      boxIn(o1, 'Email')?.props.value === 'josh@example.com' &&
      !rowText(o1).includes(W2('Josh'))
  );
  const store3 = new MemStore();
  FormDraft.writeDraft(
    store3,
    'u1',
    'ev-1',
    'new',
    draftOf([row({ adultRoled: true, decideLater: true })])
  );
  const o2 = mount({}, { viewerId: 'u1', store: store3 });
  assert(
    '7.7',
    'a draft with the tick on and the marker on puts the kid back ticked and not on decide later',
    kidRows(o2).length === 1 && tickBox(o2)?.props.checked === true && !decideLabel(o2),
    { rows: kidRows(o2).length }
  );
  tick(o2, tickBox(o2), false);
  assert(
    '7.8',
    'and unticking that kid shows the choice off (the marker did not come back with the tick)',
    !!decideBox(o2) && decideBox(o2)?.props.checked === false
  );

  const store4 = new MemStore();
  FormDraft.writeDraft(
    store4,
    'u1',
    'ev-1',
    'edit:hh-1',
    draftOf([row({ personEventId: 'pe-josh', decideLater: true })], {
      email: 'kate@example.com',
      phone: '021 123 4567',
    }),
    'Kate Smith'
  );
  const oe = editForm(false, { viewerId: 'u1', store: store4 });
  assert(
    '7.9',
    'a saved household’s draft that differs ONLY by the marker is put back (the marker counts as a change)',
    decideBox(oe)?.props.checked === true &&
      FormDraft.readDraft(store4, 'u1', 'ev-1', 'edit:hh-1') !== null,
    { checked: decideBox(oe)?.props.checked }
  );

  const lv = editForm(false);
  const prevented = (): boolean => {
    let x = false;
    for (const fn of listeners['beforeunload'] ?? []) fn({ preventDefault: () => (x = true) });
    return x;
  };
  const untouched = prevented();
  tick(lv, decideBox(lv), true);
  assert(
    '7.10',
    'leaving with only the marker changed asks "Leave site?"; leaving with nothing changed does not',
    untouched === false && prevented() === true,
    { untouched, changed: prevented() }
  );

  // ══ 16 — THE CONTACT PICKER ═════════════════════════════════════════════════
  section('16 — a kid on decide later is not offered as the household’s channel');
  const choices = moment1ChannelChoices({
    householdId: 'hh-1',
    partner: null,
    helpers: [
      { personEventId: 'pe-a', name: 'Josh', adultRoled: false, decideLater: true },
      { personEventId: 'pe-b', name: 'Tia', adultRoled: true },
    ] as any,
    guests: [],
    picked: null,
    candidates: [],
  });
  assert(
    '16.7',
    'the picker offers the ticked kid and not the kid on decide later (the tick is off)',
    choices.length === 1 && choices[0].personEventId === 'pe-b',
    choices
  );

  // ══ 11 (SECOND PART) — TURNING THE CHOICE OFF EMPTIES THE BOXES ═════════════
  section('11 — turning Decide later off on a row SAVED as decide later empties its boxes');
  const emailOf = (i: Inst, n = 0) => boxIn(i, 'Email', n)?.props.value;
  const phoneOf = (i: Inst, n = 0) => boxIn(i, 'Phone', n)?.props.value;
  const nameOf = (i: Inst, n = 0) => boxIn(i, "Kid's name", n)?.props.value;
  const rowAt = (i: Inst, name: string) => [0, 1, 2].find((n) => nameOf(i, n) === name);
  const JOSH = { email: 'josh@example.com', phone: '021 555 0199' };
  /** A saved household as the page hands it to the form, with the kids as given. */
  const savedKids = (
    kids: Array<{
      id?: string;
      name: string;
      email?: string;
      phone?: string;
      decideLater?: boolean;
    }>
  ): any => ({
    ...saved(true),
    helpers: kids.map((k) => ({
      ...(k.id ? { personEventId: k.id } : {}),
      name: k.name,
      email: k.email,
      phone: k.phone,
      adultRoled: false,
      ...(k.decideLater === undefined ? {} : { decideLater: k.decideLater }),
    })),
  });
  let cancels = 0;
  const mountSaved = (hh: any, opts: Parameters<typeof mount>[1] = {}) =>
    mount({ editingHousehold: hh, onCancelEdit: () => void cancels++ }, opts);

  const b1 = editForm(true);
  const before1 = JSON.stringify(b1.f.props.editingHousehold);
  const fetchB1 = fetchCalls;
  tick(b1, decideBox(b1), false);
  assert(
    '11.12',
    'a kid saved as decide later, tick off: turning the choice off empties the email and phone boxes at once; the name stays, the choice is off, W2 and W3 are gone',
    decideBox(b1)?.props.checked === false &&
      emailOf(b1) === '' &&
      phoneOf(b1) === '' &&
      nameOf(b1) === 'Josh' &&
      !rowText(b1).includes(W2('Josh')) &&
      !rowText(b1).includes(W3('Josh')),
    { checked: decideBox(b1)?.props.checked, email: emailOf(b1), phone: phoneOf(b1) }
  );
  const b2 = mount({
    editingHousehold: { ...saved(true), isHostHousehold: true },
    onCancelEdit() {},
  });
  tick(b2, decideBox(b2), false);
  assert(
    '11.13',
    'the same on her own household’s edit (it settles through the same Save changes, C11)',
    emailOf(b2) === '' && phoneOf(b2) === '' && nameOf(b2) === 'Josh',
    { email: emailOf(b2), phone: phoneOf(b2) }
  );

  const nv1 = editForm(false);
  tick(nv1, decideBox(nv1), true);
  tick(nv1, decideBox(nv1), false);
  const nv2 = editForm(undefined);
  tick(nv2, decideBox(nv2), true);
  tick(nv2, decideBox(nv2), false);
  assert(
    '11.14',
    'a saved kid NOT saved as decide later (the choice off, or saved before this change): choosing and un-choosing in one sitting empties nothing (ruling 26)',
    emailOf(nv1) === JOSH.email &&
      phoneOf(nv1) === JOSH.phone &&
      emailOf(nv2) === JOSH.email &&
      phoneOf(nv2) === JOSH.phone,
    { a: [emailOf(nv1), phoneOf(nv1)], b: [emailOf(nv2), phoneOf(nv2)] }
  );

  const np = mountSaved(savedKids([{ name: 'Josh', ...JOSH, decideLater: true }]));
  tick(np, decideBox(np), false);
  assert(
    '11.15',
    'a saved decide-later kid whose row has no personEventId is not blanked (ruling 26: matched by personEventId)',
    emailOf(np) === JOSH.email && phoneOf(np) === JOSH.phone,
    { email: emailOf(np), phone: phoneOf(np) }
  );

  const nw = await formWithKid('Josh');
  type(nw, boxIn(nw, 'Email'), JOSH.email);
  type(nw, boxIn(nw, 'Phone'), JOSH.phone);
  tick(nw, decideBox(nw), true);
  tick(nw, decideBox(nw), false);
  assert(
    '11.16',
    'a new household’s kid row: choosing and un-choosing empties nothing (a row never saved as decide later)',
    emailOf(nw) === JOSH.email && phoneOf(nw) === JOSH.phone,
    { email: emailOf(nw), phone: phoneOf(nw) }
  );

  // By personEventId, not by name or place: a NEW row typed with the same name as the saved
  // decide-later kid is a different row and is not blanked; the saved one is.
  const sm = editForm(true);
  await pressButton(sm, 'Kid with a job');
  const newIdx = [0, 1].find((n) => nameOf(sm, n) === '');
  type(sm, boxIn(sm, "Kid's name", newIdx ?? 0), 'Josh');
  type(sm, boxIn(sm, 'Email', newIdx ?? 0), 'other@example.com');
  type(sm, boxIn(sm, 'Phone', newIdx ?? 0), '021 555 0111');
  tick(sm, decideBox(sm, newIdx ?? 0), true);
  tick(sm, decideBox(sm, newIdx ?? 0), false);
  const newRowKept = emailOf(sm, newIdx ?? 0) === 'other@example.com';
  const oldIdx = newIdx === 0 ? 1 : 0;
  tick(sm, decideBox(sm, oldIdx), false);
  assert(
    '11.17',
    'a new row typed in the same sitting with the SAME NAME as the saved decide-later kid is not blanked; the saved one (by personEventId) is',
    newIdx !== undefined &&
      newRowKept &&
      emailOf(sm, newIdx) === 'other@example.com' &&
      phoneOf(sm, newIdx) === '021 555 0111' &&
      emailOf(sm, oldIdx) === '' &&
      phoneOf(sm, oldIdx) === '',
    { newIdx, newRow: [emailOf(sm, newIdx ?? 0), phoneOf(sm, newIdx ?? 0)] }
  );

  const two = mountSaved(
    savedKids([
      { id: 'pe-josh', name: 'Josh', ...JOSH, decideLater: true },
      {
        id: 'pe-tia',
        name: 'Tia',
        email: 'tia@example.com',
        phone: '021 555 0188',
        decideLater: false,
      },
    ])
  );
  const tiaAt = rowAt(two, 'Tia');
  const joshAt = rowAt(two, 'Josh');
  tick(two, decideBox(two, tiaAt ?? 0), true);
  tick(two, decideBox(two, tiaAt ?? 0), false);
  const tiaIntact =
    emailOf(two, tiaAt ?? 0) === 'tia@example.com' && phoneOf(two, tiaAt ?? 0) === '021 555 0188';
  const joshStill =
    emailOf(two, joshAt ?? 0) === JOSH.email && decideBox(two, joshAt ?? 0)?.props.checked === true;
  tick(two, decideBox(two, joshAt ?? 0), false);
  assert(
    '11.18',
    'two saved kids: only the one saved as decide later is blanked, and only when its own choice is turned off; the other keeps its details',
    tiaAt !== undefined &&
      joshAt !== undefined &&
      tiaIntact &&
      joshStill &&
      emailOf(two, joshAt) === '' &&
      phoneOf(two, joshAt) === '' &&
      emailOf(two, tiaAt) === 'tia@example.com' &&
      phoneOf(two, tiaAt) === '021 555 0188',
    { tiaAt, joshAt, tiaIntact, joshStill }
  );

  const tk = editForm(true);
  tick(tk, tickBox(tk), true);
  assert(
    '11.19',
    'a kid saved as decide later, settled to "message" with the tick: the email and phone are kept (they are the adult’s now), the tick is on, the choice is gone',
    tickBox(tk)?.props.checked === true &&
      !decideLabel(tk) &&
      emailOf(tk) === JOSH.email &&
      phoneOf(tk) === JOSH.phone,
    { email: emailOf(tk), phone: phoneOf(tk) }
  );

  assert(
    '11.20',
    'nothing is stored until Save: after the boxes are emptied no save ran, the form called no fetch, and the saved household it was given is exactly as it was',
    b1.calls.edited.length === 0 &&
      b1.calls.added.length === 0 &&
      b1.calls.hosted.length === 0 &&
      fetchCalls === fetchB1 &&
      JSON.stringify(b1.f.props.editingHousehold) === before1
  );

  await pressButton(b1, 'Save changes');
  const sent1 = b1.calls.edited[0]?.p;
  const kid1 = sent1?.helpers?.[0];
  assert(
    '11.21',
    'Save then sends the settle the server reads: the same kid (personEventId), decideLater false, tick off, and no email and no phone',
    b1.calls.edited.length === 1 &&
      kid1?.personEventId === 'pe-josh' &&
      kid1.decideLater === false &&
      kid1.adultRoled === false &&
      kid1.email === undefined &&
      kid1.phone === undefined &&
      sent1.primaryContact.email === 'kate@example.com',
    kid1
  );

  const un = editForm(true);
  await pressButton(un, 'Save changes');
  const kidUn = un.calls.edited[0]?.p.helpers?.[0];
  assert(
    '11.22',
    'a decide-later kid saved again unchanged keeps both details in the request and stays decideLater true (ruling 17)',
    !!kidUn &&
      kidUn.decideLater === true &&
      kidUn.email === JOSH.email &&
      kidUn.phone === JOSH.phone,
    kidUn
  );

  const cc = mountSaved(saved(true));
  const ccBefore = JSON.stringify(cc.f.props.editingHousehold);
  const cancelsBefore = cancels;
  tick(cc, decideBox(cc), false);
  await pressButton(cc, 'Cancel');
  const again = mountSaved(cc.f.props.editingHousehold);
  assert(
    '11.23',
    'empty the boxes, then Cancel: the page is told, nothing was saved or fetched, the saved household is exactly as it was, and opening it again shows the stored details with the choice on',
    cancels === cancelsBefore + 1 &&
      cc.calls.edited.length === 0 &&
      JSON.stringify(cc.f.props.editingHousehold) === ccBefore &&
      emailOf(again) === JOSH.email &&
      phoneOf(again) === JOSH.phone &&
      decideBox(again)?.props.checked === true,
    {
      cancels: cancels - cancelsBefore,
      email: emailOf(again),
      checked: decideBox(again)?.props.checked,
    }
  );

  const dStore = new MemStore();
  const d1 = editForm(true, { viewerId: 'u1', store: dStore });
  tick(d1, decideBox(d1), false);
  const draftKept = FormDraft.readDraft(dStore, 'u1', 'ev-1', 'edit:hh-1');
  const d2 = editForm(true, { viewerId: 'u1', store: dStore });
  const reopenedBlank =
    emailOf(d2) === '' && phoneOf(d2) === '' && decideBox(d2)?.props.checked === false;
  await pressButton(d2, 'Discard');
  assert(
    '11.24',
    'empty the boxes and leave: the kept draft holds them empty; open it again and press Discard: the stored email and phone and the choice come back, and the draft is gone',
    draftKept !== null &&
      reopenedBlank &&
      emailOf(d2) === JOSH.email &&
      phoneOf(d2) === JOSH.phone &&
      decideBox(d2)?.props.checked === true &&
      FormDraft.readDraft(dStore, 'u1', 'ev-1', 'edit:hh-1') === null,
    {
      draftKept: draftKept !== null,
      reopenedBlank,
      email: emailOf(d2),
      checked: decideBox(d2)?.props.checked,
    }
  );

  const rStore = new MemStore();
  FormDraft.writeDraft(
    rStore,
    'u1',
    'ev-1',
    'edit:hh-1',
    draftOf([row({ personEventId: 'pe-josh', decideLater: true })], {
      name: 'Kate Smith-Jones',
      email: 'kate@example.com',
      phone: '021 123 4567',
    }),
    'Kate Smith'
  );
  const rf = editForm(true, { viewerId: 'u1', store: rStore });
  const draftBack = primaryName(rf)?.props.value === 'Kate Smith-Jones';
  tick(rf, decideBox(rf), false);
  assert(
    '11.25',
    'a household put back from a kept draft still knows the kid was saved as decide later: turning the choice off there empties the boxes too',
    draftBack && emailOf(rf) === '' && phoneOf(rf) === '',
    { draftBack, email: emailOf(rf), phone: phoneOf(rf) }
  );

  // An error shown under a box (a bad address or number) must not stay under a box that has just
  // been emptied: the emptied boxes are blank and valid, so the fix-it text goes with them.
  const er = editForm(true);
  type(er, boxIn(er, 'Email'), 'not-an-email');
  type(er, boxIn(er, 'Phone'), 'abc');
  boxIn(er, 'Email')?.props.onBlur();
  boxIn(er, 'Phone')?.props.onBlur();
  settle(er.f);
  const errorsShown =
    rowText(er).includes('Invalid email format') && rowText(er).includes('Invalid NZ phone number');
  tick(er, decideBox(er), false);
  assert(
    '11.26',
    'a bad address or number showing under the boxes is cleared with them when the choice is turned off: no error text, no aria-invalid',
    errorsShown &&
      !rowText(er).includes('Invalid email format') &&
      !rowText(er).includes('Invalid NZ phone number') &&
      boxIn(er, 'Email')?.props['aria-invalid'] === undefined &&
      boxIn(er, 'Phone')?.props['aria-invalid'] === undefined,
    { errorsShown, row: rowText(er).slice(0, 200) }
  );

  // ══ 11 (ruling 108) — TICKED, THEN UNTICKED, IS ALSO "DON'T MESSAGE" ════════
  // A kid SAVED as decide later whose message box is ticked and then unticked has been settled to
  // "don't message" by that route as surely as by turning Decide later off, so the same boxes are
  // emptied, at the moment of unticking. Ticking itself keeps the details (the adult's now).
  section('11 — ruling 108: a saved decide-later kid, ticked then unticked, is emptied too');
  const t1 = editForm(true);
  const t1Before = JSON.stringify(t1.f.props.editingHousehold);
  const fetchT1 = fetchCalls;
  tick(t1, tickBox(t1), true);
  const keptWhileTicked =
    tickBox(t1)?.props.checked === true && emailOf(t1) === JOSH.email && phoneOf(t1) === JOSH.phone;
  tick(t1, tickBox(t1), false);
  assert(
    '11.27',
    'a kid saved as decide later: ticking keeps the boxes, then unticking empties the email and phone at once; the tick is off, the choice is offered but not on, the name stays, W2 and W3 are not shown',
    keptWhileTicked &&
      tickBox(t1)?.props.checked === false &&
      emailOf(t1) === '' &&
      phoneOf(t1) === '' &&
      nameOf(t1) === 'Josh' &&
      !!decideBox(t1) &&
      decideBox(t1)?.props.checked === false &&
      !rowText(t1).includes(W2('Josh')) &&
      !rowText(t1).includes(W3('Josh')),
    { keptWhileTicked, email: emailOf(t1), phone: phoneOf(t1), tick: tickBox(t1)?.props.checked }
  );
  const t2 = mount({
    editingHousehold: { ...saved(true), isHostHousehold: true },
    onCancelEdit() {},
  });
  tick(t2, tickBox(t2), true);
  tick(t2, tickBox(t2), false);
  assert(
    '11.28',
    'the same on her own household’s edit',
    emailOf(t2) === '' && phoneOf(t2) === '' && nameOf(t2) === 'Josh',
    { email: emailOf(t2), phone: phoneOf(t2) }
  );

  // Never for any other row: not saved as decide later (choice off, or saved before this change),
  // a decide-later row with no personEventId, a new row typed with the saved kid's name, and a new
  // household's row.
  const nsA = editForm(false);
  const nsB = editForm(undefined);
  const nsC = mountSaved(savedKids([{ name: 'Josh', ...JOSH, decideLater: true }]));
  for (const x of [nsA, nsB, nsC]) {
    tick(x, tickBox(x), true);
    tick(x, tickBox(x), false);
  }
  const nsD = editForm(true);
  await pressButton(nsD, 'Kid with a job');
  const nsDidx = [0, 1].find((n) => nameOf(nsD, n) === '');
  type(nsD, boxIn(nsD, "Kid's name", nsDidx ?? 0), 'Josh');
  type(nsD, boxIn(nsD, 'Email', nsDidx ?? 0), 'other@example.com');
  type(nsD, boxIn(nsD, 'Phone', nsDidx ?? 0), '021 555 0111');
  tick(nsD, tickBox(nsD, nsDidx ?? 0), true);
  tick(nsD, tickBox(nsD, nsDidx ?? 0), false);
  const nsE = await formWithKid('Josh');
  type(nsE, boxIn(nsE, 'Email'), JOSH.email);
  type(nsE, boxIn(nsE, 'Phone'), JOSH.phone);
  tick(nsE, tickBox(nsE), true);
  tick(nsE, tickBox(nsE), false);
  assert(
    '11.29',
    'ticked then unticked empties nothing on any other row: not saved as decide later (choice off, or no marker), no personEventId, a new row with the same name as the saved kid, a new household’s row',
    emailOf(nsA) === JOSH.email &&
      phoneOf(nsA) === JOSH.phone &&
      emailOf(nsB) === JOSH.email &&
      phoneOf(nsB) === JOSH.phone &&
      emailOf(nsC) === JOSH.email &&
      phoneOf(nsC) === JOSH.phone &&
      nsDidx !== undefined &&
      emailOf(nsD, nsDidx) === 'other@example.com' &&
      phoneOf(nsD, nsDidx) === '021 555 0111' &&
      emailOf(nsE) === JOSH.email &&
      phoneOf(nsE) === JOSH.phone,
    {
      a: [emailOf(nsA), phoneOf(nsA)],
      b: [emailOf(nsB), phoneOf(nsB)],
      c: [emailOf(nsC), phoneOf(nsC)],
      d: [emailOf(nsD, nsDidx ?? 0), phoneOf(nsD, nsDidx ?? 0)],
      e: [emailOf(nsE), phoneOf(nsE)],
    }
  );

  const tw = mountSaved(
    savedKids([
      { id: 'pe-josh', name: 'Josh', ...JOSH, decideLater: true },
      {
        id: 'pe-tia',
        name: 'Tia',
        email: 'tia@example.com',
        phone: '021 555 0188',
        decideLater: false,
      },
    ])
  );
  const twTia = rowAt(tw, 'Tia');
  const twJosh = rowAt(tw, 'Josh');
  tick(tw, tickBox(tw, twTia ?? 0), true);
  tick(tw, tickBox(tw, twTia ?? 0), false);
  const twTiaKept =
    emailOf(tw, twTia ?? 0) === 'tia@example.com' && phoneOf(tw, twTia ?? 0) === '021 555 0188';
  const twJoshKept =
    emailOf(tw, twJosh ?? 0) === JOSH.email && phoneOf(tw, twJosh ?? 0) === JOSH.phone;
  tick(tw, tickBox(tw, twJosh ?? 0), true);
  tick(tw, tickBox(tw, twJosh ?? 0), false);
  assert(
    '11.30',
    'two saved kids: ticking and unticking the plain one empties nothing, and the decide-later one is emptied only by its own tick and untick; the other keeps its details',
    twTia !== undefined &&
      twJosh !== undefined &&
      twTiaKept &&
      twJoshKept &&
      emailOf(tw, twJosh) === '' &&
      phoneOf(tw, twJosh) === '' &&
      emailOf(tw, twTia) === 'tia@example.com' &&
      phoneOf(tw, twTia) === '021 555 0188',
    { twTia, twJosh, twTiaKept, twJoshKept }
  );

  assert(
    '11.31',
    'nothing is stored by the tick and untick: no save ran, the form called no fetch, the saved household it was given is exactly as it was',
    t1.calls.edited.length === 0 &&
      t1.calls.added.length === 0 &&
      t1.calls.hosted.length === 0 &&
      fetchCalls === fetchT1 &&
      JSON.stringify(t1.f.props.editingHousehold) === t1Before
  );
  await pressButton(t1, 'Save changes');
  const kidT1 = t1.calls.edited[0]?.p.helpers?.[0];
  assert(
    '11.32',
    'Save then sends the same settle as turning the choice off: the same kid (personEventId), decideLater false, tick off, and no email and no phone',
    t1.calls.edited.length === 1 &&
      kidT1?.personEventId === 'pe-josh' &&
      kidT1.decideLater === false &&
      kidT1.adultRoled === false &&
      kidT1.email === undefined &&
      kidT1.phone === undefined,
    kidT1
  );

  // Cancel and Discard put the stored details back, as they do for turning the choice off.
  const tc = mountSaved(saved(true));
  const tcBefore = JSON.stringify(tc.f.props.editingHousehold);
  const tcCancels = cancels;
  tick(tc, tickBox(tc), true);
  tick(tc, tickBox(tc), false);
  await pressButton(tc, 'Cancel');
  const tcAgain = mountSaved(tc.f.props.editingHousehold);
  const tStore = new MemStore();
  const td1 = editForm(true, { viewerId: 'u1', store: tStore });
  tick(td1, tickBox(td1), true);
  tick(td1, tickBox(td1), false);
  const td2 = editForm(true, { viewerId: 'u1', store: tStore });
  const tdBlank =
    emailOf(td2) === '' && phoneOf(td2) === '' && decideBox(td2)?.props.checked === false;
  await pressButton(td2, 'Discard');
  assert(
    '11.33',
    'after ticking and unticking: Cancel leaves the stored household as it was and opening it again shows the stored details with the choice on; a kept draft holds them empty, and Discard brings the stored details and the choice back',
    cancels === tcCancels + 1 &&
      tc.calls.edited.length === 0 &&
      JSON.stringify(tc.f.props.editingHousehold) === tcBefore &&
      emailOf(tcAgain) === JOSH.email &&
      phoneOf(tcAgain) === JOSH.phone &&
      decideBox(tcAgain)?.props.checked === true &&
      tdBlank &&
      emailOf(td2) === JOSH.email &&
      phoneOf(td2) === JOSH.phone &&
      decideBox(td2)?.props.checked === true &&
      FormDraft.readDraft(tStore, 'u1', 'ev-1', 'edit:hh-1') === null,
    { cancelled: cancels - tcCancels, again: emailOf(tcAgain), tdBlank, discard: emailOf(td2) }
  );

  const te = editForm(true);
  type(te, boxIn(te, 'Email'), 'not-an-email');
  type(te, boxIn(te, 'Phone'), 'abc');
  boxIn(te, 'Email')?.props.onBlur();
  boxIn(te, 'Phone')?.props.onBlur();
  settle(te.f);
  const teShown =
    rowText(te).includes('Invalid email format') && rowText(te).includes('Invalid NZ phone number');
  tick(te, tickBox(te), true);
  tick(te, tickBox(te), false);
  assert(
    '11.34',
    'a bad address or number showing under the boxes is cleared with them when the tick is taken off again: no error text, no aria-invalid',
    teShown &&
      !rowText(te).includes('Invalid email format') &&
      !rowText(te).includes('Invalid NZ phone number') &&
      boxIn(te, 'Email')?.props['aria-invalid'] === undefined &&
      boxIn(te, 'Phone')?.props['aria-invalid'] === undefined,
    { teShown, row: rowText(te).slice(0, 200) }
  );

  const tm = editForm(true);
  tick(tm, tickBox(tm), true);
  await pressButton(tm, 'Save changes');
  const kidTm = tm.calls.edited[0]?.p.helpers?.[0];
  assert(
    '11.35',
    'ticked and left ticked (settled to "message"): Save sends the adult with both details as stored and decideLater false',
    !!kidTm &&
      kidTm.adultRoled === true &&
      kidTm.decideLater === false &&
      kidTm.email === JOSH.email &&
      kidTm.phone === JOSH.phone,
    kidTm
  );

  // ══ 18 — THE PAGE: W9 AFTER A REFUSED CLEAR ═════════════════════════════════
  section('18 — the setup page: after a refused clear the saved card carries W9');
  let keptRule: ((b: any, s: any, a: any) => string[]) | null = null;
  try {
    keptRule = loadKeptEmailNames();
  } catch (err) {
    console.log(`    could not read keptEmailNames: ${(err as Error).message.split('\n')[0]}`);
  }
  assert(
    '18.10',
    'the setup page has a module-level keptEmailNames, the pure rule for which kids’ emails were kept',
    typeof keptRule === 'function'
  );

  /** The page's real handleEditSave, run with the answer the server would give. */
  async function saveEdit(opts: { list: any[]; sent: any; answer: any }) {
    let list = opts.list;
    let editing: unknown = 'untouched';
    let jumps = 0;
    let run: ReturnType<typeof loadHandleEditSave> = null;
    try {
      run = loadHandleEditSave({
        event: { id: 'ev-1' },
        fetch: async () => ({ ok: true, json: async () => ({ household: opts.answer }) }),
        apiHouseholdToSaved: toSaved,
        households: opts.list,
        setHouseholds: (u: any) => void (list = typeof u === 'function' ? u(list) : u),
        setEditingHousehold: (v: unknown) => void (editing = v),
        jumpMoment1ToTop: () => void jumps++,
        keptEmailNames: keptRule ?? undefined,
      });
    } catch (err) {
      console.log(`    could not read handleEditSave: ${(err as Error).message.split('\n')[0]}`);
    }
    if (!run) return null;
    await run('hh-1', opts.sent);
    return { list, editing, jumps };
  }
  const apiKid = (
    id: string,
    name: string,
    email: string | null,
    undecided: boolean,
    role = 'CHILD'
  ) =>
    member({
      id,
      householdRole: role,
      messagingUndecided: undecided,
      person: { id: `p-${name.toLowerCase()}`, name, email, phoneNumber: null },
    });
  const listWith = (...kids: any[]): any[] => [toSaved!(household(kids))];
  const notesOf = (r: Awaited<ReturnType<typeof saveEdit>>) => r?.list?.[0]?.keptEmailNames;
  const none = (n: unknown) => !Array.isArray(n) || n.length === 0;

  // The request is what the REAL form sends (the form half and the page half meet here).
  const fSettle = editForm(true);
  tick(fSettle, decideBox(fSettle), false);
  await pressButton(fSettle, 'Save changes');
  const settleSent = fSettle.calls.edited[0]?.p;

  const refused = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: settleSent,
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false)]),
      })
    : null;
  assert(
    '18.11',
    'a refused clear (a decide-later kid settled, the email sent blank, the answer still holds the email): the saved household carries one note, naming Josh',
    JSON.stringify(notesOf(refused)) === JSON.stringify(['Josh']),
    notesOf(refused)
  );
  assert(
    '18.12',
    'the save still does what it did: the household in the list is the saved one, the form is closed, and the page jumps to the top once',
    !!refused &&
      refused.list.length === 1 &&
      refused.list[0].id === 'hh-1' &&
      refused.list[0].helpers[0]?.decideLater === false &&
      refused.editing === null &&
      refused.jumps === 1,
    refused && { editing: refused.editing, jumps: refused.jumps }
  );

  const cleared = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: settleSent,
        answer: household([apiKid('pe-josh', 'Josh', null, false)]),
      })
    : null;
  assert(
    '18.13',
    'a settle that cleared the email (the answer’s email is blank): no note',
    !!cleared && none(notesOf(cleared)),
    notesOf(cleared)
  );

  const fPlain = editForm(false);
  type(fPlain, boxIn(fPlain, 'Email'), '');
  await pressButton(fPlain, 'Save changes');
  const plainSent = fPlain.calls.edited[0]?.p;
  const plainCleared = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, false)),
        sent: plainSent,
        answer: household([apiKid('pe-josh', 'Josh', null, false)]),
      })
    : null;
  const plainEvenIfKept = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, false)),
        sent: plainSent,
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false)]),
      })
    : null;
  assert(
    '18.14',
    'an ordinary clear (a plain kid, never on decide later): no note, even if the answer still held the email (only a settle is a refusal)',
    !!plainCleared &&
      !!plainEvenIfKept &&
      none(notesOf(plainCleared)) &&
      none(notesOf(plainEvenIfKept)),
    { cleared: notesOf(plainCleared), kept: notesOf(plainEvenIfKept) }
  );

  const fTyped = editForm(true);
  tick(fTyped, decideBox(fTyped), false);
  type(fTyped, boxIn(fTyped, 'Email'), 'new@example.com');
  await pressButton(fTyped, 'Save changes');
  const typedNew = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: fTyped.calls.edited[0]?.p,
        answer: household([apiKid('pe-josh', 'Josh', 'new@example.com', false)]),
      })
    : null;
  assert(
    '18.15',
    'a settle with a new email typed (the email was not sent blank): no note, the email is as sent',
    !!typedNew && none(notesOf(typedNew)),
    notesOf(typedNew)
  );

  const fTick = editForm(true);
  tick(fTick, tickBox(fTick), true);
  await pressButton(fTick, 'Save changes');
  const tickSent = fTick.calls.edited[0]?.p;
  const tickBlank = tickSent && {
    ...tickSent,
    helpers: tickSent.helpers.map((h: any) => ({ ...h, email: undefined })),
  };
  const ticked = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: tickBlank,
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false, 'GUEST')]),
      })
    : null;
  assert(
    '18.16',
    'settled to "message" (the tick on) with the email blank and the answer holding one: not a settle to "don’t message", so no note',
    !!ticked && tickBlank?.helpers[0].adultRoled === true && none(notesOf(ticked)),
    notesOf(ticked)
  );

  const noId = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: {
          ...settleSent,
          helpers: settleSent.helpers.map((h: any) => ({ ...h, personEventId: undefined })),
        },
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false)]),
      })
    : null;
  assert(
    '18.17',
    'a kid row sent with no personEventId is not a settle (ruling 26): no note',
    !!noId && none(notesOf(noId)),
    notesOf(noId)
  );

  const withMarker = (v: unknown) => ({
    ...settleSent,
    helpers: settleSent.helpers.map((h: any) => {
      const { decideLater: _drop, ...rest } = h;
      return v === 'omit' ? rest : { ...rest, decideLater: v };
    }),
  });
  const staleTab = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: withMarker('omit'),
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false)]),
      })
    : null;
  const stillLater = toSaved
    ? await saveEdit({
        list: listWith(apiKid('pe-josh', 'Josh', JOSH.email, true)),
        sent: withMarker(true),
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, true)]),
      })
    : null;
  assert(
    '18.24',
    'a request that leaves the marker out (an old tab), or keeps it true, is not a settle (ruling 20 and the server’s rule): no note either way',
    !!staleTab && !!stillLater && none(notesOf(staleTab)) && none(notesOf(stillLater)),
    { stale: notesOf(staleTab), later: notesOf(stillLater) }
  );

  const fTwo = mountSaved(
    savedKids([
      { id: 'pe-josh', name: 'Josh', ...JOSH, decideLater: true },
      {
        id: 'pe-tia',
        name: 'Tia',
        email: 'tia@example.com',
        phone: '021 555 0188',
        decideLater: true,
      },
    ])
  );
  tick(fTwo, decideBox(fTwo, rowAt(fTwo, 'Josh') ?? 0), false);
  tick(fTwo, decideBox(fTwo, rowAt(fTwo, 'Tia') ?? 0), false);
  await pressButton(fTwo, 'Save changes');
  const twoSent = fTwo.calls.edited[0]?.p;
  const twoRefused = toSaved
    ? await saveEdit({
        list: listWith(
          apiKid('pe-josh', 'Josh', JOSH.email, true),
          apiKid('pe-tia', 'Tia', 'tia@example.com', true)
        ),
        sent: twoSent,
        answer: household([
          apiKid('pe-josh', 'Josh', JOSH.email, false),
          apiKid('pe-tia', 'Tia', 'tia@example.com', false),
        ]),
      })
    : null;
  assert(
    '18.18',
    'two kids settled and both emails kept: a note for each, in the order of the household, each naming its own kid',
    JSON.stringify(notesOf(twoRefused)) === JSON.stringify(['Josh', 'Tia']) ||
      JSON.stringify(notesOf(twoRefused)) === JSON.stringify(['Tia', 'Josh']),
    notesOf(twoRefused)
  );

  const otherHh = toSaved
    ? { ...toSaved(household([apiKid('pe-ann', 'Ann', 'ann@example.com', true)])), id: 'hh-9' }
    : null;
  const withOther = toSaved
    ? await saveEdit({
        list: [otherHh, ...listWith(apiKid('pe-josh', 'Josh', JOSH.email, true))],
        sent: settleSent,
        answer: household([apiKid('pe-josh', 'Josh', JOSH.email, false)]),
      })
    : null;
  assert(
    '18.19',
    'only the household that was saved changes: another household in the list is the very same object, with no note',
    !!withOther &&
      withOther.list[0] === otherHh &&
      withOther.list[0].keptEmailNames === undefined &&
      JSON.stringify(withOther.list[1]?.keptEmailNames) === JSON.stringify(['Josh']),
    withOther && withOther.list.map((h: any) => [h.id, h.keptEmailNames])
  );

  // ── The card: W9 on it, once, quiet, with no button ────────────────────────
  const markup = (hs: any[]) =>
    renderToStaticMarkup(
      ReactAll.createElement(HouseholdCardList as any, { households: hs, onEdit: () => {} })
    );
  const markupText = (html: string) =>
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  const notes = (html: string) =>
    [...html.matchAll(/<p[^>]*data-kept-email-note[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);

  const cardKept = markup(refused?.list ?? []);
  const cardKeptText = markupText(cardKept);
  assert(
    '18.20',
    'the saved card shows W9 exactly as ruled, once, naming Josh, as one quiet line with no button or link inside it',
    count(cardKeptText, W9('Josh')) === 1 &&
      notes(cardKept).length === 1 &&
      notes(cardKept).every((n) => !/<(button|a|input)\b/.test(n)) &&
      cardKeptText.includes('Edit'),
    { notes: notes(cardKept) }
  );
  const cardAfterClear = markupText(markup(cleared?.list ?? []));
  const cardAfterOrdinary = markupText(markup(plainCleared?.list ?? []));
  const cardNever = markupText(markup(listWith(apiKid('pe-josh', 'Josh', JOSH.email, true))));
  assert(
    '18.21',
    'W9 is not on the card after a settle that cleared the email, after an ordinary clear, or on a household that never had a refusal',
    !!cleared &&
      !!plainCleared &&
      !cardAfterClear.includes('We kept') &&
      !cardAfterOrdinary.includes('We kept') &&
      !cardNever.includes('We kept'),
    { cardAfterClear, cardNever }
  );
  const cardTwo = markupText(markup(twoRefused?.list ?? []));
  assert(
    '18.22',
    'two refusals on one household: W9 once for each kid, each with its own name',
    count(cardTwo, W9('Josh')) === 1 && count(cardTwo, W9('Tia')) === 1,
    cardTwo
  );

  // ── Until she next opens the household (the page's effect on `editingHousehold`) ─────────
  let held: any[] = [];
  const noted = (): any[] =>
    toSaved
      ? [
          {
            ...toSaved(household([apiKid('pe-josh', 'Josh', JOSH.email, false)])),
            keptEmailNames: ['Josh'],
          },
          { ...otherHh, keptEmailNames: ['Ann'] },
        ]
      : [];
  const runOpen = (editingHousehold: unknown) => {
    let effect: ReturnType<typeof loadKeptNoteEffect> = null;
    try {
      effect = loadKeptNoteEffect({
        editingHousehold,
        setHouseholds: (u: any) => void (held = typeof u === 'function' ? u(held) : u),
      });
    } catch (err) {
      console.log(`    could not run the effect: ${(err as Error).message.split('\n')[0]}`);
    }
    effect?.();
    return effect;
  };
  held = noted();
  const heldAtStart = held;
  const eNone = runOpen(null);
  const sameWhenClosed = held === heldAtStart;
  const eOther = runOpen({ id: 'hh-404' });
  const sameWhenOther = held === heldAtStart;
  const eOpen = runOpen({ id: 'hh-1' });
  assert(
    '18.23',
    'opening a household (Edit) drops its note and only its note; with no household open, or another one, nothing in the list changes',
    !!eNone &&
      !!eOther &&
      !!eOpen &&
      sameWhenClosed &&
      sameWhenOther &&
      held[0]?.keptEmailNames === undefined &&
      held[0]?.id === 'hh-1' &&
      JSON.stringify(held[1]?.keptEmailNames) === JSON.stringify(['Ann']),
    held.map((h: any) => [h.id, h.keptEmailNames])
  );

  globalThis.fetch = realFetch;
  console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\x1b[31mtest crashed:\x1b[0m', err);
  process.exit(2);
});
