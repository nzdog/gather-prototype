/**
 * GTC-449 S2.1 (ruling 76) — the write path of the "Decide later" marker, three doors.
 *
 * The doors are the three places a household is saved:
 *   1. POST /api/events/[id]/households                    (a new household)
 *   2. PUT  /api/events/[id]/households/[householdId]      (an edit, and her own household's
 *                                                           later edits — C11)
 *   3. POST /api/events/[id]/host-household                (her own household's first save)
 *
 * The rule under test (rulings 1, 19, 20, 25): a kid row carries an optional `decideLater`.
 * The marker `PersonEvent.messagingUndecided` is stored "yes" ONLY for a kid row whose tick is
 * off (stored role CHILD) and whose `decideLater` is exactly `true`. The tick wins: a row with
 * the tick on is the adult (GUEST) and the marker is "no". A save that leaves the value out
 * clears it ("no"). Only a kid row can carry it. Nothing here blanks, reads or refuses
 * anything (the settle is S2.3), and there is no server guard for a save after the press.
 *
 * Test items covered (docs/tickets/GTC-449.md, "The tests"): 4, 9, 10, 15 and 16. The form half
 * of item 16 ("the control is not offered while the tick is on") belongs to S2.2.
 *
 * HOW THE ROUTES ARE CALLED. The house habit (see the other household tests) is to drive the
 * reconcile seam, because `requireEventRole` reads a session cookie from `next/headers`, which
 * only exists inside a real request. That would leave the households POST untested, since its
 * member writer lives inside the route. So this file calls the three real route handlers in
 * this process, with a real signed-in User, Session and EventRole, and stands in for ONE thing:
 * the cookie reader (`next/headers`), which hands back the session token. Everything else —
 * `requireEventRole`, `getUser`, the transactions, the ledger, the matching rule — is the real
 * code. Nothing here can send: no route called does, and no transport is touched.
 *
 * Run: npx tsx tests/decide-later-write-test.ts
 * Destructive to its own created rows only (every name starts with the run's TAG); it removes
 * them by id in `finally` and checks that none is left.
 */

import { PrismaClient } from '@prisma/client';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import { normalizePhoneNumber } from '../src/lib/phone';

const prisma = new PrismaClient();

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

const TAG = `S21W${Date.now().toString(36)}`;
const mail = (k: string) => `${TAG}-${k}@example.com`.toLowerCase();
const nm = (k: string) => `${TAG} ${k}`;
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

/** One member row by the person's name, with the person. */
async function row(eventId: string, name: string) {
  return prisma.personEvent.findFirst({
    where: { eventId, person: { name: nm(name) } },
    include: { person: true },
  });
}
const stored = (r: Awaited<ReturnType<typeof row>>) =>
  r ? { role: r.householdRole, undecided: r.messagingUndecided } : null;
const isLater = (r: Awaited<ReturnType<typeof row>>) =>
  r?.householdRole === 'CHILD' && r.messagingUndecided === true;
const isPlainKid = (r: Awaited<ReturnType<typeof row>>) =>
  r?.householdRole === 'CHILD' && r.messagingUndecided === false;
const isAdult = (r: Awaited<ReturnType<typeof row>>) =>
  r?.householdRole === 'GUEST' && r.messagingUndecided === false;

async function main() {
  const eventIds: string[] = [];
  let userId = '';
  const bareIds: string[] = []; // people made directly by this test, outside any event

  try {
    // ── Setup: a signed-in host with a session, and the events she hosts ────────────────────
    const user = await prisma.user.create({ data: { email: mail('hostuser') } });
    userId = user.id;
    SESSION_TOKEN = randomBytes(24).toString('hex');
    await prisma.session.create({
      data: { userId: user.id, token: SESSION_TOKEN, expiresAt: new Date(Date.now() + 86400000) },
    });
    const hostPerson = await prisma.person.create({
      data: { name: nm('Host'), email: mail('hostuser'), userId: user.id },
    });

    async function newEvent(label: string, pressed: boolean) {
      const start = new Date();
      start.setDate(start.getDate() + 30);
      const ev = await prisma.event.create({
        data: {
          name: `${TAG} S2.1 ${label}`,
          startDate: start,
          endDate: start,
          hostId: hostPerson.id,
          ...(pressed ? { sentAt: new Date() } : {}),
        },
      });
      eventIds.push(ev.id);
      await prisma.eventRole.create({ data: { userId: user.id, eventId: ev.id, role: 'HOST' } });
      return ev.id;
    }

    const hostRoute = await import('../src/app/api/events/[id]/host-household/route');
    const hhRoute = await import('../src/app/api/events/[id]/households/route');
    const hhIdRoute = await import('../src/app/api/events/[id]/households/[householdId]/route');

    const hostPost = (eventId: string, body: unknown) =>
      call(hostRoute.POST, `/api/events/${eventId}/host-household`, { id: eventId }, 'POST', body);
    const hostGet = (eventId: string) =>
      call(hostRoute.GET, `/api/events/${eventId}/host-household`, { id: eventId }, 'GET');
    const hhPost = (eventId: string, body: unknown) =>
      call(hhRoute.POST, `/api/events/${eventId}/households`, { id: eventId }, 'POST', body);
    const hhGet = (eventId: string) =>
      call(hhRoute.GET, `/api/events/${eventId}/households`, { id: eventId }, 'GET');
    const hhPut = (eventId: string, householdId: string, body: unknown) =>
      call(
        hhIdRoute.PUT,
        `/api/events/${eventId}/households/${householdId}`,
        { id: eventId, householdId },
        'PUT',
        body
      );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // DOOR 3 — her own household's first save (host-household POST). Item 4, 16.
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 4, door 3 — host-household POST: a kid row stores the marker');
    const evA = await newEvent('A write path', false);
    const door3 = await hostPost(evA, {
      alone: false,
      name: nm('Host'),
      phone: '021 555 0101',
      littleCount: 0,
      partner: { name: nm('HPartner'), email: mail('hpartner'), decideLater: true },
      helpers: [
        { name: nm('HLater'), email: mail('hlater'), phone: '021 555 0102', decideLater: true },
        { name: nm('HTick'), email: mail('htick'), phone: '021 555 0103', adultRoled: true },
        {
          name: nm('HBoth'),
          email: mail('hboth'),
          phone: '021 555 0104',
          adultRoled: true,
          decideLater: true,
        },
        { name: nm('HPlain'), email: mail('hplain'), phone: '021 555 0105' },
        { name: nm('HFalse'), decideLater: false },
        { name: nm('HString'), decideLater: 'true' },
      ],
      guests: [{ name: nm('HGuest'), email: mail('hguest'), decideLater: true }],
    });
    assert('4.1 the host door answers 201', door3.status === 201, door3.status);
    const hLater = await row(evA, 'HLater');
    assert(
      '4.2 a kid row with the tick off and Decide later on is stored CHILD with the marker "yes"',
      isLater(hLater),
      stored(hLater)
    );
    assert(
      '4.3 its contact details are held as sent (held, not used: ruling 2)',
      hLater?.person.email === mail('hlater') &&
        hLater?.person.phoneNumber === phoneOf('021 555 0102'),
      { e: hLater?.person.email, p: hLater?.person.phoneNumber }
    );
    const reload3 = await hostGet(evA);
    const reload3Row = (reload3.json?.household?.members ?? []).find(
      (m: any) => m.person?.name === nm('HLater')
    );
    assert(
      '4.4 reload: the host door GET hands the marker back "yes" for that kid',
      reload3Row?.messagingUndecided === true && reload3Row?.householdRole === 'CHILD',
      reload3Row && { r: reload3Row.householdRole, u: reload3Row.messagingUndecided }
    );
    const hTick = await row(evA, 'HTick');
    assert(
      '4.5 ticking to message stores GUEST and the marker "no"',
      isAdult(hTick),
      stored(hTick)
    );
    const hBoth = await row(evA, 'HBoth');
    assert(
      '16.1 the tick wins: a payload carrying both stores GUEST with the marker "no" (door 3)',
      isAdult(hBoth),
      stored(hBoth)
    );
    assert(
      '16.2 …and the details of the adult are kept as sent',
      hBoth?.person.email === mail('hboth') &&
        hBoth?.person.phoneNumber === phoneOf('021 555 0104'),
      { e: hBoth?.person.email }
    );
    const hPlain = await row(evA, 'HPlain');
    assert(
      '10.1 a kid typed with the tick off and no Decide later is a plain child ("no") that keeps its details (door 3)',
      isPlainKid(hPlain) &&
        hPlain?.person.email === mail('hplain') &&
        hPlain?.person.phoneNumber === phoneOf('021 555 0105'),
      stored(hPlain)
    );
    const hFalse = await row(evA, 'HFalse');
    const hString = await row(evA, 'HString');
    assert(
      '4.6 an explicit false is stored "no"; a value that is not the boolean true (the text "true") is stored "no"',
      isPlainKid(hFalse) && isPlainKid(hString),
      { f: stored(hFalse), s: stored(hString) }
    );
    const hPartner = await row(evA, 'HPartner');
    const hGuest = await row(evA, 'HGuest');
    assert(
      '4.7 only a kid row can carry the marker: a partner or a guest sent with decideLater is stored "no"',
      hPartner?.householdRole === 'PARTNER' &&
        hPartner.messagingUndecided === false &&
        hGuest?.householdRole === 'GUEST' &&
        hGuest.messagingUndecided === false,
      { p: stored(hPartner), g: stored(hGuest) }
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // DOOR 1 — a new household (households POST). Item 4, 10, 16.
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 4, door 1 — households POST: a kid row stores the marker');
    // An unplaced person already on the event (no household yet): typed as a kid, the same
    // address and first name, she is the one the row means (GTC-293). The marker must reach
    // that existing membership too.
    const unplaced1 = await prisma.person.create({
      data: { name: nm('Unplaced1'), email: mail('unplaced1') },
    });
    bareIds.push(unplaced1.id);
    await prisma.personEvent.create({
      data: { personId: unplaced1.id, eventId: evA, role: 'PARTICIPANT' },
    });
    const door1 = await hhPost(evA, {
      primaryContact: { name: nm('Primary1'), email: mail('primary1'), phone: '021 555 0201' },
      littleCount: 0,
      helpers: [
        { name: nm('PLater'), email: mail('plater'), phone: '021 555 0202', decideLater: true },
        { name: nm('PTick'), email: mail('ptick'), phone: '021 555 0203', adultRoled: true },
        {
          name: nm('PBoth'),
          email: mail('pboth'),
          phone: '021 555 0204',
          adultRoled: true,
          decideLater: true,
        },
        { name: nm('PPlain'), email: mail('pplain'), phone: '021 555 0205' },
        { name: nm('Unplaced1'), email: mail('unplaced1'), decideLater: true },
      ],
      guests: [{ name: nm('PGuest'), email: mail('pguest'), decideLater: true }],
    });
    assert('4.8 the households POST answers 201', door1.status === 201, door1.status);
    const householdId1: string = door1.json?.household?.id;
    const pLater = await row(evA, 'PLater');
    assert(
      '4.9 a kid row with the tick off and Decide later on is stored CHILD with the marker "yes" (door 1)',
      isLater(pLater),
      stored(pLater)
    );
    assert(
      '4.10 ticking to message stores GUEST and "no"; the tick wins over Decide later (door 1)',
      isAdult(await row(evA, 'PTick')) && isAdult(await row(evA, 'PBoth')),
      { t: stored(await row(evA, 'PTick')), b: stored(await row(evA, 'PBoth')) }
    );
    const pPlain = await row(evA, 'PPlain');
    assert(
      '10.2 a kid typed with the tick off keeps its details and is "no" (door 1: a new household blanks nothing)',
      isPlainKid(pPlain) &&
        pPlain?.person.email === mail('pplain') &&
        pPlain?.person.phoneNumber === phoneOf('021 555 0205'),
      stored(pPlain)
    );
    const pGuest = await row(evA, 'PGuest');
    assert(
      '4.11 a guest sent with decideLater is stored "no" (door 1)',
      pGuest?.householdRole === 'GUEST' && pGuest.messagingUndecided === false,
      stored(pGuest)
    );
    const unplacedRow = await row(evA, 'Unplaced1');
    assert(
      '4.12 a person already on the event with no household, typed as a kid, takes the marker (door 1, existing membership)',
      isLater(unplacedRow) && unplacedRow?.householdId === householdId1,
      unplacedRow && { ...stored(unplacedRow), h: unplacedRow.householdId === householdId1 }
    );
    const reload1 = await hhGet(evA);
    const reload1Members: any[] = (reload1.json?.households ?? []).flatMap((h: any) => h.members);
    const reload1Later = reload1Members.find((m) => m.person?.name === nm('PLater'));
    assert(
      '4.13 reload: the households GET hands the marker back "yes" for that kid',
      reload1Later?.messagingUndecided === true,
      reload1Later && reload1Later.messagingUndecided
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // DOOR 2 — an edit (households PUT). Item 4, 9, 10, 16.
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 4, door 2 — households PUT: the marker survives an edit of another field');
    const put = async (kids: unknown[], extra: Record<string, unknown> = {}) =>
      hhPut(evA, householdId1, {
        primaryContact: { name: nm('Primary1'), email: mail('primary1'), phone: '021 555 0201' },
        littleCount: 0,
        helpers: kids,
        guests: [],
        ...extra,
      });
    const asSaved = async (name: string, extra: Record<string, unknown> = {}) => {
      const r = await row(evA, name);
      return {
        personEventId: r!.id,
        name: r!.person.name,
        ...(r!.person.email ? { email: r!.person.email } : {}),
        ...(r!.person.phoneNumber ? { phone: r!.person.phoneNumber } : {}),
        ...extra,
      };
    };

    // Edit of another field: the primary contact's name and the little count change; every kid
    // is re-sent exactly as the form re-sends them (personEventId, details, decideLater as saved).
    const laterBefore = await row(evA, 'PLater');
    const edit1 = await put(
      [
        await asSaved('PLater', { decideLater: true }),
        await asSaved('PPlain'),
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true }),
        await asSaved('Unplaced1', { decideLater: true }),
      ],
      {
        primaryContact: {
          name: nm('Primary1 Renamed'),
          email: mail('primary1'),
          phone: '021 555 0201',
        },
        littleCount: 2,
      }
    );
    assert('4.14 the edit answers 200', edit1.status === 200, edit1.status);
    const laterAfter = await row(evA, 'PLater');
    assert(
      '4.15 an edit of another field keeps the marker "yes" and the role CHILD',
      isLater(laterAfter),
      stored(laterAfter)
    );
    assert(
      '4.16 …and keeps the held details, byte for byte (ruling 17: a save of an unchanged decide-later child keeps them)',
      laterAfter?.person.email === laterBefore?.person.email &&
        laterAfter?.person.phoneNumber === laterBefore?.person.phoneNumber,
      { e: laterAfter?.person.email, p: laterAfter?.person.phoneNumber }
    );
    assert(
      '4.17 the same edit really changed the other fields (so "kept" is not "not saved")',
      (await prisma.household.findUnique({ where: { id: householdId1 } }))?.littleCount === 2 &&
        (await row(evA, 'Primary1 Renamed')) !== null,
      null
    );

    section('Item 9 — settled to "message", and saved again unchanged');
    // A second decide-later kid, created through the edit door as a new row, holding both.
    const mkNew = await put(
      [
        await asSaved('PLater', { decideLater: true }),
        await asSaved('PPlain'),
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true }),
        await asSaved('Unplaced1', { decideLater: true }),
        { name: nm('NewA'), email: mail('newa'), phone: '021 555 0301', decideLater: true },
        { name: nm('NewB'), email: mail('newb'), phone: '021 555 0302', decideLater: true },
      ],
      { littleCount: 2 }
    );
    assert('9.0 the edit that adds two new decide-later rows answers 200', mkNew.status === 200);
    const newA = await row(evA, 'NewA');
    const newB = await row(evA, 'NewB');
    assert(
      '9.1 a new kid row added by the edit door with Decide later on is stored CHILD / "yes"',
      isLater(newA) && isLater(newB),
      { a: stored(newA), b: stored(newB) }
    );
    // Saved again, unchanged (twice): both details and the marker stay.
    for (let i = 1; i <= 2; i++) {
      await put(
        [
          await asSaved('PLater', { decideLater: true }),
          await asSaved('PPlain'),
          await asSaved('PTick', { adultRoled: true }),
          await asSaved('PBoth', { adultRoled: true }),
          await asSaved('Unplaced1', { decideLater: true }),
          await asSaved('NewA', { decideLater: true }),
          await asSaved('NewB', { decideLater: true }),
        ],
        { littleCount: 2 }
      );
    }
    const newAagain = await row(evA, 'NewA');
    assert(
      '9.2 a decide-later kid saved again unchanged keeps both details and stays "yes"',
      isLater(newAagain) &&
        newAagain?.person.email === mail('newa') &&
        newAagain?.person.phoneNumber === phoneOf('021 555 0301'),
      stored(newAagain)
    );
    // Settle NewA to "message": the tick on, Decide later gone from the payload.
    await put(
      [
        await asSaved('PLater', { decideLater: true }),
        await asSaved('PPlain'),
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true }),
        await asSaved('Unplaced1', { decideLater: true }),
        await asSaved('NewA', { adultRoled: true }),
        await asSaved('NewB', { decideLater: true }),
      ],
      { littleCount: 2 }
    );
    const newAsettled = await row(evA, 'NewA');
    assert(
      '9.3 settled to "message": role GUEST, marker "no"',
      isAdult(newAsettled),
      stored(newAsettled)
    );
    assert(
      "9.4 …and the email and phone are kept (the details are the adult's now)",
      newAsettled?.person.email === mail('newa') &&
        newAsettled?.person.phoneNumber === phoneOf('021 555 0301'),
      { e: newAsettled?.person.email }
    );
    assert(
      '9.5 the other decide-later kid was not touched by that settle',
      isLater(await row(evA, 'NewB')),
      stored(await row(evA, 'NewB'))
    );
    // Settle NewB to "don't message" as the SERVER sees it in S2.1: an explicit false, tick off.
    // (Blanking the boxes is the form's job and the refusal is S2.3; here the marker only.)
    // The saved "yes" is made directly in the database, so this check stands on its own.
    await prisma.personEvent.update({
      where: { id: (await row(evA, 'NewB'))!.id },
      data: { messagingUndecided: true },
    });
    await put(
      [
        await asSaved('PLater', { decideLater: true }),
        await asSaved('PPlain'),
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true }),
        await asSaved('Unplaced1', { decideLater: true }),
        await asSaved('NewA', { adultRoled: true }),
        await asSaved('NewB', { decideLater: false }),
      ],
      { littleCount: 2 }
    );
    assert(
      '9.6 an explicit false with the tick off stores CHILD / "no"',
      isPlainKid(await row(evA, 'NewB')),
      stored(await row(evA, 'NewB'))
    );

    section('Item 16 — the tick wins, and a save that omits the marker clears it (door 2)');
    // A saved "yes" made DIRECTLY in the database, so this check stands on its own.
    const seeded = await row(evA, 'PPlain');
    await prisma.personEvent.update({
      where: { id: seeded!.id },
      data: { messagingUndecided: true },
    });
    assert(
      '16.3 (setup) the seeded row reads CHILD / "yes" before the save',
      isLater(await row(evA, 'PPlain')),
      stored(await row(evA, 'PPlain'))
    );
    await put(
      [
        await asSaved('PLater', { decideLater: true }),
        await asSaved('PPlain'), // the value is left out, as a stale tab would
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true }),
        await asSaved('Unplaced1', { decideLater: true }),
        await asSaved('NewA', { adultRoled: true }),
        await asSaved('NewB'),
      ],
      { littleCount: 2 }
    );
    const omitted = await row(evA, 'PPlain');
    assert(
      '16.4 a payload that omits the marker clears it: CHILD / "no", details kept (the safe direction)',
      isPlainKid(omitted) &&
        omitted?.person.email === mail('pplain') &&
        omitted?.person.phoneNumber === phoneOf('021 555 0205'),
      stored(omitted)
    );
    await put(
      [
        await asSaved('PLater', { adultRoled: true, decideLater: true }),
        await asSaved('PPlain'),
        await asSaved('PTick', { adultRoled: true }),
        await asSaved('PBoth', { adultRoled: true, decideLater: true }),
        await asSaved('Unplaced1', { decideLater: true }),
        await asSaved('NewA', { adultRoled: true }),
        await asSaved('NewB'),
      ],
      { littleCount: 2 }
    );
    assert(
      '16.5 a saved decide-later kid whose payload now carries BOTH becomes the adult: GUEST / "no"',
      isAdult(await row(evA, 'PLater')) && isAdult(await row(evA, 'PBoth')),
      { l: stored(await row(evA, 'PLater')), b: stored(await row(evA, 'PBoth')) }
    );

    section('Item 4 / 10 — more doors-within-the-door: new rows, existing memberships, the host');
    const unplaced2 = await prisma.person.create({
      data: { name: nm('Unplaced2'), email: mail('unplaced2') },
    });
    bareIds.push(unplaced2.id);
    await prisma.personEvent.create({
      data: { personId: unplaced2.id, eventId: evA, role: 'PARTICIPANT' },
    });
    const hostBefore = await prisma.personEvent.findFirst({
      where: { eventId: evA, personId: hostPerson.id },
    });
    const keepKids = [
      await asSaved('PLater', { adultRoled: true }),
      await asSaved('PPlain'),
      await asSaved('PTick', { adultRoled: true }),
      await asSaved('PBoth', { adultRoled: true }),
      await asSaved('Unplaced1', { decideLater: true }),
      await asSaved('NewA', { adultRoled: true }),
      await asSaved('NewB'),
    ];
    const withExisting = await put(
      [
        ...keepKids,
        // existing membership, no household yet: typed as a kid (the edit door's other branch)
        { name: nm('Unplaced2'), email: mail('unplaced2'), decideLater: true },
        // the host typed as a decide-later kid: the host's own row must not move (GTC-256)
        { name: nm('Host'), email: mail('hostuser'), decideLater: true },
      ],
      { littleCount: 2 }
    );
    assert('4.18 that edit answers 200', withExisting.status === 200, withExisting.status);
    const un2 = await row(evA, 'Unplaced2');
    assert(
      '4.19 a person already on the event with no household, typed as a kid by the edit door, takes the marker',
      isLater(un2),
      stored(un2)
    );
    const hostAfter = await prisma.personEvent.findFirst({
      where: { eventId: evA, personId: hostPerson.id },
    });
    assert(
      '4.20 the host typed as a decide-later kid is not demoted and takes no marker (role HOST, PRIMARY_CONTACT, "no")',
      hostAfter?.role === 'HOST' &&
        hostAfter.householdRole === hostBefore?.householdRole &&
        hostAfter.householdId === hostBefore?.householdId &&
        hostAfter.messagingUndecided === false,
      hostAfter && {
        r: hostAfter.role,
        h: hostAfter.householdRole,
        u: hostAfter.messagingUndecided,
      }
    );

    section('Item 4 — her own household settles through the edit door too (C11)');
    const evAhouseholdId = (
      await prisma.personEvent.findFirst({
        where: { eventId: evA, personId: hostPerson.id },
        select: { householdId: true },
      })
    )?.householdId as string;
    const hLater2 = await row(evA, 'HLater');
    const ownEdit = await hhPut(evA, evAhouseholdId, {
      primaryContact: { name: nm('Host'), email: mail('hostuser'), phone: '021 555 0101' },
      littleCount: 0,
      helpers: [
        {
          personEventId: hLater2!.id,
          name: nm('HLater'),
          email: mail('hlater'),
          phone: '021 555 0102',
          decideLater: true,
        },
      ],
      guests: [],
    });
    assert("4.21 her own household's edit answers 200", ownEdit.status === 200, ownEdit.status);
    assert(
      "4.22 her own household's decide-later kid keeps the marker through the edit door",
      isLater(await row(evA, 'HLater')),
      stored(await row(evA, 'HLater'))
    );
    // The saved "yes" is made directly in the database, so this check stands on its own.
    await prisma.personEvent.update({
      where: { id: hLater2!.id },
      data: { messagingUndecided: true },
    });
    const ownOmit2 = await hhPut(evA, evAhouseholdId, {
      primaryContact: { name: nm('Host'), email: mail('hostuser'), phone: '021 555 0101' },
      littleCount: 0,
      helpers: [
        {
          personEventId: hLater2!.id,
          name: nm('HLater'),
          email: mail('hlater'),
          phone: '021 555 0102',
        },
      ],
      guests: [],
    });
    assert(
      '16.6 her own household: an edit that omits the marker clears it (door 2 on her own household)',
      ownOmit2.status === 200 && isPlainKid(await row(evA, 'HLater')),
      stored(await row(evA, 'HLater'))
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 10 — nothing blanks a plain child, an older child, or a person a new household names
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 10 — a plain child, a child saved before this ticket, and a new household');
    const evC = await newEvent('C item 10', false);
    await hostPost(evC, { alone: true });
    // A household with a child saved "before this ticket": made directly, in the old shape.
    const oldHh = await prisma.household.create({ data: { eventId: evC, littleCount: 0 } });
    const oldPrimary = await prisma.person.create({
      data: {
        name: nm('OldPrimary'),
        email: mail('oldprimary'),
        phoneNumber: phoneOf('021 555 0401'),
      },
    });
    const oldKid = await prisma.person.create({
      data: { name: nm('OldKid'), email: mail('oldkid'), phoneNumber: phoneOf('021 555 0402') },
    });
    bareIds.push(oldPrimary.id, oldKid.id);
    await prisma.personEvent.create({
      data: {
        personId: oldPrimary.id,
        eventId: evC,
        householdId: oldHh.id,
        householdRole: 'PRIMARY_CONTACT',
        role: 'PARTICIPANT',
      },
    });
    const oldKidPE = await prisma.personEvent.create({
      data: {
        personId: oldKid.id,
        eventId: evC,
        householdId: oldHh.id,
        householdRole: 'CHILD',
        isYoungPerson: true,
        role: 'PARTICIPANT',
      },
    });
    const oldBefore = await prisma.person.findUniqueOrThrow({ where: { id: oldKid.id } });
    assert(
      '10.3 (setup) the child saved before this ticket reads CHILD / "no" and holds an email and a phone',
      oldKidPE.householdRole === 'CHILD' &&
        oldKidPE.messagingUndecided === false &&
        !!oldBefore.email &&
        !!oldBefore.phoneNumber
    );
    for (const mode of ['value left out (as an old form sends it)', 'explicit false']) {
      const r = await hhPut(evC, oldHh.id, {
        primaryContact: {
          name: nm('OldPrimary'),
          email: mail('oldprimary'),
          phone: '021 555 0401',
        },
        littleCount: 0,
        helpers: [
          {
            personEventId: oldKidPE.id,
            name: nm('OldKid'),
            email: mail('oldkid'),
            phone: '021 555 0402',
            ...(mode === 'explicit false' ? { decideLater: false } : {}),
          },
        ],
        guests: [],
      });
      const oldKidAfter = await row(evC, 'OldKid');
      const oldPersonAfter = await prisma.person.findUniqueOrThrow({ where: { id: oldKid.id } });
      assert(
        `10.4 a child saved before this ticket, saved again (${mode}): still CHILD / "no", email and phone kept`,
        r.status === 200 &&
          isPlainKid(oldKidAfter) &&
          oldPersonAfter.email === oldBefore.email &&
          oldPersonAfter.phoneNumber === oldBefore.phoneNumber,
        { s: r.status, k: stored(oldKidAfter) }
      );
    }
    // A save with the kid's boxes left empty is today's ordinary clear and is NOT this
    // ticket's to change here: S2.1 adds no blanking and no refusal (that is S2.3). The
    // plain-child rule is only that a save which re-sends the details leaves them alone.

    // A new household names a person who already exists, with fewer details: nothing is blanked.
    const known = await prisma.person.create({
      data: { name: nm('Known'), email: mail('known'), phoneNumber: phoneOf('021 555 0501') },
    });
    bareIds.push(known.id);
    const newHh = await hhPost(evC, {
      primaryContact: { name: nm('Primary3'), email: mail('primary3') },
      littleCount: 0,
      helpers: [{ name: nm('Known'), email: mail('known') }], // no phone typed this time
      guests: [],
    });
    const knownAfter = await prisma.person.findUniqueOrThrow({ where: { id: known.id } });
    assert(
      '10.5 a new household (POST) that names an existing person with no phone blanks nothing: the person keeps the email and the phone',
      newHh.status === 201 &&
        knownAfter.email === mail('known') &&
        knownAfter.phoneNumber === phoneOf('021 555 0501'),
      { s: newHh.status, e: knownAfter.email, p: knownAfter.phoneNumber }
    );
    assert(
      '10.6 …and the kid row it made is a plain child: CHILD / "no"',
      isPlainKid(await row(evC, 'Known')),
      stored(await row(evC, 'Known'))
    );

    // ════════════════════════════════════════════════════════════════════════════════════════
    // Item 15 — no server guard after the press (ruling 25)
    // ════════════════════════════════════════════════════════════════════════════════════════
    section('Item 15 — after the press the edit door stores the settle, confirmed or not');
    const evB = await newEvent('B pressed', true);
    const pressed = await prisma.event.findUniqueOrThrow({ where: { id: evB } });
    assert('15.0 (setup) the event has been pressed (sentAt is set)', pressed.sentAt !== null);
    await hostPost(evB, { alone: true });
    const created = await hhPost(evB, {
      primaryContact: { name: nm('PrimaryB'), email: mail('primaryb'), phone: '021 555 0601' },
      littleCount: 0,
      helpers: [
        { name: nm('LateA'), email: mail('latea'), phone: '021 555 0602', decideLater: true },
        { name: nm('LateB'), email: mail('lateb'), phone: '021 555 0603', decideLater: true },
      ],
      guests: [],
    });
    const hhB: string = created.json?.household?.id;
    const lateA = await row(evB, 'LateA');
    const lateB = await row(evB, 'LateB');
    assert(
      '15.1 (setup) on the pressed event both kids are stored CHILD / "yes"',
      isLater(lateA) && isLater(lateB),
      { a: stored(lateA), b: stored(lateB) }
    );
    const settleBody = (settle: 'A' | 'B', extra: Record<string, unknown>) => ({
      primaryContact: { name: nm('PrimaryB'), email: mail('primaryb'), phone: '021 555 0601' },
      littleCount: 0,
      helpers: [
        {
          personEventId: lateA!.id,
          name: nm('LateA'),
          email: mail('latea'),
          phone: '021 555 0602',
          ...(settle === 'A' ? { adultRoled: true } : { decideLater: true }),
        },
        {
          personEventId: lateB!.id,
          name: nm('LateB'),
          email: mail('lateb'),
          phone: '021 555 0603',
          ...(settle === 'B' ? { adultRoled: true } : { decideLater: true }),
        },
      ],
      guests: [],
      ...extra,
    });
    const noConfirm = await hhPut(evB, hhB, settleBody('A', {}));
    assert(
      '15.2 settled to "message" after the press with no confirmation in the request: stored, 200, GUEST / "no"',
      noConfirm.status === 200 && isAdult(await row(evB, 'LateA')),
      { s: noConfirm.status, k: stored(await row(evB, 'LateA')) }
    );
    const withConfirm = await hhPut(
      evB,
      hhB,
      settleBody('B', { confirmed: true, confirmMessaging: true, confirm: 'yes' })
    );
    assert(
      '15.3 settled to "message" after the press with a confirmation in the request: the same, GUEST / "no" (the line is a screen courtesy; the route does not read it)',
      withConfirm.status === 200 && isAdult(await row(evB, 'LateB')),
      { s: withConfirm.status, k: stored(await row(evB, 'LateB')) }
    );
    assert(
      '15.4 both answers are the same status, and neither is a refusal (no 4xx)',
      noConfirm.status === withConfirm.status && noConfirm.status < 400
    );
  } finally {
    // ── Cleanup, by id: the events (their households, memberships, tokens and ledger entries
    // cascade), then the people this run made, then the sign-in.
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
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.person.deleteMany({ where: { userId } });
      await prisma.user.deleteMany({ where: { id: userId } });
    }
    const leftPeople = await prisma.person.count({ where: { name: { startsWith: TAG } } });
    const leftEvents = await prisma.event.count({ where: { name: { startsWith: TAG } } });
    const leftUsers = userId ? await prisma.user.count({ where: { id: userId } }) : 0;
    section('Cleanup');
    assert(
      'C.1 every row this run made is gone: no person, event or user is left',
      leftPeople === 0 && leftEvents === 0 && leftUsers === 0,
      { leftPeople, leftEvents, leftUsers }
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
