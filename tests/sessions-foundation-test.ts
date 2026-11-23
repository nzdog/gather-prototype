/**
 * [[GTC-478]] — THE MULTI-DAY FOUNDATION: the sessions switch, the session routes, the order, and
 * sessions surviving "invites only" (`npm run test:sessions-foundation`).
 *
 * The founder's rulings on the plan, 23 Nov 2026 (docs/tickets/GTC-478.md): SessionAbsence stores
 * who is NOT at a session (A); removing a session that still has items is refused, 409 (B);
 * GATHER_SESSIONS, only "on" counts, the new routes refuse while it is off, and it is never set in
 * .env or .env.local (D); the restore change in C, gated by the switch.
 *
 * HOW THE ROUTES ARE CALLED. In this process, as the real route handlers, with real Users,
 * Sessions and EventRoles. The one stand-in is the cookie reader (tests/helpers/session-stand-in.ts,
 * the pattern of tests/decide-later-write-test.ts). The switch is set for this process only, call
 * by call, and put back to unset after each.
 *
 *   S  the switch: only the exact `on` is on, read at every call
 *   F  neither .env nor .env.local names GATHER_SESSIONS (names only; no value is read out)
 *   O  switch OFF: each new address answers as it did before it existed; nothing written; the GET
 *   C  create         E  the order        R  rename and date      P  reorder      D  remove
 *   I  "invites only": sessions survive with the switch on; exactly as before with it off
 *   W  a no-session event and a one-session event are untouched
 *   L  the new ledger lines never ask why
 *   Z  nothing sent; every row this run made removed by id; every table's count as found
 *
 * SAFETY. Writes only its own rows (every name starts with the run's TAG). Every id is written to
 * the fixture file BEFORE the row is used, and removed by id in `finally`, however the run ends.
 * Nothing here can send: no route called sends, and no transport is touched. No server, no browser.
 *
 * Run: npx tsx tests/sessions-foundation-test.ts
 */
import './helpers/session-stand-in';
import { actAs, actAsNobody, standDown } from './helpers/session-stand-in';
import { prisma } from '../src/lib/prisma';
import { NextRequest } from 'next/server';
import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { whyTrigger } from '../src/lib/ledger';
import { putAwayPlan, bringBackPlan } from '../src/lib/workflow';

const ROOT = path.join(__dirname, '..');
const TAG = `S478${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC478_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc478-sessions-${TAG}.json`);

let passed = 0;
let failed = 0;
function check(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 500)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);

// ── The fixture file: every id, written before the row is used ──────────────────────────────
const made: Record<'users' | 'people' | 'events', string[]> = { users: [], people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}

// ── The routes, loaded if they exist (at the tests-first commit the new ones do not) ─────────
const DAYS = '../src/app/api/events/[id]/days/route';
const ONE = '../src/app/api/events/[id]/days/[dayId]/route';
const SWITCH = '../src/lib/sessions/switch';
async function load(p: string): Promise<any> {
  try {
    return await import(p);
  } catch {
    return null;
  }
}

type Res = { status: number; json: any };
async function call(
  mod: any,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  params: Record<string, string>,
  as: string | null,
  body?: unknown
): Promise<Res> {
  const handler = mod?.[method];
  if (typeof handler !== 'function') return { status: -1, json: { missing: method } };
  const req = new NextRequest(
    `http://localhost${url}`,
    body === undefined
      ? { method }
      : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
  );
  if (as === null) actAsNobody();
  else actAs(as);
  try {
    const res: Response = await handler(req, { params: Promise.resolve(params) });
    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch (e) {
    return { status: -2, json: { threw: (e as Error).message } };
  } finally {
    standDown();
  }
}

/** Run `fn` with the switch at `value` (undefined = unset), then put it back to unset. */
async function withSwitch<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[VAR];
  else env[VAR] = value;
  try {
    return await fn();
  } finally {
    delete env[VAR];
  }
}

const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);

/**
 * The id of the session a create call made; if the call made none (the route is missing, as at the
 * tests-first commit), one made directly, so the later sections still test their own thing. The
 * create's own check has already gone red in that case.
 */
async function sessionFrom(res: Res, name: string, date: string, eventId: string): Promise<string> {
  if (res.status === 201 && typeof res.json?.day?.id === 'string') return res.json.day.id;
  return (await prisma.day.create({ data: { name, date: utcDay(date), eventId } })).id;
}

async function tableCounts(): Promise<Record<string, number>> {
  const tables: { tablename: string }[] =
    await prisma.$queryRaw`select tablename from pg_tables where schemaname = 'public' order by tablename`;
  const out: Record<string, number> = {};
  for (const { tablename } of tables) {
    const rows: { n: bigint }[] = await prisma.$queryRawUnsafe(
      `select count(*)::bigint as n from "${tablename.replace(/"/g, '""')}"`
    );
    out[tablename] = Number(rows[0].n);
  }
  return out;
}

async function cleanUp() {
  const events = made.events;
  const people = made.people;
  const users = made.users;
  // Events first: their days, absences, teams, items, people-on-event, roles, revisions and ledger
  // rows go with them. Then the ledger rows naming our people elsewhere, the people, the users.
  if (events.length) await prisma.event.deleteMany({ where: { id: { in: events } } });
  if (people.length) {
    await prisma.auditEntry.deleteMany({ where: { actorId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
  if (users.length) {
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}

async function main() {
  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  const days = await load(DAYS);
  const one = await load(ONE);
  const sw = await load(SWITCH);

  // ── Fixtures ───────────────────────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 864e5);
  const signIn = async (key: string) => {
    const user = await prisma.user.create({
      data: { email: `${TAG}-${key}@example.com`.toLowerCase() },
    });
    note('users', user.id);
    const person = await prisma.person.create({
      data: { name: `${TAG} ${key}`, email: user.email, userId: user.id },
    });
    note('people', person.id);
    const token = randomBytes(32).toString('hex');
    await prisma.session.create({ data: { userId: user.id, token, expiresAt } });
    return { user, person, token };
  };
  const host = await signIn('host');
  const cohost = await signIn('cohost');
  const coord = await signIn('coordinator');
  const stranger = await signIn('stranger');
  const guest = await prisma.person.create({ data: { name: `${TAG} guest Bob` } });
  note('people', guest.id);

  const newEvent = async (key: string, hostPersonId: string) => {
    const id = `${TAG.toLowerCase()}${key}`;
    note('events', id);
    return prisma.event.create({
      data: {
        id,
        name: `${TAG} ${key}`,
        startDate: utcDay('2026-12-24'),
        endDate: utcDay('2026-12-26'),
        status: 'DRAFT',
        hostId: hostPersonId,
      },
    });
  };
  const role = (userId: string, eventId: string, r: 'HOST' | 'COHOST' | 'COORDINATOR') =>
    prisma.eventRole.create({ data: { userId, eventId, role: r } });

  const A = await newEvent('a', host.person.id);
  const B = await newEvent('b', host.person.id);
  const C = await newEvent('c', stranger.person.id);
  await role(host.user.id, A.id, 'HOST');
  await role(cohost.user.id, A.id, 'COHOST');
  await role(coord.user.id, A.id, 'COORDINATOR');
  await role(host.user.id, B.id, 'HOST');
  await role(stranger.user.id, C.id, 'HOST');

  const existingA = await prisma.day.create({
    data: { name: `${TAG} existing`, date: utcDay('2026-12-25'), eventId: A.id },
  });
  const sessionB = await prisma.day.create({
    data: { name: `${TAG} B's session`, date: utcDay('2026-12-25'), eventId: B.id },
  });
  const rowOf = (id: string) =>
    prisma.day.findUnique({
      where: { id },
      select: { name: true, date: true, displayOrder: true, eventId: true },
    });
  const daysOf = (eventId: string) =>
    prisma.day.findMany({
      where: { eventId },
      orderBy: [{ date: 'asc' }, { displayOrder: 'asc' }, { id: 'asc' }],
      select: { id: true, name: true, date: true, displayOrder: true },
    });
  const ledgerOn = (eventIds: string[]) =>
    prisma.auditEntry.count({ where: { eventId: { in: eventIds } } });
  const linesFor = (targetId: string, actionType: string) =>
    prisma.auditEntry.count({ where: { targetId, actionType } });
  const daysUrl = (e: string) => `/api/events/${e}/days`;
  const oneUrl = (e: string, d: string) => `/api/events/${e}/days/${d}`;
  const P = (e: string) => ({ id: e });
  const PD = (e: string, d: string) => ({ id: e, dayId: d });

  // ══ S — the switch ════════════════════════════════════════════════════════════════════════
  section('S — the switch: only the exact "on" is on, read at every call');
  const isOn = (v: string | undefined) => {
    const env = process.env as Record<string, string | undefined>;
    if (v === undefined) delete env[VAR];
    else env[VAR] = v;
    try {
      return typeof sw?.isSessionsOn === 'function' ? sw.isSessionsOn() : null;
    } finally {
      delete env[VAR];
    }
  };
  check(
    'S1',
    'src/lib/sessions/switch.ts exists and names GATHER_SESSIONS',
    sw?.SESSIONS_VAR === VAR
  );
  for (const [id, v] of [
    ['S2', undefined],
    ['S3', ''],
    ['S4', 'true'],
    ['S5', '1'],
    ['S6', 'ON'],
    ['S7', ' on'],
  ] as const) {
    check(id, `${v === undefined ? 'unset' : JSON.stringify(v)} is off`, isOn(v) === false);
  }
  check('S8', '"on" is on', isOn('on') === true);
  check(
    'S9',
    'it is read at every call: on, then unset, reads off in the same process',
    isOn('on') === true && isOn(undefined) === false
  );

  // ══ F — the env files ═════════════════════════════════════════════════════════════════════
  section('F — never set in .env or .env.local (founder ruling D)');
  const names = (f: string) => {
    const p = path.join(ROOT, f);
    return (
      fs.existsSync(p) && /^\s*(?:export\s+)?GATHER_SESSIONS\s*=/m.test(fs.readFileSync(p, 'utf8'))
    );
  };
  check(
    'F1',
    'neither .env nor .env.local names GATHER_SESSIONS (names only; no value is read out)',
    !names('.env') && !names('.env.local')
  );

  // ══ O — switch off ════════════════════════════════════════════════════════════════════════
  section('O — switch OFF: each new address answers as before it existed, and writes nothing');
  const aBefore = JSON.stringify(await daysOf(A.id));
  const ledgerBefore = await ledgerOn([A.id, B.id, C.id]);
  const off = await withSwitch(undefined, async () => ({
    post: await call(days, 'POST', daysUrl(A.id), P(A.id), host.token, {
      name: 'x',
      date: '2026-12-25',
    }),
    put: await call(days, 'PUT', daysUrl(A.id), P(A.id), host.token, { dayIds: [existingA.id] }),
    patch: await call(
      one,
      'PATCH',
      oneUrl(A.id, existingA.id),
      PD(A.id, existingA.id),
      host.token,
      { name: 'y' }
    ),
    del: await call(one, 'DELETE', oneUrl(A.id, existingA.id), PD(A.id, existingA.id), host.token),
    nPost: await call(days, 'POST', daysUrl(A.id), P(A.id), null, {
      name: 'x',
      date: '2026-12-25',
    }),
    nPut: await call(days, 'PUT', daysUrl(A.id), P(A.id), null, { dayIds: [] }),
    nPatch: await call(one, 'PATCH', oneUrl(A.id, existingA.id), PD(A.id, existingA.id), null, {
      name: 'y',
    }),
    nDel: await call(one, 'DELETE', oneUrl(A.id, existingA.id), PD(A.id, existingA.id), null),
  }));
  check(
    'O1',
    'POST /days, as the host: 405 (what the address answered before), no body',
    off.post.status === 405 && off.post.json === null,
    off.post
  );
  check(
    'O2',
    'PUT /days, as the host: 405, no body',
    off.put.status === 405 && off.put.json === null,
    off.put
  );
  check(
    'O3',
    'PATCH /days/:dayId, as the host: 404, no body',
    off.patch.status === 404 && off.patch.json === null,
    off.patch
  );
  check(
    'O4',
    'DELETE /days/:dayId, as the host: 404, no body',
    off.del.status === 404 && off.del.json === null,
    off.del
  );
  check(
    'O5',
    'the same four with no session: 405, 405, 404, 404 (the switch comes before the guard)',
    off.nPost.status === 405 &&
      off.nPut.status === 405 &&
      off.nPatch.status === 404 &&
      off.nDel.status === 404,
    [off.nPost.status, off.nPut.status, off.nPatch.status, off.nDel.status]
  );
  check(
    'O6',
    "CONTROL: nothing written — A's sessions as they were, no ledger line on A, B or C",
    JSON.stringify(await daysOf(A.id)) === aBefore &&
      (await ledgerOn([A.id, B.id, C.id])) === ledgerBefore
  );
  const getOff = await withSwitch(undefined, async () => ({
    host: await call(days, 'GET', daysUrl(A.id), P(A.id), host.token),
    nobody: await call(days, 'GET', daysUrl(A.id), P(A.id), null),
    stranger: await call(days, 'GET', daysUrl(A.id), P(A.id), stranger.token),
  }));
  check(
    'O7',
    'GET /days is as before: 200 to the host with { id, name, date } only, 401 with no session, 403 to a stranger',
    getOff.host.status === 200 &&
      getOff.host.json?.days?.length === 1 &&
      JSON.stringify(Object.keys(getOff.host.json.days[0]).sort()) === '["date","id","name"]' &&
      getOff.nobody.status === 401 &&
      getOff.stranger.status === 403,
    [getOff.host, getOff.nobody.status, getOff.stranger.status]
  );

  // ══ C — create ═════════════════════════════════════════════════════════════════════════════
  section('C — create a session (switch on)');
  const create = (as: string | null, body: unknown, ev = A.id) =>
    withSwitch('on', () => call(days, 'POST', daysUrl(ev), P(ev), as, body));
  const lunch = await create(host.token, { name: `  ${TAG} Lunch  `, date: '2026-12-25' });
  const lunchRow = lunch.json?.day?.id ? await rowOf(lunch.json.day.id) : null;
  check(
    'C1',
    'the host makes "Lunch" on 25 Dec: 201; name trimmed, date at midnight UTC, last on its date (place 1)',
    lunch.status === 201 &&
      lunchRow?.name === `${TAG} Lunch` &&
      lunchRow?.date.toISOString() === '2026-12-25T00:00:00.000Z' &&
      lunchRow?.displayOrder === 1 &&
      lunchRow?.eventId === A.id,
    lunch
  );
  const dinner = await create(cohost.token, { name: `${TAG} Dinner`, date: '2026-12-25' });
  check(
    'C2',
    'the co-host makes "Dinner" on 25 Dec: 201, place 2',
    dinner.status === 201 && dinner.json?.day?.displayOrder === 2,
    dinner
  );
  check(
    'C3',
    'one CREATE_DAY ledger line for each',
    lunch.json?.day?.id &&
      dinner.json?.day?.id &&
      (await linesFor(lunch.json.day.id, 'CREATE_DAY')) === 1 &&
      (await linesFor(dinner.json.day.id, 'CREATE_DAY')) === 1
  );
  const countA = async () => prisma.day.count({ where: { eventId: A.id } });
  const beforeRefusals = await countA();
  const okBody = { name: 'x', date: '2026-12-25' };
  const rN = await create(null, okBody);
  const rC = await create(coord.token, okBody);
  const rS = await create(stranger.token, okBody);
  check('C4', 'no session: 401', rN.status === 401, rN);
  check('C5', "A's coordinator: 403 (host and co-host only)", rC.status === 403, rC);
  check('C6', 'a host of another event only: 403', rS.status === 403, rS);
  const W = (await load('../src/lib/sessions/input'))?.SESSION_WORDS ?? {};
  const badName = [
    await create(host.token, { date: '2026-12-25' }),
    await create(host.token, { name: '   ', date: '2026-12-25' }),
    await create(host.token, { name: 7, date: '2026-12-25' }),
  ];
  check(
    'C7',
    '"A session needs a name" for a missing, blank or non-text name (400)',
    badName.every((r) => r.status === 400 && r.json?.error === 'A session needs a name') &&
      W.nameMissing === 'A session needs a name',
    badName
  );
  const long = await create(host.token, { name: 'x'.repeat(101), date: '2026-12-25' });
  check(
    'C8',
    '"That name is too long (100 characters at most)" for 101 characters (400)',
    long.status === 400 && long.json?.error === 'That name is too long (100 characters at most)',
    long
  );
  const badDates = [];
  for (const date of [
    undefined,
    '2026-13-01',
    '2026-02-30',
    '25/12/2026',
    '2026-12-25T10:00',
    20261225,
  ]) {
    badDates.push(await create(host.token, { name: 'x', date }));
  }
  check(
    'C9',
    `"Give the session's date as YYYY-MM-DD" for a missing, impossible or wrongly written date (400)`,
    badDates.every(
      (r) => r.status === 400 && r.json?.error === "Give the session's date as YYYY-MM-DD"
    ),
    badDates.map((r) => [r.status, r.json?.error])
  );
  check('C10', 'CONTROL: none of the refusals made a session', (await countA()) === beforeRefusals);

  // ══ E — the order ══════════════════════════════════════════════════════════════════════════
  section('E — the GET returns sessions by date, then place, then the order made');
  const eve = await create(host.token, { name: `${TAG} Eve`, date: '2026-12-24' });
  const getOrder = await withSwitch('on', () =>
    call(days, 'GET', daysUrl(A.id), P(A.id), host.token)
  );
  check(
    'E1',
    'A reads: Eve (24th, made last), then the existing session, Lunch, Dinner (25th, by place)',
    JSON.stringify((getOrder.json?.days ?? []).map((d: any) => d.id)) ===
      JSON.stringify([eve.json?.day?.id, existingA.id, lunch.json?.day?.id, dinner.json?.day?.id]),
    getOrder.json?.days?.map((d: any) => d.name)
  );
  const F = await newEvent('f', host.person.id);
  await role(host.user.id, F.id, 'HOST');
  const f1 = await prisma.day.create({
    data: { name: `${TAG} f one`, date: utcDay('2026-12-25'), eventId: F.id },
  });
  const f2 = await prisma.day.create({
    data: { name: `${TAG} f two`, date: utcDay('2026-12-25'), eventId: F.id },
  });
  const getF = await withSwitch(undefined, () =>
    call(days, 'GET', daysUrl(F.id), P(F.id), host.token)
  );
  check(
    'E2',
    'two sessions made the old way on one date (both place 0) come back in the order made, switch off',
    JSON.stringify((getF.json?.days ?? []).map((d: any) => d.id)) ===
      JSON.stringify([f1.id, f2.id].sort()),
    getF.json
  );

  // ══ R — rename and change the date ═════════════════════════════════════════════════════════
  section('R — rename a session, change its date (switch on)');
  const patch = (as: string | null, ev: string, dayId: string, body: unknown) =>
    withSwitch('on', () => call(one, 'PATCH', oneUrl(ev, dayId), PD(ev, dayId), as, body));
  const lunchId = await sessionFrom(lunch, `${TAG} Lunch`, '2026-12-25', A.id);
  const dinnerId = await sessionFrom(dinner, `${TAG} Dinner`, '2026-12-25', A.id);
  const ren = await patch(host.token, A.id, lunchId, { name: `${TAG} Long lunch` });
  const renRow = await rowOf(lunchId);
  check(
    'R1',
    'rename Lunch: 200; the name saved, the date and place kept; one EDIT_DAY line for the name',
    ren.status === 200 &&
      renRow?.name === `${TAG} Long lunch` &&
      renRow?.displayOrder === 1 &&
      renRow?.date.toISOString() === '2026-12-25T00:00:00.000Z' &&
      (await prisma.auditEntry.count({
        where: { targetId: lunchId, actionType: 'EDIT_DAY', field: 'name' },
      })) === 1,
    ren
  );
  const moved = await patch(cohost.token, A.id, dinnerId, { date: '2026-12-26' });
  const movedRow = await rowOf(dinnerId);
  const maxOther = Math.max(
    ...(await daysOf(A.id)).filter((d) => d.id !== dinnerId).map((d) => d.displayOrder)
  );
  check(
    'R2',
    'move Dinner to 26 Dec (co-host): 200; the date saved, last on the event (one past the highest place); lines for date and place',
    moved.status === 200 &&
      movedRow?.date.toISOString() === '2026-12-26T00:00:00.000Z' &&
      movedRow?.displayOrder === maxOther + 1 &&
      (await prisma.auditEntry.count({
        where: {
          targetId: dinnerId,
          actionType: 'EDIT_DAY',
          field: { in: ['date', 'displayOrder'] },
        },
      })) === 2,
    moved
  );
  const ledgerA = await ledgerOn([A.id]);
  const same = await patch(host.token, A.id, lunchId, {
    name: `${TAG} Long lunch`,
    date: '2026-12-25',
  });
  check(
    'R3',
    'the same name and date again: 200, nothing written, no ledger line',
    same.status === 200 &&
      (await ledgerOn([A.id])) === ledgerA &&
      JSON.stringify(await rowOf(lunchId)) === JSON.stringify(renRow),
    same
  );
  const pr = [
    await patch(null, A.id, lunchId, { name: 'z' }),
    await patch(stranger.token, A.id, lunchId, { name: 'z' }),
    await patch(coord.token, A.id, lunchId, { name: 'z' }),
  ];
  check(
    'R4',
    'no session 401; a host of another event only 403; the coordinator 403',
    pr[0].status === 401 && pr[1].status === 403 && pr[2].status === 403,
    pr.map((r) => r.status)
  );
  const pb = [
    await patch(host.token, A.id, lunchId, { name: '' }),
    await patch(host.token, A.id, lunchId, { date: '2026-02-30' }),
  ];
  check(
    'R5',
    'a blank name and an impossible date are refused with their words (400), nothing changed',
    pb[0].status === 400 &&
      pb[0].json?.error === 'A session needs a name' &&
      pb[1].status === 400 &&
      pb[1].json?.error === "Give the session's date as YYYY-MM-DD" &&
      JSON.stringify(await rowOf(lunchId)) === JSON.stringify(renRow),
    pb
  );
  const bBefore = JSON.stringify(await rowOf(sessionB.id));
  const cross = await patch(host.token, A.id, sessionB.id, { name: 'taken over' });
  check(
    'R6',
    "B's session through A's address, by the host of both: 400 \"That session is not on this event\"; B's session unchanged",
    cross.status === 400 &&
      cross.json?.error === 'That session is not on this event' &&
      JSON.stringify(await rowOf(sessionB.id)) === bBefore,
    cross
  );
  const ghost = await patch(host.token, A.id, 'no-such-session', { name: 'x' });
  check(
    'R7',
    'a made-up session id: 400 "That session is not on this event"',
    ghost.status === 400 && ghost.json?.error === 'That session is not on this event',
    ghost
  );

  // ══ P — reorder ════════════════════════════════════════════════════════════════════════════
  section('P — put the sessions in order (switch on)');
  const put = (as: string | null, ev: string, body: unknown) =>
    withSwitch('on', () => call(days, 'PUT', daysUrl(ev), P(ev), as, body));
  const eveId = await sessionFrom(eve, `${TAG} Eve`, '2026-12-24', A.id);
  const wanted = [eveId, lunchId, existingA.id, dinnerId];
  const ledgerP = await ledgerOn([A.id]);
  const re = await put(host.token, A.id, { dayIds: wanted });
  const afterRe = await daysOf(A.id);
  check(
    'P1',
    'Long lunch before the existing session on the 25th: 200; the order as listed, places 0 to 3; a line for each place that moved',
    re.status === 200 &&
      JSON.stringify(afterRe.map((d) => d.id)) === JSON.stringify(wanted) &&
      JSON.stringify(afterRe.map((d) => d.displayOrder)) === '[0,1,2,3]' &&
      JSON.stringify((re.json?.days ?? []).map((d: any) => d.id)) === JSON.stringify(wanted) &&
      (await ledgerOn([A.id])) > ledgerP,
    re
  );
  const snapA = JSON.stringify(await daysOf(A.id));
  const ledgerP2 = await ledgerOn([A.id, B.id]);
  const withB = await put(host.token, A.id, { dayIds: [...wanted.slice(0, 3), sessionB.id] });
  check(
    'P2',
    'a list holding B\'s session: 400 "That session is not on this event"',
    withB.status === 400 && withB.json?.error === 'That session is not on this event',
    withB
  );
  const lists = [
    await put(host.token, A.id, { dayIds: wanted.slice(0, 3) }),
    await put(host.token, A.id, { dayIds: [...wanted, wanted[0]] }),
    await put(host.token, A.id, { dayIds: [wanted[0], wanted[0], wanted[2], wanted[3]] }),
    await put(host.token, A.id, { dayIds: 'all' }),
    await put(host.token, A.id, {}),
  ];
  check(
    'P3',
    '"List every session of this event once" for a short list, a repeat, a duplicate in place of one, and no list (400)',
    lists.every(
      (r) => r.status === 400 && r.json?.error === 'List every session of this event once'
    ),
    lists.map((r) => [r.status, r.json?.error])
  );
  const outOfOrder = await put(host.token, A.id, {
    dayIds: [dinnerId, eveId, lunchId, existingA.id],
  });
  check(
    'P4',
    'a later date before an earlier one: 400 "Sessions stay in date order"',
    outOfOrder.status === 400 && outOfOrder.json?.error === 'Sessions stay in date order',
    outOfOrder
  );
  const pp = [
    await put(null, A.id, { dayIds: wanted }),
    await put(stranger.token, A.id, { dayIds: wanted }),
    await put(coord.token, A.id, { dayIds: wanted }),
  ];
  check(
    'P5',
    'no session 401; a host of another event only 403; the coordinator 403',
    pp[0].status === 401 && pp[1].status === 403 && pp[2].status === 403,
    pp.map((r) => r.status)
  );
  check(
    'P6',
    'CONTROL: none of the refusals moved a session or wrote a ledger line',
    JSON.stringify(await daysOf(A.id)) === snapA && (await ledgerOn([A.id, B.id])) === ledgerP2
  );

  // ══ D — remove ═════════════════════════════════════════════════════════════════════════════
  section('D — remove a session (switch on)');
  const del = (as: string | null, ev: string, dayId: string) =>
    withSwitch('on', () => call(one, 'DELETE', oneUrl(ev, dayId), PD(ev, dayId), as));
  const teamA = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: A.id } });
  const dish = await prisma.item.create({
    data: { name: `${TAG} Pavlova`, teamId: teamA.id, dayId: lunchId },
  });
  const peA = await prisma.personEvent.create({ data: { personId: guest.id, eventId: A.id } });
  await prisma.sessionAbsence.create({ data: { personEventId: peA.id, dayId: eveId } });
  await prisma.sessionAbsence.create({ data: { personEventId: peA.id, dayId: dinnerId } });
  const busy = await del(host.token, A.id, lunchId);
  check(
    'D1',
    'a session holding an item: 409 with the words; the session and the dish unchanged',
    busy.status === 409 &&
      busy.json?.error ===
        'This session still has items. Move them to another session or to the whole event first.' &&
      (await rowOf(lunchId)) !== null &&
      (await prisma.item.findUnique({ where: { id: dish.id } }))?.dayId === lunchId,
    busy
  );
  const gone = await del(cohost.token, A.id, eveId);
  check(
    'D2',
    'an empty session (co-host): 200; it is gone, its absence row with it, the other absence row kept; one DELETE_DAY line',
    gone.status === 200 &&
      (await rowOf(eveId)) === null &&
      (await prisma.sessionAbsence.count({ where: { dayId: eveId } })) === 0 &&
      (await prisma.sessionAbsence.count({ where: { dayId: dinnerId, personEventId: peA.id } })) ===
        1 &&
      (await linesFor(eveId, 'DELETE_DAY')) === 1,
    gone
  );
  const crossDel = await del(host.token, A.id, sessionB.id);
  check(
    'D3',
    "B's session through A's address: 400 \"That session is not on this event\"; B's session stays",
    crossDel.status === 400 &&
      crossDel.json?.error === 'That session is not on this event' &&
      (await rowOf(sessionB.id)) !== null,
    crossDel
  );
  const pd = [
    await del(null, A.id, dinnerId),
    await del(stranger.token, A.id, dinnerId),
    await del(coord.token, A.id, dinnerId),
    await del(host.token, A.id, 'no-such-session'),
  ];
  check(
    'D4',
    'no session 401; a host of another event only 403; the coordinator 403; a made-up id 400',
    pd[0].status === 401 &&
      pd[1].status === 403 &&
      pd[2].status === 403 &&
      pd[3].status === 400 &&
      pd[3].json?.error === 'That session is not on this event',
    pd.map((r) => r.status)
  );
  check(
    'D5',
    'CONTROL: Dinner is still there after those refusals',
    (await rowOf(dinnerId)) !== null
  );

  // ══ I — invites only ═══════════════════════════════════════════════════════════════════════
  section('I — "invites only": sessions survive with the switch on, as before with it off');
  /** An event with a plan: one team, a dish on a session, a dish for the whole event, a person not at the second session. */
  const planEvent = async (key: string) => {
    const ev = await newEvent(key, host.person.id);
    const s1 = await prisma.day.create({
      data: {
        name: `${TAG} ${key} Lunch`,
        date: utcDay('2026-12-25'),
        eventId: ev.id,
        displayOrder: 0,
      },
    });
    const s2 = await prisma.day.create({
      data: {
        name: `${TAG} ${key} Dinner`,
        date: utcDay('2026-12-25'),
        eventId: ev.id,
        displayOrder: 1,
      },
    });
    const team = await prisma.team.create({
      data: { name: `${TAG} ${key} Mains`, eventId: ev.id },
    });
    await prisma.item.create({ data: { name: 'Pavlova', teamId: team.id, dayId: s1.id } });
    await prisma.item.create({ data: { name: 'Ham', teamId: team.id } });
    const pe = await prisma.personEvent.create({ data: { personId: guest.id, eventId: ev.id } });
    await prisma.sessionAbsence.create({ data: { personEventId: pe.id, dayId: s2.id } });
    return { ev, s1, s2, pe };
  };
  const sessionsShape = async (eventId: string) =>
    (await daysOf(eventId)).map((d) => [d.name, d.date.toISOString(), d.displayOrder]);
  const dishes = async (eventId: string) =>
    (
      await prisma.item.findMany({
        where: { team: { eventId } },
        orderBy: { name: 'asc' },
        select: { name: true, day: { select: { id: true, name: true } } },
      })
    ).map((i) => [i.name, i.day?.name ?? null, i.day?.id ?? null]);
  const txDo = <T>(fn: (tx: any) => Promise<T>) =>
    prisma.$transaction((tx) => fn(tx), { timeout: 30000 });

  const on = await planEvent('i');
  const onShape = await sessionsShape(on.ev.id);
  const putOn = await withSwitch('on', () =>
    txDo((tx) => putAwayPlan(tx, on.ev.id, host.person.id))
  );
  const awayDays = await daysOf(on.ev.id);
  check(
    'I1',
    'switch on, put away: the plan is cleared (no team, no item) and the sessions stay, the same ids, names, dates and places, with the absence row',
    putOn === true &&
      (await prisma.team.count({ where: { eventId: on.ev.id } })) === 0 &&
      (await prisma.item.count({ where: { team: { eventId: on.ev.id } } })) === 0 &&
      JSON.stringify(awayDays.map((d) => d.id)) === JSON.stringify([on.s1.id, on.s2.id]) &&
      JSON.stringify(await sessionsShape(on.ev.id)) === JSON.stringify(onShape) &&
      (await prisma.sessionAbsence.count({
        where: { personEventId: on.pe.id, dayId: on.s2.id },
      })) === 1,
    await sessionsShape(on.ev.id)
  );
  const rev: any = await prisma.planRevision.findFirst({
    where: { eventId: on.ev.id },
    orderBy: { revisionNumber: 'desc' },
  });
  check(
    'I2',
    'the saved plan holds both sessions with their places',
    Array.isArray(rev?.days) &&
      JSON.stringify((rev.days as any[]).map((d) => [d.id, d.displayOrder]).sort()) ===
        JSON.stringify(
          [
            [on.s1.id, 0],
            [on.s2.id, 1],
          ].sort()
        )
  );
  const backOn = await withSwitch('on', () =>
    txDo((tx) => bringBackPlan(tx, on.ev.id, host.person.id))
  );
  check(
    'I3',
    'switch on, bring back: the same two sessions (no copies), Pavlova on Lunch by the same id, Ham for the whole event, the absence row kept',
    backOn.broughtBack === true &&
      JSON.stringify((await daysOf(on.ev.id)).map((d) => d.id)) ===
        JSON.stringify([on.s1.id, on.s2.id]) &&
      JSON.stringify(await dishes(on.ev.id)) ===
        JSON.stringify([
          ['Ham', null, null],
          ['Pavlova', `${TAG} i Lunch`, on.s1.id],
        ]) &&
      (await prisma.sessionAbsence.count({
        where: { personEventId: on.pe.id, dayId: on.s2.id },
      })) === 1,
    [await sessionsShape(on.ev.id), await dishes(on.ev.id)]
  );
  await role(host.user.id, on.ev.id, 'HOST');
  await withSwitch('on', () => txDo((tx) => putAwayPlan(tx, on.ev.id, host.person.id)));
  const removedAway = await withSwitch('on', () =>
    call(one, 'DELETE', oneUrl(on.ev.id, on.s1.id), PD(on.ev.id, on.s1.id), host.token)
  );
  await withSwitch('on', () => txDo((tx) => bringBackPlan(tx, on.ev.id, host.person.id)));
  const remade = await daysOf(on.ev.id);
  const remadeLunch = remade.find((d) => d.name === `${TAG} i Lunch`);
  check(
    'I4',
    'a session removed while the plan was away comes back from the saved plan, with its place, and Pavlova on it; Dinner kept by its id',
    removedAway.status === 200 &&
      remade.length === 2 &&
      !!remadeLunch &&
      remadeLunch.id !== on.s1.id &&
      remadeLunch.displayOrder === 0 &&
      remade.some((d) => d.id === on.s2.id) &&
      JSON.stringify(await dishes(on.ev.id)) ===
        JSON.stringify([
          ['Ham', null, null],
          ['Pavlova', `${TAG} i Lunch`, remadeLunch.id],
        ]),
    [removedAway.status, await sessionsShape(on.ev.id), await dishes(on.ev.id)]
  );

  const offEv = await planEvent('j');
  const offShape = await sessionsShape(offEv.ev.id);
  const putOff = await withSwitch(undefined, () =>
    txDo((tx) => putAwayPlan(tx, offEv.ev.id, host.person.id))
  );
  check(
    'I5',
    'switch off, put away: as before GTC-478 — no team, no item, no session (and so no absence row)',
    putOff === true &&
      (await prisma.team.count({ where: { eventId: offEv.ev.id } })) === 0 &&
      (await prisma.day.count({ where: { eventId: offEv.ev.id } })) === 0 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: offEv.pe.id } })) === 0
  );
  await withSwitch(undefined, () => txDo((tx) => bringBackPlan(tx, offEv.ev.id, host.person.id)));
  const offBack = await daysOf(offEv.ev.id);
  check(
    'I6',
    'switch off, bring back: as before — the sessions made again from the saved plan (new ids), names, dates and places as saved, Pavlova on Lunch',
    JSON.stringify(await sessionsShape(offEv.ev.id)) === JSON.stringify(offShape) &&
      offBack.every((d) => d.id !== offEv.s1.id && d.id !== offEv.s2.id) &&
      JSON.stringify((await dishes(offEv.ev.id)).map((d) => [d[0], d[1]])) ===
        JSON.stringify([
          ['Ham', null],
          ['Pavlova', `${TAG} j Lunch`],
        ]),
    [await sessionsShape(offEv.ev.id), await dishes(offEv.ev.id)]
  );

  // ══ W — a no-session event and a one-session event ════════════════════════════════════════
  section('W — a no-session event and a one-session event are untouched');
  const plain = async (key: string, withSession: boolean) => {
    const ev = await newEvent(key, host.person.id);
    await role(host.user.id, ev.id, 'HOST');
    const team = await prisma.team.create({
      data: { name: `${TAG} ${key} Mains`, eventId: ev.id },
    });
    const s = withSession
      ? await prisma.day.create({
          data: { name: `${TAG} ${key} the day`, date: utcDay('2026-12-25'), eventId: ev.id },
        })
      : null;
    await prisma.item.create({ data: { name: 'Salad', teamId: team.id, dayId: s?.id ?? null } });
    return { ev, s };
  };
  const none = await plain('n', false);
  const g = [
    await withSwitch(undefined, () =>
      call(days, 'GET', daysUrl(none.ev.id), P(none.ev.id), host.token)
    ),
    await withSwitch('on', () => call(days, 'GET', daysUrl(none.ev.id), P(none.ev.id), host.token)),
  ];
  for (const v of [undefined, 'on'] as const) {
    await withSwitch(v, () => txDo((tx) => putAwayPlan(tx, none.ev.id, host.person.id)));
    await withSwitch(v, () => txDo((tx) => bringBackPlan(tx, none.ev.id, host.person.id)));
  }
  check(
    'W1',
    'no sessions: GET answers [] with the switch off and on; put away and brought back both ways, it never gains a session or an absence row, and its dish comes back for the whole event',
    g.every((r) => r.status === 200 && JSON.stringify(r.json) === '{"days":[]}') &&
      (await prisma.day.count({ where: { eventId: none.ev.id } })) === 0 &&
      (await prisma.sessionAbsence.count({ where: { day: { eventId: none.ev.id } } })) === 0 &&
      JSON.stringify(await dishes(none.ev.id)) === JSON.stringify([['Salad', null, null]])
  );
  const single = await plain('m', true);
  const g1 = await withSwitch(undefined, () =>
    call(days, 'GET', daysUrl(single.ev.id), P(single.ev.id), host.token)
  );
  check(
    'W2',
    'one session made the old way: GET answers it alone, as { id, name, date }, exactly the reply before GTC-478',
    g1.status === 200 &&
      JSON.stringify(g1.json) ===
        JSON.stringify({
          days: [{ id: single.s!.id, name: single.s!.name, date: single.s!.date.toISOString() }],
        }),
    g1.json
  );
  await withSwitch(undefined, () => txDo((tx) => putAwayPlan(tx, single.ev.id, host.person.id)));
  await withSwitch(undefined, () => txDo((tx) => bringBackPlan(tx, single.ev.id, host.person.id)));
  check(
    'W3',
    'switch off, put away and brought back: one session again, its name, date and place 0, the dish on it (as before GTC-478)',
    JSON.stringify(await sessionsShape(single.ev.id)) ===
      JSON.stringify([[single.s!.name, '2026-12-25T00:00:00.000Z', 0]]) &&
      JSON.stringify((await dishes(single.ev.id)).map((d) => [d[0], d[1]])) ===
        JSON.stringify([['Salad', single.s!.name]])
  );

  // ══ L — the ledger ═════════════════════════════════════════════════════════════════════════
  section('L — the new ledger lines never ask why');
  const SENT = {
    status: 'CONFIRMING',
    sentAt: new Date('2026-12-01T00:00:00Z'),
    endDate: new Date('2026-12-26T00:00:00Z'),
  } as any;
  check(
    'L1',
    'CREATE_DAY, EDIT_DAY and DELETE_DAY on a sent event: no trigger',
    (['CREATE_DAY', 'EDIT_DAY', 'DELETE_DAY'] as const).every(
      (action) =>
        whyTrigger({ action: action as any, targetType: 'Day' as any, targetId: 'd' }, SENT) ===
        null
    )
  );

  // ══ Z — the run ════════════════════════════════════════════════════════════════════════════
  section('Z — nothing sent');
  const sentAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  check(
    'Z1',
    'the OutboundMessage and InviteEvent counts are as found: nothing was sent',
    JSON.stringify(sentAfter) === JSON.stringify(sentBefore),
    [sentBefore, sentAfter]
  );
  return startCounts;
}

let startCounts: Record<string, number> | null = null;
main()
  .then((c) => {
    startCounts = c;
  })
  .catch((e) => {
    check('FATAL', `the run threw: ${(e as Error).message}`, false);
  })
  .finally(async () => {
    standDown();
    delete process.env[VAR];
    try {
      await cleanUp();
    } catch (e) {
      check('Z2-clean', `the clean-up threw: ${(e as Error).message}`, false);
    }
    section('Z — every row this run made is gone, and every table is as found');
    const left = [
      await prisma.event.count({ where: { id: { in: made.events } } }),
      await prisma.person.count({ where: { id: { in: made.people } } }),
      await prisma.user.count({ where: { id: { in: made.users } } }),
      await prisma.day.count({ where: { name: { startsWith: TAG } } }),
    ];
    check(
      'Z2',
      'every event, person, user and session this run made is gone, by id',
      left.every((n) => n === 0),
      left
    );
    if (startCounts) {
      const end = await tableCounts();
      const moved = Object.keys({ ...startCounts, ...end }).filter(
        (k) => startCounts![k] !== end[k]
      );
      check(
        'Z3',
        "every table's count is back to the start",
        moved.length === 0,
        moved.map((k) => `${k} ${startCounts![k]} -> ${end[k]}`)
      );
    } else {
      check(
        'Z3',
        "every table's count is back to the start (the run did not reach its first count)",
        false
      );
    }
    if (left.every((n) => n === 0)) fs.rmSync(FIXTURE_FILE, { force: true });
    else console.log(`    the fixture ids are kept in ${FIXTURE_FILE}`);
    console.log(`\n${passed} passed, ${failed} failed`);
    await prisma.$disconnect();
    process.exit(failed === 0 ? 0 : 1);
  });
