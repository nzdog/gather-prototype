/**
 * [[GTC-418]] — TICKET C, THE PAID SCREEN (tweak 4, the founder's ruling of 28 Oct 2026, Batch 2
 * Part A). One file changes: src/app/plan/new/page.tsx.
 *
 * THE RULING THIS SUITE PINS
 *   - A new "paid" state, shown after the event is made and BEFORE she moves on to setup: heading
 *     "You're all set!", line "Your event “<name>” is paid for and ready.", one button "Start with
 *     your people →" that goes to setup, the same place as before. No timer, no automatic move.
 *   - The signed-out screen keeps everything but its heading and first line, which take the same
 *     new words. The sign-in-link sentence and its button stay as they are.
 *   - Nothing about the payment changes; the paid-before, cancelled and error screens are untouched.
 *   - A refresh on the new screen must not call the payment check again: the address becomes
 *     setup's before the screen shows, so a refresh opens setup, as it did before.
 *
 * THE LAYERS
 *   P  the page's source, read from the working folder, against the Batch 1 tip (0680dfc, a fixed
 *      commit), with every expected piece typed here by hand.
 *   U  CONTROL: between the Batch 1 tip and Ticket C's code commit (both fixed) only the page
 *      changed; package.json (at the commit that added this suite) differs by its one script
 *      line; the two untracked scripts are in no commit.
 *
 * No database, no server, no provider. Every condition lives in CHECKS, so it can be dry-run on a
 * passing and a failing input (TWEAKS_C_DRY_RUN=1 imports CHECKS only).
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.join(__dirname, '..');

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
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
/** Code only: block, JSX and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** The text from `from` up to (not including) the next `to`; '' if either is missing. */
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};
type Pairs = Array<[string, string]>;
/** The base's text with each pair's old piece (found exactly once) replaced; null otherwise. */
function applyPairs(base: string, pairs: Pairs): string | null {
  let s = base;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, () => b);
  }
  return s;
}

// ── Files and commits ────────────────────────────────────────────────────────
const PAGE = 'src/app/plan/new/page.tsx';
const SUITE = 'tests/tweaks-c-test.tsx';
/** Batch 1's tip (GTC-417's results commit, GitHub's main on 29 Oct 2026): a fixed commit. */
const BASE = '0680dfca9ff10b742559e66afa898dc482670b1e';
/** Ticket C's code commit: a fixed commit. */
const CODE_C = '6761488dc8cc6c23e0efdb3cce72bfd63ed78729';
/** The files Ticket C's code commit may change since the base: the prompt's list, by hand. */
const CODE_FILES = [PAGE];
const NEW_SCRIPT = 'test:tweaks-c';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-c-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The ruled words, typed by hand (as the page writes them) ─────────────────
const ALL_SET = '>You&rsquo;re all set!</h2>';
const PAID_LINE = 'Your event &ldquo;{paidEvent.name}&rdquo; is paid for and ready.';
const EMAILED_LINE = 'Your event &ldquo;{handoff.eventName}&rdquo; is paid for and ready.';
const BUTTON_WORDS = 'Start with your people →';
const RECEIVED = '>Payment received</h2>';
const TO_SETUP = 'onClick={() => window.location.replace(`/plan/${paidEvent.id}/setup`)}';
/** Where the signed-in payer went before, at once (the base's success branch). */
const BASE_TO_SETUP = 'window.location.replace(`/plan/${result.event.id}/setup`);';

// ── The exact pieces Ticket C changes, typed by hand (the base's file -> now) ─
const OLD_SUCCESS =
  '      if (result.alreadySignedIn) {\n' +
  '        // Still a full page load so the server layout picks up her session;\n' +
  '        // `replace` rather than `assign` so Back does not return to the consumed\n' +
  '        // creation form (its sessionStorage draft is cleared just above).\n' +
  '        window.location.replace(`/plan/${result.event.id}/setup`);\n' +
  '        return;\n';
const NEW_SUCCESS =
  '      if (result.alreadySignedIn) {\n' +
  '        /*\n' +
  '         * [[GTC-418]] (tweak 4): "You\'re all set!" first; its button goes on to setup. The\n' +
  "         * address becomes setup's now (no load, no request), so a refresh opens setup as it did\n" +
  '         * before and never asks for the payment again, and Back skips the used return address.\n' +
  '         */\n' +
  "        window.history.replaceState(window.history.state, '', `/plan/${result.event.id}/setup`);\n" +
  '        setPaidEvent({ id: result.event.id, name: result.event.name });\n' +
  "        setPageState('paid');\n" +
  '        return;\n';
const GTC280_HEAD = '  /*\n   * GTC-280 — payment received, and the link is the way in.\n';
const PAID_BLOCK =
  "  // [[GTC-418]] (tweak 4): the signed-in payer's screen. No timer: she moves on when she presses.\n" +
  "  if (pageState === 'paid' && paidEvent) {\n" +
  '    return (\n' +
  '      <div className="min-h-screen bg-gray-50 flex items-center justify-center">\n' +
  '        <div className="max-w-md w-full mx-4">\n' +
  '          <div className="bg-white rounded-lg shadow-md p-8">\n' +
  '            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&rsquo;re all set!</h2>\n' +
  '            <p className="text-gray-600 mb-6">\n' +
  '              Your event &ldquo;{paidEvent.name}&rdquo; is paid for and ready.\n' +
  '            </p>\n' +
  '            {/* A full page load, so the server layout picks up her session; `replace`, so Back\n' +
  '                does not return to this screen. */}\n' +
  '            <button\n' +
  '              onClick={() => window.location.replace(`/plan/${paidEvent.id}/setup`)}\n' +
  '              className="block w-full text-center px-6 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent-dark"\n' +
  '            >\n' +
  '              Start with your people →\n' +
  '            </button>\n' +
  '          </div>\n' +
  '        </div>\n' +
  '      </div>\n' +
  '    );\n' +
  '  }\n' +
  '\n';
const OLD_EMAILED_TOP =
  '            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment received</h2>\n' +
  '            <p className="text-gray-600 mb-6">\n' +
  '              Your event &ldquo;{handoff.eventName}&rdquo; is ready.\n';
const NEW_EMAILED_TOP =
  '            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&rsquo;re all set!</h2>\n' +
  '            <p className="text-gray-600 mb-6">\n' +
  '              Your event &ldquo;{handoff.eventName}&rdquo; is paid for and ready.\n';
const C_PAIRS: Pairs = [
  [
    "type PageState = 'form' | 'creating' | 'canceled' | 'error' | 'emailed' | 'paid-before';\n",
    "// [[GTC-418]] (tweak 4): 'paid' is the signed-in payer's \"You're all set!\", before setup.\n" +
      "type PageState = 'form' | 'creating' | 'canceled' | 'error' | 'emailed' | 'paid-before' | 'paid';\n",
  ],
  [
    '  const [retrySessionId, setRetrySessionId] = useState<string | null>(null);\n',
    '  const [retrySessionId, setRetrySessionId] = useState<string | null>(null);\n' +
      '  // [[GTC-418]] (tweak 4): the event the payment just made, as the server named it.\n' +
      '  const [paidEvent, setPaidEvent] = useState<{ id: string; name: string } | null>(null);\n',
  ],
  [OLD_SUCCESS, NEW_SUCCESS],
  [GTC280_HEAD, PAID_BLOCK + GTC280_HEAD],
  [OLD_EMAILED_TOP, NEW_EMAILED_TOP],
];

// ── Markers that cut the page into its parts (as both files write them) ──────
const M_PAID = "  if (pageState === 'paid' && paidEvent) {";
const M_EMAILED = "  if (pageState === 'emailed' && handoff) {";
const M_PAID_BEFORE_HEAD = '  /*\n   * [[GTC-407]] (ruling 1): she is back';
const M_RETURN_FLOW = '  // Handle Stripe return flow';
const M_SUCCESS = '      if (result.alreadySignedIn) {';
const M_HANDOFF = '      setHandoff({';
const M_DATES = '  const dates: DatePairValue';
const M_CREATING = '  // Loading state while creating event';
const M_NEW_HEAD = "  // [[GTC-418]] (tweak 4): the signed-in payer's screen.";

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  /** P1 — the page is the base's file with exactly Ticket C's pieces put in, byte for byte. */
  exactly(now: string, base: string) {
    const expected = base.length > 1000 ? applyPairs(base, C_PAIRS) : null;
    return expected !== null && now === expected;
  },
  /** P2 — the paid screen: the heading, the line and the one button, in the ruled words. */
  paidScreen(now: string) {
    const block = stripComments(between(now, M_PAID, GTC280_HEAD));
    return (
      block.length > 300 &&
      count(block, ALL_SET) === 1 &&
      count(squash(block), PAID_LINE) === 1 &&
      count(block, '<h2') === 1 &&
      count(block, '<p ') === 1 &&
      count(block, '<button') === 1 &&
      squash(block).includes(`> ${BUTTON_WORDS} </button>`) &&
      !block.includes('<a') &&
      !block.includes('href')
    );
  },
  /** P3 — the button goes to setup, the address the payer went to before, by the event's id. */
  toSetup(now: string, base: string) {
    const block = stripComments(between(now, M_PAID, GTC280_HEAD));
    const success = stripComments(between(now, M_SUCCESS, M_HANDOFF));
    return (
      count(block, TO_SETUP) === 1 &&
      count(stripComments(between(base, M_SUCCESS, M_HANDOFF)), BASE_TO_SETUP) === 1 &&
      success.includes('setPaidEvent({ id: result.event.id, name: result.event.name });') &&
      count(stripComments(now), 'setPaidEvent(') === 1
    );
  },
  /** P4 — no timer and no automatic move: she leaves the screen only by pressing the button. */
  noTimer(now: string, base: string) {
    const code = stripComments(now);
    const was = stripComments(base);
    const success = stripComments(between(now, M_SUCCESS, M_HANDOFF));
    return (
      code.length > 1000 &&
      !/\b(setTimeout|setInterval|requestAnimationFrame|requestIdleCallback)\s*\(/.test(code) &&
      count(code, 'window.location.replace(') === 1 &&
      count(code, 'window.location.replace(') === count(was, 'window.location.replace(') &&
      count(code, 'window.location.href =') === count(was, 'window.location.href =') &&
      count(code, 'window.location.assign(') === 0 &&
      count(code, 'router.push(') === count(was, 'router.push(') &&
      count(code, 'router.replace(') === 0 &&
      count(code, 'useEffect(') === count(was, 'useEffect(') &&
      success.length > 100 &&
      !success.includes('location.') &&
      !success.includes('router.')
    );
  },
  /** P5 — the payment check is made exactly as before: the effect, the call and its answers. */
  paymentAsBefore(now: string, base: string) {
    const was = between(base, M_RETURN_FLOW, M_SUCCESS);
    const tail = between(base, M_HANDOFF, M_DATES);
    return (
      was.length > 1500 &&
      was.includes("fetch('/api/events', {") &&
      was.includes('body: JSON.stringify({ stripeSessionId: sessionId }),') &&
      between(now, M_RETURN_FLOW, M_SUCCESS) === was &&
      tail.length > 300 &&
      between(now, M_HANDOFF, M_DATES) === tail &&
      count(stripComments(now), "fetch('/api/events'") === 1 &&
      count(stripComments(now), 'stripeSessionId') === count(stripComments(base), 'stripeSessionId')
    );
  },
  /**
   * P6 — the signed-out screen: "Payment received" gone from it (left on the paid-before screen
   * only), its heading and first line the new words, and everything else in it as before.
   */
  signedOut(now: string, base: string) {
    const is = between(now, M_EMAILED, M_PAID_BEFORE_HEAD);
    const was = between(base, M_EMAILED, M_PAID_BEFORE_HEAD);
    const code = stripComments(now);
    const paidBefore = between(
      code,
      "  if (pageState === 'paid-before') {",
      "  if (pageState === 'canceled') {"
    );
    return (
      was.length > 1500 &&
      count(was, OLD_EMAILED_TOP) === 1 &&
      is === was.replace(OLD_EMAILED_TOP, () => NEW_EMAILED_TOP) &&
      count(is, ALL_SET) === 1 &&
      count(squash(is), EMAILED_LINE) === 1 &&
      !is.includes(RECEIVED) &&
      is.includes('We&rsquo;ve sent a sign-in link to <strong>{handoff.sentTo}</strong>.') &&
      count(is, '>\n              Go to sign-in\n            </a>') === 1 &&
      count(is, 'href="/auth/signin"') === 1 &&
      count(code, RECEIVED) === 1 &&
      count(paidBefore, RECEIVED) === 1
    );
  },
  /** P7 — the other screens as before: creating, paid-before, cancelled, error and the form. */
  othersAsBefore(now: string, base: string) {
    const creatingWas = between(base, M_CREATING, GTC280_HEAD);
    const creatingIs = between(now, M_CREATING, M_NEW_HEAD);
    const restWas = base.slice(base.indexOf(M_PAID_BEFORE_HEAD));
    const restIs = now.slice(now.indexOf(M_PAID_BEFORE_HEAD));
    return (
      creatingWas.length > 200 &&
      creatingIs === creatingWas &&
      base.indexOf(M_PAID_BEFORE_HEAD) > 0 &&
      now.indexOf(M_PAID_BEFORE_HEAD) > 0 &&
      restWas.length > 4000 &&
      restIs === restWas
    );
  },
  /**
   * P8 — a refresh cannot ask for the payment again: in the signed-in success the address becomes
   * setup's (no load) before the paid screen is set, and nothing else happens there.
   */
  refreshSafe(now: string) {
    const success = squash(stripComments(between(now, M_SUCCESS, M_HANDOFF)));
    return (
      success ===
      squash(
        "if (result.alreadySignedIn) { window.history.replaceState(window.history.state, '', `/plan/${result.event.id}/setup`); setPaidEvent({ id: result.event.id, name: result.event.name }); setPageState('paid'); return; }"
      )
    );
  },
  /** U1 — the files the code commit changed since the base are exactly this ticket's list. */
  sameList(changed: string | null, list: string[]) {
    if (changed === null) return false;
    const got = changed.split('\n').filter(Boolean).sort();
    return JSON.stringify(got) === JSON.stringify([...list].sort());
  },
  /** U2 — package.json at the commit that added this suite differs by the one script line. */
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

function layerP() {
  section('P — the paying page, against the Batch 1 tip (0680dfc)');
  const now = read(PAGE);
  const base = atRef(BASE, PAGE);
  assert(
    'P',
    'P1 the page is the Batch 1 tip’s file with exactly Ticket C’s five pieces put in, byte for byte (the state, the event, the signed-in success, the paid screen, the signed-out heading and line)',
    CHECKS.exactly(now, base)
  );
  assert(
    'P',
    'P2 the paid screen says "You’re all set!", "Your event “<name>” is paid for and ready." and has one button, "Start with your people →", and no link',
    CHECKS.paidScreen(now)
  );
  assert(
    'P',
    'P3 the button goes to /plan/<the event’s id>/setup, where the signed-in payer went before; the screen holds only the event’s id and name, from the answer the page already had',
    CHECKS.toSetup(now, base)
  );
  assert(
    'P',
    'P4 no timer and no automatic move: no setTimeout, setInterval or animation frame anywhere; the one location.replace is the button’s; the signed-in success moves nowhere by itself',
    CHECKS.noTimer(now, base)
  );
  assert(
    'P',
    'P5 the payment check is made exactly as before: the return effect, the POST to /api/events with {stripeSessionId}, its answers, and the signed-out path after it, byte for byte',
    CHECKS.paymentAsBefore(now, base)
  );
  assert(
    'P',
    'P6 "Payment received" is gone from the signed-out screen (left on the paid-before screen only); its heading and first line are the new words; the sign-in-link sentence, "Go to sign-in" and the rest are as before',
    CHECKS.signedOut(now, base)
  );
  assert(
    'P',
    'P7 CONTROL: "Creating your event...", the paid-before, cancelled and error screens and the form are as at the base, byte for byte',
    CHECKS.othersAsBefore(now, base)
  );
  assert(
    'P',
    'P8 a refresh cannot ask for the payment again: the signed-in success makes the address setup’s (no load), then shows the paid screen, and does nothing else',
    CHECKS.refreshSafe(now)
  );
}

function layerU() {
  section('U — CONTROL: what Ticket C touched, between fixed commits');
  const r = git(['diff', '--name-only', BASE, CODE_C]);
  const changed = r.status === 0 ? r.stdout : null;
  assert(
    'U',
    `U1 the files changed between the Batch 1 tip (0680dfc) and Ticket C’s code commit (${CODE_C.slice(0, 7)}) are exactly: ${CODE_FILES.join(', ')}`,
    CHECKS.sameList(changed, CODE_FILES),
    String(changed)
  );
  assert(
    'U',
    'U2 Ticket C’s code commit stands straight on the Batch 1 tip (its one parent)',
    git(['rev-parse', `${CODE_C}^@`]).stdout.trim() === BASE
  );
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

function main() {
  layerP();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS only (TWEAKS_C_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_C_DRY_RUN !== '1') main();
