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
