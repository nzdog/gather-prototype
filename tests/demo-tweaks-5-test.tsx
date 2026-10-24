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
const SUITE = 'tests/demo-tweaks-5-test.tsx';
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
    // React writes a comment between the label and its tick (two text nodes).
    const ticked = ([1, 2, 3, 4] as const).filter((n) => arc.includes(`${LABELS[n]}<!-- --> ✓`));
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
  'src/app/api',
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
  'src/components/plan/Moment2Step2Skeleton.tsx',
  'src/components/plan/AccordionShell.tsx',
  // the pre-flight: PreflightStep.tsx and the page are edited (item 5; layer K asks what they may
  // change), so the page's directory is listed with the page kept out (EXCLUDED)
  'src/app/plan/[eventId]/pre-flight',
  'src/components/preflight/AfterThePress.tsx',
  'src/components/preflight/kids-note.ts',
  'src/components/preflight/mark-rows.tsx',
  'src/components/shared',
  'src/lib/items',
  'src/components/glance',
  'src/app/plan/[eventId]/glance',
  'src/lib/sms',
  'src/app/billing',
];

/** Files inside a listed directory that an item edits: kept out of U1's live diff. */
const EXCLUDED = [':(exclude)src/app/plan/[eventId]/pre-flight/page.tsx'];

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

// ══ CONTROL ══════════════════════════════════════════════════════════════════
async function layerU() {
  section('U — CONTROL: what this batch must not touch');
  const missing = NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since demo-tweaks-4-good (routes, schema, auth, press, AI, email, households, the paying page, the new-event page, the pre-flight's libraries, the sample's limits and words, the strip, the Moment words, the entry rule, Moment 3's rules, SMS, the board, and the neighbours no item edits)`,
    missing.length === 0 && unchangedSinceGood([...NOT_TOUCHED, ...EXCLUDED]),
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
