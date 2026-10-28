/**
 * [[GTC-422]] — TICKET D, THE SEND GATE (tweak 9, the founder's ruling of 28 Oct 2026, Batch 2 Part
 * B). Two files change: the pre-flight page and the one component that draws a pre-flight step.
 *
 * THE RULING THIS SUITE PINS
 *   - Step 5, "Ready", is drawn WITHOUT a box (a new option on the step, off by default, so nothing
 *     else changes), its words as they are.
 *   - Send turns on when steps 1 to 4 are ticked; while it waits it says "Send — finish the four
 *     checks first" (the same em dash).
 *   - The press is one act with no recall: the server does not read the ticks (written in the
 *     ticket); the press handler, the Send route and the shared libraries are untouched.
 *   - Proven in a browser on the demo database WITHOUT EVER PRESSING SEND: steps 1 to 4 ticked, Send
 *     is on; any ONE of steps 1 to 4 unticked (each of the four), Send is off with the four-checks
 *     words; none ticked, off; step 5 has no box; nothing else on the page changes.
 *
 * THE LAYERS
 *   P  the two sources against GTC-421's tip (a fixed commit): each is the base with exactly the
 *      changes typed here, byte for byte; the press handler and Send's press untouched.
 *   S  the step component drawn here, now and as it was: with `noBox` Ready has no box and nothing
 *      else differs; without it (the default) every kind of step is drawn exactly as before.
 *   R  the page drawn here, now and as it was (both compiled here, React's state answered by this
 *      suite), for a planned event and an invites-only event in every tick state that matters:
 *      Send's element exactly, the line under it, step 5 with no box, and the rest of the page
 *      identical. No request is made; nothing is pressed.
 *   C  the page in headless Chrome on the dev server and the demo database, at 1280 and 390, on two
 *      events this suite makes and removes: ticks by real clicks on the boxes' labels (never on
 *      Send, which the click guard refuses by its words and the browser wall fails by its address);
 *      a listener counts any click on Send, and it stays 0.
 *   K  CONTROL: the walls held, nothing was sent or written, every fixture row removed.
 *   U  CONTROL: between fixed commits, the code commit changed only the two files, the re-base commit
 *      only the re-based suites; package.json gains this one script line; the two untracked scripts
 *      are in no commit; nothing under src/app/api or src/lib changed since the base.
 *
 * Needs the dev server on :3000 (layer C) and a global WebSocket (NODE_OPTIONS=
 * --experimental-websocket). No provider: the provider trap is installed and the dev server is
 * never live. TWEAKS_D_DRY_RUN=1 imports CHECKS and the helpers only.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import * as ReactAll from 'react';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';

import AfterThePress from '../src/components/preflight/AfterThePress';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapHits } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:3000';
const PORT = 9492;
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

// ── Files and commits ────────────────────────────────────────────────────────
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const STEP = 'src/components/preflight/PreflightStep.tsx';
const SUITE = 'tests/tweaks-d-test.tsx';
/** GTC-421's tip (Ticket G's ticket commit), where this ticket starts: a fixed commit. */
const BASE = '3b8cdfa25e002cff59e27c363c7b9a255f9f96ce';
/** Ticket D's code commit: a fixed commit. */
const CODE_D = 'a75667951ef75da7d0c7d8f3555ba0548b272235';
/** Ticket D's re-base commit: a fixed commit. */
const REBASE_D = '5cb6eac90beb15cb783ecdbf32f8d3a3654797e7';
const CODE_FILES = [PAGE, STEP];
const REBASE_FILES = [
  'tests/preflight-fold-test.tsx',
  'tests/tweaks-f-test.tsx',
  'tests/walkthrough-batch16-test.tsx',
  'tests/walkthrough-batch4-test.tsx',
  'tests/walkthrough-batch5-test.tsx',
  'tests/walkthrough-batch5-words-test.tsx',
  'tests/walkthrough-batch7-test.tsx',
];
const NEW_SCRIPT = 'test:tweaks-d';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/tweaks-d-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled words, typed by hand ───────────────────────────────────────────
const WAITING = 'Send — finish the four checks first';
const WAITING_BEFORE = 'Send — finish the five checks first';
const READY = 'Send';
const TITLES = ['Are we all sorted?', 'Dietary needs', 'Who Gather talks to', 'The message, shown'];
const GO_TO = (n: number) => `Go to step ${n}: ${TITLES[n - 1]} ↑`;
const READY_BLURB = 'The last look is done.';
/** Send's element as drawn, off and on (React writes `disabled` as disabled=""). */
const SEND_OFF = `<button type="button" disabled="" class="w-full py-3 rounded-lg font-medium bg-gray-200 text-gray-500 cursor-not-allowed">${WAITING}</button>`;
const SEND_OFF_BEFORE = SEND_OFF.replace(WAITING, WAITING_BEFORE);
const SEND_ON = `<button type="button" class="w-full py-3 rounded-lg font-medium bg-gray-900 text-white hover:bg-gray-800">${READY}</button>`;

// ── The exact changes, typed by hand (GTC-421's tip -> now) ──────────────────
type Edit = { old: string; new: string };
export const PAGE_EDITS: Edit[] = [
  {
    old: '    return !fourPending && [1, 2, 3, 4, 5].every((n) => checked[n] || settled[n]);\n',
    new:
      '    // [[GTC-422]] (tweak 9): step 5 has no box, so Send waits on steps 1 to 4 only.\n' +
      '    return !fourPending && [1, 2, 3, 4].every((n) => checked[n] || settled[n]);\n',
  },
  {
    old: '  const nextStep = firstUnticked({ ...checked, ...settled });\n',
    new:
      '  // [[GTC-422]]: step 5 has no box, so the line under Send never names it.\n' +
      '  const nextStep = firstUnticked({ ...checked, ...settled, 5: true });\n',
  },
  {
    old:
      '          blurb="The last look is done."\n' +
      '          checked={!!checked[5]}\n' +
      '          onCheck={(v) => tick(5, v)}\n' +
      '        >\n',
    new:
      '          blurb="The last look is done."\n' +
      '          checked={!!checked[5]}\n' +
      '          onCheck={(v) => tick(5, v)}\n' +
      '          // [[GTC-422]] (tweak 9): Ready is drawn without a box; Send waits on steps 1 to 4.\n' +
      '          noBox\n' +
      '        >\n',
  },
  {
    old: "                : `Send${allChecked ? '' : ' — finish the five checks first'}`}\n",
    new: "                : `Send${allChecked ? '' : ' — finish the four checks first'}`}\n",
  },
];
export const STEP_EDITS: Edit[] = [
  {
    old: " * ticked. Ready and the settled steps have only the row's.\n */\n",
    new:
      " * ticked. Ready and the settled steps have only the row's.\n" +
      ' *\n' +
      ' * [[GTC-422]] (tweak 9, the founder, 28 Oct 2026: "Step 5 needs no tick") — `noBox`, off by\n' +
      ' * default: a step that does not fold (Ready) is drawn with no box at all. Every other step, and\n' +
      ' * Ready without it, is drawn exactly as before.\n' +
      ' */\n',
  },
  {
    old: '  line = null,\n  children,\n',
    new: '  line = null,\n  noBox = false,\n  children,\n',
  },
  {
    old: '  line?: StepLine | null;\n  children: React.ReactNode;\n',
    new:
      '  line?: StepLine | null;\n' +
      '  /** [[GTC-422]] — given, a step that does not fold (Ready) has no box. Off by default. */\n' +
      '  noBox?: boolean;\n' +
      '  children: React.ReactNode;\n',
  },
  {
    old: '          ) : (\n            box\n          )}\n',
    new: '          ) : noBox ? null : (\n            box\n          )}\n',
  },
];
export function applyEdits(base: string, edits: Edit[]): string | null {
  let s = base;
  for (const e of edits) {
    if (count(s, e.old) !== 1) return null;
    s = s.replace(e.old, () => e.new);
  }
  return s;
}

// ══ Compiling a version of a file here ═══════════════════════════════════════
let slots: unknown[] | null = null;
let slot = 0;
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    if (slots === null) return ReactAll.useState(init);
    const i = slot++;
    return [
      i < slots.length ? slots[i] : typeof init === 'function' ? (init as () => unknown)() : init,
      () => undefined,
    ];
  },
  useEffect: (...a: Parameters<typeof ReactAll.useEffect>) =>
    slots === null ? ReactAll.useEffect(...a) : undefined,
  useLayoutEffect: () => undefined,
  useMemo: (f: () => unknown, d?: unknown[]) =>
    slots === null ? ReactAll.useMemo(f, d ?? []) : f(),
  useCallback: (f: unknown, d?: unknown[]) =>
    slots === null ? ReactAll.useCallback(f as any, d ?? []) : f,
  useRef: (v: unknown) => (slots === null ? ReactAll.useRef(v) : { current: v }),
};
const EVENT_ID = 'gtc422-made-up-event';
const NAVIGATION = {
  useParams: () => ({ eventId: EVENT_ID }),
  useRouter: () => ({ push() {}, replace() {}, refresh() {} }),
  usePathname: () => `/plan/${EVENT_ID}/pre-flight`,
  useSearchParams: () => new URLSearchParams(),
};
type Component = (props: Record<string, unknown>) => ReactAll.ReactElement;
export function compile(source: string, dir: string): Component | null {
  if (source.length < 1000) return null;
  try {
    const out = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (id === 'react') return FAKE_REACT;
      if (id === 'next/navigation') return NAVIGATION;
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

// ── The page's state, answered here (its order: data, error, saving, ticks, messagePrint,
//    fourPending, openHouseholds, openSteps, pressing, pressed, pressError, pretend) ──
const preflight = (event: Record<string, unknown>) => ({
  viewerId: 'gtc422-kate',
  viewerEmail: 'kate@example.com',
  event: {
    id: EVENT_ID,
    name: 'Riverside lunch',
    startDate: '2026-12-19T00:00:00.000Z',
    sentAt: null,
    nudgePace: null,
    endDate: null,
    venueName: null,
    venueTimingStart: null,
    venueTimingEnd: null,
    occasionDescription: null,
    eventType: 'bbq',
    eventTypeOther: null,
    invitesOnly: false,
    planPutAway: false,
    ...event,
  },
  coverage: {
    unassignedItems: [],
    unassignedCount: 0,
    criticalUnassignedCount: 0,
    complianceRate: 100,
    criticalGaps: [],
  },
  dietary: { status: 'confirmed_none', requirements: [] },
  households: [],
  unhoused: [],
  channelCandidates: [],
});
const ticksOf = (ns: number[]) => Object.fromEntries(ns.map((n) => [n, `print-${n}`]));
export interface State {
  key: string;
  invitesOnly: boolean;
  ticked: number[];
  fourPending?: boolean;
  /** Send on, now. */
  on: boolean;
  /** The step the line names now, or null for no line. */
  line: number | null;
  /** At the base: Send on, and the step its line named. */
  baseOn: boolean;
  baseLine: number | null;
}
export const STATES: State[] = [
  { key: 'none', invitesOnly: false, ticked: [], on: false, line: 1, baseOn: false, baseLine: 1 },
  {
    key: '1-4',
    invitesOnly: false,
    ticked: [1, 2, 3, 4],
    on: true,
    line: null,
    baseOn: false,
    baseLine: 5,
  },
  {
    key: 'not-1',
    invitesOnly: false,
    ticked: [2, 3, 4],
    on: false,
    line: 1,
    baseOn: false,
    baseLine: 1,
  },
  {
    key: 'not-2',
    invitesOnly: false,
    ticked: [1, 3, 4],
    on: false,
    line: 2,
    baseOn: false,
    baseLine: 2,
  },
  {
    key: 'not-3',
    invitesOnly: false,
    ticked: [1, 2, 4],
    on: false,
    line: 3,
    baseOn: false,
    baseLine: 3,
  },
  {
    key: 'not-4',
    invitesOnly: false,
    ticked: [1, 2, 3],
    on: false,
    line: 4,
    baseOn: false,
    baseLine: 4,
  },
  {
    key: '1-4-step-4-unchecked',
    invitesOnly: false,
    ticked: [1, 2, 3, 4],
    fourPending: true,
    on: false,
    line: null,
    baseOn: false,
    baseLine: 5,
  },
  {
    key: '1-5',
    invitesOnly: false,
    ticked: [1, 2, 3, 4, 5],
    on: true,
    line: null,
    baseOn: true,
    baseLine: null,
  },
  { key: 'io-none', invitesOnly: true, ticked: [], on: false, line: 3, baseOn: false, baseLine: 3 },
  {
    key: 'io-3-4',
    invitesOnly: true,
    ticked: [3, 4],
    on: true,
    line: null,
    baseOn: false,
    baseLine: 5,
  },
  { key: 'io-3', invitesOnly: true, ticked: [3], on: false, line: 4, baseOn: false, baseLine: 4 },
  { key: 'io-4', invitesOnly: true, ticked: [4], on: false, line: 3, baseOn: false, baseLine: 3 },
];
export function drawPage(Page: Component, s: State): { html: string; afterSend: boolean } {
  slots = [
    preflight({ invitesOnly: s.invitesOnly }),
    null,
    false,
    ticksOf(s.ticked),
    null,
    s.fourPending === true,
    [],
    [],
    false,
    null,
    null,
    null,
  ];
  slot = 0;
  try {
    const tree = Page({});
    return { html: renderToStaticMarkup(tree), afterSend: tree?.type === AfterThePress };
  } finally {
    slots = null;
  }
}
/** The page's three moving parts, read from a drawing. */
export function partsOf(html: string) {
  const s5 = html.indexOf('<section id="step-5"');
  const s5end = html.indexOf('</section>', s5);
  const step5 = s5 >= 0 && s5end > s5 ? html.slice(s5, s5end) : '';
  const head5 = step5.slice(0, step5.indexOf('</header>'));
  const send = (step5.match(
    /<button type="button"(?: disabled="")? class="w-full py-3[^"]*">[^<]*<\/button>/
  ) ?? [''])[0];
  const lineM = html.match(/<button type="button" data-go-to-step=""[^>]*>([^<]*)<\/button>/);
  const box5 = head5.match(
    /<label class="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600"><input type="checkbox"[^>]*\/>Checked<\/label>/
  );
  const boxes = [1, 2, 3, 4].map((n) => {
    const a = html.indexOf(`<section id="step-${n}"`);
    const b = html.indexOf('</header>', a);
    return a < 0 || b < 0 ? -1 : (html.slice(a, b).match(/<input type="checkbox"/g) ?? []).length;
  });
  return {
    step5,
    send,
    line: lineM ? lineM[1] : null,
    lineEl: lineM ? lineM[0] : '',
    box5: box5 ? box5[0] : null,
    inputs5: (step5.match(/<input\b/g) ?? []).length,
    labels5: (head5.match(/<label\b/g) ?? []).length,
    boxes,
  };
}

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** P1, P2 — the file is the base with exactly the typed changes, byte for byte. */
  exactly(now: string, base: string, edits: Edit[]) {
    return base.length > 1000 && applyEdits(base, edits) === now;
  },
  /** P3 — the press and Send's press untouched: the handler, `disabled`, `onClick`, its classes. */
  pressUntouched(now: string, base: string) {
    const press = (s: string) =>
      s.slice(
        s.indexOf('const press = useCallback'),
        s.indexOf('}, [eventId, pressing, pressed]);')
      );
    const sendHead = (s: string) => {
      const i = s.indexOf('<button\n            type="button"\n            disabled={!allChecked');
      return i < 0 ? '' : s.slice(i, s.indexOf('{pressed !== null', i));
    };
    return (
      press(base).length > 500 &&
      press(now) === press(base) &&
      sendHead(base).length > 200 &&
      sendHead(now) === sendHead(base) &&
      count(now, `fetch(\`/api/events/\${eventId}/send\``) === 1 &&
      count(now, 'useState') === count(base, 'useState') &&
      count(now, 'useEffect') === count(base, 'useEffect')
    );
  },
  /** R1 — Send exactly as ruled, and the line under it. */
  send(p: ReturnType<typeof partsOf>, on: boolean, line: number | null) {
    return p.send === (on ? SEND_ON : SEND_OFF) && p.line === (line === null ? null : GO_TO(line));
  },
  /** R2 — step 5 has no box (no input, no label in its row); steps 1 to 4 one box each. */
  noBox5(p: ReturnType<typeof partsOf>) {
    return (
      p.step5.length > 200 &&
      p.step5.includes(READY_BLURB) &&
      p.step5.includes('>Ready</h2>') &&
      p.inputs5 === 0 &&
      p.labels5 === 0 &&
      p.boxes.every((b) => b === 1)
    );
  },
  /** R3 (base) — at the base Send waited on five: off with the five-checks words until 1 to 5. */
  base(p: ReturnType<typeof partsOf>, on: boolean, line: number | null) {
    return (
      p.send === (on ? SEND_ON : SEND_OFF_BEFORE) &&
      p.line === (line === null ? null : line === 5 ? 'Go to step 5: Ready ↑' : GO_TO(line)) &&
      p.box5 !== null
    );
  },
  /** R4 — CONTROL: the page now is the page at the base but for Send, its line and step 5's box. */
  restSame(now: string, base: string) {
    const cut = (h: string) => {
      const p = partsOf(h);
      let s = h;
      for (const x of [p.send, p.lineEl]) if (x) s = s.replace(x, '');
      // Step 5's box is cut inside step 5's own section: steps 1 to 4 draw the same markup.
      const i = s.indexOf('<section id="step-5"');
      if (p.box5 && i >= 0) s = s.slice(0, i) + s.slice(i).replace(p.box5, '');
      return s;
    };
    return now.length > 2000 && cut(now) === cut(base);
  },
  /** S1 — Ready with noBox: no input, no label; otherwise Ready as drawn without it. */
  readyNoBox(withNoBox: string, without: string) {
    const box = without.match(
      /<label class="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600"><input type="checkbox"[^>]*\/>Checked<\/label>/
    );
    return (
      !!box &&
      !/<input\b|<label\b/.test(withNoBox) &&
      withNoBox === without.replace(box[0], '') &&
      withNoBox.includes(READY_BLURB) &&
      withNoBox.includes('Step 5 of 5')
    );
  },
  /** S2 — without noBox, a step is drawn exactly as at the base. */
  same(now: string, base: string) {
    return base.length > 200 && now === base;
  },
  /** C — the page's Send, line and boxes, as read in the browser. */
  live(f: any, on: boolean, line: number | null, boxes: (boolean | null)[]) {
    return (
      !!f &&
      f.text === (on ? READY : WAITING) &&
      f.off === !on &&
      f.line === (line === null ? null : GO_TO(line)) &&
      f.box5 === 0 &&
      f.label5 === 0 &&
      JSON.stringify(f.boxes) === JSON.stringify(boxes) &&
      f.sendClicks === 0
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

function layerP() {
  section('P — the two sources, against GTC-421’s tip');
  const page = read(PAGE);
  const pageBase = atRef(BASE, PAGE);
  assert(
    'P',
    'P1 the page is the base with exactly the four typed changes, byte for byte: the five-step `every` becomes 1 to 4, the line never names step 5, Ready gains noBox, "five" becomes "four" in Send’s words',
    CHECKS.exactly(page, pageBase, PAGE_EDITS)
  );
  assert(
    'P',
    'P2 the step component is the base with exactly the typed changes: one new prop, noBox, off by default, used only where the box of a step that does not fold is drawn',
    CHECKS.exactly(read(STEP), atRef(BASE, STEP), STEP_EDITS)
  );
  assert(
    'P',
    'P3 CONTROL: the press is untouched: its handler, Send’s disabled rule, onClick and classes, one POST to /send, no new state and no new effect',
    CHECKS.pressUntouched(page, pageBase)
  );
}

function layerS() {
  section('S — the step component drawn here, now and as it was');
  const Now = compile(read(STEP), 'src/components/preflight');
  const Base = compile(atRef(BASE, STEP), 'src/components/preflight');
  const draw = (C: Component | null, over: Record<string, unknown>) =>
    C
      ? renderToStaticMarkup(
          createElement(
            C as any,
            {
              n: 2,
              title: 'Dietary needs',
              blurb: 'B',
              checked: false,
              onCheck: () => {},
              onToggle: () => {},
              ...over,
            },
            createElement('p', null, 'INSIDE')
          )
        )
      : '';
  const ready = { n: 5, title: 'Ready', blurb: READY_BLURB, onToggle: undefined };
  assert(
    'S',
    'S1 Ready with noBox: no box and no label in its row; otherwise exactly Ready as drawn without it ("Step 5 of 5", "Ready", "The last look is done.", its contents)',
    ok(() => CHECKS.readyNoBox(draw(Now, { ...ready, noBox: true }), draw(Now, ready)))
  );
  const sets: Record<string, Record<string, unknown>> = {
    'a folding step, closed': {},
    'a folding step, open and ticked': { open: true, checked: true },
    'step 4 open ("Settled")': { n: 4, open: true, checkLabel: 'Settled' },
    'a settled step': { settled: true },
    Ready: ready,
    'Ready ticked': { ...ready, checked: true },
  };
  const differ = Object.entries(sets)
    .filter(([, over]) => !CHECKS.same(draw(Now, over), draw(Base, over)))
    .map(([k]) => k);
  assert(
    'S',
    `S2 noBox is off by default: every kind of step (${Object.keys(sets).join(', ')}) is drawn exactly as at the base`,
    !!Now && !!Base && differ.length === 0,
    differ.join(', ')
  );
}

function layerR() {
  section('R — the page drawn here, now and as it was, in 12 tick states');
  const Now = compile(read(PAGE), 'src/app/plan/[eventId]/pre-flight');
  const Base = compile(atRef(BASE, PAGE), 'src/app/plan/[eventId]/pre-flight');
  const loaded = !!Now && !!Base;
  const red: Record<string, string[]> = {};
  const fail = (k: string, s: State) => (red[k] = [...(red[k] ?? []), s.key]);
  for (const s of STATES) {
    if (!loaded) break;
    let now: string;
    let base: string;
    try {
      now = drawPage(Now!, s).html;
      base = drawPage(Base!, s).html;
    } catch (e) {
      console.error(`    ${s.key} did not draw:`, (e as Error).message.split('\n')[0]);
      ['R1', 'R2', 'R3', 'R4'].forEach((k) => fail(k, s));
      continue;
    }
    const pn = partsOf(now);
    const pb = partsOf(base);
    if (!CHECKS.send(pn, s.on, s.line)) fail('R1', s);
    if (!CHECKS.noBox5(pn)) fail('R2', s);
    if (!CHECKS.base(pb, s.baseOn, s.baseLine)) fail('R3', s);
    if (!CHECKS.restSame(now, base)) fail('R4', s);
  }
  const keys = (k: string) => (loaded ? (red[k] ?? []).join(', ') : 'the page did not load');
  const green = (k: string) => loaded && !(k in red);
  assert(
    'R',
    `R1 Send: on ("${READY}") once steps 1 to 4 are ticked (a planned event; 3 and 4 on invites only, 1 and 2 ticked for her); off with "${WAITING}" with none, or with any ONE of 1 to 4 left (each of the four), or with step 4 remembered but not yet checked; the line names the first of 1 to 4 left, and is gone once Send is on`,
    green('R1'),
    keys('R1')
  );
  assert(
    'R',
    'R2 in every state step 5 is drawn with no box (no input, no label in its row), its title and words as before; steps 1 to 4 have one box each',
    green('R2'),
    keys('R2')
  );
  assert(
    'R',
    `R3 CONTROL: at the base the same states drew five boxes and Send off with "${WAITING_BEFORE}" until all five were ticked, the line then naming step 5 (so the change is real)`,
    green('R3'),
    keys('R3')
  );
  assert(
    'R',
    'R4 CONTROL: in every state the page drawn now is the page drawn at the base but for Send, the line under it and step 5’s box: nothing else on the page changes',
    green('R4'),
    keys('R4')
  );
}

// ══ C — the browser, on the demo database ════════════════════════════════════
const created = { users: [] as string[], people: [] as string[], events: [] as string[] };
const refusals: string[] = [];
const KEY_PREFIX = 'gather:preflight-ticks:';
/** Counts every click whose button reads Send, before the page sees it. */
const SEND_CLICKS = `(() => { window.__sendClicks = 0; document.addEventListener('click', (e) => {
  const b = e.target && e.target.closest ? e.target.closest('button') : null;
  if (b && /^Send\\b/.test((b.innerText || '').trim())) window.__sendClicks++; }, true); })();`;
const FACTS = `(() => { const s = document.getElementById('step-5'); const head = s ? s.querySelector('header') : null;
  const b = s ? [...s.querySelectorAll('button')].find((x) => x.innerText.trim().startsWith('Send')) : null;
  const line = document.querySelector('[data-go-to-step]');
  return { text: b ? b.innerText.trim() : null, off: b ? b.disabled : null, line: line ? line.innerText.trim() : null,
    box5: s ? s.querySelectorAll('input[type=checkbox]').length : -1, label5: head ? head.querySelectorAll('label').length : -1,
    boxes: [1, 2, 3, 4].map((n) => { const x = document.querySelector('#step-' + n + ' header input[type=checkbox]'); return x ? x.checked : null; }),
    sendClicks: window.__sendClicks === undefined ? -1 : window.__sendClicks }; })()`;

async function layerC() {
  section('C — the page in headless Chrome, on the demo database (Send never pressed)');
  const up = await realFetch(`${BASE_URL}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc422-${l}-${stamp}@example.com`;
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
  const mk = async (label: string, invitesOnly: boolean) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-422 — ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'CONFIRMING',
        venueName: 'Kate’s place',
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({ data: { eventId: ev.id, invitesOnly } as any });
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
    if (!invitesOnly) {
      const team = await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
      const it = await prisma.item.create({
        data: { name: 'Green salad', teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
      });
      await prisma.assignment.create({ data: { itemId: it.id, personId: jo.id } });
    }
    return ev.id;
  };
  const evP = await mk('planned', false);
  const evI = await mk('invites only', true);
  const outboundBefore = await prisma.outboundMessage.count();
  const inviteBefore = await prisma.inviteEvent.count();

  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  let chrome: Headless | null = null;
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
        `fetch('/api/gtc422-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc422-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C0 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    if (probes.plan !== 'failed' || probes.send !== 'failed') return;
    await c.setSessionCookie(token);
    await c.addInitScript(SEND_CLICKS);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const waitFor = async (js: string, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (
          await ev<boolean>(`(() => { try { return !!(${js}); } catch (e) { return false; } })()`)
        )
          return true;
        await sleep(150);
      }
      return false;
    };
    /** A first visit: this browser's remembered ticks forgotten, the steps and step 4's message in. */
    const open = async (id: string) => {
      await c.navigate(`/plan/${id}/pre-flight`, 300);
      await waitFor(`document.getElementById('step-5')`);
      await ev(
        `(() => { try { for (const k of Object.keys(localStorage)) if (k.startsWith(${JSON.stringify(KEY_PREFIX)})) localStorage.removeItem(k); } catch (e) {} return true; })()`
      );
      await c.navigate(`/plan/${id}/pre-flight`, 300);
      await waitFor(`document.getElementById('step-5')`);
      await waitFor(
        `document.querySelector('#step-4 [data-message-part], #step-4 textarea')`,
        8000
      );
      await sleep(600);
    };
    /** A box's label, clicked through the guard (it refuses any target whose words say send). */
    const tick = async (n: number) => {
      const why = await c.clickGuarded(`#step-${n} header label`, 500);
      if (why) refusals.push(`step ${n}: ${why}`);
      return why;
    };
    const facts = () => ev<any>(FACTS);
    for (const [w, h, mobile, k] of [
      [1280, 900, false, ''],
      [390, 844, true, 'p'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await open(evP);
      const f1 = await facts();
      r[`C1${k}`] = CHECKS.live(f1, false, 1, [false, false, false, false]);
      detail[`C1${k}`] = JSON.stringify(f1);
      for (const n of [1, 2, 3, 4]) await tick(n);
      const f2 = await facts();
      r[`C2${k}`] = CHECKS.live(f2, true, null, [true, true, true, true]);
      detail[`C2${k}`] = JSON.stringify(f2);
      for (const n of [1, 2, 3, 4]) {
        await tick(n);
        const off = await facts();
        await tick(n);
        const back = await facts();
        const boxes = [1, 2, 3, 4].map((x) => x !== n);
        r[`C3-${n}${k}`] =
          CHECKS.live(off, false, n, boxes) &&
          CHECKS.live(back, true, null, [true, true, true, true]);
        detail[`C3-${n}${k}`] = JSON.stringify({ off, back });
      }
      for (const n of [1, 2, 3, 4]) await tick(n);
      const f4 = await facts();
      r[`C4${k}`] = CHECKS.live(f4, false, 1, [false, false, false, false]);
      detail[`C4${k}`] = JSON.stringify(f4);
      await open(evI);
      const i0 = await facts();
      await tick(3);
      const i3 = await facts();
      await tick(4);
      const i34 = await facts();
      await tick(3);
      const i4 = await facts();
      r[`C5${k}`] =
        CHECKS.live(i0, false, 3, [true, true, false, false]) &&
        CHECKS.live(i3, false, 4, [true, true, true, false]) &&
        CHECKS.live(i34, true, null, [true, true, true, true]) &&
        CHECKS.live(i4, false, 3, [true, true, false, true]);
      detail[`C5${k}`] = JSON.stringify({ i0, i3, i34, i4 });
    }
  } catch (e) {
    console.error('    chrome threw:', (e as Error).message.split('\n')[0]);
  }
  const blocked = chrome?.planMakingBlocked() ?? ['no chrome'];
  const hosts = chrome?.hostsRequested() ?? [];
  const dialogs = chrome?.dialogs() ?? ['no chrome'];
  chrome?.close();
  const labels: Array<[string, string]> = [
    [
      'C1',
      `C1 a planned event, nothing ticked: Send off, "${WAITING}"; the line names step 1; step 5 has no box`,
    ],
    [
      'C2',
      `C2 steps 1 to 4 ticked (four real clicks on their boxes): Send ON, "${READY}", no line; step 5 still has no box; Send not clicked`,
    ],
    [
      'C3-1',
      `C3-1 step 1 alone left unticked: Send off, "${WAITING}", the line names step 1; ticked again, Send on`,
    ],
    [
      'C3-2',
      `C3-2 step 2 alone left unticked: Send off, "${WAITING}", the line names step 2; ticked again, Send on`,
    ],
    [
      'C3-3',
      `C3-3 step 3 alone left unticked: Send off, "${WAITING}", the line names step 3; ticked again, Send on`,
    ],
    [
      'C3-4',
      `C3-4 step 4 alone left unticked: Send off, "${WAITING}", the line names step 4; ticked again, Send on`,
    ],
    ['C4', `C4 all four unticked again: Send off, "${WAITING}"`],
    [
      'C5',
      'C5 invites only (1 and 2 ticked for her): off with none; off with 3 alone; ON with 3 and 4; off with 4 alone',
    ],
  ];
  for (const [key, label] of labels) {
    assert('C', `${label} (1280)`, r[key] === true, detail[key]);
    assert('C', `${label} (390)`, r[`${key}p`] === true, detail[`${key}p`]);
  }

  section('K — CONTROL: the walls held, nothing sent, nothing written');
  const evIn = { eventId: { in: created.events } };
  const sent = await prisma.event.count({
    where: { id: { in: created.events }, sentAt: { not: null } },
  });
  const ai = await prisma.event.findMany({
    where: { id: { in: created.events } },
    select: { aiCallsUsed: true },
  });
  const outbound = await prisma.outboundMessage.count({ where: evIn });
  const invites = await prisma.inviteEvent.count({ where: evIn });
  assert(
    'K',
    'K1 the browser failed only the two probes; no click was refused; no dialog; no host but this Mac; no provider reached',
    JSON.stringify(blocked.sort()) ===
      JSON.stringify(
        [
          'POST http://localhost:3000/api/events/gtc422-probe/send',
          'POST http://localhost:3000/api/gtc422-probe/finalize-plan',
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
    'K2 neither event was sent: no sentAt, no message, no invite event on either, no AI call; the totals of messages and invite events are as found',
    sent === 0 &&
      outbound === 0 &&
      invites === 0 &&
      ai.length === 2 &&
      ai.every((a) => a.aiCallsUsed === 0) &&
      (await prisma.outboundMessage.count()) === outboundBefore &&
      (await prisma.inviteEvent.count()) === inviteBefore,
    JSON.stringify({ sent, outbound, invites, ai })
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
    'K3 CONTROL: every fixture row removed by id (2 events and all on them, 2 people, 1 user, 1 session)',
    left === 0 && evIds.length === 2,
    String(left)
  );
}

function layerU() {
  section('U — CONTROL: what Ticket D touched, between fixed commits');
  const d1 = git(['diff', '--name-only', BASE, CODE_D]);
  assert(
    'U',
    `U1 the files changed between GTC-421’s tip and Ticket D’s code commit (${CODE_D.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')}`,
    CHECKS.sameList(d1.status === 0 ? d1.stdout : null, CODE_FILES),
    d1.stdout
  );
  assert(
    'U',
    'U2 the code commit stands straight on GTC-421’s tip (its one parent)',
    git(['rev-parse', `${CODE_D}^@`]).stdout.trim() === BASE
  );
  const d3 = git(['diff', '--name-only', CODE_D, REBASE_D]);
  assert(
    'U',
    `U3 the re-base commit (${REBASE_D.slice(0, 7)}) stands on the code commit and changed exactly the ${REBASE_FILES.length} re-based suites`,
    git(['rev-parse', `${REBASE_D}^@`]).stdout.trim() === CODE_D &&
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
    `U4 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from GTC-421’s tip by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
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
    'U5 neither untracked script is in any commit since the base, and nothing under src/app/api, src/lib or prisma changed since it (the Send route and the press included)',
    tracked.length === 0 && zones.status === 0 && zones.stdout.trim() === '',
    `${tracked.join(', ')} ${zones.stdout}`
  );
}

async function main() {
  installProviderTrap();
  layerP();
  layerS();
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

// A dry run imports CHECKS and the helpers only (TWEAKS_D_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_D_DRY_RUN !== '1') void main();
