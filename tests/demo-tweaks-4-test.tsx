/**
 * [[GTC-398]] — THE DEMO TWEAKS, LIST FIVE (THE LIGHT PATH): the founder's five notes after his
 * look at GTC-396, 23 Oct 2026. Words, layout and a highlight on screen only.
 *
 * Founder rulings, 23 Oct 2026 (his prompt). Each item adds its own layer here, in its own commit.
 *
 * THE LAYERS
 *   L  item 1: Moment 2's plan screen loses the lead-in GTC-396 item 4 gave it ("Lose it"): no
 *      "What this does", no "When it's done"; Moment 2's opening page and Moment 3 keep theirs;
 *      the drop-off line still directly above the heading.
 *   D  item 2: the drop-off line stands out, the same words: on the plan screen a box in the
 *      plan view's own card style, text-base, semibold, dark, mb-4; on Moment 3 in the top row,
 *      semibold and dark at the size it had, no margin (no height above the lists); one prop.
 *   A  item 3: one new line on Moment 3, with the heading and above the two lists, small grey:
 *      the founder's "Shortest" (M3_WORDS.ASSIGN_HOW); under the heading on a phone, beside it from
 *      md up (no height above the lists on a computer); not on "No plan items yet."
 *   S  item 4, built again (founder's ruling, 24 Oct 2026): "Want me to suggest?" is a compact
 *      filled button, the link's height: "Add a crowd"'s colours only, side padding, rounded,
 *      no vertical padding, no border, text-sm and mt-1 as the link; the same words, handler and
 *      condition; the counter above it; Accept all as it was. (The first build, a 48px
 *      full-width button, was reverted in 8bbcfb6: it moved walkthrough-batch11 C7.)
 *   H  item 5: with a person picked, the rows they hold (or that are saving as theirs) are a deeper
 *      blue (HELD_BY_PICKED_ROW, beside GIVEN_ROW) with data-m3-held-by-picked; a suggestion, a row
 *      saving away from them and other people's rows are not; a pure rule (heldByPicked).
 *   U  CONTROL: the files this batch must not touch are not edited since demo-tweaks-3-good;
 *      package.json (read at the commit that added this suite) differs by two script lines; the
 *      lockfile there is GTC-397's; the two untracked scripts are in no commit.
 *
 * SAFETY. Static and rendered checks only: no database row, no dev server, no AI call, no
 * browser, no network. Every fixture and expected value is written here by hand, never taken from
 * the code under test. Every check's condition lives in CHECKS so it can be dry-run on a passing
 * and a failing input.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Moment2Opening from '../src/components/plan/Moment2Opening';
// The plan view, Moment 3 and the toast provider imported statically, as the Moment 3 suites do (a
// dynamic import() would give the view a second toast context).
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';

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
const code = (rel: string) => stripComments(read(rel));
/** The tag the founder last looked at (GTC-398's rollback structure). */
const GOOD_TAG = 'demo-tweaks-3-good';
/** GTC-397's last commit, where this batch started (its app code the same as the tag's). */
const BASE = '8a4f1bc7e237bead8565f88c62ca2fe5bec95645';
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const unchangedSinceGood = (paths: string[]) =>
  git(['diff', '--quiet', GOOD_TAG, '--', ...paths]).status === 0;
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}
const render = (el: any) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    console.log(`    (render threw: ${String((err as Error).message).split('\n')[0]})`);
    return '';
  }
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** The same code but its layout: whitespace, brackets and commas (Prettier's re-wraps) dropped. */
const flat = (src: string) => src.replace(/[\s(),]/g, '');
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};

// ── Shared fixtures, hand-written ────────────────────────────────────────────
const PLAN_VIEW = 'src/components/plan/Moment2PlanView.tsx';
const M3_VIEW = 'src/components/plan/Moment3AssignView.tsx';
const SKELETON = 'src/components/plan/Moment2Step2Skeleton.tsx';
const DOES_HEAD = 'What this does';
const DONE_HEAD = 'When it’s done';
/** Moment 3's heading as React writes it (the straight apostrophe escaped). */
const M3_SENTENCE_HTML = 'Now. Who&#x27;s on what.';
const PLAN_BASE = {
  eventId: 'e1',
  eventName: 'Boxing Day',
  guestCount: 10,
  categories: [],
  onUpdateItem: async () => {},
  onRemoveItem: async () => {},
  onAddItem: async () => {},
  onAddCategory: async () => {},
  onApprove: () => {},
  onBack: () => {},
  onRegeneratePlan: () => {},
  onRegenerateCategory: () => {},
  regeneratingScope: null,
  onEditGuests: () => {},
  onGoToDashboard: () => {},
  stripDoors: {},
};
const VENUE_FACTS = {
  id: 'e1',
  name: 'Boxing Day',
  startDate: '2026-12-26',
  endDate: '2026-12-26',
  venueName: 'Riverside Park',
  venueTimingStart: '12:00pm',
  venueTimingEnd: '4:00pm',
};
/** The event's line for VENUE_FACTS, typed here (GTC-395 item 7's words). */
const VENUE_LINE = 'Drop off at Riverside Park, 12:00pm to 4:00pm';
const M3_CATS = [
  {
    id: 'c1',
    name: 'Mains',
    emoji: '🍖',
    items: [
      { id: 'i-lamb', name: 'Roast lamb', kind: 'ITEM', detail: '1 kg' },
      { id: 'i-bread', name: 'Bread rolls', kind: 'ITEM', detail: '24' },
      { id: 'i-pav', name: 'Pavlova', kind: 'ITEM', detail: '1' },
    ],
  },
];
const member = (id: string, name: string, role: string, householdRole: string) => ({
  personId: id,
  role,
  householdRole,
  person: { id, name },
});
const M3_HOUSEHOLDS = [
  {
    id: 'h-lowe',
    members: [
      member('p-kate', 'Kate Lowe', 'HOST', 'PRIMARY_CONTACT'),
      member('p-ross', 'Ross Lowe', 'PARTICIPANT', 'PARTNER'),
    ],
  },
  { id: 'h-ngata', members: [member('p-mere', 'Mere Ngata', 'PARTICIPANT', 'PRIMARY_CONTACT')] },
];
const drawPlan = (over: Record<string, unknown>) =>
  render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment2PlanView as any, { ...PLAN_BASE, ...over })
    )
  );
const drawM3 = (over: Record<string, unknown>) =>
  render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment3AssignView as any, {
        eventId: 'e1',
        event: { id: 'e1', status: 'DRAFT', sentAt: null },
        hostPersonId: 'p-kate',
        headcount: 3,
        categories: M3_CATS,
        initialHolders: { 'i-lamb': { personId: 'p-ross', name: 'Ross Lowe' } },
        households: M3_HOUSEHOLDS,
        askForReason: async () => ({ proceed: true }),
        askForBatchReason: async () => ({ proceed: true }),
        onBack: () => {},
        onMoveOn: () => {},
        stripDoors: {},
        ...over,
      })
    )
  );
/** The words' line inside one MomentWords block (its second paragraph). */
const wordsOf = (html: string, marker: string) => {
  const at = html.indexOf(`data-moment-words="${marker}"`);
  if (at < 0) return '';
  const m = html.slice(at).match(/<\/p><p class="[^"]*">([^<]*)<\/p><\/div>/);
  return m ? m[1] : '';
};

// ── Item 2: the drop-off line, hand-written ──────────────────────────────────
const DROP_LINE_FILE = 'src/components/shared/EventDropOffLine.tsx';
/** The plan screen's box: the plan view's own card classes, larger dark semibold words, its mb-4. */
const PLAN_LINE_CLASSES = [
  'mb-4',
  'rounded-lg',
  'border',
  'border-gray-200',
  'bg-white',
  'px-4',
  'py-3',
  'text-base',
  'font-semibold',
  'text-gray-900',
  'break-words',
];
/** Moment 3's: dark and semibold at the size it had (text-sm), no margin, padding or box. */
const ROW_LINE_CLASSES = ['text-sm', 'font-semibold', 'text-gray-900', 'break-words'];
const NO_VENUE_FACTS = {
  ...VENUE_FACTS,
  venueName: null,
  venueTimingStart: null,
  venueTimingEnd: null,
};
/** GTC-395 item 7's line with no venue, typed here. */
const NO_VENUE_LINE = 'Drop off: the venue hasn’t been added yet.';
/** Moment 3's W10, as React writes it. */
const M3_W10 = '>← Back to “What’s the plan?”</button>';
const classesOf = (html: string) => {
  const m = html.match(/<p data-drop-off-line="" class="([^"]*)">([^<]*)<\/p>/);
  return m ? { classes: m[1].split(/\s+/).filter(Boolean), words: m[2] } : null;
};
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ');
const walk = (dir: string, out: string[] = []): string[] => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const name of fs.readdirSync(full)) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
};

// ── Item 3: how to give dishes, hand-written ─────────────────────────────────
const M3_WORDS_FILE = 'src/lib/moment3/words.ts';
/** The founder's "Shortest" (23 Oct 2026), typed here; the apostrophe is U+2019. */
const ASSIGN_HOW = 'Tap a person, then tap the dishes they’re bringing.';
const ASSIGN_HOW_LINE = `  ASSIGN_HOW: '${ASSIGN_HOW}',`;
/**
 * Small grey as the paragraphs around it; under the heading on a phone (mt-1), beside it from md
 * up (md:mt-0) — the founder's fallback after batch11 C7 went red with the line under the heading
 * on a computer (gate 1, 23 Oct 2026).
 */
const ASSIGN_HOW_CLASSES = ['mt-1', 'md:mt-0', 'text-sm', 'text-gray-600'];
/** The block that holds the heading and the line: the heading's old mb-6, a row from md up. */
const HEADING_BLOCK = 'mb-6 md:flex md:flex-wrap md:items-baseline md:gap-x-4';
/** The heading, its old margin now the block's. */
const M3_H1_CLASS = 'text-xl font-semibold text-gray-900';
/** The counter for M3_CATS with the lamb held (the document's words), typed here. */
const COUNTER_1_OF_3 = '1 of 3 items assigned.';
const NO_PLAN_ITEMS = 'No plan items yet.';
/** Moment 3's two lists, side by side from md up, as the view writes them. */
const M3_LISTS = '<div class="flex flex-col md:flex-row md:gap-8">';

/** Escapes a string for a RegExp. */
const rx = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// ── Item 4: "Want me to suggest?", hand-written ──────────────────────────────
const CROWD_FILE = 'src/components/demo/CrowdButton.tsx';
const SUGGEST = 'Want me to suggest?';
/** "Add a crowd"'s colours (CrowdButton.tsx): its fill, its text colour and its hover fill. */
const CROWD_COLOURS = ['bg-accent', 'text-white', 'hover:bg-accent-dark'];
/** The compact button, typed here: the link's text-sm and mt-1, the colours, side padding, rounded. */
const SUGGEST_CLASS =
  'mt-1 px-2.5 py-0 rounded-md text-sm font-medium text-white bg-accent hover:bg-accent-dark';
/** The link as it was at the base, typed here (its height: text-sm's line, mt-1, no padding). */
const LINK_CLASS = 'mt-1 text-sm text-gray-600 hover:text-gray-900 underline underline-offset-2';
/** Classes that would add height to the control (the 48px first build had py-3 and text-base). */
const HEIGHT_CLASS =
  /^(?:[a-z]+:)?(?:p|pt|pb|py)-(?!0$)|^(?:[a-z]+:)?border|^(?:[a-z]+:)?(?:h|min-h|leading)-|^(?:[a-z]+:)?text-(?:xs|base|lg|xl|[2-9]xl)$|^(?:[a-z]+:)?(?:mt|my|m|mb)-(?!1$)|^(?:[a-z]+:)?(?:block|flex|w-full)$/;
/** Accept all's own style, as at the base (it replaces the button after the tap). */
const ACCEPT_ALL_CLASS =
  'mt-1 px-3 py-1.5 text-sm text-gray-800 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-60 disabled:cursor-wait';

// ── Item 5: the picked person's dishes, hand-written ─────────────────────────
const ASSIGNING_FILE = 'src/lib/moment3/assigning.ts';
/** GTC-365's soft blue (Q12, A), typed here. */
const SOFT_BLUE = { background: '#EEF4FB', border: '#B7CCE6', text: '#1F3A5F' };
/** The board's three state fills (walkthrough-batch3's list): never these. */
const BOARD_COLOURS = ['#EAF3DE', '#FAEEDA', '#FCEBEB'];
const hexRgb = (h: string) =>
  /^#[0-9A-Fa-f]{6}$/.test(h) ? [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) : null;
/** WCAG relative luminance: lower is deeper. */
const luminance = (h: string) => {
  const rgb = hexRgb(h);
  if (!rgb) return NaN;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** Holders for the rule's cases: Ross holds the lamb and the trifle, Mere the bread, nobody the pav. */
const HOLDERS = {
  lamb: { personId: 'p-ross' },
  trifle: { personId: 'p-ross' },
  bread: { personId: 'p-mere' },
  pav: null,
};
const sorted = (a: unknown) => (Array.isArray(a) ? [...a].sort().join(',') : 'not a list');

// ── CONTROL: not touched by this batch, hand-written ─────────────────────────
/**
 * The founder's untouched proof (his section 5), every file test:demo-sandbox-b's S11 reads, and
 * the neighbours no item edits. Never a whole file an item edits (GTC-395's lesson): the plan view,
 * Moment 3, the drop-off line, the Moment 3 words and the assigning rules are pinned by their own
 * layers instead. No package.json, lockfile, script or test file here (GTC-397's lesson).
 */
const NOT_TOUCHED = [
  'src/app/api',
  'prisma',
  'src/lib/auth',
  'src/lib/auth.ts',
  'src/lib/press',
  'src/lib/ai',
  'src/lib/email.ts',
  'src/lib/households',
  'src/app/plan/new',
  'src/lib/demo',
  'src/lib/preflight',
  'src/components/preflight',
  'src/app/plan/[eventId]/pre-flight',
  'src/app/plan/[eventId]/setup',
  // test:demo-sandbox-b S11's files not already named above
  'src/lib/sms',
  'src/lib/live-sends.ts',
  // the neighbours no item edits
  'src/components/plan/Moment2Opening.tsx',
  'src/components/plan/Moment2Step2Skeleton.tsx',
  'src/components/plan/MomentWords.tsx',
  'src/lib/moments/moment-words.ts',
  'src/components/plan/MomentArc.tsx',
  'src/components/demo/CrowdButton.tsx',
  'src/components/shared/DropOffDisplay.tsx',
  'src/components/shared/EventDetails.tsx',
  'src/components/shared/HostCard.tsx',
  'src/lib/items/drop-off-words.ts',
  'src/lib/moment3/suggest.ts',
  'src/lib/moment3/people.ts',
  'src/lib/moment3/completion.ts',
];
const SUITE = 'tests/demo-tweaks-4-test.tsx';
const NEW_SCRIPT = 'test:demo-tweaks-4';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-4-test.tsx';
/** GTC-397's one script line, already on the branch this batch started from. */
const GTC397_SCRIPT = 'test:deploy-audit';
const GTC397_SCRIPT_VALUE = 'tsx tests/deploy-audit-test.ts';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  // ── Item 1 ──
  /** L1 — the plan screen carries no Moment words: no marker, neither heading; the strip before the one heading. */
  noLeadIn(html: string) {
    const strip = html.indexOf('data-moment-strip');
    const h1 = html.indexOf('<h1');
    return (
      strip >= 0 &&
      h1 > strip &&
      count(html, '<h1') === 1 &&
      !html.includes('data-moment-words') &&
      !html.includes(DOES_HEAD) &&
      !html.includes(DONE_HEAD)
    );
  },
  /** L2 — with the event's facts: the drop-off line straight after the strip's block and straight before the heading. */
  dropOffAfterStrip(html: string) {
    const strip = html.indexOf('data-moment-strip');
    const line = html.indexOf('<p data-drop-off-line=""');
    const h1 = html.indexOf('<h1');
    const gap = strip >= 0 && line > strip ? html.slice(strip, line) : '';
    return (
      line > strip &&
      h1 > line &&
      /<p data-drop-off-line=""[^>]*>[^<]*<\/p><h1\b/.test(html) &&
      count(html, 'data-drop-off-line') === 1 &&
      // the strip's own tap note is the one paragraph it may draw
      !/<p\b(?! data-strip-note)|<h[1-6]\b|data-moment-words/.test(gap)
    );
  },
  /** L3 — Moment 2's opening page keeps both lines, once each, "done" under "does"; the plan view draws neither. */
  openingKeeps(plan: string, opening: string) {
    const does = wordsOf(opening, '2-does');
    const done = wordsOf(opening, '2-done');
    return (
      does.length > 20 &&
      done.length > 20 &&
      does !== done &&
      count(opening, 'data-moment-words="2-does"') === 1 &&
      count(opening, 'data-moment-words="2-done"') === 1 &&
      /<\/p><\/div><div data-moment-words="2-done"/.test(opening) &&
      opening.includes(`>${DOES_HEAD}</p>`) &&
      opening.includes(`>${DONE_HEAD}</p>`) &&
      plan.length > 0 &&
      !plan.includes(does) &&
      !plan.includes(done)
    );
  },
  /** L4 — Moment 3 keeps its own: "does" then "done" directly under it, before its heading. */
  momentThreeKeeps(html: string) {
    const does = html.indexOf('data-moment-words="3-does"');
    const done = html.indexOf('data-moment-words="3-done"');
    const h1 = html.indexOf(M3_SENTENCE_HTML);
    return (
      does > 0 &&
      done > does &&
      h1 > done &&
      count(html, 'data-moment-words="3-does"') === 1 &&
      count(html, 'data-moment-words="3-done"') === 1 &&
      /<\/p><\/div><div data-moment-words="3-done"/.test(html)
    );
  },
  /** L5 — the plan view's code: no MomentWords at all; the heading onwards and the top as at the base. */
  planViewCode(now: string, base: string) {
    const fromHeading = (src: string) =>
      src.slice(src.indexOf('<h1 className="text-xl font-semibold'));
    const top = (src: string) =>
      between(src, 'return (\n    <div className="min-h-screen', '<MomentArc');
    return (
      now.length > 0 &&
      !now.includes('MomentWords') &&
      count(base, '<MomentWords') === 2 &&
      fromHeading(base).length > 1000 &&
      flat(fromHeading(now)) === flat(fromHeading(base)) &&
      top(base).length > 50 &&
      flat(top(now)) === flat(top(base))
    );
  },

  // ── Item 2 ──
  /** D1 — the plan screen: the line is a box in the card style, larger, dark, semibold, its mb-4; straight above the heading. */
  planLineBox(html: string, words: string) {
    const got = classesOf(html);
    return (
      !!got &&
      got.words === words &&
      sameSet(got.classes, PLAN_LINE_CLASSES) &&
      new RegExp(`<p data-drop-off-line="" class="[^"]*">[^<]*</p><h1\\b`).test(html) &&
      count(html, 'data-drop-off-line') === 1
    );
  },
  /** D2 — no new colours: every class the box carries is one the plan view's own code already uses for its cards. */
  boxReusesCards(planCode: string) {
    return (
      /border border-gray-200 rounded-lg bg-white/.test(planCode) &&
      ['border-gray-200', 'bg-white', 'text-gray-900', 'rounded-lg', 'px-4', 'py-3'].every((c) =>
        new RegExp(`className="[^"]*\\b${c}\\b[^"]*"`).test(planCode)
      )
    );
  },
  /** D3 — Moment 3: in the top row (after W10, before the event's name, before the strip), dark and semibold, text-sm, no margin, padding or box. */
  rowLine(html: string, words: string) {
    const line = html.indexOf('<p data-drop-off-line=""');
    const back = html.indexOf(M3_W10);
    const name = html.indexOf('data-event-details-button');
    const strip = html.indexOf('data-moment-strip');
    const got = classesOf(html.slice(Math.max(0, line)));
    return (
      back > 0 &&
      line > back &&
      name > line &&
      strip > name &&
      !!got &&
      got.words === words &&
      sameSet(got.classes, ROW_LINE_CLASSES) &&
      !got.classes.some((c) => /^(m|p)[xytblr]?-|^border|^bg-|^rounded/.test(c)) &&
      count(html, 'data-drop-off-line') === 1
    );
  },
  /** D4 — one prop says which: the component takes facts and place ('plan' | 'row') and nothing else; no hook, router or fetch; the words from eventDropOffLine. */
  componentProp(src: string) {
    const sig = between(src, 'export default function EventDropOffLine({', '}) {');
    return (
      /^export default function EventDropOffLine\(\{\s*facts,\s*place,\s*\}: \{\s*facts: DropOffFacts;\s*place: DropOffPlace;\s*$/.test(
        sig
      ) &&
      /export type DropOffPlace = 'plan' \| 'row';/.test(src) &&
      /\{eventDropOffLine\(facts\)\}/.test(src) &&
      count(src, 'data-drop-off-line=""') === 1 &&
      !/\buse[A-Z]\w*\(|useRouter|fetch\(|'use client'|spacing/.test(src)
    );
  },
  /** D5 — only the two views draw it, each saying which; nothing else in src imports it (the pre-flight neither). */
  onlyTwoCallers(files: Array<{ rel: string; text: string }>) {
    const importers = files
      .filter((f) => f.text.includes("from '@/components/shared/EventDropOffLine'"))
      .map((f) => f.rel)
      .sort();
    const uses = files.flatMap((f) =>
      [...f.text.matchAll(/<EventDropOffLine\b[^>]*\/>/g)].map((m) => `${f.rel} ${m[0]}`)
    );
    return (
      files.length > 200 &&
      JSON.stringify(importers) === JSON.stringify([M3_VIEW, PLAN_VIEW].sort()) &&
      uses.length === 2 &&
      uses.includes(`${PLAN_VIEW} <EventDropOffLine facts={details} place="plan" />`) &&
      uses.includes(`${M3_VIEW} <EventDropOffLine facts={details} place="row" />`)
    );
  },
  /** D6 CONTROL — Moment 3's top row otherwise as at the base: only the line's prop changed. */
  topRowKept(now: string, base: string) {
    const row = (src: string) => between(src, '{(topBack || details) && (', '<MomentArc');
    return (
      row(base).length > 200 &&
      count(row(base), 'spacing=""') === 1 &&
      flat(row(now)) === flat(row(base).replace('spacing=""', 'place="row"'))
    );
  },

  // ── Item 3 ──
  /** A1 — the word: the founder's, the typographic apostrophe once and no straight one, its full stop. */
  assignWord(mod: any) {
    const w = mod?.M3_WORDS?.ASSIGN_HOW;
    return (
      w === ASSIGN_HOW &&
      count(w, '’') === 1 &&
      !w.includes("'") &&
      w.endsWith('.') &&
      mod?.M3_WORDS?.SENTENCE === "Now. Who's on what."
    );
  },
  /** A2 — Moment 3 with items: the heading and the line in one block that keeps the heading's mb-6 and is a row from md up; the line small grey, once, before the counter and the lists. */
  assignLine(html: string) {
    const m = html.match(
      new RegExp(
        `<div class="${rx(HEADING_BLOCK)}"><h1 class="${rx(M3_H1_CLASS)}">Now\\. Who&#x27;s on what\\.</h1><p data-m3="assign-how" class="([^"]*)">([^<]*)</p></div>`
      )
    );
    const line = html.indexOf('data-m3="assign-how"');
    const lists = html.indexOf(M3_LISTS);
    const counter = html.indexOf(COUNTER_1_OF_3);
    return (
      !!m &&
      m[2] === ASSIGN_HOW &&
      sameSet(m[1].split(/\s+/).filter(Boolean), ASSIGN_HOW_CLASSES) &&
      count(html, 'data-m3="assign-how"') === 1 &&
      count(html, ASSIGN_HOW) === 1 &&
      lists > line &&
      counter > lists
    );
  },
  /** A3 — the empty screen: "No plan items yet.", no line, the heading alone in its block (its old height). */
  noLineWhenEmpty(html: string) {
    return (
      html.includes(NO_PLAN_ITEMS) &&
      html.includes(
        `<div class="${HEADING_BLOCK}"><h1 class="${M3_H1_CLASS}">Now. Who&#x27;s on what.</h1></div>`
      ) &&
      !html.includes('data-m3="assign-how"') &&
      !html.includes(ASSIGN_HOW) &&
      html.includes('Now. Who&#x27;s on what.')
    );
  },
  /** A4 — the words file differs from the base by the new constant (and its comment) and nothing else. */
  wordsDiffer(diff: string) {
    const lines = diff.split('\n');
    const minus = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
    const plus = lines
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1));
    const added = plus.filter((l) => !/^\s*\/\//.test(l));
    return (
      diff.length > 0 &&
      minus.length === 0 &&
      added.length === 1 &&
      added[0] === ASSIGN_HOW_LINE &&
      plus.length <= 4
    );
  },
  /** A5 — the view reads it from M3_WORDS, once, only while there are items; the words are not typed in the view. */
  viewReadsWord(view: string) {
    return (
      count(view, '{M3_WORDS.ASSIGN_HOW}') === 1 &&
      /<div className="mb-6 md:flex md:flex-wrap md:items-baseline md:gap-x-4">\s*<h1 className="text-xl font-semibold text-gray-900">\{M3_WORDS\.SENTENCE\}<\/h1>\s*\{allItems\.length > 0 && \(\s*<p data-m3="assign-how" className="mt-1 md:mt-0 text-sm text-gray-600">\s*\{M3_WORDS\.ASSIGN_HOW\}\s*<\/p>\s*\)\}\s*<\/div>/.test(
        view
      ) &&
      !view.includes('Tap a person') &&
      view.indexOf('data-m3="assign-how"') > view.indexOf('{M3_WORDS.SENTENCE}</h1>') &&
      view.indexOf('data-m3="assign-how"') < view.indexOf('{allItems.length === 0 ? (')
    );
  },

  // ── Item 4 ──
  /** S1 — the button: the same words, the compact class, straight after the counter, once. */
  suggestButton(html: string) {
    const m = html.match(
      new RegExp(
        `<p class="text-sm text-gray-600">${rx(COUNTER_1_OF_3)}</p><button type="button" data-m3="suggest" class="([^"]*)">${rx(SUGGEST)}</button>`
      )
    );
    return !!m && m[1] === SUGGEST_CLASS && count(html, `>${SUGGEST}</button>`) === 1;
  },
  /** S2 — the accent fill: the button carries "Add a crowd"'s three colours, read from its file, and no other colour or underline. */
  crowdColours(cls: string, crowdSrc: string) {
    const crowd = crowdSrc.match(/className="(w-full py-3 [^"]*)"/);
    const crowdTokens = crowd ? crowd[1].split(/\s+/) : [];
    const tokens = cls.split(/\s+/);
    const colours = tokens.filter((t) => /^(?:hover:)?(?:bg|text)-(?!sm$|xs$|base$|lg$)/.test(t));
    return (
      CROWD_COLOURS.every((c) => crowdTokens.includes(c) && tokens.includes(c)) &&
      colours.length === CROWD_COLOURS.length &&
      !tokens.some((t) => /underline|gray/.test(t))
    );
  },
  /** S3 — no added height: no vertical padding but py-0, no border, no height, leading or larger text, the link's text-sm and mt-1, not full width. */
  noAddedHeight(cls: string, linkAtBase: string) {
    const tokens = cls.split(/\s+/).filter(Boolean);
    const link = linkAtBase.split(/\s+/).filter(Boolean);
    return (
      linkAtBase === LINK_CLASS &&
      tokens.includes('py-0') &&
      tokens.includes('text-sm') &&
      link.includes('text-sm') &&
      tokens.includes('mt-1') &&
      link.includes('mt-1') &&
      !tokens.some((t) => HEIGHT_CLASS.test(t)) &&
      !link.some((t) => HEIGHT_CLASS.test(t))
    );
  },
  /** S4 — the same handler and condition, the words from M3_WORDS: shown while there are proposals and none on screen. */
  suggestSource(view: string) {
    return new RegExp(
      `proposals\\.length > 0 &&\\s*ghosts\\.length === 0 && \\(\\s*<button\\s+type="button"\\s+data-m3="suggest"\\s+onClick=\\{\\(\\) => setGhosts\\(proposals\\)\\}\\s+className="${rx(SUGGEST_CLASS)}"\\s*>\\s*\\{M3_WORDS\\.WANT_ME_TO_SUGGEST\\}\\s*</button>\\s*\\)`
    ).test(view);
  },
  /** S5 — nothing to suggest (every dish held): no button. */
  noButtonWhenNothing(html: string) {
    return html.includes('3 of 3 items assigned.') && !html.includes(SUGGEST);
  },
  /** S6 CONTROL — Accept all's own branch, and its class, as at the base. */
  acceptAllKept(now: string, base: string) {
    const branch = (src: string) => between(src, '{accepting || onScreen.length > 0 ? (', ') : (');
    return (
      branch(base).length > 200 &&
      flat(branch(now)) === flat(branch(base)) &&
      count(now, `className="${ACCEPT_ALL_CLASS}"`) === 1 &&
      count(base, `className="${ACCEPT_ALL_CLASS}"`) === 1
    );
  },

  // ── Item 5 ──
  /** H1 — the colour: beside GIVEN_ROW (unchanged), a deeper fill and border, the same dark text, blue, never the board's. */
  deeperBlue(mod: any) {
    const g = mod?.GIVEN_ROW;
    const h = mod?.HELD_BY_PICKED_ROW;
    const rgb = (x: string) => hexRgb(x) ?? [0, 0, 0];
    const blue = (x: string) => rgb(x)[2] > rgb(x)[0] && rgb(x)[2] > rgb(x)[1];
    return (
      !!g &&
      !!h &&
      g.background === SOFT_BLUE.background &&
      g.border === SOFT_BLUE.border &&
      g.text === SOFT_BLUE.text &&
      [h.background, h.border, h.text].every((x: string) => hexRgb(x) !== null) &&
      h.text === SOFT_BLUE.text &&
      luminance(h.background) < luminance(g.background) - 0.05 &&
      luminance(h.border) < luminance(g.border) - 0.1 &&
      blue(h.background) &&
      blue(h.border) &&
      !BOARD_COLOURS.includes(h.background.toUpperCase()) &&
      !BOARD_COLOURS.includes(h.border.toUpperCase()) &&
      contrast(h.text, h.background) >= 4.5
    );
  },
  /** H2 — the rule: yes for the picked person's rows (held, or saving as theirs); no for anyone else's, a suggestion, a row saving away, or nobody picked. */
  heldRule(fn: any) {
    if (typeof fn !== 'function') return false;
    const ross = { kind: 'person', id: 'p-ross' };
    const mere = { kind: 'person', id: 'p-mere' };
    const cases: Array<[unknown, unknown, unknown, string]> = [
      // yes: what Ross holds
      [ross, HOLDERS, {}, 'lamb,trifle'],
      // the highlight moves with the pick
      [mere, HOLDERS, {}, 'bread'],
      // yes: the pav saving as Ross's; the bread moving from Mere to Ross
      [ross, HOLDERS, { pav: 'p-ross' }, 'lamb,pav,trifle'],
      [ross, HOLDERS, { bread: 'p-ross' }, 'bread,lamb,trifle'],
      // no: the lamb being taken back from Ross; the trifle moving to Mere
      [ross, HOLDERS, { lamb: null }, 'trifle'],
      [ross, HOLDERS, { trifle: 'p-mere' }, 'lamb'],
      // no: a dish only suggested for Ross is held by nobody (suggestions are not an input)
      [ross, { pav: null }, {}, ''],
      // no: someone with nothing, a picked item, nobody picked (Done, Escape, a second tap)
      [{ kind: 'person', id: 'p-kate' }, HOLDERS, {}, ''],
      [{ kind: 'item', id: 'lamb' }, HOLDERS, {}, ''],
      [null, HOLDERS, { pav: 'p-ross' }, ''],
    ];
    return cases.every(([sel, holders, pending, want]) => {
      try {
        return sorted(fn(sel, holders, pending)) === want;
      } catch {
        return false;
      }
    });
  },
  /** H3 — the view draws the rows from the rule: one set from heldByPicked(selection, holders, pending), the row's attribute and the deeper colours from it, GIVEN_ROW otherwise. */
  viewUsesRule(view: string) {
    return (
      /import \{[^}]*\bHELD_BY_PICKED_ROW\b[^}]*\bheldByPicked\b[^}]*\} from '@\/lib\/moment3\/assigning';/.test(
        view
      ) &&
      count(view, 'heldByPicked(') === 1 &&
      /const heldByThem = new Set\(heldByPicked\(selection, holders, pending\)\);/.test(view) &&
      /const isTheirs = heldByThem\.has\(item\.id\);/.test(view) &&
      /const rowColours = isTheirs \? HELD_BY_PICKED_ROW : GIVEN_ROW;/.test(view) &&
      /data-m3-held-by-picked=\{isTheirs \? '' : undefined\}/.test(view) &&
      /backgroundColor: rowColours\.background,\s*borderColor: rowColours\.border,\s*color: rowColours\.text,/.test(
        view
      ) &&
      count(view, 'data-m3-held-by-picked') === 1 &&
      !/GIVEN_ROW\.(background|border|text)/.test(view)
    );
  },
  /** H4 — nobody picked: no row marked; a held row is the soft blue; the deeper blue nowhere. */
  nobodyPicked(html: string, deeper: string) {
    const lamb = html.match(/<li data-m3-item="i-lamb"[^>]*>/);
    return (
      !!lamb &&
      lamb[0].includes(
        `style="background-color:${SOFT_BLUE.background};border-color:${SOFT_BLUE.border};color:${SOFT_BLUE.text}"`
      ) &&
      !html.includes('data-m3-held-by-picked') &&
      deeper.length === 7 &&
      !html.includes(deeper)
    );
  },
  /** H5 CONTROL — no new request: the view's fetches as at the base; the rules file only grows (nothing in it changed or removed). */
  nothingElse(view: string, baseView: string, assigningDiff: string) {
    const fetches = (src: string) => (src.match(/\bfetch\(/g) ?? []).length;
    const minus = assigningDiff
      .split('\n')
      .filter((l) => l.startsWith('-') && !l.startsWith('---'));
    return (
      fetches(baseView) > 0 &&
      fetches(view) === fetches(baseView) &&
      assigningDiff.includes('+export function heldByPicked(') &&
      assigningDiff.includes('+export const HELD_BY_PICKED_ROW') &&
      minus.length === 0
    );
  },

  // ── CONTROL ──
  /** U2 — package.json differs from the tag by GTC-397's script line and this suite's, nothing else. */
  twoScriptLines(atAdd: string, goodJson: string) {
    try {
      const now = JSON.parse(atAdd);
      const good = JSON.parse(goodJson);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (now?.scripts?.[GTC397_SCRIPT] !== GTC397_SCRIPT_VALUE) return false;
      if (good?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      if (good?.scripts?.[GTC397_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      delete now.scripts[GTC397_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(good);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ Item 1 ═══════════════════════════════════════════════════════════════════
async function layerL() {
  section('L — item 1: the plan screen loses its lead-in');
  const plan = drawPlan({});
  const own = drawPlan({ ownPlan: true });
  assert(
    'L',
    'L1 the plan screen carries no Moment words (no data-moment-words, no "What this does", no "When it’s done"), the generated plan and the plan written by hand alike; the strip before the one heading',
    CHECKS.noLeadIn(plan) && CHECKS.noLeadIn(own),
    plan.slice(plan.indexOf('data-moment-strip'), plan.indexOf('<h1')).slice(-300)
  );
  const withFacts = drawPlan({ details: VENUE_FACTS });
  assert(
    'L',
    'L2 the drop-off line stays directly above the heading, now straight after the strip with nothing between',
    CHECKS.dropOffAfterStrip(withFacts) && withFacts.includes(`>${VENUE_LINE}</p><h1`),
    withFacts.slice(withFacts.indexOf('data-drop-off-line') - 60, withFacts.indexOf('<h1') + 10)
  );
  const opening = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
    })
  );
  assert(
    'L',
    'L3 Moment 2’s OPENING page keeps its "What this does" and "When it’s done", once each, "done" under "does"; the plan view draws neither line’s words',
    CHECKS.openingKeeps(plan, opening)
  );
  assert(
    'L',
    'L4 Moment 3 keeps its own "What this does" and "When it’s done", before "Now. Who’s on what."',
    CHECKS.momentThreeKeeps(drawM3({}))
  );
  assert(
    'L',
    'L5 the plan view’s code holds no MomentWords (neither the two lines nor the import); the heading onwards and the top as at the base (8a4f1bc); the skeleton and the Moment words not edited (U1)',
    CHECKS.planViewCode(code(PLAN_VIEW), stripComments(atRef(BASE, PLAN_VIEW))) &&
      !code(SKELETON).includes('MomentWords')
  );
}

// ══ Item 2 ═══════════════════════════════════════════════════════════════════
async function layerD() {
  section('D — item 2: the drop-off line stands out');
  const plan = drawPlan({ details: VENUE_FACTS });
  const planNoVenue = drawPlan({ details: NO_VENUE_FACTS });
  assert(
    'D',
    'D1 the plan screen: the same words in a box (rounded-lg, border, border-gray-200, bg-white, px-4 py-3), text-base, font-semibold, text-gray-900, its mb-4; straight above the heading; with no venue too',
    CHECKS.planLineBox(plan, VENUE_LINE) && CHECKS.planLineBox(planNoVenue, NO_VENUE_LINE),
    JSON.stringify(classesOf(plan))
  );
  assert(
    'D',
    'D2 no new colours: the box is the plan view’s own card style (its forms’ border border-gray-200 rounded-lg bg-white), every class it carries already used by the view’s cards',
    CHECKS.boxReusesCards(code(PLAN_VIEW))
  );
  const m3 = drawM3({ details: VENUE_FACTS });
  const m3NoVenue = drawM3({ details: NO_VENUE_FACTS });
  assert(
    'D',
    'D3 Moment 3: the same words in the top row (after W10, before the event’s name and the strip), font-semibold and text-gray-900 at text-sm as before, no margin, padding or box, so no height above the lists; with no venue too',
    CHECKS.rowLine(m3, VENUE_LINE) && CHECKS.rowLine(m3NoVenue, NO_VENUE_LINE),
    JSON.stringify(classesOf(m3.slice(Math.max(0, m3.indexOf('<p data-drop-off-line')))))
  );
  assert(
    'D',
    'D4 one prop on the shared component says which of the two it is (place: plan or row; the old spacing prop gone); no hook, router or fetch; the words still from eventDropOffLine',
    CHECKS.componentProp(code(DROP_LINE_FILE))
  );
  const files = walk('src').map((rel) => ({ rel, text: code(rel) }));
  assert(
    'D',
    `D5 across ${files.length} source files only the plan view (place="plan") and Moment 3 (place="row") draw it; nothing else imports it (the pre-flight neither)`,
    CHECKS.onlyTwoCallers(files)
  );
  assert(
    'D',
    'D6 CONTROL: Moment 3’s top row otherwise as at the base (8a4f1bc): W10, the event’s details and their order unchanged, only the line’s prop',
    CHECKS.topRowKept(code(M3_VIEW), stripComments(atRef(BASE, M3_VIEW)))
  );
}

// ══ Item 3 ═══════════════════════════════════════════════════════════════════
async function layerA() {
  section('A — item 3: how to give dishes, on Moment 3');
  const W3 = await load('../src/lib/moment3/words');
  assert(
    'A',
    'A1 M3_WORDS.ASSIGN_HOW is the founder’s "Shortest": "Tap a person, then tap the dishes they’re bringing." (U+2019 once, no straight apostrophe, the full stop)',
    !!W3 && CHECKS.assignWord(W3),
    JSON.stringify(W3?.M3_WORDS?.ASSIGN_HOW)
  );
  const m3 = drawM3({});
  assert(
    'A',
    'A2 Moment 3 with items: the line with "Now. Who’s on what." in one block keeping the heading’s mb-6 (a row from md up, so no height above the lists on a computer; under the heading on a phone, mt-1), text-sm text-gray-600, once, above the counter and the two lists',
    CHECKS.assignLine(m3),
    m3.slice(m3.indexOf('<h1'), m3.indexOf('<h1') + 300)
  );
  assert(
    'A',
    'A3 the "No plan items yet." screen has no line; the heading alone in its block, as tall as before',
    CHECKS.noLineWhenEmpty(drawM3({ categories: [], initialHolders: {} }))
  );
  assert(
    'A',
    'A4 the words file differs from the base (8a4f1bc) by ASSIGN_HOW and its comment, nothing else (every other Moment 3 word as it was)',
    CHECKS.wordsDiffer(git(['diff', BASE, '--', M3_WORDS_FILE]).stdout)
  );
  assert(
    'A',
    'A5 the view takes the line from M3_WORDS, once, drawn only while there are items, between the heading and the lists; the words are typed in no view',
    CHECKS.viewReadsWord(code(M3_VIEW))
  );
}

// ══ Item 4 ═══════════════════════════════════════════════════════════════════
async function layerS() {
  section('S — item 4, built again: "Want me to suggest?" as a compact filled button');
  const m3 = drawM3({});
  const shown = m3.match(/<button type="button" data-m3="suggest" class="([^"]*)">/);
  const cls = shown ? shown[1] : '';
  assert(
    'S',
    'S1 "Want me to suggest?" is a button with the compact class, straight after the counter line, once',
    CHECKS.suggestButton(m3),
    m3.slice(m3.indexOf(COUNTER_1_OF_3) - 40, m3.indexOf(COUNTER_1_OF_3) + 260)
  );
  assert(
    'S',
    'S2 the accent fill: "Add a crowd"’s colours exactly (bg-accent, text-white, hover:bg-accent-dark, read from CrowdButton.tsx), no other colour, no underline',
    CHECKS.crowdColours(cls, code(CROWD_FILE)),
    cls
  );
  const linkAtBase =
    stripComments(atRef(BASE, M3_VIEW)).match(
      /onClick=\{\(\) => setGhosts\(proposals\)\}\s+className="([^"]*)"/
    )?.[1] ?? '';
  assert(
    'S',
    'S3 it adds no height: no vertical padding (py-0), no border, no height, leading or larger text, not full width; text-sm and mt-1 as the link at the base (8a4f1bc) — 20px line + 0 padding + 0 border = 20px, mt-1 4px above, as the link',
    CHECKS.noAddedHeight(cls, linkAtBase),
    `${cls} | base: ${linkAtBase}`
  );
  assert(
    'S',
    'S4 the same words (M3_WORDS.WANT_ME_TO_SUGGEST), the same handler (setGhosts with the proposals) and the same condition (proposals and none on screen)',
    CHECKS.suggestSource(code(M3_VIEW))
  );
  const allHeld = drawM3({
    initialHolders: {
      'i-lamb': { personId: 'p-ross', name: 'Ross Lowe' },
      'i-bread': { personId: 'p-mere', name: 'Mere Ngata' },
      'i-pav': { personId: 'p-ross', name: 'Ross Lowe' },
    },
  });
  assert(
    'S',
    'S5 with nothing to suggest (every dish held) there is no button',
    CHECKS.noButtonWhenNothing(allHeld)
  );
  assert(
    'S',
    'S6 CONTROL: "Accept all", which replaces it after the tap, keeps its own style; its branch as at the base (8a4f1bc)',
    CHECKS.acceptAllKept(code(M3_VIEW), stripComments(atRef(BASE, M3_VIEW)))
  );
}

// ══ Item 5 ═══════════════════════════════════════════════════════════════════
async function layerH() {
  section('H — item 5: tapping a person highlights their dishes');
  const AS = await load('../src/lib/moment3/assigning');
  assert(
    'H',
    'H1 HELD_BY_PICKED_ROW, beside GIVEN_ROW (unchanged): a deeper blue fill and a deeper border, the same dark text (readable, 4.5:1 or more), hex, never the board’s colours',
    !!AS && CHECKS.deeperBlue(AS),
    JSON.stringify(AS?.HELD_BY_PICKED_ROW)
  );
  assert(
    'H',
    'H2 the rule (heldByPicked): the picked person’s rows, held or saving as theirs, and it moves with the pick; not a row taken back or moving away, not a suggestion, not with nobody or an item picked',
    !!AS && CHECKS.heldRule(AS.heldByPicked)
  );
  assert(
    'H',
    'H3 Moment 3 draws the rows from the rule: the picked person’s rows carry data-m3-held-by-picked and the deeper blue, every other given row GIVEN_ROW; the ring on open dishes untouched',
    CHECKS.viewUsesRule(code(M3_VIEW))
  );
  assert(
    'H',
    'H4 with nobody picked (as Moment 3 opens), no row is marked and a held row is the soft blue',
    CHECKS.nobodyPicked(drawM3({}), String(AS?.HELD_BY_PICKED_ROW?.background ?? ''))
  );
  assert(
    'H',
    'H5 CONTROL: no new request (the view’s fetches as at the base, 8a4f1bc) and nothing in the rules file changed or removed, only the colour and the rule added',
    CHECKS.nothingElse(
      code(M3_VIEW),
      stripComments(atRef(BASE, M3_VIEW)),
      git(['diff', BASE, '--', ASSIGNING_FILE]).stdout
    )
  );
}

// ══ CONTROL ══════════════════════════════════════════════════════════════════
async function layerU() {
  section('U — CONTROL: what this batch must not touch');
  const missing = NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since demo-tweaks-3-good (routes, schema, auth, press, AI, email, households, the paying page, the demo library, the pre-flight, the setup page, SMS, the live switch, and the neighbours no item edits)`,
    missing.length === 0 && unchangedSinceGood(NOT_TOUCHED),
    missing.length ? `missing: ${missing.join(', ')}` : undefined
  );
  // GTC-397's lesson: package.json and the lockfile are read at a fixed commit (the one that added
  // this suite), never as they are now, so a later ticket's script line cannot turn this red.
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U2 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from demo-tweaks-3-good by "${GTC397_SCRIPT}" (GTC-397) and "${NEW_SCRIPT}" and nothing else; the lockfile there is GTC-397’s (8a4f1bc)`,
    addCommit.length === 40 &&
      CHECKS.twoScriptLines(atRef(addCommit, 'package.json'), atRef(GOOD_TAG, 'package.json')) &&
      git(['diff', '--quiet', BASE, addCommit, '--', 'package-lock.json']).status === 0
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${GOOD_TAG}..HEAD`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U3 neither scripts/dev-login.ts nor scripts/print-host-link.ts is in any commit on the branch',
    tracked.length === 0,
    tracked.join(', ')
  );
}

async function main() {
  await layerL();
  await layerD();
  await layerA();
  await layerS();
  await layerH();
  await layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_4_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_4_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
