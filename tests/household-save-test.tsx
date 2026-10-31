/**
 * [[GTC-431]] — THE HOUSEHOLD FORM'S SAVE NEVER FAILS SILENTLY.
 *
 * Found on production, 30 Oct 2026 (20:21 NZ): a tester saved her own household with two adults,
 * added six children and pressed Save; Railway's logs show her phone sent NO request for the next
 * eight minutes. The form's own checks had stopped the Save, and their only words sat under the
 * box that failed, out of sight. The founder's fix (31 Oct 2026), one ticket per commit:
 *
 *   431  When a check stops a Save, "Please fix N things above" shows beside the Save buttons
 *        ("Please fix 1 thing above" for one), and the first failing box, in screen order, takes
 *        focus and comes into view. All three Save buttons, and "Save & move on →".
 *   432  The form checks an email and a phone with their spaces trimmed, and a phone typed
 *        "+64 (0)21 123 4567" is stored as +64211234567 (the one 0 after +64 dropped). Phone rules
 *        otherwise unchanged.
 *   433  "Save changes" that fails (an error reply, a network failure) shows "That didn't save —
 *        please try again." as the other Save buttons do, and keeps the form as she left it.
 *
 * THE LAYERS
 *   W  the words, typed here by hand
 *   R  the form rendered in this process: no error marker and no count on a clean form
 *   S  the form's source: every Save path runs the checks through one place; the count is drawn
 *      only after a stopped Save
 *   T  the form's email and phone rules and normalizePhoneNumber on typed inputs, each expected
 *      value written here by hand (GTC-432)
 *   C  the setup page in the walled-off headless Chrome (port 9495) on the guarded dev server, at
 *      1280 and 390, on a fixture of its own (example.com addresses, made-up 021 numbers, nothing
 *      queued): each Save button pressed with a bad box far above it. Every page fetch is recorded
 *      in the page; the browser fails every plan-making and sending request before it leaves; every
 *      click is `clickGuarded`. Never pressed: Move on, Send, Generate. Every fixture row is counted
 *      and removed by id; InviteEvent and OutboundMessage totals are asserted as found.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 * HOUSEHOLD_SAVE_DRY_RUN=1 runs the in-memory layers only.
 */
import fs from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import Moment1InputForm, {
  fixWords,
  validateEmail,
  validatePhone,
} from '../src/components/plan/Moment1InputForm';
import { normalizePhoneNumber } from '../src/lib/phone';
import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:3000';
const PORT = 9495;
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
/** Source with comments taken out, so a check reads code and not what a comment says. */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const count = (s: string, sub: string) => s.split(sub).length - 1;

// ══ W — THE WORDS ════════════════════════════════════════════════════════════
function layerW() {
  section('W — the words beside Save (GTC-431)');
  assert('W', 'W1 one box: "Please fix 1 thing above"', fixWords(1) === 'Please fix 1 thing above');
  assert(
    'W',
    'W2 two boxes: "Please fix 2 things above"',
    fixWords(2) === 'Please fix 2 things above'
  );
  assert(
    'W',
    'W3 six boxes: "Please fix 6 things above"',
    fixWords(6) === 'Please fix 6 things above'
  );
}

// ══ R — THE FORM, RENDERED HERE ══════════════════════════════════════════════
function render(props: Record<string, unknown>): string {
  try {
    return renderToStaticMarkup(
      createElement(Moment1InputForm as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        onComplete: () => {},
        onAddPerson: async () => {},
        channelCandidates: [],
        ...props,
      })
    );
  } catch (e) {
    console.log(`    (render threw: ${String((e as Error).message).split('\n')[0]})`);
    return '';
  }
}
function layerR() {
  section('R — a clean form carries no error marker and no count (GTC-431)');
  const add = render({});
  const host = render({
    hostMode: { name: 'Kate', email: 'kate@example.com', phone: null },
    onSaveHostHousehold: async () => {},
  });
  assert(
    'R',
    'R1 the add form renders, with its Save, and no aria-invalid and no "Please fix"',
    add.includes('Save &amp; add another household') &&
      !add.includes('aria-invalid') &&
      !add.includes('Please fix')
  );
  assert(
    'R',
    'R2 her own household’s step renders, with its Save, and no aria-invalid and no "Please fix"',
    host.includes('Save and add everyone else →') &&
      !host.includes('aria-invalid') &&
      !host.includes('Please fix')
  );
}

// ══ S — THE FORM'S SOURCE ════════════════════════════════════════════════════
function layerS() {
  section('S — every Save runs the checks through one place (GTC-431)');
  const code = codeOnly(read(FORM));
  assert(
    'S',
    'S1 the four Save paths (add, edit, her own household, and "Save & move on") each stop on checksFail()',
    count(code, 'if (checksFail()) return;') === 4 &&
      /const handleAddAnother = async \(\) => \{\s*if \(checksFail\(\)\) return;/.test(code) &&
      /const handleEditSave = async \(\) => \{\s*if \(!editingHousehold \|\| !onEditSave\) return;\s*if \(checksFail\(\)\) return;/.test(
        code
      ) &&
      /const handleSaveHostHousehold = async \(\) => \{\s*if \(!onSaveHostHousehold\) return;\s*if \(checksFail\(\)\) return;/.test(
        code
      ) &&
      /const handleDone = async \(\) => \{\s*if \(name\.trim\(\)\) \{\s*if \(checksFail\(\)\) return;/.test(
        code
      )
  );
  assert(
    'S',
    'S2 the checks themselves are called in one place only, inside checksFail, drawn at once (flushSync)',
    count(code, 'hasValidationErrors()') === 1 &&
      /const checksFail = \(\): boolean => \{[\s\S]{0,120}flushSync\(\(\) => \{\s*bad = hasValidationErrors\(\);\s*setFixPrompt\(bad\);/.test(
        code
      )
  );
  assert(
    'S',
    'S3 the first visible box marked aria-invalid inside the form takes focus; no new scroll call',
    /formBoxRef\.current\?\.querySelectorAll<HTMLElement>\('\[aria-invalid="true"\]'\)/.test(
      code
    ) &&
      /\.find\(\(el\) => el\.getClientRects\(\)\.length > 0\);\s*first\?\.focus\(\);/.test(code) &&
      count(code, 'scrollIntoView') === 1
  );
  assert(
    'S',
    'S4 every box with its own error is marked: name, the primary’s email and phone, partner, kids, guests (9)',
    count(code, 'aria-invalid={') === 9
  );
  assert(
    'S',
    'S5 the count shows only after a stopped Save and while a box shows an error, as an alert',
    /\{fixPrompt && errorCount > 0 && \(\s*<p role="alert" className="text-red-600 text-sm mb-3">\s*\{fixWords\(errorCount\)\}/.test(
      code
    ) && /setFixPrompt\(false\);/.test(code)
  );
  assert(
    'S',
    'S6 "Save changes" clears the failed-save words before it saves, and a failure sets them; the form is not reset (GTC-433)',
    /const handleEditSave = async \(\) => \{[\s\S]{0,160}?setSaving\(true\);\s*setSaveError\(false\);\s*try \{\s*const payload = buildPayload\(\);\s*await onEditSave\(editingHousehold\.id, payload\);\s*resetForm\(\);\s*\} catch \{\s*setSaveError\(true\);\s*\} finally \{\s*setSaving\(false\);\s*\}\s*\};/.test(
      code
    )
  );
}

// ══ T — THE RULES, TRIMMED (GTC-432) ═════════════════════════════════════════
const EMAIL_WORDS = 'Invalid email format';
const NZ_WORDS = 'Invalid NZ phone number';
const INTL_WORDS = 'International numbers not supported yet. NZ numbers only.';
/** [typed, the form's words ('' = fine)], by hand. */
const EMAILS: Array<[string, string]> = [
  ['kid@example.com', ''],
  ['kid@example.com ', ''],
  ['  kid@example.com', ''],
  ['', ''],
  ['   ', ''],
  ['kid@test', EMAIL_WORDS],
  ['kid.example.com', EMAIL_WORDS],
  ['kid@@example.com', EMAIL_WORDS],
  ['kid one@example.com', EMAIL_WORDS],
];
/** [typed, the form's words, what normalizePhoneNumber stores (null = nothing)], by hand. */
const PHONES: Array<[string, string, string | null]> = [
  ['021 123 4567', '', '+64211234567'],
  [' 021 123 4567 ', '', '+64211234567'],
  ['022 123 456', '', '+6422123456'],
  ['(09) 123 4567', '', '+6491234567'],
  ['+64 21 123 4567', '', '+64211234567'],
  ['64211234567', '', '+64211234567'],
  ['0800 123 456', '', '+64800123456'],
  ['+64 (0)21 123 4567', '', '+64211234567'],
  ['64 (0)21 123 4567', '', '+64211234567'],
  ['+64 (0)9 123 4567', '', '+6491234567'],
  ['+64 (0)21 1234 5678', '', '+642112345678'],
  ['', '', null],
  ['123 4567', NZ_WORDS, null],
  ['12345678', NZ_WORDS, null],
  ['0064211234567', NZ_WORDS, null],
  ['0064 21 123 456', NZ_WORDS, null],
  ['+64 (0)123 4567', NZ_WORDS, null],
  ['+61 412 345 678', INTL_WORDS, null],
];
function layerT() {
  section('T — the email and phone rules, trimmed; "+64 (0)" stored without the 0 (GTC-432)');
  const emailOff = EMAILS.filter(([v, w]) => validateEmail(v) !== w);
  assert(
    'T',
    `T1 the form's email rule on ${EMAILS.length} typed values: spaces around an address no longer stop it; the rest as before`,
    emailOff.length === 0,
    JSON.stringify(emailOff.map(([v]) => [v, validateEmail(v)]))
  );
  const formOff = PHONES.filter(([v, w]) => validatePhone(v) !== w);
  assert(
    'T',
    `T2 the form's phone rule on ${PHONES.length} typed values: as before, "+64 (0)" numbers accepted, "+64 (0)" + 7 digits refused`,
    formOff.length === 0,
    JSON.stringify(formOff.map(([v]) => [v, validatePhone(v)]))
  );
  const storedOff = PHONES.filter(([v, , n]) => normalizePhoneNumber(v) !== n);
  assert(
    'T',
    'T3 what normalizePhoneNumber stores for each: "+64 (0)21 123 4567" and "64 (0)21 123 4567" are +64211234567, every other row as before',
    storedOff.length === 0,
    JSON.stringify(storedOff.map(([v]) => [v, normalizePhoneNumber(v)]))
  );
  const phoneCode = codeOnly(read('src/lib/phone.ts'));
  assert(
    'T',
    'T4 the 0 is dropped first, only after +64 or 64, once: a local 0… or a 00 64… is never touched',
    /let cleaned = phone\.replace\(\/\[\^\\d\+\]\/g, ''\);\s*if \(cleaned\.startsWith\('\+640'\)\) \{\s*cleaned = '\+64' \+ cleaned\.slice\(4\);\s*\} else if \(cleaned\.startsWith\('640'\)\) \{\s*cleaned = '64' \+ cleaned\.slice\(3\);\s*\}\s*if \(cleaned\.startsWith\('0'\)\)/.test(
      phoneCode
    )
  );
}

// ══ C — THE PAGE, IN CHROME ══════════════════════════════════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
  sessions: [] as string[],
};
const refusals: string[] = [];

/** Every fetch the page makes, as "METHOD path", recorded in the page before its scripts run. */
const RECORDER = `(() => { const f = window.fetch; window.__calls = []; window.__unhandled = 0; window.__failPut = null;
  window.addEventListener('unhandledrejection', () => { window.__unhandled++; });
  window.fetch = function (u, o) { let call = '';
    try { const url = typeof u === 'string' ? u : u.url;
      call = ((o && o.method) || (u && u.method) || 'GET').toUpperCase() + ' ' + new URL(url, location.href).pathname;
      window.__calls.push(call); } catch (e) {}
    /* [[GTC-433]]: a household PUT failed in the page itself, never reaching the server. */
    if (window.__failPut && call.startsWith('PUT /api/events/') && call.split('/').length === 6 && call.split('/')[4] === 'households') {
      if (window.__failPut === 'network') return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(new Response(JSON.stringify({ error: 'made-up failure' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }));
    }
    return f.apply(this, arguments); }; })();`;
/** The words a failed save shows, as the page draws them. */
const SAVE_FAILED = 'That didn’t save — please try again.';

const HELPERS = `
window.__vis = (el) => !!el && el.getClientRects().length > 0;
window.__tag = (el, t) => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t')); if (!el) return false; el.setAttribute('data-t', t); return true; };
window.__btn = (text) => [...document.querySelectorAll('button')].filter(window.__vis).find((b) => b.innerText.trim() === text) || null;
window.__set = (el, v) => { if (!el) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
window.__kids = () => [...document.querySelectorAll('input[placeholder="Kid\\'s name"]')].filter(window.__vis).map((n) => {
  const row = n.closest('div.border-l-4'); return { name: n, email: row.querySelector('input[type="email"]'), phone: row.querySelector('input[type="tel"]') }; });
window.__alert = () => [...document.querySelectorAll('p[role="alert"]')].filter(window.__vis).map((p) => p.innerText.trim());
window.__inView = (el) => { if (!el) return false; const r = el.getBoundingClientRect(); const s = el.closest('.overflow-y-auto');
  const a = s ? s.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
  return r.top >= Math.max(a.top, 0) - 1 && r.bottom <= Math.min(a.bottom, window.innerHeight) + 1; };
true;`;

async function runLive() {
  section('C — the setup page in Chrome (GTC-431)');
  const up = await (async () => {
    try {
      return (await realFetch(`${BASE}/`)).ok;
    } catch {
      return false;
    }
  })();
  assert('C', 'C0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc431-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate HS', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const session = await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  created.sessions.push(session.id);
  const start = new Date(Date.now() + 40 * 864e5);

  /** An event; with `ownHousehold`, her household (her and a partner) is already saved. */
  const mk = async (name: string, ownHousehold: boolean) => {
    const ev = await prisma.event.create({
      data: {
        name,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'DRAFT',
        guestCount: 12,
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    if (ownHousehold) {
      const hh = await prisma.household.create({ data: { eventId: ev.id } });
      await prisma.personEvent.create({
        data: {
          personId: kate.id,
          eventId: ev.id,
          role: 'HOST',
          householdId: hh.id,
          householdRole: 'PRIMARY_CONTACT',
        },
      });
      const ross = await prisma.person.create({ data: { name: 'Ross HS', email: mail('ross') } });
      created.people.push(ross.id);
      await prisma.personEvent.create({
        data: {
          personId: ross.id,
          eventId: ev.id,
          role: 'PARTICIPANT',
          householdId: hh.id,
          householdRole: 'PARTNER',
        },
      });
    }
    return ev.id;
  };
  const evA = await mk('GTC-431 household save — her household saved', true);
  const evB = await mk('GTC-431 household save — her own household first', false);

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { id: { in: created.sessions } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');
  const whileExists = await rows();
  console.log(
    `  fixture rows (Event, EventRole, Household, PersonEvent, Person, User, Session, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  const households = (eventId: string) => prisma.household.count({ where: { eventId } });
  const members = (eventId: string) => prisma.personEvent.count({ where: { eventId } });

  let chrome: Headless | null = null;
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    chrome.answerLeaveDialogs(true); // a "Leave site?" on the way out is answered "Leave"
    await chrome.blockPlanMaking();
    await chrome.blockSends();
    await chrome.addInitScript(RECORDER);
    await chrome.setSessionCookie(token);
    const c = chrome;
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const S = JSON.stringify;
    const go = async (p: string) => {
      await c.navigate(p, 9000);
      await ev(HELPERS);
    };
    const tap = async (js: string, settleMs?: number) => {
      const found = await ev<boolean>(`window.__tag(${js}, 'x')`);
      if (!found) return 'not found';
      const why = await c.clickGuarded('[data-t="x"]', settleMs);
      if (why) refusals.push(`${js}: ${why}`);
      return why;
    };
    const calls = () => ev<string[]>(`window.__calls.filter((c) => !c.startsWith('GET '))`);
    const clearCalls = () => ev(`window.__calls.length = 0`);
    /** Six kids with names, made-up emails and 021 numbers; `bad` puts wrong values on rows. */
    const sixKids = async (
      tag: string,
      bad: Record<number, { email?: string; phone?: string; name?: string }>
    ) => {
      for (let i = 0; i < 6; i++) await tap(`window.__btn('👦 Kid with a job')`, 150);
      await sleep(300);
      return ev<number>(`(() => { const k = window.__kids(); const bad = ${S(bad)};
        k.forEach((r, i) => { const b = bad[i] || {};
          window.__set(r.name, 'name' in b ? b.name : 'Kid ${tag} ' + (i + 1));
          window.__set(r.email, 'email' in b ? b.email : 'kid' + (i + 1) + '-${tag}-${stamp}@example.com');
          window.__set(r.phone, 'phone' in b ? b.phone : '021 000 00' + (10 + i)); });
        return k.length; })()`);
    };
    /** What a stopped Save left: the words, the focused box's value and whether it is on screen. */
    const stopped = () =>
      ev<{
        alert: string[];
        focusValue: string | null;
        focusPh: string | null;
        inView: boolean;
        firstKid: boolean;
      }>(
        `(() => { const a = document.activeElement; const k = window.__kids();
          return { alert: window.__alert(), focusValue: a && a.tagName === 'INPUT' ? a.value : null,
            focusPh: a && a.getAttribute ? a.getAttribute('placeholder') : null, inView: window.__inView(a),
            firstKid: !!k[0] && [k[0].name, k[0].email, k[0].phone].includes(a) }; })()`
      );

    // ── C1–C6: the add form, at 1280 then 390 ─────────────────────────────────
    for (const [w, h, mobile, tag] of [
      [1280, 900, false, 'desk'],
      [390, 844, true, 'phone'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${evA}/setup`);
      const onForm = await ev<boolean>(`!!window.__btn('Save & add another household')`);
      assert('C', `C1 ${w}: the page opens on the add form (her household saved)`, onForm);
      if (!onForm) continue;
      const hhBefore = await households(evA);
      await ev(`window.__set(document.querySelector('#m1-name'), 'Lena ${tag}')`);
      const n = await sixKids(tag, { 0: { email: 'kid@test' } });
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 600);
      const one = await stopped();
      assert(
        'C',
        `C2 ${w}: six kids, the top kid's email "kid@test": Save shows "Please fix 1 thing above", that box has focus and is on screen`,
        n === 6 &&
          S(one.alert) === S([fixWords(1)]) &&
          one.focusValue === 'kid@test' &&
          one.firstKid &&
          one.inView,
        S(one)
      );
      assert(
        'C',
        `C3 ${w}: nothing was sent and nothing stored`,
        (await calls()).length === 0 && (await households(evA)) === hhBefore,
        S(await calls())
      );
      await ev(`window.__set(window.__kids()[3].phone, '12345')`);
      await tap(`window.__btn('Save & add another household')`, 600);
      const two = await stopped();
      assert(
        'C',
        `C4 ${w}: a second bad box (kid 4's phone): "Please fix 2 things above", focus still on the first in screen order`,
        S(two.alert) === S([fixWords(2)]) && two.focusValue === 'kid@test' && two.inView,
        S(two)
      );
      await ev(`(() => { const k = window.__kids(); window.__set(k[0].email, 'kid1-${tag}-${stamp}@example.com');
        window.__set(k[3].phone, '021 000 0013'); })()`);
      await sleep(300);
      assert('C', `C5 ${w}: both fixed: the words go`, S(await ev(`window.__alert()`)) === S([]));
      await clearCalls();
      await tap(`window.__btn('Save & add another household')`, 2000);
      const saved = await prisma.household.findMany({
        where: { eventId: evA },
        include: { members: { include: { person: true } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      });
      const kids = saved[0]?.members.filter((m) => m.householdRole === 'CHILD') ?? [];
      assert(
        'C',
        `C6 ${w}: then Save stores the household: its contact and six kids, each with email and phone; one POST`,
        (await households(evA)) === hhBefore + 1 &&
          saved[0]?.members.some((m) => m.person.name === `Lena ${tag}`) &&
          kids.length === 6 &&
          kids.every((k) => !!k.person.email && !!k.person.phoneNumber) &&
          S(await calls()) === S([`POST /api/events/${evA}/households`]),
        S(await calls())
      );
    }

    // ── C7–C8: "Save changes" on her own household, at 390 ────────────────────
    await c.setViewport(390, 844, true);
    await go(`/plan/${evA}/setup`);
    const membersBefore = await members(evA);
    const editFound = await tap(
      `[...document.querySelectorAll('button')].filter(window.__vis).filter((b) => b.innerText.trim() === 'Edit').find((b) => (b.closest('[class*="border"]')?.innerText || '').includes('Kate HS'))`,
      600
    );
    const editing = await ev<boolean>(`!!window.__btn('Save changes')`);
    assert(
      'C',
      'C7 390: Edit on her own card opens it with "Save changes"',
      editFound === null && editing
    );
    if (editing) {
      await sixKids('edit', { 2: { name: '' } });
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 600);
      const e = await stopped();
      assert(
        'C',
        'C8 390: a kid row left without a name: "Please fix 1 thing above", that name box has focus and is on screen; no PUT, nothing stored',
        S(e.alert) === S([fixWords(1)]) &&
          e.focusPh === "Kid's name" &&
          e.focusValue === '' &&
          e.inView &&
          (await calls()).length === 0 &&
          (await members(evA)) === membersBefore,
        S(e)
      );
      await tap(`window.__btn('Cancel')`, 500);
    }

    // ── C14–C16: "Save changes" that fails says so, at 390 and 1280 (GTC-433) ──────
    const openOwnEdit = () =>
      tap(
        `[...document.querySelectorAll('button')].filter(window.__vis).filter((b) => b.innerText.trim() === 'Edit').find((b) => (b.closest('[class*="border"]')?.innerText || '').includes('Kate HS'))`,
        600
      );
    const afterFail = () =>
      ev<{
        words: boolean;
        editing: boolean;
        kids: number;
        filled: boolean;
        alert: string[];
        unhandled: number;
      }>(
        `(() => { const k = window.__kids();
          return { words: [...document.querySelectorAll('p')].filter(window.__vis).some((p) => p.innerText.trim() === ${JSON.stringify(SAVE_FAILED)}),
            editing: !!window.__btn('Save changes'), kids: k.length,
            filled: k.every((r) => r.name.value.startsWith('Kid fail') && r.email.value.includes('@') && r.phone.value.startsWith('021')),
            alert: window.__alert(), unhandled: window.__unhandled }; })()`
      );
    const onePut = (cs: string[]) =>
      cs.length === 1 && new RegExp(`^PUT /api/events/${evA}/households/[^/]+$`).test(cs[0]);
    for (const [w, h, mobile] of [
      [390, 844, true],
      [1280, 900, false],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await go(`/plan/${evA}/setup`);
      const before = await members(evA);
      const opened =
        (await openOwnEdit()) === null && (await ev<boolean>(`!!window.__btn('Save changes')`));
      if (!opened) {
        assert('C', `C14 ${w}: her own household opened with Edit`, false);
        continue;
      }
      const kidsAtOpen = await ev<number>(`window.__kids().length`);
      await sixKids(`fail${w}`, {});
      await ev(`window.__failPut = 'http500'`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 1200);
      const f1 = await afterFail();
      const c1 = await calls();
      assert(
        'C',
        `C14 ${w}: "Save changes" answered 500: "${SAVE_FAILED}" shows; still editing with the six new kids as typed (and any saved before); one PUT tried; nothing stored; no "Please fix"; no unhandled rejection`,
        f1.words &&
          f1.editing &&
          f1.kids === kidsAtOpen + 6 &&
          f1.filled &&
          onePut(c1) &&
          (await members(evA)) === before &&
          S(f1.alert) === S([]) &&
          f1.unhandled === 0,
        S({ ...f1, calls: c1 })
      );
      if (w !== 390) {
        await ev(`window.__failPut = null`);
        await tap(`window.__btn('Cancel')`, 500);
        continue;
      }
      await ev(`window.__failPut = 'network'`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 1200);
      const f2 = await afterFail();
      const c2 = await calls();
      assert(
        'C',
        `C15 390: "Save changes" with the network down: the same words; still editing with all six kids; nothing stored; no unhandled rejection`,
        f2.words &&
          f2.editing &&
          f2.kids === kidsAtOpen + 6 &&
          f2.filled &&
          onePut(c2) &&
          (await members(evA)) === before &&
          f2.unhandled === 0,
        S({ ...f2, calls: c2 })
      );
      await ev(`window.__failPut = null`);
      await clearCalls();
      await tap(`window.__btn('Save changes')`, 2500);
      const f3 = await afterFail();
      const c3 = await calls();
      const stored = await prisma.personEvent.findMany({
        where: {
          eventId: evA,
          householdRole: 'CHILD',
          person: { name: { startsWith: 'Kid fail390' } },
        },
        include: { person: true },
      });
      assert(
        'C',
        'C16 390: then pressed again with nothing in the way: one PUT, the six kids stored with email and phone, the words gone, the form closed',
        onePut(c3) &&
          !f3.words &&
          !f3.editing &&
          stored.length === 6 &&
          stored.every((m) => !!m.person.email && !!m.person.phoneNumber),
        S({ words: f3.words, editing: f3.editing, calls: c3, stored: stored.length })
      );
    }

    // ── C12–C13: a "+64 (0)" phone saves right, at 390 (GTC-432) ─────────────────
    await c.setViewport(390, 844, true);
    // Found building GTC-432: an email box (type="email") hands the page its value with the spaces
    // at either end already removed (the browser's own value rule), so on these boxes the form
    // never saw them. C13 records that; T1 holds the trimmed rule itself.
    await go(`/plan/${evA}/setup`);
    const trimmedEmail = `kidtrim-${stamp}@example.com`;
    await ev(`window.__set(document.querySelector('#m1-name'), 'Tia trim')`);
    await tap(`window.__btn('👦 Kid with a job')`, 300);
    await ev(`(() => { const k = window.__kids()[0]; window.__set(k.name, 'Kid trim');
      window.__set(k.email, ${S(trimmedEmail + ' ')}); window.__set(k.phone, '+64 (0)21 000 0021');
      return k.email.value; })()`);
    const emailBoxValue = await ev<string>(`window.__kids()[0].email.value`);
    await clearCalls();
    await tap(`window.__btn('Save & add another household')`, 2000);
    const trimKid = await prisma.person.findFirst({
      where: { name: 'Kid trim', eventMemberships: { some: { eventId: evA } } },
    });
    assert(
      'C',
      'C12 390: a kid with phone "+64 (0)21 000 0021": no "Please fix", one POST; stored as +64210000021 (and the email as typed)',
      S(await ev(`window.__alert()`)) === S([]) &&
        S(await calls()) === S([`POST /api/events/${evA}/households`]) &&
        trimKid?.email === trimmedEmail &&
        trimKid?.phoneNumber === '+64210000021',
      S({
        calls: await calls(),
        email: trimKid?.email === trimmedEmail,
        phone: trimKid?.phoneNumber?.slice(0, 4),
      })
    );
    assert(
      'C',
      'C13 FACT: the email box itself drops a space typed after the address (its value holds none), before the form reads it',
      emailBoxValue === trimmedEmail,
      S(emailBoxValue === trimmedEmail)
    );

    // ── C9–C10: her own household's step, at 390 ──────────────────────────────
    await go(`/plan/${evB}/setup`);
    const started = await tap(`window.__btn('Ready to start herding →')`, 1500);
    const hostStep = await ev<boolean>(`!!window.__btn('Save and add everyone else →')`);
    assert(
      'C',
      'C9 390: an event without her household opens her own household’s step',
      started === null && hostStep
    );
    if (hostStep) {
      await tap(`window.__btn('👦 Kid with a job')`, 300);
      await ev(
        `(() => { const k = window.__kids()[0]; window.__set(k.name, 'Mia HS'); window.__set(k.phone, '+61 412 345 678'); })()`
      );
      await clearCalls();
      await tap(`window.__btn('Save and add everyone else →')`, 600);
      const hs = await stopped();
      assert(
        'C',
        'C10 390: a kid with an Australian number: "Please fix 1 thing above", that phone has focus and is on screen; no POST, nothing stored',
        S(hs.alert) === S([fixWords(1)]) &&
          hs.focusValue === '+61 412 345 678' &&
          hs.inView &&
          (await calls()).length === 0 &&
          (await households(evB)) === 0,
        S(hs)
      );
    }
    assert(
      'C',
      'C11 SAFETY: no click was refused, and Chrome asked for no host but localhost',
      refusals.length === 0 && c.hostsRequested().every((h) => h.startsWith('localhost')),
      S({ refusals, hosts: c.hostsRequested() })
    );
  } catch (e) {
    assert('C', 'C-run the Chrome layer ran to its end', false, String((e as Error).message));
  } finally {
    chrome?.close();
  }

  // People the app made (the kids, Lena) are on the fixture events only; adopt them for removal.
  const onFixture = await prisma.person.findMany({
    where: { id: { notIn: created.people }, eventMemberships: { some: evIn } },
    select: {
      id: true,
      userId: true,
      eventMemberships: { select: { eventId: true } },
      _count: { select: { hostedEvents: true, cohostedEvents: true } },
    },
  });
  for (const p of onFixture) {
    if (
      !p.userId &&
      p._count.hostedEvents === 0 &&
      p._count.cohostedEvents === 0 &&
      p.eventMemberships.every((m) => created.events.includes(m.eventId))
    )
      created.people.push(p.id);
    else console.error('cleanup: left', p.id, '- not only a fixture guest');
  }
  await cleanup();
  const after = await totals();
  assert(
    'Z',
    `Z1 every fixture row removed by id (${whileExists} while it existed), the totals as found (${before.invite}/${before.outbound} -> ${after.invite}/${after.outbound})`,
    (await rows()) === '0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound
  );
}

async function cleanup() {
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  await del(() => prisma.session.deleteMany({ where: { id: { in: created.sessions } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: created.events } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  layerW();
  layerR();
  layerS();
  layerT();
  if (process.env.HOUSEHOLD_SAVE_DRY_RUN !== '1') {
    try {
      await runLive();
    } finally {
      await prisma.$disconnect();
    }
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) {
    console.log('\nRED:');
    for (const r of reds) console.log(`  ${r}`);
  }
  process.exit(failed > 0 ? 1 : 0);
}
main();
