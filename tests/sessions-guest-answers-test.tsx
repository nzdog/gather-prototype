/**
 * [[GTC-481]] — MULTI-DAY: GUESTS ANSWER PER SESSION, AND ATTENDANCE AND DISHES STAY CONSISTENT
 * (`npm run test:sessions-guest-answers`).
 *
 * The founder's rulings on the plan, 25 Nov 2026 (docs/tickets/GTC-481.md): 1, a guest changes their
 * own sessions through their own link, any but their last, and can add one back with "I can make
 * it", the dishes staying No; a carried child's sessions stay the host's to set. 2, a per-session
 * decline is an ordinary No on each of the guest's own dishes on that session, asked first, nothing
 * new sent. 3, Moment 3 warns ("Give anyway", "Pick someone else") and "Want me to suggest?" never
 * suggests such a person for that dish. 4, a session's date moved after the send asks why (T5),
 * nothing sent. 5, the words as listed, each weekday from its date. 6, the new address, the layout,
 * the guest page's two pieces, Suite 23 and the pins.
 *
 *   B  pure: "coming" for one session; the headcount per session; the tab's second line
 *   W  every word, word for word; answers.ts imports only the card words
 *   R  the new address /api/p/<link>/sessions in this process, the switch off and on, on a made-up
 *      event with Sure and Jason (the founder's 22 Nov example): only the link holder's own marks
 *      and own dishes on that session move; the last session refused; coming back
 *   P  the guest's card drawn on the server: nothing without the switch; the words with it
 *   T  the tabs' second line drawn with headcounts; as before without them
 *   C  Moment 3's warning reads nothing while the switch is off
 *   E  a session's date after the send: the rule's truth table, the session PATCH carrying the why
 *      into the ledger, and the sessions GET giving the event's phase
 *   K  each of the seven edited files is 6e84218's with exactly its named hunks; the new source
 *      files are exactly the four; package.json gains one line; the route list one entry; no
 *      migration
 *   Z  nothing left the process; every row this run made removed by id; every table's count as found
 *
 * SAFETY. Nothing is sent: the provider trap (`tests/helpers/provider-trap.ts`) walls the process and
 * nothing here calls a sender (the new address writes marks, answers, ledger and log lines only). No
 * cron runs. Writes only its own rows (names start with the run's TAG); every id is written to the
 * fixture file BEFORE the row is used, and removed by id in `finally`, however the run ends.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-guest-answers-test.tsx
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
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const ROOT = path.join(__dirname, '..');
const BASE = '6e84218'; // origin/main when GTC-481 began (the merge of GTC-485)
const TAG = `S481${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC481_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc481-guest-answers-${TAG}.json`);

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
/** Loads a module, or null when it is not there yet (the red run, before the source). */
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
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

type Res = { status: number; json: any };
/** One handler, called in this process; `as` is a session token, '' for none, null for no stand-in. */
async function call(
  mod: any,
  method: 'GET' | 'PUT' | 'PATCH',
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
  if (as === '') actAsNobody();
  else if (as !== null) actAs(as);
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
    // The answers' log lines first, then the events with everything they hold (teams, items and
    // their assignments, sessions and their marks, households, places, links, roles, ledger).
    await prisma.inviteEvent.deleteMany({ where: { eventId: { in: events } } });
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

// ── The seven edited files and their named hunks, each [before, after] (K) ──────────────────
// Each `before` must be found exactly once (in order); 6e84218's file with every hunk applied must
// be the file now, byte for byte.
const K_HUNKS: Record<string, [string, string][]> = {
  'src/app/p/[token]/page.tsx': [
    [
      "import { askHostLine } from '@/lib/guest/questions-line';\n\n",
      "import { askHostLine } from '@/lib/guest/questions-line';\nimport GuestSessions from '@/components/sessions/GuestSessions';\n\n",
    ],
    [
      '\n          {/* GTC-191 (a) and (b) — TWO SECTIONS, NEVER INTERLEAVED, AND HERS FIRST.\n',
      "\n          {/* [[GTC-481]] A: the sessions the guest is down for, and a way to say they can't\n              make one. It draws nothing while the sessions switch is off, or with fewer than two\n              sessions. */}\n          <GuestSessions\n            token={token}\n            attendance={data.attendance}\n            assignments={data.assignments}\n            onChanged={fetchData}\n          />\n\n          {/* GTC-191 (a) and (b) — TWO SECTIONS, NEVER INTERLEAVED, AND HERS FIRST.\n",
    ],
  ],
  'src/components/sessions/SessionTabs.tsx': [
    [
      "} from '@/lib/sessions/tabs';\n\n",
      "} from '@/lib/sessions/tabs';\nimport {\n  AWAY_WORDS,\n  sessionHeadcounts,\n  tabDateLine,\n  type HeadcountHousehold,\n  type SessionMark,\n} from '@/lib/sessions/answers';\n\n",
    ],
    [
      '  load: () => void;\n}\n',
      "  load: () => void;\n  /** [[GTC-481]] C and D: each household's named people, and who is not at which session. */\n  households: HeadcountHousehold[];\n  absences: SessionMark[];\n}\n",
    ],
    [
      'const noop = () => {};\n\n',
      'const noop = () => {};\n/** [[GTC-481]]: no households and no marks, until the sessions route answers. */\nconst NO_MARKS: { households: HeadcountHousehold[]; absences: SessionMark[] } = {\n  households: [],\n  absences: [],\n};\n\n',
    ],
    [
      '  const [open, setOpen] = useState<string | null>(initialOpen);\n\n',
      '  const [open, setOpen] = useState<string | null>(initialOpen);\n  const [marks, setMarks] = useState(NO_MARKS);\n\n',
    ],
    [
      '        const body = (await res.json()) as { sessions?: TabSession[] };\n',
      '        const body = (await res.json()) as {\n          sessions?: TabSession[];\n          households?: HeadcountHousehold[];\n          absences?: SessionMark[];\n        };\n',
    ],
    [
      '        setSessions(body.sessions.map(({ id, name, date }) => ({ id, name, date })));\n      } catch {\n',
      "        setSessions(body.sessions.map(({ id, name, date }) => ({ id, name, date })));\n        // [[GTC-481]] C and D: the same reply's households and marks, for the warning and the counts.\n        setMarks({\n          households: Array.isArray(body.households) ? body.households : [],\n          absences: Array.isArray(body.absences) ? body.absences : [],\n        });\n      } catch {\n",
    ],
    [
      '    () => (on ? { sessions, open, setOpen, load } : null),\n    [on, sessions, open, load]\n',
      '    () => (on ? { sessions, open, setOpen, load, ...marks } : null),\n    [on, sessions, open, load, marks]\n',
    ],
    [
      '  keyOf: (row: SessionRow) => string;\n}\n',
      '  keyOf: (row: SessionRow) => string;\n  /** [[GTC-481]] D: how many are at each session, by its id; null until the households are read. */\n  headcounts: Record<string, number> | null;\n}\n',
    ],
    [
      '  return { on, tabs, open, setOpen: setOpen ?? noop, shown, keyOf };\n',
      "  // [[GTC-481]] D: each session's headcount, from the households and marks the route gave.\n  const households = plan?.households;\n  const absences = plan?.absences;\n  const headcounts = useMemo(\n    () =>\n      on && households && absences && households.length > 0\n        ? sessionHeadcounts(\n            sessions.map((s) => s.id),\n            households,\n            absences\n          )\n        : null,\n    [on, sessions, households, absences]\n  );\n  return { on, tabs, open, setOpen: setOpen ?? noop, shown, keyOf, headcounts };\n",
    ],
    [
      '        const isOpen = t.key === tabs.open;\n        return (\n',
      '        const isOpen = t.key === tabs.open;\n        // [[GTC-481]] D: the date, then the session\'s headcount ("Thu 25 Dec · 14 coming").\n        const line = tabDateLine(t.date, tabs.headcounts?.[t.key]);\n        return (\n',
    ],
    ['            {t.date && (\n', '            {line && (\n'],
    ['                {t.date}\n', '                {line}\n'],
    [
      '      </select>\n    </div>\n  );\n}\n',
      '      </select>\n    </div>\n  );\n}\n\n/**\n * [[GTC-481]] C (the founder\'s ruling 3 on the plan, 25 Nov 2026): Moment 3\'s warning before a\n * session\'s dish goes to someone marked as not at that session. `isAway` reads the plan\'s marks (none\n * while the switch is off, so it is always false there); `ask` opens the box and answers true for\n * "Give anyway", false for "Pick someone else". `element` is drawn once by the view; it is nothing\n * until a warning is open.\n */\nexport function useAwayWarning() {\n  const plan = useContext(SessionPlanContext);\n  const id = useId();\n  const [pending, setPending] = useState<{ words: string; answer: (go: boolean) => void } | null>(\n    null\n  );\n  const absences = plan?.absences ?? NO_MARKS.absences;\n  const sessions = plan?.sessions ?? NO_SESSIONS;\n  const isAway = useCallback(\n    (personEventId: string | undefined, dayId: string | null | undefined) =>\n      !!personEventId &&\n      !!dayId &&\n      absences.some((a) => a.personEventId === personEventId && a.dayId === dayId),\n    [absences]\n  );\n  const ask = useCallback(\n    (person: string, dish: string, dayId: string) =>\n      new Promise<boolean>((answer) =>\n        setPending({\n          words: AWAY_WORDS.warning(person, dish, sessions.find((s) => s.id === dayId)?.name ?? \'\'),\n          answer,\n        })\n      ),\n    [sessions]\n  );\n  const close = (go: boolean) => {\n    pending?.answer(go);\n    setPending(null);\n  };\n  const element = pending ? (\n    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4">\n      <div\n        role="alertdialog"\n        aria-modal="true"\n        aria-labelledby={id}\n        data-away-warning=""\n        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"\n      >\n        <p id={id} className="text-sm text-gray-900">\n          {pending.words}\n        </p>\n        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">\n          <button\n            type="button"\n            onClick={() => close(false)}\n            className="min-h-[44px] px-3 text-sm text-gray-600 hover:text-gray-900"\n          >\n            {AWAY_WORDS.pickSomeoneElse}\n          </button>\n          <button\n            type="button"\n            onClick={() => close(true)}\n            className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-dark"\n          >\n            {AWAY_WORDS.giveAnyway}\n          </button>\n        </div>\n      </div>\n    </div>\n  ) : null;\n  return { isAway, ask, element };\n}\n',
    ],
  ],
  'src/components/plan/Moment3AssignView.tsx': [
    [
      "import { SessionTabRow, useSessionTabs } from '@/components/sessions/SessionTabs';\n",
      "import { SessionTabRow, useAwayWarning, useSessionTabs } from '@/components/sessions/SessionTabs';\n",
    ],
    [
      '  }, [tabsOn, arriveAtItem, allItems, openTab, tabKeyOf]);\n  // [[GTC-385]] (item 59, Q11): the key shows only when a dish is marked; here without "tap a dish".\n',
      '  }, [tabsOn, arriveAtItem, allItems, openTab, tabKeyOf]);\n  /*\n   * [[GTC-481]] C (decision 3): who is marked as not at which session, read from the session plan,\n   * each person found by their place on the event (the households\' rows). Off, or no marks: nobody.\n   */\n  const { isAway, ask: askAway, element: awayBox } = useAwayWarning();\n  const placeOf = useMemo(\n    () =>\n      new Map(\n        households.flatMap((h) => h.members.map((m) => [m.personId, (m as { id?: string }).id]))\n      ),\n    [households]\n  );\n  // [[GTC-385]] (item 59, Q11): the key shows only when a dish is marked; here without "tap a dish".\n',
    ],
    [
      "  const nameOf = (personId: string) => rows.find((r) => r.personId === personId)?.name ?? '';\n  const proposals = useMemo(\n",
      "  const nameOf = (personId: string) => rows.find((r) => r.personId === personId)?.name ?? '';\n  // [[GTC-481]] C (ruling 3): \"Want me to suggest?\" never suggests someone marked as not at the\n  // dish's session.\n  const proposals = useMemo(\n",
    ],
    [
      '        rows\n      ),\n',
      '        rows\n      ).filter(\n        (g) => !isAway(placeOf.get(g.personId), allItems.find((i) => i.id === g.itemId)?.dayId)\n      ),\n',
    ],
    ['    [allItems, holders, rows]\n', '    [allItems, holders, rows, isAway, placeOf]\n'],
    [
      '\n  /** One change, shown at once (dimmed) and saved; after the send its why is asked first. */\n',
      "\n  /**\n   * [[GTC-481]] C (decision 3): a session's dish given or moved to someone marked as not at that\n   * session asks first. True to go on; false when the host picks someone else.\n   */\n  const warnIfAway = async (itemId: string, personId: string | null): Promise<boolean> => {\n    const item = allItems.find((i) => i.id === itemId);\n    if (!personId || !item?.dayId || !isAway(placeOf.get(personId), item.dayId)) return true;\n    return askAway(nameOf(personId), item.name, item.dayId);\n  };\n\n  /** One change, shown at once (dimmed) and saved; after the send its why is asked first. */\n",
    ],
    [
      '    asking.current = true;\n    const answer = await askForReason(\n',
      '    asking.current = true;\n    if (!(await warnIfAway(itemId, personId))) {\n      asking.current = false;\n      setPending((prev) => without(prev, itemId));\n      return;\n    }\n    const answer = await askForReason(\n',
    ],
    [
      '    if (item.id in pending || asking.current) return false;\n    const cut = preview.rows.filter((r) => {\n',
      "    if (item.id in pending || asking.current) return false;\n    // [[GTC-481]] C: the copy is on the dish's session, so the same warning first.\n    asking.current = true;\n    const goOn = await warnIfAway(item.id, personId);\n    asking.current = false;\n    if (!goOn) return false;\n    const cut = preview.rows.filter((r) => {\n",
    ],
    [
      '      {detailBox}\n    </div>\n',
      '      {detailBox}\n      {/* [[GTC-481]] C — the warning, over the box too, while it is open. */}\n      {awayBox}\n    </div>\n',
    ],
  ],
  'src/components/sessions/Moment1Sessions.tsx': [
    [
      "import ComingTo, { type ComingHousehold } from '@/components/sessions/ComingTo';\n\n",
      "import ComingTo, { type ComingHousehold } from '@/components/sessions/ComingTo';\nimport { useReasonPrompt } from '@/components/plan/ReasonPrompt';\nimport type { SerialisedEvent } from '@/lib/lifecycle';\n\n",
    ],
    [
      '  absences: { personEventId: string; dayId: string }[];\n}\n',
      "  absences: { personEventId: string; dayId: string }[];\n  /** [[GTC-481]] E: the event's phase, so a date moved after the send asks why first. */\n  lifecycle?: SerialisedEvent;\n}\n",
    ],
    [
      '  const [asking, setAsking] = useState<string | null>(null);\n\n',
      '  const [asking, setAsking] = useState<string | null>(null);\n  const { ask: askWhy, element: whyBox } = useReasonPrompt();\n\n',
    ],
    [
      '    const at = form.at;\n    const ok =\n',
      "    const at = form.at;\n    // [[GTC-481]] E (decision 4): a session's date moved after the send asks why first, as the event's\n    // own date does (T5). Nothing is sent. A new session, or a rename, never asks.\n    const was = sessions.find((s) => s.id === at);\n    const why =\n      was && was.date !== form.date\n        ? await askWhy(\n            { action: 'EDIT_DAY', targetType: 'Day', targetId: at, field: 'date' },\n            state.lifecycle\n          )\n        : { proceed: true, reason: null };\n    if (!why.proceed) return;\n    const ok =\n",
    ],
    [
      "            fetch(`${daysUrl}/${at}`, json('PATCH', { name: form.name, date: form.date }))\n",
      "            fetch(\n              `${daysUrl}/${at}`,\n              json('PATCH', { name: form.name, date: form.date, reason: why.reason })\n            )\n",
    ],
    [
      '      )}\n    </div>\n',
      '      )}\n      {/* [[GTC-481]] E: the why box, over the page, only while a moved date asks. */}\n      {whyBox}\n    </div>\n',
    ],
  ],
  'src/app/api/events/[id]/sessions/route.ts': [
    [
      '      select: { startDate: true, endDate: true },\n',
      '      select: { startDate: true, endDate: true, status: true, sentAt: true },\n',
    ],
    [
      '      absences,\n    });\n',
      "      absences,\n      // [[GTC-481]] E: the event's phase, so the card asks why before a session's date moves after\n      // the send (the why-scope rule, src/lib/ledger.ts). Read by the card only.\n      lifecycle: {\n        status: event.status,\n        sentAt: event.sentAt ? event.sentAt.toISOString() : null,\n        endDate: event.endDate.toISOString(),\n      },\n    });\n",
    ],
  ],
  'src/app/api/events/[id]/days/[dayId]/route.ts': [
    [
      ' * field, never asking why. 200 with the session.\n',
      " * field. [[GTC-481]] E (decision 4): a new date after the send carries the host's why (`reason`, or\n * null when skipped), as the event's own date does; a rename never asks. 200 with the session.\n",
    ],
    [
      "  if (date && 'error' in date) return NextResponse.json({ error: date.error }, { status: 400 });\n\n",
      "  if (date && 'error' in date) return NextResponse.json({ error: date.error }, { status: 400 });\n  const reason =\n    typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;\n\n",
    ],
    [
      '      await recordChange(tx, { eventId, actor: actor!, changes });\n',
      '      await recordChange(tx, { eventId, actor: actor!, changes, reason });\n',
    ],
  ],
  'src/lib/ledger.ts': [
    [
      '\n    // Everything else is versioned and never interrogated. Enumerated explicitly\n',
      "\n    /*\n     * [[GTC-481]] E (decision 4): a session's date moved after the send asks why, as the event's own\n     * date does (T5): its guests were asked for that date. A rename or a new place on the same date\n     * is versioned and never asks. This takes the date out of GTC-478's note below.\n     */\n    case 'EDIT_DAY':\n      return change.field === 'date' ? 'T5' : null;\n\n    // Everything else is versioned and never interrogated. Enumerated explicitly\n",
    ],
    [
      "    case 'CREATE_DAY':\n    case 'EDIT_DAY':\n    case 'DELETE_DAY':\n",
      "    case 'CREATE_DAY':\n    case 'DELETE_DAY':\n",
    ],
  ],
};

const NEW_SRC = [
  'src/app/api/p/[token]/sessions/route.ts',
  'src/app/p/[token]/layout.tsx',
  'src/components/sessions/GuestSessions.tsx',
  'src/lib/sessions/answers.ts',
];
const ENTRY = {
  filePath: 'src/app/api/p/[token]/sessions/route.ts',
  apiPath: '/api/p/:token/sessions',
  methods: ['GET', 'PUT'],
  authType: 'TOKEN',
  authEvidence: ['resolveToken'],
  securityIssues: [],
};
/** React writes an apostrophe as &#x27;; read the words as a guest reads them. */
const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
const utc = (s: string) => new Date(`${s}T00:00:00.000Z`);

async function main() {
  liveBehindTrap();
  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];

  const A = await load('../src/lib/sessions/answers');
  const ROUTE = await load('../src/app/api/p/[token]/sessions/route');
  const GS = await load('../src/components/sessions/GuestSessions');
  const SW = await load('../src/components/sessions/SessionsSwitch');
  const ST = await load('../src/components/sessions/SessionTabs');
  const TABS = await load('../src/lib/sessions/tabs');
  const LEDGER = await load('../src/lib/ledger');
  const DAY_ROUTE = await load('../src/app/api/events/[id]/days/[dayId]/route');
  const SESSIONS_ROUTE = await load('../src/app/api/events/[id]/sessions/route');

  // ══ B — pure ══════════════════════════════════════════════════════════════════════════════
  section('B — "coming" for one session, the headcount per session, the tab\'s second line');
  const WHOLE = ['PENDING', 'YES', 'NO', 'UNKNOWN'];
  const truth = WHOLE.flatMap((w) =>
    [false, true].map((m) => `${w}/${m}:${A?.sessionAttendance?.(w, m)}`)
  );
  check(
    'B1',
    'a "not at this session" mark reads NO for that session; with no mark the whole event\'s reading stands (each of the four readings)',
    JSON.stringify(truth) ===
      JSON.stringify(WHOLE.flatMap((w) => [`${w}/false:${w}`, `${w}/true:NO`])),
    truth
  );
  const households = [
    { littleCount: 2, people: [{ personEventId: 'a' }, { personEventId: 'b' }] },
    { littleCount: 1, people: [{ personEventId: 'c' }] },
    { littleCount: 3, people: [] },
  ];
  const marks = [
    { personEventId: 'a', dayId: 's2' },
    { personEventId: 'c', dayId: 's3' },
    { personEventId: 'a', dayId: 's4' },
    { personEventId: 'b', dayId: 's4' },
  ];
  const hc = A?.sessionHeadcounts?.(['s1', 's2', 's3', 's4'], households, marks);
  check(
    'B2',
    "no marks: Moment 1's count, every named person and every kid without a job (3 + 6 = 9)",
    hc?.s1 === 9,
    hc
  );
  check(
    'B3',
    "one named person marked off: one fewer (8); their household's kids without jobs still come",
    hc?.s2 === 8,
    hc
  );
  check(
    'B4',
    'every named person of a household marked off: its kids without jobs drop out with them (7, and 5 with both of the first household off); a household with no named people keeps its kids at every session',
    hc?.s3 === 7 && hc?.s4 === 5,
    hc
  );
  const line = A?.tabDateLine;
  check(
    'B5',
    'the tab\'s second line: "Thu 25 Dec · 14 coming"; "1 coming" alone when the name is the date; the date alone (as before) with no headcount',
    line?.('Thu 25 Dec', 14) === 'Thu 25 Dec · 14 coming' &&
      line?.(null, 1) === '1 coming' &&
      line?.('Thu 25 Dec', undefined) === 'Thu 25 Dec' &&
      line?.(null, undefined) === null
  );

  // ══ W — the words ═════════════════════════════════════════════════════════════════════════
  section('W — every word, word for word (ruling 5)');
  const GW = A?.GUEST_SESSION_WORDS;
  const RW = A?.SESSION_ANSWER_WORDS;
  const AW = A?.AWAY_WORDS;
  check(
    'W1',
    '"You\'re down for ..." with one, two and three sessions',
    GW?.downFor(['Christmas lunch']) === "You're down for Christmas lunch." &&
      GW?.downFor(['Christmas lunch', 'Boxing Day dinner']) ===
        "You're down for Christmas lunch and Boxing Day dinner." &&
      GW?.downFor(['Christmas Eve dinner', 'Christmas lunch', 'Boxing Day dinner']) ===
        "You're down for Christmas Eve dinner, Christmas lunch and Boxing Day dinner."
  );
  check(
    'W2',
    'the buttons and what they read aloud',
    GW?.cantMake === "Can't make it" &&
      GW?.cantMakeAloud('Christmas lunch') === "Can't make Christmas lunch" &&
      GW?.notComing === 'Not coming' &&
      GW?.canMake === 'I can make it' &&
      GW?.canMakeAloud('Boxing Day dinner') === 'I can make Boxing Day dinner'
  );
  check(
    'W3',
    'the question first, with one dish and with two, and its two buttons',
    GW?.confirm('Boxing Day dinner', ['pavlova']) ===
      "Can't make Boxing Day dinner? We'll mark the pavlova No, so your host knows to find someone else." &&
      GW?.confirm('Boxing Day dinner', ['pavlova', 'ham']) ===
        "Can't make Boxing Day dinner? We'll mark the pavlova and the ham No, so your host knows to find someone else." &&
      GW?.confirmYes === "Can't make it" &&
      GW?.confirmNo === 'Go back'
  );
  check(
    'W4',
    'after a decline, after coming back, and when it fails',
    GW?.marked(['pavlova']) ===
      "We've marked the pavlova No, so your host knows to find someone else." &&
      GW?.stayNo === 'Anything you marked No stays No. You can change it below.' &&
      GW?.failed === "That didn't go through. Please try again."
  );
  check(
    'W5',
    "the new address's own words",
    RW?.comingMissing === 'Say whether you can make this session' &&
      RW?.lastSession === "That's the only session you're down for"
  );
  check(
    'W6',
    "Moment 3's warning and its two buttons",
    AW?.warning('Jason', 'pavlova', 'Boxing Day dinner') ===
      'Jason is marked as not coming to Boxing Day dinner. Give Jason the pavlova anyway?' &&
      AW?.giveAnyway === 'Give anyway' &&
      AW?.pickSomeoneElse === 'Pick someone else'
  );
  const withDate = (name: string, date: string) => TABS?.sessionWithDate?.({ name, date });
  check(
    'W7',
    "each session's words take the weekday from its date (Thu 24, Fri 25, Sat 26 Dec 2026)",
    withDate('Christmas Eve dinner', '2026-12-24') === 'Christmas Eve dinner, Thu 24 Dec' &&
      withDate('Christmas lunch', '2026-12-25') === 'Christmas lunch, Fri 25 Dec' &&
      withDate('Boxing Day dinner', '2026-12-26') === 'Boxing Day dinner, Sat 26 Dec'
  );
  const answersSrc = read('src/lib/sessions/answers.ts');
  check(
    'W8',
    "answers.ts imports only GTC-479's card words, and names none of the words contacts-untouched N4 bans, comments included",
    answersSrc.length > 0 &&
      (answersSrc.match(/^import .*$/gm) ?? []).join('\n') ===
        "import { dishList } from './card-words';" &&
      !/fetch|XMLHttpRequest|sendBeacon|console|dangerouslySetInnerHTML|innerHTML|eval|new RegExp/.test(
        answersSrc
      )
  );

  // ══ Fixtures ══════════════════════════════════════════════════════════════════════════════
  const expiresAt = new Date(Date.now() + 864e5);
  const hostUser = await prisma.user.create({
    data: { email: `${TAG}-host@example.com`.toLowerCase() },
  });
  note('users', hostUser.id);
  const host = await prisma.person.create({
    data: { name: `${TAG} host`, email: hostUser.email, userId: hostUser.id },
  });
  note('people', host.id);
  const hostSession = randomBytes(32).toString('hex');
  await prisma.session.create({ data: { userId: hostUser.id, token: hostSession, expiresAt } });
  const person = async (name: string) => {
    const p = await prisma.person.create({ data: { name: `${TAG} ${name}` } });
    note('people', p.id);
    return p;
  };
  const newEvent = async (k: string, extra: Record<string, unknown> = {}) => {
    const id = `${TAG.toLowerCase()}${k}`;
    note('events', id);
    return prisma.event.create({
      data: {
        id,
        name: `${TAG} ${k}`,
        startDate: utc('2026-12-24'),
        endDate: utc('2026-12-26'),
        status: 'DRAFT',
        hostId: host.id,
        ...extra,
      },
    });
  };
  const X = await newEvent('family');
  const Y = await newEvent('other');
  const tX = await prisma.team.create({ data: { name: `${TAG} X`, eventId: X.id } });
  const tY = await prisma.team.create({ data: { name: `${TAG} Y`, eventId: Y.id } });
  const sure = await person('Sure');
  const jason = await person('Jason');
  const mia = await person('Mia');
  const hhSure = await prisma.household.create({ data: { eventId: X.id } });
  const hhJason = await prisma.household.create({ data: { eventId: X.id } });
  const place = (personId: string, eventId: string, teamId: string, extra = {}) =>
    prisma.personEvent.create({
      data: { personId, eventId, teamId, role: 'PARTICIPANT', ...extra },
    });
  const sureOnX = await place(sure.id, X.id, tX.id, {
    householdId: hhSure.id,
    householdRole: 'PRIMARY_CONTACT',
  });
  const miaOnX = await place(mia.id, X.id, tX.id, {
    householdId: hhSure.id,
    householdRole: 'CHILD',
  });
  const jasonOnX = await place(jason.id, X.id, tX.id, {
    householdId: hhJason.id,
    householdRole: 'PRIMARY_CONTACT',
  });
  const jasonOnY = await place(jason.id, Y.id, tY.id);
  const session = (eventId: string, name: string, date: string) =>
    prisma.day.create({ data: { name, date: utc(date), eventId } });
  const eve = await session(X.id, 'Christmas Eve dinner', '2026-12-24');
  const lunch = await session(X.id, 'Christmas lunch', '2026-12-25');
  const boxing = await session(X.id, 'Boxing Day dinner', '2026-12-26');
  const yDay = await session(Y.id, 'Another lunch', '2026-12-25');
  const dish = async (
    teamId: string,
    personId: string,
    name: string,
    dayId: string | null,
    response: 'PENDING' | 'MAYBE' = 'PENDING'
  ) => {
    const item = await prisma.item.create({ data: { name, teamId, status: 'ASSIGNED', dayId } });
    return prisma.assignment.create({ data: { itemId: item.id, personId, response } });
  };
  const salad = await dish(tX.id, sure.id, 'salad', eve.id);
  const pavlova = await dish(tX.id, sure.id, 'pavlova', lunch.id);
  const ham = await dish(tX.id, sure.id, 'ham', boxing.id);
  const biscuits = await dish(tX.id, mia.id, 'biscuits', eve.id);
  const trifle = await dish(tX.id, jason.id, 'trifle', lunch.id);
  const rolls = await dish(tX.id, jason.id, 'rolls', boxing.id, 'MAYBE');
  const wine = await dish(tX.id, jason.id, 'wine', null);
  const chips = await dish(tY.id, jason.id, 'chips', yDay.id);
  const link = async (personId: string, eventId: string) => {
    const token = `${TAG}-${randomBytes(12).toString('hex')}`;
    await prisma.accessToken.create({
      data: { token, scope: 'PARTICIPANT', personId, eventId, expiresAt },
    });
    return token;
  };
  const sureLink = await link(sure.id, X.id);
  const jasonLink = await link(jason.id, X.id);
  const jasonLinkY = await link(jason.id, Y.id);

  const all = [salad, pavlova, ham, biscuits, trifle, rolls, wine, chips];
  const responses = async () =>
    Object.fromEntries(
      (
        await prisma.assignment.findMany({
          where: { id: { in: all.map((a) => a.id) } },
          select: { id: true, response: true, item: { select: { name: true } } },
        })
      ).map((a) => [a.item.name, a.response])
    );
  const markList = async () =>
    (
      await prisma.sessionAbsence.findMany({
        where: { personEventId: { in: [sureOnX.id, miaOnX.id, jasonOnX.id, jasonOnY.id] } },
        select: { personEventId: true, dayId: true },
      })
    )
      .map(
        (m) =>
          `${m.personEventId === jasonOnX.id ? 'jason' : m.personEventId === sureOnX.id ? 'sure' : 'other'}:${m.dayId === eve.id ? 'eve' : m.dayId === lunch.id ? 'lunch' : m.dayId === boxing.id ? 'boxing' : 'y'}`
      )
      .sort();
  const footprint = async () =>
    JSON.stringify([
      await markList(),
      await responses(),
      await prisma.auditEntry.count({ where: { eventId: { in: [X.id, Y.id] } } }),
      await prisma.inviteEvent.count({ where: { eventId: { in: [X.id, Y.id] } } }),
      await prisma.outboundMessage.count(),
    ]);
  const put = (token: string, body: unknown) =>
    on(() => call(ROUTE, 'PUT', `/api/p/${token}/sessions`, { token }, null, body));
  const get = (token: string) =>
    on(() => call(ROUTE, 'GET', `/api/p/${token}/sessions`, { token }, null));
  const waitFor = async (fn: () => Promise<boolean>) => {
    for (let i = 0; i < 50; i++) {
      if (await fn()) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return fn();
  };

  // ══ R — the new address ═══════════════════════════════════════════════════════════════════
  section("R — /api/p/<link>/sessions: the guest's own sessions (Sure and Jason)");
  const atStart = await footprint();
  const shut = await off(async () => [
    await call(ROUTE, 'GET', `/api/p/${jasonLink}/sessions`, { token: jasonLink }, null),
    await call(ROUTE, 'PUT', `/api/p/${jasonLink}/sessions`, { token: jasonLink }, null, {
      dayId: eve.id,
      coming: false,
    }),
  ]);
  check(
    'R1',
    "switch off: GET and PUT on Jason's own link answer 404, and nothing is written",
    shut.map((r) => r.status).join(',') === '404,404' && (await footprint()) === atStart,
    shut.map((r) => r.status)
  );
  const first = await get(jasonLink);
  const seen = (r: Res) =>
    (r.json?.sessions ?? []).map((s: any) => `${s.label}|${s.coming}|${s.attendance}`);
  check(
    'R2',
    "switch on, Jason's GET: the three sessions in date order with their words, all coming, each reading the whole event's UNKNOWN (he holds a maybe)",
    first.status === 200 &&
      JSON.stringify(seen(first)) ===
        JSON.stringify([
          'Christmas Eve dinner, Thu 24 Dec|true|UNKNOWN',
          'Christmas lunch, Fri 25 Dec|true|UNKNOWN',
          'Boxing Day dinner, Sat 26 Dec|true|UNKNOWN',
        ]),
    seen(first)
  );
  const r3 = await put(jasonLink, { dayId: eve.id, coming: false });
  const line3 = await prisma.auditEntry.findMany({
    where: { eventId: X.id, actionType: 'EDIT_ATTENDANCE' },
    select: {
      actorId: true,
      actorKind: true,
      field: true,
      before: true,
      after: true,
      reasonRequired: true,
    },
  });
  check(
    'R3',
    "Jason can't make Christmas Eve dinner (no dish of his there): 200, nothing declined, one mark (his), one EDIT_ATTENDANCE line by Jason as a guest, coming to not coming, never asking why",
    r3.status === 200 &&
      JSON.stringify(r3.json?.declined) === '[]' &&
      JSON.stringify(await markList()) === JSON.stringify(['jason:eve']) &&
      line3.length === 1 &&
      line3[0].actorId === jason.id &&
      line3[0].actorKind === 'GUEST' &&
      line3[0].field === `session:${eve.id}` &&
      line3[0].before === 'coming' &&
      line3[0].after === 'not coming' &&
      line3[0].reasonRequired === false,
    { status: r3.status, json: r3.json, line3 }
  );
  const r4 = await put(jasonLink, { dayId: boxing.id, coming: false });
  const after4 = await responses();
  check(
    'R4',
    "Jason can't make Boxing Day dinner: 200, his rolls (a maybe) turn No and nothing else moves: his trifle and wine, Sure's ham, Mia's biscuits and his chips on the other event are as they were",
    r4.status === 200 &&
      JSON.stringify(r4.json?.declined) === JSON.stringify(['rolls']) &&
      JSON.stringify(after4) ===
        JSON.stringify({
          salad: 'PENDING',
          pavlova: 'PENDING',
          ham: 'PENDING',
          biscuits: 'PENDING',
          trifle: 'PENDING',
          rolls: 'DECLINED',
          wine: 'PENDING',
          chips: 'PENDING',
        }),
    { status: r4.status, json: r4.json, after4 }
  );
  const declinedLine = await prisma.auditEntry.findMany({
    where: { eventId: X.id, actionType: 'DECLINE_ASSIGNMENT' },
    select: { actorId: true, details: true },
  });
  const logged = await waitFor(
    async () =>
      (await prisma.inviteEvent.count({
        where: { eventId: X.id, personId: jason.id, type: 'RESPONSE_SUBMITTED' },
      })) === 1
  );
  const logLine = await prisma.inviteEvent.findFirst({
    where: { eventId: X.id, personId: jason.id, type: 'RESPONSE_SUBMITTED' },
    select: { metadata: true },
  });
  check(
    'R5',
    'the history says it as a tap on No does: one "Declined rolls" line by Jason, and one answered log line for the rolls (was a maybe)',
    declinedLine.length === 1 &&
      declinedLine[0].actorId === jason.id &&
      declinedLine[0].details === 'Declined rolls' &&
      logged &&
      (logLine?.metadata as any)?.itemName === 'rolls' &&
      (logLine?.metadata as any)?.response === 'DECLINED' &&
      (logLine?.metadata as any)?.previousResponse === 'MAYBE',
    { declinedLine, logLine }
  );
  const before6 = await footprint();
  const r6 = await put(jasonLink, { dayId: lunch.id, coming: false });
  check(
    'R6',
    `Jason can't make Christmas lunch, the only session he is left down for: 409 "${A?.SESSION_ANSWER_WORDS?.lastSession}", nothing written`,
    r6.status === 409 &&
      r6.json?.error === "That's the only session you're down for" &&
      (await footprint()) === before6,
    r6
  );
  const r7 = await get(jasonLink);
  check(
    'R7',
    "Jason's GET now: Christmas Eve and Boxing Day dinner not coming (NO for each); Christmas lunch coming, with the whole event's reading (PENDING: his rolls are No, his trifle and wine unanswered)",
    JSON.stringify(seen(r7)) ===
      JSON.stringify([
        'Christmas Eve dinner, Thu 24 Dec|false|NO',
        'Christmas lunch, Fri 25 Dec|true|PENDING',
        'Boxing Day dinner, Sat 26 Dec|false|NO',
      ]),
    seen(r7)
  );
  const r8 = await put(jasonLink, { dayId: boxing.id, coming: true });
  const lines8 = await prisma.auditEntry.findMany({
    where: { eventId: X.id, actionType: 'EDIT_ATTENDANCE', field: `session:${boxing.id}` },
    orderBy: { sequence: 'asc' },
    select: { before: true, after: true },
  });
  check(
    'R8',
    'Jason can make Boxing Day dinner after all: 200, his mark there gone, his rolls still No (ruling 1), and its second line not coming to coming',
    r8.status === 200 &&
      JSON.stringify(await markList()) === JSON.stringify(['jason:eve']) &&
      (await responses()).rolls === 'DECLINED' &&
      JSON.stringify(lines8) ===
        JSON.stringify([
          { before: 'coming', after: 'not coming' },
          { before: 'not coming', after: 'coming' },
        ]),
    { status: r8.status, lines8 }
  );
  const before9 = await footprint();
  const r9 = await put(jasonLink, { dayId: boxing.id, coming: true });
  check(
    'R9',
    'the same answer again: 200, and nothing is written',
    r9.status === 200 && (await footprint()) === before9,
    r9.status
  );
  const r10 = await get(sureLink);
  check(
    'R10',
    "Sure's GET: all three coming (Jason's marks are his own)",
    JSON.stringify(seen(r10).map((s: string) => s.split('|')[1])) === '["true","true","true"]',
    seen(r10)
  );
  const r11 = await put(sureLink, { dayId: eve.id, coming: false });
  const after11 = await responses();
  // The salad's log line is written after the answer; wait for it, so nothing lands later.
  const logged11 = await waitFor(
    async () =>
      (await prisma.inviteEvent.count({
        where: { eventId: X.id, personId: sure.id, type: 'RESPONSE_SUBMITTED' },
      })) === 1
  );
  check(
    'R11',
    "Sure can't make Christmas Eve dinner: her salad turns No; Mia's biscuits on that session stay as they were (a carried child's sessions and dishes are the host's, ruling 1)",
    r11.status === 200 &&
      JSON.stringify(r11.json?.declined) === JSON.stringify(['salad']) &&
      logged11 &&
      after11.salad === 'DECLINED' &&
      after11.biscuits === 'PENDING' &&
      after11.pavlova === 'PENDING' &&
      after11.ham === 'PENDING',
    { status: r11.status, after11 }
  );
  const before12 = await footprint();
  const r12 = await put(jasonLinkY, { dayId: lunch.id, coming: false });
  check(
    'R12',
    'Jason\'s link for the other event, with the family event\'s session: 400 "That session is not on this event", nothing written',
    r12.status === 400 &&
      r12.json?.error === 'That session is not on this event' &&
      (await footprint()) === before12,
    r12
  );
  const r13 = await put(jasonLink, {
    dayId: boxing.id,
    coming: false,
    personEventId: sureOnX.id,
    personId: sure.id,
  });
  check(
    'R13',
    "Jason's link with Sure's place and id in the body: only Jason's own mark is written; Sure's marks and her ham are as they were",
    r13.status === 200 &&
      JSON.stringify(await markList()) ===
        JSON.stringify(['jason:boxing', 'jason:eve', 'sure:eve']) &&
      (await responses()).ham === 'PENDING',
    { status: r13.status, marks: await markList() }
  );

  // ══ P — the guest's card on the page ══════════════════════════════════════════════════════
  section("P — the guest's card: nothing without the switch; the words with it");
  const rows = [
    { response: 'PENDING', item: { name: 'pavlova', day: { id: 'd2' } } },
    { response: 'DECLINED', item: { name: 'ham', day: { id: 'd3' } } },
  ];
  const three = [
    {
      id: 'd1',
      name: 'Christmas Eve dinner',
      label: 'Christmas Eve dinner, Thu 24 Dec',
      coming: true,
      attendance: 'PENDING',
    },
    {
      id: 'd2',
      name: 'Christmas lunch',
      label: 'Christmas lunch, Fri 25 Dec',
      coming: true,
      attendance: 'PENDING',
    },
    {
      id: 'd3',
      name: 'Boxing Day dinner',
      label: 'Boxing Day dinner, Sat 26 Dec',
      coming: false,
      attendance: 'NO',
    },
  ];
  const props = { token: 'made-up', attendance: 'PENDING', assignments: rows, onChanged: () => {} };
  const draw = (el: any) => {
    try {
      return renderToStaticMarkup(el);
    } catch (e) {
      return `THREW ${(e as Error).message}`;
    }
  };
  check(
    'P1',
    'drawn without the switch (no layout, as a test draws the page): nothing at all',
    !!GS?.default && draw(createElement(GS.default, props)) === ''
  );
  check(
    'P2',
    'drawn under the switch, off: nothing at all',
    !!SW?.SessionsSwitchProvider &&
      !!GS?.default &&
      draw(
        createElement(SW.SessionsSwitchProvider, { on: false }, createElement(GS.default, props))
      ) === ''
  );
  const card = text(
    draw(createElement(GS?.GuestSessionsCard ?? 'div', { ...props, initial: three }))
  );
  check(
    'P3',
    'the card: "You\'re down for" the two it is down for, each session\'s words, "Can\'t make it" on each of the two, "Not coming" and "I can make it" on the third, read aloud by name',
    card.includes("You're down for Christmas Eve dinner and Christmas lunch.") &&
      card.includes('Christmas Eve dinner, Thu 24 Dec') &&
      card.includes('Christmas lunch, Fri 25 Dec') &&
      card.includes('Boxing Day dinner, Sat 26 Dec') &&
      count(card, ">Can't make it</button>") === 2 &&
      card.includes('aria-label="Can\'t make Christmas lunch"') &&
      count(card, '>Not coming<') === 1 &&
      count(card, '>I can make it</button>') === 1 &&
      card.includes('aria-label="I can make Boxing Day dinner"'),
    card.slice(0, 600)
  );
  const lastOne = text(
    draw(
      createElement(GS?.GuestSessionsCard ?? 'div', {
        ...props,
        initial: three.map((s) => ({ ...s, coming: s.id === 'd2' })),
      })
    )
  );
  check(
    'P4',
    'down for one session only: no "Can\'t make it" on it (missing every session is the whole event\'s No)',
    lastOne.includes("You're down for Christmas lunch.") && !lastOne.includes("Can't make it"),
    lastOne.slice(0, 400)
  );
  check(
    'P5',
    'the guest has said "Can\'t make it" to the whole event, or there are fewer than two sessions: nothing at all',
    !!GS?.GuestSessionsCard &&
      draw(createElement(GS.GuestSessionsCard, { ...props, attendance: 'NO', initial: three })) ===
        '' &&
      draw(createElement(GS.GuestSessionsCard, { ...props, initial: three.slice(0, 1) })) === ''
  );
  const page = read('src/app/p/[token]/page.tsx');
  const basePage = atBase('src/app/p/[token]/page.tsx');
  check(
    'P6',
    "the page: the card's one import and one placement, with its four props; no new request and no new state on the page",
    count(page, "import GuestSessions from '@/components/sessions/GuestSessions';") === 1 &&
      count(page, '<GuestSessions\n') === 1 &&
      /<GuestSessions\n\s*token=\{token\}\n\s*attendance=\{data\.attendance\}\n\s*assignments=\{data\.assignments\}\n\s*onChanged=\{fetchData\}\n\s*\/>/.test(
        page
      ) &&
      count(codeOnly(page), 'fetch(') === count(codeOnly(basePage), 'fetch(') &&
      count(codeOnly(page), 'useState') === count(codeOnly(basePage), 'useState')
  );
  const layout = read('src/app/p/[token]/layout.tsx');
  check(
    'P7',
    "the guest page's layout: connection() first, then the switch read on the server, handed to the page through the provider, and nothing else drawn",
    /await connection\(\);\s*return <SessionsSwitchProvider on=\{isSessionsOn\(\)\}>\{children\}<\/SessionsSwitchProvider>;/.test(
      layout
    )
  );
  const cardSrc = read('src/components/sessions/GuestSessions.tsx');
  const fetches = [...cardSrc.matchAll(/\bfetch\(\s*([^,)]+)/g)].map((m) => m[1].trim());
  check(
    'P8',
    "the card asks only its own address, the guest's link's /sessions (a read and a PUT), and returns before its read while the switch is off",
    JSON.stringify(fetches) === JSON.stringify(['url', 'url']) &&
      cardSrc.includes('const url = `/api/p/${token}/sessions`;') &&
      /const on = useSessionsOn\(\);\s*if \(!on\) return null;\s*return <GuestSessionsCard \{\.\.\.props\} \/>;/.test(
        cardSrc
      ),
    fetches
  );

  // ══ T — the tabs ══════════════════════════════════════════════════════════════════════════
  section("T — Moments 2 and 3's tabs: the headcount after the date");
  const tabs = [
    { key: 's1', name: 'Christmas lunch', date: 'Fri 25 Dec', count: 6 },
    { key: 's2', name: 'Sat 26 Dec', date: null, count: 2 },
    { key: 'whole', name: 'Whole event', date: null, count: 4 },
  ];
  const view = (headcounts: Record<string, number> | null, onNow = true) => ({
    on: onNow,
    tabs,
    open: 's1',
    setOpen: () => {},
    shown: [],
    keyOf: () => 'whole',
    headcounts,
  });
  const row = (v: any) => text(draw(createElement(ST?.SessionTabRow ?? 'div', { tabs: v })));
  const withCounts = row(view({ s1: 14, s2: 1 }));
  check(
    'T1',
    'with headcounts: "Fri 25 Dec · 14 coming", "1 coming" alone under a name that is the date, and "Whole event (4)" with no number',
    withCounts.includes('>Fri 25 Dec · 14 coming<') &&
      withCounts.includes('>1 coming<') &&
      withCounts.includes('>Whole event (4)<') &&
      count(withCounts, 'coming') === 2,
    withCounts.slice(0, 900)
  );
  const without = row(view(null));
  check(
    'T2',
    'without them (the households not read yet, or a test with no plan): the date alone, as before',
    without.includes('>Fri 25 Dec<') && !without.includes('coming'),
    without.slice(0, 600)
  );
  check(
    'T3',
    'the switch off: no tab row at all',
    !!ST?.SessionTabRow && row(view({ s1: 14 }, false)) === ''
  );

  // ══ C — Moment 3's warning ════════════════════════════════════════════════════════════════
  section("C — Moment 3's warning");
  const Probe = () => {
    const w = ST.useAwayWarning();
    return createElement('span', null, `${w.isAway('pe', 'day')}|${w.element === null}`);
  };
  check(
    'C1',
    'without the session plan (the switch off): nobody is away and no box is drawn',
    !!ST?.useAwayWarning && text(draw(createElement(Probe))) === '<span>false|true</span>'
  );
  const m3 = read('src/components/plan/Moment3AssignView.tsx');
  const m3Base = atBase('src/components/plan/Moment3AssignView.tsx');
  check(
    'C2',
    'Moment 3 makes no new request (its fetches as at 6e84218), asks before the why in a give or move and before a share, and draws the box once',
    count(codeOnly(m3), 'fetch(') === count(codeOnly(m3Base), 'fetch(') &&
      count(m3, 'await warnIfAway(') === 2 &&
      m3.indexOf('if (!(await warnIfAway(itemId, personId))) {') <
        m3.indexOf('const answer = await askForReason(') &&
      count(m3, '{awayBox}') === 1
  );

  // ══ E — a session's date after the send ═══════════════════════════════════════════════════
  section("E — a session's date moved after the send asks why (T5); nothing sent");
  const SENT = {
    status: 'CONFIRMING',
    sentAt: new Date('2026-11-20T00:00:00Z'),
    endDate: utc('2026-12-26'),
  };
  const DRAFT = { status: 'DRAFT', sentAt: null, endDate: utc('2026-12-26') };
  const why = (field: string | undefined, ev: any, action = 'EDIT_DAY') =>
    LEDGER?.whyTrigger?.(
      { action, targetType: 'Day', targetId: 'd', ...(field ? { field } : {}) },
      ev
    );
  check(
    'E1',
    "a session's date after the send asks (T5); before the send it never does",
    why('date', SENT) === 'T5' && why('date', DRAFT) === null
  );
  check(
    'E2',
    'a rename, a reorder or no field never asks, and the other session lines never do',
    why('name', SENT) === null &&
      why('displayOrder', SENT) === null &&
      why(undefined, SENT) === null &&
      why(undefined, SENT, 'CREATE_DAY') === null &&
      why(undefined, SENT, 'DELETE_DAY') === null &&
      why(undefined, SENT, 'EDIT_ATTENDANCE') === null
  );
  const Z = await newEvent('sent', { status: 'CONFIRMING', sentAt: new Date() });
  await prisma.eventRole.create({ data: { userId: hostUser.id, eventId: Z.id, role: 'HOST' } });
  const zDay = await session(Z.id, 'Boxing Day dinner', '2026-12-26');
  const patch = (body: unknown) =>
    on(() =>
      call(
        DAY_ROUTE,
        'PATCH',
        `/api/events/${Z.id}/days/${zDay.id}`,
        { id: Z.id, dayId: zDay.id },
        hostSession,
        body
      )
    );
  const outboundBefore = await prisma.outboundMessage.count();
  const moved = await patch({ date: '2026-12-25', reason: 'Moved to Christmas Day' });
  const dateLine = await prisma.auditEntry.findFirst({
    where: { eventId: Z.id, actionType: 'EDIT_DAY', field: 'date' },
    select: { reason: true, reasonRequired: true },
  });
  check(
    'E3',
    "the session PATCH, after the send, a new date with the host's why: 200; its date line carries the why and is marked as owed one; nothing sent",
    moved.status === 200 &&
      dateLine?.reason === 'Moved to Christmas Day' &&
      dateLine?.reasonRequired === true &&
      (await prisma.outboundMessage.count()) === outboundBefore,
    { moved, dateLine }
  );
  const renamed = await patch({ name: 'Christmas Day dinner' });
  const nameLine = await prisma.auditEntry.findFirst({
    where: { eventId: Z.id, actionType: 'EDIT_DAY', field: 'name' },
    select: { reason: true, reasonRequired: true },
  });
  check(
    'E4',
    'a rename after the send: its line is owed no why and carries none',
    renamed.status === 200 && nameLine?.reasonRequired === false && nameLine?.reason === null,
    { renamed, nameLine }
  );
  const phase = await on(() =>
    call(SESSIONS_ROUTE, 'GET', `/api/events/${Z.id}/sessions`, { id: Z.id }, hostSession)
  );
  check(
    'E5',
    "the sessions GET gives Moment 1's card the event's phase (its status, when it was sent, its end)",
    phase.status === 200 &&
      phase.json?.lifecycle?.status === 'CONFIRMING' &&
      typeof phase.json?.lifecycle?.sentAt === 'string' &&
      phase.json?.lifecycle?.endDate === utc('2026-12-26').toISOString(),
    phase.json?.lifecycle
  );
  const m1 = read('src/components/sessions/Moment1Sessions.tsx');
  check(
    'E6',
    "Moment 1's card asks through the existing why box only when the date changes, and sends the answer with the PATCH",
    m1.includes("import { useReasonPrompt } from '@/components/plan/ReasonPrompt';") &&
      m1.includes("{ action: 'EDIT_DAY', targetType: 'Day', targetId: at, field: 'date' },") &&
      m1.includes("json('PATCH', { name: form.name, date: form.date, reason: why.reason })") &&
      count(m1, '{whyBox}') === 1
  );

  // ══ K — the files ═════════════════════════════════════════════════════════════════════════
  section('K — each edited file is 6e84218’s with exactly its named hunks, byte for byte');
  let k = 0;
  for (const [file, hunks] of Object.entries(K_HUNKS)) {
    k++;
    const base = atBase(file);
    let want: string | null = base.length > 0 ? base : null;
    for (const [a, b] of hunks) {
      if (want === null || count(want, a) !== 1) {
        want = null;
        break;
      }
      want = want.replace(a, () => b);
    }
    check(
      `K${k}`,
      `${file}: 6e84218 plus exactly its ${hunks.length} named hunk(s)`,
      want !== null && read(file) === want
    );
  }
  const srcNow = (git(['ls-files', 'src']) ?? '').split('\n').filter(Boolean);
  const srcBase = (git(['ls-tree', '-r', '--name-only', BASE, 'src']) ?? '')
    .split('\n')
    .filter(Boolean);
  const untrackedSrc = (git(['ls-files', '--others', '--exclude-standard', 'src']) ?? 'x').trim();
  const added = srcNow.filter((f) => !srcBase.includes(f)).sort();
  check(
    `K${++k}`,
    'the new source files are exactly the four (the address, the layout, the card, the words), none untracked, none removed',
    JSON.stringify(added) === JSON.stringify([...NEW_SRC].sort()) &&
      srcBase.every((f) => srcNow.includes(f)) &&
      untrackedSrc === '',
    { added, untrackedSrc }
  );
  const changed = (git(['diff', '--name-only', BASE, '--', 'src']) ?? '')
    .split('\n')
    .filter(Boolean);
  check(
    `K${++k}`,
    'the edited source files are exactly the seven named, and the four new ones',
    JSON.stringify(changed.sort()) === JSON.stringify([...Object.keys(K_HUNKS), ...NEW_SRC].sort()),
    changed
  );
  const addedLines = (git(['diff', '-U0', '--no-color', BASE, '--', 'src']) ?? 'x')
    .split('\n')
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'));
  check(
    `K${++k}`,
    'no added line says remind or chase',
    addedLines.length > 0 && !addedLines.some((l) => /remind|chase/i.test(l)),
    addedLines.filter((l) => /remind|chase/i.test(l))
  );
  check(
    `K${++k}`,
    'no migration: the schema and its migrations are as at 6e84218, nothing untracked there',
    git(['diff', '--quiet', BASE, '--', 'prisma']) !== null &&
      (git(['ls-files', '--others', '--exclude-standard', 'prisma']) ?? 'x').trim() === ''
  );
  const listNow = JSON.parse(read('route-classifications.json') || '[]');
  const listBase = JSON.parse(atBase('route-classifications.json') || '[]');
  check(
    `K${++k}`,
    'the route list is 6e84218’s with exactly the one new entry (TOKEN, resolveToken)',
    listNow.length === listBase.length + 1 &&
      JSON.stringify(listNow.filter((e: any) => e.filePath !== ENTRY.filePath)) ===
        JSON.stringify(listBase) &&
      JSON.stringify(listNow.find((e: any) => e.filePath === ENTRY.filePath)) ===
        JSON.stringify(ENTRY)
  );
  const pkgNow = JSON.parse(read('package.json'));
  const pkgBase = JSON.parse(atBase('package.json') || '{}');
  const SCRIPT = 'test:sessions-guest-answers';
  const VALUE = 'tsx --tsconfig tests/tsconfig.json tests/sessions-guest-answers-test.tsx';
  const pkgOk = (() => {
    if (pkgNow?.scripts?.[SCRIPT] !== VALUE || pkgBase?.scripts?.[SCRIPT] !== undefined)
      return false;
    const copy = JSON.parse(JSON.stringify(pkgNow));
    delete copy.scripts[SCRIPT];
    return JSON.stringify(copy) === JSON.stringify(pkgBase);
  })();
  check(`K${++k}`, 'package.json is 6e84218’s with exactly the one script line', pkgOk);

  // ══ Z — nothing sent; every row removed ═══════════════════════════════════════════════════
  section('Z — nothing left the process; every row this run made removed by id');
  check('Z1', 'nothing left the process: no trapped request', trapCount() === 0, trapCount());
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
  const movedTables = Object.keys({ ...startCounts, ...endCounts }).filter(
    (t) => startCounts[t] !== endCounts[t]
  );
  check('Z4', "every table's count is as found", movedTables.length === 0, movedTables);
}

main()
  .catch((e) => {
    failed++;
    console.log(`\x1b[31m✗\x1b[0m the run stopped: ${(e as Error).message}`);
  })
  .finally(async () => {
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
