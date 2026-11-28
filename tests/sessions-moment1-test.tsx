/**
 * [[GTC-479]] — MOMENT 1'S SESSIONS CARD, AND WHO COMES TO WHICH SESSION
 * (`npm run test:sessions-moment1`).
 *
 * The founder's rulings on the plan, 24 Nov 2026 (docs/tickets/GTC-479.md): decision 1, the date
 * rule through one helper (src/lib/sessions/dates.ts), no data change, the three edits to GTC-478's
 * routes; 2, the card on every event while the switch is on; 3, empty, with "Add one session for
 * each date" on events over 2 to 14 dates; 4, named people choose, kids without jobs come with their
 * household; 5, the dish warning, nothing about the dish changes; 6, the words as listed.
 *
 *   H  the date helper, on both stored forms
 *   G  GTC-478's three routes read dates by the rule (an event with both forms on one day)
 *   O  switch OFF: the new address answers 404 to both methods and touches nothing
 *   R  the GET: sessions by the rule, dates as YYYY-MM-DD, households, marks of this event only
 *   A  the PUT: one mark per person per session, the belongs-to-this-event check, the dish warning
 *   K  the words, exactly as ruled; never remind or chase
 *   U  the screens: off draws nothing and asks nothing; on, the card and "Coming to"
 *   L  the new ledger line never asks why
 *   Z  nothing sent; every row this run made removed by id; every table's count as found
 *
 * HOW THE ROUTES ARE CALLED. In this process, as the real route handlers, with real Users,
 * Sessions and EventRoles; the one stand-in is the cookie reader (tests/helpers/session-stand-in.ts,
 * as tests/sessions-foundation-test.ts). The switch is set for this process only, call by call.
 * The screens are drawn on the server (renderToStaticMarkup), where no effect runs.
 *
 * SAFETY. Writes only its own rows (names start with the run's TAG). Every id is written to the
 * fixture file BEFORE the row is used, and removed by id in `finally`, however the run ends. Nothing
 * here can send. No server, no browser.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-moment1-test.tsx
 */
import './helpers/session-stand-in';
import { actAs, actAsNobody, standDown } from './helpers/session-stand-in';
import { prisma } from '../src/lib/prisma';
import { NextRequest } from 'next/server';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'child_process';
import { randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { whyTrigger } from '../src/lib/ledger';
import Moment1Summary from '../src/components/plan/Moment1Summary';

const ROOT = path.join(__dirname, '..');
const BASE = '3d74d6d'; // origin/main when GTC-479 began (the merge of GTC-478)
const TAG = `S479${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC479_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc479-sessions-${TAG}.json`);

let passed = 0;
let failed = 0;
function check(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 600)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) =>
  fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : '';

// ── The fixture file: every id, written before the row is used ──────────────────────────────
const made: Record<'users' | 'people' | 'events', string[]> = { users: [], people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}

// ── The modules, loaded if they exist (at the tests-first commit the new ones do not) ────────
const F = {
  dates: 'src/lib/sessions/dates.ts',
  words: 'src/lib/sessions/card-words.ts',
  route: 'src/app/api/events/[id]/sessions/route.ts',
  layout: 'src/app/plan/[eventId]/setup/layout.tsx',
  sw: 'src/components/sessions/SessionsSwitch.tsx',
  card: 'src/components/sessions/Moment1Sessions.tsx',
  coming: 'src/components/sessions/ComingTo.tsx',
  summary: 'src/components/plan/Moment1Summary.tsx',
  setup: 'src/app/plan/[eventId]/setup/page.tsx',
  days: 'src/app/api/events/[id]/days/route.ts',
  one: 'src/app/api/events/[id]/days/[dayId]/route.ts',
};
async function load(rel: string): Promise<any> {
  try {
    return await import(`../${rel.replace(/\.tsx?$/, '')}`);
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
const on = <T,>(fn: () => Promise<T>) => withSwitch('on', fn);

const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
/** NZ midnight of a summer date (NZDT, UTC+13): the seed's form. */
const nzMidnight = (s: string) => new Date(new Date(`${s}T00:00:00.000Z`).getTime() - 13 * 36e5);

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
  const { events, people, users } = made;
  // Events first: their sessions, marks, households, teams, items, assignments, people-on-event,
  // roles and ledger rows go with them. Then the ledger rows naming our people, the people, users.
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

const html = (el: any): string => {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    return `THREW ${(e as Error).message}`;
  }
};

async function main() {
  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  const D = await load(F.dates);
  const W = await load(F.words);
  const route = await load(F.route);
  const SW = await load(F.sw);
  const CARD = await load(F.card);
  const COMING = await load(F.coming);
  const days = await load(F.days);
  const one = await load(F.one);

  // ══ H — the date helper ═══════════════════════════════════════════════════════════════════
  section('H — the date helper reads both stored forms as the same NZ date');
  const key = (d: Date | string) =>
    typeof D?.sessionDateKey === 'function' ? D.sessionDateKey(d) : null;
  check(
    'H1',
    'NZ midnight of 25 Dec (24 Dec 11:00 UTC) and midnight UTC of 25 Dec both read 2026-12-25',
    key(nzMidnight('2026-12-25')) === '2026-12-25' &&
      key(utcDay('2026-12-25')) === '2026-12-25' &&
      key('2026-12-24T11:00:00.000Z') === '2026-12-25',
    [key(nzMidnight('2026-12-25')), key(utcDay('2026-12-25'))]
  );
  check(
    'H2',
    'in NZ winter too (UTC+12): NZ midnight of 1 Jul and midnight UTC of 1 Jul both read 2026-07-01',
    key('2026-06-30T12:00:00.000Z') === '2026-07-01' && key(utcDay('2026-07-01')) === '2026-07-01'
  );
  const words = (k: string) =>
    typeof D?.sessionDateWords === 'function' ? D.sessionDateWords(k) : null;
  check(
    'H3',
    'a date\'s words: "Thu 24 Dec", "Fri 25 Dec", "Sat 26 Dec", "Fri 1 Jan"',
    words('2026-12-24') === 'Thu 24 Dec' &&
      words('2026-12-25') === 'Fri 25 Dec' &&
      words('2026-12-26') === 'Sat 26 Dec' &&
      words('2027-01-01') === 'Fri 1 Jan',
    [words('2026-12-24'), words('2027-01-01')]
  );
  const from = (a: string, b: string) =>
    typeof D?.datesFrom === 'function' ? D.datesFrom(a, b) : null;
  check(
    'H4',
    'the dates of an event: 24 to 26 Dec is three; one day is one; an end before its start is none',
    JSON.stringify(from('2026-12-24', '2026-12-26')) ===
      JSON.stringify(['2026-12-24', '2026-12-25', '2026-12-26']) &&
      JSON.stringify(from('2026-12-31', '2027-01-01')) ===
        JSON.stringify(['2026-12-31', '2027-01-01']) &&
      JSON.stringify(from('2026-12-25', '2026-12-25')) === JSON.stringify(['2026-12-25']) &&
      JSON.stringify(from('2026-12-26', '2026-12-25')) === '[]'
  );
  const mixed = [
    { id: 'c', date: utcDay('2026-12-25'), displayOrder: 0 },
    { id: 'b', date: nzMidnight('2026-12-25'), displayOrder: 1 },
    { id: 'a', date: utcDay('2026-12-26'), displayOrder: 0 },
    { id: 'd', date: nzMidnight('2026-12-24'), displayOrder: 9 },
  ];
  const sorted = typeof D?.sortSessions === 'function' ? D.sortSessions(mixed) : null;
  check(
    'H5',
    'the sort: by the NZ date, then place, then id — two forms on 25 Dec keep their places',
    JSON.stringify(sorted?.map((s: any) => s.id)) === JSON.stringify(['d', 'c', 'b', 'a']),
    sorted?.map((s: any) => s.id)
  );
  const importsOf = (t: string) => t.match(/^\s*import\b/gm)?.length ?? 0;
  check(
    'H6',
    'dates.ts and card-words.ts import nothing (pure: the routes, the card and the tests read one rule)',
    read(F.dates).length > 0 &&
      read(F.words).length > 0 &&
      importsOf(read(F.dates)) === 0 &&
      importsOf(read(F.words)) === 0
  );

  // ── Fixtures ───────────────────────────────────────────────────────────────────────────────
  const expiresAt = new Date(Date.now() + 864e5);
  const signIn = async (k: string) => {
    const user = await prisma.user.create({
      data: { email: `${TAG}-${k}@example.com`.toLowerCase() },
    });
    note('users', user.id);
    const person = await prisma.person.create({
      data: { name: `${TAG} ${k}`, email: user.email, userId: user.id },
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

  const newEvent = async (k: string, hostPersonId: string, start: string, end: string) => {
    const id = `${TAG.toLowerCase()}${k}`;
    note('events', id);
    return prisma.event.create({
      data: {
        id,
        name: `${TAG} ${k}`,
        startDate: utcDay(start),
        endDate: utcDay(end),
        status: 'DRAFT',
        hostId: hostPersonId,
      },
    });
  };
  const role = (userId: string, eventId: string, r: 'HOST' | 'COHOST' | 'COORDINATOR') =>
    prisma.eventRole.create({ data: { userId, eventId, role: r } });
  const person = async (name: string) => {
    const p = await prisma.person.create({ data: { name: `${TAG} ${name}` } });
    note('people', p.id);
    return p;
  };

  const A = await newEvent('a', host.person.id, '2026-12-24', '2026-12-26');
  const B = await newEvent('b', host.person.id, '2026-12-24', '2026-12-26');
  await role(host.user.id, A.id, 'HOST');
  await role(cohost.user.id, A.id, 'COHOST');
  await role(coord.user.id, A.id, 'COORDINATOR');
  await role(host.user.id, B.id, 'HOST');

  // Event A: two households. Sam's: Sam (main contact), Alex (partner), Jo (a kid with a job),
  // Lee (a guest), and two kids without jobs. Pat's: Pat alone.
  const [sam, alex, jo, lee, pat, bea] = [
    await person('Sam'),
    await person('Alex'),
    await person('Jo'),
    await person('Lee'),
    await person('Pat'),
    await person('Bea'),
  ];
  const hhSam = await prisma.household.create({ data: { eventId: A.id, littleCount: 2 } });
  const hhPat = await prisma.household.create({ data: { eventId: A.id } });
  const member = (
    personId: string,
    eventId: string,
    householdId: string,
    householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD',
    isYoungPerson = false
  ) =>
    prisma.personEvent.create({
      data: { personId, eventId, householdId, householdRole, isYoungPerson },
    });
  // Made out of order on purpose, so the listed order is the route's, not the order made.
  const peLee = await member(lee.id, A.id, hhSam.id, 'GUEST');
  const peJo = await member(jo.id, A.id, hhSam.id, 'CHILD', true);
  const peAlex = await member(alex.id, A.id, hhSam.id, 'PARTNER');
  const peSam = await member(sam.id, A.id, hhSam.id, 'PRIMARY_CONTACT');
  const pePat = await member(pat.id, A.id, hhPat.id, 'PRIMARY_CONTACT');
  // Event B: Bea's household, and Sam on B too (the same person, another event's row).
  const hhBea = await prisma.household.create({ data: { eventId: B.id } });
  const peBea = await member(bea.id, B.id, hhBea.id, 'PRIMARY_CONTACT');
  const peSamOnB = await prisma.personEvent.create({ data: { personId: sam.id, eventId: B.id } });

  const lunch = await prisma.day.create({
    data: { name: `${TAG} Christmas lunch`, date: utcDay('2026-12-25'), eventId: A.id },
  });
  const dinner = await prisma.day.create({
    data: {
      name: `${TAG} Boxing Day dinner`,
      date: utcDay('2026-12-26'),
      eventId: A.id,
      displayOrder: 1,
    },
  });
  const sessionB = await prisma.day.create({
    data: { name: `${TAG} B lunch`, date: utcDay('2026-12-25'), eventId: B.id },
  });
  const markB = await prisma.sessionAbsence.create({
    data: { personEventId: peBea.id, dayId: sessionB.id },
  });

  const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: A.id } });
  const item = (name: string, dayId: string | null) =>
    prisma.item.create({ data: { name, teamId: team.id, dayId } });
  const pavlova = await item('pavlova', lunch.id);
  const ham = await item('ham', lunch.id);
  const salad = await item('salad', null);
  const trifle = await item('trifle', dinner.id);
  for (const it of [pavlova, ham, salad]) {
    await prisma.assignment.create({ data: { itemId: it.id, personId: sam.id } });
  }
  await prisma.assignment.create({ data: { itemId: trifle.id, personId: pat.id } });

  const url = (e: string) => `/api/events/${e}/sessions`;
  const P = (e: string) => ({ id: e });
  const marksOn = (eventId: string) =>
    prisma.sessionAbsence.findMany({
      where: { day: { eventId } },
      orderBy: { id: 'asc' },
      select: { personEventId: true, dayId: true },
    });
  const lines = (targetId: string) =>
    prisma.auditEntry.count({ where: { targetId, actionType: 'EDIT_ATTENDANCE' } });
  const ledgerOn = (ids: string[]) => prisma.auditEntry.count({ where: { eventId: { in: ids } } });

  // ══ G — GTC-478's three routes read dates by the rule ═════════════════════════════════════
  section("G — GTC-478's routes on an event with both stored forms on one day");
  const M = await newEvent('m', host.person.id, '2026-12-24', '2026-12-26');
  await role(host.user.id, M.id, 'HOST');
  // The seed's form: 25 Dec at NZ midnight, place 0. Then a session made through the route.
  const old = await prisma.day.create({
    data: { name: `${TAG} m Christmas Day`, date: nzMidnight('2026-12-25'), eventId: M.id },
  });
  const made1 = await on(() =>
    call(days, 'POST', `/api/events/${M.id}/days`, P(M.id), host.token, {
      name: `${TAG} m Dinner`,
      date: '2026-12-25',
    })
  );
  const dinnerM =
    made1.status === 201 && typeof made1.json?.day?.id === 'string'
      ? made1.json.day.id
      : (
          await prisma.day.create({
            data: {
              name: `${TAG} m Dinner`,
              date: utcDay('2026-12-25'),
              eventId: M.id,
              displayOrder: 1,
            },
          })
        ).id;
  const reorder = await on(() =>
    call(days, 'PUT', `/api/events/${M.id}/days`, P(M.id), host.token, {
      dayIds: [dinnerM, old.id],
    })
  );
  check(
    'G1',
    'PUT /days: Dinner (midnight UTC) before Christmas Day (NZ midnight), the same NZ date, is accepted (200)',
    reorder.status === 200 &&
      JSON.stringify(reorder.json?.days?.map((d: any) => d.id)) ===
        JSON.stringify([dinnerM, old.id]),
    reorder
  );
  const getM = await call(days, 'GET', `/api/events/${M.id}/days`, P(M.id), host.token);
  check(
    'G2',
    'GET /days: in their places on that date (Dinner first), each as { id, name, date } only, the dates as stored',
    getM.status === 200 &&
      JSON.stringify(getM.json?.days?.map((d: any) => d.id)) ===
        JSON.stringify([dinnerM, old.id]) &&
      getM.json.days.every(
        (d: any) => JSON.stringify(Object.keys(d).sort()) === '["date","id","name"]'
      ) &&
      getM.json.days[1].date === nzMidnight('2026-12-25').toISOString(),
    getM.json
  );
  const oldBefore = await prisma.day.findUnique({ where: { id: old.id } });
  const linesBefore = await prisma.auditEntry.count({
    where: { targetId: old.id, actionType: 'EDIT_DAY' },
  });
  const same = await on(() =>
    call(
      one,
      'PATCH',
      `/api/events/${M.id}/days/${old.id}`,
      { id: M.id, dayId: old.id },
      host.token,
      {
        date: '2026-12-25',
      }
    )
  );
  const oldAfter = await prisma.day.findUnique({ where: { id: old.id } });
  check(
    'G3',
    'PATCH the NZ-midnight session to its own date, 2026-12-25: 200, not a change — date and place kept, no EDIT_DAY line',
    same.status === 200 &&
      oldAfter?.date.getTime() === oldBefore?.date.getTime() &&
      oldAfter?.displayOrder === oldBefore?.displayOrder &&
      (await prisma.auditEntry.count({ where: { targetId: old.id, actionType: 'EDIT_DAY' } })) ===
        linesBefore,
    [same.status, oldBefore, oldAfter]
  );
  const moved = await on(() =>
    call(
      one,
      'PATCH',
      `/api/events/${M.id}/days/${old.id}`,
      { id: M.id, dayId: old.id },
      host.token,
      {
        date: '2026-12-26',
      }
    )
  );
  check(
    'G4',
    'CONTROL: the same session to 2026-12-26 is a change: 200, stored at midnight UTC of 26 Dec',
    moved.status === 200 &&
      (await prisma.day.findUnique({ where: { id: old.id } }))?.date.toISOString() ===
        utcDay('2026-12-26').toISOString(),
    moved
  );

  // ══ O — switch off ════════════════════════════════════════════════════════════════════════
  section('O — switch OFF: the new address answers 404 to both methods and touches nothing');
  const marksA0 = JSON.stringify(await marksOn(A.id));
  const ledgerA0 = await ledgerOn([A.id, B.id]);
  const offGet = await call(route, 'GET', url(A.id), P(A.id), host.token);
  const offPut = await call(route, 'PUT', url(A.id), P(A.id), host.token, {
    personEventId: pePat.id,
    dayId: dinner.id,
    coming: false,
  });
  const offOn = await withSwitch('ON', () =>
    call(route, 'PUT', url(A.id), P(A.id), host.token, {
      personEventId: pePat.id,
      dayId: dinner.id,
      coming: false,
    })
  );
  check(
    'O1',
    'GET and PUT answer 404 with the switch unset, and PUT 404 with "ON" (only "on" counts); no body',
    offGet.status === 404 &&
      offPut.status === 404 &&
      offOn.status === 404 &&
      offGet.json === null &&
      offPut.json === null,
    [offGet, offPut, offOn]
  );
  check(
    'O2',
    'nothing written: the marks and the ledger as they were',
    JSON.stringify(await marksOn(A.id)) === marksA0 && (await ledgerOn([A.id, B.id])) === ledgerA0
  );

  // ══ R — the GET ═══════════════════════════════════════════════════════════════════════════
  section('R — the GET: sessions by the rule, households, the marks of this event only');
  const g = await on(() => call(route, 'GET', url(A.id), P(A.id), host.token));
  check(
    'R1',
    'the host: 200; the sessions in order with their dates as YYYY-MM-DD; the event 2026-12-24 to 2026-12-26',
    g.status === 200 &&
      JSON.stringify(g.json?.sessions) ===
        JSON.stringify([
          { id: lunch.id, name: lunch.name, date: '2026-12-25', displayOrder: 0 },
          { id: dinner.id, name: dinner.name, date: '2026-12-26', displayOrder: 1 },
        ]) &&
      JSON.stringify(g.json?.eventDates) ===
        JSON.stringify({ start: '2026-12-24', end: '2026-12-26' }),
    g.json
  );
  check(
    'R2',
    "the households: Sam's lists Sam, Alex, Jo (a kid with a job), Lee (a guest), two kids without jobs; Pat's lists Pat",
    JSON.stringify(g.json?.households) ===
      JSON.stringify([
        {
          id: hhSam.id,
          title: sam.name,
          littleCount: 2,
          people: [
            { personEventId: peSam.id, name: sam.name, kind: 'adult' },
            { personEventId: peAlex.id, name: alex.name, kind: 'adult' },
            { personEventId: peJo.id, name: jo.name, kind: 'kid' },
            { personEventId: peLee.id, name: lee.name, kind: 'guest' },
          ],
        },
        {
          id: hhPat.id,
          title: pat.name,
          littleCount: 0,
          people: [{ personEventId: pePat.id, name: pat.name, kind: 'adult' }],
        },
      ]),
    g.json?.households
  );
  check(
    'R3',
    "no marks yet on A, and event B's mark is not shown",
    Array.isArray(g.json?.absences) && g.json.absences.length === 0,
    g.json?.absences
  );
  const gCo = await on(() => call(route, 'GET', url(A.id), P(A.id), cohost.token));
  const gCoord = await on(() => call(route, 'GET', url(A.id), P(A.id), coord.token));
  const gNobody = await on(() => call(route, 'GET', url(A.id), P(A.id), null));
  const gStranger = await on(() => call(route, 'GET', url(A.id), P(A.id), stranger.token));
  check(
    'R4',
    'the co-host 200; a coordinator of the event 403; no session 401; a stranger 403',
    gCo.status === 200 &&
      gCoord.status === 403 &&
      gNobody.status === 401 &&
      gStranger.status === 403,
    [gCo.status, gCoord.status, gNobody.status, gStranger.status]
  );
  const gM = await on(() => call(route, 'GET', url(M.id), P(M.id), host.token));
  check(
    'R5',
    'by the rule on the mixed event: the NZ-midnight session read as its NZ date',
    gM.status === 200 &&
      gM.json?.sessions?.some((s: any) => s.id === old.id && s.date === '2026-12-26') &&
      gM.json?.sessions?.some((s: any) => s.id === dinnerM && s.date === '2026-12-25'),
    gM.json?.sessions
  );

  // ══ A — the PUT ═══════════════════════════════════════════════════════════════════════════
  section('A — the PUT: one person, one session, coming or not');
  const put = (as: string | null, body: unknown, ev = A.id) =>
    on(() => call(route, 'PUT', url(ev), P(ev), as, body));
  const a1 = await put(host.token, { personEventId: pePat.id, dayId: lunch.id, coming: false });
  check(
    'A1',
    'Pat not at lunch (no dish there): 200; one mark; one EDIT_ATTENDANCE line, coming → not coming',
    a1.status === 200 &&
      JSON.stringify(a1.json) ===
        JSON.stringify({ personEventId: pePat.id, dayId: lunch.id, coming: false }) &&
      JSON.stringify(await marksOn(A.id)) ===
        JSON.stringify([{ personEventId: pePat.id, dayId: lunch.id }]) &&
      (await lines(pePat.id)) === 1 &&
      (await prisma.auditEntry
        .findFirst({
          where: { targetId: pePat.id, actionType: 'EDIT_ATTENDANCE' },
          select: { field: true, before: true, after: true, targetType: true },
        })
        .then((r) => JSON.stringify(r))) ===
        JSON.stringify({
          field: `session:${lunch.id}`,
          before: 'coming',
          after: 'not coming',
          targetType: 'PersonEvent',
        }),
    a1
  );
  const a2 = await put(host.token, { personEventId: pePat.id, dayId: lunch.id, coming: false });
  check(
    'A2',
    'the same again: 200, still one mark, no second line (one mark per person per session)',
    a2.status === 200 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: pePat.id } })) === 1 &&
      (await lines(pePat.id)) === 1
  );
  const gMarks = await on(() => call(route, 'GET', url(A.id), P(A.id), host.token));
  check(
    'R6',
    "the GET now shows Pat's mark, and only A's",
    JSON.stringify(gMarks.json?.absences) ===
      JSON.stringify([{ personEventId: pePat.id, dayId: lunch.id }]),
    gMarks.json?.absences
  );
  const a3 = await put(cohost.token, { personEventId: pePat.id, dayId: lunch.id, coming: true });
  check(
    'A3',
    'the co-host: Pat coming to lunch again: 200; the mark gone; a second line, not coming → coming',
    a3.status === 200 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: pePat.id } })) === 0 &&
      (await lines(pePat.id)) === 2
  );
  const a4 = await put(host.token, { personEventId: pePat.id, dayId: lunch.id, coming: true });
  check(
    'A4',
    'coming when already coming: 200, nothing written',
    a4.status === 200 && (await lines(pePat.id)) === 2
  );

  const samBefore = await prisma.item.findMany({
    where: { teamId: team.id },
    orderBy: { name: 'asc' },
    select: { name: true, dayId: true, assignment: { select: { personId: true } } },
  });
  const warn = await put(host.token, { personEventId: peSam.id, dayId: lunch.id, coming: false });
  const W_ = W?.COMING_WORDS;
  check(
    'A5',
    'Sam not at lunch, down for the ham and the pavlova there: 409, the dishes, the warning word for word; nothing written',
    warn.status === 409 &&
      warn.json?.code === 'HOLDS_DISHES' &&
      JSON.stringify(warn.json?.dishes) === JSON.stringify(['ham', 'pavlova']) &&
      warn.json?.error ===
        `${sam.name} is down to bring the ham and the pavlova to ${lunch.name}. Mark ${sam.name} as not coming to ${lunch.name} anyway? Nothing changes about the dish.` &&
      (typeof W_?.dishWarning === 'function'
        ? warn.json?.error === W_.dishWarning(sam.name, ['ham', 'pavlova'], lunch.name)
        : false) &&
      (await prisma.sessionAbsence.count({ where: { personEventId: peSam.id } })) === 0 &&
      (await lines(peSam.id)) === 0,
    warn
  );
  const warnAgain = await put(host.token, {
    personEventId: peSam.id,
    dayId: lunch.id,
    coming: false,
    despiteDishes: 'yes',
  });
  check(
    'A6',
    'despiteDishes must be exactly true: "yes" still warns, 409, nothing written',
    warnAgain.status === 409 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: peSam.id } })) === 0
  );
  const anyway = await put(host.token, {
    personEventId: peSam.id,
    dayId: lunch.id,
    coming: false,
    despiteDishes: true,
  });
  const samAfter = await prisma.item.findMany({
    where: { teamId: team.id },
    orderBy: { name: 'asc' },
    select: { name: true, dayId: true, assignment: { select: { personId: true } } },
  });
  check(
    'A7',
    '"Mark as not coming" (despiteDishes true): 200, the mark, one line; nothing about any dish changed',
    anyway.status === 200 &&
      (await prisma.sessionAbsence.count({
        where: { personEventId: peSam.id, dayId: lunch.id },
      })) === 1 &&
      (await lines(peSam.id)) === 1 &&
      JSON.stringify(samAfter) === JSON.stringify(samBefore),
    [anyway, samAfter]
  );
  const noWarn = await put(host.token, {
    personEventId: peSam.id,
    dayId: dinner.id,
    coming: false,
  });
  check(
    'A8',
    "Sam not at dinner: no warning (the salad is for the whole event; the trifle is Pat's): 200",
    noWarn.status === 200 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: peSam.id } })) === 2
  );
  const kid = await put(host.token, { personEventId: peJo.id, dayId: dinner.id, coming: false });
  check(
    'A9',
    'a kid with a job chooses for themselves: Jo not at dinner, 200, one mark',
    kid.status === 200 &&
      (await prisma.sessionAbsence.count({ where: { personEventId: peJo.id } })) === 1
  );

  const marksA = JSON.stringify(await marksOn(A.id));
  const marksBNow = JSON.stringify(await marksOn(B.id));
  const ledgerAB = await ledgerOn([A.id, B.id]);
  const unchanged = async () =>
    JSON.stringify(await marksOn(A.id)) === marksA &&
    JSON.stringify(await marksOn(B.id)) === marksBNow &&
    (await ledgerOn([A.id, B.id])) === ledgerAB;
  const W2 = W?.ATTENDANCE_WORDS;
  const bad = [
    await put(host.token, { personEventId: peBea.id, dayId: lunch.id, coming: false }),
    await put(host.token, { personEventId: peSamOnB.id, dayId: lunch.id, coming: false }),
    await put(host.token, { personEventId: pePat.id, dayId: sessionB.id, coming: false }),
    await put(host.token, { personEventId: pePat.id, dayId: lunch.id, coming: false }, B.id),
    await put(host.token, { personEventId: peBea.id, dayId: sessionB.id, coming: true }, A.id),
  ];
  check(
    'A10',
    "the belongs-to-this-event check: B's person, Sam's row on B, B's session, A's ids at B's address, B's ids at A's: each 400",
    bad.every((r) => r.status === 400) &&
      bad[0].json?.error === W2?.personNotOnEvent &&
      bad[1].json?.error === 'That person is not on this event' &&
      bad[2].json?.error === 'That session is not on this event' &&
      bad[3].json?.error === 'That person is not on this event' &&
      bad[4].json?.error === 'That person is not on this event',
    bad.map((r) => [r.status, r.json?.error])
  );
  check(
    'A11',
    'and nothing written on either event: marks and ledger as they were',
    await unchanged()
  );
  const shape = [
    await put(host.token, { personEventId: pePat.id, dayId: lunch.id }),
    await put(host.token, { personEventId: pePat.id, dayId: lunch.id, coming: 'false' }),
    await put(host.token, { dayId: lunch.id, coming: false }),
    await put(host.token, { personEventId: pePat.id, coming: false }),
    await put(host.token, ['not', 'an', 'object']),
  ];
  check(
    'A12',
    'the input: no coming, "false" as text, no person, no session, a list: each 400 with its words, nothing written',
    shape.every((r) => r.status === 400) &&
      shape[0].json?.error === 'Say whether they are coming to this session' &&
      shape[1].json?.error === 'Say whether they are coming to this session' &&
      shape[2].json?.error === 'That person is not on this event' &&
      shape[3].json?.error === 'That session is not on this event' &&
      shape[4].json?.error === 'That person is not on this event' &&
      (await unchanged()),
    shape.map((r) => [r.status, r.json?.error])
  );
  const who = [
    await put(null, { personEventId: pePat.id, dayId: lunch.id, coming: false }),
    await put(stranger.token, { personEventId: pePat.id, dayId: lunch.id, coming: false }),
    await put(coord.token, { personEventId: pePat.id, dayId: lunch.id, coming: false }),
  ];
  check(
    'A13',
    'no session 401; a stranger 403; a coordinator of the event 403; nothing written',
    who[0].status === 401 && who[1].status === 403 && who[2].status === 403 && (await unchanged()),
    who.map((r) => r.status)
  );
  check(
    'A14',
    "event B's own mark untouched throughout",
    (await prisma.sessionAbsence.findUnique({ where: { id: markB.id } })) !== null
  );
  // A removed session takes its marks (GTC-478's cascade), through the card's route.
  const eve = await prisma.day.create({
    data: { name: `${TAG} Christmas Eve`, date: utcDay('2026-12-24'), eventId: A.id },
  });
  await put(host.token, { personEventId: pePat.id, dayId: eve.id, coming: false });
  const gone = await on(() =>
    call(
      one,
      'DELETE',
      `/api/events/${A.id}/days/${eve.id}`,
      { id: A.id, dayId: eve.id },
      host.token
    )
  );
  check(
    'A15',
    "removing an empty session takes its marks: 200; Pat's Christmas Eve mark gone, the other marks kept",
    gone.status === 200 &&
      (await prisma.sessionAbsence.count({ where: { dayId: eve.id } })) === 0 &&
      JSON.stringify(await marksOn(A.id)) === marksA,
    gone
  );
  const refused = await on(() =>
    call(
      one,
      'DELETE',
      `/api/events/${A.id}/days/${lunch.id}`,
      { id: A.id, dayId: lunch.id },
      host.token
    )
  );
  check(
    'A16',
    "removing lunch, which has items: 409 with GTC-478's words; lunch and its marks kept",
    refused.status === 409 &&
      refused.json?.error ===
        'This session still has items. Move them to another session or to the whole event first.' &&
      (await prisma.day.count({ where: { id: lunch.id } })) === 1 &&
      JSON.stringify(await marksOn(A.id)) === marksA,
    refused
  );

  // ══ K — the words ═════════════════════════════════════════════════════════════════════════
  section('K — the words, exactly as ruled (decision 6)');
  const CW = W?.CARD_WORDS;
  check(
    'K1',
    'the card: every word as ruled',
    !!CW &&
      CW.heading === 'Sessions' &&
      CW.emptyManyDates ===
        'Is this more than one meal? Add a session for each one, like Christmas lunch or Boxing Day dinner. Until you add one, everything is for the whole event.' &&
      CW.emptyOneDay ===
        'Lunch and dinner on the day? Add a session for each. Until you add one, everything is for the whole event.' &&
      CW.fillEachDate === 'Add one session for each date' &&
      CW.add === '+ Add a session' &&
      CW.nameLabel === 'Session name' &&
      CW.dateLabel === 'Date' &&
      CW.namePlaceholder === 'e.g. Christmas lunch' &&
      CW.save === 'Save session' &&
      CW.cancel === 'Cancel' &&
      CW.edit === 'Edit' &&
      CW.remove === 'Remove' &&
      CW.moveUp === 'Move up' &&
      CW.moveDown === 'Move down' &&
      CW.moveUpAloud('Christmas lunch') === 'Move Christmas lunch up' &&
      CW.moveDownAloud('Christmas lunch') === 'Move Christmas lunch down' &&
      CW.outsideDates === "Outside the event's dates" &&
      CW.removeAsk('Christmas lunch') === 'Remove Christmas lunch?' &&
      CW.removeYes === 'Remove' &&
      CW.removeNo === 'Keep it' &&
      CW.saveFailed === "That didn't save. Please try again."
  );
  check(
    'K2',
    '"Who comes to which session": every word as ruled',
    !!W_ &&
      W_.heading === 'Who comes to which session' &&
      W_.line === 'Everyone comes to every session unless you say otherwise.' &&
      W_.every === 'Coming to: every session' &&
      W_.some(['Christmas lunch', 'Boxing Day dinner']) ===
        'Coming to: Christmas lunch, Boxing Day dinner' &&
      W_.differs === 'Coming to: it differs by person' &&
      W_.none === 'Coming to: no sessions' &&
      W_.change === 'Change' &&
      W_.done === 'Done' &&
      W_.littles === 'Kids without jobs come with the household.' &&
      W_.dishWarning('Sam', ['pavlova'], 'Christmas lunch') ===
        'Sam is down to bring the pavlova to Christmas lunch. Mark Sam as not coming to Christmas lunch anyway? Nothing changes about the dish.' &&
      W_.dishWarning('Sam', ['pavlova', 'ham'], 'Christmas lunch').startsWith(
        'Sam is down to bring the pavlova and the ham to Christmas lunch.'
      ) &&
      W_.markAnyway === 'Mark as not coming' &&
      W_.keepComing === 'Keep as coming'
  );
  check(
    'K3',
    "the route's words as ruled",
    W2?.personNotOnEvent === 'That person is not on this event' &&
      W2?.comingMissing === 'Say whether they are coming to this session'
  );
  const NEW = [F.dates, F.words, F.route, F.layout, F.sw, F.card, F.coming];
  const banned = NEW.filter((f) => /\bremind|\bchase/i.test(read(f)));
  check(
    'K4',
    'no new file says remind or chase (the screens say "nudge" when they need a word for it)',
    NEW.every((f) => read(f).length > 0) && banned.length === 0,
    banned
  );

  // ══ U — the screens ═══════════════════════════════════════════════════════════════════════
  section('U — the screens: off draws nothing and asks nothing; on, the card and "Coming to"');
  const summaryProps = {
    eventId: A.id,
    eventName: 'Christmas',
    households: [
      {
        id: 'h1',
        primaryContact: { name: 'Sam', email: 's@example.com' },
        helpers: [],
        littleCount: 0,
        guests: [],
      },
    ],
    onContinue: () => {},
    onBackToEditing: () => {},
  };
  const offHtml = html(createElement(Moment1Summary as any, summaryProps));
  check(
    'U1',
    "Moment 1's summary drawn without the switch: no sessions card, no session words",
    offHtml.length > 0 &&
      !offHtml.startsWith('THREW') &&
      !offHtml.includes('data-sessions-card') &&
      !offHtml.includes('Who comes to which session') &&
      !/\bsession/i.test(offHtml),
    offHtml.slice(0, 200)
  );
  let diff = '';
  try {
    diff = execFileSync('git', ['diff', '--unified=0', BASE, '--', F.summary], {
      cwd: ROOT,
      encoding: 'utf8',
    });
  } catch {
    diff = '';
  }
  const added = diff
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1).trim());
  const removed = diff.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
  check(
    'U2',
    'Moment1Summary.tsx against the base: only the import, a comment and the one line placing the card; nothing removed',
    removed.length === 0 &&
      added.filter((l) => l.length > 0).length === 4 &&
      added.includes("import Moment1Sessions from '@/components/sessions/Moment1Sessions';") &&
      added.includes('<Moment1Sessions eventId={eventId} />') &&
      added.filter((l) => l.startsWith('{/*') || l.endsWith('*/}')).length === 2,
    { added, removed }
  );
  /*
   * ⚠ [[GTC-480]] (24 Nov 2026, the founder's ruling 7 on its plan: "The older pins: moved as you
   * described, the named hunks each required exactly once and the rest byte for byte, with the break
   * proofs"). The setup page gained exactly these eight insertions, 16 lines, so Moments 2 and 3 see
   * each row's session and the page's one item save sends it. Each is named here in full and must
   * occur exactly once; with them taken out the page must still be the base's byte for byte. Any
   * other edit, and any of the eight missing, repeated or changed, still turns U3 red.
   */
  const GTC480_SETUP_ADDED: string[] = [
    [
      "  /** [[GTC-480]] B: the row's session (a Day), already sent by the items route; null: whole event. */",
      '  dayId?: string | null;',
    ].join('\n') + '\n',
    [
      "            // [[GTC-480]] A: the row's session, so Moment 3's tabs and its Details box see it.",
      '            dayId: item.dayId ?? null,',
    ].join('\n') + '\n',
    [
      "    /** [[GTC-480]] B: the row's session, or null for the whole event. */",
      '    dayId?: string | null;',
    ].join('\n') + '\n',
    [
      "          // [[GTC-480]] B: the row's session, so the plan view's tabs and picker see it.",
      '          dayId: item.dayId ?? null,',
    ].join('\n') + '\n',
    [
      "    // [[GTC-480]] B: the row's session (null: the whole event), an ask field, so the why sees it.",
      '    if (updates.dayId !== undefined) body.dayId = updates.dayId;',
    ].join('\n') + '\n',
    [
      '                        // [[GTC-480]] B: a row moved to another session moves tab.',
      '                        ...(updates.dayId !== undefined ? { dayId: updates.dayId } : {}),',
    ].join('\n') + '\n',
    [
      "                // [[GTC-480]] B: the new row's session, when it has one.",
      '                ...(newItem.dayId ? { dayId: newItem.dayId } : {}),',
    ].join('\n') + '\n',
    [
      "              // [[GTC-480]] B: on screen at once on its session's tab.",
      '              dayId: newItem.dayId ?? null,',
    ].join('\n') + '\n',
  ];
  /*
    ⚠ [[GTC-488]] (28 Nov 2026, the founder's word on its plan: "yes to all 13 moves as you describe
    them, each the narrowest way with a dated note naming GTC-487",
    this ticket's number until 28 Nov 2026). GTC-488 changes one line of the
    setup page and adds two (B: Moment 3's row reads "1 tray"), and adds one import. Each of its
    changes, [was, is], must occur exactly once and is taken back first; then GTC-480's insertions
    as before. Still the working folder, still byte for byte.
  */
  const GTC488_SETUP_CHANGES: [string, string][] = [
    [
      "import { shownMarks } from '@/lib/items/dish-marks';\n",
      "import { shownMarks } from '@/lib/items/dish-marks';\nimport { unitWordFor } from '@/lib/items/unit-words';\n",
    ],
    [
      "          const amountAndUnit = [item.quantityAmount ?? '', mapItemUnitToDisplay(item)]\n",
      '          // [[GTC-488]] B: "1 tray", not "1 trays", on Moment 3\'s row and its Details box.\n          const unitWord = unitWordFor(item.quantityAmount, mapItemUnitToDisplay(item));\n          const amountAndUnit = [item.quantityAmount ?? \'\', unitWord]\n',
    ],
  ];
  let setupSame = false;
  try {
    const live = read(F.setup);
    const now = GTC488_SETUP_CHANGES.reduce(
      (out, [was, is]) => (out.split(is).length === 2 ? out.replace(is, () => was) : ''),
      live
    );
    const base = execFileSync('git', ['show', `${BASE}:${F.setup}`], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    setupSame =
      base.length > 1000 &&
      GTC480_SETUP_ADDED.every((hunk) => now.split(hunk).length === 2) &&
      GTC480_SETUP_ADDED.reduce((out, hunk) => out.replace(hunk, ''), now) === base;
  } catch {
    setupSame = false;
  }
  check(
    'U3',
    'the setup page itself is not edited (as the base, byte for byte), but for GTC-480’s eight named insertions and GTC-488’s two named changes, each exactly once',
    setupSame
  );
  const Provider = SW?.SessionsSwitchProvider;
  const Card = CARD?.default;
  const offCard =
    Provider && Card
      ? html(createElement(Provider, { on: false }, createElement(Card, { eventId: A.id })))
      : 'missing';
  const onCardUnread =
    Provider && Card
      ? html(createElement(Provider, { on: true }, createElement(Card, { eventId: A.id })))
      : 'missing';
  const bare = Card ? html(createElement(Card, { eventId: A.id })) : 'missing';
  check(
    'U4',
    'the section: switch off, nothing; with no provider (any other page or test), nothing; on, nothing until its read lands',
    offCard === '' && bare === '' && onCardUnread === '',
    [offCard, bare, onCardUnread]
  );
  const wrapped = Provider
    ? html(createElement(Provider, { on: true }, createElement('b', null, 'x')))
    : '';
  check('U5', 'the switch provider draws no element of its own', wrapped === '<b>x</b>', wrapped);
  const cardSrc = read(F.card);
  const outer = cardSrc.slice(
    cardSrc.indexOf('export default function Moment1Sessions'),
    cardSrc.indexOf('export function SessionsCard')
  );
  check(
    'U6',
    'off asks nothing: the outer component returns before the card (and its read) is ever drawn',
    /const on = useSessionsOn\(\);\s*if \(!on\) return null;\s*return <SessionsCard eventId=\{eventId\} \/>;/.test(
      outer
    ) && !/\bfetch\b|useEffect/.test(outer),
    outer.slice(0, 300)
  );
  const layout = read(F.layout);
  check(
    'U7',
    'the setup layout: connection() first, then the switch read on the server, handed to the page through the provider',
    // ⚠ [[GTC-480]] (24 Nov 2026, the founder's ruling 7 on its plan): inside the switch, the one
    // session plan (Moments 2 and 3's sessions and open tab), and nothing else. The switch is still
    // read on the server, after connection(), and handed to the page through the provider.
    /await connection\(\);\s*return \(\s*<SessionsSwitchProvider on=\{isSessionsOn\(\)\}>\s*<SessionPlanProvider>\{children\}<\/SessionPlanProvider>\s*<\/SessionsSwitchProvider>\s*\);/.test(
      layout
    ),
    layout.slice(-300)
  );
  // [[GTC-479]] fix, 24 Nov 2026 (the founder's standing word on my own new tests): each fetch is
  // matched by its first argument. The first version ran from "fetch(" to the next semicolon, so two
  // calls in one statement (the form's POST and PATCH) read as one and the count was 5, not 6.
  const firstArgs = (src: string) =>
    [...src.matchAll(/\bfetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  const fetchesCard = firstArgs(cardSrc);
  const fetchesComing = firstArgs(read(F.coming));
  const ALLOWED_CARD = [
    '`/api/events/${eventId}/sessions`',
    'daysUrl',
    '`${daysUrl}/${at}`',
    '`${daysUrl}/${id}`',
  ];
  check(
    'U8',
    'the card asks only its own route and GTC-478\'s session routes; "Coming to" only PUT /sessions',
    fetchesCard.length === 6 &&
      fetchesCard.every((f) => ALLOWED_CARD.includes(f)) &&
      fetchesComing.length === 1 &&
      fetchesComing[0] === '`/api/events/${eventId}/sessions`' &&
      /method: 'PUT'/.test(read(F.coming)),
    { fetchesCard, fetchesComing }
  );

  const SessionsCard = CARD?.SessionsCard;
  const draw = (initial: any) =>
    SessionsCard ? html(createElement(SessionsCard, { eventId: A.id, initial })) : 'missing';
  const st = (
    sessions: any[],
    start: string,
    end: string,
    households: any[] = [],
    absences: any[] = []
  ) => ({
    sessions,
    eventDates: { start, end },
    households,
    absences,
  });
  const esc = (s: string) => s.replace(/'/g, '&#x27;').replace(/"/g, '&quot;');
  const emptyMany = draw(st([], '2026-12-24', '2026-12-26'));
  check(
    'U9',
    'empty, over three dates: the heading, the many-dates line, "Add one session for each date", "+ Add a session"',
    emptyMany.includes('>Sessions<') &&
      emptyMany.includes(esc(CW?.emptyManyDates ?? '?')) &&
      emptyMany.includes('>Add one session for each date<') &&
      emptyMany.includes('>+ Add a session<') &&
      !emptyMany.includes(esc(CW?.emptyOneDay ?? '?')) &&
      !emptyMany.includes('Who comes to which session'),
    emptyMany.slice(0, 400)
  );
  const emptyOne = draw(st([], '2026-12-25', '2026-12-25'));
  check(
    'U10',
    'empty, a one-day event (decision 2, the card on every event): the one-day line and "+ Add a session", no fill',
    emptyOne.includes(esc(CW?.emptyOneDay ?? '?')) &&
      emptyOne.includes('>+ Add a session<') &&
      !emptyOne.includes('Add one session for each date'),
    emptyOne.slice(0, 400)
  );
  const fourteen = draw(st([], '2026-12-01', '2026-12-14'));
  const fifteen = draw(st([], '2026-12-01', '2026-12-15'));
  check(
    'U11',
    'decision 3: the fill offered over 14 dates, not over 15',
    fourteen.includes('Add one session for each date') &&
      !fifteen.includes('Add one session for each date') &&
      fifteen.includes('>+ Add a session<')
  );
  const three = [
    { id: 's1', name: 'Christmas lunch', date: '2026-12-25', displayOrder: 0 },
    { id: 's2', name: 'Christmas dinner', date: '2026-12-25', displayOrder: 1 },
    { id: 's3', name: 'Boxing Day picnic', date: '2026-12-27', displayOrder: 2 },
  ];
  const threeHtml = draw(st(three, '2026-12-24', '2026-12-26'));
  const rowOf = (id: string) => {
    const at = threeHtml.indexOf(`data-session-id="${id}"`);
    return at < 0 ? '' : threeHtml.slice(at, threeHtml.indexOf('</li>', at));
  };
  check(
    'U12',
    'three sessions: each name with its date words, "Edit" and "Remove"; no empty line, no fill',
    three.every(
      (s) =>
        rowOf(s.id).includes(`>${s.name}<`) &&
        rowOf(s.id).includes(`>${words(s.date)}<`) &&
        rowOf(s.id).includes('>Edit<') &&
        rowOf(s.id).includes('>Remove<')
    ) &&
      !threeHtml.includes(esc(CW?.emptyManyDates ?? '?')) &&
      !threeHtml.includes('Add one session for each date'),
    threeHtml.slice(0, 600)
  );
  check(
    'U13',
    'two on one date: "Move down" on the first, "Move up" on the second, read aloud with the name; none on the third',
    rowOf('s1').includes('aria-label="Move Christmas lunch down"') &&
      !rowOf('s1').includes('>Move up<') &&
      rowOf('s2').includes('aria-label="Move Christmas dinner up"') &&
      !rowOf('s2').includes('>Move down<') &&
      !rowOf('s3').includes('Move'),
    [rowOf('s1'), rowOf('s2')]
  );
  check(
    'U14',
    "a session outside the event's dates (27 Dec on a 24 to 26 Dec event) is flagged; the others are not",
    rowOf('s3').includes(esc(CW?.outsideDates ?? '?')) &&
      !rowOf('s1').includes('Outside') &&
      !rowOf('s2').includes('Outside')
  );
  const hh = [
    {
      id: 'hA',
      title: 'Sam',
      littleCount: 2,
      people: [
        { personEventId: 'pSam', name: 'Sam', kind: 'adult' },
        { personEventId: 'pJo', name: 'Jo', kind: 'kid' },
      ],
    },
    {
      id: 'hB',
      title: 'Pat',
      littleCount: 0,
      people: [{ personEventId: 'pPat', name: 'Pat', kind: 'adult' }],
    },
  ];
  const withComing = draw(st(three, '2026-12-24', '2026-12-27', hh, []));
  const oneOnly = draw(st([three[0]], '2026-12-24', '2026-12-27', hh, []));
  check(
    'U15',
    '"Who comes to which session" under the card with two or more sessions, with its line; not with one',
    withComing.includes('>Who comes to which session<') &&
      withComing.includes(esc(W_?.line ?? '?')) &&
      !oneOnly.includes('Who comes to which session'),
    withComing.slice(
      withComing.indexOf('data-coming-to'),
      withComing.indexOf('data-coming-to') + 300
    )
  );
  const line = COMING?.comingLine;
  const notAt = (pairs: string[][]) => new Set(pairs.map(([p, s]) => `${p}|${s}`));
  check(
    'U16',
    '"Coming to": every session; the same ones for everyone (in session order); it differs; no sessions',
    typeof line === 'function' &&
      line(hh[0], three, notAt([])) === 'Coming to: every session' &&
      line(
        hh[0],
        three,
        notAt([
          ['pSam', 's2'],
          ['pJo', 's2'],
        ])
      ) === 'Coming to: Christmas lunch, Boxing Day picnic' &&
      line(hh[0], three, notAt([['pSam', 's2']])) === 'Coming to: it differs by person' &&
      line(
        hh[1],
        three,
        notAt([
          ['pPat', 's1'],
          ['pPat', 's2'],
          ['pPat', 's3'],
        ])
      ) === 'Coming to: no sessions'
  );
  const closedHtml = withComing;
  check(
    'U17',
    'each household closed: its title, its line, "Change"',
    closedHtml.includes('data-household-id="hA"') &&
      closedHtml.includes('>Sam<') &&
      closedHtml.includes('>Coming to: every session<') &&
      closedHtml.includes('>Change<') &&
      !closedHtml.includes('type="checkbox"')
  );
  const Coming = COMING?.default;
  const opened = Coming
    ? html(
        createElement(Coming, {
          eventId: A.id,
          sessions: three,
          households: hh,
          absences: [{ personEventId: 'pJo', dayId: 's2' }],
          onSaved: async () => {},
          initialOpen: 'hA',
        })
      )
    : 'missing';
  const boxes = opened.match(/<input[^>]*type="checkbox"[^>]*>/g) ?? [];
  check(
    'U18',
    'opened: each named person with one tick box per session (6), ticked when coming (Jo\'s dinner not), "Done"',
    boxes.length === 6 &&
      boxes.filter((b) => /checked=""/.test(b)).length === 5 &&
      opened.includes('<legend') &&
      opened.includes('>Jo<') &&
      opened.includes('>Done<') &&
      opened.includes('>Change<'),
    { boxes: boxes.length, ticked: boxes.filter((b) => /checked=""/.test(b)).length }
  );
  check(
    'U19',
    'decision 4: with kids without jobs, "Kids without jobs come with the household." (and not in a household without)',
    opened.includes(esc(W_?.littles ?? '?')) &&
      (Coming
        ? !html(
            createElement(Coming, {
              eventId: A.id,
              sessions: three,
              households: hh,
              absences: [],
              onSaved: async () => {},
              initialOpen: 'hB',
            })
          ).includes('Kids without jobs')
        : false)
  );
  check(
    'U20',
    'the card and "Coming to" draw their words from card-words.ts (no word of theirs typed in the screens)',
    !/>[A-Z][a-z]+ [a-z]+[^<{]*</.test(cardSrc) &&
      !/>[A-Z][a-z]+ [a-z]+[^<{]*</.test(read(F.coming)) &&
      /from '@\/lib\/sessions\/card-words'/.test(cardSrc) &&
      /from '@\/lib\/sessions\/card-words'/.test(read(F.coming))
  );

  // ══ L — the ledger ════════════════════════════════════════════════════════════════════════
  section('L — the new ledger line never asks why');
  const SENT = {
    id: 'e',
    status: 'CONFIRMING',
    sentAt: new Date('2026-12-01T00:00:00Z'),
    startDate: new Date('2026-12-24T00:00:00Z'),
    endDate: new Date('2026-12-26T00:00:00Z'),
  } as any;
  check(
    'L1',
    'EDIT_ATTENDANCE on a sent event: no trigger',
    whyTrigger(
      { action: 'EDIT_ATTENDANCE' as any, targetType: 'PersonEvent', targetId: 'p' },
      SENT
    ) === null
  );

  // ══ Z — the run ═══════════════════════════════════════════════════════════════════════════
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
