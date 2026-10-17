/**
 * GTC-335 — the arrival replay rewinds the facts beside the rows.
 *
 * THE RULING (SCOPED 2026-10-01, Q1): *"Replay it once. The first time you open the board after it
 * happened, it plays as a step, using the time Gather recorded it. After that it's just part of the
 * board."* And: *"Your own changes (don't-chase marks, the reminders switch, exceptions) still never
 * replay: Ruling 22 says your own decisions aren't news to you."*
 *
 * THE LAYERS:
 *  A. `deliveryRowAsAt`, pure — one case per recorded time, and the row with no time held
 *  B. `deriveReplay`, pure — the supplied facts, the absent maps (today's meaning), the order key,
 *     and Ruling 6's reversal still last
 *  C. the seam — `rewindGuestFacts` into `readAskPreview`'s discount: each guest fact moves the past
 *     route only when recorded after `since`; a fact with no time is held; no option, no change
 *  D. real rows through `readGlanceReplay` — each fact twice, `since` before its time (plays once)
 *     and after it (no step); a child reads its carrier's; nothing changed plays nothing
 *  E. Ruling 22 held — the mark, the switch, the exception and a carrier's mark are today's, so an
 *     accept while she was away plays NOT_CHASED → GREEN with no spark
 *  F. order — a fact step keeps the order things happened in
 *  G. exhaustion as at `since` asks the chase route as at `since`
 *  S. structure — no time enters ask-preview
 *
 * NOTHING IS SENT. No provider is imported, no cron is run, and every row written here is this
 * file's own fixture, removed in `finally`.
 *
 * Run: npx tsx tests/replay-facts-test.ts
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const TAG = 'GTC335';
const HOUR = 60 * 60 * 1000;

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

/** Key-sorted JSON, so two reads that differ only in row order compare equal. */
function canonical(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object' && !(v instanceof Date)) {
      return Object.fromEntries(
        Object.keys(v as object)
          .sort()
          .map((k) => [k, sort((v as Record<string, unknown>)[k])])
      );
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

const show = (s: unknown) => JSON.stringify(s);

async function main() {
  let DF: any = null;
  let RW: any = null;
  let RP: any = null;
  let RE: any = null;
  let RD: any = null;
  let AP: any = null;
  try {
    DF = await import('../src/lib/glance/delivery-fact');
    RW = await import('../src/lib/glance/rewind');
    RP = await import('../src/lib/glance/replay');
    RE = await import('../src/lib/glance/replay-entry');
    RD = await import('../src/lib/glance/read');
    AP = await import('../src/lib/preflight/ask-preview');
  } catch (err) {
    console.error(`\x1b[31m!\x1b[0m module load failed: ${(err as Error).message.split('\n')[0]}`);
  }

  const now = new Date();
  const ago = (h: number) => new Date(now.getTime() - h * HOUR);
  // Every fact below is recorded at FACT. `since` is BEFORE it or AFTER it.
  const FACT = ago(10);
  const BEFORE = ago(20);
  const AFTER = ago(5);
  const sentAt = ago(240);

  // ══ LAYER A — deliveryRowAsAt, pure ═════════════════════════════════════════════════════
  const base = {
    id: 'r1',
    personEventId: 'pe1',
    createdAt: ago(100),
    rejectedAt: null,
    withheldAt: null,
    withheldWhy: null,
    deliveryState: null,
    deliveryCheckedAt: null,
  };
  const asAt = (row: any, since: Date) => DF.deliveryRowAsAt(row, since);
  const failureAt = (row: any, since: Date) => DF.deliveryFactFrom(asAt(row, since)).failure;
  assert(
    'A',
    'a row made after `since` did not exist then — null (createdAt)',
    ok(() => asAt({ ...base, createdAt: FACT }, BEFORE) === null) &&
      ok(() => asAt({ ...base, createdAt: FACT }, AFTER) !== null)
  );
  assert(
    'A',
    'a rejection recorded after `since` is not a rejection then; before it, it is (rejectedAt)',
    ok(() => failureAt({ ...base, rejectedAt: FACT }, BEFORE) === null) &&
      ok(() => failureAt({ ...base, rejectedAt: FACT }, AFTER) === 'NOT_DELIVERED')
  );
  assert(
    'A',
    'a withholding recorded after `since` is not one then; before it, it is (withheldAt)',
    ok(() => {
      const row = { ...base, withheldAt: FACT, withheldWhy: 'NO_CHANNEL' };
      const then = asAt(row, BEFORE);
      return then.withheldAt === null && then.withheldWhy === null;
    }) &&
      ok(
        () =>
          failureAt({ ...base, withheldAt: FACT, withheldWhy: 'NO_CHANNEL' }, AFTER) ===
          'UNREACHABLE'
      )
  );
  assert(
    'A',
    'a bounce read by the poll after `since` is not a bounce then; before it, it is (deliveryCheckedAt)',
    ok(
      () =>
        failureAt({ ...base, deliveryState: 'BOUNCED', deliveryCheckedAt: FACT }, BEFORE) === null
    ) &&
      ok(
        () =>
          failureAt({ ...base, deliveryState: 'BOUNCED', deliveryCheckedAt: FACT }, AFTER) ===
          'NOT_DELIVERED'
      )
  );
  assert(
    'A',
    'POINT 3 — a delivery state with no recorded time is HELD as it is now, whatever `since` is',
    ok(
      () =>
        failureAt({ ...base, deliveryState: 'BOUNCED', deliveryCheckedAt: null }, BEFORE) ===
        'NOT_DELIVERED'
    )
  );
  assert(
    'A',
    'a row with nothing after `since` is returned unchanged',
    ok(() => {
      const row = { ...base, deliveryState: 'BOUNCED', deliveryCheckedAt: ago(50) };
      return canonical(asAt(row, BEFORE)) === canonical(row);
    })
  );

  // ══ LAYER B — deriveReplay, pure ════════════════════════════════════════════════════════
  const pureEvent = {
    status: 'CONFIRMING',
    sentAt,
    endDate: new Date(now.getTime() + 200 * HOUR),
    decideByOffsetHours: null,
    nudgePace: null,
  };
  const gPerson = (id: string, state: string, chase: any = null) => ({
    personEventId: id,
    personId: `p-${id}`,
    name: id,
    isHost: false,
    householdRole: null,
    role: 'PARTICIPANT',
    teamId: 't',
    nudgeMark: null,
    state,
    reasons: [],
    nextNudgeAt: null,
    items: [
      {
        itemId: `i-${id}`,
        assignmentId: `a-${id}`,
        name: 'dish',
        critical: false,
        kind: 'ITEM',
        teamId: 't',
        quantityAmount: null,
        quantityUnit: null,
        quantityUnitCustom: null,
        state: 'AMBER',
        reason: 'AWAITING_REPLY',
        decideByAt: null,
      },
    ],
    emailNote: null,
    textable: false,
    chase,
    chaseNote: null,
    carrierNote: null,
  });
  const gOf = (people: any[]) => ({ households: [], unhoused: people });
  const rewindOf = (people: any[], extra: any = {}) => ({
    responseAt: new Map(people.map((p) => [`a-${p.personEventId}`, 'PENDING'])),
    absentAt: new Set<string>(),
    changedSince: new Map<string, number>(),
    clockAt: new Map(
      people.map((p) => [`a-${p.personEventId}`, { dropOffAt: null, decideByOffsetHours: null }])
    ),
    attendanceAt: new Map(people.map((p) => [p.personEventId, null])),
    ambiguous: new Set<string>(),
    ...extra,
  });
  const derive = (people: any[], extra: any = {}) =>
    RP.deriveReplay(gOf(people), rewindOf(people, extra), pureEvent, BEFORE, now).steps;

  const bRed = gPerson('bRed', 'RED');
  assert(
    'B',
    "ABSENT MAPS KEEP TODAY'S MEANING: with no `deliveryAt`, the past has no failure and a red plays",
    ok(() => {
      const s = derive([bRed]);
      return s.length === 1 && s[0].from === 'AMBER' && s[0].to === 'RED';
    })
  );
  assert(
    'B',
    'a failure supplied as at `since` makes the past red, so nothing plays',
    ok(
      () =>
        derive([bRed], { deliveryAt: new Map([['bRed', { failure: 'NOT_DELIVERED' }]]) }).length ===
        0
    )
  );
  const opted = { standing: 'EMAIL_OPTED_OUT', carrierMarked: false };
  const bOpt = gPerson('bOpt', 'RED', opted);
  assert(
    'B',
    'the chase fact as at `since` is read from `chaseAt`: no refusal then → AMBER → RED plays',
    ok(() => {
      const s = derive([bOpt], {
        chaseAt: new Map([['bOpt', { standing: null, carrierMarked: false }]]),
      });
      return s.length === 1 && s[0].from === 'AMBER' && s[0].to === 'RED';
    })
  );
  assert(
    'B',
    'with no `chaseAt` entry the chase fact is HELD as it is now — fail-safe silence',
    ok(() => derive([bOpt]).length === 0)
  );
  const bRow = gPerson('bRow', 'GREEN');
  const bLate = gPerson('bLate', 'RED');
  const bOut = gPerson('bOut', 'OUT');
  assert(
    'B',
    'POINT 5 — a fact step orders by `factChangedSince` against the rows’ key; the reversal still plays last',
    ok(() => {
      const people = [bLate, bOut, bRow];
      const s = RP.deriveReplay(
        gOf(people),
        rewindOf(people, {
          responseAt: new Map([
            ['a-bRow', 'PENDING'],
            ['a-bLate', 'PENDING'],
            ['a-bOut', 'PENDING'],
          ]),
          changedSince: new Map([['a-bRow', 1000]]),
          attendanceAt: new Map([
            ['bRow', null],
            ['bLate', null],
            ['bOut', 'YES'],
          ]),
          deliveryAt: new Map([['bLate', { failure: null }]]),
          factChangedSince: new Map([['bLate', 2000]]),
        }),
        pureEvent,
        BEFORE,
        now
      ).steps.map((x: any) => x.personEventId);
      return s.join(',') === 'bRow,bLate,bOut';
    })
  );

  const created = {
    events: [] as string[],
    persons: [] as string[],
    addresses: [] as string[],
  };
  const stamp = Date.now();
  let phoneSeq = 0;
  const phone = () => `+6421${String(stamp).slice(-6)}${phoneSeq++}`;

  try {
    // ══ Fixtures ═════════════════════════════════════════════════════════════════════════
    async function mkEvent(label: string, nudgePace: string | null = null) {
      const host = await prisma.person.create({
        data: {
          name: `${label} Host`,
          email: `gtc335+${label.toLowerCase()}+host+${stamp}@example.test`,
        },
      });
      created.persons.push(host.id);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} ${label}`,
          startDate: new Date(now.getTime() + 150 * HOUR),
          endDate: new Date(now.getTime() + 200 * HOUR),
          hostId: host.id,
          status: 'CONFIRMING',
          sentAt,
          nudgePace: nudgePace as any,
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
        smsOptedOut?: boolean;
        smsOptedOutAt?: Date | null;
        householdId?: string | null;
        householdRole?: string;
        mark?: 'DONT_CHASE' | null;
        exception?: 'HAND_TO_HOST' | null;
      } = {}
    ) {
      const child = o.householdRole === 'CHILD';
      const p = await prisma.person.create({
        data: {
          name,
          email:
            o.email !== undefined
              ? o.email
              : child
                ? null
                : `gtc335+${name.split(' ')[0].toLowerCase()}+${stamp}@example.test`,
          phoneNumber: o.phone ?? null,
          smsOptedOut: o.smsOptedOut ?? false,
          smsOptedOutAt: o.smsOptedOutAt ?? null,
        },
      });
      created.persons.push(p.id);
      const pe = await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: e.ev.id,
          role: 'PARTICIPANT',
          householdId: o.householdId ?? null,
          householdRole: o.householdRole ?? (o.householdId ? 'GUEST' : null),
          nudgeMark: o.mark ?? null,
          chaseException: o.exception ?? null,
          sentAt: child ? null : sentAt,
        },
      });
      const item = await prisma.item.create({
        data: { teamId: e.team.id, name: `${name}'s dish`, kind: 'ITEM' },
      });
      const assignment = await prisma.assignment.create({
        // Held before any `since` here: a row born after she looked is `absentAt`, not PENDING.
        data: { itemId: item.id, personId: p.id, response: 'PENDING', createdAt: ago(300) },
      });
      return { p, pe, assignment };
    }
    type Member = Awaited<ReturnType<typeof mkMember>>;

    async function askRow(e: Ev, m: Member, o: Record<string, unknown> = {}) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId: m.pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          createdAt: sentAt,
          attemptedAt: sentAt,
          attemptCount: 1,
          acceptedAt: sentAt,
          provider: 'resend',
          providerMessageId: `${TAG}-${m.pe.id}-${Math.random()}`,
          ...o,
        } as any,
      });
    }
    async function chaseRow(e: Ev, m: Member, kind: string, at: Date) {
      await prisma.outboundMessage.create({
        data: {
          eventId: e.ev.id,
          personEventId: m.pe.id,
          kind: kind as any,
          channel: 'EMAIL',
          createdAt: at,
          attemptedAt: at,
          attemptCount: 1,
          acceptedAt: at,
          provider: 'resend',
          providerMessageId: `${TAG}-${m.pe.id}-${kind}`,
        },
      });
    }
    /** A guest's accept, as both ack routes record it: the row, and the ledger entry beside it. */
    async function accepted(e: Ev, m: Member, at: Date) {
      await prisma.assignment.update({
        where: { id: m.assignment.id },
        data: { response: 'ACCEPTED' },
      });
      await prisma.auditEntry.create({
        data: {
          eventId: e.ev.id,
          actorId: m.p.id,
          actionType: 'ACCEPT_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: m.assignment.id,
          details: '',
          timestamp: at,
        },
      });
    }
    async function mkHousehold(e: Ev, contact: Member) {
      const hh = await prisma.household.create({
        data: { eventId: e.ev.id, contactPersonEventId: contact.pe.id },
      });
      await prisma.personEvent.update({
        where: { id: contact.pe.id },
        data: { householdId: hh.id, householdRole: 'PRIMARY_CONTACT' },
      });
      return hh;
    }
    async function block(m: Member, at: Date, e: Ev) {
      const address = m.p.email!.toLowerCase();
      await prisma.emailBlock.create({
        data: { address, reason: 'BOUNCED', eventId: e.ev.id, firstSeenAt: at },
      });
      created.addresses.push(address);
    }

    // ── Event D: one person per rewound fact ──
    const eD = await mkEvent('D');
    const dBounce = await mkMember(eD, 'Bo Bounced');
    await askRow(eD, dBounce, { deliveryState: 'BOUNCED', deliveryCheckedAt: FACT });
    const dReject = await mkMember(eD, 'Rae Rejected');
    await askRow(eD, dReject, {
      acceptedAt: null,
      providerMessageId: null,
      attemptedAt: FACT,
      rejectedAt: FACT,
      providerError: 'fixture',
    });
    // A text-only guest whose opt-out has NO recorded time (point 3): held, so their past is grey.
    const dWithheld = await mkMember(eD, 'Wes Withheld', {
      email: null,
      phone: phone(),
      smsOptedOut: true,
      smsOptedOutAt: null,
    });
    await askRow(eD, dWithheld, {
      channel: 'TEXT',
      acceptedAt: null,
      attemptedAt: null,
      attemptCount: 0,
      provider: null,
      providerMessageId: null,
      withheldAt: FACT,
      withheldWhy: 'SMS_OPTED_OUT',
    });
    // Already red before either `since`; the host resent while she was away, and it bounced too.
    const dResend = await mkMember(eD, 'Res Resent');
    await askRow(eD, dResend, { deliveryState: 'BOUNCED', deliveryCheckedAt: ago(30) });
    await askRow(eD, dResend, {
      createdAt: ago(8),
      attemptedAt: ago(8),
      acceptedAt: ago(8),
      deliveryState: 'BOUNCED',
      deliveryCheckedAt: ago(7),
    });
    const dOpt = await mkMember(eD, 'Una Unsub');
    await askRow(eD, dOpt);
    await prisma.emailOptOut.create({
      data: { personId: dOpt.p.id, eventId: eD.ev.id, optedOutAt: FACT },
    });
    const dBlock = await mkMember(eD, 'Blake Blocked');
    await askRow(eD, dBlock);
    await block(dBlock, FACT, eD);
    // Point 4: a child whose carrier's message bounced.
    const kCarrier = await mkMember(eD, 'Kay Carrier');
    await askRow(eD, kCarrier, { deliveryState: 'BOUNCED', deliveryCheckedAt: FACT });
    const hhK = await mkHousehold(eD, kCarrier);
    const kChild = await mkMember(eD, 'Kit Kid', { householdId: hhK.id, householdRole: 'CHILD' });
    // G: quiet before `since`, opted out after it.
    const gQuiet = await mkMember(eD, 'Quin Quiet');
    await askRow(eD, gQuiet);
    await chaseRow(eD, gQuiet, 'CHASE_FIRST', ago(192));
    await chaseRow(eD, gQuiet, 'CHASE_SECOND', ago(120));
    await prisma.emailOptOut.create({
      data: { personId: gQuiet.p.id, eventId: eD.ev.id, optedOutAt: FACT },
    });
    // F: an accept at 15h, a bounce at 18h (and Bo's at 10h).
    const fAccept = await mkMember(eD, 'Ace Accepted');
    await askRow(eD, fAccept);
    await accepted(eD, fAccept, ago(15));
    const fEarly = await mkMember(eD, 'Eli Early');
    await askRow(eD, fEarly, { deliveryState: 'BOUNCED', deliveryCheckedAt: ago(18) });
    const dCtl = await mkMember(eD, 'Cam Control');
    await askRow(eD, dCtl);

    // ── Event E: Ruling 22's held facts (the switch is on event E2) ──
    const eE = await mkEvent('E');
    const eMarked = await mkMember(eE, 'Mia Marked', { mark: 'DONT_CHASE' });
    await askRow(eE, eMarked);
    await accepted(eE, eMarked, FACT);
    const eHanded = await mkMember(eE, 'Hank Handed', { exception: 'HAND_TO_HOST' });
    await askRow(eE, eHanded);
    await accepted(eE, eHanded, FACT);
    const eCarrier = await mkMember(eE, 'Cal Markedcarrier', { mark: 'DONT_CHASE' });
    await askRow(eE, eCarrier);
    const hhE = await mkHousehold(eE, eCarrier);
    const eKid = await mkMember(eE, 'Kim Kid', { householdId: hhE.id, householdRole: 'CHILD' });
    await accepted(eE, eKid, FACT);
    const eE2 = await mkEvent('E2', 'OFF');
    const ePace = await mkMember(eE2, 'Pat Paceoff');
    await askRow(eE2, ePace);
    await accepted(eE2, ePace, FACT);

    // ── Event C: the seam ──
    const eC = await mkEvent('C');
    const cSmsRow = await mkMember(eC, 'Sam Smsrow', { email: null, phone: phone() });
    await prisma.smsOptOut.create({
      data: { phoneNumber: cSmsRow.p.phoneNumber!, hostId: eC.host.id, optedOutAt: FACT },
    });
    const cSmsFlag = await mkMember(eC, 'Sal Smsflag', {
      email: null,
      phone: phone(),
      smsOptedOut: true,
      smsOptedOutAt: FACT,
    });
    const cSmsNull = await mkMember(eC, 'Sid Smsnull', {
      email: null,
      phone: phone(),
      smsOptedOut: true,
      smsOptedOutAt: null,
    });
    const cOpt = await mkMember(eC, 'Ola Optedout');
    await prisma.emailOptOut.create({
      data: { personId: cOpt.p.id, eventId: eC.ev.id, optedOutAt: FACT },
    });
    const cBlock = await mkMember(eC, 'Bea Blocked');
    await block(cBlock, FACT, eC);

    // ══ LAYER C — the seam ═══════════════════════════════════════════════════════════════
    const routesAt = async (since: Date) => {
      const facts = await RW.rewindGuestFacts(prisma, eC.ev.id, since);
      const preview = await AP.readAskPreview(prisma, eC.ev.id, '', { discount: facts.later });
      return { facts, byMembership: preview.chase.byMembership };
    };
    let before: any = null;
    let after: any = null;
    try {
      before = await routesAt(BEFORE);
      after = await routesAt(AFTER);
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m the seam threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const route = (r: any, m: Member) => r?.byMembership?.[m.pe.id];
    const reached = (r: any, m: Member, channel: string) =>
      ok(() => route(r, m).kind === 'DIRECT' && route(r, m).channel === channel);
    const refused = (r: any, m: Member, why: string) =>
      ok(() => route(r, m).kind === 'NONE' && route(r, m).why === why);
    assert(
      'C',
      'an SmsOptOut row recorded after `since` did not stand then: texted; before `since`, refused',
      reached(before, cSmsRow, 'TEXT') && refused(after, cSmsRow, 'SMS_OPTED_OUT'),
      `${show(route(before, cSmsRow))} / ${show(route(after, cSmsRow))}`
    );
    assert(
      'C',
      'Person.smsOptedOut with smsOptedOutAt after `since` did not stand then; before, it did',
      reached(before, cSmsFlag, 'TEXT') && refused(after, cSmsFlag, 'SMS_OPTED_OUT'),
      `${show(route(before, cSmsFlag))} / ${show(route(after, cSmsFlag))}`
    );
    assert(
      'C',
      'POINT 3 — Person.smsOptedOut with NO smsOptedOutAt is held as it is now, at either `since`',
      refused(before, cSmsNull, 'SMS_OPTED_OUT') && refused(after, cSmsNull, 'SMS_OPTED_OUT'),
      `${show(route(before, cSmsNull))} / ${show(route(after, cSmsNull))}`
    );
    assert(
      'C',
      'an EmailOptOut recorded after `since` did not stand then; before, it did',
      reached(before, cOpt, 'EMAIL') && refused(after, cOpt, 'EMAIL_OPTED_OUT'),
      `${show(route(before, cOpt))} / ${show(route(after, cOpt))}`
    );
    assert(
      'C',
      'an EmailBlock first seen after `since` did not stand then; before, it did',
      reached(before, cBlock, 'EMAIL') && refused(after, cBlock, 'EMAIL_BLOCKED'),
      `${show(route(before, cBlock))} / ${show(route(after, cBlock))}`
    );
    let plain: any = null;
    let emptied: any = null;
    try {
      plain = await AP.readAskPreview(prisma, eC.ev.id, '');
      emptied = await AP.readAskPreview(prisma, eC.ev.id, '', {
        discount: {
          emailOptOutPersonIds: new Set(),
          blockAddresses: new Set(),
          smsOptOutNumbers: new Set(),
          smsFlagPersonIds: new Set(),
        },
      });
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m the preview threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const shape = (p: any) =>
      canonical({
        askRoutes: p.askRoutes,
        byMembership: p.chase.byMembership,
        hostList: p.hostList,
        recipients: p.recipients,
        notChased: p.chase.notChased,
      });
    assert(
      'C',
      'NO OPTION, NO CHANGE: the preview with an empty discount is the preview, on a board carrying every fact',
      ok(() => plain !== null && emptied !== null && shape(plain) === shape(emptied))
    );
    // THE CONTROL THE EQUALITY HANGS ON: an option that is ignored would pass the line above.
    let discounted: any = null;
    try {
      discounted = await AP.readAskPreview(prisma, eC.ev.id, '', {
        discount: (await RW.rewindGuestFacts(prisma, eC.ev.id, BEFORE)).later,
      });
    } catch {
      discounted = null;
    }
    assert(
      'C',
      'and the option is live: a real discount (facts recorded after `since`) moves the preview',
      ok(() => plain !== null && discounted !== null && shape(plain) !== shape(discounted))
    );

    // ══ LAYERS D, F, G — real rows through the door ═════════════════════════════════════
    const glanceEventOf = (e: Ev, nudgePace: string | null = null) => ({
      status: 'CONFIRMING',
      sentAt,
      endDate: e.ev.endDate,
      decideByOffsetHours: null,
      nudgePace,
    });
    const glanceD = RD ? await RD.readEventGlance(prisma, eD.ev.id, now) : null;
    const replayD = async (since: Date) =>
      (await RE.readGlanceReplay(prisma, eD.ev.id, since, glanceD, glanceEventOf(eD), now))
        .steps as any[];
    let dBefore: any[] | null = null;
    let dAfter: any[] | null = null;
    let dNow: any[] | null = null;
    try {
      dBefore = await replayD(BEFORE);
      dAfter = await replayD(AFTER);
      dNow = await replayD(new Date(now.getTime() - 1000));
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m the door threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const stepOf = (steps: any[] | null, m: Member) =>
      steps ? (steps.find((s) => s.personEventId === m.pe.id) ?? null) : 'unread';
    const plays = (m: Member, from: string, to: string) =>
      ok(() => {
        const s = stepOf(dBefore, m);
        return s !== null && s !== 'unread' && s.from === from && s.to === to;
      });
    const silent = (steps: any[] | null, m: Member) => steps !== null && stepOf(steps, m) === null;
    const both = (m: Member) =>
      `before: ${show(stepOf(dBefore, m))}  after: ${show(stepOf(dAfter, m))}`;

    assert(
      'D',
      'the board is what the fixtures say it is (the control every case below hangs on)',
      ok(() => {
        const all = [...glanceD.households.flatMap((h: any) => h.members), ...glanceD.unhoused];
        const st = (m: Member) => all.find((p: any) => p.personEventId === m.pe.id)?.state;
        return (
          st(dBounce) === 'RED' &&
          st(dReject) === 'RED' &&
          st(dWithheld) === 'RED' &&
          st(dResend) === 'RED' &&
          st(dOpt) === 'RED' &&
          st(dBlock) === 'RED' &&
          st(kChild) === 'RED' &&
          st(gQuiet) === 'RED' &&
          st(fAccept) === 'GREEN' &&
          st(dCtl) === 'AMBER'
        );
      })
    );
    assert(
      'D',
      'a BOUNCE read while she was away — recorded after `since`: plays once, AMBER → RED',
      plays(dBounce, 'AMBER', 'RED'),
      both(dBounce)
    );
    assert(
      'D',
      'a BOUNCE read while she was away — recorded before `since`: no step',
      silent(dAfter, dBounce),
      both(dBounce)
    );
    assert(
      'D',
      'a REJECTION recorded while she was away — recorded after `since`: plays once, AMBER → RED',
      plays(dReject, 'AMBER', 'RED'),
      both(dReject)
    );
    assert(
      'D',
      'a REJECTION recorded while she was away — recorded before `since`: no step',
      silent(dAfter, dReject),
      both(dReject)
    );
    assert(
      'D',
      'a message WITHHELD while she was away — recorded after `since`: plays once, NOT_CHASED → RED',
      plays(dWithheld, 'NOT_CHASED', 'RED'),
      both(dWithheld)
    );
    assert(
      'D',
      'a message WITHHELD while she was away — recorded before `since`: no step',
      silent(dAfter, dWithheld),
      both(dWithheld)
    );
    assert(
      'D',
      'a RESEND made and bounced while she was away, after an earlier bounce, plays no step at either `since` (createdAt: she was already red)',
      silent(dBefore, dResend) && silent(dAfter, dResend),
      both(dResend)
    );
    assert(
      'D',
      'an EMAIL OPT-OUT recorded while she was away — recorded after `since`: plays once, AMBER → RED',
      plays(dOpt, 'AMBER', 'RED'),
      both(dOpt)
    );
    assert(
      'D',
      'an EMAIL OPT-OUT recorded while she was away — recorded before `since`: no step',
      silent(dAfter, dOpt),
      both(dOpt)
    );
    assert(
      'D',
      'an EMAIL BLOCK first seen while she was away — recorded after `since`: plays once, AMBER → RED',
      plays(dBlock, 'AMBER', 'RED'),
      both(dBlock)
    );
    assert(
      'D',
      'an EMAIL BLOCK first seen while she was away — recorded before `since`: no step',
      silent(dAfter, dBlock),
      both(dBlock)
    );
    assert(
      'D',
      "POINT 4 — a child reads their CARRIER's bounce, rewound the same way — recorded after `since`: plays once, AMBER → RED",
      plays(kChild, 'AMBER', 'RED'),
      both(kChild)
    );
    assert(
      'D',
      "POINT 4 — a child reads their CARRIER's bounce, rewound the same way — recorded before `since`: no step",
      silent(dAfter, kChild),
      both(kChild)
    );
    assert(
      'D',
      'NOTHING CHANGED → NOTHING PLAYS: `since` = now − 1 second yields ZERO steps on a board full of facts',
      dNow !== null && dNow.length === 0,
      show(dNow)
    );
    assert(
      'D',
      'and the control plays nothing at either `since`',
      silent(dBefore, dCtl) && silent(dAfter, dCtl)
    );

    // F — order.
    assert(
      'F',
      'POINT 5 — a bounce recorded AFTER an accept plays after it',
      ok(() => {
        const ids = dBefore!.map((s) => s.personEventId);
        return (
          ids.indexOf(fAccept.pe.id) >= 0 && ids.indexOf(fAccept.pe.id) < ids.indexOf(dBounce.pe.id)
        );
      }),
      show(dBefore)
    );
    assert(
      'F',
      'and a bounce recorded BEFORE the accept plays before it',
      ok(() => {
        const ids = dBefore!.map((s) => s.personEventId);
        return (
          ids.indexOf(fEarly.pe.id) >= 0 && ids.indexOf(fEarly.pe.id) < ids.indexOf(fAccept.pe.id)
        );
      }),
      show(dBefore)
    );

    // G — exhaustion as at `since`.
    assert(
      'G',
      'quiet before `since`, opted out after it: red then and red now, so NO step (exhaustion asks the route as at `since`)',
      silent(dBefore, gQuiet),
      both(gQuiet)
    );

    // ══ LAYER E — Ruling 22 held ════════════════════════════════════════════════════════
    const glanceE = RD ? await RD.readEventGlance(prisma, eE.ev.id, now) : null;
    const glanceE2 = RD ? await RD.readEventGlance(prisma, eE2.ev.id, now) : null;
    let eSteps: any[] | null = null;
    let e2Steps: any[] | null = null;
    try {
      eSteps = (
        await RE.readGlanceReplay(prisma, eE.ev.id, BEFORE, glanceE, glanceEventOf(eE), now)
      ).steps;
      e2Steps = (
        await RE.readGlanceReplay(
          prisma,
          eE2.ev.id,
          BEFORE,
          glanceE2,
          glanceEventOf(eE2, 'OFF'),
          now
        )
      ).steps;
    } catch (err) {
      console.error(`\x1b[31m!\x1b[0m the door threw: ${(err as Error).message.split('\n')[0]}`);
    }
    const quietGreen = (steps: any[] | null, m: Member) =>
      ok(() => {
        const s = stepOf(steps, m);
        return (
          s !== null &&
          s !== 'unread' &&
          s.from === 'NOT_CHASED' &&
          s.to === 'GREEN' &&
          s.spark === false
        );
      });
    assert(
      'E',
      'RULING 22 — the MARK is today’s: a marked guest who accepts while she is away plays NOT_CHASED → GREEN, no spark',
      quietGreen(eSteps, eMarked),
      show(stepOf(eSteps, eMarked))
    );
    assert(
      'E',
      'RULING 22 — the EXCEPTION is today’s: a handed-over guest who accepts plays NOT_CHASED → GREEN, no spark',
      quietGreen(eSteps, eHanded),
      show(stepOf(eSteps, eHanded))
    );
    assert(
      'E',
      'RULING 22 — a CARRIER’s mark is today’s: their child accepts, NOT_CHASED → GREEN, no spark',
      quietGreen(eSteps, eKid),
      show(stepOf(eSteps, eKid))
    );
    assert(
      'E',
      'RULING 22 — the REMINDERS SWITCH is today’s: on an OFF event an accept plays NOT_CHASED → GREEN, no spark',
      quietGreen(e2Steps, ePace),
      show(stepOf(e2Steps, ePace))
    );

    // ══ LAYER S — structure ═════════════════════════════════════════════════════════════
    const apSrc = code('src/lib/preflight/ask-preview.ts');
    assert(
      'S',
      'NO TIME ENTERS ASK-PREVIEW: it names none of the recorded times — the rewind reads them, the preview only subtracts',
      apSrc.length > 0 &&
        !/optedOutAt|firstSeenAt|smsOptedOutAt|deliveryCheckedAt|rejectedAt|withheldAt/.test(apSrc)
    );
  } finally {
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.emailBlock.deleteMany({ where: { address: { in: created.addresses } } });
    await prisma.emailOptOut.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.smsOptOut.deleteMany({ where: { hostId: { in: created.persons } } });
    await prisma.auditEntry.deleteMany({ where: { eventId: { in: created.events } } });
    await prisma.event.deleteMany({ where: { id: { in: created.events } } });
    await prisma.person.deleteMany({ where: { id: { in: created.persons } } });
    const left =
      (await prisma.event.count({ where: { id: { in: created.events } } })) +
      (await prisma.person.count({ where: { id: { in: created.persons } } })) +
      (await prisma.emailBlock.count({ where: { address: { in: created.addresses } } }));
    assert('Z', 'cleanup: every fixture event, person and block is gone', left === 0);
    await prisma.$disconnect();
  }

  console.log(`\nTotal tests: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
  if (failed > 0) {
    console.log('\nRED:');
    for (const r of redAssertions) console.log(`  ${r}`);
    process.exit(1);
  }
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
