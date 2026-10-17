/**
 * [[GTC-258]] with the failed-text red — a text TNZ reports did not arrive is treated the way a
 * bounced email is.
 *
 * THE RULINGS (SCOPED 2026-10-02, verbatim in GTC-258):
 *  Q1 "Together (Recommended)" — the records and the board are built in one pass.
 *  Q2 "Like email, plus one retry (Recommended)" — a failed invitation reads red "never got it",
 *     with the resend button; a number that doesn't work is never texted again; a number on TNZ's
 *     opt-out list isn't shown red, but isn't texted again; a fault on TNZ's or Gather's side reads
 *     red but doesn't block the number; the "please decide" follow-up and the thank-you are re-sent
 *     by email if their text didn't arrive.
 *  Q3 "Count it as sent (Recommended)" — reached the network, never confirmed: sent, not red.
 * And the plan rulings of the same day: Q1 (TNZ's opt-out list is the guest's own STOP), Q3
 * ("Control Deleted" reads red, is not blocked and is NOT retried), Q8 (W1 to W9 as proposed).
 *
 * THE LAYERS:
 *  A  the mapping, pure — TNZ's verdict to Gather's outcome, the board's map, the block, the retry
 *  B  a report reaches its send's record, through the route
 *  C  a report that arrives before the record (note 7) is applied once the record exists
 *  D  the board and the door
 *  E  "not texted again" — the chooser, the preview, sendSms's fence, the host's nudge, the
 *     thank-you's channel, and a START
 *  F  every text path records its send; NUDGE_SENT_AUTO is retired; the reply join moved
 *  G  the one retry — the thank-you and the follow-up, by email, once
 *  H  [[GTC-335]]'s replay
 *  W  the words, W1 to W9, and where they are read
 *  Z  nothing left the process, and every fixture is gone
 *
 * NOTHING IS SENT. `liveBehindTrap` walls the process and opens the switch for this process only.
 * `globalThis.fetch` is replaced before any sender loads: TNZ's endpoint answers 200 with a fresh
 * MessageID per call, Resend's records the email and answers 200; anything else is counted and
 * refused. TNZ's reports and replies are posted to the route IN PROCESS with made-up credentials.
 * Every row written is this file's own: its own events, people and numbers (unique to the run),
 * removed by id. No sweep is called unscoped; the one that cannot be scoped (the thank-you
 * dispatcher) is called only behind a zero-count precondition, as test:cron-health does.
 *
 * Run: npx tsx tests/text-outcome-test.ts
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { NextRequest } from 'next/server';
import { liveBehindTrap, trapCount, trapHits } from './helpers/provider-trap';

// ── The process, before any module that captures configuration is loaded ─────────────────────
for (const k of ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_PHONE_NUMBER']) {
  delete process.env[k];
}
process.env.TNZ_AUTH_TOKEN = 'gtc258-fake-tnz-token';
process.env.RESEND_API_KEY = 're_GTC258_sentinel_key_000000000000';
process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || 'gtc258-secret';

const ROOT = join(__dirname, '..');
const TAG = 'GTC258';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BASE = 'http://localhost:3000';
// Made up for this process. Never a real value, and never read from .env.
const SECRET = 'gtc258-made-up-callback-secret';
const SENDER = 'gtc258-made-up@sender.invalid';

// The ruled words (plan ruling Q8), byte-exact, typed here so a changed constant fails.
const W1 = "My text didn't arrive. That number doesn't seem to work, so I won't text it again.";
const W2 = "My text didn't go through. That was a problem on my side, not with their number.";
const W3 = "My text didn't arrive, and the phone network didn't say why.";
const W4 = "I can't email this address anymore, and texts to their number don't arrive.";
const W5_FIRST = "First auto-reminder didn't arrive";
const W5_SECOND = "Second auto-reminder didn't arrive";
const W6 = "Nudged, but the text didn't arrive";
const W7 = 'Sent by email';
const W8 = "The text didn't arrive";
const W9 = "Texts to their number don't arrive, and they have no email.";

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
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

// ── The transports, stubbed ────────────────────────────────────────────────────────────────────
type Email = { to: string[]; subject: string; text: string };
const emails: Email[] = [];
const tnzSends: { to: string; message: string; messageId: string }[] = [];
let otherCalls = 0;
let midSeq = 0;
const RUN = `gtc258-${Date.now().toString(36)}`;

function stubFetch() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url);
    if (u.includes('api.tnz.co.nz')) {
      const body = JSON.parse(init?.body ?? '{}');
      const messageId = `${RUN}-tnz-${++midSeq}`;
      tnzSends.push({
        to: body?.MessageData?.Destinations?.[0]?.Recipient ?? '',
        message: body?.MessageData?.Message ?? '',
        messageId,
      });
      return new Response(JSON.stringify({ Result: 'Success', MessageID: messageId }), {
        status: 200,
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

async function main() {
  liveBehindTrap();
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
  const CONTRACT: any = await load('../src/lib/sms/tnz-delivery-contract');
  const TO: any = await load('../src/lib/sms/text-outcome');
  const TB: any = await load('../src/lib/eligibility/text-block');
  const TS: any = await load('../src/lib/sms/text-send-record');
  const TFW: any = await load('../src/lib/sms/text-failure-words');
  const TN: any = await load('../src/lib/glance/text-note');
  const EBW: any = await load('../src/lib/eligibility/email-block-words');
  const DF: any = await load('../src/lib/glance/delivery-fact');
  const R: any = await load('../src/lib/glance/read');
  const RS: any = await load('../src/lib/press/resend');
  const RE: any = await load('../src/lib/glance/replay-entry');
  const RW: any = await load('../src/lib/glance/rewind');
  const AP: any = await load('../src/lib/preflight/ask-preview');
  const DIS: any = await load('../src/lib/press/dispatch');
  const SMS: any = await load('../src/lib/sms/send-sms');
  const CC: any = await load('../src/lib/eligibility/channel-chooser');
  const MN: any = await load('../src/lib/sms/manual-nudge-recipient');
  const WU: any = await load('../src/lib/wrap-up');
  const DBS: any = await load('../src/lib/sms/decide-by-sender');
  const HEALTH: any = await load('../src/lib/send-health');
  const ROUTE: any = await load('../src/app/api/sms/tnz-webhook/route');

  const savedSecret = process.env.TNZ_CALLBACK_SECRET;
  const savedSender = process.env.TNZ_CALLBACK_SENDER;
  process.env.TNZ_CALLBACK_SECRET = SECRET;
  process.env.TNZ_CALLBACK_SENDER = SENDER;

  async function post(body: unknown): Promise<number | null> {
    if (!ROUTE || typeof ROUTE.POST !== 'function') return null;
    try {
      const res = await ROUTE.POST(
        new NextRequest(`${BASE}/api/sms/tnz-webhook`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: SECRET,
            'x-sender': SENDER,
          },
          body: JSON.stringify(body),
        })
      );
      return res.status;
    } catch {
      return null;
    }
  }
  const report = (messageId: string, destination: string, status: string, result: string) =>
    CONTRACT.buildTnzDeliveryEnvelope({
      APIKey: SECRET,
      Sender: SENDER,
      MessageID: messageId,
      Destination: destination,
      Status: status,
      Result: result,
    });
  const replyEnv = (messageId: string, from: string, words: string) =>
    CONTRACT.buildTnzReplyEnvelope({
      APIKey: SECRET,
      Sender: SENDER,
      MessageID: messageId,
      ReceivedID: `${RUN}-rcv-${++midSeq}`,
      Destination: from,
      Message: words,
    });

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

  const created = {
    events: [] as string[],
    persons: [] as string[],
    users: [] as string[],
    addresses: [] as string[],
  };
  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  const sentAt = ago(240);
  const stamp = Date.now();
  const mail = (who: string) => `gtc258+${who}+${stamp}@example.test`;

  try {
    // ══ Preconditions ════════════════════════════════════════════════════════════════════════
    for (let i = 0; i < 40; i++) phone();
    phoneSeq = 10;
    const heldElsewhere = await prisma.person.count({ where: { phoneNumber: { in: NUMBERS } } });
    const optOutsAlready = await prisma.smsOptOut.count({
      where: { phoneNumber: { in: NUMBERS } },
    });
    let blocksAlready = 0;
    try {
      blocksAlready = await db.textBlock.count({ where: { phoneNumber: { in: NUMBERS } } });
    } catch {
      blocksAlready = 0;
    }
    assert(
      '0',
      "PRECONDITION: no Person, SmsOptOut or TextBlock holds any of this run's numbers",
      heldElsewhere === 0 && optOutsAlready === 0 && blocksAlready === 0,
      `${heldElsewhere} people, ${optOutsAlready} opt-outs, ${blocksAlready} blocks`
    );
    NUMBERS.length = 0;

    // ══ LAYER A — the mapping, pure ══════════════════════════════════════════════════════════
    const verdict = (status: string, result: string | null) =>
      CONTRACT.interpretTnzResult(status, result);
    const kindOf = (status: string, result: string | null) =>
      TO.textOutcomeOf(verdict(status, result));
    const RESULTS: Record<string, any> = CONTRACT?.TNZ_RESULTS ?? {};
    const byBucket = (b: string) =>
      Object.entries(RESULTS)
        .filter(([, r]) => r.bucket === b)
        .map(([k, r]) => [k, r.status] as const);

    assert(
      'A',
      'A1 every one of the seventeen documented Results has a kind',
      ok(
        () =>
          Object.keys(RESULTS).length === 17 &&
          Object.entries(RESULTS).every(
            ([k, r]) => typeof kindOf(r.status, k) === 'string' && kindOf(r.status, k) !== null
          )
      )
    );
    assert(
      'A',
      'A2 delivered and SentOK are TEXT_ARRIVED; delivered-to-network is TEXT_REACHED_NETWORK (Q3)',
      ok(
        () =>
          kindOf('SUCCESS', 'delivered') === 'TEXT_ARRIVED' &&
          kindOf('SUCCESS', 'SentOK') === 'TEXT_ARRIVED' &&
          kindOf('SUCCESS', 'Sent OK') === 'TEXT_ARRIVED' &&
          kindOf('SUCCESS', 'delivered-to-network') === 'TEXT_REACHED_NETWORK'
      )
    );
    assert(
      'A',
      'A3 every DEAD_CHANNEL, OPTED_OUT and OUR_FAULT Result, Undelivered and Control Deleted, to its kind',
      ok(
        () =>
          byBucket('DEAD_CHANNEL').length === 5 &&
          byBucket('DEAD_CHANNEL').every(([k, s]) => kindOf(s, k) === 'TEXT_DEAD_CHANNEL') &&
          kindOf('FAILED', 'Destination is blacklisted') === 'TEXT_OPTED_OUT' &&
          byBucket('OUR_FAULT').length === 6 &&
          byBucket('OUR_FAULT').every(([k, s]) => kindOf(s, k) === 'TEXT_OUR_FAULT') &&
          kindOf('FAILED', 'Undelivered') === 'TEXT_UNDELIVERED' &&
          kindOf('SUCCESS', 'Control Deleted') === 'TEXT_CANCELLED'
      )
    );
    assert(
      'A',
      'A4 an unknown Result splits on Status: Failed is TEXT_FAILED_UNRECOGNISED, Success is ' +
        'TEXT_UNRECOGNISED; PENDING gives no outcome',
      ok(
        () =>
          kindOf('FAILED', 'A Result TNZ never documented') === 'TEXT_FAILED_UNRECOGNISED' &&
          kindOf('FAILED', null) === 'TEXT_FAILED_UNRECOGNISED' &&
          kindOf('SUCCESS', 'A Result TNZ never documented') === 'TEXT_UNRECOGNISED' &&
          kindOf('PENDING', '') === null
      )
    );
    const BOARD_RED = [
      'TEXT_DEAD_CHANNEL',
      'TEXT_OUR_FAULT',
      'TEXT_UNDELIVERED',
      'TEXT_CANCELLED',
      'TEXT_FAILED_UNRECOGNISED',
    ];
    const KINDS = [
      ...BOARD_RED,
      'TEXT_ARRIVED',
      'TEXT_REACHED_NETWORK',
      'TEXT_OPTED_OUT',
      'TEXT_UNRECOGNISED',
    ];
    assert(
      'A',
      "A5 the board's map, value by value: the five failures are NOT_DELIVERED, the other four null",
      ok(() => {
        const M = DF.TEXT_DELIVERY_STATE_MEANS;
        return (
          Object.keys(M).length === 9 &&
          KINDS.every((k) => M[k] === (BOARD_RED.includes(k) ? 'NOT_DELIVERED' : null))
        );
      }),
      show(DF?.TEXT_DELIVERY_STATE_MEANS)
    );
    assert(
      'A',
      'A6 the block map: only TEXT_DEAD_CHANNEL and TEXT_OPTED_OUT block, each with its reason',
      ok(() => {
        const M = TO.TEXT_OUTCOME_BLOCKS;
        return (
          Object.keys(M).length === 9 &&
          KINDS.every(
            (k) =>
              M[k] ===
              (k === 'TEXT_DEAD_CHANNEL'
                ? 'DEAD_CHANNEL'
                : k === 'TEXT_OPTED_OUT'
                  ? 'OPTED_OUT'
                  : null)
          )
        );
      }),
      show(TO?.TEXT_OUTCOME_BLOCKS)
    );
    assert(
      'A',
      'A7 the retry map: the thank-you on DEAD, OPTED_OUT, OUR_FAULT, UNDELIVERED and ' +
        'FAILED_UNRECOGNISED; the follow-up on the same less OPTED_OUT; TEXT_CANCELLED in neither',
      ok(() => {
        const M = TO.TEXT_OUTCOME_RETRIES;
        const thank = [
          'TEXT_DEAD_CHANNEL',
          'TEXT_OPTED_OUT',
          'TEXT_OUR_FAULT',
          'TEXT_UNDELIVERED',
          'TEXT_FAILED_UNRECOGNISED',
        ];
        const follow = thank.filter((k) => k !== 'TEXT_OPTED_OUT');
        return (
          Object.keys(M).length === 9 &&
          KINDS.every(
            (k) =>
              M[k].THANK_YOU === thank.includes(k) && M[k].DECIDE_BY_FOLLOWUP === follow.includes(k)
          ) &&
          M.TEXT_CANCELLED.THANK_YOU === false &&
          M.TEXT_CANCELLED.DECIDE_BY_FOLLOWUP === false
        );
      }),
      show(TO?.TEXT_OUTCOME_RETRIES)
    );
    const textRow = (deliveryState: string | null) => ({
      personEventId: 'pe',
      createdAt: sentAt,
      rejectedAt: null,
      withheldAt: null,
      withheldWhy: null,
      deliveryState,
    });
    assert(
      'A',
      'A8 deliveryFactFrom: TEXT_DEAD_CHANNEL is NOT_DELIVERED, TEXT_OPTED_OUT is null',
      ok(
        () =>
          DF.deliveryFactFrom(textRow('TEXT_DEAD_CHANNEL')).failure === 'NOT_DELIVERED' &&
          DF.deliveryFactFrom(textRow('TEXT_OPTED_OUT')).failure === null
      )
    );
    assert(
      'A',
      'A9 CONTROL: an EMAIL row BOUNCED still reads NOT_DELIVERED, and COMPLAINED null',
      ok(
        () =>
          DF.deliveryFactFrom(textRow('BOUNCED')).failure === 'NOT_DELIVERED' &&
          DF.deliveryFactFrom(textRow('COMPLAINED')).failure === null
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
        data: {
          name: `Kate ${label}`,
          email: o.withUser ? mail(`${label}-host`) : null,
          userId,
        },
      });
      created.persons.push(host.id);
      const endDate = o.endDate ?? new Date(now.getTime() + 200 * HOUR);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: endDate,
          endDate,
          hostId: host.id,
          status: (o.status ?? 'CONFIRMING') as any,
          sentAt,
        },
      });
      created.events.push(ev.id);
      const team = await prisma.team.create({ data: { eventId: ev.id, name: 'Mains' } });
      const hostPe = await prisma.personEvent.create({
        data: { personId: host.id, eventId: ev.id, role: 'HOST' },
      });
      return { ev, team, host, hostPe };
    }
    type Ev = Awaited<ReturnType<typeof mkEvent>>;

    async function mkMember(
      e: Ev,
      name: string,
      o: {
        email?: string | null;
        phone?: string | null;
        response?: 'PENDING' | 'ACCEPTED' | 'MAYBE';
        followupSentAt?: Date | null;
      } = {}
    ) {
      const first = name.split(' ')[0].toLowerCase();
      const p = await prisma.person.create({
        data: {
          name,
          email: o.email === undefined ? mail(`${first}-${e.ev.id.slice(-5)}`) : o.email,
          phoneNumber: o.phone ?? null,
        },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: { personId: p.id, eventId: e.ev.id, role: 'PARTICIPANT', sentAt },
      });
      const item = await prisma.item.create({
        data: { teamId: e.team.id, name: 'pavlova', kind: 'ITEM' },
      });
      const a = await prisma.assignment.create({
        data: {
          itemId: item.id,
          personId: p.id,
          response: o.response ?? 'PENDING',
          decideByFollowupSentAt: o.followupSentAt ?? null,
          createdAt: ago(300),
        },
      });
      const token = `${TAG}-${pe.id}-${stamp}`;
      await prisma.accessToken.create({
        data: { token, scope: 'PARTICIPANT', eventId: e.ev.id, personId: p.id },
      });
      return { p, pe, assignmentId: a.id, token };
    }
    type Member = Awaited<ReturnType<typeof mkMember>>;

    /** A text TNZ accepted: the row the drain (or, after this ticket, any path) leaves behind. */
    async function acceptedText(
      e: Ev,
      m: Member,
      kind: string,
      messageId: string,
      at: Date = sentAt
    ) {
      return db.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId: m.pe.id,
          kind,
          channel: 'TEXT',
          createdAt: at,
          attemptedAt: at,
          attemptCount: 1,
          acceptedAt: at,
          provider: 'tnz',
          providerMessageId: messageId,
          destination: m.p.phoneNumber,
        },
      });
    }
    async function block(address: string, reason: 'BOUNCED' | 'COMPLAINED', e: Ev) {
      const a = address.toLowerCase();
      await prisma.emailBlock.create({ data: { address: a, reason, eventId: e.ev.id } });
      created.addresses.push(a);
    }
    const rowOf = (id: string) => db.outboundMessage.findUnique({ where: { id } });
    const blockOf = async (n: string) => {
      try {
        return await db.textBlock.findUnique({ where: { phoneNumber: n } });
      } catch {
        return null;
      }
    };
    const reportsFor = (messageId: string) =>
      prisma.smsDeliveryReport.findMany({ where: { providerMessageId: messageId } });

    // ── Event B: the board. Every guest's invitation went by text and was accepted. ──
    const eB = await mkEvent('Board');
    const dee = await mkMember(eB, 'Dee Deadnumber', { email: null, phone: phone() });
    const ofa = await mkMember(eB, 'Ofa Ourfault', { email: null, phone: phone() });
    const und = await mkMember(eB, 'Una Undelivered', { email: null, phone: phone() });
    const bla = await mkMember(eB, 'Bla Blacklisted', { email: null, phone: phone() });
    const net = await mkMember(eB, 'Nat Network', { email: null, phone: phone() });
    const bem = await mkMember(eB, 'Bem Blockedanddead', { phone: phone() });
    await block(bem.p.email!, 'BOUNCED', eB);
    const bou = await mkMember(eB, 'Bou Bounced', { phone: phone() });
    await block(bou.p.email!, 'BOUNCED', eB);
    await db.outboundMessage.create({
      data: {
        eventId: eB.ev.id,
        personEventId: bou.pe.id,
        kind: 'ASK',
        channel: 'EMAIL',
        createdAt: sentAt,
        attemptedAt: sentAt,
        attemptCount: 1,
        acceptedAt: sentAt,
        provider: 'resend',
        providerMessageId: `${RUN}-bou`,
        deliveryState: 'BOUNCED',
        deliveryCheckedAt: sentAt,
      },
    });
    const MID = {
      dee: mid(),
      ofa: mid(),
      und: mid(),
      bla: mid(),
      net: mid(),
      bem: mid(),
    };
    const askDee = await acceptedText(eB, dee, 'ASK', MID.dee);
    const askOfa = await acceptedText(eB, ofa, 'ASK', MID.ofa);
    const askUnd = await acceptedText(eB, und, 'ASK', MID.und);
    const askBla = await acceptedText(eB, bla, 'ASK', MID.bla);
    const askNet = await acceptedText(eB, net, 'ASK', MID.net);
    await acceptedText(eB, bem, 'ASK', MID.bem);

    // ══ LAYER B — a report reaches the record ════════════════════════════════════════════════
    const zone7Before = {
      optOuts: await prisma.smsOptOut.count(),
      flagged: await prisma.person.count({ where: { smsOptedOut: true } }),
      invites: await prisma.inviteEvent.count(),
    };
    const sDee = await post(report(MID.dee, dee.p.phoneNumber!, 'FAILED', 'Bad Number'));
    assert(
      'B',
      'B1 CONTROL: a "Bad Number" report is answered 200 and stored',
      sDee === 200 && (await reportsFor(MID.dee)).length === 1
    );
    const rDee = await rowOf(askDee.id);
    assert(
      'B',
      'B2 the ask row reads TEXT_DEAD_CHANNEL, providerLastEvent "Bad Number", checked and done',
      rDee?.deliveryState === 'TEXT_DEAD_CHANNEL' &&
        rDee?.providerLastEvent === 'Bad Number' &&
        rDee?.deliveryCheckedAt instanceof Date &&
        rDee?.deliveryPollDoneAt instanceof Date,
      show(rDee && { s: rDee.deliveryState, e: rDee.providerLastEvent })
    );
    const repDee = (await reportsFor(MID.dee))[0];
    assert(
      'B',
      "B3 the report row is linked to its send's event and guest",
      repDee?.eventId === eB.ev.id && repDee?.personId === dee.p.id,
      show(repDee && { eventId: repDee.eventId, personId: repDee.personId })
    );
    const bkDee = await blockOf(dee.p.phoneNumber!);
    assert(
      'B',
      'B4 a DEAD_CHANNEL TextBlock exists for the number, for every host',
      bkDee?.reason === 'DEAD_CHANNEL' && bkDee?.liftedAt === null,
      show(bkDee)
    );
    await post(report(MID.bla, bla.p.phoneNumber!, 'FAILED', 'Destination is blacklisted'));
    await post(report(MID.ofa, ofa.p.phoneNumber!, 'FAILED', 'Rejected-Invalid Sender ID'));
    await post(report(MID.und, und.p.phoneNumber!, 'FAILED', 'Undelivered'));
    await post(report(MID.net, net.p.phoneNumber!, 'SUCCESS', 'delivered-to-network'));
    await post(report(MID.bem, bem.p.phoneNumber!, 'FAILED', 'Bad Number'));
    const zone7After = {
      optOuts: await prisma.smsOptOut.count(),
      flagged: await prisma.person.count({ where: { smsOptedOut: true } }),
      invites: await prisma.inviteEvent.count(),
    };
    assert(
      'B',
      'B5 CONTROL: no SmsOptOut row, no smsOptedOut flag and no InviteEvent were written by six reports',
      show(zone7Before) === show(zone7After),
      `${show(zone7Before)} → ${show(zone7After)}`
    );
    const rBla = await rowOf(askBla.id);
    const bkBla = await blockOf(bla.p.phoneNumber!);
    assert(
      'B',
      'B6 "Destination is blacklisted": TEXT_OPTED_OUT, and an OPTED_OUT block on the number',
      rBla?.deliveryState === 'TEXT_OPTED_OUT' && bkBla?.reason === 'OPTED_OUT',
      show({ s: rBla?.deliveryState, b: bkBla?.reason })
    );
    const blaPerson = await prisma.person.findUnique({ where: { id: bla.p.id } });
    assert(
      'B',
      'B7 and it writes no SmsOptOut and sets no flag — Zone 7 is written only by a STOP or a START',
      (await prisma.smsOptOut.count({ where: { phoneNumber: bla.p.phoneNumber! } })) === 0 &&
        blaPerson?.smsOptedOut === false
    );
    const rOfa = await rowOf(askOfa.id);
    assert(
      'B',
      'B8 "Rejected-Invalid Sender ID": TEXT_OUR_FAULT, and the number is not blocked',
      rOfa?.deliveryState === 'TEXT_OUR_FAULT' && (await blockOf(ofa.p.phoneNumber!)) === null,
      show(rOfa?.deliveryState)
    );
    const rNet = await rowOf(askNet.id);
    assert(
      'B',
      'B9 "delivered-to-network": TEXT_REACHED_NETWORK',
      rNet?.deliveryState === 'TEXT_REACHED_NETWORK',
      show(rNet?.deliveryState)
    );
    await post(report(MID.dee, dee.p.phoneNumber!, 'SUCCESS', 'delivered'));
    const rDee2 = await rowOf(askDee.id);
    assert(
      'B',
      'B10 a second final report for the same message changes nothing: still TEXT_DEAD_CHANNEL',
      rDee2?.deliveryState === 'TEXT_DEAD_CHANNEL' && (await reportsFor(MID.dee)).length === 2,
      show(rDee2?.deliveryState)
    );

    // ══ LAYER C — a report before the record (note 7) ════════════════════════════════════════
    const eC = await mkEvent('Early');
    const cg = await mkMember(eC, 'Cal Early', { email: null, phone: phone() });
    const MC = mid();
    const sC = await post(report(MC, cg.p.phoneNumber!, 'FAILED', 'Bad Number'));
    const repC = (await reportsFor(MC))[0];
    assert(
      'C',
      'C1 CONTROL: a report for a MessageID no record holds yet is stored, unmatched',
      sC === 200 && repC?.eventId === null && repC?.personId === null
    );
    assert(
      'C',
      'C4 the block was written at the report, before any record existed',
      (await blockOf(cg.p.phoneNumber!))?.reason === 'DEAD_CHANNEL'
    );
    const rowC = await db.outboundMessage.create({
      data: {
        eventId: eC.ev.id,
        personEventId: cg.pe.id,
        kind: 'ASK',
        channel: 'TEXT',
        createdAt: ago(1),
        attemptedAt: ago(1),
        attemptCount: 1,
        destination: cg.p.phoneNumber,
      },
    });
    await safe(() =>
      DIS.recordAcceptance(prisma, {
        id: rowC.id,
        personEventId: cg.pe.id,
        provider: 'tnz',
        providerMessageId: MC,
      })
    );
    const rC = await rowOf(rowC.id);
    const repC2 = (await reportsFor(MC))[0];
    assert(
      'C',
      'C2 then recordAcceptance writes that MessageID: the row reads the outcome, and the report is linked',
      rC?.deliveryState === 'TEXT_DEAD_CHANNEL' &&
        repC2?.eventId === eC.ev.id &&
        repC2?.personId === cg.p.id,
      show({ s: rC?.deliveryState, e: repC2?.eventId })
    );
    const cf = await mkMember(eC, 'Cat Followup', { email: null, phone: phone() });
    const MC3 = mid();
    await post(report(MC3, cf.p.phoneNumber!, 'FAILED', 'Rejected-Message Content Issue'));
    const c3 = await safe(async () => {
      const id = await TS.openTextSend(prisma, {
        eventId: eC.ev.id,
        personId: cf.p.id,
        kind: 'DECIDE_BY_FOLLOWUP',
        destination: cf.p.phoneNumber,
      });
      await TS.closeTextSend(prisma, id, { success: true, messageId: MC3, provider: 'tnz' });
      return rowOf(id);
    });
    assert(
      'C',
      'C3 the same through closeTextSend: a follow-up record reads TEXT_OUR_FAULT once its id lands',
      ok(
        () =>
          (c3 as any)?.kind === 'DECIDE_BY_FOLLOWUP' &&
          (c3 as any)?.deliveryState === 'TEXT_OUR_FAULT'
      ),
      show(c3)
    );

    // ══ LAYER D — the board and the door ═════════════════════════════════════════════════════
    const everyone = (g: any): any[] =>
      g ? [...g.households.flatMap((h: any) => h.members), ...g.unhoused] : [];
    let gB: any = null;
    try {
      gB = await R.readEventGlance(prisma, eB.ev.id, now);
    } catch (err) {
      console.error(`readEventGlance(B) threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const P = (m: { pe: { id: string } }, g: any = gB): any =>
      everyone(g).find((p: any) => p.personEventId === m.pe.id) ?? null;
    const reads = (m: Member, state: string, reasons: string[]) =>
      ok(() => P(m).state === state && show(P(m).reasons) === show(reasons));

    assert(
      'D',
      'D1 Dee — the number TNZ called bad — reads RED, reasons exactly [NOT_DELIVERED]',
      reads(dee, 'RED', ['NOT_DELIVERED']),
      show(P(dee) && { s: P(dee).state, r: P(dee).reasons })
    );
    assert(
      'D',
      'D2 and her card carries W1',
      ok(() => P(dee).textNote === W1),
      show(P(dee)?.textNote)
    );
    assert(
      'D',
      'D3 Ofa — a fault on our side — reads RED [NOT_DELIVERED] and carries W2',
      reads(ofa, 'RED', ['NOT_DELIVERED']) && ok(() => P(ofa).textNote === W2),
      show(P(ofa) && { s: P(ofa).state, n: P(ofa).textNote })
    );
    assert(
      'D',
      'D4 Una — "Undelivered", no reason given — reads RED [NOT_DELIVERED] and carries W3',
      reads(und, 'RED', ['NOT_DELIVERED']) && ok(() => P(und).textNote === W3),
      show(P(und) && { s: P(und).state, n: P(und).textNote })
    );
    assert(
      'D',
      "D5 Bla — on TNZ's opt-out list — is not red; she stands as after a STOP (SMS_OPTED_OUT)",
      ok(() => P(bla).state !== 'RED' && P(bla).chase?.standing === 'SMS_OPTED_OUT'),
      show(P(bla) && { s: P(bla).state, c: P(bla).chase })
    );
    assert(
      'D',
      'D6 CONTROL: Nat — reached the network, never confirmed — reads AMBER (Q3: counts as sent)',
      ok(() => P(net).state === 'AMBER' && P(net).textNote == null),
      show(P(net) && { s: P(net).state, n: P(net).textNote })
    );
    const doorDeps = { textingConfiguredFor: () => true };
    const door = (m: Member) =>
      safe(() =>
        RS.readDoor(prisma, { eventId: eB.ev.id, personId: m.p.id, baseUrl: BASE }, doorDeps)
      );
    const dDee: any = await door(dee);
    assert(
      'D',
      'D7 the dead-number door opens on NOT_DELIVERED and does not offer "Send it as a text"',
      ok(
        () =>
          dDee.ok === true &&
          dDee.view.reason === 'NOT_DELIVERED' &&
          !dDee.view.actions.includes('PHONE')
      ),
      show(dDee?.view?.actions ?? dDee)
    );
    const dOfa: any = await door(ofa);
    assert(
      'D',
      'D8 the our-fault door offers "Send it as a text" — the number is fine',
      ok(
        () =>
          dOfa.ok === true &&
          dOfa.view.reason === 'NOT_DELIVERED' &&
          dOfa.view.actions.includes('PHONE')
      ),
      show(dOfa?.view?.actions ?? dOfa)
    );
    assert(
      'D',
      'D9 Bem — a blocked address AND a dead number — reads RED, and her email note is W4',
      reads(bem, 'RED', ['NOT_DELIVERED']) && ok(() => P(bem).emailNote === W4),
      show(P(bem) && { s: P(bem).state, n: P(bem).emailNote })
    );
    assert(
      'D',
      'D10 CONTROL: Bou — an email bounce — still reads RED [NOT_DELIVERED] with the email words',
      reads(bou, 'RED', ['NOT_DELIVERED']) &&
        ok(
          () =>
            P(bou).emailNote === "I can't email this address anymore, so I'll text them instead."
        ),
      show(P(bou) && { s: P(bou).state, n: P(bou).emailNote })
    );

    // ══ LAYER E — not texted again ═══════════════════════════════════════════════════════════
    const person = (o: Record<string, unknown>) => ({
      email: null,
      phoneNumber: '+64211234567',
      smsOptedOut: false,
      emailOptedOut: false,
      emailBlocked: false,
      emailReported: false,
      numberDead: false,
      ...o,
    });
    const membership = (p: Record<string, unknown>) => ({
      id: 'pe-x',
      personId: 'p-x',
      role: 'PARTICIPANT',
      householdId: null,
      householdRole: null,
      nudgeMark: null,
      holdsItems: true,
      chaseException: null,
      person: person(p),
    });
    const chooserEvent = (m: any) => ({
      hostId: 'h',
      households: [],
      memberships: [m],
      chaseWhenNoMobileDefault: null,
    });
    const withEmail = membership({ email: 'x@example.test', numberDead: true });
    assert(
      'E',
      'E1 the chooser, a dead number with an email: the ask goes by EMAIL and so does the chase',
      ok(() => {
        const ask = CC.chooseAskRoute(withEmail, chooserEvent(withEmail));
        const chase = CC.chooseChaseRoute(withEmail, chooserEvent(withEmail));
        return (
          ask.kind === 'DIRECT' &&
          ask.channel === 'EMAIL' &&
          chase.kind === 'DIRECT' &&
          chase.channel === 'EMAIL'
        );
      })
    );
    const noEmail = membership({ numberDead: true });
    assert(
      'E',
      "E2 a dead number and no email: the ask is the host's line and the chase is NONE, both PHONE_UNUSABLE",
      ok(() => {
        const ask = CC.chooseAskRoute(noEmail, chooserEvent(noEmail));
        const chase = CC.chooseChaseRoute(noEmail, chooserEvent(noEmail));
        return (
          ask.kind === 'HOST_LIST' &&
          ask.why === 'PHONE_UNUSABLE' &&
          chase.kind === 'NONE' &&
          chase.why === 'PHONE_UNUSABLE'
        );
      })
    );
    assert(
      'E',
      'E3 textAskReachOf refuses a dead number as PHONE_UNUSABLE',
      ok(() => {
        const r = CC.textAskReachOf(person({ numberDead: true }));
        return r.ok === false && r.why === 'PHONE_UNUSABLE';
      })
    );
    let pv: any = null;
    try {
      pv = await AP.readAskPreview(prisma, eB.ev.id, BASE);
    } catch (err) {
      console.error(`readAskPreview(B) threw: ${(err as Error).message.split('\n')[0]}`);
    }
    assert(
      'E',
      "E4 readAskPreview reads both blocks: Dee is the host's line PHONE_UNUSABLE; Bla's chase is SMS_OPTED_OUT",
      ok(
        () =>
          pv.hostList.some(
            (l: any) => l.personEventId === dee.pe.id && l.why === 'PHONE_UNUSABLE'
          ) &&
          pv.chase.byMembership[bla.pe.id]?.kind === 'NONE' &&
          pv.chase.byMembership[bla.pe.id]?.why === 'SMS_OPTED_OUT'
      ),
      show({
        dee: pv?.hostList?.find((l: any) => l.personEventId === dee.pe.id),
        bla: pv?.chase?.byMembership?.[bla.pe.id],
      })
    );
    const tnzBefore = tnzSends.length;
    const e5: any = await safe(() =>
      SMS.sendSms({ to: dee.p.phoneNumber!, message: 'x', eventId: eB.ev.id, personId: dee.p.id })
    );
    const e5Invites = await prisma.inviteEvent.count({
      where: { eventId: eB.ev.id, personId: dee.p.id },
    });
    assert(
      'E',
      'E5 sendSms to a dead number, the gate open: NUMBER_DEAD, nothing reaches TNZ, no InviteEvent',
      ok(() => e5.success === false && e5.blocked === 'NUMBER_DEAD') &&
        tnzSends.length === tnzBefore &&
        e5Invites === 0,
      show(e5)
    );
    const e6: any = await safe(() =>
      SMS.sendSms({ to: bla.p.phoneNumber!, message: 'x', eventId: eB.ev.id, personId: bla.p.id })
    );
    assert(
      'E',
      "E6 sendSms to a number on TNZ's opt-out list: OPTED_OUT, nothing reaches TNZ",
      ok(() => e6.success === false && e6.blocked === 'OPTED_OUT') && tnzSends.length === tnzBefore,
      show(e6)
    );
    const ctl = await mkMember(eB, 'Cy Control', { email: null, phone: phone() });
    // Its own baseline: before the fence, E5 and E6 reach TNZ too, and a control must not hang on them.
    const tnzBeforeE7 = tnzSends.length;
    const e7: any = await safe(() =>
      SMS.sendSms({ to: ctl.p.phoneNumber!, message: 'x', eventId: eB.ev.id, personId: ctl.p.id })
    );
    assert(
      'E',
      'E7 CONTROL: sendSms to an unblocked number reaches the stubbed TNZ once and is accepted',
      ok(() => e7.success === true) && tnzSends.length === tnzBeforeE7 + 1,
      show(e7)
    );
    assert(
      'E',
      "E8 the drain's two readings refuse a TEXT ask for a dead number: the preview puts her on the " +
        "host's list (its first gate) and blockedToWithheld maps NUMBER_DEAD to PHONE_UNUSABLE (its last)",
      ok(
        () =>
          pv.hostList.some((l: any) => l.personEventId === dee.pe.id) &&
          DIS.blockedToWithheld('NUMBER_DEAD') === 'PHONE_UNUSABLE' &&
          HEALTH.SMS_BLOCK_COUNTS.NUMBER_DEAD === false
      )
    );
    const eN = await mkEvent('Nudge');
    const nWith = await mkMember(eN, 'Nia Withemail', { phone: dee.p.phoneNumber });
    const nNone = await mkMember(eN, 'Noa Noemail', { email: null, phone: dee.p.phoneNumber });
    const ch = async (m: Member) => {
      const r = await MN.resolveManualNudgeRecipient(eN.ev.id, m.p.id);
      return r.ok ? MN.chooseManualNudgeChannel({ ...r.person, emailBlocked: false }) : 'refused';
    };
    const chWith = await safe(() => ch(nWith));
    const chNone = await safe(() => ch(nNone));
    assert(
      'E',
      "E9 the host's nudge: a dead number with an email goes by email; with none, there is no channel",
      chWith === 'email' && chNone === 'none',
      show({ chWith, chNone })
    );
    const eW = await mkEvent('Links');
    const wDead = await mkMember(eW, 'Wes Wrapdead', { phone: dee.p.phoneNumber });
    const wBla = await mkMember(eW, 'Wil Wrapblacklisted', { phone: bla.p.phoneNumber });
    const guestOf = (m: Member) => ({
      person: {
        id: m.p.id,
        name: m.p.name,
        email: m.p.email,
        phoneNumber: m.p.phoneNumber,
        smsOptedOut: false,
      },
      assignments: [],
    });
    await safe(() => WU.generateWrapUpLinks(eW.ev.id, [guestOf(wDead), guestOf(wBla)]));
    const links = await prisma.wrapUpLink.findMany({ where: { eventId: eW.ev.id } });
    assert(
      'E',
      "E10 the thank-you's channel: a dead number and a number on TNZ's list both get email",
      links.length === 2 && links.every((l) => l.channel === 'email'),
      show(links.map((l) => l.channel))
    );
    await prisma.wrapUpLink.deleteMany({ where: { eventId: eW.ev.id } });
    await post(replyEnv(MID.bla, bla.p.phoneNumber!, 'START'));
    const bkBla2 = await blockOf(bla.p.phoneNumber!);
    assert(
      'E',
      "E11 a START from the number lifts its OPTED_OUT block — TNZ's page: a START takes it off the list",
      bkBla2?.reason === 'OPTED_OUT' && bkBla2?.liftedAt instanceof Date,
      show(bkBla2)
    );
    await post(replyEnv(MID.dee, dee.p.phoneNumber!, 'START'));
    const bkDee2 = await blockOf(dee.p.phoneNumber!);
    assert(
      'E',
      "E12 a START never lifts a dead number's block",
      bkDee2?.reason === 'DEAD_CHANNEL' && bkDee2?.liftedAt === null,
      show(bkDee2)
    );
    assert(
      'E',
      'E13 CONTROL: SmsOptOut still has exactly its two writers (opt-out-service.ts, tnz-reply-record.ts)',
      ok(() => {
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(name)) files.push(relative(ROOT, p));
          }
        };
        walk(join(ROOT, 'src'));
        const writers = files.filter((f) =>
          /smsOptOut\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/.test(
            code(f)
          )
        );
        return (
          writers.length === 2 &&
          writers.includes('src/lib/sms/opt-out-service.ts') &&
          writers.includes('src/lib/sms/tnz-reply-record.ts')
        );
      })
    );

    // ══ LAYER F — every path records its send ════════════════════════════════════════════════
    const eF = await mkEvent('Paths', { withUser: true });
    const fu = await mkMember(eF, 'Fay Followup', {
      email: null,
      phone: phone(),
      response: 'MAYBE',
    });
    const f1 = await safe(() =>
      DBS.sendDecideByFollowup(
        {
          personId: fu.p.id,
          personName: fu.p.name,
          channel: 'TEXT',
          phoneNumber: fu.p.phoneNumber,
          email: null,
          replyTo: null,
          eventId: eF.ev.id,
          eventName: eF.ev.name,
          hostId: eF.host.id,
          hostName: eF.host.name,
          participantToken: fu.token,
          itemName: 'pavlova',
          decideByAt: new Date(now.getTime() + DAY),
          assignmentIds: [fu.assignmentId],
        },
        now
      )
    );
    const fuSend = tnzSends.find((s) => s.to === fu.p.phoneNumber);
    const fuRow = await db.outboundMessage.findFirst({
      where: { personEventId: fu.pe.id, kind: 'DECIDE_BY_FOLLOWUP' },
    });
    assert(
      'F',
      'F1 a follow-up text writes a DECIDE_BY_FOLLOWUP row: TEXT, accepted, with its MessageID and number',
      ok(() => (f1 as any).success === true) &&
        !!fuSend &&
        fuRow?.channel === 'TEXT' &&
        fuRow?.acceptedAt instanceof Date &&
        fuRow?.providerMessageId === fuSend?.messageId &&
        fuRow?.destination === fu.p.phoneNumber,
      show({ f1, fuRow })
    );

    // The thank-you dispatcher cannot be scoped, so it runs only when nothing outside this
    // fixture is waiting (test:cron-health's precondition), and its own fixture link is due.
    const eT = await mkEvent('Thanks', { endDate: ago(48), status: 'COMPLETE' });
    const ty = await mkMember(eT, 'Tui Thanks', { email: null, phone: phone() });
    const pendingElsewhere = await prisma.wrapUpLink.count({ where: { dispatched: false } });
    assert(
      'F',
      'PRECONDITION: zero undispatched WrapUpLink rows anywhere before the thank-you dispatcher runs',
      pendingElsewhere === 0,
      `${pendingElsewhere} undispatched`
    );
    let tyRow: any = null;
    let tySend: any = null;
    let QH: any = null;
    try {
      QH = await import('../src/lib/sms/quiet-hours');
    } catch {
      QH = null;
    }
    let awake: Date | null = null;
    let asleep: Date | null = null;
    for (let h = 0; h < 24; h++) {
      const t = new Date(now.getTime() + h * HOUR);
      if (QH?.isQuietHours(t)) asleep = asleep ?? t;
      else awake = awake ?? t;
    }
    if (pendingElsewhere === 0 && awake) {
      await prisma.wrapUpLink.create({
        data: {
          token: `${TAG}-wl-${stamp}`,
          eventId: eT.ev.id,
          personId: ty.p.id,
          guestName: ty.p.name,
          guestEmail: null,
          guestPhone: ty.p.phoneNumber,
          channel: 'sms',
          expiresAt: new Date(now.getTime() + 30 * DAY),
          createdAt: ago(1),
        },
      });
      await safe(() => WU.dispatchPendingWrapUpMessages(awake));
      tySend = tnzSends.find((s) => s.to === ty.p.phoneNumber);
      tyRow = await db.outboundMessage.findFirst({
        where: { personEventId: ty.pe.id, kind: 'THANK_YOU' },
      });
    }
    assert(
      'F',
      'F2 a thank-you text writes a THANK_YOU row: TEXT, accepted, with its MessageID',
      !!tySend &&
        tyRow?.channel === 'TEXT' &&
        tyRow?.acceptedAt instanceof Date &&
        tyRow?.providerMessageId === tySend?.messageId,
      show({ tySend, tyRow })
    );
    const nudgeRoute = code('src/app/api/events/[id]/people/[personId]/nudge/route.ts');
    const fh = await mkMember(eF, 'Hal Hostnudge', { email: null, phone: phone() });
    const f3 = await safe(async () => {
      const id = await TS.openTextSend(prisma, {
        eventId: eF.ev.id,
        personId: fh.p.id,
        kind: 'HOST_NUDGE',
        destination: fh.p.phoneNumber,
      });
      await TS.closeTextSend(prisma, id, {
        success: true,
        messageId: `${RUN}-f3`,
        provider: 'tnz',
      });
      return rowOf(id);
    });
    assert(
      'F',
      "F3 the host's nudge opens a HOST_NUDGE record before its one sendSms and closes it after; the " +
        'helper records an accepted send',
      /openTextSend\([\s\S]*?HOST_NUDGE[\s\S]*?\)/.test(nudgeRoute) &&
        nudgeRoute.indexOf('openTextSend(') < nudgeRoute.indexOf('sendSms(') &&
        nudgeRoute.indexOf('sendSms(') < nudgeRoute.indexOf('closeTextSend(') &&
        ok(
          () =>
            (f3 as any)?.kind === 'HOST_NUDGE' &&
            (f3 as any)?.acceptedAt instanceof Date &&
            (f3 as any)?.providerMessageId === `${RUN}-f3`
        ),
      show(f3)
    );
    const autoRows = await prisma.inviteEvent.count({
      where: {
        type: 'NUDGE_SENT_AUTO',
        OR: [
          { eventId: eB.ev.id, personId: ctl.p.id },
          { eventId: eF.ev.id, personId: fu.p.id },
        ],
      },
    });
    assert(
      'F',
      'F4 sendSms writes no NUDGE_SENT_AUTO on an accepted send — the ask’s false row is retired',
      ok(() => e7.success === true && (f1 as any).success === true) && autoRows === 0,
      `${autoRows} NUDGE_SENT_AUTO rows`
    );
    assert(
      'F',
      'F5 no file in src/ joins on InviteEvent metadata.messageId any more',
      ok(() => {
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(name)) files.push(relative(ROOT, p));
          }
        };
        walk(join(ROOT, 'src'));
        return files.every((f) => !/path:\s*\[\s*'messageId'\s*\]/.test(code(f)));
      })
    );
    let stopRows: any[] = [];
    if (fuSend) {
      await post(replyEnv(fuSend.messageId, fu.p.phoneNumber!, 'STOP'));
      stopRows = await prisma.smsOptOut.findMany({ where: { phoneNumber: fu.p.phoneNumber! } });
    }
    assert(
      'F',
      'F6 a STOP replying to a follow-up text is linked to its event and guest, through the send record ' +
        '(the InviteEvent pointer null: not through the retired row)',
      stopRows.length === 1 &&
        stopRows[0].attribution === 'MESSAGE_ID' &&
        stopRows[0].inviteEventId === null &&
        stopRows[0].eventId === eF.ev.id &&
        stopRows[0].personId === fu.p.id,
      show(stopRows.map((r) => ({ a: r.attribution, e: r.eventId })))
    );

    // ══ LAYER G — the one retry ══════════════════════════════════════════════════════════════
    const eG = await mkEvent('Retry', { withUser: true, endDate: ago(48), status: 'COMPLETE' });
    const scopeG = { eventIds: [eG.ev.id] };
    async function failedThankYou(m: Member, outcome: string) {
      const row = await acceptedText(eG, m, 'THANK_YOU', mid(), ago(2));
      await db.outboundMessage.update({
        where: { id: row.id },
        data: { deliveryState: outcome, deliveryCheckedAt: ago(1), deliveryPollDoneAt: ago(1) },
      });
      await prisma.wrapUpLink.create({
        data: {
          token: `${TAG}-wl-${m.pe.id}`,
          eventId: eG.ev.id,
          personId: m.p.id,
          guestName: m.p.name,
          guestEmail: m.p.email,
          guestPhone: m.p.phoneNumber,
          channel: 'sms',
          dispatched: true,
          dispatchedAt: ago(2),
          expiresAt: new Date(now.getTime() + 30 * DAY),
          createdAt: ago(3),
        },
      });
      return row;
    }
    const gt = await mkMember(eG, 'Gia Thanked', { phone: phone() });
    const gtRow = await failedThankYou(gt, 'TEXT_DEAD_CHANNEL');
    const go = await mkMember(eG, 'Gus Optedout', { phone: phone() });
    await failedThankYou(go, 'TEXT_OUR_FAULT');
    await prisma.emailOptOut.create({ data: { personId: go.p.id, eventId: eG.ev.id } });
    const gb = await mkMember(eG, 'Gem Blocked', { phone: phone() });
    await failedThankYou(gb, 'TEXT_UNDELIVERED');
    await block(gb.p.email!, 'BOUNCED', eG);

    const emailsTo = (m: Member) =>
      emails.filter((e) => e.to.map((t) => t.toLowerCase()).includes(m.p.email!.toLowerCase()))
        .length;
    let g4Quiet: any = null;
    if (asleep) g4Quiet = await safe(() => WU.retryUndeliveredThankYous(asleep, scopeG));
    const afterQuiet = emailsTo(gt);
    const retriesAfterQuiet = await db.outboundMessage.count({
      where: { eventId: eG.ev.id, retryOfId: { not: null } },
    });
    const g1a: any = awake ? await safe(() => WU.retryUndeliveredThankYous(awake, scopeG)) : null;
    const g1b: any = awake ? await safe(() => WU.retryUndeliveredThankYous(awake, scopeG)) : null;
    const gtRetry = await db.outboundMessage.findFirst({ where: { retryOfId: gtRow.id } });
    assert(
      'G',
      'G1 the thank-you: one email across two runs, and a THANK_YOU EMAIL row whose retryOfId is the text',
      emailsTo(gt) === 1 &&
        gtRetry?.kind === 'THANK_YOU' &&
        gtRetry?.channel === 'EMAIL' &&
        gtRetry?.acceptedAt instanceof Date,
      show({ emails: emailsTo(gt), gtRetry, g1a, g1b })
    );
    const goRetry = await db.outboundMessage.findFirst({
      where: { personEventId: go.pe.id, retryOfId: { not: null } },
    });
    assert(
      'G',
      'G2 an email opt-out for the event: no email, and the retry is withheld EMAIL_OPTED_OUT',
      emailsTo(go) === 0 && goRetry?.withheldWhy === 'EMAIL_OPTED_OUT',
      show(goRetry)
    );
    const gbRetry = await db.outboundMessage.findFirst({
      where: { personEventId: gb.pe.id, retryOfId: { not: null } },
    });
    assert(
      'G',
      'G3 an EmailBlock on the address: no email, and the retry is withheld EMAIL_BLOCKED',
      emailsTo(gb) === 0 && gbRetry?.withheldWhy === 'EMAIL_BLOCKED',
      show(gbRetry)
    );
    assert(
      'G',
      'G4 quiet hours: nothing sent and nothing written; the daytime run sent it',
      !!asleep &&
        ok(() => g4Quiet && !('threw' in g4Quiet)) &&
        afterQuiet === 0 &&
        retriesAfterQuiet === 0 &&
        emailsTo(gt) === 1,
      show({ asleep, g4Quiet, afterQuiet, retriesAfterQuiet })
    );
    const summary: any = await safe(() => WU.getDispatchSummary(eG.ev.id));
    assert(
      'G',
      'G10 the thank-you panel learns it: Gia went by email after her text, and nobody here is failed',
      ok(
        () =>
          summary.guests.find((g: any) => g.personId === gt.p.id)?.sentByEmail === true &&
          summary.failed === 0
      ),
      show(summary?.guests ?? summary)
    );

    // The follow-up: the decide-by is three days out, so a retry is still owed.
    const eD = await mkEvent('Decide', {
      withUser: true,
      endDate: new Date(now.getTime() + 3 * DAY + 120 * HOUR),
    });
    const scopeD = { eventIds: [eD.ev.id] };
    async function failedFollowup(e: Ev, m: Member, outcome: string) {
      const row = await acceptedText(e, m, 'DECIDE_BY_FOLLOWUP', mid(), ago(2));
      await db.outboundMessage.update({
        where: { id: row.id },
        data: { deliveryState: outcome, deliveryCheckedAt: ago(1), deliveryPollDoneAt: ago(1) },
      });
      return row;
    }
    const dm = await mkMember(eD, 'Dot Maybe', {
      phone: phone(),
      response: 'MAYBE',
      followupSentAt: ago(2),
    });
    await failedFollowup(eD, dm, 'TEXT_OUR_FAULT');
    const dOpt = await mkMember(eD, 'Dan Optlist', {
      phone: phone(),
      response: 'MAYBE',
      followupSentAt: ago(2),
    });
    await failedFollowup(eD, dOpt, 'TEXT_OPTED_OUT');
    const dAns = await mkMember(eD, 'Dia Answered', {
      phone: phone(),
      response: 'ACCEPTED',
      followupSentAt: ago(2),
    });
    await failedFollowup(eD, dAns, 'TEXT_DEAD_CHANNEL');
    const eDp = await mkEvent('Passed', { withUser: true, endDate: new Date(now.getTime() + DAY) });
    const dPast = await mkMember(eDp, 'Dex Pastdue', {
      phone: phone(),
      response: 'MAYBE',
      followupSentAt: ago(30),
    });
    await failedFollowup(eDp, dPast, 'TEXT_DEAD_CHANNEL');

    const d1: any = await safe(() => DBS.retryUndeliveredFollowups(now, scopeD));
    const d2: any = await safe(() => DBS.retryUndeliveredFollowups(now, scopeD));
    await safe(() => DBS.retryUndeliveredFollowups(now, { eventIds: [eDp.ev.id] }));
    const retryOf = (m: Member) =>
      db.outboundMessage.findFirst({ where: { personEventId: m.pe.id, retryOfId: { not: null } } });
    const dmRetry = await retryOf(dm);
    assert(
      'G',
      'G5 the follow-up, a fault on our side, still a maybe before its decide-by: one email across two runs',
      emailsTo(dm) === 1 && dmRetry?.kind === 'DECIDE_BY_FOLLOWUP' && dmRetry?.channel === 'EMAIL',
      show({ emails: emailsTo(dm), dmRetry, d1, d2 })
    );
    assert(
      'G',
      "G6 the follow-up to a number on TNZ's opt-out list: no email and no retry row (a text opt-out stops it)",
      emailsTo(dOpt) === 0 && (await retryOf(dOpt)) === null
    );
    const dAnsRetry = await retryOf(dAns);
    assert(
      'G',
      'G7 the follow-up whose guest answered meanwhile: no email; the retry is withheld ANSWERED',
      emailsTo(dAns) === 0 && dAnsRetry?.withheldWhy === 'ANSWERED',
      show(dAnsRetry)
    );
    assert(
      'G',
      'G8 the follow-up whose decide-by has passed: no email, and no retry row',
      emailsTo(dPast) === 0 && (await retryOf(dPast)) === null
    );
    assert(
      'G',
      "G9 the retry email counts on the run's email tally (GTC-339)",
      ok(() => d1.tally.email.toSend === 1 && d1.tally.email.gotOut === 1),
      show(d1?.tally ?? d1)
    );

    // ══ LAYER H — the replay ═════════════════════════════════════════════════════════════════
    const BEFORE = ago(20);
    const AFTER = ago(5);
    const timed = {
      id: 'r-h',
      personEventId: 'pe-h',
      createdAt: sentAt,
      rejectedAt: null,
      withheldAt: null,
      withheldWhy: null,
      deliveryState: 'TEXT_DEAD_CHANNEL',
      deliveryCheckedAt: ago(10),
    };
    const failureAt = (since: Date) => {
      const row = DF.deliveryRowAsAt(timed, since);
      return row ? DF.deliveryFactFrom(row).failure : 'gone';
    };
    assert(
      'H',
      'H1 a TEXT_DEAD_CHANNEL state recorded after `since` is dropped; recorded before, it stands',
      ok(() => failureAt(BEFORE) === null && failureAt(AFTER) === 'NOT_DELIVERED')
    );
    const eH = await mkEvent('Replay');
    const hx = await mkMember(eH, 'Hex Replayed', { email: null, phone: phone() });
    const hRow = await acceptedText(eH, hx, 'ASK', mid());
    await db.outboundMessage.update({
      where: { id: hRow.id },
      data: {
        deliveryState: 'TEXT_DEAD_CHANNEL',
        providerLastEvent: 'Bad Number',
        deliveryCheckedAt: ago(10),
        deliveryPollDoneAt: ago(10),
      },
    });
    try {
      await db.textBlock.create({
        data: {
          phoneNumber: hx.p.phoneNumber,
          reason: 'DEAD_CHANNEL',
          firstSeenAt: ago(10),
          eventId: eH.ev.id,
        },
      });
    } catch {
      /* the table is the migration's */
    }
    const facts: any = await safe(() => RW.rewindGuestFacts(prisma, eH.ev.id, BEFORE));
    assert(
      'H',
      'H2 a TextBlock first seen after `since` is outside the past preview',
      ok(() => facts.later.textBlockNumbers.has(hx.p.phoneNumber)),
      show(facts?.later ? [...(facts.later.textBlockNumbers ?? [])] : facts)
    );
    const gH = await R.readEventGlance(prisma, eH.ev.id, now).catch(() => null);
    const glanceEventH = {
      status: 'CONFIRMING',
      sentAt,
      endDate: eH.ev.endDate,
      decideByOffsetHours: null,
      nudgePace: null,
    };
    const steps: any = await safe(
      async () => (await RE.readGlanceReplay(prisma, eH.ev.id, BEFORE, gH, glanceEventH, now)).steps
    );
    const hStep = Array.isArray(steps)
      ? steps.find((s: any) => s.personEventId === hx.pe.id)
      : null;
    const moved: any = await safe(async () =>
      (await RW.rewindGuestFacts(prisma, eH.ev.id, BEFORE)).movedSince.get(hx.pe.id)
    );
    assert(
      'H',
      'H3 Hex plays once, AMBER to RED, at the time Gather recorded the failure',
      hStep?.from === 'AMBER' && hStep?.to === 'RED' && moved === ago(10).getTime(),
      show({ hStep, moved })
    );

    // ══ LAYER W — the words and where they are read ══════════════════════════════════════════
    assert(
      'W',
      'W1 to W3: the board’s text notes, byte-exact, and textNoteFor picks them by outcome',
      ok(
        () =>
          TN.textNoteFor('TEXT_DEAD_CHANNEL') === W1 &&
          TN.textNoteFor('TEXT_OUR_FAULT') === W2 &&
          TN.textNoteFor('TEXT_CANCELLED') === W2 &&
          TN.textNoteFor('TEXT_UNDELIVERED') === W3 &&
          TN.textNoteFor('TEXT_FAILED_UNRECOGNISED') === W3 &&
          TN.textNoteFor('TEXT_ARRIVED') === null &&
          TN.textNoteFor('TEXT_OPTED_OUT') === null &&
          TN.textNoteFor('BOUNCED') === null
      )
    );
    assert(
      'W',
      'W4: emailNoteFor gives a blocked address on a dead number its own sentence',
      ok(
        () =>
          EBW.EMAIL_BLOCKED_NUMBER_DEAD_WORDS === W4 &&
          EBW.emailNoteFor({
            state: 'BLOCKED',
            textable: false,
            smsOptedOut: false,
            numberDead: true,
          }) === W4
      )
    );
    assert(
      'W',
      'W5 to W9: the person modal, the thank-you panel and the nudge refusal words, byte-exact',
      ok(
        () =>
          TFW.FIRST_REMINDER_DID_NOT_ARRIVE === W5_FIRST &&
          TFW.SECOND_REMINDER_DID_NOT_ARRIVE === W5_SECOND &&
          TFW.NUDGE_DID_NOT_ARRIVE === W6 &&
          TFW.THANK_YOU_SENT_BY_EMAIL === W7 &&
          TFW.TEXT_DID_NOT_ARRIVE === W8 &&
          TFW.NUDGE_NUMBER_DEAD_NO_EMAIL === W9
      )
    );
    const modal = code('src/components/plan/PersonInviteDetailModal.tsx');
    const detail = code('src/app/api/events/[id]/people/[personId]/invite-detail/route.ts');
    const page = code('src/app/plan/[eventId]/page.tsx');
    assert(
      'W',
      'W5/W6 are read: the person modal shows them off the invite-detail route’s failure facts',
      /FIRST_REMINDER_DID_NOT_ARRIVE/.test(modal) &&
        /SECOND_REMINDER_DID_NOT_ARRIVE/.test(modal) &&
        /NUDGE_DID_NOT_ARRIVE/.test(modal) &&
        /readTextFailures\(/.test(detail)
    );
    assert(
      'W',
      'W7/W8 are read: the thank-you panel says "Sent by email", and a failed retry carries W8',
      /THANK_YOU_SENT_BY_EMAIL/.test(page) && /TEXT_DID_NOT_ARRIVE/.test(code('src/lib/wrap-up.ts'))
    );
    assert(
      'W',
      "W9 is read: the host's nudge refuses a dead number with no email in W9",
      /NUDGE_NUMBER_DEAD_NO_EMAIL/.test(nudgeRoute)
    );
    const hn = await mkMember(eF, 'Rae Reminded', { email: null, phone: phone() });
    const leg1 = await acceptedText(eF, hn, 'CHASE_FIRST', mid());
    await db.outboundMessage.update({
      where: { id: leg1.id },
      data: { deliveryState: 'TEXT_DEAD_CHANNEL', deliveryCheckedAt: ago(1) },
    });
    const tf: any = await safe(() => TS.readTextFailures(prisma, hn.pe.id));
    assert(
      'W',
      'readTextFailures: a first reminder TNZ reported failed reads failed; the second and the nudge do not',
      ok(() => tf.firstReminder === true && tf.secondReminder === false && tf.hostNudge === false),
      show(tf)
    );
  } finally {
    if (savedSecret === undefined) delete process.env.TNZ_CALLBACK_SECRET;
    else process.env.TNZ_CALLBACK_SECRET = savedSecret;
    if (savedSender === undefined) delete process.env.TNZ_CALLBACK_SENDER;
    else process.env.TNZ_CALLBACK_SENDER = savedSender;

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
    try {
      await db.textReply.deleteMany({ where: { providerMessageId: { startsWith: RUN } } });
    } catch {
      /* absent */
    }
    if (NUMBERS.length) {
      await prisma.smsOptOut.deleteMany({ where: { phoneNumber: { in: NUMBERS } } });
      try {
        await db.textBlock.deleteMany({ where: { phoneNumber: { in: NUMBERS } } });
      } catch {
        /* the table is the migration's */
      }
    }
    if (created.addresses.length) {
      await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    }
    if (created.persons.length) {
      await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    }
    if (created.users.length) {
      await prisma.user.deleteMany({ where: { id: { in: created.users } } });
    }
    const leftEvents = await prisma.event.count({ where: { id: { in: created.events } } });
    const leftPersons = await prisma.person.count({ where: { id: { in: created.persons } } });
    const leftReports = await prisma.smsDeliveryReport.count({
      where: { providerMessageId: { startsWith: RUN } },
    });
    let leftBlocks = 0;
    try {
      leftBlocks = await db.textBlock.count({ where: { phoneNumber: { in: NUMBERS } } });
    } catch {
      leftBlocks = 0;
    }
    assert(
      'Z',
      `every fixture row was removed (${leftEvents} events, ${leftPersons} people, ${leftReports} reports, ${leftBlocks} blocks left)`,
      leftEvents === 0 && leftPersons === 0 && leftReports === 0 && leftBlocks === 0
    );
    assert(
      'Z',
      'nothing left the process: the trap counted no hit, and no call went anywhere but the two stubs',
      trapCount() === 0 && otherCalls === 0,
      show({ hits: trapHits(), otherCalls })
    );
    await prisma.$disconnect();
  }

  console.log(`\n  ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.error(`\n\x1b[31mRED — ${failed} assertion(s) failed:\x1b[0m`);
    for (const r of redAssertions) console.error(`  ✗ ${r}`);
    process.exit(1);
  }
  console.log(
    '\x1b[32mGREEN — a text TNZ says did not arrive is treated as a bounced email is.\x1b[0m'
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
