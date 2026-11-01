/**
 * [[GTC-442]] — THE CLEAN-UP: an expired sample copy goes, with everything a visitor made in it,
 * and nothing else moves.
 *
 * Founder rulings (1 Nov 2026): the GTC-392 parts C and D plan as recommended (Q9, Q11); at the
 * build, Q4: the route answers 500 when a sweep throws AND when one or more copies failed (rolled
 * back); a guard skip is not a failure (200).
 *
 *   P  preconditions: gather_demo on this Mac, the guarded dev server answers, no copy and no
 *      stamped person at the start, the cron secret made up for this run, the code loads
 *   A  the rule, pure: started before today's NZ midnight AND more than two hours ago
 *   B  the fixtures: a full copy a visitor used (three people removed mid-visit by a household
 *      delete, a person delete and a household edit), plan rows, and the controls
 *   C  the cap: oldest first, a limit per run, a skipped copy uses no place, and the look limit
 *      is real (founder ruling, 1 Nov 2026: up to 100 looked at, at most 25 deleted)
 *   D  the sweep: every row of an expired copy goes by id; today's copy, the old shared 2025 row,
 *      a real event named like a sample and a sample hosted by a real account are untouched
 *   E  the guards: a WrapUpLink skips the copy; a person on another event is kept; a wrong
 *      account is skipped; a copy that fails is rolled back whole and the others still go
 *   F  the log carries counts only
 *   G  a second run deletes nothing
 *   R  the cron route, in process, with a secret made up for this run: 401 without it, with an
 *      empty one or a wrong one; 200 with it (header or query); 500 when a copy failed or the
 *      sweep threw; the secret check written as the other five write it
 *   V  vercel.json's line, the constants' cron row, and what the code imports
 *   Z  every probe row is removed by id; the totals are as found; no copy is left
 *
 * Visitor actions are driven over HTTP on a fresh guarded dev server (DEMO_SANDBOX_BASE_URL,
 * default http://localhost:3000) with the copy's own session; copies, plan rows and controls are
 * made in process against the same database. Every sweep here runs on the real clock, so it can
 * only ever take a copy this run backdated; P3 refuses to run any sweep if a copy is there first.
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). The
 * cron secret is replaced in THIS process by one made up for the run, and never printed. Every
 * address is made up (@gtc442.invalid, or a copy's own under demo-copy.invalid). Nothing here
 * sends, queues a message, mints a link or calls the AI. Teardown deletes this run's rows by id.
 *
 *   npx tsx tests/demo-cleanup-test.ts
 */
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
const RUN = randomBytes(4).toString('hex');
const TAG = `gtc442-${RUN}`;
const DOMAIN = 'gtc442.invalid';
const COPY_DOMAIN = '@demo-copy.invalid';
const addr = (local: string) => `${local}-${RUN}@${DOMAIN}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// The cron secret: one made up for this run, set in this process only, before the route loads.
const SECRET_AT_START = process.env.CRON_SECRET;
const MADE_UP_SECRET = `gtc442-made-up-${randomBytes(16).toString('hex')}`;
process.env.CRON_SECRET = MADE_UP_SECRET;

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
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROUTE = 'src/app/api/cron/demo-cleanup/route.ts';
const MODULE = 'src/lib/demo/cleanup.ts';
const CRON_ROUTES = [
  'src/app/api/cron/nudges/route.ts',
  'src/app/api/cron/wrap-up-dispatch/route.ts',
  'src/app/api/cron/decide-by-followups/route.ts',
  'src/app/api/cron/outbound-dispatch/route.ts',
  'src/app/api/cron/tnz-status-poll/route.ts',
];

/**
 * CHECKS: every source condition, pure, so each can be tried on a passing and a failing input
 * (DEMO_CLEANUP_DRY_RUN=1 imports them without running the suite).
 */
export const CHECKS = {
  /** The cron secret check as the five cron routes write it: the one line, both refusals. */
  secretCheckAsTheOthers(src: string): boolean {
    const code = stripComments(src);
    return (
      /^const CRON_SECRET = process\.env\.CRON_SECRET;$/m.test(code) &&
      code.includes("const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;") &&
      /if \(!isCronSecretConfigured\(CRON_SECRET\)\) \{\s*console\.error\([^;]*\);\s*return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\}/.test(
        code
      ) &&
      /if \(!cronSecretAccepted\(CRON_SECRET, providedSecret\)\) \{\s*console\.warn\([^;]*\);\s*return NextResponse\.json\(\{ error: 'Unauthorized' \}, \{ status: 401 \}\);\s*\}/.test(
        code
      )
    );
  },
  /** The module specifiers a file imports, sorted. */
  importsOf(src: string): string[] {
    const code = stripComments(src);
    return [...code.matchAll(/^import[^;]*?from\s+'([^']+)';/gm)].map((m) => m[1]).sort();
  },
  sameList(a: string[], b: string[]): boolean {
    const x = [...a].sort();
    const y = [...b].sort();
    return x.length === y.length && x.every((v, i) => v === y[i]);
  },
  /** vercel.json: six crons, each `/api/cron/<name>?secret=${CRON_SECRET}`, the sixth ours. */
  vercelHasTheLine(text: string): boolean {
    let crons: Array<{ path?: unknown; schedule?: unknown }> = [];
    try {
      crons = JSON.parse(text).crons ?? [];
    } catch {
      return false;
    }
    const form = /^\/api\/cron\/[a-z-]+\?secret=\$\{CRON_SECRET\}$/;
    const last = crons[crons.length - 1];
    return (
      crons.length === 6 &&
      crons.every((c) => typeof c.path === 'string' && form.test(c.path)) &&
      last?.path === '/api/cron/demo-cleanup?secret=${CRON_SECRET}' &&
      last?.schedule === '17 * * * *'
    );
  },
  /** The constants' cron table: one row for the route, hourly at :17. */
  constantsHasTheRow(text: string): boolean {
    const rows = text
      .split('\n')
      .filter((l) =>
        l.startsWith(
          '| `src/app/api/cron/demo-cleanup/route.ts` | GET / POST | `/api/cron/demo-cleanup` |'
        )
      );
    return rows.length === 1 && /\| Hourly, at :17 past the hour \|$/.test(rows[0]);
  },
  /** A log line carries counts only: none of the given words, no address, no id. */
  countsOnly(line: string, banned: string[]): boolean {
    return !line.includes('@') && banned.every((w) => w.length === 0 || !line.includes(w));
  },
};

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

/** Every row the run made, by id. */
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessions: new Set<string>(),
  links: new Set<string>(),
  templates: new Set<string>(),
  profiles: new Set<string>(),
};
const names: string[] = [];

async function http(method: string, p: string, cookie: string, body?: unknown) {
  try {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    return { status: -1, body: String(e) };
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
  'team',
  'item',
  'household',
  'personEvent',
  'auditEntry',
  'magicLink',
  'eventRole',
  'wrapUpLink',
  'assignment',
  'day',
  'structureTemplate',
  'quantitiesProfile',
] as const;
async function totals(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = await (prisma as any)[t].count();
  out.stamped = await prisma.person.count({ where: { sampleEventId: { not: null } } });
  return out;
}
const diff = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a)
    .filter((k) => a[k] !== b[k])
    .map((k) => `${k} ${a[k]}→${b[k]}`)
    .join(', ');

/** The rows on these events, by table, while they exist (for "exactly these went"). */
async function rowsOn(eventIds: string[]): Promise<Record<string, number>> {
  const e = { eventId: { in: eventIds } };
  const teams = await prisma.team.findMany({ where: e, select: { id: true } });
  const items = await prisma.item.findMany({
    where: { teamId: { in: teams.map((t) => t.id) } },
    select: { id: true },
  });
  return {
    event: eventIds.length,
    eventSetup: await prisma.eventSetup.count({ where: e }),
    accessToken: await prisma.accessToken.count({ where: e }),
    inviteEvent: await prisma.inviteEvent.count({ where: e }),
    outboundMessage: await prisma.outboundMessage.count({ where: e }),
    team: teams.length,
    item: items.length,
    household: await prisma.household.count({ where: e }),
    personEvent: await prisma.personEvent.count({ where: e }),
    auditEntry: await prisma.auditEntry.count({ where: e }),
    eventRole: await prisma.eventRole.count({ where: e }),
    assignment: await prisma.assignment.count({
      where: { itemId: { in: items.map((i) => i.id) } },
    }),
    day: await prisma.day.count({ where: e }),
  };
}

const EVENT_SHAPE = {
  status: 'DRAFT' as const,
  structureMode: 'EDITABLE' as const,
  isLegacy: false,
  guestCountConfidence: 'MEDIUM' as const,
  dietaryStatus: 'UNSPECIFIED' as const,
  dietaryVegetarian: 0,
  dietaryVegan: 0,
  dietaryGlutenFree: 0,
  dietaryDairyFree: 0,
  venueOvenCount: 0,
};

/** A real (made-up) account and its Person. */
async function realAccount(local: string, name: string) {
  const email = addr(local);
  const user = await prisma.user.create({ data: { email } });
  fx.users.add(user.id);
  const person = await prisma.person.create({ data: { name, email, userId: user.id } });
  fx.persons.add(person.id);
  names.push(name);
  return { user, person };
}

async function makeEvent(hostId: string, name: string, isDemo: boolean, createdAt?: Date) {
  const day = new Date(Date.UTC(2027, 1, 6));
  const e = await prisma.event.create({
    data: {
      ...EVENT_SHAPE,
      name,
      startDate: day,
      endDate: day,
      isDemo,
      hostId,
      setup: { create: {} },
      ...(createdAt ? { createdAt } : {}),
    },
  });
  fx.events.add(e.id);
  return e;
}

let COPY: any;
let CLEAN: any;
let ROUTE_MOD: any;
let NEXT: any;

/** A copy started in process (as the route's copy shape does), then backdated if asked. */
async function startCopy(startedAt?: Date) {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessions.add(c.sessionToken);
  const ev = await prisma.event.findUnique({ where: { id: c.eventId } });
  fx.persons.add(ev!.hostId);
  if (startedAt)
    await prisma.event.update({ where: { id: c.eventId }, data: { createdAt: startedAt } });
  return {
    eventId: c.eventId as string,
    userId: c.userId as string,
    hostId: ev!.hostId,
    token: c.sessionToken as string,
    cookie: `session=${c.sessionToken}`,
  };
}
/** A stamped person on a copy, with a membership there (as the households POST makes). */
async function stampedOn(copyId: string, name: string) {
  const p = await prisma.person.create({
    data: { name, email: addr(name.toLowerCase().split(' ')[0]), sampleEventId: copyId },
  });
  fx.persons.add(p.id);
  names.push(name);
  await prisma.personEvent.create({ data: { personId: p.id, eventId: copyId } });
  return p;
}
async function memberNamed(eventId: string, name: string) {
  const rows = await prisma.personEvent.findMany({
    where: { eventId, person: { name } },
    include: { person: true },
  });
  return rows.length === 1 ? rows[0].person : null;
}
const exists = {
  event: async (id: string) => (await prisma.event.count({ where: { id } })) === 1,
  user: async (id: string) => (await prisma.user.count({ where: { id } })) === 1,
  person: async (id: string) => (await prisma.person.count({ where: { id } })) === 1,
  session: async (token: string) => (await prisma.session.count({ where: { token } })) === 1,
};
/** A copy is whole: its event, account, session and host all there. */
async function whole(c: { eventId: string; userId: string; hostId: string; token: string }) {
  return (
    (await exists.event(c.eventId)) &&
    (await exists.user(c.userId)) &&
    (await exists.session(c.token)) &&
    (await exists.person(c.hostId))
  );
}
async function gone(c: { eventId: string; userId: string; hostId: string; token: string }) {
  return (
    !(await exists.event(c.eventId)) &&
    !(await exists.user(c.userId)) &&
    !(await exists.session(c.token)) &&
    !(await exists.person(c.hostId))
  );
}

/** The client, but one copy's transaction deletes its event and then throws (rolled back). */
function failingFor(eventId: string): any {
  const bind = (o: any, k: PropertyKey) => {
    const v = o[k];
    return typeof v === 'function' ? v.bind(o) : v;
  };
  return new Proxy(prisma, {
    get(t: any, k) {
      if (k !== '$transaction') return bind(t, k);
      return (fn: any, opts: any) =>
        t.$transaction(
          async (tx: any) =>
            fn(
              new Proxy(tx, {
                get(tt: any, kk) {
                  if (kk !== 'event') return bind(tt, kk);
                  return new Proxy(tt.event, {
                    get(ev: any, m) {
                      if (m !== 'delete') return bind(ev, m);
                      return async (args: any) => {
                        const out = await ev.delete(args);
                        if (args?.where?.id === eventId) {
                          throw Object.assign(new Error('probe'), { code: 'GTC442_PROBE' });
                        }
                        return out;
                      };
                    },
                  });
                },
              })
            ),
          opts
        );
    },
  });
}

// ── The log, captured while a sweep or the route runs ───────────────────────
const logLines: string[] = [];
let completedRuns = 0;
async function capture<T>(f: () => Promise<T>): Promise<T> {
  const was = { log: console.log, warn: console.warn, error: console.error };
  const keep =
    (orig: (...a: unknown[]) => void) =>
    (...a: unknown[]) => {
      const line = a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ');
      if (line.includes('[demo-cleanup]') || line.includes('[Cron DemoCleanup]')) {
        logLines.push(line);
      }
      orig(...a);
    };
  console.log = keep(was.log);
  console.warn = keep(was.warn);
  console.error = keep(was.error);
  try {
    return await f();
  } finally {
    Object.assign(console, was);
  }
}
async function sweep(db: any, options?: { limit?: number; lookAt?: number }) {
  const r = await capture(() => CLEAN.sweepExpiredCopies(db, new Date(), options));
  completedRuns++;
  return r as Record<string, number>;
}

function req(method: string, query: string, headers: Record<string, string> = {}) {
  return new NEXT.NextRequest(`http://localhost/api/cron/demo-cleanup${query}`, {
    method,
    headers,
  });
}
async function callRoute(method: 'GET' | 'POST', query: string, headers?: Record<string, string>) {
  const res = await capture(() => ROUTE_MOD[method](req(method, query, headers)));
  const body = await (res as Response).json().catch(() => null);
  return { status: (res as Response).status, body };
}

// The labels of every check that needs the code, reported failed when it cannot run.
const NEEDS_CODE: Array<[string, string]> = [
  ['A', 'A1 started yesterday (NZ) and 11 hours ago: expired'],
  ['A', 'A2 started today after NZ midnight, 3.5 hours ago: kept'],
  ['A', 'A3 started 30 minutes before NZ midnight, 75 minutes ago: kept (under two hours)'],
  ['A', 'A4 the same copy two hours and one minute after it started: expired'],
  ['A', 'A5 exactly two hours ago, before midnight: kept ("more than" two hours)'],
  ['A', 'A6 the cut-off is that NZ day’s midnight in summer (+13) and in winter (+12)'],
  ['A', 'A7 the limit is 25 a run and the age two hours'],
  ['B', 'B1 copy E1 as a visitor left it: her household, three households, the crowd'],
  ['B', 'B2 three people removed mid-visit are still there, stamped, with no membership'],
  ['B', 'B3 E1 holds plan rows, a template and a quantities profile; the controls exist'],
  ['C', 'C1 with a limit of 1, exactly the oldest copy goes'],
  ['C', 'C2 the younger copies are whole after that run'],
  ['C', 'C3 with a limit of 1, a skipped oldest copy uses no place: the next one goes'],
  ['C', 'C4 with a look limit of 2 and two skipped copies at the front, the third is not reached'],
  ['D', 'D1 the run’s counts: found, deleted, skipped, failed as made'],
  ['D', 'D2 E1’s event is gone, with every row on it, by id'],
  ['D', 'D3 every person collected from E1 is gone by id: Sam, typed people, the crowd'],
  ['D', 'D4 the three removed mid-visit are gone by id'],
  ['D', 'D5 E1’s account is gone, with its session and its role'],
  ['D', 'D6 the template and the quantities profile keyed on E1’s host are gone'],
  ['D', 'D7 today’s copy is whole: event, account, session, host'],
  ['D', 'D8 the old shared 2025 sample is untouched'],
  ['D', 'D9 a real event named “Your sample gathering” and its people are untouched'],
  ['D', 'D10 a sample event hosted by a real account, days old, is untouched'],
  ['D', 'D11 every table moved by exactly the rows of the copies deleted, no more'],
  ['E', 'E1 a copy with a WrapUpLink is skipped: event, account, session, people remain'],
  ['E', 'E2 the skip is logged, with counts only'],
  ['E', 'E3 a collected person with a membership on a real event is kept, with it'],
  ['E', 'E4 the rest of that copy is deleted: its event, account and other people'],
  ['E', 'E5 a sample hosted by a real account is skipped, nothing deleted (sweepOneCopy)'],
  ['E', 'E6 a copy made to fail is rolled back whole, counted failed; the others still go'],
  ['F', 'F1 every [demo-cleanup] line carries counts only: no name, address or id'],
  ['F', 'F2 one summary line per run'],
  ['G', 'G1 a second run deletes nothing'],
  ['R', 'R1 the route with no secret: 401, nothing swept'],
  ['R', 'R2 the route with an empty Bearer header and an empty ?secret=: 401'],
  ['R', 'R3 the route with a wrong secret: 401'],
  ['R', 'R4 GET with the secret as Authorization: Bearer: 200, success and the counts'],
  ['R', 'R5 POST with the secret as ?secret=: 200'],
  ['R', 'R6 a sweep that throws answers 500'],
  ['R', 'R7 the secret check is written as the other five cron routes write it'],
  ['R', 'R8 the route imports only next/server, the client, the clean-up, cron-secret'],
  ['R', 'R9 a copy that fails: 500 with the counts; the other copies in the run still go'],
  ['R', 'R10 a run whose only outcome is a guard skip answers 200'],
];

async function main() {
  section('P — preconditions');
  assert('P', 'P1 DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  if (!DB_OK) return;
  prisma = (await import('../src/lib/prisma')).prisma as any;
  const start = await totals();
  let serverOk = false;
  try {
    serverOk = (await fetch(`${BASE}/api/events/${TAG}-probe/people`)).status === 401;
  } catch {
    serverOk = false;
  }
  assert('P', `P2 the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
  const copyUsers = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
  assert(
    'P',
    'P3 no copy, no copy account and no stamped person is in the database at the start',
    copyUsers === 0 && start.stamped === 0,
    `copy accounts ${copyUsers}, stamped ${start.stamped}`
  );
  assert(
    'P',
    'P4 the cron secret in this process is made up for this run (never printed)',
    process.env.CRON_SECRET === MADE_UP_SECRET && MADE_UP_SECRET !== SECRET_AT_START
  );
  let loaded = false;
  try {
    COPY = await import('../src/lib/demo/copy');
    CLEAN = await import('../src/lib/demo/cleanup');
    ROUTE_MOD = await import('../src/app/api/cron/demo-cleanup/route');
    NEXT = await import('next/server');
    loaded =
      typeof CLEAN.sweepExpiredCopies === 'function' &&
      typeof CLEAN.sweepOneCopy === 'function' &&
      typeof ROUTE_MOD.GET === 'function' &&
      typeof ROUTE_MOD.POST === 'function';
  } catch {
    loaded = false;
  }
  assert('P', 'P5 the clean-up module and its cron route load', loaded);

  if (loaded && serverOk && copyUsers === 0 && start.stamped === 0) {
    try {
      await run();
    } catch (e) {
      assert('P', 'the run finished without throwing', false, String(e).slice(0, 300));
    }
  } else {
    section('A to R — not run: the code is missing, or a precondition failed (nothing written)');
    for (const [layer, label] of NEEDS_CODE) assert(layer, label, false, 'not run');
  }
  sourceLayer();

  section('Z — teardown: every probe row by id; the totals as found');
  let teardownOk = true;
  try {
    await teardown();
  } catch (e) {
    teardownOk = false;
    console.log(String(e).slice(0, 300));
  }
  const end = await totals();
  assert('Z', 'Z1 every probe row this run made is removed, by id', teardownOk);
  assert(
    'Z',
    'Z2 every table’s total is as found at the start',
    diff(start, end) === '',
    diff(start, end)
  );
  const leftCopies = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
  assert(
    'Z',
    'Z3 no copy account and no stamped person is left',
    leftCopies === 0 && end.stamped === 0,
    `copy accounts ${leftCopies}, stamped ${end.stamped}`
  );
}

async function run() {
  const NOW = Date.now();
  const ago = (ms: number) => new Date(NOW - ms);

  // ══ A — the rule, pure ═══════════════════════════════════════════════════════
  section('A — the rule: started before today’s NZ midnight AND more than two hours ago');
  const at = (iso: string) => new Date(iso);
  // 2 Nov 2026 00:00 NZDT is 1 Nov 11:00 UTC.
  assert(
    'A',
    NEEDS_CODE[0][1],
    CLEAN.isExpiredCopy(at('2026-11-01T10:00:00Z'), at('2026-11-01T21:00:00Z')) === true
  );
  assert(
    'A',
    NEEDS_CODE[1][1],
    CLEAN.isExpiredCopy(at('2026-11-01T12:00:00Z'), at('2026-11-01T15:30:00Z')) === false
  );
  assert(
    'A',
    NEEDS_CODE[2][1],
    CLEAN.isExpiredCopy(at('2026-11-01T10:30:00Z'), at('2026-11-01T11:45:00Z')) === false
  );
  assert(
    'A',
    NEEDS_CODE[3][1],
    CLEAN.isExpiredCopy(at('2026-11-01T10:30:00Z'), at('2026-11-01T12:31:00Z')) === true
  );
  assert(
    'A',
    NEEDS_CODE[4][1],
    CLEAN.isExpiredCopy(at('2026-11-01T10:30:00Z'), at('2026-11-01T12:30:00Z')) === false
  );
  assert(
    'A',
    NEEDS_CODE[5][1],
    CLEAN.expiredBefore(at('2026-11-01T21:00:00Z')).toISOString() === '2026-11-01T11:00:00.000Z' &&
      CLEAN.expiredBefore(at('2026-07-15T20:00:00Z')).toISOString() === '2026-07-15T12:00:00.000Z'
  );
  assert(
    'A',
    NEEDS_CODE[6][1],
    CLEAN.DEMO_CLEANUP?.perRun === 25 && CLEAN.DEMO_CLEANUP?.minAgeMs === 2 * HOUR
  );

  // ══ B — the fixtures ═════════════════════════════════════════════════════════
  section('B — the fixtures');
  // Copies, oldest first: E2 (4 days), W (3.5), K (3), E1 (2.5), M (2), F (1.5); T today.
  const E2 = await startCopy(ago(4 * DAY));
  const W = await startCopy(ago(3.5 * DAY));
  const K = await startCopy(ago(3 * DAY));
  const E1 = await startCopy(); // backdated after her visit below
  const M = await startCopy(ago(2 * DAY));
  const F = await startCopy(ago(1.5 * DAY));
  const T = await startCopy();

  // E1: a visitor's work, over HTTP with her own session.
  const C = E1.eventId;
  const hh = await http('POST', `/api/events/${C}/host-household`, E1.cookie, {
    alone: false,
    name: 'Sam',
    partner: { name: 'Riley Sample', email: addr('riley') },
    helpers: [{ name: 'Mia Sample' }],
  });
  const ana = await http('POST', `/api/events/${C}/households`, E1.cookie, {
    primaryContact: { name: 'Ana Sample', email: addr('ana') },
  });
  const bo = await http('POST', `/api/events/${C}/households`, E1.cookie, {
    primaryContact: { name: 'Bo Sample', email: addr('bo') },
  });
  const cy = await http('POST', `/api/events/${C}/people`, E1.cookie, {
    name: 'Cy Sample',
    email: addr('cy'),
  });
  const anaId = ana.body?.household?.id;
  const withBen = anaId
    ? await http('PUT', `/api/events/${C}/households/${anaId}`, E1.cookie, {
        primaryContact: { name: 'Ana Sample', email: addr('ana') },
        partner: { name: 'Ben Sample', email: addr('ben') },
      })
    : { status: -1, body: null };
  const crowd = await http('POST', `/api/events/${C}/households`, E1.cookie, { demoCrowd: true });
  names.push('Riley', 'Mia', 'Ana', 'Bo', 'Cy', 'Ben', 'Sample');
  const boP = await memberNamed(C, 'Bo Sample');
  const cyP = await memberNamed(C, 'Cy Sample');
  const benP = await memberNamed(C, 'Ben Sample');
  // The three removals: a household delete, a person delete, a household edit.
  const boHh = bo.body?.household?.id;
  const delHh = boHh
    ? await http('DELETE', `/api/events/${C}/households/${boHh}`, E1.cookie)
    : { status: -1 };
  const delP = cyP
    ? await http('DELETE', `/api/events/${C}/people/${cyP.id}`, E1.cookie)
    : { status: -1 };
  const edit = anaId
    ? await http('PUT', `/api/events/${C}/households/${anaId}`, E1.cookie, {
        primaryContact: { name: 'Ana Sample', email: addr('ana') },
      })
    : { status: -1, body: null };
  const crowdCount = await prisma.person.count({
    where: { sampleEventId: C, email: { contains: '.demo-copy.invalid' } },
  });
  assert(
    'B',
    NEEDS_CODE[7][1],
    hh.status === 201 &&
      ana.status === 201 &&
      bo.status === 201 &&
      cy.status < 300 &&
      withBen.status === 200 &&
      crowd.status === 201 &&
      crowdCount > 0,
    JSON.stringify({
      hh: hh.status,
      ana: ana.status,
      bo: bo.status,
      cy: cy.status,
      ben: withBen.status,
      crowd: crowd.status,
      crowdCount,
    })
  );
  const removed = [boP, cyP, benP].filter(Boolean) as Array<{ id: string }>;
  const removedNow = await prisma.person.findMany({
    where: { id: { in: removed.map((p) => p.id) } },
    select: { id: true, sampleEventId: true, eventMemberships: { select: { id: true } } },
  });
  assert(
    'B',
    NEEDS_CODE[8][1],
    delHh.status === 200 &&
      delP.status === 200 &&
      edit.status === 200 &&
      removed.length === 3 &&
      removedNow.length === 3 &&
      removedNow.every((p) => p.sampleEventId === C && p.eventMemberships.length === 0),
    JSON.stringify({
      delHh: delHh.status,
      delP: delP.status,
      edit: edit.status,
      found: removedNow.length,
      members: removedNow.map((p) => p.eventMemberships.length),
    })
  );

  // E1's plan rows, as the plan view and the old dashboard write them.
  const anaP = await memberNamed(C, 'Ana Sample');
  const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: C } });
  const item = await prisma.item.create({ data: { name: `${TAG} Pavlova`, teamId: team.id } });
  if (anaP) await prisma.assignment.create({ data: { itemId: item.id, personId: anaP.id } });
  await prisma.day.create({
    data: { name: 'Saturday', date: new Date(Date.UTC(2027, 1, 6)), eventId: C },
  });
  if (anaP) {
    await prisma.accessToken.create({
      data: {
        token: `${TAG}-tok-${randomBytes(8).toString('hex')}`,
        scope: 'PARTICIPANT',
        eventId: C,
        personId: anaP.id,
      },
    });
  }
  await prisma.auditEntry.create({
    data: { eventId: C, actionType: 'GTC442_PROBE', targetType: 'Event', targetId: C },
  });
  const tpl = await prisma.structureTemplate.create({
    data: {
      hostId: E1.userId,
      templateSource: 'HOST',
      name: `${TAG} tpl`,
      occasionType: 'OTHER',
      teams: [],
      items: [],
      days: [],
    },
  });
  fx.templates.add(tpl.id);
  const qp = await prisma.quantitiesProfile.create({
    data: {
      hostId: E1.hostId,
      occasionType: 'OTHER',
      derivedFrom: {},
      ratios: {},
      itemQuantities: [],
      overrides: {},
    },
  });
  fx.profiles.add(qp.id);
  await prisma.event.update({ where: { id: C }, data: { createdAt: ago(2.5 * DAY) } });

  // W: a WrapUpLink on its host. M: a stamped person who also belongs to a real event.
  const link = await prisma.wrapUpLink.create({
    data: {
      token: `${TAG}-wul`,
      eventId: W.eventId,
      personId: W.hostId,
      guestName: 'Sam',
      channel: 'email',
      expiresAt: new Date(NOW + DAY),
    },
  });
  fx.links.add(link.id);
  const realHost = await realAccount('hana', 'Hana Real');
  const R1 = await makeEvent(realHost.person.id, `${TAG} real`, false);
  const mStamped = await stampedOn(M.eventId, 'Moana Sample');
  const mOther = await stampedOn(M.eventId, 'Nika Sample');
  await prisma.personEvent.create({ data: { personId: mStamped.id, eventId: R1.id } });
  // Controls: a real event named as a sample, three days old, with a person; a sample event
  // hosted by a real account, three days old; the old shared 2025 row.
  const R0 = await makeEvent(realHost.person.id, 'Your sample gathering', false, ago(3 * DAY));
  const r0Guest = await prisma.person.create({ data: { name: 'Tui Real', email: addr('tui') } });
  fx.persons.add(r0Guest.id);
  names.push('Tui Real', 'Hana Real', 'Moana', 'Nika');
  await prisma.personEvent.create({ data: { personId: r0Guest.id, eventId: R0.id } });
  const X = await makeEvent(
    realHost.person.id,
    `${TAG} sample on a real account`,
    true,
    ago(3 * DAY)
  );
  const shared = await prisma.event.findFirst({
    where: { isDemo: true, name: 'Henderson Family Christmas 2025' },
    select: { id: true },
  });
  const sharedRows = shared ? await rowsOn([shared.id]) : null;
  const e1Ids = {
    households: (
      await prisma.household.findMany({ where: { eventId: C }, select: { id: true } })
    ).map((h) => h.id),
    members: (
      await prisma.personEvent.findMany({ where: { eventId: C }, select: { id: true } })
    ).map((m) => m.id),
    people: (
      await prisma.person.findMany({
        where: { OR: [{ id: E1.hostId }, { sampleEventId: C }] },
        select: { id: true },
      })
    ).map((p) => p.id),
    team: team.id,
    item: item.id,
  };
  const e1Rows = await rowsOn([C]);
  assert(
    'B',
    NEEDS_CODE[9][1],
    e1Rows.team === 1 &&
      e1Rows.item === 1 &&
      e1Rows.assignment === 1 &&
      e1Rows.day === 1 &&
      e1Rows.accessToken >= 1 &&
      e1Rows.auditEntry >= 1 &&
      e1Ids.people.length >= 8 &&
      !!shared &&
      (await exists.event(R0.id)) &&
      (await exists.event(X.id)) &&
      (await whole(T)),
    JSON.stringify({ ...e1Rows, people: e1Ids.people.length, shared: !!shared })
  );

  // ══ C — the cap ══════════════════════════════════════════════════════════════
  section('C — the cap: oldest first, a limit per run, a skipped copy uses no place');
  const c1 = await sweep(prisma, { limit: 1 });
  assert('C', NEEDS_CODE[10][1], c1.deleted === 1 && (await gone(E2)), JSON.stringify(c1));
  assert(
    'C',
    NEEDS_CODE[11][1],
    (await whole(W)) && (await whole(K)) && (await whole(E1)) && (await whole(M)),
    ''
  );
  // W is now the oldest, and it is skipped (its WrapUpLink): K must still go.
  const c3 = await sweep(prisma, { limit: 1 });
  assert(
    'C',
    NEEDS_CODE[12][1],
    c3.deleted === 1 &&
      c3.skipped === 1 &&
      (await gone(K)) &&
      (await whole(W)) &&
      (await whole(E1)),
    JSON.stringify(c3)
  );
  // C4: the look limit is real. A second skipped copy, W2, sits behind W; with a look limit of 2,
  // the two skipped copies use the whole look and E1 (eligible) is not reached. W2 is then
  // removed by id, so no later check sees it.
  const W2 = await startCopy(ago(3.2 * DAY));
  const link2 = await prisma.wrapUpLink.create({
    data: {
      token: `${TAG}-wul2`,
      eventId: W2.eventId,
      personId: W2.hostId,
      guestName: 'Sam',
      channel: 'email',
      expiresAt: new Date(NOW + DAY),
    },
  });
  fx.links.add(link2.id);
  const c4 = await sweep(prisma, { lookAt: 2 });
  assert(
    'C',
    NEEDS_CODE[13][1],
    c4.found === 2 &&
      c4.skipped === 2 &&
      c4.deleted === 0 &&
      c4.failed === 0 &&
      (await whole(E1)) &&
      (await whole(W)) &&
      (await whole(W2)),
    JSON.stringify(c4)
  );
  await prisma.wrapUpLink.delete({ where: { id: link2.id } });
  await prisma.event.delete({ where: { id: W2.eventId } });
  await prisma.person.deleteMany({
    where: { OR: [{ id: W2.hostId }, { sampleEventId: W2.eventId }] },
  });
  await prisma.user.delete({ where: { id: W2.userId } });

  // ══ D, E — the sweep, with one copy made to fail ═════════════════════════════
  section('D — the sweep; E — the guards (F is made to fail through the db argument)');
  const doomed = [C, M.eventId];
  const expected = await rowsOn(doomed);
  const doomedPeople = [...e1Ids.people, M.hostId, mOther.id];
  const before = await totals();
  const main = await sweep(failingFor(F.eventId));
  const after = await totals();
  assert(
    'D',
    NEEDS_CODE[14][1],
    main.found === 4 && main.deleted === 2 && main.skipped === 1 && main.failed === 1,
    JSON.stringify(main)
  );
  const left = await rowsOn([C]);
  const assignmentLeft = await prisma.assignment.count({ where: { itemId: e1Ids.item } });
  assert(
    'D',
    NEEDS_CODE[15][1],
    !(await exists.event(C)) &&
      Object.values(left)
        .slice(1)
        .every((n) => n === 0) &&
      assignmentLeft === 0 &&
      (await prisma.household.count({ where: { id: { in: e1Ids.households } } })) === 0 &&
      (await prisma.personEvent.count({ where: { id: { in: e1Ids.members } } })) === 0 &&
      (await prisma.team.count({ where: { id: e1Ids.team } })) === 0,
    JSON.stringify(left)
  );
  assert(
    'D',
    NEEDS_CODE[16][1],
    (await prisma.person.count({ where: { id: { in: e1Ids.people } } })) === 0,
    `${await prisma.person.count({ where: { id: { in: e1Ids.people } } })} left`
  );
  assert(
    'D',
    NEEDS_CODE[17][1],
    (await prisma.person.count({ where: { id: { in: removed.map((p) => p.id) } } })) === 0
  );
  assert(
    'D',
    NEEDS_CODE[18][1],
    !(await exists.user(E1.userId)) &&
      !(await exists.session(E1.token)) &&
      (await prisma.eventRole.count({ where: { userId: E1.userId } })) === 0
  );
  assert(
    'D',
    NEEDS_CODE[19][1],
    (await prisma.structureTemplate.count({ where: { id: tpl.id } })) === 0 &&
      (await prisma.quantitiesProfile.count({ where: { id: qp.id } })) === 0
  );
  assert('D', NEEDS_CODE[20][1], await whole(T));
  const sharedAfter = shared ? await rowsOn([shared.id]) : null;
  assert(
    'D',
    NEEDS_CODE[21][1],
    !!shared && JSON.stringify(sharedAfter) === JSON.stringify(sharedRows),
    JSON.stringify({ before: sharedRows, after: sharedAfter })
  );
  assert(
    'D',
    NEEDS_CODE[22][1],
    (await exists.event(R0.id)) &&
      (await exists.person(r0Guest.id)) &&
      (await prisma.personEvent.count({ where: { eventId: R0.id } })) === 1
  );
  assert('D', NEEDS_CODE[23][1], await exists.event(X.id));
  const want: Record<string, number> = { ...before };
  for (const [k, n] of Object.entries(expected)) want[k] -= n;
  want.person -= doomedPeople.length;
  want.stamped -= doomedPeople.length;
  want.user -= 2;
  want.session -= 2;
  want.structureTemplate -= 1;
  want.quantitiesProfile -= 1;
  assert('D', NEEDS_CODE[24][1], diff(want, after) === '', diff(want, after));

  assert(
    'E',
    NEEDS_CODE[25][1],
    (await whole(W)) && (await prisma.wrapUpLink.count({ where: { id: link.id } })) === 1
  );
  assert(
    'E',
    NEEDS_CODE[26][1],
    logLines.some((l) => /\[demo-cleanup\] skipped a copy: a wrap-up link exists/.test(l))
  );
  assert(
    'E',
    NEEDS_CODE[27][1],
    (await exists.person(mStamped.id)) &&
      (await prisma.personEvent.count({ where: { personId: mStamped.id, eventId: R1.id } })) ===
        1 &&
      (await prisma.personEvent.count({ where: { personId: mStamped.id } })) === 1
  );
  assert(
    'E',
    NEEDS_CODE[28][1],
    !(await exists.event(M.eventId)) &&
      !(await exists.user(M.userId)) &&
      !(await exists.person(M.hostId)) &&
      !(await exists.person(mOther.id))
  );
  const xBefore = await rowsOn([X.id]);
  const e5 = await capture(() => CLEAN.sweepOneCopy(prisma, X.id));
  assert(
    'E',
    NEEDS_CODE[29][1],
    e5?.kind === 'skipped' &&
      e5?.why === 'not a copy account' &&
      JSON.stringify(await rowsOn([X.id])) === JSON.stringify(xBefore) &&
      (await exists.user(realHost.user.id)),
    JSON.stringify(e5)
  );
  assert(
    'E',
    NEEDS_CODE[30][1],
    main.failed === 1 &&
      (await whole(F)) &&
      !(await exists.event(C)) &&
      !(await exists.event(M.eventId)),
    JSON.stringify(main)
  );

  // ══ R — the route, in process ════════════════════════════════════════════════
  section('R — the cron route, in process, with a secret made up for this run');
  const r1 = await callRoute('GET', '');
  assert('R', NEEDS_CODE[34][1], r1.status === 401 && (await whole(F)), `${r1.status}`);
  const r2a = await callRoute('GET', '?secret=', { authorization: 'Bearer ' });
  const r2b = await callRoute('POST', '?secret=');
  assert(
    'R',
    NEEDS_CODE[35][1],
    r2a.status === 401 && r2b.status === 401,
    `${r2a.status} ${r2b.status}`
  );
  const r3 = await callRoute('GET', '', { authorization: `Bearer ${TAG}-wrong` });
  assert('R', NEEDS_CODE[36][1], r3.status === 401 && (await whole(F)), `${r3.status}`);

  // H: a stamped person who hosts a real event cannot be deleted (the host key restricts it).
  const H = await startCopy(ago(1.2 * DAY));
  const hHost = await stampedOn(H.eventId, 'Huia Sample');
  names.push('Huia');
  const R2 = await makeEvent(hHost.id, `${TAG} hosted by a sample person`, false);
  const r9 = await callRoute('GET', '', { authorization: `Bearer ${MADE_UP_SECRET}` });
  completedRuns++;
  assert(
    'R',
    NEEDS_CODE[42][1],
    r9.status === 500 &&
      r9.body?.failed === 1 &&
      r9.body?.deleted === 1 &&
      r9.body?.skipped === 1 &&
      (await gone(F)) &&
      (await whole(H)),
    JSON.stringify({ status: r9.status, body: r9.body })
  );
  await prisma.event.delete({ where: { id: R2.id } });
  fx.events.delete(R2.id);
  const r4 = await callRoute('GET', '', { authorization: `Bearer ${MADE_UP_SECRET}` });
  completedRuns++;
  assert(
    'R',
    NEEDS_CODE[37][1],
    r4.status === 200 &&
      r4.body?.success === true &&
      r4.body?.deleted === 1 &&
      r4.body?.failed === 0 &&
      (await gone(H)) &&
      !(await exists.person(hHost.id)),
    JSON.stringify({ status: r4.status, body: r4.body })
  );
  const r5 = await callRoute('POST', `?secret=${encodeURIComponent(MADE_UP_SECRET)}`);
  completedRuns++;
  assert('R', NEEDS_CODE[38][1], r5.status === 200 && r5.body?.success === true, `${r5.status}`);
  assert(
    'R',
    NEEDS_CODE[43][1],
    r5.status === 200 && r5.body?.skipped === 1 && r5.body?.deleted === 0 && r5.body?.failed === 0,
    JSON.stringify(r5.body)
  );
  const delegate: any = prisma.event;
  const findMany = delegate.findMany;
  let r6 = { status: -1, body: null as any };
  try {
    delegate.findMany = () => Promise.reject(new Error('probe: the read failed'));
    r6 = await callRoute('GET', '', { authorization: `Bearer ${MADE_UP_SECRET}` });
  } finally {
    delegate.findMany = findMany;
  }
  assert('R', NEEDS_CODE[39][1], r6.status === 500 && r6.body?.success === false, `${r6.status}`);
  const routeSrc = read(ROUTE);
  assert(
    'R',
    NEEDS_CODE[40][1],
    CHECKS.secretCheckAsTheOthers(routeSrc) &&
      CRON_ROUTES.every((f) => CHECKS.secretCheckAsTheOthers(read(f)))
  );
  assert(
    'R',
    NEEDS_CODE[41][1],
    CHECKS.sameList(CHECKS.importsOf(routeSrc), [
      'next/server',
      '@/lib/prisma',
      '@/lib/demo/cleanup',
      '../cron-secret',
    ]),
    CHECKS.importsOf(routeSrc).join(', ')
  );

  // ══ G — again ════════════════════════════════════════════════════════════════
  section('G — a second run');
  const g1 = await sweep(prisma);
  assert(
    'G',
    NEEDS_CODE[33][1],
    g1.deleted === 0 && g1.failed === 0 && g1.skipped === 1 && (await whole(W)) && (await whole(T)),
    JSON.stringify(g1)
  );

  // ══ F — the log ══════════════════════════════════════════════════════════════
  section('F — the log');
  const banned = [
    ...names,
    TAG,
    RUN,
    ...[...fx.events],
    ...[...fx.users],
    ...[...fx.persons],
    E1.token,
  ];
  const ours = logLines.filter((l) => l.includes('[demo-cleanup]'));
  assert(
    'F',
    NEEDS_CODE[31][1],
    ours.length > 0 && ours.every((l) => CHECKS.countsOnly(l, banned)),
    ours.filter((l) => !CHECKS.countsOnly(l, banned)).length +
      ' line(s) carry a name, address or id'
  );
  const summaries = ours.filter((l) => l.includes('[demo-cleanup] copies found')).length;
  assert(
    'F',
    NEEDS_CODE[32][1],
    summaries === completedRuns,
    `${summaries} for ${completedRuns} runs`
  );
}

function sourceLayer() {
  section('V — the schedule, the table, the imports (source)');
  assert(
    'V',
    'V1 vercel.json: six crons in one form, the sixth /api/cron/demo-cleanup at "17 * * * *"',
    CHECKS.vercelHasTheLine(read('vercel.json'))
  );
  assert(
    'V',
    'V2 the constants’ cron table has the demo-cleanup row, hourly at :17',
    CHECKS.constantsHasTheRow(read('GATHER-BUILD-CONSTANTS.md'))
  );
  const mod = read(MODULE);
  assert(
    'V',
    'V3 cleanup.ts imports only the client’s types, the NZ day and the copy’s marks: it sends nothing',
    mod.length > 0 &&
      CHECKS.sameList(CHECKS.importsOf(mod), [
        '@prisma/client',
        '@/lib/lifecycle',
        '@/lib/demo/copy',
      ]),
    CHECKS.importsOf(mod).join(', ')
  );
}

async function teardown() {
  if (!prisma) return;
  await prisma.wrapUpLink.deleteMany({ where: { id: { in: [...fx.links] } } });
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  const stamped = await prisma.person.findMany({
    where: { OR: [{ sampleEventId: { in: events } }, { email: { contains: RUN } }] },
    select: { id: true },
  });
  stamped.forEach((p) => fx.persons.add(p.id));
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.sessions] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
  await prisma.structureTemplate.deleteMany({ where: { id: { in: [...fx.templates] } } });
  await prisma.quantitiesProfile.deleteMany({ where: { id: { in: [...fx.profiles] } } });
}

if (process.env.DEMO_CLEANUP_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      failed++;
      console.error(e);
    })
    .finally(async () => {
      if (prisma) await prisma.$disconnect();
      console.log(`\n${passed} passed, ${failed} failed`);
      if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
      process.exit(failed > 0 ? 1 : 0);
    });
}
