/**
 * [[GTC-416]] — TICKET B, "SETUP LOOKS": tweaks 5, 6 and 15.
 *
 * THE RULINGS THIS SUITE PINS (the founder, 28 Oct 2026, in Cowork)
 *    5  In the add-people form, when a partner block opens, it is scrolled into view inside the
 *       form so its name, email and phone boxes all show; the same for a kid and a guest. The
 *       scroll is in Moment1InputForm.tsx, not the setup page (demo-tweaks-3 T4 counts the setup
 *       page's scroll calls). No smooth animation under the reduced-motion setting. Button words
 *       unchanged, "Add Partner" included; which box takes focus first and the boxes' order too.
 *    6  On Moment 2, four underlined text controls get the app's secondary-button look (outline,
 *       padding, rounded, its colours; an existing style, no new design): "Not quite right?",
 *       "Invites, people and nudges", "Put the plan away", "Regenerate this category". Their
 *       words do not change. "{N} guests" stays inline (batch13 R7); "Your events" stays a plain
 *       link. Styling only.
 *   15  The host's own card takes sage-200 with the same accent border, everywhere the host card
 *       constant is used; the constant's line only.
 *
 * THE LAYERS
 *   S  the scroll (a)      P  the four plan controls (b)      H  the host card (c)
 *   G  the files the code commit changed, between fixed commits (d)
 *
 * Every expected value is written here by hand. Each changed file is also asked to be Ticket A's
 * file (c902eb8) with exactly this ticket's pieces changed. No dev server, no database, no
 * provider, no network.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { installProviderTrap } from './helpers/provider-trap';
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
import * as HOST_CARD_MODULE from '../src/components/shared/HostCard';
import * as INVITES_ONLY from '../src/lib/setup/invites-only';

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
/** The whole <button ...>...</button> element whose text holds `words` (first such), or ''. */
function buttonAround(src: string, words: string): string {
  const at = src.indexOf(words);
  if (at < 0) return '';
  const open = src.lastIndexOf('<button', at);
  const close = src.indexOf('</button>', at);
  if (open < 0 || close < 0 || src.slice(open, at).includes('</button>')) return '';
  return src.slice(open, close + '</button>'.length);
}
const classOf = (el: string) => el.match(/className="([^"]*)"/)?.[1] ?? null;

// ── Files and commits ────────────────────────────────────────────────────────
/** Ticket A's tip (GTC-415's ticket commit): Ticket B builds on it. A fixed commit. */
const A_TIP = 'c902eb8f09712dca5c48c202a69ee16f71e2a874';
/** Ticket B's code commit. A fixed commit. */
const CODE_B = 'd269c6f2514f60ca607b6d337df6854dca3d4bbc';
const FORM = 'src/components/plan/Moment1InputForm.tsx';
const PLAN = 'src/components/plan/Moment2PlanView.tsx';
const HOST_CARD_FILE = 'src/components/shared/HostCard.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const SUITE = 'tests/tweaks-b-test.tsx';
const CODE_FILES = [FORM, PLAN, HOST_CARD_FILE].sort();
const NEW_SCRIPT = 'test:tweaks-b';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/tweaks-b-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── The rulings' words and classes, typed by hand ────────────────────────────
const ADD_BUTTONS = ['👫 Add Partner', '👦 Kid with a job', '🧒 Kid without a job', '👤 Add Guest'];
/** The app's secondary-button look, as Moment 1's own add buttons wear it (reused, not new). */
const LOOK =
  'px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors';
const REGEN_PLAN = 'Not quite right? Regenerate the plan';
const EXIT = 'Invites, people and nudges →';
const PUT_AWAY = 'Put the plan away: invites only';
const REGEN_CATEGORY = '↻ Regenerate this category';
const NEW_CLASS: Record<string, string> = {
  [REGEN_PLAN]: `-mt-4 mb-6 ${LOOK} disabled:opacity-50 disabled:cursor-not-allowed`,
  [EXIT]: `${LOOK} disabled:opacity-50`,
  '{INVITES_ONLY_WORDS.PUT_AWAY}': `${LOOK} disabled:opacity-50`,
  [REGEN_CATEGORY]: `${LOOK} disabled:opacity-50 disabled:cursor-not-allowed`,
};
const OLD_CLASS: Record<string, string> = {
  [REGEN_PLAN]:
    '-mt-4 mb-6 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline',
  [EXIT]:
    'text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:no-underline disabled:opacity-50',
  '{INVITES_ONLY_WORDS.PUT_AWAY}':
    'text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 disabled:no-underline disabled:opacity-50',
  [REGEN_CATEGORY]:
    'text-xs text-gray-500 hover:text-gray-800 underline underline-offset-2 px-1 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline',
};
const GUESTS_CLASS =
  'underline underline-offset-2 hover:text-gray-900 disabled:no-underline disabled:opacity-50';
const YOUR_EVENTS_LINK =
  '<a\n                href="/plan/events"\n                className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"\n              >\n                {STRIP_WORDS.YOUR_EVENTS}\n              </a>';
const HOST_CARD_OLD = "export const HOST_CARD = 'border-accent bg-sage-100';";
const HOST_CARD_NEW = "export const HOST_CARD = 'border-accent bg-sage-200';";
const SAGE_200 = "200: '#c7cdc6'";

// ── The exact pieces the form changes, typed by hand (Ticket A's file -> now) ──
type Pairs = Array<[string, string]>;
const SCROLL_BLOCK =
  '\n  /*\n' +
  '   * [[GTC-416]] tweak 5 (founder ruling, 28 Oct 2026) — when "Add Partner", "Kid with a job" or\n' +
  '   * "Add Guest" opens a block, the block is scrolled into view so its name, email and phone boxes\n' +
  '   * all show. The newest block is the first in the list; its own autoFocus still picks the box\n' +
  '   * that takes focus. No smooth animation when the reduced-motion setting is on.\n' +
  '   */\n' +
  '  const newestBlockRef = useRef<HTMLDivElement>(null);\n' +
  '  const scrollToNewest = useRef(false);\n' +
  '  useEffect(() => {\n' +
  '    if (!scrollToNewest.current) return;\n' +
  '    scrollToNewest.current = false;\n' +
  '    const block = newestBlockRef.current;\n' +
  '    if (!block) return;\n' +
  "    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;\n" +
  "    block.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });\n" +
  '  });\n';
const REF_PROP = '                    blockRef={orderIdx === 0 ? newestBlockRef : undefined}\n';
const FORM_PAIRS: Pairs = [
  [
    '  useEffect(() => {\n    nameInputRef.current?.focus();\n  }, []);\n',
    '  useEffect(() => {\n    nameInputRef.current?.focus();\n  }, []);\n' + SCROLL_BLOCK,
  ],
  [
    '  const addGuest = () => {\n    const g = emptyGuest();\n',
    '  const addGuest = () => {\n    scrollToNewest.current = true;\n    const g = emptyGuest();\n',
  ],
  [
    '                  onClick={() => {\n                    setShowPartner(true);\n',
    '                  onClick={() => {\n                    scrollToNewest.current = true;\n                    setShowPartner(true);\n',
  ],
  [
    '                onClick={() => {\n                  const h = emptyGuest();\n',
    '                onClick={() => {\n                  scrollToNewest.current = true;\n                  const h = emptyGuest();\n',
  ],
  [
    '                  <SubForm\n                    key="partner"\n',
    `                  <SubForm\n                    key="partner"\n${REF_PROP}`,
  ],
  [
    '                  <SubForm\n                    key={helper.id}\n',
    `                  <SubForm\n                    key={helper.id}\n${REF_PROP}`,
  ],
  [
    '                  <SubForm key={guest.id} title={`Guest ${i + 1}`} onRemove={() => removeGuest(i)}>\n',
    `                  <SubForm\n                    key={guest.id}\n${REF_PROP}                    title={\`Guest \${i + 1}\`}\n                    onRemove={() => removeGuest(i)}\n                  >\n`,
  ],
  [
    '  children,\n}: {\n  title: string;\n  onRemove: () => void;\n  children: React.ReactNode;\n}) {\n  return (\n    <div className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md space-y-3">\n',
    '  children,\n  blockRef,\n}: {\n  title: string;\n  onRemove: () => void;\n  children: React.ReactNode;\n' +
      "  /** [[GTC-416]] tweak 5: the newest block's ref, so the form can scroll it into view. */\n" +
      '  blockRef?: React.Ref<HTMLDivElement>;\n}) {\n  return (\n    <div\n      ref={blockRef}\n' +
      '      className="border-l-4 border-blue-300 pl-4 py-3 mb-4 bg-gray-50 rounded-r-md space-y-3"\n    >\n',
  ],
];
function applyPairs(base: string, pairs: Pairs): string | null {
  let s = base;
  for (const [a, b] of pairs) {
    if (count(s, a) !== 1) return null;
    s = s.replace(a, b);
  }
  return s;
}
/** The plan view as Ticket A had it, with only the four classes changed (each by hand). */
function planExpected(base: string): string | null {
  let s = base;
  for (const key of Object.keys(OLD_CLASS)) {
    const old = `className="${OLD_CLASS[key]}"`;
    const n = key === EXIT ? 2 : 1; // the exit and Put away wore the same class
    if (key === '{INVITES_ONLY_WORDS.PUT_AWAY}') continue;
    if (count(s, old) !== n) return null;
    s = s.split(old).join(`className="${NEW_CLASS[key]}"`);
  }
  return s;
}

// ── CHECKS: every condition, so each can be tried on a passing and a failing input ──────────
export const CHECKS = {
  /** S1 — the scroll: one effect, the newest block, 'nearest', smooth unless reduced motion. */
  scrollEffect(form: string) {
    const code = squash(stripComments(form));
    return (
      count(code, 'const newestBlockRef = useRef<HTMLDivElement>(null);') === 1 &&
      count(code, 'const scrollToNewest = useRef(false);') === 1 &&
      count(
        code,
        "useEffect(() => { if (!scrollToNewest.current) return; scrollToNewest.current = false; const block = newestBlockRef.current; if (!block) return; const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches; block.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); });"
      ) === 1 &&
      count(code, 'scrollIntoView') === 1 &&
      count(code, 'matchMedia') === 1
    );
  },
  /** S2 — it runs when a partner, a kid with a job or a guest opens, and at nothing else. */
  scrollTriggers(form: string) {
    const code = stripComments(form);
    const before = (words: string) => {
      const at = code.indexOf(words);
      return at < 0 ? '' : code.slice(code.lastIndexOf('<button', at), at);
    };
    const addGuest = code.slice(
      code.indexOf('const addGuest = () => {'),
      code.indexOf('const removeGuest')
    );
    return (
      count(code, 'scrollToNewest.current = true;') === 3 &&
      /onClick=\{\(\) => \{\s*scrollToNewest\.current = true;\s*setShowPartner\(true\);/.test(
        before('👫 Add Partner')
      ) &&
      /onClick=\{\(\) => \{\s*scrollToNewest\.current = true;\s*const h = emptyGuest\(\);/.test(
        before('👦 Kid with a job')
      ) &&
      /^const addGuest = \(\) => \{\s*scrollToNewest\.current = true;/.test(addGuest) &&
      /onClick=\{addGuest\}/.test(before('👤 Add Guest')) &&
      !before('🧒 Kid without a job').includes('scrollToNewest')
    );
  },
  /** S3 — the newest of the three kinds of block carries the ref; SubForm puts it on its box. */
  scrollTarget(form: string) {
    const code = stripComments(form);
    const sub = code.slice(code.indexOf('function SubForm('));
    return (
      count(code, 'blockRef={orderIdx === 0 ? newestBlockRef : undefined}') === 3 &&
      /<SubForm\s+key="partner"\s+blockRef=/.test(code) &&
      /<SubForm\s+key=\{helper\.id\}\s+blockRef=/.test(code) &&
      /<SubForm\s+key=\{guest\.id\}\s+blockRef=/.test(code) &&
      /return \(\s*<div\s+ref=\{blockRef\}\s+className="border-l-4/.test(sub)
    );
  },
  /** S4 — the form is Ticket A's with exactly these pieces: no word, focus or order moves. */
  exactly(now: string, expected: string | null) {
    return expected !== null && now.length > 0 && now === expected;
  },
  /** S5 — rendered, the four add buttons read as before, "Add Partner" included. */
  addButtons(html: string) {
    return html.length > 0 && ADD_BUTTONS.every((w) => count(html, `>${w}</button>`) === 1);
  },
  /** S6 — the setup page's own scroll calls are as many as at Ticket A's tip. */
  setupScrollsKept(now: string, base: string) {
    const n = (s: string) => [
      count(s, 'scrollIntoView'),
      count(s, 'window.scrollTo'),
      count(s, 'scrollTop'),
      count(s, 'scrollBy'),
    ];
    return base.length > 0 && JSON.stringify(n(now)) === JSON.stringify(n(base));
  },
  /** P1 — each of the four controls wears the look, keeps its words and no underline (code only:
   * a comment above "+ Add item" names the regenerate words too). */
  fourControls(plan: string) {
    const code = stripComments(plan);
    return Object.keys(NEW_CLASS).every((words) => {
      const el = buttonAround(code, words);
      const cls = classOf(el);
      return el.length > 0 && cls === NEW_CLASS[words] && !/underline/.test(cls ?? '');
    });
  },
  /** P2 — their words, unchanged: three in the file, the fourth in its own words file. */
  fourWords(plan: string, putAway: unknown) {
    return (
      count(plan, `'${REGEN_PLAN}'`) === 1 &&
      count(plan, `>\n            ${EXIT}\n          </button>`) === 1 &&
      count(plan, `'${REGEN_CATEGORY}'`) === 1 &&
      count(plan, '{INVITES_ONLY_WORDS.PUT_AWAY}') === 1 &&
      putAway === PUT_AWAY
    );
  },
  /** P3 — "{N} guests" is still the inline underlined button inside the sentence. */
  guestsInline(plan: string) {
    const p = plan.slice(plan.indexOf("{ownPlan ? 'for' : 'based on'}"));
    const sentence = p.slice(0, p.indexOf('</p>'));
    const el = buttonAround(sentence, "{guestCount} {guestCount === 1 ? 'guest' : 'guests'}");
    return el.length > 0 && classOf(el) === GUESTS_CLASS;
  },
  /** P4 — the look is reused: Moment 1's add buttons wear exactly it, and it is no new class. */
  lookReused(form: string) {
    return count(form, `className="${LOOK}"`) >= 4;
  },
  /** P5 — "Your events" is still a plain link (the setup page draws it), as many as before. */
  yourEventsLink(setup: string, base: string) {
    const n = count(setup, YOUR_EVENTS_LINK);
    return n >= 1 && n === count(base, YOUR_EVENTS_LINK);
  },
  /** H1 — the one definition: the constant's line is the ruled one, the old one gone. */
  hostCardLine(src: string, value: unknown) {
    return (
      count(src, HOST_CARD_NEW) === 1 &&
      !src.includes(HOST_CARD_OLD) &&
      value === 'border-accent bg-sage-200'
    );
  },
  /** H2 — no other file defines or copies it; every user imports it; none holds the old tint. */
  hostCardEverywhere(files: Array<[string, string]>) {
    const definers = files.filter(([, s]) => /HOST_CARD\s*=/.test(s)).map(([f]) => f);
    const copies = files
      .filter(([, s]) => /border-accent bg-sage-\d00|bg-sage-\d00 border-accent/.test(s))
      .map(([f]) => f);
    const users = files.filter(([f, s]) => f !== HOST_CARD_FILE && /\bHOST_CARD\b/.test(s));
    return (
      JSON.stringify(definers) === JSON.stringify([HOST_CARD_FILE]) &&
      JSON.stringify(copies) === JSON.stringify([HOST_CARD_FILE]) &&
      users.length === 11 &&
      users.every(([, s]) =>
        /import \{ HOST_CARD, HostPill \} from '@\/components\/shared\/HostCard';/.test(s)
      )
    );
  },
  /** H3 — sage-200 is in the theme (the theme untouched) and Tailwind builds src/components. */
  themeHasIt(tailwind: string) {
    return (
      tailwind.includes(SAGE_200) &&
      tailwind.includes("'./src/components/**/*.{js,ts,jsx,tsx,mdx}'")
    );
  },
  /** G — the files changed between two fixed commits are exactly a list. */
  sameList(changed: string | null, list: string[]) {
    return (
      changed !== null &&
      JSON.stringify(changed.split('\n').filter(Boolean).sort()) ===
        JSON.stringify([...list].sort())
    );
  },
  /** G2 — package.json at the suite's commit is Ticket A's plus the one script line. */
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

// ══ S — THE SCROLL ═══════════════════════════════════════════════════════════
function layerS() {
  section('S — the new block scrolls into view (tweak 5)');
  const form = read(FORM);
  assert(
    'S',
    "S1 one effect scrolls the newest block into view ('nearest'), smooth, or not smooth under the reduced-motion setting",
    CHECKS.scrollEffect(form)
  );
  assert(
    'S',
    'S2 it runs when "Add Partner", "Kid with a job" or "Add Guest" opens a block, and not for "Kid without a job" (no boxes there)',
    CHECKS.scrollTriggers(form)
  );
  assert(
    'S',
    'S3 the newest partner, kid or guest block carries the ref, on SubForm’s own box',
    CHECKS.scrollTarget(form)
  );
  // [[GTC-431]] re-base (the founder's plan approval, 31 Oct 2026, the move GTC-429 made for the
  // lockfile checks): the form is read at this ticket's code commit (CODE_B, fixed) instead of the
  // working folder, so a later ticket's edit to the form no longer turns this red. Same meaning
  // and strictness: tweaks-b's own change to the form was exactly these pieces.
  assert(
    'S',
    'S4 the form is Ticket A’s file with exactly these pieces: no word, no autoFocus, no box order moves',
    CHECKS.exactly(atRef(CODE_B, FORM), applyPairs(atRef(A_TIP, FORM), FORM_PAIRS))
  );
  let html = '';
  try {
    html = renderToStaticMarkup(
      createElement(Moment1InputForm as any, {
        eventId: 'e1',
        eventName: 'Boxing Day',
        onComplete: () => {},
        onAddPerson: async () => {},
        channelCandidates: [],
      })
    );
  } catch (e) {
    console.log(`    (render threw: ${String((e as Error).message).split('\n')[0]})`);
  }
  assert(
    'S',
    `S5 rendered, the add buttons read as before: ${ADD_BUTTONS.join(', ')}`,
    CHECKS.addButtons(html)
  );
  assert(
    'S',
    'S6 the setup page’s own scroll calls are as many as at Ticket A’s tip (demo-tweaks-3 T4’s count)',
    CHECKS.setupScrollsKept(read(SETUP), atRef(A_TIP, SETUP))
  );
}

// ══ P — THE FOUR PLAN CONTROLS ═══════════════════════════════════════════════
function layerP() {
  section('P — the four controls look like buttons (tweak 6)');
  const plan = read(PLAN);
  assert(
    'P',
    `P1 the four controls wear the secondary-button look (${LOOK}), no underline`,
    CHECKS.fourControls(plan)
  );
  assert(
    'P',
    'P2 their words are unchanged: "Not quite right? Regenerate the plan", "Invites, people and nudges →", "Put the plan away: invites only", "↻ Regenerate this category"',
    CHECKS.fourWords(plan, (INVITES_ONLY as any).INVITES_ONLY_WORDS?.PUT_AWAY)
  );
  assert(
    'P',
    'P3 "{N} guests" is still the inline underlined button inside "based on N guests." (batch13 R7)',
    CHECKS.guestsInline(plan)
  );
  assert(
    'P',
    'P4 the look is reused, not new: Moment 1’s add buttons wear exactly it',
    CHECKS.lookReused(read(FORM))
  );
  assert(
    'P',
    'P5 "Your events" is still a plain underlined link on the setup screens, as many as before',
    CHECKS.yourEventsLink(read(SETUP), atRef(A_TIP, SETUP))
  );
  assert(
    'P',
    'P6 the plan view is Ticket A’s file with only the four classes changed: styling only',
    CHECKS.exactly(plan, planExpected(atRef(A_TIP, PLAN)))
  );
}

// ══ H — THE HOST CARD ════════════════════════════════════════════════════════
function layerH() {
  section('H — the host card (tweak 15)');
  const src = read(HOST_CARD_FILE);
  assert(
    'H',
    `H1 the one definition reads ${HOST_CARD_NEW}; the old sage-100 line is gone`,
    CHECKS.hostCardLine(src, (HOST_CARD_MODULE as any).HOST_CARD)
  );
  const files = walk('src')
    .filter((f) => /\.(ts|tsx)$/.test(f))
    .map((f): [string, string] => [f, read(f)]);
  assert(
    'H',
    'H2 no other file defines or copies it; all eleven users import it from HostCard.tsx, so every host card takes sage-200',
    CHECKS.hostCardEverywhere(files)
  );
  assert(
    'H',
    'H3 sage-200 (#c7cdc6) is in the theme, which is untouched, and Tailwind builds classes from src/components',
    CHECKS.themeHasIt(read('tailwind.config.js')) &&
      git(['diff', '--quiet', A_TIP, '--', 'tailwind.config.js']).status === 0
  );
  assert(
    'H',
    'H4 HostCard.tsx is Ticket A’s file with that one line changed',
    CHECKS.exactly(
      src,
      count(atRef(A_TIP, HOST_CARD_FILE), HOST_CARD_OLD) === 1
        ? atRef(A_TIP, HOST_CARD_FILE).replace(HOST_CARD_OLD, HOST_CARD_NEW)
        : null
    )
  );
}

// ══ G — THE FILES, BETWEEN FIXED COMMITS ═════════════════════════════════════
function layerG() {
  section('G — what Ticket B changed, read between fixed commits');
  const diff = (a: string, b: string) => {
    const r = git(['diff', '--name-only', a, b]);
    return r.status === 0 ? r.stdout : null;
  };
  assert(
    'G',
    `G1 between Ticket A's tip (c902eb8) and Ticket B's code commit (${CODE_B.slice(0, 7)}) exactly the three files changed: Moment1InputForm.tsx, Moment2PlanView.tsx, HostCard.tsx`,
    git(['rev-parse', `${CODE_B}^`]).stdout.trim() === A_TIP &&
      CHECKS.sameList(diff(A_TIP, CODE_B), CODE_FILES),
    diff(A_TIP, CODE_B) ?? 'git error'
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'G',
    `G2 the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) changed this suite and package.json alone, and package.json by "${NEW_SCRIPT}" only`,
    addCommit.length === 40 &&
      CHECKS.sameList(diff(`${addCommit}^`, addCommit), [SUITE, 'package.json']) &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(A_TIP, 'package.json'))
  );
  const inCommits = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${A_TIP}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'G',
    'G3 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit since Ticket A’s tip',
    inCommits.length === 0,
    inCommits.join(', ')
  );
}

function main() {
  layerS();
  layerP();
  layerH();
  layerG();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
}

// A dry run imports CHECKS only (TWEAKS_B_DRY_RUN=1); the suite runs otherwise.
if (process.env.TWEAKS_B_DRY_RUN !== '1') {
  try {
    main();
  } catch (e) {
    console.error(e);
    failed++;
  }
  process.exit(failed > 0 ? 1 : 0);
}
