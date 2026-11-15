/**
 * GTC-449 S2.3, server half (ruling 76) — recognising a "settle", and the email refusal.
 *
 * A "settle" is the host turning Decide later off on a kid row, leaving the tick off ("don't
 * message"). The form empties that row's email and phone boxes (the form half of S2.3, later);
 * the SERVER half is here, and it is one thing: when a person has said no to email (an
 * `EmailOptOut` row on ANY event — rulings 33 and 34), a settle must not clear that person's
 * email address, or the same address could be typed again later and emailed. Everything else is
 * as it is today: the phone, the name and the rest are written as sent; an ordinary clear still
 * clears (rulings 19 and 33).
 *
 * The server tells a settle from an ordinary clear (ruling 33) only when ALL FOUR hold, at the
 * edit door and for a row matched by `personEventId`:
 *   1. the saved marker on the row is "yes";
 *   2. the payload carries `decideLater: false` — the boolean false, not left out;
 *   3. the tick is off, so the stored role is CHILD;
 *   4. the email arrives blank.
 *
 * Test items covered (docs/tickets/GTC-449.md, "The tests"): 8, 12 (cases a to f), 18 (the server
 * rows; its page test for W9 belongs to the form half), 19 and 20. Ruling 27: the blanking writes
 * to a person record other events may share, and that can reach another host's guest list; item
 * 12 pins it. Ruling 50: STOP belongs to the phone number and Stage 2 does not touch it; item 20
 * pins that.
 *
 * HOW THE ROUTES ARE CALLED — as in `decide-later-write-test.ts` (S2.1). `requireEventRole` reads
 * a session cookie from `next/headers`, which only exists inside a real request. So this file
 * calls the real route handlers in this process, with real signed-in Users, Sessions and
 * EventRoles, and stands in for ONE thing: the cookie reader. Everything else is the real code.
 * Nothing here can send: no route called does, and no transport is touched.
 *
 * The git checks (items 19 and 20) compare the working tree with the base `128b341`, the main
 * the branch was cut from, so they hold before and after any commit.
 *
 * Run: npx tsx tests/decide-later-settle-test.ts
 * Destructive to its own created rows only (every name starts with the run's TAG); it removes
 * them by id in `finally` and checks that none is left.
 */

import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { execFileSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { normalizePhoneNumber } from '../src/lib/phone';

const prisma = new PrismaClient();
const ROOT = join(__dirname, '..');
const BASE = '128b341';

let passed = 0;
let failed = 0;
function assert(label: string, condition: boolean, got?: unknown) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    if (got !== undefined) console.error(`    got: ${JSON.stringify(got)}`);
    failed++;
  }
}
function section(title: string) {
  console.log(`\n\x1b[33m=== ${title} ===\x1b[0m`);
}

// ── The one stand-in: the cookie reader ────────────────────────────────────────────────────
let SESSION_TOKEN = '';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('module') as any;
const realLoad = Module._load;
Module._load = function (request: string, ...rest: unknown[]) {
  if (request === 'next/headers') {
    return {
      cookies: async () => ({
        get: (name: string) =>
          name === 'session' && SESSION_TOKEN ? { name, value: SESSION_TOKEN } : undefined,
      }),
    };
  }
  return realLoad.call(this, request, ...rest);
};

const TAG = `S23S${Date.now().toString(36)}`;
const mail = (k: string) => `${TAG}-${k}@example.com`.toLowerCase();
const nm = (k: string) => `${TAG} ${k}`;
let phoneSeq = 0;
/** A fresh, unique NZ mobile, in the form a host types. */
const newPhone = () => `021 5${String(++phoneSeq).padStart(2, '0')} ${String(1000 + phoneSeq)}`;
const phoneOf = (n: string) => normalizePhoneNumber(n);

type Handler = (
  req: NextRequest,
  ctx: { params: Promise<Record<string, string>> }
) => Promise<Response>;

async function call(
  handler: Handler,
  url: string,
  params: Record<string, string>,
  method: 'GET' | 'POST' | 'PUT',
  body?: unknown
) {
  const req = new NextRequest(
    `http://localhost${url}`,
    body === undefined
      ? { method }
      : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
  );
  const res = await handler(req, { params: Promise.resolve(params) });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

// ── Source and git helpers (items 19 and 20) ───────────────────────────────────────────────
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
/** Source text without comments, so a scan reads code and not prose. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
function git(args: string[]): string {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}
function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
}
/** The text of `async function <name>(...) { ... }`, braces matched. */
function functionBody(src: string, signature: string): string {
  const start = src.indexOf(signature);
  if (start < 0) return '';
  let i = src.indexOf(')', start);
  i = src.indexOf('{', i);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(start, j + 1);
  }
  return '';
}
/** The `model <name> { ... }` block of a schema, with its first and last line numbers. */
function modelBlock(schema: string, name: string) {
  const lines = schema.split('\n');
  const first = lines.findIndex((l) => l.startsWith(`model ${name} {`));
  if (first < 0) return { text: '', first: -1, last: -1 };
  let last = first;
  while (last < lines.length && lines[last] !== '}') last++;
  return { text: lines.slice(first, last + 1).join('\n'), first: first + 1, last: last + 1 };
}

// ── What the tests read from the database ──────────────────────────────────────────────────
async function peOf(id: string) {
  return prisma.personEvent.findUnique({ where: { id }, include: { person: true } });
}
type PE = Awaited<ReturnType<typeof peOf>>;
const state = (pe: PE) =>
  pe && {
    role: pe.householdRole,
    undecided: pe.messagingUndecided,
    email: pe.person.email,
    phone: pe.person.phoneNumber,
  };
const isKidNo = (pe: PE) => pe?.householdRole === 'CHILD' && pe.messagingUndecided === false;
const isKidYes = (pe: PE) => pe?.householdRole === 'CHILD' && pe.messagingUndecided === true;
const optSnap = (o: {
  id: string;
  personId: string;
  eventId: string;
  optedOutAt: Date;
  token: string | null;
}) => JSON.stringify([o.id, o.personId, o.eventId, o.optedOutAt.toISOString(), o.token]);

async function main() {
  const eventIds: string[] = [];
  const userIds: string[] = [];
  const bareIds: string[] = [];
  const blockIds: string[] = [];
  const smsIds: string[] = [];

  try {
    // ── Setup: two signed-in hosts, each with a session; four events ────────────────────────
    async function newHost(n: number) {
      const user = await prisma.user.create({ data: { email: mail(`hostuser${n}`) } });
      userIds.push(user.id);
      const token = randomBytes(24).toString('hex');
      await prisma.session.create({
        data: { userId: user.id, token, expiresAt: new Date(Date.now() + 86400000) },
      });
      const person = await prisma.person.create({
        data: { name: nm(`Host${n}`), email: mail(`hostuser${n}`), userId: user.id },
      });
      return { user, token, person };
    }
    const h1 = await newHost(1);
    const h2 = await newHost(2);
    async function newEvent(
      label: string,
      host: Awaited<ReturnType<typeof newHost>>,
      role: boolean
    ) {
      const start = new Date();
      start.setDate(start.getDate() + 30);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} S2.3 ${label}`,
          startDate: start,
          endDate: start,
          hostId: host.person.id,
        },
      });
      eventIds.push(ev.id);
      if (role) {
        await prisma.eventRole.create({
          data: { userId: host.user.id, eventId: ev.id, role: 'HOST' },
        });
      }
      return ev.id;
    }
    const E1 = await newEvent('E1 host one', h1, true);
    const E2 = await newEvent('E2 host two', h2, true);
    const E3 = await newEvent('E3 other', h1, false); // opt-outs only, no household
    const E4 = await newEvent('E4 other', h1, false);

    const hostRoute = await import('../src/app/api/events/[id]/host-household/route');
    const hhRoute = await import('../src/app/api/events/[id]/households/route');
    const hhIdRoute = await import('../src/app/api/events/[id]/households/[householdId]/route');

    const asHost = <T>(h: typeof h1, fn: () => Promise<T>) => {
      SESSION_TOKEN = h.token;
      return fn();
    };
    const hostPost = (h: typeof h1, eventId: string, body: unknown) =>
      asHost(h, () =>
        call(hostRoute.POST, `/api/events/${eventId}/host-household`, { id: eventId }, 'POST', body)
      );
    const hhPost = (h: typeof h1, eventId: string, body: unknown) =>
      asHost(h, () =>
        call(hhRoute.POST, `/api/events/${eventId}/households`, { id: eventId }, 'POST', body)
      );
    const hhPut = (h: typeof h1, eventId: string, householdId: string, body: unknown) =>
      asHost(h, () =>
        call(
          hhIdRoute.PUT,
          `/api/events/${eventId}/households/${householdId}`,
          { id: eventId, householdId },
          'PUT',
          body
        )
      );

    // Each host's own household first (the households POST needs it).
    const hostKidMail = mail('hostkid');
    const hostKidPhone = newPhone();
    const hostPhone1 = newPhone();
    const host1 = await hostPost(h1, E1, {
      alone: false,
      name: nm('Host1'),
      phone: hostPhone1,
      littleCount: 0,
      helpers: [
        { name: nm('HostKid'), email: hostKidMail, phone: hostKidPhone, decideLater: true },
      ],
    });
    const host2 = await hostPost(h2, E2, { alone: true });
    section('Setup');
    assert(
      '0.1 both hosts have their own household, so the households door is open (201 and 201)',
      host1.status === 201 && host2.status === 201,
      [host1.status, host2.status]
    );

    // ── Fixture builders ────────────────────────────────────────────────────────────────────
    interface Primary {
      name: string;
      email: string;
      phone: string;
    }
    interface Kid {
      name: string;
      email: string;
      phone: string;
      p1: Primary;
      householdId: string;
      peId: string;
      personId: string;
      /** The same person's membership on host two's event, when `second` was asked for. */
      pe2Id?: string;
      otherPeId?: string;
      other?: { name: string; email: string; phone: string };
    }
    /**
     * Host one's household on E1 with one kid; optionally the SAME person (same address, same
     * first name: GTC-293) as a kid in host two's household on E2; optionally a second decide-later
     * kid in host one's household, to show a settle touches only its own row.
     */
    async function makeKid(
      label: string,
      o: { later?: boolean; second?: boolean; withOther?: boolean } = {}
    ): Promise<Kid> {
      const later = o.later !== false;
      const kid = {
        name: nm(`${label} Kid`),
        email: mail(`${label}-kid`),
        phone: newPhone(),
      };
      const p1: Primary = {
        name: nm(`${label} P1`),
        email: mail(`${label}-p1`),
        phone: newPhone(),
      };
      const other = o.withOther
        ? { name: nm(`${label} Other`), email: mail(`${label}-other`), phone: newPhone() }
        : undefined;
      const post = await hhPost(h1, E1, {
        primaryContact: p1,
        littleCount: 0,
        helpers: [
          { ...kid, ...(later ? { decideLater: true } : {}) },
          ...(other ? [{ ...other, decideLater: true }] : []),
        ],
      });
      const householdId: string = post.json?.household?.id;
      const find = async (eventId: string, name: string) =>
        prisma.personEvent.findFirst({
          where: { eventId, person: { name } },
          select: { id: true, personId: true },
        });
      const pe = await find(E1, kid.name);
      const otherPe = other ? await find(E1, other.name) : undefined;
      let pe2Id: string | undefined;
      if (o.second) {
        await hhPost(h2, E2, {
          primaryContact: {
            name: nm(`${label} P2`),
            email: mail(`${label}-p2`),
            phone: newPhone(),
          },
          littleCount: 0,
          helpers: [{ ...kid, decideLater: true }],
        });
        pe2Id = (await find(E2, kid.name))?.id;
      }
      return {
        ...kid,
        p1,
        householdId,
        peId: pe!.id,
        personId: pe!.personId,
        pe2Id,
        otherPeId: otherPe?.id,
        other,
      };
    }
    /** The edit door, as the form sends a kid: its saved id and name, plus whatever the case says. */
    const settleBody = (
      k: Kid,
      kidFields: Record<string, unknown>,
      top: Record<string, unknown> = {}
    ) => ({
      primaryContact: k.p1,
      littleCount: 0,
      helpers: [
        { personEventId: k.peId, name: k.name, ...kidFields },
        ...(k.otherPeId && k.other
          ? [
              {
                personEventId: k.otherPeId,
                name: k.other.name,
                email: k.other.email,
                phone: k.other.phone,
                decideLater: true,
              },
            ]
          : []),
      ],
      guests: [],
      ...top,
    });
    const put = (k: Kid, kidFields: Record<string, unknown>, top: Record<string, unknown> = {}) =>
      hhPut(h1, E1, k.householdId, settleBody(k, kidFields, top));
    const optOut = (personId: string, eventId: string) =>
      prisma.emailOptOut.create({
        data: { personId, eventId, token: randomBytes(8).toString('hex') },
      });
    const optRows = (personId: string) => prisma.emailOptOut.findMany({ where: { personId } });
    const smsRows = (n: string) => prisma.smsOptOut.findMany({ where: { phoneNumber: n } });

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 8 — the settle blanks: no opt-out anywhere (ruling 17)
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 8 — settled to "don\'t message", no opt-out anywhere: both details are blanked');
    const k8 = await makeKid('i8', { withOther: true });
    const k8before = await peOf(k8.peId);
    assert(
      '8.0 setup: the kid is saved as decide later, holding an email and a phone',
      isKidYes(k8before) &&
        k8before?.person.email === k8.email &&
        k8before?.person.phoneNumber === phoneOf(k8.phone),
      state(k8before)
    );
    const r8 = await put(k8, { decideLater: false }, { littleCount: 3 });
    assert('8.1 the settle answers 200', r8.status === 200, r8.status);
    const k8after = await peOf(k8.peId);
    assert(
      '8.2 the email and the phone are both gone from the person (no opt-out anywhere)',
      k8after?.person.email === null && k8after?.person.phoneNumber === null,
      state(k8after)
    );
    assert(
      '8.3 the row is CHILD with the marker "no": a plain don\'t-message child',
      isKidNo(k8after),
      state(k8after)
    );
    assert("8.4 the person's name is unchanged", k8after?.person.name === k8.name);
    const other8 = await peOf(k8.otherPeId!);
    assert(
      '8.5 the other decide-later kid in the same household was not touched: still "yes", details held',
      isKidYes(other8) &&
        other8?.person.email === k8.other!.email &&
        other8?.person.phoneNumber === phoneOf(k8.other!.phone),
      state(other8)
    );
    assert(
      '8.6 the rest of the same save went through (the little-kids count)',
      (await prisma.household.findUnique({ where: { id: k8.householdId } }))?.littleCount === 3
    );

    const k8b = await makeKid('i8b');
    const r8b = await put(k8b, { decideLater: false, email: '', phone: '' });
    const k8bAfter = await peOf(k8b.peId);
    assert(
      '8.7 an empty-text email and phone are blank too: the same outcome as leaving them out',
      r8b.status === 200 &&
        k8bAfter?.person.email === null &&
        k8bAfter?.person.phoneNumber === null &&
        isKidNo(k8bAfter),
      state(k8bAfter)
    );

    // Her own household settles through the same PUT (the host door is create-only, C11).
    const ownHousehold = (
      await prisma.personEvent.findFirst({
        where: { eventId: E1, personId: h1.person.id },
        select: { householdId: true },
      })
    )?.householdId as string;
    const hostKidPe = await prisma.personEvent.findFirst({
      where: { eventId: E1, person: { name: nm('HostKid') } },
      include: { person: true },
    });
    assert(
      '8.8 setup: her own household holds a decide-later kid with an email and a phone',
      isKidYes(hostKidPe) && hostKidPe?.person.email === hostKidMail,
      state(hostKidPe)
    );
    const rOwn = await hhPut(h1, E1, ownHousehold, {
      primaryContact: { name: nm('Host1'), email: mail('hostuser1'), phone: hostPhone1 },
      littleCount: 0,
      helpers: [{ personEventId: hostKidPe!.id, name: nm('HostKid'), decideLater: false }],
      guests: [],
    });
    const hostKidAfter = await peOf(hostKidPe!.id);
    assert(
      '8.9 her own household: the same settle blanks both and stores CHILD with the marker "no"',
      rOwn.status === 200 &&
        hostKidAfter?.person.email === null &&
        hostKidAfter?.person.phoneNumber === null &&
        isKidNo(hostKidAfter),
      state(hostKidAfter)
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 12 — the shared person and the opt-out outcome (rulings 27, 30, 33, 34)
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 12 (a) — no opt-out anywhere: blanked, and the second host reads it (ruling 27)');
    const ka = await makeKid('i12a', { second: true });
    const pe2a0 = await peOf(ka.pe2Id!);
    assert(
      "12.0 setup: one person record sits behind both hosts' rows (the matching rule, GTC-293)",
      pe2a0?.personId === ka.personId && pe2a0?.eventId === E2,
      pe2a0 && { same: pe2a0.personId === ka.personId, ev: pe2a0.eventId === E2 }
    );
    const ra = await put(ka, { decideLater: false });
    const ra1 = await peOf(ka.peId);
    const ra2 = await peOf(ka.pe2Id!);
    assert(
      '12a.1 the email and the phone are blanked',
      ra.status === 200 && ra1?.person.email === null && ra1?.person.phoneNumber === null,
      state(ra1)
    );
    assert('12a.2 the first host\'s row: CHILD, marker "no"', isKidNo(ra1), state(ra1));
    assert(
      "12a.3 the second host's row reads the person with neither (ruling 27: the shared person)",
      ra2?.person.email === null && ra2?.person.phoneNumber === null,
      state(ra2)
    );
    assert(
      "12a.4 …and the second host's own row is otherwise untouched: still a decide-later kid",
      isKidYes(ra2),
      state(ra2)
    );

    section('Item 12 (b) — an opt-out on THIS event: phone blanked, email KEPT, opt-out stays');
    const kb = await makeKid('i12b', { second: true });
    const ob = await optOut(kb.personId, E1);
    const rb = await put(kb, { decideLater: false }, { littleCount: 2 });
    const rb1 = await peOf(kb.peId);
    const rb2 = await peOf(kb.pe2Id!);
    const obAfter = await optRows(kb.personId);
    assert(
      '12b.1 the settle answers 200 and the rest of the save goes through (little-kids count)',
      rb.status === 200 &&
        (await prisma.household.findUnique({ where: { id: kb.householdId } }))?.littleCount === 2,
      rb.status
    );
    assert(
      '12b.2 the phone is blanked (the opt-out is on email only)',
      rb1?.person.phoneNumber === null,
      state(rb1)
    );
    assert('12b.3 the email is KEPT on the record', rb1?.person.email === kb.email, state(rb1));
    assert('12b.4 role CHILD, marker "no"', isKidNo(rb1), state(rb1));
    assert(
      '12b.5 the opt-out row stays, unchanged (nothing is written to it)',
      obAfter.length === 1 && optSnap(obAfter[0]) === optSnap(ob),
      obAfter.length
    );
    assert(
      "12b.6 the second host's row still reads the email",
      rb2?.person.email === kb.email && rb2?.person.phoneNumber === null,
      state(rb2)
    );
    assert('12b.7 nothing else on the person changed (the name)', rb1?.person.name === kb.name);

    section(
      "Item 12 (c) — an opt-out only on the SECOND host's event: the same refusal (ruling 34)"
    );
    const kc = await makeKid('i12c', { second: true });
    const oc = await optOut(kc.personId, E2);
    const rc = await put(kc, { decideLater: false });
    const rc1 = await peOf(kc.peId);
    const rc2 = await peOf(kc.pe2Id!);
    const ocAfter = await optRows(kc.personId);
    assert(
      '12c.1 the phone is blanked and the email is KEPT, although the opt-out is on another event',
      rc.status === 200 && rc1?.person.phoneNumber === null && rc1?.person.email === kc.email,
      state(rc1)
    );
    assert('12c.2 role CHILD, marker "no"', isKidNo(rc1), state(rc1));
    assert(
      '12c.3 the opt-out row stays, unchanged',
      ocAfter.length === 1 && optSnap(ocAfter[0]) === optSnap(oc),
      ocAfter.length
    );
    assert(
      "12c.4 the second host's row still reads the email",
      rc2?.person.email === kc.email,
      state(rc2)
    );

    section('Item 12 (d) — the spam-report control: the address held in EmailBlock');
    const kd1 = await makeKid('i12d1');
    const blockD1 = await prisma.emailBlock.create({
      data: { address: kd1.email, reason: `${TAG} spam` },
    });
    blockIds.push(blockD1.id);
    await optOut(kd1.personId, E1);
    const rd1 = await put(kd1, { decideLater: false });
    const rd1Row = await peOf(kd1.peId);
    const blockD1After = await prisma.emailBlock.findMany({ where: { address: kd1.email } });
    assert(
      '12d.1 opt-out and block together: the email is kept and the block still holds the address',
      rd1.status === 200 &&
        rd1Row?.person.email === kd1.email &&
        blockD1After.length === 1 &&
        blockD1After[0].id === blockD1.id,
      { e: rd1Row?.person.email, b: blockD1After.length }
    );
    const kd2 = await makeKid('i12d2');
    const blockD2 = await prisma.emailBlock.create({
      data: { address: kd2.email, reason: `${TAG} spam` },
    });
    blockIds.push(blockD2.id);
    const rd2 = await put(kd2, { decideLater: false });
    const rd2Row = await peOf(kd2.peId);
    const blockD2After = await prisma.emailBlock.findMany({ where: { address: kd2.email } });
    assert(
      '12d.2 the block alone (no opt-out): the settle blanks the email, and the block still holds the address',
      rd2.status === 200 &&
        rd2Row?.person.email === null &&
        blockD2After.length === 1 &&
        blockD2After[0].id === blockD2.id,
      { e: rd2Row?.person.email, b: blockD2After.length }
    );

    section('Item 12 (e) — an ordinary clear still clears, even with an opt-out on this event');
    const ke1 = await makeKid('i12e1', { later: false });
    await optOut(ke1.personId, E1);
    const re1 = await put(ke1, {});
    const re1Row = await peOf(ke1.peId);
    assert(
      '12e.1 a plain row (marker no, staying no) with the email blanked has its email nulled, as today',
      re1.status === 200 && re1Row?.person.email === null && isKidNo(re1Row),
      state(re1Row)
    );
    const ke2 = await makeKid('i12e2');
    await optOut(ke2.personId, E1);
    const re2 = await put(ke2, { decideLater: true });
    const re2Row = await peOf(ke2.peId);
    assert(
      '12e.2 a decide-later row staying decide-later with the email blanked: nulled, as today',
      re2.status === 200 && re2Row?.person.email === null && isKidYes(re2Row),
      state(re2Row)
    );

    section('Item 12 (f) — opt-outs on two events: the answer is "there is a row"');
    const kf1 = await makeKid('i12f1', { second: true });
    const of1a = await optOut(kf1.personId, E1);
    const of1b = await optOut(kf1.personId, E2);
    const rf1 = await put(kf1, { decideLater: false });
    const rf1Row = await peOf(kf1.peId);
    const of1After = await optRows(kf1.personId);
    const snaps = (rows: typeof of1After) => rows.map(optSnap).sort().join('|');
    assert(
      "12f.1 opt-outs on this event and the second host's: email kept, phone blanked",
      rf1.status === 200 &&
        rf1Row?.person.email === kf1.email &&
        rf1Row?.person.phoneNumber === null,
      state(rf1Row)
    );
    assert(
      '12f.2 both opt-out rows stay, and nothing is written to either',
      snaps(of1After) === [of1a, of1b].map(optSnap).sort().join('|'),
      of1After.length
    );
    const kf2 = await makeKid('i12f2');
    const of2a = await optOut(kf2.personId, E3);
    const of2b = await optOut(kf2.personId, E4);
    const rf2 = await put(kf2, { decideLater: false });
    const rf2Row = await peOf(kf2.peId);
    const of2After = await optRows(kf2.personId);
    assert(
      '12f.3 two opt-outs on two OTHER events, none on this one: email kept, phone blanked',
      rf2.status === 200 &&
        rf2Row?.person.email === kf2.email &&
        rf2Row?.person.phoneNumber === null,
      state(rf2Row)
    );
    assert(
      '12f.4 both rows stay, unchanged',
      snaps(of2After) === [of2a, of2b].map(optSnap).sort().join('|'),
      of2After.length
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 18 — a settle is recognised only as ruled (ruling 33). An opt-out on another event
    // (E3) is on the person in every case, and a blank email arrives unless the case says not.
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 18 — the four conditions, one at a time (opt-out on another event throughout)');
    const k18a = await makeKid('i18a');
    await optOut(k18a.personId, E3);
    const r18a = await put(k18a, { decideLater: false });
    const r18aRow = await peOf(k18a.peId);
    assert(
      '18.1 saved "yes", explicit false, tick off, blank email: a settle — the email is kept',
      r18a.status === 200 && r18aRow?.person.email === k18a.email && isKidNo(r18aRow),
      state(r18aRow)
    );
    const k18e = await makeKid('i18e');
    await optOut(k18e.personId, E3);
    const r18e = await put(k18e, { decideLater: false, email: '' });
    const r18eRow = await peOf(k18e.peId);
    assert(
      '18.2 …and an empty-text email is blank too: kept',
      r18e.status === 200 && r18eRow?.person.email === k18e.email,
      state(r18eRow)
    );

    const k18b = await makeKid('i18b');
    await optOut(k18b.personId, E3);
    const newMail = mail('i18b-newaddress');
    const r18b = await put(k18b, { decideLater: false, email: newMail });
    const r18bRow = await peOf(k18b.peId);
    assert(
      '18.3 the same with a non-blank email in the payload: written as sent',
      r18b.status === 200 && r18bRow?.person.email === newMail && isKidNo(r18bRow),
      state(r18bRow)
    );

    const k18c = await makeKid('i18c');
    await optOut(k18c.personId, E3);
    const r18c = await put(k18c, {});
    const r18cRow = await peOf(k18c.peId);
    assert(
      '18.4 saved "yes", payload omits the marker (a stale tab): the marker is cleared, not a settle, email nulled as today',
      r18c.status === 200 && isKidNo(r18cRow) && r18cRow?.person.email === null,
      state(r18cRow)
    );

    const k18d = await makeKid('i18d');
    await optOut(k18d.personId, E3);
    const r18d = await put(k18d, { decideLater: true });
    const r18dRow = await peOf(k18d.peId);
    assert(
      '18.5 saved "yes", payload true: not a settle — the marker stays "yes", email nulled as today',
      r18d.status === 200 && isKidYes(r18dRow) && r18dRow?.person.email === null,
      state(r18dRow)
    );

    const k18n = await makeKid('i18n', { later: false });
    await optOut(k18n.personId, E3);
    const r18n = await put(k18n, { decideLater: false });
    const r18nRow = await peOf(k18n.peId);
    assert(
      '18.6 saved "no", explicit false: not a settle — email nulled as today',
      r18n.status === 200 && isKidNo(r18nRow) && r18nRow?.person.email === null,
      state(r18nRow)
    );

    const k18t = await makeKid('i18t');
    await optOut(k18t.personId, E3);
    const r18t = await put(k18t, { decideLater: false, adultRoled: true });
    const r18tRow = await peOf(k18t.peId);
    assert(
      '18.7 saved "yes", explicit false, tick ON (message): not a settle — role GUEST, marker "no", details as sent (email blank, so nulled)',
      r18t.status === 200 &&
        r18tRow?.householdRole === 'GUEST' &&
        r18tRow.messagingUndecided === false &&
        r18tRow.person.email === null,
      state(r18tRow)
    );

    const odd: [string, unknown][] = [
      ['the text "false"', 'false'],
      ['null', null],
      ['the number 0', 0],
    ];
    for (const [i, [what, value]] of odd.entries()) {
      const k = await makeKid(`i18s${i}`);
      await optOut(k.personId, E3);
      const r = await put(k, { decideLater: value });
      const row = await peOf(k.peId);
      assert(
        `18.8 only the boolean false counts: ${what} is not a settle — marker cleared, email nulled as today`,
        r.status === 200 && isKidNo(row) && row?.person.email === null,
        state(row)
      );
    }

    const k18x = await makeKid('i18x');
    await optOut(k18x.personId, E3);
    const r18x = await hhPut(h1, E1, k18x.householdId, {
      primaryContact: k18x.p1,
      littleCount: 0,
      helpers: [{ name: k18x.name, decideLater: false }], // no personEventId
      guests: [],
    });
    const oldRow = await peOf(k18x.peId);
    const newRows = await prisma.personEvent.findMany({
      where: { eventId: E1, householdId: k18x.householdId, person: { name: k18x.name } },
      include: { person: true },
    });
    assert(
      '18.9 a row with no personEventId is not a settle: the saved person is left alone (email still on the record), the new row is a plain kid with no email',
      r18x.status === 200 &&
        oldRow === null &&
        (await prisma.person.findUnique({ where: { id: k18x.personId } }))?.email === k18x.email &&
        newRows.length === 1 &&
        isKidNo(newRows[0]) &&
        newRows[0].person.email === null,
      { oldGone: oldRow === null, rows: newRows.length }
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 20 (control) — a STOP belongs to the number (ruling 50)
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 20 control — the settle clears the number and leaves the STOP on it as it was');
    const k20 = await makeKid('i20');
    const stop = await prisma.smsOptOut.create({
      data: {
        phoneNumber: phoneOf(k20.phone)!,
        rawMessage: 'STOP',
        personId: k20.personId,
        eventId: E1,
      },
    });
    smsIds.push(stop.id);
    const r20 = await put(k20, { decideLater: false });
    const r20Row = await peOf(k20.peId);
    const stopAfter = await smsRows(phoneOf(k20.phone)!);
    assert(
      "20.1 the kid's phone number is cleared on the person",
      r20.status === 200 && r20Row?.person.phoneNumber === null,
      state(r20Row)
    );
    assert(
      '20.2 the STOP row for that number is exactly as it was: one row, same id, number, time and text',
      stopAfter.length === 1 &&
        stopAfter[0].id === stop.id &&
        stopAfter[0].phoneNumber === stop.phoneNumber &&
        stopAfter[0].optedOutAt.getTime() === stop.optedOutAt.getTime() &&
        stopAfter[0].rawMessage === 'STOP' &&
        stopAfter[0].optedInAt === null,
      stopAfter.length
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 19 — the refusal reads Zone 9's table from non-zone code, and edits no Zone 9 file
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 19 (i) — the reader: one direct query, by person alone, from the member writer');
    const reconSrc = code(read('src/lib/households/reconcileMembers.ts'));
    const reader = functionBody(reconSrc, 'async function updateExistingMember(');
    assert(
      '19.1 the file reads the opt-out table exactly once, and it is a findFirst',
      (reconSrc.match(/emailOptOut\s*\./g) ?? []).length === 1 &&
        /emailOptOut\s*\.\s*findFirst\s*\(/.test(reconSrc),
      reconSrc.match(/emailOptOut\s*\.\s*\w+/g) ?? []
    );
    assert(
      '19.2 …and that one read sits inside updateExistingMember, through the transaction client it was given',
      reader.length > 0 &&
        /\bprisma\s*\.\s*emailOptOut\s*\.\s*findFirst\s*\(/.test(reader) &&
        /reconcileHouseholdMembers\(prisma: Tx,/.test(reconSrc),
      reader.length
    );
    assert(
      '19.3 …asked by the person alone (a where of personId and nothing else), so it means any event',
      /emailOptOut\s*\.\s*findFirst\s*\(\s*\{\s*where:\s*\{\s*personId:\s*[\w.]+\s*\}\s*,?\s*(select:\s*\{\s*id:\s*true\s*\}\s*,?\s*)?\}\s*\)/.test(
        reader
      ),
      (reader.match(/emailOptOut[\s\S]{0,160}/) ?? [''])[0]
    );
    // The four conditions of ruling 33, as written in the code, each ahead of the read.
    const conditionAt = [
      /existing\.messagingUndecided\s*===\s*true/, //   1. the saved marker is "yes"
      /member\.decideLater\s*===\s*false/, //          2. the payload carries the boolean false
      /role\s*===\s*'CHILD'/, //                       3. the tick is off
      /!member\.email/, //                             4. the email arrives blank
    ].map((re) => reader.search(re));
    const readAt = reader.indexOf('findFirst');
    assert(
      '19.4 …and all four conditions of the settle stand ahead of it in the code, so it runs only when they hold',
      readAt > 0 && conditionAt.every((i) => i >= 0 && i < readAt),
      { readAt, conditionAt }
    );
    const zone9 = [
      'email-opt-out',
      'email-block',
      'channel-chooser',
      'delivery-poll',
      'press/dispatch',
      'unsubscribe',
      'text-block',
      'opt-out-service',
    ];
    const imports = [
      ...reconSrc.matchAll(
        /from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]|require\(\s*['"]([^'"]+)['"]/g
      ),
    ].map((m) => m[1] ?? m[2] ?? m[3]);
    assert(
      '19.5 reconcileMembers.ts imports nothing from email-opt-out, email-block or any other Zone 9 or Zone 7 file',
      imports.length > 0 && !imports.some((i) => zone9.some((z) => i.includes(z))),
      imports
    );
    const householdFiles = [
      ...walk('src/lib/households'),
      ...walk('src/app/api/events/[id]/households'),
      ...walk('src/app/api/events/[id]/host-household'),
    ];
    const writers = householdFiles.filter((f) =>
      /emailOptOut\s*\.\s*(create|createMany|upsert|update|updateMany|delete|deleteMany)\b/.test(
        code(read(f))
      )
    );
    assert(
      '19.6 nothing under the households code or the household routes writes to the opt-out table',
      householdFiles.length >= 8 && writers.length === 0,
      { scanned: householdFiles.length, writers }
    );

    section(
      "Item 19 (ii) and item 20 — the branch's diff against the base touches no Zone 9 or STOP file"
    );
    let baseOk = false;
    try {
      git(['cat-file', '-e', `${BASE}^{commit}`]);
      baseOk = true;
    } catch {
      baseOk = false;
    }
    assert(
      `19.7 the base ${BASE} is in this checkout, so the diff checks below can mean something`,
      baseOk
    );
    const tracked = baseOk ? git(['diff', '--name-only', BASE]).split('\n').filter(Boolean) : [];
    const untracked = git(['ls-files', '--others', '--exclude-standard'])
      .split('\n')
      .filter(Boolean);
    const changed = [...tracked, ...untracked];
    const zone9Files = [
      'src/lib/eligibility/email-opt-out.ts',
      'src/lib/eligibility/email-block.ts',
      'src/lib/eligibility/channel-chooser.ts',
      'src/app/api/unsubscribe/[token]/route.ts',
      'src/lib/email-delivery/delivery-poll.ts',
      'src/lib/press/dispatch.ts',
    ];
    const zone7Files = [
      'src/lib/sms/opt-out-service.ts',
      'src/app/api/sms/tnz-webhook/route.ts',
      'src/lib/sms/tnz-reply-record.ts',
      'src/lib/eligibility/text-block.ts',
      'src/lib/sms/send-sms.ts',
    ];
    assert(
      '19.8 the diff lists none of email-opt-out.ts, email-block.ts, channel-chooser.ts, the unsubscribe route, delivery-poll.ts, dispatch.ts',
      baseOk && changed.length > 0 && !zone9Files.some((f) => changed.includes(f)),
      zone9Files.filter((f) => changed.includes(f))
    );
    const schemaNow = read('prisma/schema.prisma');
    const schemaBase = baseOk ? git(['show', `${BASE}:prisma/schema.prisma`]) : '';
    assert(
      "19.9 the schema's EmailOptOut and EmailBlock models are exactly as at the base",
      baseOk &&
        modelBlock(schemaNow, 'EmailOptOut').text.length > 0 &&
        modelBlock(schemaNow, 'EmailOptOut').text === modelBlock(schemaBase, 'EmailOptOut').text &&
        modelBlock(schemaNow, 'EmailBlock').text.length > 0 &&
        modelBlock(schemaNow, 'EmailBlock').text === modelBlock(schemaBase, 'EmailBlock').text
    );
    const hunks = baseOk
      ? [
          ...git(['diff', '-U0', BASE, '--', 'prisma/schema.prisma']).matchAll(
            /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/gm
          ),
        ]
      : [];
    const peNow = modelBlock(schemaNow, 'PersonEvent');
    const peBase = modelBlock(schemaBase, 'PersonEvent');
    const inside = (start: number, count: number, b: { first: number; last: number }) =>
      count === 0
        ? start >= b.first && start < b.last
        : start >= b.first && start + count - 1 <= b.last;
    assert(
      '19.10 every change to the schema lies inside model PersonEvent (the marker), none elsewhere',
      baseOk &&
        hunks.length > 0 &&
        hunks.every(
          (h) =>
            inside(Number(h[1]), h[2] === undefined ? 1 : Number(h[2]), peBase) &&
            inside(Number(h[3]), h[4] === undefined ? 1 : Number(h[4]), peNow)
        ),
      hunks.map((h) => h[0])
    );
    assert(
      '20.3 the diff lists none of opt-out-service.ts, the TNZ webhook route, tnz-reply-record.ts, text-block.ts, send-sms.ts',
      baseOk && !zone7Files.some((f) => changed.includes(f)),
      zone7Files.filter((f) => changed.includes(f))
    );
    // Every changed or added line of runtime code (src and prisma), against the base. Tests and
    // the ticket are not runtime code and rightly name these words.
    const diffLines = baseOk
      ? git(['diff', '-U0', BASE, '--', 'src', 'prisma'])
          .split('\n')
          .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
      : [];
    const newFileLines = untracked
      .filter((f) => /^(src|prisma)\//.test(f))
      .flatMap((f) => read(f).split('\n'));
    // Case-insensitive: Prisma's accessor for the STOP table is `smsOptOut`, the model `SmsOptOut`.
    const stopWords = /SmsOptOut|smsOptedOut|opt-out-service/i;
    assert(
      '20.4 no line of runtime code (src, prisma) added or changed against the base names SmsOptOut, smsOptedOut or opt-out-service',
      baseOk &&
        diffLines.length > 0 &&
        ![...diffLines, ...newFileLines].some((l) => stopWords.test(l)),
      [...diffLines, ...newFileLines].filter((l) => stopWords.test(l)).slice(0, 5)
    );
    assert(
      "20.5 the scan is not vacuous: the diff against the base really holds this ticket's code (the marker column)",
      diffLines.some((l) => /messagingUndecided/.test(l))
    );
  } finally {
    // ── Cleanup, by id: the events (their households, memberships, opt-outs, tokens and ledger
    // entries cascade), the rows made directly, then the people, then the sign-ins.
    if (smsIds.length) await prisma.smsOptOut.deleteMany({ where: { id: { in: smsIds } } });
    if (blockIds.length) await prisma.emailBlock.deleteMany({ where: { id: { in: blockIds } } });
    const pes = await prisma.personEvent.findMany({
      where: { eventId: { in: eventIds } },
      select: { id: true },
    });
    await prisma.nudgeLog.deleteMany({ where: { personEventId: { in: pes.map((p) => p.id) } } });
    await prisma.household.updateMany({
      where: { eventId: { in: eventIds } },
      data: { contactPersonEventId: null },
    });
    await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
    await prisma.person.deleteMany({
      where: {
        OR: [{ id: { in: bareIds } }, { name: { startsWith: TAG } }],
        eventMemberships: { none: {} },
      },
    });
    if (userIds.length) {
      await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.person.deleteMany({ where: { userId: { in: userIds } } });
      await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    }
    const left = {
      people: await prisma.person.count({ where: { name: { startsWith: TAG } } }),
      events: await prisma.event.count({ where: { name: { startsWith: TAG } } }),
      users: await prisma.user.count({ where: { id: { in: userIds } } }),
      blocks: await prisma.emailBlock.count({
        where: { address: { startsWith: TAG.toLowerCase() } },
      }),
      stops: await prisma.smsOptOut.count({ where: { id: { in: smsIds } } }),
      optOuts: await prisma.emailOptOut.count({ where: { eventId: { in: eventIds } } }),
    };
    section('Cleanup');
    assert(
      'C.1 every row this run made is gone: no person, event, user, block, STOP or opt-out is left',
      Object.values(left).every((n) => n === 0),
      left
    );
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
