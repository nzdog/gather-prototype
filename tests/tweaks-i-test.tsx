/**
 * [[GTC-424]] — TICKET I, A GUEST WHO IS NOT COMING (tweak 12b, the founder's ruling of 28 Oct 2026,
 * Batch 2 Part C). One file changes: src/app/p/[token]/page.tsx. The guest page only: no route, no
 * attendance rule and no answer call changes.
 *
 * THE RULING THIS SUITE PINS
 *   - "No" in the answered attendance box FIRST sends, one after another, the dish answer DECLINED
 *     for each of HER OWN dishes not already declined (each exactly the call a tap on that dish's
 *     "No" sends), THEN the attendance No. A child's or another member's carried rows are never
 *     touched. With nothing undeclined, only the attendance No is sent, as before.
 *   - Any call fails: stop at once, read the page again, and show "That didn't go through. Please
 *     tap No again." The attendance No is never sent after a failed decline.
 *   - The box's marked button follows her derived attendance (an accepted dish reads as Yes), so the
 *     page never shows "We'll miss you" beside "You're all set". The box shows in exactly the
 *     situations it showed before. "Yes" does what it did.
 *   - Holding dishes, all marked No, with her answer No: under "We'll miss you at the event!" the
 *     line "We've marked your items No, so your host knows to find someone else."
 *
 * THE LAYERS
 *   P  the page's source against GTC-423's tip (a fixed commit): the base with exactly Ticket I's
 *      pieces, typed here by hand; the page's read, the attendance answer and the dish answer
 *      byte for byte as before; the new handler's two calls are those two calls; no timer.
 *   B  the page itself, in this process: the page now and as it was at the base, both compiled here
 *      (esbuild) with React's state answered by this suite, drawn for made-up guests (typed here)
 *      in every state the change touches, every attendance control pressed with `fetch` recorded
 *      (no request leaves the process): the calls typed here by hand, in order; the failures; a
 *      second press; the words; the box shown where it was.
 *   C  the page in headless Chrome on the dev server, at 390, for a made-up link: EVERY request to
 *      /api/p/ is answered by the browser itself (a second DevTools socket), so nothing reaches the
 *      real routes and nothing is written; real clicks on the box's buttons; the calls recorded.
 *   U  CONTROL: between fixed commits, the code commit changed only the page, the re-base commit
 *      only tweaks-e; package.json gains this one script line; the two untracked scripts are in no
 *      commit; nothing under src/app/api, src/lib or prisma changed since the base.
 *
 * Needs the dev server on :3000 (layer C) and a global WebSocket (NODE_OPTIONS=
 * --experimental-websocket). No database is touched; no provider. TWEAKS_I_DRY_RUN=1 imports
 * CHECKS and the helpers only.
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
import { installProviderTrap, trapHits } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
const ROOT = path.join(__dirname, '..');
const BASE_URL = 'http://localhost:3000';
const PORT = 9494;
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
const PAGE = 'src/app/p/[token]/page.tsx';
const SUITE = 'tests/tweaks-i-test.tsx';
/** GTC-423's tip (Ticket H's ticket commit), where this ticket starts: a fixed commit. */
const BASE = 'bcc3662bbb037ab466e289de3de700531b5633a5';
/** Ticket I's code commit: a fixed commit. */
const CODE_I = 'cfc6436896eb2f0cc251a038aa6e2dd8bbd1cb57';
/** Ticket I's re-base commit (tweaks-e P1 and P2): a fixed commit. */
const REBASE_I = 'bc7b33e31d75cb9ad5d05789c86a2943ce644570';
/**
 * Ticket I's ticket commit, the end of its own work: a fixed commit. [[GTC-427]]: U5 reads
 * BASE..OWN_TIP_I, never BASE..HEAD, so later work no longer moves it.
 */
const OWN_TIP_I = '9c14e5704d2d30c9cd6c1dbe12af02418e0838de';
const CODE_FILES = [PAGE];
const REBASE_FILES = ['tests/tweaks-e-test.tsx'];
const NEW_SCRIPT = 'test:tweaks-i';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/tweaks-i-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled words, typed by hand (as React writes them: ' as &#x27;) ────────
const MARKED_LINE = 'We&#x27;ve marked your items No, so your host knows to find someone else.';
const FAILED_LINE = 'That didn&#x27;t go through. Please tap No again.';
const YES_HEADING = 'Great — we&#x27;ll see you there.';
const YES_LINE = 'Your host knows to expect you.';
const NO_HEADING = 'Thanks for letting us know';
const NO_LINE = 'We&#x27;ll miss you at the event!';
const ALL_SET = 'You&#x27;re all set. See you there.';
const NOTE = 'Changed your mind? Tap a different answer. You can come back to this page any time.';

// ── The exact pieces Ticket I changes, typed by hand (GTC-423's tip -> now) ──
const HOOKS_WAS = '  const isInitialLoad = useRef(true);\n' + '\n' + '  useEffect(() => {\n';
const HOOKS_NOW =
  '  const isInitialLoad = useRef(true);\n' +
  '  // [[GTC-424]] (tweak 12b): "No" in the answered box did not go through; and a press under way.\n' +
  '  const [notComingFailed, setNotComingFailed] = useState(false);\n' +
  '  const notComingBusy = useRef(false);\n' +
  '\n' +
  '  useEffect(() => {\n';
const HANDLER_WAS =
  '      setCollapsedAssignments(new Set());\n' +
  '    }\n' +
  '  };\n' +
  '\n' +
  '  if (loading) {\n';
const HANDLER_NOW =
  '      setCollapsedAssignments(new Set());\n' +
  '    }\n' +
  '  };\n' +
  '\n' +
  '  /**\n' +
  '   * [[GTC-424]] (tweak 12b, ruled 28 Oct 2026): "No" in the answered attendance box. The server\n' +
  '   * takes "not coming" only from a guest whose own dishes are all declined (409 otherwise), so\n' +
  '   * this FIRST declines each of HER OWN dishes not declined yet, one after another, each with the\n' +
  '   * call a tap on that dish\'s "No" sends, THEN sends the attendance No the box always sent. A\n' +
  "   * child's carried rows are never touched (GTC-191). Any call that fails stops it there: the\n" +
  '   * attendance No is never sent after a failed decline; the page is read again and says so. A\n' +
  '   * second press while one is under way sends nothing.\n' +
  '   */\n' +
  '  const handleNotComing = async () => {\n' +
  '    if (!data || notComingBusy.current) return;\n' +
  '    notComingBusy.current = true;\n' +
  '    setNotComingFailed(false);\n' +
  "    const undeclined = data.assignments.filter((a) => a.response !== 'DECLINED');\n" +
  '    try {\n' +
  '      for (const a of undeclined) {\n' +
  '        const response = await fetch(`/api/p/${token}/ack/${a.id}`, {\n' +
  "          method: 'POST',\n" +
  "          headers: { 'Content-Type': 'application/json' },\n" +
  "          body: JSON.stringify({ response: 'DECLINED' }),\n" +
  '        });\n' +
  "        if (!response.ok) throw new Error('Failed to record response');\n" +
  '      }\n' +
  '      const response = await fetch(`/api/p/${token}`, {\n' +
  "        method: 'PATCH',\n" +
  "        headers: { 'Content-Type': 'application/json' },\n" +
  '        body: JSON.stringify({ attending: false }),\n' +
  '      });\n' +
  "      if (!response.ok) throw new Error('Failed to record answer');\n" +
  '    } catch {\n' +
  '      setNotComingFailed(true);\n' +
  '    } finally {\n' +
  '      await fetchData();\n' +
  '      notComingBusy.current = false;\n' +
  '    }\n' +
  '  };\n' +
  '\n' +
  '  if (loading) {\n';
const SHOWN_WAS =
  '  const eventDropOff = data.event.venueName?.trim() ? eventDropOffLine(data.event) : null;\n' +
  '\n' +
  '  return (\n';
const SHOWN_NOW =
  '  const eventDropOff = data.event.venueName?.trim() ? eventDropOffLine(data.event) : null;\n' +
  '  // [[GTC-424]] (tweak 12b): the answered box marks her DERIVED attendance, so a stored No beside\n' +
  '  // an accepted dish reads Yes there too, never "We\'ll miss you" beside "You\'re all set".\n' +
  "  const shownAnswer = data.attendance === 'YES' ? 'YES' : data.attendanceAnswer;\n" +
  '\n' +
  '  return (\n';
const BOX_WAS =
  '              <h2 className="text-2xl font-bold text-gray-900 mb-2">\n' +
  "                {data.attendanceAnswer === 'YES'\n" +
  '                  ? "Great \u2014 we\'ll see you there."\n' +
  "                  : 'Thanks for letting us know'}\n" +
  '              </h2>\n' +
  '              <p className="text-gray-600">\n' +
  "                {data.attendanceAnswer === 'YES'\n" +
  "                  ? 'Your host knows to expect you.'\n" +
  '                  : "We\'ll miss you at the event!"}\n' +
  '              </p>\n' +
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
  '              </div>\n';
const BOX_NOW =
  '              <h2 className="text-2xl font-bold text-gray-900 mb-2">\n' +
  "                {shownAnswer === 'YES'\n" +
  '                  ? "Great \u2014 we\'ll see you there."\n' +
  "                  : 'Thanks for letting us know'}\n" +
  '              </h2>\n' +
  '              <p className="text-gray-600">\n' +
  "                {shownAnswer === 'YES'\n" +
  "                  ? 'Your host knows to expect you.'\n" +
  '                  : "We\'ll miss you at the event!"}\n' +
  '              </p>\n' +
  '              {/* [[GTC-424]] (tweak 12b): her dishes are all No, and the host can see it. */}\n' +
  "              {shownAnswer === 'NO' &&\n" +
  '                data.assignments.length > 0 &&\n' +
  "                data.assignments.every((a) => a.response === 'DECLINED') && (\n" +
  '                  <p className="text-gray-600 mt-2">\n' +
  '                    {"We\'ve marked your items No, so your host knows to find someone else."}\n' +
  '                  </p>\n' +
  '                )}\n' +
  '              {/* [[GTC-419]] (tweak 12): her answer stays as two buttons, hers marked; the other\n' +
  '                  one sends what "Changed your mind?" sent. No maybe for attendance (zone 5). */}\n' +
  '              <div className="grid grid-cols-2 gap-3 mt-4">\n' +
  '                <button\n' +
  "                  aria-pressed={shownAnswer === 'YES'}\n" +
  "                  onClick={shownAnswer === 'YES' ? undefined : () => handleAttendanceAnswer(true)}\n" +
  "                  className={shownAnswer === 'YES' ? `${PICKED} bg-sage-600` : NOT_PICKED}\n" +
  '                >\n' +
  '                  Yes\n' +
  '                </button>\n' +
  '                <button\n' +
  "                  aria-pressed={shownAnswer === 'NO'}\n" +
  "                  onClick={shownAnswer === 'NO' ? undefined : () => handleNotComing()}\n" +
  "                  className={shownAnswer === 'NO' ? `${PICKED} bg-gray-500` : NOT_PICKED}\n" +
  '                >\n' +
  '                  No\n' +
  '                </button>\n' +
  '              </div>\n' +
  '              {notComingFailed && (\n' +
  '                <p role="alert" className="text-sm text-red-600 mt-3">\n' +
  '                  {"That didn\'t go through. Please tap No again."}\n' +
  '                </p>\n' +
  '              )}\n';
export const I_PAIRS: Pairs = [
  [HOOKS_WAS, HOOKS_NOW],
  [HANDLER_WAS, HANDLER_NOW],
  [SHOWN_WAS, SHOWN_NOW],
  [BOX_WAS, BOX_NOW],
];
/** The page's read and its two answer calls, from fetchData to the card toggles: as before. */
const M_CALLS_FROM = '  const fetchData = async () => {';
const M_CALLS_TO = '  const toggleAssignmentCollapse';

// ══ The page in this process ═════════════════════════════════════════════════
type Answer = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
/** The hook values the next draw hands the page, in the order it asks for them. */
let slots: unknown[] = [];
let slot = 0;
/** Every state setter call the page made since the last reset: [slot, value]. */
let sets: Array<[number, unknown]> = [];
const FAKE_REACT = {
  ...ReactAll,
  useState: (init: unknown) => {
    const i = slot++;
    return [i < slots.length ? slots[i] : init, (v: unknown) => sets.push([i, v])];
  },
  useEffect: () => undefined,
  useRef: (v: unknown) => ({ current: v }),
};
const TOKEN = 'gtc424-made-up-token';
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
}
/** Compiles a version of the page here; its imports are the ones named above, nothing else. */
export function loadPage(source: string): Loaded | null {
  if (source.length < 1000) return null;
  try {
    const out = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' });
    const m: { exports: any } = { exports: {} };
    const req = (id: string) => {
      if (!(id in MODULES)) throw new Error(`the page imports something new: ${id}`);
      return MODULES[id];
    };
    new Function('require', 'module', 'exports', out.code)(req, m, m.exports);
    return { View: m.exports.default };
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
const EVENT = {
  id: 'gtc424-event',
  name: 'Riverside lunch',
  startDate: '2026-12-19T00:00:00.000Z',
  endDate: '2026-12-19T00:00:00.000Z',
  status: 'CONFIRMING',
  guestCount: null,
  venueName: null,
  hostFirstName: 'Kate',
};
const guest = (over: Record<string, unknown>) => ({
  isDemo: false,
  person: { id: 'gtc424-jo', name: 'Jo Lowe' },
  event: EVENT,
  team: null,
  attendance: 'PENDING',
  attendanceAnswer: null,
  attendanceAskable: false,
  invitesOnly: false,
  assignments: [],
  carried: [],
  ...over,
});
const CHILD = {
  personEventId: 'gtc424-pe-mia',
  personId: 'gtc424-mia',
  name: 'Mia Lowe',
  firstName: 'Mia',
  assignments: [row('c1', 'ACCEPTED', 'Cookies'), row('c2', 'PENDING', 'Napkins')],
};
const MIXED_OWN = [
  row('p1', 'PENDING', 'Bread rolls'),
  row('a1', 'ACCEPTED', 'Glazed ham'),
  row('d1', 'DECLINED', 'Potato salad'),
  row('m1', 'MAYBE', 'Pavlova'),
];
/** The calls, typed by hand. */
const GET = `GET /api/p/${TOKEN}`;
const PATCH = (attending: boolean) => `PATCH /api/p/${TOKEN} {"attending":${attending}}`;
const DECLINE = (id: string) => `POST /api/p/${TOKEN}/ack/${id} {"response":"DECLINED"}`;

export interface State {
  key: string;
  what: string;
  data: ReturnType<typeof guest>;
  /** Is the answered box drawn (it was, at the base, in exactly the same states)? */
  box: boolean;
  /** The marked attendance word now (null when no box), and at the base. */
  marked: 'Yes' | 'No' | null;
  markedBase: 'Yes' | 'No' | null;
  /** The calls each attendance control makes now, by its words; [] = it sends nothing. */
  calls: Record<string, string[]>;
  /** "We've marked your items No…" drawn now. */
  markedLine: boolean;
  /** "You're all set." drawn (now and at the base alike). */
  allSet: boolean;
}
export const STATES: State[] = [
  {
    key: 'no-items-yes',
    what: 'nothing to bring, answered yes',
    data: guest({ attendanceAskable: true, attendanceAnswer: 'YES', attendance: 'YES' }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'no-items-no',
    what: 'nothing to bring, answered no',
    data: guest({ attendanceAskable: true, attendanceAnswer: 'NO', attendance: 'NO' }),
    box: true,
    marked: 'No',
    markedBase: 'No',
    calls: { Yes: [PATCH(true), GET], No: [] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'declined-only-yes',
    what: 'her one dish declined, then yes to coming',
    data: guest({
      attendanceAskable: true,
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: [row('d1', 'DECLINED', 'Potato salad')],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [PATCH(false), GET] },
    markedLine: false,
    allSet: true,
  },
  {
    key: 'declined-only-no',
    what: 'her dishes declined and her answer no (what a successful No leaves)',
    data: guest({
      attendanceAskable: true,
      attendanceAnswer: 'NO',
      attendance: 'NO',
      assignments: [row('d1', 'DECLINED', 'Potato salad'), row('d2', 'DECLINED', 'Ice')],
    }),
    box: true,
    marked: 'No',
    markedBase: 'No',
    calls: { Yes: [PATCH(true), GET], No: [] },
    markedLine: true,
    allSet: false,
  },
  {
    key: 'accepted-yes',
    what: 'answered yes, then a dish given and accepted',
    data: guest({
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: [row('a1', 'ACCEPTED', 'Glazed ham')],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [DECLINE('a1'), PATCH(false), GET] },
    markedLine: false,
    allSet: true,
  },
  {
    key: 'stored-no-then-yes-on-dish',
    what: 'answered no to coming, then tapped Yes on a dish (the server reads her as coming)',
    data: guest({
      attendanceAnswer: 'NO',
      attendance: 'YES',
      assignments: [row('a1', 'ACCEPTED', 'Glazed ham')],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'No',
    calls: { Yes: [], No: [DECLINE('a1'), PATCH(false), GET] },
    markedLine: false,
    allSet: true,
  },
  {
    key: 'pending-after-yes',
    what: 'answered yes, then a dish given and not answered yet',
    data: guest({
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: [row('p1', 'PENDING', 'Bread rolls')],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [DECLINE('p1'), PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'maybe-after-yes',
    what: 'answered yes, then a maybe on a dish',
    data: guest({
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: [row('m1', 'MAYBE', 'Pavlova')],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [DECLINE('m1'), PATCH(false), GET] },
    markedLine: false,
    allSet: true,
  },
  {
    key: 'stored-no-pending',
    what: 'answered no, then a dish given and not answered yet (not every dish is No)',
    data: guest({
      attendanceAnswer: 'NO',
      attendance: 'NO',
      assignments: [row('p1', 'PENDING', 'Bread rolls')],
    }),
    box: true,
    marked: 'No',
    markedBase: 'No',
    calls: { Yes: [PATCH(true), GET], No: [] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'mixed-and-child',
    what: 'answered yes; her four dishes (pending, yes, no, maybe) and a child’s two (yes, pending)',
    data: guest({
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: MIXED_OWN,
      carried: [CHILD],
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [DECLINE('p1'), DECLINE('a1'), DECLINE('m1'), PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'closed-event',
    what: 'the same, on a closed event (the page does not read the status; neither route gates on it)',
    data: guest({
      attendanceAnswer: 'YES',
      attendance: 'YES',
      assignments: MIXED_OWN,
      carried: [CHILD],
      event: { ...EVENT, status: 'COMPLETE' },
    }),
    box: true,
    marked: 'Yes',
    markedBase: 'Yes',
    calls: { Yes: [], No: [DECLINE('p1'), DECLINE('a1'), DECLINE('m1'), PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'ask-after-no',
    what: 'every dish declined, not answered: the first-time box (unchanged)',
    data: guest({ attendanceAskable: true, assignments: [row('d1', 'DECLINED', 'Potato salad')] }),
    box: false,
    marked: null,
    markedBase: null,
    calls: { 'Yes, still coming': [PATCH(true), GET], "Can't make it": [PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'ask-itemless',
    what: 'nothing to bring, not answered: "Are you coming?" (unchanged)',
    data: guest({ attendanceAskable: true }),
    box: false,
    marked: null,
    markedBase: null,
    calls: { 'Yes, still coming': [PATCH(true), GET], "Can't make it": [PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
  {
    key: 'accepted-not-asked',
    what: 'a dish accepted, never asked about coming: no box (unchanged)',
    data: guest({ attendance: 'YES', assignments: [row('a1', 'ACCEPTED', 'Glazed ham')] }),
    box: false,
    marked: null,
    markedBase: null,
    calls: {},
    markedLine: false,
    allSet: true,
  },
  {
    key: 'child-only',
    what: 'nothing of her own, a child’s carried dishes, not asked: "Are you coming?" (unchanged)',
    data: guest({ attendanceAskable: true, carried: [CHILD] }),
    box: false,
    marked: null,
    markedBase: null,
    calls: { 'Yes, still coming': [PATCH(true), GET], "Can't make it": [PATCH(false), GET] },
    markedLine: false,
    allSet: false,
  },
];

/** One attendance control as drawn (the first-time box's or the answered box's). */
export interface Control {
  words: string;
  pressed: boolean | undefined;
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
const ATTENDANCE_WORDS = /^(Yes|No|Yes, still coming|Yes, I’ll be there|Can't make it)$/;
/** Draws the page for a state (the failure flag on or off) and lists its attendance controls. */
export function draw(page: Loaded, data: unknown, failedFlag = false): Drawn {
  slots = [data, null, false, null, new Set(), failedFlag];
  slot = 0;
  const tree = page.View();
  const controls: Control[] = [];
  const walk = (n: any) => {
    if (n === null || n === undefined || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (!ReactAll.isValidElement(n)) return;
    const p = n.props as any;
    if (typeof n.type === 'function') return; // the dish cards: their buttons are not the box's
    if (n.type === 'button') {
      const words = textOf(p.children).replace(/\s+/g, ' ').trim();
      if (ATTENDANCE_WORDS.test(words))
        controls.push({ words, pressed: p['aria-pressed'], onClick: p.onClick });
    }
    walk(p.children);
  };
  walk(tree);
  return { html: renderToStaticMarkup(tree), controls };
}
/**
 * Presses a control with `fetch` recorded (nothing leaves the process). `answer(i)` says how the
 * i-th call is answered: 'ok', a status (refused), or 'throw' (the network failed).
 */
export async function press(
  c: Control,
  data: unknown,
  answer: (i: number, call: string) => 'ok' | number | 'throw' = () => 'ok',
  twice = false
): Promise<{ calls: string[]; sets: Array<[number, unknown]> }> {
  const calls: string[] = [];
  const real = globalThis.fetch;
  sets = [];
  globalThis.fetch = (async (url: string, init?: { method?: string; body?: string }) => {
    const call = `${init?.method ?? 'GET'} ${url}${init?.body ? ` ${init.body}` : ''}`;
    calls.push(call);
    const a = answer(calls.length - 1, call);
    await sleep(5);
    if (a === 'throw') throw new TypeError('network down (made up here)');
    const status = a === 'ok' ? 200 : a;
    return { ok: status < 400, status, json: async () => data } as unknown as Response;
  }) as typeof fetch;
  try {
    if (twice) await Promise.all([c.onClick?.({}), c.onClick?.({})]);
    else await c.onClick?.({});
  } finally {
    globalThis.fetch = real;
  }
  return { calls, sets: [...sets] };
}
/** The answered box's markup: from its card to the note that ends it. */
const answeredBox = (html: string) =>
  between(
    html,
    '<div class="bg-white rounded-xl p-8 shadow-sm border border-gray-200 mb-6 text-center"><h2',
    `${NOTE}</p></div>`
  );

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** P1 — the page is the base with exactly Ticket I's pieces, byte for byte. */
  exactly(now: string, base: string) {
    const expected = base.length > 1000 ? applyPairs(base, I_PAIRS) : null;
    return expected !== null && now === expected;
  },
  /** P2 — the read and the two answer calls as before, byte for byte; the imports as before. */
  oldCallsAsBefore(now: string, base: string) {
    const was = between(base, M_CALLS_FROM, M_CALLS_TO);
    const imports = (s: string) =>
      s
        .split('\n')
        .filter((l) => /^import /.test(l))
        .join('\n');
    return (
      was.length > 2000 &&
      between(now, M_CALLS_FROM, M_CALLS_TO) === was &&
      imports(now) === imports(base) &&
      count(codeOnly(now), 'fetch(') === count(codeOnly(base), 'fetch(') + 2
    );
  },
  /** P3 — the new handler: the dish answer DECLINED on her own rows, then the attendance No; no timer. */
  handler(now: string) {
    const h = codeOnly(between(now, '  const handleNotComing = async () => {', '\n  };\n'));
    const decline =
      'fetch(`/api/p/${token}/ack/${a.id}`, {\n' +
      "          method: 'POST',\n" +
      "          headers: { 'Content-Type': 'application/json' },\n" +
      "          body: JSON.stringify({ response: 'DECLINED' }),\n" +
      '        });';
    const no =
      'fetch(`/api/p/${token}`, {\n' +
      "        method: 'PATCH',\n" +
      "        headers: { 'Content-Type': 'application/json' },\n" +
      '        body: JSON.stringify({ attending: false }),\n' +
      '      });';
    return (
      h.length > 300 &&
      count(h, 'fetch(') === 2 &&
      h.includes(decline) &&
      h.includes(no) &&
      h.indexOf(decline) < h.indexOf(no) &&
      /data\.assignments\.filter\(\(a\) => a\.response !== 'DECLINED'\)/.test(h) &&
      !/carried/.test(h) &&
      !/setTimeout|setInterval/.test(codeOnly(now))
    );
  },
  /** B1 — every attendance control makes exactly the calls typed here, in order. */
  calls(got: Record<string, string[]>, want: Record<string, string[]>) {
    return JSON.stringify(got) === JSON.stringify(want);
  },
  /** B4 — the answered box is drawn now exactly where it was drawn at the base. */
  sameBoxPlaces(now: string, base: string, box: boolean) {
    return answeredBox(now).length > 0 === box && answeredBox(base).length > 0 === box;
  },
  /** B5 — one attendance button marked, the derived answer's; the marked one sends nothing. */
  marked(controls: Control[], want: 'Yes' | 'No' | null) {
    const marks = controls.filter((c) => c.pressed !== undefined);
    if (want === null) return marks.length === 0;
    const on = marks.filter((c) => c.pressed === true);
    return (
      marks.map((c) => c.words).join(',') === 'Yes,No' &&
      on.length === 1 &&
      on[0].words === want &&
      on[0].onClick === undefined &&
      marks.filter((c) => c.pressed === false).every((c) => typeof c.onClick === 'function')
    );
  },
  /** B6 — never "We'll miss you" beside "You're all set"; her answer's words in the box. */
  words(html: string, s: State) {
    const box = answeredBox(html);
    const [h, l] = s.marked === 'Yes' ? [YES_HEADING, YES_LINE] : [NO_HEADING, NO_LINE];
    return (
      !(html.includes(NO_LINE) && html.includes(ALL_SET)) &&
      count(html, ALL_SET) === (s.allSet ? 1 : 0) &&
      (s.marked === null
        ? box === '' && !html.includes(NO_LINE) && !html.includes(YES_LINE)
        : count(box, h) === 1 &&
          count(box, l) === 1 &&
          count(html, s.marked === 'Yes' ? NO_LINE : YES_LINE) === 0)
    );
  },
  /** B7 — the new line: once, under "We'll miss you at the event!", only when ruled; never the failure line. */
  markedLine(html: string, show: boolean) {
    const box = answeredBox(html);
    return show
      ? count(html, MARKED_LINE) === 1 &&
          box.indexOf(MARKED_LINE) > box.indexOf(NO_LINE) &&
          box.indexOf(NO_LINE) > 0 &&
          !html.includes(FAILED_LINE)
      : count(html, MARKED_LINE) === 0 && !html.includes(FAILED_LINE);
  },
  /** B8 — a failure: the calls stop where typed, the page is read again, the flag is set. */
  failure(got: { calls: string[]; sets: Array<[number, unknown]> }, want: string[]) {
    return (
      JSON.stringify(got.calls) === JSON.stringify(want) &&
      got.sets.some(([i, v]) => i === 5 && v === true)
    );
  },
  /** B8 — with the flag on, the failure line once, inside the answered box. */
  failureLine(html: string) {
    return count(html, FAILED_LINE) === 1 && answeredBox(html).includes(FAILED_LINE);
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

function layerP(now: string, base: string) {
  section('P — the guest page’s source, against GTC-423’s tip');
  assert(
    'P',
    'P1 the page is the base’s file with exactly Ticket I’s pieces, byte for byte (the failure flag and the press guard; the new handler; the shown answer; the answered box)',
    CHECKS.exactly(now, base)
  );
  assert(
    'P',
    'P2 the page’s read, its attendance answer (PATCH /api/p/<link>) and its dish answer (POST /api/p/<link>/ack/<id>) are byte for byte as before, the imports too; exactly two fetch calls added, both in the new handler',
    CHECKS.oldCallsAsBefore(now, base)
  );
  assert(
    'P',
    'P3 the new handler sends the dish answer DECLINED, as a dish’s No sends it, for each of her own rows not declined (data.assignments, never the carried rows), and then the attendance No, as the box’s No sent it; no timer anywhere on the page',
    CHECKS.handler(now)
  );
}

async function layerB(now: string, base: string) {
  section('B — the page itself, drawn here for made-up guests, every attendance control pressed');
  const pageNow = loadPage(now);
  const pageBase = loadPage(base);
  const loaded = !!pageNow && !!pageBase;
  const red: Record<string, string[]> = {};
  const fail = (k: string, s: string) => (red[k] = [...(red[k] ?? []), s]);
  const yesBase: Record<string, string> = {};
  for (const s of STATES) {
    if (!loaded) break;
    const dn = draw(pageNow!, s.data);
    const db = draw(pageBase!, s.data);
    const got: Record<string, string[]> = {};
    for (const c of dn.controls) {
      if (c.words in got) fail('B1', `${s.key}: two "${c.words}"`);
      got[c.words] = c.onClick ? (await press(c, s.data)).calls : [];
    }
    if (!CHECKS.calls(got, s.calls)) fail('B1', `${s.key} ${JSON.stringify(got)}`);
    // Yes, and the first-time box, do what they did: the same calls as at the base.
    for (const c of db.controls) {
      if (c.words === 'No') continue;
      const was = c.onClick ? (await press(c, s.data)).calls : [];
      const mine = got[c.words];
      yesBase[`${s.key}:${c.words}`] = JSON.stringify(was);
      if (
        mine === undefined ||
        (JSON.stringify(mine) !== JSON.stringify(was) &&
          !(s.key === 'stored-no-then-yes-on-dish' && c.words === 'Yes'))
      )
        fail('B2', `${s.key}:${c.words}`);
    }
    if (!CHECKS.sameBoxPlaces(dn.html, db.html, s.box)) fail('B3', s.key);
    if (!CHECKS.marked(dn.controls, s.marked)) fail('B4', s.key);
    if (!CHECKS.marked(db.controls, s.markedBase)) fail('B4', `${s.key} (base)`);
    if (!CHECKS.words(dn.html, s)) fail('B5', s.key);
    if (!CHECKS.markedLine(dn.html, s.markedLine)) fail('B6', s.key);
  }
  const keys = (k: string) => (loaded ? (red[k] ?? []).join('; ') : 'the page did not load');
  const green = (k: string) => loaded && !(k in red);
  const names = STATES.map((s) => s.key).join(', ');
  assert(
    'B',
    `B1 in every state (${names}) each attendance control makes exactly the calls typed here, in order: "No" declines each of her own undeclined dishes first (pending, accepted, maybe; never one already declined, never a child’s), then sends the attendance No, then reads the page again; with nothing undeclined it sends the attendance No alone; a marked button sends nothing`,
    green('B1'),
    keys('B1')
  );
  assert(
    'B',
    'B2 "Yes" and the first-time box’s two buttons make the same calls as at the base, in every state (where "Yes" is now the marked one, because a dish was accepted, it sends nothing)',
    green('B2'),
    keys('B2')
  );
  assert(
    'B',
    'B3 the answered box is drawn in exactly the states it was drawn at the base, and nowhere else',
    green('B3'),
    keys('B3')
  );
  assert(
    'B',
    'B4 the box marks her derived answer: Yes wherever a dish of hers is accepted (stored No beside an accepted dish included; at the base that state marked No), otherwise her stored answer',
    green('B4'),
    keys('B4')
  );
  assert(
    'B',
    'B5 the box’s words follow the mark: "Great — we’ll see you there." / "Your host knows to expect you." or "Thanks for letting us know" / "We’ll miss you at the event!"; "We’ll miss you" and "You’re all set" are never drawn together',
    green('B5'),
    keys('B5')
  );
  assert(
    'B',
    `B6 "We’ve marked your items No, so your host knows to find someone else." is drawn once, under "We’ll miss you at the event!", when her answer reads No and every dish of hers is No; nowhere else; the failure line is not drawn before a failure`,
    green('B6'),
    keys('B6')
  );

  section('B — failures, and a second press');
  const mixed = STATES.find((s) => s.key === 'mixed-and-child')!;
  const noOf = (p: Loaded) => draw(p, mixed.data).controls.find((c) => c.words === 'No')!;
  const f = loaded
    ? {
        first500: await press(noOf(pageNow!), mixed.data, (i) => (i === 0 ? 500 : 'ok')),
        firstThrow: await press(noOf(pageNow!), mixed.data, (i) => (i === 0 ? 'throw' : 'ok')),
        second409: await press(noOf(pageNow!), mixed.data, (i) => (i === 1 ? 409 : 'ok')),
        patch409: await press(noOf(pageNow!), mixed.data, (i) => (i === 3 ? 409 : 'ok')),
        twice: await press(noOf(pageNow!), mixed.data, () => 'ok', true),
        ok: await press(noOf(pageNow!), mixed.data),
      }
    : null;
  assert(
    'B',
    'B7 the first decline refused (500): nothing more is sent, no attendance No; the page is read again; the failure flag is set',
    !!f && CHECKS.failure(f.first500, [DECLINE('p1'), GET]),
    JSON.stringify(f?.first500)
  );
  assert(
    'B',
    'B8 the network failing on the first decline: the same (nothing more, read again, flag set)',
    !!f && CHECKS.failure(f.firstThrow, [DECLINE('p1'), GET]),
    JSON.stringify(f?.firstThrow)
  );
  assert(
    'B',
    'B9 the second decline refused: the first was sent, nothing after the second, no attendance No; read again; flag set',
    !!f && CHECKS.failure(f.second409, [DECLINE('p1'), DECLINE('a1'), GET]),
    JSON.stringify(f?.second409)
  );
  assert(
    'B',
    'B10 the attendance No refused (409): every decline sent once, then the No, then read again; flag set',
    !!f &&
      CHECKS.failure(f.patch409, [DECLINE('p1'), DECLINE('a1'), DECLINE('m1'), PATCH(false), GET]),
    JSON.stringify(f?.patch409)
  );
  assert(
    'B',
    'B11 a second press while the first is still going sends nothing: at most one call per undeclined dish of hers and one attendance call; a press that goes through sets no failure',
    !!f &&
      JSON.stringify(f.twice.calls) === JSON.stringify(mixed.calls.No) &&
      JSON.stringify(f.ok.calls) === JSON.stringify(mixed.calls.No) &&
      !f.ok.sets.some(([i, v]) => i === 5 && v === true),
    JSON.stringify({ twice: f?.twice.calls, ok: f?.ok })
  );
  const flagged = loaded ? draw(pageNow!, mixed.data, true).html : '';
  const flaggedNo = loaded
    ? draw(pageNow!, STATES.find((s) => s.key === 'declined-only-no')!.data, true).html
    : '';
  assert(
    'B',
    `B12 with the failure flag on, "That didn’t go through. Please tap No again." is drawn once, in the answered box`,
    loaded && CHECKS.failureLine(flagged) && CHECKS.failureLine(flaggedNo),
    flagged.length ? answeredBox(flagged).slice(-400) : 'did not draw'
  );
}

// ══ C — the browser; every /api/p/ request answered by the browser itself ═════
/** The state a made-up link reads, and what the page reads after its press (each typed here). */
const C_BEFORE = STATES.find((s) => s.key === 'mixed-and-child')!.data;
const C_AFTER = guest({
  attendanceAskable: true,
  attendanceAnswer: 'NO',
  attendance: 'NO',
  assignments: MIXED_OWN.map((r) => ({ ...r, response: 'DECLINED' })),
  carried: [CHILD],
});
const C_STORED_NO = STATES.find((s) => s.key === 'stored-no-then-yes-on-dish')!.data;

async function layerC() {
  section('C — the page in headless Chrome at 390, every /api/p/ request answered in the browser');
  const up = await realFetch(`${BASE_URL}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  let chrome: Headless | null = null;
  let ws: any = null;
  const seen: string[] = [];
  const failedNonGet: string[] = [];
  const wall = { state: C_BEFORE as unknown, after: C_AFTER as unknown, failAt: -1, calls: 0 };
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    const targets = (await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as any[];
    ws = new (globalThis as any).WebSocket(
      targets.find((t) => t.type === 'page').webSocketDebuggerUrl
    );
    await new Promise((res) => ws.addEventListener('open', res));
    let id = 0;
    const pending = new Map<number, () => void>();
    const send = (method: string, params: Record<string, unknown>) =>
      new Promise<void>((res) => {
        const i = ++id;
        pending.set(i, res);
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    const answer = (requestId: string, status: number, body: unknown) =>
      send('Fetch.fulfillRequest', {
        requestId,
        responseCode: status,
        responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      });
    ws.addEventListener('message', (e: { data: string }) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)!();
        pending.delete(m.id);
      }
      if (m.method !== 'Fetch.requestPaused') return;
      const { requestId, request } = m.params;
      const u = new URL(request.url);
      if (u.pathname.startsWith('/api/p/')) {
        const call = `${request.method} ${u.pathname}${request.postData ? ` ${request.postData}` : ''}`;
        seen.push(call);
        if (request.method === 'GET') {
          void answer(requestId, 200, wall.state);
          return;
        }
        const i = wall.calls++;
        if (i === wall.failAt) {
          void answer(requestId, 500, { error: 'made up here' });
          return;
        }
        if (request.method === 'PATCH') wall.state = wall.after;
        void answer(requestId, 200, { success: true });
        return;
      }
      if (request.method !== 'GET') {
        failedNonGet.push(`${request.method} ${u.pathname}`);
        void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
        return;
      }
      void send('Fetch.continueRequest', { requestId });
    });
    await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
    await c.setViewport(390, 844, true);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const waitFor = async (js: string, ms = 20000) => {
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
    const BOX = `[...document.querySelectorAll('h2')].find((h) => /see you there|letting us know/.test(h.textContent))?.parentElement`;
    const facts = `(() => { const b = ${BOX}; if (!b) return null;
      const btn = (w) => [...b.querySelectorAll('button')].find((x) => x.textContent.trim() === w);
      return { heading: b.querySelector('h2').textContent.trim(), text: b.innerText,
        yes: btn('Yes')?.getAttribute('aria-pressed'), no: btn('No')?.getAttribute('aria-pressed'),
        allSet: document.body.innerText.includes('You\\'re all set. See you there.') }; })()`;
    const open = async (state: unknown, after: unknown, failAt: number) => {
      wall.state = state;
      wall.after = after;
      wall.failAt = failAt;
      wall.calls = 0;
      seen.length = 0;
      await c.navigate(`/p/${TOKEN}`, 300);
      await waitFor(`${BOX}`);
      await sleep(400);
      seen.length = 0;
    };
    const tapIn = async (words: string) => {
      await ev(
        `(() => { const b = ${BOX}; const x = [...b.querySelectorAll('button')].find((y) => y.textContent.trim() === ${JSON.stringify(words)}); x.setAttribute('data-gtc424-tap', ''); return true; })()`
      );
      return c.clickGuarded('[data-gtc424-tap]', 1500);
    };

    // C1: her four dishes and a child's two; she taps No.
    await open(C_BEFORE, C_AFTER, -1);
    const f0 = await ev<any>(facts);
    const why1 = await tapIn('No');
    await waitFor(`${BOX} && ${BOX}.innerText.includes('marked your items No')`);
    const f1 = await ev<any>(facts);
    r.C1 =
      why1 === null &&
      f0?.yes === 'true' &&
      JSON.stringify(seen) ===
        JSON.stringify([
          `POST /api/p/${TOKEN}/ack/p1 {"response":"DECLINED"}`,
          `POST /api/p/${TOKEN}/ack/a1 {"response":"DECLINED"}`,
          `POST /api/p/${TOKEN}/ack/m1 {"response":"DECLINED"}`,
          `PATCH /api/p/${TOKEN} {"attending":false}`,
          `GET /api/p/${TOKEN}`,
        ]) &&
      f1?.no === 'true' &&
      f1?.heading === 'Thanks for letting us know' &&
      f1?.text.includes("We'll miss you at the event!") &&
      f1?.text.includes("We've marked your items No, so your host knows to find someone else.") &&
      f1?.allSet === false;
    detail.C1 = JSON.stringify({ why1, f0, seen: [...seen], f1 });

    // C2: the first decline refused.
    await open(C_BEFORE, C_AFTER, 0);
    const why2 = await tapIn('No');
    await waitFor(`${BOX} && ${BOX}.innerText.includes('go through')`);
    const f2 = await ev<any>(facts);
    r.C2 =
      why2 === null &&
      JSON.stringify(seen) ===
        JSON.stringify([
          `POST /api/p/${TOKEN}/ack/p1 {"response":"DECLINED"}`,
          `GET /api/p/${TOKEN}`,
        ]) &&
      f2?.text.includes("That didn't go through. Please tap No again.") &&
      f2?.yes === 'true';
    detail.C2 = JSON.stringify({ why2, seen: [...seen], f2 });

    // C3: stored No beside an accepted dish: Yes is marked (not "We'll miss you"); No declines it first.
    await open(
      C_STORED_NO,
      guest({
        attendanceAnswer: 'NO',
        attendance: 'NO',
        attendanceAskable: true,
        assignments: [row('a1', 'DECLINED', 'Glazed ham')],
      }),
      -1
    );
    const f3a = await ev<any>(facts);
    const why3 = await tapIn('No');
    await waitFor(`${BOX} && ${BOX}.innerText.includes('marked your items No')`);
    r.C3 =
      why3 === null &&
      f3a?.yes === 'true' &&
      f3a?.no === 'false' &&
      f3a?.heading === "Great — we'll see you there." &&
      !f3a?.text.includes("We'll miss you") &&
      f3a?.allSet === true &&
      JSON.stringify(seen) ===
        JSON.stringify([
          `POST /api/p/${TOKEN}/ack/a1 {"response":"DECLINED"}`,
          `PATCH /api/p/${TOKEN} {"attending":false}`,
          `GET /api/p/${TOKEN}`,
        ]);
    detail.C3 = JSON.stringify({ why3, f3a, seen: [...seen] });
  } catch (e) {
    console.error('    chrome threw:', (e as Error).message.split('\n')[0]);
  }
  const hosts = chrome?.hostsRequested() ?? [];
  const dialogs = chrome?.dialogs() ?? ['no chrome'];
  try {
    ws?.close();
  } catch {
    // already closed
  }
  chrome?.close();
  assert(
    'C',
    'C1 (390) her four dishes (pending, yes, no, maybe) and a child’s two; a real tap on No: the browser saw exactly the declines of p1, a1 and m1 in order, then the attendance No, then the page’s read; never d1, c1 or c2; then No is marked with "We’ll miss you" and the new line, and no "You’re all set"',
    r.C1 === true,
    detail.C1
  );
  assert(
    'C',
    'C2 (390) the first decline answered 500: nothing more was sent (no second decline, no attendance No), the page read again, "That didn’t go through. Please tap No again." shown',
    r.C2 === true,
    detail.C2
  );
  assert(
    'C',
    'C3 (390) a stored No beside an accepted dish: Yes is marked and the page says "Great — we’ll see you there." with "You’re all set" and no "We’ll miss you"; No declines that dish, then sends the attendance No',
    r.C3 === true,
    detail.C3
  );
  assert(
    'C',
    'C4 CONTROL: every /api/p/ request was answered by the browser (none reached the server); no other request but a read; no dialog; no host but this Mac; no provider reached',
    failedNonGet.length === 0 &&
      dialogs.length === 0 &&
      hosts.every((x) => /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(x)) &&
      trapHits().length === 0 &&
      r.C1 === true,
    JSON.stringify({ failedNonGet, dialogs, hosts })
  );
}

function layerU() {
  section('U — CONTROL: what Ticket I touched, between fixed commits');
  const d1 = git(['diff', '--name-only', BASE, CODE_I]);
  assert(
    'U',
    `U1 the files changed between GTC-423’s tip (${BASE.slice(0, 7)}) and Ticket I’s code commit (${CODE_I.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')} (no route, no rule, no shared library)`,
    CHECKS.sameList(d1.status === 0 ? d1.stdout : null, CODE_FILES),
    d1.stdout
  );
  assert(
    'U',
    'U2 the code commit stands straight on GTC-423’s tip (its one parent)',
    git(['rev-parse', `${CODE_I}^@`]).stdout.trim() === BASE
  );
  const d3 = git(['diff', '--name-only', CODE_I, REBASE_I]);
  assert(
    'U',
    `U3 the re-base commit (${REBASE_I.slice(0, 7)}) stands on the code commit and changed exactly: ${REBASE_FILES.join(', ')}`,
    git(['rev-parse', `${REBASE_I}^@`]).stdout.trim() === CODE_I &&
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
      git(['rev-parse', `${addCommit}^`]).stdout.trim() === REBASE_I &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(REBASE_I, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..${OWN_TIP_I}`, '--', f]).stdout.trim().length > 0
  );
  const zones = git([
    'diff',
    '--name-only',
    BASE,
    OWN_TIP_I,
    '--',
    'src/app/api',
    'src/lib',
    'prisma',
  ]);
  assert(
    'U',
    `U5 neither untracked script is in any commit from the base to this ticket’s own commit (${OWN_TIP_I.slice(0, 7)}), and nothing under src/app/api, src/lib or prisma changed in that range (the answer routes and the attendance rules included)`,
    tracked.length === 0 && zones.status === 0 && zones.stdout.trim() === '',
    `${tracked.join(', ')} ${zones.stdout}`
  );
}

async function main() {
  installProviderTrap();
  const now = read(PAGE);
  const base = atRef(BASE, PAGE);
  layerP(now, base);
  await layerB(now, base);
  await layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS and the helpers only (TWEAKS_I_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_I_DRY_RUN !== '1') void main();
