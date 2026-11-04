/**
 * [[GTC-449]] — A SAMPLE COPY IS NOT DELETED BY ITS VISITOR, SO NO LIMIT FORGETS IT.
 * Founder rulings, 3 Nov 2026 (A to M as recommended; W59 the third draft; case F as P1).
 *
 *   S  the route: the only change since 026d376 is the GTC-449 lines; the refusal sits after
 *      the session, event and role checks and before the transaction, isDemo read first
 *   W  W59, exactly as approved
 *   L  the loop closed: per visitor over HTTP (start, delete refused, three times; the fourth
 *      start is refused); the hour, the day and the day's AI total still count a copy whose
 *      delete was tried
 *   R  the refusal: her 403 and its body; a host who is not the visitor; a co-host; no session,
 *      an outsider and no such event answer as before
 *   C  CONTROLS: a real event's delete and refusals byte for byte; a real co-host's delete; the
 *      old shared sample's shape; the shared sample at rest in gather_demo
 *   N  nothing sent
 *   P  the events page shows W59 for this refusal only; every other refusal as before
 *   Z  every probe row removed by id; every total as found
 *
 * Every DELETE goes over HTTP to the dev server (DEMO_SANDBOX_BASE_URL, default
 * http://localhost:3000): the route needs a request scope. Copies, plan rows and controls are
 * made in process against the same database. Preconditions (the database, the server, no copy
 * at the start) refuse the run; they are not checks.
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). Every
 * address is made up (@gtc449.invalid, or a copy's own under demo-copy.invalid); the visitor's
 * address is a documentation address. Nothing here sends, queues a message, mints a link or
 * calls the AI. Teardown deletes this run's rows by id.
 *
 *   npx tsx tests/demo-delete-limits-test.ts
 */
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';

const ROOT = path.join(__dirname, '..');
/** Where the fixed commit is read from (a copy of the tree outside the repo names the repo). */
const GIT_DIR = process.env.GTC449_GIT_DIR ?? ROOT;
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
const RUN = randomBytes(4).toString('hex');
const DOMAIN = 'gtc449.invalid';
const COPY_DOMAIN = '@demo-copy.invalid';
const addr = (local: string) => `${local}-${RUN}@${DOMAIN}`;
const HOUR = 60 * 60 * 1000;
const FIXED = '026d376';
const ROUTE = 'src/app/api/events/[id]/route.ts';
const PAGE = 'src/app/plan/events/page.tsx';

/** W59, approved 3 Nov 2026 (the third draft); its words as ruled in GTC-452 (4 Nov 2026). */
const W59 =
  "A sample event can't be deleted, but there's no need: Gather deletes it, and everything you type into it, the next day. To start again, sign out and try a new sample event. You can still remove anyone you added.";
/** W7, W8a, W8b and W6 as GTC-392 part A holds them. */
const W7 = "You've started a few sample events in the last hour. Please try again a little later.";
const W8A = 'Lots of people are trying Gather right now. Please try again in a few minutes.';
const W8B = 'The sample is full for today. Please try again tomorrow.';
const W6 = 'The sample has made all the plans it can for today. Please try again tomorrow.';

/** The answers a caller gets today, byte for byte (route.ts at 026d376). */
const ANSWER = {
  refused: JSON.stringify({ error: 'Cannot delete event', reason: 'SAMPLE_COPY', message: W59 }),
  unauthorized: JSON.stringify({ error: 'Unauthorized' }),
  noRole: JSON.stringify({
    error: 'Cannot delete event',
    reason: 'SUBSCRIPTION_INACTIVE',
    message: 'Your subscription is inactive. Please update your payment method or upgrade.',
  }),
  notFound: JSON.stringify({ error: 'Event not found' }),
  deleted: JSON.stringify({ success: true }),
};

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
const ok = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false;
  }
};

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const atFixed = (rel: string) => {
  try {
    return execFileSync('git', ['show', `${FIXED}:${rel}`], { cwd: GIT_DIR, encoding: 'utf8' });
  } catch {
    return null;
  }
};

/**
 * CHECKS: every source condition, pure, so each can be tried on a passing and a failing input
 * (DEMO_DELETE_LIMITS_DRY_RUN=1 imports them without running the suite).
 */
export const CHECKS = {
  /** The route with the GTC-449 lines taken out: the import, W59's constant, the new `if`. */
  withoutGtc449(src: string): string {
    return src
      .replace("import { copyEventWhere } from '@/lib/demo/copy';\n", '')
      .replace(
        /\/\/ \[\[GTC-449\]\][^\n]*\nconst SAMPLE_COPY_DELETE_WORDS =\n {2}"[^"\n]*";\n\n/,
        ''
      )
      .replace(
        / {4}\/\/ \[\[GTC-449\]\][\s\S]*?\n {4}\}\n\n(?= {4}\/\/ Delete event and all related data in a transaction)/,
        ''
      );
  },
  /** S1: nothing else in the route moved since the fixed commit. */
  onlyGtc449Lines(src: string, fixed: string | null): boolean {
    return fixed !== null && src.length > 0 && CHECKS.withoutGtc449(src) === fixed;
  },
  /** S2: the refusal's place and its reading of the copy rule. */
  refusalPlaced(src: string): boolean {
    const at = src.indexOf('export async function DELETE');
    if (at < 0) return false;
    const del = src.slice(at);
    const role = del.indexOf("reason: 'SUBSCRIPTION_INACTIVE'");
    const guard = del.search(
      /if \(\s*existingEvent\.isDemo &&\s*\(await prisma\.event\.count\(\{ where: \{ id: eventId, \.\.\.copyEventWhere\(\) \} \}\)\) > 0\s*\) \{\s*return NextResponse\.json\(\s*\{ error: 'Cannot delete event', reason: 'SAMPLE_COPY', message: SAMPLE_COPY_DELETE_WORDS \},\s*\{ status: 403 \}\s*\);\s*\}/
    );
    const tx = del.indexOf('await prisma.$transaction(');
    return (
      src.includes("import { copyEventWhere } from '@/lib/demo/copy';") &&
      role > 0 &&
      guard > role &&
      tx > guard
    );
  },
  /** W1: the words, a constant in the route, not exported. */
  wordsOf(src: string): string | null {
    const m = src.match(/^const SAMPLE_COPY_DELETE_WORDS =\s*"([^"\n]*)";$/m);
    return m && !/export\s+const\s+SAMPLE_COPY_DELETE_WORDS/.test(src) ? m[1] : null;
  },
  wordsAsApproved(src: string): boolean {
    const w = CHECKS.wordsOf(src);
    return w === W59 && !/remind|chas(e|ed|es|ing)\b/i.test(w);
  },
  /** P1: executeDelete shows the answer's words for this refusal only; the rest as before. */
  pageShowsRefusal(src: string): boolean {
    const a = src.indexOf('const executeDelete = async () => {');
    const b = src.indexOf('const closeDeleteModal = () => {');
    if (a < 0 || b < a) return false;
    const fn = src.slice(a, b);
    return (
      fn.includes(
        "const response = await fetch(`/api/events/${eventToDelete.id}`, {\n        method: 'DELETE',\n      });"
      ) &&
      /if \(!response\.ok\) \{\s*(\/\/[^\n]*\s*)*const (\w+) = await response\.json\(\)\.catch\(\(\) => null\);\s*if \(\2\?\.reason === 'SAMPLE_COPY' && typeof \2\.message === 'string'\) \{\s*toast\.info\(\2\.message\);\s*closeDeleteModal\(\);\s*return;\s*\}\s*throw new Error\('Failed to delete event'\);\s*\}/.test(
        fn
      ) &&
      fn.includes("toast.error('Failed to delete event. Please try again.');") &&
      fn.includes('toast.success(`"${eventToDelete.name}" has been permanently deleted.`);') &&
      (fn.match(/toast\.info\(/g) ?? []).length === 1
    );
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
let COPY: any;
let LIM: any;
let AI: any;

/** Every row the run made, by id. */
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessions: new Set<string>(),
};

/** Every host this process asked for (nothing may leave this Mac). */
const hostsAsked: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = ((input: any, init?: any) => {
  try {
    hostsAsked.push(new URL(typeof input === 'string' ? input : input.url).hostname);
  } catch {
    hostsAsked.push('?');
  }
  return realFetch(input, init);
}) as typeof fetch;

async function http(
  method: string,
  p: string,
  o: { cookie?: string; headers?: Record<string, string>; body?: unknown } = {}
) {
  try {
    const headers: Record<string, string> = { ...(o.headers ?? {}) };
    if (o.cookie) headers.cookie = o.cookie;
    if (o.body !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers,
      body: o.body === undefined ? undefined : JSON.stringify(o.body),
      redirect: 'manual',
    });
    return { status: res.status, text: await res.text(), setCookie: res.headers.get('set-cookie') };
  } catch (e) {
    return { status: -1, text: String(e).slice(0, 160), setCookie: null as string | null };
  }
}
const del = (eventId: string, cookie?: string) =>
  http('DELETE', `/api/events/${eventId}`, cookie ? { cookie } : {});

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
  'eventRole',
  'assignment',
  'day',
  'conflict',
  'planRevision',
  'planSnapshot',
  'magicLink',
  'wrapUpLink',
] as const;
async function totals(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = await (prisma as any)[t].count();
  return out;
}
const diff = (a: Record<string, number>, b: Record<string, number>) =>
  Object.keys(a)
    .filter((k) => a[k] !== b[k])
    .map((k) => `${k} ${a[k]}→${b[k]}`)
    .join(', ');

/** The rows on these events, by table, while they exist. */
async function rowsOn(eventIds: string[]): Promise<Record<string, number>> {
  const e = { eventId: { in: eventIds } };
  const teams = await prisma.team.findMany({ where: e, select: { id: true } });
  const items = await prisma.item.findMany({
    where: { teamId: { in: teams.map((t) => t.id) } },
    select: { id: true },
  });
  return {
    event: await prisma.event.count({ where: { id: { in: eventIds } } }),
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
    conflict: await prisma.conflict.count({ where: e }),
    planRevision: await prisma.planRevision.count({ where: e }),
    planSnapshot: await prisma.planSnapshot.count({ where: e }),
  };
}
const same = (a: Record<string, number>, b: Record<string, number>) => diff(a, b) === '';

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

/** A real (made-up) account, its Person and a three-hour session. */
async function realAccount(local: string, name: string) {
  const email = addr(local);
  const user = await prisma.user.create({ data: { email } });
  fx.users.add(user.id);
  const person = await prisma.person.create({ data: { name, email, userId: user.id } });
  fx.persons.add(person.id);
  const token = `gtc449-${RUN}-${randomBytes(16).toString('hex')}`;
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3 * HOUR) },
  });
  fx.sessions.add(token);
  return { user, person, cookie: `session=${token}` };
}

async function makeEvent(hostId: string, name: string, isDemo: boolean) {
  const day = new Date(Date.UTC(2027, 1, 6));
  const e = await prisma.event.create({
    data: {
      ...EVENT_SHAPE,
      name: `GTC-449 ${RUN} ${name}`,
      startDate: day,
      endDate: day,
      isDemo,
      hostId,
      setup: { create: {} },
    },
  });
  fx.events.add(e.id);
  return e;
}
async function role(userId: string, eventId: string, r: 'HOST' | 'COHOST') {
  await prisma.eventRole.create({ data: { userId, eventId, role: r } });
}

/** A copy started in process (as the start route's copy shape does). */
async function startCopy() {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessions.add(c.sessionToken);
  const ev = await prisma.event.findUnique({ where: { id: c.eventId } });
  fx.persons.add(ev!.hostId);
  return {
    eventId: c.eventId as string,
    userId: c.userId as string,
    hostId: ev!.hostId,
    token: c.sessionToken as string,
    cookie: `session=${c.sessionToken}`,
  };
}

/** A copy started over HTTP by one made-up visitor address; its rows recorded at once. */
async function startOverHttp(visitor: string) {
  const r = await http('POST', '/api/demo/session', {
    headers: { 'x-real-ip': visitor },
    body: { start: 'copy' },
  });
  let eventId: string | null = null;
  try {
    eventId = r.status === 200 ? JSON.parse(r.text).eventId : null;
  } catch {
    eventId = null;
  }
  const token = /(?:^|[;,]\s*)session=([^;]+)/.exec(r.setCookie ?? '')?.[1] ?? null;
  if (eventId) {
    fx.events.add(eventId);
    const ev = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, host: { select: { userId: true } } },
    });
    if (ev) {
      fx.persons.add(ev.hostId);
      if (ev.host.userId) fx.users.add(ev.host.userId);
    }
  }
  if (token) fx.sessions.add(token);
  return { status: r.status, text: r.text, eventId, cookie: token ? `session=${token}` : '' };
}

/** A copy's rows and its account, session and Sam, for "nothing moved". */
async function copyWhole(c: { eventId: string; userId: string; hostId: string; token: string }) {
  return {
    ...(await rowsOn([c.eventId])),
    user: await prisma.user.count({ where: { id: c.userId } }),
    session: await prisma.session.count({ where: { token: c.token } }),
    sam: await prisma.person.count({ where: { id: c.hostId } }),
  };
}

/** Rows in every table the route deletes by hand, and in those its cascade takes. */
async function fill(eventId: string, tag: string) {
  const guest = await prisma.person.create({
    data: { name: `Guest ${tag}`, email: addr(`guest-${tag}`) },
  });
  fx.persons.add(guest.id);
  const hh = await prisma.household.create({ data: { eventId } });
  await prisma.personEvent.create({
    data: { personId: guest.id, eventId, householdId: hh.id },
  });
  const team = await prisma.team.create({ data: { eventId, name: `Team ${tag}` } });
  const item = await prisma.item.create({ data: { teamId: team.id, name: `Item ${tag}` } });
  await prisma.assignment.create({ data: { itemId: item.id, personId: guest.id } });
  await prisma.day.create({
    data: { eventId, name: `Day ${tag}`, date: new Date(Date.UTC(2027, 1, 6)) },
  });
  await prisma.accessToken.create({
    data: {
      eventId,
      personId: guest.id,
      scope: 'PARTICIPANT',
      token: `gtc449-${RUN}-${tag}-${randomBytes(12).toString('hex')}`,
    },
  });
  await prisma.conflict.create({
    data: {
      eventId,
      fingerprint: `gtc449-${RUN}-${tag}`,
      type: 'TIMING',
      severity: 'ADVISORY',
      claimType: 'RISK',
      resolutionClass: 'FIX_IN_PLAN',
      title: `Conflict ${tag}`,
      description: 'Made up for GTC-449.',
    },
  });
  await prisma.planRevision.create({
    data: {
      eventId,
      revisionNumber: 1,
      teams: [],
      items: [],
      days: [],
      conflicts: [],
      acknowledgements: [],
      createdAt: new Date(),
      createdBy: 'gtc449',
    },
  });
  await prisma.planSnapshot.create({
    data: {
      eventId,
      phase: 'CONFIRMING',
      teams: [],
      items: [],
      days: [],
      criticalFlags: [],
      acknowledgements: [],
    },
  });
  await prisma.auditEntry.create({
    data: { eventId, actionType: 'GTC449_PROBE', targetType: 'Event', targetId: eventId },
  });
  return { guestId: guest.id };
}

async function main() {
  // ── Preconditions: refusals, not checks ─────────────────────────────────────
  if (!DB_OK) {
    console.error(
      'demo-delete-limits: DATABASE_URL does not name gather_demo on this Mac; refused'
    );
    process.exitCode = 1;
    return;
  }
  prisma = (await import('../src/lib/prisma')).prisma as any;
  COPY = await import('../src/lib/demo/copy');
  LIM = await import('../src/lib/demo/start-limit');
  AI = await import('../src/lib/demo/ai-cap');
  const start = await totals();
  let serverOk = false;
  try {
    serverOk = (await realFetch(`${BASE}/api/events/gtc449-${RUN}-probe/people`)).status === 401;
  } catch {
    serverOk = false;
  }
  const copyUsersAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
  if (!serverOk || copyUsersAtStart !== 0) {
    console.error(
      `demo-delete-limits: refused (server answers: ${serverOk}; copy accounts at the start: ${copyUsersAtStart})`
    );
    process.exitCode = 1;
    return;
  }
  const atRest = await prisma.event.findMany({
    where: { isDemo: true, NOT: { host: { user: { email: { endsWith: COPY_DOMAIN } } } } },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  const atRestRows = await rowsOn(atRest.map((e) => e.id));

  try {
    await checks(atRest, atRestRows);
  } finally {
    await teardown();
  }

  // ── Z ───────────────────────────────────────────────────────────────────────
  section('Z — every probe row removed; every total as found');
  const left = {
    events: await prisma.event.count({ where: { id: { in: [...fx.events] } } }),
    users: await prisma.user.count({ where: { id: { in: [...fx.users] } } }),
    persons: await prisma.person.count({ where: { id: { in: [...fx.persons] } } }),
    sessions: await prisma.session.count({ where: { token: { in: [...fx.sessions] } } }),
  };
  assert(
    'Z',
    'Z1 every probe row removed by id (events, accounts, people, sessions)',
    Object.values(left).every((n) => n === 0),
    JSON.stringify(left)
  );
  const end = await totals();
  const copyLeft = {
    copies: await prisma.event.count({ where: COPY.copyEventWhere() }),
    copyUsers: await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } }),
    copyPeople: await prisma.person.count({ where: { email: { contains: 'demo-copy.invalid' } } }),
  };
  assert(
    'Z',
    'Z2 every total as found at the start; copies, copy accounts and copy people 0',
    same(start, end) && Object.values(copyLeft).every((n) => n === 0),
    `${diff(start, end)} ${JSON.stringify(copyLeft)}`
  );
}

async function checks(
  atRest: { id: string; updatedAt: Date }[],
  atRestRows: Record<string, number>
) {
  const route = read(ROUTE);
  const page = read(PAGE);

  section('S — the route');
  assert(
    'S',
    'S1 the route, with the GTC-449 lines taken out, equals the file at 026d376 byte for byte',
    ok(() => CHECKS.onlyGtc449Lines(route, atFixed(ROUTE)))
  );
  assert(
    'S',
    "S2 the refusal sits after canEditEvent's 403 and before the transaction, reads existingEvent.isDemo first and the copy rule through copyEventWhere()",
    ok(() => CHECKS.refusalPlaced(route))
  );

  section('W — the words');
  assert(
    'W',
    "W1 the refusal's words equal W59 as approved (a constant in the route, not exported)",
    ok(() => CHECKS.wordsAsApproved(route)),
    JSON.stringify(CHECKS.wordsOf(route))
  );

  section('L — the loop closed');
  // L1 over HTTP: one made-up visitor address (a documentation address), three starts, each
  // delete tried with the copy's own cookie; then the fourth start.
  const visitor = `2001:db8::${RUN.slice(0, 4)}:${RUN.slice(4, 8)}`;
  const loop: { start: number; del: number }[] = [];
  const loopCopies: string[] = [];
  for (let i = 0; i < 3; i++) {
    const s = await startOverHttp(visitor);
    if (s.eventId) loopCopies.push(s.eventId);
    const d = s.eventId ? await del(s.eventId, s.cookie) : { status: -2 };
    loop.push({ start: s.status, del: d.status });
  }
  const accountsBefore4 = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
  const fourth = await startOverHttp(visitor);
  const accountsAfter4 = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
  const standing = await prisma.event.count({ where: { id: { in: loopCopies } } });
  assert(
    'L',
    'L1 the loop closed, per visitor, over HTTP with one X-Real-IP: start and delete (refused) three times; the fourth start answers 429 with W7 and writes nothing; the three copies stand',
    loop.every((x) => x.start === 200 && x.del === 403) &&
      loopCopies.length === 3 &&
      fourth.status === 429 &&
      ok(() => JSON.parse(fourth.text).error === W7) &&
      accountsAfter4 === accountsBefore4 &&
      standing === 3,
    JSON.stringify({ loop, fourth: fourth.status, standing, accountsBefore4, accountsAfter4 })
  );

  // L2 to L4: copy K, its delete tried; copy J, live, for the AI take.
  const J = await startCopy();
  const now0 = new Date();
  const hourBefore = await prisma.event.count({
    where: {
      ...COPY.copyEventWhere(),
      createdAt: { gt: new Date(now0.getTime() - HOUR), lte: now0 },
    },
  });
  const { nzDayStart } = await import('../src/lib/lifecycle');
  const dayBefore = await prisma.event.count({
    where: { ...COPY.copyEventWhere(), createdAt: { gte: nzDayStart(now0), lte: now0 } },
  });
  const aiBefore: number = await AI.demoAiUsedToday(prisma);
  const K = await startCopy();
  await prisma.event.update({ where: { id: K.eventId }, data: { aiCallsUsed: 3 } });
  const dK = await del(K.eventId, K.cookie);
  const kStands = (await prisma.event.count({ where: { id: K.eventId } })) === 1;
  const big = 1_000_000;
  const hourLim = await LIM.checkStartLimit(prisma, null, {
    limits: { perVisitorHour: 3, allHour: hourBefore + 1, allDay: big },
    aiLimits: { perCopy: 3, perDay: big },
  });
  assert(
    'L',
    'L2 the all-visitors hour still counts a copy after its delete was tried: allHour at the count before it plus one refuses with W8a',
    hourLim?.ok === false && hourLim?.words === W8A && kStands,
    JSON.stringify({ del: dK.status, hourLim, kStands })
  );
  const dayLim = await LIM.checkStartLimit(prisma, null, {
    limits: { perVisitorHour: 3, allHour: big, allDay: dayBefore + 1 },
    aiLimits: { perCopy: 3, perDay: big },
  });
  assert(
    'L',
    'L3 the day still counts it: allDay at the count before it plus one refuses with W8b',
    dayLim?.ok === false && dayLim?.words === W8B && kStands,
    JSON.stringify({ dayLim })
  );
  const aiNow: number = await AI.demoAiUsedToday(prisma);
  const aiLim = await LIM.checkStartLimit(prisma, null, {
    limits: { perVisitorHour: 3, allHour: big, allDay: big },
    aiLimits: { perCopy: 3, perDay: aiBefore + 3 },
  });
  const take = await AI.takeDemoAiCall(prisma, J.eventId, {
    limits: { perCopy: 3, perDay: aiBefore + 3 },
  });
  assert(
    'L',
    "L4 the day's AI total still counts the copy's 3 plans after the attempt: the total is the one before plus 3, a start at that limit is refused with W8b, and another copy's plan is refused with W6",
    aiNow === aiBefore + 3 &&
      aiLim?.ok === false &&
      aiLim?.words === W8B &&
      take?.ok === false &&
      take?.words === W6,
    JSON.stringify({ aiBefore, aiNow, aiLim, take })
  );

  section('R — the refusal');
  const R = await startCopy();
  await fill(R.eventId, 'r1');
  const r1Before = await copyWhole(R);
  const d1 = await del(R.eventId, R.cookie);
  const r1After = await copyWhole(R);
  assert(
    'R',
    'R1 her DELETE answers 403 with exactly { error, reason SAMPLE_COPY, message W59 }; nothing on the copy moved (event, setup, role, session, account, Sam, household, team, item and the rest)',
    d1.status === 403 &&
      d1.text === ANSWER.refused &&
      same(r1Before, r1After) &&
      r1After.event === 1,
    JSON.stringify({
      status: d1.status,
      text: d1.text.slice(0, 120),
      moved: diff(r1Before, r1After),
    })
  );

  const R2 = await startCopy();
  const otherHost = await realAccount('r2-host', 'Another Host');
  await role(otherHost.user.id, R2.eventId, 'HOST');
  const r2Before = await copyWhole(R2);
  const d2 = await del(R2.eventId, otherHost.cookie);
  const r2After = await copyWhole(R2);
  assert(
    'R',
    "R2 a copy's host who is not the visitor (a made-up real account with a HOST role on the copy): the same 403 and body; the copy whole",
    d2.status === 403 &&
      d2.text === ANSWER.refused &&
      same(r2Before, r2After) &&
      r2After.event === 1,
    JSON.stringify({ status: d2.status, moved: diff(r2Before, r2After) })
  );

  const R3 = await startCopy();
  const cohost = await realAccount('r3-cohost', 'A Cohost');
  await role(cohost.user.id, R3.eventId, 'COHOST');
  const r3Before = await copyWhole(R3);
  const d3 = await del(R3.eventId, cohost.cookie);
  const r3After = await copyWhole(R3);
  assert(
    'R',
    'R3 a COHOST on a copy (a made-up real account): the same 403 and body; the copy whole',
    d3.status === 403 &&
      d3.text === ANSWER.refused &&
      same(r3Before, r3After) &&
      r3After.event === 1,
    JSON.stringify({ status: d3.status, moved: diff(r3Before, r3After) })
  );

  const R4 = await startCopy();
  const r4Before = await copyWhole(R4);
  const d4 = await del(R4.eventId);
  assert(
    'R',
    'R4 no session: 401 {"error":"Unauthorized"} on a copy, byte for byte; the copy whole',
    d4.status === 401 && d4.text === ANSWER.unauthorized && same(r4Before, await copyWhole(R4)),
    JSON.stringify({ status: d4.status, text: d4.text.slice(0, 120) })
  );
  const d5 = await del(R4.eventId, J.cookie);
  assert(
    'R',
    "R5 an outsider (another copy's visitor): 403 with the SUBSCRIPTION_INACTIVE body byte for byte; the copy whole",
    d5.status === 403 && d5.text === ANSWER.noRole && same(r4Before, await copyWhole(R4)),
    JSON.stringify({ status: d5.status, text: d5.text.slice(0, 120) })
  );
  const d6 = await del(`gtc449-${RUN}-no-such-event`, J.cookie);
  assert(
    'R',
    'R6 an unknown id: 404 {"error":"Event not found"} byte for byte',
    d6.status === 404 && d6.text === ANSWER.notFound,
    JSON.stringify({ status: d6.status, text: d6.text.slice(0, 120) })
  );

  section('C — CONTROLS: real events and the old shared sample, as before');
  const h1 = await realAccount('c1-host', 'Real Host One');
  const E1 = await makeEvent(h1.person.id, 'real one', false);
  await role(h1.user.id, E1.id, 'HOST');
  const { guestId } = await fill(E1.id, 'c1');
  const c1On = await rowsOn([E1.id]);
  const c1Before = await totals();
  const dc1 = await del(E1.id, h1.cookie);
  const c1Left = await rowsOn([E1.id]);
  const c1After = await totals();
  const want: Record<string, number> = { ...c1Before };
  for (const [k, n] of Object.entries(c1On)) want[k] -= n;
  const handDeleted = [
    'assignment',
    'item',
    'team',
    'day',
    'personEvent',
    'accessToken',
    'conflict',
    'planRevision',
    'planSnapshot',
    'auditEntry',
    'eventSetup',
    'household',
    'eventRole',
  ];
  assert(
    'C',
    'C1 CONTROL a real event holding rows in every table the route deletes by hand and by cascade, deleted by its host: 200 {"success":true} byte for byte; every row on it gone; its people, account and session remain; every total moved by exactly those rows',
    dc1.status === 200 &&
      dc1.text === ANSWER.deleted &&
      handDeleted.every((k) => c1On[k] > 0) &&
      Object.values(c1Left).every((n) => n === 0) &&
      (await prisma.person.count({ where: { id: { in: [h1.person.id, guestId] } } })) === 2 &&
      (await prisma.user.count({ where: { id: h1.user.id } })) === 1 &&
      same(want, c1After),
    JSON.stringify({
      status: dc1.status,
      text: dc1.text.slice(0, 80),
      on: c1On,
      off: diff(want, c1After),
    })
  );

  const h2 = await realAccount('c2-host', 'Real Host Two');
  const E2 = await makeEvent(h2.person.id, 'real two', false);
  await role(h2.user.id, E2.id, 'HOST');
  await fill(E2.id, 'c2');
  const c2Before = await rowsOn([E2.id]);
  const e2a = await del(E2.id);
  const e2b = await del(E2.id, h1.cookie);
  const e2c = await del(`gtc449-${RUN}-no-such-real-event`, h2.cookie);
  assert(
    'C',
    "C2 CONTROL a real event's refusals byte for byte: no session 401, a real account with no role 403 (SUBSCRIPTION_INACTIVE), an unknown id 404; the event whole",
    e2a.status === 401 &&
      e2a.text === ANSWER.unauthorized &&
      e2b.status === 403 &&
      e2b.text === ANSWER.noRole &&
      e2c.status === 404 &&
      e2c.text === ANSWER.notFound &&
      same(c2Before, await rowsOn([E2.id])) &&
      c2Before.event === 1,
    JSON.stringify({ a: e2a.status, b: e2b.status, c: e2c.status })
  );

  const h3 = await realAccount('c3-host', 'Real Host Three');
  const co3 = await realAccount('c3-cohost', 'Real Cohost Three');
  const E3 = await makeEvent(h3.person.id, 'real three', false);
  await role(h3.user.id, E3.id, 'HOST');
  await role(co3.user.id, E3.id, 'COHOST');
  await fill(E3.id, 'c3');
  const dc3 = await del(E3.id, co3.cookie);
  assert(
    'C',
    'C3 CONTROL a real event deleted by its COHOST: 200 {"success":true} and every row on it gone, as before',
    dc3.status === 200 &&
      dc3.text === ANSWER.deleted &&
      Object.values(await rowsOn([E3.id])).every((n) => n === 0),
    JSON.stringify({ status: dc3.status, text: dc3.text.slice(0, 80) })
  );

  const h4 = await realAccount('c4-host', 'Shared Sample Host');
  const E4 = await makeEvent(h4.person.id, 'old shared sample shape', true);
  await role(h4.user.id, E4.id, 'HOST');
  await fill(E4.id, 'c4');
  const isCopy = await prisma.event.count({ where: { id: E4.id, ...COPY.copyEventWhere() } });
  const dc4 = await del(E4.id, h4.cookie);
  assert(
    'C',
    'C4 CONTROL the old shared sample\'s shape (isDemo, its host account not a copy\'s), deleted by its host: 200 {"success":true}, its rows gone',
    isCopy === 0 &&
      dc4.status === 200 &&
      dc4.text === ANSWER.deleted &&
      Object.values(await rowsOn([E4.id])).every((n) => n === 0),
    JSON.stringify({ isCopy, status: dc4.status, text: dc4.text.slice(0, 80) })
  );

  const atRestNow = await prisma.event.findMany({
    where: { id: { in: atRest.map((e) => e.id) } },
    select: { id: true, updatedAt: true },
    orderBy: { id: 'asc' },
  });
  assert(
    'C',
    'C5 CONTROL the shared sample at rest in gather_demo (the one isDemo event that is not a copy) is untouched: same id, same updatedAt, same rows',
    atRest.length === 1 &&
      JSON.stringify(atRestNow) === JSON.stringify(atRest) &&
      same(atRestRows, await rowsOn(atRest.map((e) => e.id))),
    JSON.stringify({ atRest: atRest.length, now: atRestNow.length })
  );

  section('N — nothing sent');
  const onFixtures = {
    outbound: await prisma.outboundMessage.count({ where: { eventId: { in: [...fx.events] } } }),
    invites: await prisma.inviteEvent.count({ where: { eventId: { in: [...fx.events] } } }),
  };
  const outside = [...new Set(hostsAsked)].filter((h) => !['localhost', '127.0.0.1'].includes(h));
  const startTotals = await totals();
  assert(
    'N',
    "N1 nothing sent: no OutboundMessage or InviteEvent row on any probe event; the suite's process asked no host but this Mac",
    onFixtures.outbound === 0 && onFixtures.invites === 0 && outside.length === 0,
    JSON.stringify({ onFixtures, outside, outbound: startTotals.outboundMessage })
  );

  section('P — the events page');
  assert(
    'P',
    "P1 the page: a refusal whose reason is 'SAMPLE_COPY' shows the answer's message with toast.info and closes the dialog; any other failure keeps 'Failed to delete event. Please try again.'; the DELETE request is the same",
    ok(() => CHECKS.pageShowsRefusal(page))
  );
}

async function teardown() {
  if (!prisma) return;
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  const owned = await prisma.person.findMany({
    where: {
      OR: [
        { userId: { in: [...fx.users] } },
        { email: { contains: RUN } },
        { sampleEventId: { in: events } },
      ],
    },
    select: { id: true },
  });
  owned.forEach((p) => fx.persons.add(p.id));
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({
    where: { OR: [{ token: { in: [...fx.sessions] } }, { userId: { in: [...fx.users] } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
}

if (process.env.DEMO_DELETE_LIMITS_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      failed++;
      console.error(e);
    })
    .finally(async () => {
      if (prisma) await prisma.$disconnect();
      console.log(`\n${passed} passed, ${failed} failed`);
      if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
      process.exit(failed > 0 || process.exitCode === 1 ? 1 : 0);
    });
}
