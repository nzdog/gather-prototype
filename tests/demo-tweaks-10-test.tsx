/**
 * [[GTC-408]] — THE CANCEL PAGE'S ADDRESS: one address on one static page, a tidy found in
 * GTC-407. One file changes: src/app/billing/cancel/page.tsx.
 *
 * THE RULING THIS SUITE PINS (the founder, 27 Oct 2026)
 *   The "Contact support" link on the cancel page opens mailto:hello@gatheringtogether.co.nz, the
 *   address ruled for the paying page in GTC-407, read from GATHER_CONTACT_EMAIL in
 *   src/lib/email-footer.ts (written once there). No new words: the link text "Contact support"
 *   and every other word on the page stay.
 *
 * THE LAYERS
 *   S  the source: the page imports GATHER_CONTACT_EMAIL and builds its one mailto from it; the
 *      old address nowhere in the file (comments included); the footer's constant is the ruled
 *      address; the file is the base's file (c227e81) plus the import and the one href, nothing
 *      else.
 *   R  the page rendered (renderToStaticMarkup): its one mailto is the ruled address, on the
 *      "Contact support" link; no old address; its words and links are the base's, typed here by
 *      hand and checked against the base's source too.
 *   U  CONTROL: the only file under src or prisma that differs from c227e81 is the cancel page;
 *      the lockfile is as it was; package.json (at the commit that added this suite) differs by its
 *      one script line; the two untracked scripts are in no commit.
 *
 * Every condition lives in CHECKS, so it can be dry-run on a passing and a failing input
 * (DEMO_TWEAKS_10_DRY_RUN=1 imports CHECKS only). Every expected value is written here by hand,
 * never taken from the code under test. The suite needs no dev server and touches no database.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { installProviderTrap } from './helpers/provider-trap';
import * as FOOTER_MODULE from '../src/lib/email-footer';
import BillingCancelPage from '../src/app/billing/cancel/page';

installProviderTrap();

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
const count = (s: string, needle: string) => s.split(needle).length - 1;

// ── The ruled address and the page's words, typed by hand ────────────────────
const NEW_ADDRESS = 'hello@gatheringtogether.co.nz';
const OLD_ADDRESS = 'support@gather.app';
/** Every word the page shows, in order, as at the base (c227e81). */
const WORDS = [
  'Checkout Cancelled',
  'You have cancelled the checkout process. No charges were made to your account.',
  'Try Again',
  'Return Home',
  'Need help?',
  'Contact support',
];
/** Every link the page holds, in order: [href, text]. */
const LINKS: Array<[string, string]> = [
  ['/billing/upgrade', 'Try Again'],
  ['/', 'Return Home'],
  [`mailto:${NEW_ADDRESS}`, 'Contact support'],
];

// ── Files and commits ────────────────────────────────────────────────────────
const SUITE = 'tests/demo-tweaks-10-test.tsx';
const PAGE = 'src/app/billing/cancel/page.tsx';
const FOOTER = 'src/lib/email-footer.ts';
/** GTC-407's last commit (its ticket), where this ticket started: a fixed commit. */
const BASE = 'c227e81f39ab8fffbcf9ece3cd774125787e47cc';
const NEW_SCRIPT = 'test:demo-tweaks-10';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-10-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

/** The two pieces this ticket changes in the page, typed by hand. */
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
const BASE_IMPORTS = "import Link from 'next/link';\n";
const NEW_IMPORTS =
  "import Link from 'next/link';\n" +
  "// [[GTC-408]] (ruling): Gather's contact address, written once, in src/lib/email-footer.ts.\n" +
  "import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';\n";
const BASE_HREF = '<a href="mailto:support@gather.app" className="text-sage-600 hover:underline">';
const NEW_HREF =
  '<a href={`mailto:${GATHER_CONTACT_EMAIL}`} className="text-sage-600 hover:underline">';

/** The text a person reads in a rendered page: tags out, entities back, spaces squashed. */
const textOf = (html: string) =>
  squash(
    html
      .replace(/<svg[\s\S]*?<\/svg>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;|&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&amp;/g, '&')
  );
const linksOf = (html: string): Array<[string, string]> =>
  [...html.matchAll(/<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => [
    m[1],
    textOf(m[2]),
  ]);

// ── CHECKS: every condition, so each can be dry-run ──────────────────────────
export const CHECKS = {
  /** S1 — the page imports the footer's constant and builds its one mailto from it. */
  builtFromConstant(src: string) {
    const code = stripComments(src);
    return (
      /import \{ GATHER_CONTACT_EMAIL \} from '@\/lib\/email-footer';/.test(code) &&
      code.includes('href={`mailto:${GATHER_CONTACT_EMAIL}`}') &&
      count(code, 'mailto:') === 1 &&
      !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(code.replace(/'@\/lib\/email-footer'/g, ''))
    );
  },
  /** S2 — the old address nowhere in the file, comments included. */
  oldAddressGone(src: string) {
    return src.length > 0 && !src.includes(OLD_ADDRESS) && !src.includes('gather.app');
  },
  /** S3 — the footer's constant is the ruled address, typed here by hand. */
  constantIsRuled(value: unknown) {
    return value === NEW_ADDRESS;
  },
  /** S4 — the file is the base's file with the import added and the one href changed. */
  onlyTheTwoPieces(now: string, base: string) {
    return (
      base.length > 0 &&
      count(base, BASE_IMPORTS) === 1 &&
      count(base, BASE_HREF) === 1 &&
      now === base.replace(BASE_IMPORTS, NEW_IMPORTS).replace(BASE_HREF, NEW_HREF)
    );
  },
  /** R1 — the rendered page's one mailto is the ruled address, on "Contact support". */
  renderedMailto(html: string) {
    const mailtos = linksOf(html).filter(([href]) => href.startsWith('mailto:'));
    return (
      count(html, 'mailto:') === 1 &&
      mailtos.length === 1 &&
      mailtos[0][0] === `mailto:${NEW_ADDRESS}` &&
      mailtos[0][1] === 'Contact support'
    );
  },
  /** R2 — the rendered page holds no old address. */
  renderedNoOld(html: string) {
    return html.length > 0 && !html.includes(OLD_ADDRESS) && !html.includes('gather.app');
  },
  /** R3 — the words and links a person sees are the base's, typed here by hand. */
  sameWords(html: string, baseSrc: string) {
    const baseCode = squash(stripComments(baseSrc));
    return (
      textOf(html) === WORDS.join(' ') &&
      JSON.stringify(linksOf(html)) === JSON.stringify(LINKS) &&
      WORDS.every((w) => baseCode.includes(w)) &&
      LINKS.slice(0, 2).every(([href]) => baseCode.includes(`href="${href}"`))
    );
  },
  /** U1 — the only file under src or prisma that differs from the base is the page. */
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

// ══ S — THE SOURCE ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the source');
  const page = read(PAGE);
  const base = atRef(BASE, PAGE);
  assert(
    'S',
    'S1 the page imports GATHER_CONTACT_EMAIL from src/lib/email-footer.ts and builds its one mailto from it; no address is typed into the page',
    CHECKS.builtFromConstant(page)
  );
  assert(
    'S',
    `S2 the old address (${OLD_ADDRESS}) is nowhere in the page, comments included`,
    CHECKS.oldAddressGone(page)
  );
  assert(
    'S',
    `S3 GATHER_CONTACT_EMAIL in ${FOOTER} is ${NEW_ADDRESS}`,
    CHECKS.constantIsRuled((FOOTER_MODULE as Record<string, unknown>).GATHER_CONTACT_EMAIL),
    String((FOOTER_MODULE as Record<string, unknown>).GATHER_CONTACT_EMAIL)
  );
  assert(
    'S',
    'S4 the page is as at the base (c227e81) but the import and the one href: no other byte moves',
    CHECKS.onlyTheTwoPieces(page, base)
  );
}

// ══ R — THE PAGE RENDERED ════════════════════════════════════════════════════
function layerR() {
  section('R — the page rendered');
  let html = '';
  try {
    html = renderToStaticMarkup(createElement(BillingCancelPage));
  } catch (e) {
    assert('R', 'the page renders', false, String(e));
    return;
  }
  const base = atRef(BASE, PAGE);
  assert(
    'R',
    `R1 the rendered page's one mailto is mailto:${NEW_ADDRESS}, on the "Contact support" link`,
    CHECKS.renderedMailto(html),
    JSON.stringify(linksOf(html))
  );
  assert('R', 'R2 the rendered page holds no old address', CHECKS.renderedNoOld(html));
  assert(
    'R',
    'R3 no new words: the words and links a person sees are the base’s (c227e81), "Contact support" included',
    CHECKS.sameWords(html, base),
    textOf(html)
  );
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
    'U1 the only file under src or prisma that differs from GTC-408’s base (c227e81) is src/app/billing/cancel/page.tsx, and nothing new is waiting there; but the four pages GTC-409 restyles, not between the base and GTC-409’s base (b05cac3); and the three files GTC-411 edits, not between the base and GTC-411’s base (7597112), and the rule’s file it adds, not there',
    CHECKS.onlyThePage(changed, untracked) &&
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

function main() {
  layerS();
  layerR();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (DEMO_TWEAKS_10_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_10_DRY_RUN !== '1') {
  try {
    main();
  } catch (e) {
    console.error(e);
    failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}
