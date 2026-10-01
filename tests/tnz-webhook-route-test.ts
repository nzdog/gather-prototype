/**
 * [[GTC-264]] Phase 3 and [[GTC-229]] — TNZ's one webhook, `POST /api/sms/tnz-webhook`.
 *
 * Run: npm run test:tnz-webhook
 *
 * WHAT IS UNDER TEST. TNZ send delivery-status reports and received texts to ONE URL, told
 * apart by `Type` (their answer D1, 2026-09-15). This suite drives that route IN PROCESS with
 * fabricated payloads and asserts four things: it authenticates both places TNZ present the
 * credential and fails closed when it is unset; it stores every delivery report, matched or not,
 * once; since [[GTC-288]] it keeps a reply that answers one of Gather's texts and records a STOP
 * account-wide (layer E; the full reply behaviour is tests/tnz-reply-test.ts); and its status
 * codes are the contract the plan ruled, against TNZ's retry of every non-2xx for 24 hours.
 *
 * ── NOTHING SENDS, AND NOTHING IS REAL ─────────────────────────────────────────────────────
 *
 * No server, no network, no TNZ. The provider trap is installed and the live gate is never
 * opened; layer G asserts the trap counted nothing. The credential is two made-up strings set in
 * THIS process only. Every payload is built by the Phase 2 fixture factories, from the recorded
 * wire shape, with LITERAL overrides — so a corrected field name fails `tsc` here too.
 *
 * ── WHAT IT WRITES, AND HOW IT CLEANS UP ────────────────────────────────────────────────────
 *
 * The route writes `SmsDeliveryReport` rows; every MessageID this suite sends carries a per-run
 * prefix, and every such row is deleted at the end. One fixture `NUDGE_SENT_AUTO` InviteEvent is
 * created on an existing event and member so a report has a send to match, and deleted by id.
 * Layer G asserts the counts are as found.
 *
 * ── RED BEFORE THE BUILD ────────────────────────────────────────────────────────────────────
 *
 * The route and the auth module are loaded dynamically, so with neither built every assertion
 * that needs them goes red rather than the suite crashing. Each check is strict (`=== true`,
 * `=== false`, an exact status), and every "writes nothing" check is paired with the status it
 * expects, so an absent route cannot pass one. Only layer G is green before the build.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapCount } from './helpers/provider-trap';
import {
  buildTnzDeliveryEnvelope,
  buildTnzReplyEnvelope,
} from '../src/lib/sms/tnz-delivery-contract';

installProviderTrap();

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}

const ROOT = join(__dirname, '..');
const ROUTE_FILE = 'src/app/api/sms/tnz-webhook/route.ts';
const AUTH_FILE = 'src/app/api/sms/tnz-callback-auth.ts';
const STORE_FILE = 'src/lib/sms/tnz-delivery-record.ts';

function read(rel: string): string | null {
  try {
    return readFileSync(join(ROOT, rel), 'utf-8');
  } catch {
    return null;
  }
}

/** Source with comments removed — see the same helper in tnz-delivery-contract-test.ts. */
function codeOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Made up for this process. Never a real value, and never read from .env.
const SECRET = 'gtc264-made-up-callback-secret';
const SENDER = 'gtc264-made-up@sender.invalid';

const RUN = `gtc264t-${Date.now().toString(36)}`;
let seq = 0;
const mid = () => `${RUN}-${++seq}`;
const DEST = '+6421000001';
const REPLY_TEXT = 'gtc264-reply-text-that-must-never-reach-a-log';

type AuthModule = typeof import('../src/app/api/sms/tnz-callback-auth');
type RouteModule = typeof import('../src/app/api/sms/tnz-webhook/route');

interface Posted {
  status: number;
}

async function main() {
  let auth: AuthModule | null = null;
  try {
    auth = await import('../src/app/api/sms/tnz-callback-auth');
  } catch {
    auth = null;
  }
  let route: RouteModule | null = null;
  try {
    route = await import('../src/app/api/sms/tnz-webhook/route');
  } catch {
    route = null;
  }

  /** Posts to the route in process. Null when the route is absent or throws. */
  async function post(
    body: unknown,
    opts: { authorization?: string | null; sender?: string | null; raw?: string } = {}
  ): Promise<Posted | null> {
    if (!route || typeof route.POST !== 'function') return null;
    const headers: Record<string, string> = {
      'content-type': opts.raw !== undefined ? 'text/xml' : 'application/json',
      'x-timestamp': '2026-10-01T00:00:00Z',
    };
    const authorization = opts.authorization === undefined ? SECRET : opts.authorization;
    const sender = opts.sender === undefined ? SENDER : opts.sender;
    if (authorization !== null) headers['authorization'] = authorization;
    if (sender !== null) headers['x-sender'] = sender;
    try {
      const res = await route.POST(
        new NextRequest('http://localhost:3000/api/sms/tnz-webhook', {
          method: 'POST',
          headers,
          body: opts.raw !== undefined ? opts.raw : JSON.stringify(body),
        })
      );
      return { status: res.status };
    } catch {
      return null;
    }
  }

  async function counts() {
    const [reports, optOuts, optedOut, invites] = await Promise.all([
      prisma.smsDeliveryReport.count(),
      prisma.smsOptOut.count(),
      prisma.person.count({ where: { smsOptedOut: true } }),
      prisma.inviteEvent.count(),
    ]);
    return { reports, optOuts, optedOut, invites };
  }
  type Counts = Awaited<ReturnType<typeof counts>>;
  const unchanged = (a: Counts, b: Counts) =>
    a.reports === b.reports &&
    a.optOuts === b.optOuts &&
    a.optedOut === b.optedOut &&
    a.invites === b.invites;

  /** Posts, and reports the status alongside whether ANY watched table moved. */
  async function postAndWatch(body: unknown, opts?: Parameters<typeof post>[1]) {
    const before = await counts();
    const res = await post(body, opts);
    const after = await counts();
    return { status: res?.status, nothingWritten: unchanged(before, after) };
  }

  const rowsFor = (providerMessageId: string) =>
    prisma.smsDeliveryReport.findMany({ where: { providerMessageId } });

  const start = await counts();
  // [[GTC-288]]: kept replies. Guarded, so the suite reports rather than crashes before the model
  // exists.
  const textReplyCount = async (): Promise<number | null> => {
    try {
      return await (prisma as any).textReply.count();
    } catch {
      return null;
    }
  };
  const startTextReplies = await textReplyCount();
  const savedSecret = process.env.TNZ_CALLBACK_SECRET;
  const savedSender = process.env.TNZ_CALLBACK_SENDER;
  let fixtureInviteEventId: string | null = null;

  // Console capture for layer E: every line the route writes while replies are posted.
  const captured: string[] = [];
  const consoleMethods = ['log', 'info', 'warn', 'error'] as const;
  const originals = consoleMethods.map((m) => console[m]);
  const startCapture = () =>
    consoleMethods.forEach((m) => {
      console[m] = (...args: unknown[]) => {
        captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      };
    });
  const stopCapture = () => consoleMethods.forEach((m, i) => (console[m] = originals[i]));

  try {
    // ───────────────────────────────────────────────────────────────────────────────────────
    section('Layer A: the credential predicates, pure');
    // ───────────────────────────────────────────────────────────────────────────────────────

    assert(
      'A',
      'an unset secret is not configured',
      auth?.isTnzCallbackConfigured(undefined, SENDER) === false
    );
    assert(
      'A',
      'an EMPTY secret is not configured',
      auth?.isTnzCallbackConfigured('', SENDER) === false
    );
    assert(
      'A',
      'an unset sender is not configured',
      auth?.isTnzCallbackConfigured(SECRET, undefined) === false
    );
    assert('A', 'both set is configured', auth?.isTnzCallbackConfigured(SECRET, SENDER) === true);
    assert(
      'A',
      'the right secret and sender are accepted',
      auth?.tnzCallbackAccepted(SECRET, SENDER, SECRET, SENDER) === true
    );
    assert(
      'A',
      'a wrong secret is refused',
      auth?.tnzCallbackAccepted(SECRET, SENDER, `${SECRET}x`, SENDER) === false
    );
    assert(
      'A',
      'a wrong sender is refused',
      auth?.tnzCallbackAccepted(SECRET, SENDER, SECRET, `x${SENDER}`) === false
    );
    assert(
      'A',
      'a missing presented secret is refused',
      auth?.tnzCallbackAccepted(SECRET, SENDER, null, SENDER) === false
    );
    assert(
      'A',
      "an EMPTY configured pair is not satisfied by an empty presented pair ('' === '' is the GTC-270 hole)",
      auth?.tnzCallbackAccepted('', '', '', '') === false
    );
    assert(
      'A',
      'a prefix of the secret is refused',
      auth?.tnzCallbackAccepted(SECRET, SENDER, SECRET.slice(0, -1), SENDER) === false
    );

    // A fully credentialed, well-formed report — used to prove the refusals are refusals.
    const goodReport = () =>
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: mid(),
        Destination: DEST,
      });

    // ───────────────────────────────────────────────────────────────────────────────────────
    section('Layer B: fails closed through the route');
    // ───────────────────────────────────────────────────────────────────────────────────────

    delete process.env.TNZ_CALLBACK_SECRET;
    process.env.TNZ_CALLBACK_SENDER = SENDER;
    let r = await postAndWatch(goodReport());
    assert(
      'B',
      'TNZ_CALLBACK_SECRET UNSET: a fully credentialed report gets 401 and writes nothing',
      r.status === 401 && r.nothingWritten
    );

    process.env.TNZ_CALLBACK_SECRET = SECRET;
    delete process.env.TNZ_CALLBACK_SENDER;
    r = await postAndWatch(goodReport());
    assert(
      'B',
      'TNZ_CALLBACK_SENDER UNSET: a fully credentialed report gets 401 and writes nothing',
      r.status === 401 && r.nothingWritten
    );

    process.env.TNZ_CALLBACK_SECRET = '';
    process.env.TNZ_CALLBACK_SENDER = SENDER;
    r = await postAndWatch(goodReport(), { authorization: '' });
    assert(
      'B',
      'TNZ_CALLBACK_SECRET EMPTY: an empty credential gets 401 and writes nothing',
      r.status === 401 && r.nothingWritten
    );

    // From here on the credential is configured.
    process.env.TNZ_CALLBACK_SECRET = SECRET;
    process.env.TNZ_CALLBACK_SENDER = SENDER;

    // ───────────────────────────────────────────────────────────────────────────────────────
    section('Layer C: authentication, headers AND body');
    // ───────────────────────────────────────────────────────────────────────────────────────

    r = await postAndWatch(goodReport(), { authorization: null });
    assert(
      'C',
      'no Authorization header: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    r = await postAndWatch(goodReport(), { authorization: 'not-the-secret' });
    assert(
      'C',
      'a wrong Authorization header: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    r = await postAndWatch(goodReport(), { sender: 'someone-else@sender.invalid' });
    assert(
      'C',
      'a wrong X-Sender header: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: 'not-the-secret',
        Sender: SENDER,
        MessageID: mid(),
        Destination: DEST,
      })
    );
    assert(
      'C',
      'headers right, body APIKey wrong: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: 'someone-else@sender.invalid',
        MessageID: mid(),
        Destination: DEST,
      })
    );
    assert(
      'C',
      'headers right, body Sender wrong: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    const noKey = goodReport();
    delete noKey.APIKey;
    r = await postAndWatch(noKey);
    assert(
      'C',
      'headers right, body carries no APIKey: 401, nothing written',
      r.status === 401 && r.nothingWritten
    );
    r = await postAndWatch(null, { authorization: 'not-the-secret', raw: 'this is not json' });
    assert(
      'C',
      'bad headers AND an unreadable body: 401, not 500 — the credential is checked first',
      r.status === 401 && r.nothingWritten
    );

    // ───────────────────────────────────────────────────────────────────────────────────────
    section('Layer D: delivery reports');
    // ───────────────────────────────────────────────────────────────────────────────────────

    // The fixture send: an existing event and member, and the NUDGE_SENT_AUTO row sendSms writes.
    const MATCHED = mid();
    const member = await prisma.personEvent.findFirst({
      select: { eventId: true, personId: true },
    });
    if (member) {
      const fixture = await prisma.inviteEvent.create({
        data: {
          eventId: member.eventId,
          personId: member.personId,
          type: 'NUDGE_SENT_AUTO',
          metadata: { messageId: MATCHED, provider: 'tnz', phoneNumber: DEST, gtc264Fixture: RUN },
        },
        select: { id: true },
      });
      fixtureInviteEventId = fixture.id;
    }

    const matchedEnvelope = buildTnzDeliveryEnvelope({
      APIKey: SECRET,
      Sender: SENDER,
      MessageID: MATCHED,
      Destination: DEST,
    });
    const first = await post(matchedEnvelope);
    const matchedRows = await rowsFor(MATCHED);
    assert(
      'D',
      'a report whose MessageID matches a send: 200 and exactly one row',
      first?.status === 200 && matchedRows.length === 1
    );
    const row = matchedRows[0];
    assert(
      'D',
      'that row carries MessageID, Destination, Status, Result, Detail and JobNumber verbatim, and providerSentAt from SentTimeUTC-RFC3339',
      first?.status === 200 &&
        row?.provider === 'tnz' &&
        row?.providerMessageId === MATCHED &&
        row?.destination === DEST &&
        row?.status === 'SUCCESS' &&
        row?.result === 'delivered' &&
        row?.detail === 'SMSParts:1' &&
        row?.providerJobNumber === '10C7B9A0' &&
        row?.providerSentAt?.toISOString() === '2025-06-03T21:16:55.000Z' &&
        row?.receivedAt instanceof Date
    );
    assert(
      'D',
      'that row is linked to its send — inviteEventId, eventId and personId',
      first?.status === 200 &&
        fixtureInviteEventId !== null &&
        row?.inviteEventId === fixtureInviteEventId &&
        row?.eventId === member?.eventId &&
        row?.personId === member?.personId
    );

    const blacklisted = mid();
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: blacklisted,
        Destination: DEST,
        Status: 'FAILED',
        Result: 'Destination is blacklisted',
      })
    );
    const blRows = await rowsFor(blacklisted);
    const afterBl = await counts();
    assert(
      'D',
      'a FAILED "Destination is blacklisted" report is stored — and writes no SmsOptOut, no smsOptedOut, no SMS_SEND_FAILED',
      r.status === 200 &&
        blRows.length === 1 &&
        blRows[0].status === 'FAILED' &&
        blRows[0].result === 'Destination is blacklisted' &&
        afterBl.optOuts === start.optOuts &&
        afterBl.optedOut === start.optedOut &&
        afterBl.invites === start.invites + (fixtureInviteEventId ? 1 : 0)
    );

    const unmatched = mid();
    const um = await post(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: unmatched,
        Destination: DEST,
      })
    );
    const umRows = await rowsFor(unmatched);
    assert(
      'D',
      'a report matching no send: 200, stored with null links — not thrown',
      um?.status === 200 &&
        umRows.length === 1 &&
        umRows[0].inviteEventId === null &&
        umRows[0].eventId === null &&
        umRows[0].personId === null
    );

    const retry = await post(matchedEnvelope);
    assert(
      'D',
      "the same report again (TNZ's retry): 200, and still exactly one row",
      retry?.status === 200 && (await rowsFor(MATCHED)).length === 1
    );

    const twoStep = mid();
    const pend = await post(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: twoStep,
        Destination: DEST,
        Status: 'PENDING',
        Result: '',
      })
    );
    const done = await post(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: twoStep,
        Destination: DEST,
      })
    );
    assert(
      'D',
      'PENDING then SUCCESS for one message: two rows',
      pend?.status === 200 && done?.status === 200 && (await rowsFor(twoStep)).length === 2
    );

    const odd = mid();
    const oddRes = await post(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: odd,
        Destination: DEST,
        Result: 'A Result TNZ never documented',
      })
    );
    const oddRows = await rowsFor(odd);
    assert(
      'D',
      'an undocumented Result: 200, stored verbatim',
      oddRes?.status === 200 &&
        oddRows.length === 1 &&
        oddRows[0].result === 'A Result TNZ never documented'
    );

    r = await postAndWatch(
      buildTnzDeliveryEnvelope({ APIKey: SECRET, Sender: SENDER, MessageID: '', Destination: DEST })
    );
    assert(
      'D',
      'a credentialed report with no MessageID: 500, nothing written',
      r.status === 500 && r.nothingWritten
    );
    r = await postAndWatch({
      ...buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: mid(),
        Destination: DEST,
      }),
      Status: 7,
    });
    assert(
      'D',
      'a credentialed report whose Status is not a string: 500, nothing written',
      r.status === 500 && r.nothingWritten
    );
    r = await postAndWatch(null, {
      raw: '<?xml version="1.0"?><Webhook><Type>SMS</Type></Webhook>',
    });
    assert(
      'D',
      'a credentialed XML body (a Sender set to XML, D2): 500, nothing written',
      r.status === 500 && r.nothingWritten
    );
    r = await postAndWatch([goodReport()]);
    assert(
      'D',
      'a credentialed JSON array: 500, nothing written',
      r.status === 500 && r.nothingWritten
    );
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: `${RUN}-nul\u0000`,
        Destination: DEST,
      })
    );
    assert(
      'D',
      'a database failure (a NUL byte Postgres refuses): 500, never 2xx',
      r.status === 500 && r.nothingWritten
    );

    // ───────────────────────────────────────────────────────────────────────────────────────
    section(
      'Layer E: replies and other Types — a reply kept, a STOP recorded, the rest acknowledged'
    );
    // ───────────────────────────────────────────────────────────────────────────────────────

    startCapture();
    const reply = await postAndWatch(
      buildTnzReplyEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: MATCHED,
        ReceivedID: mid(),
        Destination: DEST,
        Message: REPLY_TEXT,
      })
    );
    const stop = await postAndWatch(
      buildTnzReplyEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        MessageID: MATCHED,
        ReceivedID: mid(),
        Destination: DEST,
        Message: 'STOP',
      })
    );
    const inbound = await postAndWatch(
      buildTnzReplyEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        Type: 'SMSInbound',
        MessageID: '',
        Destination: DEST,
        Message: REPLY_TEXT,
      })
    );
    stopCapture();
    /*
     * ⚠ MOVED BY [[GTC-288]] — founder rulings 2026-10-01 (Q1/Q2: every other reply is kept, from
     * this ticket on; narrowed at the plan to a reply tied to a guest and an event by MessageID)
     * and 2026-09-12 (an opt-out is account-wide, recorded on the number). They read "SMSReply:
     * 202, and nothing written anywhere" and "an SMSReply reading STOP: 202, and Zone 7 untouched
     * — opt-outs are GTC-288’s".
     */
    let kept: any[] = [];
    try {
      kept = await (prisma as any).textReply.findMany({ where: { providerMessageId: MATCHED } });
    } catch {
      kept = [];
    }
    assert(
      'E',
      'a matched SMSReply: 200, kept once, Zone 7 untouched',
      reply.status === 200 &&
        reply.nothingWritten &&
        kept.length === 1 &&
        kept[0].body === REPLY_TEXT &&
        kept[0].eventId === member?.eventId &&
        kept[0].personId === member?.personId
    );
    let stopRows: any[] = [];
    let stopLogged = 0;
    try {
      stopRows = await prisma.smsOptOut.findMany({
        where: { phoneNumber: DEST, providerMessageId: MATCHED, optedInAt: null } as any,
      });
      stopLogged = await prisma.inviteEvent.count({
        where: {
          type: 'SMS_OPT_OUT_RECEIVED',
          eventId: member?.eventId,
          metadata: { path: ['providerMessageId'], equals: MATCHED },
        },
      });
    } catch {
      stopRows = [];
    }
    assert(
      'E',
      'an SMSReply reading STOP: 200, recorded account-wide, linked by MessageID',
      stop.status === 200 &&
        stopRows.length === 1 &&
        stopRows[0].attribution === 'MESSAGE_ID' &&
        stopRows[0].eventId === member?.eventId &&
        stopRows[0].personId === member?.personId &&
        stopLogged === 1
    );
    assert(
      'E',
      'SMSInbound: 202, and nothing written',
      inbound.status === 202 && inbound.nothingWritten
    );
    // ⚠ MOVED BY [[GTC-288]] — founder ruling 2026-10-01 (a reply tied to a guest by MessageID is
    // kept, and answered 200). It read `reply.status === 202`; the label and both log checks stand.
    assert(
      'E',
      'the reply text reaches no log line, while the arrival itself is logged',
      reply.status === 200 &&
        captured.some((l) => l.includes('SMSReply received')) &&
        !captured.some((l) => l.includes(REPLY_TEXT))
    );
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        Type: 'Email',
        MessageID: mid(),
        Destination: DEST,
      })
    );
    assert('E', 'Type=Email: 202, nothing written', r.status === 202 && r.nothingWritten);
    r = await postAndWatch(
      buildTnzDeliveryEnvelope({
        APIKey: SECRET,
        Sender: SENDER,
        Type: 'CarrierPigeon',
        MessageID: mid(),
        Destination: DEST,
      })
    );
    assert('E', 'an undocumented Type: 202, nothing written', r.status === 202 && r.nothingWritten);
  } finally {
    stopCapture();
    if (savedSecret === undefined) delete process.env.TNZ_CALLBACK_SECRET;
    else process.env.TNZ_CALLBACK_SECRET = savedSecret;
    if (savedSender === undefined) delete process.env.TNZ_CALLBACK_SENDER;
    else process.env.TNZ_CALLBACK_SENDER = savedSender;
    await prisma.smsDeliveryReport.deleteMany({
      where: { providerMessageId: { startsWith: RUN } },
    });
    // [[GTC-288]]: this suite's own reply, opt-out and its ledger row, each found by this run's ids.
    try {
      await (prisma as any).textReply.deleteMany({
        where: { providerMessageId: { startsWith: RUN } },
      });
    } catch {
      /* the model is absent before GTC-288's migration */
    }
    try {
      await prisma.smsOptOut.deleteMany({
        where: { phoneNumber: DEST, providerMessageId: { startsWith: RUN } } as any,
      });
    } catch {
      /* the column is absent before GTC-288's migration */
    }
    await prisma.inviteEvent.deleteMany({
      where: {
        type: 'SMS_OPT_OUT_RECEIVED',
        metadata: { path: ['providerMessageId'], string_starts_with: RUN },
      },
    });
    if (fixtureInviteEventId)
      await prisma.inviteEvent.delete({ where: { id: fixtureInviteEventId } });
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  section('Layer F: the surface and the source');
  // ─────────────────────────────────────────────────────────────────────────────────────────

  const routeSrc = read(ROUTE_FILE);
  const storeSrc = read(STORE_FILE);
  const routeCode = routeSrc === null ? null : codeOnly(routeSrc);

  assert(
    'F',
    'the route exports POST and no GET (Next answers 405)',
    typeof route?.POST === 'function' && !('GET' in (route ?? { GET: 1 }))
  );
  assert(
    'F',
    'src/app/api/sms/inbound/route.ts is gone — deleted, not guarded',
    !existsSync(join(ROOT, 'src/app/api/sms/inbound/route.ts'))
  );
  assert(
    'F',
    "the credential predicates are imported RELATIVELY, '../tnz-callback-auth' — one level, so the scanner follows them",
    routeCode !== null &&
      routeCode.includes("from '../tnz-callback-auth'") &&
      existsSync(join(ROOT, AUTH_FILE))
  );
  assert(
    'F',
    'the route imports nothing that sends and calls no fetch',
    routeCode !== null &&
      !/from '[^']*(send-sms|tnz-client|twilio|resend|email)[^']*'|\bfetch\(/.test(routeCode)
  );
  assert(
    'F',
    "the route never reads a reply's text (`Message` is not accessed)",
    routeCode !== null && !/\.Message\b|\[['"]Message['"]\]/.test(routeCode)
  );
  assert(
    'F',
    'the route and its store name no Zone 7 symbol',
    routeCode !== null &&
      storeSrc !== null &&
      ![routeCode, codeOnly(storeSrc)].some((c) =>
        /SmsOptOut|smsOptOut|smsOptedOut|opt-out-service|opt-out-keywords/.test(c)
      )
  );

  const routeFiles: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === 'route.ts') routeFiles.push(relative(ROOT, p));
    }
  };
  walk(join(ROOT, 'src/app/api'));
  const parsers = routeFiles.filter((f) =>
    /tnz-webhook-envelope|tnz-delivery-contract/.test(read(f) ?? '')
  );
  assert(
    'F',
    'exactly one route under src/app/api reads the TNZ envelope — this one',
    parsers.length === 1 && parsers[0] === ROUTE_FILE
  );

  const envExample = read('.env.example') ?? '';
  assert(
    'F',
    '.env.example names TNZ_CALLBACK_SECRET and TNZ_CALLBACK_SENDER',
    /^TNZ_CALLBACK_SECRET=/m.test(envExample) && /^TNZ_CALLBACK_SENDER=/m.test(envExample)
  );
  const constants = read('GATHER-BUILD-CONSTANTS.md') ?? '';
  assert(
    'F',
    "GATHER-BUILD-CONSTANTS.md's environment table names both",
    constants.includes('| `TNZ_CALLBACK_SECRET` |') &&
      constants.includes('| `TNZ_CALLBACK_SENDER` |')
  );
  let entry: { authType?: string; methods?: string[]; authEvidence?: string[] } | undefined;
  try {
    entry = (
      JSON.parse(read('route-classifications.json') ?? '[]') as Array<{ filePath: string }>
    ).find((e) => e.filePath === ROUTE_FILE);
  } catch {
    entry = undefined;
  }
  assert(
    'F',
    'route-classifications.json classifies the route CUSTOM, POST, with evidence naming tnzCallbackAccepted',
    entry?.authType === 'CUSTOM' &&
      JSON.stringify(entry?.methods) === '["POST"]' &&
      (entry?.authEvidence ?? []).join(' ').includes('tnzCallbackAccepted')
  );

  // ─────────────────────────────────────────────────────────────────────────────────────────
  section('Layer G: nothing left the process, and nothing was left behind');
  // ─────────────────────────────────────────────────────────────────────────────────────────

  const end = await counts();
  assert('G', 'the provider trap counted no outbound request', trapCount() === 0);
  assert('G', 'SmsDeliveryReport is back to the count found', end.reports === start.reports);
  assert(
    'G',
    'SmsOptOut and Person.smsOptedOut are as found — Zone 7 untouched by the whole run',
    end.optOuts === start.optOuts && end.optedOut === start.optedOut
  );
  assert(
    'G',
    'InviteEvent is back to the count found — the fixture is gone',
    end.invites === start.invites
  );
  const endTextReplies = await textReplyCount();
  assert(
    'G',
    'TextReply is back to the count found',
    startTextReplies !== null && endTextReplies === startTextReplies
  );

  console.log('\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m');
  console.log(`Total tests: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
  if (failed > 0) {
    console.log('\n\x1b[31mRED:\x1b[0m');
    redAssertions.forEach((a) => console.log(`  ${a}`));
  }
  await prisma.$disconnect();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
  console.error('suite crashed:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
