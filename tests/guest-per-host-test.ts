/**
 * [[GTC-465]] — typed guests are matched to existing records more carefully.
 *
 * See docs/tickets/GTC-465.md. A typed address is trimmed and compared as plain text, and on a
 * real event an existing guest record is reused only among the same host's own people, where
 * "the same host" is the event's own host, Event.hostId (a co-host adding people to host A's
 * event matches among host A's people). Samples are unchanged.
 *
 * It calls findOrCreateCapturedPerson (src/lib/households/capturePerson.ts) directly, in this
 * process, against gather_demo, with made-up hosts, events and guests.
 *
 * CHECKS
 *   P  a typed address is compared as plain text
 *   X  a second host typing the same guest gets a record of their own
 *   C  on host A's event run with a co-host, the match is among host A's events
 *   S  the same host typing the same guest on another of their events gets the same record
 *   H  the host's own record still comes first on their own events
 *   M  samples behave as before
 *   T  spaces around a typed email are trimmed
 *   R  a removed guest: found again only through an email opt-out on this host's own event,
 *      not through a second host's, and not at all with no opt-out
 *   N  a STOP still holds: the last send check refuses the number, and nothing leaves
 *   E  the four entry points still go through the helper, with the event and its own host
 *   Z  every row this run made is gone
 *
 * SAFETY. gather_demo only: it stops before connecting if DATABASE_URL names anything else, and
 * again if the connected database says otherwise. Only made-up people (example.test addresses,
 * names like "Alex Test", numbers starting +642100). Before the send code loads, live sending is
 * set off and the text provider settings are blanked in this process, and an in-process guard
 * refuses (and counts) any connection that is not to this machine, and any fetch. Every row it
 * makes carries this run's stamp and is deleted in `finally`; Z1 reports anything left.
 *
 * Run: DATABASE_URL=<the local gather_demo> npx tsx tests/guest-per-host-test.ts
 * A dry run of the checks on hand-made inputs, with no database and nothing else loaded:
 *   GUEST_PER_HOST_DRY_RUN=1 npx tsx tests/guest-per-host-test.ts
 */
import fs from 'fs';
import path from 'path';
import net from 'net';
import { randomBytes } from 'crypto';

const ROOT = path.join(__dirname, '..');

const ENTRY_POINTS = [
  {
    id: 'E1',
    what: 'add person (the people POST)',
    file: 'src/app/api/events/[id]/people/route.ts',
  },
  {
    id: 'E2',
    what: 'CSV import (the batch-import POST)',
    file: 'src/app/api/events/[id]/people/batch-import/route.ts',
  },
  {
    id: 'E3',
    what: 'new household (the households POST)',
    file: 'src/app/api/events/[id]/households/route.ts',
  },
  {
    id: 'E4',
    what: 'household edit (reconcileHouseholdMembers)',
    file: 'src/lib/households/reconcileMembers.ts',
  },
] as const;

/** What the four entry points pass as hostPersonId today: each is the written event's hostId. */
const EVENT_HOST_VALUES = ['event.hostId', 'event!.hostId', 'await eventHostId()'];

type Rec = {
  id: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  inviteAnchorAt: Date | string | null;
  sampleEventId: string | null;
};

const plain = (email: string | null | undefined) => (email ?? '').trim().toLowerCase();
const time = (d: Date | string | null | undefined) => (d ? new Date(d).getTime() : null);

/** Code with comments removed (quotes respected), so a comment can neither pass nor fail E. */
function stripComments(src: string): string {
  let out = '';
  let quote: string | null = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    const n = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += n ?? '';
        i++;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === '/' && n === '/') {
      while (i < src.length && src[i] !== '\n') i++;
      out += '\n';
      continue;
    }
    if (c === '/' && n === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') quote = c;
    out += c;
  }
  return out;
}

/** The argument text of every findOrCreateCapturedPerson(...) call in some code. */
function captureCallArgs(code: string): string[] {
  const calls: string[] = [];
  const re = /findOrCreateCapturedPerson\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) {
    let depth = 1;
    let j = m.index + m[0].length;
    const start = j;
    while (j < code.length && depth > 0) {
      if (code[j] === '(') depth++;
      else if (code[j] === ')') depth--;
      j++;
    }
    calls.push(code.slice(start, j - 1));
  }
  return calls;
}

/** Every check's condition, as a plain function, so the dry run can feed it hand-made inputs. */
export const CHECKS = {
  /** P1, P2: what came back holds the typed address as plain text, and is not the other record. */
  plainText: (got: Rec | null, typed: string, other: Rec) =>
    !!got && got.id !== other.id && plain(got.email) === plain(typed),
  /** P3, P4, C2, H1, M1, T1: this exact record came back. */
  sameRecord: (got: Rec | null, want: Rec) => !!got && got.id === want.id,
  /** S1: this exact record came back, and the name already on it shows. */
  sameRecordNameShows: (got: Rec | null, want: Rec) =>
    !!got && got.id === want.id && got.name === want.name,
  /** X1: a new record, holding exactly the typed name, email and mobile. */
  newHoldingTyped: (
    got: Rec | null,
    other: Rec,
    typed: { name: string; email: string; phoneNumber: string }
  ) =>
    !!got &&
    got.id !== other.id &&
    got.name === typed.name &&
    got.email === typed.email &&
    got.phoneNumber === typed.phoneNumber,
  /** X2: the same name, email, mobile, first-sent date and sample mark as before. */
  unchanged: (before: Rec, after: Rec | null) =>
    !!after &&
    after.id === before.id &&
    after.name === before.name &&
    after.email === before.email &&
    after.phoneNumber === before.phoneNumber &&
    time(after.inviteAnchorAt) === time(before.inviteAnchorAt) &&
    after.sampleEventId === before.sampleEventId,
  /** C1, R2, R3: not the other record. */
  newRecord: (got: Rec | null, other: Rec) => !!got && got.id !== other.id,
  /** R1: this exact record came back, and the event's email opt-outs still name it. */
  sameRecordStillUnsubscribed: (got: Rec | null, want: Rec, optedOut: ReadonlySet<string>) =>
    !!got && got.id === want.id && optedOut.has(got.id),
  /** M2: none of the records that were there, and it carries the sample's mark. */
  newMarked: (got: Rec | null, sampleId: string, existingIds: string[]) =>
    !!got && !existingIds.includes(got.id) && got.sampleEventId === sampleId,
  /** M3: not the sample's record, and no sample mark. */
  newUnmarked: (got: Rec | null, sampleRec: Rec) =>
    !!got && got.id !== sampleRec.id && got.sampleEventId === null,
  /** N1: live sending off, no provider for the number, and the guard refused both test tries. */
  guardOn: (g: { live: boolean; provider: boolean; netRefused: boolean; fetchRefused: boolean }) =>
    !g.live && !g.provider && g.netRefused && g.fetchRefused,
  /** N2: the last send check said no, because the number has opted out. */
  refusedOptedOut: (r: { success: boolean; blocked?: string } | null) =>
    !!r && r.success === false && r.blocked === 'OPTED_OUT',
  /** N3: no outside connection and no fetch was tried. */
  nothingLeft: (n: { outside: number; fetches: number }) => n.outside === 0 && n.fetches === 0,
  /**
   * E1-E4: the file calls the helper, every call passes the event id and a hostPersonId that is
   * the written event's own hostId, and the file reads hostId from the event row by its id.
   */
  passesEventAndHost: (src: string) => {
    const code = stripComments(src);
    const readsEventHost =
      /\.event\s*\.findUnique\(\s*\{\s*where:\s*\{\s*id:\s*eventId\s*\}\s*,\s*select:\s*\{[^}]*\bhostId:\s*true/.test(
        code
      );
    const calls = captureCallArgs(code);
    return (
      readsEventHost &&
      calls.length > 0 &&
      calls.every((args) => {
        const passesEvent = /(^|[{,\s])eventId\s*(,|:|\})/.test(args);
        const host = /hostPersonId:\s*([^,}\n]+)/.exec(args)?.[1]?.trim();
        return passesEvent && !!host && EVENT_HOST_VALUES.includes(host);
      })
    );
  },
  /** Z1: nothing of this run is left, and every touched table is back to its starting count. */
  allGone: (z: {
    left: Record<string, number>;
    before: Record<string, number>;
    after: Record<string, number>;
  }) =>
    Object.values(z.left).every((n) => n === 0) &&
    Object.keys(z.before).length > 0 &&
    Object.keys(z.before).every((k) => z.before[k] === z.after[k]),
};

function databaseName(url: string | undefined): string {
  try {
    return new URL(url ?? '').pathname.replace(/^\//, '');
  } catch {
    return '';
  }
}

// ── The network guard ──────────────────────────────────────────────────────────
const guard = { outside: [] as string[], fetches: 0 };
const LOCAL = new Set(['localhost', '127.0.0.1', '::1']);

function installGuard() {
  const original = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (this: net.Socket, ...args: any[]) {
    // net.connect() hands its arguments on as one array; unwrap it, or the guard sees nothing.
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    let host = 'localhost';
    if (typeof first === 'string')
      host = 'localhost'; // a local socket path
    else if (typeof first === 'number') host = typeof args[1] === 'string' ? args[1] : 'localhost';
    else if (first && typeof first === 'object') {
      host = first.path ? 'localhost' : String(first.host ?? 'localhost');
    }
    if (!LOCAL.has(host)) {
      guard.outside.push(host);
      throw new Error(`guest-per-host guard: refused a connection to ${host}`);
    }
    return (original as any).apply(this, args);
  } as any;
  (globalThis as any).fetch = async () => {
    guard.fetches++;
    throw new Error('guest-per-host guard: fetch refused');
  };
}

// ── The run ────────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(id: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}${detail ? `\n    ${detail}` : ''}`);
    failed++;
    reds.push(id);
  }
}
const section = (s: string) => console.log(`\n── ${s}`);
const show = (r: Rec | null) =>
  r ? `${r.id.slice(-6)} "${r.name}" <${r.email}> ${r.phoneNumber ?? '-'}` : 'nothing';

async function main() {
  // ── 0. The database: gather_demo only ──
  const named = databaseName(process.env.DATABASE_URL);
  console.log(`database named by DATABASE_URL: ${named || '(none)'}`);
  if (named !== 'gather_demo') {
    console.error('STOP: DATABASE_URL does not name gather_demo. Nothing connected or written.');
    process.exit(2);
  }

  // ── 1. The guard, before anything that sends is loaded ──
  // The live-sending switch is read here, never set: test:live-switch F lets only the trap helper
  // set it. Sending is on only when it is exactly 'on' (the app's own reader); if it is, refuse.
  const LIVE = await import('../src/lib/live-sends');
  if (LIVE.isLiveSendingOn()) {
    console.error('STOP: live sending is switched on in this shell. Nothing connected or written.');
    process.exit(2);
  }
  for (const k of [
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
  ]) {
    process.env[k] = '';
  }
  installGuard();

  const { prisma } = await import('../src/lib/prisma');
  const rows = await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db`;
  const connected = rows[0]?.db ?? '';
  console.log(`database the connection points at: ${connected}`);
  if (connected !== 'gather_demo') {
    console.error('STOP: the connection is not gather_demo. Nothing written.');
    await prisma.$disconnect();
    process.exit(2);
  }

  const CAPTURE = await import('../src/lib/households/capturePerson');
  const SMS = await import('../src/lib/sms/send-sms');
  // Read only: the press's own reader of an event's email opt-outs (Zone 9, not edited).
  const OPTOUT = await import('../src/lib/eligibility/email-opt-out');

  const STAMP = `g465-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  const addr = (label: string) => `${label}-${STAMP}@example.test`;
  const digits = String(Date.now()).slice(-5);
  const NA = `+642100${digits}1`; // host A's guest's mobile
  const NB = `+642100${digits}2`; // what host B types
  const NSTOP = `+642100${digits}3`; // a number that said STOP

  const made = {
    persons: new Set<string>(),
    events: [] as string[],
    optOuts: [] as string[],
    emailOptOuts: [] as string[],
  };
  const errors: string[] = [];

  const totals = async () => ({
    Person: await prisma.person.count(),
    Event: await prisma.event.count(),
    PersonEvent: await prisma.personEvent.count(),
    SmsOptOut: await prisma.smsOptOut.count(),
    InviteEvent: await prisma.inviteEvent.count(),
    EmailOptOut: await prisma.emailOptOut.count(),
  });
  const before = await totals();

  const mkPerson = async (data: {
    name: string;
    email: string;
    phoneNumber?: string;
    sampleEventId?: string;
    smsOptedOut?: boolean;
    smsOptedOutAt?: Date;
  }) => {
    const p = await prisma.person.create({ data });
    made.persons.add(p.id);
    return p as Rec;
  };
  const mkEvent = async (
    label: string,
    hostId: string,
    extra: { isDemo?: boolean; coHostId?: string } = {}
  ) => {
    const start = new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const e = await prisma.event.create({
      data: { name: `GTC-465 test ${label}`, startDate: start, endDate: start, hostId, ...extra },
    });
    made.events.push(e.id);
    return e;
  };
  const onEvent = (personId: string, eventId: string) =>
    prisma.personEvent.create({ data: { personId, eventId, role: 'PARTICIPANT' } });
  const reread = async (r: Rec) =>
    (await prisma.person.findUnique({ where: { id: r.id } })) as Rec | null;
  /** The helper, as every entry point calls it: the event's id and the event's own host. */
  const capture = async (
    event: { id: string; hostId: string },
    name: string,
    email: string,
    phoneNumber: string | null = null,
    sentAt: Date | null = null
  ): Promise<Rec | null> => {
    try {
      const p = await CAPTURE.findOrCreateCapturedPerson(prisma, {
        eventId: event.id,
        hostPersonId: event.hostId,
        name,
        email,
        phoneNumber,
        sentAt,
      });
      if (plain(p.email).includes(STAMP)) made.persons.add(p.id);
      return p as Rec;
    } catch (e) {
      errors.push(String(e));
      return null;
    }
  };

  try {
    // ── The fixture ──
    const hostA = await mkPerson({ name: 'Ana Host', email: addr('ana-host') });
    const hostB = await mkPerson({ name: 'Ben Host', email: addr('ben-host') });
    const hostC = await mkPerson({ name: 'Cleo Cohost', email: addr('cleo-host') });
    const EA = await mkEvent('A one', hostA.id);
    const EA2 = await mkEvent('A two', hostA.id);
    const EA3 = await mkEvent('A three, with a co-host', hostA.id, { coHostId: hostC.id });
    const EB = await mkEvent('B one', hostB.id);
    const EC = await mkEvent('C one', hostC.id);

    const alex = await mkPerson({ name: 'Alex Test', email: addr('alex'), phoneNumber: NA });
    await onEvent(alex.id, EA.id);
    const rua = await mkPerson({ name: 'Rua Test', email: addr('ruaa') });
    await onEvent(rua.id, EA.id);
    const tui = await mkPerson({ name: 'Tui Test', email: addr('tui_x') });
    await onEvent(tui.id, EA.id);
    const jo = await mkPerson({ name: 'Jo Test', email: addr('jo') });
    await onEvent(jo.id, EC.id);

    // H: an older record at the host's address, already on her event; she is on none.
    const hanaOther = await mkPerson({ name: 'Hana Other', email: addr('hana') });
    const hostH = await mkPerson({ name: 'Hana Host', email: addr('hana') });
    const EH = await mkEvent('H one', hostH.id);
    await onEvent(hanaOther.id, EH.id);

    // M: a sample, its host marked as a copy's host is, and two guests made on it.
    const sampleHost = await mkPerson({ name: 'Sam Sample', email: addr('sam-sample') });
    const S = await mkEvent('sample', sampleHost.id, { isDemo: true });
    await prisma.person.update({ where: { id: sampleHost.id }, data: { sampleEventId: S.id } });
    const skyS = await mkPerson({ name: 'Sky Test', email: addr('sky'), sampleEventId: S.id });
    await onEvent(skyS.id, S.id);
    const kiriS = await mkPerson({ name: 'Kiri Sample', email: addr('kiri'), sampleEventId: S.id });
    await onEvent(kiriS.id, S.id);
    const skyReal = await mkPerson({ name: 'Sky Real', email: addr('sky') });
    await onEvent(skyReal.id, EA.id);

    // N: host A's guest whose number said STOP (account-wide, GTC-288).
    const wren = await mkPerson({
      name: 'Wren Test',
      email: addr('wren'),
      phoneNumber: NSTOP,
      smsOptedOut: true,
      smsOptedOutAt: new Date(),
    });
    await onEvent(wren.id, EA.id);
    const stop = await prisma.smsOptOut.create({
      data: { phoneNumber: NSTOP, rawMessage: 'STOP', attribution: 'MANUAL' },
    });
    made.optOuts.push(stop.id);

    const fixtureIds = [...made.persons];
    console.log(
      `fixture: ${made.events.length} events, ${fixtureIds.length} people, stamp ${STAMP}`
    );

    // ── P ──
    section('P — a typed address is compared as plain text (host A, her own event)');
    const p1Typed = addr('rua_');
    const p1 = await capture(EA, 'Rua', p1Typed);
    assert(
      'P1',
      'P1 an address typed with _ in it is compared as plain text: no record at a different address comes back',
      CHECKS.plainText(p1, p1Typed, rua),
      `typed <${p1Typed}>, got ${show(p1)}`
    );
    const p2Typed = `r%-${STAMP}@example.test`;
    const p2 = await capture(EA, 'Rua', p2Typed);
    assert(
      'P2',
      'P2 an address typed with % in it is compared as plain text: no record at a different address comes back',
      CHECKS.plainText(p2, p2Typed, rua),
      `typed <${p2Typed}>, got ${show(p2)}`
    );
    const p3 = await capture(EA, 'tui', addr('tui_x'));
    assert(
      'P3',
      'P3 CONTROL: an address that really holds _, typed exactly, still finds its own record',
      CHECKS.sameRecord(p3, tui),
      `got ${show(p3)}`
    );
    const p4 = await capture(EA, 'Rua', addr('ruaa').toUpperCase());
    assert(
      'P4',
      'P4 CONTROL: capital letters are still ignored: the same address in capitals finds the same record',
      CHECKS.sameRecord(p4, rua),
      `got ${show(p4)}`
    );

    // ── X ──
    section('X — another host');
    const alexBefore = (await reread(alex))!;
    const xTyped = { name: 'Alex Sample', email: addr('alex'), phoneNumber: NB };
    const sentB = new Date('2026-12-01T00:00:00.000Z');
    const x1 = await capture(EB, xTyped.name, xTyped.email, xTyped.phoneNumber, sentB);
    assert(
      'X1',
      'X1 another host typing the same email and first name gets a NEW record holding exactly what they typed (name, email, mobile)',
      CHECKS.newHoldingTyped(x1, alexBefore, xTyped),
      `host B got ${show(x1)}${x1?.id === alex.id ? ' (host A’s guest record)' : ''}`
    );
    const alexAfter = await reread(alex);
    const changed = alexAfter
      ? (['name', 'email', 'phoneNumber', 'inviteAnchorAt', 'sampleEventId'] as const).filter(
          (k) =>
            k === 'inviteAnchorAt'
              ? time(alexAfter[k]) !== time(alexBefore[k])
              : alexAfter[k] !== alexBefore[k]
        )
      : ['(the record is gone)'];
    assert(
      'X2',
      'X2 and the first host’s guest record is unchanged (name, email, mobile, first-sent date)',
      CHECKS.unchanged(alexBefore, alexAfter),
      `changed: ${changed.join(', ') || 'nothing'}`
    );

    // ── C ──
    section('C — a co-host (Q2)');
    const c1 = await capture(EA3, 'Jo', addr('jo'));
    assert(
      'C1',
      'C1 on host A’s event run with a co-host, the co-host’s own guest is NOT reused: a new record',
      CHECKS.newRecord(c1, jo),
      `got ${show(c1)}${c1?.id === jo.id ? ' (the co-host’s guest record)' : ''}`
    );
    const c2 = await capture(EA3, 'alex', addr('alex'));
    assert(
      'C2',
      'C2 CONTROL: on that same event, host A’s own guest is found',
      CHECKS.sameRecord(c2, alex),
      `got ${show(c2)}`
    );

    // ── S ──
    section('S — the same host');
    const s1 = await capture(EA2, 'alex', addr('alex'));
    assert(
      'S1',
      'S1 the same host typing the same guest on another of their own events gets the same record, with the name already on it',
      CHECKS.sameRecordNameShows(s1, alex),
      `got ${show(s1)}`
    );

    // ── H ──
    section('H — the host first');
    const h1 = await capture(EH, 'hana', addr('hana'));
    assert(
      'H1',
      'H1 on her own event the host’s own record comes first, ahead of an older record at her address that is already on the event (she has no membership row yet)',
      CHECKS.sameRecord(h1, hostH),
      `got ${show(h1)}; the other record is older: ${hanaOther.id < hostH.id}`
    );

    // ── M ──
    section('M — samples, as before');
    const m1 = await capture(S, 'sky', addr('sky'));
    assert(
      'M1',
      'M1 on a sample, a guest typed again is found inside the sample, never a real person at the same address',
      CHECKS.sameRecord(m1, skyS),
      `got ${show(m1)}${m1?.id === skyReal.id ? ' (the real person)' : ''}`
    );
    const m2 = await capture(S, 'Moana Test', addr('moana'));
    assert(
      'M2',
      'M2 on a sample, a new guest gets a new record carrying the sample’s mark',
      CHECKS.newMarked(m2, S.id, fixtureIds),
      `got ${show(m2)}, mark ${m2?.sampleEventId === S.id ? 'this sample' : String(m2?.sampleEventId)}`
    );
    const m3 = await capture(EB, 'kiri', addr('kiri'));
    assert(
      'M3',
      'M3 on a real event, a sample guest’s address and first name make a new unmarked record, never the sample’s',
      CHECKS.newUnmarked(m3, kiriS),
      `got ${show(m3)}, mark ${String(m3?.sampleEventId)}`
    );

    // ── T ──
    section('T — trimming (Q8)');
    const t1 = await capture(EA2, 'Alex', `  ${addr('alex')}  `);
    assert(
      'T1',
      'T1 spaces around a typed email are trimmed: the same host’s guest is found',
      CHECKS.sameRecord(t1, alex),
      `got ${show(t1)}`
    );

    // ── R ──
    section('R — a removed guest (Q9, Q11)');
    const unsubscribe = async (personId: string, eventId: string) => {
      const row = await prisma.emailOptOut.create({ data: { personId, eventId } });
      made.emailOptOuts.push(row.id);
    };
    /** As the remove-guest route does: the memberships go, the record and its opt-outs stay. */
    const removeFromHost = (personId: string, hostId: string) =>
      prisma.personEvent.deleteMany({ where: { personId, event: { hostId } } });

    const uma = await mkPerson({ name: 'Uma Test', email: addr('uma') });
    await onEvent(uma.id, EA.id);
    await unsubscribe(uma.id, EA.id);
    await removeFromHost(uma.id, hostA.id);
    const r1 = await capture(EA, 'Uma', addr('uma'));
    const optedOutOnEA = await OPTOUT.listEmailOptOutsForEvent(prisma, EA.id);
    assert(
      'R1',
      'R1 a guest unsubscribed from email on this host’s event, then removed from every event of this host, then typed back onto that event, is the SAME record, so the unsubscribe still holds',
      CHECKS.sameRecordStillUnsubscribed(r1, uma, optedOutOnEA),
      `got ${show(r1)}${r1 && r1.id !== uma.id ? ' (a new record)' : ''}; unsubscribed on the event: ${!!r1 && optedOutOnEA.has(r1.id)}`
    );

    const vic = await mkPerson({ name: 'Vic Test', email: addr('vic') });
    await onEvent(vic.id, EB.id);
    await unsubscribe(vic.id, EB.id);
    await removeFromHost(vic.id, hostB.id);
    const r2 = await capture(EA, 'Vic', addr('vic'));
    assert(
      'R2',
      'R2 another host’s email opt-out on a person does NOT make that record reusable by this host: a new record',
      CHECKS.newRecord(r2, vic),
      `got ${show(r2)}${r2?.id === vic.id ? ' (host B’s record)' : ''}`
    );

    const rewi = await mkPerson({ name: 'Rewi Test', email: addr('rewi') });
    await onEvent(rewi.id, EA.id);
    await removeFromHost(rewi.id, hostA.id);
    const r3 = await capture(EA, 'Rewi', addr('rewi'));
    assert(
      'R3',
      'R3 a removed guest with no opt-out is still NOT found again: a new record (Q9)',
      CHECKS.newRecord(r3, rewi),
      `got ${show(r3)}${r3?.id === rewi.id ? ' (the removed record)' : ''}`
    );

    // ── N ──
    section('N — a STOP still holds');
    let netRefused = false;
    try {
      net.connect({ host: '192.0.2.1', port: 9 }).destroy(); // a documentation address
    } catch {
      netRefused = true;
    }
    let fetchRefused = false;
    try {
      await fetch('http://192.0.2.1/');
    } catch {
      fetchRefused = true;
    }
    const probe = { outside: guard.outside.length, fetches: guard.fetches };
    guard.outside.length = 0;
    guard.fetches = 0;
    const g = {
      live: LIVE.isLiveSendingOn(),
      provider: SMS.smsProviderConfiguredFor(NSTOP),
      netRefused: netRefused && probe.outside === 1,
      fetchRefused: fetchRefused && probe.fetches === 1,
    };
    assert(
      'N1',
      'N1 the guard is on: live sending off, no text provider set up in this process, the network guard refuses a probe',
      CHECKS.guardOn(g),
      JSON.stringify(g)
    );
    const n = await capture(EB, 'Wren', addr('wren'), NSTOP);
    let sent: { success: boolean; blocked?: string; error?: string } | null = null;
    if (n) {
      try {
        sent = await SMS.sendSms({
          to: n.phoneNumber ?? '',
          message: 'GTC-465 test text. Never sent.',
          eventId: EB.id,
          personId: n.id,
        });
      } catch (e) {
        errors.push(String(e));
      }
    }
    assert(
      'N2',
      'N2 the record another host gets for a guest whose number said STOP is refused at the last send check as opted out',
      CHECKS.refusedOptedOut(sent),
      `record ${n ? (n.id === wren.id ? 'is host A’s' : 'is new') : 'none'}; send said ${JSON.stringify(sent)}`
    );
    assert(
      'N3',
      'N3 nothing left the machine: no outside connection and no fetch was tried',
      CHECKS.nothingLeft({ outside: guard.outside.length, fetches: guard.fetches }),
      `outside: ${guard.outside.join(', ') || 'none'}; fetches: ${guard.fetches}`
    );
  } finally {
    // ── E: the source (no database) ──
    section('E — the four entry points');
    for (const ep of ENTRY_POINTS) {
      const src = fs.readFileSync(path.join(ROOT, ep.file), 'utf8');
      assert(
        ep.id,
        `${ep.id} ${ep.what} goes through capturePerson with the event id and the event’s own host`,
        CHECKS.passesEventAndHost(src),
        ep.file
      );
    }

    // ── Z: clean up, only this run's rows ──
    section('Z — clean-up');
    const mine = { email: { contains: STAMP, mode: 'insensitive' as const } };
    const ours = await prisma.person.findMany({ where: mine, select: { id: true } });
    ours.forEach((p) => made.persons.add(p.id));
    const personIds = [...made.persons];
    await prisma.inviteEvent.deleteMany({
      where: { OR: [{ eventId: { in: made.events } }, { personId: { in: personIds } }] },
    });
    await prisma.smsOptOut.deleteMany({ where: { id: { in: made.optOuts } } });
    await prisma.emailOptOut.deleteMany({ where: { id: { in: made.emailOptOuts } } });
    await prisma.personEvent.deleteMany({ where: { eventId: { in: made.events } } });
    await prisma.event.deleteMany({ where: { id: { in: made.events } } });
    // A person is deleted only if it holds this run's stamp and is on no event at all.
    await prisma.person.deleteMany({ where: { ...mine, eventMemberships: { none: {} } } });

    const left = {
      Person: await prisma.person.count({ where: { OR: [{ id: { in: personIds } }, mine] } }),
      Event: await prisma.event.count({ where: { id: { in: made.events } } }),
      PersonEvent: await prisma.personEvent.count({ where: { eventId: { in: made.events } } }),
      SmsOptOut: await prisma.smsOptOut.count({
        where: { OR: [{ id: { in: made.optOuts } }, { phoneNumber: { in: [NA, NB, NSTOP] } }] },
      }),
      InviteEvent: await prisma.inviteEvent.count({
        where: { OR: [{ eventId: { in: made.events } }, { personId: { in: personIds } }] },
      }),
      EmailOptOut: await prisma.emailOptOut.count({
        where: { OR: [{ id: { in: made.emailOptOuts } }, { personId: { in: personIds } }] },
      }),
    };
    const after = await totals();
    console.log(`left by this run: ${JSON.stringify(left)}`);
    console.log(`table counts at the start: ${JSON.stringify(before)}`);
    console.log(`table counts at the end:   ${JSON.stringify(after)}`);
    assert(
      'Z1',
      'Z1 every row this run made is gone, and the six tables it touched are back to their counts at the start',
      CHECKS.allGone({ left, before, after })
    );
    if (errors.length)
      console.log(`errors met: ${errors.map((e) => e.split('\n')[0]).join(' | ')}`);
    await prisma.$disconnect();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(`red: ${reds.join(' ')}`);
  process.exit(failed > 0 ? 1 : 0);
}

// ── The dry run: each check's condition on hand-made inputs, nothing loaded ──────────
function dryRun() {
  let total = 0;
  let wrong = 0;
  const want = (id: string, input: string, got: boolean, expected: boolean) => {
    total++;
    const ok = got === expected;
    if (!ok) wrong++;
    console.log(
      `${ok ? 'ok ' : 'BAD'} ${id.padEnd(3)} ${input.padEnd(58)} -> ${got} (want ${expected})`
    );
  };
  const rec = (id: string, over: Partial<Rec> = {}): Rec => ({
    id,
    name: 'Alex Test',
    email: 'alex-x@example.test',
    phoneNumber: '+64210000001',
    inviteAnchorAt: null,
    sampleEventId: null,
    ...over,
  });
  const rua = rec('rua', { name: 'Rua Test', email: 'ruaa-x@example.test' });
  const alex = rec('alex');

  want(
    'P1',
    'pass: a new record at rua_-x',
    CHECKS.plainText(rec('new', { email: 'rua_-x@example.test' }), 'rua_-x@example.test', rua),
    true
  );
  want(
    'P1',
    'fail: Rua’s record (ruaa-x) came back',
    CHECKS.plainText(rua, 'rua_-x@example.test', rua),
    false
  );
  want('P1', 'fail: nothing came back', CHECKS.plainText(null, 'rua_-x@example.test', rua), false);
  want(
    'P2',
    'pass: a new record at r%-x',
    CHECKS.plainText(rec('new', { email: 'r%-x@example.test' }), 'r%-x@example.test', rua),
    true
  );
  want(
    'P2',
    'fail: another record at a different address',
    CHECKS.plainText(rec('z', { email: 'rzz-x@example.test' }), 'r%-x@example.test', rua),
    false
  );

  for (const id of ['P3', 'P4', 'C2', 'H1', 'M1', 'T1']) {
    want(id, 'pass: the wanted record', CHECKS.sameRecord(rec('w'), rec('w')), true);
    want(id, 'fail: another record', CHECKS.sameRecord(rec('o'), rec('w')), false);
  }
  want('T1', 'fail: nothing came back', CHECKS.sameRecord(null, rec('w')), false);

  want(
    'S1',
    'pass: the record, its name as stored',
    CHECKS.sameRecordNameShows(rec('alex'), alex),
    true
  );
  want(
    'S1',
    'fail: the record, renamed',
    CHECKS.sameRecordNameShows(rec('alex', { name: 'alex' }), alex),
    false
  );
  want('S1', 'fail: a new record', CHECKS.sameRecordNameShows(rec('new'), alex), false);

  const typed = { name: 'Alex Sample', email: 'alex-x@example.test', phoneNumber: '+64210000002' };
  want(
    'X1',
    'pass: a new record holding what B typed',
    CHECKS.newHoldingTyped(rec('new', typed), alex, typed),
    true
  );
  want('X1', 'fail: host A’s record', CHECKS.newHoldingTyped(alex, alex, typed), false);
  want(
    'X1',
    'fail: a new record with A’s mobile',
    CHECKS.newHoldingTyped(rec('new', { ...typed, phoneNumber: '+64210000001' }), alex, typed),
    false
  );
  want(
    'X1',
    'fail: a new record with A’s name',
    CHECKS.newHoldingTyped(rec('new', { ...typed, name: 'Alex Test' }), alex, typed),
    false
  );

  want('X2', 'pass: the same values', CHECKS.unchanged(alex, rec('alex')), true);
  want(
    'X2',
    'fail: first-sent date filled in',
    CHECKS.unchanged(alex, rec('alex', { inviteAnchorAt: new Date('2026-12-01') })),
    false
  );
  want(
    'X2',
    'fail: mobile changed',
    CHECKS.unchanged(alex, rec('alex', { phoneNumber: '+64210000002' })),
    false
  );
  want('X2', 'fail: the record is gone', CHECKS.unchanged(alex, null), false);

  const jo = rec('jo', { name: 'Jo Test' });
  want('C1', 'pass: a new record', CHECKS.newRecord(rec('new'), jo), true);
  want('C1', 'fail: the co-host’s guest record', CHECKS.newRecord(jo, jo), false);

  want(
    'M2',
    'pass: new, carrying the sample’s mark',
    CHECKS.newMarked(rec('new', { sampleEventId: 'S' }), 'S', ['a', 'b']),
    true
  );
  want('M2', 'fail: new, unmarked', CHECKS.newMarked(rec('new'), 'S', ['a', 'b']), false);
  want(
    'M2',
    'fail: an existing record',
    CHECKS.newMarked(rec('a', { sampleEventId: 'S' }), 'S', ['a', 'b']),
    false
  );
  const kiri = rec('kiri', { sampleEventId: 'S' });
  want('M3', 'pass: new, unmarked', CHECKS.newUnmarked(rec('new'), kiri), true);
  want('M3', 'fail: the sample’s record', CHECKS.newUnmarked(kiri, kiri), false);
  want(
    'M3',
    'fail: new, but marked',
    CHECKS.newUnmarked(rec('new', { sampleEventId: 'S' }), kiri),
    false
  );

  const uma = rec('uma', { name: 'Uma Test' });
  want(
    'R1',
    'pass: the same record, still unsubscribed on the event',
    CHECKS.sameRecordStillUnsubscribed(rec('uma'), uma, new Set(['uma'])),
    true
  );
  want(
    'R1',
    'fail: a new record (the unsubscribe left behind)',
    CHECKS.sameRecordStillUnsubscribed(rec('new'), uma, new Set(['uma'])),
    false
  );
  want(
    'R1',
    'fail: the same record, but no unsubscribe on the event',
    CHECKS.sameRecordStillUnsubscribed(rec('uma'), uma, new Set()),
    false
  );
  want(
    'R1',
    'fail: nothing came back',
    CHECKS.sameRecordStillUnsubscribed(null, uma, new Set(['uma'])),
    false
  );
  const vic = rec('vic', { name: 'Vic Test' });
  want('R2', 'pass: a new record', CHECKS.newRecord(rec('new'), vic), true);
  want('R2', 'fail: host B’s record reused', CHECKS.newRecord(vic, vic), false);
  const rewi = rec('rewi', { name: 'Rewi Test' });
  want('R3', 'pass: a new record', CHECKS.newRecord(rec('new'), rewi), true);
  want('R3', 'fail: the removed record found again', CHECKS.newRecord(rewi, rewi), false);

  const on = { live: false, provider: false, netRefused: true, fetchRefused: true };
  want('N1', 'pass: off, unconfigured, both probes refused', CHECKS.guardOn(on), true);
  want('N1', 'fail: live sending on', CHECKS.guardOn({ ...on, live: true }), false);
  want('N1', 'fail: a provider configured', CHECKS.guardOn({ ...on, provider: true }), false);
  want(
    'N1',
    'fail: the net probe was not refused',
    CHECKS.guardOn({ ...on, netRefused: false }),
    false
  );
  want(
    'N2',
    'pass: refused, OPTED_OUT',
    CHECKS.refusedOptedOut({ success: false, blocked: 'OPTED_OUT' }),
    true
  );
  want(
    'N2',
    'fail: refused for another reason',
    CHECKS.refusedOptedOut({ success: false, blocked: 'SMS_DISABLED' }),
    false
  );
  want('N2', 'fail: accepted', CHECKS.refusedOptedOut({ success: true }), false);
  want('N2', 'fail: no answer', CHECKS.refusedOptedOut(null), false);
  want('N3', 'pass: nothing tried', CHECKS.nothingLeft({ outside: 0, fetches: 0 }), true);
  want('N3', 'fail: one outside connection', CHECKS.nothingLeft({ outside: 1, fetches: 0 }), false);
  want('N3', 'fail: one fetch', CHECKS.nothingLeft({ outside: 0, fetches: 1 }), false);

  const read =
    'const event = await prisma.event.findUnique({ where: { id: eventId }, select: { hostId: true } });\n';
  const good = `${read}const p = await findOrCreateCapturedPerson(prisma, { eventId, hostPersonId: event.hostId, name });`;
  for (const ep of ENTRY_POINTS) {
    want(
      ep.id,
      'pass: hand-made, the event id and the event’s host',
      CHECKS.passesEventAndHost(good),
      true
    );
    want(
      ep.id,
      'fail: the host taken from the signed-in user',
      CHECKS.passesEventAndHost(good.replace('event.hostId', 'user.personId')),
      false
    );
    want(
      ep.id,
      'fail: no event id passed',
      CHECKS.passesEventAndHost(good.replace('eventId, ', '')),
      false
    );
    want(
      ep.id,
      'fail: the helper bypassed',
      CHECKS.passesEventAndHost(`${read}await prisma.person.create({ data: { name } });`),
      false
    );
    want(
      ep.id,
      'fail: the call only in a comment',
      CHECKS.passesEventAndHost(
        `${read}// findOrCreateCapturedPerson(prisma, { eventId, hostPersonId: event.hostId })`
      ),
      false
    );
    want(
      ep.id,
      'fail: the host not read from the event',
      CHECKS.passesEventAndHost(good.replace(read, '')),
      false
    );
    const disk = fs.readFileSync(path.join(ROOT, ep.file), 'utf8');
    want(
      ep.id,
      `the file on disk: ${path.basename(path.dirname(ep.file))}/${path.basename(ep.file)}`,
      CHECKS.passesEventAndHost(disk),
      true
    );
  }

  const counts = { Person: 5, Event: 2 };
  want(
    'Z1',
    'pass: nothing left, counts as at the start',
    CHECKS.allGone({ left: { Person: 0 }, before: counts, after: { ...counts } }),
    true
  );
  want(
    'Z1',
    'fail: one person left',
    CHECKS.allGone({ left: { Person: 1 }, before: counts, after: { ...counts } }),
    false
  );
  want(
    'Z1',
    'fail: a table count moved',
    CHECKS.allGone({ left: { Person: 0 }, before: counts, after: { ...counts, Event: 3 } }),
    false
  );

  const ids = new Set([
    'P1',
    'P2',
    'P3',
    'P4',
    'X1',
    'X2',
    'C1',
    'C2',
    'S1',
    'H1',
    'M1',
    'M2',
    'M3',
    'T1',
    'R1',
    'R2',
    'R3',
    'N1',
    'N2',
    'N3',
    'E1',
    'E2',
    'E3',
    'E4',
    'Z1',
  ]);
  console.log(
    `\ndry run: ${total - wrong} of ${total} gave the expected answer, ${wrong} BAD; ${ids.size} checks covered`
  );
  process.exit(wrong > 0 ? 1 : 0);
}

if (process.env.GUEST_PER_HOST_DRY_RUN === '1') {
  dryRun();
} else {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
