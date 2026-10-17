/**
 * [[GTC-337]] — GATHER'S TEXTS BEFORE THE DEPLOY.
 *
 * Run: npm run test:texts
 *
 * ── WHAT THIS SUITE HOLDS ─────────────────────────────────────────────────────
 *
 *   Ruling 1  The text reminders say what the email reminders say, and name the event.
 *   Ruling 2  Every text Gather sends ends with "Reply STOP to opt out" on its own line, once.
 *
 *   A  the reminder words, byte-exact over WHOLE, PARTIAL, DONE, itemless and carried child
 *   B  the line: every composer ends with it exactly once
 *   C  GSM-7: every Gather text over ASCII fixture data costs single-rate ([[GTC-187]]'s gate)
 *   D  every send path, through the real dispatcher, with `sendSms` stubbed
 *   E  the email reminder is byte-identical to HEAD 340c833
 *   F  the host's own nudge: NudgeComposer shows the line on a text, and the route appends it
 *   G  the pre-flight counts a text as it will be sent
 *   H  the guard: every `sendSms(` call site in src/ carries the line
 *
 * ── NOTHING IS SENT ───────────────────────────────────────────────────────────
 *
 * `sendSms` is replaced in `require.cache` before any module that imports it is loaded, so every
 * text is captured as `{ to, message }` and answered `SMS_DISABLED` — today's outcome in this
 * environment. The stub is this file's, not a production seam (founder Q7 stands).
 * `globalThis.fetch` is stubbed too, and any call that is not to Resend is counted and must be 0.
 * Every TNZ and Twilio variable is deleted from this process.
 *
 * ⚠ `drainOnce`, `enrolMiniSends` and `dispatchPendingWrapUpMessages` are crons, and a cron has no
 * tenant. Before any of them is called, this suite asserts that nothing OUTSIDE its fixture is
 * drainable or pending, and does not call them if anything is. Rows the mini-send sweep enrols on
 * other events are deleted before the drain runs. Fixture rows are tagged `GTC337` and removed in
 * `finally`.
 */

import { PrismaClient } from '@prisma/client';
import { liveBehindTrap } from './helpers/provider-trap';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const TAG = 'GTC337';
const ROOT = join(__dirname, '..');
const DAY = 24 * 60 * 60 * 1000;
const LINE = 'Reply STOP to opt out';
const BASE = 'https://gather-prototype-production.up.railway.app';
// The production link's length: the base, `/p/`, and a 64-character token — 117 characters.
const LINK = `${BASE}/p/${'a'.repeat(64)}`;

// ── The environment, before anything is imported. ─────────────────────────────
for (const k of [
  'TNZ_AUTH_TOKEN',
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_PHONE_NUMBER',
])
  delete process.env[k];
process.env.NEXT_PUBLIC_APP_URL = BASE;
process.env.RESEND_API_KEY = `re_${TAG}_sentinel_key_000000000000`;
process.env.UNSUBSCRIBE_TOKEN_SECRET = process.env.UNSUBSCRIBE_TOKEN_SECRET || `${TAG}-secret`;

// ── The sendSms stub, installed before any importer of it loads. ──────────────
const texts: { to: string; message: string; metadata?: Record<string, unknown> }[] = [];
const sendSmsPath = require.resolve('../src/lib/sms/send-sms');
const realSendSms = require(sendSmsPath);
require.cache[sendSmsPath]!.exports = {
  ...realSendSms,
  sendSms: async (p: { to: string; message: string; metadata?: Record<string, unknown> }) => {
    texts.push({ to: p.to, message: p.message, metadata: p.metadata });
    return { success: false, blocked: 'SMS_DISABLED', error: `${TAG} stub` };
  },
};

// ── The fetch stub. ───────────────────────────────────────────────────────────
const realFetch = globalThis.fetch;
const emails: { to: string[]; subject?: string; text?: string }[] = [];
let nonResendCalls = 0;
globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
  if (String(url).includes('resend')) {
    const body = JSON.parse(init?.body ?? '{}');
    emails.push({ to: [body.to ?? []].flat(), subject: body.subject, text: body.text });
    return new Response(JSON.stringify({ id: `${TAG}-${emails.length}-${Date.now()}` }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  nonResendCalls++;
  return new Response('{}', { status: 500 });
}) as typeof fetch;

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;
const red: string[] = [];
function assert(phase: string, label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}`);
    failed++;
    red.push(`[${phase}] ${label}`);
  }
}
function ok(fn: () => boolean): boolean {
  try {
    return fn();
  } catch {
    return false;
  }
}
async function layer(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (e) {
    assert(name, `layer ran to completion (threw: ${(e as Error).message.split('\n')[0]})`, false);
  }
}
const read = (rel: string) =>
  existsSync(join(ROOT, rel)) ? readFileSync(join(ROOT, rel), 'utf8') : '';
/** Loads a module, or null when it does not exist yet — so a RED run reports rather than dies. */
function load<T = any>(rel: string): T | null {
  try {
    return require(join(ROOT, rel));
  } catch {
    return null;
  }
}
const occurrences = (s: string, sub: string) => s.split(sub).length - 1;
/** Ends with a line break and the line, and carries the line exactly once. */
const endsWithLineOnce = (s: unknown) =>
  typeof s === 'string' && s.endsWith(`\n${LINE}`) && occurrences(s, LINE) === 1;

/*
 * The GSM 03.38 default alphabet, plus the escape-table characters. Copied from
 * `tests/message-composition-test.ts` (GTC-187's gate), which holds the ask to it; this suite
 * extends the same gate to every text Gather composes.
 */
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM7 = new Set([...GSM7_BASIC, ...'\f^{}\\[~]|€']);
const nonGsm = (text: string) => [...new Set([...text].filter((c) => !GSM7.has(c)))];

// ── The fixtures the words are measured over. ─────────────────────────────────
const W = (n: string[]) => ({ state: 'WHOLE' as const, pendingNames: n });
const P = (n: string[]) => ({ state: 'PARTIAL' as const, pendingNames: n });
const D = { state: 'DONE' as const, pendingNames: [] as string[] };
const FIXTURES: Record<string, Record<string, unknown>> = {
  WHOLE: { itemless: false, answeredAnything: false, self: W(['pavlova', 'salad']), carried: [] },
  PARTIAL: { itemless: false, answeredAnything: true, self: P(['salad']), carried: [] },
  DONE: {
    itemless: false,
    answeredAnything: true,
    self: D,
    carried: [{ firstName: 'Ollie', ...P(['trifle']) }],
  },
  ITEMLESS: { itemless: true, answeredAnything: false, self: W([]), carried: [] },
  CARRIED: {
    itemless: false,
    answeredAnything: false,
    self: W(['pavlova']),
    carried: [{ firstName: 'Ollie', ...W(['trifle']) }],
  },
};
const chaseInput = (fx: string, leg: 'FIRST' | 'SECOND', link = LINK) => ({
  leg,
  recipientFirstName: 'Ann',
  hostFirstName: 'Kate',
  eventName: 'Christmas lunch',
  link,
  ...FIXTURES[fx],
});

/** Ruling 1, as ruled — byte-exact. `{L}` is the link. */
const TEXT_REMINDER: Record<string, string> = {
  WHOLE_FIRST: `Hi Ann - Gather here again, helping Kate with Christmas lunch. I haven't heard from you yet. One tap to say yes, no or maybe: {L}\n${LINE}`,
  WHOLE_SECOND: `Hi Ann - Gather here, checking in once more for Kate about Christmas lunch. I still haven't heard from you. One tap to say yes, no or maybe: {L}\n${LINE}`,
  PARTIAL_FIRST: `Hi Ann - Gather here again, helping Kate with Christmas lunch. I haven't heard back about the salad yet. One tap to say yes, no or maybe: {L}\n${LINE}`,
  PARTIAL_SECOND: `Hi Ann - Gather here, checking in once more for Kate about Christmas lunch. I still haven't heard back about the salad. One tap to say yes, no or maybe: {L}\n${LINE}`,
  DONE_FIRST: `Hi Ann - Gather here again, helping Kate with Christmas lunch. I haven't heard back about Ollie's trifle yet. One tap to say yes, no or maybe: {L}\n${LINE}`,
  DONE_SECOND: `Hi Ann - Gather here, checking in once more for Kate about Christmas lunch. I still haven't heard back about Ollie's trifle. One tap to say yes, no or maybe: {L}\n${LINE}`,
  ITEMLESS_FIRST: `Hi Ann - Gather here again, helping Kate with Christmas lunch. I haven't heard from you yet. One tap to say whether you can make it: {L}\n${LINE}`,
  ITEMLESS_SECOND: `Hi Ann - Gather here, checking in once more for Kate about Christmas lunch. I still haven't heard from you. One tap to say whether you can make it: {L}\n${LINE}`,
  CARRIED_FIRST: `Hi Ann - Gather here again, helping Kate with Christmas lunch. I haven't heard back about you and Ollie yet. One tap to say yes, no or maybe: {L}\n${LINE}`,
  CARRIED_SECOND: `Hi Ann - Gather here, checking in once more for Kate about Christmas lunch. I still haven't heard back about you and Ollie. One tap to say yes, no or maybe: {L}\n${LINE}`,
};

/** The email reminder at HEAD 340c833, captured by `composeChase` before this ticket. */
const EMAIL_REMINDER_AT_HEAD: Record<string, string> = {
  WHOLE_FIRST:
    "Hi Ann - Gather here again, helping Kate with this one. I haven't heard from you yet. One tap to say yes, no or maybe: {L}",
  WHOLE_SECOND:
    "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard from you. One tap to say yes, no or maybe: {L}",
  PARTIAL_FIRST:
    "Hi Ann - Gather here again, helping Kate with this one. I haven't heard back about the salad yet. One tap to say yes, no or maybe: {L}",
  PARTIAL_SECOND:
    "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard back about the salad. One tap to say yes, no or maybe: {L}",
  DONE_FIRST:
    "Hi Ann - Gather here again, helping Kate with this one. I haven't heard back about Ollie's trifle yet. One tap to say yes, no or maybe: {L}",
  DONE_SECOND:
    "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard back about Ollie's trifle. One tap to say yes, no or maybe: {L}",
  ITEMLESS_FIRST:
    "Hi Ann - Gather here again, helping Kate with this one. I haven't heard from you yet. One tap to say whether you can make it: {L}",
  ITEMLESS_SECOND:
    "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard from you. One tap to say whether you can make it: {L}",
  CARRIED_FIRST:
    "Hi Ann - Gather here again, helping Kate with this one. I haven't heard back about you and Ollie yet. One tap to say yes, no or maybe: {L}",
  CARRIED_SECOND:
    "Hi Ann - Gather here, checking in once more for Kate. I still haven't heard back about you and Ollie. One tap to say yes, no or maybe: {L}",
};
const EMAIL_SUBJECT_AT_HEAD = 'Christmas lunch — from Kate';

const CASES = Object.keys(FIXTURES).flatMap((fx) =>
  (['FIRST', 'SECOND'] as const).map((leg) => ({ fx, leg, key: `${fx}_${leg}` }))
);

/** Every text Gather itself composes, over ASCII fixture data. Null where a composer is missing. */
function gatherTexts(): { name: string; text: string | null }[] {
  const reg = load('src/lib/messages/chase-register');
  const nt = load('src/lib/sms/nudge-templates');
  const wu = load('src/lib/sms/wrap-up-templates');
  const line = load('src/lib/sms/opt-out-line');
  const ask = load('src/lib/messages/ask-register');
  const out: { name: string; text: string | null }[] = [];
  for (const c of CASES) {
    out.push({
      name: `text reminder ${c.key}`,
      text: ok(() => typeof reg?.composeChaseText === 'function')
        ? reg.composeChaseText(chaseInput(c.fx, c.leg))
        : null,
    });
  }
  out.push({
    name: 'decide-by follow-up',
    text: nt.getDecideByFollowupMessage({
      hostFirstName: 'Kate',
      itemName: 'pavlova',
      decideByDay: 'Thursday',
      link: LINK,
    }),
  });
  const wrap = { guestFirstName: 'Ann', eventName: 'Christmas lunch', hostFirstName: 'Kate' };
  out.push({
    name: 'wrap-up, with item',
    text: wu.buildSmsWrapUpMessage({ ...wrap, guestTaskItem: 'pavlova' }),
  });
  out.push({
    name: 'wrap-up, fallback',
    text: wu.buildSmsWrapUpMessage({ ...wrap, guestTaskItem: 'what you brought' }),
  });
  const askText = ask.composeAsk({
    event: {
      name: 'Christmas lunch',
      startDate: new Date('2026-12-25T00:00:00Z'),
      venueName: null,
      occasionDescription: null,
    },
    hostName: 'Kate Henderson',
    recipient: {
      firstName: 'Ann',
      itemNames: ['pavlova', 'salad'],
      jobNames: [],
      carried: [],
      // [[GTC-356]] — required since the household list; empty, so the message is unchanged.
      household: [],
      link: LINK,
    },
    storedAuthorLine: null,
  }).text;
  out.push({
    name: 'the ask, as texted',
    text: typeof line?.withOptOutLine === 'function' ? line.withOptOutLine(askText) : null,
  });
  return out;
}

// ── LAYER A — the words. Pure. ────────────────────────────────────────────────
async function runWords() {
  const reg = load('src/lib/messages/chase-register');
  const nt = load('src/lib/sms/nudge-templates');
  assert(
    'A',
    'chase-register exports composeChaseText',
    ok(() => typeof reg?.composeChaseText === 'function')
  );
  for (const c of CASES) {
    const got = ok(() => typeof reg?.composeChaseText === 'function')
      ? reg.composeChaseText(chaseInput(c.fx, c.leg))
      : null;
    assert(
      'A',
      `ruling 1 — the ${c.leg.toLowerCase()} text reminder, ${c.fx}, byte-exact`,
      got === TEXT_REMINDER[c.key].replace('{L}', LINK)
    );
  }
  assert(
    'A',
    'ruling 1 — PARTIAL names only the open dish, never the answered one',
    ok(() => !reg.composeChaseText(chaseInput('PARTIAL', 'FIRST')).includes('pavlova'))
  );
  const all = gatherTexts();
  for (const [phrase, re] of [
    ['waiting for your response', /waiting for your response/i],
    ['needs your response', /needs your response/i],
    ['please', /please/i],
  ] as const) {
    assert(
      'A',
      `"${phrase}" appears in no text Gather composes`,
      all.every((t) => t.text !== null && !re.test(t.text))
    );
  }
  assert(
    'A',
    'the old templates are gone: getFirstNudgeMessage and getSecondNudgeMessage are not exported',
    nt && !('getFirstNudgeMessage' in nt) && !('getSecondNudgeMessage' in nt)
  );
}

// ── LAYER B — the line. Pure. ─────────────────────────────────────────────────
async function runLine() {
  const line = load('src/lib/sms/opt-out-line');
  const keywords = load('src/lib/sms/opt-out-keywords');
  assert('B', 'src/lib/sms/opt-out-line exists', line !== null);
  assert('B', `OPT_OUT_LINE is exactly "${LINE}"`, line?.OPT_OUT_LINE === LINE);
  for (const t of gatherTexts()) {
    assert(
      'B',
      `${t.name} ends with a line break and the line, exactly once`,
      endsWithLineOnce(t.text)
    );
  }
  const w = (s: string) =>
    typeof line?.withOptOutLine === 'function' ? line.withOptOutLine(s) : null;
  assert(
    'B',
    'withOptOutLine: a host body gets the line',
    w('See you there!') === `See you there!\n${LINE}`
  );
  assert(
    'B',
    'withOptOutLine: trailing whitespace is trimmed before the break',
    w('See you there!  \n') === `See you there!\n${LINE}`
  );
  assert(
    'B',
    'exactly once: a host who typed the line on its own line still sends it once',
    w(`See you there!\n${LINE}`) === `See you there!\n${LINE}`
  );
  assert(
    'B',
    'exactly once: a host who typed the old dashed suffix sends the line once, without the dash',
    w(`See you there! — ${LINE}`) === `See you there!\n${LINE}` &&
      w(`See you there! - ${LINE} `) === `See you there!\n${LINE}`
  );
  assert(
    'B',
    'the line tells the truth: "STOP" is an opt-out reply (Zone 7, read only)',
    ok(() => keywords.isOptOutMessage('STOP') === true)
  );
}

// ── LAYER C — GSM-7. Pure. ────────────────────────────────────────────────────
async function runGsm7() {
  const all = gatherTexts();
  for (const t of all) {
    const bad = t.text === null ? ['(missing)'] : nonGsm(t.text);
    assert(
      'C',
      `${t.name} stays GSM-7 over ASCII fixture data${bad.length ? ` (${bad.join(' ')})` : ''}`,
      bad.length === 0
    );
  }
  // HOST_NUDGE_TEMPLATES are excluded, deliberately: their emoji and dashes are the host's voice
  // and [[GTC-257]] ruling 2 is still open. The line itself is GSM-7 whatever it follows.
  assert('C', 'the line itself is GSM-7', nonGsm(`\n${LINE}`).length === 0);
}

// ── LAYER E (pure half) — the email reminder is byte-identical to HEAD. ───────
async function runEmailWords() {
  const reg = load('src/lib/messages/chase-register');
  for (const c of CASES) {
    const got = reg.composeChase(chaseInput(c.fx, c.leg));
    assert(
      'E',
      `the email reminder, ${c.key}, is byte-identical to HEAD`,
      got.text === EMAIL_REMINDER_AT_HEAD[c.key].replace('{L}', LINK) &&
        got.subject === EMAIL_SUBJECT_AT_HEAD
    );
  }
  assert(
    'E',
    'the email reminder carries no opt-out line',
    CASES.every((c) => !reg.composeChase(chaseInput(c.fx, c.leg)).text.includes(LINE))
  );
}

// ── LAYER F — the host's own nudge. ───────────────────────────────────────────
async function runHostNudge() {
  let NudgeComposer: any = null;
  try {
    NudgeComposer = require(join(ROOT, 'src/components/plan/NudgeComposer')).NudgeComposer;
  } catch (e) {
    NudgeComposer = null;
  }
  const render = (contactMethod: 'sms' | 'email') =>
    NudgeComposer
      ? renderToStaticMarkup(
          createElement(NudgeComposer, {
            eventId: 'e',
            personId: 'p',
            personName: 'Ann Smith',
            taskItem: 'salad',
            eventName: 'Christmas lunch',
            eventDate: 'Thursday 25 December',
            contactMethod,
            onSent: () => {},
            onCancel: () => {},
          })
        )
      : '';
  const sms = render('sms');
  const email = render('email');
  const textarea = (html: string) =>
    (html.match(/<textarea[^>]*>([\s\S]*?)<\/textarea>/) ?? [])[1] ?? '';
  assert('F', 'CONTROL: NudgeComposer renders', sms.includes('<textarea'));
  assert('F', 'on a text, NudgeComposer shows the line before she sends', sms.includes(LINE));
  assert(
    'F',
    'and the line is not in the textarea, so she cannot delete it',
    sms.includes('<textarea') && !textarea(sms).includes(LINE)
  );
  assert(
    'F',
    'on an email, NudgeComposer shows no line',
    email.includes('<textarea') && !email.includes(LINE)
  );

  const route = read('src/app/api/events/[id]/people/[personId]/nudge/route.ts');
  const smsCall = route.slice(
    route.indexOf('sendSms({'),
    route.indexOf('})', route.indexOf('sendSms({'))
  );
  assert(
    'F',
    "the route's text send carries the line: message: withOptOutLine(message.trim())",
    /message:\s*withOptOutLine\(message\.trim\(\)\)/.test(smsCall)
  );
  const emailCalls = route
    .split('sendNudgeEmail({')
    .slice(1)
    .map((s) => s.slice(0, s.indexOf('})')));
  assert(
    'F',
    "and neither of the route's email sends does",
    emailCalls.length === 2 && emailCalls.every((c) => !/withOptOutLine|Reply STOP/.test(c))
  );
}

// ── LAYER H — the guard. ──────────────────────────────────────────────────────
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
  });
}
async function runGuard() {
  /*
   * Unknown 1, ruled: the line is added by each composer or text send, not by `sendSms`, and this
   * is what stops a sixth text from missing it. A new `sendSms(` call site fails here until
   * somebody decides how its line gets there.
   */
  const LINE_CARRIERS =
    /withOptOutLine\(|composeChaseText\(|getDecideByFollowupMessage\(|buildSmsWrapUpMessage\(/;
  const sites: { file: string; expr: string }[] = [];
  for (const file of walk(join(ROOT, 'src'))) {
    const rel = file.slice(ROOT.length + 1);
    if (rel === 'src/lib/sms/send-sms.ts') continue;
    const src = readFileSync(file, 'utf8');
    let i = src.indexOf('sendSms({');
    while (i >= 0) {
      const call = src.slice(i, src.indexOf('})', i));
      const m = call.match(/message:\s*([^\n]+)/);
      let expr = m ? m[1] : '';
      if (!m && /\n\s*message,/.test(call)) {
        // Shorthand: the nearest `const message =` before the call.
        const before = src.slice(0, i);
        const decl = before.lastIndexOf('const message =');
        expr = decl >= 0 ? before.slice(decl, before.indexOf(';', decl)) : '';
      }
      sites.push({ file: rel, expr });
      i = src.indexOf('sendSms({', i + 1);
    }
  }
  assert(
    'H',
    `exactly five sendSms( call sites in src/ (found ${sites.length})`,
    sites.length === 5
  );
  for (const s of sites) {
    assert('H', `${s.file}: its message carries the line`, LINE_CARRIERS.test(s.expr));
  }
}

// ── LAYERS D, E (sent half) and G — against the database. ─────────────────────
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  teams: [] as string[],
  items: [] as string[],
};
const preExistingOutbound = new Set<string>();

function nzNoon(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0); // 12:00 or 13:00 NZ, outside quiet hours
  return d;
}

async function runDatabase() {
  const now = nzNoon();
  for (const r of await prisma.outboundMessage.findMany({ select: { id: true } }))
    preExistingOutbound.add(r.id);

  const dispatch = await import('../src/lib/press/dispatch');
  const resend = await import('../src/lib/press/resend');
  const wrapUp = await import('../src/lib/wrap-up');
  const decideBy = await import('../src/lib/sms/decide-by-sender');
  const preview = await import('../src/lib/preflight/ask-preview');
  const compose = await import('../src/lib/preflight/ask-preview-compose');
  const nt = await import('../src/lib/sms/nudge-templates');
  const { buildTokenUrl } = await import('../src/lib/tokens');

  // ── The fixture: one pressed event, one guest per text path.
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `${TAG.toLowerCase()}-${l}-${stamp}@example.test`;
  let phoneN = 0;
  const phone = () => `+6421337${String(++phoneN).padStart(4, '0')}`;
  const user = await prisma.user.create({ data: { email: mail('host') } });
  created.users.push(user.id);
  const person = async (label: string, over: Record<string, unknown> = {}) => {
    const p = await prisma.person.create({
      data: { name: `${label} ${TAG}`, email: mail(label.toLowerCase()), ...over },
    });
    created.people.push(p.id);
    return p;
  };
  const host = await person('Kate', { email: user.email, userId: user.id });
  const start = new Date(now.getTime() + 30 * DAY);
  const event = await prisma.event.create({
    data: {
      name: `${TAG} Christmas`,
      startDate: start,
      endDate: start,
      hostId: host.id,
      status: 'CONFIRMING',
      sentAt: now,
    },
  });
  created.events.push(event.id);
  await prisma.eventRole.create({ data: { eventId: event.id, userId: user.id, role: 'HOST' } });
  await prisma.personEvent.create({ data: { personId: host.id, eventId: event.id, role: 'HOST' } });
  const team = await prisma.team.create({ data: { name: `${TAG} Mains`, eventId: event.id } });
  created.teams.push(team.id);

  const item = async (personId: string, name: string, response: 'PENDING' | 'ACCEPTED') => {
    const it = await prisma.item.create({ data: { name, teamId: team.id, status: 'ASSIGNED' } });
    created.items.push(it.id);
    await prisma.assignment.create({ data: { itemId: it.id, personId, response } });
  };
  const guest = async (
    label: string,
    opts: {
      person: Record<string, unknown>;
      ask: 'ACCEPTED_EMAIL' | 'REJECTED_EMAIL' | 'PENDING_TEXT' | null;
    }
  ) => {
    const p = await person(label, opts.person);
    const sentAt = new Date(now.getTime() - 5 * DAY);
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        sentAt: opts.ask === 'ACCEPTED_EMAIL' ? sentAt : null,
      },
    });
    const token = `${TAG}-${pe.id}`;
    await prisma.accessToken.create({
      data: { token, scope: 'PARTICIPANT', eventId: event.id, personId: p.id, expiresAt: start },
    });
    if (opts.ask === 'ACCEPTED_EMAIL') {
      await prisma.outboundMessage.create({
        data: {
          eventId: event.id,
          personEventId: pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          attemptedAt: sentAt,
          attemptCount: 1,
          acceptedAt: sentAt,
          provider: 'resend',
          providerMessageId: `${TAG}-ask-${pe.id}`,
          createdAt: sentAt,
        },
      });
    } else if (opts.ask === 'REJECTED_EMAIL') {
      await prisma.outboundMessage.create({
        data: {
          eventId: event.id,
          personEventId: pe.id,
          kind: 'ASK',
          channel: 'EMAIL',
          attemptedAt: sentAt,
          attemptCount: 1,
          rejectedAt: sentAt,
          provider: 'resend',
          providerError: `${TAG} bounced`,
          createdAt: sentAt,
        },
      });
    } else if (opts.ask === 'PENDING_TEXT') {
      await prisma.outboundMessage.create({
        data: { eventId: event.id, personEventId: pe.id, kind: 'ASK', channel: 'TEXT' },
      });
    }
    return {
      personId: p.id,
      peId: pe.id,
      phone: p.phoneNumber,
      link: buildTokenUrl(BASE, 'PARTICIPANT', token),
    };
  };

  // Ted: the ask, by text. No address, so the chooser texts him too.
  const ted = await guest('Ted', {
    person: { email: null, phoneNumber: phone() },
    ask: 'PENDING_TEXT',
  });
  await item(ted.personId, 'pavlova', 'PENDING');
  // Pat: asked, answered one dish of two — the PARTIAL guest the text reminder is about.
  const pat = await guest('Pat', {
    person: { email: null, phoneNumber: phone() },
    ask: 'ACCEPTED_EMAIL',
  });
  await item(pat.personId, 'pavlova', 'ACCEPTED');
  await item(pat.personId, 'salad', 'PENDING');
  // Ann: email only, nothing answered — the email reminder, to prove it did not move.
  const ann = await guest('Ann', { person: { phoneNumber: null }, ask: 'ACCEPTED_EMAIL' });
  await item(ann.personId, 'trifle', 'PENDING');
  // Bea: her ask email bounced; the host sends it to her phone instead (the resend door's text).
  const bea = await guest('Bea', { person: { phoneNumber: phone() }, ask: 'REJECTED_EMAIL' });
  await item(bea.personId, 'bread', 'PENDING');
  // Mia: added after the press, holding a link and no ask row — the mini-send.
  const mia = await guest('Mia', { person: { email: null, phoneNumber: phone() }, ask: null });
  await item(mia.personId, 'cheese', 'PENDING');

  for (const [pe, kind, channel] of [
    [pat.peId, 'CHASE_FIRST', 'TEXT'],
    [pat.peId, 'CHASE_SECOND', 'TEXT'],
    [ann.peId, 'CHASE_FIRST', 'EMAIL'],
  ] as const) {
    await prisma.outboundMessage.create({
      data: { eventId: event.id, personEventId: pe, kind, channel },
    });
  }

  // ── G — the pre-flight counts a text as it will be sent.
  /*
   * The host's line is padded so Ted's ask is 630 characters: 4 texts without the line, 5 with
   * it. Without that, "counted over the text as sent" would pass whichever text was counted.
   */
  const rowsNow = async () => {
    const pv = await preview.readAskPreview(prisma, event.id, BASE);
    return pv ? compose.composePreview(pv, pv.storedAuthorLine).rows : [];
  };
  const probe = 'We are doing lunch.';
  await prisma.event.update({ where: { id: event.id }, data: { askAuthorLine: probe } });
  const probed = (await rowsNow()).find((r: any) => r.recipient.personEventId === ted.peId) as any;
  const pad = 630 - (probed?.ask?.text.length ?? 0);
  await prisma.event.update({
    where: { id: event.id },
    data: {
      askAuthorLine: `${probe}${' Bring a smile.'.repeat(Math.floor(pad / 15))}${'!'.repeat(pad % 15)}`,
    },
  });
  const rows = await rowsNow();
  const rowOf = (peId: string) => rows.find((r: any) => r.recipient.personEventId === peId) as any;
  const tedRow = rowOf(ted.peId);
  const annRow = rowOf(ann.peId);
  assert(
    'G',
    'CONTROL: the preview composes Ted (texted) and Ann (emailed)',
    !!tedRow?.ask && !!annRow?.ask
  );
  assert(
    'G',
    'CONTROL: the line moves Ted from 4 texts to 5 (630 characters without it)',
    ok(
      () =>
        tedRow.ask.text.length === 630 &&
        nt.getMessageInfo(tedRow.ask.text).segments === 4 &&
        nt.getMessageInfo(`${tedRow.ask.text}\n${LINE}`).segments === 5
    )
  );
  assert(
    'G',
    "a texted row's textAsSent is its ask with the line",
    tedRow?.textAsSent === `${tedRow?.ask?.text}\n${LINE}`
  );
  assert(
    'G',
    "a texted row's segments are counted over the text as sent — 5, not 4",
    ok(() => tedRow.segments === 5)
  );
  assert(
    'G',
    'an emailed row has no textAsSent, no segments, and its body carries no line',
    annRow?.textAsSent === null && annRow?.segments === null && !annRow?.ask?.text.includes(LINE)
  );
  const page = read('src/app/plan/[eventId]/pre-flight/page.tsx');
  assert(
    'G',
    'the pre-flight page renders OPT_OUT_LINE, and counts characters off textAsSent',
    /OPT_OUT_LINE/.test(page) && /textAsSent/.test(page)
  );

  // ── The resend door: the host's "send it to their phone instead".
  const door = await resend.resendToPerson(
    prisma,
    {
      eventId: event.id,
      personId: bea.personId,
      baseUrl: BASE,
      actor: { id: host.id, kind: 'HOST', name: host.name },
      action: 'PHONE',
    } as any,
    { textingConfiguredFor: () => true }
  );
  assert('D', "CONTROL: the resend door wrote Bea's TEXT row", (door as any).ok === true);

  // ── ⚠ THE CRONS HAVE NO TENANT. Nothing outside this fixture may be drainable.
  const outside = { eventId: { notIn: created.events } };
  const drainableElsewhere = await prisma.outboundMessage.count({
    where: {
      ...outside,
      OR: [{ attemptedAt: null, withheldAt: null }, { nextAttemptAt: { not: null, lte: now } }],
    },
  });
  assert(
    'D',
    `SAFETY PRECONDITION: no drainable OutboundMessage outside this fixture (${drainableElsewhere})`,
    drainableElsewhere === 0
  );
  const wrapUpsElsewhere = await prisma.wrapUpLink.count({
    where: { ...outside, dispatched: false },
  });
  assert(
    'D',
    `SAFETY PRECONDITION: no undispatched WrapUpLink outside this fixture (${wrapUpsElsewhere})`,
    wrapUpsElsewhere === 0
  );
  if (drainableElsewhere !== 0 || wrapUpsElsewhere !== 0) {
    assert('D', 'the crons were NOT driven — a precondition failed', false);
    return;
  }

  // The mini-send sweep. Anything it enrols on another event is deleted before the drain.
  await dispatch.enrolMiniSends(prisma, 50);
  const strays = await prisma.outboundMessage.findMany({
    where: { ...outside, id: { notIn: [...preExistingOutbound] } },
    select: { id: true },
  });
  if (strays.length > 0) {
    await prisma.outboundMessage.deleteMany({ where: { id: { in: strays.map((s) => s.id) } } });
  }
  assert(
    'D',
    `the mini-send sweep's rows on other events were removed before any drain (${strays.length})`,
    (await prisma.outboundMessage.count({
      where: { ...outside, id: { notIn: [...preExistingOutbound] } },
    })) === 0
  );
  assert(
    'D',
    "CONTROL: the sweep enrolled Mia's mini-send, by text",
    (await prisma.outboundMessage.count({
      where: { personEventId: mia.peId, kind: 'ASK', channel: 'TEXT' },
    })) === 1
  );

  texts.length = 0;
  emails.length = 0;
  await dispatch.drainOnce(prisma, 50, now);

  const to = (p: { phone: string | null }) => texts.filter((t) => t.to === p.phone);
  const askOf = (peId: string) => rowOf(peId)?.ask?.text as string | undefined;
  assert(
    'D',
    'the ask by text: byte-exact — the composed ask, a line break and the line',
    to(ted).length === 1 && to(ted)[0].message === `${askOf(ted.peId)}\n${LINE}`
  );
  const miaPreview = await preview.readAskPreview(prisma, event.id, BASE);
  const miaAsk = compose
    .composePreview(miaPreview!, miaPreview!.storedAuthorLine)
    .rows.find((r: any) => r.recipient.personEventId === mia.peId)?.ask?.text;
  assert(
    'D',
    'a mini-send by text ends with the line, exactly once',
    to(mia).length === 1 &&
      endsWithLineOnce(to(mia)[0].message) &&
      to(mia)[0].message === `${miaAsk}\n${LINE}`
  );
  assert(
    'D',
    "the resend door's text send ends with the line, exactly once",
    to(bea).length === 1 && endsWithLineOnce(to(bea)[0].message)
  );
  const patTexts = to(pat);
  const patFirst = patTexts.find((t) => t.metadata?.nudgeType === 'first')?.message;
  const patSecond = patTexts.find((t) => t.metadata?.nudgeType === 'second')?.message;
  const patExpect = (key: 'PARTIAL_FIRST' | 'PARTIAL_SECOND') =>
    TEXT_REMINDER[key]
      .replace('Christmas lunch', `${TAG} Christmas`)
      .replace('Ann', 'Pat')
      .replace('{L}', pat.link);
  assert(
    'D',
    'the first text reminder to a PARTIAL guest, through the drain: byte-exact, naming only the salad',
    patFirst === patExpect('PARTIAL_FIRST')
  );
  assert(
    'D',
    'the second text reminder to a PARTIAL guest, through the drain: byte-exact',
    patSecond === patExpect('PARTIAL_SECOND')
  );

  // ── E (sent half) — the email reminder, through the drain and the Resend stub.
  const annMail = emails.find((e) => e.to.some((a) => a.startsWith(`${TAG.toLowerCase()}-ann-`)));
  const annExpect = EMAIL_REMINDER_AT_HEAD.WHOLE_FIRST.replace('{L}', ann.link);
  assert(
    'E',
    'the email reminder, through the drain: the HEAD words, and no opt-out line',
    !!annMail?.text && annMail.text.startsWith(annExpect) && !annMail.text.includes(LINE)
  );
  assert(
    'E',
    'the ask by email carries no opt-out line (decision 5 keeps the body channel-blind)',
    !!annRow?.ask && !annRow.ask.text.includes(LINE)
  );

  // ── The decide-by follow-up.
  texts.length = 0;
  await decideBy.sendDecideByFollowup(
    {
      phoneNumber: pat.phone!,
      eventId: event.id,
      personId: pat.personId,
      personName: `Pat ${TAG}`,
      hostName: host.name,
      itemName: 'salad',
      decideByAt: new Date(now.getTime() + 2 * DAY),
      participantToken: `${TAG}-${pat.peId}`,
      assignmentIds: [],
    } as any,
    now
  );
  assert(
    'D',
    'the decide-by follow-up ends with the line, exactly once, with no dash',
    texts.length === 1 && endsWithLineOnce(texts[0].message) && !texts[0].message.includes('—')
  );

  // ── The wrap-up thank-you.
  const wrapPerson = await person('Wes', { email: null, phoneNumber: phone() });
  await prisma.wrapUpLink.create({
    data: {
      token: `${TAG}-wrap-${stamp}`,
      eventId: event.id,
      personId: wrapPerson.id,
      guestName: `Wes ${TAG}`,
      guestPhone: wrapPerson.phoneNumber,
      channel: 'sms',
      expiresAt: start,
      createdAt: new Date(now.getTime() - 60 * 60 * 1000),
    },
  });
  texts.length = 0;
  await wrapUp.dispatchPendingWrapUpMessages(now);
  const wes = texts.filter((t) => t.to === wrapPerson.phoneNumber);
  assert(
    'D',
    'the wrap-up thank-you ends with the line, exactly once, with no dash',
    wes.length === 1 && endsWithLineOnce(wes[0].message) && !wes[0].message.includes('—')
  );

  assert('D', 'nothing but the Resend stub was reached (fetch)', nonResendCalls === 0);
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  const ev = { in: created.events };
  await del(() =>
    prisma.outboundMessage.deleteMany({
      where: { id: { notIn: [...preExistingOutbound] }, eventId: ev },
    })
  );
  await del(() => prisma.wrapUpLink.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.inviteEvent.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.auditEntry.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.assignment.deleteMany({ where: { itemId: { in: created.items } } }));
  await del(() => prisma.item.deleteMany({ where: { id: { in: created.items } } }));
  await del(() => prisma.accessToken.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.personEvent.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.team.deleteMany({ where: { id: { in: created.teams } } }));
  await del(() => prisma.eventRole.deleteMany({ where: { eventId: ev } }));
  await del(() => prisma.event.deleteMany({ where: { id: ev } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  liveBehindTrap(); // [[GTC-274]] the gate opened for this process only, behind the trap
  console.log('\n=== GTC-337 — Gather’s texts ===\n');
  await layer('A', runWords);
  await layer('B', runLine);
  await layer('C', runGsm7);
  await layer('E', runEmailWords);
  await layer('F', runHostNudge);
  await layer('H', runGuard);
  await layer('D', runDatabase);
}

main()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    globalThis.fetch = realFetch;
    await cleanup();
    await prisma.$disconnect();
    console.log(`\nTotal tests: ${passed + failed}   Passed: ${passed}   Failed: ${failed}`);
    if (failed > 0) {
      console.log('\nRED:');
      for (const r of red) console.log(`  ${r}`);
    }
    process.exit(failed > 0 ? 1 : 0);
  });
