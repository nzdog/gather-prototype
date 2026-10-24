/**
 * [[GTC-399]] — THE DEMO TWEAKS, LIST SIX (THE LIGHT PATH): the first of the founder's new notes,
 * 24 Oct 2026. Words, layout, a screen's order and a scroll position only.
 *
 * Founder rulings, 24 Oct 2026 (his prompt). Each item adds its own layer here, in its own commit.
 *
 * THE LAYERS
 *   B  item 1: the Moments strip on the three pages that lacked it as he saw them: Moment 1's
 *      opening (current 1), Moment 2's opening (current 2, Moment 1 done) and Moment 1's summary
 *      (current 1); the same MomentArc and the doors the setup page builds, under the top row and
 *      above the title; the titles, words, buttons and links as they were.
 *   M  item 2: Moment 3's opening page, built like Moment 2's: "Who's on what?" big (the strip's own
 *      label), "What this does" and "When it’s done", one "Let’s do this →" (Moment 2's characters
 *      and classes), the strip (current 3, 1 and 2 done), "← Your events", the event's details and
 *      "← Back to the plan"; shown only after the plan screen's own forward button, a screen state
 *      stored nowhere; every other way in opens the working screen, which loses its two blocks.
 *   T  item 3: Moment 3's working screen opens at the top: the view's own arrival effect jumps the
 *      window (what scrolls there) to the top, plainly, every time it opens except the landing on
 *      one dish, which keeps its centring.
 *   F  item 4: the sample's button reads "Fill in demo answers": that one constant, the file otherwise
 *      as it was; no visible line in the code names the button by its old words.
 *   K  item 5 (as the founder ruled again, 24 Oct 2026: "two tick boxes so either can be ticked"):
 *      the row's box as it always was, and while a folding step is open a second at its foot, the
 *      same control (one state, one handler); Ready and the settled steps as they were.
 *   S  item 6 (the founder's ruling, 24 Oct 2026: "All three"): the strip on the generating screen
 *      (current 2, its doors waiting while it works), "Who I nudge" after the press and the board
 *      (both Moment 4's, as the pre-flight's own strip and the board's label say), the same
 *      MomentArc; on the host's signed-in pages only; GlanceBoard itself not edited.
 *   U  CONTROL: the files this batch must not touch are not edited since demo-tweaks-4-good;
 *      package.json (read at the commit that added this suite) differs by one script line; the
 *      lockfile there is the tag's; the two untracked scripts are in no commit.
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
import SetupOpeningScreen from '../src/components/plan/SetupOpeningScreen';
import Moment2Opening from '../src/components/plan/Moment2Opening';
import Moment1Summary from '../src/components/plan/Moment1Summary';
import Moment3Opening from '../src/components/plan/Moment3Opening';
// Moment 3 and the toast provider imported statically, as the Moment 3 suites do (a dynamic
// import() would give the view a second toast context).
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import TypicalAnswersButton from '../src/components/demo/TypicalAnswersButton';
import PreflightStep from '../src/components/preflight/PreflightStep';
import Moment2Step2Skeleton from '../src/components/plan/Moment2Step2Skeleton';
import { AfterThePressView } from '../src/components/preflight/AfterThePress';

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
/** The tag the founder last looked at (GTC-399's rollback structure). */
const GOOD_TAG = 'demo-tweaks-4-good';
/** GTC-398's last commit, where this batch started (the tag's commit, named for good). */
const BASE = '6d2b10397975ba688f543b8561ca918e0870ea56';
/** [[GTC-400]]'s base: this batch's last commit (528e8ad), named for good. */
const GTC400_BASE = '528e8adc5960c3fe3de989a89b738dbbe6a60e1d';
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const unchangedSinceGood = (paths: string[]) =>
  git(['diff', '--quiet', GOOD_TAG, '--', ...paths]).status === 0;
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const render = (el: any) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    console.log(`    (render threw: ${String((err as Error).message).split('\n')[0]})`);
    return '';
  }
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
/** One JSX element's opening tag and props, from `<Name` to its first `/>` or `>` at depth 0. */
function elementOf(src: string, name: string): string {
  const at = src.indexOf(`<${name}`);
  if (at < 0) return '';
  let depth = 0;
  for (let i = at + 1; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (depth === 0 && c === '>') return src.slice(at, i + 1);
  }
  return '';
}
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};
/** A file's code lines (comments stripped, trimmed, blank lines dropped), for a line-set diff. */
const codeLines = (src: string) =>
  stripComments(src)
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
/** The code lines in `a` and not in `b`, counted (a multiset difference). */
function linesNotIn(a: string[], b: string[]): string[] {
  const left = new Map<string, number>();
  for (const l of b) left.set(l, (left.get(l) ?? 0) + 1);
  const out: string[] = [];
  for (const l of a) {
    const n = left.get(l) ?? 0;
    if (n > 0) left.set(l, n - 1);
    else out.push(l);
  }
  return out;
}

// ── Shared fixtures, hand-written ────────────────────────────────────────────
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
const OPENING_1 = 'src/components/plan/SetupOpeningScreen.tsx';
const OPENING_2 = 'src/components/plan/Moment2Opening.tsx';
const SUMMARY = 'src/components/plan/Moment1Summary.tsx';
const ARC_FILE = 'src/components/plan/MomentArc.tsx';
const OPENING_3 = 'src/components/plan/Moment3Opening.tsx';
const M3_VIEW = 'src/components/plan/Moment3AssignView.tsx';
const TITLES_FILE = 'src/lib/moments/opening-titles.ts';
/** Moment 3's two lines and the founder's two labels, typed by hand (GTC-368's words). */
const M3_DOES =
  'Puts a name next to every job. You decide who’s on what, and I keep track of it all.';
const M3_DONE =
  'Every job has an owner, and you’re not carrying the plan anymore. I’ll ask each person and follow up, so you don’t have to.';
const DOES_HEAD = 'What this does';
const DONE_HEAD = 'When it’s done';
const BACK_TO_PLAN = '← Back to the plan';
const M3_SENTENCE_HTML = 'Now. Who&#x27;s on what.';
/** Moment 2's opening button, as its source writes it. */
const START_SRC = 'Let&rsquo;s do this &rarr;';
const SUITE = 'tests/demo-tweaks-5-test.tsx';
const TYPICAL_FILE = 'src/lib/demo/typical-answers.ts';
const STEP_FILE = 'src/components/preflight/PreflightStep.tsx';
const SKELETON = 'src/components/plan/Moment2Step2Skeleton.tsx';
const AFTER_PRESS = 'src/components/preflight/AfterThePress.tsx';
const BOARD_PAGE = 'src/app/plan/[eventId]/glance/page.tsx';
const HREFS_FILE = 'src/lib/moments/strip-hrefs.ts';
const BACK_TO_BOARD = '← Back to the board';
/** The strip's W8 after the press on an invites-only event (GTC-374), typed by hand. */
const NOT_NEEDED_AFTER_PRESS =
  'The invitations have gone as invites only, so there’s no plan to make.';
/** The tick slot in a folding step's row, as the base draws it (its classes unchanged). */
const SLOT = '<div data-tick-slot="" class="flex w-[5.25rem] shrink-0 justify-end">';

const OLD_BUTTON = 'Fill in typical answers';
/** The one new text in this batch (the founder's item 4). */
const NEW_BUTTON = 'Fill in demo answers';
/** Every .ts and .tsx file under `dir`, relative to the repo. */
const walk = (dir: string, out: string[] = []): string[] => {
  for (const name of fs.readdirSync(path.join(ROOT, dir))) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
};
const NEW_SCRIPT = 'test:demo-tweaks-5';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-5-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
/** The strip's four labels as React writes them (straight apostrophes escaped). */
const LABELS: Record<1 | 2 | 3 | 4, string> = {
  1: 'Who&#x27;s coming?',
  2: 'What&#x27;s the plan?',
  3: 'Who&#x27;s on what?',
  4: 'Is everyone sorted?',
};
const YOUR_EVENTS = '← Your events';
const START_1 = 'Ready to start herding →';
const START_2 = 'Let’s do this →';
const BACK_TO_PEOPLE = '← Back to the people';
const ON_TO_PLAN = 'On to the plan →';
const ADD_MORE = '+ Add more people';
/** Doors as the setup page hands them over: one that opens, the rest locked (hand-written lines). */
const LOCKED = 'A locked Moment’s line';
const doorsWith = (opens: number[], current: number) => {
  const doors: Record<number, unknown> = {};
  for (const n of [1, 2, 3, 4]) {
    if (n === current) continue;
    doors[n] = opens.includes(n) ? { onGo: () => {} } : { locked: LOCKED };
  }
  return doors;
};
const HOUSEHOLDS = [
  {
    id: 'h1',
    primaryContact: { name: 'Kate', email: 'k@example.com' },
    helpers: [],
    littleCount: 0,
    guests: [],
    isHostHousehold: true,
  },
  {
    id: 'h2',
    primaryContact: { name: 'Josie', email: 'j@example.com' },
    partner: { name: 'Ross', email: 'r@example.com' },
    helpers: [],
    littleCount: 0,
    guests: [],
  },
];

/**
 * B6: the code lines each item-1 file may lose (exactly these) and the shapes its new code lines may
 * take, against the base. Anything else lost or added is a change the founder did not ask for.
 */
const ITEM1_LOST: Record<string, string[]> = {
  [OPENING_1]: [
    'export default function SetupOpeningScreen({ onStart, details }: SetupOpeningScreenProps) {',
  ],
  [OPENING_2]: [],
  [SUMMARY]: ['<MomentArc currentMoment={2} completedMoments={[1]} doors={doors} />'],
};
const ITEM1_ADDED: Record<string, RegExp[]> = {
  [OPENING_1]: [
    /^import MomentArc, \{ type ArcDoor \} from '\.\/MomentArc';$/,
    /^doors\?: Partial<Record<1 \| 2 \| 3 \| 4, ArcDoor>>;$/,
    /^export default function SetupOpeningScreen\(\{ onStart, details, doors \}: SetupOpeningScreenProps\) \{$/,
    /^<div className="mb-6">$/,
    /^<MomentArc currentMoment=\{1\} doors=\{doors\} \/>$/,
    /^<\/div>$/,
  ],
  [OPENING_2]: [
    /^import MomentArc, \{ type ArcDoor \} from '@\/components\/plan\/MomentArc';$/,
    /^doors\?: Partial<Record<1 \| 2 \| 3 \| 4, ArcDoor>>;$/,
    /^doors,$/,
    /^<div className="mb-6">$/,
    /^<MomentArc currentMoment=\{2\} completedMoments=\{\[1\]\} doors=\{doors\} \/>$/,
    /^<\/div>$/,
  ],
  [SUMMARY]: [/^<MomentArc currentMoment=\{1\} doors=\{doors\} \/>$/],
};

// ── CHECKS-START: every condition, pure, dry-run before the gate ─────────────
/** The className of the one `<button>` whose children are `words`, in a source file. */
function buttonClassFor(src: string, words: string): string[] {
  const out: string[] = [];
  const re = /<button\b([\s\S]*?)>\s*([^<]*?)\s*<\/button>/g;
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[2] === words) out.push(m[1].match(/className="([^"]*)"/)?.[1] ?? '');
  }
  return out;
}
export const CHECKS = {
  // ── Item 1 ──
  /**
   * B1 to B3 — the strip on a page: one strip with its doors, in its own mb-6 wrapper (the summary
   * draws it bare, as it always has), after the top row's "← Your events" and before the one <h1>;
   * exactly one current Moment, the right one; the completed Moments ticked and no other.
   */
  stripOnPage(html: string, current: 1 | 2 | 3 | 4, completed: number[], wrapped: boolean) {
    const strip = html.indexOf('<div data-moment-strip="">');
    const out = html.indexOf(`>${YOUR_EVENTS}</a>`);
    const h1 = html.indexOf('<h1');
    const arc = strip >= 0 && h1 > strip ? html.slice(strip, h1) : '';
    const cur = arc.match(
      /aria-current="step"><span class="[^"]*">(\d)<\/span><span class="[^"]*">([^<]*)<\/span>/
    );
    // A static render writes the label and its tick as one run of text.
    const ticked = ([1, 2, 3, 4] as const).filter((n) => arc.includes(`${LABELS[n]} ✓`));
    return (
      count(html, 'data-moment-strip') === 1 &&
      out > 0 &&
      strip > out &&
      h1 > strip &&
      count(html, '<h1') === 1 &&
      (!wrapped || html.includes('<div class="mb-6"><div data-moment-strip="">')) &&
      count(html, 'aria-current="step"') === 1 &&
      !!cur &&
      cur[1] === String(current) &&
      cur[2] === LABELS[current] &&
      ticked.join(',') === completed.join(',') &&
      count(arc, '✓') === completed.length * 2 &&
      ([1, 2, 3, 4] as const).every((n) => count(arc, LABELS[n]) === 1)
    );
  },
  /** B1, B2 — an opening page otherwise as it was: its title, its words, its button, its way back. */
  openingRest(html: string, moment: 1 | 2, start: string, back: boolean) {
    const h1 = html.match(/<h1 class="([^"]*)">([^<]*)<\/h1>/);
    const primary = html.match(
      /<button[^>]*class="[^"]*\bbg-accent\b[^"]*"[^>]*>([^<]*)<\/button>/g
    );
    return (
      !!h1 &&
      h1[1] === 'text-4xl sm:text-5xl font-semibold text-gray-900 text-center' &&
      h1[2] === LABELS[moment] &&
      html.indexOf(`data-moment-words="${moment}-does"`) > html.indexOf('<h1') &&
      html.indexOf(`data-moment-words="${moment}-done"`) >
        html.indexOf(`data-moment-words="${moment}-does"`) &&
      (primary ?? []).length === 1 &&
      html.indexOf(`>${start}</button>`) > html.indexOf(`data-moment-words="${moment}-done"`) &&
      (moment === 1
        ? html.indexOf('herd of cats') > html.indexOf('<h1') &&
          html.indexOf('herd of cats') < html.indexOf('data-moment-words="1-does"')
        : !html.includes('herd of cats')) &&
      (!back || html.indexOf(`>${BACK_TO_PEOPLE}</button>`) > html.indexOf(`>${start}</button>`)) &&
      html.startsWith('<div class="fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto')
    );
  },
  /** B3 — the summary otherwise as it was: its headline, its line, its two buttons. */
  summaryRest(html: string) {
    return (
      html.includes(
        '<h1 class="text-2xl font-semibold text-gray-900">3 people coming to Boxing Day.</h1>'
      ) &&
      html.indexOf(`>${ADD_MORE}</button>`) > html.indexOf('<h1') &&
      html.indexOf(`>${ON_TO_PLAN}</button>`) > html.indexOf(`>${ADD_MORE}</button>`) &&
      html.startsWith('<div class="fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto">')
    );
  },
  /** B4 — the setup page hands each page the doors it builds for that page's Moment. */
  setupHandsDoors(src: string) {
    const first = elementOf(src, 'SetupOpeningScreen');
    const summary = elementOf(src, 'Moment1Summary');
    const second = elementOf(src, 'Moment2Opening');
    return (
      count(src, '<SetupOpeningScreen') === 1 &&
      count(src, '<Moment1Summary') === 1 &&
      count(src, '<Moment2Opening') === 1 &&
      /\bdoors=\{doorsFor\(1\)\}/.test(first) &&
      /\bdoors=\{doorsFor\(1\)\}/.test(summary) &&
      /\bdoors=\{doorsFor\(2\)\}/.test(second) &&
      !/doorsFor\(2\)/.test(summary)
    );
  },
  /** B5 — each page draws the one MomentArc, with the props for its Moment; MomentArc not edited. */
  oneArc(one: string, two: string, summary: string, arcUnchanged: boolean) {
    const arcs = (s: string) => s.match(/<MomentArc\b[^>]*\/>/g) ?? [];
    return (
      arcUnchanged &&
      arcs(one).join() === '<MomentArc currentMoment={1} doors={doors} />' &&
      arcs(two).join() === '<MomentArc currentMoment={2} completedMoments={[1]} doors={doors} />' &&
      arcs(summary).join() === '<MomentArc currentMoment={1} doors={doors} />'
    );
  },
  /** B6 CONTROL — a file's code against the base: it loses exactly `lost` and gains only `added`'s shapes. */
  onlyTheStrip(now: string, base: string, lost: string[], added: RegExp[]) {
    const n = codeLines(now);
    const b = codeLines(base);
    const gone = linesNotIn(b, n);
    const fresh = linesNotIn(n, b);
    return (
      b.length > 20 &&
      gone.join('\n') === lost.join('\n') &&
      fresh.length > 0 &&
      fresh.every((l) => added.some((re) => re.test(l)))
    );
  },

  // ── Item 2 ──
  /** M1 — OPENING_TITLES[3] is the strip's own third label, read from MomentArc as it stands. */
  thirdTitle(titles: any, arc: string) {
    const label = arc.match(/number:\s*3,\s*label:\s*"([^"]*)"/)?.[1];
    return label === "Who's on what?" && titles?.[3] === label && titles?.[1] && titles?.[2];
  },
  /** M2 — the opening page, rendered: its overlay, the strip, the title, the two blocks, the one button, the way back. */
  openingThree(html: string) {
    const h1 = html.match(/<h1 class="([^"]*)">([^<]*)<\/h1>/);
    const does = html.indexOf('data-moment-words="3-does"');
    const done = html.indexOf('data-moment-words="3-done"');
    const start = html.indexOf('>Let’s do this →</button>');
    const back = html.indexOf(`>${BACK_TO_PLAN}</button>`);
    const primary = html.match(/<button[^>]*class="[^"]*\bbg-accent\b[^"]*"[^>]*>/g) ?? [];
    const arcEnd = html.indexOf('<h1');
    const outsideStrip = html.slice(arcEnd);
    return (
      html.startsWith(
        '<div data-moment3-opening="" class="fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto">'
      ) &&
      !!h1 &&
      h1[1] === 'text-4xl sm:text-5xl font-semibold text-gray-900 text-center' &&
      h1[2] === LABELS[3] &&
      does > html.indexOf('<h1') &&
      done > does &&
      html.includes(`${M3_DOES}</p></div><div data-moment-words="3-done"`) &&
      html.includes(`>${DOES_HEAD}</p>`) &&
      html.includes(`>${DONE_HEAD}</p>`) &&
      html.includes(M3_DONE) &&
      count(html, 'data-moment-words="3-does"') === 1 &&
      count(html, 'data-moment-words="3-done"') === 1 &&
      start > done &&
      back > start &&
      primary.length === 1 &&
      (outsideStrip.match(/<button\b/g) ?? []).length === 2
    );
  },
  /** M3 — the button: Moment 2's characters, and Moment 2's classes, once in each file. */
  sameButton(three: string, two: string) {
    const a = buttonClassFor(three, START_SRC);
    const b = buttonClassFor(two, START_SRC);
    return a.length === 1 && b.length === 1 && a[0] === b[0] && a[0].includes('bg-accent');
  },
  /** M4 — the opening's code: the words from their files, no request, no storage, no router. */
  openingCode(src: string) {
    return (
      src.includes('{OPENING_TITLES[3]}') &&
      src.includes('<MomentWords moment={3} part="does"') &&
      src.includes('<MomentWords moment={3} part="done"') &&
      src.includes('{M3_WORDS.BACK_TO_PLAN}') &&
      src.includes('{STRIP_WORDS.YOUR_EVENTS}') &&
      /<MomentArc currentMoment=\{3\} completedMoments=\{\[1, 2\]\} doors=\{doors\} \/>/.test(
        src
      ) &&
      count(src, START_SRC) === 1 &&
      !/\bfetch\(|localStorage|sessionStorage|useRouter|router\.|document\.cookie|useEffect/.test(
        src
      ) &&
      !src.includes('EventDropOffLine')
    );
  },
  /**
   * M5 — the setup page: one new screen state, set only by applyStage; only the plan view's own
   * forward button (its onApprove, after the approval is stored) asks for it; the opening's button
   * opens the working screen; every other way to Moment 3 still asks for 'moment3'.
   */
  setupStage(src: string, approveEl: string) {
    const approve =
      approveEl.match(/onApprove=\{async \(\) => \{([\s\S]*?)\n {10}\}\}\s*onBack=/)?.[1] ?? '';
    const opening = elementOf(src, 'Moment3Opening');
    return (
      count(src, 'const [showMoment3Opening, setShowMoment3Opening] = useState(false);') === 1 &&
      count(src, 'setShowMoment3Opening(') === 1 &&
      /setShowMoment3\(stage === 'moment3'\);\s*setShowMoment3Opening\(stage === 'moment3-opening'\);/.test(
        src
      ) &&
      count(src, "'moment3-opening'") === 3 &&
      count(src, "applyStage('moment3-opening')") === 1 &&
      approve.indexOf('planApproved: true') > 0 &&
      approve.indexOf("applyStage('moment3-opening')") > approve.indexOf('planApproved: true') &&
      !approve.includes("applyStage('moment3')") &&
      count(src, '<Moment3Opening') === 1 &&
      /onStart=\{\(\) => applyStage\('moment3'\)\}/.test(opening) &&
      /\bdoors=\{doorsFor\(3\)\}/.test(opening) &&
      /\bdetails=\{details\}/.test(opening) &&
      count(src, 'if (showMoment3Opening && event && moment3Data) {') === 1 &&
      src.indexOf('if (showMoment3Opening && event && moment3Data) {') <
        src.indexOf('if (showMoment3 && event && moment3Data) {') &&
      // the other ways in, unchanged: the strip's door, her own list on an approved event, and the
      // opening's own button; the page load and a brought-back plan apply the entry rule's stage
      count(src, "applyStage('moment3')") === 3 &&
      count(src, "if (stage === 'moment3') {") === 1 &&
      !/showMoment3Opening|moment3-opening/.test(
        between(src, 'const goToMoment = async', 'const doorsFor')
      )
    );
  },
  /** M6 — the working screen, rendered: no Moment words; its strip, its heading, its line and its counter kept. */
  workingScreen(html: string) {
    const strip = html.indexOf('data-moment-strip');
    const heading = html.indexOf(M3_SENTENCE_HTML);
    return (
      strip > 0 &&
      heading > strip &&
      !html.includes('data-moment-words') &&
      !html.includes(DOES_HEAD) &&
      !html.includes(DONE_HEAD) &&
      !html.includes(M3_DOES) &&
      !html.includes(M3_DONE) &&
      html.includes('data-m3="assign-how"') &&
      html.includes('items assigned.')
    );
  },
  /** M7 CONTROL — a file's code against the base: it loses exactly `lost`, and gains only lines in `added`. */
  onlyThese(now: string, base: string, lost: string[], added: string[]) {
    const n = codeLines(now);
    const b = codeLines(base);
    return (
      b.length > 0 &&
      linesNotIn(b, n).join('\n') === lost.join('\n') &&
      linesNotIn(n, b).every((l) => added.includes(l))
    );
  },

  // ── Item 3 ──
  /**
   * T1 — the arrival effect, run once as the screen opens: the dish asked for is brought to the
   * middle; otherwise a plain jump of the window to the top (no options, nothing smooth). The one
   * window scroll in the view; no overlay, no ref.
   */
  jumpToTop(view: string) {
    return (
      /useEffect\(\(\) => \{\s*if \(arriveAtItem\) bringItemIntoView\(arriveAtItem\);\s*else window\.scrollTo\(0, 0\);\s*\}, \[\]\);/.test(
        view
      ) &&
      count(view, 'window.scrollTo(') === 1 &&
      count(view, 'scrollTop') === 0 &&
      count(view, 'bringItemIntoView(') === 2
    );
  },
  /** T2 — the landing on one dish keeps its centring: bringItemIntoView as at the base, a smooth scroll to the centre. */
  centringKept(view: string, base: string) {
    const fn = (src: string) => between(src, 'function bringItemIntoView(', '\n}\n');
    return (
      fn(base).length > 100 &&
      fn(view) === fn(base) &&
      fn(view).includes("row.scrollIntoView({ behavior: 'smooth', block: 'center' });")
    );
  },
  /** T3 — the page hands over the dish once, only from the address it opened on (as before). */
  handOverKept(setup: string, base: string) {
    const once = (src: string) =>
      count(src, 'if (askedItem) setArriveAtItem(askedItem);') === 1 &&
      count(src, 'setArriveAtItem(') === 2 &&
      count(src, 'arriveAtItem={arriveAtItem}') === 1;
    return once(setup) && once(base);
  },

  // ── Item 4 ──
  /** F1 — the constant reads the founder's words; the other words (W24 to W28) as they were. */
  newButtonWord(words: any) {
    return (
      words?.BUTTON === NEW_BUTTON &&
      words?.EXPLAIN ===
        'I’ll answer the questions the way a typical host might. You can change any answer before you press Generate.' &&
      words?.DONE === 'Filled in. Change anything you like.' &&
      words?.NOTHING === 'Everything’s already answered.'
    );
  },
  /** F2 — the file differs from the base by that one line and nothing else. */
  oneLineDiff(diff: string) {
    const changed = diff.split('\n').filter((l) => /^[-+]/.test(l) && !/^(---|\+\+\+) /.test(l));
    return changed.join('\n') === `-  BUTTON: '${OLD_BUTTON}',\n+  BUTTON: '${NEW_BUTTON}',`;
  },
  /** F3 — the button, rendered: the new words in it, the line under it, the old words nowhere. */
  buttonRendered(html: string) {
    return (
      html.includes(`>${NEW_BUTTON}</button>`) &&
      html.indexOf('I’ll answer the questions') > html.indexOf(`>${NEW_BUTTON}</button>`) &&
      !html.includes(OLD_BUTTON)
    );
  },
  /** F4 — no code (comments aside) in src says the old words; the new ones are typed in the words file only. */
  oldWordsGone(files: { rel: string; text: string }[]) {
    return (
      files.length > 100 &&
      files.every((f) => !f.text.includes(OLD_BUTTON)) &&
      files
        .filter((f) => f.text.includes(NEW_BUTTON))
        .map((f) => f.rel)
        .join() === TYPICAL_FILE
    );
  },

  // ── Item 5 ──
  /**
   * K1 to K5 — one step, rendered. The row's box is always there, as at the base: in the slot when
   * the step folds, in the header when it does not. `foot` says whether a second box sits at the
   * foot of the open content (after what the step shows, under a rule, marked data-tick-foot).
   * Every box carries the same word, the same checked state and the same disabled rule.
   */
  boxes(html: string, folds: boolean, foot: boolean, word: string, checked: boolean, off: boolean) {
    const headerEnd = html.indexOf('</header>');
    const inputs = html.match(/<input type="checkbox"[^>]*>/g) ?? [];
    const labels = [...html.matchAll(/<input type="checkbox"[^>]*\/?>([^<]*)<\/label>/g)].map(
      (m) => m[1]
    );
    const rowAt = html.indexOf('<input type="checkbox"');
    const footAt = html.indexOf(
      '<div data-tick-bottom="" class="mt-6 pt-4 border-t border-gray-100 flex justify-end">'
    );
    const inside = html.indexOf('INSIDE-');
    const row = inputs[0] ?? '';
    const second = inputs[1] ?? '';
    return (
      inputs.length === (foot ? 2 : 1) &&
      labels.length === inputs.length &&
      labels.every((w) => w === word) &&
      inputs.every((i) => /\bchecked=""/.test(i) === checked && /\bdisabled=""/.test(i) === off) &&
      rowAt > 0 &&
      rowAt < headerEnd &&
      !row.includes('data-tick-foot') &&
      (folds
        ? rowAt > html.indexOf(SLOT) && html.indexOf(SLOT) > 0
        : !html.includes('data-tick-slot')) &&
      (foot
        ? footAt > headerEnd &&
          footAt > inside &&
          inside > headerEnd &&
          html.indexOf(second) > footAt &&
          second.includes('data-tick-foot=""') &&
          count(html, 'data-tick-foot') === 1 &&
          !/\bid="/.test(second)
        : footAt < 0 && !html.includes('data-tick-foot'))
    );
  },
  /** K6 — the step's code: the row's box as at the base; the foot's the same control (one handler, one state, one rule), drawn only while a folding step is open. */
  stepCode(src: string, base: string) {
    const rowBox = (x: string) => between(x, 'const box = (', '</label>');
    const footBox = between(src, 'const footBox = (', '</label>');
    return (
      rowBox(base).length > 100 &&
      rowBox(src) === rowBox(base) &&
      footBox.replace(/\s*data-tick-foot=""/, '') ===
        rowBox(src).replace('const box = (', 'const footBox = (') &&
      count(src, 'onChange={(e) => onCheck(e.target.checked)}') === 2 &&
      count(src, 'checked={checked || settled}') === 2 &&
      count(src, 'disabled={settled}') === 2 &&
      count(src, 'const boxAtFoot = folds && open;') === 1 &&
      count(src, '{boxAtFoot && (') === 1 &&
      count(src, '{footBox}') === 1 &&
      count(src, '{box}') === count(base, '{box}') &&
      !/hover:bg-/.test(between(src, 'data-tick-bottom=""', '</div>'))
    );
  },

  // ── Item 6 ──
  /**
   * S1 to S3 — a strip on a screen without the setup page's top row: one strip, its current Moment,
   * its ticks, before the one <h1>, after `after` when given; the not-needed Moments marked.
   */
  stripBeforeTitle(
    html: string,
    current: 1 | 2 | 3 | 4,
    completed: number[],
    after: string | null,
    notNeeded: number[] = []
  ) {
    const strip = html.indexOf('<div data-moment-strip="">');
    const h1 = html.indexOf('<h1');
    const arc = strip >= 0 && h1 > strip ? html.slice(strip, h1) : '';
    const cur = arc.match(
      /aria-current="step"><span class="[^"]*">(\d)<\/span><span class="[^"]*">([^<]*)<\/span>/
    );
    const ticked = ([1, 2, 3, 4] as const).filter((n) => arc.includes(`${LABELS[n]} ✓`));
    return (
      count(html, 'data-moment-strip') === 1 &&
      count(html, '<h1') === 1 &&
      h1 > strip &&
      (after === null || (html.indexOf(after) > 0 && strip > html.indexOf(after))) &&
      html.includes('<div class="mb-6"><div data-moment-strip="">') &&
      !!cur &&
      cur[1] === String(current) &&
      cur[2] === LABELS[current] &&
      ticked.join(',') === completed.join(',') &&
      count(arc, 'data-not-needed') === notNeeded.length &&
      ([1, 2, 3, 4] as const).every((n) => count(arc, LABELS[n]) === 1)
    );
  },
  /** S1 — while it works, every door that opens is a disabled button; a locked one says its line. */
  doorsWait(html: string) {
    const arc = between(html, '<div data-moment-strip="">', '<h1');
    const opens = arc.match(/<button type="button" disabled=""[^>]*>/g) ?? [];
    const locked = arc.match(/<button type="button" aria-disabled="true"[^>]*>/g) ?? [];
    const live = (arc.match(/<button\b[^>]*>/g) ?? []).filter(
      (b) => !b.includes('disabled=""') && !b.includes('aria-disabled="true"')
    );
    return opens.length === 1 && locked.length === 2 && live.length === 0 && !arc.includes('<a ');
  },
  /** S2 — a Moment 4 screen's doors are links, to the setup page's three Moments; none to itself. */
  linkDoors(html: string, eventId: string) {
    const arc = between(html, '<div data-moment-strip="">', '<h1');
    const hrefs = [...arc.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
    return (
      hrefs.join(' ') ===
      `/plan/${eventId}/setup?at=people /plan/${eventId}/setup?at=plan /plan/${eventId}/setup`
    );
  },
  /** S4 — the doors as addresses, for planned and invites-only events, before and after the press. */
  doorRule(fn: any) {
    if (typeof fn !== 'function') return false;
    const planned = JSON.stringify(fn('e1', { sent: true, invitesOnly: false }));
    const plannedHeld = JSON.stringify(fn('e1', { sent: false, invitesOnly: false }));
    const invSent = JSON.stringify(fn('e1', { sent: true, invitesOnly: true }));
    const invHeld = JSON.stringify(fn('e1', { sent: false, invitesOnly: true }));
    const go = {
      1: { href: '/plan/e1/setup?at=people' },
      2: { href: '/plan/e1/setup?at=plan' },
      3: { href: '/plan/e1/setup' },
    };
    return (
      planned === JSON.stringify(go) &&
      plannedHeld === JSON.stringify(go) &&
      invSent ===
        JSON.stringify({
          1: { href: '/plan/e1/setup?at=people' },
          2: { locked: NOT_NEEDED_AFTER_PRESS, notNeeded: true },
          3: { locked: NOT_NEEDED_AFTER_PRESS, notNeeded: true },
        }) &&
      invHeld ===
        JSON.stringify({
          1: { href: '/plan/e1/setup?at=people' },
          2: { href: '/plan/e1/setup?at=opening', notNeeded: true },
          3: { href: '/plan/e1/setup?at=opening', notNeeded: true },
        })
    );
  },
  /** S5 — the board page: one strip, Moment 4's, in the board's width, before the board; the board drawn as before. */
  boardPage(src: string) {
    const arc = src.indexOf('<MomentArc');
    return (
      count(src, '<MomentArc') === 1 &&
      count(src, '<GlanceBoard') === 1 &&
      arc > src.indexOf('<div className="min-h-screen bg-[#efede6]">') &&
      arc < src.indexOf('<GlanceBoard') &&
      src.lastIndexOf('<div className="mx-auto w-full max-w-[960px] px-4 pt-6">', arc) >
        src.indexOf('<div className="min-h-screen bg-[#efede6]">') &&
      /<MomentArc\s+currentMoment=\{4\}\s+completedMoments=\{\[1, 2, 3\]\}\s+notNeeded=\{invitesOnly \? \[2, 3\] : undefined\}\s+doors=\{moment4Doors\(eventId, \{ sent: event\.sentAt !== null, invitesOnly \}\)\}\s*\/>/.test(
        src
      ) &&
      src.includes("import MomentArc from '@/components/plan/MomentArc';") &&
      src.includes("import { moment4Doors } from '@/lib/moments/strip-hrefs';")
    );
  },
  /** S6 — the two containers hand the strip its doors: the setup page doorsFor(2) to the generating screen; "Who I nudge" Moment 4's, from the event's invites-only flag. */
  containers(setup: string, after: string) {
    return (
      /\bdoors=\{doorsFor\(2\)\}/.test(elementOf(setup, 'Moment2Step2Skeleton')) &&
      /doors=\{moment4Doors\(eventId, \{ sent: true, invitesOnly: data\.event\.invitesOnly === true \}\)\}/.test(
        elementOf(after, 'AfterThePressView')
      ) &&
      /invitesOnly=\{data\.event\.invitesOnly === true\}/.test(
        elementOf(after, 'AfterThePressView')
      )
    );
  },
  /** S7 — only the host's signed-in pages (under /plan) draw a strip or the screens that carry one. */
  hostPagesOnly(files: { rel: string; text: string }[]) {
    const carriers =
      /from '@\/components\/plan\/(MomentArc|Moment2Step2Skeleton|SetupOpeningScreen|Moment[123]\w*)'|from '@\/components\/preflight\/AfterThePress'|from '@\/components\/glance\/GlanceBoard'|from '@\/lib\/moments\/strip-hrefs'/;
    const pages = files.filter((f) => /^src\/app\/.*page\.tsx$/.test(f.rel));
    const outside = pages.filter(
      (f) => !f.rel.startsWith('src/app/plan/') && carriers.test(f.text)
    );
    return pages.length > 10 && outside.length === 0;
  },

  // ── CONTROL ──
  /** U2 — package.json differs from the tag by this suite's one script line, nothing else. */
  oneScriptLine(atAdd: string, goodJson: string) {
    try {
      const now = JSON.parse(atAdd);
      const good = JSON.parse(goodJson);
      if (now?.scripts?.[NEW_SCRIPT] !== NEW_SCRIPT_VALUE) return false;
      if (good?.scripts?.[NEW_SCRIPT] !== undefined) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(good);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

/**
 * The paths no item in this batch edits (the founder's untouched proof and the neighbours), read
 * as they are now against the tag. A file an item edits is never listed here (lesson (a)); its
 * own layer asks what it may change.
 */
const NOT_TOUCHED = [
  'src/app/api', // but the dish-edit route (GTC-400; see EXCLUDED and its list)
  'prisma',
  'src/lib/auth',
  'src/lib/auth.ts',
  'src/lib/press',
  'src/lib/ai',
  'src/lib/email.ts',
  'src/lib/households',
  'src/app/plan/new',
  'src/lib/preflight',
  // src/lib/demo, but typical-answers.ts (item 4; layer F asks what it may change)
  'src/lib/demo/ai-cap.ts',
  'src/lib/demo/copy-address.ts',
  'src/lib/demo/copy.ts',
  'src/lib/demo/crowd.ts',
  'src/lib/demo/new-event.ts',
  'src/lib/demo/pretend-send.ts',
  'src/lib/demo/send-wall.ts',
  'src/lib/demo/start-limit.ts',
  'src/components/demo',
  'src/lib/live-sends.ts',
  ARC_FILE,
  'src/lib/moments/moment-words.ts',
  'src/lib/moments/strip.ts',
  'src/lib/setup',
  'src/lib/moment3',
  'src/components/plan/MomentWords.tsx',
  'src/components/plan/Moment2PlanView.tsx',
  'src/components/plan/Moment1InputForm.tsx',
  'src/components/plan/Moment2Step1Modal.tsx',
  'src/components/plan/AccordionShell.tsx',
  // the pre-flight: only PreflightStep.tsx is edited (item 5; layer K asks what it may change)
  'src/app/plan/[eventId]/pre-flight',
  'src/components/preflight/kids-note.ts',
  'src/components/preflight/mark-rows.tsx',
  'src/components/shared',
  'src/lib/items',
  'src/components/glance',
  // the board's page directory: its page is edited (item 6; layer S asks what it may change)
  'src/app/plan/[eventId]/glance',
  'src/lib/sms',
  'src/app/billing',
];

/**
 * [[GTC-400]] edits one route on purpose (the dish edit now checks the dish is the event's), so U1
 * asks its question of it at GTC-400's base (528e8ad), a fixed commit: GTC-399 still may not have
 * touched it. The security suite (suite 16) pins its new behaviour. It is kept out of the live
 * diff of src/app/api, which stays listed and still covers every other route.
 */
const NOT_TOUCHED_TILL_GTC400 = ['src/app/api/events/[id]/items/[itemId]/route.ts'];

/** Files inside a listed directory that an item edits: kept out of U1's live diff (none now). */
const EXCLUDED = [
  ':(exclude)src/app/plan/[eventId]/glance/page.tsx',
  ':(exclude)src/app/api/events/[id]/items/[itemId]/route.ts',
];

// ══ Item 1 ═══════════════════════════════════════════════════════════════════
async function layerB() {
  section('B — item 1: the strip on Moment 1’s and Moment 2’s openings and Moment 1’s summary');
  const one = render(
    createElement(SetupOpeningScreen as any, { onStart: () => {}, doors: doorsWith([], 1) })
  );
  assert(
    'B',
    'B1 Moment 1’s opening: the strip, current Moment 1, nothing ticked, under "← Your events" and above the title, in an mb-6 wrapper; the title, the herd line, the two paragraphs and the one button as they were',
    CHECKS.stripOnPage(one, 1, [], true) && CHECKS.openingRest(one, 1, START_1, false),
    one.slice(0, 900)
  );
  const two = render(
    createElement(Moment2Opening as any, {
      eventName: 'Boxing Day',
      onStart: () => {},
      onBack: () => {},
      doors: doorsWith([1], 2),
    })
  );
  assert(
    'B',
    'B2 Moment 2’s opening: the strip, current Moment 2, Moment 1 ticked, under "← Your events" and above the title, in an mb-6 wrapper; the title, the two paragraphs, the one button and "← Back to the people" as they were',
    CHECKS.stripOnPage(two, 2, [1], true) && CHECKS.openingRest(two, 2, START_2, true),
    two.slice(0, 900)
  );
  const summary = render(
    createElement(Moment1Summary as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      households: HOUSEHOLDS,
      onContinue: () => {},
      onBackToEditing: () => {},
      doors: doorsWith([2], 1),
    })
  );
  assert(
    'B',
    'B3 Moment 1’s summary: the strip reads current Moment 1, nothing ticked (it read Moment 2 with Moment 1 ticked), in its place under "← Your events" and above the headline; the headline and its buttons as they were',
    CHECKS.stripOnPage(summary, 1, [], false) && CHECKS.summaryRest(summary),
    summary.slice(0, 900)
  );
  assert(
    'B',
    'B4 the setup page hands each page the doors it builds: doorsFor(1) to Moment 1’s opening and its summary, doorsFor(2) to Moment 2’s opening',
    CHECKS.setupHandsDoors(code(SETUP))
  );
  assert(
    'B',
    'B5 each page draws the one MomentArc with its Moment’s props; MomentArc.tsx not edited since demo-tweaks-4-good',
    CHECKS.oneArc(code(OPENING_1), code(OPENING_2), code(SUMMARY), unchangedSinceGood([ARC_FILE]))
  );
  const lostOrNew = [OPENING_1, OPENING_2, SUMMARY].filter(
    (f) => !CHECKS.onlyTheStrip(read(f), atRef(BASE, f), ITEM1_LOST[f], ITEM1_ADDED[f])
  );
  assert(
    'B',
    'B6 CONTROL: the three pages’ code as at the base (6d2b103) but the strip: no code line lost but the ones it replaces, no new code but the strip, its doors and its import',
    lostOrNew.length === 0,
    lostOrNew.join(', ')
  );
}

// ══ Item 2 ═══════════════════════════════════════════════════════════════════
/** Moment 3's working screen, rendered with a hand-written plan: one dish held, two not. */
const drawM3 = () =>
  render(
    createElement(
      ToastProvider as any,
      null,
      createElement(Moment3AssignView as any, {
        eventId: 'e1',
        event: { id: 'e1', status: 'DRAFT', sentAt: null },
        hostPersonId: 'p-kate',
        headcount: 3,
        categories: [
          {
            id: 'c1',
            name: 'Mains',
            emoji: '🍖',
            items: [
              { id: 'i-lamb', name: 'Roast lamb', kind: 'ITEM', detail: '' },
              { id: 'i-bread', name: 'Bread rolls', kind: 'ITEM', detail: '' },
              { id: 'i-pav', name: 'Pavlova', kind: 'ITEM', detail: '' },
            ],
          },
        ],
        initialHolders: { 'i-lamb': { personId: 'p-ross', name: 'Ross Lowe' } },
        households: [],
        askForReason: async () => ({ proceed: true }),
        askForBatchReason: async () => ({ proceed: true }),
        onBack: () => {},
        onMoveOn: () => {},
        stripDoors: {},
      })
    )
  );
/** What the view may lose against the base at item 2 (exactly), and what items 2 and 3 may add. */
const M3_VIEW_LOST = [
  "import MomentWords from './MomentWords';",
  '<MomentWords moment={3} part="does" className="mb-3" />',
  '<MomentWords moment={3} part="done" className="mb-3" />',
];
const M3_VIEW_ADDED = ['else window.scrollTo(0, 0);'];

async function layerM() {
  section('M — item 2: Moment 3’s opening page');
  const OT = (await import('../src/lib/moments/opening-titles').catch(() => null)) as any;
  assert(
    'M',
    'M1 OPENING_TITLES[3] is "Who’s on what?", the strip’s own third label read from MomentArc.tsx, with its straight apostrophe; 1 and 2 kept',
    !!CHECKS.thirdTitle(OT?.OPENING_TITLES, read(ARC_FILE)),
    JSON.stringify(OT?.OPENING_TITLES)
  );
  const opening = render(
    createElement(Moment3Opening as any, {
      onStart: () => {},
      onBack: () => {},
      doors: doorsWith([1, 2], 3),
    })
  );
  assert(
    'M',
    'M2 the page: its own overlay; "← Your events", then the strip (current 3, Moments 1 and 2 ticked) above the big title "Who’s on what?"; "What this does" then "When it’s done" directly under it with Moment 3’s lines; one filled "Let’s do this →"; then "← Back to the plan"; no other button',
    CHECKS.stripOnPage(opening, 3, [1, 2], true) && CHECKS.openingThree(opening),
    opening.slice(0, 1200)
  );
  assert(
    'M',
    'M3 its button is Moment 2’s: the same characters (Let&rsquo;s do this &rarr;) and the same classes, once in each file',
    CHECKS.sameButton(read(OPENING_3), read(OPENING_2))
  );
  assert(
    'M',
    'M4 its code takes every word from its own file (the title, MomentWords, M3_WORDS.BACK_TO_PLAN, STRIP_WORDS), draws the one strip with its props, and makes no request, stores nothing, reads no router',
    CHECKS.openingCode(code(OPENING_3))
  );
  const setup = code(SETUP);
  assert(
    'M',
    'M5 the setup page: one screen state (useState, set only in applyStage), asked for only by the plan view’s own forward button after the approval is stored; the opening’s button opens the working screen; the strip’s door, her own list and the page load open the working screen as before',
    CHECKS.setupStage(setup, elementOf(setup, 'Moment2PlanView'))
  );
  assert(
    'M',
    'M6 the working screen draws neither block (no Moment words, neither heading, neither line); its strip, "Now. Who’s on what.", the assign line and the counter kept',
    CHECKS.workingScreen(drawM3()),
    drawM3().slice(0, 600)
  );
  assert(
    'M',
    'M7 CONTROL: the working screen’s code as at the base (6d2b103) but the two MomentWords lines and their import (and item 3’s one jump)',
    CHECKS.onlyThese(read(M3_VIEW), atRef(BASE, M3_VIEW), M3_VIEW_LOST, M3_VIEW_ADDED)
  );
  assert(
    'M',
    'M8 CONTROL: the titles file differs from the base only by the third title (the first two and its export as they were)',
    CHECKS.onlyThese(
      read(TITLES_FILE),
      atRef(BASE, TITLES_FILE),
      ['export const OPENING_TITLES = { 1: "Who\'s coming?", 2: "What\'s the plan?" } as const;'],
      [
        'export const OPENING_TITLES = {',
        '1: "Who\'s coming?",',
        '2: "What\'s the plan?",',
        '3: "Who\'s on what?",',
        '} as const;',
      ]
    )
  );
}

// ══ Item 3 ═══════════════════════════════════════════════════════════════════
async function layerT() {
  section('T — item 3: Moment 3 starts at the top');
  assert(
    'T',
    'T1 the working screen’s arrival effect: the dish asked for brought to the middle, otherwise a plain jump of the window to the top (no animation), once as it opens; the only window scroll in the view',
    CHECKS.jumpToTop(code(M3_VIEW))
  );
  assert(
    'T',
    'T2 the landing on one dish keeps its centring: bringItemIntoView as at the base (6d2b103), a smooth scroll to the centre',
    CHECKS.centringKept(code(M3_VIEW), stripComments(atRef(BASE, M3_VIEW)))
  );
  assert(
    'T',
    'T3 CONTROL: the setup page hands the dish over as before, once, from the address it opened on, now and at the base',
    CHECKS.handOverKept(code(SETUP), stripComments(atRef(BASE, SETUP)))
  );
}

// ══ Item 4 ═══════════════════════════════════════════════════════════════════
async function layerF() {
  section('F — item 4: "Fill in demo answers"');
  const TA = (await import('../src/lib/demo/typical-answers').catch(() => null)) as any;
  assert(
    'F',
    'F1 TYPICAL_WORDS.BUTTON reads "Fill in demo answers"; the line under it and the two answers it gives as they were',
    CHECKS.newButtonWord(TA?.TYPICAL_WORDS),
    JSON.stringify(TA?.TYPICAL_WORDS?.BUTTON)
  );
  assert(
    'F',
    'F2 typical-answers.ts differs from the base (6d2b103) by that one line and nothing else',
    CHECKS.oneLineDiff(git(['diff', BASE, '--', TYPICAL_FILE]).stdout)
  );
  assert(
    'F',
    'F3 the button on the sample’s questions, rendered: the new words, its line under it, the old words nowhere',
    CHECKS.buttonRendered(
      render(createElement(TypicalAnswersButton as any, { onFill: () => 'filled' }))
    )
  );
  const files = walk('src').map((rel) => ({ rel, text: code(rel) }));
  assert(
    'F',
    `F4 across ${files.length} source files no code (comments aside) says "Fill in typical answers"; "Fill in demo answers" is typed in the words file only`,
    CHECKS.oldWordsGone(files)
  );
}

// ══ Item 5 ═══════════════════════════════════════════════════════════════════
const drawStep = (over: Record<string, unknown>) =>
  render(
    createElement(
      PreflightStep as any,
      {
        n: 2,
        title: 'Dietary needs',
        blurb: 'A hand-written blurb.',
        checked: false,
        onCheck: () => {},
        onToggle: () => {},
        ...over,
      },
      createElement('p', null, `INSIDE-${String(over.n ?? 2)}`)
    )
  );
/** What the step's code may lose against the base (exactly), and the only code lines it may add. */
const STEP_LOST = ['<div className="px-5 py-5">{children}</div>'];
const STEP_ADDED = [
  'const boxAtFoot = folds && open;',
  'const footBox = (',
  '<label className="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600">',
  '<input',
  'type="checkbox"',
  'data-tick-foot=""',
  'checked={checked || settled}',
  'disabled={settled}',
  'onChange={(e) => onCheck(e.target.checked)}',
  'className="rounded border-gray-300 text-accent focus:ring-accent/40"',
  '/>',
  '{checkLabel}',
  '</label>',
  ');',
  '<div className="px-5 py-5">',
  '{children}',
  '{boxAtFoot && (',
  '<div',
  'data-tick-bottom=""',
  'className="mt-6 pt-4 border-t border-gray-100 flex justify-end"',
  '>',
  '{footBox}',
  '</div>',
  ')}',
];

async function layerK() {
  section('K — item 5: a second tick box at the foot of an open step');
  assert(
    'K',
    'K1 a closed step that folds: one box, in its row’s slot, "Checked", as at the base; none at the foot',
    CHECKS.boxes(drawStep({ open: false }), true, false, 'Checked', false, false)
  );
  const open = drawStep({ open: true, checked: true });
  assert(
    'K',
    'K2 the same step open: the row’s box still in its slot, and a second at the foot of its open content, after what it shows, marked data-tick-foot, no id; both "Checked", both ticked',
    CHECKS.boxes(open, true, true, 'Checked', true, false),
    open.slice(open.indexOf('</header>') - 200)
  );
  assert(
    'K',
    'K3 the same step open and unticked: both boxes unticked (one state, so ticking either shows both)',
    CHECKS.boxes(drawStep({ open: true, checked: false }), true, true, 'Checked', false, false)
  );
  assert(
    'K',
    'K4 step 4 open: both boxes read "Settled", its own word',
    CHECKS.boxes(
      drawStep({ n: 4, open: true, checkLabel: 'Settled' }),
      true,
      true,
      'Settled',
      false,
      false
    )
  );
  assert(
    'K',
    'K5 Ready (it never folds) and a settled step (invites only), even asked to open: one box, in the header, as at the base (the settled one ticked and greyed)',
    CHECKS.boxes(
      drawStep({ n: 5, onToggle: undefined, open: true }),
      false,
      false,
      'Checked',
      false,
      false
    ) && CHECKS.boxes(drawStep({ settled: true, open: true }), false, false, 'Checked', true, true)
  );
  assert(
    'K',
    'K6 the step’s code: the row’s box exactly as at the base (6d2b103); the foot’s the same control (one handler, one state, one rule, its marker only), drawn only while a folding step is open; no hover shade at the foot',
    CHECKS.stepCode(code(STEP_FILE), stripComments(atRef(BASE, STEP_FILE)))
  );
  assert(
    'K',
    'K7 CONTROL: the step’s code as at the base but the foot’s box: it loses only its one-line body, and gains only the foot box and its place',
    CHECKS.onlyThese(read(STEP_FILE), atRef(BASE, STEP_FILE), STEP_LOST, STEP_ADDED)
  );
}

// ══ Item 6 ═══════════════════════════════════════════════════════════════════
const SKELETON_ADDED = [
  "import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';",
  'doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;',
  'doors,',
  '<div className="mb-6">',
  '<MomentArc',
  'currentMoment={2}',
  'completedMoments={[1]}',
  'doors={doors}',
  'disabled={!fullyRendered}',
  '/>',
  '</div>',
];
const AFTER_ADDED = [
  "import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';",
  "import { moment4Doors } from '@/lib/moments/strip-hrefs';",
  'doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;',
  'invitesOnly?: boolean;',
  'doors,',
  'invitesOnly = false,',
  '{doors && (',
  '<div className="mb-6">',
  '<MomentArc',
  'currentMoment={4}',
  'completedMoments={[1, 2, 3]}',
  'notNeeded={invitesOnly ? [2, 3] : undefined}',
  'doors={doors}',
  '/>',
  '</div>',
  ')}',
  'doors={moment4Doors(eventId, { sent: true, invitesOnly: data.event.invitesOnly === true })}',
  'invitesOnly={data.event.invitesOnly === true}',
];
const BOARD_ADDED = [
  "import MomentArc from '@/components/plan/MomentArc';",
  "import { moment4Doors } from '@/lib/moments/strip-hrefs';",
  '<div className="mx-auto w-full max-w-[960px] px-4 pt-6">',
  '<MomentArc',
  'currentMoment={4}',
  'completedMoments={[1, 2, 3]}',
  'notNeeded={invitesOnly ? [2, 3] : undefined}',
  'doors={moment4Doors(eventId, { sent: event.sentAt !== null, invitesOnly })}',
  '/>',
  '</div>',
];
const pressView = (over: Record<string, unknown>) =>
  render(
    createElement(AfterThePressView as any, {
      eventId: 'e1',
      eventName: 'Boxing Day',
      sentAt: '2026-12-01T00:00:00.000Z',
      pace: null,
      households: [],
      unhoused: [],
      chase: null,
      saving: false,
      error: null,
      onMark: () => {},
      onException: () => {},
      onDefault: () => {},
      ...over,
    })
  );

async function layerS() {
  section('S — item 6: the strip on the generating screen, "Who I nudge" and the board');
  const SH = (await import('../src/lib/moments/strip-hrefs').catch(() => null)) as any;
  const wait = render(
    createElement(Moment2Step2Skeleton as any, {
      eventName: 'Boxing Day',
      plan: null,
      onApprove: () => {},
      doors: doorsWith([1], 2),
    })
  );
  assert(
    'S',
    'S1 the generating screen: the strip above its title, current Moment 2, Moment 1 ticked; while it works its one open door is a disabled button (as the plan screen’s while it regenerates) and the two locked ones say their lines; its title and its wait as they were',
    CHECKS.stripBeforeTitle(wait, 2, [1], null) &&
      CHECKS.doorsWait(wait) &&
      wait.includes('Here’s what I’d suggest for Boxing Day.</h1>') &&
      wait.includes('Putting your plan together...'),
    wait.slice(0, 900)
  );
  const doors = SH?.moment4Doors?.('e1', { sent: true, invitesOnly: false });
  const after = pressView({ doors });
  assert(
    'S',
    'S2 "Who I nudge": the strip under "← Back to the board" and above its title, current Moment 4, Moments 1 to 3 ticked; its doors links to the setup page’s Moments; without doors (as before) no strip',
    CHECKS.stripBeforeTitle(after, 4, [1, 2, 3], `>${BACK_TO_BOARD}</a>`) &&
      CHECKS.linkDoors(after, 'e1') &&
      !pressView({}).includes('data-moment-strip') &&
      !pressView({}).includes(LABELS[4]),
    after.slice(0, 900)
  );
  const inv = pressView({
    doors: SH?.moment4Doors?.('e1', { sent: true, invitesOnly: true }),
    invitesOnly: true,
  });
  assert(
    'S',
    'S3 "Who I nudge" of an invites-only event: Moments 2 and 3 "not needed", locked, unticked; Moment 1 ticked; Moment 4 current',
    CHECKS.stripBeforeTitle(inv, 4, [1], `>${BACK_TO_BOARD}</a>`, [2, 3]),
    inv.slice(0, 900)
  );
  assert(
    'S',
    'S4 the doors as addresses (moment4Doors): Moments 1 to 3 by stripDoors’ own rule, to the setup page’s people, plan and Moment 3; an invites-only event’s 2 and 3 not needed, locked with W8 after the press, to Moment 2’s opening before it',
    CHECKS.doorRule(SH?.moment4Doors)
  );
  assert(
    'S',
    'S5 the board: the page draws one strip, Moment 4’s ("Is everyone sorted?"), in the board’s width, before GlanceBoard; GlanceBoard itself not edited (U1)',
    CHECKS.boardPage(code(BOARD_PAGE))
  );
  assert(
    'S',
    'S6 the containers hand the doors over: doorsFor(2) to the generating screen; Moment 4’s, from the event’s invites-only flag, to "Who I nudge"',
    CHECKS.containers(code(SETUP), code(AFTER_PRESS))
  );
  const files = walk('src').map((rel) => ({ rel, text: code(rel) }));
  assert(
    'S',
    'S7 only the host’s signed-in pages (under /plan) draw the strip or a screen that carries it: no guest, household, coordinator or join page does',
    CHECKS.hostPagesOnly(files)
  );
  const lostOrNew = [
    [SKELETON, SKELETON_ADDED],
    [AFTER_PRESS, AFTER_ADDED],
    [BOARD_PAGE, BOARD_ADDED],
  ].filter(
    ([f, added]) =>
      !CHECKS.onlyThese(read(f as string), atRef(BASE, f as string), [], added as string[])
  );
  assert(
    'S',
    'S8 CONTROL: the three screens’ code as at the base (6d2b103) but the strip: nothing lost, nothing new but the strip, its doors and its imports',
    lostOrNew.length === 0,
    lostOrNew.map((x) => x[0]).join(', ')
  );
}

// ══ CONTROL ══════════════════════════════════════════════════════════════════
async function layerU() {
  section('U — CONTROL: what this batch must not touch');
  const missing = [
    ...NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f))),
    ...NOT_TOUCHED_TILL_GTC400.filter(
      (f) => git(['cat-file', '-e', `${GTC400_BASE}:${f}`]).status !== 0
    ),
  ];
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since demo-tweaks-4-good (routes, schema, auth, press, AI, email, households, the paying page, the new-event page, the pre-flight's libraries, the sample's limits and words, the strip, the Moment words, the entry rule, Moment 3's rules, SMS, the board, and the neighbours no item edits); the ${NOT_TOUCHED_TILL_GTC400.length} that GTC-400 edits not between demo-tweaks-4-good and GTC-400’s base (528e8ad)`,
    missing.length === 0 &&
      unchangedSinceGood([...NOT_TOUCHED, ...EXCLUDED]) &&
      git(['diff', '--quiet', GOOD_TAG, GTC400_BASE, '--', ...NOT_TOUCHED_TILL_GTC400]).status ===
        0,
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
    `U2 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from demo-tweaks-4-good by "${NEW_SCRIPT}" and nothing else; the lockfile there is the tag's`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(GOOD_TAG, 'package.json')) &&
      git(['diff', '--quiet', GOOD_TAG, addCommit, '--', 'package-lock.json']).status === 0
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
  await layerB();
  await layerM();
  await layerT();
  await layerF();
  await layerK();
  await layerS();
  await layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_5_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_5_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
