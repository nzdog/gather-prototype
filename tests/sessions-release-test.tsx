/**
 * [[GTC-483]] — MULTI-DAY: THE RELEASE (`npm run test:sessions-release`).
 *
 * The founder's rulings on the plan, 26 Nov 2026 (docs/tickets/GTC-483.md): 1, A as option 1 with
 * the everyday word list as shown ("glazed" added by the founder's word in the question box the
 * same day); 2, the query's fourth count kept; 3, the range line reaching later invitations on sent
 * events accepted; 8, this suite, the one moved pin, the runner copy and the order of work.
 *
 *   A  the dish words: the rule name by name, the four sentences word for word, card-words.ts pure,
 *      every caller of the dish list behind the sessions switch
 *   S  exactly these files read the switch, and no nudge, reminder, follow-up, opt-out or send file
 *   N  NOTHING ELSE CHANGES: on made-up events with no sessions, each reader with the switch off
 *      and then on, the answers compared byte for byte; the invitation differs only in its first
 *      line, and only over more than one date with no saved line; the screens draw nothing new but
 *      Moment 1's card
 *   L  an event that already holds a session (as a template copy makes one): what does change
 *   R  the runbook and the read-only count say what the switch reads, and the count only reads
 *   K  card-words.ts is 2c9771b's plus exactly its named hunk; nothing else in src moved
 *   Z  nothing left the process; every row this run made removed by id; every table's count as found
 *
 * N, S, L and R prove what already holds, so they pass before the source and after it. A and K
 * hold the source's change.
 *
 * SAFETY. Nothing is sent: the provider trap (`tests/helpers/provider-trap.ts`) walls the process
 * and counts any request (none is expected at all); the live gate is never opened; the provider
 * keys are removed for this process. The follow-up's finder only reads. No cron is run, and
 * no send or press function is called. Writes only its own rows (names start with the run's TAG);
 * every id is written to the fixture file BEFORE the row is used, and removed by id in `finally`,
 * however the run ends.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-release-test.tsx
 */
import { prisma } from '../src/lib/prisma';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { installProviderTrap, trapCount } from './helpers/provider-trap';

const ROOT = path.join(__dirname, '..');
const BASE = '2c9771b'; // origin/main when GTC-483 began (the merge of GTC-481)
const TAG = `S483${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC483_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc483-release-${TAG}.json`);
const HOUR = 36e5;
const DAY = 24 * HOUR;

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
const atBase = (rel: string) => git(['show', `${BASE}:${rel}`]) ?? '';
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const html = (el: any): string => {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    return `THREW ${(e as Error).message}`;
  }
};
/** JSON with Maps and Sets written out, so two answers compare byte for byte. */
const same = (v: unknown): string =>
  JSON.stringify(v, (_k, x) =>
    x instanceof Map ? { map: [...x.entries()] } : x instanceof Set ? { set: [...x.values()] } : x
  );
async function load(rel: string): Promise<any> {
  try {
    return await import(`../${rel.replace(/\.tsx?$/, '')}`);
  } catch {
    return null;
  }
}

// ── The fixture file: every id, written before the row is used ──────────────────────────────
const made: Record<'users' | 'people' | 'events', string[]> = { users: [], people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}

/** Run `fn` with the switch at `value` (undefined = unset), then put it back to unset. */
async function withSwitch<T>(value: string | undefined, fn: () => T | Promise<T>): Promise<T> {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[VAR];
  else env[VAR] = value;
  try {
    return await fn();
  } finally {
    delete env[VAR];
  }
}
const on = <T,>(fn: () => T | Promise<T>) => withSwitch('on', fn);
const off = <T,>(fn: () => T | Promise<T>) => withSwitch(undefined, fn);
/**
 * The same reader, off then on: both answers, and whether they are the same byte for byte. A
 * reader that throws answers `{ threw }`, which never counts as a real answer (see `real`).
 */
async function offOn<T>(fn: () => T | Promise<T>) {
  const run = async (mode: typeof on) => {
    try {
      return await mode(fn);
    } catch (e) {
      return { threw: (e as Error).message } as any;
    }
  };
  const a = await run(off);
  const b = await run(on);
  return { off: a, on: b, same: same(a) === same(b) };
}
const real = (v: any) => v !== null && v !== undefined && !(typeof v === 'object' && 'threw' in v);

const utcDay = (s: string) => new Date(`${s}T00:00:00.000Z`);
const keyOf = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Pacific/Auckland' }).format(d);

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
  words: 'src/lib/sessions/card-words.ts',
  answers: 'src/lib/sessions/answers.ts',
  sessionsRoute: 'src/app/api/events/[id]/sessions/route.ts',
  guestCard: 'src/components/sessions/GuestSessions.tsx',
  tabs: 'src/components/sessions/SessionTabs.tsx',
  card: 'src/components/sessions/Moment1Sessions.tsx',
  guestRoute: 'src/app/api/p/[token]/route.ts',
  coordRoute: 'src/app/api/c/[token]/route.ts',
  workflow: 'src/lib/workflow.ts',
  runbook: 'docs/release/multi-day-release.md',
  query: 'docs/release/multi-day-release-count.sql',
};

/**
 * S: the files that read the sessions switch today (GTC-478 to GTC-481 and GTC-485), and the one
 * that carries it to the screens (SessionsSwitch.tsx). A new reader turns S1 red until it is named
 * here, so the list of what switching on can change stays complete.
 */
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
  'src/lib/glance/read.ts',
  'src/lib/lifecycle.ts',
  'src/lib/moment3/share-dish.ts',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/workflow.ts',
];

// ── K: the one edited file and its named hunk, [before, after] ──────────────────────────────
const K_HUNKS: Record<string, [string, string][]> = {
  'src/lib/sessions/card-words.ts': [
    [
      '/** "the pavlova"; "the pavlova and the ham"; "the pavlova, the ham and the trifle". */\nexport function dishList(names: readonly string[]): string {\n  const the = names.map((n) => `the ${n}`);\n',
      '/**\n * [[GTC-483]] — THE DISH WORDS (the founder\'s ruling 1 on the plan, 26 Nov 2026: "A: option 1, with\n * the everyday word list as shown"; "glazed" added by the founder\'s word in the question box the\n * same day). A name typed with a capital ("Bread rolls") read "the Bread rolls" mid-sentence. Its\n * first letter is lowered only on a known everyday first word, so a name ("Christmas pudding",\n * "Mum\'s pavlova") reads as typed. Only these four sentences use it, all behind the sessions\n * switch: Moment 1\'s dish warning, the guest\'s question and line, and Moment 3\'s warning.\n */\nconst EVERYDAY_WORDS: ReadonlySet<string> = new Set(\n  `antipasto apple apples avocado bacon bagels baked banana barbecue\n  beans beef beer beetroot berries berry biscuits boiled bread breads\n  brownies buns butter cake cakes candles canapés carrot carrots\n  cheese cheeseboard cheesecake cherries chicken children chilli\n  chilly chips chocolate chops cider cleaning coffee cold coleslaw\n  cookies corn crackers cream crisps cucumber cupcakes cups curry\n  custard cutlery date decorations dessert desserts dip dips dishes\n  drinks dumplings eggs fairy finger fish flowers fresh fried fritters\n  fruit games garden garlic glazed gravy green grilled ham homemade honey\n  hot hummus ice jelly juice kids kumara lamb lamingtons lemon lemonade\n  lettuce lollies lolly marshmallows meat meringue milk mince mini mint\n  mixed muffins mushrooms mussels napkins noodles nuts olives onion\n  oysters party pasta pastries pav pavlova peas picnic pie pies\n  pikelets pineapple pizza plates platter pork potato potatoes prawns\n  pudding pumpkin punch quiche rice roast roasted rolls rubbish salad\n  salads salmon sandwiches sauce sausage sausages savoury scones\n  seafood slaw slice smoked snacks soft soup sparkling spinach sponge\n  spring steak sticky strawberries stuffing sushi sweet tables tart\n  tarts tea tomato tomatoes trifle turkey vegan vege veges vegetables\n  vegetarian veggie veggies washing water watermelon wine wraps`.split(/\\s+/)\n);\n\n/** First words that take no "the" before them; the word itself is lowered ("Some ice"). */\nconst NO_THE_WORDS: ReadonlySet<string> = new Set([\n  \'a\',\n  \'an\',\n  \'the\',\n  \'some\',\n  \'my\',\n  \'our\',\n  \'your\',\n  \'their\',\n  \'his\',\n  \'her\',\n  \'extra\',\n]);\n\nconst lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);\nconst startsCapital = (s: string) => s.length > 0 && s.charAt(0) !== s.charAt(0).toLowerCase();\n/** "Bread": one capital, then small letters only. */\nconst oneCapital = (w: string) => startsCapital(w) && w.slice(1) === w.slice(1).toLowerCase();\n/** A possessive first word without its mark: "Mum\'s" is "Mum", "Kids\'" is "Kids"; else null. */\nfunction possessiveBase(word: string): string | null {\n  if (/[\'’]s$/.test(word)) return word.slice(0, -2);\n  if (/s[\'’]$/.test(word)) return word.slice(0, -1);\n  return null;\n}\n\n/**\n * One dish as a sentence names it: "the bread rolls", "the Christmas pudding", "Mum\'s pavlova",\n * "the pavlova", "some ice", "2 bags of ice". Everything else exactly as typed after "the".\n */\nexport function dishWords(name: string): string {\n  const [first = \'\', next = \'\'] = name.split(/\\s+/);\n  if (/^\\d/.test(first)) return name;\n  if (NO_THE_WORDS.has(first.toLowerCase())) return oneCapital(first) ? lowerFirst(name) : name;\n  const base = possessiveBase(first);\n  const word = base ?? first;\n  const everyday = EVERYDAY_WORDS.has(word.toLowerCase());\n  if (base !== null && !everyday) return name;\n  if (everyday && oneCapital(word) && !startsCapital(next)) return `the ${lowerFirst(name)}`;\n  return `the ${name}`;\n}\n\n/** "the pavlova"; "the pavlova and the ham"; "the pavlova, the ham and the trifle". */\nexport function dishList(names: readonly string[]): string {\n  const the = names.map(dishWords);\n',
    ],
  ],
};

function applyHunks(base: string, hunks: [string, string][]): string | null {
  let s = base;
  for (const [a, b] of hunks) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

async function main() {
  installProviderTrap();
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;
  for (const k of [
    'RESEND_API_KEY',
    'TNZ_AUTH_TOKEN',
    'TWILIO_ACCOUNT_SID',
    'TWILIO_AUTH_TOKEN',
    'TWILIO_PHONE_NUMBER',
    'ANTHROPIC_API_KEY',
  ])
    delete process.env[k];
  delete (process.env as Record<string, string | undefined>)[VAR];

  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];

  const W = await load(F.words);
  const ANS = await load(F.answers);
  const SW = await load('src/lib/sessions/switch.ts');
  const DB = await load('src/lib/decide-by.ts');
  const ED = await load('src/lib/events/event-dates.ts');
  const EL = await load('src/lib/sms/decide-by-eligibility.ts');
  const GR = await load('src/lib/glance/read.ts');
  const RW = await load('src/lib/glance/rewind.ts');
  const RD = await load('src/components/glance/reading.ts');
  const CR = await load('src/lib/chase-reply-read.ts');
  const SD = await load('src/lib/moment3/share-dish.ts');
  const AP = await load('src/lib/preflight/ask-preview.ts');
  const APC = await load('src/lib/preflight/ask-preview-compose.ts');
  const CARD = await load(F.card);
  const GUEST = await load(F.guestCard);

  // ══ A — the dish words ═══════════════════════════════════════════════════════════════════
  section('A — the dish words: a capital lowered only on a known everyday first word');
  const words = (n: string) => (typeof W?.dishWords === 'function' ? W.dishWords(n) : null);
  const NAMES: [string, string, string][] = [
    ['A1', 'Bread rolls', 'the bread rolls'],
    ['A2', 'Christmas pudding', 'the Christmas pudding'],
    ['A3', "Mum's pavlova", "Mum's pavlova"],
    ['A4', 'pavlova', 'the pavlova'],
    ['A5', 'Glazed ham', 'the glazed ham'],
    ['A6', 'Thai green curry', 'the Thai green curry'],
    ['A7', 'Māori bread', 'the Māori bread'],
    ['A8', 'BBQ sausages', 'the BBQ sausages'],
    ['A9', 'Bread Rolls', 'the Bread Rolls'],
    ['A10', 'Kumquat jam', 'the Kumquat jam'],
    ['A11', "Kids' drinks", "the kids' drinks"],
    ['A12', 'Some ice', 'some ice'],
    ['A13', '2 bags of ice', '2 bags of ice'],
  ];
  for (const [id, name, want] of NAMES) {
    check(id, `"${name}" reads "${want}"`, words(name) === want, words(name));
  }
  const SMALL = ['pavlova', 'ham', 'bread rolls', 'glazed ham', 'christmas pudding'];
  check(
    'A14',
    'a plain name typed small reads exactly as before: "the" and the name as typed',
    SMALL.every((n) => words(n) === `the ${n}`),
    SMALL.map(words)
  );
  const C = W?.COMING_WORDS;
  const G = ANS?.GUEST_SESSION_WORDS;
  const AW = ANS?.AWAY_WORDS;
  check(
    'A15',
    "Moment 1's dish warning, one dish, word for word",
    C?.dishWarning?.('Sam', ['Bread rolls'], 'Christmas lunch') ===
      'Sam is down to bring the bread rolls to Christmas lunch. Mark Sam as not coming to Christmas lunch anyway? Nothing changes about the dish.'
  );
  check(
    'A16',
    "Moment 1's dish warning, two dishes, word for word",
    C?.dishWarning?.('Sam', ["Mum's pavlova", 'Christmas pudding'], 'Christmas lunch') ===
      "Sam is down to bring Mum's pavlova and the Christmas pudding to Christmas lunch. Mark Sam as not coming to Christmas lunch anyway? Nothing changes about the dish."
  );
  check(
    'A17',
    "the guest's question, word for word",
    G?.confirm?.('Boxing Day dinner', ['Bread rolls']) ===
      "Can't make Boxing Day dinner? We'll mark the bread rolls No, so your host knows to find someone else."
  );
  check(
    'A18',
    "the guest's line after it, word for word",
    G?.marked?.(['Bread rolls']) ===
      "We've marked the bread rolls No, so your host knows to find someone else."
  );
  check(
    'A19',
    "Moment 3's warning, word for word",
    AW?.warning?.('Jason', 'Christmas pudding', 'Boxing Day dinner') ===
      'Jason is marked as not coming to Boxing Day dinner. Give Jason the Christmas pudding anyway?'
  );
  check(
    'A20',
    'the list keeps its shape: "a and b", "a, b and c"',
    W?.dishList?.(['pavlova', 'ham']) === 'the pavlova and the ham' &&
      W?.dishList?.(['Bread rolls', "Mum's pavlova", 'Christmas pudding']) ===
        "the bread rolls, Mum's pavlova and the Christmas pudding"
  );
  const wordsSrc = read(F.words);
  check(
    'A21',
    'card-words.ts imports nothing, and holds none of the words contacts-untouched N4 bans, nor remind or chase',
    wordsSrc.length > 0 &&
      (wordsSrc.match(/^\s*import\b/gm) ?? []).length === 0 &&
      !/fetch|XMLHttpRequest|sendBeacon|console|dangerouslySetInnerHTML|innerHTML|eval|new RegExp/.test(
        wordsSrc
      ) &&
      !/remind|chase/i.test(wordsSrc)
  );
  check(
    'A22',
    'answers.ts still takes its dish list from card-words.ts and nothing else (one import line)',
    (read(F.answers).match(/^import .*$/gm) ?? []).join('\n') ===
      "import { dishList } from './card-words';"
  );
  const routeSrc = read(F.sessionsRoute);
  const guestSrc = read(F.guestCard);
  const tabsSrc = read(F.tabs);
  const firstGate = (s: string, fn: string) => {
    const at = s.indexOf(`export async function ${fn}(`);
    const body = at < 0 ? '' : s.slice(at, at + 400);
    return /\{\s*if \(!isSessionsOn\(\)\) return closed\(\);/.test(body);
  };
  check(
    'A23',
    'every caller of the dish list is behind the switch: the sessions route refuses first in both handlers; the guest card returns nothing off; Moment 3 warns only through the session plan',
    firstGate(routeSrc, 'GET') &&
      firstGate(routeSrc, 'PUT') &&
      /const on = useSessionsOn\(\);\s*if \(!on\) return null;\s*return <GuestSessionsCard \{\.\.\.props\} \/>;/.test(
        guestSrc
      ) &&
      count(codeOnly(tabsSrc), 'AWAY_WORDS.warning(') === 1 &&
      codeOnly(tabsSrc).indexOf('AWAY_WORDS.warning(') >
        codeOnly(tabsSrc).indexOf('export function useAwayWarning') &&
      /if \(!on \|\| !eventId\) return;/.test(tabsSrc)
  );
  const callers = (
    git(['grep', '-l', '-E', 'dishList|dishWarning|GUEST_SESSION_WORDS|AWAY_WORDS', '--', 'src']) ??
    ''
  )
    .split('\n')
    .filter(Boolean)
    .sort();
  check(
    'A24',
    'the dish words are used in exactly these files (no new caller)',
    JSON.stringify(callers) ===
      JSON.stringify([F.sessionsRoute, F.guestCard, F.tabs, F.answers, F.words].sort()),
    callers
  );

  // ══ S — who reads the switch ═════════════════════════════════════════════════════════════
  section('S — exactly these files read the sessions switch');
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
  const untracked = (git(['ls-files', '--others', '--exclude-standard', 'src']) ?? 'x').trim();
  check(
    'S1',
    `the switch is read by exactly the ${SWITCH_READERS.length} files named (and switch.ts itself); none untracked`,
    JSON.stringify(readers) === JSON.stringify([...SWITCH_READERS].sort()) && untracked === '',
    { readers, untracked }
  );
  const sendSide = readers.filter((f) =>
    /^src\/lib\/(sms|eligibility|press|messages|email-delivery)\/|^src\/app\/api\/cron\/|nudge|chase|wrap-up|decide-by|opt-out/i.test(
      f
    )
  );
  check(
    'S2',
    'no nudge, reminder, follow-up, opt-out, block, send or cron file reads it',
    readers.length > 0 && sendSide.length === 0,
    sendSide
  );
  const calls = (rel: string) => count(codeOnly(read(rel)), 'isSessionsOn()');
  const want: Record<string, number> = {
    'src/lib/preflight/ask-preview.ts': 1,
    'src/lib/lifecycle.ts': 1,
    'src/lib/glance/read.ts': 1,
    'src/lib/moment3/share-dish.ts': 1,
    'src/lib/workflow.ts': 2,
    'src/app/plan/[eventId]/glance/page.tsx': 1,
    'src/app/api/c/[token]/route.ts': 1,
    'src/app/api/p/[token]/route.ts': 1,
  };
  const gotCalls = Object.fromEntries(Object.keys(want).map((f) => [f, calls(f)]));
  check(
    'S3',
    'each server reader reads it in its own places only (the invitation preview once, the deadline once, the board once, the share once, "invites only" and the bring-back once each)',
    same(gotCalls) === same(want),
    gotCalls
  );

  // ══ The made-up events ═══════════════════════════════════════════════════════════════════
  const now = new Date();
  const stamp = Date.now();
  const mail = (who: string) => `gtc483+${who}+${stamp}@example.test`;
  const stem = String(stamp).slice(-5);
  let phoneSeq = 10;
  const phone = () => `+6421${stem}${String(phoneSeq++).padStart(2, '0')}`;
  const keyIn = (days: number) => keyOf(new Date(now.getTime() + days * DAY));
  const start = utcDay(keyIn(8));
  const end = utcDay(keyIn(10));
  const sentAt = new Date(now.getTime() - 3 * DAY);

  const user = await prisma.user.create({ data: { email: mail('host') } });
  note('users', user.id);
  const host = await prisma.person.create({
    data: { name: `${TAG} Kate`, email: mail('host'), userId: user.id },
  });
  note('people', host.id);

  const sentEvent = async (suffix: string) => {
    const id = `${TAG.toLowerCase()}${suffix}`;
    note('events', id);
    await prisma.event.create({
      data: {
        id,
        name: `${TAG} Christmas`,
        startDate: start,
        endDate: end,
        venueName: "Mum's",
        hostId: host.id,
        status: 'CONFIRMING',
        sentAt,
      },
    });
    await prisma.personEvent.create({ data: { personId: host.id, eventId: id, role: 'HOST' } });
    const team = await prisma.team.create({ data: { eventId: id, name: `${TAG} Mains` } });
    return { id, team };
  };
  const guest = async (
    eventId: string,
    teamId: string,
    name: string,
    holds: { item: string; response: string; dayId?: string | null }[]
  ) => {
    const p = await prisma.person.create({
      data: { name: `${TAG} ${name}`, email: mail(name.toLowerCase()), phoneNumber: phone() },
    });
    note('people', p.id);
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'SMS',
        householdRole: 'GUEST',
        sentAt,
      },
    });
    await prisma.accessToken.create({
      data: { token: `${TAG}-${pe.id}`, scope: 'PARTICIPANT', eventId, personId: p.id },
    });
    const items: Record<string, string> = {};
    for (const h of holds) {
      const it = await prisma.item.create({
        data: {
          teamId,
          name: `${TAG} ${h.item}`,
          kind: 'ITEM',
          status: 'ASSIGNED',
          dayId: h.dayId ?? null,
        } as any,
      });
      items[h.item] = it.id;
      await prisma.assignment.create({
        data: { itemId: it.id, personId: p.id, response: h.response as any },
      });
    }
    return { p, pe, items };
  };

  // The sent event, over three dates, with no sessions.
  const S = await sentEvent('s');
  const ann = await guest(S.id, S.team.id, 'Ann', [
    { item: 'pavlova', response: 'MAYBE' },
    { item: 'napkins', response: 'ACCEPTED' },
  ]);
  const ben = await guest(S.id, S.team.id, 'Ben', [{ item: 'trifle', response: 'PENDING' }]);
  const eventRow = await prisma.event.findUniqueOrThrow({ where: { id: S.id } });
  const itemRows = await prisma.item.findMany({
    where: { team: { eventId: S.id } },
    select: {
      name: true,
      dropOffAt: true,
      decideByOffsetHours: true,
      day: { select: { date: true } },
    },
    orderBy: { name: 'asc' },
  });

  // ══ N — nothing else changes ═════════════════════════════════════════════════════════════
  section('N — switch on, no sessions added: every reader answers exactly as with it off');
  const preconditions = [
    await prisma.day.count({ where: { eventId: S.id } }),
    await prisma.sessionAbsence.count({ where: { personEvent: { eventId: S.id } } }),
  ];
  check(
    'N0',
    'the sent event over three dates has no session and no "not at this session" mark',
    preconditions[0] === 0 && preconditions[1] === 0 && keyOf(start) !== keyOf(end),
    preconditions
  );
  const deadlines = await offOn(() => itemRows.map((i) => DB.decideBy(i, eventRow).toISOString()));
  check(
    'N1',
    "every dish's decide-by is the same moment, on and off",
    deadlines.same && real(deadlines.off) && deadlines.off.length === 3,
    deadlines
  );
  const answersOff = await off(() => ED.answersByDay(eventRow, now));
  const answersOn = await on(async () =>
    ED.answersByDay(
      eventRow,
      now,
      await prisma.item.findMany({
        where: { team: { eventId: S.id } },
        select: { day: { select: { date: true } } },
      })
    )
  );
  check(
    'N2',
    '"Answers by": the board\'s on-line (with the plan\'s rows) gives the same day as its off-line',
    typeof answersOff === 'string' && answersOn === answersOff,
    { answersOff, answersOn }
  );
  const board = await offOn(() => GR.readEventGlance(prisma as any, S.id, now));
  check(
    'N3',
    "the board's whole read is the same, byte for byte (no tag, the same colours)",
    board.same && real(board.off) && !same(board.on).includes('"session"'),
    board.same ? 'same' : { off: same(board.off).slice(0, 300), on: same(board.on).slice(0, 300) }
  );
  const peopleOf = (g: any) =>
    g ? [...(g.households ?? []).flatMap((h: any) => h.members), ...(g.unhoused ?? [])] : [];
  const readingOf = (g: any) => peopleOf(g).map((p: any) => RD.readingRowsOf(p.items ?? []));
  check(
    'N4',
    "each person's reading list holds the same rows, with no session key",
    same(readingOf(board.off)) === same(readingOf(board.on)) &&
      readingOf(board.on).flat().length === 3 &&
      readingOf(board.on)
        .flat()
        .every((r: any) => !('session' in r)),
    readingOf(board.on)
  );
  const rewind = await offOn(() => RW.rewindGlanceInputs(prisma as any, S.id, sentAt));
  check(
    'N5',
    "the board's replay since the send is the same",
    rewind.same && real(rewind.off),
    rewind.same || rewind
  );
  const facts = await offOn(() => CR.readReplyFacts(prisma as any, S.id, now));
  check(
    'N6',
    'the reply facts (follow-up owed, already sent) are the same',
    facts.same && real(facts.off),
    facts.same || facts
  );
  // Ann's maybe, inside its follow-up window: its decide-by is the event's end less five days.
  const annDecide = new Date(deadlines.off[itemRows.findIndex((i) => i.name === `${TAG} pavlova`)]);
  const inWindow = new Date(annDecide.getTime() - 12 * HOUR);
  const mine = (r: any) =>
    (r?.eligible ?? [])
      .filter((c: any) => c.eventId === S.id)
      .map((c: any) => ({ who: c.personId, item: c.itemName, at: c.decideByAt }));
  const finder = await offOn(async () => mine(await EL.findDecideByFollowupCandidates(inWindow)));
  check(
    'N7',
    "the maybe follow-up's finder (it only reads): the same people, dish and day, on and off",
    finder.same && real(finder.off) && finder.off.length === 1 && finder.off[0].who === ann.p.id,
    finder
  );
  const share = await offOn(() =>
    SD.readShare(prisma as any, { eventId: S.id, itemId: ann.items.pavlova })
  );
  check(
    'N8',
    "a shared dish's split reads the same (every dish is the whole event's)",
    share.same && real(share.off),
    share.same || share
  );

  // The invitation's preview: three unsent events over 24 to 26 Dec 2026 or one date.
  const draftEvent = async (suffix: string, from: string, to: string, line: string | null) => {
    const id = `${TAG.toLowerCase()}${suffix}`;
    note('events', id);
    await prisma.event.create({
      data: {
        id,
        name: 'Christmas',
        startDate: utcDay(from),
        endDate: utcDay(to),
        venueName: "Mum's",
        hostId: host.id,
        status: 'CONFIRMING',
        askAuthorLine: line,
      },
    });
    await prisma.personEvent.create({ data: { personId: host.id, eventId: id, role: 'HOST' } });
    const p = await prisma.person.create({
      data: { name: `${TAG} Jo ${suffix}`, email: mail(`jo-${suffix}`) },
    });
    note('people', p.id);
    await prisma.personEvent.create({ data: { personId: p.id, eventId: id, role: 'PARTICIPANT' } });
    const t = await prisma.team.create({ data: { eventId: id, name: `${TAG} Mains` } });
    const it = await prisma.item.create({
      data: { teamId: t.id, name: `${TAG} pavlova`, kind: 'ITEM' } as any,
    });
    await prisma.assignment.create({ data: { itemId: it.id, personId: p.id } });
    return id;
  };
  const three = await draftEvent('u3', '2026-12-24', '2026-12-26', null);
  const saved = await draftEvent('l3', '2026-12-24', '2026-12-26', 'Come hungry.');
  const one = await draftEvent('u1', '2026-12-23', '2026-12-23', null);
  const previewOf = (id: string) =>
    AP.readAskPreview(prisma as any, id, 'http://localhost:3000').then((p: any) =>
      p ? JSON.parse(JSON.stringify(p)) : null
    );
  const textsOf = (wire: any) =>
    wire
      ? APC.composePreview(wire, wire.storedAuthorLine)
          .rows.filter((r: any) => r.ask)
          .map((r: any) => ({
            to: r.recipient?.personEventId,
            text: r.ask.text,
            subject: r.ask.subject,
            asSent: r.textAsSent,
            movements: r.ask.movements,
          }))
      : [];
  const RANGE = 'from Thursday, 24 December to Saturday, 26 December';
  const FIRST = 'on Thursday, 24 December';
  const oneP = await offOn(() => previewOf(one));
  check(
    'N9',
    'the invitation over one date: the preview is the same, byte for byte',
    oneP.same && real(oneP.off),
    oneP.same || oneP
  );
  const savedP = await offOn(() => previewOf(saved));
  const savedT = { off: textsOf(savedP.off), on: textsOf(savedP.on) };
  const withoutEnd = (p: any) => {
    if (!p?.event) return p;
    const event = { ...p.event };
    delete event.endDate;
    return { ...p, event };
  };
  check(
    'N10',
    'over three dates with a saved line: every text and email the same; the facts differ only by the last day',
    savedT.off.length > 0 &&
      same(savedT.off) === same(savedT.on) &&
      same(withoutEnd(savedP.on)) === same(savedP.off) &&
      savedT.on.every((t: any) => t.text.includes('Come hungry.') && !t.text.includes(RANGE)),
    savedT
  );
  const threeP = await offOn(() => previewOf(three));
  const threeT = { off: textsOf(threeP.off), on: textsOf(threeP.on) };
  const swapped = same(threeT.on).split(RANGE).join(FIRST);
  check(
    'N11',
    'over three dates with no saved line: the facts differ only by the last day, and every text and email differs ONLY in the first line ("on Thursday, 24 December" becomes the range)',
    threeT.off.length > 0 &&
      same(withoutEnd(threeP.on)) === same(threeP.off) &&
      threeT.on.every((t: any) => t.text.includes(RANGE)) &&
      threeT.off.every((t: any) => !t.text.includes(RANGE) && t.text.includes(FIRST)) &&
      swapped === same(threeT.off),
    { off: threeT.off.map((t: any) => t.text), on: threeT.on.map((t: any) => t.text) }
  );
  const segments = (wire: any) =>
    wire
      ? APC.composePreview(wire, null)
          .rows.filter((r: any) => r.ask)
          .map((r: any) => r.ask.segments)
      : [];
  console.log(
    `    (for the record: the invitation's text segments over three dates, off ${JSON.stringify(segments(threeP.off))}, on ${JSON.stringify(segments(threeP.on))})`
  );

  // The screens, drawn on the server (no effect runs there).
  const Card = CARD?.SessionsCard;
  const empty = (startKey: string, endKey: string) =>
    Card
      ? html(
          createElement(Card, {
            eventId: three,
            initial: {
              sessions: [],
              eventDates: { start: startKey, end: endKey },
              households: [],
              absences: [],
            },
          })
        )
      : 'missing';
  const decode = (s: string) =>
    s
      .replace(/&#x27;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  const many = decode(empty('2026-12-24', '2026-12-26'));
  const single = decode(empty('2026-12-23', '2026-12-23'));
  const CW = W?.CARD_WORDS ?? {};
  check(
    'N12',
    'Moment 1\'s card, the switch on and no session: its heading, the many-dates line, the one-tap fill and "+ Add a session"; no "Who comes to which session"',
    many.includes(CW.heading) &&
      many.includes(CW.emptyManyDates) &&
      many.includes(CW.fillEachDate) &&
      many.includes(CW.add) &&
      !many.includes('Who comes to which session'),
    many.slice(0, 300)
  );
  check(
    'N13',
    'Moment 1\'s card on a one-day event: the one-day line and "+ Add a session", no one-tap fill',
    single.includes(CW.emptyOneDay) &&
      single.includes(CW.add) &&
      !single.includes(CW.fillEachDate) &&
      !single.includes(CW.emptyManyDates),
    single.slice(0, 300)
  );
  const GuestCard = GUEST?.GuestSessionsCard;
  const guestCard = (sessions: any[]) =>
    GuestCard
      ? html(
          createElement(GuestCard, {
            token: 'x',
            attendance: 'YES',
            assignments: [],
            onChanged: () => {},
            initial: sessions,
          })
        )
      : 'missing';
  const oneSession = [
    {
      id: 'd1',
      name: 'Christmas lunch',
      label: 'Christmas lunch, Fri 25 Dec',
      coming: true,
      attendance: 'YES',
    },
  ];
  check(
    'N14',
    "the guest's sessions card draws nothing with no session, or with one",
    guestCard([]) === '' && guestCard(oneSession) === '',
    [guestCard([]), guestCard(oneSession)]
  );
  check(
    'N15',
    'Moments 2 and 3: the tabs and the Session list draw only when the event has a session',
    count(tabsSrc, 'const on = plan !== null && sessions.length > 0;') === 2 &&
      count(tabsSrc, 'if (!tabs.on) return null;') === 1 &&
      count(tabsSrc, 'if (!choice.on) return null;') === 1
  );
  const guestRoute = read(F.guestRoute);
  check(
    'N16',
    'the guest page\'s dish line changes only for a dish with a session (both day lines spread the label inside "a dish has a day")',
    count(guestRoute, '...sessionLabel(a.item.day)') === 2 &&
      count(guestRoute, 'day: a.item.day\n') === 2
  );
  check(
    'N17',
    'the coordinator page sorts sessions only when there are some to sort; "invites only" and the bring-back touch only sessions',
    read(F.coordRoute).includes(
      'const days = (isSessionsOn() ? sortSessions(dayRows) : dayRows).map('
    ) &&
      read(F.workflow).includes(
        'const keepSessions = opts.bringBack === true && isSessionsOn();'
      ) &&
      read(F.workflow).includes(
        'if (!isSessionsOn()) await tx.day.deleteMany({ where: { eventId } });'
      )
  );

  // ══ L — an event that already holds a session ════════════════════════════════════════════
  section('L — an event that already holds a session: what switching on does change for it');
  const Lv = await sentEvent('t');
  const day1 = await prisma.day.create({ data: { eventId: Lv.id, name: 'Day 1', date: start } });
  const cal = await guest(Lv.id, Lv.team.id, 'Cal', [
    { item: 'Bread rolls', response: 'MAYBE', dayId: day1.id },
  ]);
  const lEvent = await prisma.event.findUniqueOrThrow({ where: { id: Lv.id } });
  const lItem = await prisma.item.findUniqueOrThrow({
    where: { id: cal.items['Bread rolls'] },
    select: { dropOffAt: true, decideByOffsetHours: true, day: { select: { date: true } } },
  });
  const lDeadline = await offOn(() => DB.decideBy(lItem, lEvent).getTime());
  check(
    'L1',
    "a dish on a session: its decide-by counts from the session's date while on (earlier), from the event's end off",
    typeof lDeadline.on === 'number' && lDeadline.on < lDeadline.off,
    lDeadline
  );
  const lBoard = await offOn(() => GR.readEventGlance(prisma as any, Lv.id, now));
  const calRows = (g: any) => peopleOf(g).find((p: any) => p.personId === cal.p.id)?.items ?? [];
  check(
    'L2',
    "the board tags that dish with its session's name while on, and not off",
    calRows(lBoard.on)[0]?.session === 'Day 1' &&
      !('session' in (calRows(lBoard.off)[0] ?? { session: 1 })),
    { on: calRows(lBoard.on), off: calRows(lBoard.off) }
  );

  // ══ R — the runbook and the count ════════════════════════════════════════════════════════
  section('R — the runbook and the read-only count');
  const runbook = read(F.runbook);
  check(
    'R1',
    'the runbook names the switch exactly as the code reads it: `GATHER_SESSIONS`, value `on`',
    SW?.SESSIONS_VAR === 'GATHER_SESSIONS' &&
      runbook.includes('`GATHER_SESSIONS` with the value `on`') &&
      runbook.includes('Delete the variable `GATHER_SESSIONS`')
  );
  const sql = read(F.query);
  const sqlCode = sql.replace(/--.*$/gm, '');
  const COLUMNS = [
    'events_with_sessions',
    'events_with_not_coming_marks',
    'unsent_events_over_more_than_one_date',
    'sent_multi_date_still_ahead_without_own_line',
  ];
  check(
    'R2',
    'the count only reads: a read-only transaction that ends by rolling back, one SELECT, no word that writes',
    /^\s*BEGIN TRANSACTION READ ONLY;\s*SELECT\b/.test(sqlCode) &&
      /ROLLBACK;\s*$/.test(sqlCode) &&
      count(sqlCode, ';') === 3 &&
      !/\b(insert|update|delete|merge|alter|drop|create|truncate|grant|revoke|copy|vacuum|commit|call|do|lock|set)\b/i.test(
        sqlCode.replace(/AT TIME ZONE/g, '')
      )
  );
  check(
    'R3',
    'its four counts are the four the runbook asks you to write down',
    COLUMNS.every((c) => count(sqlCode, `AS ${c}`) === 1 && runbook.includes(`\`${c}\``))
  );

  // ══ K — the files ════════════════════════════════════════════════════════════════════════
  section('K — card-words.ts is 2c9771b’s with exactly its named hunk; nothing else in src moved');
  let k = 0;
  for (const [file, hunks] of Object.entries(K_HUNKS)) {
    k++;
    const want = applyHunks(atBase(file), hunks);
    check(
      `K${k}`,
      `${file}: ${BASE} plus exactly its ${hunks.length} named hunk(s)`,
      want !== null && read(file) === want
    );
  }
  const changed = (git(['diff', '--name-only', BASE, '--', 'src']) ?? 'x')
    .split('\n')
    .filter(Boolean);
  check(
    `K${++k}`,
    'the edited source files are exactly the one named; no new source file, none untracked',
    JSON.stringify(changed) === JSON.stringify(Object.keys(K_HUNKS)) && untracked === '',
    { changed, untracked }
  );
  check(
    `K${++k}`,
    'no migration and no schema change: prisma is as at 2c9771b',
    git(['diff', '--quiet', BASE, '--', 'prisma']) !== null &&
      (git(['ls-files', '--others', '--exclude-standard', 'prisma']) ?? 'x').trim() === ''
  );
  const pkgDiff = (git(['diff', '-U0', '--no-color', BASE, '--', 'package.json']) ?? '')
    .split('\n')
    .filter((l) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l));
  check(
    `K${++k}`,
    'package.json gains exactly one line, the script, and the line before it gains its comma; package-lock.json is as at 2c9771b',
    pkgDiff.length === 3 &&
      pkgDiff.includes(
        '+    "test:sessions-release": "tsx --tsconfig tests/tsconfig.json tests/sessions-release-test.tsx"'
      ) &&
      git(['diff', '--quiet', BASE, '--', 'package-lock.json']) !== null,
    pkgDiff
  );
  const added = (git(['diff', '-U0', '--no-color', BASE, '--', 'src']) ?? 'x')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  check(
    `K${++k}`,
    'no added source line says remind or chase',
    added.length > 0 && !added.some((l) => /remind|chase/i.test(l)),
    added.filter((l) => /remind|chase/i.test(l))
  );

  // ══ Z — nothing left the process; every row removed by id ════════════════════════════════
  section('Z — nothing left the process; every row this run made removed by id');
  check('Z1', 'nothing left the process: the trap counted no request at all', trapCount() === 0, {
    trap: trapCount(),
  });
  await cleanUp();
  const sentAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  check(
    'Z2',
    'the OutboundMessage and InviteEvent counts are as found',
    JSON.stringify(sentAfter) === JSON.stringify(sentBefore),
    { sentBefore, sentAfter }
  );
  const left = await Promise.all([
    prisma.event.count({ where: { id: { in: made.events } } }),
    prisma.person.count({ where: { id: { in: made.people } } }),
    prisma.user.count({ where: { id: { in: made.users } } }),
  ]);
  check(
    'Z3',
    "none of this run's events, people or users is left",
    left.every((n) => n === 0),
    left
  );
  const endCounts = await tableCounts();
  const moved = Object.keys({ ...startCounts, ...endCounts }).filter(
    (t) => startCounts[t] !== endCounts[t]
  );
  check('Z4', "every table's count is as found", moved.length === 0, moved);
  void ben;
}

main()
  .catch((e) => {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m the run stopped: ${(e as Error).message}`);
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    try {
      await cleanUp();
    } catch (e) {
      console.log(`clean-up: ${(e as Error).message}`);
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
