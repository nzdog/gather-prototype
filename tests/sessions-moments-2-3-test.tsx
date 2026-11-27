/**
 * [[GTC-480]] — MOMENTS 2 AND 3 BY SESSION (`npm run test:sessions-moments-2-3`).
 *
 * The founder's rulings on the plan, 24 Nov 2026 (docs/tickets/GTC-480.md): 1, the split (this
 * ticket builds A, B, C and H); 2, "Accept all" takes the open tab's suggestions only, "X of Y
 * items assigned." stays the whole event's; 4, the words as listed; 6, the look; 7, the older pins
 * moved by named hunks; 8, the standing words and limits.
 *
 *   T  the tabs, pure: their words, order, counts, which opens, a plan's rows for one tab
 *   M  Moment 2's plan view: off (or no sessions) exactly as before; on, the tabs, one tab's rows,
 *      the session picker on its add and edit boxes, what those boxes send
 *   N  Moment 3: off exactly as before; on, the tabs above the counter, the open tab's sections,
 *      the empty tab's words, the counter the whole event's, Accept all the open tab's only, the
 *      Details box's picker, a shared copy on its source's tab
 *   W  the why: a row moved to another session is a change to the ask (Q13), asked after the send
 *      once its holder has answered; the page's one save sends the session
 *   C  a shared dish splits within one session (Q12): its own made-up rows, the switch on and off
 *   H  GTC-479's notes: the date once, "Change" beside a wrapped line, the coordinator page's order
 *   K  the words, never remind or chase; the new files' shape
 *   Z  nothing sent; every row this run made removed by id; every table's count as found
 *
 * HOW. The screens are drawn on the server (renderToStaticMarkup), where no effect runs and nothing
 * is asked of a route; the session plan is given its sessions directly. The two routes are called
 * in this process as the real handlers. The switch is set for this process only, call by call.
 *
 * SAFETY. Writes only its own rows (names start with the run's TAG). Every id is written to the
 * fixture file BEFORE the row is used, and removed by id in `finally`, however the run ends. The
 * coordinator link is made already opened, so its read writes nothing. Nothing here can send. No
 * server, no browser.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/sessions-moments-2-3-test.tsx
 */
import { prisma } from '../src/lib/prisma';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ASK_FIELDS, whyTrigger } from '../src/lib/ledger';
import { ToastProvider } from '../src/contexts/ToastContext';
import { SessionsSwitchProvider } from '../src/components/sessions/SessionsSwitch';
import Moment2PlanView, { AddItemForm, ItemEditForm } from '../src/components/plan/Moment2PlanView';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import Moment3ItemDetail from '../src/components/plan/Moment3ItemDetail';
import ComingTo from '../src/components/sessions/ComingTo';
import { SessionsCard } from '../src/components/sessions/Moment1Sessions';
import { readShare } from '../src/lib/moment3/share-dish';
import { GET as coordinatorGET } from '../src/app/api/c/[token]/route';

const ROOT = path.join(__dirname, '..');
const BASE = '3f656d9'; // origin/main when GTC-480 began (the merge of GTC-479)
const TAG = `S480${Date.now().toString(36)}`;
const VAR = 'GATHER_SESSIONS';
const FIXTURE_FILE =
  process.env.GTC480_FIXTURE_FILE ?? path.join(os.tmpdir(), `gtc480-sessions-${TAG}.json`);

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
const atBase = (rel: string) => {
  try {
    return execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    return '';
  }
};
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// ── The fixture file: every id, written before the row is used ──────────────────────────────
const made: Record<'people' | 'events', string[]> = { people: [], events: [] };
function note(kind: keyof typeof made, id: string) {
  made[kind].push(id);
  fs.writeFileSync(FIXTURE_FILE, JSON.stringify({ tag: TAG, ...made }, null, 2), { mode: 0o600 });
}

// ── The new modules, loaded if they exist (at the tests-first commit they do not) ───────────
const F = {
  tabs: 'src/lib/sessions/tabs.ts',
  ui: 'src/components/sessions/SessionTabs.tsx',
  plan: 'src/components/plan/Moment2PlanView.tsx',
  m3: 'src/components/plan/Moment3AssignView.tsx',
  box: 'src/components/plan/Moment3ItemDetail.tsx',
  setup: 'src/app/plan/[eventId]/setup/page.tsx',
  layout: 'src/app/plan/[eventId]/setup/layout.tsx',
  share: 'src/lib/moment3/share-dish.ts',
  card: 'src/components/sessions/Moment1Sessions.tsx',
  coming: 'src/components/sessions/ComingTo.tsx',
  coord: 'src/app/api/c/[token]/route.ts',
};
async function load(rel: string): Promise<any> {
  try {
    return await import(`../${rel.replace(/\.tsx?$/, '')}`);
  } catch {
    return null;
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
/** NZ midnight of a summer date (NZDT, UTC+13): the seed's form. */
const nzMidnight = (s: string) => new Date(utcDay(s).getTime() - 13 * 36e5);

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
  const { events, people } = made;
  // Events first: their sessions, teams, items, assignments, links and ledger rows go with them.
  if (events.length) await prisma.event.deleteMany({ where: { id: { in: events } } });
  if (people.length) {
    await prisma.auditEntry.deleteMany({ where: { actorId: { in: people } } });
    await prisma.person.deleteMany({ where: { id: { in: people } } });
  }
}

const html = (el: any): string => {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    return `THREW ${(e as Error).message}`;
  }
};

// ── The plan the screens are drawn with ─────────────────────────────────────────────────────
const SESSIONS = [
  { id: 's1', name: 'Christmas Eve dinner', date: '2026-12-24' },
  { id: 's2', name: 'Christmas lunch', date: '2026-12-25' },
  { id: 's3', name: 'Sat 26 Dec', date: '2026-12-26' },
];
const row = (id: string, name: string, dayId: string | null, unit = 'pieces') => ({
  id,
  name,
  quantity: 1,
  unit,
  servingSize: '',
  dayId,
});
const PLAN_CATS = [
  {
    id: 't1',
    name: 'Mains',
    emoji: '🍖',
    items: [
      row('i1', 'Glazed ham', 's2'),
      row('i2', 'Roast lamb', 's1'),
      row('i3', 'Bread rolls', null),
    ],
  },
  { id: 't2', name: 'Desserts', emoji: '🍰', items: [row('i4', 'Pavlova', 's2')] },
  { id: 't3', name: 'Drinks', emoji: '🥤', items: [] as ReturnType<typeof row>[] },
];
const PLAN_PROPS: Record<string, unknown> = {
  eventId: 'e1',
  eventName: 'Christmas',
  guestCount: 8,
  categories: PLAN_CATS,
  onUpdateItem: async () => {},
  onRemoveItem: async () => {},
  onAddItem: async () => {},
  onAddCategory: async () => {},
  onApprove: () => {},
  onBack: () => {},
  onRegeneratePlan: () => {},
  onRegenerateCategory: () => {},
  regeneratingScope: null,
  onEditGuests: () => {},
  onGoToDashboard: () => {},
};

async function main() {
  const startCounts = await tableCounts();
  const sentBefore = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  const T = await load(F.tabs);
  const UI = await load(F.ui);
  const Plan = UI?.SessionPlanProvider;

  /** A screen inside the switch (on or off) and the session plan, or with neither (`plain`). */
  const within = (
    el: any,
    opts: { on?: boolean; sessions?: any[]; open?: string | null; plain?: boolean } = {}
  ) => {
    if (opts.plain) return html(h(ToastProvider as any, null, el));
    if (!Plan) return 'no session plan';
    return html(
      h(
        ToastProvider as any,
        null,
        h(
          SessionsSwitchProvider,
          { on: opts.on === true },
          h(
            Plan,
            { eventId: 'e1', initialSessions: opts.sessions, initialOpen: opts.open ?? null },
            el
          )
        )
      )
    );
  };

  // ══ T — the tabs, pure ═══════════════════════════════════════════════════════════════════
  section('T — the tabs: words, order, counts, which opens, one tab’s rows');
  const W = T?.TAB_WORDS;
  check(
    'T1',
    'the words, word for word: "Sessions", "Whole event", "Session", "Nothing in this session yet.", "Nothing for the whole event yet."',
    W?.rowLabel === 'Sessions' &&
      W?.whole === 'Whole event' &&
      W?.pickerLabel === 'Session' &&
      W?.emptySession === 'Nothing in this session yet.' &&
      W?.emptyWhole === 'Nothing for the whole event yet.' &&
      Object.keys(W ?? {}).length === 5,
    W
  );
  const rows = PLAN_CATS.flatMap((c) => c.items);
  const tabs = typeof T?.tabsFor === 'function' ? T.tabsFor(SESSIONS, rows) : null;
  check(
    'T2',
    'one tab per session in the order given, then "Whole event"; each with its count of rows',
    JSON.stringify(tabs?.map((t: any) => [t.key, t.name, t.count])) ===
      JSON.stringify([
        ['s1', 'Christmas Eve dinner', 1],
        ['s2', 'Christmas lunch', 2],
        ['s3', 'Sat 26 Dec', 0],
        ['whole', 'Whole event', 1],
      ]),
    tabs
  );
  check(
    'T3',
    'a tab\'s date words under its name ("Thu 24 Dec"), none when the name is only the date, none on "Whole event"',
    JSON.stringify(tabs?.map((t: any) => t.date)) ===
      JSON.stringify(['Thu 24 Dec', 'Fri 25 Dec', null, null])
  );
  const tabOf = (r: any) => (typeof T?.tabOf === 'function' ? T.tabOf(r, SESSIONS) : null);
  check(
    'T4',
    'a row with no session, a null one, or one not among the sessions is on "Whole event"',
    tabOf({}) === 'whole' &&
      tabOf({ dayId: null }) === 'whole' &&
      tabOf({ dayId: 'gone' }) === 'whole' &&
      tabOf({ dayId: 's3' }) === 's3'
  );
  const opening = (list: any[]) =>
    typeof T?.openingTab === 'function' ? T.openingTab(list) : null;
  check(
    'T5',
    'it opens on the first tab holding a row; when none does, on the first session',
    tabs !== null &&
      opening(tabs) === 's1' &&
      opening(T.tabsFor(SESSIONS, [{ dayId: null }])) === 'whole' &&
      opening(T.tabsFor(SESSIONS, [])) === 's1' &&
      opening(T.tabsFor([], [])) === 'whole'
  );
  const lunch = typeof T?.rowsOnTab === 'function' ? T.rowsOnTab(PLAN_CATS, 's2', SESSIONS) : null;
  check(
    'T6',
    "one tab's rows: every section kept (an empty one too), each with only that tab's rows",
    JSON.stringify(lunch?.map((c: any) => [c.id, c.items.map((i: any) => i.id)])) ===
      JSON.stringify([
        ['t1', ['i1']],
        ['t2', ['i4']],
        ['t3', []],
      ])
  );
  check(
    'T7',
    'the picker\'s words: "Christmas lunch, Fri 25 Dec"; "Sat 26 Dec" once; a tab "Christmas lunch (2)"',
    T?.sessionWithDate?.(SESSIONS[1]) === 'Christmas lunch, Fri 25 Dec' &&
      T?.sessionWithDate?.(SESSIONS[2]) === 'Sat 26 Dec' &&
      T?.tabLabel?.('Christmas lunch', 2) === 'Christmas lunch (2)' &&
      T?.nameIsDate?.('Sat 26 Dec', '2026-12-26') === true &&
      T?.nameIsDate?.('Sat 26 Dec', '2026-12-25') === false &&
      T?.nameIsDate?.('Boxing Day', '2026-12-26') === false
  );
  const tabsSrc = read(F.tabs);
  check(
    'T8',
    'tabs.ts imports only the date helper',
    tabsSrc.length > 0 &&
      (tabsSrc.match(/^\s*import\b/gm) ?? []).length === 1 &&
      /^import \{ sessionDateWords \} from '\.\/dates';$/m.test(tabsSrc)
  );

  // ══ M — Moment 2's plan view ═════════════════════════════════════════════════════════════
  section('M — Moment 2: off exactly as before; on, the tabs, one tab’s rows, the picker');
  const planEl = h(Moment2PlanView as any, PLAN_PROPS);
  const plain = within(planEl, { plain: true });
  const off = within(planEl, { on: false, sessions: SESSIONS });
  const onNone = within(planEl, { on: true, sessions: [] });
  const on = within(planEl, { on: true, sessions: SESSIONS });
  check(
    'M1',
    'switch off (with sessions made): the plan view is byte for byte the one drawn without the session plan',
    plain.length > 2000 && off === plain,
    off.slice(0, 200)
  );
  check(
    'M2',
    'switch on, no sessions: byte for byte as before (no tab row, no session word)',
    plain.length > 2000 && onNone === plain
  );
  const tabRow = on.match(/<div role="group" aria-label="Sessions"[\s\S]*?<\/div>/)?.[0] ?? '';
  const tabTexts = [...tabRow.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((m) =>
    m[1]
      .replace(/<[^>]+>/g, '|')
      .replace(/\|+/g, '|')
      .replace(/^\||\|$/g, '')
  );
  check(
    'M3',
    'switch on, three sessions: the tab row, read as "Sessions", each tab\'s name, count and date, then "Whole event"',
    JSON.stringify(tabTexts) ===
      JSON.stringify([
        'Christmas Eve dinner (1)|Thu 24 Dec',
        'Christmas lunch (2)|Fri 25 Dec',
        'Sat 26 Dec (0)',
        'Whole event (1)',
      ]),
    tabTexts
  );
  check(
    'M4',
    'it opens on the first tab with a row (Christmas Eve dinner), pressed; the others not',
    /data-session-tab="s1" aria-pressed="true"/.test(tabRow) &&
      count(tabRow, 'aria-pressed="true"') === 1
  );
  check(
    'M5',
    'only the open tab\'s rows; every section still drawn ("No items yet." where it has none)',
    on.includes('>Roast lamb<') &&
      !on.includes('>Glazed ham<') &&
      !on.includes('>Pavlova<') &&
      !on.includes('>Bread rolls<') &&
      count(on, 'No items yet.') === 2 &&
      on.includes('Desserts') &&
      on.includes('Drinks')
  );
  check(
    'M6',
    'the count line reads the whole plan: "4 items across 3 categories"',
    /4 items across 3 categories/.test(on) && /4 items across 3 categories/.test(plain)
  );
  const onWhole = within(planEl, { on: true, sessions: SESSIONS, open: 'whole' });
  check(
    'M7',
    '"Whole event" open: only the rows with no session',
    onWhole.includes('>Bread rolls<') &&
      !onWhole.includes('>Roast lamb<') &&
      /data-session-tab="whole" aria-pressed="true"/.test(onWhole)
  );
  check(
    'M8',
    'the tab row scrolls inside itself, not the page: overflow-x-auto, each tab shrink-0 and 44px high',
    /data-session-tabs=""[^>]*class="[^"]*\boverflow-x-auto\b/.test(on) &&
      count(tabRow, 'shrink-0') === 4 &&
      count(tabRow, 'min-h-[44px]') === 4
  );
  // [[GTC-480]] fix, 24 Nov 2026 (the founder's standing word on my own new tests): only the Session
  // list's options. The first version read every option in the box, so the add and edit boxes' unit
  // list ("kg", "g", ... "pieces") came first and M10 and M12 failed on the new source.
  const optionsOf = (s: string) => {
    const at = s.indexOf('data-session-picker');
    if (at < 0) return [];
    const list = s.slice(at, s.indexOf('</select>', at));
    return [...list.matchAll(/<option value="([^"]*)"( selected="")?>([^<]*)<\/option>/g)].map(
      (m) => `${m[1]}${m[2] ? '*' : ''}=${m[3]}`
    );
  };
  const addEl = h(AddItemForm as any, { onAdd: async () => {}, onCancel: () => {} });
  const addPlain = within(addEl, { plain: true });
  const addOff = within(addEl, { on: false, sessions: SESSIONS, open: 's2' });
  const addOn = within(addEl, { on: true, sessions: SESSIONS, open: 's2' });
  check(
    'M9',
    '"+ Add item", off: as before, no "Session"',
    addPlain.length > 500 && addOff === addPlain && !addOff.includes('>Session<')
  );
  check(
    'M10',
    '"+ Add item", on: the "Session" list, each session with its date, then "Whole event", starting on the open tab\'s session',
    addOn.includes('>Session</label>') &&
      JSON.stringify(optionsOf(addOn)) ===
        JSON.stringify([
          's1=Christmas Eve dinner, Thu 24 Dec',
          's2*=Christmas lunch, Fri 25 Dec',
          's3=Sat 26 Dec',
          'whole=Whole event',
        ]),
    optionsOf(addOn)
  );
  const addWhole = within(addEl, { on: true, sessions: SESSIONS, open: 'whole' });
  check(
    'M11',
    '"+ Add item" on "Whole event": the list starts on "Whole event"',
    optionsOf(addWhole).includes('whole*=Whole event')
  );
  const editEl = (dayId: string | null) =>
    h(ItemEditForm as any, {
      item: row('i9', 'Trifle', dayId),
      onSave: async () => {},
      onCancel: () => {},
      onRemove: async () => {},
    });
  check(
    'M12',
    'Edit, off: as before; on: the list starts on the row\'s own session, or "Whole event" for none',
    within(editEl('s1'), { on: false, sessions: SESSIONS }) ===
      within(editEl('s1'), { plain: true }) &&
      optionsOf(within(editEl('s1'), { on: true, sessions: SESSIONS }))[0] ===
        's1*=Christmas Eve dinner, Thu 24 Dec' &&
      optionsOf(within(editEl(null), { on: true, sessions: SESSIONS })).includes(
        'whole*=Whole event'
      )
  );
  const planSrc = read(F.plan);
  check(
    'M13',
    'what the boxes send: Edit sends the session only when it changed; "+ Add item" sends it (null on "Whole event") only while on',
    count(
      planSrc,
      '...(session.on && session.value !== (item.dayId ?? null) ? { dayId: session.value } : {}),'
    ) === 1 && count(planSrc, '...(session.on ? { dayId: session.value } : {}),') === 1
  );
  const picker = typeof UI?.useSessionChoice === 'function' ? UI.useSessionChoice : null;
  const Probe = ({ initial }: { initial?: string | null }) => {
    const c = picker ? picker(initial) : null;
    return h('i', null, JSON.stringify(c ? { on: c.on, value: c.value } : null));
  };
  const probe = (o: any, initial?: string | null) =>
    within(h(Probe, initial === undefined ? {} : { initial }), o).replace(/&quot;/g, '"');
  check(
    'M14',
    "a box's session: off, on false; on, the open tab's session for a new row, the row's own for an edit",
    probe({ on: false, sessions: SESSIONS, open: 's2' }).includes('{"on":false,"value":null}') &&
      probe({ on: true, sessions: SESSIONS, open: 's2' }).includes('{"on":true,"value":"s2"}') &&
      probe({ on: true, sessions: SESSIONS, open: 'whole' }).includes('{"on":true,"value":null}') &&
      probe({ on: true, sessions: SESSIONS, open: 's2' }, 's3').includes(
        '{"on":true,"value":"s3"}'
      ) &&
      probe({ on: true, sessions: [], open: null }).includes('{"on":false,"value":null}'),
    probe({ on: true, sessions: SESSIONS, open: 's2' })
  );

  // ══ N — Moment 3 ══════════════════════════════════════════════════════════════════════════
  section('N — Moment 3: off exactly as before; on, the tabs, the open tab, the counter');
  const m3Item = (id: string, name: string, dayId: string | null) => ({
    id,
    name,
    kind: 'ITEM',
    detail: '1',
    dayId,
  });
  const M3_CATS = [
    {
      id: 't1',
      name: 'Mains',
      emoji: '🍖',
      items: [
        m3Item('i1', 'Glazed ham', 's2'),
        m3Item('i2', 'Roast lamb', 's1'),
        m3Item('i3', 'Bread rolls', null),
      ],
    },
    { id: 't2', name: 'Desserts', emoji: '🍰', items: [m3Item('i4', 'Pavlova', 's2')] },
  ];
  const m3El = h(Moment3AssignView as any, {
    eventId: 'e1',
    event: { id: 'e1', status: 'DRAFT', sentAt: null, endDate: '2026-12-26T00:00:00.000Z' },
    hostPersonId: 'p-host',
    headcount: 4,
    categories: M3_CATS,
    initialHolders: { i1: { personId: 'p-ann', name: 'Ann' } },
    households: [],
    askForReason: async () => ({ proceed: true }),
    askForBatchReason: async () => ({ proceed: true }),
    onBack: () => {},
    onMoveOn: () => {},
    stripDoors: {},
  });
  const m3Plain = within(m3El, { plain: true });
  const m3Off = within(m3El, { on: false, sessions: SESSIONS });
  const m3On = within(m3El, { on: true, sessions: SESSIONS, open: 's2' });
  check(
    'N1',
    'switch off (with sessions made), and on with none: Moment 3 is byte for byte as before',
    m3Plain.length > 2000 &&
      m3Off === m3Plain &&
      within(m3El, { on: true, sessions: [] }) === m3Plain
  );
  const m3Row = m3On.match(/<div role="group" aria-label="Sessions"[\s\S]*?<\/div>/)?.[0] ?? '';
  check(
    'N2',
    "on: the tab row above the counter line, its counts the whole event's rows per session",
    m3Row.length > 0 &&
      m3On.indexOf('aria-label="Sessions"') < m3On.indexOf('items assigned.') &&
      /Christmas Eve dinner \(1\)/.test(m3Row) &&
      /Christmas lunch \(2\)/.test(m3Row) &&
      /Sat 26 Dec \(0\)/.test(m3Row) &&
      /Whole event \(1\)/.test(m3Row)
  );
  check(
    'N3',
    "the open tab's sections only: Christmas lunch shows the ham and the pavlova, not the lamb or the rolls",
    m3On.includes('<span>Glazed ham</span>') &&
      m3On.includes('<span>Pavlova</span>') &&
      !m3On.includes('<span>Roast lamb</span>') &&
      !m3On.includes('<span>Bread rolls</span>')
  );
  check(
    'N4',
    '"X of Y items assigned." stays the whole event\'s: 1 of 4, on the tab as off',
    /1 of 4 items assigned\./.test(m3On) && /1 of 4 items assigned\./.test(m3Plain)
  );
  const m3Empty = within(m3El, { on: true, sessions: SESSIONS, open: 's3' });
  check(
    'N5',
    'a session\'s tab with no rows: "Nothing in this session yet." and no section',
    m3Empty.includes('Nothing in this session yet.') && !m3Empty.includes('<span>Glazed ham</span>')
  );
  const m3NoWhole = within(
    h(Moment3AssignView as any, {
      ...(m3El.props as any),
      categories: [{ ...M3_CATS[1] }],
    }),
    { on: true, sessions: SESSIONS, open: 'whole' }
  );
  check(
    'N6',
    '"Whole event" with no rows: "Nothing for the whole event yet."',
    m3NoWhole.includes('Nothing for the whole event yet.')
  );
  const m3Src = read(F.m3);
  check(
    'N7',
    "Accept all takes the open tab's suggestions only, and only while the tabs show (ruling 2)",
    count(
      m3Src,
      '(g) => !(g.itemId in pending) && (!sessionTabs.on || onOpenTab.has(g.itemId))'
    ) === 1 && /acceptAllLabel\(onScreen\.length\)/.test(m3Src)
  );
  check(
    'N8',
    '"Want me to suggest?", the counter and the people read the whole event (allItems), as before',
    /suggestAssignments\(\s*allItems\.map/.test(m3Src) &&
      /assignedCounterLine\(panelItems\)/.test(m3Src) &&
      /allItems\.map\(\(i\) => \(\{\s*id: i\.id,\s*kind: i\.kind,\s*assignment:/.test(m3Src)
  );
  check(
    'N9',
    "a shared copy takes its source's session on screen; a twin (W8) is in the same session only, while on",
    /answer: null,\s*\/\/[^\n]*\n\s*dayId: item\.dayId \?\? null,/.test(m3Src) &&
      /\(!sessionTabs\.on \|\| \(i\.dayId \?\? null\) === \(mine\?\.dayId \?\? null\)\)/.test(m3Src)
  );
  const boxEl = (dayId: string | null) =>
    h(Moment3ItemDetail as any, {
      item: { id: 'i4', name: 'Pavlova', kind: 'ITEM', detail: '1', dayId },
      holderName: 'Ann',
      holderAnswer: null,
      onSave: async () => true,
      onClose: () => {},
    });
  const boxOn = within(boxEl('s2'), { on: true, sessions: SESSIONS });
  check(
    'N10',
    'the Details box: off, as before; on, the "Session" list on the row\'s own session',
    within(boxEl('s2'), { on: false, sessions: SESSIONS }) ===
      within(boxEl('s2'), { plain: true }) &&
      boxOn.includes('>Session</label>') &&
      optionsOf(boxOn)[1] === 's2*=Christmas lunch, Fri 25 Dec'
  );
  const boxSrc = read(F.box);
  check(
    'N11',
    'the box saves the session only when it changed, and only while on',
    count(
      boxSrc,
      '...(session.on && session.value !== (item.dayId ?? null) ? { dayId: session.value } : {}),'
    ) === 1 && !/fetch\(|\/api\//.test(codeOnly(boxSrc))
  );

  // ══ W — the why ═══════════════════════════════════════════════════════════════════════════
  section('W — a row moved to another session is a change to the ask (Q13)');
  const sent = { status: 'CONFIRMING' as const, sentAt: new Date(), endDate: utcDay('2026-12-26') };
  const unsent = { ...sent, sentAt: null };
  const move = (response: string | null) => ({
    action: 'EDIT_ITEM' as const,
    targetType: 'Item' as const,
    targetId: 'i1',
    field: 'dayId',
    context: { assignmentResponse: response as any },
  });
  check(
    'W1',
    'the session is an ask field; after the send, on a row whose holder said yes, maybe or no, the move asks why (T4)',
    (ASK_FIELDS as readonly string[]).includes('dayId') &&
      whyTrigger(move('ACCEPTED') as any, sent as any) === 'T4' &&
      whyTrigger(move('MAYBE') as any, sent as any) === 'T4' &&
      whyTrigger(move('DECLINED') as any, sent as any) === 'T4'
  );
  check(
    'W2',
    'before the send, on a row nobody holds, or one asked and not yet answered: no why',
    whyTrigger(move('ACCEPTED') as any, unsent as any) === null &&
      whyTrigger(move(null) as any, sent as any) === null &&
      whyTrigger(move('PENDING') as any, sent as any) === null
  );
  const setupSrc = read(F.setup);
  const save = setupSrc.slice(
    setupSrc.indexOf('const saveItemEdit = async ('),
    setupSrc.indexOf('const handleRegenerate')
  );
  check(
    'W3',
    "the page's one item save sends the session, through the why (fieldChanges over the ask fields) and the item route",
    save.length > 500 &&
      /if \(updates\.dayId !== undefined\) body\.dayId = updates\.dayId;/.test(save) &&
      /fieldChanges\([\s\S]*ASK_FIELDS\s*\)/.test(save) &&
      /\/api\/events\/\$\{eventId\}\/items\/\$\{itemId\}/.test(save)
  );
  check(
    'W4',
    'the page passes each row\'s session to both Moments, and "+ Add item" sends it to the add route',
    count(setupSrc, 'dayId: item.dayId ?? null,') === 2 &&
      count(setupSrc, '...(newItem.dayId ? { dayId: newItem.dayId } : {}),') === 1 &&
      count(setupSrc, '...(updates.dayId !== undefined ? { dayId: updates.dayId } : {}),') === 1
  );
  /*
    ⚠ [[GTC-487]] (28 Nov 2026, the founder's word on its plan: "yes to all 13 moves as you describe
    them, each the narrowest way with a dated note naming GTC-487"). GTC-487 changes six lines of the
    base in these two files: B, Moment 3's row words and a plan row's words; D, the bar's frame, its
    back button and its second row, for the fold; E, one category's look while its own bar shows.
    W5 still reads the working folder: the base's lines removed must be exactly these six, each
    once, and nothing else.
  */
  const GTC487_REMOVED: Record<string, string[]> = {
    [F.setup]: [
      "          const amountAndUnit = [item.quantityAmount ?? '', mapItemUnitToDisplay(item)]",
    ],
    [F.plan]: [
      '      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">',
      '            className="text-sm text-gray-600 hover:text-gray-900 px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"',
      '        <div className="max-w-2xl mx-auto pt-2 flex flex-wrap items-baseline justify-center gap-x-4 gap-y-1 text-center">',
      "    <div className={isRegenerating ? 'animate-pulse opacity-60 pointer-events-none' : undefined}>",
      '          {item.quantity} {item.unit}',
    ],
  };
  check(
    'W5',
    "the setup page, the plan view and Moment 3's mappers: every line this ticket added is an addition; no line of the base is changed, but GTC-487's six named changes",
    (() => {
      for (const rel of [F.setup, F.plan]) {
        const d = execFileSync('git', ['diff', '--unified=0', BASE, '--', rel], {
          cwd: ROOT,
          encoding: 'utf8',
        });
        const removedLines = d.split('\n').filter((l) => l.startsWith('-') && !l.startsWith('---'));
        const addedLines = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
        // [[GTC-487]]: exactly its named lines, each once; see the note above.
        const removed = removedLines.map((l) => l.slice(1)).sort();
        const named = [...(GTC487_REMOVED[rel] ?? [])].sort();
        if (JSON.stringify(removed) !== JSON.stringify(named) || addedLines.length === 0) {
          return false;
        }
      }
      return true;
    })()
  );

  // ══ C — a shared dish splits within one session ═══════════════════════════════════════════
  section('C — a shared dish splits only within one session (Q12), on its own made-up rows');
  const person = async (name: string) => {
    const p = await prisma.person.create({ data: { name: `${TAG} ${name}` } });
    note('people', p.id);
    return p;
  };
  const host = await person('Host');
  const [ann, ben, cat, coordP] = [
    await person('Ann'),
    await person('Ben'),
    await person('Cat'),
    await person('Coordinator'),
  ];
  const eventId = `${TAG.toLowerCase()}c`;
  note('events', eventId);
  await prisma.event.create({
    data: {
      id: eventId,
      name: `${TAG} share`,
      startDate: utcDay('2026-12-24'),
      endDate: utcDay('2026-12-26'),
      status: 'DRAFT',
      hostId: host.id,
    },
  });
  const team = await prisma.team.create({
    data: { eventId, name: `${TAG} Desserts`, coordinatorId: host.id },
  });
  const day = (name: string, date: Date, displayOrder = 0) =>
    prisma.day.create({ data: { eventId, name, date, displayOrder } });
  const lunchDay = await day('Christmas lunch', utcDay('2026-12-25'));
  const boxingDay = await day('Boxing Day', utcDay('2026-12-26'));
  const dish = async (dayId: string, holderId: string, amount: number) => {
    const it = await prisma.item.create({
      data: {
        teamId: team.id,
        name: 'Pavlova',
        kind: 'ITEM',
        source: 'MANUAL',
        quantityState: 'SPECIFIED',
        quantityAmount: amount,
        quantityUnit: 'CUSTOM',
        quantityUnitCustom: 'servings',
        dayId,
      } as any,
    });
    await prisma.assignment.create({ data: { itemId: it.id, personId: holderId } });
    return it;
  };
  const root = await dish(lunchDay.id, ann.id, 10);
  const copyLunch = await dish(lunchDay.id, ben.id, 10);
  const copyBoxing = await dish(boxingDay.id, cat.id, 5);
  for (const copy of [copyLunch, copyBoxing]) {
    await prisma.auditEntry.create({
      data: {
        eventId,
        actionType: 'CREATE_ITEM',
        targetType: 'Item',
        targetId: copy.id,
        after: { sharedFromItemId: root.id, shareRootItemId: root.id },
      },
    });
  }
  const preview = async (itemId: string) => {
    try {
      return await readShare(prisma as any, { eventId, itemId });
    } catch (e) {
      return { threw: (e as Error).message } as any;
    }
  };
  const onLunch = await withSwitch('on', () => preview(root.id));
  check(
    'C1',
    "on: the lunch pavlova's split reads only its session's rows (Ann 10, Ben 10), total 20",
    JSON.stringify(onLunch?.rows?.map((r: any) => [r.itemId, r.amount])) ===
      JSON.stringify([
        [root.id, 10],
        [copyLunch.id, 10],
      ]) &&
      onLunch?.total === 20 &&
      onLunch?.divided === true,
    onLunch
  );
  const onBoxing = await withSwitch('on', () => preview(copyBoxing.id));
  check(
    'C2',
    'on: the Boxing Day row, though shared from the lunch one, splits alone (Cat 5)',
    JSON.stringify(onBoxing?.rows?.map((r: any) => r.itemId)) === JSON.stringify([copyBoxing.id]) &&
      onBoxing?.total === 5,
    onBoxing
  );
  const offLunch = await withSwitch(undefined, () => preview(root.id));
  check(
    'C3',
    'off: every row of the dish, as before (Ann 10, Ben 10, Cat 5), total 25',
    JSON.stringify(offLunch?.rows?.map((r: any) => r.itemId)) ===
      JSON.stringify([root.id, copyLunch.id, copyBoxing.id]) && offLunch?.total === 25,
    offLunch
  );
  check(
    'C4',
    "a copy takes the pressed row's session (the server, unchanged); the split is asked of the switch",
    /dayId: pressed\.dayId,/.test(read(F.share)) &&
      /!isSessionsOn\(\) \|\| i\.dayId === pressed\.dayId/.test(read(F.share))
  );

  // ══ H — GTC-479's notes ═══════════════════════════════════════════════════════════════════
  section('H — GTC-479’s notes: the date once, "Change" beside, the coordinator page’s order');
  const cardHtml = html(
    h(SessionsCard as any, {
      eventId: 'e1',
      initial: {
        sessions: [
          { id: 'c1', name: 'Thu 24 Dec', date: '2026-12-24', displayOrder: 0 },
          { id: 'c2', name: 'Christmas lunch', date: '2026-12-25', displayOrder: 0 },
        ],
        eventDates: { start: '2026-12-24', end: '2026-12-26' },
        households: [],
        absences: [],
      },
    })
  );
  const cardRow = (id: string) => {
    const at = cardHtml.indexOf(`data-session-id="${id}"`);
    return at < 0 ? '' : cardHtml.slice(at, cardHtml.indexOf('</li>', at));
  };
  check(
    'H1',
    'a session named by its date shows the date once; a named one shows its name and its date',
    count(cardRow('c1'), 'Thu 24 Dec') === 1 &&
      cardRow('c2').includes('>Christmas lunch<') &&
      cardRow('c2').includes('>Fri 25 Dec<')
  );
  const comingHtml = html(
    h(ComingTo as any, {
      eventId: 'e1',
      sessions: [
        { id: 'c1', name: 'Christmas Eve dinner', date: '2026-12-24', displayOrder: 0 },
        { id: 'c2', name: 'Christmas lunch', date: '2026-12-25', displayOrder: 0 },
      ],
      households: [
        {
          id: 'hA',
          title: 'Sam',
          littleCount: 0,
          people: [{ personEventId: 'pS', name: 'Sam', kind: 'adult' }],
        },
      ],
      absences: [],
      onSaved: async () => {},
    })
  );
  const comingRow = comingHtml.match(
    /data-household-id="hA"[^>]*>\s*<div class="([^"]*)">\s*<div class="([^"]*)">/
  );
  const changeButton = comingHtml.match(/<button type="button" class="([^"]*)">Change<\/button>/);
  check(
    'H2',
    '"Coming to": the row does not wrap, its words take the room, "Change" keeps its own beside them',
    !!comingRow &&
      !/flex-wrap/.test(comingRow[1]) &&
      /\bflex\b/.test(comingRow[1]) &&
      /\bitems-start\b/.test(comingRow[1]) &&
      /\bmin-w-0\b/.test(comingRow[2]) &&
      !!changeButton &&
      /\bshrink-0\b/.test(changeButton[1]),
    [comingRow?.[1], comingRow?.[2], changeButton?.[1]]
  );
  // The coordinator link: an event with two sessions on one date in the two stored forms, the
  // later-made one placed first, and one on the day before. Made already opened: the read writes nothing.
  const coordEvent = `${TAG.toLowerCase()}k`;
  note('events', coordEvent);
  await prisma.event.create({
    data: {
      id: coordEvent,
      name: `${TAG} coordinator`,
      startDate: utcDay('2026-12-24'),
      endDate: utcDay('2026-12-26'),
      status: 'DRAFT',
      hostId: host.id,
    },
  });
  const coordTeam = await prisma.team.create({
    data: { eventId: coordEvent, name: `${TAG} Mains`, coordinatorId: coordP.id },
  });
  const link = `${TAG.toLowerCase()}-link`;
  await prisma.accessToken.create({
    data: {
      token: link,
      scope: 'COORDINATOR',
      eventId: coordEvent,
      personId: coordP.id,
      teamId: coordTeam.id,
      openedAt: new Date(Date.now() - 864e5),
    },
  });
  const kDay = (name: string, date: Date, displayOrder: number) =>
    prisma.day.create({ data: { eventId: coordEvent, name, date, displayOrder } });
  const eve = await kDay('Christmas Eve', utcDay('2026-12-24'), 0);
  const dinner = await kDay('Christmas dinner', nzMidnight('2026-12-25'), 1);
  const lunchK = await kDay('Christmas lunch', utcDay('2026-12-25'), 0);
  const coordDays = async () => {
    try {
      const res = await coordinatorGET({ headers: new Headers() } as any, {
        params: Promise.resolve({ token: link }),
      });
      const body = await res.json();
      return { status: res.status, days: body?.days ?? null };
    } catch (e) {
      return { status: -1, days: null, threw: (e as Error).message };
    }
  };
  const kOn = await withSwitch('on', coordDays);
  const kOff = await withSwitch(undefined, coordDays);
  check(
    'H3',
    "on: the coordinator page's sessions by the date rule, then place (Eve, lunch, dinner)",
    kOn.status === 200 &&
      JSON.stringify(kOn.days?.map((d: any) => d.id)) ===
        JSON.stringify([eve.id, lunchK.id, dinner.id]),
    kOn
  );
  check(
    'H4',
    'off: by the stored time, as before (Eve, dinner, lunch); either way each day is {id, name, date} only',
    kOff.status === 200 &&
      JSON.stringify(kOff.days?.map((d: any) => d.id)) ===
        JSON.stringify([eve.id, dinner.id, lunchK.id]) &&
      [...(kOn.days ?? []), ...(kOff.days ?? [])].every(
        (d: any) => JSON.stringify(Object.keys(d).sort()) === JSON.stringify(['date', 'id', 'name'])
      ),
    kOff
  );

  // ══ K — the words and the new files ═══════════════════════════════════════════════════════
  section('K — the words; never remind or chase; the new files');
  const NEW = [F.tabs, F.ui];
  check(
    'K1',
    'no new file says remind or chase',
    NEW.every((f) => read(f).length > 0) && NEW.every((f) => !/\bremind|\bchase/i.test(read(f)))
  );
  const uiSrc = read(F.ui);
  const uiFetches = uiSrc.match(/\bfetch\(\s*[^,)]+/g) ?? [];
  check(
    'K2',
    'the one request: the session plan asks GET /api/events/:id/sessions, and nothing else; the screens ask nothing',
    uiFetches.length === 1 &&
      uiFetches[0].includes('`/api/events/${eventId}/sessions`') &&
      !/method:/.test(uiSrc) &&
      count(codeOnly(read(F.m3)), 'fetch(') === count(codeOnly(atBase(F.m3)), 'fetch(') &&
      count(codeOnly(read(F.plan)), 'fetch(') === count(codeOnly(atBase(F.plan)), 'fetch('),
    uiFetches
  );
  check(
    'K3',
    'tabs.ts says none of the words the new-file scans refuse',
    tabsSrc.length > 0 &&
      !/\bfetch\b|XMLHttpRequest|sendBeacon|\bconsole\b|dangerouslySetInnerHTML|innerHTML|\beval\b|new\s+RegExp\b/.test(
        tabsSrc
      )
  );
  check(
    'K4',
    'the layout puts the session plan inside the switch, and the switch is still read on the server',
    /await connection\(\);\s*return \(\s*<SessionsSwitchProvider on=\{isSessionsOn\(\)\}>\s*<SessionPlanProvider>\{children\}<\/SessionPlanProvider>/.test(
      read(F.layout)
    )
  );

  // ══ Z — nothing sent, everything removed ══════════════════════════════════════════════════
  section('Z — nothing sent; every row this run made removed by id');
  await cleanUp();
  const sentAfter = [await prisma.outboundMessage.count(), await prisma.inviteEvent.count()];
  check(
    'Z1',
    'nothing sent or logged: the OutboundMessage and InviteEvent counts as found',
    JSON.stringify(sentAfter) === JSON.stringify(sentBefore),
    { sentBefore, sentAfter }
  );
  const left = await Promise.all([
    prisma.event.count({ where: { id: { in: made.events } } }),
    prisma.person.count({ where: { id: { in: made.people } } }),
  ]);
  check(
    'Z2',
    "none of this run's events or people is left",
    left.every((n) => n === 0),
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
