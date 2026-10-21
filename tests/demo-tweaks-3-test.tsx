/**
 * [[GTC-396]] — THE DEMO TWEAKS, LIST FOUR (THE LIGHT PATH): the founder's seven items after his
 * look at GTC-395, 21 Oct 2026. Words and layout only.
 *
 * Founder rulings, 21 Oct 2026 (his prompt). Each item adds its own layer here, in its own commit.
 *
 * THE LAYERS
 *   H  item 1: the herd-of-cats line is back on Moment 1's opening page, under the title, in the
 *      words the file held before GTC-394 tweak 2; Moment 2's opening page is not touched.
 *   T  item 2: Moment 1's overlay (the thing that scrolls) jumps to the top after the host's own
 *      household is saved and after an edit is saved or cancelled; one small helper.
 *   B  item 3: "Save & move on →" is one full-width accent button under both columns, drawn by the
 *      setup page with the form's own handler and saving flag; the form's foot keeps "Save & add
 *      another household"; the edit mode and the host's step are untouched.
 *   L  item 4: Moment 2's plan view carries Moment 2's "What this does" and "When it's done"
 *      between the strip and the heading, as Moment 3 does; the drop-off line still directly
 *      above the heading; the own-plan view too; the skeleton (generating) untouched.
 *   Z  item 5: the pre-flight's "confirmed so far" figure is hidden while the rate is 0.
 *   K  item 6: "Kids: Josh, Mere" on each household with children in the pre-flight's step 3.
 *   P  item 7: the two HAND_TO_HOST pills' new words; nothing that sends reads them.
 *   U  CONTROL: the files this batch must not touch are not edited since demo-tweaks-2-good;
 *      package.json differs by the one script; the two untracked scripts are in no commit.
 *
 * SAFETY. Static and rendered checks only: no database row, no dev server, no AI call, no
 * browser, no network. Every fixture and expected value is written here by hand, never taken from
 * the code under test (the one exception is item 1's history read, compared with a hand-written
 * copy as well). Every check's condition lives in CHECKS so it can be dry-run on a passing and a
 * failing input before its first run.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import SetupOpeningScreen from '../src/components/plan/SetupOpeningScreen';
import Moment2Opening from '../src/components/plan/Moment2Opening';

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
/** The tag the founder last looked at (GTC-396's rollback structure). */
const GOOD_TAG = 'demo-tweaks-2-good';
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const unchangedSinceGood = (paths: string[]) =>
  git(['diff', '--quiet', GOOD_TAG, '--', ...paths]).status === 0;
const atGood = (rel: string) => {
  const r = git(['show', `${GOOD_TAG}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
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
/** React's escaping of text in static markup. */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

// ── Item 1: the herd line, hand-written ──────────────────────────────────────
const OPENING_1 = 'src/components/plan/SetupOpeningScreen.tsx';
const OPENING_2 = 'src/components/plan/Moment2Opening.tsx';
/** The commit whose parent still held the line (GTC-394 tweak 2 took it off). */
const BEFORE_TWEAK_2 = 'e97ccc6^';
/** The words as rendered (React writes `&rsquo;` as ’). */
const HERD = 'We’re here to organise what could be described as a herd of cats. Let’s get it done.';
/** The words as the file writes them: the same two `&rsquo;` as the old file. */
const HERD_SOURCE =
  'We&rsquo;re here to organise what could be described as a herd of cats. Let&rsquo;s get it done.';
/** The old file's style tokens for the line (its mb-12 made way for the words' own mt-10). */
const HERD_STYLE = ['text-2xl', 'sm:text-3xl', 'text-gray-800', 'leading-relaxed', 'text-center'];
const TITLE_1 = "Who's coming?";
const START_1 = 'Ready to start herding →';
const YOUR_EVENTS = '← Your events';
const DOES_HEAD = 'What this does';
const DONE_HEAD = 'When it’s done';

// ── Item 2: the overlay's jump to the top, hand-written ──────────────────────
const SETUP_PAGE = 'src/app/plan/[eventId]/setup/page.tsx';
/** Moment 1's overlay (the thing that scrolls), as the setup page writes it (GTC-381 Q7). */
const OVERLAY_CLASS = 'fixed inset-0 top-[65px] z-50 bg-white overflow-y-auto';
/** batch12 S6's count of overlays on the setup page: the two of Moment 1 and the loading one. */
const SETUP_OVERLAYS = 3;
const OVERLAY_WITH_REF = new RegExp(
  `<div\\s+ref=\\{moment1OverlayRef\\}\\s+className="${OVERLAY_CLASS.replace(/[[\]]/g, '\\$&')}"\\s*>`,
  'g'
);
/** The same code but its layout: whitespace, brackets and commas (Prettier's re-wraps) dropped. */
const flat = (src: string) => src.replace(/[\s(),]/g, '');
const between = (src: string, from: string, to: string) => {
  const a = src.indexOf(from);
  const b = a >= 0 ? src.indexOf(to, a + from.length) : -1;
  return a >= 0 && b > a ? src.slice(a, b) : '';
};

// ── CONTROL: not touched by this batch, hand-written ─────────────────────────
/**
 * The founder's untouched proof (his section 5), plus the neighbours no item edits. Never a whole
 * page an item edits (GTC-395's lesson). `src/lib/preflight` is NOT here: item 7 edits two lines
 * of `ask-preview-compose.ts` there (its own layer proves "those two lines and nothing else").
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
  'src/lib/sms',
  'src/lib/live-sends.ts',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/preflight/tick-memory.ts',
  'src/lib/workflow.ts',
  'src/components/plan/Moment2Opening.tsx',
  'src/components/plan/MomentWords.tsx',
  'src/lib/moments/moment-words.ts',
  'src/lib/moments/opening-titles.ts',
  'src/components/plan/Moment3AssignView.tsx',
  'src/components/plan/Moment2Step2Skeleton.tsx',
  'src/components/plan/HouseholdCardList.tsx',
  'src/components/plan/AccordionShell.tsx',
  'src/components/demo/CrowdButton.tsx',
  'src/components/preflight/mark-rows.tsx',
  'src/components/preflight/AfterThePress.tsx',
  'src/components/shared/EventDropOffLine.tsx',
];
const NEW_SCRIPT = 'test:demo-tweaks-3';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-tweaks-3-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];

// ── CHECKS: every condition, dry-runnable ────────────────────────────────────
export const CHECKS = {
  // ── Item 1 ──
  /** H1 — the line under the title, above "What this does", once; the rest of the page in order. */
  herdOnOpening(html: string) {
    const h1 = html.indexOf('<h1');
    const herd = html.indexOf(HERD);
    const does = html.indexOf('data-moment-words="1-does"');
    const done = html.indexOf('data-moment-words="1-done"');
    const button = html.indexOf(`>${START_1}</button>`);
    return (
      h1 >= 0 &&
      herd > h1 &&
      does > herd &&
      done > does &&
      button > done &&
      count(html, 'herd of cats') === 1 &&
      count(html, HERD) === 1 &&
      !html.includes('data-moment-strip')
    );
  },
  /** H2 — its own element: a `<p>` with the old file's style tokens, its margin above the title's. */
  herdStyle(html: string) {
    const m = html.match(/<p class="([^"]*)">We’re here to organise/);
    const classes = m ? m[1].split(/\s+/) : [];
    return (
      !!m &&
      HERD_STYLE.every((c) => classes.includes(c)) &&
      classes.includes('mt-6') &&
      !classes.includes('mb-12')
    );
  },
  /** H3 — the words in the source are the old file's bytes: the same `&rsquo;` twice. */
  herdWordsFromHistory(nowSrc: string, oldSrc: string) {
    const para = (src: string) => {
      const m = src.match(/<p className="[^"]*">\s*(We&rsquo;re here[\s\S]*?)<\/p>/);
      return m ? squash(m[1]) : '';
    };
    return (
      para(oldSrc) === HERD_SOURCE &&
      para(nowSrc) === HERD_SOURCE &&
      count(para(nowSrc), '&rsquo;') === 2 &&
      !/herd of cats[\s\S]*herd of cats/.test(stripComments(nowSrc))
    );
  },
  /** H4 CONTROL — the title, the two paragraphs, the one button and the way out, as they were. */
  openingKept(html: string) {
    const h1 = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/);
    const buttons = html.match(/<button\b/g) ?? [];
    const primary = (html.match(/<button[^>]*class="[^"]*\bbg-accent\b[^"]*"/g) ?? []).length;
    return (
      !!h1 &&
      h1[1] === esc(TITLE_1) &&
      count(html, 'data-moment-words="1-does"') === 1 &&
      count(html, 'data-moment-words="1-done"') === 1 &&
      html.indexOf(`>${DOES_HEAD}</p>`) < html.indexOf(`>${DONE_HEAD}</p>`) &&
      /data-moment-words="1-does" class="[^"]*max-w-xl/.test(html) &&
      buttons.length === 1 &&
      primary === 1 &&
      html.includes(`>${START_1}</button>`) &&
      new RegExp(`<a [^>]*href="/plan/events"[^>]*>${YOUR_EVENTS}</a>`).test(html)
    );
  },
  /** H5 CONTROL — Moment 2's opening page: no herd line, its file not edited. */
  momentTwoOpeningKept(html: string, unchanged: boolean) {
    return html.length > 0 && !html.includes('herd of cats') && unchanged;
  },

  // ── Item 2 ──
  /** T1 — one ref, on both of Moment 1's overlays and nothing else; the overlays' count as before. */
  overlayRef(src: string) {
    return (
      count(src, 'const moment1OverlayRef = useRef<HTMLDivElement>(null);') === 1 &&
      (src.match(OVERLAY_WITH_REF) ?? []).length === 2 &&
      count(src, 'ref={moment1OverlayRef}') === 2 &&
      count(src, 'fixed inset-0 top-[65px] z-50') === SETUP_OVERLAYS
    );
  },
  /** T2 — the helper: a plain jump of the overlay's own scroll to 0, nothing smooth, no window. */
  jumpHelper(src: string) {
    const m = src.match(/const jumpMoment1ToTop = \(\) => \{([\s\S]*?)\n  \};/);
    const body = m ? m[1] : '';
    return (
      !!m &&
      /const overlay = moment1OverlayRef\.current;\s*if \(overlay\) overlay\.scrollTop = 0;/.test(
        body
      ) &&
      !/smooth|behavior|window|scrollIntoView|scrollTo\(/.test(body) &&
      count(src, 'const jumpMoment1ToTop') === 1
    );
  },
  /** T3 — called at the three moments, straight after the state that changes the screen, and nowhere else. */
  jumpSites(src: string) {
    const hostSave = between(src, 'const handleSaveHostHousehold = async', 'return (');
    const editSave = between(src, 'const handleEditSave = async', 'const handleDeleteHousehold');
    return (
      count(src, 'jumpMoment1ToTop()') === 3 &&
      /setMoment1Phase\('input'\);\s*jumpMoment1ToTop\(\);/.test(hostSave) &&
      /setEditingHousehold\(null\);\s*jumpMoment1ToTop\(\);/.test(editSave) &&
      /onCancelEdit=\{\(\) => \{\s*setEditingHousehold\(null\);\s*jumpMoment1ToTop\(\);\s*\}\}/.test(
        src
      )
    );
  },
  /** T4 CONTROL — nothing else moved: Edit's own scroll, the column's, the stages, every scroll call as at the tag. */
  movedNothingElse(now: string, head: string) {
    const editBlock = (src: string) =>
      between(src, 'const handleEdit = (householdId: string) => {', 'const totalPeopleCount');
    const columnEffect = (src: string) =>
      between(src, 'const col = desktopColumnRef.current;', '}, [moment1Draft]);');
    const stages = (src: string) => between(src, 'const applyStage = useCallback(', '}, []);');
    return (
      editBlock(head).length > 100 &&
      flat(editBlock(now)) === flat(editBlock(head)) &&
      columnEffect(head).length > 100 &&
      flat(columnEffect(now)) === flat(columnEffect(head)) &&
      stages(head).length > 100 &&
      flat(stages(now)) === flat(stages(head)) &&
      count(now, 'scrollIntoView') === count(head, 'scrollIntoView') &&
      count(now, 'window.scrollTo') === count(head, 'window.scrollTo') &&
      count(now, 'scrollTop') === count(head, 'scrollTop') + 1
    );
  },

  // ── CONTROL ──
  /** U2 — package.json differs from the tag by the one new script and nothing else. */
  onlyTheScript(nowJson: string, goodJson: string) {
    try {
      const now = JSON.parse(nowJson);
      const good = JSON.parse(goodJson);
      const value = now?.scripts?.[NEW_SCRIPT];
      if (value !== NEW_SCRIPT_VALUE) return false;
      delete now.scripts[NEW_SCRIPT];
      return JSON.stringify(now) === JSON.stringify(good);
    } catch {
      return false;
    }
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ Item 1 ═══════════════════════════════════════════════════════════════════
async function layerH() {
  section('H — item 1: the herd-of-cats line is back on Moment 1’s opening page');
  const one = render(createElement(SetupOpeningScreen as any, { onStart: () => {} }));
  assert(
    'H',
    'H1 the line sits directly under the big title and above "What this does", once; the two paragraphs then the button follow; no strip',
    CHECKS.herdOnOpening(one),
    one.slice(one.indexOf('<h1'), one.indexOf('<h1') + 400)
  );
  assert(
    'H',
    'H2 it is its own paragraph with the old file’s size, colour, leading and centring (mt-6 under the title, the old mb-12 gone)',
    CHECKS.herdStyle(one)
  );
  const nowSrc = read(OPENING_1);
  const oldSrc = atRef(BEFORE_TWEAK_2, OPENING_1);
  assert(
    'H',
    `H3 the words are the old file’s (${BEFORE_TWEAK_2}) byte for byte, the same two &rsquo;, and appear once in the code`,
    oldSrc.length > 0 && CHECKS.herdWordsFromHistory(nowSrc, oldSrc),
    oldSrc.length ? undefined : 'history read failed'
  );
  assert(
    'H',
    'H4 CONTROL: the title, "What this does" then "When it’s done" (max-w-xl), the one accent button and "← Your events" as they were',
    CHECKS.openingKept(one)
  );
  const two = render(
    createElement(Moment2Opening as any, {
      eventName: 'The Walker barbecue',
      onStart: () => {},
      onBack: () => {},
    })
  );
  assert(
    'H',
    'H5 CONTROL: Moment 2’s opening page has no herd line and its file is not edited since demo-tweaks-2-good',
    CHECKS.momentTwoOpeningKept(two, unchangedSinceGood([OPENING_2]))
  );
}

// ══ Item 2 ═══════════════════════════════════════════════════════════════════
async function layerT() {
  section('T — item 2: Moment 1’s overlay jumps to the top when the screen changes');
  const now = code(SETUP_PAGE);
  const head = stripComments(atGood(SETUP_PAGE));
  assert(
    'T',
    'T1 the overlay is the thing that scrolls: one ref, on both of Moment 1’s overlays (her own household’s step and the people screen); the setup page still has three overlays',
    CHECKS.overlayRef(now)
  );
  assert(
    'T',
    'T2 one small helper: a plain jump of the overlay’s own scroll to the top (scrollTop = 0), nothing smooth, never the window',
    CHECKS.jumpHelper(now)
  );
  assert(
    'T',
    'T3 called at the three moments and nowhere else: after her own household is saved and the people screen opens, after an edit is saved, after an edit is cancelled',
    CHECKS.jumpSites(now)
  );
  assert(
    'T',
    'T4 CONTROL: nothing else moved — Edit’s own phone scroll, the column’s own scroll, the stages and every other scroll call as at demo-tweaks-2-good',
    head.length > 0 && CHECKS.movedNothingElse(now, head)
  );
}

// ══ CONTROL ══════════════════════════════════════════════════════════════════
async function layerU() {
  section('U — CONTROL: what this batch must not touch');
  const missing = NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since demo-tweaks-2-good (routes, schema, auth, press, AI, email, households, the paying page, the demo library, SMS, the live switch, the pre-flight’s other libraries, and the neighbours no item edits)`,
    missing.length === 0 && unchangedSinceGood(NOT_TOUCHED),
    missing.length ? `missing: ${missing.join(', ')}` : undefined
  );
  assert(
    'U',
    `U2 package.json differs from the tag by "${NEW_SCRIPT}" and nothing else`,
    CHECKS.onlyTheScript(read('package.json'), atGood('package.json'))
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
  await layerH();
  await layerT();
  await layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_3_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_3_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
