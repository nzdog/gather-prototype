/**
 * [[GTC-419]] — TICKET E, THE GUEST'S BUTTONS (tweak 12, the founder's ruling of 28 Oct 2026, Batch
 * 2 Part A). One file changes: src/app/p/[token]/page.tsx.
 *
 * THE RULING THIS SUITE PINS
 *   - Attendance: once she has answered, "Yes" and "No" stay, hers marked (aria-pressed and a
 *     clearly different look), in place of the "Changed your mind?" link; the other one does what
 *     the link did. No Maybe for attendance. The first-time words ("Yes, still coming", the
 *     invites-only "Yes, I’ll be there", "Can't make it") and the confirmations are kept.
 *   - Items: once answered, "Yes", "No" and "Maybe" stay, hers marked, in place of the coloured bar
 *     and the "Change to" links; each makes the same call its old control made.
 *   - One note, in the attendance box, after her answer: "Changed your mind? Tap a different
 *     answer. You can come back to this page any time."
 *   - The answer calls do not change by a character: no new call, none different.
 *
 * THE LAYERS
 *   P  the page's source against GTC-418's tip (0d5bd50, a fixed commit, where the page is as at
 *      Batch 1's tip), every expected piece typed here by hand.
 *   B  the page itself, in this process: the page as it is now and as it was at 0d5bd50 are both
 *      compiled here (esbuild) with React's state hooks answered by this suite, drawn for twelve
 *      made-up guests (typed here), and every answer control is pressed with `fetch` recorded (no
 *      request leaves the process). The calls each page makes are compared with the calls typed
 *      here by hand, state by state.
 *   U  CONTROL: between 0d5bd50 and Ticket E's code commit (both fixed) only the page changed;
 *      package.json (at the commit that added this suite) differs by its one script line; the two
 *      untracked scripts are in no commit.
 *
 * No database, no server, no provider. Every condition lives in CHECKS, so it can be dry-run on a
 * passing and a failing input (TWEAKS_E_DRY_RUN=1 imports CHECKS and the helpers only).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import * as ReactAll from 'react';
import * as JsxRuntime from 'react/jsx-runtime';
import { renderToStaticMarkup } from 'react-dom/server';
import { transformSync } from 'esbuild';
import * as Lucide from 'lucide-react';

import * as ItemStatusBadges from '../src/components/plan/ItemStatusBadges';
import * as DropOffDisplay from '../src/components/shared/DropOffDisplay';
import * as DropOffWords from '../src/lib/items/drop-off-words';
import * as InvitesOnly from '../src/lib/setup/invites-only';
import * as EventDetails from '../src/components/shared/EventDetails';
import * as QuestionsLine from '../src/lib/guest/questions-line';

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
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};
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
const PAGE = 'src/app/p/[token]/page.tsx';
const SUITE = 'tests/tweaks-e-test.tsx';
/** GTC-418's tip (Ticket C's ticket commit), where this ticket starts: a fixed commit. */
const BASE = '0d5bd500ec098464095131f305e6f175f616596b';
/** Ticket E's code commit: a fixed commit. */
const CODE_E = 'ed87b7e074bf0ea1d6d65c934b34bc6071d989fe';
/**
 * [[GTC-424]] (tweak 12b, Batch 2 Part C) — Ticket I's code commit, a fixed commit. The answered
 * box's No declines her own dishes first there (a new handler with the same two calls), so P1
 * holds the page byte for byte as at that commit, Ticket E's code commit as 0d5bd50 with exactly
 * Ticket E's four pieces, and the page unchanged between the two; P2 counts the two new calls.
 */
const CODE_I = 'cfc6436896eb2f0cc251a038aa6e2dd8bbd1cb57';
const CODE_FILES = [PAGE];
const NEW_SCRIPT = 'test:tweaks-e';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-e-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled words, typed by hand ───────────────────────────────────────────
const NOTE = 'Changed your mind? Tap a different answer. You can come back to this page any time.';
const STILL_COMING = 'Yes, still coming';
const INVITES_ONLY_YES = 'Yes, I’ll be there';
const CANT = 'Can&#x27;t make it';
const YES_HEADING = 'Great — we&#x27;ll see you there.';
const YES_LINE = 'Your host knows to expect you.';
const NO_HEADING = 'Thanks for letting us know';
const NO_LINE = 'We&#x27;ll miss you at the event!';

// ── The exact pieces Ticket E changes, typed by hand (0d5bd50's file -> now) ──
const HEAD_OF_HELPERS = 'function getFriendlyErrorMessage(error: string | null): string {\n';
const LOOKS =
  '/*\n' +
  ' * [[GTC-419]] (tweak 12): after she has answered, the answer buttons stay. Hers is marked, in her\n' +
  " * answer's colour; the others are plain and white. The words are the first-time buttons' own.\n" +
  ' */\n' +
  "const PICKED = 'py-3 rounded-lg font-medium text-white border border-transparent cursor-default';\n" +
  'const NOT_PICKED =\n' +
  "  'py-3 rounded-lg font-medium bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 transition-all';\n" +
  'const ITEM_ANSWERS = [\n' +
  "  ['ACCEPTED', 'Yes', 'bg-sage-600'],\n" +
  "  ['DECLINED', 'No', 'bg-gray-500'],\n" +
  "  ['MAYBE', 'Maybe', 'bg-amber-500'],\n" +
  '] as const;\n' +
  '\n';
const OLD_LINK =
  '              <button\n' +
  "                onClick={() => handleAttendanceAnswer(data.attendanceAnswer !== 'YES')}\n" +
  '                className="mt-4 text-sm text-accent hover:underline"\n' +
  '              >\n' +
  "                {data.attendanceAnswer === 'YES'\n" +
  "                  ? 'Changed your mind?'\n" +
  "                  : 'Changed your mind? Click here'}\n" +
  '              </button>\n';
const NEW_ATTENDANCE =
  '              {/* [[GTC-419]] (tweak 12): her answer stays as two buttons, hers marked; the other\n' +
  '                  one sends what "Changed your mind?" sent. No maybe for attendance (zone 5). */}\n' +
  '              <div className="grid grid-cols-2 gap-3 mt-4">\n' +
  '                <button\n' +
  "                  aria-pressed={data.attendanceAnswer === 'YES'}\n" +
  '                  onClick={\n' +
  "                    data.attendanceAnswer === 'YES' ? undefined : () => handleAttendanceAnswer(true)\n" +
  '                  }\n' +
  "                  className={data.attendanceAnswer === 'YES' ? `${PICKED} bg-sage-600` : NOT_PICKED}\n" +
  '                >\n' +
  '                  Yes\n' +
  '                </button>\n' +
  '                <button\n' +
  "                  aria-pressed={data.attendanceAnswer === 'NO'}\n" +
  '                  onClick={\n' +
  "                    data.attendanceAnswer === 'NO' ? undefined : () => handleAttendanceAnswer(false)\n" +
  '                  }\n' +
  "                  className={data.attendanceAnswer === 'NO' ? `${PICKED} bg-gray-500` : NOT_PICKED}\n" +
  '                >\n' +
  '                  No\n' +
  '                </button>\n' +
  '              </div>\n' +
  '              <p className="text-sm text-gray-500 mt-4">\n' +
  `                ${NOTE}\n` +
  '              </p>\n';
const OLD_ANSWERED_WORDS =
  '  const answered =\n' +
  "    assignment.response === 'ACCEPTED'\n" +
  '      ? onBehalfOf\n' +
  '        ? `Yes — on ${onBehalfOf}’s behalf`\n' +
  '        : "Yes — you\'re bringing this"\n' +
  "      : assignment.response === 'MAYBE'\n" +
  "        ? 'Maybe'\n" +
  '        : onBehalfOf\n' +
  '          ? `No — on ${onBehalfOf}’s behalf`\n' +
  '          : "No — you\'re not bringing this";\n' +
  '\n';
const OLD_CARD =
  '              <div\n' +
  '                className={`w-full py-3 rounded-lg font-medium text-white flex items-center justify-center gap-2 ${\n' +
  "                  assignment.response === 'ACCEPTED'\n" +
  "                    ? 'bg-green-500'\n" +
  "                    : assignment.response === 'MAYBE'\n" +
  "                      ? 'bg-amber-500'\n" +
  "                      : 'bg-gray-500'\n" +
  '                }`}\n' +
  '              >\n' +
  '                {assignment.response !== \'MAYBE\' && <Check className="size-5" />}\n' +
  '                {answered}\n' +
  '              </div>\n' +
  '              <p className="text-sm text-gray-500 text-center">{note}</p>\n' +
  '              <div className="grid grid-cols-2 gap-2">\n' +
  "                {(['ACCEPTED', 'DECLINED', 'MAYBE'] as const)\n" +
  '                  .filter((r) => r !== assignment.response)\n' +
  '                  .map((r) => (\n' +
  '                    <button\n' +
  '                      key={r}\n' +
  '                      onClick={() => onRespond(r)}\n' +
  '                      className="text-sm text-accent hover:underline py-1"\n' +
  '                    >\n' +
  "                      Change to {r === 'ACCEPTED' ? 'Yes' : r === 'DECLINED' ? 'No' : 'Maybe'}\n" +
  '                    </button>\n' +
  '                  ))}\n' +
  '              </div>\n';
const NEW_CARD =
  '              {/* [[GTC-419]] (tweak 12): the three buttons stay, hers marked; each of the other\n' +
  '                  two sends what its "Change to" link sent. */}\n' +
  '              <div className="grid grid-cols-3 gap-2">\n' +
  '                {ITEM_ANSWERS.map(([r, word, picked]) => (\n' +
  '                  <button\n' +
  '                    key={r}\n' +
  '                    aria-pressed={r === assignment.response}\n' +
  '                    onClick={r === assignment.response ? undefined : () => onRespond(r)}\n' +
  '                    className={r === assignment.response ? `${PICKED} ${picked}` : NOT_PICKED}\n' +
  '                  >\n' +
  '                    {word}\n' +
  '                  </button>\n' +
  '                ))}\n' +
  '              </div>\n' +
  '              <p className="text-sm text-gray-500 text-center">{note}</p>\n';
const E_PAIRS: Pairs = [
  [HEAD_OF_HELPERS, LOOKS + HEAD_OF_HELPERS],
  [OLD_LINK, NEW_ATTENDANCE],
  [OLD_ANSWERED_WORDS, ''],
  [OLD_CARD, NEW_CARD],
];
/** The page's three calls and the reads around them, from fetchData to the card toggles. */
const M_CALLS_FROM = '  const fetchData = async () => {';
const M_CALLS_TO = '  const toggleAssignmentCollapse';

// ══ The page in this process ═════════════════════════════════════════════════
type Answer = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
/** The hook values the next draw hands the page, in the order it asks for them. */
let slots: unknown[] = [];
let slot = 0;
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    const i = slot++;
    return [i < slots.length ? slots[i] : init, () => undefined];
  },
  useEffect: () => undefined,
  useRef: (v: unknown) => ({ current: v }),
};
const TOKEN = 'gtc419-made-up-token';
const MODULES: Record<string, unknown> = {
  react: FAKE_REACT,
  'react/jsx-runtime': JsxRuntime,
  'next/navigation': { useParams: () => ({ token: TOKEN }) },
  'lucide-react': Lucide,
  '@/components/plan/ItemStatusBadges': ItemStatusBadges,
  '@/components/shared/DropOffDisplay': DropOffDisplay,
  '@/lib/items/drop-off-words': DropOffWords,
  '@/lib/setup/invites-only': InvitesOnly,
  '@/components/shared/EventDetails': EventDetails,
  '@/lib/guest/questions-line': QuestionsLine,
};
export interface Loaded {
  View: () => ReactAll.ReactElement;
  Card: (props: any) => ReactAll.ReactElement;
}
/** Compiles a version of the page here; its imports are the ones named above, nothing else. */
export function loadPage(source: string): Loaded | null {
  if (source.length < 1000) return null;
  try {
    const out = transformSync(`${source}\nexport { AssignmentCard };\n`, {
      loader: 'tsx',
      format: 'cjs',
      jsx: 'automatic',
    });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (!(id in MODULES)) throw new Error(`the page imports something new: ${id}`);
      return MODULES[id];
    };
    new Function('require', 'module', 'exports', out.code)(req, m, m.exports);
    return { View: m.exports.default, Card: m.exports.AssignmentCard };
  } catch (e) {
    console.error('    the page did not load:', (e as Error).message.split('\n')[0]);
    return null;
  }
}

/** A made-up dish ask, typed here. */
const row = (id: string, response: Answer, name: string) => ({
  id,
  response,
  item: {
    id: `item-${id}`,
    name,
    quantity: null,
    description: null,
    critical: false,
    glutenFree: false,
    dairyFree: false,
    vegetarian: false,
    notes: null,
    dropOffAt: null,
    dropOffLocation: null,
    dropOffNote: null,
    day: null,
  },
});
const guest = (over: Record<string, unknown>) => ({
  isDemo: false,
  person: { id: 'gtc419-jo', name: 'Jo Lowe' },
  event: {
    id: 'gtc419-event',
    name: 'Riverside lunch',
    startDate: '2026-12-19T00:00:00.000Z',
    endDate: '2026-12-19T00:00:00.000Z',
    status: 'CONFIRMING',
    guestCount: null,
    venueName: null,
    hostFirstName: 'Kate',
  },
  team: null,
  attendance: 'PENDING',
  attendanceAnswer: null,
  attendanceAskable: false,
  invitesOnly: false,
  assignments: [],
  carried: [],
  ...over,
});
const MIXED = {
  attendance: 'YES',
  assignments: [
    row('p1', 'PENDING', 'Bread rolls'),
    row('a1', 'ACCEPTED', 'Glazed ham'),
    row('d1', 'DECLINED', 'Potato salad'),
    row('m1', 'MAYBE', 'Pavlova'),
  ],
  carried: [
    {
      personEventId: 'gtc419-pe-mia',
      personId: 'gtc419-mia',
      name: 'Mia Lowe',
      firstName: 'Mia',
      assignments: [row('c1', 'ACCEPTED', 'Cookies'), row('c2', 'PENDING', 'Napkins')],
    },
  ],
};
/** The calls a press makes, typed by hand: the answer, then the page's own read again. */
const ATT = (attending: boolean) =>
  `PATCH /api/p/${TOKEN} {"attending":${attending}} + GET /api/p/${TOKEN}`;
const ACK = (id: string, r: Answer) =>
  `POST /api/p/${TOKEN}/ack/${id} {"response":"${r}"} + GET /api/p/${TOKEN}`;
const OTHERS = (id: string, mine: Answer) =>
  (['ACCEPTED', 'DECLINED', 'MAYBE'] as Answer[]).filter((r) => r !== mine).map((r) => ACK(id, r));
const ALL3 = (id: string) => (['ACCEPTED', 'DECLINED', 'MAYBE'] as Answer[]).map((r) => ACK(id, r));

export interface State {
  key: string;
  what: string;
  data: ReturnType<typeof guest>;
  /** Her attendance answer, if any: which of "Yes" and "No" is marked. */
  attendance: 'Yes' | 'No' | null;
  /** Each answered dish's marked word. */
  items: Record<string, 'Yes' | 'No' | 'Maybe'>;
  /** Every call the page's controls make in this state, typed by hand. */
  calls: string[];
  /** Nothing answered anywhere: the page must draw exactly as before. */
  untouched: boolean;
}
export const STATES: State[] = [
  {
    key: 'ask-itemless',
    what: 'not answered, nothing to bring: "Are you coming?"',
    data: guest({ attendanceAskable: true }),
    attendance: null,
    items: {},
    calls: [ATT(true), ATT(false)],
    untouched: true,
  },
  {
    key: 'ask-invites-only',
    what: 'not answered, an invites-only event',
    data: guest({ attendanceAskable: true, invitesOnly: true }),
    attendance: null,
    items: {},
    calls: [ATT(true), ATT(false)],
    untouched: true,
  },
  {
    key: 'ask-after-no',
    what: 'every dish declined, attendance not answered: "No worries — still coming?"',
    data: guest({ attendanceAskable: true, assignments: [row('d1', 'DECLINED', 'Potato salad')] }),
    attendance: null,
    items: { d1: 'No' },
    calls: [ATT(true), ATT(false), ...OTHERS('d1', 'DECLINED')],
    untouched: false,
  },
  {
    key: 'yes-itemless',
    what: 'answered yes, nothing to bring',
    data: guest({ attendanceAskable: true, attendanceAnswer: 'YES', attendance: 'YES' }),
    attendance: 'Yes',
    items: {},
    calls: [ATT(false)],
    untouched: false,
  },
  {
    key: 'no-itemless',
    what: 'answered no, nothing to bring',
    data: guest({ attendanceAskable: true, attendanceAnswer: 'NO', attendance: 'NO' }),
    attendance: 'No',
    items: {},
    calls: [ATT(true)],
    untouched: false,
  },
  {
    key: 'yes-after-no',
    what: 'every dish declined, then answered yes to coming',
    data: guest({
      attendanceAskable: true,
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: [row('d1', 'DECLINED', 'Potato salad')],
    }),
    attendance: 'Yes',
    items: { d1: 'No' },
    calls: [ATT(false), ...OTHERS('d1', 'DECLINED')],
    untouched: false,
  },
  {
    key: 'no-invites-only',
    what: 'an invites-only event, answered no',
    data: guest({ attendanceAskable: true, invitesOnly: true, attendanceAnswer: 'NO' }),
    attendance: 'No',
    items: {},
    calls: [ATT(true)],
    untouched: false,
  },
  {
    key: 'items-pending',
    what: 'a dish not answered yet',
    data: guest({ assignments: [row('p1', 'PENDING', 'Bread rolls')] }),
    attendance: null,
    items: {},
    calls: ALL3('p1'),
    untouched: true,
  },
  {
    key: 'items-accepted',
    what: 'a dish accepted ("You\'re all set. See you there.")',
    data: guest({ attendance: 'YES', assignments: [row('a1', 'ACCEPTED', 'Glazed ham')] }),
    attendance: null,
    items: { a1: 'Yes' },
    calls: OTHERS('a1', 'ACCEPTED'),
    untouched: false,
  },
  {
    key: 'items-maybe',
    what: 'a dish answered maybe',
    data: guest({ assignments: [row('m1', 'MAYBE', 'Pavlova')] }),
    attendance: null,
    items: { m1: 'Maybe' },
    calls: OTHERS('m1', 'MAYBE'),
    untouched: false,
  },
  {
    key: 'mixed-and-child',
    what: 'four dishes (pending, yes, no, maybe) and a child’s two (yes, pending)',
    data: guest(MIXED),
    attendance: null,
    items: { a1: 'Yes', d1: 'No', m1: 'Maybe', c1: 'Yes' },
    calls: [
      ...ALL3('p1'),
      ...OTHERS('a1', 'ACCEPTED'),
      ...OTHERS('d1', 'DECLINED'),
      ...OTHERS('m1', 'MAYBE'),
      ...OTHERS('c1', 'ACCEPTED'),
      ...ALL3('c2'),
    ],
    untouched: false,
  },
  {
    key: 'closed-event',
    what: 'the same, on a closed event (the page does not read the status)',
    data: guest({ ...MIXED, event: { ...guest({}).event, status: 'COMPLETE' } }),
    attendance: null,
    items: { a1: 'Yes', d1: 'No', m1: 'Maybe', c1: 'Yes' },
    calls: [
      ...ALL3('p1'),
      ...OTHERS('a1', 'ACCEPTED'),
      ...OTHERS('d1', 'DECLINED'),
      ...OTHERS('m1', 'MAYBE'),
      ...OTHERS('c1', 'ACCEPTED'),
      ...ALL3('c2'),
    ],
    untouched: false,
  },
];

/** One answer control as drawn: its words, its group (attendance, or the dish's id), its props. */
export interface Control {
  group: string;
  words: string;
  pressed: boolean | undefined;
  className: string;
  onClick: undefined | ((e: unknown) => unknown);
}
export interface Drawn {
  html: string;
  controls: Control[];
}
const textOf = (n: any): string => {
  if (n === null || n === undefined || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number') return String(n);
  if (Array.isArray(n)) return n.map(textOf).join('');
  if (ReactAll.isValidElement(n)) {
    const p = n.props as any;
    return typeof n.type === 'string' || typeof n.type === 'symbol' ? textOf(p.children) : '';
  }
  return '';
};
/** Draws the page for a state and lists its answer controls (the card's arrow and "Collapse All" aside). */
export function draw(page: Loaded, data: unknown): Drawn {
  slots = [data, null, false, null, new Set()];
  slot = 0;
  const tree = page.View();
  const controls: Control[] = [];
  const walk = (n: any, group: string) => {
    if (n === null || n === undefined || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach((x) => walk(x, group));
    if (!ReactAll.isValidElement(n)) return;
    const p = n.props as any;
    if (n.type === page.Card) return walk(page.Card(p), p.assignment.id);
    if (typeof n.type === 'function') return;
    if (n.type === 'button' && !p.title) {
      const words = textOf(p.children).replace(/\s+/g, ' ').trim();
      if (!/^(Collapse All|Expand All)$/.test(words)) {
        controls.push({
          group,
          words,
          pressed: p['aria-pressed'],
          className: String(p.className ?? ''),
          onClick: p.onClick,
        });
      }
    }
    walk(p.children, group);
  };
  walk(tree, 'attendance');
  return { html: renderToStaticMarkup(tree), controls };
}
/** Presses a control with `fetch` recorded here (nothing leaves the process); the calls it made. */
export async function press(c: Control, data: unknown): Promise<string> {
  const calls: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    calls.push(`${init?.method ?? 'GET'} ${url}${init?.body ? ` ${init.body}` : ''}`);
    return { ok: true, status: 200, json: async () => data } as unknown as Response;
  }) as typeof fetch;
  try {
    await c.onClick?.({});
  } finally {
    globalThis.fetch = real;
  }
  return calls.join(' + ');
}

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
const sorted = (a: string[]) => [...a].sort();
export const CHECKS = {
  /** P1 — the page is 0d5bd50's file with exactly Ticket E's four pieces, byte for byte. */
  exactly(now: string, base: string) {
    const expected = base.length > 1000 ? applyPairs(base, E_PAIRS) : null;
    return expected !== null && now === expected;
  },
  /** P2 — the calls' code as before, byte for byte: the read, the attendance answer, the dish answer. */
  callsCodeAsBefore(now: string, base: string) {
    const was = between(base, M_CALLS_FROM, M_CALLS_TO);
    return (
      was.length > 2000 &&
      was.includes("method: 'PATCH'") &&
      was.includes('fetch(`/api/p/${token}/ack/${assignmentId}`, {') &&
      between(now, M_CALLS_FROM, M_CALLS_TO) === was &&
      // [[GTC-424]]: Ticket I's handler, outside this region, holds two more fetch calls (the dish
      // answer DECLINED and the attendance No), and the answered box's No calls it, not this one.
      count(now, 'fetch(') === count(base, 'fetch(') + 2 &&
      count(now, 'handleAttendanceAnswer(') === count(base, 'handleAttendanceAnswer(')
    );
  },
  /** P3 — the old controls and the bar are gone from the code. */
  oldControlsGone(now: string) {
    return (
      now.length > 1000 &&
      !now.includes("'Changed your mind? Click here'") &&
      !now.includes("? 'Changed your mind?'") &&
      !now.includes('Change to {') &&
      !now.includes('{answered}') &&
      !now.includes('const answered') &&
      !now.includes('bg-green-500')
    );
  },
  /**
   * B1 — the same calls: in every state the page's controls make exactly the calls typed here, no
   * more and no fewer, now and at 0d5bd50 alike (so each old control has a button making the same
   * call with the same values, and no button makes a call the old page could not).
   */
  sameCalls(nowCalls: string[], baseCalls: string[], typed: string[]) {
    const n = sorted(nowCalls.filter(Boolean));
    const b = sorted(baseCalls.filter(Boolean));
    const t = sorted(typed);
    return (
      t.length > 0 &&
      JSON.stringify(n) === JSON.stringify(t) &&
      JSON.stringify(b) === JSON.stringify(t)
    );
  },
  /** B2 — after an answer, each group marks exactly one button, the right one, in a look of its own. */
  oneMarked(controls: Control[], s: State) {
    const want: Record<string, string> = { ...s.items };
    if (s.attendance) want.attendance = s.attendance;
    const groups = Object.keys(want);
    const marked = controls.filter((c) => c.pressed !== undefined);
    return (
      marked.every((c) => c.group in want) &&
      groups.every((g) => {
        const mine = controls.filter((c) => c.group === g && c.pressed !== undefined);
        const on = mine.filter((c) => c.pressed === true);
        const off = mine.filter((c) => c.pressed === false);
        const words = mine.map((c) => c.words).join(',');
        return (
          (g === 'attendance' ? words === 'Yes,No' : words === 'Yes,No,Maybe') &&
          on.length === 1 &&
          on[0].words === want[g] &&
          on[0].onClick === undefined &&
          /\btext-white\b/.test(on[0].className) &&
          /\bbg-(sage-600|gray-500|amber-500)\b/.test(on[0].className) &&
          off.every(
            (c) =>
              typeof c.onClick === 'function' &&
              /\bbg-white\b/.test(c.className) &&
              c.className !== on[0].className
          )
        );
      })
    );
  },
  /** B3 — nothing answered: the page draws exactly as before (the first-time buttons and their words). */
  untouched(nowHtml: string, baseHtml: string) {
    return baseHtml.length > 500 && nowHtml === baseHtml;
  },
  /** B4 — the first-time attendance box, where it shows, exactly as before, "Yes, still coming" kept. */
  firstTimeBox(nowHtml: string, baseHtml: string, invitesOnly: boolean) {
    const box = (h: string) =>
      between(h, '<h2 class="text-2xl font-bold text-gray-900 mb-2">', '</button></div></div>');
    const b = box(baseHtml);
    return (
      b.length > 200 &&
      box(nowHtml) === b &&
      b.includes(invitesOnly ? INVITES_ONLY_YES : STILL_COMING) &&
      b.includes(CANT) &&
      !/aria-pressed/.test(b)
    );
  },
  /** B5 — no Maybe for attendance: two attendance buttons at most, and every attendance call true or false. */
  noAttendanceMaybe(controls: Control[], calls: string[]) {
    const att = controls.filter((c) => c.group === 'attendance');
    return (
      att.length <= 2 &&
      att.every((c) => !/maybe/i.test(c.words)) &&
      calls
        .filter((x) => x.startsWith('PATCH '))
        .every((x) => / \{"attending":(true|false)\} \+ /.test(x))
    );
  },
  /** B6 — the note: once, in the attendance box, after her attendance answer; nowhere before. */
  note(nowHtml: string, answered: boolean) {
    const box = between(
      nowHtml,
      '<div class="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center">',
      '</p></div>'
    );
    return answered ? count(nowHtml, NOTE) === 1 && box.includes(NOTE) : count(nowHtml, NOTE) === 0;
  },
  /** B7 — the confirmations kept: her answer's heading and line, as before. */
  confirmations(nowHtml: string, baseHtml: string, answer: 'Yes' | 'No') {
    const [h, l] = answer === 'Yes' ? [YES_HEADING, YES_LINE] : [NO_HEADING, NO_LINE];
    return [nowHtml, baseHtml].every((x) => count(x, h) === 1 && count(x, l) === 1);
  },
  /** B8 — the old controls drawn before, and not now: "Changed your mind?" and the "Change to" links. */
  oldDrawnBefore(nowHtml: string, baseHtml: string, s: State) {
    const link = /Changed your mind\?( Click here)?<\/button>/;
    const before =
      (s.attendance ? link.test(baseHtml) : true) &&
      (Object.keys(s.items).length ? baseHtml.includes('Change to ') : true);
    return before && !nowHtml.includes('Change to') && !link.test(nowHtml);
  },
  /** U1 — the files the code commit changed since the base are exactly this ticket's list. */
  sameList(changed: string | null, list: string[]) {
    if (changed === null) return false;
    const got = changed.split('\n').filter(Boolean).sort();
    return JSON.stringify(got) === JSON.stringify([...list].sort());
  },
  /** U3 — package.json at the commit that added this suite differs by the one script line. */
  oneScriptLine(atAdd: string, baseJson: string) {
    try {
      const now = JSON.parse(atAdd);
      const base = JSON.parse(baseJson);
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

function layerP(now: string, base: string) {
  section('P — the guest page’s source, against GTC-418’s tip (0d5bd50)');
  assert(
    'P',
    'P1 the page at Ticket E’s code commit is 0d5bd50’s file with exactly Ticket E’s four pieces, byte for byte (the two looks and the three answers; the attendance buttons and the note; the bar’s words out; the card’s buttons); unchanged from there to Ticket I’s base; and the page now is byte for byte as at Ticket I’s code commit (GTC-424)',
    CHECKS.exactly(atRef(CODE_E, PAGE), base) &&
      atRef(`${CODE_I}^`, PAGE) === atRef(CODE_E, PAGE) &&
      now.length > 1000 &&
      now === atRef(CODE_I, PAGE)
  );
  assert(
    'P',
    'P2 the calls’ code is as before, byte for byte: the page’s read, the attendance answer (PATCH /api/p/<link>) and the dish answer (POST /api/p/<link>/ack/<id>); exactly two fetch calls added since, both Ticket I’s (GTC-424), and the attendance answer called as often as at the base',
    CHECKS.callsCodeAsBefore(now, base)
  );
  assert(
    'P',
    'P3 the old controls are gone: no "Changed your mind?" link, no "Change to" links, no coloured bar',
    CHECKS.oldControlsGone(now)
  );
}

async function layerB(now: string, base: string) {
  section('B — the page itself, drawn here for twelve made-up guests, every answer pressed');
  const pageNow = loadPage(now);
  const pageBase = loadPage(base);
  const ok = !!pageNow && !!pageBase;
  const red: Record<string, string[]> = {};
  const fail = (k: string, s: State) => (red[k] = [...(red[k] ?? []), s.key]);
  for (const s of STATES) {
    if (!ok) break;
    const dn = draw(pageNow!, s.data);
    const db = draw(pageBase!, s.data);
    const callsNow: string[] = [];
    for (const c of dn.controls) callsNow.push(await press(c, s.data));
    const callsBase: string[] = [];
    for (const c of db.controls) callsBase.push(await press(c, s.data));
    if (!CHECKS.sameCalls(callsNow, callsBase, s.calls)) fail('B1', s);
    if (!CHECKS.oneMarked(dn.controls, s)) fail('B2', s);
    if (s.untouched && !CHECKS.untouched(dn.html, db.html)) fail('B3', s);
    if (s.data.attendanceAskable && s.data.attendanceAnswer === null) {
      if (!CHECKS.firstTimeBox(dn.html, db.html, s.data.invitesOnly)) fail('B4', s);
    }
    if (!CHECKS.noAttendanceMaybe(dn.controls, callsNow)) fail('B5', s);
    if (!CHECKS.note(dn.html, s.attendance !== null)) fail('B6', s);
    if (s.attendance && !CHECKS.confirmations(dn.html, db.html, s.attendance)) fail('B7', s);
    if (!s.untouched && !CHECKS.oldDrawnBefore(dn.html, db.html, s)) fail('B8', s);
  }
  const keys = (k: string) => (ok ? (red[k] ?? []).join(', ') : 'the page did not load');
  const green = (k: string) => ok && !(k in red);
  const states = STATES.map((s) => s.key).join(', ');
  assert(
    'B',
    `B1 in every state (${states}) the controls make exactly the calls typed here, now and at 0d5bd50 alike: every old control has a button making the SAME call with the SAME values, and nothing new is sent`,
    green('B1'),
    keys('B1')
  );
  assert(
    'B',
    'B2 after an answer, each group (attendance: Yes, No; each dish: Yes, No, Maybe) marks exactly one button, hers, with aria-pressed and a look of its own (solid colour, white words; the others white); the marked one sends nothing',
    green('B2'),
    keys('B2')
  );
  assert(
    'B',
    'B3 CONTROL: with nothing answered (not asked yet, invites only, a dish not answered) the page is drawn exactly as before, its first-time buttons included',
    green('B3'),
    keys('B3')
  );
  assert(
    'B',
    'B4 the first-time attendance box, wherever it shows, exactly as before: "Yes, still coming" (or "Yes, I’ll be there" on an invites-only event) and "Can’t make it", no button marked',
    green('B4'),
    keys('B4')
  );
  assert(
    'B',
    'B5 no Maybe for attendance: at most two attendance buttons, neither a maybe, and every attendance call sends {"attending":true} or {"attending":false}',
    green('B5'),
    keys('B5')
  );
  assert(
    'B',
    `B6 the note "${NOTE}" shows once, in the attendance box, after her attendance answer, and nowhere before it`,
    green('B6'),
    keys('B6')
  );
  assert(
    'B',
    'B7 the confirmations are kept: "Great — we’ll see you there." / "Your host knows to expect you." after a yes, "Thanks for letting us know" / "We’ll miss you at the event!" after a no',
    green('B7'),
    keys('B7')
  );
  assert(
    'B',
    'B8 CONTROL: in every answered state the old page drew "Changed your mind?" or the "Change to" links, and the page now draws neither',
    green('B8'),
    keys('B8')
  );
}

function layerU() {
  section('U — CONTROL: what Ticket E touched, between fixed commits');
  const r = git(['diff', '--name-only', BASE, CODE_E]);
  const changed = r.status === 0 ? r.stdout : null;
  assert(
    'U',
    `U1 the files changed between GTC-418’s tip (0d5bd50) and Ticket E’s code commit (${CODE_E.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')}`,
    CHECKS.sameList(changed, CODE_FILES),
    String(changed)
  );
  assert(
    'U',
    'U2 Ticket E’s code commit stands straight on GTC-418’s tip (its one parent)',
    git(['rev-parse', `${CODE_E}^@`]).stdout.trim() === BASE
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U3 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the base by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U4 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since the base',
    tracked.length === 0,
    tracked.join(', ')
  );
}

async function main() {
  const now = read(PAGE);
  const base = atRef(BASE, PAGE);
  layerP(now, base);
  await layerB(now, base);
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS and the helpers only (TWEAKS_E_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_E_DRY_RUN !== '1') void main();
