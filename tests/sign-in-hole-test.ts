/**
 * [[GTC-369]] — the sign-in hole. Founder rulings of 2026-10-08 (Q1–Q15, W1–W3), recorded in the
 * ticket verbatim.
 *
 * The ruling's four points, each a layer below:
 *   1. Gather works out the person itself and never takes it from the link.   (P, M)
 *   2. It never moves a person who's already linked to someone else.          (P, M)
 *   3. It only sends you on to Gather's own pages.                            (R, U)
 *   4. A claim email needs the host's own link.                               (C)
 * And what must keep working (E): ordinary sign-in, a new address, GTC-309's claim end to end, the
 * welcome link (GTC-282), a session made before. GTC-362's Back stays with test:walkthrough-batch5
 * (V1, C14).
 *
 * HOW IT REACHES THE ROUTES (ruling Q8):
 *   - `POST /api/auth/verify` over HTTP to the dev server. It cannot run in process (`cookies()`
 *     needs a request scope) and it sends nothing. Start the server with the standing line:
 *     `ANTHROPIC_API_KEY= RESEND_API_KEY= TWILIO_ACCOUNT_SID= TWILIO_AUTH_TOKEN=
 *      TWILIO_PHONE_NUMBER= TNZ_AUTH_TOKEN= npm run dev`.
 *   - `POST /api/auth/claim` ONLY in process, with the live switch never opened in this process and
 *     the provider trap's walls up. The route's send stops at `getResendClient`; the suite asserts
 *     nothing reached the trap. It is never called over HTTP.
 *
 * Every sign-in link the suite needs is a MagicLink row written straight into the database for an
 * example.com address — never emailed. No token, key or connection string is ever printed: failure
 * details below name outcomes, never values. Every row the run makes carries the run's tag in an
 * email or is recorded by id; all are counted while they exist and removed by id in `finally`.
 *
 * Run: npm run test:sign-in-hole   (needs the dev server on :3000)
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { installProviderTrap, trapCount } from './helpers/provider-trap';
import { isLiveSendingOn } from '../src/lib/live-sends';

const ROOT = join(__dirname, '..');
const BASE = 'http://localhost:3000';
const prisma = new PrismaClient();
const realFetch = globalThis.fetch;

let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail = '') {
  if (condition) {
    console.log(`  \x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.log(`  \x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    reds.push(label.split(' ')[0]);
  }
}

/** A thrown error, named without its message: a Prisma message can echo a token back. */
function errName(e: unknown): string {
  const x = e as { code?: string; constructor?: { name?: string } };
  return x?.code ?? x?.constructor?.name ?? 'error';
}

function read(rel: string): string {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const TAG = `gtc369-${Date.now()}-${randomBytes(3).toString('hex')}`;
const mail = (who: string) => `${TAG}-${who}@example.com`;
const tok = () => randomBytes(32).toString('hex');

const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  accessTokens: [] as string[],
  magicLinks: [] as string[],
  sessions: [] as string[],
  eventRoles: [] as string[],
};

async function user(who: string) {
  const u = await prisma.user.create({ data: { email: mail(who) } });
  created.users.push(u.id);
  return u;
}
async function person(name: string, userId: string | null = null) {
  const p = await prisma.person.create({ data: { name: `${TAG} ${name}`, userId } });
  created.people.push(p.id);
  return p;
}
async function event(name: string, hostId: string, coHostId: string | null = null) {
  const start = new Date(Date.now() + 30 * 24 * 3600e3);
  const e = await prisma.event.create({
    data: { name: `${TAG} ${name}`, startDate: start, endDate: start, hostId, coHostId },
  });
  created.events.push(e.id);
  return e;
}
async function accessToken(
  eventId: string,
  personId: string,
  scope: 'HOST' | 'PARTICIPANT',
  expiresAt: Date | null = null
) {
  const t = await prisma.accessToken.create({
    data: { token: tok(), eventId, personId, scope, expiresAt },
  });
  created.accessTokens.push(t.id);
  return t;
}
/** A sign-in link written straight into the database. `personId` only once the column exists. */
async function magicLink(email: string, opts: { expiresAt?: Date; personId?: string } = {}) {
  const data: Record<string, unknown> = {
    email,
    token: tok(),
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 15 * 60e3),
  };
  if (opts.personId) data.personId = opts.personId;
  const ml = await prisma.magicLink.create({ data: data as any });
  created.magicLinks.push(ml.id);
  return ml;
}

async function verify(body: Record<string, unknown>) {
  const res = await realFetch(`${BASE}/api/auth/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie') ?? '';
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
    redirectUrl?: string;
  };
  return { status: res.status, json, sessionCookie: /(^|,\s*)session=[^;]+/.test(setCookie) };
}

let claimPOST: ((req: Request) => Promise<Response>) | null = null;
async function claim(body: Record<string, unknown>) {
  const res = await claimPOST!(
    new Request('http://localhost/api/auth/claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  );
  return { status: res.status, text: await res.text() };
}

const linksFor = (email: string) => prisma.magicLink.findMany({ where: { email } });
async function roleOf(userId: string, eventId: string) {
  return prisma.eventRole.findUnique({ where: { userId_eventId: { userId, eventId } } });
}
async function sessionsOf(userId: string) {
  return prisma.session.count({ where: { userId } });
}

async function columnExists(): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.columns
    WHERE table_name = 'MagicLink' AND column_name = 'personId'`;
  return rows[0]?.n === 1;
}

async function main() {
  // ── PRECONDITIONS — a stop, not an assertion ───────────────────────────────────
  if (isLiveSendingOn()) {
    console.error('PRECONDITION: the live switch reads ON in this process. Stopping.');
    process.exit(2);
  }
  try {
    const ping = await realFetch(`${BASE}/auth/signin`, { method: 'GET' });
    if (ping.status !== 200) throw new Error(String(ping.status));
  } catch {
    console.error('PRECONDITION: no dev server answering on :3000. Stopping.');
    process.exit(2);
  }
  const strays = await prisma.user.count({ where: { email: { contains: TAG } } });
  if (strays !== 0) {
    console.error('PRECONDITION: rows already carry this run tag. Stopping.');
    process.exit(2);
  }
  installProviderTrap(); // walls up; the live switch is never opened in this process
  ({ POST: claimPOST } = await import('../src/app/api/auth/claim/route'));

  let whileExists = -1;
  try {
    const hasColumn = await columnExists();

    // ── FIXTURE ─────────────────────────────────────────────────────────────────
    const A = await user('attacker');
    const V = await person('V unclaimed host');
    const EV1 = await event('EV1', V.id);

    const U = await user('owner-u');
    const W = await person('W linked to U', U.id);
    const EW = await event('EW', W.id);
    const roleUW = await prisma.eventRole.create({
      data: { userId: U.id, eventId: EW.id, role: 'HOST' },
    });
    created.eventRoles.push(roleUW.id);
    const TW = await accessToken(EW.id, W.id, 'HOST');

    const X = await person('X unclaimed host');
    const D = await person('D other host');
    const EX1 = await event('EX1', X.id);
    const EX2 = await event('EX2', D.id, X.id);
    const EX3 = await event('EX3', X.id);
    const TX = await accessToken(EX1.id, X.id, 'HOST');
    const TXexpired = await accessToken(EX3.id, X.id, 'HOST', new Date(Date.now() - 3600e3));
    const G = await person('G guest');
    const TG = await accessToken(EX1.id, G.id, 'PARTICIPANT');

    const Z = await person('Z unclaimed host');
    const EZ = await event('EZ', Z.id);
    const TZ = await accessToken(EZ.id, Z.id, 'HOST');

    const C1 = await user('claimant-c1');
    const U2 = await user('owner-u2');
    const Y = await person('Y linked to U2', U2.id);
    const EY = await event('EY', Y.id);
    const B = await user('claimant-b');

    const Q = await person('Q unclaimed host');
    const EQ = await event('EQ', Q.id);
    const TQ = await accessToken(EQ.id, Q.id, 'HOST');

    const R = await user('redirects');
    const E1u = await user('ordinary');

    const S = await user('signed-in');
    const Sp = await person('S person', S.id);
    const ES = await event('ES', Sp.id);
    const roleS = await prisma.eventRole.create({
      data: { userId: S.id, eventId: ES.id, role: 'HOST' },
    });
    created.eventRoles.push(roleS.id);
    const sToken = tok();
    const sess = await prisma.session.create({
      data: { userId: S.id, token: sToken, expiresAt: new Date(Date.now() + 3600e3) },
    });
    created.sessions.push(sess.id);

    // ── STATIC ──────────────────────────────────────────────────────────────────
    console.log('\nP / E — what the code says');
    const verifyRoute = code('src/app/api/auth/verify/route.ts');
    const bodyRead = verifyRoute.match(/const\s*\{([^}]*)\}\s*=\s*await\s+req\.json\(\)/);
    assert(
      'P',
      'P6 static: verify reads no personId from the request body',
      bodyRead !== null && !/personId/.test(bodyRead[1]) && !/body\.personId/.test(verifyRoute)
    );
    assert(
      'P',
      'P7 static: the sign-in page posts no personId',
      read('src/app/auth/verify/page.tsx').length > 0 &&
        !/personId/.test(code('src/app/auth/verify/page.tsx'))
    );
    assert(
      'P',
      'P8 static: the claim link carries no personId=',
      !/personId=/.test(code('src/app/api/auth/claim/route.ts'))
    );
    assert(
      'E',
      'E8 static: verify uses the link up by a conditional update (usedAt: null) and checks its count',
      /magicLink\.updateMany\(\s*\{[\s\S]{0,300}?usedAt:\s*null[\s\S]{0,400}?\.count\s*!==\s*1/.test(
        verifyRoute
      )
    );

    // ── U — safeReturnPath, pure ────────────────────────────────────────────────
    console.log('\nU — safeReturnPath');
    let safe: ((raw: unknown) => string) | null = null;
    try {
      safe = (await import('../src/lib/safe-return-path')).safeReturnPath;
    } catch {
      safe = null;
    }
    const OUTSIDE: unknown[] = [
      'https://evil.example/x',
      'http://localhost:3000/plan/events',
      '//evil.example/x',
      '/\\evil.example/x',
      '\\\\evil.example',
      'javascript:alert(1)',
      'JAVASCRIPT:alert(1)',
      ' javascript:alert(1)',
      'data:text/html,<p>x</p>',
      '/\t/evil.example/x',
      '/\n/evil.example/x',
      '/plan/events\u0000',
      '/ plan/events',
      '/auth/verify?token=x',
      '/api/events',
      '/plan/../api/events',
      '/%2F%2Fevil.example',
      '/',
      `/plan/${'a'.repeat(2100)}`,
      '',
      null,
      undefined,
      42,
      { href: '/plan/events' },
    ];
    const outsideKept = safe
      ? OUTSIDE.filter((v) => {
          try {
            return safe!(v) !== '/plan/events';
          } catch {
            return true;
          }
        }).length
      : -1;
    assert(
      'U',
      `U1 every outside, script or unlisted address falls back to /plan/events (${OUTSIDE.length} inputs)`,
      safe !== null && outsideKept === 0,
      safe ? `${outsideKept} did not fall back` : 'the module does not exist'
    );
    const PAGES = [
      '/plan/events',
      '/plan/evt123',
      '/plan/evt123/pre-flight',
      '/plan/evt123/setup?at=people',
      '/h/abc123?claimed=true',
      '/plan/evt123#top',
    ];
    const pagesChanged = safe
      ? PAGES.filter((p) => {
          try {
            return safe!(p) !== p;
          } catch {
            return true;
          }
        }).length
      : -1;
    assert(
      'U',
      `U2 every Gather page passes unchanged (${PAGES.length} inputs)`,
      safe !== null && pagesChanged === 0,
      safe ? `${pagesChanged} changed` : 'the module does not exist'
    );

    // ── C — the claim route, in process, switch off, walls up ──────────────────
    console.log('\nC — the claim route (in process)');
    const trapBefore = trapCount();
    const answers: Array<{ status: number; text: string }> = [];
    const c1 = await claim({ email: mail('c1'), personId: X.id, returnToken: `nope-${TAG}` });
    answers.push(c1);
    assert(
      'C',
      'C1 a made-up host link mints no sign-in link',
      (await linksFor(mail('c1'))).length === 0
    );
    const c2 = await claim({ email: mail('c2'), personId: X.id, returnToken: TG.token });
    answers.push(c2);
    assert(
      'C',
      "C2 a guest's PARTICIPANT link mints none",
      (await linksFor(mail('c2'))).length === 0
    );
    const c3 = await claim({ email: mail('c3'), personId: X.id, returnToken: TZ.token });
    answers.push(c3);
    assert(
      'C',
      "C3 another host's link with this person's id mints none",
      (await linksFor(mail('c3'))).length === 0
    );
    const c4 = await claim({ email: mail('c4'), personId: X.id, returnToken: TXexpired.token });
    answers.push(c4);
    assert('C', 'C4 an expired HOST link mints none', (await linksFor(mail('c4'))).length === 0);
    const c5 = await claim({ email: mail('c5'), personId: X.id, returnToken: TX.token });
    answers.push(c5);
    const c5links = await linksFor(mail('c5'));
    c5links.forEach((l) => created.magicLinks.push(l.id));
    assert('C', 'C5 CONTROL her own host link mints exactly one', c5links.length === 1);
    assert(
      'C',
      'C6 that link carries her person',
      hasColumn && c5links.length === 1 && (c5links[0] as any).personId === X.id,
      hasColumn ? '' : 'MagicLink has no personId column'
    );
    answers.push(
      await claim({ email: mail('c7a'), personId: W.id, returnToken: TW.token }),
      await claim({ email: mail('c7b'), personId: `no-such-${TAG}`, returnToken: TX.token })
    );
    for (const e of ['c1', 'c2', 'c3', 'c4', 'c7a', 'c7b'])
      (await linksFor(mail(e))).forEach((l) => created.magicLinks.push(l.id));
    assert(
      'C',
      `C7 CONTROL every case answers 200 {"ok":true}, byte-identical (${answers.length} calls)`,
      answers.every((a) => a.status === 200 && a.text === '{"ok":true}')
    );
    assert('C', 'C8 CONTROL nothing reached the trap', trapCount() === trapBefore);
    const c9 = await claim({ email: mail('c9'), personId: X.id });
    assert('C', 'C9 CONTROL missing fields still answer 400', c9.status === 400);

    // ── P — verify ignores a person named in the body ──────────────────────────
    console.log('\nP — a person named in the request (HTTP)');
    const la1 = await magicLink(A.email);
    const p1 = await verify({ token: la1.token, personId: V.id });
    const V1 = await prisma.person.findUniqueOrThrow({ where: { id: V.id } });
    assert(
      'P',
      'P1 an unclaimed host named in the body stays unlinked',
      V1.userId === null,
      V1.userId === A.id ? "linked to the link's owner" : 'linked'
    );
    assert(
      'P',
      "P2 the link's owner gets no role on that host's event",
      (await roleOf(A.id, EV1.id)) === null
    );
    assert(
      'P',
      "P3 CONTROL the link's own sign-in still succeeds, one Session",
      p1.json.success === true &&
        p1.json.redirectUrl === '/plan/events' &&
        p1.sessionCookie &&
        (await sessionsOf(A.id)) === 1
    );
    const la2 = await magicLink(A.email);
    await verify({ token: la2.token, personId: W.id });
    const W1 = await prisma.person.findUniqueOrThrow({ where: { id: W.id } });
    assert(
      'P',
      'P4 a host linked to U, named in the body, stays U’s',
      W1.userId === U.id,
      W1.userId === A.id ? "moved to the link's owner" : 'changed'
    );
    assert(
      'P',
      "P5 the link's owner gets no role on her event; U's HOST role untouched",
      (await roleOf(A.id, EW.id)) === null && (await roleOf(U.id, EW.id))?.role === 'HOST'
    );

    // ── M — the person Gather works out ────────────────────────────────────────
    console.log('\nM — the person on the link (needs MagicLink.personId)');
    assert('M', 'M0 MagicLink has a personId column', hasColumn);
    const m = {
      m1: false,
      m2: false,
      m3: false,
      m4a: false,
      m4b: false,
      m4c: false,
      m5: false,
    };
    let mWhy = hasColumn ? '' : 'MagicLink has no personId column';
    if (hasColumn) {
      try {
        const lc1 = await magicLink(C1.email, { personId: X.id });
        const back = `/h/${TX.token}?claimed=true`;
        const r1 = await verify({ token: lc1.token, returnUrl: back });
        const X1 = await prisma.person.findUniqueOrThrow({ where: { id: X.id } });
        m.m1 = r1.json.success === true && X1.userId === C1.id;
        m.m2 =
          (await roleOf(C1.id, EX1.id))?.role === 'HOST' &&
          (await roleOf(C1.id, EX2.id))?.role === 'COHOST';
        m.m3 = r1.json.redirectUrl === back;

        const lb = await magicLink(B.email, { personId: Y.id });
        const rb = await verify({ token: lb.token });
        const Y1 = await prisma.person.findUniqueOrThrow({ where: { id: Y.id } });
        const lbAfter = await prisma.magicLink.findUniqueOrThrow({ where: { id: lb.id } });
        m.m4a = Y1.userId === U2.id;
        m.m4b = rb.json.success === false && rb.json.error === 'claimed' && !rb.sessionCookie;
        m.m4c =
          (await sessionsOf(B.id)) === 0 &&
          (await roleOf(B.id, EY.id)) === null &&
          lbAfter.usedAt !== null;

        const lc2 = await magicLink(C1.email, { personId: X.id });
        const r5 = await verify({ token: lc2.token });
        const X2 = await prisma.person.findUniqueOrThrow({ where: { id: X.id } });
        m.m5 =
          r5.json.success === true &&
          X2.userId === C1.id &&
          (await prisma.eventRole.count({ where: { userId: C1.id, eventId: EX1.id } })) === 1;
      } catch (e) {
        mWhy = `threw ${errName(e)}`;
      }
    }
    assert('M', 'M1 a claim link verified by its token alone links its person', m.m1, mWhy);
    assert('M', "M2 ...and grants HOST and COHOST on that person's events", m.m2, mWhy);
    assert('M', 'M3 ...and lands on /h/<token>?claimed=true', m.m3, mWhy);
    assert('M', 'M4a a claim on a person linked to someone else leaves her theirs', m.m4a, mWhy);
    assert('M', "M4b ...answers success false, error 'claimed', no session cookie", m.m4b, mWhy);
    assert('M', 'M4c ...no Session and no role for the claimant; the link is spent', m.m4c, mWhy);
    assert(
      'M',
      'M5 the same user claiming again: success, still hers, no duplicate role',
      m.m5,
      mWhy
    );

    // ── R — where she is sent after signing in ─────────────────────────────────
    console.log('\nR — returnUrl (HTTP)');
    const lands = async (returnUrl: string | undefined) => {
      const l = await magicLink(R.email);
      const r = await verify(
        returnUrl === undefined ? { token: l.token } : { token: l.token, returnUrl }
      );
      return r.json.success === true ? (r.json.redirectUrl ?? '(none)') : '(refused)';
    };
    const fallsBack = async (inputs: string[]) => {
      let kept = 0;
      for (const i of inputs) if ((await lands(i)) !== '/plan/events') kept++;
      return kept;
    };
    const rCases: Array<[string, string[]]> = [
      [
        'R1 an outside site (https://evil.example) lands on /plan/events',
        ['https://evil.example/x'],
      ],
      ['R2 a protocol-relative //evil.example lands on /plan/events', ['//evil.example/x']],
      ['R3 /\\evil.example lands on /plan/events', ['/\\evil.example/x']],
      [
        'R4 javascript: (and JAVASCRIPT:, and with a leading space) lands on /plan/events',
        ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)'],
      ],
      ['R5 /<tab>/evil.example lands on /plan/events', ['/\t/evil.example/x']],
      ['R6 a data: address lands on /plan/events', ['data:text/html,<p>x</p>']],
      [
        'R7 an unlisted Gather path (/auth/verify?token=x) lands on /plan/events',
        ['/auth/verify?token=x'],
      ],
    ];
    for (const [label, inputs] of rCases) {
      const kept = await fallsBack(inputs);
      assert('R', label, kept === 0, `${kept} of ${inputs.length} sent elsewhere`);
    }
    const passes = async (input: string | undefined, expect: string) =>
      (await lands(input)) === expect;
    assert('R', 'R8 CONTROL /plan/events passes', await passes('/plan/events', '/plan/events'));
    assert(
      'R',
      'R9 CONTROL /plan/<eventId> (the welcome link) passes',
      await passes(`/plan/${EV1.id}`, `/plan/${EV1.id}`)
    );
    assert(
      'R',
      'R10 CONTROL /h/<token>?claimed=true (the claim) passes, query kept',
      await passes(`/h/${TZ.token}?claimed=true`, `/h/${TZ.token}?claimed=true`)
    );
    assert(
      'R',
      'R11 CONTROL no returnUrl lands on /plan/events',
      await passes(undefined, '/plan/events')
    );

    // ── E — what must keep working ─────────────────────────────────────────────
    console.log('\nE — what must keep working (HTTP)');
    const le1 = await magicLink(E1u.email);
    const e1 = await verify({ token: le1.token });
    assert(
      'E',
      'E1 CONTROL ordinary sign-in: success, /plan/events, a session cookie and one Session',
      e1.json.success === true &&
        e1.json.redirectUrl === '/plan/events' &&
        e1.sessionCookie &&
        (await sessionsOf(E1u.id)) === 1
    );
    const le2 = await magicLink(mail('new-address'));
    const e2 = await verify({ token: le2.token });
    const newUser = await prisma.user.findUnique({ where: { email: mail('new-address') } });
    if (newUser) created.users.push(newUser.id);
    assert(
      'E',
      'E2 CONTROL a new address: success and a User made for it',
      e2.json.success === true && newUser !== null
    );
    const le3 = await magicLink(E1u.email, { expiresAt: new Date(Date.now() + 30 * 24 * 3600e3) });
    const e3 = await verify({ token: le3.token, returnUrl: `/plan/${EV1.id}` });
    assert(
      'E',
      'E3 CONTROL the welcome link (30 days, /plan/<eventId>) lands on its event',
      e3.json.success === true && e3.json.redirectUrl === `/plan/${EV1.id}`
    );

    // GTC-309 end to end: the claim route mints (in process), verify takes the token alone.
    const e4c = await claim({ email: mail('e4'), personId: Q.id, returnToken: TQ.token });
    const e4links = await linksFor(mail('e4'));
    e4links.forEach((l) => created.magicLinks.push(l.id));
    let e4ok = false;
    if (e4c.status === 200 && e4links.length === 1) {
      const back = `/h/${TQ.token}?claimed=true`;
      const e4 = await verify({ token: e4links[0].token, returnUrl: back });
      const e4user = await prisma.user.findUnique({ where: { email: mail('e4') } });
      if (e4user) created.users.push(e4user.id);
      const Q1 = await prisma.person.findUniqueOrThrow({ where: { id: Q.id } });
      e4ok =
        e4.json.success === true &&
        e4.json.redirectUrl === back &&
        e4user !== null &&
        Q1.userId === e4user.id &&
        (await roleOf(e4user.id, EQ.id))?.role === 'HOST';
    }
    assert(
      'E',
      "E4 GTC-309 end to end: her host link's claim, then verify by token alone, links her and lands on /h",
      e4ok,
      e4links.length === 1 ? 'the link signed in without linking her' : 'no link was minted'
    );
    const e5a = await verify({ token: le1.token });
    assert(
      'E',
      "E5a CONTROL a used link is refused 'used'",
      e5a.json.error === 'used' && !e5a.sessionCookie
    );
    const le5b = await magicLink(E1u.email, { expiresAt: new Date(Date.now() - 60e3) });
    const e5b = await verify({ token: le5b.token });
    assert(
      'E',
      "E5b CONTROL an expired link is refused 'expired'",
      e5b.json.error === 'expired' && !e5b.sessionCookie
    );
    const e5c = await verify({ token: tok() });
    assert(
      'E',
      "E5c CONTROL an unknown link is refused 'invalid'",
      e5c.json.error === 'invalid' && !e5c.sessionCookie
    );
    const e6 = await realFetch(`${BASE}/api/events`, { headers: { Cookie: `session=${sToken}` } });
    const e6json = (await e6.json().catch(() => ({}))) as { events?: Array<{ id: string }> };
    assert(
      'E',
      'E6 CONTROL a Session made before the run still opens GET /api/events, with her event',
      e6.status === 200 && (e6json.events ?? []).some((ev) => ev.id === ES.id)
    );

    // ── Z — accounting ─────────────────────────────────────────────────────────
    whileExists = await countRows();
    console.log(`\n  fixture rows while they exist: ${whileExists}`);
    assert('Z', 'Z1 CONTROL the run’s rows were counted while they existed', whileExists > 0);
  } catch (e) {
    console.log(`\n  \x1b[31mthe run stopped early: ${errName(e)}\x1b[0m`);
    failed++;
  } finally {
    await cleanup();
    const after = await countRows();
    const tagged = await prisma.user.count({ where: { email: { contains: TAG } } });
    assert(
      'Z',
      'Z2 CONTROL every row the run made is removed by id',
      after === 0 && tagged === 0,
      `${after} by id, ${tagged} tagged users left`
    );
    assert('Z', 'Z3 CONTROL nothing reached the trap in the whole run', trapCount() === 0);
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (reds.length) console.log(`red: ${reds.join(' ')}`);
    process.exit(failed === 0 ? 0 : 1);
  }
}

/** Sweep in rows the routes made for the run's users and events, then count everything by id. */
async function gather() {
  const tagged = await prisma.user.findMany({
    where: { email: { contains: TAG } },
    select: { id: true },
  });
  for (const u of tagged) if (!created.users.includes(u.id)) created.users.push(u.id);
  const sessions = await prisma.session.findMany({
    where: { userId: { in: created.users } },
    select: { id: true },
  });
  for (const s of sessions) if (!created.sessions.includes(s.id)) created.sessions.push(s.id);
  const roles = await prisma.eventRole.findMany({
    where: { OR: [{ userId: { in: created.users } }, { eventId: { in: created.events } }] },
    select: { id: true },
  });
  for (const r of roles) if (!created.eventRoles.includes(r.id)) created.eventRoles.push(r.id);
  const links = await prisma.magicLink.findMany({
    where: { email: { contains: TAG } },
    select: { id: true },
  });
  for (const l of links) if (!created.magicLinks.includes(l.id)) created.magicLinks.push(l.id);
}

async function countRows(): Promise<number> {
  await gather();
  const n = await Promise.all([
    prisma.session.count({ where: { id: { in: created.sessions } } }),
    prisma.eventRole.count({ where: { id: { in: created.eventRoles } } }),
    prisma.magicLink.count({ where: { id: { in: created.magicLinks } } }),
    prisma.accessToken.count({ where: { id: { in: created.accessTokens } } }),
    prisma.event.count({ where: { id: { in: created.events } } }),
    prisma.person.count({ where: { id: { in: created.people } } }),
    prisma.user.count({ where: { id: { in: created.users } } }),
  ]);
  return n.reduce((a, b) => a + b, 0);
}

async function cleanup() {
  try {
    await gather();
  } catch {
    /* counted below */
  }
  const steps: Array<() => Promise<unknown>> = [
    () => prisma.session.deleteMany({ where: { id: { in: created.sessions } } }),
    () => prisma.eventRole.deleteMany({ where: { id: { in: created.eventRoles } } }),
    () => prisma.magicLink.deleteMany({ where: { id: { in: created.magicLinks } } }),
    () => prisma.accessToken.deleteMany({ where: { id: { in: created.accessTokens } } }),
    () => prisma.event.deleteMany({ where: { id: { in: created.events } } }),
    () => prisma.person.deleteMany({ where: { id: { in: created.people } } }),
    () => prisma.user.deleteMany({ where: { id: { in: created.users } } }),
  ];
  for (const step of steps) {
    try {
      await step();
    } catch (e) {
      console.log(`  cleanup step failed: ${errName(e)}`);
    }
  }
}

main();
