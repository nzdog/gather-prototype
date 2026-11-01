/**
 * [[GTC-443]] — THE START LIMIT: SURVIVES A DEPLOY, READS THE RULED HEADER, UNDER ONE LOCK.
 * Founder rulings, 1 Nov 2026 (Q12 (a), Q13 as amended) and 2 Nov 2026 (O1 to O6).
 *
 *   H  the header: X-Real-IP first (blank counts as absent), else the X-Forwarded-For entry
 *      that pickForwardedEntry picks, proved at BOTH ends; no header (or no key) skips the
 *      per-visitor limit only; one log line per start, counts only.
 *   T  the tag: a keyed hash of the visitor's address in the last 8 of the copy's 32 hex; the
 *      first 24 random; the address itself in no row and no log line.
 *   L  the limit: the fourth start in an hour answers 429 with W7 (over HTTP), counted from
 *      the database alone; another visitor, an hour-old copy, the global limits.
 *   A  atomic: starts at the same instant take exactly what is left; the lock, the check and
 *      the write in one transaction; the lock's key used nowhere else.
 *   W  the ruled numbers and words, unchanged.
 *
 * gather_demo only (refuses any other database). A made-up secret, set in this process only and
 * never printed; L1 runs against the dev server on :3000 with its own. Every probe row is
 * removed by id. Run: npm run test:demo-start-limit
 */
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

// SET BEFORE ANY IMPORT that could read it: this process's key is made up.
process.env.CRON_SECRET = `gtc443-made-up-${randomBytes(8).toString('hex')}`;
const SECRET = process.env.CRON_SECRET;

import { prisma } from '../src/lib/prisma';

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_START_LIMIT_BASE_URL ?? 'http://localhost:3000';
const COPY_DOMAIN = '@demo-copy.invalid';
const HOUR = 60 * 60 * 1000;
const RUN = randomBytes(3).toString('hex');

/** W7, W8a, W8b exactly as the plan holds them (GTC-392 part A, W-lines). */
const W7 = "You've started a few sample events in the last hour. Please try again a little later.";
const W8A = 'Lots of people are trying Gather right now. Please try again in a few minutes.';
const W8B = 'The sample is full for today. Please try again tomorrow.';

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
async function tryAsync<T>(f: () => Promise<T>): Promise<T | { threw: string }> {
  try {
    return await f();
  } catch (e) {
    return { threw: e instanceof Error ? e.message.slice(0, 160) : 'threw' };
  }
}
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
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
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs|js|cjs)$/.test(e.name)) out.push(path.relative(ROOT, full));
  }
  return out;
}
/** The text of a function from its name to the next top-level declaration. */
function fnOf(code: string, name: string): string {
  const at = code.search(new RegExp(`function ${name}\\b`));
  if (at < 0) return '';
  const rest = code.slice(at + 1);
  const next = rest.search(/\n(export |function |const |async function |type |interface )/);
  return code.slice(at, next < 0 ? undefined : at + 1 + next);
}

// ── CHECKS: pure over source, so each is dry-run on a passing and a failing input ──
export const CHECKS = {
  /** H2: the picker is one statement, `return entries[...]`. */
  pickerOneLine(startLimitSrc: string): boolean {
    const body = fnOf(stripComments(startLimitSrc), 'pickForwardedEntry');
    const inner = body.slice(body.indexOf('{') + 1, body.lastIndexOf('}')).trim();
    return /^return entries\[[^\]]+\];$/.test(inner);
  },
  /** H4 (and O3): one `console.log(startLogLine(` in the handler, after the switch and the
   *  cookie check, before the limits and the copy. */
  logOnceBeforeLimits(routeSrc: string): boolean {
    const code = stripComments(routeSrc);
    const handler = code.slice(code.indexOf('export async function POST'));
    const logs = handler.match(/console\.log\(startLogLine\(/g) ?? [];
    const at = handler.indexOf('console.log(startLogLine(');
    const sw = handler.indexOf('isDemoStartOn()');
    const cookie = handler.indexOf("cookies()).get('session')");
    const start = handler.indexOf('startDemoCopyWithinLimit(');
    return logs.length === 1 && sw >= 0 && cookie > sw && at > cookie && start > at;
  },
  /** H5: no console call in the route names the address, the tag's value or a header (only
   *  whether there is a tag). */
  routeLogsCountsOnly(routeSrc: string): boolean {
    const code = stripComments(routeSrc);
    const calls = code.match(/console\.(log|warn|error|info)\([^;]*\);/g) ?? [];
    return (
      calls.length > 0 &&
      calls.every(
        (c) =>
          !/visitor\.address|visitorTag(?!\s*!==\s*null)|request\.headers|x-real-ip|x-forwarded/.test(
            c
          )
      )
    );
  },
  /** L2: start-limit.ts keeps no state at module level. */
  noModuleMemory(startLimitSrc: string): boolean {
    const code = stripComments(startLimitSrc);
    const topLevel = code.split('\n').filter((l) => /^\S/.test(l));
    return (
      !/\bnoteStart\b/.test(code) &&
      topLevel.every(
        (l) =>
          !/^(export\s+)?let\s/.test(l) &&
          !/^(export\s+)?(const|var)\s+\w+(\s*:[^=]+)?\s*=\s*(new\s+(Map|Set|WeakMap|Array)\b|\[)/.test(
            l
          )
      )
    );
  },
  /** A3: in copy.ts, one $transaction holding the lock, then the check, then the first write;
   *  in the route, the limit is checked only inside that call. */
  oneTransaction(copySrc: string, routeSrc: string): boolean {
    const copy = stripComments(copySrc);
    const fn = fnOf(copy, 'startDemoCopyWithinLimit');
    const tx = fn.indexOf('$transaction(');
    const lock = fn.indexOf('pg_advisory_xact_lock(${DEMO_START_LOCK_KEY}');
    const check = fn.indexOf('await check(tx');
    const write = fn.indexOf('tx.user.create(');
    const keyed = /export const DEMO_START_LOCK_KEY = 392_002;/.test(copy);
    const route = stripComments(routeSrc);
    const handler = route.slice(route.indexOf('export async function POST'));
    const call = handler.indexOf('startDemoCopyWithinLimit(');
    const callEnd = call >= 0 ? handler.indexOf(');', call) : -1;
    const checks = handler.match(/checkStartLimit\(/g) ?? [];
    const inside = call >= 0 && handler.slice(call, callEnd).includes('checkStartLimit(tx');
    return (
      keyed &&
      (fn.match(/\$transaction\(/g) ?? []).length === 1 &&
      tx >= 0 &&
      lock > tx &&
      check > lock &&
      write > check &&
      checks.length === 1 &&
      inside
    );
  },
  /** A4: the key 392002 is named once in src and scripts, in copy.ts. */
  keyFree(files: Array<{ rel: string; text: string }>): boolean {
    const hits = files.flatMap((f) =>
      (stripComments(f.text).match(/\b392_?002\b/g) ?? []).map(() => f.rel)
    );
    return hits.length === 1 && hits[0] === 'src/lib/demo/copy.ts';
  },
};

// ── Fixture: every probe row by id ───────────────────────────────────────────
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  tokens: new Set<string>(),
};
async function own(eventId: string | undefined, token?: string) {
  if (!eventId) return null;
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    include: { host: { include: { user: true } } },
  });
  if (!ev || !ev.isDemo || !ev.host.user?.email.endsWith(COPY_DOMAIN)) return null;
  fx.events.add(ev.id);
  fx.persons.add(ev.hostId);
  fx.users.add(ev.host.user.id);
  if (token) fx.tokens.add(token);
  return ev;
}
async function teardown() {
  const events = [...fx.events];
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.tokens] } } });
  await prisma.session.deleteMany({ where: { userId: { in: [...fx.users] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
}
const copyAccounts = () => prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
const taggedCopies = (tag: string) =>
  prisma.event.count({
    where: { isDemo: true, host: { user: { email: { endsWith: `${tag}${COPY_DOMAIN}` } } } },
  });

/** Limits that leave the global ones out of the way unless a check sets them. */
const ROOMY = {
  limits: { perVisitorHour: 3, allHour: 1000, allDay: 1000 },
  aiLimits: { perCopy: 3, perDay: 1000 },
};

function refuseUnlessGatherDemo() {
  let u: URL | null = null;
  try {
    u = new URL(process.env.DATABASE_URL ?? '');
  } catch {
    u = null;
  }
  if (!u || u.pathname !== '/gather_demo' || !['localhost', '127.0.0.1'].includes(u.hostname)) {
    console.error('demo-start-limit: DATABASE_URL does not name gather_demo on this Mac; refused');
    process.exit(2);
  }
}

async function main() {
  refuseUnlessGatherDemo();
  const LIM = await load('../src/lib/demo/start-limit');
  const COPY = await load('../src/lib/demo/copy');
  const CA = await load('../src/lib/demo/copy-address');
  const has = (m: any, k: string) => !!m && typeof m[k] === 'function';

  /** A start in process, as the route makes one: the limit inside the copy's transaction. */
  const startAs = async (tag: string | null, opts: any = ROOMY) => {
    if (!has(COPY, 'startDemoCopyWithinLimit') || !has(LIM, 'checkStartLimit')) return null;
    const r: any = await tryAsync(() =>
      COPY.startDemoCopyWithinLimit(
        prisma,
        (tx: any, now: Date) => LIM.checkStartLimit(tx, tag, { now, ...opts }),
        { visitorTag: tag }
      )
    );
    if (r?.ok) await own(r.copy.eventId, r.copy.sessionToken);
    return r;
  };
  /** A copy with a tag and no limit (the suites' own starts). */
  const plainCopy = async (tag: string) => {
    if (!has(COPY, 'startDemoCopy')) return null;
    const c: any = await tryAsync(() =>
      COPY.startDemoCopy(prisma, { now: new Date(), visitorTag: tag })
    );
    return c?.eventId ? own(c.eventId, c.sessionToken) : null;
  };
  const freshTag = () => randomBytes(4).toString('hex');

  const startLimitSrc = read('src/lib/demo/start-limit.ts');
  const copySrc = read('src/lib/demo/copy.ts');
  const routeSrc = read('src/app/api/demo/session/route.ts');

  // ══ H — the header ═══════════════════════════════════════════════════════════
  section('H — the header');
  const visitorOf = (h: Record<string, string>, pick?: any) =>
    LIM.visitorOf(new Headers(h), ...(pick ? [pick] : []));
  assert(
    'H',
    'H1 X-Real-IP is read first; a blank one counts as absent; the address is trimmed and lower-cased',
    ok(
      () =>
        visitorOf({ 'x-real-ip': ' 2001:DB8::9 ', 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })
          .address === '2001:db8::9' &&
        visitorOf({ 'x-real-ip': '  ', 'x-forwarded-for': '203.0.113.7' }).address ===
          '203.0.113.7' &&
        visitorOf({ 'x-real-ip': '  ', 'x-forwarded-for': '203.0.113.7' }).realIpPresent === false
    )
  );
  const XFF = { 'x-forwarded-for': '203.0.113.1, 198.51.100.2, 192.0.2.3' };
  assert(
    'H',
    'H2 the picker at both ends: as shipped it takes the LAST entry (not final); a picker taking the first gives the first, through the same visitorOf; the picker is one return line',
    ok(
      () =>
        LIM.pickForwardedEntry(['203.0.113.1', '198.51.100.2', '192.0.2.3']) === '192.0.2.3' &&
        visitorOf(XFF).address === '192.0.2.3' &&
        visitorOf(XFF, (e: readonly string[]) => e[0]).address === '203.0.113.1' &&
        visitorOf(XFF).forwardedEntries === 3 &&
        CHECKS.pickerOneLine(startLimitSrc)
    )
  );

  const noHeader = ok(() => {
    const v = visitorOf({});
    return v.address === null && v.realIpPresent === false && v.forwardedEntries === 0;
  });
  const noKey = has(LIM, 'visitorTagOf') ? await LIM.visitorTagOf('203.0.113.5', '') : 'none';
  const skipPerVisitor: any = await startAs(null, {
    ...ROOMY,
    limits: { ...ROOMY.limits, perVisitorHour: 0 },
  });
  const accountsBeforeH3 = await copyAccounts();
  const hourStill: any = await startAs(null, { ...ROOMY, limits: { ...ROOMY.limits, allHour: 0 } });
  const accountsAfterH3 = await copyAccounts();
  assert(
    'H',
    'H3 no header (or no key, O1): the per-visitor limit is skipped (a limit of 0 still lets her in) and the global ones still apply (W8a, nothing written)',
    noHeader &&
      noKey === null &&
      skipPerVisitor?.ok === true &&
      hourStill?.ok === false &&
      hourStill?.words === W8A &&
      accountsAfterH3 === accountsBeforeH3,
    JSON.stringify({ noHeader, noKey, skipPerVisitor: skipPerVisitor?.ok, hourStill })
  );
  assert(
    'H',
    'H4 no header logs once: one line ending "no visitor header, per-visitor limit skipped"; the route logs it once, before the limits',
    ok(() => {
      const line: string = LIM.startLogLine(LIM.visitorOf(new Headers()), false);
      return (
        !line.includes('\n') &&
        line.endsWith('no visitor header, per-visitor limit skipped') &&
        line.startsWith('[demo-start] ')
      );
    }) && CHECKS.logOnceBeforeLimits(routeSrc)
  );
  assert(
    'H',
    'H5 the log line is counts only: whether X-Real-IP came and how many X-Forwarded-For entries; no value, here or in any console call of the route',
    ok(() => {
      const v = { address: '203.0.113.9', realIpPresent: true, forwardedEntries: 3 };
      const tagged: string = LIM.startLogLine(v, true);
      const keyless: string = LIM.startLogLine(
        { address: '203.0.113.9', realIpPresent: false, forwardedEntries: 1 },
        false
      );
      return (
        tagged === '[demo-start] x-real-ip present; x-forwarded-for entries 3' &&
        keyless ===
          '[demo-start] x-real-ip absent; x-forwarded-for entries 1; no key, per-visitor limit skipped' &&
        !tagged.includes('203.0.113') &&
        !keyless.includes('203.0.113')
      );
    }) && CHECKS.routeLogsCountsOnly(routeSrc)
  );

  // ══ T — the tag ══════════════════════════════════════════════════════════════
  section('T — the tag in the address');
  const tagOf = async (a: string, s: string) =>
    has(LIM, 'visitorTagOf') ? ((await tryAsync(() => LIM.visitorTagOf(a, s))) as any) : null;
  const t1a = await tagOf('203.0.113.77', SECRET);
  const t1b = await tagOf('203.0.113.77', SECRET);
  assert(
    'T',
    'T1 the same address under the same key gives the same tag, 8 lower-case hex',
    typeof t1a === 'string' && /^[0-9a-f]{8}$/.test(t1a) && t1a === t1b,
    // the tag is a hash, not the secret: safe to show
    JSON.stringify({ t1a, t1b })
  );
  const t2addr = await tagOf('203.0.113.78', SECRET);
  const t2key = await tagOf('203.0.113.77', `${SECRET}-another`);
  assert(
    'T',
    'T2 another address gives another tag; another key gives another tag (it is keyed)',
    typeof t1a === 'string' &&
      typeof t2addr === 'string' &&
      typeof t2key === 'string' &&
      t2addr !== t1a &&
      t2key !== t1a
  );
  const tag3 = freshTag();
  const c3: any = await startAs(tag3);
  const c3b: any = await startAs(tag3);
  const email3 = c3?.ok
    ? ((await prisma.user.findUnique({ where: { id: c3.copy.userId } }))?.email ?? '')
    : '';
  const email3b = c3b?.ok
    ? ((await prisma.user.findUnique({ where: { id: c3b.copy.userId } }))?.email ?? '')
    : '';
  assert(
    'T',
    'T3 a tagged copy’s address is 32 hex ending in the tag; crowdTagOf still reads its first 8',
    /^[0-9a-f]{32}@demo-copy\.invalid$/.test(email3) &&
      email3.slice(24, 32) === tag3 &&
      ok(() => CA.crowdTagOf(email3) === email3.slice(0, 8)),
    JSON.stringify({ c3: c3?.ok ?? c3, tail: email3.slice(24, 32) === tag3 })
  );
  assert(
    'T',
    'T4 two copies with one tag share their last 8 and differ in the first 24 (random)',
    /^[0-9a-f]{32}@/.test(email3b) &&
      email3b.slice(24, 32) === tag3 &&
      email3.slice(24, 32) === tag3 &&
      email3.slice(0, 24) !== email3b.slice(0, 24)
  );
  // T5: a start made from a real-looking address, the way the route makes one.
  const addr5 = `203.0.113.${(parseInt(RUN, 16) % 200) + 20}`;
  const tag5 = has(LIM, 'visitorTagOf')
    ? ((await tryAsync(() => LIM.visitorTagOf(addr5))) as any)
    : null;
  const c5: any = typeof tag5 === 'string' ? await startAs(tag5) : null;
  let rows5 = '';
  if (c5?.ok) {
    const ev = await prisma.event.findUnique({
      where: { id: c5.copy.eventId },
      include: { setup: true, host: { include: { user: true } } },
    });
    const roles = await prisma.eventRole.findMany({ where: { eventId: c5.copy.eventId } });
    const sessions = await prisma.session.findMany({ where: { userId: c5.copy.userId } });
    rows5 = JSON.stringify({ ev, roles, sessions });
  }
  let line5 = '';
  if (has(LIM, 'startLogLine')) {
    line5 = LIM.startLogLine(LIM.visitorOf(new Headers({ 'x-real-ip': addr5 })), true);
  }
  assert(
    'T',
    'T5 the visitor’s address is in no row the copy wrote (User, Person, Event, EventSetup, EventRole, Session) and not in the log line',
    rows5.length > 0 && !rows5.includes(addr5) && line5.length > 0 && !line5.includes(addr5),
    JSON.stringify({ started: c5?.ok ?? c5 })
  );

  // ══ L — the limit ════════════════════════════════════════════════════════════
  section('L — the limit, from the database');
  // L1 over HTTP: one X-Real-IP, a different made-up X-Forwarded-For each time.
  const real = `198.51.100.${(parseInt(RUN.slice(0, 2), 16) % 200) + 20}`;
  const accountsBeforeL1 = await copyAccounts();
  const l1: Array<{ status: number; error?: string; email?: string }> = [];
  let l1Ran = true;
  try {
    for (let i = 0; i < 4; i++) {
      const res = await fetch(`${BASE}/api/demo/session`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-real-ip': real,
          'x-forwarded-for': `192.0.2.${i + 1 + (parseInt(RUN.slice(2, 4), 16) % 50)}, 10.1.2.${i}`,
        },
        body: JSON.stringify({ start: 'copy' }),
      });
      const body: any = await res.json().catch(() => null);
      const cookie = /(?:^|;\s*|,\s*)session=([^;]+)/.exec(res.headers.get('set-cookie') ?? '');
      const ev = await own(body?.eventId, cookie?.[1]);
      l1.push({ status: res.status, error: body?.error, email: ev?.host.user?.email });
    }
  } catch (e) {
    l1Ran = false;
    console.log(`    (the server on ${BASE} did not answer: ${(e as Error).message})`);
  }
  const accountsAfterL1 = await copyAccounts();
  const tails = l1.slice(0, 3).map((r) => (r.email ?? '').slice(24, 32));
  assert(
    'L',
    'L1 over HTTP, one X-Real-IP and four made-up X-Forwarded-For: three start, the fourth answers 429 with W7 and writes nothing; the three addresses end in one tag',
    l1Ran &&
      l1.length === 4 &&
      l1.slice(0, 3).every((r) => r.status === 200 && !!r.email) &&
      l1[3].status === 429 &&
      l1[3].error === W7 &&
      accountsAfterL1 === accountsBeforeL1 + 3 &&
      /^[0-9a-f]{8}$/.test(tails[0] ?? '') &&
      tails.every((t) => t === tails[0]),
    JSON.stringify(l1.map((r) => r.status))
  );

  const tag2 = freshTag();
  const made2: any[] = [];
  for (let i = 0; i < 3; i++) made2.push(await plainCopy(tag2));
  const refused2: any = has(LIM, 'checkStartLimit')
    ? await tryAsync(() => LIM.checkStartLimit(prisma, tag2, ROOMY))
    : null;
  assert(
    'L',
    'L2 counted from the database alone: three copies with her tag written in process (no route) and the next start is refused with W7; start-limit.ts keeps no state at module level',
    made2.every(Boolean) &&
      refused2?.ok === false &&
      refused2?.words === W7 &&
      CHECKS.noModuleMemory(startLimitSrc),
    JSON.stringify({ made: made2.filter(Boolean).length, refused2 })
  );
  const other: any = await startAs(freshTag());
  assert(
    'L',
    'L3 another visitor at the same moment is not blocked: her copy starts',
    other?.ok === true,
    JSON.stringify(other?.ok ?? other)
  );
  if (made2[0]) {
    await prisma.event.update({
      where: { id: made2[0].id },
      data: { createdAt: new Date(Date.now() - HOUR - 60 * 1000) },
    });
  }
  const after4: any = has(LIM, 'checkStartLimit')
    ? await tryAsync(() => LIM.checkStartLimit(prisma, tag2, ROOMY))
    : null;
  assert(
    'L',
    'L4 a copy older than an hour does not count: W7 before one of the three is backdated 61 minutes, a start after',
    refused2?.ok === false && refused2?.words === W7 && after4?.ok === true,
    JSON.stringify({ before: refused2, after: after4 })
  );
  const accountsBeforeL5 = await copyAccounts();
  const busy: any = await startAs(freshTag(), {
    ...ROOMY,
    limits: { ...ROOMY.limits, allHour: 0 },
  });
  const full: any = await startAs(freshTag(), { ...ROOMY, limits: { ...ROOMY.limits, allDay: 0 } });
  const aiFull: any = await startAs(freshTag(), { ...ROOMY, aiLimits: { perCopy: 3, perDay: 0 } });
  const accountsAfterL5 = await copyAccounts();
  assert(
    'L',
    'L5 inside the transaction the global limits still answer W8a (the hour) and W8b (the day, and the day’s AI total); a refused start writes nothing',
    busy?.ok === false &&
      busy?.words === W8A &&
      full?.ok === false &&
      full?.words === W8B &&
      aiFull?.ok === false &&
      aiFull?.words === W8B &&
      accountsAfterL5 === accountsBeforeL5,
    JSON.stringify({ busy, full, aiFull })
  );

  // ══ A — atomic ═══════════════════════════════════════════════════════════════
  section('A — one lock');
  const tagA1 = freshTag();
  await plainCopy(tagA1);
  await plainCopy(tagA1);
  const pair: any[] = has(COPY, 'startDemoCopyWithinLimit')
    ? await Promise.all([startAs(tagA1), startAs(tagA1)])
    : [];
  const pairIn = pair.filter((r) => r?.ok === true).length;
  const pairOut = pair.filter((r) => r?.ok === false && r?.words === W7).length;
  assert(
    'A',
    'A1 two starts at the same instant with one left: exactly one gets in, the other is refused with W7; the visitor has three copies',
    pairIn === 1 && pairOut === 1 && (await taggedCopies(tagA1)) === 3,
    JSON.stringify({ pairIn, pairOut })
  );
  const tagA2 = freshTag();
  const five: any[] = has(COPY, 'startDemoCopyWithinLimit')
    ? await Promise.all([0, 1, 2, 3, 4].map(() => startAs(tagA2)))
    : [];
  const fiveIn = five.filter((r) => r?.ok === true).length;
  const fiveOut = five.filter((r) => r?.ok === false && r?.words === W7).length;
  assert(
    'A',
    'A2 five at once from a new visitor take exactly the three left; two are refused with W7',
    fiveIn === 3 && fiveOut === 2 && (await taggedCopies(tagA2)) === 3,
    JSON.stringify({ fiveIn, fiveOut })
  );
  assert(
    'A',
    'A3 the lock, then the check, then the first write, in one $transaction in copy.ts; the route checks the limit only inside that call',
    CHECKS.oneTransaction(copySrc, routeSrc)
  );
  const files = [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'scripts'))].map(
    (rel) => ({ rel, text: read(rel) })
  );
  assert(
    'A',
    'A4 the lock’s key, 392002, is named once in src and scripts, in copy.ts (ai-cap holds 392001)',
    CHECKS.keyFree(files)
  );

  // ══ W — unchanged ════════════════════════════════════════════════════════════
  section('W — the ruled numbers and words');
  const CAP = await load('../src/lib/demo/ai-cap');
  assert(
    'W',
    'W1 3 per visitor an hour, 30 an hour and 150 a day for all, 3 plans a copy and 100 a day; W7, W8a and W8b word for word',
    LIM?.DEMO_START_LIMITS?.perVisitorHour === 3 &&
      LIM?.DEMO_START_LIMITS?.allHour === 30 &&
      LIM?.DEMO_START_LIMITS?.allDay === 150 &&
      CAP?.DEMO_AI_LIMITS?.perCopy === 3 &&
      CAP?.DEMO_AI_LIMITS?.perDay === 100 &&
      LIM?.DEMO_START_WORDS?.OWN_LIMIT === W7 &&
      LIM?.DEMO_START_WORDS?.BUSY === W8A &&
      LIM?.DEMO_START_WORDS?.FULL === W8B
  );
}

async function run() {
  const before = await copyAccounts();
  try {
    await main();
  } catch (e) {
    assert('X', 'the suite ran to its end', false, (e as Error).message.slice(0, 200));
  } finally {
    await teardown();
    const after = await copyAccounts();
    console.log(`\n    (probe rows removed by id; copy accounts ${before} -> ${after})`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  ✗ ${r}`).join('\n'));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

if (require.main === module) run();
