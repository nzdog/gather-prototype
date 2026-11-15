/**
 * [[GTC-444]] — A SAMPLE REACHES THE BOARD; HOST / GUEST.
 *
 * Founder rulings, 1 Nov 2026 (Q4 (A), Q5, Q6, Q16: W42 to W48 as in the GTC-392 plan) and at the
 * build, 2 Nov 2026 (O1 to O8 as recommended): a link beside the pretend panel opens the board, and
 * nothing is marked sent; on a sample COPY only, the board says what amber means there (W43) and
 * offers Host view / Guest view; the guest is Aroha Ngata when the crowd is there, else the first
 * guest she typed who has a link (Person id ascending, O4; "typed" = not a crowd address and not in
 * a household holding one, O5), else W47. GET /api/p/[token] skips the host preview on a copy only
 * and says `sampleCopy: true` there only (O3); the guest page shows W48 on a copy, inline (O7).
 *
 *   P  preconditions: gather_demo, the guarded dev server, no copy at the start, 5f64ce6's server
 *   W  the words: W42 to W48 as the plan wrote them; the guest page's inline W48
 *   L  the link beside the pretend panel (the panel itself unchanged)
 *   T  the toggle, drawn; the board page's source
 *   H  the helper: a real event and a non-copy sample refused; the fixed guest in every case;
 *      the order of guests typed one after another; it writes nothing
 *   R  GET /api/p/[token]: a copy's guest page for its host; a real event, a non-copy sample and a
 *      wrong token byte for byte as 5f64ce6's server answers them; no sampleCopy on a real event;
 *      the host's first open is tracked as a guest's (O2)
 *   G  the guest page: 5f64ce6's plus exactly GTC-444's pieces
 *   A  answering as the guest through the real routes writes the audit rows; nothing is sent; the
 *      copy's board shows the note and the pair, a real board does not
 *   Z  every probe row removed by id; the counts back; tokens.ts as at 5f64ce6, prisma/ as at 5f64ce6
 *      plus exactly GTC-449's one field and its migration (word for word)
 *
 * Routes run over HTTP on the guarded dev server (DEMO_SANDBOX_BASE_URL, default
 * http://localhost:3000). The comparison server is 5f64ce6's tree, exported by `git archive` into a
 * folder outside the repo and served on :3101 against the same gather_demo (GTC444_PARENT_URL, if
 * set, names one already running). Links are minted in process by `ensureEventTokens`, the call
 * the hold makes; nothing here edits src/lib/tokens.ts.
 *
 * SAFETY. gather_demo on this Mac only (refused otherwise; the address is never printed). Every
 * address is made up (@gtc444.invalid, or a copy's own tag under demo-copy.invalid). Nothing here
 * sends, queues, presses Send or calls the AI. Teardown deletes this run's rows by id.
 *
 * Every live condition lives in CHECKS (DEMO_BOARD_DRY_RUN=1 imports CHECKS only). Expected pieces
 * are typed here by hand or read from the plan, never taken from the code under test.
 *
 *   npx tsx --tsconfig tests/tsconfig.json tests/demo-board-test.tsx
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { randomBytes } from 'crypto';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
/** The comparison tree: this ticket's starting commit (a fixed commit). */
const PARENT = '5f64ce6befc59aabdd8e40a5ea2df8c961ec8c3e';
const PARENT_PORT = 3101;
const RUN = randomBytes(4).toString('hex');
const TAG = `gtc444-${RUN}`;
const addr = (local: string) => `${local}-${RUN}@gtc444.invalid`;
const COPY_DOMAIN = '@demo-copy.invalid';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const PRE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const BOARD = 'src/app/plan/[eventId]/glance/page.tsx';
const GUEST = 'src/app/p/[token]/page.tsx';
const PRETEND = 'src/components/demo/PretendSend.tsx';
const GLANCE_BOARD = 'src/components/glance/GlanceBoard.tsx';
const HELPER = 'src/lib/demo/sample-board.ts';

// ── [[GTC-449]]: the ONLY prisma change since the parent, typed by hand ──────────────────────
// One field and its migration. The migration runs on the live database, so its text is pinned
// word for word (a same-size change would pass a line count). Any later schema change updates this.
const OUR_MIGRATION =
  'prisma/migrations/20261102205933_gtc449_person_event_messaging_undecided/migration.sql';
const OUR_MIGRATION_TEXT =
  '-- AlterTable\n' +
  'ALTER TABLE "PersonEvent" ADD COLUMN     "messagingUndecided" BOOLEAN NOT NULL DEFAULT false;\n';
const OUR_FIELD_LINE = '  messagingUndecided   Boolean            @default(false)\n';
/** `git diff --numstat --summary <parent> -- src/lib/tokens.ts prisma`: exactly these lines, so no tokens.ts. */
const OUR_ZONE =
  `2\t0\t${OUR_MIGRATION}\n` +
  '10\t0\tprisma/schema.prisma\n' +
  ` create mode 100644 ${OUR_MIGRATION}\n`;

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

// ── Sources ──────────────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
const atRef = (ref: string, rel: string) => {
  const r = spawnSync('git', ['show', `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 1 << 26,
  });
  return r.status === 0 ? r.stdout : '';
};
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const count = (s: string, needle: string) => s.split(needle).length - 1;
type Pairs = Array<[string, string]>;
function applyPairs(base: string, pairs: Pairs): string | null {
  let s = base;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

/** W42 to W48 as the plan wrote them (GTC-392, "W-lines"), each joined onto one line. */
export function planLines(plan: string): Record<string, string> {
  const from = plan.indexOf('## W-lines (every sentence a visitor reads, from W42)');
  const to = plan.indexOf('## Questions for the founder', from);
  const out: Record<string, string> = {};
  if (from < 0 || to < 0) return out;
  for (const item of plan
    .slice(from, to)
    .split(/\n- (?=W\d+ )/)
    .slice(1)) {
    const one = item
      .split('\n')
      .map((l) => l.trim())
      .join(' ')
      .trim();
    const m = /^(W\d+) \([^)]*\): "(.*)"$/.exec(one);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

// ── The pieces GTC-444 adds, typed by hand ───────────────────────────────────
const PRE_PAIRS: Pairs = [
  [
    "import PretendSend from '@/components/demo/PretendSend';\n",
    "import PretendSend from '@/components/demo/PretendSend';\n" +
      "import SampleBoardLink from '@/components/demo/SampleBoardLink';\n",
  ],
  [
    '          {pretend && <PretendSend state={pretend} />}\n',
    '          {pretend && <PretendSend state={pretend} />}\n' +
      '          {pretend && <SampleBoardLink eventId={eventId} />}\n',
  ],
  // ── [[GTC-449]] S2.5: the six pieces of the pre-flight's decide-later lines, typed by hand. ──
  // Applied after the two above, each old text once. Any later edit of this page updates this list.
  [
    "import { kidsNote } from '@/components/preflight/kids-note';\n",
    "import { kidsNote } from '@/components/preflight/kids-note';\n" +
      "import { decideLaterNote, decideLaterRowLine } from '@/components/preflight/kids-note';\n",
  ],
  [
    '  resolvedContactPersonEventId: string | null;\n  members: Member[];\n',
    '  resolvedContactPersonEventId: string | null;\n' +
      '  /** [[GTC-449]] S2.5: each member also carries the "Decide later" marker, for step 3\'s lines. */\n' +
      '  members: Array<Member & { messagingUndecided?: boolean }>;\n',
  ],
  [
    '  const talk = talkLine(households.filter((h) => channelFor(h, channelCandidates) === null).length);\n',
    '  const talk = talkLine(households.filter((h) => channelFor(h, channelCandidates) === null).length);\n' +
      "  // [[GTC-449]] S2.5 (W7, ruling 28): step 3's second row line, the kids still on decide later.\n" +
      '  const decideLaterLine = decideLaterRowLine(households);\n',
  ],
  [
    '          line={talk ? { text: talk, amber: true } : null}\n',
    '          line={talk ? { text: talk, amber: true } : null}\n' +
      '          secondLine={decideLaterLine ? { text: decideLaterLine, amber: true } : null}\n',
  ],
  [
    '              const kids = kidsNote(h.members);\n',
    '              const kids = kidsNote(h.members);\n' +
      '              // [[GTC-449]] S2.5 (W5 and W6): the kids in this household on decide later, if any.\n' +
      '              const decideLater = decideLaterNote(h.members);\n',
  ],
  [
    '                    {kids && <p className="text-xs text-gray-400 mb-3">{kids}</p>}\n',
    '                    {kids && <p className="text-xs text-gray-400 mb-3">{kids}</p>}\n' +
      '                    {/* [[GTC-449]] S2.5 (W5, W6; rulings 3, 21, 22): the same small grey type as the\n' +
      '                        Kids line. Read-only, no link or button; Send is never blocked by this. */}\n' +
      '                    {decideLater && (\n' +
      '                      <>\n' +
      '                        {decideLater.names && (\n' +
      '                          <p className="text-xs text-gray-400 mb-3">{decideLater.names}</p>\n' +
      '                        )}\n' +
      '                        <p className="text-xs text-gray-400 mb-3">{decideLater.warning}</p>\n' +
      '                      </>\n' +
      '                    )}\n',
  ],
];
const GUEST_PAIRS: Pairs = [
  [
    'interface ParticipantData {\n  isDemo: boolean;\n',
    'interface ParticipantData {\n  isDemo: boolean;\n' +
      "  /** [[GTC-444]] A sample copy's guest page: W48 back to the board. Absent on any other event. */\n" +
      '  sampleCopy?: true;\n',
  ],
  [
    '              Back to Demo\n            </a>\n          )}\n',
    '              Back to Demo\n            </a>\n          )}\n' +
      '          {/* [[GTC-444]] W48, on a sample copy only: back to the board (SAMPLE_BOARD_WORDS). */}\n' +
      '          {data.sampleCopy && (\n' +
      '            <a\n' +
      '              href={`/plan/${data.event.id}/glance`}\n' +
      '              data-back-to-board=""\n' +
      '              className="mb-3 ml-4 inline-flex items-center text-sm text-accent hover:text-sage-800"\n' +
      '            >\n' +
      '              ← Back to the board\n' +
      '            </a>\n' +
      '          )}\n',
  ],
];

/** Every `<a>` in some markup: its href and its words. */
const anchors = (html: string) =>
  [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((m) => ({
    href: (m[1].match(/\bhref="([^"]*)"/) || [])[1] ?? null,
    words: m[2].replace(/<[^>]+>/g, '').trim(),
  }));
const imports = (s: string) =>
  s
    .split('\n')
    .filter((l) => /^import /.test(l))
    .join('\n');

export interface Words {
  SEE_THE_BOARD: string;
  NOTE: string;
  HOST_VIEW: string;
  GUEST_VIEW: string;
  NO_GUEST: string;
  BACK_TO_BOARD: string;
}
interface Res {
  status: number;
  text: string;
}

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** W1 — the module's words are the plan's W42 to W48, character for character. */
  wordsAsPlanned(
    words: Words | null,
    line: ((n: string, f: string) => string) | null,
    plan: Record<string, string>
  ) {
    return (
      !!words &&
      !!line &&
      Object.keys(plan).filter((k) => /^W4[2-8]$/.test(k)).length === 7 &&
      words.SEE_THE_BOARD === plan.W42 &&
      words.NOTE === plan.W43 &&
      words.HOST_VIEW === plan.W44 &&
      words.GUEST_VIEW === plan.W45 &&
      line('{Name}', '{First}') === plan.W46 &&
      words.NO_GUEST === plan.W47 &&
      words.BACK_TO_BOARD === plan.W48
    );
  },
  /** W2 — the guest page's W48 is inline: its words are the helper's W48, its link the board's; no new import. */
  inlineW48(now: string, base: string, w48: string | null) {
    const i = now.indexOf('{data.sampleCopy && (');
    const block = i < 0 ? '' : now.slice(i, now.indexOf('          )}\n', i));
    const m = /data-back-to-board=""[\s\S]*?>\n\s*([^\n<]+)\n\s*<\/a>/.exec(block);
    return (
      !!w48 &&
      block.includes('href={`/plan/${data.event.id}/glance`}') &&
      !!m &&
      m[1].trim() === w48 &&
      base.length > 1000 &&
      imports(now) === imports(base)
    );
  },
  /** L1 — the link: one `<a>`, to the board, in W42's words. */
  boardLink(html: string, eventId: string, w42: string | null) {
    const a = anchors(html);
    return (
      !!w42 &&
      a.length === 1 &&
      a[0].href === `/plan/${eventId}/glance` &&
      a[0].words === w42 &&
      !/<button\b/.test(html)
    );
  },
  /** L2 — the pre-flight is 5f64ce6's with exactly the import and the line after the panel, on `pretend`, plus GTC-449's six S2.5 pieces (and nothing else). */
  preflightLine(now: string, base: string) {
    const exact = base.length > 1000 ? applyPairs(base, PRE_PAIRS) : null;
    return (
      exact !== null &&
      now === exact &&
      now.includes(
        '{pretend && <PretendSend state={pretend} />}\n          {pretend && <SampleBoardLink eventId={eventId} />}'
      )
    );
  },
  /** Z3 — tokens.ts untouched; prisma/ shows exactly GTC-449's field (10 lines) and migration (2 lines), no more; the migration is those two lines word for word; the field line is there once. */
  zoneIsOurs(status: number | null, out: string, migration: string, schema: string) {
    return (
      status === 0 &&
      out === OUR_ZONE &&
      migration === OUR_MIGRATION_TEXT &&
      schema.split(OUR_FIELD_LINE).length === 2
    );
  },
  /** L3 — CONTROL: the panel itself is as at 5f64ce6, and has no link or button. */
  panelUnchanged(now: string, base: string, html: string) {
    return base.length > 500 && now === base && html.length > 100 && !/<a\b|<button\b/.test(html);
  },
  /** T1 — with a guest: W43; Host view to the board, Guest view to her page; W46 with her names. */
  toggleWithGuest(
    html: string,
    eventId: string,
    guestHref: string,
    w: Words | null,
    w46: string | null
  ) {
    const a = anchors(html);
    return (
      !!w &&
      !!w46 &&
      html.includes(w.NOTE) &&
      a.length === 2 &&
      a[0].href === `/plan/${eventId}/glance` &&
      a[0].words === w.HOST_VIEW &&
      a[1].href === guestHref &&
      a[1].words === w.GUEST_VIEW &&
      html.includes(w46) &&
      !html.includes(w.NO_GUEST)
    );
  },
  /** T2 — no guest: Host view the only link; Guest view plain text; W47 in W46's place. */
  toggleNoGuest(html: string, eventId: string, w: Words | null) {
    const a = anchors(html);
    const text = html.replace(/<a\b[\s\S]*?<\/a>/g, '');
    return (
      !!w &&
      html.includes(w.NOTE) &&
      a.length === 1 &&
      a[0].href === `/plan/${eventId}/glance` &&
      a[0].words === w.HOST_VIEW &&
      text.includes(`>${w.GUEST_VIEW}<`) &&
      html.includes(w.NO_GUEST) &&
      !html.includes('Guest view opens')
    );
  },
  /** T3 — the board page reads the helper, draws the toggle before the strip, names no token. */
  boardPage(code: string, glanceNow: string, glanceBase: string) {
    const t = code.indexOf('{sample && <SampleViewToggle eventId={eventId} view={sample} />}');
    const arc = code.indexOf('<MomentArc');
    return (
      /readSampleBoardView\(prisma, eventId/.test(code) &&
      t > 0 &&
      arc > t &&
      count(code, '<MomentArc') === 1 &&
      !/\b(accessToken|token)\b/.test(code) &&
      !/searchParams/.test(code) &&
      glanceBase.length > 1000 &&
      glanceNow === glanceBase
    );
  },
  /** H8 — the helper's source writes nothing. */
  readsOnly(src: string) {
    return (
      src.length > 500 &&
      !/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$executeRaw|\$queryRaw/.test(
        codeOnly(src)
      )
    );
  },
  /** R1, R2 — a copy's link: the guest's own page, never the preview, with sampleCopy: true. */
  copyGuestPage(r: Res, name: string) {
    let j: any = null;
    try {
      j = JSON.parse(r.text);
    } catch {
      j = null;
    }
    return (
      r.status === 200 &&
      !!j &&
      j.isHostPreview === undefined &&
      j.sampleCopy === true &&
      j.isDemo === true &&
      j.person?.name === name &&
      Array.isArray(j.assignments) &&
      'attendance' in j &&
      typeof j.event?.hostFirstName === 'string'
    );
  },
  /** R3, R4, R6, R8 — byte for byte as 5f64ce6's server answers. */
  sameAs(now: Res, before: Res) {
    return (
      now.status > 0 &&
      now.status === before.status &&
      now.text.length > 0 &&
      now.text === before.text
    );
  },
  /** R5 — CONTROL (O3): a real event's response has no sampleCopy key at all. */
  noSampleCopy(text: string) {
    let j: any = null;
    try {
      j = JSON.parse(text);
    } catch {
      return false;
    }
    return !!j && !('sampleCopy' in j) && !text.includes('"sampleCopy"');
  },
  /** G1 — the guest page is 5f64ce6's with exactly GTC-444's pieces, byte for byte. */
  guestPage(now: string, base: string) {
    const exact = base.length > 1000 ? applyPairs(base, GUEST_PAIRS) : null;
    return exact !== null && now === exact;
  },
  /** A4 — the copy's board: W43, Host view to itself, Guest view to Aroha's page, W46 naming her. */
  copyBoard(html: string, eventId: string, guestHref: string, w: Words | null, w46: string | null) {
    const a = anchors(html);
    const host = a.filter((x) => x.words === w?.HOST_VIEW);
    const guest = a.filter((x) => x.words === w?.GUEST_VIEW);
    return (
      !!w &&
      !!w46 &&
      html.includes('data-sample-board=""') &&
      html.includes(w.NOTE) &&
      host.length === 1 &&
      host[0].href === `/plan/${eventId}/glance` &&
      guest.length === 1 &&
      guest[0].href === guestHref &&
      html.includes(w46)
    );
  },
  /** A5 — CONTROL: a real event's board has none of it. */
  realBoard(html: string, w: Words | null) {
    return (
      html.includes('max-w-[960px]') &&
      !html.includes('data-sample-board') &&
      (!w ||
        (!html.includes(w.NOTE) &&
          !html.includes(`>${w.HOST_VIEW}<`) &&
          !html.includes(`>${w.GUEST_VIEW}<`)))
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

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

const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessions: new Set<string>(),
};

async function http(
  base: string,
  method: string,
  p: string,
  cookie?: string,
  body?: unknown
): Promise<Res> {
  try {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (cookie) headers.cookie = cookie;
    const res = await fetch(`${base}${p}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'manual',
    });
    return { status: res.status, text: await res.text() };
  } catch (e) {
    return { status: -1, text: String(e) };
  }
}
const json = (r: Res) => {
  try {
    return JSON.parse(r.text);
  } catch {
    return null;
  }
};

const TABLES = [
  'event',
  'eventSetup',
  'person',
  'user',
  'session',
  'accessToken',
  'inviteEvent',
  'outboundMessage',
  'planRevision',
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

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** One member of an event by first name, or null. */
async function memberNamed(eventId: string, first: string) {
  const rows = await prisma.personEvent.findMany({
    where: { eventId, person: { name: { startsWith: first } } },
    select: { person: { select: { id: true, name: true } } },
  });
  return rows.length === 1 ? rows[0].person : null;
}
async function linkOf(eventId: string, personId: string) {
  const t = await prisma.accessToken.findFirst({
    where: { eventId, personId, scope: 'PARTICIPANT' },
    select: { id: true, token: true, openedAt: true },
  });
  return t;
}

/** An event hosted by a made-up account, signed in by a Session this run makes, with one guest. */
async function hostedEvent(label: string, isDemo: boolean, TOKENS: any) {
  const email = addr(`host-${label}`);
  const user = await prisma.user.create({ data: { email } });
  fx.users.add(user.id);
  const host = await prisma.person.create({ data: { name: 'Hana Host', email, userId: user.id } });
  fx.persons.add(host.id);
  const day = new Date(Date.UTC(2027, 0, 9));
  const ev = await prisma.event.create({
    data: {
      name: `${TAG} ${label}`,
      startDate: day,
      endDate: day,
      status: 'DRAFT',
      structureMode: 'EDITABLE',
      isLegacy: false,
      isDemo,
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
  fx.events.add(ev.id);
  await prisma.eventRole.create({ data: { userId: user.id, eventId: ev.id, role: 'HOST' } });
  const guest = await prisma.person.create({
    data: { name: 'Lena Guest', email: addr(`lena-${label}`) },
  });
  fx.persons.add(guest.id);
  await prisma.personEvent.create({
    data: { personId: guest.id, eventId: ev.id, role: 'PARTICIPANT' },
  });
  const team = await prisma.team.create({ data: { name: `${TAG} team`, eventId: ev.id } });
  const item = await prisma.item.create({ data: { name: 'Pavlova', teamId: team.id } });
  await prisma.assignment.create({ data: { itemId: item.id, personId: guest.id } });
  await TOKENS.ensureEventTokens(ev.id);
  const link = await linkOf(ev.id, guest.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3 * 60 * 60 * 1000) },
  });
  fx.sessions.add(token);
  return { eventId: ev.id, cookie: `session=${token}`, link: link?.token ?? 'missing' };
}

async function startCopy(COPY: any) {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessions.add(c.sessionToken);
  const ev = await prisma.event.findUnique({ where: { id: c.eventId }, select: { hostId: true } });
  fx.persons.add(ev!.hostId);
  return { eventId: c.eventId as string, cookie: `session=${c.sessionToken}` };
}
async function typeGuest(eventId: string, cookie: string, name: string) {
  const r = await http(BASE, 'POST', `/api/events/${eventId}/households`, cookie, {
    primaryContact: { name, email: addr(name.toLowerCase().split(' ')[0]) },
  });
  const p = await memberNamed(eventId, name.split(' ')[0]);
  if (p) fx.persons.add(p.id);
  return { status: r.status, person: p };
}
async function addCrowd(eventId: string, cookie: string) {
  const r = await http(BASE, 'POST', `/api/events/${eventId}/households`, cookie, {
    demoCrowd: true,
  });
  const members = await prisma.personEvent.findMany({
    where: { eventId },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  return r.status;
}

/** 5f64ce6's tree, exported outside the repo, served on :3101 against the same gather_demo. */
async function startParent(): Promise<{ url: string; stop: () => Promise<void>; note: string }> {
  if (process.env.GTC444_PARENT_URL) {
    return { url: process.env.GTC444_PARENT_URL, stop: async () => {}, note: 'given' };
  }
  const busy = await fetch(`http://127.0.0.1:${PARENT_PORT}/`)
    .then(() => true)
    .catch(() => false);
  if (busy) throw new Error(`port ${PARENT_PORT} is in use: 5f64ce6's server cannot start`);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gtc444-parent-'));
  if (dir.startsWith(ROOT)) throw new Error('the scratch folder is inside the repo');
  const tar = spawnSync('sh', ['-c', `git -C "${ROOT}" archive ${PARENT} | tar -x -C "${dir}"`]);
  const cp = spawnSync('cp', [
    '-cR',
    path.join(ROOT, 'node_modules'),
    path.join(dir, 'node_modules'),
  ]);
  if (tar.status !== 0 || cp.status !== 0 || !fs.existsSync(path.join(dir, GUEST)))
    throw new Error("5f64ce6's tree could not be exported");
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NEXT_TELEMETRY_DISABLED: '1',
    DATABASE_URL: process.env.DATABASE_URL ?? '',
    ANTHROPIC_API_KEY: '',
    RESEND_API_KEY: '',
    TWILIO_ACCOUNT_SID: '',
    TWILIO_AUTH_TOKEN: '',
    TWILIO_PHONE_NUMBER: '',
    TNZ_AUTH_TOKEN: '',
    TNZ_API_KEY: '',
    CRON_SECRET: '',
    STRIPE_SECRET_KEY: 'gtc444-made-up-not-a-stripe-key',
    STRIPE_WEBHOOK_SECRET: 'gtc444-made-up-not-a-webhook-secret',
  };
  const child: ChildProcess = spawn(
    path.join(dir, 'node_modules', '.bin', 'next'),
    ['dev', '--turbo', '-p', String(PARENT_PORT)],
    { cwd: dir, env, detached: true, stdio: 'ignore' }
  );
  const kill = () => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGTERM');
    } catch {
      // already gone
    }
  };
  process.on('exit', kill);
  const url = `http://localhost:${PARENT_PORT}`;
  let up = false;
  for (let i = 0; i < 240 && !up; i++) {
    up = await fetch(`${url}/privacy`)
      .then((r) => r.status === 200)
      .catch(() => false);
    if (!up) await sleep(500);
  }
  const stop = async () => {
    kill();
    await sleep(1500);
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      // stopped
    }
    for (let i = 0; i < 5; i++) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
        break;
      } catch {
        await sleep(1000);
      }
    }
  };
  if (!up) {
    await stop();
    throw new Error("5f64ce6's server did not answer");
  }
  return { url, stop, note: 'started' };
}

async function teardown() {
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  await prisma.event.deleteMany({ where: { id: { in: events } } });
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
  // ══ W, L, T, G — the sources and the drawn pieces (no database) ═════════════
  const MOD: any = await load('../src/lib/demo/sample-board');
  const words: Words | null = MOD?.SAMPLE_BOARD_WORDS ?? null;
  const line: ((n: string, f: string) => string) | null = MOD?.guestViewLine ?? null;
  const plan = planLines(read('docs/tickets/GTC-392.md'));

  section('W — the words');
  assert(
    'W',
    'W1 W42 to W48 in the helper are the plan’s lines, character for character (read from GTC-392)',
    CHECKS.wordsAsPlanned(words, line, plan),
    JSON.stringify({ module: !!MOD, planLines: Object.keys(plan).length })
  );
  assert(
    'W',
    'W2 O7: the guest page’s W48 is inline, in the helper’s W48 words, linking to the board; its imports are 5f64ce6’s',
    CHECKS.inlineW48(read(GUEST), atRef(PARENT, GUEST), words?.BACK_TO_BOARD ?? null)
  );

  section('L — the link beside the pretend panel');
  const LINK: any = await load('../src/components/demo/SampleBoardLink');
  const linkHtml = LINK?.default
    ? renderToStaticMarkup(createElement(LINK.default, { eventId: 'ev-made-up' }))
    : '';
  assert(
    'L',
    'L1 SampleBoardLink draws one link, to /plan/<id>/glance, in W42’s words, and no button',
    CHECKS.boardLink(linkHtml, 'ev-made-up', words?.SEE_THE_BOARD ?? null),
    linkHtml.slice(0, 200)
  );
  assert(
    'L',
    'L2 the pre-flight draws it right after the pretend panel, on `pretend` only (a sample after the pretend Send): 5f64ce6’s page plus exactly the import and that line, and GTC-449’s six pre-flight pieces',
    CHECKS.preflightLine(read(PRE), atRef(PARENT, PRE))
  );
  const PS: any = await load('../src/components/demo/PretendSend');
  const psHtml = PS?.default
    ? renderToStaticMarkup(
        createElement(PS.default, {
          state: {
            messages: [
              { name: 'Aroha Ngata', channel: 'EMAIL', withChildren: [], brief: 'nothing' },
            ],
            emailed: 1,
            texted: 0,
            carrierFor: [],
            leftToHer: ['June Walker'],
          },
        })
      )
    : '';
  assert(
    'L',
    'L3 CONTROL: the pretend panel is as at 5f64ce6 and has no link or button (the link is beside it, not in it)',
    CHECKS.panelUnchanged(read(PRETEND), atRef(PARENT, PRETEND), psHtml),
    psHtml.slice(0, 160)
  );

  section('T — the toggle and the board page');
  const TOG: any = await load('../src/components/demo/SampleViewToggle');
  const madeUpGuest = { name: 'Aroha Ngata', firstName: 'Aroha', href: '/p/made-up-link' };
  const togGuest = TOG?.default
    ? renderToStaticMarkup(
        createElement(TOG.default, { eventId: 'ev-made-up', view: { guest: madeUpGuest } })
      )
    : '';
  const togNone = TOG?.default
    ? renderToStaticMarkup(
        createElement(TOG.default, { eventId: 'ev-made-up', view: { guest: null } })
      )
    : '';
  assert(
    'T',
    'T1 with a guest: W43; Host view links to the board, Guest view to her page; W46 names her and her first name',
    CHECKS.toggleWithGuest(
      togGuest,
      'ev-made-up',
      '/p/made-up-link',
      words,
      line ? line('Aroha Ngata', 'Aroha') : null
    ),
    togGuest.slice(0, 300)
  );
  assert(
    'T',
    'T2 O8, no guest: Host view the only link, Guest view plain text, W47 in W46’s place',
    CHECKS.toggleNoGuest(togNone, 'ev-made-up', words),
    togNone.slice(0, 300)
  );
  assert(
    'T',
    'T3 the board page reads the helper and draws the toggle before the Moments strip; it names no token and no searchParams; GlanceBoard is as at 5f64ce6',
    CHECKS.boardPage(codeOnly(read(BOARD)), read(GLANCE_BOARD), atRef(PARENT, GLANCE_BOARD))
  );

  section('G — the guest page’s source');
  assert(
    'G',
    'G1 the guest page is 5f64ce6’s plus exactly the sampleCopy field, its comment and the W48 block (on sampleCopy, after “Back to Demo”), byte for byte',
    CHECKS.guestPage(read(GUEST), atRef(PARENT, GUEST))
  );

  // ══ P, H, R, A, Z — the database and the servers ═══════════════════════════
  section('P — preconditions');
  assert('P', 'P1 DATABASE_URL names the local database gather_demo (address not printed)', DB_OK);
  if (!DB_OK) return;
  const client = await import('@prisma/client');
  prisma = new client.PrismaClient();
  const COPY: any = await import('../src/lib/demo/copy');
  const TOKENS: any = await import('../src/lib/tokens');
  const start = await totals();
  let parent: { url: string; stop: () => Promise<void>; note: string } | null = null;
  try {
    const serverOk = (await http(BASE, 'GET', `/api/events/${TAG}-probe/people`)).status === 401;
    assert('P', `P2 the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
    const copiesAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'P',
      'P3 no copy is in the database at the start',
      copiesAtStart === 0,
      `${copiesAtStart}`
    );
    let parentErr = '';
    try {
      parent = await startParent();
    } catch (e) {
      parentErr = e instanceof Error ? e.message : String(e);
    }
    assert(
      'P',
      `P4 5f64ce6’s server answers on :${PARENT_PORT} (${parent?.note ?? 'not started'}), against the same gather_demo`,
      !!parent,
      parentErr
    );

    // ── The fixtures ──────────────────────────────────────────────────────────
    const real = await hostedEvent('real', false, TOKENS);
    const oldRow = await hostedEvent('sample-not-copy', true, TOKENS);
    const A = await startCopy(COPY);
    const hhA = await http(BASE, 'POST', `/api/events/${A.eventId}/host-household`, A.cookie, {
      name: 'Sam',
    });

    section('H — the helper: who the guest is');
    const view = (id: string) =>
      MOD?.readSampleBoardView ? MOD.readSampleBoardView(prisma, id) : Promise.resolve('no helper');
    const isCopy = (id: string) =>
      MOD?.isSampleCopy ? MOD.isSampleCopy(prisma, id) : Promise.resolve('no helper');
    const h1 = { view: await view(real.eventId), copy: await isCopy(real.eventId) };
    assert(
      'H',
      'H1 a real event (with a linked guest): no view, not a copy — the helper refuses it',
      h1.view === null && h1.copy === false,
      JSON.stringify(h1)
    );
    const h2 = { view: await view(oldRow.eventId), copy: await isCopy(oldRow.eventId) };
    assert(
      'H',
      'H2 a sample that is not a copy (the old shared row’s shape): no view, not a copy',
      h2.view === null && h2.copy === false,
      JSON.stringify(h2)
    );

    // Three guests typed one after another, in an order no name order gives (Mia, Zara, Ari).
    const mia = await typeGuest(A.eventId, A.cookie, 'Mia Typed');
    const zara = await typeGuest(A.eventId, A.cookie, 'Zara Typed');
    const ari = await typeGuest(A.eventId, A.cookie, 'Ari Typed');
    const h3 = await view(A.eventId);
    assert(
      'H',
      'H3 a copy before any link (before the hold): a view with no guest (W47)',
      hhA.status === 201 &&
        [mia, zara, ari].every((g) => g.status === 201) &&
        !!h3 &&
        typeof h3 === 'object' &&
        h3.guest === null,
      JSON.stringify({ hh: hhA.status, typed: [mia.status, zara.status, ari.status], h3 })
    );
    await TOKENS.ensureEventTokens(A.eventId);
    const h4 = await view(A.eventId);
    const ids = [mia.person?.id ?? '', zara.person?.id ?? '', ari.person?.id ?? ''];
    assert(
      'H',
      'H4 O4: three guests typed one after another have ids that ascend in that order, and the first typed (Mia) is the guest',
      ids.every(Boolean) &&
        ids[0] < ids[1] &&
        ids[1] < ids[2] &&
        h4?.guest?.name === 'Mia Typed' &&
        h4?.guest?.firstName === 'Mia',
      JSON.stringify({
        ascending: ids[0] < ids[1] && ids[1] < ids[2],
        guest: h4?.guest?.name ?? h4,
      })
    );
    const crowdA = await addCrowd(A.eventId, A.cookie);
    await TOKENS.ensureEventTokens(A.eventId);
    const aroha = await memberNamed(A.eventId, 'Aroha');
    const arohaLink = aroha ? await linkOf(A.eventId, aroha.id) : null;
    const h5 = await view(A.eventId);
    assert(
      'H',
      'H5 the crowd added after them: Aroha Ngata is the guest, with her own link',
      crowdA === 201 &&
        !!arohaLink &&
        h5?.guest?.name === 'Aroha Ngata' &&
        h5?.guest?.href === `/p/${arohaLink.token}`,
      JSON.stringify({ crowd: crowdA, guest: h5?.guest?.name ?? h5, link: !!arohaLink })
    );

    // A second copy: the crowd first, Aroha removed, then one typed guest.
    const B = await startCopy(COPY);
    const hhB = await http(BASE, 'POST', `/api/events/${B.eventId}/host-household`, B.cookie, {
      name: 'Sam',
    });
    const crowdB = await addCrowd(B.eventId, B.cookie);
    const arohaB = await memberNamed(B.eventId, 'Aroha');
    const del = arohaB
      ? await http(BASE, 'DELETE', `/api/events/${B.eventId}/people/${arohaB.id}`, B.cookie)
      : { status: -1, text: '' };
    await TOKENS.ensureEventTokens(B.eventId);
    const crowdLinks = await prisma.accessToken.count({
      where: { eventId: B.eventId, scope: 'PARTICIPANT' },
    });
    const juneB = await memberNamed(B.eventId, 'June');
    const juneLink = juneB ? await linkOf(B.eventId, juneB.id) : null;
    const h7 = await view(B.eventId);
    assert(
      'H',
      'H7 the crowd there, Aroha removed, nobody typed: no guest (W47) — never a crowd person, June (no address) included',
      hhB.status === 201 &&
        crowdB === 201 &&
        del.status === 200 &&
        crowdLinks > 5 &&
        !!juneLink &&
        !!h7 &&
        typeof h7 === 'object' &&
        h7.guest === null,
      JSON.stringify({
        hh: hhB.status,
        crowd: crowdB,
        del: del.status,
        crowdLinks,
        june: !!juneLink,
        h7,
      })
    );
    const kiri = await typeGuest(B.eventId, B.cookie, 'Kiri Typed');
    await TOKENS.ensureEventTokens(B.eventId);
    const h6 = await view(B.eventId);
    assert(
      'H',
      'H6 O5: then a guest typed after the crowd: she is the guest, though every crowd person was made before her',
      kiri.status === 201 && h6?.guest?.name === 'Kiri Typed',
      JSON.stringify({ typed: kiri.status, guest: h6?.guest?.name ?? h6 })
    );
    const before8 = await totals();
    const opened8 = await prisma.accessToken.count({
      where: { eventId: { in: [A.eventId, B.eventId] }, openedAt: { not: null } },
    });
    for (const id of [real.eventId, oldRow.eventId, A.eventId, B.eventId]) {
      await view(id);
      await isCopy(id);
    }
    const after8 = await totals();
    const opened8b = await prisma.accessToken.count({
      where: { eventId: { in: [A.eventId, B.eventId] }, openedAt: { not: null } },
    });
    assert(
      'H',
      'H8 the helper writes nothing: no count moves and no link is marked opened across its reads; its source has no write',
      !!MOD &&
        JSON.stringify(before8) === JSON.stringify(after8) &&
        opened8 === opened8b &&
        CHECKS.readsOnly(read(HELPER)),
      JSON.stringify({
        module: !!MOD,
        same: JSON.stringify(before8) === JSON.stringify(after8),
        opened8,
        opened8b,
      })
    );

    section('R — GET /api/p/[token]');
    const arohaTok = arohaLink?.token ?? 'missing';
    const r1 = await http(BASE, 'GET', `/api/p/${arohaTok}`, A.cookie);
    let stamped = false;
    for (let i = 0; i < 20 && !stamped; i++) {
      stamped = !!(aroha && (await linkOf(A.eventId, aroha.id))?.openedAt);
      if (!stamped) await sleep(250);
    }
    const opens = () =>
      prisma.inviteEvent.count({
        where: { eventId: A.eventId, personId: aroha?.id ?? '-', type: 'LINK_OPENED' },
      });
    const opensAfterFirst = await opens();
    assert(
      'R',
      'R1 a copy’s link opened by the copy’s own host: the guest’s own page (Aroha), sampleCopy true, never the preview',
      CHECKS.copyGuestPage(r1, 'Aroha Ngata'),
      `${r1.status} ${r1.text.slice(0, 160)}`
    );
    const r2 = await http(BASE, 'GET', `/api/p/${arohaTok}`);
    await sleep(1500);
    const opensAfterSecond = await opens();
    assert(
      'R',
      'R2 the same link with no session: the guest’s page with sampleCopy true',
      CHECKS.copyGuestPage(r2, 'Aroha Ngata'),
      `${r2.status} ${r2.text.slice(0, 160)}`
    );
    const P = parent?.url ?? 'http://127.0.0.1:1';
    const r3 = {
      now: await http(BASE, 'GET', `/api/p/${real.link}`, real.cookie),
      before: await http(P, 'GET', `/api/p/${real.link}`, real.cookie),
    };
    assert(
      'R',
      'R3 CONTROL: a real event’s link opened by its host: the preview, byte for byte as 5f64ce6’s server answers',
      CHECKS.sameAs(r3.now, r3.before) && json(r3.now)?.isHostPreview === true,
      `${r3.now.status}/${r3.before.status} same=${r3.now.text === r3.before.text}`
    );
    const r4 = {
      now: await http(BASE, 'GET', `/api/p/${real.link}`),
      before: await http(P, 'GET', `/api/p/${real.link}`),
    };
    assert(
      'R',
      'R4 CONTROL: a real event’s link with no session: the guest’s page, byte for byte as 5f64ce6’s',
      CHECKS.sameAs(r4.now, r4.before) && json(r4.now)?.person?.name === 'Lena Guest',
      `${r4.now.status}/${r4.before.status} same=${r4.now.text === r4.before.text}`
    );
    assert(
      'R',
      'R5 CONTROL (O3): neither of a real event’s responses carries a sampleCopy key at all',
      CHECKS.noSampleCopy(r3.now.text) && CHECKS.noSampleCopy(r4.now.text)
    );
    const wrong = `gtc444-no-such-link-${RUN}`;
    const r6 = {
      now: await http(BASE, 'GET', `/api/p/${wrong}`),
      before: await http(P, 'GET', `/api/p/${wrong}`),
    };
    assert(
      'R',
      'R6 CONTROL: a wrong token answers byte for byte as 5f64ce6’s server does',
      CHECKS.sameAs(r6.now, r6.before) && r6.now.status === 403,
      `${r6.now.status}/${r6.before.status} ${r6.now.text.slice(0, 80)}`
    );
    assert(
      'R',
      'R7 O2: the host’s first open of a copy’s link stamps openedAt and writes one LINK_OPENED on the copy, as a guest’s would; a second open writes none',
      stamped && opensAfterFirst === 1 && opensAfterSecond === 1,
      JSON.stringify({ stamped, opensAfterFirst, opensAfterSecond })
    );
    const r8 = {
      now: await http(BASE, 'GET', `/api/p/${oldRow.link}`, oldRow.cookie),
      before: await http(P, 'GET', `/api/p/${oldRow.link}`, oldRow.cookie),
    };
    assert(
      'R',
      'R8 CONTROL: a sample that is not a copy, opened by its host: still the preview, byte for byte as 5f64ce6’s',
      CHECKS.sameAs(r8.now, r8.before) && json(r8.now)?.isHostPreview === true,
      `${r8.now.status}/${r8.before.status} same=${r8.now.text === r8.before.text}`
    );

    section('A — answering as the guest; nothing sent; the boards');
    const team = await prisma.team.create({ data: { name: `${TAG} team`, eventId: A.eventId } });
    const item = await prisma.item.create({ data: { name: 'Kūmara salad', teamId: team.id } });
    const asg = await prisma.assignment.create({
      data: { itemId: item.id, personId: aroha?.id ?? '-' },
    });
    const audit0 = await prisma.auditEntry.count({ where: { eventId: A.eventId } });
    const a1 = await http(BASE, 'POST', `/api/p/${arohaTok}/ack/${asg.id}`, A.cookie, {
      response: 'DECLINED',
    });
    const audit1 = await prisma.auditEntry.count({ where: { eventId: A.eventId } });
    const declined = (await prisma.assignment.findUnique({ where: { id: asg.id } }))?.response;
    assert(
      'A',
      'A1 Aroha answers her dish through the real route (POST ack): 200, the answer stored, an AuditEntry row on the copy',
      a1.status === 200 && declined === 'DECLINED' && audit1 > audit0,
      JSON.stringify({ status: a1.status, declined, audit0, audit1 })
    );
    const a2 = await http(BASE, 'PATCH', `/api/p/${arohaTok}`, A.cookie, { attending: true });
    const attendanceRows = await prisma.auditEntry.count({
      where: { eventId: A.eventId, actionType: 'ANSWER_ATTENDANCE' },
    });
    assert(
      'A',
      'A2 then her attendance through the real route (PATCH): 200, and an ANSWER_ATTENDANCE row on the copy',
      a2.status === 200 && attendanceRows === 1,
      JSON.stringify({ status: a2.status, attendanceRows })
    );
    const sent = await prisma.outboundMessage.count({ where: { eventId: { in: [...fx.events] } } });
    const sentTotal = await prisma.outboundMessage.count();
    assert(
      'A',
      'A3 nothing sent: no OutboundMessage on any event of this run, and the table’s count as at the start',
      sent === 0 && sentTotal === start.outboundMessage,
      JSON.stringify({ sent, sentTotal, start: start.outboundMessage })
    );
    const boardA = await http(BASE, 'GET', `/plan/${A.eventId}/glance`, A.cookie);
    assert(
      'A',
      'A4 the copy’s board: W43, Host view to itself, Guest view to Aroha’s own page, W46 naming her',
      boardA.status === 200 &&
        CHECKS.copyBoard(
          boardA.text,
          A.eventId,
          `/p/${arohaTok}`,
          words,
          line ? line('Aroha Ngata', 'Aroha') : null
        ),
      `${boardA.status} len=${boardA.text.length}`
    );
    const boardR = await http(BASE, 'GET', `/plan/${real.eventId}/glance`, real.cookie);
    assert(
      'A',
      'A5 CONTROL: a real event’s board has no note, no Host view and no Guest view',
      boardR.status === 200 &&
        CHECKS.realBoard(
          boardR.text,
          words ?? ({ NOTE: plan.W43, HOST_VIEW: plan.W44, GUEST_VIEW: plan.W45 } as Words)
        ),
      `${boardR.status} len=${boardR.text.length}`
    );
  } finally {
    await teardown();
    if (parent) await parent.stop();
  }

  section('Z — every probe row removed');
  const leftPeople = await prisma.person.count({ where: { id: { in: [...fx.persons] } } });
  const leftEvents = await prisma.event.count({ where: { id: { in: [...fx.events] } } });
  const leftUsers = await prisma.user.count({ where: { id: { in: [...fx.users] } } });
  const leftTyped = await prisma.person.count({ where: { email: { contains: RUN } } });
  assert(
    'Z',
    'Z1 every person, event and user this run made is gone, by id',
    leftPeople === 0 && leftEvents === 0 && leftUsers === 0 && leftTyped === 0,
    JSON.stringify({ leftPeople, leftEvents, leftUsers, leftTyped })
  );
  const end = await totals();
  const moved = Object.keys(start).filter((k) => start[k] !== end[k]);
  assert(
    'Z',
    'Z2 every table’s count is back to the start',
    moved.length === 0,
    moved.map((k) => `${k} ${start[k]} -> ${end[k]}`).join(', ')
  );
  const zone = spawnSync(
    'git',
    ['diff', '--numstat', '--summary', PARENT, '--', 'src/lib/tokens.ts', 'prisma'],
    { cwd: ROOT, encoding: 'utf8' }
  );
  assert(
    'Z',
    'Z3 src/lib/tokens.ts is as at 5f64ce6, and prisma/ is as at 5f64ce6 plus exactly GTC-449’s one field and its migration (word for word)',
    CHECKS.zoneIsOurs(zone.status, zone.stdout, read(OUR_MIGRATION), read('prisma/schema.prisma')),
    `${zone.status} ${String(zone.stdout).replace(/\n/g, ' | ').slice(0, 300)}`
  );
}

// A dry run imports CHECKS and the helpers only (DEMO_BOARD_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_BOARD_DRY_RUN !== '1') {
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
}
