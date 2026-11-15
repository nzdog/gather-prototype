/**
 * [[GTC-463]] — a claim keeps no device id, and the host's browser gets each log row's type and
 * time only.
 *
 * Founder rulings, 15 Nov 2026 (docs/tickets/GTC-463.md): "Stop making it" — a claim on the
 * shared link stores nothing in AccessToken.claimedBy and puts no deviceId in its NAME_CLAIMED
 * row. "Yes: send only the event type and time" — invite-detail sends each log row's type and
 * createdAt, nothing else. reset-claim stops reading and logging previousClaimBy (Q2).
 * invite-status, a frozen Zone 7 reader, is left alone and so sends claimedBy as null (Q1).
 *
 * LAYERS
 *   S  the three routes' code, comments removed
 *   P  in this process, no server: the claim route answers a stub request in full
 *   H  a claim over HTTP, with a made-up browser text and a made-up address
 *   T  invite-status, as the host
 *   D  invite-detail, as the host, on four hand-made log rows
 *   R  reset-claim, as the host
 *   K  every table's total, as found at the start
 *
 * SAFETY. Its own fixture only: one host (user, session, role), one CONFIRMING event that is
 * never sent (so no claim becomes a mini-send), three guests, two tokens and the log rows. All of
 * it is deleted by id in `finally`. No provider, no message. HTTP goes to the dev server only.
 *
 * Run: npx tsx tests/no-device-id-test.ts (needs the dev server on NO_DEVICE_ID_BASE_URL,
 * default http://localhost:3000). A dry run of CHECKS on hand-made inputs, with nothing else
 * loaded: NO_DEVICE_ID_DRY_RUN=1 npx tsx tests/no-device-id-test.ts
 */
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.NO_DEVICE_ID_BASE_URL ?? 'http://localhost:3000';
const CLAIM = 'src/app/api/join/[token]/claim/route.ts';
const RESET = 'src/app/api/events/[id]/people/[personId]/reset-claim/route.ts';
const DETAIL = 'src/app/api/events/[id]/people/[personId]/invite-detail/route.ts';
/** The keys invite-detail answers with, written out by hand from the route at 2e31953. */
const DETAIL_KEYS = [
  'id',
  'name',
  'email',
  'phoneNumber',
  'status',
  'response',
  'inviteAnchorAt',
  'openedAt',
  'claimedAt',
  'respondedAt',
  'hasPhone',
  'smsOptedOut',
  'canReceiveSms',
  'firstNudgeSentAt',
  'secondNudgeSentAt',
  'lastHostNudgeAt',
  'firstNudgeFailed',
  'secondNudgeFailed',
  'lastHostNudgeFailed',
  'eventName',
  'eventDate',
  'assignments',
  'inviteEvents',
];
/** The tables K counts: every one this suite or the routes it calls could write. */
const TABLES = [
  'event',
  'person',
  'personEvent',
  'accessToken',
  'inviteEvent',
  'user',
  'session',
  'eventRole',
  'outboundMessage',
  'auditEntry',
] as const;

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

type Answer = { kind: 'answered'; status: number; body: any } | { kind: 'threw'; message: string };
const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

// ── CHECKS: every condition, pure, so each can be tried on a passing and a failing input ─────
export const CHECKS = {
  /** Code with block and line comments removed (a `://` in a URL is kept). */
  stripComments(src: string): string {
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  },
  /** S1: no call to headers() and nothing imported from next/headers. */
  readsNoHeaders(code: string): boolean {
    return code.length > 0 && !/\bheaders\s*\(/.test(code) && !/next\/headers/.test(code);
  },
  /** S2: no device id made, and neither browser header named. */
  makesNoDeviceId(code: string): boolean {
    return (
      code.length > 0 &&
      !/deviceId/i.test(code) &&
      !/user-agent/i.test(code) &&
      !/x-forwarded-for/i.test(code)
    );
  },
  /** S3: the column is not named at all (not read, not written). */
  namesNoClaimedBy(code: string): boolean {
    return code.length > 0 && !/\bclaimedBy\b/.test(code);
  },
  /** S4: reset-claim neither logs previousClaimBy nor reads claimedBy. */
  resetLogsNoPrevious(code: string): boolean {
    return code.length > 0 && !/previousClaimBy/.test(code) && !/claimedBy:\s*true/.test(code);
  },
  /** S5: the log rows are read as type and createdAt only, and metadata is named nowhere. */
  detailSendsTypeAndTime(code: string): boolean {
    return (
      /inviteEvents:\s*\{[\s\S]*?select:\s*\{\s*type:\s*true,\s*createdAt:\s*true,?\s*\}/.test(
        code
      ) && !/\bmetadata\b/.test(code)
    );
  },
  /** S6 CONTROL: both refusals come before the claim's writes, and the writes are all there. */
  claimStillClaims(code: string): boolean {
    const tx = code.indexOf('$transaction');
    const host = code.indexOf('isHostMembership(');
    const member = code.indexOf('isClaimableMembership(');
    return (
      tx > 0 &&
      host > 0 &&
      member > 0 &&
      host < tx &&
      member < tx &&
      /claimedAt:\s*now/.test(code) &&
      /reachabilityTier:\s*'SHARED'/.test(code) &&
      /type:\s*'NAME_CLAIMED'/.test(code)
    );
  },
  /** P1, H1: a full claim's answer, carrying the guest's own token. */
  claimAnswered(r: Answer, token: string): boolean {
    return (
      r.kind === 'answered' &&
      r.status === 200 &&
      r.body?.success === true &&
      token.length > 0 &&
      r.body?.participantToken === token
    );
  },
  /** P2, H2: the token is claimed, and claimedBy is empty. */
  claimedWithNoDeviceId(row: { claimedAt: Date | null; claimedBy: string | null } | null): boolean {
    return !!row && row.claimedAt !== null && row.claimedBy === null;
  },
  /** H3: a log row's metadata carries no deviceId. */
  metaHasNoDeviceId(meta: unknown): boolean {
    return isObject(meta) && !('deviceId' in meta);
  },
  /** H4: a NAME_CLAIMED row still carries the shared-link token and the name. */
  metaKeeps(meta: unknown, token: string, name: string): boolean {
    return isObject(meta) && meta.sharedLinkToken === token && meta.personName === name;
  },
  /** H5, D3: the text holds none of the markers (and there is text to look in). */
  holdsNone(text: string, markers: string[]): boolean {
    return (
      text.length > 0 &&
      markers.length > 0 &&
      markers.every((m) => m.length > 0 && !text.includes(m))
    );
  },
  /** D2: every row is exactly { type, createdAt }. */
  rowsAreTypeAndTime(rows: unknown): boolean {
    return (
      Array.isArray(rows) &&
      rows.length > 0 &&
      rows.every((r) => isObject(r) && Object.keys(r).sort().join(',') === 'createdAt,type')
    );
  },
  /** D4: an object's keys are exactly these. */
  sameKeys(obj: unknown, keys: string[]): boolean {
    return isObject(obj) && Object.keys(obj).sort().join(',') === [...keys].sort().join(',');
  },
  /** R2: a CLAIM_RESET row's metadata carries no previousClaimBy. */
  metaHasNoPrevious(meta: unknown): boolean {
    return isObject(meta) && !('previousClaimBy' in meta);
  },
  /** K1: the same tables with the same totals. */
  sameTotals(a: Record<string, number>, b: Record<string, number>): boolean {
    const ka = Object.keys(a).sort().join(',');
    return (
      ka.length > 0 &&
      ka === Object.keys(b).sort().join(',') &&
      Object.keys(a).every((k) => a[k] === b[k])
    );
  },
};

const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const code = (rel: string) => CHECKS.stripComments(read(rel));

// ── The dry run: each check on a passing and a failing input, nothing else loaded ──────────
function dryRun() {
  let wrong = 0;
  const want = (name: string, input: string, got: boolean, expected: boolean) => {
    const ok = got === expected;
    if (!ok) wrong++;
    console.log(
      `${ok ? 'ok  ' : 'BAD '} ${name.padEnd(24)} ${input.padEnd(44)} -> ${got} (want ${expected})`
    );
  };
  const headClaim = code(CLAIM);
  const headReset = code(RESET);
  const headDetail = code(DETAIL);
  const strip = CHECKS.stripComments(
    "/* deviceId */ const a = 'http://x'; // claimedBy\nconst b = 2;"
  );
  want(
    'stripComments',
    'comments gone, URL kept',
    !/deviceId|claimedBy/.test(strip) && strip.includes("'http://x'"),
    true
  );
  want(
    'readsNoHeaders',
    'hand-made: request.json() only',
    CHECKS.readsNoHeaders('const b = await request.json();'),
    true
  );
  want(
    'readsNoHeaders',
    'hand-made: await headers()',
    CHECKS.readsNoHeaders('const h = await headers();'),
    false
  );
  want(
    'readsNoHeaders',
    "hand-made: import from 'next/headers'",
    CHECKS.readsNoHeaders("import { x } from 'next/headers';"),
    false
  );
  want('readsNoHeaders', 'the claim route on disk', CHECKS.readsNoHeaders(headClaim), false);
  want(
    'makesNoDeviceId',
    'hand-made: claimedAt: now only',
    CHECKS.makesNoDeviceId('data: { claimedAt: now }'),
    true
  );
  want(
    'makesNoDeviceId',
    'hand-made: generateDeviceId(ua, ip)',
    CHECKS.makesNoDeviceId('const d = generateDeviceId(ua, ip);'),
    false
  );
  want(
    'makesNoDeviceId',
    "hand-made: get('user-agent')",
    CHECKS.makesNoDeviceId("h.get('user-agent')"),
    false
  );
  want(
    'makesNoDeviceId',
    "hand-made: get('x-forwarded-for')",
    CHECKS.makesNoDeviceId("h.get('x-forwarded-for')"),
    false
  );
  want('makesNoDeviceId', 'the claim route on disk', CHECKS.makesNoDeviceId(headClaim), false);
  want(
    'namesNoClaimedBy',
    'hand-made: claimedAt: now',
    CHECKS.namesNoClaimedBy('claimedAt: now,'),
    true
  );
  want(
    'namesNoClaimedBy',
    'hand-made: claimedBy: deviceId',
    CHECKS.namesNoClaimedBy('claimedBy: deviceId,'),
    false
  );
  want('namesNoClaimedBy', 'the claim route on disk', CHECKS.namesNoClaimedBy(headClaim), false);
  want(
    'resetLogsNoPrevious',
    'hand-made: empties claimedBy, logs name',
    CHECKS.resetLogsNoPrevious(
      'select: { id: true, claimedAt: true }; data: { claimedAt: null, claimedBy: null }; metadata: { personName }'
    ),
    true
  );
  want(
    'resetLogsNoPrevious',
    'hand-made: select claimedBy: true',
    CHECKS.resetLogsNoPrevious('select: { claimedBy: true }'),
    false
  );
  want(
    'resetLogsNoPrevious',
    'hand-made: logs previousClaimBy',
    CHECKS.resetLogsNoPrevious('metadata: { previousClaimBy, personName }'),
    false
  );
  want('resetLogsNoPrevious', 'reset-claim on disk', CHECKS.resetLogsNoPrevious(headReset), false);
  want(
    'detailSendsTypeAndTime',
    'hand-made: select type, createdAt',
    CHECKS.detailSendsTypeAndTime(
      'inviteEvents: {\n where: { eventId },\n take: 20,\n select: {\n type: true,\n createdAt: true,\n },\n },'
    ),
    true
  );
  want(
    'detailSendsTypeAndTime',
    'hand-made: select with metadata',
    CHECKS.detailSendsTypeAndTime(
      'inviteEvents: { select: { type: true, createdAt: true, metadata: true } }'
    ),
    false
  );
  want(
    'detailSendsTypeAndTime',
    'hand-made: right select, metadata mapped',
    CHECKS.detailSendsTypeAndTime(
      'inviteEvents: { select: { type: true, createdAt: true } } ... metadata: e.metadata'
    ),
    false
  );
  want(
    'detailSendsTypeAndTime',
    'invite-detail on disk',
    CHECKS.detailSendsTypeAndTime(headDetail),
    false
  );
  want('claimStillClaims', 'the claim route on disk', CHECKS.claimStillClaims(headClaim), true);
  want(
    'claimStillClaims',
    'on disk, membership refusal removed',
    CHECKS.claimStillClaims(headClaim.split('isClaimableMembership(').join('isOther(')),
    false
  );
  want(
    'claimStillClaims',
    'on disk, SHARED write removed',
    CHECKS.claimStillClaims(headClaim.replace("reachabilityTier: 'SHARED'", '')),
    false
  );
  want(
    'claimAnswered',
    'answered 200, success, own token',
    CHECKS.claimAnswered(
      { kind: 'answered', status: 200, body: { success: true, participantToken: 't1' } },
      't1'
    ),
    true
  );
  want(
    'claimAnswered',
    'answered 200, another token',
    CHECKS.claimAnswered(
      { kind: 'answered', status: 200, body: { success: true, participantToken: 't2' } },
      't1'
    ),
    false
  );
  want(
    'claimAnswered',
    'answered 404',
    CHECKS.claimAnswered({ kind: 'answered', status: 404, body: { error: 'x' } }, 't1'),
    false
  );
  want(
    'claimAnswered',
    'threw (headers outside a request)',
    CHECKS.claimAnswered({ kind: 'threw', message: 'outside a request scope' }, 't1'),
    false
  );
  const d = new Date();
  want(
    'claimedWithNoDeviceId',
    'claimed, claimedBy null',
    CHECKS.claimedWithNoDeviceId({ claimedAt: d, claimedBy: null }),
    true
  );
  want(
    'claimedWithNoDeviceId',
    'claimed, claimedBy device_x',
    CHECKS.claimedWithNoDeviceId({ claimedAt: d, claimedBy: 'device_x' }),
    false
  );
  want(
    'claimedWithNoDeviceId',
    'not claimed at all',
    CHECKS.claimedWithNoDeviceId({ claimedAt: null, claimedBy: null }),
    false
  );
  want('claimedWithNoDeviceId', 'no row', CHECKS.claimedWithNoDeviceId(null), false);
  want(
    'metaHasNoDeviceId',
    'token and name only',
    CHECKS.metaHasNoDeviceId({ sharedLinkToken: 's', personName: 'n' }),
    true
  );
  want(
    'metaHasNoDeviceId',
    'with deviceId',
    CHECKS.metaHasNoDeviceId({ deviceId: 'd', sharedLinkToken: 's' }),
    false
  );
  want('metaHasNoDeviceId', 'no metadata', CHECKS.metaHasNoDeviceId(null), false);
  want(
    'metaKeeps',
    'token and name match',
    CHECKS.metaKeeps({ sharedLinkToken: 's', personName: 'n' }, 's', 'n'),
    true
  );
  want('metaKeeps', 'token missing', CHECKS.metaKeeps({ personName: 'n' }, 's', 'n'), false);
  want('holdsNone', 'text without the marker', CHECKS.holdsNone('{"a":1}', ['zz9']), true);
  want('holdsNone', 'text with the marker', CHECKS.holdsNone('{"a":"x zz9 y"}', ['zz9']), false);
  want('holdsNone', 'no text at all', CHECKS.holdsNone('', ['zz9']), false);
  want(
    'rowsAreTypeAndTime',
    'rows of type and createdAt',
    CHECKS.rowsAreTypeAndTime([
      { type: 'A', createdAt: 't' },
      { createdAt: 't', type: 'B' },
    ]),
    true
  );
  want(
    'rowsAreTypeAndTime',
    'a row with metadata',
    CHECKS.rowsAreTypeAndTime([{ type: 'A', createdAt: 't', metadata: {} }]),
    false
  );
  want('rowsAreTypeAndTime', 'no rows', CHECKS.rowsAreTypeAndTime([]), false);
  want('sameKeys', 'the same keys, other order', CHECKS.sameKeys({ b: 1, a: 2 }, ['a', 'b']), true);
  want('sameKeys', 'one key more', CHECKS.sameKeys({ a: 1, b: 2, c: 3 }, ['a', 'b']), false);
  want('metaHasNoPrevious', 'personName only', CHECKS.metaHasNoPrevious({ personName: 'n' }), true);
  want(
    'metaHasNoPrevious',
    'with previousClaimBy null',
    CHECKS.metaHasNoPrevious({ previousClaimBy: null, personName: 'n' }),
    false
  );
  want('sameTotals', 'equal totals', CHECKS.sameTotals({ a: 1, b: 2 }, { b: 2, a: 1 }), true);
  want('sameTotals', 'one total moved', CHECKS.sameTotals({ a: 1, b: 2 }, { a: 1, b: 3 }), false);
  console.log(
    `\nDRY RUN: ${wrong === 0 ? 'every check came out as wanted' : `${wrong} came out wrong`}`
  );
  process.exit(wrong === 0 ? 0 : 1);
}

// ── HTTP, to the dev server only ─────────────────────────────────────────────
async function http(
  method: string,
  p: string,
  opts: { cookie?: string; body?: unknown; headers?: Record<string, string> } = {}
): Promise<{ status: number; text: string; json: any; error: string }> {
  try {
    const res = await fetch(`${BASE_URL}${p}`, {
      method,
      headers: {
        ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(opts.cookie ? { cookie: opts.cookie } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    return { status: res.status, text, json, error: '' };
  } catch (err) {
    return { status: 0, text: '', json: null, error: String((err as Error).message) };
  }
}

async function main() {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const totals = async () => {
    const out: Record<string, number> = {};
    for (const t of TABLES) out[t] = await (prisma as any)[t].count();
    return out;
  };
  // K's "before" is taken first, before any layer writes anything.
  const before = await totals();

  const stamp = Date.now();
  const tag = stamp.toString(36);
  const created = { users: [] as string[], people: [] as string[], events: [] as string[] };

  try {
    // ══ S — the three routes' code ══════════════════════════════════════════
    section('S — the code of the claim, reset-claim and invite-detail routes (comments removed)');
    const claimCode = code(CLAIM);
    const resetCode = code(RESET);
    const detailCode = code(DETAIL);
    assert(
      'S',
      'S1 the claim route calls no headers() and imports nothing from next/headers',
      CHECKS.readsNoHeaders(claimCode)
    );
    assert(
      'S',
      'S2 the claim route makes no device id and names neither user-agent nor x-forwarded-for',
      CHECKS.makesNoDeviceId(claimCode)
    );
    assert(
      'S',
      'S3 the claim route does not name claimedBy: it neither reads nor writes it',
      CHECKS.namesNoClaimedBy(claimCode)
    );
    assert(
      'S',
      'S4 reset-claim does not log previousClaimBy and does not read claimedBy',
      CHECKS.resetLogsNoPrevious(resetCode)
    );
    assert(
      'S',
      'S5 invite-detail reads each log row as type and createdAt only, and names metadata nowhere',
      CHECKS.detailSendsTypeAndTime(detailCode)
    );
    assert(
      'S',
      'S6 CONTROL: the claim route still runs both refusals before its writes, and still writes claimedAt, SHARED and NAME_CLAIMED',
      CHECKS.claimStillClaims(claimCode)
    );

    // ══ The fixture ═════════════════════════════════════════════════════════
    const user = await prisma.user.create({ data: { email: `gtc463-host+${stamp}@example.com` } });
    created.users.push(user.id);
    const sessionToken = randomBytes(32).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt: new Date(stamp + 6 * 3600_000) },
    });
    const cookie = `session=${sessionToken}`;
    const person = async (name: string, email: string | null, userId?: string) => {
      const p = await prisma.person.create({ data: { name, email, userId } });
      created.people.push(p.id);
      return p;
    };
    const host = await person('GTC-463 Host', user.email, user.id);
    const guestA = await person(`GTC-463 Guest A ${tag}`, null);
    const guestB = await person(`GTC-463 Guest B ${tag}`, null);
    const guestC = await person(`GTC-463 Guest C ${tag}`, null);
    const start = new Date(stamp + 14 * 86400_000);
    const sharedLinkToken = `gtc463-shared-${tag}-${randomBytes(6).toString('hex')}`;
    const event = await prisma.event.create({
      data: {
        name: `GTC-463 no device id ${tag}`,
        startDate: start,
        endDate: start,
        hostId: host.id,
        status: 'CONFIRMING',
        sharedLinkToken,
        sharedLinkEnabled: true,
      },
    });
    created.events.push(event.id);
    await prisma.eventRole.create({ data: { userId: user.id, eventId: event.id, role: 'HOST' } });
    await prisma.personEvent.create({
      data: { personId: host.id, eventId: event.id, role: 'HOST' },
    });
    for (const g of [guestA, guestB, guestC]) {
      await prisma.personEvent.create({
        data: { personId: g.id, eventId: event.id, role: 'PARTICIPANT', householdRole: 'GUEST' },
      });
    }
    const tokenFor = async (personId: string) =>
      prisma.accessToken.create({
        data: {
          token: randomBytes(32).toString('hex'),
          scope: 'PARTICIPANT',
          eventId: event.id,
          personId,
          expiresAt: new Date(stamp + 30 * 86400_000),
        },
      });
    const tokenA = await tokenFor(guestA.id);
    const tokenC = await tokenFor(guestC.id);
    const tokenRow = (id: string) =>
      prisma.accessToken.findUnique({
        where: { id },
        select: { claimedAt: true, claimedBy: true, openedAt: true },
      });
    const logRows = (personId: string, type: 'NAME_CLAIMED' | 'CLAIM_RESET') =>
      prisma.inviteEvent.findMany({ where: { eventId: event.id, personId, type } });

    // ══ P — in this process ═════════════════════════════════════════════════
    section('P — the claim route in this process, on a stub request (guest C)');
    const { POST: claimPOST } = await import('../src/app/api/join/[token]/claim/route');
    let p: Answer;
    try {
      const res = await claimPOST({ json: async () => ({ personId: guestC.id }) } as any, {
        params: Promise.resolve({ token: sharedLinkToken }),
      });
      p = { kind: 'answered', status: res.status, body: await res.json() };
    } catch (err) {
      p = { kind: 'threw', message: String((err as Error)?.message ?? err) };
    }
    assert(
      'P',
      'P1 the claim route answers a stub request with 200, success and the guest’s own token — it no longer needs a browser request',
      CHECKS.claimAnswered(p, tokenC.token),
      p.kind === 'threw'
        ? `threw: ${p.message.slice(0, 160)}`
        : `${p.status} ${JSON.stringify(p.body).slice(0, 160)}`
    );
    const rowC = await tokenRow(tokenC.id);
    assert(
      'P',
      'P2 and guest C’s token is claimed, with claimedBy empty',
      CHECKS.claimedWithNoDeviceId(rowC),
      JSON.stringify(rowC)
    );

    // ══ H — a claim over HTTP ═══════════════════════════════════════════════
    section('H — a claim over HTTP, with a made-up browser text and address (guest A)');
    const UA = `gtc463-browser-text-${tag}`;
    const ADDRESS = '203.0.113.46';
    const h = await http('POST', `/api/join/${sharedLinkToken}/claim`, {
      body: { personId: guestA.id },
      headers: { 'user-agent': UA, 'x-forwarded-for': ADDRESS },
    });
    const hAnswer: Answer = { kind: 'answered', status: h.status, body: h.json };
    const rowA = await tokenRow(tokenA.id);
    const peA = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId: guestA.id, eventId: event.id } },
      select: { reachabilityTier: true, claimedViaSharedLink: true },
    });
    const claimedRows = await logRows(guestA.id, 'NAME_CLAIMED');
    const claimedMeta = claimedRows[0]?.metadata ?? null;
    assert(
      'H',
      'H1 CONTROL: 200 with guest A’s own token; the token is claimed; the membership is SHARED; exactly one NAME_CLAIMED row',
      CHECKS.claimAnswered(hAnswer, tokenA.token) &&
        !!rowA?.claimedAt &&
        peA?.reachabilityTier === 'SHARED' &&
        peA?.claimedViaSharedLink === true &&
        claimedRows.length === 1,
      `${h.status} ${h.error} ${h.text.slice(0, 120)} | ${JSON.stringify(rowA)} ${JSON.stringify(peA)} rows=${claimedRows.length}`
    );
    assert(
      'H',
      'H2 the token’s claimedBy is empty after the claim',
      CHECKS.claimedWithNoDeviceId(rowA),
      JSON.stringify(rowA)
    );
    assert(
      'H',
      'H3 the NAME_CLAIMED row carries no deviceId',
      CHECKS.metaHasNoDeviceId(claimedMeta),
      JSON.stringify(claimedMeta)
    );
    assert(
      'H',
      'H4 CONTROL: that row still carries the shared-link token and the guest’s name (only the device id went)',
      CHECKS.metaKeeps(claimedMeta, sharedLinkToken, guestA.name),
      JSON.stringify(claimedMeta)
    );
    assert(
      'H',
      'H5 STANDING GUARD (not evidence of the change): neither the raw browser text nor the raw address is in the token row or the log row',
      !!rowA &&
        claimedRows.length === 1 &&
        CHECKS.holdsNone(JSON.stringify({ rowA, claimedRows }), [UA, ADDRESS]),
      JSON.stringify({ rowA, claimedMeta }).slice(0, 200)
    );

    // ══ T — invite-status as the host ═══════════════════════════════════════
    section('T — invite-status, as the host (frozen; left alone by ruling Q1)');
    const t = await http('GET', `/api/events/${event.id}/invite-status`, { cookie });
    const tRow = Array.isArray(t.json?.people)
      ? t.json.people.find((r: any) => r?.id === guestA.id)
      : undefined;
    assert(
      'T',
      'T1 CONTROL: 200, and guest A’s row shows the claim time',
      t.status === 200 && !!tRow && typeof tRow.claimedAt === 'string' && tRow.claimedAt.length > 0,
      `${t.status} ${t.error} ${JSON.stringify(tRow ?? null).slice(0, 160)}`
    );
    assert(
      'T',
      'T2 guest A’s claimedBy is sent as null',
      t.status === 200 && !!tRow && tRow.claimedBy === null,
      JSON.stringify(tRow?.claimedBy)
    );

    // ══ D — invite-detail as the host ═══════════════════════════════════════
    section('D — invite-detail, as the host, on four hand-made log rows (guest B)');
    const DETAIL_UA = `gtc463-detail-browser-${tag}`;
    const DEVICE = `device_gtc463d${tag}`;
    const OLD_CLAIM = `device_gtc463old${tag}`;
    const PHONE = `+64004630${String(stamp % 1000).padStart(3, '0')}`;
    const at = (minutesAgo: number) => new Date(stamp - minutesAgo * 60_000);
    const handMade = [
      {
        type: 'LINK_OPENED' as const,
        createdAt: at(40),
        metadata: { tokenScope: 'PARTICIPANT', userAgent: DETAIL_UA },
      },
      {
        type: 'NAME_CLAIMED' as const,
        createdAt: at(30),
        metadata: { deviceId: DEVICE, sharedLinkToken, personName: guestB.name },
      },
      {
        type: 'CLAIM_RESET' as const,
        createdAt: at(20),
        metadata: { previousClaimBy: OLD_CLAIM, personName: guestB.name },
      },
      {
        type: 'SMS_BLOCKED_INVALID' as const,
        createdAt: at(10),
        metadata: { phoneNumber: PHONE, reason: 'gtc463 fixture' },
      },
    ];
    for (const r of handMade) {
      await prisma.inviteEvent.create({
        data: { eventId: event.id, personId: guestB.id, ...r },
      });
    }
    const dd = await http('GET', `/api/events/${event.id}/people/${guestB.id}/invite-detail`, {
      cookie,
    });
    const rows = dd.json?.inviteEvents;
    const newestFirst = [...handMade].reverse();
    const reached =
      dd.status === 200 &&
      Array.isArray(rows) &&
      rows.length === 4 &&
      rows.every(
        (r: any, i: number) =>
          r?.type === newestFirst[i].type && r?.createdAt === newestFirst[i].createdAt.toISOString()
      );
    assert(
      'D',
      'D1 CONTROL: 200, with all four rows’ types and times, newest first',
      reached,
      `${dd.status} ${dd.error} ${dd.text.slice(0, 200)}`
    );
    assert(
      'D',
      'D2 each log row is exactly { type, createdAt }',
      reached && CHECKS.rowsAreTypeAndTime(rows),
      JSON.stringify(rows?.[0] ?? null).slice(0, 200)
    );
    assert(
      'D',
      'D3a the answer holds no browser text',
      reached && CHECKS.holdsNone(dd.text, [DETAIL_UA])
    );
    assert(
      'D',
      'D3b the answer holds no device id, new or old',
      reached && CHECKS.holdsNone(dd.text, [DEVICE, OLD_CLAIM])
    );
    assert(
      'D',
      'D3c the answer holds no shared-link token',
      reached && CHECKS.holdsNone(dd.text, [sharedLinkToken])
    );
    assert(
      'D',
      'D3d the answer holds no phone number from a log row',
      reached && CHECKS.holdsNone(dd.text, [PHONE])
    );
    assert(
      'D',
      'D4 CONTROL: every other key of the answer is there, and its name, status and claim time match',
      dd.status === 200 &&
        CHECKS.sameKeys(dd.json, DETAIL_KEYS) &&
        dd.json?.name === guestB.name &&
        dd.json?.status === 'NOT_SENT' &&
        dd.json?.claimedAt === null,
      `keys: ${Object.keys(dd.json ?? {}).join(',')}`
    );

    // ══ R — reset-claim as the host ═════════════════════════════════════════
    section('R — reset-claim, as the host (guest A, claimed in H)');
    const r = await http('POST', `/api/events/${event.id}/people/${guestA.id}/reset-claim`, {
      cookie,
    });
    const rowAAfter = await tokenRow(tokenA.id);
    const resetRows = await logRows(guestA.id, 'CLAIM_RESET');
    const resetMeta = resetRows[0]?.metadata ?? null;
    assert(
      'R',
      'R1 CONTROL: 200; the token is no longer claimed and claimedBy is empty; one CLAIM_RESET row, with the guest’s name',
      r.status === 200 &&
        !!rowAAfter &&
        rowAAfter.claimedAt === null &&
        rowAAfter.claimedBy === null &&
        resetRows.length === 1 &&
        isObject(resetMeta) &&
        resetMeta.personName === guestA.name,
      `${r.status} ${r.error} ${JSON.stringify(rowAAfter)} rows=${resetRows.length} ${JSON.stringify(resetMeta)}`
    );
    assert(
      'R',
      'R2 the CLAIM_RESET row carries no previousClaimBy',
      resetRows.length === 1 && CHECKS.metaHasNoPrevious(resetMeta),
      JSON.stringify(resetMeta)
    );
  } catch (err) {
    assert(
      'X',
      'the suite ran to its end',
      false,
      String((err as Error)?.stack ?? err).slice(0, 400)
    );
  } finally {
    // ══ Clean-up, by id ═════════════════════════════════════════════════════
    for (const eventId of created.events) {
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.eventRole.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    await prisma.person.deleteMany({ where: { id: { in: created.people } } });
    await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
    await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    section('K — every table as found');
    const after = await totals();
    assert(
      'K',
      'K1 CONTROL: every table’s total is as it was at the very start (the fixture is gone, nothing else moved)',
      CHECKS.sameTotals(before, after),
      `before ${JSON.stringify(before)} after ${JSON.stringify(after)}`
    );
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((x) => `  - ${x}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

if (process.env.NO_DEVICE_ID_DRY_RUN === '1') {
  dryRun();
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
