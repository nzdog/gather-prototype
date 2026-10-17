/**
 * [[GTC-290]] — Gather asks TNZ about the texts TNZ never report on: a credit hold, a blocked link,
 * and the in-flight states no webhook sends.
 *
 * THE RULINGS (SCOPED 2026-10-02 and PLAN RULINGS 2026-10-02, verbatim in GTC-290):
 *  SCOPED Q1 "Gather emails me too" — the first time the check finds a credit hold or a blocked link,
 *     Gather emails the founder, once. Plan Q1: a credit-hold episode ends as soon as no text is
 *     held; a blocked-link episode ends after 48 hours with no new sighting.
 *  SCOPED Q2 "Sent for now, red after 48h" — a held text reads as sent; still held 48 hours after
 *     TNZ accepted it, it is GTC-258's TEXT_OUR_FAULT. A blocked link is TEXT_OUR_FAULT at once.
 *  Plan Q2 the two emails' words; Q4 the follow-up's retry window counts from when the failure was
 *     recorded; Q5 Delayed, Pending and Unknown read as sent; Q6 a 48-hour red stays red; Q7 the
 *     schedule; Q10 a polled result is a report row with provider 'tnz-poll'.
 *
 * THE LAYERS:
 *  P  preconditions
 *  A  the parse, pure — TNZ's GET status response, the second wire shape
 *  B  the door — getTnzMessageStatus, behind the live switch
 *  C  the schedule, pure
 *  E  the alert email (run before D, so D's sightings cannot disturb its counts)
 *  D  the poll on this file's own fixtures, scoped to its own events
 *  F  the cron route — refusals only, and its source
 *  G  boundaries — Zone 7, and a reply's text never read
 *
 * NOTHING CALLS TNZ AND NOTHING SENDS. `liveBehindTrap` walls the process and opens the switch for
 * this process only. `globalThis.fetch` is this file's stub: TNZ's status URL answers from a table
 * keyed by MessageID, fresh per run; Resend's records the email and answers 200; anything else is
 * counted and refused. The cron route is never called with a working secret: it is refused twice
 * here, and once in a child process where the secret was never set. The poll is called directly,
 * always scoped to this file's events.
 *
 * Every row written is this file's own — its own events, people, numbers unique to the run, report
 * rows under its run prefix, and alert rows it made — removed by id.
 *
 * Run: npm run test:tnz-status-poll
 */

import { readFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';
import { NextRequest } from 'next/server';

const CHILD_UNSET = process.argv.includes('--unset-secret');
// Read before anything here touches the environment: P2 asserts the suite was not started live.
const LIVE_AT_START = process.env.GATHER_LIVE_SENDS;

// ── The process, before any module that captures configuration is loaded ─────────────────────
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']) {
  delete process.env[k];
}
process.env.TNZ_AUTH_TOKEN = 'gtc290-fake-tnz-token';
process.env.RESEND_API_KEY = 're_GTC290_sentinel_key_000000000000';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || 'gtc290-secret';
// Made up for this process. The route is never called with it — only with a wrong one.
const CRON_MADE_UP = 'gtc290-made-up-cron-secret';
if (CHILD_UNSET) delete process.env.CRON_SECRET;
else process.env.CRON_SECRET = CRON_MADE_UP;
const FOUNDER = 'gtc290-founder@example.test';
process.env.GATHER_ALERT_EMAIL = FOUNDER;

import { liveBehindTrap, trapCount, trapHits } from './helpers/provider-trap';

const ROOT = join(__dirname, '..');
const TAG = 'GTC290';
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const BASE = 'http://localhost:3000';
const STATUS_URL = 'https://api.tnz.co.nz/api/v2.04/get/status/';
const JSON_TYPE = "application/json; encoding='utf-8'";

// GTC-258's W2, byte-exact: the board's sentence for a fault on our side.
const W2 = "My text didn't go through. That was a problem on my side, not with their number.";

// The ruled words (plan ruling Q2), byte-exact. The "First seen" line is checked by shape.
const CREDIT_SUBJECT = 'Gather: TNZ is holding texts — the account is out of credit';
const CREDIT_TEXT = [
  "Gather's check with TNZ found a text TNZ is holding because the TNZ account has no credit. While it has none, no text Gather sends will go out.",
  '',
  "Top up the TNZ account. An invitation still held 48 hours after TNZ took it will show red on its host's board, as a problem on our side.",
  '',
  'First seen: <time>.',
  'Gather will email you again only if texts are held again after this clears.',
].join('\n');
const LINK_SUBJECT = "Gather: TNZ is blocking a link in Gather's texts";
const LINK_TEXT = [
  "Gather's check with TNZ found a text TNZ stopped because a link in it isn't on TNZ's approved list. Every text with that link will be stopped too. A stopped invitation shows red on its host's board straight away, as a problem on our side.",
  '',
  "Ask TNZ to approve Gather's web address, localhost:3000.",
  '',
  'First seen: <time>.',
  "Gather won't email about this again until it has gone 48 hours without finding another.",
].join('\n');
const withoutSeen = (text: string) =>
  text.replace(/^First seen: [^\n]+\.$/m, (line) =>
    /^First seen: \S.*\.$/.test(line) ? 'First seen: <time>.' : line
  );

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

/** A missing export reads as a failed assertion, not a crashed run — RED and GREEN in one file. */
function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

async function safe<T>(fn: () => Promise<T>): Promise<T | { threw: string }> {
  try {
    return await fn();
  } catch (err) {
    return { threw: (err as Error).message.split('\n')[0].slice(0, 200) };
  }
}

function read(rel: string): string {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
}

/** Source with comments stripped, so an assertion about CODE cannot be satisfied by prose. */
function code(rel: string): string {
  return read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

// ── TNZ's GET status response, built from the DOC-TABLE record ─────────────────────────────────
// Field names and nesting from docs/05_ops/tnz-restapi-v2.04-docs-2026-09-12.html, "GET Status
// Poll". TNZ's sample bodies are empty in that page, so every name here is from its tables.
function recipient(dest: string, status: string, result: string, extra: object = {}) {
  return {
    Type: 'SMS',
    DestSeq: '00000001',
    Destination: dest,
    ContactID: '',
    Status: status,
    Result: result,
    SentTimeLocal: '2026-10-02 10:00:01',
    SentTimeUTC: '2026-10-01 21:00:01',
    SentTimeUTC_RFC3339: '2026-10-01T21:00:01.000Z',
    Attention: '',
    Company: '',
    RemoteID: '',
    Price: '0.10',
    ...extra,
  };
}
function statusBody(mid: string, status: string, recipients: object[] = [], extra: object = {}) {
  return {
    Result: 'Success',
    MessageID: mid,
    Status: status,
    JobNum: 'AB12CD34',
    Account: '102030',
    SubAccount: '',
    Department: '',
    Reference: '',
    CreatedTimeLocal: '2026-10-02 10:00:00',
    CreatedTimeUTC: '2026-10-01 21:00:00',
    CreatedTimeUTC_RFC3339: '2026-10-01T21:00:00.000Z',
    DelayedTimeLocal: '',
    DelayedTimeUTC: '',
    DelayedTimeUTC_RFC3339: '',
    Count: 1,
    Complete: recipients.length,
    Success: 0,
    Failed: 0,
    Recipients: recipients,
    ...extra,
  };
}
const failureBody = (mid: string) => ({
  Result: 'Failed',
  MessageID: mid,
  Message: 'Invalid MessageID',
});

// ── The transports, stubbed ────────────────────────────────────────────────────────────────────
type Answer = { status: number; body: unknown } | 'throw' | 'hang';
type Email = { to: string[]; subject: string; text: string };
const answers = new Map<string, Answer>();
const statusAsks: { id: string; url: string; method: string; headers: Record<string, string> }[] =
  [];
const emails: Email[] = [];
let otherCalls = 0;
let midSeq = 0;
const RUN = `gtc290-${Date.now().toString(36)}`;

function headersOf(h: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof (h as Headers).forEach === 'function' && !(h instanceof Array)) {
    (h as Headers).forEach((v, k) => (out[k.toLowerCase()] = v));
    return out;
  }
  for (const [k, v] of Object.entries(h as Record<string, string>)) out[k.toLowerCase()] = v;
  return out;
}

function stubFetch() {
  globalThis.fetch = (async (url: unknown, init?: any) => {
    const u = String(url);
    if (u.startsWith(STATUS_URL)) {
      const id = decodeURIComponent(u.slice(STATUS_URL.length));
      statusAsks.push({
        id,
        url: u,
        method: String(init?.method ?? 'GET').toUpperCase(),
        headers: headersOf(init?.headers),
      });
      const a = answers.get(id) ?? { status: 400, body: failureBody(id) };
      if (a === 'throw') throw new Error('gtc290 stub: network down');
      if (a === 'hang') {
        return new Promise<Response>((_, reject) => {
          const signal: AbortSignal | undefined = init?.signal;
          // AbortSignal.timeout's timer does not hold the process open, so a hang with nothing else
          // pending would end the run silently with exit 0. This timer holds it, and is a ceiling.
          const ceiling = setTimeout(() => reject(new Error('gtc290 stub: hang ceiling')), 10_000);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(ceiling);
              reject(new Error('aborted'));
            });
          }
        });
      }
      return new Response(JSON.stringify(a.body), {
        status: a.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (u.includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      emails.push({ to: [body.to ?? []].flat(), subject: body.subject, text: body.text });
      return new Response(JSON.stringify({ id: `${RUN}-email-${emails.length}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    otherCalls++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

// ── The child: the route loaded where CRON_SECRET was never set ────────────────────────────────
async function child() {
  const out: Record<string, unknown> = {};
  try {
    const route: any = await import('../src/app/api/cron/tnz-status-poll/route');
    // A canary: if anything put a secret back in the environment, do not call the route at all.
    if (process.env.CRON_SECRET) {
      out.refusedToDrive = 'CRON_SECRET appeared in the environment';
    } else {
      for (const m of ['GET', 'POST'] as const) {
        const res = await route[m](
          new NextRequest(`${BASE}/api/cron/tnz-status-poll`, { method: m })
        );
        out[m] = res.status;
      }
    }
  } catch (err) {
    out.threw = (err as Error).message.split('\n')[0];
  }
  console.log(`GTC290_CHILD ${JSON.stringify(out)}`);
  process.exit(0);
}

async function main() {
  // F3's child runs first, before this process opens the gate, with neither setting in its env.
  const childEnv: NodeJS.ProcessEnv = { ...process.env };
  delete childEnv.CRON_SECRET;
  delete childEnv.GATHER_LIVE_SENDS;
  const childRun = spawnSync('npx', ['tsx', __filename, '--unset-secret'], {
    cwd: ROOT,
    env: childEnv,
    encoding: 'utf8',
  });
  const childLine = (childRun.stdout ?? '').split('\n').find((l) => l.startsWith('GTC290_CHILD '));
  let childOut: any = null;
  try {
    childOut = childLine ? JSON.parse(childLine.slice('GTC290_CHILD '.length)) : null;
  } catch {
    childOut = null;
  }

  let closeGate = liveBehindTrap();
  stubFetch();
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const db = prisma as any;

  const load = async (p: string) => {
    try {
      return await import(p);
    } catch (err) {
      console.error(`\x1b[33m!\x1b[0m ${p} did not load: ${(err as Error).message.split('\n')[0]}`);
      return null;
    }
  };
  const SC: any = await load('../src/lib/sms/tnz-status-contract');
  const TC: any = await load('../src/lib/sms/tnz-client');
  const POLL: any = await load('../src/lib/sms/tnz-status-poll');
  const ALERT: any = await load('../src/lib/sms/tnz-account-alert');
  const CONTRACT: any = await load('../src/lib/sms/tnz-delivery-contract');
  const REC: any = await load('../src/lib/sms/tnz-delivery-record');
  const TS: any = await load('../src/lib/sms/text-send-record');
  const TN: any = await load('../src/lib/glance/text-note');
  const DF: any = await load('../src/lib/glance/delivery-fact');
  const WU: any = await load('../src/lib/wrap-up');
  const DBS: any = await load('../src/lib/sms/decide-by-sender');
  const LS: any = await load('../src/lib/live-sends');
  const ROUTE: any = await load('../src/app/api/cron/tnz-status-poll/route');

  // Numbers unique to the run: +6421, five digits of the clock, two of a sequence.
  const stem = String(Date.now()).slice(-5);
  let phoneSeq = 10;
  const NUMBERS: string[] = [];
  const phone = () => {
    const n = `+6421${stem}${String(phoneSeq++).padStart(2, '0')}`;
    NUMBERS.push(n);
    return n;
  };
  const mid = () => `${RUN}-mid-${++midSeq}`;

  const created = { events: [] as string[], persons: [] as string[], users: [] as string[] };
  const now = new Date();
  const at = (ms: number) => new Date(now.getTime() + ms);
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  const sentAt = ago(240);
  const stamp = Date.now();
  const mail = (who: string) => `gtc290+${who}+${stamp}@example.test`;

  const alertTable = () => db.tnzAccountAlert;
  let alertsBefore = new Set<string>();
  const clearOurAlerts = async () => {
    if (!alertTable()) return;
    const rows = await alertTable().findMany({ select: { id: true } });
    const ours = rows.map((r: any) => r.id).filter((id: string) => !alertsBefore.has(id));
    if (ours.length) await alertTable().deleteMany({ where: { id: { in: ours } } });
  };
  const founderEmails = () => emails.filter((e) => e.to.includes(FOUNDER));

  const smsOptOutsBefore = await prisma.smsOptOut.count();

  try {
    // ══ P — preconditions ════════════════════════════════════════════════════════════════════
    for (let i = 0; i < 80; i++) phone();
    phoneSeq = 10;
    const heldElsewhere = await prisma.person.count({ where: { phoneNumber: { in: NUMBERS } } });
    const optOutsAlready = await prisma.smsOptOut.count({
      where: { phoneNumber: { in: NUMBERS } },
    });
    const blocksAlready = await db.textBlock.count({ where: { phoneNumber: { in: NUMBERS } } });
    const heldTexts = await db.outboundMessage.count({
      where: { channel: 'TEXT', deliveryState: 'TEXT_HELD_FOR_CREDIT', deliveryPollDoneAt: null },
    });
    let openAlerts = 0;
    if (alertTable()) {
      const rows = await alertTable().findMany({ select: { id: true, openKind: true } });
      alertsBefore = new Set(rows.map((r: any) => r.id));
      openAlerts = rows.filter((r: any) => r.openKind !== null).length;
    }
    NUMBERS.length = 0;
    const p1 =
      heldElsewhere === 0 &&
      optOutsAlready === 0 &&
      blocksAlready === 0 &&
      heldTexts === 0 &&
      openAlerts === 0;
    assert(
      'P',
      "P1 PRECONDITION: no open TNZ alert (or no table yet), no held text, and nothing holds this run's numbers",
      p1,
      show({ heldElsewhere, optOutsAlready, blocksAlready, heldTexts, openAlerts })
    );
    if (!p1) throw new Error('P1 failed — the alert is account-wide, so this suite stops here');
    assert(
      'P',
      'P2 GATHER_LIVE_SENDS was unset when the suite started (only liveBehindTrap opened it)',
      LIVE_AT_START === undefined
    );

    // ══ A — the parse, pure ══════════════════════════════════════════════════════════════════
    const parse = (status: number, body: unknown, asked: string, dest?: string) =>
      SC.parseTnzStatusResponse(
        status,
        typeof body === 'string' ? body : JSON.stringify(body),
        asked,
        dest ?? null
      );
    const FIELDS: Record<string, any> = SC?.TNZ_STATUS_FIELDS ?? {};
    assert(
      'A',
      'A1 every GET field recorded is DOC-TABLE, none DOC-EXAMPLE — and the record names the fields this suite builds from',
      ok(
        () =>
          Object.keys(FIELDS).length >= 30 &&
          Object.values(FIELDS).every((f) => f.provenance === 'DOC-TABLE') &&
          ['Result', 'MessageID', 'Status', 'JobNum', 'Recipients', 'SentTimeUTC_RFC3339'].every(
            (k) => k in FIELDS
          )
      ),
      show(Object.keys(FIELDS))
    );
    assert(
      'A',
      "A2 the five message-level Statuses are recorded verbatim: 'Unknown', 'Pending', 'Delayed', 'Completed', 'CreditHold'",
      ok(
        () =>
          show(SC.TNZ_POLL_MESSAGE_STATUSES) ===
          show(['Unknown', 'Pending', 'Delayed', 'Completed', 'CreditHold'])
      )
    );
    const D1 = '+64210000001';
    const a3 = ok(() => {
      const v = parse(
        200,
        statusBody('m1', 'Completed', [recipient(D1, 'SUCCESS', 'delivered')]),
        'm1'
      );
      return (
        v.kind === 'FINAL' &&
        v.status === 'SUCCESS' &&
        v.result === 'delivered' &&
        CONTRACT.interpretTnzResult(v.status, v.result).arrival === 'ARRIVED'
      );
    });
    assert('A', 'A3 Success / Completed / SMS SUCCESS delivered → FINAL, which reads ARRIVED', a3);
    assert(
      'A',
      'A4 a recipient FAILED LinkNotPermitted → FINAL, in the OUR_FAULT bucket',
      ok(() => {
        const v = parse(
          200,
          statusBody('m2', 'Completed', [recipient(D1, 'FAILED', 'LinkNotPermitted')]),
          'm2'
        );
        return (
          v.kind === 'FINAL' &&
          CONTRACT.interpretTnzResult(v.status, v.result).failureBucket === 'OUR_FAULT'
        );
      })
    );
    assert(
      'A',
      'A5 CreditHold, recipient PENDING → HELD',
      ok(
        () =>
          parse(200, statusBody('m3', 'CreditHold', [recipient(D1, 'PENDING', '')]), 'm3').kind ===
          'HELD'
      )
    );
    assert(
      'A',
      "A6 Pending, Delayed and Unknown → IN_FLIGHT, each carrying TNZ's own word",
      ok(() =>
        ['Pending', 'Delayed', 'Unknown'].every((s) => {
          const v = parse(200, statusBody('m4', s), 'm4');
          return v.kind === 'IN_FLIGHT' && v.messageStatus === s;
        })
      )
    );
    assert(
      'A',
      'A7 Completed with no final recipient → IN_FLIGHT, never an arrival',
      ok(() => {
        const none = parse(200, statusBody('m5', 'Completed', []), 'm5');
        const pend = parse(
          200,
          statusBody('m5', 'Completed', [recipient(D1, 'PENDING', '')]),
          'm5'
        );
        return none.kind === 'IN_FLIGHT' && pend.kind === 'IN_FLIGHT';
      })
    );
    assert(
      'A',
      'A8 a message-level Result "Failed" is the API call failing → POLL_FAILED, even beside "delivered"',
      ok(
        () =>
          parse(
            200,
            {
              ...statusBody('m6', 'Completed', [recipient(D1, 'SUCCESS', 'delivered')]),
              Result: 'Failed',
            },
            'm6'
          ).kind === 'POLL_FAILED'
      )
    );
    assert(
      'A',
      'A9 HTTP 400 with Result Failed and a Message → POLL_FAILED, no throw',
      ok(() => parse(400, failureBody('m7'), 'm7').kind === 'POLL_FAILED')
    );
    assert(
      'A',
      'A10 a non-JSON body, an empty body and a JSON array → POLL_FAILED, no throw',
      ok(
        () =>
          parse(200, '<html>oops</html>', 'm8').kind === 'POLL_FAILED' &&
          parse(200, '', 'm8').kind === 'POLL_FAILED' &&
          parse(200, '[]', 'm8').kind === 'POLL_FAILED'
      )
    );
    assert(
      'A',
      'A11 a response naming another MessageID → MISMATCH',
      ok(() => parse(200, statusBody('other', 'Completed'), 'm9').kind === 'MISMATCH')
    );
    assert(
      'A',
      "A12 a reply's recipient (SMSReply, RECEIVED) is skipped and its Message never reaches the verdict",
      ok(() => {
        const v = parse(
          200,
          statusBody('m10', 'Completed', [
            recipient(D1, 'RECEIVED', 'RECEIVED', { Type: 'SMSReply', Message: 'STOP NOW' }),
            recipient(D1, 'SUCCESS', 'delivered'),
          ]),
          'm10'
        );
        return v.kind === 'FINAL' && v.status === 'SUCCESS' && !show(v).includes('STOP NOW');
      })
    );
    assert(
      'A',
      "A13 JobNum and SentTimeUTC_RFC3339 are read; the webhook's JobNumber and hyphenated spelling are not",
      ok(() => {
        const good = parse(
          200,
          statusBody('m11', 'Completed', [recipient(D1, 'SUCCESS', 'delivered')]),
          'm11'
        );
        const r = recipient(D1, 'SUCCESS', 'delivered') as any;
        delete r.SentTimeUTC_RFC3339;
        r['SentTimeUTC-RFC3339'] = '2026-10-01T21:00:01.000Z';
        const body = statusBody('m11', 'Completed', [r]) as any;
        delete body.JobNum;
        body.JobNumber = 'ZZ99ZZ99';
        const wrong = parse(200, body, 'm11');
        return (
          good.jobNum === 'AB12CD34' &&
          good.sentAt instanceof Date &&
          good.sentAt.toISOString() === '2026-10-01T21:00:01.000Z' &&
          wrong.kind === 'FINAL' &&
          wrong.jobNum === null &&
          wrong.sentAt === null
        );
      })
    );
    assert(
      'A',
      'A14 case does not matter: creditHold, COMPLETED, success, SUCCESS',
      ok(
        () =>
          parse(200, { ...statusBody('m12', 'creditHold'), Result: 'success' }, 'm12').kind ===
            'HELD' &&
          parse(
            200,
            {
              ...statusBody('m12', 'COMPLETED', [recipient(D1, 'success', 'Delivered')]),
              Result: 'SUCCESS',
            },
            'm12'
          ).kind === 'FINAL'
      )
    );
    const contractSrc = code('src/lib/sms/tnz-status-contract.ts');
    assert(
      'A',
      "A15 the parse is its own boundary: it imports nothing from the webhook's envelope parser",
      contractSrc.length > 0 && !/from ['"][^'"]*tnz-webhook-envelope['"]/.test(contractSrc)
    );
    assert(
      'A',
      "A16 a Status outside the five → IN_FLIGHT with TNZ's word kept, never a failure",
      ok(() => {
        const v = parse(200, statusBody('m13', 'Archived'), 'm13');
        return v.kind === 'IN_FLIGHT' && v.messageStatus === 'Archived';
      })
    );

    // ══ B — the door ═════════════════════════════════════════════════════════════════════════
    closeGate();
    const asksBeforeB1 = statusAsks.length;
    const trapBeforeB1 = trapCount();
    const b1: any = await safe(() => TC.getTnzMessageStatus('gtc290-b1'));
    assert(
      'B',
      "B1 with the switch off: no request, and the switch's own words",
      ok(
        () =>
          b1.reached === false &&
          b1.error === LS.LIVE_SENDS_OFF &&
          statusAsks.length === asksBeforeB1 &&
          trapCount() === trapBeforeB1
      ),
      show(b1)
    );
    closeGate = liveBehindTrap();
    const clientSrc = code('src/lib/sms/tnz-client.ts');
    const fnStart = clientSrc.indexOf('export async function getTnzMessageStatus');
    const fnBody = fnStart >= 0 ? clientSrc.slice(fnStart) : '';
    const iToken = fnBody.indexOf('!authToken');
    const iSwitch = fnBody.indexOf('isLiveSendingOn()');
    const iFetch = fnBody.indexOf('fetch(');
    assert(
      'B',
      'B2 the order in getTnzMessageStatus: the token, then the switch, then the fetch',
      fnStart >= 0 && iToken >= 0 && iSwitch > iToken && iFetch > iSwitch
    );
    answers.set('gtc290 b3/x', { status: 200, body: statusBody('gtc290 b3/x', 'Pending') });
    const b3: any = await safe(() => TC.getTnzMessageStatus('gtc290 b3/x'));
    const ask3 = statusAsks[statusAsks.length - 1];
    assert(
      'B',
      'B3 behind the trap: one GET to the documented URL, the id encoded, Basic token and both headers',
      ok(
        () =>
          b3.reached === true &&
          b3.httpStatus === 200 &&
          statusAsks.length === asksBeforeB1 + 1 &&
          ask3.url === `${STATUS_URL}gtc290%20b3%2Fx` &&
          ask3.method === 'GET' &&
          ask3.headers['authorization'] === 'Basic gtc290-fake-tnz-token' &&
          ask3.headers['content-type'] === JSON_TYPE &&
          ask3.headers['accept'] === JSON_TYPE
      ),
      show({ b3, ask3 })
    );
    answers.set('gtc290-b4-throw', 'throw');
    answers.set('gtc290-b4-hang', 'hang');
    const b4a: any = await safe(() => TC.getTnzMessageStatus('gtc290-b4-throw'));
    const b4b: any = await safe(() => TC.getTnzMessageStatus('gtc290-b4-hang', { timeoutMs: 50 }));
    assert(
      'B',
      'B4 a fetch that throws, and one that times out: not reached, and nothing thrown',
      // The hang must end by the CLIENT's own timeout, not the stub's ceiling: only an abort says
      // "aborted", so a client with no timeout fails here rather than passing on the ceiling.
      ok(
        () =>
          b4a.reached === false &&
          b4b.reached === false &&
          b4b.error === 'TNZ network error: aborted'
      ),
      show({ b4a, b4b })
    );

    // ══ C — the schedule, pure ═══════════════════════════════════════════════════════════════
    const acc = new Date('2026-10-01T00:00:00.000Z');
    const row = (checked: Date | null) => ({ acceptedAt: acc, deliveryCheckedAt: checked });
    const atAge = (ms: number) => new Date(acc.getTime() + ms);
    assert(
      'C',
      'C1 ticks every 15 minutes across 48 hours ask one text exactly 5 times (15m, 1h, 6h, 24h, 48h)',
      ok(() => {
        let checked: Date | null = null;
        let asks = 0;
        for (let t = 0; t <= 48 * 4; t++) {
          const tick = atAge(t * 15 * MINUTE);
          if (POLL.isDueForTextCheck(row(checked), tick)) {
            asks++;
            checked = tick;
          }
        }
        return (
          asks === 5 &&
          show(POLL.TEXT_POLL_CHECKPOINTS_MS) === show([15 * MINUTE, HOUR, 6 * HOUR, DAY, 2 * DAY])
        );
      })
    );
    assert(
      'C',
      'C2 not due before 15 minutes',
      ok(
        () =>
          !POLL.isDueForTextCheck(row(null), atAge(14 * MINUTE)) &&
          POLL.isDueForTextCheck(row(null), atAge(15 * MINUTE))
      )
    );
    assert(
      'C',
      'C3 asked at 1h05 → not asked again before 6h',
      ok(
        () =>
          !POLL.isDueForTextCheck(row(atAge(65 * MINUTE)), atAge(5 * HOUR + 59 * MINUTE)) &&
          POLL.isDueForTextCheck(row(atAge(65 * MINUTE)), atAge(6 * HOUR))
      )
    );
    assert(
      'C',
      'C4 first reached at 50h → due once, past the stop, and not due again',
      ok(
        () =>
          POLL.isDueForTextCheck(row(null), atAge(50 * HOUR)) &&
          POLL.isPastTextStop(row(null), atAge(50 * HOUR)) &&
          !POLL.isDueForTextCheck(row(atAge(50 * HOUR)), atAge(51 * HOUR)) &&
          POLL.TEXT_POLL_BATCH === 25 &&
          typeof POLL.TEXT_POLL_RUN_BUDGET_MS === 'number'
      )
    );

    // ══ Fixtures ═════════════════════════════════════════════════════════════════════════════
    async function mkEvent(
      label: string,
      o: { endDate?: Date; withUser?: boolean; status?: string } = {}
    ) {
      let userId: string | null = null;
      if (o.withUser) {
        const user = await prisma.user.create({ data: { email: mail(`${label}-host`) } });
        created.users.push(user.id);
        userId = user.id;
      }
      const host = await prisma.person.create({
        data: { name: `Kate ${label}`, email: o.withUser ? mail(`${label}-host`) : null, userId },
      });
      created.persons.push(host.id);
      const endDate = o.endDate ?? new Date(now.getTime() + 200 * HOUR);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label} ${stamp}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: (o.status ?? 'CONFIRMING') as any,
          sentAt,
        },
      });
      created.events.push(ev.id);
      const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
      await prisma.personEvent.create({
        data: { personId: host.id, eventId: ev.id, role: 'HOST' },
      });
      return { ev, team, host, scope: { eventIds: [ev.id] } };
    }
    type Ev = Awaited<ReturnType<typeof mkEvent>>;

    async function mkMember(
      e: Ev,
      name: string,
      o: { email?: string | null; response?: 'PENDING' | 'MAYBE'; followupSentAt?: Date } = {}
    ) {
      const first = name.split(' ')[0].toLowerCase();
      const p = await prisma.person.create({
        data: {
          name,
          email: o.email === undefined ? mail(`${first}-${e.ev.id.slice(-5)}`) : o.email,
          phoneNumber: phone(),
        },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: { personId: p.id, eventId: e.ev.id, role: 'PARTICIPANT', sentAt },
      });
      const item = await prisma.item.create({
        data: { teamId: e.team.id, name: 'pavlova', kind: 'ITEM' },
      });
      await prisma.assignment.create({
        data: {
          itemId: item.id,
          personId: p.id,
          response: o.response ?? 'PENDING',
          decideByFollowupSentAt: o.followupSentAt ?? null,
          createdAt: ago(300),
        },
      });
      await prisma.accessToken.create({
        data: {
          token: `${TAG}-${pe.id}-${stamp}`,
          scope: 'PARTICIPANT',
          eventId: e.ev.id,
          personId: p.id,
        },
      });
      return { p, pe };
    }
    type Member = Awaited<ReturnType<typeof mkMember>>;

    /** A text TNZ accepted, as every text path leaves it since GTC-258. */
    async function accepted(
      e: Ev,
      m: Member,
      o: { kind?: string; mid?: string | null; accepted: Date; data?: Record<string, unknown> }
    ) {
      return db.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId: m.pe.id,
          kind: o.kind ?? 'ASK',
          channel: 'TEXT',
          createdAt: o.accepted,
          attemptedAt: o.accepted,
          attemptCount: 1,
          acceptedAt: o.accepted,
          provider: 'tnz',
          providerMessageId: o.mid === undefined ? mid() : o.mid,
          destination: m.p.phoneNumber,
          ...(o.data ?? {}),
        },
      });
    }
    const fresh = (id: string) => db.outboundMessage.findUnique({ where: { id } });
    const poll = (e: Ev | Ev[], when: Date) =>
      safe(() =>
        POLL.pollTextStatusOnce(prisma, {
          now: when,
          scope: { eventIds: [e].flat().map((x) => x.ev.id) },
        })
      );
    const answer = (m: string, status: string, recips: object[] = []) =>
      answers.set(m, { status: 200, body: statusBody(m, status, recips) });
    const held = (m: string, dest: string) =>
      answer(m, 'CreditHold', [recipient(dest, 'PENDING', '')]);
    const linkBlocked = (m: string, dest: string) =>
      answer(m, 'Completed', [recipient(dest, 'FAILED', 'LinkNotPermitted')]);
    const factOf = (r: any) => (r ? DF.deliveryFactFrom(r).failure : 'no row');

    // ══ E — the alert email ══════════════════════════════════════════════════════════════════
    const eE1 = await mkEvent('AlertCredit');
    const c1 = await mkMember(eE1, 'Cara Held');
    const r1 = await accepted(eE1, c1, { accepted: at(-20 * MINUTE) });
    held(r1.providerMessageId, c1.p.phoneNumber!);
    const e1: any = await poll(eE1, now);
    const open1 = alertTable()
      ? await alertTable().findMany({ where: { kind: 'CREDIT_HOLD', openKind: 'CREDIT_HOLD' } })
      : [];
    const fe1 = founderEmails();
    assert(
      'E',
      'E1 the first credit hold → one open CREDIT_HOLD episode and one email, in the ruled words',
      open1.length === 1 &&
        fe1.length === 1 &&
        fe1[0].subject === CREDIT_SUBJECT &&
        withoutSeen(fe1[0].text) === CREDIT_TEXT &&
        ok(() => e1.alerts.CREDIT_HOLD === 'SENT'),
      show({ open1: open1.length, fe1, alerts: e1?.alerts ?? e1 })
    );

    const c2 = await mkMember(eE1, 'Cody Held');
    const r2 = await accepted(eE1, c2, { accepted: at(-20 * MINUTE) });
    held(r2.providerMessageId, c2.p.phoneNumber!);
    const e2: any = await poll(eE1, at(MINUTE));
    const open2 = alertTable()
      ? await alertTable().findMany({ where: { kind: 'CREDIT_HOLD', openKind: 'CREDIT_HOLD' } })
      : [];
    assert(
      'E',
      'E2 a second held text on a later run → no second email, the episode seen again',
      open2.length === 1 &&
        founderEmails().length === 1 &&
        ok(() => open2[0].lastSeenAt.getTime() === at(MINUTE).getTime()) &&
        ok(() => e2.alerts.CREDIT_HOLD === 'ALREADY_OPEN'),
      show({ open2, alerts: e2?.alerts ?? e2 })
    );

    // Topped up: both texts released. Asked at their 1-hour point, neither is held any more.
    answer(r1.providerMessageId, 'Pending', [recipient(c1.p.phoneNumber!, 'PENDING', '')]);
    answer(r2.providerMessageId, 'Pending', [recipient(c2.p.phoneNumber!, 'PENDING', '')]);
    await poll(eE1, at(61 * MINUTE));
    const closed3 = alertTable()
      ? await alertTable().findMany({
          where: { kind: 'CREDIT_HOLD', id: { notIn: [...alertsBefore] } },
        })
      : [];
    const c3 = await mkMember(eE1, 'Cleo Held');
    const r3 = await accepted(eE1, c3, { accepted: at(41 * MINUTE) });
    held(r3.providerMessageId, c3.p.phoneNumber!);
    const e3: any = await poll(eE1, at(62 * MINUTE));
    const credit3 = alertTable()
      ? await alertTable().findMany({
          where: { kind: 'CREDIT_HOLD', id: { notIn: [...alertsBefore] } },
        })
      : [];
    assert(
      'E',
      'E3 credit (plan Q1): once no text is held the episode closes; a later hold opens a second episode and a second email',
      closed3.length === 1 &&
        closed3[0].openKind === null &&
        closed3[0].closedAt instanceof Date &&
        credit3.length === 2 &&
        credit3.filter((r: any) => r.openKind === 'CREDIT_HOLD').length === 1 &&
        founderEmails().filter((e) => e.subject === CREDIT_SUBJECT).length === 2 &&
        ok(() => e3.alerts.CREDIT_HOLD === 'SENT'),
      show({ closed3, credit3: credit3.length, alerts: e3?.alerts ?? e3 })
    );

    const eE4 = await mkEvent('AlertLink');
    const l1m = await mkMember(eE4, 'Lia Linked');
    const l1 = await accepted(eE4, l1m, { accepted: at(-20 * MINUTE) });
    linkBlocked(l1.providerMessageId, l1m.p.phoneNumber!);
    const e4a: any = await poll(eE4, now);
    const l2m = await mkMember(eE4, 'Leo Linked');
    const l2 = await accepted(eE4, l2m, { accepted: at(-20 * MINUTE) });
    linkBlocked(l2.providerMessageId, l2m.p.phoneNumber!);
    const e4b: any = await poll(eE4, at(MINUTE));
    const linkMailsAfterTwo = founderEmails().filter((e) => e.subject === LINK_SUBJECT).length;
    const l3m = await mkMember(eE4, 'Lux Linked');
    const l3 = await accepted(eE4, l3m, { accepted: at(49 * HOUR - 20 * MINUTE) });
    linkBlocked(l3.providerMessageId, l3m.p.phoneNumber!);
    const e4c: any = await poll(eE4, at(49 * HOUR));
    const linkRows = alertTable()
      ? await alertTable().findMany({
          where: { kind: 'LINK_NOT_PERMITTED', id: { notIn: [...alertsBefore] } },
        })
      : [];
    const linkMails = founderEmails().filter((e) => e.subject === LINK_SUBJECT);
    assert(
      'E',
      'E4 a blocked link → its own episode and email; a second within 48 hours → none; after 48 hours without one, a new sighting emails again',
      ok(() => e4a.alerts.LINK_NOT_PERMITTED === 'SENT') &&
        ok(() => e4b.alerts.LINK_NOT_PERMITTED === 'ALREADY_OPEN') &&
        linkMailsAfterTwo === 1 &&
        linkRows.length === 2 &&
        linkRows.filter((r: any) => r.openKind === 'LINK_NOT_PERMITTED').length === 1 &&
        linkMails.length === 2 &&
        linkMails.every((m) => withoutSeen(m.text) === LINK_TEXT),
      show({
        a: e4a?.alerts,
        b: e4b?.alerts,
        c: e4c?.alerts,
        rows: linkRows.length,
        mails: linkMails,
      })
    );

    const guestBits = [
      ...[c1, c2, c3, l1m, l2m, l3m].flatMap((m) => [m.p.name, m.p.phoneNumber!]),
      eE1.ev.name,
      eE4.ev.name,
      r1.providerMessageId,
      l1.providerMessageId,
    ];
    assert(
      'E',
      'E5 no alert email carries a phone number, a guest or event name, or a MessageID',
      founderEmails().length >= 4 &&
        founderEmails().every(
          (m) =>
            !guestBits.some((b) => m.text.includes(b) || m.subject.includes(b)) &&
            !/\+?\d{8,}/.test(m.text)
        ),
      show(founderEmails().map((m) => m.text))
    );

    await clearOurAlerts();
    delete process.env.GATHER_ALERT_EMAIL;
    const mailsBefore6 = emails.length;
    const eE6 = await mkEvent('AlertNoAddress');
    const n6 = await mkMember(eE6, 'Nia Held');
    const r6 = await accepted(eE6, n6, { accepted: at(-20 * MINUTE) });
    held(r6.providerMessageId, n6.p.phoneNumber!);
    const e6: any = await poll(eE6, now);
    process.env.GATHER_ALERT_EMAIL = FOUNDER;
    const row6 = alertTable()
      ? await alertTable().findFirst({ where: { kind: 'CREDIT_HOLD', openKind: 'CREDIT_HOLD' } })
      : null;
    assert(
      'E',
      'E6 with the address unset: nothing sent, the reason recorded on the episode, and the run unhealthy',
      emails.length === mailsBefore6 &&
        !!row6 &&
        row6.emailedAt === null &&
        /GATHER_ALERT_EMAIL/.test(row6.emailError ?? '') &&
        ok(() => e6.alerts.CREDIT_HOLD === 'NOT_SENT' && POLL.pollRunHealth(e6).ok === false),
      show({ row6, alerts: e6?.alerts ?? e6 })
    );

    await clearOurAlerts();
    closeGate();
    const mailsBefore7 = emails.length;
    const trapBefore7 = trapCount();
    const e7: any = await safe(() =>
      ALERT.noteTnzSightings(prisma, { LINK_NOT_PERMITTED: l1.id }, now)
    );
    closeGate = liveBehindTrap();
    const row7 = alertTable()
      ? await alertTable().findFirst({ where: { openKind: 'LINK_NOT_PERMITTED' } })
      : null;
    assert(
      'E',
      'E7 with the switch off: no request, and the episode records that live sending is off',
      emails.length === mailsBefore7 &&
        trapCount() === trapBefore7 &&
        ok(() => e7.LINK_NOT_PERMITTED === 'NOT_SENT') &&
        !!row7 &&
        ok(() => (row7.emailError ?? '').includes(LS.LIVE_SENDS_OFF)),
      show({ e7, row7 })
    );

    await clearOurAlerts();
    const mailsBefore8 = founderEmails().length;
    const e8 = await Promise.all([
      safe(() => ALERT.noteTnzSightings(prisma, { LINK_NOT_PERMITTED: l1.id }, now)),
      safe(() => ALERT.noteTnzSightings(prisma, { LINK_NOT_PERMITTED: l2.id }, now)),
    ]);
    const rows8 = alertTable()
      ? await alertTable().findMany({ where: { id: { notIn: [...alertsBefore] } } })
      : [];
    assert(
      'E',
      'E8 two sightings at once → one episode row and one email (the unique is the "once")',
      rows8.length === 1 && founderEmails().length === mailsBefore8 + 1,
      show({ e8, rows8: rows8.length })
    );
    await clearOurAlerts();
    // E's held texts are ours; finish them so D's runs see no hold but their own.
    await db.outboundMessage.updateMany({
      where: { eventId: { in: [eE1.ev.id, eE6.ev.id] }, deliveryPollDoneAt: null },
      data: { deliveryPollDoneAt: now },
    });

    // ══ D — the poll ═════════════════════════════════════════════════════════════════════════
    // D1: who is asked.
    const eD1 = await mkEvent('Selection');
    const eD1x = await mkEvent('OutOfScope');
    const s = await mkMember(eD1, 'Sam Selected');
    const due = await accepted(eD1, s, { accepted: at(-20 * MINUTE) });
    answer(due.providerMessageId, 'Pending', [recipient(s.p.phoneNumber!, 'PENDING', '')]);
    const young = await accepted(eD1, s, { accepted: at(-5 * MINUTE) });
    const asEmail = await db.outboundMessage.create({
      data: {
        eventId: eD1.ev.id,
        personEventId: s.pe.id,
        kind: 'ASK',
        channel: 'EMAIL',
        createdAt: ago(1),
        attemptedAt: ago(1),
        acceptedAt: ago(1),
        provider: 'resend',
        providerMessageId: mid(),
      },
    });
    const viaTwilio = await accepted(eD1, s, {
      accepted: ago(1),
      data: { provider: 'twilio', providerMessageId: `SM${RUN}` },
    });
    const notAccepted = await accepted(eD1, s, {
      accepted: ago(1),
      data: { acceptedAt: null, rejectedAt: ago(1), providerError: 'refused' },
    });
    const finished = await accepted(eD1, s, {
      accepted: ago(1),
      data: {
        deliveryState: 'TEXT_ARRIVED',
        deliveryCheckedAt: ago(1),
        deliveryPollDoneAt: ago(1),
      },
    });
    const sx = await mkMember(eD1x, 'Sol Elsewhere');
    const outOfScope = await accepted(eD1x, sx, { accepted: at(-20 * MINUTE) });
    const asksBeforeD1 = statusAsks.length;
    const d1: any = await poll(eD1, now);
    const askedD1 = statusAsks.slice(asksBeforeD1).map((a) => a.id);
    const neverAsked = [young, asEmail, viaTwilio, notAccepted, finished, outOfScope].map(
      (r: any) => r.providerMessageId
    );
    assert(
      'D',
      'D1 only TEXT, sent through TNZ, accepted, with a MessageID, unfinished and in scope is asked',
      !('threw' in (d1 ?? {})) &&
        askedD1.length === 1 &&
        askedD1[0] === due.providerMessageId &&
        neverAsked.every((m) => !askedD1.includes(m)),
      show({ askedD1, d1 })
    );

    // D2: accepted with no MessageID.
    const eD2 = await mkEvent('NoMessageId');
    const nm = await mkMember(eD2, 'Nell Noid');
    const noId = await accepted(eD2, nm, { accepted: ago(1), mid: null });
    const asksBeforeD2 = statusAsks.length;
    const d2: any = await poll(eD2, now);
    const noIdAfter = await fresh(noId.id);
    assert(
      'D',
      'D2 accepted with no MessageID → retired (pollDone set, state null), never asked',
      noIdAfter?.deliveryPollDoneAt instanceof Date &&
        noIdAfter?.deliveryState === null &&
        statusAsks.length === asksBeforeD2 &&
        ok(() => d2.unjoinable === 1),
      show({ noIdAfter, d2 })
    );

    // D3, D4: delivered, and the webhook's own report afterwards.
    const eD3 = await mkEvent('Delivered');
    const dm = await mkMember(eD3, 'Dee Delivered');
    const dRow = await accepted(eD3, dm, { accepted: at(-20 * MINUTE) });
    answer(dRow.providerMessageId, 'Completed', [
      recipient(dm.p.phoneNumber!, 'SUCCESS', 'delivered'),
    ]);
    await poll(eD3, now);
    const dAfter = await fresh(dRow.id);
    const dReports = await prisma.smsDeliveryReport.findMany({
      where: { providerMessageId: dRow.providerMessageId },
    });
    assert(
      'D',
      "D3 delivered → TEXT_ARRIVED, and a report row with provider 'tnz-poll' linked to the guest",
      dAfter?.deliveryState === 'TEXT_ARRIVED' &&
        dAfter?.deliveryPollDoneAt instanceof Date &&
        dReports.length === 1 &&
        dReports[0].provider === 'tnz-poll' &&
        dReports[0].eventId === eD3.ev.id &&
        dReports[0].personId === dm.p.id,
      show({ dAfter, dReports })
    );
    const webhook = (m: string, dest: string, status: string, result: string) =>
      safe(async () => {
        const parsed = CONTRACT.parseTnzDeliveryReport(
          CONTRACT.buildTnzDeliveryEnvelope({
            APIKey: 'gtc290-made-up',
            Sender: 'gtc290-made-up@sender.invalid',
            MessageID: m,
            Destination: dest,
            Status: status,
            Result: result,
          })
        );
        if (!parsed.ok) throw new Error(`envelope did not parse: ${show(parsed.failure)}`);
        return REC.recordTnzDeliveryReport(prisma, parsed.report);
      });
    const d4: any = await webhook(
      dRow.providerMessageId,
      dm.p.phoneNumber!,
      'SUCCESS',
      'delivered'
    );
    const d4Reports = await prisma.smsDeliveryReport.findMany({
      where: { providerMessageId: dRow.providerMessageId },
      orderBy: { receivedAt: 'asc' },
    });
    const d4After = await fresh(dRow.id);
    assert(
      'D',
      "D4 the webhook's report afterwards is stored as its own row (provider 'tnz') and changes nothing",
      ok(() => d4.recorded === true) &&
        d4Reports.length === 2 &&
        show(d4Reports.map((r) => r.provider).sort()) === show(['tnz', 'tnz-poll']) &&
        d4After?.deliveryState === 'TEXT_ARRIVED' &&
        d4After?.deliveryCheckedAt?.getTime() === dAfter?.deliveryCheckedAt?.getTime(),
      show({ d4, d4Reports: d4Reports.map((r) => r.provider) })
    );

    // D5: a blocked link.
    const eD5 = await mkEvent('LinkBlocked');
    const lm = await mkMember(eD5, 'Lou Blocked');
    const lRow = await accepted(eD5, lm, { accepted: at(-20 * MINUTE) });
    linkBlocked(lRow.providerMessageId, lm.p.phoneNumber!);
    await poll(eD5, now);
    const lAfter = await fresh(lRow.id);
    const lBlocks = await db.textBlock.count({ where: { phoneNumber: lm.p.phoneNumber } });
    assert(
      'D',
      'D5 LinkNotPermitted → TEXT_OUR_FAULT at once, red with W2, and the number not blocked',
      lAfter?.deliveryState === 'TEXT_OUR_FAULT' &&
        lAfter?.providerLastEvent === 'LinkNotPermitted' &&
        lAfter?.deliveryPollDoneAt instanceof Date &&
        factOf(lAfter) === 'NOT_DELIVERED' &&
        ok(() => TN.textNoteFor(lAfter.deliveryState) === W2) &&
        lBlocks === 0,
      show({ lAfter, lBlocks })
    );

    // D6: TNZ's opt-out list.
    const eD6 = await mkEvent('Blacklisted');
    const bm = await mkMember(eD6, 'Bo Listed');
    const bRow = await accepted(eD6, bm, { accepted: at(-20 * MINUTE) });
    answer(bRow.providerMessageId, 'Completed', [
      recipient(bm.p.phoneNumber!, 'FAILED', 'Destination is blacklisted'),
    ]);
    await poll(eD6, now);
    const bAfter = await fresh(bRow.id);
    const bBlock = await db.textBlock.findUnique({ where: { phoneNumber: bm.p.phoneNumber } });
    assert(
      'D',
      "D6 'Destination is blacklisted' → TEXT_OPTED_OUT and a TextBlock (GTC-258's path)",
      bAfter?.deliveryState === 'TEXT_OPTED_OUT' && bBlock?.reason === 'OPTED_OUT',
      show({ bAfter, bBlock })
    );

    // D8: held for credit, and how every reader reads it.
    const eD8 = await mkEvent('Held');
    const hm = await mkMember(eD8, 'Hal Held');
    const hAsk = await accepted(eD8, hm, { accepted: at(-20 * MINUTE) });
    const hChase = await accepted(eD8, hm, { kind: 'CHASE_FIRST', accepted: at(-20 * MINUTE) });
    held(hAsk.providerMessageId, hm.p.phoneNumber!);
    held(hChase.providerMessageId, hm.p.phoneNumber!);
    await poll(eD8, now);
    const hAskAfter = await fresh(hAsk.id);
    const hChaseAfter = await fresh(hChase.id);
    const hFailures: any = await safe(() => TS.readTextFailures(prisma, hm.pe.id));
    assert(
      'D',
      'D8 CreditHold → TEXT_HELD_FOR_CREDIT, not finished, and it reads as sent on the board, the note and the modal',
      [hAskAfter, hChaseAfter].every(
        (r: any) =>
          r?.deliveryState === 'TEXT_HELD_FOR_CREDIT' &&
          r?.deliveryPollDoneAt === null &&
          r?.providerLastEvent === 'CreditHold'
      ) &&
        factOf(hAskAfter) === null &&
        ok(() => TN.textNoteFor('TEXT_HELD_FOR_CREDIT') === null) &&
        ok(() => hFailures.firstReminder === false),
      show({ hAskAfter, hFailures })
    );

    // D9: Pending, Delayed, Unknown.
    const eD9 = await mkEvent('InFlight');
    const im = await mkMember(eD9, 'Ira Inflight');
    const words = ['Pending', 'Delayed', 'Unknown'];
    const iRows = [];
    for (const w of words) {
      const r = await accepted(eD9, im, { accepted: at(-20 * MINUTE) });
      answer(
        r.providerMessageId,
        w,
        w === 'Pending' ? [recipient(im.p.phoneNumber!, 'PENDING', '')] : []
      );
      iRows.push(r);
    }
    await poll(eD9, now);
    const iAfter = await Promise.all(iRows.map((r) => fresh(r.id)));
    assert(
      'D',
      "D9 Pending, Delayed and Unknown → TEXT_IN_FLIGHT with TNZ's word, reading as sent",
      iAfter.every(
        (r: any, i) =>
          r?.deliveryState === 'TEXT_IN_FLIGHT' &&
          r?.providerLastEvent === words[i] &&
          r?.deliveryPollDoneAt === null &&
          factOf(r) === null
      ),
      show(iAfter.map((r: any) => [r?.deliveryState, r?.providerLastEvent]))
    );

    // D10 to D14, D17: the 48-hour stop.
    const past = at(-(48 * HOUR + 5 * MINUTE));
    const heldBefore = {
      deliveryState: 'TEXT_HELD_FOR_CREDIT',
      providerLastEvent: 'CreditHold',
      deliveryCheckedAt: new Date(past.getTime() + 24 * HOUR + 5 * MINUTE),
    };
    const eD10 = await mkEvent('HeldTooLong');
    const tm = await mkMember(eD10, 'Tam Toolong');
    const tRow = await accepted(eD10, tm, { accepted: past, data: heldBefore });
    held(tRow.providerMessageId, tm.p.phoneNumber!);
    const um = await mkMember(eD10, 'Uma Unread');
    const uRow = await accepted(eD10, um, { accepted: past, data: heldBefore });
    answers.set(uRow.providerMessageId, { status: 500, body: { oops: true } });
    const pm = await mkMember(eD10, 'Pip Pending');
    const pRow = await accepted(eD10, pm, {
      accepted: past,
      data: { ...heldBefore, deliveryState: 'TEXT_IN_FLIGHT', providerLastEvent: 'Pending' },
    });
    answer(pRow.providerMessageId, 'Pending', [recipient(pm.p.phoneNumber!, 'PENDING', '')]);
    await poll(eD10, now);
    const tAfter = await fresh(tRow.id);
    const uAfter = await fresh(uRow.id);
    const pAfter = await fresh(pRow.id);
    const tBlocks = await db.textBlock.count({ where: { phoneNumber: tm.p.phoneNumber } });
    assert(
      'D',
      'D10 still held at 48 hours → TEXT_OUR_FAULT, recorded at the decision, red with W2, number not blocked',
      tAfter?.deliveryState === 'TEXT_OUR_FAULT' &&
        tAfter?.providerLastEvent === 'CreditHold' &&
        tAfter?.deliveryCheckedAt?.getTime() === now.getTime() &&
        tAfter?.deliveryPollDoneAt instanceof Date &&
        factOf(tAfter) === 'NOT_DELIVERED' &&
        ok(() => TN.textNoteFor(tAfter.deliveryState) === W2) &&
        tBlocks === 0,
      show({ tAfter, tBlocks })
    );
    assert(
      'D',
      'D11 held, and the 48-hour read fails → TEXT_OUR_FAULT from the stored hold',
      uAfter?.deliveryState === 'TEXT_OUR_FAULT' && uAfter?.providerLastEvent === 'CreditHold',
      show(uAfter)
    );
    assert(
      'D',
      'D12 Pending at 48 hours → TEXT_STOPPED_CHECKING: finished, and still reading as sent',
      pAfter?.deliveryState === 'TEXT_STOPPED_CHECKING' &&
        pAfter?.providerLastEvent === 'Pending' &&
        pAfter?.deliveryPollDoneAt instanceof Date &&
        factOf(pAfter) === null,
      show(pAfter)
    );
    await webhook(pRow.providerMessageId, pm.p.phoneNumber!, 'FAILED', 'Bad Number');
    const pLate = await fresh(pRow.id);
    assert(
      'D',
      "D13 a TNZ report after the stop still lands: 'Bad Number' → TEXT_DEAD_CHANNEL",
      pAfter?.deliveryState === 'TEXT_STOPPED_CHECKING' &&
        pLate?.deliveryState === 'TEXT_DEAD_CHANNEL',
      show(pLate)
    );
    await webhook(tRow.providerMessageId, tm.p.phoneNumber!, 'SUCCESS', 'delivered');
    const tLate = await fresh(tRow.id);
    assert(
      'D',
      'D14 a report after a 48-hour TEXT_OUR_FAULT changes nothing (the first final outcome wins)',
      tAfter?.deliveryState === 'TEXT_OUR_FAULT' &&
        tLate?.deliveryState === 'TEXT_OUR_FAULT' &&
        tLate?.deliveryCheckedAt?.getTime() === now.getTime(),
      show(tLate)
    );

    // D15, D16: the call failed, or answered about something else.
    const eD15 = await mkEvent('Unreadable');
    const fm = await mkMember(eD15, 'Fen Failed');
    const fRow1 = await accepted(eD15, fm, { accepted: at(-20 * MINUTE) });
    answers.set(fRow1.providerMessageId, {
      status: 400,
      body: failureBody(fRow1.providerMessageId),
    });
    const fRow2 = await accepted(eD15, fm, { accepted: at(-20 * MINUTE) });
    answers.set(fRow2.providerMessageId, {
      status: 200,
      body: {
        ...statusBody(fRow2.providerMessageId, 'Completed', [
          recipient(fm.p.phoneNumber!, 'SUCCESS', 'delivered'),
        ]),
        Result: 'Failed',
      },
    });
    const d15: any = await poll(eD15, now);
    const f1After = await fresh(fRow1.id);
    const f2After = await fresh(fRow2.id);
    const fReports = await prisma.smsDeliveryReport.count({
      where: { providerMessageId: { in: [fRow1.providerMessageId, fRow2.providerMessageId] } },
    });
    assert(
      'D',
      'D15 an unknown MessageID (400) and a failed call (Result Failed): no state, no report, asked-at advanced, counted',
      [f1After, f2After].every(
        (r: any) =>
          r?.deliveryState === null &&
          r?.deliveryPollDoneAt === null &&
          r?.deliveryCheckedAt?.getTime() === now.getTime()
      ) &&
        fReports === 0 &&
        ok(() => d15.unreadable === 2),
      show({ f1After, f2After, d15 })
    );
    const eD16 = await mkEvent('Mismatch');
    const mm = await mkMember(eD16, 'Mo Mismatch');
    const mRow = await accepted(eD16, mm, { accepted: at(-20 * MINUTE) });
    answers.set(mRow.providerMessageId, {
      status: 200,
      body: statusBody(`${RUN}-someone-else`, 'Completed', [
        recipient(mm.p.phoneNumber!, 'FAILED', 'Bad Number'),
      ]),
    });
    const d16: any = await poll(eD16, now);
    const mAfter = await fresh(mRow.id);
    assert(
      'D',
      'D16 an answer about another MessageID: only the asked-at written, counted',
      mAfter?.deliveryState === null &&
        mAfter?.deliveryCheckedAt?.getTime() === now.getTime() &&
        ok(() => d16.mismatched === 1),
      show({ mAfter, d16 })
    );

    // D17: GTC-335's replay of the 48-hour red.
    const timed = (r: any) => (r ? { ...r } : null);
    assert(
      'D',
      'D17 the replay: no failure before the decision, NOT_DELIVERED after, recorded at the decision',
      ok(() => {
        const t = timed(tAfter);
        const before = DF.deliveryRowAsAt(t, at(-MINUTE));
        const after = DF.deliveryRowAsAt(t, at(MINUTE));
        return (
          DF.deliveryFactFrom(before).failure === null &&
          DF.deliveryFactFrom(after).failure === 'NOT_DELIVERED' &&
          DF.deliveryFailureRecordedAt(t).getTime() === now.getTime()
        );
      }),
      show(tAfter)
    );

    // D18: a thank-you held to 48 hours.
    let QH: any = null;
    try {
      QH = await import('../src/lib/sms/quiet-hours');
    } catch {
      QH = null;
    }
    let awake: Date | null = null;
    for (let h = 0; h < 24 && !awake; h++) {
      const t = at(h * HOUR);
      if (QH && !QH.isQuietHours(t)) awake = t;
    }
    const eD18 = await mkEvent('ThankYou', {
      withUser: true,
      endDate: ago(72),
      status: 'COMPLETE',
    });
    const ym = await mkMember(eD18, 'Yan Thanked');
    const yRow = await accepted(eD18, ym, { kind: 'THANK_YOU', accepted: past, data: heldBefore });
    held(yRow.providerMessageId, ym.p.phoneNumber!);
    await prisma.wrapUpLink.create({
      data: {
        token: `${TAG}-wl-${ym.pe.id}`,
        eventId: eD18.ev.id,
        personId: ym.p.id,
        guestName: ym.p.name,
        guestEmail: ym.p.email,
        guestPhone: ym.p.phoneNumber,
        channel: 'sms',
        dispatched: true,
        dispatchedAt: past,
        expiresAt: at(30 * DAY),
        createdAt: past,
      },
    });
    await poll(eD18, now);
    const d18: any = awake
      ? await safe(() => WU.retryUndeliveredThankYous(awake, eD18.scope))
      : null;
    const mailsTo = (m: Member) =>
      emails.filter((e) => e.to.map((t) => t.toLowerCase()).includes(m.p.email!.toLowerCase()))
        .length;
    const yAfter = await fresh(yRow.id);
    assert(
      'D',
      'D18 a thank-you held to 48 hours turns TEXT_OUR_FAULT and is retried once by email',
      yAfter?.deliveryState === 'TEXT_OUR_FAULT' && mailsTo(ym) === 1,
      show({ yAfter, d18, awake })
    );

    // D19, D20: the follow-up's window (plan ruling Q4).
    const eD19 = await mkEvent('FollowUp', {
      withUser: true,
      endDate: at(3 * DAY + 120 * HOUR),
    });
    const fu = await mkMember(eD19, 'Fia Followed', {
      response: 'MAYBE',
      followupSentAt: at(-(48 * HOUR + 15 * MINUTE)),
    });
    await accepted(eD19, fu, {
      kind: 'DECIDE_BY_FOLLOWUP',
      accepted: at(-(48 * HOUR + 15 * MINUTE)),
      data: {
        deliveryState: 'TEXT_OUR_FAULT',
        providerLastEvent: 'CreditHold',
        deliveryCheckedAt: at(-15 * MINUTE),
        deliveryPollDoneAt: at(-15 * MINUTE),
      },
    });
    const fo = await mkMember(eD19, 'Fox Older', {
      response: 'MAYBE',
      followupSentAt: at(-50 * HOUR),
    });
    await accepted(eD19, fo, {
      kind: 'DECIDE_BY_FOLLOWUP',
      accepted: at(-50 * HOUR),
      data: {
        deliveryState: 'TEXT_OUR_FAULT',
        providerLastEvent: 'CreditHold',
        deliveryCheckedAt: at(-49 * HOUR),
        deliveryPollDoneAt: at(-49 * HOUR),
      },
    });
    const d19: any = await safe(() => DBS.retryUndeliveredFollowups(now, eD19.scope));
    assert(
      'D',
      'D19 a follow-up whose failure was recorded 15 minutes ago, accepted 48h15m ago, decide-by ahead → one email retry',
      mailsTo(fu) === 1,
      show(d19)
    );
    assert(
      'D',
      'D20 CONTROL: a follow-up whose failure was recorded 49 hours ago → no retry',
      mailsTo(fo) === 0
    );

    // D22: one run's counts.
    const eD22 = await mkEvent('Counts');
    const km = await mkMember(eD22, 'Kit Counted');
    const kFinal = await accepted(eD22, km, { accepted: at(-20 * MINUTE) });
    answer(kFinal.providerMessageId, 'Completed', [
      recipient(km.p.phoneNumber!, 'SUCCESS', 'delivered'),
    ]);
    const kHeld = await accepted(eD22, km, { accepted: at(-20 * MINUTE) });
    held(kHeld.providerMessageId, km.p.phoneNumber!);
    const kFlight = await accepted(eD22, km, { accepted: at(-20 * MINUTE) });
    answer(kFlight.providerMessageId, 'Pending');
    const kRed = await accepted(eD22, km, { accepted: past, data: heldBefore });
    held(kRed.providerMessageId, km.p.phoneNumber!);
    const kStop = await accepted(eD22, km, {
      accepted: past,
      data: { ...heldBefore, deliveryState: 'TEXT_IN_FLIGHT', providerLastEvent: 'Pending' },
    });
    answer(kStop.providerMessageId, 'Pending');
    const kBad = await accepted(eD22, km, { accepted: at(-20 * MINUTE) });
    answers.set(kBad.providerMessageId, 'throw');
    const kOther = await accepted(eD22, km, { accepted: at(-20 * MINUTE) });
    answers.set(kOther.providerMessageId, {
      status: 200,
      body: statusBody(`${RUN}-not-this-one`, 'Completed'),
    });
    await accepted(eD22, km, { accepted: at(-20 * MINUTE), mid: null });
    const d22: any = await poll(eD22, now);
    assert(
      'D',
      'D22 one run counts what it did: asked 7, read 5, final 1, held 1, in flight 1, stopped 1, red at 48h 1, no MessageID 1, unreadable 1, mismatched 1',
      ok(
        () =>
          d22.asked === 7 &&
          d22.read === 5 &&
          d22.final === 1 &&
          d22.held === 1 &&
          d22.inFlight === 1 &&
          d22.stopped === 1 &&
          d22.ourFaultAt48h === 1 &&
          d22.unjoinable === 1 &&
          d22.unreadable === 1 &&
          d22.mismatched === 1
      ),
      show(d22)
    );
    assert(
      'D',
      'D23 pollRunHealth: nothing to ask is healthy; asked and read none fails; an alert not sent fails',
      ok(
        () =>
          POLL.pollRunHealth({ asked: 0, read: 0, alertsNotSent: 0 }).ok === true &&
          POLL.pollRunHealth({ asked: 3, read: 0, alertsNotSent: 0 }).ok === false &&
          POLL.pollRunHealth({ asked: 3, read: 1, alertsNotSent: 1 }).ok === false &&
          POLL.pollRunHealth({ asked: 3, read: 1, alertsNotSent: 0 }).ok === true
      )
    );

    // D7, D21: the controls, over everything above.
    const optedNow = await prisma.person.count({
      where: { id: { in: created.persons }, smsOptedOut: true },
    });
    assert(
      'D',
      'D7 CONTROL: Zone 7 untouched — the SmsOptOut count is as found, and no person here is flagged',
      (await prisma.smsOptOut.count()) === smsOptOutsBefore && optedNow === 0
    );
    assert(
      'D',
      "D21 CONTROL: no request left the process — the trap counted nothing, and nothing called but the suite's two stubs",
      trapCount() === 0 && otherCalls === 0,
      show({ hits: trapHits(), otherCalls })
    );

    // ══ F — the route ════════════════════════════════════════════════════════════════════════
    const ROUTE_FILE = 'src/app/api/cron/tnz-status-poll/route.ts';
    const routeSrc = code(ROUTE_FILE);
    assert(
      'F',
      'F1 the route exists and exports GET and POST',
      routeSrc.length > 0 && typeof ROUTE?.GET === 'function' && typeof ROUTE?.POST === 'function'
    );
    assert(
      'F',
      "F2 both refusing ifs are written in the file, and the secret is read at module scope (GTC-270's shape)",
      /if \(!isCronSecretConfigured\(CRON_SECRET\)\)/.test(routeSrc) &&
        /if \(!cronSecretAccepted\(CRON_SECRET, providedSecret\)\)/.test(routeSrc) &&
        /const CRON_SECRET = process\.env\.CRON_SECRET/.test(routeSrc) &&
        (routeSrc.match(/status: 401/g) ?? []).length === 2
    );
    assert(
      'F',
      'F3 with CRON_SECRET never set (a child process): GET and POST answer 401',
      childOut?.GET === 401 && childOut?.POST === 401,
      show({ childOut, status: childRun.status, err: (childRun.stderr ?? '').slice(-300) })
    );
    const wrong: number[] = [];
    for (const m of ['GET', 'POST'] as const) {
      const r: any = await safe(() =>
        ROUTE[m](
          new NextRequest(`${BASE}/api/cron/tnz-status-poll?secret=definitely-not-it`, {
            method: m,
            headers: { authorization: 'Bearer definitely-not-it' },
          })
        )
      );
      wrong.push(r?.status ?? -1);
    }
    assert('F', 'F4 a wrong secret: GET and POST answer 401', show(wrong) === show([401, 401]));
    assert(
      'F',
      'F5 the body goes through withoutRecipientNames, and the status is pollRunHealth’s',
      /withoutRecipientNames\(/.test(routeSrc) &&
        /pollRunHealth\(/.test(routeSrc) &&
        /status: health\.ok \? 200 : 500/.test(routeSrc)
    );
    const vercel = (() => {
      try {
        return JSON.parse(read('vercel.json'));
      } catch {
        return { crons: [] };
      }
    })();
    const sched = (p: string) => vercel.crons.find((c: any) => c.path.includes(p))?.schedule;
    assert(
      'F',
      'F6 vercel.json runs it every 15 minutes',
      sched('/api/cron/tnz-status-poll') === '*/15 * * * *'
    );
    assert(
      'F',
      'F7 CONTROL: the other four schedules are unchanged — 15, 10, 15 and 2 minutes',
      sched('/api/cron/nudges') === '*/15 * * * *' &&
        sched('/api/cron/wrap-up-dispatch') === '*/10 * * * *' &&
        sched('/api/cron/decide-by-followups') === '*/15 * * * *' &&
        sched('/api/cron/outbound-dispatch') === '*/2 * * * *'
    );

    // ══ G — boundaries ═══════════════════════════════════════════════════════════════════════
    const mine = [
      'src/lib/sms/tnz-status-contract.ts',
      'src/lib/sms/tnz-status-poll.ts',
      'src/lib/sms/tnz-account-alert.ts',
    ].map(code);
    assert(
      'G',
      'G1 the contract, the poll and the alert name no Zone 7 symbol',
      mine.every((c) => c.length > 0) &&
        mine.every(
          (c) => !/SmsOptOut|smsOptOut|smsOptedOut|opt-out-service|opt-out-keywords/.test(c)
        )
    );
    assert(
      'G',
      "G2 the parse never reads a reply's text (no `Message` is accessed)",
      contractSrc.length > 0 && !/\.Message\b|\[['"]Message['"]\]/.test(contractSrc)
    );
  } finally {
    process.env.GATHER_ALERT_EMAIL = FOUNDER;
    await clearOurAlerts().catch(() => {});
    for (const eventId of created.events) {
      await prisma.wrapUpLink.deleteMany({ where: { eventId } });
      await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
      await prisma.item.deleteMany({ where: { team: { eventId } } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.smsDeliveryReport.deleteMany({ where: { eventId } });
      await prisma.outboundMessage
        .updateMany({ where: { eventId }, data: { retryOfId: null } as any })
        .catch(() => {});
      await prisma.outboundMessage.deleteMany({ where: { eventId } });
      await prisma.inviteEvent.deleteMany({ where: { eventId } });
      await prisma.auditEntry.deleteMany({ where: { eventId } });
      await prisma.emailOptOut.deleteMany({ where: { eventId } });
      await prisma.accessToken.deleteMany({ where: { eventId } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } }).catch(() => {});
    }
    await prisma.smsDeliveryReport.deleteMany({
      where: { providerMessageId: { startsWith: RUN } },
    });
    if (NUMBERS.length) {
      await db.textBlock.deleteMany({ where: { phoneNumber: { in: NUMBERS } } });
    }
    if (created.persons.length) {
      await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    }
    if (created.users.length) {
      await prisma.session.deleteMany({ where: { userId: { in: created.users } } });
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    const leftEvents = await prisma.event.count({ where: { id: { in: created.events } } });
    const leftPersons = await prisma.person.count({ where: { id: { in: created.persons } } });
    const leftReports = await prisma.smsDeliveryReport.count({
      where: { providerMessageId: { startsWith: RUN } },
    });
    const leftBlocks = NUMBERS.length
      ? await db.textBlock.count({ where: { phoneNumber: { in: NUMBERS } } })
      : 0;
    let leftAlerts = 0;
    let alertsStillThere = true;
    if (alertTable()) {
      const rows = await alertTable().findMany({ select: { id: true } });
      leftAlerts = rows.filter((r: any) => !alertsBefore.has(r.id)).length;
      alertsStillThere = [...alertsBefore].every((id) => rows.some((r: any) => r.id === id));
    }
    assert(
      'E',
      `E9 CONTROL: every row this suite made is removed by id, alert rows included, and no other alert row touched (${leftEvents} events, ${leftPersons} people, ${leftReports} reports, ${leftBlocks} blocks, ${leftAlerts} alerts left)`,
      leftEvents === 0 &&
        leftPersons === 0 &&
        leftReports === 0 &&
        leftBlocks === 0 &&
        leftAlerts === 0 &&
        alertsStillThere
    );
    closeGate();
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log('\x1b[32mGREEN — Gather asks TNZ about what TNZ never reports.\x1b[0m');
}

(CHILD_UNSET ? child() : main()).catch((err) => {
  console.error(err);
  process.exit(1);
});
