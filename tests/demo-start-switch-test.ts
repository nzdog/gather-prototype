/**
 * [[GTC-425]] — THE DEMO START SWITCH. The copy-start shape of `POST /api/demo/session`
 * (`{ start: 'copy' }`) opens only where `GATHER_DEMO_START` is exactly `on`.
 *
 * Founder rulings, 29 Oct 2026 (in Claude Code):
 *   - close the copy-start route behind a switch named GATHER_DEMO_START; only the exact value
 *     "on" opens it; read on every request; default off; 404 when closed; the check placed
 *     before the limits and before anything is read or written;
 *   - the old no-body shape is unchanged (GTC-015: the route stays reachable in production);
 *   - the button and page gates (NODE_ENV, /demo and /demo/new) stay exactly as they are;
 *   - the variable is NOT set on Railway: production stays closed until the founder turns it on
 *     at launch. This Mac's `.env.local` sets it, so the demo and its suites keep working here.
 *
 *   S1  the switch itself: only `on` is on, and it is read at every call
 *   S2  the route, read as code: the check comes first in the copy shape, answers 404, and the
 *       no-body shape and the two NODE_ENV gates are byte for byte as HEAD holds them
 *   S3  a dev server started WITHOUT the switch (unset, as production is): POST start copy
 *       answers 404, sets no cookie, and writes no copy
 *   S4  CONTROL: a dev server started WITH the switch on: the same POST starts a copy, so S3's
 *       404 is the switch and not a broken route
 *   G   teardown: every copy this run made is removed, and none is left
 *
 * SAFETY. S3 and S4 each start their own `next dev` from a copy of this working folder in a
 * scratch folder OUTSIDE the repo (git's tracked and untracked files, no `.env*`, node_modules
 * cloned), with a fixed environment: the local database named `gather_demo` only (refused
 * otherwise), every provider key blank, made-up Stripe keys, GATHER_LIVE_SENDS never set. The
 * only database writes are the copies the route makes (User, Person, Event, EventSetup,
 * EventRole, Session: six rows each, at most one per server), and this suite deletes them.
 *
 * Run with the local database's address in DATABASE_URL (never printed):
 *   npx tsx tests/demo-start-switch-test.ts
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';

delete process.env.GATHER_LIVE_SENDS;

const ROOT = path.join(__dirname, '..');
const ROUTE = 'src/app/api/demo/session/route.ts';
const SWITCH = 'src/lib/demo/start-switch.ts';
const GATES = ['src/app/demo/page.tsx', 'src/app/demo/new/layout.tsx'];
const COPY_DOMAIN = '@demo-copy.invalid';
const CLOSED_PORT = 3101;
const OPEN_PORT = 3102;
const RUN = randomBytes(4).toString('hex');

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
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const atHead = (rel: string) => {
  const r = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
};
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/** The no-body shape: from the shared sample's lookup comment to the end of the file. */
const NO_BODY_MARK = '// GTC-269: `isDemo: true` as well as the name.';
const noBodyPart = (src: string) => {
  const at = src.indexOf(NO_BODY_MARK);
  return at < 0 ? '' : src.slice(at);
};

// ── The database: gather_demo only ───────────────────────────────────────────
function databaseName(url: string | undefined): string {
  try {
    return new URL(url ?? '').pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}
const DB_OK = databaseName(process.env.DATABASE_URL) === 'gather_demo';
// Loaded only once the address is known to name gather_demo.
let prisma: import('@prisma/client').PrismaClient | null = null;

async function copyCount(): Promise<number> {
  return prisma!.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
}

/**
 * Remove every copy: the sample events hosted by a copy account's Person, then those Persons,
 * then the accounts (whose delete takes their Session and EventRole rows). Only isDemo events,
 * only Persons and Users on the copy domain. Returns how many accounts it removed.
 */
async function removeCopies(): Promise<number> {
  const users = await prisma!.user.findMany({
    where: { email: { endsWith: COPY_DOMAIN } },
    select: { id: true },
  });
  if (users.length === 0) return 0;
  const userIds = users.map((u) => u.id);
  await prisma!.$transaction(async (tx) => {
    const persons = await tx.person.findMany({
      where: { userId: { in: userIds }, email: { endsWith: COPY_DOMAIN } },
      select: { id: true },
    });
    const personIds = persons.map((p) => p.id);
    await tx.event.deleteMany({ where: { hostId: { in: personIds }, isDemo: true } });
    await tx.person.deleteMany({ where: { id: { in: personIds } } });
    await tx.user.deleteMany({ where: { id: { in: userIds }, email: { endsWith: COPY_DOMAIN } } });
  });
  return users.length;
}

// ── A dev server of this working folder, outside the repo ────────────────────
interface Server {
  url: string;
  stop: () => Promise<void>;
}

function exportWorkingFolder(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `gtc425-${RUN}-`));
  if (dir.startsWith(ROOT)) throw new Error('the scratch folder is inside the repo');
  const list = spawnSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (list.status !== 0) throw new Error('git ls-files failed');
  const files = list.stdout.split('\0').filter((f) => f && !/(^|\/)\.env/.test(f));
  for (const f of files) {
    const from = path.join(ROOT, f);
    if (!fs.existsSync(from) || fs.statSync(from).isDirectory()) continue;
    const to = path.join(dir, f);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.copyFileSync(from, to);
  }
  const cp = spawnSync('cp', [
    '-cR',
    path.join(ROOT, 'node_modules'),
    path.join(dir, 'node_modules'),
  ]);
  if (cp.status !== 0) throw new Error('node_modules could not be cloned');
  return dir;
}

async function startServer(port: number, demoStart: string | undefined): Promise<Server> {
  const busy = await fetch(`http://127.0.0.1:${port}/`)
    .then(() => true)
    .catch(() => false);
  if (busy) throw new Error(`port ${port} is in use`);
  const dir = exportWorkingFolder();
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    UNSUBSCRIBE_TOKEN_SECRET: process.env.UNSUBSCRIBE_TOKEN_SECRET ?? 'gtc425-made-up-secret',
    ANTHROPIC_API_KEY: '',
    RESEND_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    TNZ_AUTH_TOKEN: '',
    TNZ_API_KEY: '',
    CRON_SECRET: '',
    STRIPE_SECRET_KEY: 'gtc425-made-up-not-a-stripe-key',
    STRIPE_WEBHOOK_SECRET: 'gtc425-made-up-not-a-webhook-secret',
  };
  if (demoStart !== undefined) env.GATHER_DEMO_START = demoStart;
  const child: ChildProcess = spawn(
    path.join(dir, 'node_modules', '.bin', 'next'),
    ['dev', '--turbo', '-p', String(port)],
    { cwd: dir, env, detached: true, stdio: 'ignore' }
  );
  const kill = (signal: NodeJS.Signals) => {
    try {
      if (child.pid) process.kill(-child.pid, signal);
    } catch {
      // already gone
    }
  };
  process.on('exit', () => kill('SIGKILL'));
  const url = `http://localhost:${port}`;
  const stop = async () => {
    kill('SIGTERM');
    await sleep(1500);
    kill('SIGKILL');
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(1000);
      }
    }
  };
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    up = await fetch(`${url}/privacy`)
      .then((r) => r.status === 200)
      .catch(() => false);
    if (!up) await sleep(500);
  }
  if (!up) {
    await stop();
    throw new Error(`the server on ${port} did not answer`);
  }
  return { url, stop };
}

async function postStart(server: Server, visitor: string) {
  const res = await fetch(`${server.url}/api/demo/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': visitor },
    body: JSON.stringify({ start: 'copy' }),
  });
  const body = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  const cookie = res.headers.get('set-cookie') ?? '';
  return { status: res.status, body, setsSession: /(^|,\s*)session=/.test(cookie) };
}

// ── S1 — the switch itself ───────────────────────────────────────────────────
async function layerS1() {
  section('S1 — the switch: only "on" is on, read at every call');
  const mod = (await import('../src/lib/demo/start-switch').catch(() => null)) as {
    DEMO_START_VAR?: string;
    isDemoStartOn?: () => boolean;
  } | null;
  assert(
    'S1',
    `${SWITCH} loads and exports isDemoStartOn and DEMO_START_VAR = "GATHER_DEMO_START"`,
    !!mod && typeof mod.isDemoStartOn === 'function' && mod.DEMO_START_VAR === 'GATHER_DEMO_START'
  );
  const on = mod?.isDemoStartOn;
  const was = process.env.GATHER_DEMO_START;
  const reading = (value: string | undefined): boolean | null => {
    if (!on) return null;
    if (value === undefined) delete process.env.GATHER_DEMO_START;
    else process.env.GATHER_DEMO_START = value;
    try {
      return on();
    } catch {
      return null;
    }
  };
  try {
    assert('S1', 'unset reads closed', reading(undefined) === false);
    const closed = ['', 'true', '1', 'yes', 'ON', 'On', ' on', 'on ', 'off'];
    const opened = closed.filter((v) => reading(v) !== false);
    assert(
      'S1',
      `every near miss reads closed (${closed.map((v) => JSON.stringify(v)).join(', ')})`,
      !!on && opened.length === 0,
      opened.length ? `read open: ${opened.map((v) => JSON.stringify(v)).join(', ')}` : undefined
    );
    assert('S1', 'exactly "on" reads open', reading('on') === true);
    const first = reading('on');
    const second = reading(undefined);
    assert(
      'S1',
      'read at every call: on, then unset, in the same process, reads open then closed',
      first === true && second === false
    );
  } finally {
    if (was === undefined) delete process.env.GATHER_DEMO_START;
    else process.env.GATHER_DEMO_START = was;
  }
}

// ── S2 — the route, read as code ─────────────────────────────────────────────
function layerS2() {
  section('S2 — the route: the switch first in the copy shape, everything else as HEAD has it');
  const src = read(ROUTE);
  const code = stripComments(src);
  const handler = code.slice(code.indexOf('export async function POST'));
  const calls = handler.match(/isDemoStartOn\(\)/g) ?? [];
  assert(
    'S2',
    'the route imports isDemoStartOn from @/lib/demo/start-switch',
    /import\s*\{[^}]*\bisDemoStartOn\b[^}]*\}\s*from\s*'@\/lib\/demo\/start-switch'/.test(code)
  );
  assert(
    'S2',
    'the handler calls isDemoStartOn() exactly once',
    calls.length === 1,
    `found ${calls.length}`
  );

  const at = handler.indexOf('isDemoStartOn()');
  const firstOf = (needle: string) => {
    const i = handler.indexOf(needle);
    return i < 0 ? Infinity : i;
  };
  const before = (needle: string) => at >= 0 && at < firstOf(needle);
  assert(
    'S2',
    'the check comes before the session-cookie read, the limits, the copy and any database call',
    before('cookies()') &&
      before('checkStartLimit(') &&
      before('startDemoCopy(') &&
      before('visitorOf(') &&
      before('prisma.'),
    at < 0 ? 'no call found' : undefined
  );

  // The `if` that holds the call: its condition names the copy shape, and its body answers 404
  // before anything else happens.
  const ifAt = at >= 0 ? handler.lastIndexOf('if (', at) : -1;
  const open = at >= 0 ? handler.indexOf('{', at) : -1;
  const cond = ifAt >= 0 && open > at ? handler.slice(ifAt, open) : '';
  const body = open > 0 ? handler.slice(open, open + 200) : '';
  assert(
    'S2',
    "the check sits in an if that names the copy shape (start === 'copy') and answers 404",
    /start\s*===\s*'copy'/.test(cond) &&
      /^\{\s*return NextResponse\.json\([^;]*status:\s*404/.test(body),
    cond ? `if: ${(cond + body).replace(/\s+/g, ' ').slice(0, 160)}` : 'no guarding if found'
  );

  const nowPart = noBodyPart(src);
  const headPart = noBodyPart(atHead(ROUTE));
  assert(
    'S2',
    'the old no-body shape is byte for byte as HEAD holds it',
    nowPart.length > 0 && nowPart === headPart
  );
  const gatesSame =
    spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...GATES], { cwd: ROOT }).status === 0;
  assert(
    'S2',
    'the NODE_ENV gates on /demo and /demo/new are byte for byte as HEAD holds them',
    gatesSame && GATES.every((g) => read(g).includes('process.env.NODE_ENV'))
  );
}

// ── S3 and S4 — over HTTP, a closed server and an open one ───────────────────
async function layerS3S4() {
  section('S3 — a server WITHOUT the switch (unset, as production is)');
  let closed: Server | null = null;
  try {
    closed = await startServer(CLOSED_PORT, undefined);
    const beforeCount = await copyCount();
    const r = await postStart(closed, `203.0.113.${(parseInt(RUN.slice(0, 2), 16) % 200) + 1}`);
    const afterCount = await copyCount();
    assert('S3', 'POST start copy answers 404', r.status === 404, `answered ${r.status}`);
    assert(
      'S3',
      'no copy is written (copy accounts before = after)',
      afterCount === beforeCount,
      `before ${beforeCount}, after ${afterCount}`
    );
    assert('S3', 'no session cookie is set', !r.setsSession);
    assert(
      'S3',
      'the answer names no event',
      !(r.body && typeof r.body.eventId === 'string'),
      r.body ? `answered with eventId` : undefined
    );
  } catch (err) {
    assert('S3', 'the closed server ran', false, String((err as Error).message));
  } finally {
    await closed?.stop();
    const removed = await removeCopies();
    if (removed) console.log(`    (removed ${removed} copy account(s) the S3 server made)`);
  }

  section('S4 — CONTROL: a server WITH the switch on');
  let open: Server | null = null;
  try {
    open = await startServer(OPEN_PORT, 'on');
    const beforeCount = await copyCount();
    const r = await postStart(open, '198.51.100.7');
    const afterCount = await copyCount();
    assert(
      'S4',
      'CONTROL: POST start copy answers 200 with the copy and its setup page',
      r.status === 200 &&
        typeof r.body?.eventId === 'string' &&
        r.body?.href === `/plan/${r.body?.eventId}/setup`,
      `answered ${r.status}`
    );
    assert(
      'S4',
      'CONTROL: exactly one copy is written, and a session cookie is set',
      afterCount === beforeCount + 1 && r.setsSession,
      `before ${beforeCount}, after ${afterCount}, cookie ${r.setsSession}`
    );
  } catch (err) {
    assert('S4', 'CONTROL: the open server ran', false, String((err as Error).message));
  } finally {
    await open?.stop();
    const removed = await removeCopies();
    if (removed) console.log(`    (removed ${removed} copy account(s) the S4 server made)`);
  }
}

async function main() {
  section('P — preconditions');
  assert('P', 'DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  if (!DB_OK) {
    console.log('\nRefusing to go on: S3 and S4 write copies, and only gather_demo may take them.');
    process.exit(1);
  }
  prisma = (await import('../src/lib/prisma')).prisma;
  const atStart = await copyCount();
  assert('P', 'no copy is in the database before the run', atStart === 0, `found ${atStart}`);
  if (atStart !== 0) {
    console.log('\nRefusing to go on: a copy this run did not make would be removed by teardown.');
    await prisma.$disconnect();
    process.exit(1);
  }
  assert(
    'P',
    'CONTROL: the live gate is shut in this process',
    process.env.GATHER_LIVE_SENDS !== 'on'
  );
  assert(
    'P',
    'CONTROL: the comment stripper strips, and the reader reads',
    !stripComments('/* isDemoStartOn() */ const a = 1; // isDemoStartOn()\n').includes(
      'isDemoStartOn'
    ) &&
      read('src/lib/prisma.ts').length > 0 &&
      read('src/lib/no-such-file.ts') === ''
  );

  try {
    await layerS1();
    layerS2();
    await layerS3S4();
  } finally {
    section('G — teardown');
    await removeCopies();
    const left = await copyCount();
    assert('G', 'no copy is left in the database', left === 0, `found ${left}`);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(`Red:\n  ${reds.join('\n  ')}`);
  process.exit(failed ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  try {
    await removeCopies();
    await prisma?.$disconnect();
  } catch {
    // nothing more to do
  }
  process.exit(1);
});
