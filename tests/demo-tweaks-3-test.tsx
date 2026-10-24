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
 *   L  item 4, REVERSED by GTC-398 item 1 (founder, 23 Oct 2026: "Lose it"): Moment 2's plan
 *      view carries no Moment words (no "What this does", no "When it's done"); the drop-off
 *      line directly above the heading; the own-plan view too; Moment 2's opening page still
 *      carries both; the skeleton (generating) untouched.
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
import Moment1InputForm from '../src/components/plan/Moment1InputForm';
// Item 4: the plan view and the toast provider imported statically, as the Moment 3 suites do (a
// dynamic import() would give the view a second toast context).
import { ToastProvider } from '../src/contexts/ToastContext';
import Moment2PlanView from '../src/components/plan/Moment2PlanView';

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
/** GTC-396's last commit (its ticket backfill); U2 reads package.json as it was there. */
const GTC396_LAST = '3695755c0d9168ce32a52f6dcb1a74b4f9c9dba9';
/**
 * GTC-397's last commit, where GTC-398 started (its app code the same as GTC-396's). GTC-398 edits
 * the plan view, Moment 3 and the drop-off line, so the checks here that pin what GTC-398 must not
 * change read those files as they were at this fixed commit, never a tag a later ticket can move.
 */
const GTC398_BASE = '8a4f1bc7e237bead8565f88c62ca2fe5bec95645';
/** [[GTC-399]]'s base: GTC-398's last commit (the tag demo-tweaks-4-good), named for good. */
const GTC399_BASE = '6d2b10397975ba688f543b8561ca918e0870ea56';
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

// ── Item 3: "Save & move on →" under both columns, hand-written ──────────────
const M1_FORM = 'src/components/plan/Moment1InputForm.tsx';
const CROWD_FILE = 'src/components/demo/CrowdButton.tsx';
const MOVE_ON = 'Save & move on →';
const ADD_ANOTHER = 'Save & add another household';
/** "Add a crowd"'s filled accent style (CrowdButton.tsx), the founder's pick for the button. */
const CROWD_CLASS =
  'w-full py-3 text-base font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50';
/** The form's other foot button, as at the tag (its class stays, mb-4 included). */
const ADD_ANOTHER_CLASS =
  'w-full py-3 text-accent font-medium border-2 border-dashed border-accent/30 rounded-lg hover:bg-accent/5 transition-colors disabled:opacity-50 mb-4';
const FORM_BASE = {
  eventId: 'e1',
  eventName: 'Boxing Day',
  onComplete: () => {},
  onAddPerson: async () => {},
  channelCandidates: [],
};
const EDITING_ANA = {
  id: 'h-ana',
  primaryContact: { name: 'Ana Ngata', email: 'ana@example.com', phone: '' },
  partner: null,
  helpers: [],
  littleCount: 0,
  guests: [],
  contactPersonEventId: null,
  messagesMuted: true,
};
const HOST_KATE = { name: 'Kate Lowe', email: 'kate@example.com', phone: null };
/** Moment 1's arrangement, as the setup page writes it (GTC-365; pinned by demo-tweaks-2 R1). */
const M1_ROW = 'flex flex-col md:flex-row md:gap-8';
const M1_PHONE = 'md:hidden mt-8';
const M1_RIGHT = 'hidden md:block w-80 flex-shrink-0';
const M1_STICKY = 'sticky top-8 max-h-[calc(100vh-4rem-65px)] overflow-y-auto';
const rx = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

// ── Item 4: the plan screen's lead-in, hand-written ──────────────────────────
const PLAN_VIEW = 'src/components/plan/Moment2PlanView.tsx';
const SKELETON = 'src/components/plan/Moment2Step2Skeleton.tsx';
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
/** The words' line inside one MomentWords block (its second paragraph). */
const wordsOf = (html: string, marker: string) => {
  const at = html.indexOf(`data-moment-words="${marker}"`);
  if (at < 0) return '';
  const m = html.slice(at).match(/<\/p><p class="[^"]*">([^<]*)<\/p><\/div>/);
  return m ? m[1] : '';
};

// ── Item 5: no "0%" while nothing is confirmed, hand-written ─────────────────
const PREFLIGHT = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const FIGURES_START = '<div className="flex gap-6 mb-4">';
const FIGURE_GUARD = '{coverage.complianceRate > 0 && (';
const CONFIRMED_LABEL = 'confirmed so far';

// ── Item 6: who the kids are, hand-written ───────────────────────────────────
const KIDS_FILE = 'src/components/preflight/kids-note.ts';
const PREFLIGHT_ROUTE = 'src/app/api/events/[id]/pre-flight/route.ts';
const KIDS_WORD = 'Kids:';
/** Ana's household as the pre-flight read carries it: adults first, then the children, by name. */
const NGATA_MEMBERS = [
  { name: 'Ana Ngata', householdRole: 'PRIMARY_CONTACT' },
  { name: 'Ross Ngata', householdRole: 'PARTNER' },
  { name: 'Tia Ngata', householdRole: 'GUEST' },
  { name: 'Josh Ngata', householdRole: 'CHILD' },
  { name: 'Mere Ngata', householdRole: 'CHILD' },
];
const NGATA_NOTE = 'Kids: Josh Ngata, Mere Ngata';
/** Bob's: no child (a young person is still a GUEST); someone unhoused has no role. */
const REID_MEMBERS = [
  { name: 'Bob Reid', householdRole: 'PRIMARY_CONTACT' },
  { name: 'Jo Reid', householdRole: 'GUEST' },
  { name: 'Lee Tan', householdRole: null },
];
/** The page's "+ N kids without jobs" line, as at the tag, beside which the note sits. */
const LITTLE_LINE = '{h.littleCount > 0 && (';
const KIDS_LINE = '{kids && <p className="text-xs text-gray-400 mb-3">{kids}</p>}';

// ── Item 7: the two labels, hand-written ─────────────────────────────────────
const COMPOSE = 'src/lib/preflight/ask-preview-compose.ts';
const PERSON_PILL = 'Gather will hand this off to you';
const SWITCH_PILL = 'Gather will leave them to you';
const OLD_PERSON_PILL = 'Hand this one to me';
const OLD_SWITCH_PILL = 'Leave them to me';
const OLD_PILL_LINES = [
  `  HAND_TO_HOST: '${OLD_SWITCH_PILL}',`,
  `  HAND_TO_HOST: '${OLD_PERSON_PILL}',`,
];
const NEW_PILL_LINES = [`  HAND_TO_HOST: '${SWITCH_PILL}',`, `  HAND_TO_HOST: '${PERSON_PILL}',`];
/** The only files that may read the pills or their composer: the two screens and the module. */
const PILL_READERS = [
  'src/app/plan/[eventId]/pre-flight/page.tsx',
  'src/components/preflight/AfterThePress.tsx',
  'src/lib/preflight/ask-preview-compose.ts',
];
const PILL_NAMES = ['CHASE_PERSON_PILLS', 'CHASE_DEFAULT_PILLS', 'chasePersonPills'];
/** Where a message is composed or sent: none of these may read them. */
const SENDING_ROOTS = [
  'src/lib/press',
  'src/app/api',
  'src/lib/sms',
  'src/lib/email.ts',
  'src/lib/demo',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/preflight/test-email.ts',
  'src/lib/preflight/test-email-send.ts',
];
const walk = (dir: string, out: string[] = []): string[] => {
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  if (fs.statSync(full).isFile()) {
    out.push(dir);
    return out;
  }
  for (const name of fs.readdirSync(full)) {
    const rel = path.join(dir, name);
    if (fs.statSync(path.join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(rel);
  }
  return out;
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
  'src/lib/demo', // but typical-answers.ts (GTC-399 item 4; see EXCLUDED and the list below)
  'src/lib/sms',
  'src/lib/live-sends.ts',
  'src/lib/preflight/ask-preview.ts',
  'src/lib/preflight/tick-memory.ts',
  'src/lib/workflow.ts',
  'src/components/plan/MomentWords.tsx',
  'src/lib/moments/moment-words.ts',
  'src/components/plan/Moment2Step2Skeleton.tsx',
  'src/components/plan/HouseholdCardList.tsx',
  'src/components/plan/AccordionShell.tsx',
  'src/components/demo/CrowdButton.tsx',
  'src/components/preflight/mark-rows.tsx',
  'src/components/preflight/AfterThePress.tsx',
];
/**
 * [[GTC-398]] (items 2 to 5) edits these two on purpose, so U1 asks its question of them at
 * GTC-398's base (8a4f1bc), a fixed commit: GTC-396 still may not have touched them. GTC-398's own
 * suite (test:demo-tweaks-4) pins their new state.
 */
const NOT_TOUCHED_TILL_GTC398 = [
  'src/components/plan/Moment3AssignView.tsx',
  'src/components/shared/EventDropOffLine.tsx',
];
/**
 * [[GTC-399]] edits these three on purpose (item 1 Moment 2's opening, item 2 the titles, item 4 the
 * sample's button), so U1 asks its question of them at GTC-399's base (6d2b103), a fixed commit:
 * GTC-396 still may not have touched them. GTC-399's own suite (test:demo-tweaks-5) pins their new
 * state. typical-answers.ts is also kept out of the live diff of its directory, which stays listed.
 */
const NOT_TOUCHED_TILL_GTC399 = [
  'src/components/plan/Moment2Opening.tsx',
  'src/lib/moments/opening-titles.ts',
  'src/lib/demo/typical-answers.ts',
];
const EXCLUDED = [':(exclude)src/lib/demo/typical-answers.ts'];
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
  movedNothingElse(now: string, head: string, atGtc399Base: string) {
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
      // [[GTC-399]] item 2 adds Moment 3's opening to the stages on purpose (its own suite pins the
      // new stage), so the stages are asked as at GTC-399's base (6d2b103), a fixed commit.
      stages(head).length > 100 &&
      flat(stages(atGtc399Base)) === flat(stages(head)) &&
      count(now, 'scrollIntoView') === count(head, 'scrollIntoView') &&
      count(now, 'window.scrollTo') === count(head, 'window.scrollTo') &&
      count(now, 'scrollTop') === count(head, 'scrollTop') + 1
    );
  },

  // ── Item 3 ──
  /** B1 — the form's foot, adding people: "Save & add another household" as it was, no move-on. */
  formFootGuest(html: string) {
    return (
      html.includes(`>${esc(ADD_ANOTHER)}</button>`) &&
      html.includes(`class="${ADD_ANOTHER_CLASS}"`) &&
      !html.includes(esc(MOVE_ON)) &&
      !html.includes('>Save changes</button>') &&
      !html.includes('>Cancel</button>')
    );
  },
  /** B2 — the edit mode: Save changes and Cancel, nothing else at the foot. */
  formFootEdit(html: string) {
    return (
      html.includes('>Save changes</button>') &&
      html.includes('>Cancel</button>') &&
      !html.includes(esc(MOVE_ON)) &&
      !html.includes(esc(ADD_ANOTHER))
    );
  },
  /** B3 — her own household's step: its one button, nothing else at the foot. */
  formFootHost(html: string) {
    return (
      html.includes('>Save and add everyone else →</button>') &&
      !html.includes(esc(MOVE_ON)) &&
      !html.includes(esc(ADD_ANOTHER))
    );
  },
  /** B4 — the form hands over its handler and saving flag; handleDone as it was; no button of its own. */
  formHandsOver(now: string, head: string) {
    const done = (src: string) => between(src, 'const handleDone = async () => {', 'onComplete();');
    return (
      /moveOnRef\?: MutableRefObject<\(\(\) => Promise<void>\) \| null>;/.test(now) &&
      /onSavingChange\?: \(saving: boolean\) => void;/.test(now) &&
      /useEffect\(\(\) => \{\s*if \(!moveOnRef\) return;\s*moveOnRef\.current = handleDone;/.test(
        now
      ) &&
      /useEffect\(\(\) => \{\s*onSavingChange\?\.\(saving\);\s*\}, \[saving, onSavingChange\]\);/.test(
        now
      ) &&
      done(head).length > 200 &&
      flat(done(now)) === flat(done(head)) &&
      !now.includes('onClick={handleDone}') &&
      !now.includes(MOVE_ON)
    );
  },
  /** B5 — the page draws the one button, under the row, with the crowd's style and the form's rule. */
  pageDrawsIt(src: string, crowdSrc: string) {
    const row = src.indexOf(`<div className="${M1_ROW}">`);
    const right = src.indexOf(`<div className="${M1_RIGHT}">`);
    const button = src.indexOf(MOVE_ON);
    const m3 = src.indexOf('if (showMoment3');
    const hostBlock = between(src, "if (moment1Phase === 'host')", 'const handleAddHousehold');
    const inputBlock = between(src, 'const handleAddHousehold', 'if (showMoment3');
    const button_rx = new RegExp(
      `\\{!editingHousehold && \\(\\s*<button\\s+type="button"\\s+onClick=\\{\\(\\) => void moment1MoveOnRef\\.current\\?\\.\\(\\)\\}\\s+disabled=\\{moment1Saving\\}\\s+className="mt-6 ${rx(CROWD_CLASS)}"\\s*>\\s*${rx(MOVE_ON)}\\s*</button>\\s*\\)\\}`
    );
    return (
      count(src, MOVE_ON) === 1 &&
      row > 0 &&
      right > row &&
      button > right &&
      m3 > button &&
      button_rx.test(src) &&
      crowdSrc.includes(`className="${CROWD_CLASS}"`) &&
      count(src, 'const moment1MoveOnRef = useRef<(() => Promise<void>) | null>(null);') === 1 &&
      count(src, 'const [moment1Saving, setMoment1Saving] = useState(false);') === 1 &&
      count(inputBlock, 'moveOnRef={moment1MoveOnRef}') === 1 &&
      count(inputBlock, 'onSavingChange={setMoment1Saving}') === 1 &&
      !hostBlock.includes('moveOnRef=') &&
      !hostBlock.includes('onSavingChange=') &&
      !hostBlock.includes(MOVE_ON)
    );
  },
  /** B6 CONTROL — the row, the phone list block and the column as at the tag; two forms still. */
  layoutKept(now: string, head: string) {
    const phone = (src: string) =>
      between(src, `<div className="${M1_PHONE}">`, `<div className="${M1_RIGHT}">`);
    const column = (src: string) => between(src, `<div className="${M1_RIGHT}">`, 'top={');
    return (
      [M1_ROW, M1_PHONE, M1_RIGHT, M1_STICKY].every((c) => now.includes(`className="${c}"`)) &&
      phone(head).length > 100 &&
      flat(phone(now)) === flat(phone(head)) &&
      column(head).length > 100 &&
      flat(column(now)) === flat(column(head)) &&
      count(now, '<Moment1InputForm') === 2 &&
      count(head, '<Moment1InputForm') === 2
    );
  },

  // ── Item 4 (reversed by GTC-398 item 1) ──
  /** L1 — the plan screen carries no Moment words at all: no marker, neither heading; the strip still before the heading, once. */
  noLeadInOnPlan(html: string) {
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
  /** L2 — with the event's facts: the drop-off line after the strip and straight above the heading, no Moment words before it. */
  dropOffStillAboveHeading(html: string) {
    const strip = html.indexOf('data-moment-strip');
    const line = html.indexOf('<p data-drop-off-line=""');
    return (
      strip >= 0 &&
      line > strip &&
      /<p data-drop-off-line=""[^>]*>[^<]*<\/p><h1\b/.test(html) &&
      count(html, 'data-drop-off-line') === 1 &&
      !html.includes('data-moment-words')
    );
  },
  /** L4 — Moment 2's opening page still draws both lines, once each, "done" under "does"; the plan view draws neither text. */
  openingKeepsWords(plan: string, opening: string) {
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
  /** L5 CONTROL — no MomentWords in the view; the rest as at GTC-398's base; the skeleton draws none of it and is not edited. */
  planViewKept(now: string, base: string, skeleton: string, skeletonUnchanged: boolean) {
    const fromHeading = (src: string) =>
      src.slice(src.indexOf('<h1 className="text-xl font-semibold'));
    const top = (src: string) =>
      between(src, 'return (\n    <div className="min-h-screen', '<MomentArc');
    return (
      count(now, '<MomentWords') === 0 &&
      !now.includes('MomentWords') &&
      fromHeading(base).length > 1000 &&
      flat(fromHeading(now)) === flat(fromHeading(base)) &&
      top(base).length > 50 &&
      flat(top(now)) === flat(top(base)) &&
      !skeleton.includes('MomentWords') &&
      !skeleton.includes('data-moment-words') &&
      skeletonUnchanged
    );
  },

  // ── Item 5 ──
  /** Z1 — the third figure drawn only while the rate is above 0; its own element, so the row closes up. */
  figureHidden(src: string) {
    const figures = between(src, FIGURES_START, `${CONFIRMED_LABEL}</p>`);
    const guarded = new RegExp(
      `${rx(FIGURE_GUARD)}\\s*<div>\\s*<p className="text-2xl font-medium text-gray-900">\\{coverage\\.complianceRate\\}%</p>\\s*<p className="text-sm text-gray-500">${CONFIRMED_LABEL}</p>\\s*</div>\\s*\\)\\}`
    );
    return (
      figures.length > 0 &&
      guarded.test(src) &&
      count(src, FIGURE_GUARD) === 1 &&
      count(src, CONFIRMED_LABEL) === 1 &&
      count(figures, 'coverage.unassignedCount') === 1 &&
      // the critical figure reads its count twice: its colour and its value
      count(figures, 'coverage.criticalUnassignedCount') === 2 &&
      figures.indexOf('coverage.criticalUnassignedCount') < figures.indexOf(FIGURE_GUARD)
    );
  },
  /** Z2 CONTROL — the other two figures, their row and the words exactly as at the tag; no new words. */
  figuresKept(now: string, head: string) {
    const figures = (src: string) => between(src, FIGURES_START, `${CONFIRMED_LABEL}</p>`);
    const nowBare = figures(now).replace(FIGURE_GUARD, '');
    return (
      figures(head).length > 200 &&
      !figures(head).includes(FIGURE_GUARD) &&
      flat(nowBare) === flat(figures(head)) &&
      count(now, 'unassigned</p>') === count(head, 'unassigned</p>') &&
      count(now, 'critical and unassigned</p>') === count(head, 'critical and unassigned</p>')
    );
  },

  // ── Item 6 ──
  /** K1 — the helper: the CHILD members' names in the page's order after "Kids:"; null without any. */
  kidsNoteWords(mod: any) {
    const note = (m: unknown[]) => (mod?.kidsNote ? mod.kidsNote(m) : undefined);
    const swapped = [NGATA_MEMBERS[0], NGATA_MEMBERS[4], NGATA_MEMBERS[3]];
    return (
      mod?.KIDS_NOTE_WORDS?.KIDS === KIDS_WORD &&
      note(NGATA_MEMBERS) === NGATA_NOTE &&
      note(swapped) === 'Kids: Mere Ngata, Josh Ngata' &&
      note([NGATA_MEMBERS[3]]) === 'Kids: Josh Ngata' &&
      note(REID_MEMBERS) === null &&
      note([]) === null &&
      note([{ name: '   ', householdRole: 'CHILD' }, NGATA_MEMBERS[4]]) === 'Kids: Mere Ngata' &&
      note([{ name: 'Kai Ngata', householdRole: 'CHILD', isYoungPerson: true }]) ===
        'Kids: Kai Ngata'
    );
  },
  /** K2 — the page: the note from the read's own members, inside every household's panel, above the little-ones line, before the picker (so the host's own household too). */
  kidsOnPage(src: string) {
    const households = between(src, '{households.map((h) => {', '{unhoused.length > 0 && (');
    const shell = households.indexOf('<AccordionShell');
    const kidsLine = households.indexOf(KIDS_LINE);
    const little = households.indexOf(LITTLE_LINE);
    const picker = households.indexOf('{!h.isHostHousehold && (');
    const marks = households.indexOf('<MarkRows');
    return (
      src.includes("import { kidsNote } from '@/components/preflight/kids-note';") &&
      count(households, 'const kids = kidsNote(h.members);') === 1 &&
      count(src, 'kidsNote(') === 1 &&
      shell > 0 &&
      kidsLine > shell &&
      little > kidsLine &&
      picker > little &&
      marks > picker &&
      count(src, KIDS_LINE) === 1 &&
      !src.includes(`'${KIDS_WORD}`) &&
      !src.includes(`"${KIDS_WORD}`) &&
      !src.includes(`>${KIDS_WORD}`)
    );
  },
  /** K3 CONTROL — the little-ones line, the picker fragment and the marks as at the tag; the route not edited. */
  panelKept(now: string, head: string, routeUnchanged: boolean) {
    const little = (src: string) => between(src, LITTLE_LINE, ')}');
    const picker = (src: string) => between(src, '{!h.isHostHousehold && (', '<MarkRows');
    return (
      little(head).length > 50 &&
      flat(little(now)) === flat(little(head)) &&
      picker(head).length > 300 &&
      flat(picker(now)) === flat(picker(head)) &&
      count(now, '<MarkRows') === count(head, '<MarkRows') &&
      routeUnchanged
    );
  },

  // ── Item 7 ──
  /** P1 — the two labels as the founder wrote them, no full stop; the other pills and the suffix as they were. */
  pillWords(mod: any) {
    const person = mod?.chasePersonPills
      ? mod.chasePersonPills({ exception: null, eventDefault: null })
      : null;
    return (
      mod?.CHASE_PERSON_PILLS?.HAND_TO_HOST === PERSON_PILL &&
      mod?.CHASE_DEFAULT_PILLS?.HAND_TO_HOST === SWITCH_PILL &&
      !PERSON_PILL.endsWith('.') &&
      !SWITCH_PILL.endsWith('.') &&
      mod?.CHASE_PERSON_PILLS?.BY_EMAIL === 'Nudge by email' &&
      mod?.CHASE_DEFAULT_PILLS?.BY_EMAIL === 'Nudge them by email' &&
      mod?.DEFAULT_SUFFIX === ' (the default)' &&
      Array.isArray(person) &&
      person.length === 2 &&
      person[1]?.label === PERSON_PILL &&
      person[0]?.label === 'Nudge by email (the default)'
    );
  },
  /** P2 — the module differs from the tag by those two lines and nothing else. */
  composeDiffersByTwoLines(diff: string) {
    const lines = diff.split('\n');
    const minus = lines
      .filter((l) => l.startsWith('-') && !l.startsWith('---'))
      .map((l) => l.slice(1));
    const plus = lines
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1));
    return (
      diff.length > 0 &&
      JSON.stringify(minus) === JSON.stringify(OLD_PILL_LINES) &&
      JSON.stringify(plus) === JSON.stringify(NEW_PILL_LINES)
    );
  },
  /** P3 — nothing that composes or sends a message reads the pills or their composer; the old words are gone. */
  pillsReadOnlyByScreens(files: Array<{ rel: string; text: string }>) {
    const readers = files
      .filter((f) => PILL_NAMES.some((n) => f.text.includes(n)))
      .map((f) => f.rel)
      .sort();
    const oldWords = files.filter(
      (f) => f.text.includes(OLD_PERSON_PILL) || f.text.includes(OLD_SWITCH_PILL)
    );
    const inSending = files.filter(
      (f) =>
        SENDING_ROOTS.some((r) => f.rel === r || f.rel.startsWith(`${r}/`)) &&
        (PILL_NAMES.some((n) => f.text.includes(n)) ||
          f.text.includes(PERSON_PILL) ||
          f.text.includes(SWITCH_PILL))
    );
    return (
      files.length > 200 &&
      JSON.stringify(readers) === JSON.stringify([...PILL_READERS].sort()) &&
      oldWords.length === 0 &&
      inSending.length === 0
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
    'H5 CONTROL: Moment 2’s opening page has no herd line and its file is not edited between demo-tweaks-2-good and GTC-399’s base (6d2b103; GTC-399 item 1 draws the strip on it, its own suite pins that)',
    CHECKS.momentTwoOpeningKept(
      two,
      git(['diff', '--quiet', GOOD_TAG, GTC399_BASE, '--', OPENING_2]).status === 0
    )
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
    'T4 CONTROL: nothing else moved — Edit’s own phone scroll, the column’s own scroll, the stages (as at 6d2b103, GTC-399’s base) and every other scroll call as at demo-tweaks-2-good',
    head.length > 0 &&
      CHECKS.movedNothingElse(
        now,
        head,
        stripComments(git(['show', `${GTC399_BASE}:${SETUP_PAGE}`]).stdout ?? '')
      )
  );
}

// ══ Item 3 ═══════════════════════════════════════════════════════════════════
async function layerB() {
  section('B — item 3: "Save & move on →" spans both columns, under the list');
  const guest = render(createElement(Moment1InputForm as any, { ...FORM_BASE }));
  const editing = render(
    createElement(Moment1InputForm as any, {
      ...FORM_BASE,
      editingHousehold: EDITING_ANA,
      onEditSave: async () => {},
      onCancelEdit: () => {},
    })
  );
  const host = render(
    createElement(Moment1InputForm as any, {
      ...FORM_BASE,
      hostMode: HOST_KATE,
      onSaveHostHousehold: async () => {},
    })
  );
  assert(
    'B',
    'B1 the form’s foot while adding people: "Save & add another household" where it was, with its class; no "Save & move on →" (moved, not copied)',
    CHECKS.formFootGuest(guest),
    guest.slice(guest.lastIndexOf('<button'), guest.lastIndexOf('<button') + 200)
  );
  assert(
    'B',
    'B2 the edit mode is untouched: "Save changes" and "Cancel", no move-on, no add-another',
    CHECKS.formFootEdit(editing)
  );
  assert(
    'B',
    'B3 her own household’s step is untouched: "Save and add everyone else →" alone',
    CHECKS.formFootHost(host)
  );
  const formNow = code(M1_FORM);
  const formHead = stripComments(atGood(M1_FORM));
  assert(
    'B',
    'B4 the form hands the page its handler (handleDone, kept current in moveOnRef) and its saving flag (onSavingChange); handleDone as it was; the form draws no move-on button',
    formHead.length > 0 && CHECKS.formHandsOver(formNow, formHead)
  );
  const page = code(SETUP_PAGE);
  assert(
    'B',
    'B5 the setup page draws the one "Save & move on →" after the two-column row and before Moment 3, full width, in "Add a crowd"’s filled accent style, running the form’s handler, disabled while the form saves, not while a household is being edited; the host’s step gets none of it',
    CHECKS.pageDrawsIt(page, code(CROWD_FILE))
  );
  assert(
    'B',
    'B6 CONTROL: the row, the phone list block and the sticky column as at demo-tweaks-2-good; the form still drawn twice (her own step, the people screen)',
    CHECKS.layoutKept(page, stripComments(atGood(SETUP_PAGE)))
  );
}

// ══ Item 4 (reversed by GTC-398 item 1) ═════════════════════════════════════
async function layerL() {
  // [[GTC-398]] item 1 (founder, 23 Oct 2026: "After plan generation this screen comes up. Lose
  // it."): GTC-396 item 4 is reversed on purpose. Each check asks its question of the new truth:
  // the plan screen has no lead-in, Moment 2's opening page still has it.
  section('L — item 4, reversed by GTC-398 item 1: the plan screen has no lead-in');
  const drawPlan = (over: Record<string, unknown>) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment2PlanView as any, { ...PLAN_BASE, ...over })
      )
    );
  const plan = drawPlan({});
  assert(
    'L',
    'L1 the plan screen carries no Moment words: no data-moment-words, no "What this does", no "When it’s done"; the strip still before the heading (GTC-398 item 1)',
    CHECKS.noLeadInOnPlan(plan),
    plan.slice(plan.indexOf('data-moment-strip'), plan.indexOf('<h1')).slice(-400)
  );
  const withFacts = drawPlan({ details: VENUE_FACTS });
  assert(
    'L',
    'L2 GTC-395 item 7’s drop-off line still sits directly above the heading, now straight after the strip, with no Moment words before it',
    CHECKS.dropOffStillAboveHeading(withFacts)
  );
  const own = drawPlan({ ownPlan: true });
  assert(
    'L',
    'L3 the plan written by hand (ownPlan) carries no Moment words either',
    CHECKS.noLeadInOnPlan(own)
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
    'L4 Moment 2’s opening page still draws its "What this does" and "When it’s done", once each, "done" under "does"; the plan view draws neither line’s words',
    CHECKS.openingKeepsWords(plan, opening)
  );
  assert(
    'L',
    'L5 CONTROL: no MomentWords in the plan view (nor its import); the heading, the count line, the list, the bar and everything after the heading, and the top, as at GTC-398’s base (8a4f1bc); the skeleton shown while generating draws no Moment words and is not edited',
    CHECKS.planViewKept(
      code(PLAN_VIEW),
      stripComments(atRef(GTC398_BASE, PLAN_VIEW)),
      code(SKELETON),
      unchangedSinceGood([SKELETON])
    )
  );
}

// ══ Item 5 ═══════════════════════════════════════════════════════════════════
async function layerZ() {
  section('Z — item 5: no "0% confirmed so far" while nothing is confirmed');
  const now = code(PREFLIGHT);
  const head = stripComments(atGood(PREFLIGHT));
  assert(
    'Z',
    'Z1 the "confirmed so far" figure is drawn only while the rate is above 0, as its own element inside the row, so the other two leave no hole',
    CHECKS.figureHidden(now)
  );
  assert(
    'Z',
    'Z2 CONTROL: the row, "unassigned" and "critical and unassigned" exactly as at demo-tweaks-2-good; the figure itself unchanged when shown; no new words',
    head.length > 0 && CHECKS.figuresKept(now, head)
  );
}

// ══ Item 6 ═══════════════════════════════════════════════════════════════════
async function layerK() {
  section('K — item 6: who the kids are, on the nudge household screen');
  const KN = await load('../src/components/preflight/kids-note');
  assert(
    'K',
    'K1 "Kids: Josh Ngata, Mere Ngata": the CHILD members’ names, as held, in the read’s order, after the one new word; nothing (null) for a household without children; a GUEST or a young person is not a kid; a blank name is skipped',
    !!KN && CHECKS.kidsNoteWords(KN),
    KN ? JSON.stringify(KN.kidsNote?.(NGATA_MEMBERS)) : 'module did not load'
  );
  const now = code(PREFLIGHT);
  assert(
    'K',
    'K2 the households step draws it from the members its read already carries, inside every household’s panel (the host’s own too), above "+ N kids without jobs" and before the picker; the word lives in the helper only',
    CHECKS.kidsOnPage(now)
  );
  assert(
    'K',
    'K3 CONTROL: the little-ones line, the picker and its line, and the marks as at demo-tweaks-2-good; the pre-flight read’s route not edited (no route, read or schema touched)',
    CHECKS.panelKept(now, stripComments(atGood(PREFLIGHT)), unchangedSinceGood([PREFLIGHT_ROUTE]))
  );
}

// ══ Item 7 ═══════════════════════════════════════════════════════════════════
async function layerP() {
  section('P — item 7: the two HAND_TO_HOST labels');
  const APC = await load('../src/lib/preflight/ask-preview-compose');
  assert(
    'P',
    'P1 "Gather will hand this off to you" (the per-person pill) and "Gather will leave them to you" (the switch), neither with a full stop; the BY_EMAIL pills, the suffix and the composer’s shape as they were',
    !!APC && CHECKS.pillWords(APC),
    APC ? JSON.stringify([APC.CHASE_PERSON_PILLS, APC.CHASE_DEFAULT_PILLS]) : 'module did not load'
  );
  assert(
    'P',
    'P2 the module differs from demo-tweaks-2-good by those two lines and nothing else',
    CHECKS.composeDiffersByTwoLines(git(['diff', GOOD_TAG, '--', COMPOSE]).stdout)
  );
  const files = walk('src').map((rel) => ({ rel, text: read(rel) }));
  assert(
    'P',
    `P3 across ${files.length} source files only the two screens and the module read the pills or their composer; nothing under the press, the routes, SMS, email, the demo library or the ask’s sender does; the old words are gone`,
    CHECKS.pillsReadOnlyByScreens(files)
  );
}

// ══ CONTROL ══════════════════════════════════════════════════════════════════
async function layerU() {
  section('U — CONTROL: what this batch must not touch');
  const missing = NOT_TOUCHED.filter((f) => !fs.existsSync(path.join(ROOT, f)));
  const missingAtBase = [
    ...NOT_TOUCHED_TILL_GTC398.filter(
      (f) => git(['cat-file', '-e', `${GTC398_BASE}:${f}`]).status !== 0
    ),
    ...NOT_TOUCHED_TILL_GTC399.filter(
      (f) => git(['cat-file', '-e', `${GTC399_BASE}:${f}`]).status !== 0
    ),
  ];
  assert(
    'U',
    `U1 the ${NOT_TOUCHED.length} untouched paths exist and are not edited since demo-tweaks-2-good (routes, schema, auth, press, AI, email, households, the paying page, the demo library, SMS, the live switch, the pre-flight’s other libraries, and the neighbours no item edits); the ${NOT_TOUCHED_TILL_GTC398.length} that GTC-398 edits are not edited between demo-tweaks-2-good and GTC-398’s base (8a4f1bc); the ${NOT_TOUCHED_TILL_GTC399.length} that GTC-399 edits not between demo-tweaks-2-good and GTC-399’s base (6d2b103)`,
    missing.length === 0 &&
      unchangedSinceGood([...NOT_TOUCHED, ...EXCLUDED]) &&
      missingAtBase.length === 0 &&
      git(['diff', '--quiet', GOOD_TAG, GTC398_BASE, '--', ...NOT_TOUCHED_TILL_GTC398]).status ===
        0 &&
      git(['diff', '--quiet', GOOD_TAG, GTC399_BASE, '--', ...NOT_TOUCHED_TILL_GTC399]).status ===
        0,
    missing.length || missingAtBase.length
      ? `missing: ${[...missing, ...missingAtBase].join(', ')}`
      : undefined
  );
  // GTC-397 (founder's ruling, 22 Oct 2026): read package.json as it was at GTC-396's last
  // commit, not the file on disk, so a later ticket's script line cannot turn this red. That
  // commit never changes; the condition is the same and still fails on any other difference.
  assert(
    'U',
    `U2 package.json at GTC-396's last commit (${GTC396_LAST.slice(0, 7)}) differs from the tag by "${NEW_SCRIPT}" and nothing else`,
    CHECKS.onlyTheScript(atRef(GTC396_LAST, 'package.json'), atGood('package.json'))
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
  await layerB();
  await layerL();
  await layerZ();
  await layerK();
  await layerP();
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
