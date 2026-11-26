/**
 * [[GTC-482]] — MULTI-DAY: THE PLAN DRAFTS EVERY SESSION IN ONE AI CALL (`npm run test:sessions-drafting`).
 *
 * The founder's rulings on the plan, 26 Nov 2026 (docs/tickets/GTC-482.md): each session its own
 * small menu sized to its own headcount, from Moment 2's one set of answers; drinks, ice and nibbles
 * on the whole event; the jobs on the whole event; nothing redrafts by itself; no special case for
 * the sample copy; W0, no new words; change A (adults and children per session, from the same
 * people, checked against sessionHeadcounts); and, from GTC-476, "One call stays one call".
 *
 *   D  NOTHING CHANGES WITHOUT SESSIONS: main's own finalize-plan, regenerate-plan, plan-input,
 *      prompts and plan-write (read from c8b9b42 into a scratch folder outside the repo) and
 *      today's, run side by side on twin events with the same canned reply: the prompt sent, byte
 *      for byte; the reply to the screen; the rows written, field by field. The switch off with
 *      sessions on the event, and on with none; both routes, both scopes
 *   A  the sessions block: labels, names, dates, order, headcounts with adults and children; no
 *      database id anywhere in the prompt; the system prompt unchanged; exactly one AI call a route
 *   F  the canned replies: a good one, an unknown label, another event's session id, a missing
 *      session field, every dish on one session, a reply cut off at the cap
 *   B  the write: one transaction; a session removed while the AI answered; the host's rows kept
 *   C  regenerate-plan, both scopes, the same way through the same one definition of the input
 *   E  the cap and the AI library as at c8b9b42
 *   K  the files: the five edited files exactly as written, nothing else in src, no migration, no
 *      route, one script line, the send and the guest page as at c8b9b42, the switch's readers
 *   Z  nothing left the process; every row this run made removed by id; every table as found
 *
 * D, E and most of B prove what already holds, so they pass before the source and after it. A, F,
 * C and K hold the source's change.
 *
 * SAFETY. The AI is never called: the AI library's one call (`callClaudeForJSON`) is replaced in
 * `require.cache` by canned replies, read through the library's own `parseClaudeJSON` (texts-test's
 * pattern for the senders). The provider trap walls the process and counts any request (none is
 * expected). The provider keys are removed for this process. The only other stand-in is the
 * cookie reader (decide-later-write's pattern): the routes' sign-in check runs for real against a
 * made-up host's session. Writes only its own rows (names start with the run's TAG); every id is
 * written to the fixture file BEFORE the row is used, and removed by id in `finally`.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-drafting-test.ts
 */
import { prisma } from '../src/lib/prisma';
import { NextRequest } from 'next/server';
import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const ROOT = path.join(__dirname, '..');
const TAG = `S482${Date.now().toString(36)}`;
const MAIN = 'c8b9b42'; // origin/main when GTC-482 began (the merge of GTC-483)
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC482_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc482-drafting-${TAG}.json`);

for (const k of [
  'ANTHROPIC_API_KEY',
  'RESEND_API_KEY',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
  'TNZ_AUTH_TOKEN',
  'TEST_SMS_RECIPIENT',
]) {
  process.env[k] = '';
}

let passed = 0;
let failed = 0;
function check(id: string, label: string, ok: boolean, got?: unknown) {
  if (ok) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${id} ${label}`);
  } else {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m ${id} ${label}`);
    if (got !== undefined) console.log(`    got: ${String(JSON.stringify(got)).slice(0, 700)}`);
  }
}
const section = (s: string) => console.log(`\n\x1b[1m\x1b[33m${s}\x1b[0m`);
const read = (rel: string) =>
  fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), 'utf8') : '';
const git = (args: string[]) => {
  try {
    return execFileSync('git', ['--literal-pathspecs', ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 1 << 26,
    });
  } catch {
    return null;
  }
};
const gitOk = (args: string[]) => git(args) !== null;
const atMain = (rel: string) => git(['show', `${MAIN}:${rel}`]) ?? '';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** The same dishes in the same sessions, whatever order the plan lists them in. */
const sameByName = (a: Record<string, string>, b: Record<string, string>) =>
  same(Object.entries(a).sort(), Object.entries(b).sort());
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);

// ── The two stand-ins, set before any route is loaded ───────────────────────────────────────
// 1. The cookie reader: the routes' own sign-in check reads this session.
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
// 2. The AI library's one call: canned replies, read through its own parse.
type Canned = { content: string; stopReason?: string; during?: () => Promise<void> };
let canned: Canned | null = null;
const sent: { system: string; user: string; cfg: any }[] = [];
const claudePath = require.resolve('../src/lib/ai/claude');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const realClaude = require(claudePath);
require.cache[claudePath]!.exports = {
  ...realClaude,
  callClaudeForJSON: async (system: string, user: string, cfg: any = {}) => {
    sent.push({ system, user, cfg });
    const c = canned;
    if (!c) throw new Error('gtc482 suite: no canned reply set');
    if (c.during) await c.during();
    return realClaude.parseClaudeJSON(
      { content: c.content, stopReason: c.stopReason ?? 'end_turn' },
      cfg.callSiteLabel
    );
  },
};
// The server's log lines, kept to read (and still printed, shortened).
const logged: string[] = [];
for (const level of ['warn', 'error'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    logged.push(line);
    orig(`    [log] ${line.slice(0, 160)}`);
  };
}

const made: Record<'users' | 'people' | 'events', string[]> = { users: [], people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
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
  const { events, people, users } = made;
  if (events.length) {
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: events } } });
    await prisma.outboundMessage.deleteMany({ where: { eventId: { in: events } } });
    await prisma.event.deleteMany({ where: { id: { in: events } } });
  }
  if (people.length) {
    await prisma.auditEntry.deleteMany({ where: { actorId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
  if (users.length) {
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}

const realFetch = globalThis.fetch;

// ── The files ───────────────────────────────────────────────────────────────────────────────
const F = {
  input: 'src/lib/ai/plan-input.ts',
  prompts: 'src/lib/ai/prompts.ts',
  write: 'src/lib/ai/plan-write.ts',
  finalize: 'src/app/api/events/[id]/finalize-plan/route.ts',
  regenerate: 'src/app/api/events/[id]/regenerate-plan/route.ts',
  claude: 'src/lib/ai/claude.ts',
  limits: 'src/lib/ai/token-limits.ts',
};
/**
 * K: the five edited files as this ticket wrote them (SHA-256 of the whole file) and their line
 * counts against c8b9b42 (added, removed). Every hunk is named in docs/tickets/GTC-482.md.
 */
const EDITED: Record<string, { sha: string; numstat: string }> = {
  [F.input]: {
    sha: 'de60a4246168e02dbf9927a56020a2dc888bdf18ca2904450ddb064c72f9b347',
    numstat: '94 0',
  },
  [F.prompts]: {
    sha: '371c0fc43686ab32314cddfd5bbc717f8ad3547b715c639b8e1ee428db194887',
    numstat: '89 3',
  },
  [F.write]: {
    sha: 'a92de5fbea0ee916907cb940aaf92a556a145bd4441968628df0d0f9169b54b0',
    numstat: '61 3',
  },
  [F.finalize]: {
    sha: '09ffa952be9f28f4567334cca97711313724141439e5323f218251f906d7e9e0',
    numstat: '29 2',
  },
  [F.regenerate]: {
    sha: 'dfdb5bc53231d56d94d121578a62f4b1ae3846f87d6580e038da352234698b71',
    numstat: '29 4',
  },
};
/** K: the switch's readers after this ticket: GTC-483's eighteen and plan-input.ts. */
const SWITCH_READERS = [
  'src/app/api/c/[token]/route.ts',
  'src/app/api/events/[id]/days/[dayId]/route.ts',
  'src/app/api/events/[id]/days/route.ts',
  'src/app/api/events/[id]/sessions/route.ts',
  'src/app/api/p/[token]/route.ts',
  'src/app/api/p/[token]/sessions/route.ts',
  'src/app/p/[token]/layout.tsx',
  'src/app/plan/[eventId]/glance/page.tsx',
  'src/app/plan/[eventId]/setup/layout.tsx',
  'src/components/sessions/GuestSessions.tsx',
  'src/components/sessions/Moment1Sessions.tsx',
  'src/components/sessions/SessionTabs.tsx',
  'src/components/sessions/SessionsSwitch.tsx',
  'src/lib/ai/plan-input.ts',
  'src/lib/glance/read.ts',
  'src/lib/lifecycle.ts',
  'src/lib/moment3/share-dish.ts',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/workflow.ts',
];
/** K: what the ticket must not touch: the send, the nudges, the decide-by clock, the opt-outs, the guest page. */
const UNTOUCHED = [
  'src/lib/sms',
  'src/lib/messages',
  'src/lib/eligibility',
  'src/lib/email-delivery',
  'src/lib/email.ts',
  'src/lib/press',
  'src/lib/decide-by.ts',
  'src/lib/live-sends.ts',
  'src/app/api/cron',
  'src/app/api/events/[id]/send',
  'src/app/api/events/[id]/trigger-nudges',
  'src/app/api/p',
  'src/app/p',
  'src/app/plan/[eventId]/setup/page.tsx',
  'src/components/plan/Moment2Step2Skeleton.tsx',
  'src/lib/auth',
  'src/lib/sessions',
  'src/lib/ai/claude.ts',
  'src/lib/ai/token-limits.ts',
];

// ── The fixture: GTC-145's 17-person Christmas ────────────────────────────────────────────────
type Role = 'PRIMARY_CONTACT' | 'PARTNER' | 'CHILD';
const HOUSEHOLDS: { key: string; little: number; members: [string, Role][] }[] = [
  {
    key: 'kate',
    little: 1,
    members: [
      ['Kate', 'PRIMARY_CONTACT'],
      ['Matt', 'PARTNER'],
      ['Charlie', 'CHILD'],
      ['Rosie', 'CHILD'],
    ],
  },
  {
    key: 'pete',
    little: 0,
    members: [
      ['Pete', 'PRIMARY_CONTACT'],
      ['Suzanne', 'PARTNER'],
      ['Gus', 'CHILD'],
    ],
  },
  {
    key: 'jacqui',
    little: 0,
    members: [
      ['Jacqui', 'PRIMARY_CONTACT'],
      ['Ian', 'PARTNER'],
    ],
  },
  { key: 'joanna', little: 0, members: [['Joanna', 'PRIMARY_CONTACT']] },
  {
    key: 'jane',
    little: 0,
    members: [
      ['Jane', 'PRIMARY_CONTACT'],
      ['Gavin', 'PARTNER'],
    ],
  },
  {
    key: 'robyn',
    little: 2,
    members: [
      ['Robyn', 'PRIMARY_CONTACT'],
      ['Dougal', 'PARTNER'],
    ],
  },
];
type Shape = 'none' | 'one' | 'two' | 'five';
/** The sessions of each shape: name, date, place on the date, and the households away. */
const SESSIONS: Record<Shape, { name: string; date: string; order: number; away: string[] }[]> = {
  none: [],
  one: [{ name: 'Christmas lunch', date: '2026-12-25', order: 0, away: [] }],
  two: [
    { name: 'Christmas lunch', date: '2026-12-25', order: 0, away: [] },
    { name: 'Christmas dinner', date: '2026-12-25', order: 1, away: ['jacqui', 'jane'] },
  ],
  five: [
    {
      name: 'Christmas Eve dinner',
      date: '2026-12-24',
      order: 0,
      away: ['jacqui', 'jane', 'robyn'],
    },
    { name: 'Christmas lunch', date: '2026-12-25', order: 0, away: [] },
    { name: 'Christmas evening', date: '2026-12-25', order: 1, away: ['jane'] },
    { name: 'Boxing Day brunch', date: '2026-12-26', order: 0, away: ['jane', 'jacqui'] },
    { name: 'Boxing Day dinner', date: '2026-12-26', order: 1, away: ['jane'] },
  ],
};
const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
const sel = (...levels: string[][]) =>
  Object.fromEntries(levels.map((options, i) => [i, { options }]));
const SETUP = {
  eventType: 'Christmas',
  dietaryData: { status: 'confirmed_needs', requirements: ['Vegetarian', 'Gluten-free'] },
  mainsData: {
    selections: sel(['Traditional roast'], ['Glazed ham', 'Roast lamb']),
    stillDeciding: false,
  },
  extendedCategoriesData: {
    dessert: {
      selections: sel(
        ['Classic NZ pavlova centrepiece', 'Trifle and creams'],
        ['Classic sherry trifle']
      ),
    },
    sides_salads: {
      selections: sel(
        ['Fresh summer salads', 'Roast vegetables'],
        ['Garden salad', 'Potato salad', 'Roast kumara']
      ),
    },
    drinks_alcoholic: {
      selections: sel(
        ['Beer and cider', 'Wine'],
        ['NZ craft beer selection', 'NZ Sauvignon Blanc (Marlborough)']
      ),
    },
    drinks_non_alcoholic: {
      selections: sel(['Soft drinks and juice'], ['L&P and classic NZ fizzy']),
    },
    table_snacks: {
      selections: sel(
        ['Cheese and crackers', 'Dips and nibbles'],
        ['NZ cheese selection (Kapiti, Mainland)', 'Hummus and pita']
      ),
    },
  },
  setUpData: { freeText: 'Set up the tables on the deck' },
  cleanUpData: { freeText: 'Wash the dishes and take out the rubbish' },
};

interface Fx {
  id: string;
  /** Session ids in order (S1, S2, ...). */
  days: string[];
  /** Every person-on-event id of the households. */
  pe: string[];
}
let host: { userId: string; personId: string } | null = null;

async function makeHost() {
  const user = await prisma.user.create({ data: { email: `gtc482+host+${TAG}@example.test` } });
  note('users', user.id);
  const person = await prisma.person.create({
    data: { name: `${TAG} Host`, email: `gtc482+host+${TAG}@example.test`, userId: user.id },
  });
  note('people', person.id);
  SESSION_TOKEN = randomBytes(24).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token: SESSION_TOKEN, expiresAt: new Date(Date.now() + 86400000) },
  });
  host = { userId: user.id, personId: person.id };
}

async function makeEvent(shape: Shape, opts: { households?: boolean } = {}): Promise<Fx> {
  const sessions = SESSIONS[shape];
  const dates = sessions.length ? sessions.map((s) => s.date) : ['2026-12-25'];
  const event = await prisma.event.create({
    data: {
      name: `${TAG} Christmas`,
      startDate: utcDay(dates[0]),
      endDate: utcDay(dates[dates.length - 1]),
      hostId: host!.personId,
      status: 'DRAFT',
    },
  });
  note('events', event.id);
  await prisma.eventRole.create({
    data: { userId: host!.userId, eventId: event.id, role: 'HOST' },
  });
  await prisma.personEvent.create({
    data: { personId: host!.personId, eventId: event.id, role: 'HOST' },
  });
  await prisma.eventSetup.create({ data: { eventId: event.id, ...SETUP } as any });
  const byHousehold: Record<string, string[]> = {};
  const pe: string[] = [];
  if (opts.households !== false) {
    for (const h of HOUSEHOLDS) {
      const household = await prisma.household.create({
        data: { eventId: event.id, littleCount: h.little },
      });
      byHousehold[h.key] = [];
      for (const [name, role] of h.members) {
        const p = await prisma.person.create({ data: { name: `${TAG} ${name}` } });
        note('people', p.id);
        const row = await prisma.personEvent.create({
          data: {
            personId: p.id,
            eventId: event.id,
            householdId: household.id,
            householdRole: role,
            role: 'PARTICIPANT',
          },
        });
        byHousehold[h.key].push(row.id);
        pe.push(row.id);
      }
    }
  }
  const days: string[] = [];
  for (const s of sessions) {
    const day = await prisma.day.create({
      data: { eventId: event.id, name: s.name, date: utcDay(s.date), displayOrder: s.order },
    });
    days.push(day.id);
    for (const key of s.away) {
      for (const personEventId of byHousehold[key] ?? []) {
        await prisma.sessionAbsence.create({ data: { personEventId, dayId: day.id } });
      }
    }
  }
  return { id: event.id, days, pe };
}

// ── Canned replies ──────────────────────────────────────────────────────────────────────────
type It = { name: string; q?: number; unit?: string; session?: unknown; tags?: string[] };
function reply(sections: Record<string, It[]>, extra: { badQuantity?: boolean } = {}): string {
  const labels: Record<string, string> = {
    mains: 'Mains',
    dessert: 'Dessert',
    sides_salads: 'Sides & Salads',
    drinks_non_alcoholic: 'Non-Alcoholic Drinks',
  };
  const out = Object.entries(sections).map(([key, items]) => ({
    category: labels[key] ?? key,
    key,
    emoji: '🍽️',
    items: items.map((it, i) => {
      const row: Record<string, unknown> = {
        name: it.name,
        quantity: extra.badQuantity && i === items.length - 1 ? 'lots' : (it.q ?? 2),
        unit: it.unit ?? 'kg',
        servingSize: 'serves 8',
        critical: false,
        criticalReason: null,
        dietaryTags: it.tags ?? [],
      };
      if ('session' in it) row.session = it.session;
      return row;
    }),
  }));
  return JSON.stringify({
    sections: out,
    tasks: [
      { bucket: 'set_up', name: 'Set up the tables on the deck' },
      { bucket: 'clean_up', name: 'Wash the dishes' },
    ],
    dietaryCoverage: [
      { requirement: 'Vegetarian', covered: true, flaggedItems: ['Roast vegetables'] },
      { requirement: 'Gluten-free', covered: true, flaggedItems: ['Glazed ham'] },
    ],
    thingsToConsider: [{ name: 'Napkins', category: 'Table' }],
  });
}
/** A plain plan with no sessions in it (what today's prompt gets back). */
const PLAIN = reply({
  mains: [{ name: 'Glazed ham', q: 4 }, { name: 'Roast lamb', q: 3 }, { name: 'Nut roast' }],
  dessert: [{ name: 'Pavlova', q: 2, unit: 'count' }, { name: 'Sherry trifle' }],
  sides_salads: [{ name: 'Garden salad' }, { name: 'Roast kumara' }],
});
/** A good session reply for the five-session shape. */
const GOOD5 = reply({
  mains: [
    { name: 'Glazed ham', q: 4, session: 'S2' },
    { name: 'Roast lamb', q: 3, session: 'S2' },
    { name: 'Sausages', q: 2, session: 'S1' },
    { name: 'Leftover ham rolls', q: 1, session: ' s3 ' },
    { name: 'Bacon and eggs', q: 2, session: 'S4' },
    { name: 'Barbecued lamb chops', q: 2, session: 'S5' },
  ],
  dessert: [
    { name: 'Pavlova', q: 2, unit: 'count', session: 'S2' },
    { name: 'Fresh fruit salad', session: 'S5' },
  ],
  sides_salads: [
    { name: 'Garden salad', session: 'S2' },
    { name: 'Potato salad', session: 'S1' },
  ],
  drinks_non_alcoholic: [{ name: 'L&P', q: 12, unit: 'bottles', session: 'whole' }],
});

// ── The calls ───────────────────────────────────────────────────────────────────────────────
type Route = { POST: (req: NextRequest, ctx: any) => Promise<Response> };
async function call(route: Route, kind: 'finalize' | 'regenerate', eventId: string, body?: object) {
  const url = `http://localhost/api/events/${eventId}/${kind === 'finalize' ? 'finalize-plan' : 'regenerate-plan'}`;
  const req = new NextRequest(
    url,
    body
      ? {
          method: 'POST',
          body: JSON.stringify(body),
          headers: { 'content-type': 'application/json' },
        }
      : { method: 'POST' }
  );
  const before = sent.length;
  const res = await route.POST(req, { params: Promise.resolve({ id: eventId }) });
  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  const prompts = sent.slice(before);
  return { status: res.status, json, prompt: prompts[prompts.length - 1], calls: prompts.length };
}
async function rows(eventId: string) {
  const items = await prisma.item.findMany({
    where: { team: { eventId } },
    include: { team: { select: { name: true, source: true, displayOrder: true, domain: true } } },
    orderBy: [{ team: { displayOrder: 'asc' } }, { displayOrder: 'asc' }, { name: 'asc' }],
  });
  return items;
}
/** The fields a host's plan is made of, without ids, times or batch ids. */
function shapeOf(items: Awaited<ReturnType<typeof rows>>, days: string[]) {
  return items.map((i) => ({
    team: i.team,
    name: i.name,
    kind: i.kind,
    quantityAmount: i.quantityAmount,
    quantityUnit: i.quantityUnit,
    quantityUnitCustom: i.quantityUnitCustom,
    quantityText: i.quantityText,
    quantityState: i.quantityState,
    notes: i.notes,
    critical: i.critical,
    criticalReason: i.criticalReason,
    source: i.source,
    aiGenerated: i.aiGenerated,
    userConfirmed: i.userConfirmed,
    isProtected: i.isProtected,
    displayOrder: i.displayOrder,
    dietaryTags: i.dietaryTags,
    session: i.dayId === null ? null : days.indexOf(i.dayId),
  }));
}
const on = () => {
  process.env[VAR] = 'on';
};
const off = () => {
  delete process.env[VAR];
};

// ── Main's own code, from c8b9b42, in a scratch folder outside the repo ────────────────────────
const SCRATCH = fs.mkdtempSync(path.join(os.tmpdir(), `gtc482-main-${TAG}-`));
const COPIES: Record<string, string> = {
  'plan-input': F.input,
  prompts: F.prompts,
  'plan-write': F.write,
  finalize: F.finalize,
  regenerate: F.regenerate,
};
const strayImports: string[] = [];
function mainCopies() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const nextServer = require.resolve('next/server', { paths: [ROOT] });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const prismaClient = require.resolve('@prisma/client', { paths: [ROOT] });
  const local: Record<string, string> = {
    '@/lib/ai/plan-input': path.join(SCRATCH, 'plan-input'),
    '@/lib/ai/prompts': path.join(SCRATCH, 'prompts'),
    '@/lib/ai/plan-write': path.join(SCRATCH, 'plan-write'),
  };
  for (const [name, rel] of Object.entries(COPIES)) {
    const src = atMain(rel).replace(/from '([^']+)'/g, (whole, spec: string) => {
      if (local[spec]) return `from '${local[spec]}'`;
      // A relative import (prompts.ts's './config-loader') means the file beside the original in
      // the repo, or the scratch copy when it is one of the five.
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const abs = path.join(ROOT, path.dirname(rel), spec);
        const alias = `@/${path.relative(path.join(ROOT, 'src'), abs)}`;
        return `from '${local[alias] ?? abs}'`;
      }
      if (spec.startsWith('@/')) return `from '${path.join(ROOT, 'src', spec.slice(2))}'`;
      if (spec === 'next/server') return `from '${nextServer}'`;
      if (spec === '@prisma/client') return `from '${prismaClient}'`;
      strayImports.push(`${name}: ${spec}`);
      return whole;
    });
    fs.writeFileSync(path.join(SCRATCH, `${name}.ts`), src);
  }
}

async function main() {
  installProviderTrap();
  off();
  const startCounts = await tableCounts();
  await makeHost();
  mainCopies();
  const mainFinalize: Route = await import(path.join(SCRATCH, 'finalize.ts'));
  const mainRegenerate: Route = await import(path.join(SCRATCH, 'regenerate.ts'));
  const liveFinalize: Route = await import('../src/app/api/events/[id]/finalize-plan/route');
  const liveRegenerate: Route = await import('../src/app/api/events/[id]/regenerate-plan/route');
  const liveInput: any = await import('../src/lib/ai/plan-input');
  const livePrompts: any = await import('../src/lib/ai/prompts');
  const liveWrite: any = await import('../src/lib/ai/plan-write');
  const answers: any = await import('../src/lib/sessions/answers');
  const limits: any = await import('../src/lib/ai/token-limits');

  // ══ D — nothing changes without sessions ═══════════════════════════════════════════════════
  section('D — without sessions, the prompt, the reply and the rows are main’s, byte for byte');
  check(
    'D0',
    'main’s five files are read from c8b9b42 and import only what this suite points at',
    Object.values(COPIES).every((rel) => atMain(rel).length > 1000) && strayImports.length === 0,
    strayImports
  );
  /** One case: twin events, main's code on one and today's on the other, the same reply. */
  async function twins(
    label: string,
    shape: Shape,
    switchOn: boolean,
    regen?: { scope: 'plan' | 'category'; categoryKey?: string }
  ) {
    const a = await makeEvent(shape);
    const b = await makeEvent(shape);
    (switchOn ? on : off)();
    canned = { content: PLAIN };
    const ma = await call(mainFinalize, 'finalize', a.id);
    const lb = await call(liveFinalize, 'finalize', b.id);
    let mr = ma;
    let lr = lb;
    if (regen) {
      // The host's own change, the same on both: the first mains row edited (kept by a redraft).
      for (const fx of [a, b]) {
        const first = await prisma.item.findFirst({
          where: { team: { eventId: fx.id, name: 'Mains' } },
          orderBy: { displayOrder: 'asc' },
        });
        if (first) {
          await prisma.item.update({
            where: { id: first.id },
            data: { quantityAmount: 5, source: 'HOST_EDITED' },
          });
        }
      }
      canned = {
        content: reply({
          mains: [{ name: 'Roast chicken', q: 2 }],
          dessert: [{ name: 'Christmas pudding', q: 1, unit: 'count' }],
        }),
      };
      const body = { scope: regen.scope, categoryKey: regen.categoryKey };
      mr = await call(mainRegenerate, 'regenerate', a.id, body);
      lr = await call(liveRegenerate, 'regenerate', b.id, body);
    }
    const [ra, rb] = [await rows(a.id), await rows(b.id)];
    check(
      `D ${label}`,
      'the prompt sent is main’s, byte for byte (system and user), and exactly one AI call each',
      !!mr.prompt &&
        !!lr.prompt &&
        mr.prompt.system === lr.prompt.system &&
        mr.prompt.user === lr.prompt.user &&
        mr.calls === 1 &&
        lr.calls === 1,
      { mainUser: sha(mr.prompt?.user ?? ''), liveUser: sha(lr.prompt?.user ?? '') }
    );
    check(
      `D ${label}`,
      'the reply to the screen is main’s (status and body), with no new key',
      mr.status === 200 &&
        mr.status === lr.status &&
        same(mr.json, lr.json) &&
        !JSON.stringify(lr.json).includes('sessionDraft'),
      { main: mr.status, live: lr.status }
    );
    check(
      `D ${label}`,
      'the rows written are main’s, field by field; every one on the whole event',
      ra.length > 0 &&
        same(shapeOf(ra, a.days), shapeOf(rb, b.days)) &&
        rb.every((i) => i.dayId === null),
      { main: ra.length, live: rb.length }
    );
  }
  await twins('1 finalize, the switch off, five sessions on the event:', 'five', false);
  await twins('2 finalize, the switch on, no session:', 'none', true);
  await twins('3 regenerate the plan, the switch off, five sessions:', 'five', false, {
    scope: 'plan',
  });
  await twins('4 regenerate Dessert, the switch on, no session:', 'none', true, {
    scope: 'category',
    categoryKey: 'dessert',
  });
  await twins('5 regenerate the plan, the switch on, no session:', 'none', true, {
    scope: 'plan',
  });
  await twins('6 regenerate Dessert, the switch off, two sessions:', 'two', false, {
    scope: 'category',
    categoryKey: 'dessert',
  });
  off();
  {
    // With the switch off, buildPlanGenerationInput reads nothing more and returns no new key.
    const fx = await makeEvent('five');
    const setup = await prisma.eventSetup.findUnique({ where: { eventId: fx.id } });
    const r = await liveInput.buildPlanGenerationInput(fx.id, { guestCount: null }, setup);
    check(
      'D7',
      'the switch off: no `sessions` in the prompt input and no `sessionDayIds` beside it',
      !('sessions' in r.promptInput) && !('sessionDayIds' in r),
      Object.keys(r)
    );
  }

  // ══ A — the sessions block ═════════════════════════════════════════════════════════════════
  section('A — the sessions block, word for word');
  on();
  const fx5 = await makeEvent('five');
  canned = { content: GOOD5 };
  const r5 = await call(liveFinalize, 'finalize', fx5.id);
  const user5 = r5.prompt?.user ?? '';
  const WANT5 = [
    'SESSIONS (this event has more than one meal; plan each one):',
    '- S1: Christmas Eve dinner, Thu 24 Dec, 9 coming (5 adults, 4 children)',
    '- S2: Christmas lunch, Fri 25 Dec, 17 coming (11 adults, 6 children)',
    '- S3: Christmas evening, Fri 25 Dec, 15 coming (9 adults, 6 children)',
    '- S4: Boxing Day brunch, Sat 26 Dec, 13 coming (7 adults, 6 children)',
    '- S5: Boxing Day dinner, Sat 26 Dec, 15 coming (9 adults, 6 children)',
    '',
    'How to plan the sessions:',
    '- Every item gets a "session": the label of the session it is eaten',
    '  at (S1 to S5), or "whole" for something bought once and used',
    '  across sessions (a stock of drinks, ice, snacks to graze on). Use',
    '  no other value.',
    "- Size each item for its own session's headcount, not the whole",
    "  event's.",
    "- Kate's selections are for the event as a whole: put each where it",
    '  fits best (the main roasts at the main meal), not at every session.',
    '- Each session should make sense on its own as a meal of its kind. A',
    '  lighter session (a brunch, a leftovers dinner) needs fewer, simpler',
    '  items than the main meal. The plan size guidance is for one main',
    '  meal.',
    '- Never list the same item twice in one session. List an item in two',
    '  sessions only if it is really eaten at both; prefer a note',
    '  ("leftover ham from S2") to buying the same thing again.',
    '- Cover each dietary requirement at every session that has a meal.',
    '- A session with 0 coming gets no items.',
  ].join('\n');
  check(
    'A1',
    'the five-session block is in the user prompt word for word, once, before the auxiliary outputs',
    count(user5, WANT5) === 1 &&
      user5.indexOf(WANT5) < user5.indexOf('Then produce three short auxiliary outputs'),
    user5.slice(user5.indexOf('SESSIONS ('), user5.indexOf('SESSIONS (') + 400)
  );
  check(
    'A2',
    'the reply shape asks for the session on every item, after its dietary tags',
    user5.includes(
      '          "dietaryTags": string[],    // any of VEGETARIAN, VEGAN, GLUTEN_FREE, DAIRY_FREE, NUT_FREE — empty array when none apply\n          "session": string           // S1 to S5, or "whole" — see SESSIONS above\n'
    )
  );
  const ids = [fx5.id, ...fx5.days, ...fx5.pe];
  const whole5 = `${r5.prompt?.system ?? ''}\n${user5}`;
  check(
    'A3',
    'no database id anywhere in the prompt (none of this event’s ids, nothing shaped like one)',
    user5.length > 0 && ids.every((id) => !whole5.includes(id)) && !/\bc[a-z0-9]{24}\b/.test(whole5)
  );
  {
    off();
    const twin = await makeEvent('five');
    canned = { content: PLAIN };
    const m = await call(mainFinalize, 'finalize', twin.id);
    on();
    check(
      'A4',
      'the system prompt is main’s, byte for byte, with sessions in the user prompt',
      !!m.prompt && m.prompt.system === r5.prompt?.system
    );
  }
  {
    const households = await prisma.household.findMany({
      where: { eventId: fx5.id },
      include: { members: { select: { id: true } } },
    });
    const absences = await prisma.sessionAbsence.findMany({
      where: { dayId: { in: fx5.days } },
      select: { personEventId: true, dayId: true },
    });
    const heads = answers.sessionHeadcounts(
      fx5.days,
      households.map((h) => ({
        littleCount: h.littleCount,
        people: h.members.map((m) => ({ personEventId: m.id })),
      })),
      absences
    );
    const said = fx5.days.map((_d, i) => {
      const m = new RegExp(
        `^- S${i + 1}: [^\\n]*, (\\d+) coming \\((\\d+) adults?, (\\d+) child(?:ren)?\\)$`,
        'm'
      ).exec(user5);
      return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
    });
    check(
      'A5',
      'each session’s count is sessionHeadcounts’ figure, and its adults and children add up to it',
      said.every((s, i) => !!s && s[0] === heads[fx5.days[i]] && s[1] + s[2] === s[0]),
      { said, heads }
    );
  }
  {
    const f1 = await makeEvent('one');
    canned = { content: reply({ mains: [{ name: 'Glazed ham', session: 'S1' }] }) };
    const u1 = (await call(liveFinalize, 'finalize', f1.id)).prompt?.user ?? '';
    const f2 = await makeEvent('two');
    canned = { content: reply({ mains: [{ name: 'Glazed ham', session: 'S1' }] }) };
    const u2 = (await call(liveFinalize, 'finalize', f2.id)).prompt?.user ?? '';
    check(
      'A6',
      'one session: "(S1)" and "leftover ham from S1"; two: "(S1 or S2)", the dinner 13 coming (7 adults, 6 children)',
      u1.includes('  at (S1), or "whole"') &&
        u1.includes('("leftover ham from S1")') &&
        u1.includes('"session": string           // S1, or "whole"') &&
        u2.includes('  at (S1 or S2), or "whole"') &&
        u2.includes('- S2: Christmas dinner, Fri 25 Dec, 13 coming (7 adults, 6 children)')
    );
    const f0 = await makeEvent('five', { households: false });
    canned = { content: reply({ mains: [{ name: 'Glazed ham', session: 'S2' }] }) };
    const u0 = (await call(liveFinalize, 'finalize', f0.id)).prompt?.user ?? '';
    check(
      'A7',
      'households that name no one: the sessions without counts, and no headcount lines',
      u0.includes('- S1: Christmas Eve dinner, Thu 24 Dec\n') &&
        !u0.includes(' coming') &&
        !u0.includes("Size each item for its own session's headcount") &&
        !u0.includes('A session with 0 coming')
    );
    const pure =
      typeof liveInput.planSessionsFrom === 'function'
        ? liveInput.planSessionsFrom(
            [
              { id: 'd2', name: 'Thu 24 Dec', date: '2026-12-24T00:00:00.000Z', displayOrder: 1 },
              { id: 'd1', name: 'Lunch', date: '2026-12-24T00:00:00.000Z', displayOrder: 0 },
            ],
            [{ littleCount: 1, members: [{ id: 'p1', householdRole: 'PARTNER' }] }],
            [{ personEventId: 'p1', dayId: 'd2' }]
          )
        : null;
    check(
      'A8',
      'planSessionsFrom: order by date then place; a name that is only its date drops the date; a household all away takes its little ones',
      same(pure, {
        sessions: [
          { label: 'S1', name: 'Lunch', date: 'Thu 24 Dec', coming: 2, adults: 1, children: 1 },
          { label: 'S2', name: 'Thu 24 Dec', date: '', coming: 0, adults: 0, children: 0 },
        ],
        dayIds: { S1: 'd1', S2: 'd2' },
      }),
      pure
    );
  }

  // ══ F — the canned replies ═════════════════════════════════════════════════════════════════
  section('F — each dish in its session, or on the whole event and counted');
  const placed = async (fx: Fx) =>
    Object.fromEntries(
      (await rows(fx.id))
        .filter((i) => i.kind === 'ITEM')
        .map((i) => [i.name, i.dayId === null ? 'whole' : `S${fx.days.indexOf(i.dayId) + 1}`])
    );
  const unplacedLines = () => logged.filter((l) => l.includes('matched no session'));
  {
    const got = await placed(fx5);
    check(
      'F1',
      'a good reply: every dish in its session (" s3 " read as S3), "whole" on the whole event, nothing counted, no log line',
      r5.status === 200 &&
        sameByName(got, {
          'Glazed ham': 'S2',
          'Roast lamb': 'S2',
          Sausages: 'S1',
          'Leftover ham rolls': 'S3',
          'Bacon and eggs': 'S4',
          'Barbecued lamb chops': 'S5',
          Pavlova: 'S2',
          'Fresh fruit salad': 'S5',
          'Garden salad': 'S2',
          'Potato salad': 'S1',
          'L&P': 'whole',
        }) &&
        same(r5.json?.plan?.sessionDraft, { sessions: 5, unplaced: 0 }) &&
        unplacedLines().length === 0,
      { got, draft: r5.json?.plan?.sessionDraft }
    );
    const jobs = (await rows(fx5.id)).filter((i) => i.kind === 'TASK');
    check(
      'F2',
      'the jobs stay on the whole event (decision 3)',
      jobs.length === 2 && jobs.every((j) => j.dayId === null),
      jobs.map((j) => j.dayId)
    );
  }
  {
    const fx = await makeEvent('five');
    const before = unplacedLines().length;
    canned = {
      content: reply({
        mains: [
          { name: 'Glazed ham', session: 'S2' },
          { name: 'Roast lamb', session: 'S9' },
          { name: 'Sausages', session: 'Christmas lunch' },
        ],
      }),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const got = await placed(fx);
    const lines = unplacedLines().slice(before);
    check(
      'F3',
      'an unknown label: kept on the whole event, never dropped, counted in the reply and in one log line',
      same(got, { 'Glazed ham': 'S2', 'Roast lamb': 'whole', Sausages: 'whole' }) &&
        same(r.json?.plan?.sessionDraft, { sessions: 5, unplaced: 2 }) &&
        lines.length === 1 &&
        lines[0].includes('missing 0, unknown 2, gone 0'),
      { got, draft: r.json?.plan?.sessionDraft, lines }
    );
  }
  {
    const fx = await makeEvent('five');
    const other = fx5.days[1];
    const before = unplacedLines().length;
    canned = {
      content: reply({
        mains: [
          { name: 'Glazed ham', session: other },
          { name: 'Roast lamb', session: 'S2' },
        ],
      }),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const got = await placed(fx);
    const onOther = await prisma.item.count({ where: { team: { eventId: fx.id }, dayId: other } });
    check(
      'F4',
      'a label carrying another event’s session id: on the whole event, counted; no row points at that session',
      same(got, { 'Glazed ham': 'whole', 'Roast lamb': 'S2' }) &&
        onOther === 0 &&
        same(r.json?.plan?.sessionDraft, { sessions: 5, unplaced: 1 }) &&
        unplacedLines().length === before + 1,
      { got, onOther, draft: r.json?.plan?.sessionDraft }
    );
  }
  {
    const fx = await makeEvent('five');
    const before = unplacedLines().length;
    canned = {
      content: reply({
        mains: [
          { name: 'Glazed ham' },
          { name: 'Roast lamb', session: null },
          { name: 'Sausages', session: '' },
          { name: 'Nut roast', session: 'S1' },
        ],
      }),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const got = await placed(fx);
    const lines = unplacedLines().slice(before);
    check(
      'F5',
      'a missing session field (absent, null or empty): on the whole event, counted as missing',
      same(got, {
        'Glazed ham': 'whole',
        'Roast lamb': 'whole',
        Sausages: 'whole',
        'Nut roast': 'S1',
      }) &&
        same(r.json?.plan?.sessionDraft, { sessions: 5, unplaced: 3 }) &&
        lines.length === 1 &&
        lines[0].includes('missing 3, unknown 0, gone 0'),
      { got, lines }
    );
  }
  {
    const fx = await makeEvent('five');
    canned = {
      content: reply({
        mains: [
          { name: 'Glazed ham', session: 'S2' },
          { name: 'Roast lamb', session: 'S2' },
        ],
        dessert: [{ name: 'Pavlova', session: 'S2' }],
        sides_salads: [{ name: 'Garden salad', session: 'S2' }],
      }),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const got = await placed(fx);
    check(
      'F6',
      'every dish on one session: all of them there, nothing counted',
      Object.keys(got).length === 4 &&
        Object.values(got).every((s) => s === 'S2') &&
        same(r.json?.plan?.sessionDraft, { sessions: 5, unplaced: 0 }),
      got
    );
  }
  {
    const fx = await makeEvent('five');
    canned = { content: GOOD5.slice(0, 400), stopReason: 'max_tokens' };
    const before = logged.length;
    const r = await call(liveFinalize, 'finalize', fx.id);
    const [items, teams, ev] = await Promise.all([
      prisma.item.count({ where: { team: { eventId: fx.id } } }),
      prisma.team.count({ where: { eventId: fx.id } }),
      prisma.event.findUnique({ where: { id: fx.id }, select: { aiCallsUsed: true } }),
    ]);
    check(
      'F7',
      'a reply cut off at the cap: 500 naming the truncation, nothing written, the call not counted (as today)',
      r.status === 500 &&
        String(r.json?.details).includes(
          'AI response truncated at token limit (finalize-plan:full)'
        ) &&
        items === 0 &&
        teams === 0 &&
        ev?.aiCallsUsed === 0 &&
        logged.slice(before).some((l) => l.includes('AI response truncated (finalize-plan:full)')),
      { status: r.status, details: r.json?.details, items, teams, used: ev?.aiCallsUsed }
    );
  }

  // ══ B — the write ══════════════════════════════════════════════════════════════════════════
  section('B — the write: one transaction, the session checked inside it, the host’s rows kept');
  {
    const fx = await makeEvent('five');
    const before = unplacedLines().length;
    canned = {
      content: GOOD5,
      during: async () => {
        await prisma.day.delete({ where: { id: fx.days[4] } });
      },
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const got = await placed(fx);
    const lines = unplacedLines().slice(before);
    check(
      'B1',
      'a session removed while the AI answered: its dishes on the whole event, counted as gone',
      r.status === 200 &&
        got['Barbecued lamb chops'] === 'whole' &&
        got['Fresh fruit salad'] === 'whole' &&
        got['Glazed ham'] === 'S2' &&
        same(r.json?.plan?.sessionDraft, { sessions: 5, unplaced: 2 }) &&
        lines.length === 1 &&
        lines[0].includes('missing 0, unknown 0, gone 2'),
      { got, lines }
    );
  }
  {
    const fx = await makeEvent('five');
    canned = { content: GOOD5 };
    await call(liveFinalize, 'finalize', fx.id);
    const all = await rows(fx.id);
    const by = (n: string) => all.find((i) => i.name === n)!;
    const guest = await prisma.person.create({ data: { name: `${TAG} Guest` } });
    note('people', guest.id);
    // The host moves one, protects one; a guest answers one; one is merely asked (still PENDING).
    await prisma.item.update({
      where: { id: by('Glazed ham').id },
      data: { dayId: fx.days[2], source: 'HOST_EDITED' },
    });
    await prisma.item.update({ where: { id: by('Roast lamb').id }, data: { isProtected: true } });
    await prisma.assignment.create({
      data: { itemId: by('Pavlova').id, personId: guest.id, response: 'ACCEPTED' },
    });
    await prisma.assignment.create({
      data: { itemId: by('Sausages').id, personId: guest.id, response: 'PENDING' },
    });
    const keep = ['Glazed ham', 'Roast lamb', 'Pavlova'].map((n) => by(n).id);
    const snap = async () =>
      (await prisma.item.findMany({ where: { id: { in: keep } }, orderBy: { id: 'asc' } })).map(
        (i) => ({ id: i.id, name: i.name, dayId: i.dayId, q: i.quantityAmount, source: i.source })
      );
    const kept0 = await snap();
    canned = {
      content: reply({ mains: [{ name: 'Roast chicken', session: 'S5' }] }),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const kept1 = await snap();
    const after = await rows(fx.id);
    check(
      'B2',
      'a redraft keeps the host’s moved, protected and answered rows exactly (session too); the asked one is replaced',
      r.status === 200 &&
        kept1.length === 3 &&
        same(kept0, kept1) &&
        !after.some((i) => i.name === 'Sausages') &&
        after.some((i) => i.name === 'Roast chicken' && i.dayId === fx.days[4]),
      { kept0, kept1 }
    );
  }
  {
    const fx = await makeEvent('five');
    canned = {
      content: reply(
        {
          mains: [
            { name: 'Glazed ham', session: 'S2' },
            { name: 'Roast lamb', session: 'S2' },
          ],
        },
        { badQuantity: true }
      ),
    };
    const r = await call(liveFinalize, 'finalize', fx.id);
    const [items, teams] = await Promise.all([
      prisma.item.count({ where: { team: { eventId: fx.id } } }),
      prisma.team.count({ where: { eventId: fx.id } }),
    ]);
    check(
      'B3',
      'one transaction: a write that fails part-way leaves nothing (no dish, no team, no session row half-written)',
      r.status === 500 && items === 0 && teams === 0,
      { status: r.status, items, teams }
    );
  }

  // ══ C — regenerate-plan ════════════════════════════════════════════════════════════════════
  section('C — regenerate-plan, both scopes, through the same one definition of the input');
  {
    const fx = await makeEvent('five');
    canned = { content: GOOD5 };
    const fin = await call(liveFinalize, 'finalize', fx.id);
    const ham = (await rows(fx.id)).find((i) => i.name === 'Glazed ham')!;
    const lp = (await rows(fx.id)).find((i) => i.name === 'L&P')!;
    await prisma.item.update({
      where: { id: ham.id },
      data: { dayId: fx.days[2], source: 'HOST_EDITED' },
    });
    await prisma.item.update({ where: { id: lp.id }, data: { source: 'HOST_EDITED' } });
    canned = {
      content: reply({
        mains: [
          { name: 'Roast chicken', session: 'S2' },
          { name: 'Frittata', session: 'S4' },
        ],
        dessert: [{ name: 'Christmas pudding', session: 'S2' }],
      }),
    };
    const r = await call(liveRegenerate, 'regenerate', fx.id, { scope: 'plan' });
    const u = r.prompt?.user ?? '';
    const got = await placed(fx);
    check(
      'C1',
      'the whole plan: the kept rows described with their labels ("S3, Mains: Glazed ham", "whole, ...")',
      u.includes('  - S3, Mains: Glazed ham (4 kg)') &&
        /\n {2}- whole, [^\n]*: L&P \(12 bottles\)/.test(u),
      u.slice(u.indexOf('ITEMS ALREADY'), u.indexOf('ITEMS ALREADY') + 500)
    );
    check(
      'C2',
      'the whole plan: the redraft lands in its sessions, the host’s rows stay where she put them, counted in the reply',
      r.status === 200 &&
        got['Roast chicken'] === 'S2' &&
        got['Frittata'] === 'S4' &&
        got['Christmas pudding'] === 'S2' &&
        got['Glazed ham'] === 'S3' &&
        got['L&P'] === 'whole' &&
        same(r.json?.sessionDraft, { sessions: 5, unplaced: 0 }) &&
        r.calls === 1,
      { got, draft: r.json?.sessionDraft }
    );
    const block = (s: string) => s.slice(s.indexOf('SESSIONS ('), s.indexOf('\n\nThen produce'));
    check(
      'C3',
      'one definition: regenerate’s sessions block is finalize’s, byte for byte',
      block(u).length > 100 && block(u) === block(fin.prompt?.user ?? '')
    );
    const before = (await rows(fx.id)).filter((i) => i.team.name !== 'Dessert');
    canned = {
      content: reply({
        mains: [{ name: 'Stray mains row', session: 'S2' }],
        dessert: [
          { name: 'Berry trifle', session: 'S5' },
          { name: 'Ice cream', session: 'S7' },
        ],
      }),
    };
    const rc = await call(liveRegenerate, 'regenerate', fx.id, {
      scope: 'category',
      categoryKey: 'dessert',
    });
    const got2 = await placed(fx);
    const outside = (await rows(fx.id)).filter((i) => i.team.name !== 'Dessert');
    check(
      'C4',
      'Dessert only: only dessert rows change, each in its session or counted; the stray mains row is not written',
      rc.status === 200 &&
        got2['Berry trifle'] === 'S5' &&
        got2['Ice cream'] === 'whole' &&
        !('Stray mains row' in got2) &&
        same(
          outside.map((i) => [i.id, i.dayId]),
          before.map((i) => [i.id, i.dayId])
        ) &&
        same(rc.json?.sessionDraft, { sessions: 5, unplaced: 1 }),
      { got2, draft: rc.json?.sessionDraft }
    );
  }
  off();

  // ══ E — the cap and the library ════════════════════════════════════════════════════════════
  section('E — the cap and the AI library');
  check(
    'E1',
    'the cap is 16384 and token-limits.ts is c8b9b42’s (no measured need to raise it yet)',
    limits.MAX_TOKENS_FULL_PLAN === 16384 && read(F.limits) === atMain(F.limits)
  );
  check(
    'E2',
    'claude.ts is c8b9b42’s (the founder’s change B: "Do not change claude.ts")',
    read(F.claude) === atMain(F.claude)
  );
  check(
    'E3',
    'both routes ask with the cap, temperature 0.8 and their own labels',
    sent.length > 0 &&
      sent.every(
        (s) =>
          s.cfg?.maxTokens === 16384 &&
          s.cfg?.temperature === 0.8 &&
          /^(finalize-plan:full|regenerate-plan:(plan|category))$/.test(s.cfg?.callSiteLabel)
      )
  );

  // ══ K — the files ══════════════════════════════════════════════════════════════════════════
  section('K — exactly these files, and nothing else in src');
  let k = 0;
  for (const [file, want] of Object.entries(EDITED)) {
    const numstat = (git(['diff', '--numstat', MAIN, '--', file]) ?? '').trim().split(/\s+/);
    check(
      `K${++k}`,
      `${file}: as this ticket wrote it (its SHA-256, and ${want.numstat} lines added and removed against c8b9b42)`,
      sha(read(file)) === want.sha && `${numstat[0]} ${numstat[1]}` === want.numstat,
      { sha: sha(read(file)), numstat: `${numstat[0]} ${numstat[1]}` }
    );
  }
  const changed = (git(['diff', '--name-only', MAIN, '--', 'src']) ?? 'x')
    .split('\n')
    .filter(Boolean)
    .sort();
  const untracked = (git(['ls-files', '--others', '--exclude-standard', 'src']) ?? 'x').trim();
  check(
    `K${++k}`,
    'the edited source files are exactly the five; no new source file, none untracked',
    same(changed, Object.keys(EDITED).sort()) && untracked === '',
    { changed, untracked }
  );
  check(
    `K${++k}`,
    'no migration and no schema change: prisma is as at c8b9b42',
    gitOk(['diff', '--quiet', MAIN, '--', 'prisma']) &&
      (git(['ls-files', '--others', '--exclude-standard', 'prisma']) ?? 'x').trim() === ''
  );
  const routesAt = (ref: string | null) =>
    (
      git(ref ? ['ls-tree', '-r', '--name-only', ref, '--', 'src/app'] : ['ls-files', 'src/app']) ??
      ''
    )
      .split('\n')
      .filter((f) => /\/route\.tsx?$/.test(f))
      .sort();
  check(
    `K${++k}`,
    'no new route: the route files are c8b9b42’s',
    routesAt(null).length > 100 && same(routesAt(null), routesAt(MAIN))
  );
  const pkgDiff = (git(['diff', '-U0', '--no-color', MAIN, '--', 'package.json']) ?? '')
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  check(
    `K${++k}`,
    'package.json gains exactly one line, the script, and the line before it gains its comma; package-lock.json is c8b9b42’s',
    pkgDiff.length === 3 &&
      pkgDiff.includes(
        '+    "test:sessions-drafting": "tsx --tsconfig tests/tsconfig.json tests/sessions-drafting-test.ts"'
      ) &&
      gitOk(['diff', '--quiet', MAIN, '--', 'package-lock.json']),
    pkgDiff
  );
  check(
    `K${++k}`,
    'the send, the nudges, the decide-by clock, the opt-outs, the guest page, Moment 2’s screens, auth, the sessions code, claude.ts and the cap: byte for byte c8b9b42’s',
    gitOk(['diff', '--quiet', MAIN, '--', ...UNTOUCHED])
  );
  const readers = (
    git([
      'grep',
      '-l',
      '-E',
      'isSessionsOn|useSessionsOn|SessionsSwitchProvider|SESSIONS_VAR|GATHER_SESSIONS|sessions/switch',
      '--',
      'src',
    ]) ?? ''
  )
    .split('\n')
    .filter((f) => f && f !== 'src/lib/sessions/switch.ts')
    .sort();
  check(
    `K${++k}`,
    `the switch is read by exactly the ${SWITCH_READERS.length} files named (GTC-483’s eighteen and plan-input.ts)`,
    same(readers, [...SWITCH_READERS].sort()),
    readers
  );
  const added = (git(['diff', '-U0', '--no-color', MAIN, '--', 'src']) ?? 'x')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  check(
    `K${++k}`,
    'no added source line says remind or chase, or names the decide-later marker',
    added.length > 0 && !added.some((l) => /remind|chase|messaging_?undecided/i.test(l)),
    added.filter((l) => /remind|chase|messaging_?undecided/i.test(l))
  );
  check(
    `K${++k}`,
    'one call stays one call: each route still has exactly one AI call in its code',
    [F.finalize, F.regenerate].every((f) => count(read(f), 'callClaudeForJSON<') === 1) &&
      typeof liveWrite.applyPlanSections === 'function' &&
      typeof livePrompts.buildPlanGenerationPrompt === 'function'
  );

  // ══ Z — nothing left the process; every row removed by id ════════════════════════════════
  section('Z — nothing left the process; every row this run made removed by id');
  check('Z1', 'nothing left the process: the trap counted no request at all', trapCount() === 0, {
    trap: trapCount(),
  });
  await cleanUp();
  const left = await Promise.all([
    prisma.event.count({ where: { id: { in: made.events } } }),
    prisma.person.count({ where: { id: { in: made.people } } }),
    prisma.user.count({ where: { id: { in: made.users } } }),
  ]);
  check(
    'Z2',
    'every event, person and user this run made is gone, by id',
    same(left, [0, 0, 0]),
    left
  );
  const endCounts = await tableCounts();
  const moved = Object.keys({ ...startCounts, ...endCounts }).filter(
    (t) => startCounts[t] !== endCounts[t]
  );
  check('Z3', "every table's count is as found", moved.length === 0, moved);
}

main()
  .catch((e) => {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m the run stopped: ${(e as Error).message}`);
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    off();
    try {
      await cleanUp();
    } catch (e) {
      console.log(`clean-up: ${(e as Error).message}`);
    }
    try {
      fs.rmSync(SCRATCH, { recursive: true, force: true });
    } catch {
      // the scratch copy of main's files is outside the repo
    }
    try {
      const left = await prisma.event.count({ where: { id: { in: made.events } } });
      if (left === 0) fs.rmSync(FIXTURE_FILE, { force: true });
    } catch {
      // the fixture file stays, naming what is left
    }
    await prisma.$disconnect();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  });
