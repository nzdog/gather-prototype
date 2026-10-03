/**
 * [[GTC-288]] — a guest's text reply through TNZ's one webhook: a STOP recorded account-wide, a
 * START that undoes it, and every other reply kept when it answers one of Gather's texts.
 *
 * Run: npm run test:tnz-reply
 *
 * THE RULINGS UNDER TEST (verbatim in GTC-288):
 *   - 2026-09-12: an opt-out is account-wide, on the phone number, not per host. A STOP that
 *     matches no message is still recorded, with its link to a person and event marked unresolved.
 *   - 2026-10-01 Q3: a STOP is a reply that BEGINS WITH STOP, OPTOUT, OPT OUT, OPT-OUT, UNSUB or
 *     UNSUBSCRIBE, in any case.
 *   - 2026-10-01 Q4: a START undoes a STOP for every host, but only when the WHOLE reply, trimmed,
 *     in any case, is START, SUBSCRIBE, UNSTOP, OPTIN, OPT IN or OPT-IN.
 *   - 2026-10-01 Q1/Q2, narrowed at the plan: a reply is kept only when it can be tied to a guest
 *     and an event by MessageID. An unmatched reply is not kept.
 *
 * THE LAYERS:
 *   0  controls — the trap, and fixture numbers nobody else holds
 *   W  the words, pure (`src/lib/sms/opt-out-keywords.ts`)
 *   S  a STOP through the route, and what every reader then sees, for every host
 *   T  a START
 *   K  kept replies
 *   M  the migration's shape: legacy per-host rows, a deleted host, a deleted guest
 *   R  [[GTC-335]]'s replay
 *   Z  structure, the trap, and the tables back as found
 *
 * ── NOTHING SENDS, AND NOTHING IS REAL ─────────────────────────────────────────────────────
 *
 * No server, no network, no TNZ. The provider trap is installed and the live gate is never opened,
 * so `sendSms` stops at the switch after its opt-out check — which is the check under test. Every
 * payload is built by the recorded fixture factory with literal overrides. The webhook credential
 * is two made-up strings set in THIS process only.
 *
 * ⚠ A STOP sets the flag on EVERY Person holding the number, under every host. So every number
 * here is made for this run, and control 0 asserts no Person outside the fixture holds one —
 * gather_dev has real people on numbers other suites share.
 *
 * Every row this suite writes is its own, removed by id or by this run's numbers. Layer Z asserts
 * the tables are back to the counts found.
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { NextRequest } from 'next/server';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap, trapCount } from './helpers/provider-trap';
import { buildTnzReplyEnvelope } from '../src/lib/sms/tnz-delivery-contract';

installProviderTrap();

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
    redAssertions.push(`[${layer}] ${label}`);
  }
}

/** Runs a check; a throw is a red with its message, never a crash. */
async function check(layer: string, label: string, fn: () => Promise<boolean> | boolean) {
  let ok = false;
  let detail: string | undefined;
  try {
    ok = (await fn()) === true;
  } catch (e) {
    detail = `threw: ${e instanceof Error ? e.message.split('\n')[0].slice(0, 160) : 'unknown'}`;
  }
  assert(layer, label, ok, detail);
}

function section(title: string) {
  console.log(`\n\x1b[1m\x1b[33m${title}\x1b[0m`);
}

const ROOT = join(__dirname, '..');
const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf-8');
  } catch {
    return '';
  }
};
/** Source with comments removed. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

// Made up for this process. Never a real value, and never read from .env.
const SECRET = 'gtc288-made-up-callback-secret';
const SENDER = 'gtc288-made-up@sender.invalid';

const RUN = `gtc288t-${Date.now().toString(36)}`;
let seq = 0;
const id = (tag: string) => `${RUN}-${tag}-${++seq}`;

// Numbers made for this run: +64 27 then six digits from the clock, then the index.
const STEM = String(100000 + (Date.now() % 900000));
const nz = (i: number) => `+6427${STEM}${i}`;
const au = (i: number) => `+614${STEM}${i}${i}`;
/** S5's control guests: a fresh number on each reader's event, never opted out. */
const ctrl = (i: number) => `+6429${STEM}${i}`;
const NUMBERS = Array.from({ length: 10 }, (_, i) => nz(i))
  .concat(Array.from({ length: 8 }, (_, i) => `+6428${STEM}${i}`))
  .concat(Array.from({ length: 6 }, (_, i) => ctrl(i)))
  .concat([au(1)]);
const ADDRESS = (tag: string) => `gtc288-${tag}-${RUN}@example.com`;
const ADDRESSES = ['door-l', 'door-c', 'note-l', 'note-c'].map(ADDRESS);
const BASE = 'http://localhost:3000';
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const N = {
  shared: nz(0), // gA under host A, gB under host B, and later L under host B
  unmatched: nz(1),
  empty: nz(2),
  omitted: nz(3),
  genuine: nz(4),
  mismatchSent: nz(5),
  mismatchFrom: nz(6),
  startTime: nz(7),
  nothingInForce: nz(8),
  cycle: nz(9),
  legacyTwo: `+6428${STEM}0`,
  kept: `+6428${STEM}1`,
  keptOther: `+6428${STEM}2`,
  threeHosts: `+6428${STEM}3`,
  deletedHost: `+6428${STEM}4`,
  replayed: `+6428${STEM}5`,
  replayedBack: `+6428${STEM}6`,
  notE164: '021 000 0288',
  australian: au(1),
};

type Any = any; // the modules under test change shape in this ticket; the suite reads them loosely

async function main() {
  const load = async (path: string): Promise<Any> => {
    try {
      return await import(path);
    } catch {
      return null;
    }
  };
  const route: Any = await load('../src/app/api/sms/tnz-webhook/route');
  const kw: Any = await load('../src/lib/sms/opt-out-keywords');
  const sms: Any = await load('../src/lib/sms/send-sms');
  const optOutService: Any = await load('../src/lib/sms/opt-out-service');
  const askPreview: Any = await load('../src/lib/preflight/ask-preview');
  const rewind: Any = await load('../src/lib/glance/rewind');
  const manualNudge: Any = await load('../src/lib/sms/manual-nudge-recipient');
  const nudgeFinder: Any = await load('../src/lib/sms/nudge-eligibility');
  const decideFinder: Any = await load('../src/lib/sms/decide-by-eligibility');
  const resendDoor: Any = await load('../src/lib/press/resend');
  const emailNote: Any = await load('../src/lib/glance/email-note');
  const carried: Any = await load('../src/lib/eligibility/carried-answer');
  const quiet: Any = await load('../src/lib/sms/quiet-hours');

  // ── Console capture, for the route's posts only (sendSms logs numbers, and is not under test) ──
  const captured: string[] = [];
  const methods = ['log', 'info', 'warn', 'error'] as const;
  const originals = methods.map((m) => console[m]);
  const capture = async <T>(fn: () => Promise<T>): Promise<T> => {
    methods.forEach((m) => {
      console[m] = (...args: unknown[]) => {
        captured.push(args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' '));
      };
    });
    try {
      return await fn();
    } finally {
      methods.forEach((m, i) => (console[m] = originals[i]));
    }
  };

  /** Posts a made-up reply to the route in process. Null when the route is absent or throws. */
  const post = async (body: Record<string, unknown>): Promise<number | null> => {
    if (!route || typeof route.POST !== 'function') return null;
    return capture(async () => {
      try {
        const res = await route.POST(
          new NextRequest('http://localhost:3000/api/sms/tnz-webhook', {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              authorization: SECRET,
              'x-sender': SENDER,
            },
            body: JSON.stringify(body),
          })
        );
        return res.status as number;
      } catch {
        return null;
      }
    });
  };
  const reply = (o: Record<string, unknown>) =>
    buildTnzReplyEnvelope({ APIKey: SECRET, Sender: SENDER, ReceivedID: id('rcv'), ...o } as Any);

  const textReplyCount = async (where: Record<string, unknown> = {}): Promise<number | null> => {
    try {
      return await (prisma as Any).textReply.count({ where });
    } catch {
      return null;
    }
  };
  const tableCounts = async () => ({
    person: await prisma.person.count(),
    event: await prisma.event.count(),
    optOut: await prisma.smsOptOut.count(),
    invite: await prisma.inviteEvent.count(),
    report: await prisma.smsDeliveryReport.count(),
    flagged: await prisma.person.count({ where: { smsOptedOut: true } }),
    textReply: await textReplyCount(),
  });
  type Counts = Awaited<ReturnType<typeof tableCounts>>;
  const same = (a: Counts, b: Counts) =>
    (Object.keys(a) as (keyof Counts)[]).every((k) => a[k] === b[k]);

  const inForce = (phoneNumber: string): Promise<Any[]> =>
    prisma.smsOptOut
      .findMany({ where: { phoneNumber, optedInAt: null } as Any })
      .catch(() => [] as Any[]);
  const rowsFor = (phoneNumber: string): Promise<Any[]> =>
    prisma.smsOptOut.findMany({ where: { phoneNumber } }).catch(() => [] as Any[]);

  const start = await tableCounts();
  const savedSecret = process.env.TNZ_CALLBACK_SECRET;
  const savedSender = process.env.TNZ_CALLBACK_SENDER;
  process.env.TNZ_CALLBACK_SECRET = SECRET;
  process.env.TNZ_CALLBACK_SENDER = SENDER;

  const created = { persons: [] as string[], events: [] as string[] };

  try {
    // ─────────────────────────────────────────────────────────────────────────────────────────
    section('Layer 0: controls');
    // ─────────────────────────────────────────────────────────────────────────────────────────

    assert('0', 'the provider trap is installed and has counted nothing yet', trapCount() === 0);
    const heldElsewhere = await prisma.person.count({ where: { phoneNumber: { in: NUMBERS } } });
    const rowsAlready = await prisma.smsOptOut.count({ where: { phoneNumber: { in: NUMBERS } } });
    const blocksAlready = await prisma.emailBlock.count({ where: { address: { in: ADDRESSES } } });
    assert(
      '0',
      "no Person and no SmsOptOut row holds any of this run's numbers before the fixture",
      heldElsewhere === 0 && rowsAlready === 0 && blocksAlready === 0,
      `${heldElsewhere} people, ${rowsAlready} rows, ${blocksAlready} blocks`
    );

    // ── The fixture: three hosts, three events, guests sharing numbers across hosts ──
    const newPerson = async (data: Record<string, unknown>) => {
      const p = await prisma.person.create({ data: data as Any });
      created.persons.push(p.id);
      return p;
    };
    const newEvent = async (name: string, hostId: string) => {
      const e = await prisma.event.create({
        data: {
          name: `${name} ${RUN}`,
          startDate: new Date('2026-12-23T00:00:00.000Z'),
          endDate: new Date('2026-12-23T00:00:00.000Z'),
          hostId,
          status: 'CONFIRMING',
        },
      });
      created.events.push(e.id);
      const team = await prisma.team.create({ data: { name: 'Food', eventId: e.id } });
      return { ...e, teamId: team.id };
    };
    const guest = async (
      ev: { id: string; teamId: string },
      name: string,
      phoneNumber: string,
      extra: Record<string, unknown> = {}
    ) => {
      const p = await newPerson({ name, phoneNumber, ...extra });
      await prisma.personEvent.create({
        data: { personId: p.id, eventId: ev.id, role: 'PARTICIPANT', contactMethod: 'NONE' },
      });
      const item = await prisma.item.create({ data: { name: `dish ${name}`, teamId: ev.teamId } });
      await prisma.assignment.create({ data: { itemId: item.id, personId: p.id } });
      return p;
    };
    /*
     * ⚠ MOVED BY [[GTC-258]] (M4, approved 2026-10-02): a send was a NUDGE_SENT_AUTO InviteEvent
     * carrying the MessageID and the number in its metadata. GTC-258 retires that row; every text
     * path records its send on an OutboundMessage (accepted, the MessageID, the number it went to),
     * and the reply join reads that. Same arguments, same meaning.
     */
    const sent = async (
      eventId: string,
      personId: string,
      phoneNumber: string,
      messageId: string,
      createdAt?: Date
    ) => {
      const pe = await prisma.personEvent.findFirstOrThrow({ where: { eventId, personId } });
      const at = createdAt ?? new Date();
      return (prisma as Any).outboundMessage.create({
        data: {
          eventId,
          personEventId: pe.id,
          kind: 'ASK',
          channel: 'TEXT',
          createdAt: at,
          attemptedAt: at,
          attemptCount: 1,
          acceptedAt: at,
          provider: 'tnz',
          providerMessageId: messageId,
          destination: phoneNumber,
        },
      });
    };

    const hostA = await newPerson({ name: 'Ana Host' });
    const hostB = await newPerson({ name: 'Ben Host' });
    const hostC = await newPerson({ name: 'Cat Host' });
    const EA = await newEvent('GTC-288 A', hostA.id);
    const EB = await newEvent('GTC-288 B', hostB.id);
    const EC = await newEvent('GTC-288 C', hostC.id);

    const gA = await guest(EA, 'Gia Shared', N.shared);
    const gB = await guest(EB, 'Gus Shared', N.shared);

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section('Layer W: the words (opt-out-keywords.ts)');
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const isStop = (m: string) => kw.isOptOutMessage(m) === true;
    const notStop = (m: string) => kw.isOptOutMessage(m) === false;
    const isStart = (m: string) =>
      typeof kw.isOptInMessage === 'function' && kw.isOptInMessage(m) === true;
    const notStart = (m: string) =>
      typeof kw.isOptInMessage === 'function' && kw.isOptInMessage(m) === false;

    await check('W', 'W1 "Stop please" is a STOP', () => isStop('Stop please'));
    await check('W', 'W2 "STOPALL" is a STOP', () => isStop('STOPALL'));
    await check('W', 'W3 "opt out" is a STOP', () => isStop('opt out'));
    await check('W', "W4 each of TNZ's six begins a STOP, in any case", () =>
      ['STOP', 'optout', 'Opt Out', 'OPT-OUT', 'unsub', 'UNSUBSCRIBE', 'Unsubscribe me'].every(
        isStop
      )
    );
    await check('W', 'W5 "Cancel" is not a STOP', () => notStop('Cancel'));
    await check('W', 'W6 "END" and "QUIT" are not STOPs', () => notStop('END') && notStop('QUIT'));
    await check('W', 'W7 "Stopping by at 5" is a STOP — the literal "begins with" rule', () =>
      isStop('Stopping by at 5')
    );
    await check('W', 'W8 "Please STOP" is not a STOP', () => notStop('Please STOP'));
    await check('W', 'W9 "STOPPED" is a STOP', () => isStop('STOPPED'));
    await check('W', 'W10 "start" is a START', () => isStart('start'));
    await check('W', 'W11 " START " is a START', () => isStart(' START '));
    await check('W', 'W12 "Start time?" is not a START', () => notStart('Start time?'));
    await check(
      'W',
      'W13 the six opt-in words, as the whole reply, in any case',
      () =>
        ['START', 'subscribe', 'Unstop', 'OPTIN', 'opt in', 'Opt-In'].every(isStart) &&
        ['START please', 'Start.', 'Started'].every(notStart)
    );
    await check(
      'W',
      'W14 a STOP is never a START, and a START is never a STOP',
      () => notStart('STOP') && notStart('stop please') && notStop('START') && notStop('unstop')
    );
    await check(
      'W',
      'W15 the matched keyword is the longest: "Unsubscribe me" names unsubscribe, "unsub" unsub',
      () =>
        kw.getOptOutKeyword('Unsubscribe me') === 'unsubscribe' &&
        kw.getOptOutKeyword('unsub') === 'unsub'
    );
    await check(
      'W',
      'W16 both word lists live in opt-out-keywords.ts and nowhere else in src/',
      () => {
        const own = codeOnly(read('src/lib/sms/opt-out-keywords.ts'));
        if (!/'unstop'/.test(own) || !/'optout'/.test(own)) return false;
        const files: string[] = [];
        const walk = (dir: string) => {
          for (const name of readdirSync(dir)) {
            const p = join(dir, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.tsx?$/.test(name)) files.push(relative(ROOT, p));
          }
        };
        walk(join(ROOT, 'src'));
        return files
          .filter((f) => f !== 'src/lib/sms/opt-out-keywords.ts')
          .every((f) => !/'unstop'|'optout'/i.test(codeOnly(read(f))));
      }
    );

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section('Layer S: a STOP through the route, and every host after it');
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const MID_A = id('mid');
    const sendA = await sent(EA.id, gA.id, N.shared, MID_A);
    const R1 = id('rcv');
    const stopA = reply({
      MessageID: MID_A,
      ReceivedID: R1,
      Destination: N.shared,
      Message: 'STOP',
    });
    const s1Status = await post(stopA);

    await check(
      'S',
      'S1 a matched STOP: 200, in force on the number, linked, and logged on its event',
      async () => {
        const rows = await inForce(N.shared);
        const logged = await prisma.inviteEvent.count({
          where: {
            type: 'SMS_OPT_OUT_RECEIVED',
            eventId: EA.id,
            personId: gA.id,
            metadata: { path: ['providerMessageId'], equals: MID_A },
          },
        });
        return (
          s1Status === 200 &&
          rows.length === 1 &&
          rows[0].attribution === 'MESSAGE_ID' &&
          rows[0].eventId === EA.id &&
          rows[0].personId === gA.id &&
          // ⚠ MOVED BY [[GTC-258]] (M4): it read `rows[0].inviteEventId === sendA.id`. The link is
          // made through the send record now; the InviteEvent pointer is written null.
          sendA.id !== null &&
          rows[0].inviteEventId === null &&
          rows[0].providerReceivedId === R1 &&
          rows[0].hostId === null &&
          logged === 1
        );
      }
    );
    await check(
      'S',
      'S2 the flag is set on every Person holding the number, under both hosts',
      async () => {
        const ps = await prisma.person.findMany({ where: { id: { in: [gA.id, gB.id] } } });
        return ps.length === 2 && ps.every((p) => p.smsOptedOut && p.smsOptedOutAt !== null);
      }
    );
    await check('S', "S3 sendSms refuses the other host's guest: OPTED_OUT", async () => {
      const r = await sms.sendSms({ to: N.shared, message: 'x', eventId: EB.id, personId: gB.id });
      return r.blocked === 'OPTED_OUT';
    });
    await check(
      'S',
      "S4 getOptOutStatuses — invite-status's reader — covers every host, and invite-status passes it no host",
      async () => {
        const m = await optOutService.getOptOutStatuses([N.shared, N.nothingInForce]);
        const src = codeOnly(read('src/app/api/events/[id]/invite-status/route.ts'));
        return (
          m.get(N.shared) === true &&
          m.get(N.nothingInForce) === false &&
          /getOptOutStatuses\(\s*phonesInEvent\s*\)/.test(src)
        );
      }
    );

    // A person host B adds AFTER the STOP: no flag of their own; only the table covers them.
    const L = await guest(EB, 'Lou Later', N.shared);

    /*
     * S5 — every reader, for a person host B adds AFTER the STOP: no flag of their own, so only
     * the table covers them. Each reader gets its own event of host B, with that later person on
     * the shared number AND a control guest on a fresh number in the same shape. The control must
     * read as reachable, so a fixture that never reached the reader's opt-out branch fails here
     * rather than passing quietly. Shapes copied from the suites named at each.
     */
    const readersSeeOptedOut = async (): Promise<string[]> => {
      const failures: string[] = [];
      /** Each reader returns [the later person reads opted out, the control reads reachable]. */
      const t = async (name: string, fn: () => Promise<[boolean, boolean]>) => {
        try {
          const [later, control] = await fn();
          if (later !== true) failures.push(`${name} (later person)`);
          if (control !== true) failures.push(`${name} (control)`);
        } catch (e) {
          failures.push(`${name} (threw: ${e instanceof Error ? e.message.split('\n')[0] : '?'})`);
        }
      };
      const now = new Date();
      const mkEv = async (label: string, extra: Record<string, unknown> = {}) => {
        const e = await prisma.event.create({
          data: {
            name: `GTC-288 S5 ${label} ${RUN}`,
            startDate: new Date('2026-12-23T00:00:00.000Z'),
            endDate: new Date('2026-12-23T00:00:00.000Z'),
            hostId: hostB.id,
            status: 'CONFIRMING',
            ...extra,
          } as Any,
        });
        created.events.push(e.id);
        const team = await prisma.team.create({ data: { name: 'Food', eventId: e.id } });
        await prisma.personEvent.create({
          data: { personId: hostB.id, eventId: e.id, role: 'HOST' },
        });
        return { id: e.id, teamId: team.id };
      };
      const mk = async (
        ev: { id: string; teamId: string },
        name: string,
        person: Record<string, unknown>,
        o: {
          sentAt?: Date;
          token?: boolean;
          response?: 'MAYBE' | null;
          householdId?: string;
          householdRole?: 'PRIMARY_CONTACT' | 'CHILD' | 'GUEST';
          item?: boolean;
        } = {}
      ) => {
        const p = await newPerson({ name, email: null, ...person });
        const pe = await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: ev.id,
            role: 'PARTICIPANT',
            householdId: o.householdId ?? null,
            householdRole: o.householdRole ?? null,
            sentAt: o.sentAt ?? null,
          } as Any,
        });
        if (o.token)
          await prisma.accessToken.create({
            data: { token: id('tok'), scope: 'PARTICIPANT', eventId: ev.id, personId: p.id },
          });
        if (o.item !== false) {
          const item = await prisma.item.create({
            data: { name: `dish ${name}`, teamId: ev.teamId },
          });
          await prisma.assignment.create({
            data: {
              itemId: item.id,
              personId: p.id,
              ...(o.response ? { response: o.response } : {}),
            },
          });
        }
        return { p, pe };
      };

      // sendSms and the pre-flight (tests/ask-preview-test.ts's adult shape).
      const ePre = await mkEv('preview');
      const lPre = await mk(ePre, 'Lou Preview', { phoneNumber: N.shared });
      const cPre = await mk(ePre, 'Cal Preview', { phoneNumber: ctrl(0) });
      await t('sendSms', async () => {
        const l = await sms.sendSms({
          to: N.shared,
          message: 'x',
          eventId: ePre.id,
          personId: lPre.p.id,
        });
        const c = await sms.sendSms({
          to: ctrl(0),
          message: 'x',
          eventId: ePre.id,
          personId: cPre.p.id,
        });
        return [l.blocked === 'OPTED_OUT', c.blocked !== 'OPTED_OUT'];
      });
      await t('readAskPreview', async () => {
        const p = await askPreview.readAskPreview(prisma, ePre.id, BASE);
        const line = p?.hostList?.find((l: Any) => l.personEventId === lPre.pe.id);
        const rec = p?.recipients?.find((r: Any) => r.personEventId === cPre.pe.id);
        return [
          line?.why === 'SMS_OPTED_OUT' &&
            !p.recipients.some((r: Any) => r.personEventId === lPre.pe.id),
          rec?.channel === 'TEXT',
        ];
      });

      // The nudge finder (tests/nudge-provider-gate-test.ts's positive control).
      const eNudge = await mkEv('nudge', {
        startDate: new Date(now.getTime() + 30 * DAY),
        endDate: new Date(now.getTime() + 30 * DAY),
        sentAt: new Date(now.getTime() - 10 * DAY),
      });
      const nudgeOpts = { sentAt: new Date(now.getTime() - 5 * DAY), token: true, item: false };
      const lNudge = await mk(eNudge, 'Lou Nudge', { phoneNumber: N.shared }, nudgeOpts);
      const cNudge = await mk(eNudge, 'Cal Nudge', { phoneNumber: ctrl(1) }, nudgeOpts);
      await t('findNudgeCandidatesForEvent', async () => {
        const r = await nudgeFinder.findNudgeCandidatesForEvent(eNudge.id, now);
        const ids = (r.eligibleFirst as Any[]).map((c) => c.personEventId);
        return [!ids.includes(lNudge.pe.id), ids.includes(cNudge.pe.id)];
      });

      // The decide-by finder (tests/decide-by-email-test.ts's mkEvent / mkMaybe).
      const D = new Date(now.getTime() + 3 * DAY);
      const decideEnd = new Date(D.getTime() + 120 * HOUR);
      const decideSent = new Date(now.getTime() - 3 * DAY);
      let awake: Date | null = null;
      for (let h = 1; h < 24 && !awake; h++) {
        const at = new Date(D.getTime() - h * HOUR);
        if (!quiet.isQuietHours(at)) awake = at;
      }
      const eDecide = await mkEv('decide', {
        startDate: decideEnd,
        endDate: decideEnd,
        sentAt: decideSent,
      });
      const decideOpts = { sentAt: decideSent, token: true, response: 'MAYBE' as const };
      const lDecide = await mk(eDecide, 'Lou Decide', { phoneNumber: N.shared }, decideOpts);
      const cDecide = await mk(eDecide, 'Cal Decide', { phoneNumber: ctrl(2) }, decideOpts);
      await t('findDecideByFollowupCandidates', async () => {
        const r = await decideFinder.findDecideByFollowupCandidates(awake!);
        const mine = (r.eligible as Any[])
          .filter((c) => c.eventId === eDecide.id)
          .map((c) => c.personId);
        return [!mine.includes(lDecide.p.id), mine.includes(cDecide.p.id)];
      });

      // The resend door (tests/bounce-door-test.ts: a bounced email ask, a phone, the seam).
      const doorSent = new Date(now.getTime() - 2 * HOUR);
      const eDoor = await mkEv('door', {
        startDate: new Date(now.getTime() + 130 * HOUR),
        endDate: new Date(now.getTime() + 130 * HOUR),
        sentAt: doorSent,
      });
      const doorOpts = { sentAt: doorSent, householdRole: 'GUEST' as const };
      const lDoor = await mk(
        eDoor,
        'Lou Door',
        { phoneNumber: N.shared, email: ADDRESS('door-l') },
        doorOpts
      );
      const cDoor = await mk(
        eDoor,
        'Cal Door',
        { phoneNumber: ctrl(3), email: ADDRESS('door-c') },
        doorOpts
      );
      for (const m of [lDoor, cDoor])
        await prisma.outboundMessage.create({
          data: {
            eventId: eDoor.id,
            personEventId: m.pe.id,
            kind: 'ASK',
            channel: 'EMAIL',
            rejectedAt: doorSent,
            attemptedAt: doorSent,
            attemptCount: 1,
            provider: 'resend',
            providerError: 'made-up refusal (GTC-288 fixture)',
          },
        });
      await t('readDoor', async () => {
        const seam = { textingConfiguredFor: () => true };
        const l = await resendDoor.readDoor(
          prisma,
          { eventId: eDoor.id, personId: lDoor.p.id, baseUrl: BASE },
          seam
        );
        const c = await resendDoor.readDoor(
          prisma,
          { eventId: eDoor.id, personId: cDoor.p.id, baseUrl: BASE },
          seam
        );
        return [
          l.ok === true && !l.view.actions.includes('PHONE'),
          c.ok === true && c.view.actions.includes('PHONE'),
        ];
      });

      // The board's email note (an address the provider will not deliver to, and a phone).
      const eNote = await mkEv('note');
      const lNote = await mk(eNote, 'Lou Note', {
        phoneNumber: N.shared,
        email: ADDRESS('note-l'),
      });
      const cNote = await mk(eNote, 'Cal Note', { phoneNumber: ctrl(4), email: ADDRESS('note-c') });
      for (const address of [ADDRESS('note-l'), ADDRESS('note-c')])
        await prisma.emailBlock.create({
          data: { address: address.toLowerCase(), reason: 'BOUNCED' },
        });
      await t('readEmailNotes', async () => {
        const m = await emailNote.readEmailNotes(prisma, eNote.id, hostB.id);
        return [m.get(lNote.pe.id)?.textable === false, m.get(cNote.pe.id)?.textable === true];
      });

      // A carried child (tests/carried-answer-test.ts's household, the carrier with no email).
      const eCarry = await mkEv('carry');
      const household = async (carrierName: string, phone: string, childName: string) => {
        const hh = await prisma.household.create({ data: { eventId: eCarry.id } });
        const carrier = await mk(
          eCarry,
          carrierName,
          { phoneNumber: phone },
          { householdId: hh.id, householdRole: 'PRIMARY_CONTACT', item: false }
        );
        const child = await mk(
          eCarry,
          childName,
          {},
          { householdId: hh.id, householdRole: 'CHILD' }
        );
        await prisma.household.update({
          where: { id: hh.id },
          data: { contactPersonEventId: carrier.pe.id },
        });
        return { carrier, child };
      };
      const lCarry = await household('Lou Carry', N.shared, 'Kid Lou');
      const cCarry = await household('Cal Carry', ctrl(5), 'Kid Cal');
      await t('resolveCarriedSubjects', async () => {
        const l = await carried.resolveCarriedSubjects(prisma, eCarry.id, lCarry.carrier.p.id);
        const c = await carried.resolveCarriedSubjects(prisma, eCarry.id, cCarry.carrier.p.id);
        return [l.length === 0, c.length === 1 && c[0].personId === cCarry.child.p.id];
      });

      return failures;
    };

    let s5Failures: string[] = ['(not run)'];
    await check(
      'S',
      'S5 a person another host adds after the STOP reads opted out in every reader',
      async () => {
        s5Failures = await readersSeeOptedOut();
        return s5Failures.length === 0;
      }
    );
    if (s5Failures.length > 0)
      console.log(`   S5 readers not yet covering the number: ${s5Failures.join(', ')}`);

    const MID_UNKNOWN = id('mid');
    const s6Status = await post(
      reply({ MessageID: MID_UNKNOWN, Destination: N.unmatched, Message: 'Stop please' })
    );
    await check(
      'S',
      'S6 a STOP whose MessageID matches nothing: 200, recorded, UNRESOLVED',
      async () => {
        const rows = await inForce(N.unmatched);
        const logged = await prisma.inviteEvent.count({
          where: {
            type: 'SMS_OPT_OUT_RECEIVED',
            metadata: { path: ['providerMessageId'], equals: MID_UNKNOWN },
          },
        });
        return (
          s6Status === 200 &&
          rows.length === 1 &&
          rows[0].attribution === 'UNRESOLVED' &&
          rows[0].eventId === null &&
          rows[0].personId === null &&
          rows[0].providerMessageId === MID_UNKNOWN &&
          logged === 0
        );
      }
    );

    const s7Empty = await post(reply({ MessageID: '', Destination: N.empty, Message: 'stop' }));
    const omitted = reply({ Destination: N.omitted, Message: 'UNSUBSCRIBE' }) as Any;
    delete omitted.MessageID;
    const s7Omitted = await post(omitted);
    await check(
      'S',
      'S7 a STOP with MessageID empty or omitted: 200, recorded, UNRESOLVED',
      async () => {
        const e = await inForce(N.empty);
        const o = await inForce(N.omitted);
        return (
          s7Empty === 200 &&
          s7Omitted === 200 &&
          e.length === 1 &&
          o.length === 1 &&
          e[0].attribution === 'UNRESOLVED' &&
          o[0].attribution === 'UNRESOLVED'
        );
      }
    );

    // GTC-258's disagreement: an earlier genuine send, and a LATER send record for the same number.
    const gGenuineA = await guest(EA, 'Gem Genuine', N.genuine);
    const gGenuineB = await guest(EB, 'Gem Again', N.genuine);
    const MID_GENUINE = id('mid');
    const MID_FALSE = id('mid');
    await sent(EA.id, gGenuineA.id, N.genuine, MID_GENUINE, new Date(Date.now() - 60 * 60 * 1000));
    await sent(EB.id, gGenuineB.id, N.genuine, MID_FALSE, new Date());
    const s8Status = await post(
      reply({ MessageID: MID_GENUINE, Destination: N.genuine, Message: 'STOP' })
    );
    await check(
      'S',
      // ⚠ MOVED BY [[GTC-258]] (M4): the label read "… not to a later NUDGE_SENT_AUTO for the number".
      'S8 the STOP links to the send its MessageID names, not to a later send record for the number',
      async () => {
        const rows = await inForce(N.genuine);
        return (
          s8Status === 200 &&
          rows.length === 1 &&
          rows[0].eventId === EA.id &&
          rows[0].personId === gGenuineA.id
        );
      }
    );

    const s9Status = await post(stopA);
    await check('S', 'S9 a retried STOP (same ReceivedID): 200, written once', async () => {
      const rows = await rowsFor(N.shared);
      const logged = await prisma.inviteEvent.count({
        where: {
          type: 'SMS_OPT_OUT_RECEIVED',
          metadata: { path: ['providerMessageId'], equals: MID_A },
        },
      });
      return s9Status === 200 && rows.length === 1 && logged === 1;
    });

    const before10 = await tableCounts();
    const s10Status = await post(
      reply({ MessageID: MID_A, Destination: N.shared, Message: 'stop' })
    );
    const after10 = await tableCounts();
    await check(
      'S',
      'S10 a second STOP while one is in force: 202, nothing written, still exactly one row in force',
      async () =>
        s10Status === 202 && same(before10, after10) && (await inForce(N.shared)).length === 1
    );

    const before11 = await tableCounts();
    const s11Status = await post(
      reply({ MessageID: id('mid'), Destination: N.notE164, Message: 'STOP' })
    );
    const after11 = await tableCounts();
    await check(
      'S',
      'S11 a STOP from a Destination that is not E.164: 500, nothing written',
      () => s11Status === 500 && same(before11, after11)
    );

    const s12Status = await post(
      reply({ MessageID: id('mid'), Destination: N.australian, Message: 'STOP' })
    );
    await check(
      'S',
      'S12 the +61 sender: recorded on the number verbatim, and sendSms refuses it: OPTED_OUT',
      async () => {
        const rows = await inForce(N.australian);
        const r = await sms.sendSms({
          to: N.australian,
          message: 'x',
          eventId: EB.id,
          personId: gB.id,
        });
        return (
          s12Status === 200 &&
          rows.length === 1 &&
          rows[0].phoneNumber === N.australian &&
          r.blocked === 'OPTED_OUT'
        );
      }
    );

    const gMismatch = await guest(EA, 'Max Mismatch', N.mismatchSent);
    const MID_MISMATCH = id('mid');
    await sent(EA.id, gMismatch.id, N.mismatchSent, MID_MISMATCH);
    const s13Status = await post(
      reply({ MessageID: MID_MISMATCH, Destination: N.mismatchFrom, Message: 'STOP' })
    );
    await check(
      'S',
      "S13 a STOP whose number is not the one its send went to: recorded on the sender's number, UNRESOLVED",
      async () => {
        const rows = await inForce(N.mismatchFrom);
        const sentTo = await inForce(N.mismatchSent);
        return (
          s13Status === 200 &&
          rows.length === 1 &&
          rows[0].attribution === 'UNRESOLVED' &&
          rows[0].eventId === null &&
          sentTo.length === 0
        );
      }
    );

    await check(
      'S',
      'S14 the flag-only paths fail safe for the later person: the manual nudge picks text, and the send is refused',
      async () => {
        const recipient = await manualNudge.resolveManualNudgeRecipient(EB.id, L.id);
        const channel =
          recipient.ok &&
          manualNudge.chooseManualNudgeChannel({ ...recipient.person, emailBlocked: false });
        const r = await sms.sendSms({ to: N.shared, message: 'x', eventId: EB.id, personId: L.id });
        const nudgeRoute = codeOnly(
          read('src/app/api/events/[id]/people/[personId]/nudge/route.ts')
        );
        return (
          recipient.ok === true &&
          recipient.person.smsOptedOut === false &&
          channel === 'sms' &&
          r.blocked === 'OPTED_OUT' &&
          /smsOptOut\.findFirst\(/.test(nudgeRoute) &&
          !/phoneNumber_hostId/.test(nudgeRoute)
        );
      }
    );

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section('Layer T: a START');
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const R_START = id('rcv');
    const t1Status = await post(
      reply({ MessageID: MID_A, ReceivedID: R_START, Destination: N.shared, Message: 'start' })
    );
    await check(
      'T',
      'T1 a START: the row kept with optedInAt, every flag cleared, and no host refuses the number',
      async () => {
        const rows = await rowsFor(N.shared);
        const ps = await prisma.person.findMany({ where: { id: { in: [gA.id, gB.id, L.id] } } });
        const a = await sms.sendSms({
          to: N.shared,
          message: 'x',
          eventId: EA.id,
          personId: gA.id,
        });
        const b = await sms.sendSms({
          to: N.shared,
          message: 'x',
          eventId: EB.id,
          personId: gB.id,
        });
        return (
          t1Status === 200 &&
          rows.length === 1 &&
          rows[0].optedInAt instanceof Date &&
          rows[0].optedInReceivedId === R_START &&
          ps.length === 3 &&
          ps.every((p) => !p.smsOptedOut && p.smsOptedOutAt === null) &&
          a.blocked !== 'OPTED_OUT' &&
          b.blocked !== 'OPTED_OUT'
        );
      }
    );

    const gStartTime = await guest(EA, 'Sam Starttime', N.startTime);
    const MID_START_TIME = id('mid');
    await sent(EA.id, gStartTime.id, N.startTime, MID_START_TIME);
    await post(reply({ MessageID: MID_START_TIME, Destination: N.startTime, Message: 'STOP' }));
    const t2Status = await post(
      reply({ MessageID: MID_START_TIME, Destination: N.startTime, Message: 'Start time?' })
    );
    await check(
      'T',
      'T2 "Start time?" after a STOP is not a START: the number stays opted out, and the reply is kept',
      async () =>
        t2Status === 200 &&
        (await inForce(N.startTime)).length === 1 &&
        (await textReplyCount({ providerMessageId: MID_START_TIME, body: 'Start time?' })) === 1
    );

    const before3 = await tableCounts();
    const t3Status = await post(
      reply({ MessageID: id('mid'), Destination: N.nothingInForce, Message: 'START' })
    );
    const after3 = await tableCounts();
    await check(
      'T',
      'T3 a START with nothing in force: 202, nothing written',
      () => t3Status === 202 && same(before3, after3)
    );

    const R_CYCLE_START = id('rcv');
    await post(reply({ MessageID: id('mid'), Destination: N.cycle, Message: 'STOP' }));
    const startCycle = reply({
      MessageID: id('mid'),
      ReceivedID: R_CYCLE_START,
      Destination: N.cycle,
      Message: 'START',
    });
    await post(startCycle);
    await post(reply({ MessageID: id('mid'), Destination: N.cycle, Message: 'STOP' }));
    const t4Status = await post(startCycle);
    await check(
      'T',
      'T4 a retried START does not undo a later STOP',
      async () => t4Status === 200 && (await inForce(N.cycle)).length === 1
    );

    await prisma.smsOptOut.create({ data: { phoneNumber: N.legacyTwo, hostId: hostA.id } });
    await prisma.smsOptOut.create({ data: { phoneNumber: N.legacyTwo, hostId: hostB.id } });
    const t5Status = await post(
      reply({ MessageID: id('mid'), Destination: N.legacyTwo, Message: 'Opt-In' })
    );
    await check('T', 'T5 one START closes two rows held under two hosts', async () => {
      const rows = await rowsFor(N.legacyTwo);
      return (
        t5Status === 200 &&
        rows.length === 2 &&
        rows.every((r) => r.optedInAt instanceof Date) &&
        (await inForce(N.legacyTwo)).length === 0
      );
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section('Layer K: kept replies');
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const gKept = await guest(EA, 'Kit Kept', N.kept);
    const MID_KEPT = id('mid');
    const sendKept = await sent(EA.id, gKept.id, N.kept, MID_KEPT);
    const SALAD = "Yes, I'll bring the salad";
    const R_SALAD = id('rcv');
    const salad = reply({
      MessageID: MID_KEPT,
      ReceivedID: R_SALAD,
      Destination: N.kept,
      Message: SALAD,
    });
    const k1Status = await post(salad);
    await check(
      'K',
      'K1 a matched reply: 200, kept verbatim and linked, Zone 7 untouched',
      async () => {
        let rows: Any[] = [];
        try {
          rows = await (prisma as Any).textReply.findMany({
            where: { providerMessageId: MID_KEPT },
          });
        } catch {
          rows = [];
        }
        const p = await prisma.person.findUnique({ where: { id: gKept.id } });
        return (
          k1Status === 200 &&
          rows.length === 1 &&
          rows[0].body === SALAD &&
          rows[0].eventId === EA.id &&
          rows[0].personId === gKept.id &&
          // ⚠ MOVED BY [[GTC-258]] (M4): it read `rows[0].inviteEventId === sendKept.id`.
          sendKept.id !== null &&
          rows[0].inviteEventId === null &&
          rows[0].providerReceivedId === R_SALAD &&
          (await rowsFor(N.kept)).length === 0 &&
          p?.smsOptedOut === false
        );
      }
    );

    const k2Status = await post(
      reply({ MessageID: MID_KEPT, Destination: N.kept, Message: 'Cancel' })
    );
    await check(
      'K',
      'K2 "Cancel" is kept as a reply, and opts nobody out',
      async () =>
        k2Status === 200 &&
        (await textReplyCount({ providerMessageId: MID_KEPT, body: 'Cancel' })) === 1 &&
        (await rowsFor(N.kept)).length === 0
    );

    const k3Status = await post(salad);
    await check(
      'K',
      'K3 a retried reply (same ReceivedID): 200, stored once',
      async () =>
        k3Status === 200 &&
        (await textReplyCount({ providerMessageId: MID_KEPT, body: SALAD })) === 1
    );

    const blank = reply({
      MessageID: MID_KEPT,
      ReceivedID: '',
      Destination: N.kept,
      Message: 'See you there',
    });
    const k4First = await post(blank);
    const k4Second = await post(blank);
    await check(
      'K',
      'K4 a reply with a blank ReceivedID, delivered twice: stored once',
      async () =>
        k4First === 200 &&
        k4Second === 200 &&
        (await textReplyCount({ providerMessageId: MID_KEPT, body: 'See you there' })) === 1
    );

    const notKept = async (label: string, body: Record<string, unknown>) => {
      const before = await tableCounts();
      const status = await post(body);
      const after = await tableCounts();
      await check('K', label, () => status === 202 && same(before, after));
    };
    await notKept(
      'K5 a reply that matches no message: 202, not kept',
      reply({ MessageID: id('mid'), Destination: N.keptOther, Message: 'hello from nowhere' })
    );
    await notKept(
      'K6 an SMSInbound with no MessageID: 202, not kept',
      reply({
        Type: 'SMSInbound',
        MessageID: '',
        Destination: N.keptOther,
        Message: 'hello inbound',
      })
    );
    await notKept(
      'K7 a reply from a number its send did not go to: 202, not kept',
      reply({ MessageID: MID_KEPT, Destination: N.keptOther, Message: 'words from elsewhere' })
    );
    await notKept(
      'K8 an empty reply: 202, not kept',
      reply({ MessageID: MID_KEPT, Destination: N.kept, Message: '' })
    );

    const secretWords = [
      SALAD,
      'Cancel',
      'See you there',
      'hello from nowhere',
      'hello inbound',
      'words from elsewhere',
      'Start time?',
      'Stopping',
      'Stop please',
    ];
    await check(
      'K',
      "K9 no log line from the route carries a reply's words or a phone number",
      () =>
        captured.length > 0 &&
        !captured.some(
          (l) =>
            secretWords.some((w) => l.includes(w)) ||
            Object.values(N).some((n) => l.includes(n)) ||
            l.includes(STEM)
        )
    );
    // ⚠ MOVED BY [[GTC-350]] (founder Q4, 2026-10-02): GTC-288 left these words alone, and GTC-350
    // was the ticket that rewrites them. It read: "K10 TEXT_REPLY's words are unchanged".
    // The same declaration with any whitespace after "=": Prettier puts the sentence on its own line
    // at printWidth 100. Still the exact sentence, and still the declaration.
    await check('K', "K10 TEXT_REPLY is Q4's sentence (GTC-350)", () =>
      /const TEXT_REPLY =\s*'A text reply usually comes to your board, and I stop reminding whoever sent it\.';/.test(
        read('src/lib/preflight/ask-preview-compose.ts')
      )
    );

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section("Layer M: the migration's shape");
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const gThird = await guest(EC, 'Tia Third', N.threeHosts);
    await prisma.smsOptOut.create({ data: { phoneNumber: N.threeHosts, hostId: hostA.id } });
    await prisma.smsOptOut.create({ data: { phoneNumber: N.threeHosts, hostId: hostB.id } });
    await check('M', "M1 two legacy per-host rows refuse a third host's guest", async () => {
      const r = await sms.sendSms({
        to: N.threeHosts,
        message: 'x',
        eventId: EC.id,
        personId: gThird.id,
      });
      return r.blocked === 'OPTED_OUT';
    });

    const goneHost = await prisma.person.create({ data: { name: `Gone Host ${RUN}` } });
    const goneRow = await prisma.smsOptOut.create({
      data: { phoneNumber: N.deletedHost, hostId: goneHost.id },
    });
    await prisma.person.delete({ where: { id: goneHost.id } });
    await check(
      'M',
      "M2 deleting a host keeps a guest's opt-out (the host link set null)",
      async () => {
        const row = await prisma.smsOptOut.findUnique({ where: { id: goneRow.id } });
        return row !== null && row.hostId === null;
      }
    );

    await check('M', 'M3 a kept reply goes with its person', async () => {
      const p = await prisma.person.create({ data: { name: `Gone Guest ${RUN}` } });
      const tr = await (prisma as Any).textReply.create({
        data: {
          provider: 'tnz',
          providerMessageId: id('mid'),
          body: 'goes with them',
          eventId: EA.id,
          personId: p.id,
        },
      });
      await prisma.person.delete({ where: { id: p.id } });
      return (await (prisma as Any).textReply.findUnique({ where: { id: tr.id } })) === null;
    });

    // ─────────────────────────────────────────────────────────────────────────────────────────
    section("Layer R: [[GTC-335]]'s replay");
    // ─────────────────────────────────────────────────────────────────────────────────────────

    const since = new Date(Date.now() - 1000);
    const gReplayA = await guest(EA, 'Ria Replay', N.replayed);
    const gReplayB = await guest(EB, 'Rob Replay', N.replayed);
    await post(reply({ MessageID: id('mid'), Destination: N.replayed, Message: 'STOP' }));
    await check('R', "R1 an opt-out after `since` replays on a second host's board", async () => {
      const f = await rewind.rewindGuestFacts(prisma, EB.id, since);
      const pe = await prisma.personEvent.findFirst({
        where: { eventId: EB.id, personId: gReplayB.id },
      });
      return f.later.smsOptOutNumbers.has(N.replayed) && pe !== null && f.movedSince.has(pe.id);
    });
    void gReplayA;

    const gBack = await guest(EB, 'Bea Back', N.replayedBack);
    await check(
      'R',
      'R2 a START after `since` plays no step: the board reads the guest as now',
      async () => {
        await prisma.smsOptOut.create({
          data: {
            phoneNumber: N.replayedBack,
            optedOutAt: new Date(since.getTime() - 60 * 60 * 1000),
            optedInAt: new Date(),
          } as Any,
        });
        const f = await rewind.rewindGuestFacts(prisma, EB.id, since);
        const pe = await prisma.personEvent.findFirst({
          where: { eventId: EB.id, personId: gBack.id },
        });
        const p = await askPreview.readAskPreview(prisma, EB.id, 'http://localhost:3000');
        const rec = p?.recipients?.find((r: Any) => r.personEventId === pe?.id);
        return (
          pe !== null &&
          !f.later.smsOptOutNumbers.has(N.replayedBack) &&
          !f.movedSince.has(pe.id) &&
          rec?.channel === 'TEXT'
        );
      }
    );
  } finally {
    methods.forEach((m, i) => (console[m] = originals[i]));
    if (savedSecret === undefined) delete process.env.TNZ_CALLBACK_SECRET;
    else process.env.TNZ_CALLBACK_SECRET = savedSecret;
    if (savedSender === undefined) delete process.env.TNZ_CALLBACK_SENDER;
    else process.env.TNZ_CALLBACK_SENDER = savedSender;
    await cleanup(created);
  }

  // ─────────────────────────────────────────────────────────────────────────────────────────
  section('Layer Z: structure, the trap, and the tables back as found');
  // ─────────────────────────────────────────────────────────────────────────────────────────

  await check(
    'Z',
    'Z1 the only writers of SmsOptOut are opt-out-service.ts and tnz-reply-record.ts, and the reply store also writes the flag',
    () => {
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
          codeOnly(read(f))
        )
      );
      const store = codeOnly(read('src/lib/sms/tnz-reply-record.ts'));
      return (
        writers.length === 2 &&
        writers.includes('src/lib/sms/opt-out-service.ts') &&
        writers.includes('src/lib/sms/tnz-reply-record.ts') &&
        /person\.updateMany\(/.test(store) &&
        /smsOptedOut/.test(store)
      );
    }
  );
  assert('Z', 'Z2 the provider trap counted no outbound request', trapCount() === 0);
  const end = await tableCounts();
  assert(
    'Z',
    'Z3 every table is back to the count found',
    same(start, end),
    JSON.stringify({ start, end })
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

/** Every row this run wrote: by its numbers, then its events and people. */
async function cleanup(created: { persons: string[]; events: string[] }) {
  try {
    await (prisma as Any).textReply.deleteMany({ where: { eventId: { in: created.events } } });
  } catch {
    /* the model is absent before GTC-288's migration */
  }
  await prisma.smsOptOut.deleteMany({ where: { phoneNumber: { in: NUMBERS } } });
  await prisma.emailBlock.deleteMany({ where: { address: { in: ADDRESSES } } });
  for (const eventId of created.events) {
    await prisma.assignment.deleteMany({ where: { item: { team: { eventId } } } });
    await prisma.item.deleteMany({ where: { team: { eventId } } });
    await prisma.team.deleteMany({ where: { eventId } });
    await prisma.accessToken.deleteMany({ where: { eventId } });
    await prisma.personEvent.deleteMany({ where: { eventId } });
    await prisma.household.deleteMany({ where: { eventId } });
    await prisma.auditEntry.deleteMany({ where: { eventId } });
    await prisma.inviteEvent.deleteMany({ where: { eventId } });
    await prisma.event.deleteMany({ where: { id: eventId } });
  }
  await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
  await prisma.person.deleteMany({ where: { name: { endsWith: RUN } } });
}

main().catch(async (e) => {
  console.error('suite crashed:', e instanceof Error ? e.message : e);
  await prisma.$disconnect();
  process.exit(1);
});
