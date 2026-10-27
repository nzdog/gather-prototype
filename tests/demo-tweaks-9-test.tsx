/**
 * [[GTC-407]] — THE PAYING PAGE AFTER PAYMENT: three small fixes to /plan/new, the first part of
 * GTC-281, with the founder's rulings of 26 Oct 2026. One file changes: src/app/plan/new/page.tsx.
 *
 * THE RULINGS THIS SUITE PINS
 *   1  When the server answers 409 (the payment already made her event: a reload, history, a
 *      second tab), the page shows "Payment received", one new sentence, exactly "Your event was
 *      set up when you paid. Sign in with the email you paid with and it will be waiting for
 *      you.", and "Go to sign-in" (to /auth/signin). Nothing else, no timer, no redirect.
 *   2  After a server error (a 500) or a connection failure, "Try Again" sends the SAME POST with
 *      the SAME stripeSessionId, through "Creating your event...", then "Payment received" or the
 *      error again; never the blank form. After a 402 or a 400 it goes to the form as before.
 *   3  "Contact Support" opens mailto:hello@gatheringtogether.co.nz, not mailto:support@gather.app.
 *
 * THE LAYERS
 *   S  the source: the new sentence and the old 409 words gone; no timer; the old address nowhere
 *      in the file; the first-visit path (the effects, the form, the checkout call, the first
 *      creation's success, the "Payment received" screen after it, the canceled screen) and the
 *      error screen but its one address as at GTC-407's base (1b8bfe7).
 *   C  the dev server in a walled-off headless Chrome (port 9489), at 1280. The page's POST to
 *      /api/events NEVER reaches the server: a second DevTools connection pauses every request to
 *      /api/events and /api/billing and answers it with a made-up response written here, or fails
 *      it as a lost connection. So nothing calls Stripe, nothing is written and nothing is sent;
 *      the browser itself resolves only localhost. No form is submitted. Every click is guarded.
 *   K  CONTROL: every paused request was one the suite expected and answered (none unexpected, no
 *      checkout call); the browser asked for localhost only, no dialog, no click refused.
 *   U  CONTROL: the only file under src or prisma that differs from 1b8bfe7 is the paying page;
 *      the lockfile is as it was; package.json (at the commit that added this suite) differs by its
 *      one script line; the two untracked scripts are in no commit.
 *
 * Every live condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_9_DRY_RUN=1 imports CHECKS only). Every made-up answer and expected value is
 * written here by hand, never taken from the code under test. The suite touches no database.
 *
 * Needs the dev server on :3000 (GTC407_BASE_URL points it elsewhere, for the break proofs) and a
 * global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';

const realFetch = globalThis.fetch;
installProviderTrap();

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.GTC407_BASE_URL ?? 'http://localhost:3000';
const PORT = 9489;
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
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};
const count = (s: string, needle: string) => s.split(needle).length - 1;

// ── The ruled words, typed by hand ───────────────────────────────────────────
const RECEIVED = 'Payment received';
const SENTENCE =
  'Your event was set up when you paid. Sign in with the email you paid with and it will be waiting for you.';
const SIGN_IN = 'Go to sign-in';
const SIGN_IN_HREF = '/auth/signin';
const WRONG = 'Something went wrong';
const TRY_AGAIN = 'Try Again';
const SUPPORT = 'Contact Support';
const CREATING = 'Creating your event...';
const NOT_PAID = "Payment wasn't completed. Please try again.";
const CANCELED = 'Payment canceled';
const NO_CHARGE = "No charge was made. You can try again whenever you're ready.";
const FORM_TITLE = 'Create Your Event';
const PAY_BUTTON = 'Pay & Create — $25';
const SENT_LINK = 'We’ve sent a sign-in link to';
/** The 409 screen's old words, gone (the error it showed, then the home page after 3 s). */
const OLD_409 = 'This payment was already used to create an event.';
const NEW_ADDRESS = 'hello@gatheringtogether.co.nz';
const OLD_ADDRESS = 'support@gather.app';

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-9-test.tsx';
const PAGE = 'src/app/plan/new/page.tsx';
const FOOTER = 'src/lib/email-footer.ts';
/** GTC-406's last commit (its ticket), where this ticket started: a fixed commit. */
const BASE = '1b8bfe7b8a9b7540ef582fff9be031b37e325b8c';
const NEW_SCRIPT = 'test:demo-tweaks-9';
const NEW_SCRIPT_VALUE =
  'NODE_OPTIONS=--experimental-websocket tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-9-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
/**
 * [[GTC-408]] edits the cancel page on purpose (its "Contact support" link now writes to the
 * address this ticket ruled), so U1 asks its question of it at GTC-408's base (c227e81), a fixed
 * commit: GTC-407 still may not have touched it. GTC-408's own suite (test:demo-tweaks-10) pins
 * its new state. It is kept out of U1's live diff, which still covers everything else under src
 * and prisma.
 */
const GTC408_BASE = 'c227e81f39ab8fffbcf9ece3cd774125787e47cc';
const NOT_TOUCHED_TILL_GTC408 = ['src/app/billing/cancel/page.tsx'];
/**
 * [[GTC-409]] restyles four pages on purpose (class names only: the guest page's dish cards one per
 * row, Grid view two across at most on the host page, its team page and the coordinator page), so
 * U1 asks its question of them at GTC-409's base (b05cac3), a fixed commit: this ticket still may
 * not have touched them. They are kept out of U1's live diff, which still covers everything else
 * under src and prisma. GTC-409's own suite (test:demo-tweaks-11) pins their new state.
 */
const GTC409_BASE = 'b05cac341e28ca1a3bdea5966f71015553cb98a4';
const NOT_TOUCHED_TILL_GTC409 = [
  'src/app/p/[token]/page.tsx',
  'src/app/h/[token]/page.tsx',
  'src/app/h/[token]/team/[teamId]/page.tsx',
  'src/app/c/[token]/page.tsx',
];
/**
 * [[GTC-411]] edits three files on purpose (signing in and paying for an event now find or make a
 * User through one shared rule that ignores capitals and outer spaces) and adds the rule's own
 * file, so U1 asks its question of the three at GTC-411's base (7597112), a fixed commit: this
 * ticket still may not have touched them; and the new file must not be there yet. All four are
 * kept out of U1's live diff, which still covers everything else under src and prisma.
 * test:email-case, test:gtc280 and the security suite (suite 20) pin their new state.
 */
const GTC411_BASE = '759711288b981fe78941a11fb9bd177743a1db6f';
const NOT_TOUCHED_TILL_GTC411 = [
  'src/app/api/auth/verify/route.ts',
  'src/app/api/events/route.ts',
  'src/lib/events/payment-identity.ts',
];
const NEW_IN_GTC411 = ['src/lib/accounts/user-by-email.ts'];

/**
 * The parts of the page this ticket leaves alone, each cut between two markers that are code or
 * the file's own comments as they stand at the base. Each must appear in the page now, byte for
 * byte. A marker that is missing cuts nothing and reads '' (and fails).
 */
const KEPT: Array<[string, string, string]> = [
  [
    'the page’s state up to the welcome',
    'export default function NewPlanPage',
    '  const [showExpiredNotice',
  ],
  [
    'the two effects that read the address (creatingRef’s guard among them)',
    '  // Handle pre-populated params',
    '  const createEventWithPayment',
  ],
  ['the creation’s request itself', '      // Call event creation API', '      });'],
  [
    'the first creation’s success (her own screen or setup)',
    '      const result = await response.json();',
    '    } catch (err) {',
  ],
  [
    'the form’s handlers and the checkout call',
    '  const dates: DatePairValue',
    '  const handleTryAgain',
  ],
  [
    'the old "Try Again" (to the form)',
    '    // Clear URL params and show form',
    '  // Loading state while creating event',
  ],
  [
    '"Creating your event..." and the "Payment received" screen after a first creation',
    '  // Loading state while creating event',
    '  // Payment canceled state',
  ],
  ['the canceled screen and its "Try Again"', '  // Payment canceled state', '  // Error state'],
  ['the form', '  // Main form state', '\n}\n'],
];

// ── Made-up answers, written here by hand ────────────────────────────────────
interface Answer {
  /** An HTTP status to answer with, or 'lost' to fail the request as a lost connection. */
  status: number | 'lost';
  body?: unknown;
  /** How long the suite holds the request before answering it. */
  holdMs?: number;
}
const A409: Answer = { status: 409, body: { error: 'Payment already used for another event' } };
const A500: Answer = {
  status: 500,
  body: { error: 'Failed to create event', details: 'made up by test:demo-tweaks-9' },
};
const A402: Answer = { status: 402, body: { error: 'Payment not completed' } };
const A400: Answer = { status: 400, body: { error: 'Invalid payment session' } };
const LOST: Answer = { status: 'lost' };
/** A first creation that worked, for a host not signed in (the GTC-280 split). */
const A200: Answer = {
  status: 200,
  body: {
    success: true,
    event: { id: 'gtc407-made-up-event', name: 'Riverside lunch' },
    alreadySignedIn: false,
    relation: 'anonymous',
    signInEmailSentTo: 's•••@example.com',
    signInEmailDelivered: true,
    signedInAs: null,
  },
};
const sessionOf = (tag: string) => `cs_test_gtc407_${tag}_made_up`;
const DRAFT = {
  name: 'Riverside lunch',
  startDate: '2026-12-19',
  endDate: '2026-12-19',
  hostName: 'Sam',
  email: 'sam@example.com',
  phone: '021 123 4567',
};

// ── Shapes read in the browser ───────────────────────────────────────────────
/** What the page shows: the card's lines, its links and buttons, and where the browser is. */
export interface Screen {
  /** The card's text, one entry per line, blank lines dropped. */
  lines: string[];
  links: Array<{ text: string; href: string }>;
  buttons: string[];
  form: boolean;
  h1: string | null;
  creating: boolean;
  path: string;
  search: string;
  nameValue: string | null;
}
/** One request the suite paused. */
export interface Paused {
  method: string;
  url: string;
  body: string | null;
  answered: string;
}

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  // ── S ──
  /** S1 — the new sentence once (whitespace squashed), the old 409 words gone, no timer. */
  ruling1Source(page: string) {
    const code = stripComments(page);
    return (
      count(squash(code), SENTENCE) === 1 &&
      count(code, `>${RECEIVED}</h2>`) === 2 &&
      count(code, `href="${SIGN_IN_HREF}"`) === 2 &&
      !page.includes(OLD_409) &&
      !/setTimeout\(/.test(code)
    );
  },
  /** S2 — the old address nowhere in the file; the button opens mailto with the footer's address. */
  ruling3Source(page: string, footer: string) {
    const code = stripComments(page);
    return (
      !page.includes(OLD_ADDRESS) &&
      !page.includes(NEW_ADDRESS) &&
      /import \{ GATHER_CONTACT_EMAIL \} from '@\/lib\/email-footer';/.test(code) &&
      code.includes("onClick={() => window.open(`mailto:${GATHER_CONTACT_EMAIL}`, '_blank')}") &&
      footer.includes(`export const GATHER_CONTACT_EMAIL = '${NEW_ADDRESS}';`)
    );
  },
  /** S3 — the parts left alone are byte for byte as at the base (KEPT). */
  keptAsAtBase(now: string, base: string) {
    return KEPT.every(([, from, to]) => {
      const was = between(base, from, to);
      return was.length > 80 && now.includes(was);
    });
  },
  /** S4 — the error screen as at the base, but its one address; creatingRef kept as it was. */
  errorScreenButAddress(now: string, base: string) {
    const was = between(base, '  // Error state', '  // Main form state');
    const is = between(now, '  // Error state', '  // Main form state');
    const back = is.replace('`mailto:${GATHER_CONTACT_EMAIL}`', `'mailto:${OLD_ADDRESS}'`);
    return (
      was.length > 200 &&
      back === was &&
      is !== was &&
      count(stripComments(now), 'creatingRef') === 3 &&
      count(stripComments(base), 'creatingRef') === 3 &&
      now.includes('const creatingRef = useRef(false);') &&
      now.includes('if (sessionId && !creatingRef.current) {')
    );
  },
  // ── C ──
  /** C1 — the 409 screen: the heading, the sentence and the link, nothing else, no error. */
  paidBefore(s: Screen | null) {
    return (
      !!s &&
      JSON.stringify(s.lines) === JSON.stringify([RECEIVED, SENTENCE, SIGN_IN]) &&
      s.links.length === 1 &&
      s.links[0].text === SIGN_IN &&
      new URL(s.links[0].href).pathname === SIGN_IN_HREF &&
      s.buttons.length === 0 &&
      !s.form &&
      !s.lines.some((l) => l.includes(WRONG) || l.includes(OLD_409))
    );
  },
  /** C2 — still there, on the same address, after waiting: no timer, no redirect. */
  stayed(before: Screen | null, after: Screen | null, session: string) {
    return (
      CHECKS.paidBefore(before) &&
      CHECKS.paidBefore(after) &&
      after!.path === '/plan/new' &&
      new URLSearchParams(after!.search).get('session_id') === session
    );
  },
  /** C3 — the requests the page sent: each the same POST to /api/events with the same session. */
  samePosts(paused: Paused[], session: string, n: number) {
    const body = JSON.stringify({ stripeSessionId: session });
    return (
      paused.length === n &&
      paused.every(
        (p) => p.method === 'POST' && new URL(p.url).pathname === '/api/events' && p.body === body
      )
    );
  },
  /** C4 — the error screen with its words and both buttons. */
  errorScreen(s: Screen | null, message: string) {
    return (
      !!s &&
      s.lines[0] === WRONG &&
      s.lines[1] === message &&
      JSON.stringify(s.buttons) === JSON.stringify([TRY_AGAIN, SUPPORT]) &&
      !s.form
    );
  },
  /** C5 — while the retry was held: "Creating your event..." was shown, the form never was. */
  retryThroughCreating(samples: Screen[]) {
    return (
      samples.length >= 3 &&
      samples.some((s) => s.creating) &&
      samples.every((s) => !s.form && s.h1 !== FORM_TITLE && s.path === '/plan/new')
    );
  },
  /** C6 — the form, as a first visit or the old "Try Again" shows it, on the bare address. */
  formShown(s: Screen | null, nameValue: string) {
    return (
      !!s &&
      s.form &&
      s.h1 === FORM_TITLE &&
      s.buttons.includes(PAY_BUTTON) &&
      s.path === '/plan/new' &&
      s.search === '' &&
      s.nameValue === nameValue
    );
  },
  /** C7 — the canceled screen as before. */
  canceledScreen(s: Screen | null) {
    return (
      !!s &&
      JSON.stringify(s.lines) === JSON.stringify([CANCELED, NO_CHARGE, TRY_AGAIN]) &&
      JSON.stringify(s.buttons) === JSON.stringify([TRY_AGAIN]) &&
      !s.form
    );
  },
  /** C8 — "Payment received" after a first creation that worked (the GTC-280 screen). */
  emailedScreen(s: Screen | null) {
    return (
      !!s &&
      s.lines[0] === RECEIVED &&
      s.lines.includes('Your event “Riverside lunch” is ready.') &&
      s.lines.some((l) => l.startsWith(SENT_LINK)) &&
      s.links.length === 1 &&
      s.links[0].text === SIGN_IN
    );
  },
  /** C9 — "Contact Support" opened the new address only, and the page holds no old address. */
  supportOpened(opened: string[][] | null, html: string) {
    return (
      JSON.stringify(opened) === JSON.stringify([[`mailto:${NEW_ADDRESS}`, '_blank']]) &&
      html.length > 500 &&
      !html.includes(OLD_ADDRESS)
    );
  },
  // ── K ──
  /** K1 — every paused request expected and answered by the suite; no checkout call. */
  allAnswered(paused: Paused[], unexpected: number) {
    return (
      paused.length > 0 &&
      unexpected === 0 &&
      paused.every((p) => p.answered !== 'unexpected' && !p.url.includes('/api/billing'))
    );
  },
  /**
   * K2 — every address Chrome asked for is on the dev server, or a data: or about: address by name
   * (New Event's date box loads a `data:image/svg+xml` icon, whose host is empty, as batch15 K1
   * found); the helper saw no host the address log did not; no dialog, no click refused.
   */
  walled(urls: string[], hosts: string[], dialogs: string[], refused: string[], base: string) {
    const own = new URL(base).host;
    const hostOf = (u: string) => {
      try {
        return new URL(u).host;
      } catch {
        return '(unparsable)';
      }
    };
    const outside = urls.filter(
      (u) => !(u.startsWith('data:') || u.startsWith('about:') || hostOf(u) === own)
    );
    return (
      urls.length > 0 &&
      outside.length === 0 &&
      hosts.length > 0 &&
      hosts.every((h) => urls.some((u) => hostOf(u) === h)) &&
      dialogs.length === 0 &&
      refused.length === 0
    );
  },
  // ── U ──
  /** U1 — the only file under src or prisma differing from the base is the paying page. */
  onlyThePage(changed: string, untracked: string) {
    return changed.trim() === PAGE && untracked.trim() === '';
  },
  /** U3 — package.json at the commit that added this suite differs by the one script line. */
  oneScriptLine(atAdd: string, baseJson: string) {
    try {
      const now = JSON.parse(atAdd);
      const base = JSON.parse(baseJson);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (base?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(base);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ S — the source ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the source: the words, the address, what is left alone');
  const page = read(PAGE);
  const base = atRef(BASE, PAGE);
  assert(
    'S',
    'S1 ruling 1’s sentence once, "Payment received" and the sign-in link on two screens now, the old 409 words gone, no timer anywhere in the page',
    CHECKS.ruling1Source(page)
  );
  assert(
    'S',
    'S2 ruling 3: the old address nowhere in the page (comments included), "Contact Support" opens mailto: with GATHER_CONTACT_EMAIL from src/lib/email-footer.ts, which is hello@gatheringtogether.co.nz',
    CHECKS.ruling3Source(page, read(FOOTER))
  );
  assert(
    'S',
    `S3 CONTROL: the first-visit path as at GTC-407’s base (1b8bfe7), byte for byte: ${KEPT.map(([what]) => what).join('; ')}`,
    CHECKS.keptAsAtBase(page, base),
    KEPT.filter(([, from, to]) => {
      const was = between(base, from, to);
      return !(was.length > 80 && page.includes(was));
    })
      .map(([what]) => what)
      .join(' | ')
  );
  assert(
    'S',
    'S4 CONTROL: the error screen as at the base but its one address (its words and both buttons kept); creatingRef as it was',
    CHECKS.errorScreenButAddress(page, base)
  );
}

// ══ C — the page in the walled Chrome ════════════════════════════════════════
/** Reads what the page shows. The card is the one white box; the form page has no card. */
const SCREEN = `(() => {
  const card = document.querySelector('div.max-w-md div.bg-white');
  const lines = card ? card.innerText.split('\\n').map((l) => l.trim()).filter(Boolean) : [];
  const links = card ? [...card.querySelectorAll('a')].map((a) => ({ text: a.innerText.trim(), href: a.href })) : [];
  const buttons = [...(card ? card.querySelectorAll('button') : document.querySelectorAll('main button, form button, div.max-w-2xl button'))]
    .map((b) => b.innerText.trim()).filter(Boolean);
  const h1 = document.querySelector('h1');
  const name = document.querySelector('input#name');
  return { lines, links, buttons, form: !!document.querySelector('form'), h1: h1 ? h1.innerText.trim() : null,
    creating: document.body.innerText.includes(${JSON.stringify(CREATING)}),
    path: location.pathname, search: location.search, nameValue: name ? name.value : null };
})()`;

/** A second DevTools connection to the page: pauses /api/events and /api/billing and answers. */
async function openAnswerer() {
  const targets = (await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
    type: string;
    webSocketDebuggerUrl: string;
  }[];
  const page = targets.find((t) => t.type === 'page');
  if (!page) throw new Error('no page target for the answerer');
  const WS = (globalThis as any).WebSocket;
  const ws = new WS(page.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map<number, (m: any) => void>();
  const queue: Answer[] = [];
  const paused: Paused[] = [];
  /** Every address the page asked for, read on this connection (K2). */
  const urls: string[] = [];
  let unexpected = 0;
  const send = (method: string, params: Record<string, unknown> = {}) =>
    new Promise<any>((r) => {
      const i = ++id;
      pending.set(i, r);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  ws.addEventListener('message', (e: { data: string }) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)!(m);
      pending.delete(m.id);
    }
    if (m.method === 'Network.requestWillBeSent') urls.push(m.params.request.url);
    if (m.method !== 'Fetch.requestPaused') return;
    const { requestId, request } = m.params;
    const isCreate = request.method === 'POST' && new URL(request.url).pathname === '/api/events';
    const answer = isCreate ? queue.shift() : undefined;
    const p: Paused = {
      method: request.method,
      url: request.url,
      body: request.postData ?? null,
      answered: answer ? String(answer.status) : 'unexpected',
    };
    paused.push(p);
    if (!answer) {
      // Never let it through: anything the suite did not expect is failed in the browser.
      unexpected++;
      void send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' });
      return;
    }
    setTimeout(() => {
      if (answer.status === 'lost') {
        void send('Fetch.failRequest', { requestId, errorReason: 'ConnectionFailed' });
      } else {
        void send('Fetch.fulfillRequest', {
          requestId,
          responseCode: answer.status,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(answer.body ?? {})).toString('base64'),
        });
      }
    }, answer.holdMs ?? 0);
  });
  await send('Network.enable');
  await send('Fetch.enable', {
    patterns: [
      { urlPattern: '*/api/events', requestStage: 'Request' },
      { urlPattern: '*/api/events?*', requestStage: 'Request' },
      { urlPattern: '*/api/billing/*', requestStage: 'Request' },
    ],
  });
  return {
    /** Sets what the next creations are answered with, in order, and forgets the old log. */
    expect(...answers: Answer[]) {
      queue.length = 0;
      queue.push(...answers);
      paused.length = 0;
    },
    paused: () => [...paused],
    urls: () => [...urls],
    left: () => queue.length,
    unexpected: () => unexpected,
    close() {
      try {
        ws.close();
      } catch {
        // already closed
      }
    },
  };
}

async function layerC() {
  section('C — the page in a walled-off headless Chrome (port 9489), every creation answered here');
  let c: Headless | null = null;
  let answerer: Awaited<ReturnType<typeof openAnswerer>> | null = null;
  const refused: string[] = [];
  const allPaused: Paused[] = [];
  try {
    c = await openHeadless({ fetchImpl: realFetch, port: PORT, base: BASE_URL });
    answerer = await openAnswerer();
    await c.setViewport(1280, 900, false);
    await c.clearCookies();
    // "Contact Support" calls window.open: record it, open nothing.
    await c.addInitScript(
      `window.__opened = []; window.open = function () { window.__opened.push([...arguments].map(String)); return null; };`
    );
    const screen = () => c!.evaluate<Screen>(SCREEN);
    const waitFor = async (ok: (s: Screen) => boolean, ms = 30000) => {
      const end = Date.now() + ms;
      let s: Screen | null = null;
      while (Date.now() < end) {
        s = await screen();
        if (s && ok(s)) return s;
        await sleep(250);
      }
      return s;
    };
    const press = async (words: string) => {
      const marked = await c!.evaluate<boolean>(`(() => {
        const b = [...document.querySelectorAll('div.max-w-md div.bg-white button')].find((x) => x.innerText.trim() === ${JSON.stringify(words)});
        if (!b) return false; b.setAttribute('data-gtc407', 'press'); return true; })()`);
      const why = marked ? await c!.clickGuarded('[data-gtc407="press"]', 300) : 'no such button';
      await c!.evaluate(
        `(() => { const b = document.querySelector('[data-gtc407="press"]'); if (b) b.removeAttribute('data-gtc407'); return 1; })()`
      );
      if (why) refused.push(`${words}: ${why}`);
      return !why;
    };
    const keep = () => allPaused.push(...answerer!.paused());
    const isCard = (s: Screen) => s.lines.length > 0;

    // ── Ruling 1: a 409 on her return ──
    const s409 = sessionOf('used');
    answerer.expect(A409);
    await c.navigate(`/plan/new?session_id=${s409}`, 500);
    const first = await waitFor((s) => s.lines[0] === RECEIVED || s.lines[0] === WRONG);
    assert(
      'C',
      'C1 a 409 shows "Payment received", the new sentence and "Go to sign-in" (to /auth/signin), nothing else: no error screen, no button',
      CHECKS.paidBefore(first),
      JSON.stringify(first)
    );
    await sleep(4000);
    const later = await screen();
    assert(
      'C',
      'C2 4 seconds later it is still there, on /plan/new with the same session_id: no timer, no redirect',
      CHECKS.stayed(first, later, s409),
      JSON.stringify(later)
    );
    assert(
      'C',
      'C3 the return page sent one POST to /api/events with {"stripeSessionId": <its session_id>}, answered here',
      CHECKS.samePosts(answerer.paused(), s409, 1) && answerer.left() === 0,
      JSON.stringify(answerer.paused())
    );
    keep();

    // ── Ruling 2: a 500, then "Try Again" with the same receipt, then a 409 ──
    const s500 = sessionOf('server_error');
    answerer.expect(A500, { ...A409, holdMs: 2500 });
    await c.navigate(`/plan/new?session_id=${s500}`, 500);
    const err500 = await waitFor((s) => s.lines[0] === WRONG || s.lines[0] === RECEIVED);
    assert(
      'C',
      'C4 a 500 shows the error screen ("Something went wrong", the server’s words, "Try Again" and "Contact Support")',
      CHECKS.errorScreen(err500, 'Failed to create event'),
      JSON.stringify(err500)
    );
    await press(TRY_AGAIN);
    const held500: Screen[] = [];
    for (let i = 0; i < 6; i++) {
      held500.push(await screen());
      await sleep(250);
    }
    const after500 = await waitFor((s) => s.lines[0] === RECEIVED || s.lines[0] === WRONG);
    assert(
      'C',
      'C5 after the 500, "Try Again" shows "Creating your event..." while it waits, never the form, on the same address',
      CHECKS.retryThroughCreating(held500),
      JSON.stringify(held500.map((s) => [s.creating, s.form, s.h1, s.path]))
    );
    assert(
      'C',
      'C6 after the 500, "Try Again" sent the SAME POST again (same address, same stripeSessionId): two in all',
      CHECKS.samePosts(answerer.paused(), s500, 2),
      JSON.stringify(answerer.paused())
    );
    assert(
      'C',
      'C7 the retry that gets a 409 lands on "Payment received" with the new sentence (ruling 1’s screen)',
      CHECKS.paidBefore(after500),
      JSON.stringify(after500)
    );
    keep();

    // ── Ruling 2: a lost connection, "Try Again", a 500, "Try Again", it works ──
    const sLost = sessionOf('lost');
    answerer.expect(LOST, { ...A500, holdMs: 1500 }, { ...A200, holdMs: 1500 });
    await c.navigate(`/plan/new?session_id=${sLost}`, 500);
    const errLost = await waitFor((s) => s.lines[0] === WRONG || s.lines[0] === RECEIVED);
    assert(
      'C',
      'C8 a connection failure shows the error screen with both buttons',
      CHECKS.errorScreen(errLost, 'Failed to fetch'),
      JSON.stringify(errLost)
    );
    await press(TRY_AGAIN);
    const heldLost: Screen[] = [];
    for (let i = 0; i < 4; i++) {
      heldLost.push(await screen());
      await sleep(250);
    }
    const errAgain = await waitFor((s) => s.lines[0] === WRONG || s.lines[0] === RECEIVED);
    await press(TRY_AGAIN);
    const heldOk: Screen[] = [];
    for (let i = 0; i < 4; i++) {
      heldOk.push(await screen());
      await sleep(250);
    }
    const done = await waitFor((s) => s.lines[0] === RECEIVED || s.lines[0] === WRONG);
    assert(
      'C',
      'C9 after the connection failure, "Try Again" goes through "Creating your event..." (never the form) to the error again on a 500, and again to "Payment received" when it works',
      CHECKS.retryThroughCreating(heldLost) &&
        CHECKS.errorScreen(errAgain, 'Failed to create event') &&
        CHECKS.retryThroughCreating(heldOk) &&
        CHECKS.emailedScreen(done),
      JSON.stringify({ errAgain, done })
    );
    assert(
      'C',
      'C10 after the connection failure each "Try Again" sent the SAME POST with the same stripeSessionId: three in all',
      CHECKS.samePosts(answerer.paused(), sLost, 3),
      JSON.stringify(answerer.paused())
    );
    keep();

    // ── Ruling 2: a 402 and a 400 keep "Try Again" going to the form; ruling 3 on the way ──
    const tries: Array<[string, Answer, string]> = [
      ['402', A402, NOT_PAID],
      ['400', A400, 'Invalid payment session'],
    ];
    for (const [tag, answer, words] of tries) {
      const sid = sessionOf(`refused_${tag}`);
      answerer.expect(answer);
      await c.navigate(`/plan/new?session_id=${sid}`, 500);
      const err = await waitFor((s) => s.lines[0] === WRONG || s.lines[0] === RECEIVED);
      if (tag === '400') {
        await press(SUPPORT);
        const opened = await c.evaluate<string[][]>('window.__opened');
        const html = await c.evaluate<string>('document.documentElement.outerHTML');
        assert(
          'C',
          `C12 "Contact Support" opens mailto:${NEW_ADDRESS} (and nothing else), and the page holds no "${OLD_ADDRESS}"`,
          CHECKS.supportOpened(opened, html),
          JSON.stringify(opened)
        );
      }
      await press(TRY_AGAIN);
      const form = await waitFor((s) => s.form);
      await sleep(1500);
      assert(
        'C',
        `C${tag === '402' ? 11 : 13} a ${tag} shows the error screen ("${words}"), and "Try Again" goes to the blank form on /plan/new with no second POST`,
        CHECKS.errorScreen(err, words) &&
          CHECKS.formShown(form, '') &&
          CHECKS.samePosts(answerer.paused(), sid, 1),
        JSON.stringify({ err, form, paused: answerer.paused() })
      );
      keep();
    }

    // ── A first visit, and ?canceled=true, as before ──
    answerer.expect();
    await c.evaluate(
      `(() => { sessionStorage.setItem('gather_new_event', ${JSON.stringify(JSON.stringify(DRAFT))}); return 1; })()`
    );
    await c.navigate('/plan/new', 500);
    const visit = await waitFor((s) => s.form && s.nameValue === DRAFT.name);
    await sleep(1500);
    assert(
      'C',
      'C14 a first visit (no session_id) shows the form with her saved draft and sends nothing',
      CHECKS.formShown(visit, DRAFT.name) && answerer.paused().length === 0,
      JSON.stringify({ visit, paused: answerer.paused() })
    );
    await c.navigate('/plan/new?canceled=true', 500);
    const canceled = await waitFor((s) => s.lines[0] === CANCELED);
    await press(TRY_AGAIN);
    const back = await waitFor((s) => s.form);
    await sleep(1500);
    assert(
      'C',
      'C15 ?canceled=true shows "Payment canceled" and its "Try Again" goes to the form with her draft, sending nothing',
      CHECKS.canceledScreen(canceled) &&
        CHECKS.formShown(back, DRAFT.name) &&
        answerer.paused().length === 0,
      JSON.stringify({ canceled, back, paused: answerer.paused() })
    );
    keep();

    // ── K ──
    section('K — CONTROL: what the run reached');
    assert(
      'K',
      'K1 CONTROL: every request to /api/events or /api/billing was paused and answered by this suite, none unexpected, none a checkout call: nothing reached the server',
      CHECKS.allAnswered(allPaused, answerer.unexpected()),
      JSON.stringify({ unexpected: answerer.unexpected(), paused: allPaused.length })
    );
    assert(
      'K',
      'K2 CONTROL: every address the browser asked for is on the dev server, or a data: or about: address by name; the helper saw no other host; no dialog opened, no click refused',
      CHECKS.walled(answerer.urls(), c.hostsRequested(), c.dialogs(), refused, BASE_URL),
      JSON.stringify({
        outside: answerer
          .urls()
          .filter((u) => !/^(data|about):/.test(u) && !u.includes(new URL(BASE_URL).host)),
        hosts: c.hostsRequested(),
        dialogs: c.dialogs(),
        refused,
      })
    );
  } finally {
    answerer?.close();
    c?.close();
    // Chrome may still be writing its temp profile as it exits.
    await sleep(500);
  }
}

// ══ U — CONTROL ══════════════════════════════════════════════════════════════
function layerU() {
  section('U — CONTROL: what this ticket must not touch');
  const changed = git([
    'diff',
    '--name-only',
    BASE,
    '--',
    'src',
    'prisma',
    ...NOT_TOUCHED_TILL_GTC408.map((f) => `:(exclude)${f}`),
    ...NOT_TOUCHED_TILL_GTC409.map((f) => `:(exclude)${f}`),
    ...[...NOT_TOUCHED_TILL_GTC411, ...NEW_IN_GTC411].map((f) => `:(exclude)${f}`),
  ]).stdout;
  const untracked = git([
    'ls-files',
    '--others',
    '--exclude-standard',
    '--',
    'src',
    'prisma',
  ]).stdout;
  assert(
    'U',
    'U1 the only file under src or prisma that differs from GTC-407’s base (1b8bfe7) is src/app/plan/new/page.tsx, and nothing new is waiting there; but the cancel page, which GTC-408 edits, not between the base and GTC-408’s base (c227e81); and the four pages GTC-409 restyles not between the base and GTC-409’s base (b05cac3); and the three files GTC-411 edits, not between the base and GTC-411’s base (7597112), and the rule’s file it adds, not there',
    CHECKS.onlyThePage(changed, untracked) &&
      git(['cat-file', '-e', `${GTC408_BASE}:${NOT_TOUCHED_TILL_GTC408[0]}`]).status === 0 &&
      git(['diff', '--quiet', BASE, GTC408_BASE, '--', ...NOT_TOUCHED_TILL_GTC408]).status === 0 &&
      NOT_TOUCHED_TILL_GTC409.every(
        (f) => git(['cat-file', '-e', `${GTC409_BASE}:${f}`]).status === 0
      ) &&
      git(['diff', '--quiet', BASE, GTC409_BASE, '--', ...NOT_TOUCHED_TILL_GTC409]).status === 0 &&
      NOT_TOUCHED_TILL_GTC411.every(
        (f) => git(['cat-file', '-e', `${GTC411_BASE}:${f}`]).status === 0
      ) &&
      NEW_IN_GTC411.every((f) => git(['cat-file', '-e', `${GTC411_BASE}:${f}`]).status !== 0) &&
      git([
        'diff',
        '--quiet',
        BASE,
        GTC411_BASE,
        '--',
        ...NOT_TOUCHED_TILL_GTC411,
        ...NEW_IN_GTC411,
      ]).status === 0,
    `${changed.trim()} | ${untracked.trim()}`
  );
  assert(
    'U',
    'U2 package-lock.json is as at the base',
    read('package-lock.json').length > 1000 &&
      git(['diff', '--quiet', BASE, '--', 'package-lock.json']).status === 0
  );
  // GTC-397's lesson: package.json is read at a fixed commit (the one that added this suite), never
  // as it is now, so a later ticket's script line cannot turn this red.
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U3 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the base by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(BASE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BASE}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U4 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since the base',
    tracked.length === 0,
    tracked.join(', ')
  );
}

async function main() {
  layerS();
  await layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (DEMO_TWEAKS_9_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_9_DRY_RUN !== '1') {
  main()
    .catch((e) => {
      console.error(e);
      failed++;
    })
    .finally(() => {
      process.exit(failed > 0 ? 1 : 0);
    });
}
