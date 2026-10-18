/**
 * [[GTC-392]] part B — THE SHORTCUTS AND THE PRETEND SEND on a visitor's sample copy.
 *
 * Founder plan rulings, 18 Oct 2026 (in Cowork): QB1 the sending code untouched, the screen shows
 * the pretend list; QB2 nothing recorded, the sample is never marked as sent; QB3 made-up
 * addresses for the adults, a different tag in every sample, none for Nana June and the kids, no
 * phone numbers; QB4 the crowd as written (11 households, 30 people), once; QB5 to QB10 as
 * recommended; QB11 W16 to W41 as the ticket lists them, W35 changed.
 *
 * THE LAYERS
 *   P  preconditions: the dev server, no copy or crowd left over, the live gate shut.
 *   S  static: where the new code sits, and the fences around it; the press and the Send
 *      handler byte for byte as at HEAD (CONTROLs).
 *   C  the crowd, over HTTP with the copy's own session, and in process.
 *   T  the typical answers: the fill rule, and the setup route storing them.
 *   L  the wall underneath, live switch ON behind `liveBehindTrap`, on a sample built through
 *      B's own paths, with its real twin.
 *   R  the pretend Send panel, rendered.
 *   W  the words, byte for byte.
 *   G  teardown: every fixture gone by id, every total as found.
 *
 * SAFETY. The dev server is started with every provider key and the AI key blank and is never
 * live. This suite opens the live gate only through `liveBehindTrap`, behind the provider trap's
 * walls, in layer L. It calls no cron route, runs no drain, makes no AI call, and removes every
 * row it made by id. Every instant, fixture and expected value is written here by hand, never
 * taken from the code under test.
 */
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

process.env.TNZ_AUTH_TOKEN = 'gtc392b-fake-tnz-token';
process.env.TWILIO_ACCOUNT_SID = 'AC' + '0'.repeat(32);
process.env.TWILIO_AUTH_TOKEN = 'gtc392bfakeauthtoken00000000000';
process.env.TWILIO_PHONE_NUMBER = '+15005550006';
process.env.RESEND_API_KEY = 're_gtc392b_fake_key_not_real';
if (!process.env.UNSUBSCRIBE_TOKEN_SECRET) {
  process.env.UNSUBSCRIBE_TOKEN_SECRET = 'gtc392b-fake-unsubscribe-secret';
}
delete process.env.GATHER_LIVE_SENDS;

import { installProviderTrap, liveBehindTrap, trapCount, trapHits } from './helpers/provider-trap';
import { prisma } from '../src/lib/prisma';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Every other src module is loaded inside `main`, after the fake keys above are set:
// `import` lines run before any statement, and tnz-client.ts reads its key once, at load.

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';
const RUN = randomBytes(4).toString('hex');
const TAG = `GTC392B-${RUN}`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const COPY_DOMAIN = '@demo-copy.invalid';

// ── The words, hand-written from the ruled W-lines (18 Oct 2026) ──────────────
const W2 =
  'This is a sample event, so nothing was sent. In a real event, this is where your messages go out.';
const W4 = 'Test emails are off in a sample event.';
const W16 = 'Add a crowd';
const W17 =
  'Adds 30 made-up people in 11 households, so you can try Gather with a full party. You can change or remove any of them.';
const W18 = 'Adding the crowd…';
const W19 = 'Added 30 made-up people in 11 households.';
const W20 = 'The crowd is already here.';
const W21 = 'The crowd couldn’t be added. Try again.';
const W22 = 'A crowd can only be added to a sample event.';
const W23 = 'Fill in typical answers';
const W24 =
  'I’ll answer the questions the way a typical host might. You can change any answer before you press Generate.';
const W25 = 'Filled in. Change anything you like.';
const W26 = 'Everything’s already answered.';
const W27 = 'Tables and chairs out, and the BBQ cleaned with a full gas bottle.';
const W28 = 'Dishes, rubbish and recycling, and a scrape-down of the BBQ.';
const W29 = 'Here’s what Send would have done:';
const W34 = 'Nobody would get a message yet. Add an email or mobile for at least one guest.';
const W35 = 'Each would be the message in step 4, word for word.';
const W35_LINK = 'Open step 4 →';
const W36 = 'I couldn’t put the list together just now. Step 4 shows each message.';
const W38 =
  'On a real event, an email reply comes to you. Here nothing is sent, so nobody can reply.';
const W39 = 'You';
const W40 = 'Sample account';
const W41 = 'Your sample has a made-up account, so there’s no email to fill in.';
/** The route's own words for "her household first", unchanged. */
const HOST_FIRST =
  'Add your own household first — Moment 1 opens with the host, and everyone else is added after.';
/** Log and result text only, never shown (part A). */
const STOP = 'Not sent: this is a sample event';

// ── The crowd, hand-written from the plan (QB3, QB4) ─────────────────────────
type Role = 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD';
const CROWD: Array<{ members: Array<[string, Role, string | null]>; little: number }> = [
  {
    members: [
      ['Aroha Ngata', 'PRIMARY_CONTACT', 'aroha.ngata'],
      ['Wiremu Ngata', 'PARTNER', 'wiremu.ngata'],
      ['Mere Ngata', 'CHILD', null],
    ],
    little: 1,
  },
  {
    members: [
      ['Priya Sharma', 'PRIMARY_CONTACT', 'priya.sharma'],
      ['Dev Sharma', 'PARTNER', 'dev.sharma'],
    ],
    little: 2,
  },
  {
    members: [
      ['Tom Brennan', 'PRIMARY_CONTACT', 'tom.brennan'],
      ['Jess Brennan', 'PARTNER', 'jess.brennan'],
      ['Ollie Brennan', 'CHILD', null],
    ],
    little: 0,
  },
  {
    members: [
      ['Sione Taufa', 'PRIMARY_CONTACT', 'sione.taufa'],
      ['Lupe Taufa', 'PARTNER', 'lupe.taufa'],
      ['Mele Taufa', 'CHILD', null],
    ],
    little: 1,
  },
  { members: [['Grace Liu', 'PRIMARY_CONTACT', 'grace.liu']], little: 0 },
  {
    members: [
      ['Hemi Walker', 'PRIMARY_CONTACT', 'hemi.walker'],
      ['June Walker', 'GUEST', null],
    ],
    little: 0,
  },
  {
    members: [
      ['Sophie Martin', 'PRIMARY_CONTACT', 'sophie.martin'],
      ['Ben Clarke', 'PARTNER', 'ben.clarke'],
    ],
    little: 0,
  },
  {
    members: [
      ['Raj Mehta', 'PRIMARY_CONTACT', 'raj.mehta'],
      ['Anjali Mehta', 'PARTNER', 'anjali.mehta'],
      ['Kiran Mehta', 'CHILD', null],
    ],
    little: 0,
  },
  {
    members: [
      ["Megan O'Neill", 'PRIMARY_CONTACT', 'megan.oneill'],
      ["Liam O'Neill", 'PARTNER', 'liam.oneill'],
    ],
    little: 2,
  },
  {
    members: [
      ['Ana Tupou', 'PRIMARY_CONTACT', 'ana.tupou'],
      ['Josh Ellis', 'GUEST', 'josh.ellis'],
    ],
    little: 0,
  },
  { members: [['Chris Taylor', 'PRIMARY_CONTACT', 'chris.taylor']], little: 0 },
];
const CROWD_PEOPLE = CROWD.flatMap((h) => h.members);
const CROWD_ADULTS_WITH_ADDRESS = CROWD_PEOPLE.filter((m) => m[2] !== null).map((m) => m[0]);

// ── The typical answers, hand-written from the plan (QB5) ────────────────────
const sel = (...levels: string[][]) =>
  Object.fromEntries(levels.map((options, i) => [i, { options, freeText: '' }]));
const BBQ_PICKS: Record<string, Record<number, { options: string[]; freeText: string }>> = {
  mains: sel(['Mixed grill'], ['Sausages and steaks']),
  sides_salads: sel(['Mixed salads'], ['Classic BBQ sides combo']),
  drinks_alcoholic: sel(
    ['Beer and cider'],
    ['Mix of beer and cider'],
    ['Provide low/no-alcohol alternatives']
  ),
  drinks_non_alcoholic: sel(['Soft drinks and juice'], ['L&P and classic NZ fizzy']),
  table_snacks: sel(['Dips and nibbles'], ['Mixed dip platter']),
  dessert: sel(['Pavlova'], ['Classic pavlova with cream']),
};
/** The questions' starting state, as `Moment2Step1Modal` declares it. */
const blankAnswers = () => ({
  eventType: null as string | null,
  eventTypeOther: '',
  mainsData: { items: [] as unknown[], stillDeciding: false } as any,
  sidesData: { items: [] as unknown[], stillDeciding: false },
  dessertsData: { items: [] as unknown[], stillDeciding: false },
  drinksData: { items: [] as unknown[], stillDeciding: false },
  dietaryData: { status: 'unanswered', requirements: [] as string[], other: '' },
  otherNotes: '',
  extendedCategoriesData: {} as Record<string, any>,
  setUpData: { freeText: '', stillDeciding: false },
  cleanUpData: { freeText: '', stillDeciding: false },
  otherJobsOtherData: { freeText: '', stillDeciding: false },
});

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
const ok = (f: () => boolean) => {
  try {
    return f();
  } catch {
    return false;
  }
};

// ── Source reading ───────────────────────────────────────────────────────────
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(read(rel));
const atHead = (rel: string) => {
  const r = spawnSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
};
const unchangedSinceHead = (paths: string[]) =>
  spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT }).status === 0;
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const MODAL = 'src/components/plan/Moment2Step1Modal.tsx';
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const NAV = 'src/components/shared/Navigation.tsx';
const ROUTE = 'src/app/api/events/[id]/households/route.ts';
const CROWD_FILE = 'src/lib/demo/crowd.ts';
const PRETEND_FILE = 'src/lib/demo/pretend-send.ts';
const NEW_CLIENT_SAFE = [
  PRETEND_FILE,
  'src/components/demo/PretendSend.tsx',
  'src/lib/demo/typical-answers.ts',
  'src/components/demo/TypicalAnswersButton.tsx',
  'src/lib/demo/copy-address.ts',
  'src/components/demo/CrowdButton.tsx',
];

// ── CHECKS-START: the static checks, pure over source, dry-run before RED ────
const idx = (s: string, needle: string, from = 0) => s.indexOf(needle, from);
/** What a new file may never import or call: senders, the press, the queue, tokens, the AI. */
const FORBIDDEN =
  /from '@\/lib\/(press|sms|email|live-sends|tokens|prisma)['/]|from '@\/lib\/ai\/(claude|generate)['/]|\bsendSms\(|getResendClient\(|emails\.send\(|callClaude/;
export const CHECKS = {
  /** S1 — the pre-flight's new effect: above the early returns, keyed on W2, reading step 4's read. */
  preflightEffect(src: string) {
    const fn = src.slice(Math.max(0, idx(src, 'export default function PreFlightPage')));
    const top = fn.slice(0, Math.max(0, idx(fn, 'if (error && !data)')));
    return (
      idx(src, 'export default function PreFlightPage') >= 0 &&
      top.length > 0 &&
      top.includes('PRESS_REFUSAL_WORDS.DEMO_EVENT') &&
      top.includes('/pre-flight/message') &&
      top.includes('pretendList(') &&
      /\.catch\(/.test(top.slice(idx(top, 'PRESS_REFUSAL_WORDS.DEMO_EVENT')))
    );
  },
  /** S2 — the panel follows the refusal line inside step 5. */
  panelPlace(src: string) {
    const i = idx(src, '{pressError && (');
    const j = idx(src, '<PretendSend', i);
    const k = idx(src, '</Step>', i);
    return i > 0 && j > i && j < k;
  },
  /** S3 — MessageStep's tidy keys on the address itself, and keeps real events' words. */
  messageTidy(src: string) {
    const msg = src.slice(Math.max(0, idx(src, 'function MessageStep')));
    return (
      idx(src, 'function MessageStep') >= 0 &&
      msg.includes('isCopyAddress(viewerEmail)') &&
      /disabled=\{dirty \|\| testing \|\| !viewerEmail \|\| /.test(msg) &&
      msg.includes("testEmailOutcomeLine('DEMO'") &&
      msg.includes('isCopyAddress(data.replyTo)') &&
      msg.includes('isCopyAddress(current.replyTo)') &&
      msg.includes('COPY_WORDS.REPLY_LINE') &&
      msg.includes('COPY_WORDS.REPLY_TO') &&
      /\breplyToLine\(/.test(msg)
    );
  },
  /** S4 — the list is the drain's own composition of step 4's read, split by the press's rule. */
  pretendBuilds(src: string) {
    return (
      /composePreview\(\s*preview,\s*preview\.storedAuthorLine\s*\)/.test(src) &&
      src.includes('messageRows(') &&
      src.includes('notMessagedRows(') &&
      src.includes('.hostList')
    );
  },
  /** S5 — a new file is present and reaches no sender, press, queue, token or AI call. */
  fenced(src: string) {
    return src.length > 0 && !FORBIDDEN.test(src);
  },
  /** S6 — the crowd: copies only, one transaction, every person created new, no phone. */
  crowdFence(src: string) {
    return (
      CHECKS.fenced(src) &&
      src.includes('copyEventWhere(') &&
      (src.match(/\$transaction\(/g) ?? []).length === 1 &&
      src.includes('person.create(') &&
      !/find(Unique|First|Many)\(\s*\{\s*where:\s*\{\s*email/.test(src) &&
      !/\bphoneNumber\s*:/.test(src) &&
      !/\bphone\s*:/.test(src)
    );
  },
  /** S7 — the households route reads the crowd shape after its guard, before its first check. */
  routeShape(src: string) {
    const a = idx(src, 'requireEventRole(');
    const b = idx(src, 'demoCrowd');
    const c = idx(src, "'Primary contact name is required'");
    return (
      a > 0 &&
      b > a &&
      c > b &&
      src.includes("from '@/lib/demo/crowd'") &&
      src.includes('addDemoCrowd(') &&
      src.includes('findOrCreateCapturedPerson(')
    );
  },
  /** S8 — the answers button: on a sample only, above "Find a dish", outside the fixed bar. */
  modalButton(src: string) {
    const x = idx(src, '<TypicalAnswersButton');
    return (
      x > 0 &&
      x < idx(src, '<MenuSearch') &&
      x < idx(src, 'fixed bottom-0 left-0 right-0') &&
      /sample\s*&&\s*\(?\s*<TypicalAnswersButton/.test(src) &&
      src.includes('fillTypicalAnswers(')
    );
  },
  /** S9 — the crowd button in Moment 1's input phase only, for a copy; the sample flag to Moment 2. */
  setupCrowd(src: string) {
    const input = idx(src, 'const handleAddHousehold = async');
    const m3 = idx(src, 'if (showMoment3');
    const at = [...src.matchAll(/<CrowdButton\b/g)].map((m) => m.index ?? -1);
    return (
      input > 0 &&
      m3 > input &&
      at.length > 0 &&
      at.every((i) => i > input && i < m3) &&
      src.includes('isCopyAddress(') &&
      src
        .slice(idx(src, '<Moment2Step1Modal'), idx(src, 'if (showMoment2Opening'))
        .includes('sample={')
    );
  },
  /** S10 — Moment 1's first screen and the menu bar: the tidy, keyed on the address. */
  tidyOthers(form: string, nav: string) {
    return (
      form.includes('isCopyAddress(hostMode') &&
      form.includes('COPY_WORDS.ACCOUNT') &&
      form.includes('COPY_WORDS.ACCOUNT_LINE') &&
      form.includes('id="m1-host-email"') &&
      nav.includes('isCopyAddress(user.email)') &&
      nav.includes('COPY_WORDS.ACCOUNT')
    );
  },
  /** S12 — the Send handler and the Send button, byte for byte as at HEAD (batch16 S7's markers). */
  sendAsHead(now: string, head: string) {
    const slicePress = (s: string) =>
      s.slice(
        s.indexOf('const press = useCallback'),
        s.indexOf('}, [eventId, pressing, pressed]);')
      );
    const sendOf = (s: string) => {
      const i = s.indexOf('<button\n            type="button"\n            disabled={!allChecked');
      return i < 0 ? '' : s.slice(i, s.indexOf('</button>', i));
    };
    return (
      slicePress(head).length > 100 &&
      slicePress(now) === slicePress(head) &&
      sendOf(head).length > 100 &&
      sendOf(now) === sendOf(head)
    );
  },
  /** R — nothing on the panel says, or shows, that anything was sent, or an address or number. */
  saysNothingSent(text: string) {
    return !/\bsent\b|\bsending\b|has gone|went out|on its way/i.test(text);
  },
  showsNoContact(markup: string) {
    return !/@|\+64|\b0\d{8,10}\b|\d{7,}/.test(markup);
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── Fixtures, all removed by id at the end ───────────────────────────────────
const fx = {
  events: new Set<string>(),
  persons: new Set<string>(),
  users: new Set<string>(),
  sessionTokens: new Set<string>(),
};
let phoneSeq = 0;
/** A run-unique NZ mobile nobody has opted out of or had blocked. */
function freshMobile(): string {
  phoneSeq++;
  const n = (parseInt(RUN.slice(0, 5), 16) % 90000) * 10 + phoneSeq;
  return `+6421${String(n).padStart(7, '0').slice(-7)}`;
}
/** A real-looking address in a domain reserved for examples: it can never be delivered. */
const realLooking = (who: string) => `${who}.${RUN}@example.com`;
const addr = (who: string) => `${TAG.toLowerCase()}-${who}@demo-sandbox-b.invalid`;

async function makeHost(label: string) {
  const user = await prisma.user.create({ data: { email: addr(`${label}-host`) } });
  fx.users.add(user.id);
  const person = await prisma.person.create({
    data: { name: `${label} Host`, email: user.email, userId: user.id },
  });
  fx.persons.add(person.id);
  return { user, person };
}

async function makeSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId, token, expiresAt: new Date(Date.now() + HOUR) },
  });
  fx.sessionTokens.add(token);
  return `session=${token}`;
}

/** A copy started in process, its rows recorded for teardown. */
async function startCopy(COPY: any) {
  const c = await COPY.startDemoCopy(prisma, { now: new Date() });
  fx.events.add(c.eventId);
  fx.users.add(c.userId);
  fx.sessionTokens.add(c.sessionToken);
  const ev = await prisma.event.findUnique({
    where: { id: c.eventId },
    include: { host: { include: { user: true } } },
  });
  fx.persons.add(ev!.hostId);
  return {
    ...c,
    hostPersonId: ev!.hostId,
    account: ev!.host.user!.email,
    cookie: `session=${c.sessionToken}`,
  };
}

async function http(method: string, p: string, cookie: string, body?: unknown) {
  try {
    const res = await realFetch(`${BASE}${p}`, {
      method,
      headers: { cookie, 'content-type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    return { status: -1, body: String(e) };
  }
}

const ACTOR = (person: { id: string; name: string }) => ({
  id: person.id,
  kind: 'HOST' as const,
  name: person.name,
});

/** People on an event, by name, with their membership. */
async function peopleOn(eventId: string) {
  return prisma.personEvent.findMany({
    where: { eventId },
    include: { person: true, household: true },
  });
}

async function eventCounts(eventId: string) {
  const [om, ie, wl, au, tok, ev, people] = await Promise.all([
    prisma.outboundMessage.count({ where: { eventId } }),
    prisma.inviteEvent.count({ where: { eventId } }),
    prisma.wrapUpLink.count({ where: { eventId } }),
    prisma.auditEntry.count({ where: { eventId } }),
    prisma.accessToken.count({ where: { eventId } }),
    prisma.event.findUnique({
      where: { id: eventId },
      select: { sentAt: true, aiCallsUsed: true },
    }),
    prisma.personEvent.findMany({
      where: { eventId },
      select: { sentAt: true, person: { select: { inviteAnchorAt: true } } },
    }),
  ]);
  return {
    om,
    ie,
    wl,
    au,
    tok,
    sentAt: ev?.sentAt ?? null,
    ai: ev?.aiCallsUsed ?? -1,
    clocks: people.filter((p) => p.sentAt !== null || p.person.inviteAnchorAt !== null).length,
  };
}

async function totals() {
  const [
    Event,
    User,
    Session,
    Person,
    PersonEvent,
    Household,
    Team,
    Item,
    OutboundMessage,
    InviteEvent,
    WrapUpLink,
    AuditEntry,
    AccessToken,
    EventSetup,
    EventRole,
  ] = await Promise.all([
    prisma.event.count(),
    prisma.user.count(),
    prisma.session.count(),
    prisma.person.count(),
    prisma.personEvent.count(),
    prisma.household.count(),
    prisma.team.count(),
    prisma.item.count(),
    prisma.outboundMessage.count(),
    prisma.inviteEvent.count(),
    prisma.wrapUpLink.count(),
    prisma.auditEntry.count(),
    prisma.accessToken.count(),
    prisma.eventSetup.count(),
    prisma.eventRole.count(),
  ]);
  return {
    Event,
    User,
    Session,
    Person,
    PersonEvent,
    Household,
    Team,
    Item,
    OutboundMessage,
    InviteEvent,
    WrapUpLink,
    AuditEntry,
    AccessToken,
    EventSetup,
    EventRole,
  };
}

/** Crowd addresses: a name at an 8-character tag under the copy domain (never an account). */
const CROWD_ADDRESS = /@[0-9a-f]{8}\.demo-copy\.invalid$/i;

/** Every row the run made, by id. Crowd people are collected through their memberships first. */
async function teardown() {
  const events = [...fx.events];
  const members = await prisma.personEvent.findMany({
    where: { eventId: { in: events } },
    select: { personId: true },
  });
  members.forEach((m) => fx.persons.add(m.personId));
  await prisma.wrapUpLink.deleteMany({ where: { eventId: { in: events } } });
  await prisma.event.deleteMany({ where: { id: { in: events } } });
  const leftover = await prisma.person.findMany({
    where: {
      OR: [
        { email: { contains: RUN } },
        { email: { endsWith: '.demo-copy.invalid' }, eventMemberships: { none: {} } },
      ],
    },
    select: { id: true, email: true },
  });
  leftover
    .filter((p) => (p.email ?? '').includes(RUN) || CROWD_ADDRESS.test(p.email ?? ''))
    .forEach((p) => fx.persons.add(p.id));
  await prisma.person.deleteMany({ where: { id: { in: [...fx.persons] } } });
  await prisma.session.deleteMany({ where: { token: { in: [...fx.sessionTokens] } } });
  await prisma.user.deleteMany({ where: { id: { in: [...fx.users] } } });
}

async function main() {
  const { sendSms } = await import('../src/lib/sms/send-sms');
  const { sendAskEmail, sendChaseEmail, sendNudgeEmail } = await import('../src/lib/email');
  const { pressSend } = await import('../src/lib/press/press');
  const { findDueForRetry, findNeverAttempted } = await import('../src/lib/press/dispatch');
  const { findNudgeCandidatesForEvent } = await import('../src/lib/sms/nudge-eligibility');
  const { findDecideByFollowupCandidates } = await import('../src/lib/sms/decide-by-eligibility');
  const { readAskPreview } = await import('../src/lib/preflight/ask-preview');
  const { composePreview, messageRows } = await import('../src/lib/preflight/ask-preview-compose');
  const { transitionToConfirming } = await import('../src/lib/workflow');
  const { testEmailOutcomeLine } = await import('../src/lib/preflight/test-email');
  const CL = await import('../src/lib/ai/config-loader');
  const COPY = await load('../src/lib/demo/copy');
  const CROWDM = await load('../src/lib/demo/crowd');
  const TA = await load('../src/lib/demo/typical-answers');
  const PS = await load('../src/lib/demo/pretend-send');
  const CA = await load('../src/lib/demo/copy-address');
  const PSC = await load('../src/components/demo/PretendSend');
  const found = await totals();
  const personIdsAtStart = new Set(
    (await prisma.person.findMany({ select: { id: true } })).map((p) => p.id)
  );

  try {
    // ══ P — preconditions ══════════════════════════════════════════════════════
    section('P — preconditions');
    let serverOk = false;
    try {
      serverOk = (await realFetch(`${BASE}/api/events/${TAG}-probe/people`)).status === 401;
    } catch {
      serverOk = false;
    }
    assert('P', `P1 the dev server answers on ${BASE} (a guarded route says 401)`, serverOk);
    const copiesAtStart = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    const crowdAtStart = (
      await prisma.person.findMany({
        where: { email: { endsWith: '.demo-copy.invalid' } },
        select: { email: true },
      })
    ).filter((p) => CROWD_ADDRESS.test(p.email ?? '')).length;
    assert(
      'P',
      'P2 no copy and no crowd person is in the database before the run',
      copiesAtStart === 0 && crowdAtStart === 0,
      `copies ${copiesAtStart}, crowd people ${crowdAtStart}`
    );
    assert(
      'P',
      'P3 CONTROL: the live gate is shut in this process at the start',
      process.env.GATHER_LIVE_SENDS !== 'on'
    );
    assert(
      'P',
      'P4 CONTROL: the comment stripper strips, and the reader reads',
      !stripComments('/* x */ const a = 1; // sendSms(\n').includes('sendSms(') &&
        read('src/lib/prisma.ts').length > 0 &&
        read('src/lib/no-such-file.ts') === ''
    );

    // ══ S — static ═════════════════════════════════════════════════════════════
    section('S — where the new code sits, and the fences');
    assert(
      'S',
      'S1 the pre-flight: one effect above the early returns, keyed on W2, reads step 4’s message read',
      CHECKS.preflightEffect(code(PAGE))
    );
    assert(
      'S',
      'S2 the panel follows the refusal line, inside step 5',
      CHECKS.panelPlace(code(PAGE))
    );
    assert(
      'S',
      'S3 step 4’s test email and reply-to tidy keys on the copy’s address; real events keep their words',
      CHECKS.messageTidy(code(PAGE))
    );
    assert(
      'S',
      'S4 the pretend list is the drain’s own composition of step 4’s read, split by the press’s rule',
      CHECKS.pretendBuilds(code(PRETEND_FILE))
    );
    const unfenced = NEW_CLIENT_SAFE.filter((f) => !CHECKS.fenced(code(f)));
    assert(
      'S',
      'S5 the six new screen-side files exist and reach no sender, press, queue, token, database client or AI call',
      unfenced.length === 0,
      unfenced.join(', ')
    );
    assert(
      'S',
      'S6 the crowd: sample copies only, one transaction, every person created new, no phone, no sender',
      CHECKS.crowdFence(code(CROWD_FILE))
    );
    assert(
      'S',
      'S7 the households route reads the crowd shape after its guard and before its first check',
      CHECKS.routeShape(code(ROUTE))
    );
    assert(
      'S',
      'S8 the answers button: on a sample only, above "Find a dish", outside the fixed bar',
      CHECKS.modalButton(code(MODAL))
    );
    assert(
      'S',
      'S9 the crowd button: Moment 1’s input phase only, for a copy; the sample flag reaches Moment 2',
      CHECKS.setupCrowd(code(SETUP))
    );
    assert(
      'S',
      'S10 Moment 1’s first screen and the menu bar: the tidy keys on the address; the box keeps its id',
      CHECKS.tidyOthers(code(FORM), code(NAV))
    );
    assert(
      'S',
      'S11 CONTROL: the press, its words, both send routes, the senders, the queue and the pre-flight’s libraries are unchanged since HEAD',
      unchangedSinceHead([
        'src/lib/press',
        'src/app/api/events/[id]/send',
        'src/app/api/h/[token]/send',
        'src/lib/sms',
        'src/lib/email.ts',
        'src/lib/preflight',
        'src/lib/demo/send-wall.ts',
        'src/lib/demo/copy.ts',
        'src/lib/live-sends.ts',
      ])
    );
    assert(
      'S',
      'S12 CONTROL: the Send handler and the Send button, byte for byte as at HEAD',
      CHECKS.sendAsHead(read(PAGE), atHead(PAGE))
    );

    // ══ C — the crowd ══════════════════════════════════════════════════════════
    section('C — "Add a crowd"');
    const sample = COPY?.startDemoCopy ? await startCopy(COPY) : null;
    const tag = sample ? sample.account.split('@')[0].slice(0, 8).toLowerCase() : 'none';
    const expectAddress = (local: string) => `${local}@${tag}.demo-copy.invalid`;
    // Her own household first is NOT saved yet: the crowd waits for it.
    const early = sample
      ? await http('POST', `/api/events/${sample.eventId}/households`, sample.cookie, {
          demoCrowd: true,
        })
      : { status: -1, body: null };
    assert(
      'C',
      'C1 before her own household is saved, the crowd is refused 409 HOST_HOUSEHOLD_REQUIRED in the route’s words',
      early.status === 409 &&
        early.body?.code === 'HOST_HOUSEHOLD_REQUIRED' &&
        early.body?.error === HOST_FIRST,
      JSON.stringify(early)
    );
    const ownHousehold = sample
      ? await http('POST', `/api/events/${sample.eventId}/host-household`, sample.cookie, {
          alone: true,
          name: 'Sam',
        })
      : { status: -1, body: null };
    const auditBefore = sample
      ? await prisma.auditEntry.count({ where: { eventId: sample.eventId } })
      : 0;
    const added = sample
      ? await http('POST', `/api/events/${sample.eventId}/households`, sample.cookie, {
          demoCrowd: true,
        })
      : { status: -1, body: null };
    assert(
      'C',
      'C2 once her household is saved, the crowd answers 201 with its households',
      ownHousehold.status === 201 &&
        added.status === 201 &&
        Array.isArray(added.body?.households) &&
        added.body.households.length === 11,
      `own ${ownHousehold.status}; crowd ${JSON.stringify(added).slice(0, 300)}`
    );
    const onSample = sample ? await peopleOn(sample.eventId) : [];
    const crowdRows = onSample.filter((m) => CROWD_PEOPLE.some(([name]) => name === m.person.name));
    const crowdHouseholds = new Set(crowdRows.map((m) => m.householdId));
    const littles = [...crowdHouseholds].reduce(
      (n, id) => n + (crowdRows.find((m) => m.householdId === id)?.household?.littleCount ?? 0),
      0
    );
    assert(
      'C',
      'C3 11 households, 24 people, 24 memberships and 6 kids without jobs: 30 in all',
      crowdHouseholds.size === 11 && crowdRows.length === 24 && littles === 6,
      `households ${crowdHouseholds.size}, rows ${crowdRows.length}, kids without jobs ${littles}`
    );
    const shapeOk = CROWD.every((h) => {
      const rows = h.members.map(([name]) => crowdRows.find((m) => m.person.name === name));
      const hh = rows[0]?.householdId;
      return (
        rows.every((r) => r && r.householdId === hh) &&
        h.members.every(([name, role]) => {
          const r = crowdRows.find((m) => m.person.name === name);
          return (
            r?.householdRole === role &&
            r.role === 'PARTICIPANT' &&
            r.isYoungPerson === (role === 'CHILD')
          );
        }) &&
        rows[0]?.household?.littleCount === h.little
      );
    });
    assert(
      'C',
      'C4 each household as written: who is in it, each role, the kids with jobs',
      shapeOk
    );
    const addressesOk = CROWD_PEOPLE.every(([name, , local]) => {
      const r = crowdRows.find((m) => m.person.name === name);
      return r ? r.person.email === (local ? expectAddress(local) : null) : false;
    });
    assert(
      'C',
      'C5 every adult’s address is theirs at this copy’s own tag; Nana June and the kids have none',
      addressesOk && tag.length === 8,
      `tag ${tag}`
    );
    assert(
      'C',
      'C6 nobody in the crowd has a phone number',
      crowdRows.length === 24 &&
        crowdRows.every((r) => r.person.phoneNumber === null && r.person.phone === null)
    );
    const otherMemberships = await prisma.personEvent.count({
      where: {
        personId: { in: crowdRows.map((r) => r.personId) },
        eventId: { not: sample?.eventId ?? 'none' },
      },
    });
    assert(
      'C',
      'C7 every crowd person is new: created in this run and on no other event',
      crowdRows.length === 24 &&
        otherMemberships === 0 &&
        crowdRows.every((r) => !personIdsAtStart.has(r.personId) && r.person.userId === null)
    );
    assert(
      'C',
      'C8 reach as the route sets it: an address is DIRECT by email, none is UNTRACKABLE; no send clock',
      crowdRows.length === 24 &&
        crowdRows.every((r) =>
          r.person.email
            ? r.reachabilityTier === 'DIRECT' && r.contactMethod === 'EMAIL'
            : r.reachabilityTier === 'UNTRACKABLE' && r.contactMethod === 'NONE'
        ) &&
        crowdRows.every((r) => r.sentAt === null && r.person.inviteAnchorAt === null)
    );
    const crowdAudit = sample
      ? await prisma.auditEntry.findMany({
          where: { eventId: sample.eventId, actionType: 'ADD_PERSON', targetType: 'Household' },
          select: { targetId: true },
        })
      : [];
    const auditAfter = sample
      ? await prisma.auditEntry.count({ where: { eventId: sample.eventId } })
      : 0;
    assert(
      'C',
      'C9 one ledger line per crowd household (ADD_PERSON), and no other',
      auditAfter - auditBefore === 11 &&
        [...crowdHouseholds].every((id) => crowdAudit.some((a) => a.targetId === id)),
      `ledger ${auditBefore} -> ${auditAfter}`
    );
    const afterCrowd = sample ? await eventCounts(sample.eventId) : null;
    const itemsOnSample = sample
      ? await prisma.item.count({ where: { team: { eventId: sample.eventId } } })
      : -1;
    assert(
      'C',
      'C10 and nothing else: no link, no item, no message row, no invite event',
      !!afterCrowd &&
        afterCrowd.tok === 0 &&
        afterCrowd.om === 0 &&
        afterCrowd.ie === 0 &&
        itemsOnSample === 0 &&
        added.status === 201,
      JSON.stringify(afterCrowd)
    );
    // A second copy whose crowd fails part-way: one transaction, so nothing is left.
    const second = COPY?.startDemoCopy ? await startCopy(COPY) : null;
    if (second) {
      await http('POST', `/api/events/${second.eventId}/host-household`, second.cookie, {
        alone: true,
        name: 'Sam',
      });
    }
    let failedCrowd = 'did not throw';
    if (second && CROWDM?.addDemoCrowd) {
      let made = 0;
      const breaking: any = new Proxy(prisma, {
        get(target: any, prop) {
          if (prop !== '$transaction') return target[prop];
          return (fn: any, o?: any) =>
            target.$transaction(
              (tx: any) =>
                fn(
                  new Proxy(tx, {
                    get(t: any, p) {
                      if (p !== 'personEvent') return t[p];
                      return {
                        ...t.personEvent,
                        create: (args: any) =>
                          ++made >= 20
                            ? Promise.reject(new Error(`${TAG} forced failure`))
                            : t.personEvent.create(args),
                      };
                    },
                  })
                ),
              o
            );
        },
      });
      failedCrowd = await CROWDM.addDemoCrowd(
        breaking,
        second.eventId,
        ACTOR({ id: second.hostPersonId, name: 'Sam' })
      ).then(
        (r: unknown) => `did not throw: ${JSON.stringify(r)}`,
        (e: Error) => e.message
      );
    }
    const secondRows = second
      ? await prisma.personEvent.count({ where: { eventId: second.eventId } })
      : -1;
    const secondHouseholds = second
      ? await prisma.household.count({ where: { eventId: second.eventId } })
      : -1;
    assert(
      'C',
      'C11 a failure part-way through the crowd writes nothing (one transaction)',
      failedCrowd.includes('forced failure') && secondRows === 1 && secondHouseholds === 1,
      `${failedCrowd}; memberships ${secondRows}, households ${secondHouseholds}`
    );
    const again = sample
      ? await http('POST', `/api/events/${sample.eventId}/households`, sample.cookie, {
          demoCrowd: true,
        })
      : { status: -1, body: null };
    const rowsAfterAgain = sample
      ? await prisma.personEvent.count({ where: { eventId: sample.eventId } })
      : -1;
    assert(
      'C',
      'C12 pressed again, it is refused 409 in W20, and nothing more is written',
      again.status === 409 &&
        again.body?.error === W20 &&
        again.body?.code === 'ALREADY_ADDED' &&
        rowsAfterAgain === onSample.length,
      `${JSON.stringify(again)}; rows ${onSample.length} -> ${rowsAfterAgain}`
    );
    // The real twin: an ordinary paid-style event, its host signed in, her own household saved.
    const twinHost = await makeHost(`${TAG}-twin`);
    const twinEnd = new Date(Date.now() + 28 * DAY);
    const twin = await prisma.event.create({
      data: {
        name: `${TAG} real twin`,
        startDate: twinEnd,
        endDate: twinEnd,
        hostId: twinHost.person.id,
        isDemo: false,
        status: 'DRAFT',
        setup: { create: {} },
      },
    });
    fx.events.add(twin.id);
    await prisma.eventRole.create({
      data: { userId: twinHost.user.id, eventId: twin.id, role: 'HOST' },
    });
    const twinCookie = await makeSession(twinHost.user.id);
    await http('POST', `/api/events/${twin.id}/host-household`, twinCookie, {
      alone: true,
      name: `${TAG} Twin Host`,
    });
    const twinBefore = await prisma.personEvent.count({ where: { eventId: twin.id } });
    const onReal = await http('POST', `/api/events/${twin.id}/households`, twinCookie, {
      demoCrowd: true,
    });
    const twinAfter = await prisma.personEvent.count({ where: { eventId: twin.id } });
    assert(
      'C',
      'C13 on a real event, with its own host signed in, the crowd is refused 409 in W22 and nothing is written',
      onReal.status === 409 &&
        onReal.body?.error === W22 &&
        onReal.body?.code === 'NOT_A_SAMPLE' &&
        twinAfter === twinBefore,
      `${JSON.stringify(onReal)}; rows ${twinBefore} -> ${twinAfter}`
    );
    const shared = await prisma.event.findFirst({
      where: { isDemo: true, NOT: { host: { user: { email: { endsWith: COPY_DOMAIN } } } } },
      select: { id: true, hostId: true },
    });
    const sharedRowsBefore = shared
      ? await prisma.personEvent.count({ where: { eventId: shared.id } })
      : -1;
    const onShared: any =
      shared && CROWDM?.addDemoCrowd
        ? await CROWDM.addDemoCrowd(
            prisma,
            shared.id,
            ACTOR({ id: shared.hostId, name: 'Host' })
          ).catch((e: unknown) => ({ threw: String(e) }))
        : null;
    const sharedRowsAfter = shared
      ? await prisma.personEvent.count({ where: { eventId: shared.id } })
      : -1;
    assert(
      'C',
      'C14 the old shared sample is a sample but not a copy: refused NOT_A_SAMPLE, nothing written',
      onShared?.ok === false &&
        onShared?.code === 'NOT_A_SAMPLE' &&
        sharedRowsAfter === sharedRowsBefore,
      `${JSON.stringify(onShared)}; rows ${sharedRowsBefore} -> ${sharedRowsAfter}`
    );
    const copiesNow = await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } });
    assert(
      'C',
      'C15 the crowd spent no AI call and started no copy: aiCallsUsed 0, only the run’s own two copies',
      added.status === 201 && afterCrowd?.ai === 0 && copiesNow === copiesAtStart + 2,
      `ai ${afterCrowd?.ai}, copies ${copiesAtStart} -> ${copiesNow}`
    );
    const ordinary = await http('POST', `/api/events/${twin.id}/households`, twinCookie, {
      primaryContact: { name: `Ordinary ${TAG}`, email: realLooking('ordinary') },
    });
    assert(
      'C',
      'C16 CONTROL: an ordinary household on a real event still saves (201)',
      ordinary.status === 201,
      JSON.stringify(ordinary).slice(0, 300)
    );

    // ══ T — the typical answers ════════════════════════════════════════════════
    section('T — "Fill in typical answers"');
    const bbq = ok(() => !!TA?.fillTypicalAnswers) ? TA.fillTypicalAnswers(blankAnswers()) : null;
    const picksOf = (s: any, key: string) =>
      key === 'mains' ? s?.mainsData?.selections : s?.extendedCategoriesData?.[key]?.selections;
    const sameSel = (a: any, b: any) =>
      !!a &&
      Object.keys(b).length === Object.keys(a).length &&
      Object.entries(b).every(
        ([lvl, v]: [string, any]) =>
          JSON.stringify(a[lvl]?.options) === JSON.stringify(v.options) &&
          (a[lvl]?.freeText ?? '') === ''
      );
    assert(
      'T',
      'T1 with no kind picked: Casual BBQ, and every food pick exactly as the plan lists it',
      bbq?.next?.eventType === 'Casual BBQ' &&
        Object.entries(BBQ_PICKS).every(([k, v]) => sameSel(picksOf(bbq.next, k), v)) &&
        picksOf(bbq.next, 'entree_starters') === undefined &&
        bbq.openMore === true,
      JSON.stringify(bbq).slice(0, 400)
    );
    const inLists = (kind: string, key: string, s: any) => {
      const levels = CL.getCategoryLevels(kind, key) ?? [];
      return Object.entries(s ?? {}).every(([lvl, v]: [string, any]) => {
        const l = levels[Number(lvl)];
        if (!l) return false;
        const allowed = new Set([...(l.options ?? []), ...Object.values(l.dependsOn ?? {}).flat()]);
        return v.options.every((o: string) => allowed.has(o));
      });
    };
    assert(
      'T',
      'T2 every option it ticks is one the Casual BBQ questions offer',
      !!bbq && Object.keys(BBQ_PICKS).every((k) => inLists('Casual BBQ', k, picksOf(bbq.next, k)))
    );
    const mine = blankAnswers();
    mine.eventType = 'Casual BBQ';
    mine.mainsData = {
      items: [],
      stillDeciding: false,
      selections: sel(['Seafood on the grill'], ['Prawns']),
    };
    mine.dietaryData = { status: 'confirmed_none', requirements: [], other: '' };
    mine.setUpData = { freeText: 'Her own words', stillDeciding: false };
    mine.extendedCategoriesData = { sides_salads: { selections: {}, stillDeciding: true } };
    const kept = ok(() => !!TA?.fillTypicalAnswers) ? TA.fillTypicalAnswers(mine) : null;
    assert(
      'T',
      'T3 it fills only what she left empty: her mains, her dietary answer, her set-up words and a section she is still deciding stay',
      !!kept &&
        sameSel(picksOf(kept.next, 'mains'), sel(['Seafood on the grill'], ['Prawns'])) &&
        kept.next.dietaryData.status === 'confirmed_none' &&
        kept.next.setUpData.freeText === 'Her own words' &&
        kept.next.extendedCategoriesData.sides_salads?.stillDeciding === true &&
        JSON.stringify(kept.next.extendedCategoriesData.sides_salads?.selections) === '{}' &&
        sameSel(picksOf(kept.next, 'table_snacks'), BBQ_PICKS.table_snacks) &&
        kept.next.cleanUpData.freeText === W28
    );
    const xmas = blankAnswers();
    xmas.eventType = 'Christmas';
    const filledX = ok(() => !!TA?.fillTypicalAnswers) ? TA.fillTypicalAnswers(xmas) : null;
    const FOOD = [
      'entree_starters',
      'mains',
      'sides_salads',
      'dessert',
      'cake',
      'drinks_alcoholic',
      'drinks_non_alcoholic',
      'table_snacks',
      'breakfast_brunch',
    ];
    const xmasUp = CL.getUpFrontCategories('Christmas').filter((k: string) => FOOD.includes(k));
    const firstChoiceOk = (key: string) => {
      const levels = CL.getCategoryLevels('Christmas', key) ?? [];
      const got = picksOf(filledX?.next, key);
      if (!levels.length) return got === undefined;
      const first = levels[0].options?.[0];
      if (!got || JSON.stringify(got[0]?.options) !== JSON.stringify([first])) return false;
      const l1 = levels[1];
      if (!l1 || l1.multiSelect) return got[1] === undefined;
      const want = l1.dependsOn ? l1.dependsOn[first]?.[0] : l1.options?.[0];
      return want
        ? JSON.stringify(got[1]?.options) === JSON.stringify([want])
        : got[1] === undefined;
    };
    assert(
      'T',
      'T4 another kind (Christmas) keeps its kind and gets the first choice in each of its up-front food questions',
      filledX?.next?.eventType === 'Christmas' && xmasUp.length > 0 && xmasUp.every(firstChoiceOk),
      JSON.stringify(filledX?.next?.extendedCategoriesData ?? null).slice(0, 300)
    );
    assert(
      'T',
      'T5 the dietary answer and the two jobs: Vegetarian and Gluten-free; W27; W28',
      !!bbq &&
        bbq.next.dietaryData.status === 'confirmed_needs' &&
        JSON.stringify(bbq.next.dietaryData.requirements) ===
          JSON.stringify(['Vegetarian', 'Gluten-free']) &&
        bbq.next.setUpData.freeText === W27 &&
        bbq.next.cleanUpData.freeText === W28 &&
        bbq.next.otherJobsOtherData.freeText === '' &&
        bbq.next.otherNotes === ''
    );
    const twice = bbq && TA?.fillTypicalAnswers ? TA.fillTypicalAnswers(bbq.next) : 'none';
    assert('T', 'T6 with nothing left empty it fills nothing (W26’s case)', twice === null);
    const stored =
      sample && bbq
        ? await http('POST', `/api/events/${sample.eventId}/setup`, sample.cookie, {
            eventType: bbq.next.eventType,
            eventTypeOther: '',
            mainsData: bbq.next.mainsData,
            sidesData: bbq.next.sidesData,
            dessertsData: bbq.next.dessertsData,
            drinksData: bbq.next.drinksData,
            dietaryData: bbq.next.dietaryData,
            otherNotes: bbq.next.otherNotes,
            extendedCategoriesData: bbq.next.extendedCategoriesData,
            setUpData: bbq.next.setUpData,
            cleanUpData: bbq.next.cleanUpData,
            otherJobsOtherData: bbq.next.otherJobsOtherData,
          })
        : { status: -1, body: null };
    const setupRow = sample
      ? await prisma.eventSetup.findUnique({ where: { eventId: sample.eventId } })
      : null;
    assert(
      'T',
      'T7 the setup route stores them as the questions’ own save would (200; Casual BBQ; the mains)',
      stored.status === 200 &&
        setupRow?.eventType === 'Casual BBQ' &&
        sameSel((setupRow?.mainsData as any)?.selections, BBQ_PICKS.mains),
      `${stored.status} ${JSON.stringify(stored.body).slice(0, 200)}`
    );
    const afterAnswers = sample ? await eventCounts(sample.eventId) : null;
    const itemsAfterAnswers = sample
      ? await prisma.item.count({ where: { team: { eventId: sample.eventId } } })
      : -1;
    assert(
      'T',
      'T8 and Generate was never pressed: aiCallsUsed 0, no plan made',
      stored.status === 200 && afterAnswers?.ai === 0 && itemsAfterAnswers === 0,
      `ai ${afterAnswers?.ai}, items ${itemsAfterAnswers}`
    );

    // ══ L — the wall underneath, live switch ON ════════════════════════════════
    section(
      'L — the wall underneath the pretend Send, live switch ON (in process, behind the trap)'
    );
    // Her own typed guest: a real-looking address and a mobile, through the route she uses.
    const kateEmail = realLooking('kate.rangi');
    const kateMobile = freshMobile();
    if (sample) {
      await http('POST', `/api/events/${sample.eventId}/households`, sample.cookie, {
        primaryContact: { name: 'Kate Rangi', email: kateEmail, phone: kateMobile },
      });
    }
    // A plan of one thing to bring, then the hold: CONFIRMING, and the links minted.
    let held: any = null;
    if (sample) {
      const team = await prisma.team.create({
        data: { name: `${TAG} Mains`, eventId: sample.eventId },
      });
      await prisma.item.create({ data: { name: `${TAG} Sausages`, teamId: team.id } });
      held = await transitionToConfirming(sample.eventId, sample.hostPersonId).catch((e) => ({
        threw: String(e),
      }));
    }
    // The real twin, of the same shape, held the same way.
    const twinKate = await prisma.person.create({
      data: { name: 'Kate Twin', email: realLooking('kate.twin'), phoneNumber: freshMobile() },
    });
    fx.persons.add(twinKate.id);
    const twinAroha = await prisma.person.create({
      data: { name: 'Aroha Twin', email: `aroha.twin.${RUN}@twin-sample-b.invalid` },
    });
    fx.persons.add(twinAroha.id);
    for (const p of [twinKate, twinAroha]) {
      await prisma.personEvent.create({
        data: {
          personId: p.id,
          eventId: twin.id,
          role: 'PARTICIPANT',
          reachabilityTier: 'DIRECT',
          contactMethod: 'EMAIL',
        },
      });
    }
    const kate = sample
      ? await prisma.person.findFirst({
          where: { email: kateEmail, eventMemberships: { some: { eventId: sample.eventId } } },
        })
      : null;
    const aroha = crowdRows.find((r) => r.person.name === 'Aroha Ngata')?.person ?? null;
    const before = sample ? await eventCounts(sample.eventId) : null;
    const t0 = trapCount();
    const pressed: any = sample
      ? await pressSend(prisma as any, {
          eventId: sample.eventId,
          actor: ACTOR({ id: sample.hostPersonId, name: 'Sam' }),
          baseUrl: BASE,
        }).catch((e: unknown) => ({ threw: String(e) }))
      : null;
    assert(
      'L',
      'L1 on the held sample, the press answers DEMO_EVENT, 409, as part A built it',
      held?.success === true &&
        pressed?.ok === false &&
        pressed?.code === 'DEMO_EVENT' &&
        pressed?.status === 409,
      `hold ${JSON.stringify(held)}; press ${JSON.stringify(pressed)}`
    );
    const after = sample ? await eventCounts(sample.eventId) : null;
    assert(
      'L',
      'L2 and moves no count: message rows, invite events, thank-you links, ledger lines, links',
      !!before &&
        !!after &&
        JSON.stringify({ ...before, ai: 0 }) === JSON.stringify({ ...after, ai: 0 }),
      `${JSON.stringify(before)} -> ${JSON.stringify(after)}`
    );
    assert(
      'L',
      'L3 and marks nothing as sent: no Event.sentAt, no PersonEvent.sentAt, no invite anchor (QB2)',
      !!after && after.sentAt === null && after.clocks === 0 && trapCount() === t0
    );
    const preview = sample ? await readAskPreview(prisma as any, sample.eventId, BASE) : null;
    const drainNames = preview
      ? messageRows(composePreview(preview, preview.storedAuthorLine).rows)
          .map((r) => r.recipient.name)
          .sort()
      : [];
    let list: any = null;
    try {
      list = preview && PS?.pretendList ? PS.pretendList(preview) : null;
    } catch (e) {
      list = null;
      console.log(`pretendList threw: ${e}`);
    }
    const wantNames = [...CROWD_ADULTS_WITH_ADDRESS, 'Kate Rangi'].sort();
    const listNames = (list?.messages ?? []).map((m: any) => m.name).sort();
    assert(
      'L',
      'L4 the would-go list names every adult with an address, her typed guest by email, 20 in all',
      JSON.stringify(listNames) === JSON.stringify(wantNames) &&
        list?.emailed === 20 &&
        list?.texted === 0 &&
        list.messages.find((m: any) => m.name === 'Kate Rangi')?.channel === 'EMAIL',
      `${listNames.length}: ${listNames.join(', ')}`
    );
    assert(
      'L',
      'L5 and leaves Nana June to her (no way to reach her)',
      JSON.stringify(list?.leftToHer ?? null) === JSON.stringify(['June Walker'])
    );
    assert(
      'L',
      'L6 and is exactly the drain’s own message rows for the same read',
      drainNames.length === 20 && JSON.stringify(listNames) === JSON.stringify(drainNames),
      `drain ${drainNames.length}`
    );
    const emailArgs = (to: string, personId: string, eventId: string) => ({
      to,
      subject: `${TAG} subject`,
      body: `${TAG} body`,
      replyTo: addr('reply'),
      fromName: 'Sam',
      personId,
      eventId,
    });
    type Who = { email: string; phone: string | null; id: string };
    const four: Array<[string, (w: Who, eventId: string) => Promise<any>]> = [
      [
        'sendSms',
        (w, eventId) => sendSms({ to: w.phone!, message: `${TAG} text`, eventId, personId: w.id }),
      ],
      ['sendAskEmail', (w, e) => sendAskEmail(emailArgs(w.email, w.id, e))],
      ['sendChaseEmail', (w, e) => sendChaseEmail(emailArgs(w.email, w.id, e))],
      [
        'sendNudgeEmail',
        (w, e) =>
          sendNudgeEmail({
            to: w.email,
            subject: `${TAG} subject`,
            body: `${TAG} body`,
            eventId: e,
            personId: w.id,
          }),
      ],
    ];
    const stopped = (name: string, r: any, t: number) =>
      r?.success === false &&
      trapCount() === t &&
      r?.error === STOP &&
      r?.providerErrorCode === undefined &&
      (name !== 'sendSms' || r?.blocked === 'SMS_DISABLED');
    const close = liveBehindTrap();
    try {
      for (const [name, call] of four) {
        const t = trapCount();
        const r =
          kate && sample
            ? await call(
                { email: kate.email!, phone: kate.phoneNumber, id: kate.id },
                sample.eventId
              ).catch((e: unknown) => ({ threw: String(e) }))
            : null;
        assert(
          'L',
          `L7 ${name}, called for her typed guest on the sample: stopped in the wall’s words, zero hits on the trap`,
          stopped(name, r, t),
          JSON.stringify(r)
        );
      }
      for (const [name, call] of four.filter(
        ([n]) => n === 'sendAskEmail' || n === 'sendNudgeEmail'
      )) {
        const t = trapCount();
        const r =
          aroha && sample
            ? await call({ email: aroha.email!, phone: null, id: aroha.id }, sample.eventId).catch(
                (e: unknown) => ({ threw: String(e) })
              )
            : null;
        assert(
          'L',
          `L8 ${name}, called for a crowd adult on the sample: stopped, zero hits on the trap`,
          stopped(name, r, t),
          JSON.stringify(r)
        );
      }
      for (const [name, call] of four) {
        const t = trapCount();
        const r = await call(
          { email: twinKate.email!, phone: twinKate.phoneNumber, id: twinKate.id },
          twin.id
        ).catch((e: unknown) => ({ threw: String(e) }));
        assert(
          'L',
          `L9 CONTROL ${name}: the real twin reaches the trap, so the gate really was open`,
          trapCount() > t && r?.success === true,
          JSON.stringify(r)
        );
      }
    } finally {
      close();
    }
    const finderOut = sample
      ? JSON.stringify([
          await findNeverAttempted(prisma as any, 5000),
          await findDueForRetry(prisma as any, 5000),
          await findNudgeCandidatesForEvent(sample.eventId),
          await findDecideByFollowupCandidates(),
        ])
      : sample;
    assert(
      'L',
      'L10 the queue finders return nothing of the sample’s',
      typeof finderOut === 'string' && !!sample && !finderOut.includes(sample.eventId)
    );
    const beforeHttp = sample ? await eventCounts(sample.eventId) : null;
    const viaHttp = sample
      ? await http('POST', `/api/events/${sample.eventId}/send`, sample.cookie)
      : { status: -1, body: null };
    const afterHttp = sample ? await eventCounts(sample.eventId) : null;
    assert(
      'L',
      'L11 over HTTP, with her own session, Send answers 409 DEMO_EVENT and writes nothing',
      viaHttp.status === 409 &&
        viaHttp.body?.code === 'DEMO_EVENT' &&
        JSON.stringify(beforeHttp) === JSON.stringify(afterHttp),
      JSON.stringify(viaHttp)
    );
    assert(
      'L',
      'L12 CONTROL: the gate is shut again after layer L',
      process.env.GATHER_LIVE_SENDS !== 'on'
    );

    // ══ R — the panel, rendered ═══════════════════════════════════════════════
    section('R — the pretend Send panel, rendered');
    const Panel = PSC?.default ?? PSC?.PretendSend ?? null;
    const render = (state: unknown) => {
      try {
        return Panel ? renderToStaticMarkup(createElement(Panel, { state })) : '';
      } catch (e) {
        return `THREW ${e}`;
      }
    };
    const FIXTURE = {
      messages: [
        {
          name: 'Aroha Ngata',
          channel: 'EMAIL',
          withChildren: ['Mere'],
          brief: 'bring Sausages and steaks',
        },
        { name: 'Grace Liu', channel: 'EMAIL', withChildren: [], brief: 'nothing' },
        { name: 'Kate Rangi', channel: 'TEXT', withChildren: [], brief: 'do Set up' },
      ],
      emailed: 2,
      texted: 1,
      leftToHer: ['June Walker'],
      carrierFor: ['Tama'],
    };
    const full = render(FIXTURE);
    assert(
      'R',
      'R1 the opening and the count: W29, then "3 people would get a message: 2 by email, 1 by text."',
      full.includes(W29) && full.includes('3 people would get a message: 2 by email, 1 by text.'),
      full.slice(0, 300)
    );
    assert(
      'R',
      'R2 one line each, by name and how, with the child and what they bring (W31)',
      full.includes('Aroha Ngata · by email · with Mere — bring Sausages and steaks') &&
        full.includes('Grace Liu · by email — nothing') &&
        full.includes('Kate Rangi · by text — do Set up')
    );
    assert(
      'R',
      'R3 who Gather would leave to her (W32)',
      full.includes('I’d leave 1 to you: June Walker. Step 4 says why.')
    );
    assert(
      'R',
      'R4 her own message as a contact (W33)',
      full.includes('You’d get one too, for Tama.')
    );
    assert(
      'R',
      'R5 the closing line (W35) and the link to step 4',
      full.includes(W35) &&
        full.includes(W35_LINK) &&
        /<button[^>]*>Open step 4 →<\/button>/.test(full)
    );
    const nobody = render({
      messages: [],
      emailed: 0,
      texted: 0,
      leftToHer: ['June Walker'],
      carrierFor: [],
    });
    assert(
      'R',
      'R6 with nobody reachable: W29 and W34 only',
      nobody.includes(W29) &&
        nobody.includes(W34) &&
        !nobody.includes('would get a message:') &&
        !nobody.includes('leave') &&
        !nobody.includes(W35)
    );
    const broke = render('failed');
    assert(
      'R',
      'R7 when the list cannot be read: W36',
      broke.includes(W36) && !broke.includes(W29)
    );
    const real = list ? render(list) : '';
    const text = real.replace(/<[^>]*>/g, ' ');
    assert(
      'R',
      'R8 rendered from the real sample’s read: names only — no address and no number anywhere',
      real.length > 0 && real.includes('Kate Rangi') && CHECKS.showsNoContact(real),
      real.slice(0, 300)
    );
    assert(
      'R',
      'R9 and nothing on it says, or implies, that anything was sent',
      real.length > 0 &&
        CHECKS.saysNothingSent(text) &&
        CHECKS.saysNothingSent(full.replace(/<[^>]*>/g, ' '))
    );
    assert(
      'R',
      'R10 its opening, its count and its closing each say "would"',
      text.includes(W29) &&
        text.includes('20 people would get a message: 20 by email, 0 by text.') &&
        text.includes(W35)
    );

    // ══ W — the words ══════════════════════════════════════════════════════════
    section('W — the words, byte for byte');
    const CW = CROWDM?.CROWD_WORDS ?? {};
    const TW = TA?.TYPICAL_WORDS ?? {};
    const PW = PS?.PRETEND_WORDS ?? {};
    const AW = CA?.COPY_WORDS ?? {};
    const words: Array<[string, unknown, string]> = [
      ['W16', CW.BUTTON, W16],
      ['W17', CW.EXPLAIN, W17],
      ['W18', CW.WORKING, W18],
      ['W19', CW.DONE, W19],
      ['W20', CW.ALREADY, W20],
      ['W21', CW.FAILED, W21],
      ['W22', CW.NOT_A_SAMPLE, W22],
      ['W23', TW.BUTTON, W23],
      ['W24', TW.EXPLAIN, W24],
      ['W25', TW.DONE, W25],
      ['W26', TW.NOTHING, W26],
      ['W27', TW.SET_UP, W27],
      ['W28', TW.CLEAN_UP, W28],
      ['W29', PW.LEAD, W29],
      ['W34', PW.NOBODY, W34],
      ['W35', PW.SAME, W35],
      ['W35 link', PW.OPEN_STEP_4, W35_LINK],
      ['W36', PW.FAILED, W36],
      ['W38', AW.REPLY_LINE, W38],
      ['W39', AW.REPLY_TO, W39],
      ['W40', AW.ACCOUNT, W40],
      ['W41', AW.ACCOUNT_LINE, W41],
    ];
    for (const [n, got, want] of words) {
      assert('W', `${n}: "${want}"`, got === want, `got ${JSON.stringify(got)}`);
    }
    assert(
      'W',
      'W30 the count, all three forms',
      ok(
        () =>
          PS.countLine(3, 2, 1) === '3 people would get a message: 2 by email, 1 by text.' &&
          PS.countLine(1, 1, 0) === '1 person would get a message, by email.' &&
          PS.countLine(1, 0, 1) === '1 person would get a message, by text.'
      )
    );
    assert(
      'W',
      'W31 to W33 the line shapes',
      ok(
        () =>
          PS.personLine({
            name: 'Ana Tupou',
            channel: 'EMAIL',
            withChildren: [],
            brief: 'nothing',
          }) === 'Ana Tupou · by email — nothing' &&
          PS.personLine({
            name: 'Sione Taufa',
            channel: 'TEXT',
            withChildren: ['Mele', 'Sefa'],
            brief: 'bring Pavlova · do Set up',
          }) === 'Sione Taufa · by text · with Mele, Sefa — bring Pavlova · do Set up' &&
          PS.leaveLine(['June Walker', 'Mere Ngata']) ===
            'I’d leave 2 to you: June Walker, Mere Ngata. Step 4 says why.' &&
          PS.carrierLine(['Mere']) === 'You’d get one too, for Mere.'
      )
    );
    assert(
      'W',
      'W37 the test email line on a copy is W4, part A’s, from its one source',
      testEmailOutcomeLine('DEMO', 'x') === W4 && code(PAGE).includes("testEmailOutcomeLine('DEMO'")
    );
    assert(
      'W',
      'W38-W41 key on the copy’s address: a copy account yes; a real one, a crowd address and nothing, no',
      ok(
        () =>
          CA.isCopyAddress('3f9a2c1b0000000000000000000000ff@demo-copy.invalid') === true &&
          CA.isCopyAddress('kate@example.com') === false &&
          CA.isCopyAddress('aroha.ngata@3f9a2c1b.demo-copy.invalid') === false &&
          CA.isCopyAddress(null) === false &&
          CA.isCrowdAddress('aroha.ngata@3f9a2c1b.demo-copy.invalid') === true &&
          CA.isCrowdAddress('3f9a2c1b0000000000000000000000ff@demo-copy.invalid') === false
      )
    );
  } finally {
    // ══ G — teardown ═══════════════════════════════════════════════════════════
    section('G — teardown');
    await teardown().catch((e) => console.log(`teardown threw: ${e}`));
  }
  const left = await totals();
  assert(
    'G',
    'G1 every fixture removed by id: no event of this run is left',
    (await prisma.event.count({ where: { name: { contains: TAG } } })) === 0 &&
      (await prisma.event.count({ where: { id: { in: [...fx.events] } } })) === 0
  );
  assert(
    'G',
    'G2 every total as found (Event, User, Session, Person, PersonEvent, Household, Team, Item, OutboundMessage, InviteEvent, WrapUpLink, AuditEntry, AccessToken, EventSetup, EventRole)',
    JSON.stringify(left) === JSON.stringify(found),
    `${JSON.stringify(found)} -> ${JSON.stringify(left)}`
  );
  const crowdLeft = (
    await prisma.person.findMany({
      where: { email: { endsWith: '.demo-copy.invalid' } },
      select: { email: true },
    })
  ).filter((p) => CROWD_ADDRESS.test(p.email ?? '')).length;
  assert(
    'G',
    'G3 no copy account and no crowd person left',
    (await prisma.user.count({ where: { email: { endsWith: COPY_DOMAIN } } })) === 0 &&
      crowdLeft === 0
  );
  const hits = trapHits();
  assert(
    'G',
    'G4 nothing left the process: every request was answered by the trap’s fake fetch, and there were some',
    hits.length > 0 && hits.every((h) => h.via === 'fetch'),
    JSON.stringify(hits.filter((h) => h.via !== 'fetch'))
  );
}

if (require.main === module)
  main()
    .catch((e) => {
      assert('FATAL', `the suite threw: ${e?.stack ?? e}`, false);
    })
    .finally(async () => {
      await prisma.$disconnect();
      console.log(`\n${passed} passed, ${failed} failed`);
      if (failed > 0) {
        console.log('\nRED:');
        for (const r of reds) console.log(`  ✗ ${r}`);
        process.exit(1);
      }
      console.log(
        '\x1b[32mGREEN — the shortcuts work on a sample only, and the pretend Send sends nothing.\x1b[0m'
      );
      process.exit(0);
    });
