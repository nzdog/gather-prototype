/**
 * [[GTC-392]] part A — THE SAFE COPY: a private sample event for every visitor, and the wall that
 * stops a sample event from ever sending.
 *
 * Founder plan rulings, 18 Oct 2026 (in Cowork): Q1 to Q16 and W1 to W15 as recommended; Q3 (a, b,
 * c) approved, (d) the security suite is NOT edited; Q5 the button on the founder's Mac only.
 *
 * THE LAYERS
 *   P  preconditions: the dev server, no sample left over, the live gate shut.
 *   A  the census of every sender, and the fences: each door asks the wall before any send, each
 *      queue finder leaves sample events out, the last step in each sender asks after Zone 7.
 *   B  the last step with the live switch ON, in process, behind `liveBehindTrap`: a sample twin
 *      is stopped with the trap untouched; its real twin reaches the trap (the gate was open).
 *   C  the doors: the press, the resend door, the test email (in process); the by-hand nudge,
 *      trigger-nudges, wrap-up and its retry (over HTTP, the visitor's own session).
 *   D  the queues: each finder, given twins, returns the real one and not the sample.
 *   E  the copy: started over HTTP, its rows, its reach, its limits, the guest match.
 *   F  the AI cap: per copy, at once, the day's total; each AI route asks before its call.
 *   W  the words, byte for byte.
 *   G  teardown: every fixture gone by id, every total as found.
 *
 * SAFETY. The dev server is started with every provider key and the AI key blank and is never
 * live. This suite opens the live gate only through `liveBehindTrap`, behind the provider trap's
 * walls, in layer B. It calls no cron route, runs no unscoped drain or sweep that writes, makes no
 * AI call, and removes every row it made by id. Every instant and fixture is written here by hand,
 * never taken from the code under test.
 */
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';

process.env.TNZ_AUTH_TOKEN = 'gtc392-fake-tnz-token';
process.env.TWILIO_ACCOUNT_SID = 'AC' + '0'.repeat(32);
process.env.TWILIO_AUTH_TOKEN = 'gtc392fakeauthtoken000000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.RESEND_API_KEY = 're_gtc392_fake_key_not_real';
if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'gtc392-fake-unsubscribe-secret';
}
delete process.env.GATHER_LIVE_SENDS;

import { installProviderTrap, liveBehindTrap, trapCount, trapHits } from './helpers/provider-trap';
import { prisma } from '../src/lib/prisma';
// Every other src module is loaded inside `main`, after the fake keys above are set:
// `import` lines run before any statement, and tnz-client.ts reads its key once, at load.

// The real fetch, kept for the dev server on :3000 before the trap replaces the global.
const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
const RUN = randomBytes(4).toString('hex');
const TAG = `GTC392-${RUN}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const COPY_DOMAIN = '@demo-copy.invalid';
const SHARED_ACCOUNT = 'demo-session@demo.gather';

// ── The words, hand-written from the ruled W-lines (18 Oct 2026) ──────────────
const W1 =
  'This is a sample event. Nothing you do here sends a message to anyone. Use made-up names.';
const W2 =
  'This is a sample event, so nothing was sent. In a real event, this is where your messages go out.';
const W3 = 'This is a sample event, so Gather sends nothing from it.';
const W4 = 'Test emails are off in a sample event.';
const W5 =
  'This sample event has made all the plans it can. You can still change the plan by hand.';
const W6 = 'The sample has made all the plans it can for today. Please try again tomorrow.';
const W7 = "You've started a few sample events in the last hour. Please try again a little later.";
const W8A = 'Lots of people are trying Gather right now. Please try again in a few minutes.';
const W8B = 'The sample is full for today. Please try again tomorrow.';
const W9 = "You're signed in to Gather. Sign out first to try a sample event.";
const W10 = 'You already have a sample event open.';
const W10_LINK = 'Go to it →';
const W11 = 'Try it with your own sample event →';
const W12 = 'Your sample gathering';
const W13 = 'Sam';
const W15 = 'The sample event could not be started. Please try again.';
/** Log and result text only, never shown. */
const STOP = 'Not sent: this is a sample event';

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
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(read(rel));
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e.name)) out.push(path.relative(ROOT, full));
  }
  return out;
}
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

// ── CHECKS-START: the static checks, pure over comment-stripped source, dry-run before RED ──
/** The source of one function, from its declaration to the next top-level declaration. */
function fnBody(src: string, decl: string): string {
  const at = src.indexOf(decl);
  if (at < 0) return '';
  const rest = src.slice(at + decl.length);
  const next = rest.search(/\n(export )?(async )?function |\nexport (const|class|interface|type) /);
  return decl + (next < 0 ? rest : rest.slice(0, next));
}
/** Every index of `needle` in `hay`. */
function indexes(hay: string, needle: string): number[] {
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + 1)) out.push(i);
  return out;
}
/** a appears, b appears, and the first a is before the first b. */
function before(src: string, a: string, b: string): boolean {
  return src.indexOf(a) >= 0 && src.indexOf(b) >= 0 && src.indexOf(a) < src.indexOf(b);
}
const WALL_IMPORT = "from '@/lib/demo/send-wall'";
/** An AI call: the four functions that reach Claude, each with an optional type argument. */
const AI_CALL =
  /\b(callClaudeForJSON|generatePlan|generateSelectiveItems|regeneratePlan)\s*(<[^>()]*>)?\s*\(/g;
export const CHECKS = {
  press(src: string) {
    const body = fnBody(src, 'export async function pressSend(');
    return (
      src.includes(WALL_IMPORT) &&
      before(body, "'HOST_HAS_NO_ACCOUNT'", 'isDemoEvent(') &&
      before(body, 'isDemoEvent(', '$transaction(') &&
      /refuse\(\s*409,\s*'DEMO_EVENT'/.test(body)
    );
  },
  resolveSubject(src: string) {
    const body = fnBody(src, 'async function resolveSubject(');
    return (
      src.includes(WALL_IMPORT) &&
      before(body, "'EVENT_NOT_FOUND'", 'isDemoEvent(') &&
      before(body, 'isDemoEvent(', 'outboundMessage.count(') &&
      /refuse\(\s*409,\s*'DEMO_EVENT'\s*\)/.test(body)
    );
  },
  readDoor(src: string) {
    return (
      CHECKS.resolveSubject(src) &&
      before(fnBody(src, 'export async function readDoor('), 'resolveSubject(', 'readAskPreview(')
    );
  },
  resendToPerson(src: string) {
    return (
      CHECKS.resolveSubject(src) &&
      before(
        fnBody(src, 'export async function resendToPerson('),
        'resolveSubject(',
        '$transaction('
      )
    );
  },
  route(src: string, later: string[]) {
    const at = src.indexOf('isDemoEvent(');
    const near = at < 0 ? '' : src.slice(at, at + 400);
    return (
      src.includes(WALL_IMPORT) &&
      before(src, 'requireEventRole(', 'isDemoEvent(') &&
      later.every((x) => src.indexOf(x) < 0 || src.indexOf(x) > at) &&
      /status:\s*409/.test(near) &&
      near.includes('DEMO_SEND_WORDS')
    );
  },
  testEmail(src: string) {
    return (
      src.includes(WALL_IMPORT) &&
      before(src, 'isDemoEvent(', 'readAskPreview(') &&
      before(src, "return 'DEMO'", 'sendHostTestEmail(')
    );
  },
  sendSms(src: string) {
    const body = fnBody(src, 'export async function sendSms(');
    return (
      before(body, 'checkOptOut(', 'listTextBlocks(') &&
      before(body, 'listTextBlocks(', 'isDemoEvent(') &&
      before(body, 'isDemoEvent(', 'isLiveSendingOn()')
    );
  },
  hostVoiced(src: string) {
    return before(
      fnBody(src, 'async function sendHostVoiced('),
      'isDemoEvent(',
      'getResendClient('
    );
  },
  nudgeEmail(src: string) {
    return before(
      fnBody(src, 'export async function sendNudgeEmail('),
      'isDemoEvent(',
      'getResendClient('
    );
  },
  nudgeFinder(src: string) {
    return /\.\.\.SENT_AND_LIVE\(now\),\s*isDemo: false,/.test(
      fnBody(src, 'export async function findNudgeCandidates(')
    );
  },
  nudgeForEvent(src: string) {
    return (
      CHECKS.nudgeFinder(src) &&
      /return findNudgeCandidates\(now, \{ eventIds: \[eventId\] \}\)/.test(
        fnBody(src, 'export async function findNudgeCandidatesForEvent(')
      )
    );
  },
  decideFinder(src: string) {
    return /event: \{ \.\.\.SENT_AND_LIVE\(now\), isDemo: false \}/.test(
      fnBody(src, 'export async function findDecideByFollowupCandidates(')
    );
  },
  neverAttempted(src: string) {
    return /attemptedAt: null, withheldAt: null, event: \{ isDemo: false \}/.test(
      fnBody(src, 'export async function findNeverAttempted(')
    );
  },
  dueForRetry(src: string) {
    return /event: \{ isDemo: false \}/.test(fnBody(src, 'export async function findDueForRetry('));
  },
  enrolMiniSends(src: string) {
    return /sentAt: \{ not: null \},\s*isDemo: false,/.test(
      fnBody(src, 'export async function enrolMiniSends(')
    );
  },
  wrapPending(src: string) {
    return /dispatched: false,\s*createdAt: \{ lte: cutoff \},\s*event: \{ isDemo: false \}/.test(
      fnBody(src, 'export async function dispatchPendingWrapUpMessages(')
    );
  },
  thankYouRetry(src: string) {
    return /event: \{ isDemo: false \}/.test(
      fnBody(src, 'export async function retryUndeliveredThankYous(')
    );
  },
  failedRetry(src: string) {
    return /eventId, failed: true, event: \{ isDemo: false \}/.test(
      fnBody(src, 'export async function retryFailedDispatches(')
    );
  },
  followupRetry(src: string) {
    return /event: \{ isDemo: false \}/.test(
      fnBody(src, 'export async function retryUndeliveredFollowups(')
    );
  },
  wallFence(src: string) {
    return (
      src.length > 0 &&
      /export async function isDemoEvent\(/.test(src) &&
      !/@\/lib\/(sms|email|live-sends)|resend|twilio|tnz|next\//i.test(src) &&
      /isDemo: true/.test(src)
    );
  },
  aiRoute(src: string, alsoBefore: string[] = []) {
    const gate = src.indexOf('takeDemoAiCall(');
    const near = gate < 0 ? '' : src.slice(gate, gate + 400);
    // Every AI call as written, with or without a type argument: `callClaudeForJSON<T>(`.
    const calls = [...src.matchAll(AI_CALL)].map((m) => m.index ?? -1);
    return (
      src.includes("from '@/lib/demo/ai-cap'") &&
      gate > 0 &&
      calls.length > 0 &&
      calls.every((i) => i > gate) &&
      alsoBefore.every((x) => src.indexOf(x) > gate) &&
      /status:\s*429/.test(near) &&
      near.includes('demoWords') &&
      indexes(src, 'aiCallsUsed: { increment: 1 }').every((i) => {
        // Inside its own `if (!x.counted) {`: no statement between the guard and the count.
        const back = src.lastIndexOf('.counted)', i);
        return back >= 0 && i - back < 220 && !src.slice(back, i).includes(';');
      })
    );
  },
  setupToasts(src: string) {
    const at = indexes(src, 'toast.error("You\'ve used all 10 AI calls for this event.")');
    return at.length === 2 && at.every((i) => /demoWords/.test(src.slice(Math.max(0, i - 300), i)));
  },
  demoPage(src: string) {
    return (
      // [[GTC-394]] tweak 3 (founder's ruling 3, 19 Oct 2026): the button carries the page's own
      // label, "Try it yourself", still only in development; DEMO_START_WORDS.BUTTON stays W11 in
      // start-limit.ts (checked as before), unused by the page. The page beside it is the two-button
      // page ("Sarah demo"), not the old walkthrough.
      /process\.env\.NODE_ENV === 'development' && \([\s\S]{0,600}?\bTRY_IT_YOURSELF\b/.test(src) &&
      /const TRY_IT_YOURSELF = 'Try it yourself';/.test(src) &&
      src.includes("start: 'copy'") &&
      /fetch\('\/api\/events'/.test(src) &&
      src.includes('DEMO_START_WORDS.ALREADY_OPEN') &&
      src.includes('DEMO_START_WORDS.SIGNED_IN') &&
      // [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026): the page's only button; "Sarah demo" goes.
      !/Sarah/.test(src)
    );
  },
  banner(src: string) {
    return /<DemoBanner\b/.test(src);
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── Fixtures, all removed by id at the end ───────────────────────────────────
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessionTokens: new Set<string>(),
};
let phoneSeq = 0;
/** A run-unique NZ mobile nobody has opted out of or had blocked. */
function freshMobile(): string {
  phoneSeq++;
  const n = (parseInt(RUN.slice(0, 5), 16) % 90000) * 10 + phoneSeq;
  return `+6421${String(n).padStart(7, '0').slice(-7)}`;
}
const addr = (who: string) => `${TAG.toLowerCase()}-${who}@demo-sandbox.invalid`;

async function makeHost(label: string, withAccount: boolean) {
  const user = withAccount
    ? await prisma.user.create({ data: { email: addr(`${label}-host`) } })
    : null;
  if (user) fx.users.add(user.id);
  const person = await prisma.person.create({
    data: { name: `${label} Host`, email: user?.email ?? null, userId: user?.id ?? null },
  });
  fx.persons.add(person.id);
  return { user, person };
}

async function makeEvent(
  label: string,
  hostId: string,
  data: { isDemo: boolean; status?: 'DRAFT' | 'CONFIRMING'; sentAt?: Date | null; end?: Date }
) {
  const end = data.end ?? new Date(Date.now() + 21 * DAY);
  const event = await prisma.event.create({
    data: {
      name: `${TAG} ${label}`,
      startDate: end,
      endDate: end,
      hostId,
      isDemo: data.isDemo,
      status: data.status ?? 'CONFIRMING',
      sentAt: data.sentAt ?? null,
    },
  });
  fx.events.add(event.id);
  return event;
}

async function makeGuest(
  label: string,
  eventId: string,
  contact: { email?: boolean; phone?: boolean },
  extra: { sentAt?: Date | null; token?: boolean } = {}
) {
  const person = await prisma.person.create({
    data: {
      name: `${label} Guest`,
      email: contact.email ? addr(`${label}-guest`) : null,
      phoneNumber: contact.phone ? freshMobile() : null,
    },
  });
  fx.persons.add(person.id);
  const pe = await prisma.personEvent.create({
    data: {
      personId: person.id,
      eventId,
      role: 'PARTICIPANT',
      reachabilityTier: 'DIRECT',
      contactMethod: contact.phone ? 'SMS' : 'EMAIL',
      sentAt: extra.sentAt ?? null,
    },
  });
  if (extra.token) {
    await prisma.accessToken.create({
      data: { token: `${TAG}-${person.id}`, scope: 'PARTICIPANT', eventId, personId: person.id },
    });
  }
  return { person, pe };
}

async function hostMembership(eventId: string, personId: string) {
  return prisma.personEvent.create({ data: { personId, eventId, role: 'HOST' } });
}

/** A session for a user, hand-made, as the sign-in route would leave one. */
async function makeSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + HOUR) },
  });
  fx.sessionTokens.add(token);
  return `session=${token}`;
}

function sessionCookieFrom(res: Response): string | null {
  const all =
    typeof (res.headers as any).getSetCookie === 'function'
      ? (res.headers as any).getSetCookie()
      : [res.headers.get('set-cookie') ?? ''];
  for (const raw of all as string[]) {
    const m = /(?:^|;\s*)session=([^;]*)/.exec(raw ?? '');
    if (m && m[1]) return m[1];
  }
  return null;
}

/** Start a copy over HTTP. Records any session token handed back, copy or not. */
async function postStart(ip: string, opts: { body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = { 'x-forwarded-for': ip };
  if (opts.body !== undefined) headers['content-type'] = 'application/json';
  if (opts.cookie) headers.cookie = opts.cookie;
  const res = await realFetch(`${BASE}/api/demo/session`, {
    method: 'POST',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const body = await res.json().catch(() => null);
  const token = sessionCookieFrom(res);
  if (token) fx.sessionTokens.add(token);
  return { status: res.status, body, token };
}

/** Is this event a copy started by the route: a sample whose host's account is a copy's? */
async function copyRowsOf(eventId: string | undefined) {
  if (!eventId) return null;
  const ev = await prisma.event.findUnique({
    where: { id: eventId },
    include: { host: { include: { user: true } } },
  });
  if (!ev || !ev.isDemo || !ev.host.user?.email.endsWith(COPY_DOMAIN)) return null;
  fx.events.add(ev.id);
  fx.persons.add(ev.hostId);
  fx.users.add(ev.host.user.id);
  return ev;
}

const ACTOR = (person: { id: string; name: string }) => ({
  id: person.id,
  kind: 'HOST' as const,
  name: person.name,
});

async function totals() {
  const [
    Event,
    User,
    Session,
    Person,
    OutboundMessage,
    InviteEvent,
    WrapUpLink,
    EventRole,
    AccessToken,
    AuditEntry,
    EventSetup,
    PersonEvent,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.user.count(),
    prisma.session.count(),
    prisma.person.count(),
    prisma.outboundMessage.count(),
    prisma.inviteEvent.count(),
    prisma.wrapUpLink.count(),
    prisma.eventRole.count(),
    prisma.accessToken.count(),
    prisma.auditEntry.count(),
    prisma.eventSetup.count(),
    prisma.personEvent.count(),
  ]);
  return {
    Event,
    User,
    Session,
    Person,
    OutboundMessage,
    InviteEvent,
    WrapUpLink,
    EventRole,
    AccessToken,
    AuditEntry,
    EventSetup,
    PersonEvent,
  };
}

/** The Saturday four weeks on, written independently of copy.ts: today's NZ date + 28, then on to a Saturday. */
function expectedCopyDay(now: Date): string {
  const nzDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = nzDate.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 28));
  while (t.getUTCDay() !== 6) t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString();
}

/** Every row the run made, by id. Runs whether or not a layer threw. */
async function teardown(sharedUserId: string | null, sharedRolesBefore: Set<string>) {
  const events = [...fx.events];
  await prisma.wrapUpLink.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.sessionTokens] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
  // Today's path (no body) upserts the shared demo account and its one role: put both back as found.
  const shared = await prisma.user.findUnique({ where: { email: SHARED_ACCOUNT } });
  if (shared) {
    const fresh = await prisma.eventRole.findMany({ where: { userId: shared.id } });
    const added = fresh.filter((r) => !sharedRolesBefore.has(r.id)).map((r) => r.id);
    if (added.length) await prisma.eventRole.deleteMany({ where: { id: { in: added } } });
    if (!sharedUserId) await prisma.user.delete({ where: { id: shared.id } });
  }
}

async function main() {
  const { sendSms } = await import('../src/lib/sms/send-sms');
  const { sendAskEmail, sendChaseEmail, sendDecideByEmail, sendNudgeEmail } =
    await import('../src/lib/email');
  const { pressSend } = await import('../src/lib/press/press');
  const { readDoor, resendToPerson } = await import('../src/lib/press/resend');
  const { sendTestEmailFor } = await import('../src/lib/preflight/test-email-send');
  const { findNudgeCandidates, findNudgeCandidatesForEvent } =
    await import('../src/lib/sms/nudge-eligibility');
  const { findDecideByFollowupCandidates } = await import('../src/lib/sms/decide-by-eligibility');
  const { findDueForRetry, findNeverAttempted } = await import('../src/lib/press/dispatch');
  const { retryFailedDispatches } = await import('../src/lib/wrap-up');
  const { findOrCreateCapturedPerson } = await import('../src/lib/households/capturePerson');
  const found = await totals();
  const sharedUser = await prisma.user.findUnique({ where: { email: SHARED_ACCOUNT } });
  const sharedRolesBefore = new Set(
    sharedUser
      ? (await prisma.eventRole.findMany({ where: { userId: sharedUser.id } })).map((r) => r.id)
      : []
  );
  const isDemoBefore = await prisma.event.count({ where: { isDemo: true } });
  const sharedDemo = await prisma.event.findFirst({
    where: { name: 'Henderson Family Christmas 2025', isDemo: true },
    select: { id: true },
  });

  const SW = await load('../src/lib/demo/send-wall');
  const COPY = await load('../src/lib/demo/copy');
  const CAP = await load('../src/lib/demo/ai-cap');
  const LIM = await load('../src/lib/demo/start-limit');

  try {
    // ══ P — preconditions ══════════════════════════════════════════════════════
    section('P — preconditions');
    let serverOk = false;
    try {
      const probe = await realFetch(`${BASE}/api/events/${TAG}-probe/people`);
      serverOk = probe.status === 401;
    } catch {
      serverOk = false;
    }
    assert('P', `the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
    const copiesAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'P',
      'no copy is in the database before the run (no @demo-copy.invalid account)',
      copiesAtStart === 0,
      `found ${copiesAtStart}`
    );
    assert(
      'P',
      'CONTROL: the live gate is shut in this process at the start',
      process.env.GATHER_LIVE_SENDS !== 'on'
    );
    assert(
      'P',
      'CONTROL: the comment stripper strips, and the reader reads',
      !stripComments('/* isDemo */ const a = 1; // isDemo\n').includes('isDemo') &&
        read('src/lib/prisma.ts').length > 0 &&
        read('src/lib/no-such-file.ts') === ''
    );

    // ══ A — the census and the fences ══════════════════════════════════════════
    section('A — the census of senders, and the fences');
    const srcFiles = walk(path.join(ROOT, 'src')).map((rel) => ({ rel, code: code(rel) }));
    const census = (re: RegExp, exclude: RegExp) => {
      const out: Record<string, number> = {};
      for (const f of srcFiles) {
        const n = (f.code.match(re) ?? []).length - (f.code.match(exclude) ?? []).length;
        if (n > 0) out[f.rel] = n;
      }
      return out;
    };
    const same = (a: Record<string, number>, b: Record<string, number>) =>
      JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

    const SMS_SITES = {
      // Every text, whatever its door, goes through sendSms, whose last step is the wall.
      'src/app/api/events/[id]/people/[personId]/nudge/route.ts': 1,
      'src/lib/press/dispatch.ts': 2,
      'src/lib/sms/decide-by-sender.ts': 1,
      'src/lib/wrap-up.ts': 1,
    };
    const RESEND_SITES = {
      // Exempt: account mail (Zone 2), not about an event.
      'src/app/api/auth/claim/route.ts': 1,
      // Five: sendHostVoiced and sendNudgeEmail (walled at the last step); sendMagicLinkEmail and
      // sendWelcomeEmail (account mail, exempt); sendHostTestEmail (walled at its one caller).
      'src/lib/email.ts': 5,
      // Exempt: the founder's own alert; the delivery poll reads only accepted sends.
      'src/lib/sms/tnz-account-alert.ts': 1,
      'src/lib/email-delivery/delivery-poll.ts': 1,
    };
    const SEND_SITES = {
      'src/app/api/auth/claim/route.ts': 1,
      'src/lib/email.ts': 5,
      'src/lib/sms/tnz-account-alert.ts': 1,
    };
    const smsCensus = census(/\bsendSms\(/g, /function sendSms\(/g);
    const resendCensus = census(/\bgetResendClient\(/g, /function getResendClient\(/g);
    const sendCensus = census(/\.emails\.send\(/g, /$^/g);
    assert(
      'A',
      'A1 CONTROL: every sendSms( call in src is a classified one (four files, five calls, all behind sendSms’s own wall)',
      same(smsCensus, SMS_SITES),
      JSON.stringify(smsCensus)
    );
    assert(
      'A',
      'A2 CONTROL: every getResendClient( call in src is a classified one (walled or named exempt)',
      same(resendCensus, RESEND_SITES),
      JSON.stringify(resendCensus)
    );
    assert(
      'A',
      'A3 CONTROL: every emails.send( call in src is a classified one',
      same(sendCensus, SEND_SITES),
      JSON.stringify(sendCensus)
    );

    // The doors: each asks the wall before anything it would write or send.
    const resendSrc = code('src/lib/press/resend.ts');
    const ROUTE = (r: string) => code(`src/app/api/events/[id]/${r}/route.ts`);
    const A_CHECKS: Array<[string, boolean]> = [
      [
        'A4 pressSend asks the wall after HOST_HAS_NO_ACCOUNT and before its transaction, refusing DEMO_EVENT 409 (Q15)',
        CHECKS.press(code('src/lib/press/press.ts')),
      ],
      [
        'A5 readDoor reaches the wall (resolveSubject) before it reads the preview',
        CHECKS.readDoor(resendSrc),
      ],
      [
        'A6 resendToPerson reaches the wall (resolveSubject) before its transaction',
        CHECKS.resendToPerson(resendSrc),
      ],
      [
        'A7 the by-hand nudge asks the wall after its guard and before it reads the body, a contact or sends (409, W3)',
        CHECKS.route(ROUTE('people/[personId]/nudge'), [
          'request.json(',
          'resolveManualNudgeRecipient(',
          'openTextSend(',
          'sendSms(',
          'sendNudgeEmail(',
        ]),
      ],
      [
        'A8 trigger-nudges asks the wall before it finds or queues anything (409, W3)',
        CHECKS.route(ROUTE('trigger-nudges'), ['findNudgeCandidatesForEvent(', 'queueChase(']),
      ],
      [
        'A9 wrap-up asks the wall before the date, wrappedAt or any link (409, W3)',
        CHECKS.route(ROUTE('wrap-up'), [
          'isComplete(',
          'event.wrappedAt',
          '$transaction(',
          'generateWrapUpLinks(',
        ]),
      ],
      [
        'A10 wrap-up/retry asks the wall before it re-arms anything (409, W3)',
        CHECKS.route(ROUTE('wrap-up/retry'), ['retryFailedDispatches(']),
      ],
      [
        "A11 sendTestEmailFor answers 'DEMO' before it reads the message or sends",
        CHECKS.testEmail(code('src/lib/preflight/test-email-send.ts')),
      ],
      [
        'A12 sendSms asks the wall AFTER Zone 7’s opt-out check and the text block (first, untouched) and BEFORE the live switch',
        CHECKS.sendSms(code('src/lib/sms/send-sms.ts')),
      ],
      [
        'A13 sendHostVoiced (ask, reminder, decide-by) asks the wall before getResendClient',
        CHECKS.hostVoiced(code('src/lib/email.ts')),
      ],
      [
        'A14 sendNudgeEmail (by-hand nudge, thank-you) asks the wall before getResendClient',
        CHECKS.nudgeEmail(code('src/lib/email.ts')),
      ],
      [
        'A15 findNudgeCandidates: { ...SENT_AND_LIVE(now), isDemo: false }',
        CHECKS.nudgeFinder(code('src/lib/sms/nudge-eligibility.ts')),
      ],
      [
        'A16 findNudgeCandidatesForEvent goes through that same finder, scoped to the event',
        CHECKS.nudgeForEvent(code('src/lib/sms/nudge-eligibility.ts')),
      ],
      [
        'A17 findDecideByFollowupCandidates: event: { ...SENT_AND_LIVE(now), isDemo: false }',
        CHECKS.decideFinder(code('src/lib/sms/decide-by-eligibility.ts')),
      ],
      [
        'A18 findNeverAttempted: never attempted, not withheld, and event: { isDemo: false }',
        CHECKS.neverAttempted(code('src/lib/press/dispatch.ts')),
      ],
      [
        'A19 findDueForRetry: event: { isDemo: false }',
        CHECKS.dueForRetry(code('src/lib/press/dispatch.ts')),
      ],
      [
        'A20 enrolMiniSends: the pressed events it sweeps carry isDemo: false',
        CHECKS.enrolMiniSends(code('src/lib/press/dispatch.ts')),
      ],
      [
        'A21 the thank-you dispatch’s pending links: event: { isDemo: false }',
        CHECKS.wrapPending(code('src/lib/wrap-up.ts')),
      ],
      [
        'A22 retryUndeliveredThankYous: event: { isDemo: false }',
        CHECKS.thankYouRetry(code('src/lib/wrap-up.ts')),
      ],
      [
        'A23 retryFailedDispatches: event: { isDemo: false }',
        CHECKS.failedRetry(code('src/lib/wrap-up.ts')),
      ],
      [
        'A24 retryUndeliveredFollowups: event: { isDemo: false }',
        CHECKS.followupRetry(code('src/lib/sms/decide-by-sender.ts')),
      ],
      [
        'A25 the wall reaches no provider, no live switch, no sender and no Next request: it only reads isDemo',
        CHECKS.wallFence(code('src/lib/demo/send-wall.ts')),
      ],
    ];
    for (const [label, held] of A_CHECKS) assert('A', label, held);
    const rawSendSms = srcFiles.reduce(
      (n, f) => n + (read(f.rel).match(/sendSms\(\{/g) ?? []).length,
      0
    );
    assert(
      'A',
      'A26 CONTROL: the raw source still holds exactly five `sendSms({` (test:texts counts them)',
      rawSendSms === 5,
      `found ${rawSendSms}`
    );

    // ══ B — the last step, live switch ON, behind the trap ════════════════════
    section('B — the last step with the live switch ON (in process, behind the trap)');
    const bHost = await makeHost(`${TAG}-B`, false);
    const bDemo = await makeEvent('B sample twin', bHost.person.id, { isDemo: true });
    const bReal = await makeEvent('B real twin', bHost.person.id, { isDemo: false });
    const bDemoGuest = await makeGuest(`${TAG}-B-demo`, bDemo.id, { email: true, phone: true });
    const bRealGuest = await makeGuest(`${TAG}-B-real`, bReal.id, { email: true, phone: true });
    const emailArgs = (g: typeof bDemoGuest, eventId: string) => ({
      to: g.person.email!,
      subject: `${TAG} subject`,
      body: `${TAG} body`,
      replyTo: addr('reply'),
      fromName: 'Sam',
      personId: g.person.id,
      eventId,
    });
    const close = liveBehindTrap();
    try {
      const senders: Array<[string, (g: typeof bDemoGuest, eventId: string) => Promise<any>]> = [
        [
          'sendSms',
          (g, eventId) =>
            sendSms({
              to: g.person.phoneNumber!,
              message: `${TAG} text`,
              eventId,
              personId: g.person.id,
            }),
        ],
        ['sendAskEmail', (g, e) => sendAskEmail(emailArgs(g, e))],
        ['sendChaseEmail', (g, e) => sendChaseEmail(emailArgs(g, e))],
        ['sendDecideByEmail', (g, e) => sendDecideByEmail(emailArgs(g, e))],
        [
          'sendNudgeEmail',
          (g, e) =>
            sendNudgeEmail({
              to: g.person.email!,
              subject: `${TAG} subject`,
              body: `${TAG} body`,
              eventId: e,
              personId: g.person.id,
            }),
        ],
      ];
      for (const [name, call] of senders) {
        const t0 = trapCount();
        const r = await call(bDemoGuest, bDemo.id).catch((e: unknown) => ({ threw: String(e) }));
        const stopped =
          r?.success === false &&
          trapCount() === t0 &&
          r?.error === STOP &&
          r?.providerErrorCode === undefined &&
          (name !== 'sendSms' || r?.blocked === 'SMS_DISABLED');
        assert(
          'B',
          `${name}: the sample twin is stopped in the wall's words, and the trap is not reached`,
          stopped,
          JSON.stringify(r)
        );
        if (name === 'sendSms') {
          const logged = await prisma.inviteEvent.count({ where: { eventId: bDemo.id } });
          assert(
            'B',
            'the stopped text writes no InviteEvent (a stop is never recorded as a send)',
            logged === 0,
            `${logged}`
          );
        }
        const t1 = trapCount();
        const r2 = await call(bRealGuest, bReal.id).catch((e: unknown) => ({ threw: String(e) }));
        assert(
          'B',
          `CONTROL ${name}: the real twin reaches the trap, so the gate really was open`,
          trapCount() > t1 && r2?.success === true,
          JSON.stringify(r2)
        );
      }
      const t2 = trapCount();
      const made = await sendNudgeEmail({
        to: bRealGuest.person.email!,
        subject: `${TAG} subject`,
        body: `${TAG} body`,
        eventId: `${TAG}-no-such-event`,
        personId: bRealGuest.person.id,
      }).catch((e: unknown) => ({ threw: String(e) }) as any);
      assert(
        'B',
        'CONTROL: a made-up event id reads "not a demo" — the send goes on to the trap and nothing throws',
        trapCount() > t2 && made?.success === true,
        JSON.stringify(made)
      );
    } finally {
      close();
    }
    assert(
      'B',
      'isDemoEvent never throws and never fails closed: a missing, empty or absent id is "not a demo"; the twins read true and false',
      !!SW?.isDemoEvent &&
        (await SW.isDemoEvent(prisma, `${TAG}-no-such-event`).catch(() => 'threw')) === false &&
        (await SW.isDemoEvent(prisma, '').catch(() => 'threw')) === false &&
        (await SW.isDemoEvent(prisma, undefined).catch(() => 'threw')) === false &&
        (await SW.isDemoEvent(prisma, bDemo.id).catch(() => 'threw')) === true &&
        (await SW.isDemoEvent(prisma, bReal.id).catch(() => 'threw')) === false
    );
    assert(
      'B',
      'CONTROL: the gate is shut again after layer B',
      process.env.GATHER_LIVE_SENDS !== 'on'
    );

    // ══ C — the doors ══════════════════════════════════════════════════════════
    section('C — the doors');
    const cHostD = await makeHost(`${TAG}-Cd`, true);
    const cDemo = await makeEvent('C sample, ready to press', cHostD.person.id, { isDemo: true });
    await prisma.eventRole.create({
      data: { userId: cHostD.user!.id, eventId: cDemo.id, role: 'HOST' },
    });
    await hostMembership(cDemo.id, cHostD.person.id);
    const cDemoGuest = await makeGuest(`${TAG}-C-demo`, cDemo.id, { email: true });
    const cHostR = await makeHost(`${TAG}-Cr`, true);
    const cReal = await makeEvent('C real, ready to press', cHostR.person.id, { isDemo: false });
    await hostMembership(cReal.id, cHostR.person.id);
    await makeGuest(`${TAG}-C-real`, cReal.id, { email: true });
    const cHostU = await makeHost(`${TAG}-Cu`, false);
    const cUnclaimed = await makeEvent('C sample, host never signed in', cHostU.person.id, {
      isDemo: true,
    });
    await makeGuest(`${TAG}-C-unclaimed`, cUnclaimed.id, { email: true });

    const pressD: any = await pressSend(prisma as any, {
      eventId: cDemo.id,
      actor: ACTOR(cHostD.person),
      baseUrl: BASE,
    }).catch((e) => ({ threw: String(e) }));
    assert(
      'C',
      'C1 the press refuses a sample event: DEMO_EVENT, 409',
      pressD?.ok === false && pressD?.code === 'DEMO_EVENT' && pressD?.status === 409,
      JSON.stringify(pressD)
    );
    const [cOm, cTok, cAud, cEv] = await Promise.all([
      prisma.outboundMessage.count({ where: { eventId: cDemo.id } }),
      prisma.accessToken.count({ where: { eventId: cDemo.id } }),
      prisma.auditEntry.count({ where: { eventId: cDemo.id } }),
      prisma.event.findUnique({ where: { id: cDemo.id }, select: { sentAt: true } }),
    ]);
    assert(
      'C',
      'C2 and wrote nothing: no message row, no token, no ledger line, no send clock',
      cOm === 0 && cTok === 0 && cAud === 0 && cEv?.sentAt === null,
      `rows ${cOm}, tokens ${cTok}, audit ${cAud}, sentAt ${cEv?.sentAt}`
    );
    const pressR: any = await pressSend(prisma as any, {
      eventId: cReal.id,
      actor: ACTOR(cHostR.person),
      baseUrl: BASE,
    }).catch((e) => ({ threw: String(e) }));
    assert(
      'C',
      'C3 CONTROL: its real twin presses (nothing drains it: no cron runs here)',
      pressR?.ok === true,
      JSON.stringify(pressR)
    );
    const pressU: any = await pressSend(prisma as any, {
      eventId: cUnclaimed.id,
      actor: ACTOR(cHostU.person),
      baseUrl: BASE,
    }).catch((e) => ({ threw: String(e) }));
    assert(
      'C',
      'C4 CONTROL: the seeded shape — a sample whose host never signed in — still answers HOST_HAS_NO_ACCOUNT (Q15)',
      pressU?.ok === false && pressU?.code === 'HOST_HAS_NO_ACCOUNT',
      JSON.stringify(pressU)
    );
    const resendD: any = await resendToPerson(prisma as any, {
      eventId: cDemo.id,
      personId: cDemoGuest.person.id,
      baseUrl: BASE,
      actor: ACTOR(cHostD.person),
      action: 'AGAIN',
    }).catch((e) => ({ threw: String(e) }));
    assert(
      'C',
      'C5 the resend door refuses a sample event: DEMO_EVENT, 409',
      resendD?.ok === false && resendD?.code === 'DEMO_EVENT' && resendD?.status === 409,
      JSON.stringify(resendD)
    );
    const doorD: any = await readDoor(prisma as any, {
      eventId: cDemo.id,
      personId: cDemoGuest.person.id,
      baseUrl: BASE,
    }).catch((e) => ({ threw: String(e) }));
    assert(
      'C',
      'C6 and will not even open for one: DEMO_EVENT, 409',
      doorD?.ok === false && doorD?.code === 'DEMO_EVENT' && doorD?.status === 409,
      JSON.stringify(doorD)
    );
    const testD = await sendTestEmailFor(prisma as any, {
      eventId: cDemo.id,
      personEventId: cDemoGuest.pe.id,
      viewer: { id: cHostD.user!.id, email: cHostD.user!.email },
      baseUrl: BASE,
    }).catch((e) => `threw ${e}`);
    assert(
      'C',
      "C7 the test email answers 'DEMO' on a sample event",
      testD === 'DEMO',
      String(testD)
    );

    // Over HTTP, with the visitor's own session on a sample (hand-made, as a copy's would be).
    const cVisit = await makeHost(`${TAG}-Cv`, true);
    const cVisitEvent = await makeEvent('C sample the visitor hosts', cVisit.person.id, {
      isDemo: true,
      status: 'DRAFT',
    });
    await prisma.eventRole.create({
      data: { userId: cVisit.user!.id, eventId: cVisitEvent.id, role: 'HOST' },
    });
    const cVisitGuest = await makeGuest(`${TAG}-C-visit`, cVisitEvent.id, { phone: true });
    const visitCookie = await makeSession(cVisit.user!.id);
    const http = async (p: string, body?: unknown) => {
      try {
        const res = await realFetch(`${BASE}${p}`, {
          method: 'POST',
          headers: { cookie: visitCookie, 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
        });
        return { status: res.status, body: await res.json().catch(() => null) };
      } catch (e) {
        return { status: -1, body: String(e) };
      }
    };
    const doors = [
      [
        'C8 the by-hand nudge',
        await http(`/api/events/${cVisitEvent.id}/people/${cVisitGuest.person.id}/nudge`, {
          template: 'warm',
          message: `${TAG} are you coming?`,
        }),
      ],
      ['C9 trigger-nudges', await http(`/api/events/${cVisitEvent.id}/trigger-nudges`)],
      ['C10 wrap-up', await http(`/api/events/${cVisitEvent.id}/wrap-up`)],
      ['C11 wrap-up/retry', await http(`/api/events/${cVisitEvent.id}/wrap-up/retry`)],
    ] as const;
    for (const [label, r] of doors) {
      assert(
        'C',
        `${label} answers 409 on a sample event, in W3's words`,
        r.status === 409 && r.body?.error === W3,
        JSON.stringify(r)
      );
    }
    const [vOm, vIe] = await Promise.all([
      prisma.outboundMessage.count({ where: { eventId: cVisitEvent.id } }),
      prisma.inviteEvent.count({ where: { eventId: cVisitEvent.id } }),
    ]);
    assert(
      'C',
      'C12 the nudge wrote no text record and no invite event on the sample',
      vOm === 0 && vIe === 0,
      `rows ${vOm}, invite events ${vIe}`
    );
    const [vWl, vEv] = await Promise.all([
      prisma.wrapUpLink.count({ where: { eventId: cVisitEvent.id } }),
      prisma.event.findUnique({ where: { id: cVisitEvent.id }, select: { wrappedAt: true } }),
    ]);
    assert(
      'C',
      'C13 no thank-you link and no wrappedAt on the sample',
      vWl === 0 && vEv?.wrappedAt === null,
      `links ${vWl}, wrappedAt ${vEv?.wrappedAt}`
    );
    let visitReads = -1;
    try {
      visitReads = (
        await realFetch(`${BASE}/api/events/${cVisitEvent.id}`, {
          headers: { cookie: visitCookie },
        })
      ).status;
    } catch {
      visitReads = -1;
    }
    assert(
      'C',
      'C14 CONTROL: the visitor’s session really reaches the sample (200), so the 409s are not 401s in disguise',
      visitReads === 200,
      `${visitReads}`
    );

    // ══ D — the queues, with twins ═════════════════════════════════════════════
    section('D — the queues: each finder returns the real twin and not the sample');
    const now = new Date();
    const eightDaysAgo = new Date(now.getTime() - 8 * DAY);
    const dHost = await makeHost(`${TAG}-D`, false);
    const twins: Record<'real' | 'demo', any> = { real: null, demo: null };
    for (const which of ['real', 'demo'] as const) {
      const ev = await makeEvent(`D ${which} twin, sent and live`, dHost.person.id, {
        isDemo: which === 'demo',
        sentAt: eightDaysAgo,
      });
      const nudgee = await makeGuest(
        `${TAG}-D-${which}-n`,
        ev.id,
        { phone: true, email: true },
        {
          sentAt: eightDaysAgo,
          token: true,
        }
      );
      const maybe = await makeGuest(
        `${TAG}-D-${which}-m`,
        ev.id,
        { phone: true, email: true },
        {
          sentAt: eightDaysAgo,
          token: true,
        }
      );
      // The message rows and the thank-you link sit on a third guest, so they cannot change
      // whom the two finders above choose.
      const rows = await makeGuest(`${TAG}-D-${which}-r`, ev.id, { email: true });
      const team = await prisma.team.create({ data: { name: `${TAG} D team`, eventId: ev.id } });
      const item = await prisma.item.create({
        data: {
          name: `${TAG} pavlova`,
          teamId: team.id,
          dropOffAt: new Date(now.getTime() + 25 * HOUR),
          decideByOffsetHours: 24,
        },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: maybe.person.id, response: 'MAYBE' },
      });
      const never = await prisma.outboundMessage.create({
        data: { eventId: ev.id, personEventId: rows.pe.id, kind: 'ASK', channel: 'EMAIL' },
      });
      const due = await prisma.outboundMessage.create({
        data: {
          eventId: ev.id,
          personEventId: rows.pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          attemptedAt: new Date(now.getTime() - 2 * HOUR),
          attemptCount: 1,
          nextAttemptAt: new Date(now.getTime() - 60 * 1000),
        },
      });
      const link = await prisma.wrapUpLink.create({
        data: {
          token: `${TAG}-wl-${which}`,
          eventId: ev.id,
          personId: rows.person.id,
          guestName: `${TAG} guest`,
          guestEmail: rows.person.email,
          channel: 'email',
          dispatched: true,
          failed: true,
          failReason: `${TAG} fixture`,
          expiresAt: new Date(now.getTime() + 30 * DAY),
        },
      });
      twins[which] = { ev, nudgee, maybe, never, due, link };
    }
    try {
      const both = await findNudgeCandidates(now, {
        eventIds: [twins.real.ev.id, twins.demo.ev.id],
      });
      const inFirst = (personId: string) => both.eligibleFirst.some((c) => c.personId === personId);
      assert(
        'D',
        'D1 CONTROL: findNudgeCandidates finds the real twin’s unanswered guest',
        inFirst(twins.real.nudgee.person.id),
        JSON.stringify(both.skipped)
      );
      const anyDemo = [...both.eligibleFirst, ...both.eligibleSecond, ...both.eligibleMore].some(
        (c) => c.eventId === twins.demo.ev.id
      );
      assert('D', 'D2 and not the sample twin’s', !anyDemo);
      const forReal = await findNudgeCandidatesForEvent(twins.real.ev.id, now);
      assert(
        'D',
        'D3 CONTROL: findNudgeCandidatesForEvent finds the real twin’s guest',
        forReal.eligibleFirst.some((c) => c.personId === twins.real.nudgee.person.id)
      );
      const forDemo = await findNudgeCandidatesForEvent(twins.demo.ev.id, now);
      assert(
        'D',
        'D4 and for the sample twin finds nobody and skips nobody (it is never looked at)',
        forDemo.eligibleFirst.length +
          forDemo.eligibleSecond.length +
          forDemo.eligibleMore.length +
          forDemo.skipped.length ===
          0,
        JSON.stringify(forDemo.skipped)
      );
      const decide = await findDecideByFollowupCandidates(now);
      assert(
        'D',
        'D5 CONTROL: findDecideByFollowupCandidates finds the real twin’s maybe',
        decide.eligible.some(
          (c) => c.eventId === twins.real.ev.id && c.personId === twins.real.maybe.person.id
        ),
        JSON.stringify(decide.skipped)
      );
      assert(
        'D',
        'D6 and not the sample twin’s',
        !decide.eligible.some((c) => c.eventId === twins.demo.ev.id)
      );
      const never = await findNeverAttempted(prisma as any, 100000);
      assert(
        'D',
        'D7 CONTROL: findNeverAttempted returns the real twin’s unsent row (read only, nothing drained)',
        never.some((r: any) => r.id === twins.real.never.id)
      );
      assert(
        'D',
        'D8 and not the sample twin’s',
        !never.some((r: any) => r.id === twins.demo.never.id)
      );
      const due = await findDueForRetry(prisma as any, 100000, now);
      assert(
        'D',
        'D9 CONTROL: findDueForRetry returns the real twin’s due row',
        due.some((r: any) => r.id === twins.real.due.id)
      );
      assert(
        'D',
        'D10 and not the sample twin’s',
        !due.some((r: any) => r.id === twins.demo.due.id)
      );
      const rearmedReal = await retryFailedDispatches(twins.real.ev.id);
      assert(
        'D',
        'D11 CONTROL: retryFailedDispatches re-arms the real twin’s failed thank-you',
        rearmedReal === 1,
        `${rearmedReal}`
      );
      const rearmedDemo = await retryFailedDispatches(twins.demo.ev.id);
      const demoLink = await prisma.wrapUpLink.findUnique({ where: { id: twins.demo.link.id } });
      assert(
        'D',
        'D12 and leaves the sample twin’s alone (0 re-armed, still failed and dispatched)',
        rearmedDemo === 0 && demoLink?.failed === true && demoLink?.dispatched === true,
        `${rearmedDemo}, failed ${demoLink?.failed}, dispatched ${demoLink?.dispatched}`
      );
    } finally {
      // At once, not at the end: a re-armed link is an undispatched one.
      await prisma.wrapUpLink.deleteMany({
        where: { id: { in: [twins.real.link.id, twins.demo.link.id] } },
      });
    }

    // ══ E — the copy ═══════════════════════════════════════════════════════════
    section('E — the copy');
    const ip = (n: number) => `2001:db8::${RUN}:${n}`;
    const e1 = await postStart(ip(1), { body: { start: 'copy' } });
    const copy1 = await copyRowsOf(e1.body?.eventId);
    assert(
      'E',
      'E1 an anonymous POST { start: "copy" } answers 200 with a session cookie and a new copy',
      e1.status === 200 && !!e1.token && !!copy1 && copy1.id !== sharedDemo?.id,
      JSON.stringify({ status: e1.status, eventId: e1.body?.eventId, cookie: !!e1.token })
    );
    let rowsOk = false;
    let rowsDetail = '';
    if (copy1) {
      const u = copy1.host.user!;
      const [setup, roles, sessions, persons, teams, days] = await Promise.all([
        prisma.eventSetup.count({ where: { eventId: copy1.id } }),
        prisma.eventRole.findMany({ where: { userId: u.id } }),
        prisma.session.findMany({ where: { userId: u.id } }),
        prisma.person.findMany({ where: { userId: u.id } }),
        prisma.team.count({ where: { eventId: copy1.id } }),
        prisma.day.count({ where: { eventId: copy1.id } }),
      ]);
      const lifeMs = sessions[0] ? sessions[0].expiresAt.getTime() - Date.now() : 0;
      rowsOk =
        /^[0-9a-f]{32}@demo-copy\.invalid$/.test(u.email) &&
        persons.length === 1 &&
        persons[0].id === copy1.hostId &&
        persons[0].name === W13 &&
        persons[0].email === u.email &&
        copy1.name === W12 &&
        copy1.status === 'DRAFT' &&
        copy1.structureMode === 'EDITABLE' &&
        copy1.isLegacy === false &&
        copy1.coHostId === null &&
        copy1.stripePaymentIntentId === null &&
        copy1.paidAt === null &&
        copy1.sentAt === null &&
        copy1.aiCallsUsed === 0 &&
        setup === 1 &&
        roles.length === 1 &&
        roles[0].eventId === copy1.id &&
        roles[0].role === 'HOST' &&
        sessions.length === 1 &&
        sessions[0].token === e1.token &&
        lifeMs > 2 * HOUR - 5 * 60 * 1000 &&
        lifeMs <= 2 * HOUR &&
        teams === 0 &&
        days === 0;
      rowsDetail = JSON.stringify({
        email: u.email,
        persons: persons.length,
        name: copy1.name,
        setup,
        roles: roles.length,
        sessions: sessions.length,
        lifeMin: Math.round(lifeMs / 60000),
        teams,
        days,
      });
    }
    assert(
      'E',
      'E2 its rows, and only these: an account @demo-copy.invalid, host Sam, "Your sample gathering" (sample, DRAFT, editable, no payment, no co-host), its empty setup, one HOST role, one two-hour session; no teams, items or days',
      rowsOk,
      rowsDetail
    );
    assert(
      'E',
      'E3 its date is the Saturday four weeks on from today’s NZ date, stored as a bare day (W14)',
      !!copy1 &&
        copy1.startDate.toISOString() === expectedCopyDay(new Date()) &&
        copy1.endDate.toISOString() === expectedCopyDay(new Date()),
      copy1 ? `${copy1.startDate.toISOString()} vs ${expectedCopyDay(new Date())}` : 'no copy'
    );
    const copyCookie = e1.token ? `session=${e1.token}` : 'session=';
    let reach: any[] = [];
    try {
      const list = await realFetch(`${BASE}/api/events`, { headers: { cookie: copyCookie } });
      reach = ((await list.json().catch(() => null))?.events ?? []) as any[];
    } catch {
      reach = [];
    }
    assert(
      'E',
      'E4 the visitor’s session reaches exactly one event, her copy',
      !!copy1 && reach.length === 1 && reach[0].id === copy1.id && reach[0].isDemo === true,
      JSON.stringify(reach.map((e) => e.id))
    );
    const eHost = await makeHost(`${TAG}-E`, true);
    const eReal = await makeEvent('E real event', eHost.person.id, { isDemo: false });
    await prisma.eventRole.create({
      data: { userId: eHost.user!.id, eventId: eReal.id, role: 'HOST' },
    });
    const eHostCookie = await makeSession(eHost.user!.id);
    let crossStatus = -1;
    let crossControl = -1;
    try {
      crossStatus = (
        await realFetch(`${BASE}/api/events/${eReal.id}`, { headers: { cookie: copyCookie } })
      ).status;
      crossControl = (
        await realFetch(`${BASE}/api/events/${eReal.id}`, { headers: { cookie: eHostCookie } })
      ).status;
    } catch {
      /* recorded as -1 */
    }
    assert(
      'E',
      'E5 and is refused on a real event (401/403), where the real host’s own session gets 200',
      !!copy1 && (crossStatus === 401 || crossStatus === 403) && crossControl === 200,
      `copy ${crossStatus}, host ${crossControl}`
    );
    const sessionsBeforeClobber = await prisma.session.count();
    const clobber = await postStart(ip(2), {
      body: { start: 'copy' },
      cookie: `session=${TAG}-present`,
    });
    assert(
      'E',
      'E6 CONTROL: a session cookie already present answers 409 and makes no session (presence first, as GTC-269)',
      clobber.status === 409 && (await prisma.session.count()) === sessionsBeforeClobber,
      JSON.stringify({ status: clobber.status })
    );
    const old = await postStart(ip(3));
    assert(
      'E',
      'E7 CONTROL: no body still takes today’s path, the shared sample (part D retires it)',
      old.status === 200 && !!sharedDemo && old.body?.eventId === sharedDemo.id,
      JSON.stringify({ status: old.status, eventId: old.body?.eventId })
    );
    const four: Array<Awaited<ReturnType<typeof postStart>>> = [];
    for (let i = 0; i < 4; i++) four.push(await postStart(ip(4), { body: { start: 'copy' } }));
    const fourCopies = [];
    for (const r of four.slice(0, 3)) fourCopies.push(await copyRowsOf(r.body?.eventId));
    assert(
      'E',
      'E8 the fourth copy in an hour from one address answers 429 in W7’s words, after three copies',
      fourCopies.every((c) => !!c) && four[3].status === 429 && four[3].body?.error === W7,
      JSON.stringify(four.map((r) => r.status))
    );
    const fourth = await copyRowsOf(four[3].body?.eventId);
    if (fourth) fx.events.add(fourth.id);

    // In process, clock and limits injected. Copies started by this run, counted by hand: E1 + E8's three.
    const mine = 1 + 3;
    const lim = (over: Record<string, number>) => ({
      limits: { perVisitorHour: 3, allHour: 1000, allDay: 1000, ...over },
      aiLimits: { perCopy: 3, perDay: 1000 },
    });
    const check = async (visitor: string, at: Date, opts: any) =>
      LIM?.checkStartLimit
        ? await LIM.checkStartLimit(prisma, visitor, { now: at, ...opts }).catch((e: unknown) => ({
            threw: String(e),
          }))
        : null;
    const hourOff = await check(`${TAG}-v1`, new Date(), lim({ allHour: mine }));
    const hourOn = await check(`${TAG}-v1`, new Date(), lim({ allHour: mine + 1 }));
    assert(
      'E',
      'E9 the hour’s ceiling for everyone refuses at its number with W8a, and lets one under it through',
      hourOff?.ok === false && hourOff?.words === W8A && hourOn?.ok === true,
      JSON.stringify({ hourOff, hourOn })
    );
    const later = await check(
      `${TAG}-v1`,
      new Date(Date.now() + 61 * 60 * 1000),
      lim({ allHour: 1 })
    );
    assert(
      'E',
      'E10 an hour on, the same copies no longer count to the hour',
      later?.ok === true,
      JSON.stringify(later)
    );
    const dayOff = await check(`${TAG}-v1`, new Date(), lim({ allDay: mine }));
    assert(
      'E',
      'E11 the day’s ceiling for everyone refuses at its number with W8b',
      dayOff?.ok === false && dayOff?.words === W8B,
      JSON.stringify(dayOff)
    );
    const aiFull = LIM?.checkStartLimit
      ? await LIM.checkStartLimit(prisma, `${TAG}-v1`, {
          now: new Date(),
          limits: { perVisitorHour: 3, allHour: 1000, allDay: 1000 },
          aiLimits: { perCopy: 3, perDay: 0 },
        }).catch((e: unknown) => ({ threw: String(e) }))
      : null;
    assert(
      'E',
      'E12 when the day’s AI total is reached, nobody starts a copy (W8b, Q7)',
      aiFull?.ok === false && aiFull?.words === W8B,
      JSON.stringify(aiFull)
    );
    const t0 = Date.UTC(2026, 9, 18, 3, 0, 0);
    const visitorOk = ok(() => {
      const v = `${TAG}-v2`;
      for (const dt of [0, 10, 20]) LIM.noteStart(v, t0 + dt * 60 * 1000);
      return true;
    });
    const v2a = visitorOk ? await check(`${TAG}-v2`, new Date(t0 + 30 * 60 * 1000), lim({})) : null;
    const v2b = visitorOk ? await check(`${TAG}-v2`, new Date(t0 + 60 * 60 * 1000), lim({})) : null;
    assert(
      'E',
      'E13 one visitor: three starts in an hour, the fourth refused with W7; an hour after the first, one may start again',
      v2a?.ok === false && v2a?.words === W7 && v2b?.ok === true,
      JSON.stringify({ v2a, v2b })
    );
    assert(
      'E',
      'E14 the visitor is the first address in x-forwarded-for, then x-real-ip',
      ok(
        () =>
          LIM.visitorOf(new Headers({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1' })) ===
            '203.0.113.7' &&
          LIM.visitorOf(new Headers({ 'x-real-ip': '198.51.100.9' })) === '198.51.100.9'
      )
    );
    assert(
      'E',
      'E15 the ruled numbers (Q6): 3 per visitor an hour, 30 an hour and 150 a day for all; 3 plans a copy, 100 a day',
      LIM?.DEMO_START_LIMITS?.perVisitorHour === 3 &&
        LIM?.DEMO_START_LIMITS?.allHour === 30 &&
        LIM?.DEMO_START_LIMITS?.allDay === 150 &&
        CAP?.DEMO_AI_LIMITS?.perCopy === 3 &&
        CAP?.DEMO_AI_LIMITS?.perDay === 100 &&
        COPY?.DEMO_SESSION_HOURS === 2
    );
    const usersBefore = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    const eventsBeforeFail = await prisma.event.count();
    const personsBeforeFail = await prisma.person.count();
    let failedCopy = 'did not throw';
    if (COPY?.startDemoCopy) {
      // A client whose transaction fails at its last write: the session.
      const breaking: any = new Proxy(prisma, {
        get(target: any, prop) {
          if (prop !== '$transaction') return target[prop];
          return (fn: any, o?: any) =>
            target.$transaction(
              (tx: any) =>
                fn(
                  new Proxy(tx, {
                    get(t: any, p) {
                      if (p !== 'session') return t[p];
                      return {
                        ...t.session,
                        create: () => Promise.reject(new Error(`${TAG} forced failure`)),
                      };
                    },
                  })
                ),
              o
            );
        },
      });
      failedCopy = await COPY.startDemoCopy(breaking, { now: new Date() }).then(
        () => 'did not throw',
        (e: Error) => e.message
      );
    }
    const usersAfterFail = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'E',
      'E16 a failure part-way through starting a copy writes nothing (one transaction)',
      failedCopy.includes('forced failure') &&
        usersAfterFail === usersBefore &&
        (await prisma.event.count()) === eventsBeforeFail &&
        (await prisma.person.count()) === personsBeforeFail,
      `${failedCopy}; copy accounts ${usersBefore} -> ${usersAfterFail}`
    );
    assert(
      'E',
      'E17 the copy’s date, by hand: Sun 18 Oct -> Sat 21 Nov; Sat 24 Oct 23:59:59.999 NZ -> 21 Nov; Sun 25 Oct 00:00 NZ -> 28 Nov',
      ok(
        () =>
          COPY.demoCopyDay(new Date('2026-10-18T03:00:00.000Z')).toISOString() ===
            '2026-11-21T00:00:00.000Z' &&
          COPY.demoCopyDay(new Date('2026-10-24T10:59:59.999Z')).toISOString() ===
            '2026-11-21T00:00:00.000Z' &&
          COPY.demoCopyDay(new Date('2026-10-24T11:00:00.000Z')).toISOString() ===
            '2026-11-28T00:00:00.000Z'
      )
    );
    // Q4: a typed guest who matches a real guest by address and first name.
    const katePerson = await prisma.person.create({
      data: { name: `Kate ${TAG}`, email: addr('kate') },
    });
    fx.persons.add(katePerson.id);
    await prisma.personEvent.create({
      data: { personId: katePerson.id, eventId: eReal.id, role: 'PARTICIPANT' },
    });
    let onCopy: any = null;
    if (copy1) {
      onCopy = await findOrCreateCapturedPerson(prisma, {
        eventId: copy1.id,
        hostPersonId: copy1.hostId,
        name: 'Kate',
        email: addr('kate'),
        phoneNumber: null,
        sentAt: null,
      }).catch(() => null);
      if (onCopy) fx.persons.add(onCopy.id);
    }
    assert(
      'E',
      'E18 on a copy, a typed address and first name that match a real guest make a NEW person (Q4)',
      !!onCopy && onCopy.id !== katePerson.id && onCopy.name === 'Kate',
      JSON.stringify({ id: onCopy?.id, kate: katePerson.id })
    );
    const eReal2 = await makeEvent('E second real event', eHost.person.id, { isDemo: false });
    const onReal = await findOrCreateCapturedPerson(prisma, {
      eventId: eReal2.id,
      hostPersonId: eHost.person.id,
      name: 'Kate',
      email: addr('kate'),
      phoneNumber: null,
      sentAt: null,
    }).catch(() => null);
    if (onReal && onReal.id !== katePerson.id) fx.persons.add(onReal.id);
    assert(
      'E',
      'E19 CONTROL: on a real event the same typed values still find the real guest (GTC-293 Q2)',
      onReal?.id === katePerson.id
    );

    // ══ F — the AI cap ═════════════════════════════════════════════════════════
    section('F — the AI cap');
    const take = async (eventId: string, opts?: any) =>
      CAP?.takeDemoAiCall
        ? await CAP.takeDemoAiCall(prisma, eventId, opts).catch((e: unknown) => ({
            threw: String(e),
          }))
        : null;
    const realTake = await take(eReal.id);
    const eRealAfter = await prisma.event.findUnique({ where: { id: eReal.id } });
    assert(
      'F',
      'F1 a real event reads "not a demo": allowed, not counted, its own count untouched',
      realTake?.ok === true && realTake?.counted === false && eRealAfter?.aiCallsUsed === 0,
      JSON.stringify(realTake)
    );
    let f2 = false;
    let f2detail = '';
    if (copy1 && CAP?.takeDemoAiCall) {
      const r = [];
      for (let i = 0; i < 4; i++) r.push(await take(copy1.id));
      const used = (await prisma.event.findUnique({ where: { id: copy1.id } }))?.aiCallsUsed;
      f2 =
        r.slice(0, 3).every((x: any) => x?.ok === true && x?.counted === true) &&
        r[3]?.ok === false &&
        r[3]?.words === W5 &&
        used === 3;
      f2detail = JSON.stringify({ r, used });
    }
    assert(
      'F',
      'F2 a copy takes three plans, each counted before it is made, and is refused the fourth in W5’s words',
      f2,
      f2detail
    );
    let f3 = false;
    let f3detail = '';
    if (fourCopies[0] && CAP?.takeDemoAiCall) {
      await prisma.event.update({ where: { id: fourCopies[0].id }, data: { aiCallsUsed: 1 } });
      const r = await Promise.all([0, 1, 2, 3, 4].map(() => take(fourCopies[0]!.id)));
      const used = (await prisma.event.findUnique({ where: { id: fourCopies[0].id } }))
        ?.aiCallsUsed;
      f3 =
        r.filter((x: any) => x?.ok === true).length === 2 &&
        r.filter((x: any) => x?.ok === false && x?.words === W5).length === 3 &&
        used === 3;
      f3detail = JSON.stringify({ r, used });
    }
    assert('F', 'F3 five presses at once take exactly the two left, never more', f3, f3detail);
    let f4 = false;
    let f4detail = '';
    if (fourCopies[1] && CAP?.takeDemoAiCall) {
      // Today's total by hand: copy1 3 + fourCopies[0] 3 = 6.
      const r = await take(fourCopies[1].id, { limits: { perCopy: 3, perDay: 6 } });
      const used = (await prisma.event.findUnique({ where: { id: fourCopies[1].id } }))
        ?.aiCallsUsed;
      f4 = r?.ok === false && r?.words === W6 && used === 0;
      f4detail = JSON.stringify({ r, used });
    }
    assert(
      'F',
      'F4 once the day’s total is reached, a copy with plans left is refused in W6’s words, uncounted',
      f4,
      f4detail
    );
    // The cap comes before every AI call in the route, and before any costly step named here.
    const AI_ROUTES: Array<[string, string[]]> = [
      ['src/app/api/events/[id]/finalize-plan/route.ts', []],
      ['src/app/api/events/[id]/regenerate-plan/route.ts', ['createRevision(']],
      ['src/app/api/events/[id]/generate/route.ts', []],
      ['src/app/api/events/[id]/regenerate/route.ts', ['createRevision(']],
      ['src/app/api/events/[id]/regenerate/preview/route.ts', []],
      ['src/app/api/events/[id]/conflicts/[conflictId]/suggest-resolution/route.ts', []],
    ];
    for (const [rel, alsoBefore] of AI_ROUTES) {
      assert(
        'F',
        `F ${rel.replace('src/app/api/events/[id]/', '')}: asks the cap before its first costly step, refuses 429 with demoWords, and skips its own count on a copy`,
        CHECKS.aiRoute(code(rel), alsoBefore)
      );
    }
    const aiImporters = srcFiles
      .filter((f) => f.rel.startsWith('src/app/'))
      .filter((f) => /from '@\/lib\/ai\/(claude|generate)'/.test(f.code))
      .map((f) => f.rel)
      .sort();
    assert(
      'F',
      'F CONTROL: exactly six routes reach the AI (claude.ts or generate.ts), the six above',
      JSON.stringify(aiImporters) === JSON.stringify(AI_ROUTES.map((r) => r[0]).sort()),
      JSON.stringify(aiImporters)
    );
    const setupSrc = code('src/app/plan/[eventId]/setup/page.tsx');
    assert(
      'F',
      'F the setup page’s two 429 handlers show the copy’s words when sent, and keep today’s toast as the other branch',
      CHECKS.setupToasts(setupSrc)
    );

    // ══ W — the words ══════════════════════════════════════════════════════════
    section('W — the words, byte for byte');
    const PW = await load('../src/lib/press/press-words');
    const RDW = await load('../src/lib/press/resend-door');
    const TE = await load('../src/lib/preflight/test-email');
    assert(
      'W',
      'W1 the banner, in DemoBanner.tsx, rendering nothing unless the event is a sample',
      read('src/components/demo/DemoBanner.tsx').includes(W1) &&
        /isDemo/.test(code('src/components/demo/DemoBanner.tsx'))
    );
    assert('W', 'W2 the press’s refusal', PW?.PRESS_REFUSAL_WORDS?.DEMO_EVENT === W2);
    assert(
      'W',
      'W3 the wall’s words, and the resend door’s copy of them (its module keeps type-only imports)',
      SW?.DEMO_SEND_WORDS === W3 && RDW?.RESEND_REFUSAL_WORDS?.DEMO_EVENT === W3
    );
    assert(
      'W',
      'W4 the test email on a sample',
      ok(() => TE.testEmailOutcomeLine('DEMO', 'x@example.com') === W4)
    );
    assert(
      'W',
      'W5, W6 the AI cap',
      CAP?.DEMO_AI_WORDS?.COPY_USED_UP === W5 && CAP?.DEMO_AI_WORDS?.DAY_USED_UP === W6
    );
    assert(
      'W',
      'W7 to W11, W15 starting a copy',
      LIM?.DEMO_START_WORDS?.OWN_LIMIT === W7 &&
        LIM?.DEMO_START_WORDS?.BUSY === W8A &&
        LIM?.DEMO_START_WORDS?.FULL === W8B &&
        LIM?.DEMO_START_WORDS?.SIGNED_IN === W9 &&
        LIM?.DEMO_START_WORDS?.ALREADY_OPEN === W10 &&
        LIM?.DEMO_START_WORDS?.GO_TO_IT === W10_LINK &&
        LIM?.DEMO_START_WORDS?.BUTTON === W11 &&
        LIM?.DEMO_START_WORDS?.FAILED === W15
    );
    assert(
      'W',
      'W12, W13 the copy’s name and host',
      COPY?.DEMO_COPY_NAME === W12 && COPY?.DEMO_HOST_NAME === W13
    );
    assert(
      'W',
      'W the stop words (log and result only): "Not sent: this is a sample event"',
      SW?.DEMO_STOP_WORDS === STOP
    );
    assert(
      'W',
      'W11 on /demo only in development (Q5); a 409 asks GET /api/events for her sample (W10) or says W9',
      CHECKS.demoPage(code('src/app/demo/page.tsx'))
    );
    assert(
      'W',
      'the banner is on the setup page and the pre-flight page',
      CHECKS.banner(setupSrc) && CHECKS.banner(code('src/app/plan/[eventId]/pre-flight/page.tsx'))
    );
  } finally {
    await teardown(sharedUser?.id ?? null, sharedRolesBefore);
  }

  // ══ G — teardown ═══════════════════════════════════════════════════════════
  section('G — teardown');
  const events = [...fx.events];
  const [evLeft, pLeft, uLeft] = await Promise.all([
    prisma.event.count({ where: { id: { in: events } } }),
    prisma.person.count({ where: { id: { in: [...fx.persons] } } }),
    prisma.user.count({ where: { id: { in: [...fx.users] } } }),
  ]);
  assert(
    'G',
    'G1 every fixture is gone, by id (events, people, accounts, sessions)',
    evLeft === 0 &&
      pLeft === 0 &&
      uLeft === 0 &&
      (await prisma.session.count({ where: { token: { in: [...fx.sessionTokens] } } })) === 0,
    `events ${evLeft}, people ${pLeft}, accounts ${uLeft}`
  );
  const after = await totals();
  assert(
    'G',
    'G2 every total is as found',
    JSON.stringify(after) === JSON.stringify(found),
    `${JSON.stringify(found)}\n    ${JSON.stringify(after)}`
  );
  assert(
    'G',
    'G3 no copy account and no extra sample event is left (security suite 11 counts sample events)',
    (await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } })) === 0 &&
      (await prisma.event.count({ where: { isDemo: true } })) === isDemoBefore
  );
  const hits = trapHits();
  assert(
    'G',
    'G4 nothing left the process: every request the run made was answered by the trap’s fake fetch, and there were some',
    hits.length > 0 && hits.every((h) => h.via === 'fetch'),
    JSON.stringify(hits.filter((h) => h.via !== 'fetch'))
  );
}

if (require.main === module)
  main()
    .catch((e) => {
      assert('FATAL', `the suite threw: ${e?.stack ?? e}`, false);
    })
    .finally(async () => {
      await prisma.$disconnect();
      console.log(`\n${passed} passed, ${failed} failed`);
      if (failed > 0) {
        console.log('\nRED:');
        for (const r of reds) console.log(`  ✗ ${r}`);
        process.exit(1);
      }
      console.log(
        '\x1b[32mGREEN — a sample event never sends, and a copy is private and capped.\x1b[0m'
      );
      process.exit(0);
    });
