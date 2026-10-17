/**
 * GTC-388 — walkthrough batch 18: the 14 Oct walk's fifth batch, items 64 and 72.
 *
 * Nigel walked the launch code on 2026-10-14 ("Gather Tweaks 2"). This suite pins the two items to
 * his plan rulings (GTC-388, Q1 to Q23 and W1 to W31, and the build-stop rulings Q24 to Q26,
 * 2026-10-16):
 *
 *   64  step 4 of the pre-flight gains "Send me a test email" under the message (Q14): one email to
 *       the presser's OWN account address (Q1, Q24's `viewerEmail`), host or co-host (Q2), holding
 *       the message of the person she is reading as (Q3), composed on the server from the STORED
 *       line (Q5), with both links stand-ins and no unsubscribe header (Q6); refused when her
 *       address is blocked or she turned email off (Q7); three an hour in memory (Q8); a second
 *       request shape on the message route's PATCH (Q9); nothing recorded (Q10); a text is the
 *       text as sent, with no email footer (Q4, Q25)
 *   72  "See menu" and "See assignments" at the front of the board's door row (Q18), two in-page
 *       overlays (Q16, Q22) that read the items route (Q17), hidden on invites-only (Q19), with no
 *       link inside (Q20); "Who’s on what" lists only holders, then what nobody holds (Q21)
 *
 * Layers W, P, S run in memory. E runs the test email in process behind `liveBehindTrap` with a
 * fake key and a Resend stub (nothing leaves the process). H sends the test request over HTTP to the
 * never-live dev server (Q26): 401, 403, and the host's request stopping at the blank key. C drives
 * the dev server in a walled headless Chrome (port 9485) at 1280 and 390: every request that is not
 * a GET fails in the browser, every AI route fails even as a GET, and the test button's request is
 * ANSWERED BY THE BROWSER ITSELF and never reaches the server (Q12). Clicks are scrolled to
 * mid-screen and hit-tested. Send is never pressed. The live conditions are the pure functions
 * between the CHECKS markers, dry-run on a passing and a failing input before RED.
 *
 * GTC388_SHOTS=1 saves pictures to ~/Desktop/GTC-388 built; unset, none are taken.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { homedir, tmpdir } from 'os';
import { spawn, spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { liveBehindTrap, trapCount } from './helpers/provider-trap';

const realFetch = globalThis.fetch;
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9485;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.GTC388_SHOTS === '1';
const SHOT_DIR = join(homedir(), 'Desktop', 'GTC-388 built');

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const unchanged = (rel: string) => git(['diff', '--quiet', 'HEAD', '--', rel]).status === 0;

function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = `${dir}/${f}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
  };
  try {
    walk(rel);
  } catch {
    // an absent directory has no files
  }
  return out;
}

// ─── The ruled words (GTC-388 plan rulings, 2026-10-16; curly in the app, straight in the email) ──
const W2 = (name: string, address: string) =>
  `I’ll email ${name}’s message to you at ${address}, as they’ll get it. Nobody else gets anything.`;
const W3 = (name: string) => `${name} gets this as a text; I’ll email you the same words.`;
const W: Record<number, string> = {
  1: 'Send me a test email',
  4: 'Sending…',
  6: 'I didn’t send it: sending is switched off on this copy of Gather. Test emails go out only from the live Gather.',
  7: 'I couldn’t send it just now. Try again in a minute.',
  8: 'The email service turned it down, so it didn’t go. Try again later.',
  10: 'You’ve turned off email about this event, so I didn’t send it.',
  11: 'You’ve sent yourself three tests in the last hour. Try again later.',
  12: 'Save your line first, so the test shows what they’ll get.',
  13: 'There’s no email address on your account, so I can’t send you a test.',
  14: 'There’s no message to test for them.',
  15: 'The invitations have gone, so there’s nothing to test.',
  19: '[their own link to stop these emails]',
  20: 'See menu',
  21: 'See assignments',
  22: 'The menu',
  23: 'Who’s on what',
  24: 'Getting the list…',
  25: 'That didn’t work. Close this and try again.',
  26: 'Nothing on the menu yet.',
  27: 'Nobody yet',
  29: 'Nobody has anything yet.',
  30: 'Not given to anyone yet',
  31: 'Close',
};
const W5 = (address: string) => `Sent to ${address}. It can take a minute or two to arrive.`;
const W9 = (address: string) => `I can’t email ${address} anymore, so I didn’t send it.`;
const W16 = (subject: string) => `Test: ${subject}`;
const W16T = (name: string) => `Test: the text ${name} will get`;
const W17 = (name: string) =>
  `This is a test, sent only to you. It's the email ${name} will get when you send, word for word, except that their own links are left out.`;
const W17T = (name: string) =>
  `This is a test, sent only to you. It's the text ${name} will get when you send, word for word, except that their own link is left out.`;
const W18 = (name: string) => `[${name}'s own link goes here]`;
const W28 = {
  ACCEPTED: 'said yes',
  PENDING: 'hasn’t answered',
  MAYBE: 'maybe',
  DECLINED: 'said no',
};
const OUTCOMES = [
  'SENT',
  'LIVE_OFF',
  'NOT_SENT',
  'REFUSED',
  'BLOCKED',
  'OPTED_OUT',
  'NO_ADDRESS',
  'TOO_OFTEN',
  'NO_MESSAGE',
  'AFTER_PRESS',
];
const DOOR_ROW = [W[20], W[21], "Change who's on what", 'Invites & people', 'Print the list'];

const WORDS = 'src/lib/preflight/test-email.ts';
const SEND_MODULE = 'src/lib/preflight/test-email-send.ts';
const EMAIL = 'src/lib/email.ts';
const MESSAGE_ROUTE = 'src/app/api/events/[id]/pre-flight/message/route.ts';
const PREFLIGHT_ROUTE = 'src/app/api/events/[id]/pre-flight/route.ts';
const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const BOARD = 'src/components/glance/GlanceBoard.tsx';
const ISLAND = 'src/components/glance/PlanLists.tsx';
const LISTS = 'src/lib/print/plan-lists.ts';

// ── CHECKS ── (pure; dry-run on a passing and a failing input before RED)
const CHECKS = {
  /** Step 4's test block: the button, its line, under the message in part 1, no outcome yet. */
  C_TEST: (f: any, lead: string) =>
    !!f &&
    f.button === 'Send me a test email' &&
    f.disabled === false &&
    f.lead === lead &&
    f.inPart1 === true &&
    f.afterMessage === true &&
    f.outcome === null,
  /** After a press the browser answered: the outcome's line, and the button ready again. */
  C_OUTCOME: (f: any, line: string) =>
    !!f && f.outcome === line && f.button === 'Send me a test email' && f.disabled === false,
  /** Her line has an unsaved change: the button waits and says why (W12). */
  C_WAITS: (f: any) =>
    !!f &&
    f.disabled === true &&
    f.lead === 'Save your line first, so the test shows what they’ll get.' &&
    f.outcome === null,
  /** The board's door row, in order: the two new buttons first, or neither on invites-only. */
  C_DOORS: (f: any, expected: string[]) =>
    !!f && Array.isArray(f.row) && JSON.stringify(f.row) === JSON.stringify(expected),
  /** An open pop-up: its heading, its groups and rows exactly, Close only, no link. */
  C_LIST: (f: any, which: string, heading: string, groups: any) =>
    !!f &&
    f.open === true &&
    f.which === which &&
    f.heading === heading &&
    JSON.stringify(f.groups) === JSON.stringify(groups) &&
    f.links === 0 &&
    JSON.stringify(f.buttons) === '["Close"]' &&
    f.empty === null &&
    f.loading === false &&
    f.failed === null,
  /** An open pop-up showing one line instead of a list (empty, or the read failed). */
  C_LINE: (f: any, which: string, heading: string, kind: 'empty' | 'failed', line: string) =>
    !!f &&
    f.open === true &&
    f.which === which &&
    f.heading === heading &&
    f[kind] === line &&
    f.groups.length === 0 &&
    f.links === 0,
  /** No pop-up is drawn. */
  C_CLOSED: (visible: number) => visible === 0,
  /** Nothing scrolls sideways at a width. */
  C_FITS: (scrollWidth: number, width: number) => scrollWidth > 0 && scrollWidth <= width + 1,
};
// ── END CHECKS ──

// ─── Layers W, P, S: in memory ────────────────────────────────────────────────

async function runInMemory() {
  const T = await load('../src/lib/preflight/test-email');
  const L = await load('../src/lib/print/plan-lists');
  const FOOT = await load('../src/lib/email-footer');
  const tw = T?.TEST_EMAIL_WORDS ?? {};
  const lw = L?.PLAN_LISTS_WORDS ?? {};

  // ── W: every ruled line, byte for byte ──
  assert(
    'W',
    'W1, W4, W12, W13 the button, while sending, the unsaved line, no account address',
    tw.BUTTON === W[1] && tw.SENDING === W[4] && tw.SAVE_FIRST === W[12] && tw.NO_ADDRESS === W[13]
  );
  assert(
    'W',
    'W2 and W3 the line under the button, and the text addition',
    ok(
      () =>
        T.testEmailLead('Mere', 'kate@example.com') === W2('Mere', 'kate@example.com') &&
        T.testEmailTextNote('Tom') === W3('Tom')
    )
  );
  assert(
    'W',
    'W5 to W11, W13 to W15 each outcome’s line, from the one map (10 outcomes, every one with words)',
    ok(() => {
      const a = 'kate@example.com';
      const line = (o: string) => T.testEmailOutcomeLine(o, a);
      return (
        JSON.stringify(T.TEST_EMAIL_OUTCOMES) === JSON.stringify(OUTCOMES) &&
        line('SENT') === W5(a) &&
        line('LIVE_OFF') === W[6] &&
        line('NOT_SENT') === W[7] &&
        line('REFUSED') === W[8] &&
        line('BLOCKED') === W9(a) &&
        line('OPTED_OUT') === W[10] &&
        line('TOO_OFTEN') === W[11] &&
        line('NO_ADDRESS') === W[13] &&
        line('NO_MESSAGE') === W[14] &&
        line('AFTER_PRESS') === W[15]
      );
    })
  );
  assert(
    'W',
    'W16 to W19 the email’s subject, top line and two stand-ins, straight apostrophes',
    ok(
      () =>
        T.testEmailSubject('Lunch — from Kate', 'Mere', false) === W16('Lunch — from Kate') &&
        T.testEmailSubject('Lunch — from Kate', 'Tom', true) === W16T('Tom') &&
        T.testEmailTopLine('Mere', false) === W17('Mere') &&
        T.testEmailTopLine('Tom', true) === W17T('Tom') &&
        T.testLinkStandIn('Mere') === W18('Mere') &&
        T.TEST_STOP_LINK_STAND_IN === W[19]
    )
  );
  assert(
    'W',
    'W20 to W27, W29 to W31 the pop-ups’ words',
    lw.MENU_DOOR === W[20] &&
      lw.ASSIGNMENTS_DOOR === W[21] &&
      lw.MENU_HEADING === W[22] &&
      lw.ASSIGNMENTS_HEADING === W[23] &&
      lw.LOADING === W[24] &&
      lw.FAILED === W[25] &&
      lw.MENU_EMPTY === W[26] &&
      lw.NOBODY === W[27] &&
      lw.ASSIGNMENTS_EMPTY === W[29] &&
      lw.UNHELD === W[30] &&
      lw.CLOSE === W[31]
  );
  assert(
    'W',
    'W28 the four answers beside a holder’s name',
    JSON.stringify(L?.ANSWER_WORDS) === JSON.stringify(W28)
  );

  // ── P: the email, the limit and the two lists, pure ──
  const ask = 'Hi Mere - lovely to have you.\n\nGather here. Could you bring Roast lamb?\n[x] go';
  const em = ok(() => !!T.composeTestEmail)
    ? T.composeTestEmail({ name: 'Mere', texted: false, subject: 'Lunch — from Kate', text: ask })
    : null;
  assert(
    'P',
    'P1 an email test: subject W16, then W17, a blank line, the message, the footer with W19, the contact line last (Q6)',
    !!em &&
      em.subject === W16('Lunch — from Kate') &&
      em.body === `${W17('Mere')}\n\n${ask}\n${FOOT?.guestEmailFooter(W[19])}` &&
      em.body.split('\n').at(-1) === FOOT?.GATHER_CONTACT_LINE &&
      !/\/p\/|\/api\/unsubscribe\//.test(em.body),
    JSON.stringify(em)
  );
  const textAsSent = 'Hi Tom - lovely.\nGather here. Sausages? [x]\nReply STOP to opt out';
  const tx = ok(() => !!T.composeTestEmail)
    ? T.composeTestEmail({ name: 'Tom', texted: true, subject: null, text: textAsSent })
    : null;
  assert(
    'P',
    'P2 a text test (Q25): subject W16’s text form, then W17’s, a blank line, the text exactly as sent, ending Reply STOP, NO email footer and no W19',
    !!tx &&
      tx.subject === W16T('Tom') &&
      tx.body === `${W17T('Tom')}\n\n${textAsSent}` &&
      tx.body.endsWith('Reply STOP to opt out') &&
      !tx.body.includes(W[19]) &&
      !tx.body.includes(FOOT?.GATHER_CONTACT_LINE ?? 'Contact Gather'),
    JSON.stringify(tx)
  );
  const H = 3600e3;
  assert(
    'P',
    'P3 the limit (Q8): three in any hour, the fourth refused, the first ages out an hour on; a time not yet come is not counted',
    ok(
      () =>
        T.TESTS_PER_HOUR === 3 &&
        T.mayTestAgain([], 0) === true &&
        T.mayTestAgain([0, 1, 2], 3) === false &&
        T.mayTestAgain([0, 1], 3) === true &&
        T.mayTestAgain([0, 1, 2], H - 1) === false &&
        T.mayTestAgain([0, 1, 2], H) === true &&
        T.mayTestAgain([5, 6, 7], 4) === true &&
        JSON.stringify(T.testsInWindow([0, 10, H + 5], H + 6)) === JSON.stringify([10, H + 5])
    )
  );

  const raw = [
    {
      id: 'i1',
      name: 'Roast lamb',
      quantityAmount: 2,
      quantityUnit: 'TRAYS',
      team: { name: 'Mains', displayOrder: 1 },
      assignment: { response: 'ACCEPTED', person: { id: 'p1', name: 'Mere Tane' } },
    },
    {
      id: 'i2',
      name: 'Sausages',
      team: { name: 'Mains', displayOrder: 1 },
      assignment: { response: 'PENDING', person: { id: 'p2', name: 'Tom Reid' } },
    },
    {
      id: 'i3',
      name: 'Pavlova',
      team: { name: 'Desserts', displayOrder: 2 },
      assignment: { response: 'MAYBE', person: { id: 'p3', name: 'Nina Rau' } },
    },
    {
      id: 'i4',
      name: 'Fruit salad',
      team: { name: 'Desserts', displayOrder: 2 },
      assignment: null,
    },
    {
      id: 'i5',
      name: 'Juice',
      quantityText: '2 bottles',
      team: { name: 'Drinks', displayOrder: 3 },
      assignment: { response: 'DECLINED', person: { id: 'p2', name: 'Tom Reid' } },
      decideByFollowupSentAt: '2026-10-01T00:00:00Z',
    },
  ];
  const items = ok(() => !!L.toPlanListItems) ? L.toPlanListItems(raw) : null;
  const menu = items ? ok(() => true) && L.menuSections(items) : null;
  assert(
    'P',
    'P4 the menu: sections in the plan’s order, each dish with its amount in words, its holder and answer, or “Nobody yet”',
    JSON.stringify(menu) ===
      JSON.stringify([
        {
          section: 'Mains',
          rows: [
            { name: 'Roast lamb', amount: '2 trays', holder: 'Mere Tane', answer: 'said yes' },
            { name: 'Sausages', amount: null, holder: 'Tom Reid', answer: 'hasn’t answered' },
          ],
        },
        {
          section: 'Desserts',
          rows: [
            { name: 'Pavlova', amount: null, holder: 'Nina Rau', answer: 'maybe' },
            { name: 'Fruit salad', amount: null, holder: null, answer: null },
          ],
        },
        {
          section: 'Drinks',
          rows: [{ name: 'Juice', amount: '2 bottles', holder: 'Tom Reid', answer: 'said no' }],
        },
      ]),
    JSON.stringify(menu)
  );
  const who = items ? L.whoIsOnWhat(items) : null;
  assert(
    'P',
    'P5 who’s on what: holders only, by name, each row with its section and answer; then what nobody holds (Q21)',
    JSON.stringify(who) ===
      JSON.stringify({
        people: [
          {
            name: 'Mere Tane',
            rows: [{ name: 'Roast lamb', amount: '2 trays', section: 'Mains', answer: 'said yes' }],
          },
          {
            name: 'Nina Rau',
            rows: [{ name: 'Pavlova', amount: null, section: 'Desserts', answer: 'maybe' }],
          },
          {
            name: 'Tom Reid',
            rows: [
              { name: 'Sausages', amount: null, section: 'Mains', answer: 'hasn’t answered' },
              { name: 'Juice', amount: '2 bottles', section: 'Drinks', answer: 'said no' },
            ],
          },
        ],
        unheld: [{ name: 'Fruit salad', amount: null, section: 'Desserts' }],
      }),
    JSON.stringify(who)
  );
  assert(
    'P',
    'P6 the rows are cut down at once: nothing of the route’s row but what is shown reaches the lists',
    !!items && items.length === 5 && !JSON.stringify(items).includes('decideByFollowupSentAt')
  );
  assert(
    'P',
    'P7 empty: no items is an empty menu and nobody holding anything',
    ok(() => {
      const e = L.toPlanListItems([]);
      const w = L.whoIsOnWhat(e);
      return L.menuSections(e).length === 0 && w.people.length === 0 && w.unheld.length === 0;
    })
  );

  // ── S: fences ──
  const route = codeOnly(read(MESSAGE_ROUTE));
  const patch = route.slice(route.indexOf('export async function PATCH'));
  assert(
    'S',
    'S1 the message route: GET and PATCH only; the guard first in PATCH, the test shape read after it (Q9)',
    ok(() => {
      const exported = [...route.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
      const g = patch.indexOf("requireEventRole(eventId, ['HOST', 'COHOST'])");
      const t = patch.indexOf('testEmail');
      return JSON.stringify(exported) === '["GET","PATCH"]' && g > 0 && t > g;
    })
  );
  assert(
    'S',
    'S2 (Q11) the route’s one send is the test to her own address: one sendTestEmailFor(, with the guard’s own user; no readAskPreview in PATCH',
    (patch.match(/sendTestEmailFor\(/g) ?? []).length === 1 &&
      /auth\.user\.email/.test(patch) &&
      !/readAskPreview\(/.test(patch) &&
      !/sendSms|sendNudgeEmail|resend|dispatch/i.test(route)
  );
  const email = codeOnly(read(EMAIL));
  const testSender = /export async function sendHostTestEmail[\s\S]*?\n\}/.exec(email)?.[0] ?? '';
  assert(
    'S',
    'S3 the new email function takes no person or event, so it cannot mint a way out: no guestEmailParts, no unsubscribe, no headers (Q6)',
    testSender.length > 0 &&
      /getResendClient\(\)/.test(testSender) &&
      /resultOf\(/.test(testSender) &&
      !/personId|eventId|guestEmailParts|unsubscribe|listUnsubscribeHeaders|withGuestEmailFooter|headers/i.test(
        testSender
      )
  );
  assert(
    'S',
    'S4 the from-address rule is written once, for the guests’ emails and the test alike',
    (email.match(/configured\.match\(/g) ?? []).length === 1 &&
      /function hostVoicedFrom\(/.test(email) &&
      (email.match(/hostVoicedFrom\(/g) ?? []).length === 3
  );
  const mod = codeOnly(read(SEND_MODULE));
  const clientFiles = [
    ...filesUnder('src/components'),
    ...filesUnder('src/app').filter((f) => /page\.tsx$/.test(f)),
    ...filesUnder('src/lib').filter((f) => /^\s*['"]use client['"]/.test(read(f))),
    WORDS,
    LISTS,
  ];
  assert(
    'S',
    'S5 the server module reads through Zone 9’s readers and the screen’s own composer, writes nothing, and no client file imports it',
    mod.length > 0 &&
      /listEmailBlocks\(/.test(mod) &&
      /emailBlockStateOf\(/.test(mod) &&
      /getEmailOptOut\(/.test(mod) &&
      /readAskPreview\(/.test(mod) &&
      /composePreview\(/.test(mod) &&
      /messageRows\(/.test(mod) &&
      /sendHostTestEmail\(/.test(mod) &&
      !/\.(update|updateMany|create|createMany|delete|deleteMany|upsert)\s*\(/.test(mod) &&
      clientFiles.length > 50 &&
      !clientFiles.some((f) => /test-email-send/.test(read(f)))
  );
  assert(
    'S',
    'S6 no second place decides who may be emailed: the module names no chooser and no send of its own',
    mod.length > 0 &&
      !/channel-chooser|chooseAskRoute|askChannelOf|sendAskEmail|sendChaseEmail|sendNudgeEmail|new Resend/.test(
        mod
      )
  );
  const words = codeOnly(read(WORDS));
  assert(
    'S',
    'S7 the words module is client-safe: no database, no email module, no server module',
    words.length > 0 &&
      !/@\/lib\/prisma|@prisma\/client|@\/lib\/email'|test-email-send|@\/lib\/preflight\/ask-preview'/.test(
        words
      )
  );
  const page = codeOnly(read(PAGE));
  const msgFn = page.slice(page.indexOf('function MessageStep'));
  const block = msgFn.indexOf('data-test-email=');
  assert(
    'S',
    'S8 the page: the block sits after the message’s last line and before part 2; it waits on `dirty`; its request is the message route’s PATCH with testEmail; no new heading',
    block > msgFn.indexOf("'Sent by email, so there is no text count.'") &&
      block < msgFn.indexOf('data-message-part="2"') &&
      /disabled=\{dirty \|\| testing/.test(msgFn) &&
      /fetch\(`\/api\/events\/\$\{eventId\}\/pre-flight\/message`[\s\S]{0,200}testEmail/.test(
        msgFn
      ) &&
      (msgFn.match(/<h3 className=/g) ?? []).length === 3 &&
      (page.match(/\/api\/events\/\$\{eventId\}\/send/g) ?? []).length === 1
  );
  const pre = codeOnly(read(PREFLIGHT_ROUTE));
  assert(
    'S',
    'S9 (Q24) the pre-flight read carries the viewer’s OWN address beside viewerId, from the guard’s own user; the guard unchanged',
    /requireEventRole\(eventId, \['HOST', 'COHOST'\]\)/.test(pre) &&
      /viewerId:\s*auth\.user\.id,\s*viewerEmail:\s*auth\.user\.email,/.test(pre) &&
      (pre.match(/viewerEmail/g) ?? []).length === 1
  );
  const board = codeOnly(read(BOARD));
  const row = board.slice(board.indexOf('data-back-room-door') - 900);
  assert(
    'S',
    'S10 the board: one PlanLists, given the event id only, hidden on invites-only, before the plan door; still no hook and no fetch',
    (board.match(/<PlanLists\b/g) ?? []).length === 1 &&
      /\{invitesOnly \? null : \(\s*<PlanLists\s+eventId=\{glance\.eventId\}/.test(board) &&
      row.indexOf('<PlanLists') >= 0 &&
      row.indexOf('<PlanLists') < row.indexOf('data-plan-door') &&
      !/glance=\{/.test(board) &&
      !/\buse[A-Z]\w*\(/.test(board) &&
      !/\bfetch\(/.test(board)
  );
  const island = codeOnly(read(ISLAND));
  assert(
    'S',
    'S11 the island: a client file, one items read, no link, no timer, no refresh, no socket; a dialog drawn only while open, closing on Escape (Q16, Q17, Q20)',
    /^['"]use client['"]/.test(read(ISLAND).trim()) &&
      (island.match(/fetch\(/g) ?? []).length === 1 &&
      /fetch\(`\/api\/events\/\$\{eventId\}\/items`\)/.test(island) &&
      !/<a\b|href=/.test(island) &&
      !/setTimeout|setInterval|router\.refresh|WebSocket|EventSource/.test(island) &&
      /\{open \? \(/.test(island) &&
      /role="dialog"/.test(island) &&
      /aria-modal="true"/.test(island) &&
      /'Escape'/.test(island)
  );
  assert(
    'S',
    'S12 no new word says remind, chase or we',
    [WORDS, LISTS, ISLAND].every((f) => {
      const src = codeOnly(read(f)).replace(/import[^;]+;/g, '');
      return (
        src.length > 0 && !/\b(remind\w*|chas(e|ed|es|ing))\b/i.test(src) && !/\b[Ww]e\b/.test(src)
      );
    })
  );
  const newApi = git(['status', '--porcelain', '--', 'src/app/api'])
    .stdout.split('\n')
    .filter((l) => l.startsWith('??'));
  assert(
    'S',
    'S13 CONTROL: no new route; schema, migrations, the route list, the security suite, Zone 4, the AI, the chooser, the switch and Zones 7 and 9 untouched',
    newApi.length === 0 &&
      unchanged('prisma') &&
      unchanged('route-classifications.json') &&
      unchanged('src/app/api/billing') &&
      unchanged('src/lib/ai') &&
      unchanged('src/lib/eligibility/channel-chooser.ts') &&
      unchanged('src/lib/live-sends.ts') &&
      unchanged('src/lib/sms/opt-out-service.ts') &&
      unchanged('src/lib/eligibility/email-opt-out.ts') &&
      unchanged('src/lib/eligibility/email-block.ts') &&
      unchanged('src/lib/email-footer.ts') &&
      filesUnder('tests')
        .filter((f) => /^tests\/security-/.test(f))
        .every(unchanged),
    newApi.join(',')
  );
}

// ─── The fixture, shared by E, H and C ────────────────────────────────────────

const created = {
  events: [] as string[],
  people: [] as string[],
  users: [] as string[],
  blocks: [] as string[],
};
const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
const mail = (l: string) => `gtc388-${l}-${stamp}@example.com`;
const HOUR = 3600e3;
const digits = String(Math.floor(1000 + Math.random() * 8999));

async function mkUser(label: string, name: string | null) {
  const user = await prisma.user.create({ data: { email: mail(label) } });
  created.users.push(user.id);
  const person = name
    ? await prisma.person.create({ data: { name, email: user.email, userId: user.id } })
    : null;
  if (person) created.people.push(person.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 4 * HOUR) },
  });
  return { user, person, token };
}

type Who = Awaited<ReturnType<typeof mkUser>>;

async function mkEvent(
  label: string,
  host: Who,
  o: { sent?: boolean; invitesOnly?: boolean; cohosts?: Who[] } = {}
) {
  const sentAt = o.sent ? new Date(Date.now() - 2 * HOUR) : null;
  const e = await prisma.event.create({
    data: {
      name: `GTC-388 ${label}`,
      startDate: new Date(Date.now() + 240 * HOUR),
      endDate: new Date(Date.now() + 240 * HOUR),
      hostId: host.person!.id,
      status: 'CONFIRMING',
      sentAt,
    },
  });
  created.events.push(e.id);
  await prisma.eventRole.create({ data: { eventId: e.id, userId: host.user.id, role: 'HOST' } });
  for (const c of o.cohosts ?? [])
    await prisma.eventRole.create({ data: { eventId: e.id, userId: c.user.id, role: 'COHOST' } });
  await prisma.eventSetup.create({
    data: {
      eventId: e.id,
      eventType: 'BBQ',
      planApprovedAt: new Date(Date.now() - 3 * HOUR),
      invitesOnly: o.invitesOnly === true,
    } as any,
  });
  const own = await prisma.household.create({ data: { eventId: e.id } });
  const hpe = await prisma.personEvent.create({
    data: {
      personId: host.person!.id,
      eventId: e.id,
      role: 'HOST',
      householdId: own.id,
      householdRole: 'PRIMARY_CONTACT',
    },
  });
  await prisma.household.update({ where: { id: own.id }, data: { contactPersonEventId: hpe.id } });
  const teams: Record<string, string> = {};
  const team = async (name: string, displayOrder: number) => {
    if (!teams[name])
      teams[name] = (await prisma.team.create({ data: { eventId: e.id, name, displayOrder } })).id;
    return teams[name];
  };
  const add = async (
    name: string,
    a: {
      email?: boolean;
      phone?: string;
      child?: string;
      token?: boolean;
      userId?: string;
      ownEmail?: string;
    } = {}
  ) => {
    const p = await prisma.person.create({
      data: {
        name,
        email:
          a.ownEmail ??
          (a.email ? mail(`${name.split(' ')[0].toLowerCase()}-${label.length}`) : null),
        phoneNumber: a.phone ?? null,
        userId: a.userId ?? null,
      },
    });
    created.people.push(p.id);
    const hh = a.child ?? (await prisma.household.create({ data: { eventId: e.id } })).id;
    const pe = await prisma.personEvent.create({
      data: {
        personId: p.id,
        eventId: e.id,
        role: 'PARTICIPANT',
        householdId: hh,
        householdRole: (a.child ? 'CHILD' : 'PRIMARY_CONTACT') as any,
      },
    });
    if (!a.child)
      await prisma.household.update({ where: { id: hh }, data: { contactPersonEventId: pe.id } });
    if (a.token)
      await prisma.accessToken.create({
        data: {
          token: `b18-${p.id}-${stamp}`,
          scope: 'PARTICIPANT',
          eventId: e.id,
          personId: p.id,
        },
      });
    return { p, pe, hh };
  };
  const item = async (
    section: string,
    order: number,
    name: string,
    holder: string | null,
    response: string,
    q: any = {}
  ) => {
    const it = await prisma.item.create({
      data: { teamId: await team(section, order), name, kind: 'ITEM', ...q },
    });
    if (holder)
      await prisma.assignment.create({
        data: { itemId: it.id, personId: holder, response: response as any },
      });
    return it;
  };
  return { e, add, item, sentAt };
}

/** The rows the test must never write, counted by event while the fixture exists. */
async function rowsOf(eventIds: string[], addresses: string[]) {
  const evIn = { eventId: { in: eventIds } };
  const pes = await prisma.personEvent.findMany({
    where: evIn,
    select: { id: true, sentAt: true },
    orderBy: { id: 'asc' },
  });
  const evs = await prisma.event.findMany({
    where: { id: { in: eventIds } },
    select: { id: true, sentAt: true, status: true, askAuthorLine: true },
    orderBy: { id: 'asc' },
  });
  return JSON.stringify({
    outbound: await prisma.outboundMessage.count({ where: evIn }),
    invite: await prisma.inviteEvent.count({ where: evIn }),
    tokens: await prisma.accessToken.count({ where: evIn }),
    ledger: await prisma.auditEntry.count({ where: evIn }),
    optOuts: await prisma.emailOptOut.count({ where: evIn }),
    blocks: await prisma.emailBlock.count({ where: { address: { in: addresses } } }),
    pes,
    evs,
  });
}

// ─── Layer E: the test email in process, behind the trap ──────────────────────

type Sent = {
  to: string[];
  from: string;
  replyTo: any;
  subject: string;
  text: string;
  headers: any;
};
let sent: Sent[] = [];
let rejectNext = false;
let nonResend = 0;
function stub() {
  globalThis.fetch = (async (url: unknown, init?: { body?: string }) => {
    const u = String(url);
    if (u.includes('resend')) {
      const body = JSON.parse(init?.body ?? '{}');
      if (rejectNext) {
        rejectNext = false;
        return new Response(
          JSON.stringify({ name: 'validation_error', message: 'fixture refusal', statusCode: 422 }),
          { status: 422, headers: { 'Content-Type': 'application/json' } }
        );
      }
      sent.push({
        to: [body.to ?? []].flat(),
        from: body.from,
        replyTo: body.reply_to ?? body.replyTo,
        subject: body.subject,
        text: body.text,
        headers: body.headers,
      });
      return new Response(JSON.stringify({ id: `gtc388-${sent.length}` }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    nonResend++;
    return new Response('{}', { status: 500 });
  }) as typeof fetch;
}

async function runInProcess() {
  const closeGate = liveBehindTrap();
  const keyBefore = process.env.RESEND_API_KEY;
  process.env.NEXT_PUBLIC_APP_URL = BASE;
  process.env.EMAIL_FROM = 'Gather <gather@example.test>';
  delete process.env.RESEND_API_KEY;
  stub();
  const S = await load('../src/lib/preflight/test-email-send');
  const AP = await load('../src/lib/preflight/ask-preview');
  const AC = await load('../src/lib/preflight/ask-preview-compose');
  const FOOT = await load('../src/lib/email-footer');

  const kate = await mkUser('e-kate', 'Kate Host');
  const cora = await mkUser('e-cora', null);
  const bea = await mkUser('e-bea', null);
  const olly = await mkUser('e-olly', null);
  const stan = await mkUser('e-stan', null);
  const P = await mkEvent('e pre-flight', kate, { cohosts: [cora, bea, olly] });
  const mere = await P.add('Mere Tane', { email: true, token: true });
  const tom = await P.add('Tom Reid', {
    phone: `+6421${digits}${digits.slice(0, 3)}`,
    token: true,
  });
  const pip = await P.add('Pip Tane', { child: mere.hh });
  const ollyP = await P.add('Olly Grey', { ownEmail: olly.user.email, userId: olly.user.id });
  await P.item('Mains', 1, 'Roast lamb', mere.p.id, 'PENDING');
  await P.item('Mains', 1, 'Sausages', tom.p.id, 'PENDING');
  await P.item('Mains', 1, 'Fairy bread', pip.p.id, 'PENDING');
  await prisma.emailOptOut.create({ data: { personId: ollyP.p.id, eventId: P.e.id } });
  const blk = await prisma.emailBlock.create({
    data: { address: bea.user.email, reason: 'BOUNCED' },
  });
  created.blocks.push(blk.id);
  const Sx = await mkEvent('e sent', kate, { sent: true });
  const nina = await Sx.add('Nina Rau', { email: true, token: true });
  const hostPe = await prisma.personEvent.findFirst({
    where: { eventId: P.e.id, personId: kate.person!.id },
  });
  const addresses = [kate.user.email, cora.user.email, bea.user.email, olly.user.email];
  const events = [P.e.id, Sx.e.id];
  const before = await rowsOf(events, addresses);

  const preview = AP ? await AP.readAskPreview(prisma, P.e.id, BASE).catch(() => null) : null;
  const rows = preview && AC ? AC.composePreview(preview, preview.storedAuthorLine).rows : [];
  const mereRow = rows.find((r: any) => r.recipient.personEventId === mere.pe.id);
  const tomRow = rows.find((r: any) => r.recipient.personEventId === tom.pe.id);
  assert(
    'E',
    'E0 PRECONDITION: Mere is emailed and Tom texted, each with a REAL guest link on screen (correction 4)',
    mereRow?.recipient.channel === 'EMAIL' &&
      mereRow?.recipient.linkState === 'READY' &&
      /\/p\//.test(mereRow?.ask.text ?? '') &&
      tomRow?.recipient.channel === 'TEXT' &&
      tomRow?.recipient.linkState === 'READY',
    JSON.stringify({ m: mereRow?.recipient.channel, t: tomRow?.recipient.channel })
  );
  const t0 = Date.now();
  let clock = t0;
  const press = async (who: Who, personEventId: string, at?: number, eventId = P.e.id) => {
    clock = at ?? clock + 2 * HOUR;
    if (!S) return null;
    return S.sendTestEmailFor(
      prisma,
      {
        eventId,
        personEventId,
        viewer: { id: who.user.id, email: who.user.email },
        baseUrl: BASE,
      },
      { now: clock }
    ).catch((e: Error) => `threw ${e.message}`);
  };

  // E1 — no key: the client is built first and throws; nothing is attempted.
  const e1 = await press(kate, mere.pe.id);
  assert(
    'E',
    'E1 no email key: NOT_SENT, and Resend is never called (the key is read before the switch)',
    e1 === 'NOT_SENT' && sent.length === 0,
    String(e1)
  );
  process.env.RESEND_API_KEY = 're_gtc388_sentinel_key_000000000000';
  // E2 — the switch shut, a key present: LIVE_OFF, nothing attempted.
  closeGate();
  const e2 = await press(kate, mere.pe.id);
  const reopen = liveBehindTrap();
  assert(
    'E',
    'E2 the live switch off (a key present): LIVE_OFF, Resend never called, no trap hit',
    e2 === 'LIVE_OFF' && sent.length === 0 && trapCount() === 0,
    String(e2)
  );
  // E3 — sent, an emailed guest's message, to the host's own address.
  const e3 = await press(kate, mere.pe.id);
  const m = sent[0];
  const realLink = mereRow?.recipient.link ?? '(none)';
  const expectedBody =
    mereRow && FOOT
      ? `${W17('Mere')}\n\n${mereRow.ask.text.split(realLink).join(W18('Mere'))}\n${FOOT.guestEmailFooter(W[19])}`
      : '(none)';
  assert(
    'E',
    'E3 SENT: one request, to her own address, from the host’s name on Gather’s address, replies to the host, subject W16',
    e3 === 'SENT' &&
      sent.length === 1 &&
      JSON.stringify(m?.to) === JSON.stringify([kate.user.email]) &&
      m?.from === 'Kate Host <gather@example.test>' &&
      m?.replyTo === kate.user.email &&
      m?.subject === W16(mereRow?.ask.subject ?? '?'),
    JSON.stringify({ e3, m: m && { ...m, text: undefined } })
  );
  assert(
    'E',
    'E4 its body is the send’s own composition with the link swapped: W17, a blank line, the message with W18 in the link’s place, the footer with W19, the contact line last',
    !!m && m.text === expectedBody && m.text.split('\n').at(-1) === FOOT?.GATHER_CONTACT_LINE,
    m?.text
  );
  assert(
    'E',
    'E5 nothing in it can answer for a guest or opt anyone out: no /p/, no /api/unsubscribe/, not the real link, no List-Unsubscribe header (Q6)',
    !!m &&
      !/\/p\/|\/api\/unsubscribe\//.test(m.text) &&
      !m.text.includes(realLink) &&
      !JSON.stringify(m.headers ?? {}).includes('List-Unsubscribe'),
    JSON.stringify(m?.headers)
  );
  // E6 — a co-host presses: it goes to HER address; from and reply-to are still the host's.
  const e6 = await press(cora, mere.pe.id);
  const c6 = sent[1];
  assert(
    'E',
    'E6 a co-host presses (Q1, Q2): to the co-host’s own address, never the host’s; from and reply-to still the host’s',
    e6 === 'SENT' &&
      JSON.stringify(c6?.to) === JSON.stringify([cora.user.email]) &&
      c6?.from === 'Kate Host <gather@example.test>' &&
      c6?.replyTo === kate.user.email,
    JSON.stringify({ e6, to: c6?.to })
  );
  // E7 — a texted guest (Q4, Q25): the text as sent, no footer.
  const e7 = await press(kate, tom.pe.id);
  const t7 = sent[2];
  const tomLink = tomRow?.recipient.link ?? '(none)';
  const textBody = tomRow
    ? `${W17T('Tom')}\n\n${tomRow.textAsSent.split(tomLink).join(W18('Tom'))}`
    : '';
  assert(
    'E',
    'E7 a texted guest (Q4, Q25): subject W16’s text form; W17’s text form, a blank line, the text as sent with W18, ending Reply STOP; no footer',
    e7 === 'SENT' &&
      t7?.subject === W16T('Tom') &&
      t7?.text === textBody &&
      t7.text.endsWith('Reply STOP to opt out') &&
      !t7.text.includes(W[19]) &&
      !/\/p\//.test(t7.text),
    JSON.stringify({ e7, t: t7?.text })
  );
  // E8 — the provider refuses.
  rejectNext = true;
  const e8 = await press(kate, mere.pe.id);
  assert('E', 'E8 the provider refuses (422): REFUSED', e8 === 'REFUSED', String(e8));
  // E9 — every refusal is decided before anything is sent.
  const n9 = sent.length;
  const r9 = {
    after: await press(kate, nina.pe.id, undefined, Sx.e.id),
    child: await press(kate, pip.pe.id),
    host: hostPe ? await press(kate, hostPe.id) : 'no host pe',
    other: await press(kate, nina.pe.id),
    blocked: await press(bea, mere.pe.id),
    optedOut: await press(olly, mere.pe.id),
    noAddress: S
      ? await S.sendTestEmailFor(
          prisma,
          {
            eventId: P.e.id,
            personEventId: mere.pe.id,
            viewer: { id: stan.user.id, email: '' },
            baseUrl: BASE,
          },
          { now: (clock += 2 * HOUR) }
        ).catch(() => 'threw')
      : null,
  };
  assert(
    'E',
    'E9 refusals, none sent: after the press AFTER_PRESS; a child, the host, another event’s guest NO_MESSAGE; blocked BLOCKED; opted out OPTED_OUT; no address NO_ADDRESS',
    r9.after === 'AFTER_PRESS' &&
      r9.child === 'NO_MESSAGE' &&
      r9.host === 'NO_MESSAGE' &&
      r9.other === 'NO_MESSAGE' &&
      r9.blocked === 'BLOCKED' &&
      r9.optedOut === 'OPTED_OUT' &&
      r9.noAddress === 'NO_ADDRESS' &&
      sent.length === n9,
    JSON.stringify(r9)
  );
  // E10 — the limit: three in an hour, the fourth refused before sending, the first ages out.
  const T = clock + 10 * HOUR;
  const lim = [
    await press(kate, mere.pe.id, T),
    await press(kate, mere.pe.id, T + 60e3),
    await press(kate, tom.pe.id, T + 120e3),
  ];
  const n10 = sent.length;
  const fourth = await press(kate, mere.pe.id, T + 180e3);
  const sentAfterFourth = sent.length;
  const cohostMeanwhile = await press(cora, mere.pe.id, T + 190e3);
  const aged = await press(kate, mere.pe.id, T + HOUR + 1);
  assert(
    'E',
    'E10 the limit (Q8): three tests in an hour SENT, the fourth TOO_OFTEN with nothing sent, another presser unaffected, and an hour after the first it goes again',
    JSON.stringify(lim) === '["SENT","SENT","SENT"]' &&
      fourth === 'TOO_OFTEN' &&
      sentAfterFourth === n10 &&
      cohostMeanwhile === 'SENT' &&
      aged === 'SENT',
    JSON.stringify({ lim, fourth, cohostMeanwhile, aged })
  );
  const after = await rowsOf(events, addresses);
  assert(
    'E',
    'E11 it writes NOTHING (Q10): no message row, invite event, token, ledger line, opt-out or block; no send clock, status or line changed',
    before === after,
    `${before} → ${after}`
  );
  assert(
    'E',
    'E12 NOTHING LEFT THE PROCESS: no trap hit, and no request but the stubbed Resend ones',
    trapCount() === 0 && nonResend === 0,
    `trap ${trapCount()}, other ${nonResend}`
  );
  reopen();
  globalThis.fetch = realFetch;
  if (keyBefore === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = keyBefore;
  return { kate, cora, stan, P, mere, hostPe, events, addresses };
}

// ─── Layer H: over HTTP to the never-live dev server (Q26) ────────────────────

async function runHttp(fx: Awaited<ReturnType<typeof runInProcess>>) {
  const call = (path: string, token: string | null, method = 'GET', body?: unknown) =>
    realFetch(`${BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Cookie: `session=${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
      .then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }))
      .catch(() => ({ status: 0, body: null as any }));
  const msg = `/api/events/${fx.P.e.id}/pre-flight/message`;
  const shape = { testEmail: { personEventId: fx.mere.pe.id } };
  const before = await rowsOf(fx.events, fx.addresses);
  const h1 = await call(msg, null, 'PATCH', shape);
  const h2 = await call(msg, fx.stan.token, 'PATCH', shape);
  assert(
    'H',
    'H1 the test shape with no session is 401, and from a stranger 403 — the guard is first and unchanged',
    h1.status === 401 && h2.status === 403,
    `${h1.status} ${h2.status}`
  );
  const h3 = await call(msg, fx.kate.token, 'PATCH', shape);
  assert(
    'H',
    'H2 the host’s request on the never-live dev server stops at the blank key: 200 { outcome: NOT_SENT }',
    h3.status === 200 && h3.body?.outcome === 'NOT_SENT',
    JSON.stringify(h3)
  );
  const h4a = await call(msg, fx.kate.token, 'PATCH', {});
  const h4b = await call(msg, fx.kate.token, 'PATCH', { testEmail: {} });
  assert(
    'H',
    'H3 CONTROL: {} is still 400, and a test shape with no person is 400',
    h4a.status === 400 && h4b.status === 400,
    `${h4a.status} ${h4b.status}`
  );
  const h5 = await call(msg, fx.kate.token, 'PATCH', { askAuthorLine: '  Hello all  ' });
  const h5back = await call(msg, fx.kate.token, 'PATCH', { askAuthorLine: null });
  assert(
    'H',
    'H4 CONTROL: her line still saves through the same PATCH (trimmed), and goes back to the draft',
    h5.status === 200 &&
      h5.body?.storedAuthorLine === 'Hello all' &&
      h5back.status === 200 &&
      h5back.body?.storedAuthorLine === null,
    `${JSON.stringify(h5)} ${JSON.stringify(h5back)}`
  );
  const after = await rowsOf(fx.events, fx.addresses);
  assert(
    'H',
    'H5 the HTTP layer wrote nothing the test may not write',
    before === after,
    `${before} → ${after}`
  );
  const pre = `/api/events/${fx.P.e.id}/pre-flight`;
  const v1 = await call(pre, fx.kate.token);
  const v2 = await call(pre, fx.cora.token);
  const v3 = await call(pre, null);
  const v4 = await call(pre, fx.stan.token);
  assert(
    'H',
    'H6 (Q24) the pre-flight read carries the viewer’s OWN address: the host hers, the co-host hers, never the other’s; no session 401 and a stranger 403, with no address in either',
    v1.status === 200 &&
      v1.body?.viewerEmail === fx.kate.user.email &&
      v2.status === 200 &&
      v2.body?.viewerEmail === fx.cora.user.email &&
      v3.status === 401 &&
      v4.status === 403 &&
      !JSON.stringify(v3.body).includes('@') &&
      !JSON.stringify(v4.body).includes('@'),
    JSON.stringify({
      v1: v1.body?.viewerEmail,
      v2: v2.body?.viewerEmail,
      v3: v3.status,
      v4: v4.status,
    })
  );
}

// ─── Layer C: in the browser ──────────────────────────────────────────────────

const AI_RE =
  /finalize-plan|regenerate-plan|\/generate(\?|$)|\/regenerate(\?|$)|suggest-resolution/;

/**
 * A headless Chrome with this suite's own wall. Every GET goes through but the AI routes and any
 * items read the suite asks to fail; every other request fails in the browser, except the test
 * button's PATCH, which the BROWSER ANSWERS ITSELF with the outcome the suite set (Q12): it is
 * fulfilled here and never continued, so it never reaches the server.
 */
async function openWalled() {
  const profile = mkdtempSync(join(tmpdir(), 'gtc388-b18-'));
  const chrome = spawn(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    [
      '--headless=new',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      '--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost',
      '--no-first-run',
      '--disable-extensions',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  let targets: any[] = [];
  for (let i = 0; i < 75 && targets.length === 0; i++) {
    try {
      targets = await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(200);
    }
  }
  const page = targets.find((t) => t.type === 'page');
  if (!page) {
    chrome.kill();
    throw new Error('headless Chrome did not start');
  }
  const ws = new (globalThis as any).WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const failedReq: string[] = [];
  const continuedNonGet: string[] = [];
  const answered: string[] = [];
  const dialogs: string[] = [];
  const wall = { answer: 'SENT', failItemsFor: '' as string };
  const send = (method: string, params: any = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const raw = (method: string, params: any) =>
    ws.send(JSON.stringify({ id: ++id, method, params }));
  ws.addEventListener('message', (e: any) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Fetch.requestPaused') {
      const { method, url, postData } = m.params.request;
      const rid = m.params.requestId;
      const testPress =
        method === 'PATCH' &&
        /\/pre-flight\/message$/.test(url) &&
        /"testEmail"/.test(postData ?? '');
      if (testPress) {
        answered.push(`${method} ${url} → ${wall.answer}`);
        raw('Fetch.fulfillRequest', {
          requestId: rid,
          responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify({ outcome: wall.answer })).toString('base64'),
        });
        return;
      }
      const failItems =
        !!wall.failItemsFor && url.endsWith(`/api/events/${wall.failItemsFor}/items`);
      const go = method === 'GET' && !AI_RE.test(url) && !failItems;
      if (!go) failedReq.push(`${method} ${url}`);
      else if (method !== 'GET') continuedNonGet.push(`${method} ${url}`);
      raw(
        go ? 'Fetch.continueRequest' : 'Fetch.failRequest',
        go ? { requestId: rid } : { requestId: rid, errorReason: 'BlockedByClient' }
      );
    }
    if (m.method === 'Page.javascriptDialogOpening') {
      dialogs.push(m.params.type);
      raw('Page.handleJavaScriptDialog', { accept: m.params.type === 'beforeunload' });
    }
  });
  await send('Page.enable');
  await send('Network.enable');
  await send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  const ev = async <T = any,>(expression: string): Promise<T> =>
    (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result
      ?.result?.value as T;
  const refusals: string[] = [];
  return {
    ev,
    wall,
    failedReq,
    continuedNonGet,
    answered,
    dialogs,
    refusals,
    async viewport(width: number, height: number, mobile: boolean) {
      await send('Emulation.setDeviceMetricsOverride', {
        width,
        height,
        deviceScaleFactor: 1,
        mobile,
      });
    },
    async cookie(token: string) {
      await send('Network.setCookie', {
        name: 'session',
        value: token,
        domain: 'localhost',
        path: '/',
      });
    },
    async navigate(path: string, settle = 6000) {
      await send('Page.navigate', { url: `${BASE}${path}` });
      await sleep(settle);
    },
    /**
     * Scrolled to mid-screen and hit-tested; a control whose words press, send, hold or generate
     * is refused — except the test button, and only while the wall answers its request (Q12).
     */
    async tap(selector: string, settle = 600, testButton = false) {
      const at =
        await ev<any>(`(() => { const t = document.querySelector(${JSON.stringify(selector)}); if (!t) return { why: 'no target' };
        const allowed = ${testButton ? 'true' : 'false'} && t.hasAttribute('data-test-email-button');
        if (!allowed && /\\b(generate|regenerate|new event|hold|send|press|move on)\\b/i.test(t.innerText || '')) return { why: 'refused by its words' };
        t.scrollIntoView({ block: 'center', inline: 'nearest' });
        const r = t.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
        const hit = document.elementFromPoint(x, y);
        return hit && t.contains(hit) ? { x, y } : { why: 'the point is not inside the target' }; })()`);
      if (!at || at.why) {
        refusals.push(`${selector}: ${at?.why}`);
        return at?.why ?? 'no answer';
      }
      await this.click(at.x, at.y);
      await sleep(settle);
      return null;
    },
    /** A tap outside the pop-up: a point near the corner, hit-tested to be the backdrop itself. */
    async tapOutside(selector: string, settle = 600) {
      const at =
        await ev<any>(`(() => { const t = document.querySelector(${JSON.stringify(selector)}); if (!t) return { why: 'no target' };
        const hit = document.elementFromPoint(8, 8);
        return hit === t ? { x: 8, y: 8 } : { why: 'the corner is not the backdrop' }; })()`);
      if (!at || at.why) {
        refusals.push(`${selector}: ${at?.why}`);
        return at?.why ?? 'no answer';
      }
      await this.click(at.x, at.y);
      await sleep(settle);
      return null;
    },
    async click(x: number, y: number) {
      for (const type of ['mousePressed', 'mouseReleased'])
        await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    },
    async key(key: string, code: number) {
      for (const type of ['keyDown', 'keyUp'])
        await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: code });
      await sleep(400);
    },
    async type(text: string) {
      await send('Input.insertText', { text });
      await sleep(250);
    },
    async shot(file: string) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    },
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
      chrome.kill();
      setTimeout(() => {
        try {
          rmSync(profile, { recursive: true, force: true });
        } catch {
          // the profile is in the OS temp directory
        }
      }, 1500);
    },
  };
}

/** Step 4's test block, as facts. */
const TEST_FACTS = `(() => { const b = document.querySelector('#step-4 [data-test-email]'); if (!b) return null;
  const btn = b.querySelector('[data-test-email-button]'); const part1 = document.querySelector('#step-4 section[data-message-part="1"]');
  const msgs = part1 ? [...part1.querySelectorAll('.whitespace-pre-wrap')] : []; const last = msgs[msgs.length - 1];
  return { button: btn ? btn.textContent.trim() : null, disabled: btn ? btn.disabled : null,
    lead: b.querySelector('[data-test-email-lead]')?.textContent.trim() ?? null,
    outcome: b.querySelector('[data-test-email-outcome]')?.textContent.trim() ?? null,
    inPart1: !!part1 && part1.contains(b),
    afterMessage: !!last && !!(last.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) }; })()`;
/** The board's door row: the buttons and links beside "Invites & people", in order. */
const DOOR_FACTS = `(() => { const r = document.querySelector('[data-back-room-door]')?.parentElement; if (!r) return null;
  return { row: [...r.querySelectorAll(':scope > a, :scope > button')].map((x) => x.textContent.trim()) }; })()`;
/** The open pop-up, as facts. */
const LIST_FACTS = `(() => { const d = [...document.querySelectorAll('[role="dialog"][data-plan-list]')].find((x) => x.checkVisibility()); if (!d) return { open: false };
  const t = (el, s) => el.querySelector(s)?.textContent.trim() ?? null;
  const which = d.getAttribute('data-plan-list');
  const groups = which === 'menu'
    ? [...d.querySelectorAll('[data-plan-section]')].map((s) => ({ section: t(s, '[data-plan-group-name]'),
        rows: [...s.querySelectorAll('[data-plan-row]')].map((r) => ({ name: t(r, '[data-plan-row-name]'), amount: t(r, '[data-plan-row-amount]'), who: t(r, '[data-plan-row-who]') })) }))
    : [...d.querySelectorAll('[data-plan-person], [data-plan-unheld]')].map((s) => ({ person: t(s, '[data-plan-group-name]'),
        rows: [...s.querySelectorAll('[data-plan-row]')].map((r) => ({ name: t(r, '[data-plan-row-name]'), amount: t(r, '[data-plan-row-amount]'), who: t(r, '[data-plan-row-who]') })) }));
  return { open: true, which, heading: t(d, '[data-plan-list-heading]'), groups,
    links: d.querySelectorAll('a').length, buttons: [...d.querySelectorAll('button')].map((b) => b.getAttribute('aria-label') ?? b.textContent.trim()),
    empty: t(d, '[data-plan-empty]'), loading: !!d.querySelector('[data-plan-loading]'), failed: t(d, '[data-plan-failed]') }; })()`;
const VISIBLE_DIALOGS = `[...document.querySelectorAll('[role="dialog"]')].filter((d) => d.checkVisibility()).length`;
const LIST_DRAWN = `(() => { const d = [...document.querySelectorAll('[role="dialog"][data-plan-list]')].find((x) => x.checkVisibility()); return !!d && !d.querySelector('[data-plan-loading]'); })()`;
const STEP4_DRAWN = `!!document.querySelector('#step-4 [data-message-part="1"] select')`;

/** Wait for something to draw, up to `ms`; one that never draws is reported, loudly. */
async function waitFor(
  ev: <T = any>(expression: string) => Promise<T>,
  expression: string,
  what: string,
  refusals: string[],
  ms = 10_000
): Promise<boolean> {
  for (let t = 0; t <= ms; t += 250) {
    if ((await ev<boolean>(expression)) === true) return true;
    await sleep(250);
  }
  refusals.push(`${what}: never drew in ${ms / 1000} s`);
  console.error(`    ${what}: never drew in ${ms / 1000} s`);
  return false;
}

// The totals the whole suite must leave as it found them, taken before any fixture is made.
const totals = async () => ({
  invite: await prisma.inviteEvent.count(),
  outbound: await prisma.outboundMessage.count(),
  tokens: await prisma.accessToken.count(),
  ledger: await prisma.auditEntry.count(),
  optOuts: await prisma.emailOptOut.count(),
  blocks: await prisma.emailBlock.count(),
  people: await prisma.person.count(),
  users: await prisma.user.count(),
  sessions: await prisma.session.count(),
  events: await prisma.event.count(),
});
let suiteStart: Awaited<ReturnType<typeof totals>> | null = null;

async function runLive() {
  const up = await realFetch(`${BASE}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const kate = await mkUser('c-kate', 'Kate Look');
  const cora = await mkUser('c-cora', 'Cora Look');
  // The pre-flight: Mere and Nina by email, Tom by text, each with a link.
  const P = await mkEvent('pre-flight look', kate, { cohosts: [cora] });
  const mere = await P.add('Mere Tane', { email: true, token: true });
  const tom = await P.add('Tom Reid', {
    phone: `+6422${digits}${digits.slice(1, 4)}`,
    token: true,
  });
  const nina = await P.add('Nina Rau', { email: true, token: true });
  await P.item('Mains', 1, 'Roast lamb', mere.p.id, 'PENDING');
  await P.item('Mains', 1, 'Sausages', tom.p.id, 'PENDING');
  await P.item('Desserts', 2, 'Pavlova', nina.p.id, 'PENDING');
  // The board: holders with each answer, a dish nobody has, three sections.
  const B = await mkEvent('board look', kate, { sent: true, cohosts: [cora] });
  const bm = await B.add('Mere Tane', { email: true, token: true });
  const bt = await B.add('Tom Reid', { email: true, token: true });
  const bn = await B.add('Nina Rau', { email: true, token: true });
  await B.item('Mains', 1, 'Roast lamb', bm.p.id, 'ACCEPTED', {
    quantityAmount: 2,
    quantityUnit: 'TRAYS',
  });
  await B.item('Mains', 1, 'Sausages', bt.p.id, 'PENDING');
  await B.item('Desserts', 2, 'Pavlova', bn.p.id, 'MAYBE');
  await B.item('Desserts', 2, 'Fruit salad', null, 'PENDING');
  await B.item('Drinks', 3, 'Juice', bt.p.id, 'DECLINED', { quantityText: '2 bottles' });
  // An empty plan, and an invites-only board.
  const E = await mkEvent('empty look', kate, { sent: true });
  await E.add('Mere Tane', { email: true, token: true });
  const I = await mkEvent('invites-only look', kate, { sent: true, invitesOnly: true });
  await I.add('Mere Tane', { email: true, token: true });

  const MENU = [
    {
      section: 'Mains',
      rows: [
        { name: 'Roast lamb', amount: '2 trays', who: 'Mere Tane · said yes' },
        { name: 'Sausages', amount: null, who: 'Tom Reid · hasn’t answered' },
      ],
    },
    {
      section: 'Desserts',
      rows: [
        { name: 'Pavlova', amount: null, who: 'Nina Rau · maybe' },
        { name: 'Fruit salad', amount: null, who: 'Nobody yet' },
      ],
    },
    {
      section: 'Drinks',
      rows: [{ name: 'Juice', amount: '2 bottles', who: 'Tom Reid · said no' }],
    },
  ];
  const WHO = [
    {
      person: 'Mere Tane',
      rows: [{ name: 'Roast lamb', amount: '2 trays', who: 'Mains · said yes' }],
    },
    { person: 'Nina Rau', rows: [{ name: 'Pavlova', amount: null, who: 'Desserts · maybe' }] },
    {
      person: 'Tom Reid',
      rows: [
        { name: 'Sausages', amount: null, who: 'Mains · hasn’t answered' },
        { name: 'Juice', amount: '2 bottles', who: 'Drinks · said no' },
      ],
    },
    {
      person: 'Not given to anyone yet',
      rows: [{ name: 'Fruit salad', amount: null, who: 'Desserts' }],
    },
  ];
  const liveEvents = [P.e.id, B.e.id, E.e.id, I.e.id];
  const liveAddresses = [kate.user.email, cora.user.email];
  const rowsBefore = await rowsOf(liveEvents, liveAddresses);

  let c: Awaited<ReturnType<typeof openWalled>> | null = null;
  const r: Record<string, boolean> = {};
  const detail: Record<string, string> = {};
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  try {
    c = await openWalled();
    const b = c;
    await b.navigate('/', 3000);
    const probes = await b.ev<string[]>(`Promise.all([
      fetch('/api/gtc388-probe', { method: 'POST' }).then(() => 'reached', () => 'failed'),
      fetch('/api/events/gtc388-probe/finalize-plan').then(() => 'reached', () => 'failed'),
      fetch('/api/events/gtc388-probe/send', { method: 'POST' }).then(() => 'reached', () => 'failed'),
      fetch('/api/events/gtc388-probe/pre-flight/message', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ testEmail: { personEventId: 'probe' } }) }).then((x) => x.json()).then((j) => 'answered ' + j.outcome, () => 'failed')])`);
    assert(
      'C',
      'C0 PRECONDITION: the wall proven: a POST probe, an AI route by GET and a send probe fail in the browser; a test-email probe is answered BY THE BROWSER (SENT) and never reaches the server',
      JSON.stringify(probes) === '["failed","failed","failed","answered SENT"]',
      JSON.stringify(probes)
    );
    if (JSON.stringify(probes) !== '["failed","failed","failed","answered SENT"]') return;
    const shot = async (name: string, sel?: string) => {
      if (!SHOTS) return;
      if (sel)
        await b.ev(
          `document.querySelector(${JSON.stringify(sel)})?.scrollIntoView({ block: 'center' })`
        );
      await sleep(250);
      await b.shot(join(SHOT_DIR, name));
    };
    const fits = async (w: number) =>
      CHECKS.C_FITS(await b.ev<number>('document.documentElement.scrollWidth'), w);
    const pick = (pe: string) =>
      b.ev(
        `(() => { const s = document.querySelector('#step-4 [data-message-part="1"] select'); if (!s) return false; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, ${JSON.stringify(pe)}); s.dispatchEvent(new Event('change', { bubbles: true })); return true; })()`
      );
    const openStep4 = async () => {
      await b.tap('#step-4 header button[aria-expanded]', 2500);
      return waitFor(b.ev, STEP4_DRAWN, 'step 4', b.refusals);
    };
    const press = async (answer: string) => {
      b.wall.answer = answer;
      await b.tap('#step-4 [data-test-email-button]', 1500, true);
      return b.ev(TEST_FACTS);
    };

    for (const [w, h, mobile] of [
      [1280, 900, false],
      [390, 844, true],
    ] as const) {
      await b.viewport(w, h, mobile);
      const k = w === 390 ? 'p' : '';

      // ── item 64, step 4, as the host ──
      await b.cookie(kate.token);
      await b.navigate(`/plan/${P.e.id}/pre-flight`, 6000);
      await openStep4();
      await pick(mere.pe.id);
      await sleep(400);
      const f1 = await b.ev(TEST_FACTS);
      r[`C1${k}`] = CHECKS.C_TEST(f1, W2('Mere', kate.user.email)) && (await fits(w));
      detail[`C1${k}`] = JSON.stringify(f1);
      await shot(`64-step4-button-${w}.png`, '#step-4 [data-test-email]');
      await pick(tom.pe.id);
      await sleep(400);
      const f2 = await b.ev(TEST_FACTS);
      r[`C2${k}`] = CHECKS.C_TEST(f2, `${W2('Tom', kate.user.email)} ${W3('Tom')}`);
      detail[`C2${k}`] = JSON.stringify(f2);
      await shot(`64-step4-text-${w}.png`, '#step-4 [data-test-email]');
      await pick(mere.pe.id);
      await sleep(400);
      const outcomes: Array<[string, string, string]> = [
        ['SENT', W5(kate.user.email), 'sent'],
        ['LIVE_OFF', W[6], 'sending-off'],
        ['NOT_SENT', W[7], 'could-not-send'],
        ['REFUSED', W[8], 'turned-down'],
        ['TOO_OFTEN', W[11], 'too-often'],
      ];
      let all = true;
      const seen: any[] = [];
      for (const [answer, line, tag] of outcomes) {
        const f = await press(answer);
        all = all && CHECKS.C_OUTCOME(f, line);
        seen.push(f?.outcome);
        await shot(`64-outcome-${tag}-${w}.png`, '#step-4 [data-test-email]');
      }
      r[`C3${k}`] = all;
      detail[`C3${k}`] = JSON.stringify(seen);
      // her line, changed and not saved: the button waits (Q5, W12); then put back as it was
      const box = '#step-4 [data-message-part="1"] textarea';
      const original = await b.ev<string>(
        `document.querySelector(${JSON.stringify(box)})?.value ?? ''`
      );
      await b.tap(box, 300);
      await b.type(' and one more thing');
      await sleep(300);
      const f4 = await b.ev(TEST_FACTS);
      r[`C4${k}`] = CHECKS.C_WAITS(f4);
      detail[`C4${k}`] = JSON.stringify(f4);
      await shot(`64-unsaved-line-${w}.png`, '#step-4 [data-test-email]');
      await b.ev(
        `(() => { const t = document.querySelector(${JSON.stringify(box)}); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${JSON.stringify(original)}); t.dispatchEvent(new Event('input', { bubbles: true })); })()`
      );
      await sleep(400);
      const f4b = await b.ev(TEST_FACTS);
      r[`C4${k}`] =
        r[`C4${k}`] && f4b?.disabled === false && f4b?.lead === W2('Mere', kate.user.email);

      // ── as the co-host: her own address (Q1, Q24) ──
      await b.cookie(cora.token);
      await b.navigate(`/plan/${P.e.id}/pre-flight`, 6000);
      await openStep4();
      await pick(mere.pe.id);
      await sleep(400);
      const f5 = await b.ev(TEST_FACTS);
      const f5s = await press('SENT');
      r[`C5${k}`] =
        CHECKS.C_TEST(f5, W2('Mere', cora.user.email)) &&
        CHECKS.C_OUTCOME(f5s, W5(cora.user.email));
      detail[`C5${k}`] = JSON.stringify({ f5, f5s });
      await shot(`64-step4-cohost-${w}.png`, '#step-4 [data-test-email]');

      // ── item 72, the board ──
      await b.cookie(kate.token);
      await b.navigate(`/plan/${B.e.id}/glance`, 7000);
      const d6 = await b.ev(DOOR_FACTS);
      r[`C6${k}`] =
        CHECKS.C_DOORS(d6, DOOR_ROW) && CHECKS.C_CLOSED(await b.ev<number>(VISIBLE_DIALOGS));
      detail[`C6${k}`] = JSON.stringify(d6);
      await shot(`72-door-row-${w}.png`, '[data-back-room-door]');
      await b.tap('[data-plan-list-door="menu"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the menu', b.refusals);
      const f7 = await b.ev(LIST_FACTS);
      r[`C7${k}`] = CHECKS.C_LIST(f7, 'menu', W[22], MENU) && (await fits(w));
      detail[`C7${k}`] = JSON.stringify(f7);
      await shot(`72-menu-${w}.png`);
      await b.tap('[role="dialog"][data-plan-list] button[aria-label="Close"]', 500);
      const closedByX = f7?.open === true && CHECKS.C_CLOSED(await b.ev<number>(VISIBLE_DIALOGS));
      await b.tap('[data-plan-list-door="assignments"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'who’s on what', b.refusals);
      const f8 = await b.ev(LIST_FACTS);
      r[`C8${k}`] = CHECKS.C_LIST(f8, 'assignments', W[23], WHO) && (await fits(w));
      detail[`C8${k}`] = JSON.stringify(f8);
      await shot(`72-assignments-${w}.png`);
      await b.key('Escape', 27);
      const closedByEscape =
        f8?.open === true && CHECKS.C_CLOSED(await b.ev<number>(VISIBLE_DIALOGS));
      await b.tap('[data-plan-list-door="menu"]', 300);
      const openAgain = await waitFor(b.ev, LIST_DRAWN, 'the menu again', b.refusals);
      await b.tapOutside('[data-plan-list-backdrop]', 500);
      const closedOutside = openAgain && CHECKS.C_CLOSED(await b.ev<number>(VISIBLE_DIALOGS));
      r[`C9${k}`] = closedByX && closedByEscape && closedOutside;
      detail[`C9${k}`] = JSON.stringify({ closedByX, closedByEscape, closedOutside });
      // the read fails (the wall fails this one items GET): W25
      b.wall.failItemsFor = B.e.id;
      await b.tap('[data-plan-list-door="menu"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the failed menu', b.refusals);
      const f10 = await b.ev(LIST_FACTS);
      b.wall.failItemsFor = '';
      r[`C10${k}`] = CHECKS.C_LINE(f10, 'menu', W[22], 'failed', W[25]);
      detail[`C10${k}`] = JSON.stringify(f10);
      await b.key('Escape', 27);

      // a co-host opens both, as the host does (Q17)
      await b.cookie(cora.token);
      await b.navigate(`/plan/${B.e.id}/glance`, 7000);
      await b.tap('[data-plan-list-door="menu"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the co-host’s menu', b.refusals);
      const f11 = await b.ev(LIST_FACTS);
      await b.key('Escape', 27);
      await b.tap('[data-plan-list-door="assignments"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the co-host’s who’s on what', b.refusals);
      const f11b = await b.ev(LIST_FACTS);
      await b.key('Escape', 27);
      r[`C11${k}`] =
        CHECKS.C_LIST(f11, 'menu', W[22], MENU) && CHECKS.C_LIST(f11b, 'assignments', W[23], WHO);
      detail[`C11${k}`] = JSON.stringify({ f11, f11b });

      // the empty plan: W26 and W29
      await b.cookie(kate.token);
      await b.navigate(`/plan/${E.e.id}/glance`, 7000);
      await b.tap('[data-plan-list-door="menu"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the empty menu', b.refusals);
      const f12 = await b.ev(LIST_FACTS);
      await shot(`72-menu-empty-${w}.png`);
      await b.key('Escape', 27);
      await b.tap('[data-plan-list-door="assignments"]', 300);
      await waitFor(b.ev, LIST_DRAWN, 'the empty who’s on what', b.refusals);
      const f12b = await b.ev(LIST_FACTS);
      await shot(`72-assignments-empty-${w}.png`);
      await b.key('Escape', 27);
      r[`C12${k}`] =
        CHECKS.C_LINE(f12, 'menu', W[22], 'empty', W[26]) &&
        CHECKS.C_LINE(f12b, 'assignments', W[23], 'empty', W[29]);
      detail[`C12${k}`] = JSON.stringify({ f12, f12b });

      // invites-only: neither button (Q19)
      await b.navigate(`/plan/${I.e.id}/glance`, 7000);
      const d13 = await b.ev(DOOR_FACTS);
      r[`C13${k}`] = CHECKS.C_DOORS(d13, ['Invites & people']) && (await fits(w));
      detail[`C13${k}`] = JSON.stringify(d13);
      await shot(`72-invites-only-${w}.png`, '[data-back-room-door]');
    }
    const labels: Array<[string, string]> = [
      [
        'C1',
        'C1 step 4 as the host: W1 under the message in part 1, W2 with HER OWN address, no outcome yet, nothing sideways',
      ],
      ['C2', 'C2 reading as Tom, who gets a text: W2 then W3 (Q4)'],
      [
        'C3',
        'C3 each outcome the browser answered: sent (W5), sending off (W6), could not send (W7), turned down (W8), too often (W11)',
      ],
      [
        'C4',
        'C4 her line changed and not saved: the button waits with W12 (Q5); put back as it was, it is ready again',
      ],
      [
        'C5',
        'C5 as the co-host: W2 and W5 carry the co-host’s OWN address, not the host’s (Q1, Q24)',
      ],
      [
        'C6',
        'C6 the board’s door row: See menu, See assignments, then Change who’s on what, Invites & people, Print the list; no pop-up drawn (Q18)',
      ],
      [
        'C7',
        'C7 See menu: W22, the sections in the plan’s order, amounts, each holder with their answer (W28), Fruit salad “Nobody yet”; no link, Close only',
      ],
      [
        'C8',
        'C8 See assignments: W23, holders by name with section and answer, then W30 with what nobody holds (Q21); no link, Close only',
      ],
      ['C9', 'C9 each closes, having been open: on Close, on Escape, and on a tap outside (Q16)'],
      ['C10', 'C10 a failed read says W25'],
      ['C11', 'C11 a co-host opens both, and sees what the host sees (Q17)'],
      ['C12', 'C12 an empty plan: the menu says W26, who’s on what says W29'],
      ['C13', 'C13 invites-only: neither button; Invites & people alone (Q19)'],
    ];
    for (const [key, label] of labels) {
      assert('C', `${label} (1280)`, r[key] === true, detail[key]);
      assert('C', `${label} (390)`, r[`${key}p`] === true, detail[`${key}p`]);
    }
  } finally {
    c?.close();
  }
  const rowsAfter = await rowsOf(liveEvents, liveAddresses);
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(`    fixture rows while it existed: ${rowsAfter}; aiCallsUsed ${ai.join(',')}`);
  assert(
    'K',
    'K1 CONTROL: no request but GETs reached the server; every test press was answered by the browser on this suite’s pre-flight; nothing failed but the probes and the one items read made to fail; no dialog; no click refused',
    !!c &&
      c.continuedNonGet.length === 0 &&
      c.answered.length === 13 &&
      c.answered.every(
        (x) => x.includes(`/api/events/${P.e.id}/pre-flight/message`) || x.includes('gtc388-probe')
      ) &&
      c.failedReq.length === 5 &&
      c.failedReq.filter((x) => /gtc388-probe/.test(x)).length === 3 &&
      c.failedReq.filter((x) => x.endsWith(`/api/events/${B.e.id}/items`)).length === 2 &&
      c.dialogs.length === 0 &&
      c.refusals.length === 0,
    `${c?.continuedNonGet.join(' | ')} || ${c?.answered.length} answered || ${c?.failedReq.join(' | ')} || ${c?.dialogs.join(',')} || ${c?.refusals.join(' ; ')}`
  );
  assert(
    'K',
    'K2 CONTROL: the browser layer wrote nothing the test may not write, and aiCallsUsed is 0 on every fixture event',
    rowsAfter === rowsBefore && ai.length > 0 && ai.every((x) => x === 0),
    `${rowsBefore} → ${rowsAfter}`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  // Every row below was made by this suite: its events and what hangs off them, its people, its
  // users and their sessions, and its one EmailBlock (address-wide, so removed by id).
  const evIds = created.events;
  await del(() => prisma.accessToken.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.auditEntry.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.emailOptOut.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() => prisma.outboundMessage.deleteMany({ where: { eventId: { in: evIds } } }));
  await del(() =>
    prisma.assignment.deleteMany({ where: { item: { team: { eventId: { in: evIds } } } } })
  );
  await del(() => prisma.item.deleteMany({ where: { team: { eventId: { in: evIds } } } }));
  await del(() =>
    prisma.household.updateMany({
      where: { eventId: { in: evIds } },
      data: { contactPersonEventId: null },
    })
  );
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  await del(() => prisma.emailBlock.deleteMany({ where: { id: { in: created.blocks } } }));
  await del(() => prisma.session.deleteMany({ where: { userId: { in: created.users } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
  const left = [
    await prisma.event.count({ where: { id: { in: evIds } } }),
    await prisma.person.count({ where: { id: { in: created.people } } }),
    await prisma.user.count({ where: { id: { in: created.users } } }),
    await prisma.emailBlock.count({ where: { id: { in: created.blocks } } }),
  ].join(',');
  assert(
    'K',
    'K3 CONTROL: every fixture row removed by id (events, people, users, the EmailBlock)',
    left === '0,0,0,0',
    left
  );
}

async function main() {
  suiteStart = await totals();
  await runInMemory();
  const fx = await runInProcess();
  await runHttp(fx);
  await runLive();
  await cleanup();
  const end = await totals();
  assert(
    'K',
    'K4 CONTROL: the database totals are as found (messages, invite events, tokens, ledger, opt-outs, blocks, people, users, sessions, events)',
    JSON.stringify(end) === JSON.stringify(suiteStart),
    `${JSON.stringify(suiteStart)} → ${JSON.stringify(end)}`
  );
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const x of redAssertions) console.log(`  ${x}`);
  }
}

main()
  .catch(async (e) => {
    console.error(e);
    failed++;
    globalThis.fetch = realFetch;
    await cleanup();
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
