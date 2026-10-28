/**
 * [[GTC-415]] — TICKET A, "FIRST LOOK": tweaks 2, 3, 13, 17, 18 and the privacy page's address.
 *
 * THE RULINGS THIS SUITE PINS (the founder, 28 Oct 2026, in Cowork; words in quotes exactly)
 *    2  The top-right button reads "Host Sign In" (computer bar and phone menu), same address.
 *    3  The sign-in page says "We've sent a sign-in link to your email address. It can take up to
 *       five minutes to arrive, so check your spam folder too. The link works for 15 minutes."
 *       (a plain straight apostrophe); the heading stays.
 *   13  The "Browse event templates" block leaves the home page; /plan/templates stays.
 *   17  The account menu (computer and phone): Billing, "Help and support" (an email to the
 *       support address, subject "Help with Gather"), "Send feedback" (subject "Feedback on
 *       Gather"), Sign Out last. Billing still after the email (phone-menu M3). Plain links only
 *       (batch12 S5). [[GTC-417]] (the founder's ruling, 28 Oct 2026): the account menu's own
 *       "Your events" taken OUT again (the bar has its own "Your Events"); never there now.
 *   18  One small line, "Need help? Email" and the support address as a mail link, read from
 *       src/lib/email-footer.ts, on the error and not-found pages, the sign-in page, the sign-in
 *       link's error page and the paying page's cancelled screen; on none of the paid-before
 *       screen, the cancel page or a guest page. The error page: "Something went wrong on our
 *       side." and "Try again"; the not-found page: "We can't find that page." and "Go to the
 *       home page".
 *       And the privacy page's privacy@gather.nz becomes the same address, nothing else there.
 *
 * THE LAYERS
 *   A  the sign-in label (a)          B  the sign-in page's sentence (b)
 *   C  the templates block (c)        D  the account menu (d)
 *   E  the help line and the two new pages (e)
 *   F  the privacy page (f)           G  the files the code commit changed (g), fixed commits
 *
 * Every expected value is written here by hand, never taken from the code under test. The pages
 * that draw without Next's router are rendered (renderToStaticMarkup); the others are read as
 * source. Each file is also asked to be T0's file (f3b084a) with exactly this ticket's pieces
 * changed, so no other byte moves. No dev server, no database, no provider, no network.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { installProviderTrap } from './helpers/provider-trap';
import * as FOOTER_MODULE from '../src/lib/email-footer';
import NeedHelp from '../src/components/shared/NeedHelp';
import ErrorPage from '../src/app/error';
import NotFound from '../src/app/not-found';
import SignInPage from '../src/app/auth/signin/page';
import PrivacyPolicy from '../src/app/privacy/page';

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
/** Code only: block, JSX and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const count = (s: string, needle: string) => (needle ? s.split(needle).length - 1 : 0);
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const between = (s: string, from: string, to: string) => {
  const i = s.indexOf(from);
  const j = i < 0 ? -1 : s.indexOf(to, i + from.length);
  return i < 0 || j < 0 ? '' : s.slice(i, j);
};
/** Every file under a folder, relative to the repo, by walking the disk. */
const walk = (rel: string): string[] => {
  const out: string[] = [];
  const go = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) go(p);
      else out.push(p);
    }
  };
  go(rel);
  return out.sort();
};

/** The text a person reads in rendered HTML: tags out, entities back, spaces squashed. */
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
    m[1].replace(/&amp;/g, '&'),
    textOf(m[2]),
  ]);
const render = (el: ReactElement) => {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.log(`    (render threw: ${String((e as Error).message).split('\n')[0]})`);
    return '';
  }
};

// ── The rulings' words and the address, typed by hand ────────────────────────
const ADDRESS = 'hello@gatheringtogether.co.nz';
const HOST_SIGN_IN = 'Host Sign In';
const SENTENCE =
  "We've sent a sign-in link to your email address. It can take up to five minutes to arrive, so check your spam folder too. The link works for 15 minutes.";
const OLD_SENTENCE = "We've sent a magic link to your email address. It will expire in 15 minutes.";
const SUCCESS_HEADING = 'Check your email for a sign-in link';
const HELP_WORDS = 'Need help? Email';
const HELP_LINE = `${HELP_WORDS} ${ADDRESS}`;
const ERROR_WORDS = 'Something went wrong on our side.';
const TRY_AGAIN = 'Try again';
const NOT_FOUND_WORDS = "We can't find that page.";
const HOME_LINK = 'Go to the home page';
const HELP_HREF = `mailto:${ADDRESS}?subject=Help%20with%20Gather`;
const FEEDBACK_HREF = `mailto:${ADDRESS}?subject=Feedback%20on%20Gather`;
const OLD_PRIVACY = 'privacy@gather.nz';

// ── Files and commits ────────────────────────────────────────────────────────
/** T0's tip (GTC-414's ticket commit): this batch builds on it. A fixed commit. */
const T0_TIP = 'f3b084ad414f13f880747f44df026f1cdb5f33e3';
/** Batch 1's Part 0: the guard's four more things (tests/tweaks-guard-test.ts only). */
const PART0 = 'ab334a81b8097a164679eb80956f776b84a69bf2';
/** Ticket A's code commit. A fixed commit. */
const CODE_A = 'a98f16ba262f3a483dc2977a04310063a09823b8';
const NAV = 'src/components/shared/Navigation.tsx';
const SIGNIN = 'src/app/auth/signin/page.tsx';
const VERIFY = 'src/app/auth/verify/page.tsx';
const HOME = 'src/app/page.tsx';
const TEMPLATES = 'src/app/plan/templates/page.tsx';
const PAYING = 'src/app/plan/new/page.tsx';
const PRIVACY = 'src/app/privacy/page.tsx';
const ERROR_PAGE = 'src/app/error.tsx';
const NOT_FOUND = 'src/app/not-found.tsx';
const NEED_HELP = 'src/components/shared/NeedHelp.tsx';
const FOOTER = 'src/lib/email-footer.ts';
const CANCEL_PAGE = 'src/app/billing/cancel/page.tsx';
const GUARD = 'tests/tweaks-guard-test.ts';
const SUITE = 'tests/tweaks-a-test.tsx';
/** The files Ticket A's code commit may change since T0's tip: this prompt's list, by hand. */
const CODE_FILES = [
  ERROR_PAGE,
  SIGNIN,
  VERIFY,
  NOT_FOUND,
  HOME,
  PAYING,
  PRIVACY,
  NAV,
  NEED_HELP,
  GUARD, // Part 0, the commit before the code's
].sort();
/** The five places that carry the help line, and nowhere else. */
const HELP_PLACES = [ERROR_PAGE, SIGNIN, VERIFY, NOT_FOUND, PAYING].sort();
const NEW_SCRIPT = 'test:tweaks-a';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-a-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The exact pieces each file changes, typed by hand (T0's file -> now) ──────
type Pairs = Array<[string, string]>;
const NEED_HELP_IMPORT = "import NeedHelp from '@/components/shared/NeedHelp';\n";
const SIGNIN_PAIRS: Pairs = [
  ["import Image from 'next/image';\n", `import Image from 'next/image';\n${NEED_HELP_IMPORT}`],
  [
    "                    We've sent a magic link to your email address. It will expire in 15 minutes.\n",
    "                    We've sent a sign-in link to your email address. It can take up to five minutes\n" +
      '                    to arrive, so check your spam folder too. The link works for 15 minutes.\n',
  ],
  [
    "            No password required. We'll send you a secure link to sign in.\n          </p>\n",
    "            No password required. We'll send you a secure link to sign in.\n          </p>\n" +
      '          {/* [[GTC-415]] tweak 18: the one help line. */}\n' +
      '          <NeedHelp className="mt-4" />\n',
  ],
];
const VERIFY_PAIRS: Pairs = [
  ["import Image from 'next/image';\n", `import Image from 'next/image';\n${NEED_HELP_IMPORT}`],
  [
    '          {action}\n        </a>\n      </div>\n    </div>\n',
    '          {action}\n        </a>\n      </div>\n' +
      '      {/* [[GTC-415]] tweak 18: the one help line. */}\n' +
      '      <NeedHelp className="mt-6" />\n    </div>\n',
  ],
];
const HOME_BLOCK =
  '\n        {/* Secondary Links */}\n' +
  '        <div className="text-center">\n' +
  '          <p className="text-gray-500 text-sm">\n' +
  "            Browse{' '}\n" +
  '            <a\n' +
  '              href="/plan/templates"\n' +
  '              className="text-accent hover:text-accent-dark underline font-medium"\n' +
  '            >\n' +
  '              event templates\n' +
  "            </a>{' '}\n" +
  '            to get started quickly\n' +
  '          </p>\n' +
  '        </div>\n';
const HOME_PAIRS: Pairs = [[HOME_BLOCK, '']];
const PAYING_PAIRS: Pairs = [
  [
    "import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';\n",
    "import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';\n" +
      '// [[GTC-415]] tweak 18: the one help line, on the cancelled screen only.\n' +
      NEED_HELP_IMPORT,
  ],
  [
    '              Try Again\n            </button>\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  // Error state',
    '              Try Again\n            </button>\n            <NeedHelp className="mt-4" />\n          </div>\n        </div>\n      </div>\n    );\n  }\n\n  // Error state',
  ],
];
/**
 * [[GTC-418]] (Ticket C, tweak 4, the founder's ruling of 28 Oct 2026): the paying page gains the
 * signed-in payer's "You're all set!" screen, and the signed-out screen's heading and first line
 * take the new words. E9 still asks for the whole file byte for byte: T0's file, Ticket A's help
 * line, and exactly these pieces, typed here by hand.
 */
const GTC418_PAYING_PAIRS: Pairs = [
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
  [
    '      if (result.alreadySignedIn) {\n' +
      '        // Still a full page load so the server layout picks up her session;\n' +
      '        // `replace` rather than `assign` so Back does not return to the consumed\n' +
      '        // creation form (its sessionStorage draft is cleared just above).\n' +
      '        window.location.replace(`/plan/${result.event.id}/setup`);\n' +
      '        return;\n',
    '      if (result.alreadySignedIn) {\n' +
      '        /*\n' +
      '         * [[GTC-418]] (tweak 4): "You\'re all set!" first; its button goes on to setup. The\n' +
      "         * address becomes setup's now (no load, no request), so a refresh opens setup as it did\n" +
      '         * before and never asks for the payment again, and Back skips the used return address.\n' +
      '         */\n' +
      "        window.history.replaceState(window.history.state, '', `/plan/${result.event.id}/setup`);\n" +
      '        setPaidEvent({ id: result.event.id, name: result.event.name });\n' +
      "        setPageState('paid');\n" +
      '        return;\n',
  ],
  [
    '  /*\n   * GTC-280 — payment received, and the link is the way in.\n',
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
      '\n' +
      '  /*\n   * GTC-280 — payment received, and the link is the way in.\n',
  ],
  [
    '            <h2 className="text-2xl font-bold text-gray-900 mb-2">Payment received</h2>\n' +
      '            <p className="text-gray-600 mb-6">\n' +
      '              Your event &ldquo;{handoff.eventName}&rdquo; is ready.\n',
    '            <h2 className="text-2xl font-bold text-gray-900 mb-2">You&rsquo;re all set!</h2>\n' +
      '            <p className="text-gray-600 mb-6">\n' +
      '              Your event &ldquo;{handoff.eventName}&rdquo; is paid for and ready.\n',
  ],
];
const PRIVACY_LINK_OLD =
  '<a href="mailto:privacy@gather.nz" className="text-accent hover:underline">\n' +
  '                privacy@gather.nz\n' +
  '              </a>';
const PRIVACY_LINK_NEW =
  '<a href={`mailto:${GATHER_CONTACT_EMAIL}`} className="text-accent hover:underline">\n' +
  '                {GATHER_CONTACT_EMAIL}\n' +
  '              </a>';
const PRIVACY_HEAD = 'export default function PrivacyPolicy() {';
const PRIVACY_IMPORT =
  "// [[GTC-415]]: the page's address is Gather's one contact address, written once, in\n" +
  '// src/lib/email-footer.ts.\n' +
  "import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';\n\n";
const NAV_IMPORT_OLD =
  "import { Plus, Calendar, CreditCard, LogOut, LogIn, Menu, X, ChevronDown } from 'lucide-react';\n";
const NAV_IMPORT_NEW =
  'import {\n  Plus,\n  Calendar,\n  CreditCard,\n  LogOut,\n  LogIn,\n  Menu,\n  X,\n  ChevronDown,\n' +
  "  LifeBuoy,\n  MessageSquare,\n} from 'lucide-react';\n";
const NAV_FOOTER_IMPORT = "import { GATHER_CONTACT_EMAIL } from '@/lib/email-footer';\n";
const NAV_SIGN_IN_OLD = "  const signIn = { href: '/auth/signin', label: 'Sign In' };\n";
const NAV_SIGN_IN_NEW =
  '  // [[GTC-415]] tweak 2: the button names who signs in. Same address as before.\n' +
  "  const signIn = { href: '/auth/signin', label: 'Host Sign In' };\n";
const NAV_CONSTS =
  '  /*\n' +
  '   * [[GTC-415]] tweak 17 (founder ruling, 28 Oct 2026) — the account menu, on a computer and on a\n' +
  '   * phone, reads: Billing, Help and support, Send feedback, Sign Out. Plain links (a full page\n' +
  "   * load, as Billing), no photo; the two emails go to Gather's one address, read from\n" +
  '   * src/lib/email-footer.ts, each with its own subject. [[GTC-417]]: no second "Your events"\n' +
  '   * here; the bar has its own.\n' +
  '   */\n' +
  '  const help = {\n' +
  "    href: `mailto:${GATHER_CONTACT_EMAIL}?subject=${encodeURIComponent('Help with Gather')}`,\n" +
  "    label: 'Help and support',\n" +
  '    icon: LifeBuoy,\n' +
  '  };\n' +
  '  const feedback = {\n' +
  "    href: `mailto:${GATHER_CONTACT_EMAIL}?subject=${encodeURIComponent('Feedback on Gather')}`,\n" +
  "    label: 'Send feedback',\n" +
  '    icon: MessageSquare,\n' +
  '  };\n';
/** One menu link as the computer's panel draws it (indent 20) or the phone's (indent 16). */
const navLink = (o: string, phone: boolean) => {
  const i = ' '.repeat(phone ? 16 : 20);
  return (
    `${i}<a\n${i}  href={${o}.href}\n` +
    (phone ? `${i}  onClick={() => setMenuOpen(false)}\n` : '') +
    `${i}  className="flex items-center ${phone ? 'gap-3 px-3 py-3' : 'gap-2 px-3 py-2'} rounded-md ${phone ? 'text-base' : 'text-sm'} font-medium text-gray-700 hover:bg-gray-50"\n` +
    `${i}>\n${i}  <${o}.icon className="${phone ? 'w-5 h-5' : 'w-4 h-4'}" />\n${i}  {${o}.label}\n${i}</a>\n`
  );
};
/** Navigation as T0 had it, with this ticket's pieces put in, by hand. */
function navExpected(t0: string) {
  const computerBillingOpen = '                    <a\n                      href={billing.href}\n';
  const computerBillingClose =
    '                      <billing.icon className="w-4 h-4" />\n                      {billing.label}\n                    </a>\n';
  const phoneBillingOpen = '                <a\n                  href={billing.href}\n';
  const phoneBillingClose =
    '                  <billing.icon className="w-5 h-5" />\n                  {billing.label}\n                </a>\n';
  // [[GTC-417]]: the "open" pieces are still asked once at T0, though nothing goes before them now.
  const pieces = [
    NAV_IMPORT_OLD,
    "import { COPY_WORDS, isCopyAddress } from '@/lib/demo/copy-address';\n",
    NAV_SIGN_IN_OLD,
    computerBillingOpen,
    computerBillingClose,
    phoneBillingOpen,
    phoneBillingClose,
  ];
  if (!pieces.every((p) => count(t0, p) === 1)) return null;
  return t0
    .replace(NAV_IMPORT_OLD, NAV_IMPORT_NEW)
    .replace(
      "import { COPY_WORDS, isCopyAddress } from '@/lib/demo/copy-address';\n",
      `import { COPY_WORDS, isCopyAddress } from '@/lib/demo/copy-address';\n${NAV_FOOTER_IMPORT}`
    )
    .replace(NAV_SIGN_IN_OLD, NAV_SIGN_IN_NEW + NAV_CONSTS)
    .replace(
      computerBillingClose,
      computerBillingClose + navLink('help', false) + navLink('feedback', false)
    )
    .replace(
      phoneBillingClose,
      phoneBillingClose + navLink('help', true) + navLink('feedback', true)
    );
}
/** T0's file with each pair put in; null when an old piece is not there exactly once. */
function applyPairs(t0: string, pairs: Pairs): string | null {
  let s = t0;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, b);
  }
  return s;
}

/** Walks a React element tree (functions called) to find the first element a test picks. */
function findElement(
  node: ReactNode,
  pick: (el: ReactElement<any>) => boolean
): ReactElement<any> | null {
  if (Array.isArray(node)) {
    for (const n of node) {
      const f = findElement(n, pick);
      if (f) return f;
    }
    return null;
  }
  if (!isValidElement(node)) return null;
  const el = node as ReactElement<any>;
  if (pick(el)) return el;
  return findElement(el.props?.children, pick);
}

// ── CHECKS: every condition, so each can be tried on a passing and a failing input ──────────
export const CHECKS = {
  /** A1 — the label is "Host Sign In", same address, drawn in both places from the one object. */
  signInLabel(nav: string) {
    const code = stripComments(nav);
    return (
      count(code, `const signIn = { href: '/auth/signin', label: '${HOST_SIGN_IN}' };`) === 1 &&
      !/label:\s*'Sign In'/.test(code) &&
      count(code, '{signIn.label}') === 2 &&
      count(code, 'href={signIn.href}') === 2 &&
      !/>\s*Sign In\s*</.test(code)
    );
  },
  /** B1 — the ruled sentence once, the old one gone, the heading kept. */
  signInSentence(page: string) {
    const code = squash(stripComments(page));
    return (
      count(code, SENTENCE) === 1 &&
      !code.includes(OLD_SENTENCE) &&
      !code.includes('magic link to your email') &&
      count(code, SUCCESS_HEADING) === 1 &&
      count(code, 'Sign in to Gather') === 1
    );
  },
  /** C1 — no templates block on the home page. */
  homeHasNoTemplates(home: string) {
    return (
      home.length > 0 &&
      !home.includes('/plan/templates') &&
      !home.includes('event templates') &&
      !home.includes('Browse')
    );
  },
  /** D1 — the computer's account panel, in order: Billing, Help, Feedback, Sign Out; no "Your events". */
  computerOrder(nav: string) {
    const panel = between(nav, 'id="account-menu"', '{isSigningOut ?');
    if (/yourEvents|Your events|\/plan\/events/.test(panel)) return false;
    const at = [
      'href={billing.href}',
      'href={help.href}',
      'href={feedback.href}',
      'onClick={handleSignOut}',
    ].map((m) => panel.indexOf(m));
    return panel.length > 0 && at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1]));
  },
  /** D2 — the phone's menu, in order: the email, Billing, Help, Feedback, Sign Out; no "Your events"
   * after the email (the bar's own "Your Events", above it, stays). */
  phoneOrder(nav: string) {
    const menu = nav.slice(nav.indexOf('id="site-menu"'));
    const email = '{isCopyAddress(user.email) ? COPY_WORDS.ACCOUNT : user.email}';
    const afterEmail = menu.slice(menu.indexOf(email));
    if (menu.indexOf(email) < 0 || /yourEvents|Your events|\/plan\/events/.test(afterEmail))
      return false;
    const at = [
      email,
      'href={billing.href}',
      'href={help.href}',
      'href={feedback.href}',
      'onClick={handleSignOut}',
    ].map((m) => menu.indexOf(m));
    return (
      nav.includes('id="site-menu"') && at.every((x, i) => x >= 0 && (i === 0 || x > at[i - 1]))
    );
  },
  /** D3 — the two mail links' words and addresses, each drawn twice; no account-menu "Your events"
   * (GTC-417), the bar's "Your Events" once; plain <a>, no next/link. */
  menuLinks(nav: string, hrefOf: (template: string) => string) {
    const code = stripComments(nav);
    const helpT = code.match(/const help = \{\s*href: (`[^`]*`),\s*label: '([^']*)'/);
    const feedT = code.match(/const feedback = \{\s*href: (`[^`]*`),\s*label: '([^']*)'/);
    return (
      !code.includes('yourEvents') &&
      !code.includes("'Your events'") &&
      count(code, "{ href: '/plan/events', label: 'Your Events', icon: Calendar }") === 1 &&
      count(code, "'/plan/events'") === 1 &&
      !!helpT &&
      helpT[2] === 'Help and support' &&
      hrefOf(helpT[1]) === HELP_HREF &&
      !!feedT &&
      feedT[2] === 'Send feedback' &&
      hrefOf(feedT[1]) === FEEDBACK_HREF &&
      ['help', 'feedback'].every(
        (o) => count(code, `href={${o}.href}`) === 2 && count(code, `{${o}.label}`) === 2
      ) &&
      /import \{ GATHER_CONTACT_EMAIL \} from '@\/lib\/email-footer';/.test(code) &&
      !/<Link\b/.test(code) &&
      !/from 'next\/link'/.test(code) &&
      !code.includes(ADDRESS)
    );
  },
  /** E1 — the help line rendered: the words, one mail link, the ruled address. */
  helpLine(html: string) {
    const links = linksOf(html);
    return (
      textOf(html) === HELP_LINE &&
      links.length === 1 &&
      links[0][0] === `mailto:${ADDRESS}` &&
      links[0][1] === ADDRESS
    );
  },
  /** E2 — NeedHelp reads the address from the footer, types none, holds the words once. */
  helpSource(src: string) {
    const code = stripComments(src);
    return (
      /import \{ GATHER_CONTACT_EMAIL \} from '@\/lib\/email-footer';/.test(code) &&
      code.includes('href={`mailto:${GATHER_CONTACT_EMAIL}`}') &&
      count(code, HELP_WORDS) === 1 &&
      !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(code.replace(/'@\/[^']*'/g, '')) &&
      !/['"]use client['"]/.test(src) &&
      !/\buse[A-Z]\w*\(/.test(code)
    );
  },
  /** E3 — the files that draw the help line (code, comments out) are exactly the five. */
  helpPlaces(drawers: string[], importers: string[]) {
    return (
      JSON.stringify(drawers) === JSON.stringify(HELP_PLACES) &&
      JSON.stringify(importers) === JSON.stringify(HELP_PLACES)
    );
  },
  /** E4 — each place draws it once, and in the right part of its file. */
  helpWhere(src: Record<string, string>) {
    const once = (rel: string) => count(stripComments(src[rel] ?? ''), '<NeedHelp') === 1;
    const verify = stripComments(src[VERIFY] ?? '');
    const paying = stripComments(src[PAYING] ?? '');
    const cancelled = between(
      paying,
      "  if (pageState === 'canceled') {",
      "  if (pageState === 'error') {"
    );
    const paidBefore = between(
      paying,
      "  if (pageState === 'paid-before') {",
      "  if (pageState === 'canceled') {"
    );
    return (
      HELP_PLACES.every(once) &&
      between(verify, 'function ErrorDisplay(', '\n}\n').includes('<NeedHelp') &&
      cancelled.includes('<NeedHelp') &&
      paidBefore.length > 100 &&
      !paidBefore.includes('<NeedHelp')
    );
  },
  /** E5 — the words and the address are each written once under src. */
  onePlace(holdersOfWords: string[], holdersOfAddress: Array<[string, number]>) {
    return (
      JSON.stringify(holdersOfWords) === JSON.stringify([NEED_HELP]) &&
      holdersOfAddress.length === 1 &&
      holdersOfAddress[0][0] === FOOTER &&
      holdersOfAddress[0][1] === 1
    );
  },
  /** E6 — the error page: the ruled words, a "Try again" button that calls reset, the line. */
  errorPage(html: string, resetCalled: boolean) {
    return (
      textOf(html) === `${ERROR_WORDS} ${TRY_AGAIN} ${HELP_LINE}` &&
      /<h1[^>]*>Something went wrong on our side\.<\/h1>/.test(html) &&
      /<button type="button"[^>]*>Try again<\/button>/.test(html) &&
      resetCalled
    );
  },
  /** E7 — the not-found page: the ruled words, the home link, the line. */
  notFoundPage(html: string) {
    const links = linksOf(html);
    return (
      textOf(html) === `${NOT_FOUND_WORDS} ${HOME_LINK} ${HELP_LINE}` &&
      /<h1[^>]*>We can(&#x27;|')t find that page\.<\/h1>/.test(html) &&
      JSON.stringify(links) ===
        JSON.stringify([
          ['/', HOME_LINK],
          [`mailto:${ADDRESS}`, ADDRESS],
        ])
    );
  },
  /** F1 — the privacy page rendered: two mail links, both the ruled address; no old address. */
  privacyRendered(html: string) {
    const mailtos = linksOf(html).filter(([h]) => h.startsWith('mailto:'));
    return (
      html.length > 0 &&
      mailtos.length === 2 &&
      mailtos.every(([h, t]) => h === `mailto:${ADDRESS}` && t === ADDRESS) &&
      !html.includes(OLD_PRIVACY)
    );
  },
  /** F2 — the privacy page reads the constant and types no address. */
  privacySource(src: string) {
    const code = stripComments(src);
    return (
      /import \{ GATHER_CONTACT_EMAIL \} from '@\/lib\/email-footer';/.test(code) &&
      count(code, 'href={`mailto:${GATHER_CONTACT_EMAIL}`}') === 2 &&
      !src.includes(OLD_PRIVACY) &&
      !/[\w.+-]+@[\w-]+\.[\w.-]+/.test(code.replace(/'@\/[^']*'/g, ''))
    );
  },
  /** A file now is T0's with exactly the pieces put in (no other byte moves). */
  exactly(now: string, expected: string | null) {
    return expected !== null && now.length > 0 && now === expected;
  },
  /** G1 — the files changed between two fixed commits are exactly a list. */
  sameList(changed: string | null, list: string[]) {
    return (
      changed !== null &&
      JSON.stringify(changed.split('\n').filter(Boolean).sort()) ===
        JSON.stringify([...list].sort())
    );
  },
  /** G3 — package.json at the suite's commit is T0's plus the one script line. */
  oneScriptLine(atAdd: string, t0Json: string) {
    try {
      const now = JSON.parse(atAdd);
      const base = JSON.parse(t0Json);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (base?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(base);
    } catch {
      return false;
    }
  },
};

/** What a template literal from Navigation gives, with the footer's own constant. */
function hrefOf(template: string): string {
  const body = template.slice(1, -1);
  return body
    .replace('${GATHER_CONTACT_EMAIL}', String((FOOTER_MODULE as any).GATHER_CONTACT_EMAIL))
    .replace(/\$\{encodeURIComponent\('([^']*)'\)\}/g, (_m, s: string) => encodeURIComponent(s));
}

// ══ A — THE SIGN-IN LABEL ════════════════════════════════════════════════════
function layerA() {
  section('A — the sign-in label (tweak 2)');
  const nav = read(NAV);
  assert(
    'A',
    `A1 the signed-out button reads "${HOST_SIGN_IN}" on the computer's bar and in the phone's menu, to /auth/signin as before`,
    CHECKS.signInLabel(nav)
  );
  assert(
    'A',
    'A2 Navigation is T0’s file with exactly this ticket’s pieces put in (the label, the three links, their import and constants); no other byte moves',
    CHECKS.exactly(nav, navExpected(atRef(T0_TIP, NAV)))
  );
}

// ══ B — THE SIGN-IN PAGE ═════════════════════════════════════════════════════
function layerB() {
  section('B — the sign-in page (tweak 3)');
  const page = read(SIGNIN);
  assert(
    'B',
    'B1 the ruled sentence once, straight apostrophe; the old "magic link" sentence gone; the heading "Check your email for a sign-in link" kept',
    CHECKS.signInSentence(page)
  );
  assert(
    'B',
    'B2 the page is T0’s file with exactly the sentence, the help line and its import changed (handleSubmit untouched)',
    CHECKS.exactly(page, applyPairs(atRef(T0_TIP, SIGNIN), SIGNIN_PAIRS))
  );
}

// ══ C — THE TEMPLATES BLOCK ══════════════════════════════════════════════════
function layerC() {
  section('C — the home page and the templates page (tweak 13)');
  const home = read(HOME);
  assert(
    'C',
    'C1 the home page has no templates block, no link to /plan/templates',
    CHECKS.homeHasNoTemplates(home)
  );
  assert(
    'C',
    'C2 the home page is T0’s file with exactly the "Browse event templates" block taken out',
    CHECKS.exactly(home, applyPairs(atRef(T0_TIP, HOME), HOME_PAIRS))
  );
  assert(
    'C',
    'C3 the /plan/templates page is still there, byte for byte as at T0, and its folder holds nothing new',
    read(TEMPLATES).length > 0 &&
      read(TEMPLATES) === atRef(T0_TIP, TEMPLATES) &&
      git(['diff', '--quiet', T0_TIP, '--', 'src/app/plan/templates']).status === 0 &&
      git([
        'ls-files',
        '--others',
        '--exclude-standard',
        '--',
        'src/app/plan/templates',
      ]).stdout.trim() === ''
  );
}

// ══ D — THE ACCOUNT MENU ═════════════════════════════════════════════════════
function layerD() {
  section('D — the account menu (tweak 17)');
  const nav = read(NAV);
  assert(
    'D',
    'D1 on a computer the email opens, in order: Billing, Help and support, Send feedback, Sign Out, and no "Your events" (GTC-417)',
    CHECKS.computerOrder(nav)
  );
  assert(
    'D',
    'D2 on a phone the menu shows, in order: the email, Billing (after the email, phone-menu M3), Help and support, Send feedback, Sign Out, and no "Your events" after the email (GTC-417)',
    CHECKS.phoneOrder(nav)
  );
  assert(
    'D',
    `D3 no account-menu "Your events" (GTC-417), the bar's "Your Events" once (/plan/events); "Help and support" is ${HELP_HREF}; "Send feedback" is ${FEEDBACK_HREF}; the address read from src/lib/email-footer.ts; each drawn on computer and phone; plain <a>, no next/link`,
    CHECKS.menuLinks(nav, hrefOf)
  );
}

// ══ E — THE HELP LINE ════════════════════════════════════════════════════════
function layerE() {
  section('E — the help line and the two new pages (tweak 18)');
  const lineHtml = render(createElement(NeedHelp));
  assert(
    'E',
    `E1 the line reads "${HELP_LINE}", the address a mailto link`,
    CHECKS.helpLine(lineHtml),
    lineHtml
  );
  assert(
    'E',
    'E2 NeedHelp reads GATHER_CONTACT_EMAIL from src/lib/email-footer.ts, types no address, holds the words once, no hook',
    CHECKS.helpSource(read(NEED_HELP))
  );
  const srcFiles = walk('src').filter((f) => /\.(ts|tsx)$/.test(f));
  const drawers = srcFiles.filter((f) => stripComments(read(f)).includes('<NeedHelp')).sort();
  const importers = srcFiles
    .filter((f) =>
      /import NeedHelp from '@\/components\/shared\/NeedHelp';/.test(stripComments(read(f)))
    )
    .sort();
  assert(
    'E',
    'E3 the line is drawn in exactly five files: the error page, the not-found page, the sign-in page, the sign-in link page and the paying page (so no guest page, no cancel page)',
    CHECKS.helpPlaces(drawers, importers),
    `${drawers.join(', ')} | ${importers.join(', ')}`
  );
  const srcOf: Record<string, string> = {};
  for (const f of HELP_PLACES) srcOf[f] = read(f);
  assert(
    'E',
    'E4 each draws it once: the sign-in link page in its error display; the paying page on the cancelled screen and not the paid-before screen',
    CHECKS.helpWhere(srcOf)
  );
  const wordsHolders = srcFiles.filter((f) => read(f).includes(HELP_WORDS)).sort();
  const addressHolders = walk('src')
    .map((f): [string, number] => [f, count(read(f), ADDRESS)])
    .filter(([, n]) => n > 0);
  assert(
    'E',
    `E5 "${HELP_WORDS}" is written once under src (NeedHelp.tsx) and the address once (src/lib/email-footer.ts)`,
    CHECKS.onePlace(wordsHolders, addressHolders),
    `${wordsHolders.join(', ')} | ${addressHolders.map(([f, n]) => `${f}x${n}`).join(', ')}`
  );
  let resetCalled = false;
  let errorTree: ReactNode = null;
  try {
    errorTree = (ErrorPage as any)({
      error: new Error('made up'),
      reset: () => (resetCalled = true),
    });
  } catch {
    errorTree = null;
  }
  const button = findElement(errorTree, (el) => el.type === 'button');
  ok(() => {
    button?.props?.onClick?.();
    return true;
  });
  const errorHtml = render(
    createElement(ErrorPage as any, { error: new Error('made up'), reset: () => {} })
  );
  assert(
    'E',
    `E6 the error page reads "${ERROR_WORDS}", has a "${TRY_AGAIN}" button that calls Next's reset, and the help line`,
    CHECKS.errorPage(errorHtml, resetCalled),
    textOf(errorHtml)
  );
  const notFoundHtml = render(createElement(NotFound));
  assert(
    'E',
    `E7 the not-found page reads "${NOT_FOUND_WORDS}", links "${HOME_LINK}" to /, and has the help line`,
    CHECKS.notFoundPage(notFoundHtml),
    textOf(notFoundHtml)
  );
  const signInHtml = render(createElement(SignInPage));
  assert(
    'E',
    'E8 the sign-in page, rendered, shows the help line once',
    count(signInHtml, 'data-need-help') === 1 && textOf(signInHtml).includes(HELP_LINE)
  );
  // [[GTC-418]]: the paying page as T0's with the help line, then Ticket C's pieces, by hand.
  const payingWithHelp = applyPairs(atRef(T0_TIP, PAYING), PAYING_PAIRS);
  assert(
    'E',
    'E9 the sign-in link page and the paying page are T0’s files with exactly the help line and its import put in (and, in the paying page, exactly Ticket C’s pieces since, GTC-418)',
    CHECKS.exactly(read(VERIFY), applyPairs(atRef(T0_TIP, VERIFY), VERIFY_PAIRS)) &&
      CHECKS.exactly(
        read(PAYING),
        payingWithHelp === null ? null : applyPairs(payingWithHelp, GTC418_PAYING_PAIRS)
      )
  );
  assert(
    'E',
    'E10 CONTROL: the cancel page, which has its own line, is as at T0, byte for byte',
    read(CANCEL_PAGE).length > 0 && read(CANCEL_PAGE) === atRef(T0_TIP, CANCEL_PAGE)
  );
}

// ══ F — THE PRIVACY PAGE ═════════════════════════════════════════════════════
function layerF() {
  section('F — the privacy page');
  const html = render(createElement(PrivacyPolicy));
  assert(
    'F',
    `F1 the privacy page, rendered: its two mail links are mailto:${ADDRESS}, showing the address; ${OLD_PRIVACY} is gone`,
    CHECKS.privacyRendered(html),
    JSON.stringify(linksOf(html).filter(([h]) => h.startsWith('mailto:')))
  );
  const src = read(PRIVACY);
  assert(
    'F',
    'F2 the page imports GATHER_CONTACT_EMAIL from src/lib/email-footer.ts for both links and types no address',
    CHECKS.privacySource(src)
  );
  const t0 = atRef(T0_TIP, PRIVACY);
  const expected =
    count(t0, PRIVACY_LINK_OLD) === 2 && count(t0, PRIVACY_HEAD) === 1
      ? t0
          .split(PRIVACY_LINK_OLD)
          .join(PRIVACY_LINK_NEW)
          .replace(PRIVACY_HEAD, PRIVACY_IMPORT + PRIVACY_HEAD)
      : null;
  assert(
    'F',
    'F3 nothing else on the page moves: it is T0’s file with only the two links and the import changed',
    CHECKS.exactly(src, expected)
  );
}

// ══ G — THE FILES, BETWEEN FIXED COMMITS ═════════════════════════════════════
function layerG() {
  section('G — what Ticket A changed, read between fixed commits');
  const diff = (a: string, b: string) => {
    const r = git(['diff', '--name-only', a, b]);
    return r.status === 0 ? r.stdout : null;
  };
  assert(
    'G',
    `G1 between T0's tip (f3b084a) and Ticket A's code commit (${CODE_A.slice(0, 7)}) exactly this prompt's files changed: the nine code files and Part 0's guard list`,
    git(['cat-file', '-t', CODE_A]).stdout.trim() === 'commit' &&
      CHECKS.sameList(diff(T0_TIP, CODE_A), CODE_FILES),
    diff(T0_TIP, CODE_A) ?? 'git error'
  );
  assert(
    'G',
    "G2 Part 0's commit (ab334a8) changed tests/tweaks-guard-test.ts alone, and sits between T0's tip and the code commit",
    CHECKS.sameList(diff(T0_TIP, PART0), [GUARD]) &&
      git(['merge-base', '--is-ancestor', PART0, CODE_A]).status === 0 &&
      git(['rev-parse', `${PART0}^`]).stdout.trim() === git(['rev-parse', T0_TIP]).stdout.trim()
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'G',
    `G3 the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) changed this suite and package.json alone, and package.json by "${NEW_SCRIPT}" only`,
    addCommit.length === 40 &&
      CHECKS.sameList(diff(`${addCommit}^`, addCommit), [SUITE, 'package.json']) &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(T0_TIP, 'package.json'))
  );
  const inCommits = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${T0_TIP}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'G',
    'G4 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since T0’s tip',
    inCommits.length === 0,
    inCommits.join(', ')
  );
}

function main() {
  layerA();
  layerB();
  layerC();
  layerD();
  layerE();
  layerF();
  layerG();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (TWEAKS_A_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_A_DRY_RUN !== '1') {
  try {
    main();
  } catch (e) {
    console.error(e);
    failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}
