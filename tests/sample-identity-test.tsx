/**
 * [[GTC-441]] — THE SAMPLE MARKER, T2: every person made on a sample carries Person.sampleEventId
 * (that sample's id), and a real event never matches a person who carries one.
 *
 * Founder rulings (1 Nov 2026): the GTC-392 parts C and D plan as recommended (Q3); at the build,
 * R2: "sample" is isDemoEvent, the send wall's meaning (the old shared 2025 sample included), and
 * the helper reads it BEFORE the address branch, so a person typed with no address is marked too.
 * GTC-293 Q2 is otherwise unchanged.
 *
 *   P  preconditions: gather_demo on this Mac, the guarded dev server answers, no copy at the start
 *   A  each create path on a copy stamps the copy's id: the households POST, the household edit,
 *      the host's household, the V1 people POST, the batch import, the crowd, the host
 *   B  a person typed with no address on a sample is stamped (a kid in her household; the helper)
 *   C  a real event's create leaves it null (the households POST; the helper with no address)
 *   D  KEY: a real event typing a sample person's address and first name makes a NEW person and
 *      never reaches the sample's one (a crowd adult; a person typed on a copy; the host, Sam)
 *   E  CONTROL: a real event still matches a real person by address and first name (GTC-293)
 *   F  CONTROL: a sample still matches only inside itself
 *   Z  every probe row is removed by id; the counts are back; no stamped person is left
 *
 * Routes are driven over HTTP on a fresh guarded dev server (DEMO_SANDBOX_BASE_URL, default
 * http://localhost:3000), signed in by Session rows this run makes; the helper and the copy are
 * called in process against the same database.
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). Every
 * address is made up (@gtc441.invalid, or the copy's own tag under demo-copy.invalid). Nothing
 * here sends, queues a message, mints a link or calls the AI. Teardown deletes this run's rows by
 * id: its events (their memberships, households, roles, tokens and ledger lines go with them),
 * then its people, sessions and users.
 *
 *   npx tsx --tsconfig tests/tsconfig.json tests/sample-identity-test.tsx
 */
import { randomBytes } from 'crypto';

const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
const RUN = randomBytes(4).toString('hex');
const TAG = `gtc441-${RUN}`;
const DOMAIN = 'gtc441.invalid';
const COPY_DOMAIN = '@demo-copy.invalid';
const addr = (local: string) => `${local}-${RUN}@${DOMAIN}`;

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(layer: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m [${layer}] ${label}`);
  } else {
    failed++;
    reds.push(`[${layer}] ${label}`);
    console.log(`\x1b[31m✗\x1b[0m [${layer}] ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);

// ── The database: gather_demo on this Mac only ───────────────────────────────
function dbOk(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? '');
    return u.pathname === '/gather_demo' && ['localhost', '127.0.0.1'].includes(u.hostname);
  } catch {
    return false;
  }
}
const DB_OK = dbOk(process.env.DATABASE_URL);
let prisma: import('@prisma/client').PrismaClient;

/** Every row the run made, by id. */
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessions: new Set<string>(),
};
const keep = <T extends { id: string } | null | undefined>(p: T): T => {
  if (p) fx.persons.add(p.id);
  return p;
};

async function http(method: string, p: string, cookie: string, body?: unknown) {
  try {
    const res = await fetch(`${BASE}${p}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    return { status: -1, body: String(e) };
  }
}

const TABLES = [
  'event',
  'eventSetup',
  'person',
  'user',
  'session',
  'accessToken',
  'inviteEvent',
  'outboundMessage',
  'team',
  'item',
  'household',
  'personEvent',
  'auditEntry',
  'magicLink',
  'eventRole',
  'wrapUpLink',
  'assignment',
] as const;
async function totals(): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of TABLES) out[t] = await (prisma as any)[t].count();
  out.stamped = await prisma.person.count({ where: { sampleEventId: { not: null } } });
  return out;
}

/** The Person on an event's membership, by first name (one expected). */
async function memberNamed(eventId: string, first: string) {
  const rows = await prisma.personEvent.findMany({
    where: { eventId, person: { name: { startsWith: first } } },
    include: { person: true },
  });
  return rows.length === 1 ? rows[0].person : null;
}

/** A real event, hosted by a real (made-up) account, signed in by a Session this run makes. */
async function realHostWithTwoEvents() {
  const email = addr('hana');
  const user = await prisma.user.create({ data: { email } });
  fx.users.add(user.id);
  const host = keep(await prisma.person.create({ data: { name: 'Hana', email, userId: user.id } }));
  const day = new Date(Date.UTC(2027, 0, 9));
  const make = async (n: number) => {
    const e = await prisma.event.create({
      data: {
        name: `${TAG} real ${n}`,
        startDate: day,
        endDate: day,
        status: 'DRAFT',
        structureMode: 'EDITABLE',
        isLegacy: false,
        isDemo: false,
        guestCountConfidence: 'MEDIUM',
        dietaryStatus: 'UNSPECIFIED',
        dietaryVegetarian: 0,
        dietaryVegan: 0,
        dietaryGlutenFree: 0,
        dietaryDairyFree: 0,
        venueOvenCount: 0,
        hostId: host.id,
        setup: { create: {} },
      },
    });
    fx.events.add(e.id);
    await prisma.eventRole.create({ data: { userId: user.id, eventId: e.id, role: 'HOST' } });
    return e;
  };
  const r1 = await make(1);
  const r2 = await make(2);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
  });
  fx.sessions.add(token);
  return { host, r1, r2, cookie: `session=${token}` };
}

async function startCopy(COPY: any) {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessions.add(c.sessionToken);
  const ev = await prisma.event.findUnique({
    where: { id: c.eventId },
    include: { host: { include: { user: true } } },
  });
  fx.persons.add(ev!.hostId);
  return {
    eventId: c.eventId as string,
    hostId: ev!.hostId,
    account: ev!.host.user!.email,
    cookie: `session=${c.sessionToken}`,
  };
}

async function teardown() {
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  // People this run typed that hold no membership any more (the helper's own creates).
  const typed = await prisma.person.findMany({
    where: { email: { contains: RUN } },
    select: { id: true },
  });
  typed.forEach((p) => fx.persons.add(p.id));
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.sessions] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
}

async function main() {
  section('P — preconditions');
  assert('P', 'P1 DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  if (!DB_OK) return;
  const client = await import('@prisma/client');
  prisma = new client.PrismaClient();
  const COPY: any = await import('../src/lib/demo/copy');
  const CAPTURE: any = await import('../src/lib/households/capturePerson');
  const capture = (
    eventId: string,
    hostPersonId: string | null,
    name: string,
    email: string | null
  ) =>
    CAPTURE.findOrCreateCapturedPerson(prisma, {
      eventId,
      hostPersonId,
      name,
      email,
      phoneNumber: null,
      sentAt: null,
    }).then(keep, () => null);

  const start = await totals();
  try {
    let serverOk = false;
    try {
      serverOk = (await fetch(`${BASE}/api/events/${TAG}-probe/people`)).status === 401;
    } catch {
      serverOk = false;
    }
    assert('P', `P2 the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
    const copiesAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'P',
      'P3 no copy is in the database at the start',
      copiesAtStart === 0,
      `${copiesAtStart}`
    );

    // ══ A, B — a copy: every create path ═════════════════════════════════════════
    section('A — each create path on a copy stamps the copy’s id; B — with no address too');
    const copy = await startCopy(COPY);
    const C = copy.eventId;
    const sam = await prisma.person.findUnique({ where: { id: copy.hostId } });
    assert(
      'A',
      'A7 the host: startDemoCopy stamps Sam with the copy’s id, inside its own transaction',
      sam?.name === 'Sam' && sam?.sampleEventId === C,
      JSON.stringify({ name: sam?.name, stamp: sam?.sampleEventId === C })
    );
    const hh = await http('POST', `/api/events/${C}/host-household`, copy.cookie, {
      alone: false,
      name: 'Sam',
      partner: { name: 'Riley Sample', email: addr('riley') },
      helpers: [{ name: 'Mia Sample' }],
    });
    const riley = keep(await memberNamed(C, 'Riley'));
    assert(
      'A',
      'A3 the host’s household (POST host-household): her partner is stamped',
      hh.status === 201 && riley?.sampleEventId === C,
      `${hh.status} ${JSON.stringify({ stamp: riley?.sampleEventId ?? null })}`
    );
    const mia = keep(await memberNamed(C, 'Mia'));
    assert(
      'B',
      'B1 a kid with no address in her household is stamped',
      mia?.email == null && mia?.sampleEventId === C,
      JSON.stringify({ found: !!mia, email: mia?.email ?? null, stamp: mia?.sampleEventId ?? null })
    );
    const post = await http('POST', `/api/events/${C}/households`, copy.cookie, {
      primaryContact: { name: 'Ana Sample', email: addr('ana') },
    });
    const ana = keep(await memberNamed(C, 'Ana'));
    assert(
      'A',
      'A1 the households POST: the typed primary contact is stamped',
      post.status === 201 && ana?.sampleEventId === C,
      `${post.status} ${JSON.stringify({ stamp: ana?.sampleEventId ?? null })}`
    );
    const put = post.body?.household?.id
      ? await http('PUT', `/api/events/${C}/households/${post.body.household.id}`, copy.cookie, {
          primaryContact: { name: 'Ana Sample', email: addr('ana') },
          partner: { name: 'Ben Sample', email: addr('ben') },
        })
      : { status: -1, body: null };
    const ben = keep(await memberNamed(C, 'Ben'));
    assert(
      'A',
      'A2 the household edit (PUT): a partner added in the edit is stamped',
      put.status === 200 && ben?.sampleEventId === C,
      `${put.status} ${JSON.stringify({ stamp: ben?.sampleEventId ?? null })}`
    );
    const v1 = await http('POST', `/api/events/${C}/people`, copy.cookie, {
      name: 'Cara Sample',
      email: addr('cara'),
    });
    const cara = keep(await memberNamed(C, 'Cara'));
    assert(
      'A',
      'A4 the V1 people POST: the person is stamped',
      v1.status < 300 && cara?.sampleEventId === C,
      `${v1.status} ${JSON.stringify({ stamp: cara?.sampleEventId ?? null })}`
    );
    const batch = await http('POST', `/api/events/${C}/people/batch-import`, copy.cookie, {
      people: [{ name: 'Dan Sample', email: addr('dan') }, { name: 'Eve Sample' }],
    });
    const dan = keep(await memberNamed(C, 'Dan'));
    const eve = keep(await memberNamed(C, 'Eve'));
    assert(
      'A',
      'A5 the batch import: both people are stamped, the one with no address too',
      batch.status < 300 && dan?.sampleEventId === C && eve?.sampleEventId === C,
      `${batch.status} ${JSON.stringify({ dan: dan?.sampleEventId ?? null, eve: eve?.sampleEventId ?? null })}`
    );
    const crowd = await http('POST', `/api/events/${C}/households`, copy.cookie, {
      demoCrowd: true,
    });
    const crowdIds: string[] = (crowd.body?.households ?? []).map((h: any) => h.id);
    const crowdPeople = await prisma.person.findMany({
      where: { eventMemberships: { some: { eventId: C, householdId: { in: crowdIds } } } },
    });
    crowdPeople.forEach(keep);
    assert(
      'A',
      'A6 the crowd: all 24 crowd people are stamped with the copy’s id',
      crowd.status === 201 &&
        crowdPeople.length === 24 &&
        crowdPeople.every((p) => p.sampleEventId === C),
      `${crowd.status} ${crowdPeople.length} people, ${crowdPeople.filter((p) => p.sampleEventId === C).length} stamped`
    );
    const finn = await capture(C, copy.hostId, 'Finn Sample', null);
    assert(
      'B',
      'B2 the helper on a copy with no address: the new person is stamped',
      finn?.sampleEventId === C,
      JSON.stringify({ stamp: finn?.sampleEventId ?? null })
    );

    // ══ C, D, E — a real event ═══════════════════════════════════════════════════
    section('C — a real event’s create leaves it null');
    const real = await realHostWithTwoEvents();
    for (const r of [real.r1, real.r2]) {
      await http('POST', `/api/events/${r.id}/host-household`, real.cookie, {
        alone: true,
        name: 'Hana',
      });
    }
    const r1post = await http('POST', `/api/events/${real.r1.id}/households`, real.cookie, {
      primaryContact: { name: 'Kate Real', email: addr('kate') },
      partner: { name: 'Liam Real' },
    });
    const kate = keep(await memberNamed(real.r1.id, 'Kate'));
    const liam = keep(await memberNamed(real.r1.id, 'Liam'));
    assert(
      'C',
      'C1 the households POST on a real event: the person with an address and the one without are both null',
      r1post.status === 201 &&
        !!kate &&
        !!liam &&
        kate.sampleEventId === null &&
        liam.sampleEventId === null,
      `${r1post.status} ${JSON.stringify({ kate: kate?.sampleEventId, liam: liam?.sampleEventId })}`
    );
    const nora = await capture(real.r2.id, real.host.id, 'Nora Real', null);
    assert(
      'C',
      'C2 the helper on a real event with no address: the new person is null',
      !!nora && nora.sampleEventId === null,
      JSON.stringify({ stamp: nora?.sampleEventId })
    );

    section('D — KEY: a real event never reaches a sample person');
    const aroha = crowdPeople.find((p) => p.name === 'Aroha Ngata') ?? null;
    const d1 = aroha?.email
      ? await http('POST', `/api/events/${real.r2.id}/households`, real.cookie, {
          primaryContact: { name: 'Aroha', email: aroha.email },
        })
      : { status: -1, body: null };
    const d1Person = keep(await memberNamed(real.r2.id, 'Aroha'));
    const arohaAfter = aroha ? await prisma.person.findUnique({ where: { id: aroha.id } }) : null;
    const arohaOnR2 = aroha
      ? await prisma.personEvent.count({ where: { personId: aroha.id, eventId: real.r2.id } })
      : -1;
    assert(
      'D',
      'D1 the households POST on a real event, typing a crowd adult’s address and first name: a NEW person, null; the crowd person untouched and not on the real event',
      d1.status === 201 &&
        !!d1Person &&
        d1Person.id !== aroha?.id &&
        d1Person.sampleEventId === null &&
        arohaAfter?.name === 'Aroha Ngata' &&
        arohaAfter?.sampleEventId === C &&
        arohaOnR2 === 0,
      `${d1.status} ${JSON.stringify({ same: d1Person?.id === aroha?.id, stamp: d1Person?.sampleEventId, onR2: arohaOnR2 })}`
    );
    const d2 = await capture(real.r2.id, real.host.id, 'Ana', addr('ana'));
    assert(
      'D',
      'D2 the helper on a real event, typing a person typed on a copy: a NEW person, null',
      !!d2 && !!ana && d2.id !== ana.id && d2.sampleEventId === null,
      JSON.stringify({ same: d2?.id === ana?.id, stamp: d2?.sampleEventId })
    );
    const d3 = await capture(real.r2.id, real.host.id, 'Sam', copy.account);
    assert(
      'D',
      'D3 the helper on a real event, typing the copy host’s address and "Sam": a NEW person, not Sam',
      !!d3 && d3.id !== copy.hostId && d3.sampleEventId === null && d3.userId === null,
      JSON.stringify({ same: d3?.id === copy.hostId, stamp: d3?.sampleEventId })
    );

    section('E — CONTROL: a real event still matches a real person (GTC-293)');
    const e1 = await capture(real.r2.id, real.host.id, 'Kate', addr('kate'));
    assert(
      'E',
      'E1 the helper on a second real event, typing a real person’s address and first name, finds her',
      !!kate && e1?.id === kate.id,
      JSON.stringify({ same: e1?.id === kate?.id })
    );
    const e2 = await http('POST', `/api/events/${real.r2.id}/households`, real.cookie, {
      primaryContact: { name: 'Kate', email: addr('kate') },
    });
    const e2Person = await memberNamed(real.r2.id, 'Kate');
    assert(
      'E',
      'E2 the households POST on that second real event files the same real person',
      e2.status === 201 && !!kate && e2Person?.id === kate.id,
      `${e2.status} ${JSON.stringify({ same: e2Person?.id === kate?.id })}`
    );

    section('F — CONTROL: a sample matches only inside itself');
    const f1 = await capture(C, copy.hostId, 'Kate', addr('kate'));
    assert(
      'F',
      'F1 on a copy, typing a real person’s address and first name makes a NEW person',
      !!f1 && !!kate && f1.id !== kate.id,
      JSON.stringify({ same: f1?.id === kate?.id })
    );
    const f2 = await capture(C, copy.hostId, 'Ana', addr('ana'));
    assert(
      'F',
      'F2 on the same copy, typing a person already on it finds that person',
      !!f2 && !!ana && f2.id === ana.id,
      JSON.stringify({ same: f2?.id === ana?.id })
    );
    const other = await startCopy(COPY);
    const f3 = await capture(other.eventId, other.hostId, 'Ana', addr('ana'));
    assert(
      'F',
      'F3 on another copy, typing a person on the first copy makes a NEW person',
      !!f3 && !!ana && f3.id !== ana.id,
      JSON.stringify({ same: f3?.id === ana?.id })
    );
  } finally {
    await teardown();
  }

  section('Z — every probe row removed');
  const left = await prisma.person.count({ where: { id: { in: [...fx.persons] } } });
  const leftEvents = await prisma.event.count({ where: { id: { in: [...fx.events] } } });
  const leftUsers = await prisma.user.count({ where: { id: { in: [...fx.users] } } });
  const leftTyped = await prisma.person.count({ where: { email: { contains: RUN } } });
  assert(
    'Z',
    'Z1 every person, event and user this run made is gone, by id',
    left === 0 && leftEvents === 0 && leftUsers === 0 && leftTyped === 0,
    JSON.stringify({ left, leftEvents, leftUsers, leftTyped })
  );
  const end = await totals();
  const moved = Object.keys(start).filter((k) => start[k] !== end[k]);
  assert(
    'Z',
    'Z2 every table’s count is back to the start',
    moved.length === 0,
    moved.map((k) => `${k} ${start[k]} -> ${end[k]}`).join(', ')
  );
  assert('Z', 'Z3 no person is left with sampleEventId set', end.stamped === 0, `${end.stamped}`);
}

main()
  .catch((e) => {
    assert(
      'FATAL',
      `the suite threw: ${e instanceof Error ? e.message.split('\n').slice(-1)[0] : e}`,
      false
    );
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(failed > 0 ? 1 : 0);
  });
