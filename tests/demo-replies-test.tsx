/**
 * [[GTC-445]] — "MAKE THE GUESTS REPLY", ON A SAMPLE COPY'S BOARD.
 *
 * Founder rulings, 1 Nov 2026 (Q7, Q16: W49 to W56 as in the GTC-392 plan) and at the build, 2 Nov
 * 2026 (O1 to O13): a button on a sample copy's board, in its own client file, posts
 * `{ demoReplies: true }` to the households route, read after its guard. src/lib/demo/replies.ts
 * answers for the sample guests in one transaction, through their own writers, once. The mix is
 * fixed by Person id order over the guests who answer (every 6th none, beating every 5th, which
 * declines one item, beating every 4th, maybe; the rest accept; an itemless guest answers
 * attendance, the first of them no). The host, the fixed guest, the kids and anyone with no
 * address and no phone are left. Refused 409 with W55 (not a copy), W56 (nobody), W53 (again).
 * After a press the board is loaded again by her click (no router.refresh, O11).
 *
 *   P  preconditions: gather_demo, the guarded dev server, no copy at the start, a5e59c3's server
 *   W  the words: W49 to W56 as the plan wrote them
 *   B  the button: drawn in each state; its source; the board page a5e59c3's plus exactly it; on a
 *      copy's board only
 *   S  the shape: W55 on a real event and the old sample's shape; the guard first; W56; the press;
 *      W53 again; two presses at once answer once
 *   M  the mix: the board before; each person after; the totals; the fixed guest, June and the kids
 *      left; the same every time; the pure mix over 30 places; a guest with no household role
 *      answers like any adult, a kid does not (M6)
 *   R  the writers: every row has its writer's audit line; the source; the replay
 *   PA parity with the guest's own attendance PATCH
 *   N  nothing sent
 *   C  CONTROL: a real event's households POST as a5e59c3's server answers it
 *   Z  every probe row removed by id; the counts back; prisma/ and tokens.ts as at a5e59c3
 *
 * Routes run over HTTP on the guarded dev server (DEMO_SANDBOX_BASE_URL, default
 * http://localhost:3000). The comparison server is a5e59c3's tree, exported by `git archive` into
 * a folder outside the repo and served on :3101 against the same gather_demo (GTC445_PARENT_URL,
 * if set, names one already running). Links are minted in process by `ensureEventTokens`, the
 * call the hold makes. The board's state and replay are read in process (readEventGlance,
 * readGlanceReplay), as the board page reads them.
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). Every
 * address is made up (@gtc445.invalid, or a copy's own tag under demo-copy.invalid). Nothing here
 * sends, queues, presses Send or calls the AI, and no guest link is opened (GET). Teardown deletes
 * this run's rows by id.
 *
 * Every live condition lives in CHECKS (DEMO_REPLIES_DRY_RUN=1 imports CHECKS only). Expected
 * pieces are typed here by hand or read from the plan, never taken from the code under test.
 *
 *   npx tsx --tsconfig tests/tsconfig.json tests/demo-replies-test.tsx
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
/** The comparison tree: this ticket's starting commit (a fixed commit). */
const PARENT = 'a5e59c3c53aca226f31e69fa735c18780d1f3274';
const PARENT_PORT = 3101;
const RUN = randomBytes(4).toString('hex');
const TAG = `gtc445-${RUN}`;
const addr = (local: string) => `${local}-${RUN}@gtc445.invalid`;
const COPY_DOMAIN = '@demo-copy.invalid';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const BOARD = 'src/app/plan/[eventId]/glance/page.tsx';
const GLANCE_BOARD = 'src/components/glance/GlanceBoard.tsx';
const TOGGLE = 'src/components/demo/SampleViewToggle.tsx';
const BUTTON = 'src/components/demo/GuestRepliesButton.tsx';
const WORDS_FILE = 'src/lib/demo/replies-words.ts';
const REPLIES = 'src/lib/demo/replies.ts';
const KEPT = [
  'src/lib/assignment/answer.ts',
  'src/lib/workflow.ts',
  'src/app/api/p/[token]/route.ts',
  'src/app/api/p/[token]/ack/[assignmentId]/route.ts',
  'src/lib/demo/sample-board.ts',
];

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

// ── Sources ──────────────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const atRef = (ref: string, rel: string) => {
  const r = spawnSync('git', ['show', `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  return r.status === 0 ? r.stdout : '';
};
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const count = (s: string, needle: string) => s.split(needle).length - 1;
type Pairs = Array<[string, string]>;
function applyPairs(base: string, pairs: Pairs): string | null {
  let s = base;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

/** The W-lines as the plan wrote them (GTC-392, "W-lines"), each joined onto one line. */
export function planLines(plan: string): Record<string, string> {
  const from = plan.indexOf('## W-lines (every sentence a visitor reads, from W42)');
  const to = plan.indexOf('## Questions for the founder', from);
  const out: Record<string, string> = {};
  if (from < 0 || to < 0) return out;
  for (const item of plan
    .slice(from, to)
    .split(/\n- (?=W\d+ )/)
    .slice(1)) {
    const one = item
      .split('\n')
      .map((l) => l.trim())
      .join(' ')
      .trim();
    const m = /^(W\d+) \([^)]*\): "(.*)"$/.exec(one);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ── The pieces GTC-445 adds to the board page, typed by hand ─────────────────
export const PAGE_PAIRS: Pairs = [
  [
    "import SampleViewToggle from '@/components/demo/SampleViewToggle';\n",
    "import SampleViewToggle from '@/components/demo/SampleViewToggle';\n" +
      "import GuestRepliesButton from '@/components/demo/GuestRepliesButton';\n",
  ],
  [
    '        {sample && <SampleViewToggle eventId={eventId} view={sample} />}\n',
    '        {sample && <SampleViewToggle eventId={eventId} view={sample} />}\n' +
      '        {sample?.guest && (\n' +
      '          <GuestRepliesButton eventId={eventId} guestFirstName={sample.guest.firstName} />\n' +
      '        )}\n',
  ],
];

export interface Words {
  BUTTON: string;
  WORKING: string;
  ALREADY: string;
  FAILED: string;
  NOT_A_SAMPLE: string;
  NOBODY: string;
}
type Res = { status: number; text: string };
type States = Record<string, string>;

/** The fixture's crowd guests who answer, in the order the crowd makes them (Person id). */
export const ANSWERING = [
  'Wiremu Ngata',
  'Priya Sharma',
  'Dev Sharma',
  'Tom Brennan',
  'Jess Brennan',
  'Sione Taufa',
  'Lupe Taufa',
  'Grace Liu',
  'Hemi Walker',
  'Sophie Martin',
  'Ben Clarke',
  'Raj Mehta',
  'Anjali Mehta',
  "Megan O'Neill",
  "Liam O'Neill",
  'Ana Tupou',
  'Josh Ellis',
  'Chris Taylor',
];
/** O12: items each holds in the fixture plan (Aroha holds one; June and the kids none). */
export const ITEMS_HELD: Record<string, number> = {
  'Dev Sharma': 0,
  'Hemi Walker': 0,
  'Sophie Martin': 2,
  "Liam O'Neill": 2,
};
const KIDS = ['Mere Ngata', 'Ollie Brennan', 'Mele Taufa', 'Kiran Mehta'];

/** The board before the press, typed by hand. */
export const BEFORE: States = {
  ...Object.fromEntries(ANSWERING.map((n) => [n, 'AMBER'])),
  'Aroha Ngata': 'AMBER',
  'June Walker': 'RED',
  ...Object.fromEntries(KIDS.map((n) => [n, 'NOT_CHASED'])),
  Sam: 'GREEN',
};
/** The board after the press, by the mix (O4, O7), typed by hand. */
export const AFTER: States = {
  'Wiremu Ngata': 'GREEN',
  'Priya Sharma': 'GREEN',
  'Dev Sharma': 'OUT',
  'Tom Brennan': 'AMBER',
  'Jess Brennan': 'RED',
  'Sione Taufa': 'AMBER',
  'Lupe Taufa': 'GREEN',
  'Grace Liu': 'AMBER',
  'Hemi Walker': 'GREEN',
  'Sophie Martin': 'RED',
  'Ben Clarke': 'GREEN',
  'Raj Mehta': 'AMBER',
  'Anjali Mehta': 'GREEN',
  "Megan O'Neill": 'GREEN',
  "Liam O'Neill": 'RED',
  'Ana Tupou': 'AMBER',
  'Josh Ellis': 'GREEN',
  'Chris Taylor': 'AMBER',
  'Aroha Ngata': 'AMBER',
  'June Walker': 'RED',
  ...Object.fromEntries(KIDS.map((n) => [n, 'NOT_CHASED'])),
  Sam: 'GREEN',
};
export const AFTER_TOTALS = { GREEN: 9, AMBER: 7, RED: 4, OUT: 1, NOT_CHASED: 4 };
/** The pure mix over 30 places: places 3, 9 and 24 hold no item, place 10 two, the rest one. */
export const MIX_COUNTS = Array.from({ length: 30 }, (_, i) =>
  [3, 9, 24].includes(i + 1) ? 0 : i + 1 === 10 ? 2 : 1
);
export const MIX_EXPECTED = 'A A NO M D - A M YES DA A - A A D M A - A D A A A - D A A M A -'.split(
  ' '
);

const tally = (s: States) => {
  const out: Record<string, number> = {};
  for (const v of Object.values(s)) out[v] = (out[v] ?? 0) + 1;
  return out;
};
const sameStates = (a: States, b: States) =>
  Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** W1: W49 to W56 in the words file are the plan's, character for character. */
  wordsAsPlanned(
    w: Words | null,
    explain: ((f: string) => string) | null,
    done: ((n: any) => string) | null,
    plan: Record<string, string>
  ): boolean {
    if (!w || !explain || !done) return false;
    const want = ['W49', 'W50', 'W51', 'W52', 'W53', 'W54', 'W55', 'W56'];
    if (!want.every((k) => typeof plan[k] === 'string' && plan[k].length > 0)) return false;
    return (
      w.BUTTON === plan.W49 &&
      explain('{First}') === plan.W50 &&
      w.WORKING === plan.W51 &&
      done('{N}') === plan.W52 &&
      w.ALREADY === plan.W53 &&
      w.FAILED === plan.W54 &&
      w.NOT_A_SAMPLE === plan.W55 &&
      w.NOBODY === plan.W56
    );
  },
  /** B1: idle — one live button reading W49, W50 naming the guest, no link. */
  viewIdle(html: string, w: Words, explainLine: string): boolean {
    return (
      html.includes('data-guest-replies="idle"') &&
      count(html, '<button') === 1 &&
      !/<button[^>]*\sdisabled=""/.test(html) &&
      html.includes(`>${w.BUTTON}</button>`) &&
      html.includes(explainLine) &&
      !html.includes('<a ') &&
      !html.includes('href=')
    );
  },
  /** B2: the other five states. */
  viewStates(
    h: Record<'working' | 'done' | 'already' | 'nobody' | 'failed', string>,
    w: Words,
    explainLine: string,
    doneLine: string
  ): boolean {
    const noButton = (s: string) => !s.includes('<button');
    return (
      count(h.working, '<button') === 1 &&
      /<button[^>]*\sdisabled=""/.test(h.working) &&
      h.working.includes(`>${w.WORKING}</button>`) &&
      noButton(h.done) &&
      h.done.includes(doneLine) &&
      noButton(h.already) &&
      h.already.includes(w.ALREADY) &&
      noButton(h.nobody) &&
      h.nobody.includes(w.NOBODY) &&
      count(h.failed, '<button') === 1 &&
      !/<button[^>]*\sdisabled=""/.test(h.failed) &&
      h.failed.includes(`>${w.BUTTON}</button>`) &&
      h.failed.includes(explainLine) &&
      h.failed.includes(`role="alert"`) &&
      h.failed.includes(w.FAILED) &&
      Object.values(h).every((s) => !s.includes('<a ') && !s.includes('href='))
    );
  },
  /** B3: its own client file; posts the shape to the households route; reloads; no link. */
  buttonSource(src: string): boolean {
    const code = codeOnly(src);
    return (
      src.startsWith("'use client';\n") &&
      code.includes('demoReplies: true') &&
      code.includes('`/api/events/${eventId}/households`') &&
      code.includes("method: 'POST'") &&
      code.includes('window.location.reload()') &&
      !code.includes('<a') &&
      !code.includes('href') &&
      !code.includes("'@/lib/demo/replies'") &&
      code.includes("from '@/lib/demo/replies-words'")
    );
  },
  /** B8: the button's file exists and has no router.refresh (O11). */
  noRouterRefresh(src: string): boolean {
    return src.length > 0 && !src.includes('router.refresh');
  },
  /** B4: the page is a5e59c3's plus exactly the two pieces; GlanceBoard and the toggle as then. */
  boardPage(
    page: string,
    parentPage: string,
    board: string,
    parentBoard: string,
    toggle: string,
    parentToggle: string
  ): boolean {
    const want = applyPairs(parentPage, PAGE_PAIRS);
    return (
      want !== null &&
      page === want &&
      board.length > 0 &&
      board === parentBoard &&
      toggle.length > 0 &&
      toggle === parentToggle
    );
  },
  /** B5: a copy's board draws the button once, after the toggle, before the Moments strip. */
  copyBoard(html: string, w: Words | null, explainLine: string | null): boolean {
    if (!w || !explainLine) return false;
    const t = html.indexOf('data-sample-board');
    const b = html.indexOf('data-guest-replies="idle"');
    const m = html.indexOf('data-moment-strip');
    return (
      t >= 0 &&
      b > t &&
      m > b &&
      count(html, 'data-guest-replies') === 1 &&
      html.includes(`>${w.BUTTON}</button>`) &&
      html.includes(explainLine)
    );
  },
  /** B6, B7: no button. */
  noButton(html: string, button: string): boolean {
    return html.length > 0 && !html.includes('data-guest-replies') && !html.includes(button);
  },
  /** A 409 refusal with the code and the words. */
  refused(r: Res, code: string, words: string | undefined): boolean {
    let b: any = null;
    try {
      b = JSON.parse(r.text);
    } catch {
      b = null;
    }
    return (
      r.status === 409 &&
      !!b &&
      b.code === code &&
      typeof words === 'string' &&
      b.error === words &&
      Object.keys(b).sort().join() === 'code,error'
    );
  },
  /** S5: 200 and exactly `{ answered: N }`. */
  answered(r: Res, n: number): boolean {
    try {
      const b = JSON.parse(r.text);
      return r.status === 200 && Object.keys(b).join() === 'answered' && b.answered === n;
    } catch {
      return false;
    }
  },
  /** S7: two at once — one 200 with N, one W53, and the rows of one press. */
  onceOnly(a: Res, b: Res, n: number, w53: string | undefined, rowsOk: boolean): boolean {
    const win = [a, b].filter((r) => CHECKS.answered(r, n));
    const lose = [a, b].filter((r) => CHECKS.refused(r, 'ALREADY_REPLIED', w53));
    return win.length === 1 && lose.length === 1 && rowsOk;
  },
  /** M0, M1, M4: the states, name by name. */
  states(got: States, want: States): boolean {
    return sameStates(got, want);
  },
  /** M2 */
  totals(got: States, want: Record<string, number>): boolean {
    const t = tally(got);
    return (
      Object.keys(t).length === Object.keys(want).length &&
      Object.keys(want).every((k) => t[k] === (want as any)[k])
    );
  },
  /** M5: the pure mix, place by place. */
  mix(plans: any[] | null): boolean {
    if (!Array.isArray(plans) || plans.length !== MIX_EXPECTED.length) return false;
    const short = (p: any) =>
      p?.kind === 'NONE'
        ? '-'
        : p?.kind === 'ATTENDANCE'
          ? String(p.answer)
          : p?.kind === 'ITEMS'
            ? (p.responses as string[]).map((r) => r[0]).join('')
            : '?';
    return plans.every((p, i) => short(p) === MIX_EXPECTED[i]);
  },
  /**
   * M6 (found in review after the gate, 2 Nov 2026): `householdRole` is nullable, and the people
   * POST and the batch import leave it NULL. A NULL-role guest answers like any adult; a CHILD,
   * even with an address, does not. Two guests answer, places 1 and 2: both accept their item.
   */
  nullRole(
    r: Res,
    m: {
      nullStored: boolean;
      adult: string | null;
      nul: string | null;
      kid: string | null;
      adultAudit: number;
      nullAudit: number;
      kidAudit: number;
    }
  ): boolean {
    return (
      CHECKS.answered(r, 2) &&
      m.nullStored &&
      m.adult === 'ACCEPTED' &&
      m.nul === 'ACCEPTED' &&
      m.kid === 'PENDING' &&
      m.adultAudit === 1 &&
      m.nullAudit === 1 &&
      m.kidAudit === 0
    );
  },
  /** R2: through the writers, writing no Assignment or AuditEntry itself; the writers as then. */
  writerSource(src: string, keptSame: boolean): boolean {
    const code = codeOnly(src);
    return (
      code.includes("from '@/lib/assignment/answer'") &&
      code.includes('recordAssignmentAnswer(tx, {') &&
      code.includes('logAudit(tx, {') &&
      !/\.assignment\.(update|updateMany|upsert|create)\(/.test(code) &&
      !/\.auditEntry\.(create|createMany|update|upsert)\(/.test(code) &&
      !/\.(outboundMessage|inviteEvent|accessToken)\.(create|createMany|update|upsert)/.test(
        code
      ) &&
      !code.includes('sentAt') &&
      code.includes('FOR UPDATE') &&
      keptSame
    );
  },
  /**
   * R3 (founder ruling on R3, 2 Nov 2026): one replay step per person whose ITEM answers changed
   * and whose state moved, old to new, and no other. An attendance-only change plays no step, as
   * the rewind's existing rule holds for a real guest. src/lib/glance/rewind.ts, in its own words:
   * "an attendance row inside the window tells us THAT it changed and never WHAT TO. Rather than
   * guess, the person is marked `ambiguous` and the replay drops them entirely. That is the
   * fail-safe direction: it fails to silence, not to noise." The rewind is not edited.
   */
  replay(
    steps: Array<{ personEventId: string; from: string; to: string }> | null,
    before: Record<string, string>,
    after: Record<string, string>,
    itemMoved: readonly string[],
    want: { GREEN: number; RED: number }
  ): boolean {
    if (!Array.isArray(steps)) return false;
    const changed = Object.keys(after).filter(
      (id) => before[id] !== after[id] && itemMoved.includes(id)
    );
    const ids = steps.map((s) => s.personEventId);
    const to = (st: string) => steps.filter((s) => s.to === st).length;
    return (
      changed.length > 0 &&
      ids.length === changed.length &&
      new Set(ids).size === ids.length &&
      changed.every((id) => ids.includes(id)) &&
      steps.every((s) => s.from === before[s.personEventId] && s.to === after[s.personEventId]) &&
      ids.length === want.GREEN + want.RED &&
      to('GREEN') === want.GREEN &&
      to('RED') === want.RED
    );
  },
  /**
   * R3b: the two attendance answers are on the board as it is now (Hemi yes, green; Dev no, out),
   * stored as such, though no replay step plays for them.
   */
  attendanceOnBoard(
    after: States,
    stored: Record<string, string | null>,
    stepNames: readonly string[]
  ): boolean {
    return (
      after['Hemi Walker'] === 'GREEN' &&
      stored['Hemi Walker'] === 'YES' &&
      after['Dev Sharma'] === 'OUT' &&
      stored['Dev Sharma'] === 'NO' &&
      !stepNames.includes('Hemi Walker') &&
      !stepNames.includes('Dev Sharma')
    );
  },
  /** PA1: the same columns move, the same audit action, words and keys. */
  parity(
    a: { moved: string[]; audit: any | null; personId: string; personEventId: string },
    b: { moved: string[]; audit: any | null; personId: string; personEventId: string }
  ): boolean {
    const keys = (r: any) =>
      Object.keys(r)
        .filter((k) => r[k] !== null && r[k] !== undefined)
        .sort()
        .join();
    return (
      a.moved.join() === 'attendanceAnswer,attendanceAnsweredAt' &&
      b.moved.join() === a.moved.join() &&
      !!a.audit &&
      !!b.audit &&
      a.audit.actionType === 'ANSWER_ATTENDANCE' &&
      b.audit.actionType === a.audit.actionType &&
      b.audit.targetType === a.audit.targetType &&
      a.audit.targetType === 'PersonEvent' &&
      b.audit.details === a.audit.details &&
      keys(a.audit) === keys(b.audit) &&
      a.audit.actorId === a.personId &&
      b.audit.actorId === b.personId &&
      a.audit.targetId === a.personEventId &&
      b.audit.targetId === b.personEventId
    );
  },
  /** C1: two servers' answers, the same after ids, times and the run's tags are canonicalised. */
  sameAnswer(a: Res, b: Res): boolean {
    const canon = (s: string) =>
      s
        .replace(/c[a-z0-9]{24}/g, '<id>')
        .replace(/\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(\.\d+)?Z/g, '<t>')
        .replace(/-(dev|par)-/g, '-X-');
    return a.status === b.status && a.status > 0 && canon(a.text) === canon(b.text);
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── The database: gather_demo on this Mac only ───────────────────────────────
function dbOk(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? '');
    return u.pathname === '/gather_demo' && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}
const DB_OK = dbOk(process.env.DATABASE_URL);
let prisma: import('@prisma/client').PrismaClient;

const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessions: new Set<string>(),
};

async function http(
  base: string,
  method: string,
  p: string,
  cookie?: string,
  body?: unknown
): Promise<Res> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${base}${p}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: -1, text: String(e) };
  }
}

const TABLES = [
  'event',
  'eventSetup',
  'person',
  'user',
  'session',
  'accessToken',
  'inviteEvent',
  'outboundMessage',
  'planRevision',
  'team',
  'item',
  'household',
  'personEvent',
  'auditEntry',
  'magicLink',
  'eventRole',
  'wrapUpLink',
  'assignment',
  'nudgeLog',
  'textReply',
  'smsDeliveryReport',
] as const;
async function totals(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = await (prisma as any)[t].count();
  out.stamped = await prisma.person.count({ where: { sampleEventId: { not: null } } });
  return out;
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** An event hosted by a made-up account, signed in by a Session this run makes, with one guest. */
async function hostedEvent(label: string, isDemo: boolean, TOKENS: any) {
  const email = addr(`host-${label}`);
  const user = await prisma.user.create({ data: { email } });
  fx.users.add(user.id);
  const host = await prisma.person.create({ data: { name: 'Hana Host', email, userId: user.id } });
  fx.persons.add(host.id);
  const day = new Date(Date.UTC(2027, 0, 9));
  const ev = await prisma.event.create({
    data: {
      name: `${TAG} ${label}`,
      startDate: day,
      endDate: day,
      status: 'DRAFT',
      structureMode: 'EDITABLE',
      isLegacy: false,
      isDemo,
      guestCountConfidence: 'MEDIUM',
      dietaryStatus: 'UNSPECIFIED',
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      venueOvenCount: 0,
      hostId: host.id,
      setup: { create: {} },
    },
  });
  fx.events.add(ev.id);
  await prisma.eventRole.create({ data: { userId: user.id, eventId: ev.id, role: 'HOST' } });
  const guest = await prisma.person.create({
    data: { name: 'Lena Guest', email: addr(`lena-${label}`) },
  });
  fx.persons.add(guest.id);
  await prisma.personEvent.create({
    data: { personId: guest.id, eventId: ev.id, role: 'PARTICIPANT' },
  });
  const team = await prisma.team.create({ data: { name: `${TAG} team`, eventId: ev.id } });
  const item = await prisma.item.create({ data: { name: 'Pavlova', teamId: team.id } });
  await prisma.assignment.create({ data: { itemId: item.id, personId: guest.id } });
  await TOKENS.ensureEventTokens(ev.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000) },
  });
  fx.sessions.add(token);
  return { eventId: ev.id, cookie: `session=${token}` };
}

/**
 * A sample copy: Sam's own household, and (unless `bare`) the crowd, links minted, and with
 * `plan` the fixture plan (O12): one team, ITEMS_HELD items each for the answering guests, one for
 * Aroha, none for June and the kids.
 */
async function sampleCopy(COPY: any, TOKENS: any, opts: { bare?: boolean; plan?: boolean }) {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessions.add(c.sessionToken);
  const ev = await prisma.event.findUnique({ where: { id: c.eventId }, select: { hostId: true } });
  fx.persons.add(ev!.hostId);
  const cookie = `session=${c.sessionToken}`;
  const hh = await http(BASE, 'POST', `/api/events/${c.eventId}/host-household`, cookie, {
    name: 'Sam',
  });
  let crowd = 0;
  if (!opts.bare) {
    crowd = (
      await http(BASE, 'POST', `/api/events/${c.eventId}/households`, cookie, { demoCrowd: true })
    ).status;
  }
  const members = await prisma.personEvent.findMany({
    where: { eventId: c.eventId },
    select: { id: true, personId: true, person: { select: { name: true } } },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  const byName = new Map(members.map((m) => [m.person.name, m]));
  if (opts.plan) {
    const team = await prisma.team.create({ data: { name: `${TAG} mains`, eventId: c.eventId } });
    for (const name of [...ANSWERING, 'Aroha Ngata']) {
      const p = byName.get(name);
      if (!p) continue;
      const n = ITEMS_HELD[name] ?? 1;
      for (let k = 0; k < n; k++) {
        const item = await prisma.item.create({
          data: { name: `${name.split(' ')[0]}’s dish ${k + 1}`, teamId: team.id },
        });
        await prisma.assignment.create({ data: { itemId: item.id, personId: p.personId } });
      }
    }
  }
  if (!opts.bare) await TOKENS.ensureEventTokens(c.eventId);
  return { eventId: c.eventId as string, cookie, setup: `${hh.status}/${crowd}`, byName };
}

/** The board's people as the page reads them: name -> state, and personEventId -> state. */
async function boardStates(GLANCE: any, eventId: string) {
  const g = await GLANCE.readEventGlance(prisma, eventId, new Date(), { replies: true });
  const people = [...g.households.flatMap((h: any) => h.members), ...g.unhoused];
  const byName: States = {};
  const byId: Record<string, string> = {};
  for (const p of people) {
    byName[p.name] = p.state;
    byId[p.personEventId] = p.state;
  }
  return { glance: g, byName, byId };
}

/** Rows a press must not touch, on one event. */
async function eventRows(eventId: string) {
  const [audit, answered, attended, households, tokens] = await Promise.all([
    prisma.auditEntry.count({ where: { eventId } }),
    prisma.assignment.count({
      where: { item: { team: { eventId } }, response: { not: 'PENDING' } },
    }),
    prisma.personEvent.count({ where: { eventId, attendanceAnswer: { not: null } } }),
    prisma.household.count({ where: { eventId } }),
    prisma.accessToken.count({ where: { eventId } }),
  ]);
  return { audit, answered, attended, households, tokens };
}
const sameRows = (a: object, b: object) => JSON.stringify(a) === JSON.stringify(b);

/** a5e59c3's tree, exported outside the repo, served on :3101 against the same gather_demo. */
async function startParent(): Promise<{ url: string; stop: () => Promise<void>; note: string }> {
  if (process.env.GTC445_PARENT_URL) {
    return { url: process.env.GTC445_PARENT_URL, stop: async () => {}, note: 'given' };
  }
  const busy = await fetch(`http://127.0.0.1:${PARENT_PORT}/`)
    .then(() => true)
    .catch(() => false);
  if (busy) throw new Error(`port ${PARENT_PORT} is in use: a5e59c3's server cannot start`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtc445-parent-'));
  if (dir.startsWith(ROOT)) throw new Error('the scratch folder is inside the repo');
  const tar = spawnSync('sh', ['-c', `git -C "${ROOT}" archive ${PARENT} | tar -x -C "${dir}"`]);
  const cp = spawnSync('cp', [
    '-cR',
    path.join(ROOT, 'node_modules'),
    path.join(dir, 'node_modules'),
  ]);
  if (tar.status !== 0 || cp.status !== 0 || !fs.existsSync(path.join(dir, BOARD)))
    throw new Error("a5e59c3's tree could not be exported");
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    ANTHROPIC_API_KEY: '',
    RESEND_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    TNZ_AUTH_TOKEN: '',
    TNZ_API_KEY: '',
    CRON_SECRET: '',
    STRIPE_SECRET_KEY: 'gtc445-made-up-not-a-stripe-key',
    STRIPE_WEBHOOK_SECRET: 'gtc445-made-up-not-a-webhook-secret',
  };
  const child: ChildProcess = spawn(
    path.join(dir, 'node_modules', '.bin', 'next'),
    ['dev', '--turbo', '-p', String(PARENT_PORT)],
    { cwd: dir, env, detached: true, stdio: 'ignore' }
  );
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('exit', kill);
  const url = `http://localhost:${PARENT_PORT}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    up = await fetch(`${url}/privacy`)
      .then((r) => r.status === 200)
      .catch(() => false);
    if (!up) await sleep(500);
  }
  const stop = async () => {
    kill();
    await sleep(1500);
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      // stopped
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(1000);
      }
    }
  };
  if (!up) {
    await stop();
    throw new Error("a5e59c3's server did not answer");
  }
  return { url, stop, note: 'started' };
}

async function teardown() {
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  const typed = await prisma.person.findMany({
    where: { email: { contains: RUN } },
    select: { id: true },
  });
  typed.forEach((p) => fx.persons.add(p.id));
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.sessions] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
}

async function main() {
  // ══ W, B, R2, M5 — the sources and the drawn pieces (no database) ══════════
  const WMOD: any = await load('../src/lib/demo/replies-words');
  const words: Words | null = WMOD?.REPLIES_WORDS ?? null;
  const explain: ((f: string) => string) | null = WMOD?.repliesExplainLine ?? null;
  const done: ((n: any) => string) | null = WMOD?.repliesDoneLine ?? null;
  const BMOD: any = await load('../src/components/demo/GuestRepliesButton');
  const RMOD: any = await load('../src/lib/demo/replies');
  const plan = planLines(read('docs/tickets/GTC-392.md'));
  const w: Words = words ?? {
    BUTTON: plan.W49,
    WORKING: plan.W51,
    ALREADY: plan.W53,
    FAILED: plan.W54,
    NOT_A_SAMPLE: plan.W55,
    NOBODY: plan.W56,
  };
  const arohaLine = (plan.W50 ?? '').replace('{First}', 'Aroha');

  section('W — the words');
  assert(
    'W',
    'W1 W49 to W56 in the words file are the plan’s lines, character for character (read from GTC-392)',
    CHECKS.wordsAsPlanned(words, explain, done, plan),
    JSON.stringify({ module: !!WMOD, planLines: Object.keys(plan).length })
  );

  section('B — the button');
  const draw = (state: string) =>
    BMOD?.GuestRepliesView
      ? renderToStaticMarkup(
          createElement(BMOD.GuestRepliesView, {
            state,
            answered: 15,
            guestFirstName: 'Aroha',
            onPress: () => {},
          })
        )
      : '';
  assert(
    'B',
    'B1 idle: one live button reading W49, W50 naming Aroha under it, no link',
    CHECKS.viewIdle(draw('idle'), w, arohaLine)
  );
  assert(
    'B',
    'B2 working (W51, disabled), done (W52, no button), again (W53), nobody (W56), failed (W54 under a live button)',
    CHECKS.viewStates(
      {
        working: draw('working'),
        done: draw('done'),
        already: draw('already'),
        nobody: draw('nobody'),
        failed: draw('failed'),
      },
      w,
      arohaLine,
      (plan.W52 ?? '').replace('{N}', '15')
    )
  );
  assert(
    'B',
    'B3 its own client file: posts { demoReplies: true } to the households route, loads the page again, no link, reads the words file only',
    CHECKS.buttonSource(read(BUTTON))
  );
  assert(
    'B',
    'B4 the board page is a5e59c3’s plus exactly the import and the button after the toggle (on sample?.guest); GlanceBoard and the toggle as at a5e59c3',
    CHECKS.boardPage(
      read(BOARD),
      atRef(PARENT, BOARD),
      read(GLANCE_BOARD),
      atRef(PARENT, GLANCE_BOARD),
      read(TOGGLE),
      atRef(PARENT, TOGGLE)
    )
  );
  assert(
    'B',
    'B8 the button’s file has no router.refresh (O11: a full load started by her click)',
    CHECKS.noRouterRefresh(read(BUTTON))
  );

  section('R — the writers’ source');
  const kept = spawnSync('git', ['diff', '--quiet', PARENT, '--', ...KEPT], { cwd: ROOT });
  assert(
    'R',
    'R2 replies.ts answers through recordAssignmentAnswer and logAudit, writes no Assignment, AuditEntry, message, link or sentAt itself, under the row lock; the writers and the guest routes as at a5e59c3',
    CHECKS.writerSource(read(REPLIES), kept.status === 0),
    `kept=${kept.status}`
  );

  section('M — the pure mix');
  let mixed: any[] | null = null;
  try {
    mixed = RMOD?.planReplies ? RMOD.planReplies(MIX_COUNTS) : null;
  } catch {
    mixed = null;
  }
  assert(
    'M',
    'M5 places 1 to 30: every 6th none, beating every 5th (declines its first), beating every 4th (maybe); the first itemless no',
    CHECKS.mix(mixed),
    JSON.stringify(mixed)?.slice(0, 200)
  );

  // ══ P, B, S, M, R, PA, N, C, Z — the database and the servers ═══════════════
  section('P — preconditions');
  assert('P', 'P1 DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  if (!DB_OK) return;
  const client = await import('@prisma/client');
  prisma = new client.PrismaClient();
  const COPY: any = await import('../src/lib/demo/copy');
  const TOKENS: any = await import('../src/lib/tokens');
  const GLANCE: any = await import('../src/lib/glance/read');
  const REPLAY: any = await import('../src/lib/glance/replay-entry');
  const start = await totals();
  let parent: { url: string; stop: () => Promise<void>; note: string } | null = null;
  try {
    const serverOk = (await http(BASE, 'GET', `/api/events/${TAG}-probe/people`)).status === 401;
    assert('P', `P2 the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
    const copiesAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'P',
      'P3 no copy is in the database at the start',
      copiesAtStart === 0,
      `${copiesAtStart}`
    );
    let parentErr = '';
    try {
      parent = await startParent();
    } catch (e) {
      parentErr = e instanceof Error ? e.message : String(e);
    }
    assert(
      'P',
      `P4 a5e59c3’s server answers on :${PARENT_PORT} (${parent?.note ?? 'not started'}), against the same gather_demo`,
      !!parent,
      parentErr
    );

    // ── The fixtures ──────────────────────────────────────────────────────────
    const real = await hostedEvent('real', false, TOKENS);
    const oldRow = await hostedEvent('sample-not-copy', true, TOKENS);
    const A = await sampleCopy(COPY, TOKENS, { plan: true });
    const B = await sampleCopy(COPY, TOKENS, { plan: true });
    const C = await sampleCopy(COPY, TOKENS, {});
    const E = await sampleCopy(COPY, TOKENS, { bare: true });
    const POST = (ev: { eventId: string }, cookie?: string) =>
      http(BASE, 'POST', `/api/events/${ev.eventId}/households`, cookie, { demoReplies: true });

    section('B — on a copy’s board only');
    const boardA = await http(BASE, 'GET', `/plan/${A.eventId}/glance`, A.cookie);
    assert(
      'B',
      'B5 a copy’s board (the crowd, links) draws the button once, after the toggle, before the Moments strip',
      boardA.status === 200 && CHECKS.copyBoard(boardA.text, words, arohaLine),
      `${boardA.status} len=${boardA.text.length} setup=${A.setup}`
    );
    const boardR = await http(BASE, 'GET', `/plan/${real.eventId}/glance`, real.cookie);
    assert(
      'B',
      'B6 CONTROL: a real event’s board has no button',
      boardR.status === 200 && CHECKS.noButton(boardR.text, w.BUTTON),
      `${boardR.status}`
    );
    const boardO = await http(BASE, 'GET', `/plan/${oldRow.eventId}/glance`, oldRow.cookie);
    assert(
      'B',
      'B7 CONTROL: a sample that is not a copy (the old shared row’s shape): no button',
      boardO.status === 200 && CHECKS.noButton(boardO.text, w.BUTTON),
      `${boardO.status}`
    );

    section('M — the board before the press');
    const before = await boardStates(GLANCE, A.eventId);
    assert(
      'M',
      'M0 CONTROL: before the press the 18 answering guests and Aroha are amber, June red, the kids grey, Sam green',
      CHECKS.states(before.byName, BEFORE),
      JSON.stringify(before.byName)
    );

    section('S — the shape');
    const r0 = await eventRows(real.eventId);
    const s1 = await POST(real, real.cookie);
    assert(
      'S',
      'S1 a real event, its host signed in: 409 W55 (NOT_A_SAMPLE), nothing written',
      CHECKS.refused(s1, 'NOT_A_SAMPLE', plan.W55) && sameRows(r0, await eventRows(real.eventId)),
      `${s1.status} ${s1.text.slice(0, 120)}`
    );
    const o0 = await eventRows(oldRow.eventId);
    const s2 = await POST(oldRow, oldRow.cookie);
    assert(
      'S',
      'S2 the old sample’s shape (a sample, not a copy), its host: 409 W55, nothing written',
      CHECKS.refused(s2, 'NOT_A_SAMPLE', plan.W55) && sameRows(o0, await eventRows(oldRow.eventId)),
      `${s2.status} ${s2.text.slice(0, 120)}`
    );
    const a0 = await eventRows(A.eventId);
    const s3 = await POST(A);
    const s3p = parent
      ? await http(parent.url, 'POST', `/api/events/${A.eventId}/households`, undefined, {
          demoReplies: true,
        })
      : { status: -1, text: '' };
    assert(
      'S',
      'S3 CONTROL: no session on a copy: the guard answers first, as a5e59c3’s server does, nothing written',
      s3.status === s3p.status &&
        s3.text === s3p.text &&
        s3.status === 401 &&
        sameRows(a0, await eventRows(A.eventId)),
      `${s3.status}/${s3p.status} ${s3.text.slice(0, 80)}`
    );
    const e0 = await eventRows(E.eventId);
    const s4 = await POST(E, E.cookie);
    assert(
      'S',
      'S4 a copy with only Sam’s household: 409 W56 (NO_GUESTS), nothing written',
      CHECKS.refused(s4, 'NO_GUESTS', plan.W56) && sameRows(e0, await eventRows(E.eventId)),
      `${s4.status} ${s4.text.slice(0, 120)} setup=${E.setup}`
    );

    const seenAt = new Date();
    await sleep(25);
    const s5 = await POST(A, A.cookie);
    const pressed = CHECKS.answered(s5, 15);
    assert(
      'S',
      'S5 the fixture copy: 200 { answered: 15 }',
      pressed,
      `${s5.status} ${s5.text.slice(0, 120)}`
    );

    section('M — the mix');
    const after = await boardStates(GLANCE, A.eventId);
    assert(
      'M',
      'M1 after the press, each person’s state as the mix rules (O4, O7)',
      pressed && CHECKS.states(after.byName, AFTER),
      JSON.stringify(after.byName)
    );
    assert(
      'M',
      'M2 the totals: green 9, amber 7, red 4, out 1, grey 4',
      pressed && CHECKS.totals(after.byName, AFTER_TOTALS),
      JSON.stringify(tally(after.byName))
    );
    const leftIds = ['Aroha Ngata', 'June Walker', ...KIDS, 'Sam']
      .map((n) => A.byName.get(n))
      .filter((m): m is NonNullable<typeof m> => !!m);
    const leftPersonIds = leftIds.map((m) => m.personId);
    const leftAnswered = await prisma.assignment.count({
      where: {
        personId: { in: leftPersonIds },
        item: { team: { eventId: A.eventId } },
        response: { not: 'PENDING' },
      },
    });
    const leftAttended = await prisma.personEvent.count({
      where: { id: { in: leftIds.map((m) => m.id) }, attendanceAnswer: { not: null } },
    });
    const leftActed = await prisma.auditEntry.count({
      where: { eventId: A.eventId, actorId: { in: leftPersonIds }, timestamp: { gt: seenAt } },
    });
    const arohaHeld = await prisma.assignment.count({
      where: { personId: A.byName.get('Aroha Ngata')?.personId ?? 'none' },
    });
    assert(
      'M',
      'M3 Aroha (she answers herself), June, the kids and Sam: nothing answered, nothing written in their name',
      pressed &&
        leftIds.length === 7 &&
        arohaHeld === 1 &&
        leftAnswered === 0 &&
        leftAttended === 0 &&
        leftActed === 0,
      JSON.stringify({ found: leftIds.length, arohaHeld, leftAnswered, leftAttended, leftActed })
    );

    section('R — the writers');
    const rowsA = await prisma.assignment.findMany({
      where: { item: { team: { eventId: A.eventId } }, response: { not: 'PENDING' } },
      select: { id: true, personId: true, response: true, item: { select: { name: true } } },
    });
    const attA = await prisma.personEvent.findMany({
      where: { eventId: A.eventId, attendanceAnswer: { not: null } },
      select: { id: true, personId: true, attendanceAnswer: true },
    });
    const auditA = await prisma.auditEntry.findMany({
      where: { eventId: A.eventId, timestamp: { gt: seenAt } },
      select: { actorId: true, actionType: true, targetType: true, targetId: true, details: true },
    });
    const VERB: Record<string, [string, string]> = {
      ACCEPTED: ['ACCEPT_ASSIGNMENT', 'Accepted'],
      DECLINED: ['DECLINE_ASSIGNMENT', 'Declined'],
      MAYBE: ['MAYBE_ASSIGNMENT', 'Maybe on'],
    };
    const itemLinesOk = rowsA.every(
      (r) =>
        auditA.filter(
          (a) =>
            a.targetId === r.id &&
            a.targetType === 'Assignment' &&
            a.actionType === VERB[r.response][0] &&
            a.actorId === r.personId &&
            a.details === `${VERB[r.response][1]} ${r.item.name}`
        ).length === 1
    );
    const attLinesOk = attA.every(
      (p) =>
        auditA.filter(
          (a) =>
            a.targetId === p.id &&
            a.targetType === 'PersonEvent' &&
            a.actionType === 'ANSWER_ATTENDANCE' &&
            a.actorId === p.personId &&
            a.details ===
              (p.attendanceAnswer === 'YES' ? 'Answered still coming' : 'Answered not coming')
        ).length === 1
    );
    assert(
      'R',
      'R1 every answered row has exactly one line from its writer: the guest as actor, the writer’s words; no other line',
      pressed &&
        rowsA.length === 15 &&
        attA.length === 2 &&
        auditA.length === rowsA.length + attA.length &&
        itemLinesOk &&
        attLinesOk,
      JSON.stringify({
        rows: rowsA.length,
        att: attA.length,
        audit: auditA.length,
        itemLinesOk,
        attLinesOk,
      })
    );
    const evA = await prisma.event.findUnique({
      where: { id: A.eventId },
      select: {
        status: true,
        sentAt: true,
        endDate: true,
        decideByOffsetHours: true,
        nudgePace: true,
      },
    });
    let steps: any[] | null = null;
    try {
      const rp = await REPLAY.readGlanceReplay(
        prisma,
        A.eventId,
        seenAt,
        after.glance,
        evA,
        new Date()
      );
      steps = rp.steps;
    } catch (e) {
      steps = null;
    }
    // R3, as ruled 2 Nov 2026: the rewind drops a person whose attendance changed inside the
    // window ("it fails to silence, not to noise", rewind.ts); only item answers play.
    const peOf = new Map([...A.byName.values()].map((m) => [m.personId, m.id]));
    const itemMoved = [...new Set(rowsA.map((r) => peOf.get(r.personId) ?? ''))];
    assert(
      'R',
      'R3 the board’s replay from just before the press: one step per person whose item answers changed and whose state moved (7 to green, 3 to red), old to new, and no other; an attendance-only change plays no step',
      pressed && CHECKS.replay(steps, before.byId, after.byId, itemMoved, { GREEN: 7, RED: 3 }),
      JSON.stringify(steps?.map((s) => `${s.from}>${s.to}`))
    );
    const nameOf = new Map([...A.byName.entries()].map(([n, m]) => [m.id, n]));
    const stepNames = (steps ?? []).map((st) => nameOf.get(st.personEventId) ?? '?');
    const stored: Record<string, string | null> = {};
    for (const n of ['Hemi Walker', 'Dev Sharma']) {
      const m = A.byName.get(n);
      stored[n] = m
        ? ((await prisma.personEvent.findUnique({ where: { id: m.id } }))?.attendanceAnswer ?? null)
        : null;
    }
    assert(
      'R',
      'R3b the two attendance answers are on the board now (Hemi yes, green; Dev no, out), though no replay step plays for them',
      pressed && CHECKS.attendanceOnBoard(after.byName, stored, stepNames),
      JSON.stringify({
        hemi: after.byName['Hemi Walker'],
        dev: after.byName['Dev Sharma'],
        stored,
        stepNames,
      })
    );

    section('S — again, and at once');
    const a1 = await eventRows(A.eventId);
    const s6 = await POST(A, A.cookie);
    assert(
      'S',
      'S6 a second press: 409 W53 (ALREADY_REPLIED), nothing written',
      pressed &&
        CHECKS.refused(s6, 'ALREADY_REPLIED', plan.W53) &&
        sameRows(a1, await eventRows(A.eventId)),
      `${s6.status} ${s6.text.slice(0, 120)}`
    );
    const [p1, p2] = await Promise.all([POST(B, B.cookie), POST(B, B.cookie)]);
    const auditB = await prisma.auditEntry.count({
      where: {
        eventId: B.eventId,
        actionType: {
          in: ['ACCEPT_ASSIGNMENT', 'DECLINE_ASSIGNMENT', 'MAYBE_ASSIGNMENT', 'ANSWER_ATTENDANCE'],
        },
      },
    });
    assert(
      'S',
      'S7 two presses at the same moment answer once: one 200 { answered: 15 }, the other 409 W53, the lines of one press',
      CHECKS.onceOnly(p1, p2, 15, plan.W53, auditB === 17),
      `${p1.status}/${p2.status} audit=${auditB}`
    );
    const afterB = await boardStates(GLANCE, B.eventId);
    assert(
      'M',
      'M4 a second copy built the same way ends the same, person by person (fixed, not random)',
      pressed && CHECKS.states(afterB.byName, after.byName),
      JSON.stringify(afterB.byName)
    );

    // M6: probe rows on a bare copy, no links minted (so no fixed guest), each with an address
    // and one item. The NULL role is set here, in the test; teardown removes every row by id.
    const F = await sampleCopy(COPY, TOKENS, { bare: true });
    const m6Team = await prisma.team.create({ data: { name: `${TAG} m6`, eventId: F.eventId } });
    const probe = async (name: string, householdRole: 'GUEST' | 'CHILD' | null) => {
      const person = await prisma.person.create({
        data: { name, email: addr(`m6-${name.split(' ')[0].toLowerCase()}`) },
      });
      fx.persons.add(person.id);
      const pe = await prisma.personEvent.create({
        data: { personId: person.id, eventId: F.eventId, role: 'PARTICIPANT', householdRole },
      });
      const item = await prisma.item.create({
        data: { name: `${name.split(' ')[0]}’s dish`, teamId: m6Team.id },
      });
      const a = await prisma.assignment.create({ data: { itemId: item.id, personId: person.id } });
      return { personId: person.id, personEventId: pe.id, assignmentId: a.id };
    };
    const adultP = await probe('Ada Adult', 'GUEST');
    const nullP = await probe('Nell Norole', null);
    const kidP = await probe('Kit Kid', 'CHILD');
    const f6 = await POST(F, F.cookie);
    const respOf = async (p: { assignmentId: string }) =>
      (
        await prisma.assignment.findUnique({
          where: { id: p.assignmentId },
          select: { response: true },
        })
      )?.response ?? null;
    const auditBy = (p: { personId: string }) =>
      prisma.auditEntry.count({ where: { eventId: F.eventId, actorId: p.personId } });
    const nullRow = await prisma.personEvent.findUnique({
      where: { id: nullP.personEventId },
      select: { householdRole: true },
    });
    const m6 = {
      nullStored: !!nullRow && nullRow.householdRole === null,
      adult: await respOf(adultP),
      nul: await respOf(nullP),
      kid: await respOf(kidP),
      adultAudit: await auditBy(adultP),
      nullAudit: await auditBy(nullP),
      kidAudit: await auditBy(kidP),
    };
    assert(
      'M',
      'M6 a guest whose household role is NULL answers like any adult; a kid with an address does not',
      CHECKS.nullRole(f6, m6),
      `${f6.status} ${f6.text.slice(0, 80)} ${JSON.stringify(m6)}`
    );

    section('PA — parity with the guest’s own attendance answer');
    const arohaC = C.byName.get('Aroha Ngata');
    const priyaC = C.byName.get('Priya Sharma');
    const peRow = (id: string) => prisma.personEvent.findUnique({ where: { id } });
    const moved = (x: any, y: any) =>
      Object.keys(x ?? {})
        .filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y?.[k]))
        .sort();
    const auditFor = (eventId: string, targetId: string) =>
      prisma.auditEntry.findFirst({
        where: { eventId, targetId, actionType: 'ANSWER_ATTENDANCE' },
      });
    let paOk = false;
    let paDetail = 'fixture missing';
    if (arohaC && priyaC) {
      const tok = await prisma.accessToken.findFirst({
        where: { eventId: C.eventId, personId: arohaC.personId, scope: 'PARTICIPANT' },
        select: { token: true },
      });
      const aBefore = await peRow(arohaC.id);
      const pBefore = await peRow(priyaC.id);
      const patch = await http(BASE, 'PATCH', `/api/p/${tok?.token ?? 'none'}`, undefined, {
        attending: true,
      });
      const press = await POST(C, C.cookie);
      const aAfter = await peRow(arohaC.id);
      const pAfter = await peRow(priyaC.id);
      const one = {
        moved: moved(aBefore, aAfter),
        audit: await auditFor(C.eventId, arohaC.id),
        personId: arohaC.personId,
        personEventId: arohaC.id,
      };
      const two = {
        moved: moved(pBefore, pAfter),
        audit: await auditFor(C.eventId, priyaC.id),
        personId: priyaC.personId,
        personEventId: priyaC.id,
      };
      paOk =
        patch.status === 200 &&
        CHECKS.answered(press, 15) &&
        aAfter?.attendanceAnswer === 'YES' &&
        pAfter?.attendanceAnswer === 'YES' &&
        CHECKS.parity(one, two);
      paDetail = JSON.stringify({
        patch: patch.status,
        press: `${press.status} ${press.text.slice(0, 60)}`,
        one: { moved: one.moved, audit: one.audit && { ...one.audit, id: 0, timestamp: 0 } },
        two: { moved: two.moved, audit: two.audit && { ...two.audit, id: 0, timestamp: 0 } },
      }).slice(0, 600);
    }
    assert(
      'PA',
      'PA1 the guest’s own PATCH (Aroha, itemless) and the press (Priya) write the same columns, the same audit action and words, and audit rows with the same keys set',
      paOk,
      paDetail
    );

    section('N — nothing sent');
    await sleep(1500); // the guest route's own InviteEvent is written after its reply
    const ids = [...fx.events];
    const outbound = await prisma.outboundMessage.count({ where: { eventId: { in: ids } } });
    const invites = await prisma.inviteEvent.findMany({
      where: { eventId: { in: ids } },
      select: { eventId: true, type: true, personId: true },
    });
    const invitesOk =
      invites.length === 1 &&
      invites[0].eventId === C.eventId &&
      invites[0].type === 'RESPONSE_SUBMITTED' &&
      invites[0].personId === arohaC?.personId;
    const tokensSame = a0.tokens === (await eventRows(A.eventId)).tokens;
    const sentAt =
      (await prisma.event.count({ where: { id: { in: ids }, sentAt: { not: null } } })) +
      (await prisma.personEvent.count({ where: { eventId: { in: ids }, sentAt: { not: null } } }));
    const now = await totals();
    const flat = ['outboundMessage', 'nudgeLog', 'textReply', 'smsDeliveryReport', 'wrapUpLink'];
    const flatSame = flat.every((t) => now[t] === start[t]);
    const linksSame = now.magicLink === start.magicLink;
    assert(
      'N',
      'N1 nothing sent: no OutboundMessage, nudge, text, delivery report, wrap-up or sign-in link; no InviteEvent but the guest route’s own; no link minted by the press; every sentAt null',
      pressed && outbound === 0 && invitesOk && tokensSame && sentAt === 0 && flatSame && linksSame,
      JSON.stringify({ outbound, invites: invites.length, tokensSame, sentAt, flatSame, linksSame })
    );

    section('C — CONTROL: a real event’s households POST, as a5e59c3’s server answers it');
    let cOk = false;
    let cDetail = 'no parent';
    if (parent) {
      const dev = await hostedEvent('c1-dev', false, TOKENS);
      const par = await hostedEvent('c1-par', false, TOKENS);
      const ask = async (base: string, ev: { eventId: string; cookie: string }, which: string) => [
        await http(base, 'POST', `/api/events/${ev.eventId}/host-household`, ev.cookie, {
          name: 'Hana Host',
        }),
        await http(base, 'POST', `/api/events/${ev.eventId}/households`, ev.cookie, {
          primaryContact: { name: 'Pita Real', email: addr(`pita-${which}-x`) },
        }),
        await http(base, 'POST', `/api/events/${ev.eventId}/households`, ev.cookie, {
          primaryContact: { name: '' },
        }),
        await http(base, 'POST', `/api/events/${ev.eventId}/households`, ev.cookie, {
          demoCrowd: true,
        }),
      ];
      const ours = await ask(BASE, dev, 'dev');
      const theirs = await ask(parent.url, par, 'par');
      const each = ours.map((r, i) => CHECKS.sameAnswer(r, theirs[i]));
      cOk = each.every(Boolean) && ours[1].status === 201;
      cDetail = JSON.stringify({ each, statuses: ours.map((r) => r.status) });
    }
    assert(
      'C',
      'C1 CONTROL: her household, a household, a household with no name and the crowd on a real event answer as a5e59c3’s server does (ids and times aside)',
      cOk,
      cDetail
    );
  } finally {
    await teardown();
    if (parent) await parent.stop();
  }

  section('Z — every probe row removed');
  const leftPeople = await prisma.person.count({ where: { id: { in: [...fx.persons] } } });
  const leftEvents = await prisma.event.count({ where: { id: { in: [...fx.events] } } });
  const leftUsers = await prisma.user.count({ where: { id: { in: [...fx.users] } } });
  const leftTyped = await prisma.person.count({ where: { email: { contains: RUN } } });
  assert(
    'Z',
    'Z1 every person, event and user this run made is gone, by id',
    leftPeople === 0 && leftEvents === 0 && leftUsers === 0 && leftTyped === 0,
    JSON.stringify({ leftPeople, leftEvents, leftUsers, leftTyped })
  );
  const end = await totals();
  const movedTables = Object.keys(start).filter((k) => start[k] !== end[k]);
  assert(
    'Z',
    'Z2 every table’s count is back to the start',
    movedTables.length === 0,
    movedTables.map((k) => `${k} ${start[k]} -> ${end[k]}`).join(', ')
  );
  const zone = spawnSync('git', ['diff', '--quiet', PARENT, '--', 'src/lib/tokens.ts', 'prisma'], {
    cwd: ROOT,
  });
  assert(
    'Z',
    'Z3 src/lib/tokens.ts and prisma/ are as at a5e59c3 (no token or schema change)',
    zone.status === 0,
    `${zone.status}`
  );
}

// A dry run imports CHECKS and the helpers only (DEMO_REPLIES_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_REPLIES_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      assert(
        'FATAL',
        `the suite threw: ${e instanceof Error ? e.message.split('\n').slice(-1)[0] : e}`,
        false
      );
    })
    .finally(async () => {
      if (prisma) await prisma.$disconnect();
      console.log(`\n${passed} passed, ${failed} failed`);
      if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
      process.exit(failed > 0 ? 1 : 0);
    });
}
