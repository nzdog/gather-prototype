/**
 * [[GTC-394]] — THE DEMO TWEAKS, the founder's eight changes after his look at GTC-392 part B.
 *
 * Founder rulings, 19 Oct 2026 (in Cowork): his first prompt, and his rulings on the stop at
 * tweak 1 ("All fourteen", built in two parts; "Build it as it stands"; "Section / Picked /
 * Notes"). Each tweak adds its own layer here, in its own commit.
 *
 * THE LAYERS
 *   H  tweak 1 (a): the host's card, one shared definition, in the eight places where the screen
 *      already knows who the host is.
 *   O  tweak 2: the two transition pages, much simpler; the two quieter choices moved into
 *      Moment 2's questions, under the same rule.
 *   D  tweak 3: the first page, two buttons; Sarah's door opens her event on the board.
 *   K  tweak 4: "Add a crowd" much more obvious, at the top of the household list.
 *   A  tweak 5: "Fill in typical answers": obvious, it opens what it fills, random, a note.
 *   P  tweak 6: "What you've picked" as a table, with the print's look.
 *   M  tweak 7: step 4, the message first, simple and the same every time (the screen only).
 *   S  tweak 8: the pretend list says "Invite only", and the "Open step 4" link goes.
 *   B  tweak 1 (b): the host's card in four more places (founder ruling, 20 Oct 2026): Who I
 *      chase's household cards, the /h/ page's people list, the reachability list and the old
 *      board's chips (role only). The board's host strip is left alone; Moment 1's summary list
 *      never holds the host.
 *
 * SAFETY. Static and rendered checks only: no database row, no dev server, no AI call, no
 * browser, no network. Every fixture and expected value is written here by hand, never taken from
 * the code under test. Every check's condition lives in CHECKS so it can be dry-run on a passing
 * and a failing input before RED.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
// Tweak 3 (GTC-394 ruling, 19 Oct 2026): the demo page and the toast provider imported statically,
// as the Moment 3 suites do; a dynamic import() would give the page a second toast context.
import DemoPage from '../src/app/demo/page';
import { ToastProvider } from '../src/contexts/ToastContext';

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
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = (rel: string) => stripComments(read(rel));
const unchangedSinceHead = (paths: string[]) =>
  spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...paths], { cwd: ROOT }).status === 0;
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

// ── Tweak 1 (a): the files and the ruled look, hand-written ─────────────────
const HOST_CARD_FILE = 'src/components/shared/HostCard.tsx';
const HOST_IMPORT = "from '@/components/shared/HostCard'";
/** The card: a soft tint of the accent and a solid accent border (the sage scale builds). */
const HOST_TINT = 'bg-sage-100';
const HOST_BORDER = 'border-accent';
/** The "You" pill made stronger: filled accent, white text. The word stays "You". */
const HOST_PILL_HTML =
  '<span data-host-pill="" class="text-xs font-medium text-white bg-accent rounded-full px-2 py-0.5">You</span>';
/** GTC-256's pill as it was: a faint tint that never built (an opacity on a CSS variable). */
const OLD_PILL_CLASS = 'text-accent bg-accent/10';

/** The eight places, by file, and the host flag each already holds. */
const PLACES: Array<{ name: string; file: string; flags: string[]; pill: boolean }> = [
  {
    name: 'Moment 1’s household cards',
    file: 'src/components/plan/HouseholdCardList.tsx',
    flags: ['household.isHostHousehold'],
    pill: true,
  },
  {
    name: 'the pre-flight step 3 household rows',
    file: 'src/app/plan/[eventId]/pre-flight/page.tsx',
    flags: ['h.isHostHousehold'],
    pill: true,
  },
  {
    name: 'the board’s household card and its "Not in a household" card',
    file: 'src/components/glance/GlanceBoard.tsx',
    flags: ['household.isHostHousehold', 'unhousedHasHost'],
    pill: true,
  },
  {
    name: 'the Moment 3 people rows',
    file: 'src/components/plan/Moment3AssignView.tsx',
    flags: ['person.isHost'],
    pill: true,
  },
  {
    name: 'the old dashboard’s invite list',
    file: 'src/components/plan/InviteStatusSection.tsx',
    flags: ['person.isHost'],
    pill: true,
  },
  {
    name: 'the old dashboard’s people table',
    file: 'src/components/plan/PeopleSection.tsx',
    flags: ['person.personId === hostId'],
    pill: true,
  },
  {
    name: 'the host’s row in the pre-flight mark rows',
    file: 'src/components/preflight/mark-rows.tsx',
    flags: ['isHost'],
    pill: true,
  },
];

// ── Tweak 2: the files, the ruled words, hand-written ────────────────────────
const TITLES_FILE = 'src/lib/moments/opening-titles.ts';
const ARC_FILE = 'src/components/plan/MomentArc.tsx';
const OPENING_1 = 'src/components/plan/SetupOpeningScreen.tsx';
const OPENING_2 = 'src/components/plan/Moment2Opening.tsx';
const MODAL = 'src/components/plan/Moment2Step1Modal.tsx';
const SETUP = 'src/app/plan/[eventId]/setup/page.tsx';
/** The strip's own labels, straight apostrophes, as MomentArc shows them (React escapes '). */
const TITLE_1 = "Who's coming?";
const TITLE_2 = "What's the plan?";
/** [[GTC-399]] item 2: Moment 3's opening page takes the strip's third label the same way. */
const TITLE_3 = "Who's on what?";
const esc = (t: string) => t.replace(/'/g, '&#x27;');
const START_1 = 'Ready to start herding →';
const START_2 = 'Let’s do this →';
const BACK_TO_PEOPLE = '← Back to the people';
const YOUR_EVENTS = '← Your events';
const OWN_PLAN_CHOOSE = 'Write the list myself';
const OWN_PLAN_EXPLAIN = 'I’ll set out the usual sections, and you fill them in.';
const INVITES_CHOOSE = 'Skip the plan: invites only';
const INVITES_EXPLAIN =
  'Nobody’s asked to bring anything. Guests are only asked whether they can come. You can still make a plan any time before you send.';
const INVITES_WORKING = 'Getting the invitations ready…';
const OWN_WAITING = 'Your list is waiting, as you left it.';
const OWN_NOT_HOST = 'Only the host can write the list.';
const OWN_FAILED_WORDS = 'That didn’t work. Try again.';
const PLAN_WAITING = 'Your plan is put away. “Let’s do this →” brings it back as you left it.';
const NOT_HOST_INVITES = 'Only the host can choose this, and send the invitations.';
const FAILED_WORDS = 'That didn’t work. Try again.';
/** The strip's other two labels: either on an opening page means the strip is still there. */
const STRIP_ONLY = [esc("Who's on what?"), 'Is everyone sorted?'];

// ── Tweak 3: the first page, hand-written ─────────────────────────────────────
const DEMO_PAGE = 'src/app/demo/page.tsx';
const SESSION_ROUTE = 'src/app/api/demo/session/route.ts';
const DEMO_ROUTES = [
  SESSION_ROUTE,
  'src/app/api/demo/tokens/route.ts',
  'src/app/api/demo/reset/route.ts',
];
/** The two new words (founder's first prompt, tweak 3). */
const SARAH_DEMO = 'Sarah demo';
const TRY_IT = 'Try it yourself';
/** Words of the sections that go: none may be on the page. */
const GONE_FROM_DEMO = [
  'How Sarah Got Here',
  'Where we are now',
  'The Planning Dashboard',
  'The Host View',
  'The Coordinator View',
  'The Participant View',
  'What happens next',
  'Behind the scenes',
  'Get started',
  'Reset Demo Data',
  'Open Planning Dashboard',
  'Sarah paid $25',
];

// ── Tweak 4: the crowd's words (GTC-392 W16 to W21), hand-written ───────────
const W16 = 'Add a crowd';
const W17 =
  'Adds 30 made-up people in 11 households, so you can try Gather with a full party. You can change or remove any of them.';
const W18 = 'Adding the crowd…';
const W19 = 'Added 30 made-up people in 11 households.';
const W20 = 'The crowd is already here.';
const W21 = 'The crowd couldn’t be added. Try again.';
const LIST_HEADING = 'Ducks in a row so far';

// ── Tweak 5: the typical answers, hand-written ───────────────────────────────
const TYPICAL_FILE = 'src/lib/demo/typical-answers.ts';
const ANSWERS_BUTTON_FILE = 'src/components/demo/TypicalAnswersButton.tsx';
// [[GTC-399]] item 4 (the founder, 24 Oct 2026: "Instead of fill in typical answers - fill in demo
// answers"): the button's words, W23, now read so.
const W23 = 'Fill in demo answers';
const W24 =
  'I’ll answer the questions the way a typical host might. You can change any answer before you press Generate.';
/** The founder's six notes, by section (first prompt, tweak 5). */
const NOTES: Record<string, string> = {
  mains: 'No pork, if we can.',
  sides_salads: 'The salads can be made the day before.',
  dessert: 'Nana can’t have nuts.',
  drinks_alcoholic: 'Keep it light, there are drivers.',
  drinks_non_alcoholic: 'Plenty of ice, please.',
  table_snacks: 'Something for the kids too.',
};
/** The jobs: W27 and W28 first, then the founder's four new sentences. */
const SET_UPS = [
  'Tables and chairs out, and the BBQ cleaned with a full gas bottle.',
  'Chilly bins out, and the tables set up under the trees.',
  'Chairs out, a speaker set up, and extension leads run.',
];
const CLEAN_UPS = [
  'Dishes, rubbish and recycling, and a scrape-down of the BBQ.',
  'Rubbish and recycling out, and the tables wiped down.',
  'Leftovers packed up and the chairs put away.',
];
/** The real Dietary list, as the questions show it. */
const DIETARY = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy'];
/** The Casual BBQ sections it fills (QB5), in the questions' order. */
const BBQ_FILLED = [
  'mains',
  'sides_salads',
  'dessert',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
];
/** A hand-written sequence source: the numbers given, in turn, again from the start when done. */
const sequence = (xs: number[]) => {
  let i = 0;
  return () => xs[i++ % xs.length];
};
/** A hand-written pseudo-random source (Park–Miller), one per seed: never from the code under test. */
const seeded = (seed: number) => {
  let s = seed % 2147483647 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
};
const blankQuestions = () => ({
  eventType: null as string | null,
  eventTypeOther: '',
  mainsData: { items: [] as unknown[], stillDeciding: false } as any,
  sidesData: { items: [] as unknown[], stillDeciding: false },
  dessertsData: { items: [] as unknown[], stillDeciding: false },
  drinksData: { items: [] as unknown[], stillDeciding: false },
  dietaryData: { status: 'unanswered', requirements: [] as string[], other: '' },
  otherNotes: '',
  extendedCategoriesData: {} as Record<string, any>,
  setUpData: { freeText: '', stillDeciding: false },
  cleanUpData: { freeText: '', stillDeciding: false },
  otherJobsOtherData: { freeText: '', stillDeciding: false },
});

// ── Tweak 6: the summary table, hand-written ─────────────────────────────────
const PICKS_FILE = 'src/lib/moments/picks-summary.ts';
const W6 = 'Still deciding · left out of the plan for now';
const W9 = 'Nothing picked yet.';
const HEADERS = ['Section', 'Picked', 'Notes'];
/** Case 1: picks with dishes and a note, a section still deciding, a third question's tick. */
const CASE_PICKS = {
  eventType: 'Casual BBQ',
  sections: ['entree_starters', 'mains', 'sides_salads', 'dessert', 'drinks_alcoholic'],
  picks: {
    mains: {
      selections: {
        0: { options: ['Classic sausage sizzle'], freeText: 'No pork, if we can.' },
        1: { options: ['Beef sausages', 'Chicken sausages'], freeText: '' },
      },
      stillDeciding: false,
    },
    sides_salads: { selections: {}, stillDeciding: true },
    dessert: {
      selections: {
        0: { options: ['Pavlova'], freeText: '' },
        1: { options: ['Berry pavlova'], freeText: '' },
      },
      stillDeciding: false,
    },
    drinks_alcoholic: {
      selections: {
        0: { options: ['Beer and cider'], freeText: '' },
        2: { options: ['Under-18s will be present'], freeText: '' },
      },
      stillDeciding: false,
    },
  },
  dietary: {
    status: 'confirmed_needs',
    requirements: ['Vegetarian', 'Gluten-free'],
    other: 'no shellfish',
  },
};
/** What the summary says for case 1, typed by hand. */
const CASE_PICKS_LINES = [
  '⚠️ Dietary requirements: Vegetarian, Gluten-free, no shellfish',
  '🍖 Mains: Classic sausage sizzle (Beef sausages, Chicken sausages), “No pork, if we can.”',
  `🥗 Sides & Salads: ${W6}`,
  '🍰 Dessert: Pavlova (Berry pavlova)',
  '🍷 Alcoholic Drinks: Beer and cider, Under-18s will be present',
];
/** Case 2: nothing picked at all (W9). */
const CASE_NOTHING = {
  eventType: 'Casual BBQ',
  sections: ['entree_starters'],
  picks: {},
  dietary: { status: 'unanswered', requirements: [], other: '' },
};
const CASE_NOTHING_LINES = ['⚠️ Dietary requirements: Needs confirmation', W9];
/** Case 3: nothing picked in two always-planned sections (W8). */
const CASE_NOTHING_IN = {
  eventType: 'Casual BBQ',
  sections: ['mains', 'sides_salads', 'dessert'],
  picks: {},
  dietary: { status: 'confirmed_none', requirements: [], other: '' },
};
const CASE_NOTHING_IN_LINES = [
  '⚠️ Dietary requirements: No dietary needs',
  'Nothing picked in Mains and Sides & Salads yet. Gather will choose for you.',
];

// ── Tweak 7: step 4, hand-written ────────────────────────────────────────────
const PREFLIGHT = 'src/app/plan/[eventId]/pre-flight/page.tsx';
/** What step 4 composes, stores and fingerprints from: not edited by tweak 7. */
const STEP4_LIBS = [
  'src/lib/preflight/ask-preview.ts',
  'src/lib/preflight/ask-preview-compose.ts',
  'src/lib/preflight/tick-memory.ts',
];
/**
 * [[GTC-396]] item 7 (founder, 21 Oct 2026): the compose module's two HAND_TO_HOST labels were
 * reworded, so M3 asks the same question of it in its new form: against `demo-ab-good` it differs
 * by those two label lines and nothing else; the other two libraries not at all.
 */
const COMPOSE_LIB = 'src/lib/preflight/ask-preview-compose.ts';
const OLD_PILL_LINES = [
  "  HAND_TO_HOST: 'Leave them to me',",
  "  HAND_TO_HOST: 'Hand this one to me',",
];
const NEW_PILL_LINES = [
  "  HAND_TO_HOST: 'Gather will leave them to you',",
  "  HAND_TO_HOST: 'Gather will hand this off to you',",
];
const composeDiffersByThePillsOnly = () => {
  const out = spawnSync('git', ['diff', 'demo-ab-good', '--', COMPOSE_LIB], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout;
  const lines = out.split('\n');
  const minus = lines
    .filter((l) => l.startsWith('-') && !l.startsWith('---'))
    .map((l) => l.slice(1));
  const plus = lines
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1));
  return (
    JSON.stringify(minus) === JSON.stringify(OLD_PILL_LINES) &&
    JSON.stringify(plus) === JSON.stringify(NEW_PILL_LINES)
  );
};
/** Step 4's first part, in the founder's fixed order: the message, its notes, then the controls. */
const STEP4_ORDER = [
  'data-message-part="1"',
  'MESSAGE_STEP_PARTS[0]',
  'data-message-email=""',
  'current.ask.movements',
  'OPT_OUT_LINE',
  'data-test-email=""',
  'NOT_MESSAGED_WHY',
  'replyToLine(',
  '>Your line</label>',
  '>Read it as</label>',
  '<select',
  'CHASED_BY_LABEL',
  'data-message-part="2"',
  'CHASE_DEFAULT_QUESTION',
  'data-message-part="3"',
  'HOST_LIST_HEADING',
];

// ── Tweak 8: the pretend list, hand-written ──────────────────────────────────
const PRETEND_LIB = 'src/lib/demo/pretend-send.ts';
const PRETEND_PANEL = 'src/components/demo/PretendSend.tsx';
const INVITE_ONLY = 'Invite only';
const W35_SAME = 'Each would be the message in step 4, word for word.';

// ── Tweak 1 (b): the four more places, hand-written ──────────────────────────
const PLACES_B: Array<{ name: string; file: string; flags: string[] }> = [
  {
    name: 'Who I chase’s household cards',
    file: 'src/components/preflight/AfterThePress.tsx',
    flags: ['h.isHostHousehold'],
  },
  {
    name: 'the /h/ page’s people list',
    file: 'src/app/h/[token]/page.tsx',
    flags: ['person.id === data.person.id'],
  },
  {
    name: 'the reachability list (old dashboard)',
    file: 'src/components/plan/ReachabilityBar.tsx',
    flags: ['person.isHost'],
  },
  {
    name: 'the old board’s chips, role only (old dashboard)',
    file: 'src/components/plan/TeamBoard.tsx',
    flags: ["person.role === 'HOST'"],
  },
];
/** Left alone by the founder's ruling (the board's strip) or with nothing to draw (Moment 1's summary). */
const LEFT_ALONE_B = [
  'src/components/glance/GlancePersonReading.tsx',
  'src/components/plan/Moment1Summary.tsx',
];

// ── CHECKS-START: every condition, pure, dry-run before RED ───────────────────
const indexesOf = (s: string, needle: string) => {
  const out: number[] = [];
  for (let i = s.indexOf(needle); i >= 0; i = s.indexOf(needle, i + 1)) out.push(i);
  return out;
};
/** The opening tag of the nearest element before `at` whose tag matches `want`. */
function tagBefore(html: string, at: number, tag: string, want: RegExp): string {
  let i = html.lastIndexOf(`<${tag}`, at);
  while (i >= 0) {
    const t = html.slice(i, html.indexOf('>', i) + 1);
    if (want.test(t)) return t;
    i = html.lastIndexOf(`<${tag}`, i - 1);
  }
  return '';
}
/** The text of a function or arrow body from `start`, by brace counting (strings ignored). */
function bodyFrom(src: string, start: string): string {
  const at = src.indexOf(start);
  if (at < 0) return '';
  // The body's own brace: after the parameters (`) {`) or the arrow (`=> {`), not a destructured prop.
  const ends = [src.indexOf(') {', at), src.indexOf('=> {', at)].filter((i) => i >= 0);
  if (ends.length === 0) return '';
  const open = src.indexOf('{', Math.min(...ends));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  return '';
}
const squash = (t: string) => t.replace(/\s+/g, ' ').trim();
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
export const CHECKS = {
  /** H1 — the one shared definition: the card's classes and the pill, no hook, no client marker. */
  hostCardFile(src: string) {
    return (
      /export const HOST_CARD\s*=\s*'[^']*'/.test(src) &&
      src.includes(HOST_TINT) &&
      src.includes(HOST_BORDER) &&
      /export function HostPill\b/.test(src) &&
      src.includes('data-host-pill') &&
      src.includes('text-xs font-medium text-white bg-accent rounded-full px-2 py-0.5') &&
      !/['"]use client['"]/.test(src) &&
      !/\buse[A-Z]\w*\(/.test(src)
    );
  },
  /** H3 to H9 — a place uses the shared definition, each use behind that place's own host flag. */
  usesHostCard(src: string, flags: string[], pill: boolean) {
    if (!src.includes(HOST_IMPORT)) return false;
    const uses = indexesOf(src, 'HOST_CARD').filter(
      (i) => !/import\s*\{[^}]*$/.test(src.slice(Math.max(0, i - 200), i))
    );
    if (uses.length === 0) return false;
    const near = (i: number) => src.slice(Math.max(0, i - 260), i);
    const everyUseFlagged = uses.every((i) => flags.some((f) => near(i).includes(f)));
    const everyFlagUsed = flags.every((f) => uses.some((i) => near(i).includes(f)));
    const pills = indexesOf(src, '<HostPill');
    const pillsFlagged =
      !pill || (pills.length > 0 && pills.every((i) => flags.some((f) => near(i).includes(f))));
    return everyUseFlagged && everyFlagUsed && pillsFlagged && !src.includes(OLD_PILL_CLASS);
  },
  /** H4's extra — the pre-flight row's pill sits in its hint, after the label, and the shell is wrapped. */
  preflightRow(src: string) {
    const i = src.indexOf('label={`${h.label}’s household`}');
    const j = src.indexOf('headerHint={', i);
    const k = src.indexOf('<HostPill', j);
    const end = src.indexOf('<MarkRows', i);
    return (
      i > 0 &&
      j > i &&
      k > j &&
      k - j < 200 &&
      k < end &&
      /h\.isHostHousehold\s*\?\s*`[^`]*HOST_CARD/.test(src)
    );
  },
  /** H10 — Moment 1: the host's card wears it; another household's does not; the pill is there. */
  householdCards(html: string, host: string, other: string) {
    const h = tagBefore(html, html.indexOf(`>${host}<`), 'div', /rounded-lg/);
    const o = tagBefore(html, html.indexOf(`>${other}<`), 'div', /rounded-lg/);
    return (
      h.includes(HOST_TINT) &&
      h.includes(HOST_BORDER) &&
      /\bborder\b/.test(h) &&
      !/\bbg-white\b/.test(h) &&
      o.includes('bg-white') &&
      o.includes('border-gray-200') &&
      !o.includes(HOST_TINT) &&
      !o.includes(HOST_BORDER) &&
      indexesOf(html, HOST_PILL_HTML).length === 1 &&
      html.indexOf(HOST_PILL_HTML) > html.indexOf(`>${host}<`) &&
      html.indexOf(HOST_PILL_HTML) < html.indexOf(`>${other}<`) &&
      !html.includes(OLD_PILL_CLASS)
    );
  },
  /** H11 — the board: the host's household card wears it and carries the pill; another's does not. */
  boardCards(html: string, hostId: string, otherId: string) {
    const a = html.indexOf(`data-household-card="${hostId}"`);
    const b = html.indexOf(`data-household-card="${otherId}"`);
    if (a < 0 || b < 0) return false;
    const tag = (i: number) => html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
    const hostCard = html.slice(a, b > a ? b : undefined);
    const otherCard = html.slice(b, b > a ? undefined : a);
    return (
      tag(a).includes(HOST_TINT) &&
      tag(a).includes(HOST_BORDER) &&
      !tag(a).includes('bg-[#f5f4ef]') &&
      tag(b).includes('bg-[#f5f4ef]') &&
      !tag(b).includes(HOST_TINT) &&
      !tag(b).includes(HOST_BORDER) &&
      hostCard.includes(HOST_PILL_HTML) &&
      !otherCard.includes(HOST_PILL_HTML)
    );
  },
  /** H12 — the board's "Not in a household" card: it wears it only when the host is in it. */
  unhousedCard(withHost: string, withoutHost: string) {
    const tag = (html: string) => {
      const i = html.indexOf('data-unhoused-card');
      return i < 0 ? '' : html.slice(html.lastIndexOf('<', i), html.indexOf('>', i) + 1);
    };
    return (
      tag(withHost).includes(HOST_TINT) &&
      tag(withHost).includes(HOST_BORDER) &&
      tag(withoutHost).includes('bg-[#f5f4ef]') &&
      !tag(withoutHost).includes(HOST_TINT) &&
      !tag(withoutHost).includes(HOST_BORDER)
    );
  },
  /** H13 — the mark rows: the host's row wears it with the pill; another person's does not. */
  markRows(html: string, host: string, other: string) {
    const h = tagBefore(html, html.indexOf(`>${host}<`), 'li', /./);
    const o = tagBefore(html, html.indexOf(`>${other}<`), 'li', /./);
    const hostLi = html.slice(html.indexOf(h), html.indexOf('</li>', html.indexOf(h)));
    const otherLi = html.slice(html.indexOf(o), html.indexOf('</li>', html.indexOf(o)));
    return (
      h.length > 0 &&
      o.length > 0 &&
      h !== o &&
      h.includes(HOST_TINT) &&
      h.includes(HOST_BORDER) &&
      !o.includes(HOST_TINT) &&
      !o.includes(HOST_BORDER) &&
      hostLi.includes(HOST_PILL_HTML) &&
      hostLi.includes('you — never messaged about your own event') &&
      !otherLi.includes(HOST_PILL_HTML)
    );
  },
  /** O1 — the titles, the strip's own first three labels (GTC-399 item 2), read from MomentArc as it stands. */
  titlesMatchArc(titles: string, arc: string) {
    const label = (n: number) =>
      arc.match(new RegExp(`number:\\s*${n},\\s*label:\\s*"([^"]*)"`))?.[1];
    return (
      label(1) === TITLE_1 &&
      label(2) === TITLE_2 &&
      label(3) === TITLE_3 &&
      titles.includes(`1: "${label(1)}"`) &&
      titles.includes(`2: "${label(2)}"`) &&
      titles.includes(`3: "${label(3)}"`)
    );
  },
  /** O3, O4 — an opening page: the big title, the two paragraphs, one primary button, nothing else. */
  openingPage(html: string, moment: 1 | 2, title: string, start: string, back: boolean) {
    const buttons = html.match(/<button\b/g) ?? [];
    const primary = (html.match(/<button[^>]*class="[^"]*\bbg-accent\b[^"]*"/g) ?? []).length;
    const h1 = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/);
    return (
      !!h1 &&
      h1[1] === esc(title) &&
      /text-(3xl|4xl|5xl)/.test(h1[0]) &&
      html.indexOf(`data-moment-words="${moment}-does"`) > html.indexOf('<h1') &&
      html.indexOf(`data-moment-words="${moment}-done"`) >
        html.indexOf(`data-moment-words="${moment}-does"`) &&
      primary === 1 &&
      buttons.length === (back ? 2 : 1) &&
      html.includes(`>${start}</button>`) &&
      html.indexOf(`>${start}</button>`) > html.indexOf(`data-moment-words="${moment}-done"`) &&
      html.includes(YOUR_EVENTS) &&
      (!back || html.includes(`>${BACK_TO_PEOPLE}</button>`)) &&
      // [[GTC-399]] item 1 (founder, 24 Oct 2026): the strip is back above the title. Drawn here
      // without doors, it is its plain row: each of the four labels once, before the <h1>, and no
      // strip marker (that needs doors); the button counts above prove it adds no button.
      [esc(TITLE_1), esc(TITLE_2), ...STRIP_ONLY].every(
        (w) => indexesOf(html.slice(0, Math.max(0, html.indexOf('<h1'))), w).length === 1
      ) &&
      STRIP_ONLY.every((w) => indexesOf(html, w).length === 1) &&
      !html.includes('data-moment-strip') &&
      // [[GTC-396]] item 1 (founder, 21 Oct 2026): Moment 1's page has the herd line back, under
      // the title and above "What this does"; Moment 2's page still has none.
      (moment === 1
        ? html.indexOf('herd of cats') > html.indexOf('<h1') &&
          html.indexOf('herd of cats') < html.indexOf('data-moment-words="1-does"')
        : !/herd of cats/.test(html)) &&
      !html.includes(OWN_PLAN_CHOOSE) &&
      !html.includes(OWN_PLAN_EXPLAIN) &&
      !html.includes(INVITES_CHOOSE) &&
      !html.includes('data-own-plan') &&
      !html.includes('data-invites-only=')
    );
  },
  /** O7 — the questions offer the two choices at their foot: a component of their own, above the bar. */
  modalChoices(src: string) {
    const fn = src.indexOf('export function QuietChoices');
    const body = bodyFrom(src, 'export function QuietChoices');
    const use = src.indexOf('<QuietChoices');
    const el = elementOf(src, 'QuietChoices');
    return (
      fn > src.indexOf('function FoodOptionTreeAccordion') &&
      fn < src.indexOf('function NotesAccordion') &&
      use > src.indexOf('<NotesAccordion') &&
      use < src.indexOf('fixed bottom-0 left-0 right-0') &&
      /onOwnPlan=\{onOwnPlan \? \(\) => void leave\(onOwnPlan\) : undefined\}/.test(el) &&
      /onInvitesOnly=\{onInvitesOnly \? \(\) => void leave\(onInvitesOnly\) : undefined\}/.test(
        el
      ) &&
      el.includes('invitesOnlyState={invitesOnlyState}') &&
      el.includes('ownPlanState={ownPlanState}') &&
      el.includes('ownPlanExists={ownPlanExists}') &&
      body.indexOf('data-own-plan=""') > 0 &&
      body.indexOf('data-invites-only=""') > body.indexOf('data-own-plan=""') &&
      body.includes('OWN_PLAN_WORDS.CHOOSE') &&
      /ownPlanExists\s*\?\s*OWN_PLAN_WORDS\.WAITING\s*:\s*OWN_PLAN_WORDS\.EXPLAIN/.test(body) &&
      body.includes('OWN_PLAN_WORDS.NOT_HOST') &&
      body.includes('OWN_PLAN_WORDS.FAILED') &&
      body.includes('INVITES_ONLY_WORDS.CHOOSE') &&
      body.includes('INVITES_ONLY_WORDS.EXPLAIN') &&
      body.includes('INVITES_ONLY_WORDS.WORKING') &&
      body.includes('INVITES_ONLY_WORDS.NOT_HOST') &&
      body.includes('INVITES_ONLY_WORDS.FAILED') &&
      !/AccordionShell|data-accordion|stillDeciding/.test(body) &&
      !src.includes('INVITES_ONLY_WORDS.PLAN_WAITING')
    );
  },
  /** O10 — the choices, rendered: the words in order, each line under its choice, each state's line. */
  choicesRendered(
    both: string,
    failed: string,
    notHost: string,
    list: string,
    inviteWorking: string
  ) {
    const own = both.indexOf(`>${OWN_PLAN_CHOOSE}</button>`);
    const inv = both.indexOf(`>${INVITES_CHOOSE}</button>`);
    const status = (h: string, t: string) => new RegExp(`role="status"[^>]*>${t}<`).test(h);
    return (
      own > 0 &&
      both.indexOf(OWN_PLAN_EXPLAIN) > own &&
      inv > both.indexOf(OWN_PLAN_EXPLAIN) &&
      both.indexOf(INVITES_EXPLAIN) > inv &&
      status(failed, OWN_FAILED_WORDS) &&
      status(notHost, OWN_NOT_HOST) &&
      !failed.includes(OWN_NOT_HOST) &&
      list.includes(OWN_WAITING) &&
      !list.includes(OWN_PLAN_EXPLAIN) &&
      list.indexOf(OWN_WAITING) > list.indexOf(`>${OWN_PLAN_CHOOSE}</button>`) &&
      status(inviteWorking, INVITES_WORKING) &&
      ![OWN_FAILED_WORDS, OWN_NOT_HOST, INVITES_WORKING].some((w) => both.includes(w))
    );
  },
  /** O8 — the setup page: the questions get the choices under the one rule; the openings do not. */
  setupWiring(src: string, head: string) {
    const modal = elementOf(src, 'Moment2Step1Modal');
    const opening = elementOf(src, 'Moment2Opening');
    const first = elementOf(src, 'SetupOpeningScreen');
    const same = (start: string) =>
      bodyFrom(head, start).length > 100 &&
      squash(bodyFrom(src, start)) === squash(bodyFrom(head, start));
    return (
      /quietChoices\(/.test(src) &&
      /onInvitesOnly=\{\s*offered\.invitesOnly\s*\?\s*\(\)\s*=>\s*void chooseInvitesOnly\(\)\s*:\s*undefined\s*\}/.test(
        modal
      ) &&
      /onOwnPlan=\{\s*offered\.ownPlan\s*\?\s*\(\)\s*=>\s*void writeOwnList\(\)\s*:\s*undefined\s*\}/.test(
        modal
      ) &&
      modal.includes('invitesOnlyState={invitesOnlyState}') &&
      modal.includes('ownPlanState={ownPlanState}') &&
      /ownPlanExists=\{listExists && !invitesOnly\}/.test(modal) &&
      opening.length > 0 &&
      !/onInvitesOnly=|onOwnPlan=|ownPlanState=|ownPlanExists=/.test(opening) &&
      // [[GTC-399]] item 1: each opening page gets the doors the page builds for its Moment.
      /\bdoors=\{doorsFor\(2\)\}/.test(opening) &&
      opening.includes('planWaiting={invitesOnly && planWaiting}') &&
      opening.includes('invitesOnlyState={invitesOnlyState}') &&
      first.length > 0 &&
      /\bdoors=\{doorsFor\(1\)\}/.test(first) &&
      same('const chooseInvitesOnly = async () =>') &&
      same('const writeOwnList = async () =>')
    );
  },
  /**
   * O9 — the two opening components hold no strip and no quieter choice; the herd line is on
   * Moment 1's only ([[GTC-396]] item 1, the founder, 21 Oct 2026; it was on neither).
   */
  openingSources(one: string, two: string) {
    return (
      one.length > 0 &&
      two.length > 0 &&
      one.includes('herd of cats') &&
      !two.includes('herd of cats') &&
      [one, two].every(
        (s) =>
          // [[GTC-399]] item 1: one strip, above the title (pinned per page below).
          s.split('<MomentArc').length - 1 === 1 &&
          s.indexOf('<MomentArc') < s.indexOf('<h1') &&
          !s.includes('OWN_PLAN_WORDS') &&
          !s.includes('data-own-plan') &&
          !s.includes('data-invites-only=') &&
          !s.includes('INVITES_ONLY_WORDS.CHOOSE') &&
          !s.includes('INVITES_ONLY_WORDS.EXPLAIN') &&
          s.includes("from '@/lib/moments/opening-titles'")
      ) &&
      /<MomentArc\s+currentMoment=\{1\}\s+doors=\{doors\}\s*\/>/.test(one) &&
      /<MomentArc\s+currentMoment=\{2\}\s+completedMoments=\{\[1\]\}\s+doors=\{doors\}\s*\/>/.test(
        two
      ) &&
      two.includes('INVITES_ONLY_WORDS.PLAN_WAITING') &&
      two.includes('INVITES_ONLY_WORDS.NOT_HOST') &&
      two.includes('STRIP_WORDS.BACK_TO_PEOPLE')
    );
  },
  /** O5 — the words that belong to "Let’s do this →" sit under it, each only in its own state. */
  mainButtonWords(waiting: string, notHost: string, failed: string, idle: string) {
    const under = (html: string, words: string) =>
      html.indexOf(`>${START_2}</button>`) > 0 &&
      html.indexOf(words) > html.indexOf(`>${START_2}</button>`);
    return (
      under(waiting, PLAN_WAITING) &&
      under(notHost, NOT_HOST_INVITES) &&
      under(failed, FAILED_WORDS) &&
      ![PLAN_WAITING, NOT_HOST_INVITES, FAILED_WORDS].some((w) => idle.includes(w)) &&
      !notHost.includes(PLAN_WAITING) &&
      !waiting.includes(NOT_HOST_INVITES)
    );
  },
  /** D1, D2 — the first page: the heading "Gather" and its buttons, and nothing else. */
  demoPage(html: string, dev: boolean) {
    const buttons = [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    const h1 = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/);
    return (
      !!h1 &&
      h1[1] === 'Gather' &&
      (html.match(/<h1\b/g) ?? []).length === 1 &&
      // [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026): "Sarah demo" goes; "Try it yourself" alone,
      // still development-only, so a production build shows the heading and no button.
      JSON.stringify(buttons) === JSON.stringify(dev ? [TRY_IT] : []) &&
      (html.match(/<button\b/g) ?? []).length === buttons.length &&
      !/<(h2|h3|p|a|section|hr)\b/.test(html) &&
      GONE_FROM_DEMO.every((w) => !html.includes(w)) &&
      !html.includes(SARAH_DEMO)
    );
  },
  /**
   * D3 — the page's code. [[GTC-395]] items 1 and 2 (founder, 20 Oct 2026): the Sarah door and its
   * handler gone. [[GTC-395]] item 3: the copy door is the sample's own page now, so /demo's
   * development-only button opens `/demo/new` and the page fetches nothing.
   */
  demoSource(src: string) {
    return (
      src.length > 200 &&
      !/Sarah|handleOpen/.test(src) &&
      /const SAMPLE_PAGE = '\/demo\/new';/.test(src) &&
      /process\.env\.NODE_ENV === 'development' && \(\s*<button\s+onClick=\{\(\) => window\.location\.assign\(SAMPLE_PAGE\)\}/.test(
        src
      ) &&
      !/fetch\(/.test(src) &&
      !src.includes('/api/demo/tokens') &&
      !src.includes('/api/demo/reset') &&
      !src.includes('confirm(')
    );
  },
  /** K1 — the crowd button: filled accent, full width, larger text, in a soft tinted box with W17. */
  crowdButton(html: string) {
    const box = html.match(/^<div data-crowd="" class="([^"]*)">/);
    const btn = html.match(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/);
    const cls = (btn?.[1] ?? '').split(/\s+/);
    return (
      !!box &&
      /\bbg-sage-(50|100)\b/.test(box[1]) &&
      /\brounded-lg\b/.test(box[1]) &&
      !!btn &&
      btn[2] === W16 &&
      ['bg-accent', 'text-white', 'w-full'].every((c) => cls.includes(c)) &&
      cls.some((c) => /^text-(base|lg)$/.test(c)) &&
      !cls.some((c) => /^border-accent\//.test(c)) &&
      html.indexOf(W17) > html.indexOf(`>${W16}</button>`) &&
      html.match(/<\/div>$/) !== null
    );
  },
  /** K2 — the list: its heading, then what is put at its top, then the households. */
  listTop(html: string, marker: string, firstName: string) {
    const head = html.indexOf(LIST_HEADING);
    const top = html.indexOf(marker);
    const card = html.indexOf(`>${firstName}<`);
    return head >= 0 && top > head && card > top;
  },
  /** K3 — the setup page: on a computer the crowd sits at the list's top; on a phone where it was. */
  setupCrowdPlace(src: string) {
    const phone = src.indexOf('<div className="md:hidden mt-8">');
    const desk = src.indexOf('<div className="hidden md:block w-80 flex-shrink-0">');
    const phoneBlock = src.slice(phone, desk);
    const deskBlock = src.slice(desk, src.indexOf('if (showMoment3'));
    return (
      phone > 0 &&
      desk > phone &&
      /\{sampleCopy && <CrowdButton state=\{crowdState\} onAdd=\{\(\) => void addCrowd\(\)\} \/>\}\s*<HouseholdCardList/.test(
        phoneBlock
      ) &&
      /<HouseholdCardList[\s\S]*?top=\{\s*sampleCopy \? (\(\s*)?<CrowdButton state=\{crowdState\} onAdd=\{\(\) => void addCrowd\(\)\} \/>(\s*\))? : undefined\s*\}/.test(
        deskBlock
      ) &&
      !/\{sampleCopy && <CrowdButton/.test(deskBlock) &&
      (src.match(/<CrowdButton\b/g) ?? []).length === 2
    );
  },
  /** K4 — its states say what they said: working, failed, done, already. */
  crowdStates(working: string, failedH: string, done: string, already: string) {
    return (
      working.includes(`>${W18}</button>`) &&
      /<button[^>]*disabled=""/.test(working) &&
      failedH.includes(`>${W16}</button>`) &&
      failedH.includes(W21) &&
      done.includes(W19) &&
      !done.includes('<button') &&
      already.includes(W20) &&
      !already.includes('<button')
    );
  },
  /**
   * A3 — one fill, read against the questions' own lists (passed in, read from the config): every
   * tick is a choice the question offers, a dish only under a ticked style, one or two of each where
   * the question allows it; the third, independent question untouched; at most two notes, each the
   * section's own words in its first "Other" box; Dietary one to three from the list; each job one
   * of its three; the sections it says it filled are the ones it filled.
   */
  fillIsSound(
    fill: any,
    levelsOf: (key: string) => any[] | null,
    sections: string[],
    expectOpened: string[]
  ) {
    if (!fill?.next) return false;
    const picksOf = (key: string) =>
      key === 'mains'
        ? fill.next.mainsData?.selections
        : fill.next.extendedCategoriesData?.[key]?.selections;
    let notes = 0;
    for (const key of sections) {
      const levels = levelsOf(key);
      const sel = picksOf(key);
      if (!levels || !sel) return false;
      const styles: string[] = sel[0]?.options ?? [];
      const multi0 = levels[0].multiSelect !== false;
      if (styles.length < 1 || styles.length > (multi0 ? 2 : 1)) return false;
      if (!styles.every((s) => (levels[0].options ?? []).includes(s))) return false;
      const typed = sel[0]?.freeText ?? '';
      if (typed !== '') {
        if (typed !== NOTES[key]) return false;
        notes++;
      }
      for (let i = 1; i < levels.length; i++) {
        const got: string[] = sel[i]?.options ?? [];
        if (!levels[i].dependsOn) {
          if (got.length > 0 || (sel[i]?.freeText ?? '') !== '') return false;
          continue;
        }
        if ((sel[i]?.freeText ?? '') !== '') return false;
        // Under each ticked style, one or two of the dishes it lists; nothing a style did not list.
        const under = styles.map((s) => levels[i].dependsOn[s] ?? []);
        if (!got.every((d) => under.some((u: string[]) => u.includes(d)))) return false;
        // A dish listed under two ticked styles shows once, under the first (the questions' rule).
        const shownAt = styles.map((s, k) => {
          const earlier = new Set(under.slice(0, k).flat());
          return (levels[i].dependsOn[s] ?? []).filter((d: string) => !earlier.has(d));
        });
        const multi = levels[i].multiSelect !== false;
        const perStyleOk = shownAt.every((shown: string[]) => {
          const n = got.filter((d) => shown.includes(d)).length;
          return n <= (multi ? 2 : 1) && (n >= 1 || shown.length === 0);
        });
        if (!perStyleOk) return false;
      }
    }
    const dietary = fill.next.dietaryData;
    return (
      notes <= 2 &&
      dietary.status === 'confirmed_needs' &&
      dietary.requirements.length >= 1 &&
      dietary.requirements.length <= 3 &&
      dietary.requirements.every((r: string) => DIETARY.includes(r)) &&
      new Set(dietary.requirements).size === dietary.requirements.length &&
      SET_UPS.includes(fill.next.setUpData.freeText) &&
      CLEAN_UPS.includes(fill.next.cleanUpData.freeText) &&
      fill.next.otherJobsOtherData.freeText === '' &&
      fill.next.otherNotes === '' &&
      JSON.stringify([...(fill.opened ?? [])].sort()) === JSON.stringify([...expectOpened].sort())
    );
  },
  /** A6 — the button: filled accent, larger, in a soft tinted box with W24. */
  answersButton(html: string) {
    const box = html.match(/^<div data-typical-answers="" class="([^"]*)">/);
    const btn = html.match(/<button[^>]*class="([^"]*)"[^>]*>([^<]*)<\/button>/);
    const cls = (btn?.[1] ?? '').split(/\s+/);
    return (
      !!box &&
      /\bbg-sage-(50|100)\b/.test(box[1]) &&
      !!btn &&
      btn[2] === W23 &&
      ['bg-accent', 'text-white', 'w-full'].every((c) => cls.includes(c)) &&
      cls.some((c) => /^text-(base|lg)$/.test(c)) &&
      html.indexOf(W24) > html.indexOf(`>${W23}</button>`)
    );
  },
  /** A6 — the questions: the button at their top, before the kind question; it opens what it filled. */
  answersPlace(modal: string) {
    const strip = modal.indexOf('<MomentArc currentMoment={2}');
    const button = modal.indexOf('<TypicalAnswersButton');
    const kinds = modal.indexOf('What kind of event are you planning?');
    const fill = bodyFrom(modal, 'const fillTypical = (): ');
    return (
      strip > 0 &&
      button > strip &&
      kinds > button &&
      (modal.match(/<TypicalAnswersButton\b/g) ?? []).length === 1 &&
      /sample\s*&&\s*\(?\s*<TypicalAnswersButton/.test(modal) &&
      /fillTypicalAnswers\(state\)/.test(fill) &&
      /setOpenSections\(\(prev\) => \[\s*\.\.\.prev,\s*\.\.\.filled\.opened\.filter\(\(id\) => !prev\.includes\(id\)\)\s*\]\)/.test(
        fill
      ) &&
      /if \(filled\.openMore\) setShowAdditionalCategories\(true\)/.test(fill) &&
      !/handleGenerate|onGenerate|finalize-plan/.test(fill)
    );
  },
  /** P1 — the rows, joined as "{section}: {picked and typed}", are the summary's lines, in order. */
  rowsAreLines(rows: any[], lines: string[]) {
    const asLine = (r: any) =>
      r.kind === 'line' ? r.text : `${r.section}: ${[...r.picked, ...r.notes].join(', ')}`;
    return (
      Array.isArray(rows) &&
      rows.length === lines.length &&
      rows.every((r, i) => asLine(r) === lines[i])
    );
  },
  /** P5 — the table: the three headers in a header row, one table row per row, a line across three. */
  tableDrawn(html: string, rows: any[]) {
    const table = html.match(/^<table data-picks-table="" class="([^"]*)">/);
    const ths = [...html.matchAll(/<th\b[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]);
    const body = html.slice(html.indexOf('<tbody>'));
    const trs = body.match(/<tr\b/g) ?? [];
    const lines = rows.filter((r) => r.kind === 'line').length;
    return (
      !!table &&
      /\bw-full\b/.test(table[1]) &&
      /\btable-fixed\b/.test(table[1]) &&
      html.indexOf('<thead>') > 0 &&
      html.indexOf('<thead>') < html.indexOf('<tbody>') &&
      JSON.stringify(ths) === JSON.stringify(HEADERS) &&
      /class="[^"]*\buppercase\b/.test(
        html.slice(html.indexOf('<thead>'), html.indexOf('</thead>'))
      ) &&
      trs.length === rows.length &&
      (body.match(/<td colSpan="3"/g) ?? []).length === lines &&
      (body.match(/<td\b/g) ?? []).length === lines + 3 * (rows.length - lines) &&
      (body.match(/<td\b[^>]*class="[^"]*\bbreak-words\b/g) ?? []).length ===
        (body.match(/<td\b/g) ?? []).length
    );
  },
  /** P6 — the questions draw the table from picksRows, under its heading, above the bar. */
  modalTable(modal: string) {
    const fn = modal.indexOf('export function PicksTable');
    const use = modal.indexOf('<PicksTable rows={');
    const call = modal.indexOf('picksRows(');
    return (
      fn > modal.indexOf('function FoodOptionTreeAccordion') &&
      fn < modal.indexOf('function NotesAccordion') &&
      call > 0 &&
      call < modal.indexOf('function FoodOptionTreeAccordion') &&
      /renderableFoodCategories/.test(modal.slice(call, call + 600)) &&
      /additionalFoodCategories/.test(modal.slice(call, call + 600)) &&
      use > modal.indexOf('{PICKS_WORDS.HEADING}') &&
      use < modal.indexOf('fixed bottom-0 left-0 right-0') &&
      !/picksSummary\(/.test(modal) &&
      !/picksLines\.map/.test(modal)
    );
  },
  /** M1 — step 4 in its fixed order: the message first, then the notes, then the controls. */
  stepFourOrder(src: string) {
    const msg = src.slice(Math.max(0, src.indexOf('function MessageStep')));
    const at = STEP4_ORDER.map((m) => msg.indexOf(m));
    return (
      src.indexOf('function MessageStep') > 0 &&
      at.every((i) => i >= 0) &&
      at.every((i, k) => k === 0 || i > at[k - 1])
    );
  },
  /** M2 — the message is one email box: the subject, then each movement with its voice, then the opt-out line. */
  emailBlock(src: string) {
    const msg = src.slice(Math.max(0, src.indexOf('function MessageStep')));
    const box = msg.indexOf('data-message-email=""');
    const end = msg.indexOf('current.segments !== null', box);
    const block = box > 0 && end > box ? msg.slice(box, end) : '';
    const subj = block.indexOf('{current.subject}');
    const moves = block.indexOf('current.ask.movements.map');
    return (
      block.length > 0 &&
      /className="[^"]*\boverflow-hidden\b/.test(block) &&
      subj > 0 &&
      moves > subj &&
      block.includes("m.voice === 'HOST' ? 'Your voice' : 'Gather'") &&
      /\{OPT_OUT_LINE\}/.test(block) &&
      block.indexOf('{OPT_OUT_LINE}') > moves &&
      />\s*Gather\s*</.test(block.slice(moves)) &&
      /className="[^"]*\bwhitespace-pre-wrap\b[^"]*"[^>]*>\s*\{m\.text\}/.test(block) &&
      (msg.match(/<h3 className=/g) ?? []).length === 3
    );
  },
  /** M5 — no new words: every quoted word and every line of text in step 4 was there before. */
  noNewWords(now: string, head: string) {
    const words = (src: string) => {
      const msg = src.slice(Math.max(0, src.indexOf('function MessageStep')));
      const quoted = [...msg.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map((m) => m[1]);
      const text = [...msg.matchAll(/>([^<>{}]*[A-Za-z][^<>{}]*)</g)].map((m) =>
        m[1].replace(/\s+/g, ' ').trim()
      );
      return new Set([...quoted, ...text].filter((w) => /[A-Za-z]/.test(w)));
    };
    const before = words(head);
    const after = words(now);
    return before.size > 20 && [...after].every((w) => before.has(w));
  },
  /** B6 — Who I chase: the host's household card wears it with the pill; another's does not. */
  chaseCards(html: string, host: string, other: string) {
    const card = (name: string) => {
      const at = html.indexOf(`>${name}’s household`);
      return at < 0
        ? ''
        : html.slice(html.lastIndexOf('<section', at), html.indexOf('</section>', at));
    };
    const h = card(host);
    const o = card(other);
    const tag = (c: string) => c.slice(0, c.indexOf('>') + 1);
    return (
      h.length > 0 &&
      o.length > 0 &&
      tag(h).includes(HOST_TINT) &&
      tag(h).includes(HOST_BORDER) &&
      !tag(h).includes('bg-white') &&
      h.includes(HOST_PILL_HTML) &&
      tag(o).includes('bg-white') &&
      !tag(o).includes(HOST_TINT) &&
      !o.includes(HOST_PILL_HTML)
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ── Fixtures, hand-written ───────────────────────────────────────────────────
const household = (id: string, name: string, isHostHousehold: boolean) => ({
  id,
  primaryContact: { name },
  helpers: [],
  littleCount: 0,
  guests: [],
  isHostHousehold,
});
const boardPerson = (over: Record<string, unknown>) => ({
  personEventId: `pe-${String(over.name).replace(/\W/g, '')}`,
  personId: `p-${String(over.name).replace(/\W/g, '')}`,
  name: 'Someone',
  isHost: false,
  householdRole: 'GUEST',
  state: 'GREEN',
  reasons: ['ACCEPTED'],
  nextNudgeAt: null,
  items: [],
  ...over,
});
const glance = (hostUnhoused: boolean) => ({
  eventId: 'e-gtc394',
  hostPersonId: 'p-KateWalker',
  asOf: '2026-10-19T00:00:00.000Z',
  summary: { needYou: 0, withGather: 0, settled: 3 },
  households: hostUnhoused
    ? [
        {
          householdId: 'hh-other',
          primaryContactName: 'Tom Brennan',
          isHostHousehold: false,
          members: [boardPerson({ name: 'Tom Brennan' })],
        },
      ]
    : [
        {
          householdId: 'hh-host',
          primaryContactName: 'Kate Walker',
          isHostHousehold: true,
          members: [boardPerson({ name: 'Kate Walker', isHost: true })],
        },
        {
          householdId: 'hh-other',
          primaryContactName: 'Tom Brennan',
          isHostHousehold: false,
          members: [boardPerson({ name: 'Tom Brennan' })],
        },
      ],
  unhoused: hostUnhoused
    ? [boardPerson({ name: 'Kate Walker', isHost: true, householdRole: null })]
    : [boardPerson({ name: 'Bob Loner', householdRole: null })],
  unassignedCritical: [],
  unassignedOrdinaryCount: 0,
});
const member = (over: Record<string, unknown>) => ({
  personEventId: `pe-${String(over.name).replace(/\W/g, '')}`,
  personId: `p-${String(over.name).replace(/\W/g, '')}`,
  name: 'Someone',
  email: null,
  phone: null,
  householdRole: 'PRIMARY_CONTACT',
  isYoungPerson: false,
  messageable: true,
  markable: true,
  nudgeMark: null,
  ...over,
});

// ══ Tweak 1 (a) ══════════════════════════════════════════════════════════════
async function layerH() {
  section('H — tweak 1 (a): the host’s card, one shared definition, eight places');
  const HC = await load('../src/components/shared/HostCard');
  const HCL = await load('../src/components/plan/HouseholdCardList');
  const GB = await load('../src/components/glance/GlanceBoard');
  const MR = await load('../src/components/preflight/mark-rows');

  assert(
    'H',
    'H1 one shared definition in src/components/shared/HostCard.tsx: the card’s tint and border, the pill, no hook',
    CHECKS.hostCardFile(code(HOST_CARD_FILE))
  );
  assert(
    'H',
    'H2 the "You" pill, made stronger: filled accent, white text, the word "You"',
    !!HC?.HostPill && render(createElement(HC.HostPill)) === HOST_PILL_HTML,
    HC?.HostPill ? render(createElement(HC.HostPill)) : 'no HostPill'
  );
  PLACES.forEach((p, n) =>
    assert(
      'H',
      `H${n + 3} ${p.name} use it, behind the flag the screen already holds (${p.flags.join(', ')})`,
      CHECKS.usesHostCard(code(p.file), p.flags, p.pill) &&
        (p.file.endsWith('pre-flight/page.tsx') ? CHECKS.preflightRow(code(p.file)) : true)
    )
  );

  const cards = HCL?.default
    ? render(
        createElement(HCL.default, {
          households: [
            household('hh1', 'Kate Walker', true),
            household('hh2', 'Tom Brennan', false),
          ],
          onEdit: () => {},
          onDelete: async () => {},
        })
      )
    : '';
  assert(
    'H',
    'H10 Moment 1: the host’s card wears it, another household’s does not, and the "You" pill is still there',
    CHECKS.householdCards(cards, 'Kate Walker', 'Tom Brennan'),
    cards.slice(0, 400)
  );

  const board = (g: any) =>
    GB?.default
      ? render(
          createElement(GB.default, {
            glance: g,
            eventName: 'The Walker barbecue',
            actorRole: 'HOST',
            eventDate: 'Saturday 14 November',
          })
        )
      : '';
  const housed = board(glance(false));
  const unhoused = board(glance(true));
  assert(
    'H',
    'H11 the board: the host’s household card wears it with the pill; another household’s does not',
    CHECKS.boardCards(housed, 'hh-host', 'hh-other')
  );
  assert(
    'H',
    'H12 the board’s "Not in a household" card wears it only when the host is in it',
    CHECKS.unhousedCard(unhoused, housed)
  );

  const rows = MR?.MarkRows
    ? render(
        createElement(MR.MarkRows, {
          members: [
            member({ name: 'Kate Walker', markable: false }),
            member({ name: 'Tom Brennan' }),
          ],
          channelPersonEventId: null,
          pace: null,
          onMark: () => {},
        })
      )
    : '';
  assert(
    'H',
    'H13 the pre-flight mark rows: the host’s row wears it with the pill and keeps its line; another’s does not',
    CHECKS.markRows(rows, 'Kate Walker', 'Tom Brennan')
  );
  assert(
    'H',
    'H14 CONTROL: AccordionShell is not edited (preflight-fold R7 pins its markup; no new prop)',
    unchangedSinceHead(['src/components/plan/AccordionShell.tsx']) &&
      read('src/components/plan/AccordionShell.tsx').length > 0
  );
}

// ══ Tweak 2 ══════════════════════════════════════════════════════════════════
const atTag = (rel: string) => {
  const r = spawnSync('git', ['show', `demo-ab-good:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  return r.status === 0 ? r.stdout : '';
};
/** The old offering rule, written out by hand from Moment 2's opening at `demo-ab-good`. */
const oldRule = (c: {
  sent: boolean;
  hasSetup: boolean;
  invitesOnly: boolean;
  planWaiting: boolean;
}) => ({
  // onInvitesOnly={offerInvitesOnly ? ... : undefined}, offerInvitesOnly = !event.sentAt
  invitesOnly: !c.sent,
  // onOwnPlan={offerInvitesOnly && event.setup ? ...}, then hidden while planWaiting (invitesOnly && planWaiting)
  ownPlan: !c.sent && c.hasSetup && !(c.invitesOnly && c.planWaiting),
});

async function layerO() {
  section('O — tweak 2: the transition pages, much simpler; the two choices in the questions');
  const OT = await load('../src/lib/moments/opening-titles');
  const SO = await load('../src/components/plan/SetupOpeningScreen');
  const M2 = await load('../src/components/plan/Moment2Opening');
  const OP = await load('../src/lib/setup/own-plan');

  assert(
    'O',
    'O1 the titles are the strip’s own first three labels (the third for Moment 3’s opening, GTC-399 item 2), read from MomentArc.tsx as it stands',
    CHECKS.titlesMatchArc(read(TITLES_FILE), read(ARC_FILE)) &&
      OT?.OPENING_TITLES?.[1] === TITLE_1 &&
      OT?.OPENING_TITLES?.[2] === TITLE_2 &&
      OT?.OPENING_TITLES?.[3] === TITLE_3
  );
  assert(
    'O',
    'O2 CONTROL: MomentArc.tsx is not edited (batch14 Z2 guards it)',
    read(ARC_FILE).length > 0 &&
      spawnSync('git', ['diff', '--quiet', 'demo-ab-good', '--', ARC_FILE], { cwd: ROOT })
        .status === 0
  );
  const one = SO?.default ? render(createElement(SO.default, { onStart: () => {} })) : '';
  assert(
    'O',
    'O3 Moment 1’s page: the strip above the title (GTC-399 item 1), the title, the herd line under it (GTC-396 item 1), the two paragraphs and one button',
    CHECKS.openingPage(one, 1, TITLE_1, START_1, false),
    one.slice(0, 500)
  );
  const two = (over: Record<string, unknown> = {}) =>
    M2?.default
      ? render(
          createElement(M2.default, {
            eventName: 'The Walker barbecue',
            onStart: () => {},
            onBack: () => {},
            // Props the page used to pass: a page that still passed them shows nothing for them.
            onInvitesOnly: () => {},
            onOwnPlan: () => {},
            ownPlanExists: true,
            ...over,
          } as any)
        )
      : '';
  const idle = two();
  assert(
    'O',
    'O4 Moment 2’s page: the strip above the title (GTC-399 item 1), the title, the two paragraphs and one button, and its way back; no choices',
    CHECKS.openingPage(idle, 2, TITLE_2, START_2, true),
    idle.slice(0, 500)
  );
  const waiting = two({ planWaiting: true });
  const notHost = two({ invitesOnlyState: 'not-host' });
  const failedStart = two({ invitesOnlyState: 'failed' });
  assert(
    'O',
    'O5 the main button’s own words stay under it, under the same conditions: the plan put away, not the host, it failed',
    CHECKS.mainButtonWords(waiting, notHost, failedStart, idle)
  );
  const cases: Array<{
    sent: boolean;
    hasSetup: boolean;
    invitesOnly: boolean;
    planWaiting: boolean;
  }> = [];
  for (const sent of [false, true])
    for (const hasSetup of [false, true])
      for (const invitesOnly of [false, true])
        for (const planWaiting of [false, true])
          cases.push({ sent, hasSetup, invitesOnly, planWaiting });
  const sameRule =
    typeof OP?.quietChoices === 'function' &&
    cases.every((c) => JSON.stringify(OP.quietChoices(c)) === JSON.stringify(oldRule(c)));
  assert(
    'O',
    'O6 the rule for offering the two choices is the old one, over all 16 hand-written cases',
    sameRule
  );
  assert(
    'O',
    'O7 the questions offer them at their foot, above the bar: the same words, lines and states, through the page’s handlers',
    CHECKS.modalChoices(code(MODAL))
  );
  const MOD = await load('../src/components/plan/Moment2Step1Modal');
  const choices = (over: Record<string, unknown>) =>
    MOD?.QuietChoices
      ? render(
          createElement(MOD.QuietChoices, {
            onOwnPlan: () => {},
            onInvitesOnly: () => {},
            ...over,
          })
        )
      : '';
  assert(
    'O',
    'O10 the choices on the questions, rendered: W1 then its line, then invites only and its line; each state says its own words',
    CHECKS.choicesRendered(
      choices({}),
      choices({ ownPlanState: 'failed' }),
      choices({ ownPlanState: 'not-host' }),
      choices({ ownPlanExists: true }),
      choices({ invitesOnlyState: 'working' })
    )
  );
  assert(
    'O',
    'O8 the setup page: the questions get both choices under the one rule; the opening pages get neither, and get their Moment’s doors (GTC-399 item 1); the handlers are as they were',
    CHECKS.setupWiring(code(SETUP), stripComments(atTag(SETUP)))
  );
  assert(
    'O',
    'O9 the two opening components hold one strip above the title with their Moment’s props (GTC-399 item 1) and no quieter choice, the herd line on Moment 1’s only (GTC-396 item 1); the main button’s words and the way back stay',
    CHECKS.openingSources(code(OPENING_1), code(OPENING_2))
  );
}

// ══ Tweak 3 ══════════════════════════════════════════════════════════════════
async function layerD() {
  section('D — tweak 3: the first page, two buttons; Sarah on the board');
  /** The page as a build for `env` draws it (the copy button is development-only, GTC-392 Q5). */
  const draw = (env: string) => {
    const was = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = env;
    try {
      return render(createElement(ToastProvider as any, null, createElement(DemoPage)));
    } finally {
      (process.env as any).NODE_ENV = was;
    }
  };
  const dev = draw('development');
  const prod = draw('production');
  assert(
    'D',
    'D1 on the founder’s Mac (development): the heading "Gather" and one button, "Try it yourself", and nothing else (GTC-395: "Sarah demo" goes)',
    CHECKS.demoPage(dev, true),
    dev.slice(0, 400)
  );
  assert(
    'D',
    'D2 in a production build: the heading and no button (GTC-395: "Sarah demo" goes; the copy button waits for part D)',
    CHECKS.demoPage(prod, false),
    prod.slice(0, 400)
  );
  assert(
    'D',
    'D3 the copy door, development-only, opens the sample’s own page (GTC-395 item 3); the Sarah door gone (GTC-395); no tokens fetch, no Reset',
    CHECKS.demoSource(code(DEMO_PAGE))
  );
  assert(
    'D',
    'D4 CONTROL: the session, tokens and reset routes are not edited (the reset route stays, development-only)',
    DEMO_ROUTES.every((f) => read(f).length > 0) &&
      spawnSync('git', ['diff', '--quiet', 'demo-ab-good', '--', ...DEMO_ROUTES], { cwd: ROOT })
        .status === 0
  );
}

// ══ Tweak 4 ══════════════════════════════════════════════════════════════════
async function layerK() {
  section('K — tweak 4: "Add a crowd", much more obvious');
  const CB = await load('../src/components/demo/CrowdButton');
  const HCL = await load('../src/components/plan/HouseholdCardList');
  const crowd = (state: string) =>
    CB?.default ? render(createElement(CB.default, { state, onAdd: () => {} })) : '';
  assert(
    'K',
    'K1 the button is filled accent, full width and larger, in a soft tinted box with its line',
    CHECKS.crowdButton(crowd('idle')),
    crowd('idle').slice(0, 400)
  );
  const list = HCL?.default
    ? render(
        createElement(HCL.default, {
          households: [
            household('hh1', 'Kate Walker', true),
            household('hh2', 'Tom Brennan', false),
          ],
          onEdit: () => {},
          onDelete: async () => {},
          top: createElement('div', { 'data-gtc394-top': '' }, 'TOP'),
        })
      )
    : '';
  assert(
    'K',
    'K2 the household list takes what goes at its top: directly under its heading "Ducks in a row so far", above the households',
    CHECKS.listTop(list, 'data-gtc394-top', 'Kate Walker')
  );
  assert(
    'K',
    'K3 the setup page puts it there on a computer; on a phone it stays where it is, below the form; still for a copy only',
    CHECKS.setupCrowdPlace(code(SETUP))
  );
  assert(
    'K',
    'K4 its states say what they said: W18 while it works (greyed), W21 if it failed, W19 once done, W20 if already there',
    CHECKS.crowdStates(crowd('working'), crowd('failed'), crowd('done'), crowd('already'))
  );
}

// ══ Tweak 5 ══════════════════════════════════════════════════════════════════
async function layerA() {
  section(
    'A — tweak 5: "Fill in typical answers": obvious, it opens what it fills, random, a note'
  );
  const TA = await load('../src/lib/demo/typical-answers');
  const CL = await load('../src/lib/ai/config-loader');
  const TB = await load('../src/components/demo/TypicalAnswersButton');
  const fill = (state: any, src?: () => number) =>
    TA?.fillTypicalAnswers ? TA.fillTypicalAnswers(state, src) : null;
  const levelsFor = (kind: string) => (key: string) => CL?.getCategoryLevels(kind, key) ?? null;
  const picksOf = (s: any, key: string) =>
    key === 'mains' ? s?.mainsData?.selections : s?.extendedCategoriesData?.[key]?.selections;

  const a = fill(blankQuestions(), seeded(7));
  const b = fill(blankQuestions(), seeded(8));
  const a2 = fill(blankQuestions(), seeded(7));
  assert(
    'A',
    'A1 two different hand-written sequences give different fills',
    !!a?.next && !!b?.next && JSON.stringify(a.next) !== JSON.stringify(b.next)
  );
  assert(
    'A',
    'A2 the same sequence gives the same fill, and opens the same sections',
    !!a?.next &&
      JSON.stringify(a.next) === JSON.stringify(a2?.next) &&
      JSON.stringify(a.opened) === JSON.stringify(a2?.opened)
  );

  const OPENED_BBQ = [...BBQ_FILLED, 'dietary', 'setUp', 'cleanUp'];
  let sound = 0;
  let casual = 0;
  const seen = {
    noNote: 0,
    twoNotes: 0,
    oneStyle: 0,
    twoStyles: 0,
    twoDishes: 0,
    oneNeed: 0,
    threeNeeds: 0,
  };
  const jobs = new Set<string>();
  for (let seed = 1; seed <= 240; seed++) {
    const f = fill(blankQuestions(), seeded(seed));
    if (CHECKS.fillIsSound(f, levelsFor('Casual BBQ'), BBQ_FILLED, OPENED_BBQ)) sound++;
    if (f?.next?.eventType === 'Casual BBQ' && f.openMore === true) casual++;
    const notes = BBQ_FILLED.filter(
      (k) => (picksOf(f?.next, k)?.[0]?.freeText ?? '') !== ''
    ).length;
    if (notes === 0) seen.noNote++;
    if (notes === 2) seen.twoNotes++;
    const styles = BBQ_FILLED.map((k) => picksOf(f?.next, k)?.[0]?.options?.length ?? 0);
    if (styles.includes(1)) seen.oneStyle++;
    if (styles.includes(2)) seen.twoStyles++;
    if (BBQ_FILLED.some((k) => (picksOf(f?.next, k)?.[1]?.options?.length ?? 0) >= 2))
      seen.twoDishes++;
    const needs = f?.next?.dietaryData?.requirements?.length ?? 0;
    if (needs === 1) seen.oneNeed++;
    if (needs === 3) seen.threeNeeds++;
    jobs.add(`${f?.next?.setUpData?.freeText}|${f?.next?.cleanUpData?.freeText}`);
  }
  assert(
    'A',
    'A3 over 240 hand-written sequences on a blank page: every pick one the questions offer, at most two notes, Dietary one to three from the list, each job one of its three; no kind picks Casual BBQ',
    sound === 240 && casual === 240,
    `sound ${sound}/240, Casual BBQ ${casual}/240`
  );
  assert(
    'A',
    'A4 and it is random, not the first choice: across them, one and two styles, two dishes, no note and two notes, one and three needs, and more than three pairs of jobs all occur',
    Object.values(seen).every((n) => n > 0) && jobs.size > 3,
    `${JSON.stringify(seen)}, job pairs ${jobs.size}`
  );

  const hers = () => {
    const q = blankQuestions();
    q.eventType = 'Casual BBQ';
    q.mainsData = {
      items: [],
      stillDeciding: false,
      selections: {
        0: { options: ['Seafood on the grill'], freeText: 'Her own note' },
        1: { options: ['Prawns'], freeText: '' },
      },
    };
    q.extendedCategoriesData = { sides_salads: { selections: {}, stillDeciding: true } };
    q.dietaryData = { status: 'confirmed_none', requirements: [], other: '' };
    q.setUpData = { freeText: 'Her own words', stillDeciding: false };
    return q;
  };
  let untouched = 0;
  for (let seed = 1; seed <= 240; seed++) {
    const f = fill(hers(), seeded(seed));
    const n = f?.next;
    const rest = ['dessert', 'drinks_alcoholic', 'drinks_non_alcoholic', 'table_snacks'];
    if (
      JSON.stringify(n?.mainsData?.selections) === JSON.stringify(hers().mainsData.selections) &&
      n?.extendedCategoriesData?.sides_salads?.stillDeciding === true &&
      JSON.stringify(n?.extendedCategoriesData?.sides_salads?.selections) === '{}' &&
      n?.dietaryData?.status === 'confirmed_none' &&
      n?.dietaryData?.requirements?.length === 0 &&
      n?.setUpData?.freeText === 'Her own words' &&
      CLEAN_UPS.includes(n?.cleanUpData?.freeText) &&
      rest.every((k) => (picksOf(n, k)?.[0]?.options?.length ?? 0) > 0) &&
      rest.filter((k) => (picksOf(n, k)?.[0]?.freeText ?? '') !== '').length <= 2 &&
      JSON.stringify([...(f?.opened ?? [])].sort()) === JSON.stringify([...rest, 'cleanUp'].sort())
    )
      untouched++;
  }
  assert(
    'A',
    'A5 over 240 sequences, a section she answered (or is still deciding) is never touched, gets no note and is not opened',
    untouched === 240,
    `${untouched}/240`
  );

  const FOOD = [
    'entree_starters',
    'mains',
    'sides_salads',
    'dessert',
    'cake',
    'drinks_alcoholic',
    'drinks_non_alcoholic',
    'table_snacks',
    'breakfast_brunch',
  ];
  const xmasUp = FOOD.filter(
    (k) => (CL?.getUpFrontCategories('Christmas') ?? []).includes(k) && !!levelsFor('Christmas')(k)
  );
  let xmasSound = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const q = blankQuestions();
    q.eventType = 'Christmas';
    const f = fill(q, seeded(seed));
    if (
      f?.next?.eventType === 'Christmas' &&
      f.openMore === false &&
      CHECKS.fillIsSound(f, levelsFor('Christmas'), xmasUp, [
        ...xmasUp,
        'dietary',
        'setUp',
        'cleanUp',
      ])
    )
      xmasSound++;
  }
  assert(
    'A',
    'A6 another kind (Christmas) keeps its kind; over 60 sequences each of its up-front food questions gets sound random picks',
    xmasUp.length > 0 && xmasSound === 60,
    `${xmasSound}/60 over ${xmasUp.join(',')}`
  );
  const full = fill(blankQuestions(), seeded(3));
  assert(
    'A',
    'A7 still: with nothing left empty it fills nothing (W26), whatever the sequence',
    !!full?.next && fill(full.next, seeded(11)) === null && fill(full.next) === null
  );
  const button = TB?.default ? render(createElement(TB.default, { onFill: () => 'filled' })) : '';
  assert(
    'A',
    'A8 the button: filled accent, larger, in a soft tinted box with its line',
    CHECKS.answersButton(button),
    button.slice(0, 300)
  );
  assert(
    'A',
    'A9 the questions: the button at their top, on a sample only; a fill opens every section it filled (and "Show more"), closes nothing, and never presses Generate',
    CHECKS.answersPlace(code(MODAL))
  );
  const TAsrc = code(TYPICAL_FILE);
  assert(
    'A',
    'A10 the random source is an argument, Math.random by default; the module reaches no sender, token, database or AI call',
    /random:\s*RandomSource\s*=\s*Math\.random/.test(TAsrc) &&
      !/from '@\/lib\/(press|sms|email|live-sends|tokens|prisma)['/]|from '@\/lib\/ai\/(claude|generate)['/]|callClaude|fetch\(/.test(
        TAsrc
      )
  );
  assert(
    'A',
    'A11 the words: the six notes, the four new job sentences, W27 and W28 kept first',
    JSON.stringify(TA?.TYPICAL_NOTES) === JSON.stringify(NOTES) &&
      JSON.stringify(TA?.TYPICAL_SET_UP) === JSON.stringify(SET_UPS) &&
      JSON.stringify(TA?.TYPICAL_CLEAN_UP) === JSON.stringify(CLEAN_UPS) &&
      TA?.TYPICAL_WORDS?.SET_UP === SET_UPS[0] &&
      TA?.TYPICAL_WORDS?.CLEAN_UP === CLEAN_UPS[0]
  );
}

// ══ Tweak 6 ══════════════════════════════════════════════════════════════════
async function layerP() {
  section('P — tweak 6: "What you’ve picked" as a table, like the print');
  const PS = await load('../src/lib/moments/picks-summary');
  const MOD = await load('../src/components/plan/Moment2Step1Modal');
  const rows = (c: any) => (PS?.picksRows ? PS.picksRows(c) : null);
  assert(
    'P',
    'P1 the rows follow picksSummary’s own order and words, for three hand-written cases (picks with a note, nothing yet, nothing picked)',
    !!PS?.picksSummary &&
      [CASE_PICKS, CASE_NOTHING, CASE_NOTHING_IN].every((c: any) =>
        CHECKS.rowsAreLines(rows(c) as any, PS.picksSummary(c))
      )
  );
  const r1 = (rows(CASE_PICKS) as any[]) ?? [];
  assert(
    'P',
    'P2 Dietary is the first row; a section still deciding keeps its words (W6) in the picked column; what was typed is in the notes column',
    r1[0]?.kind === 'row' &&
      r1[0]?.section === '⚠️ Dietary requirements' &&
      r1.some(
        (r) =>
          r.section === '🥗 Sides & Salads' && JSON.stringify(r.picked) === JSON.stringify([W6])
      ) &&
      r1.some(
        (r) =>
          r.section === '🍖 Mains' &&
          JSON.stringify(r.notes) === JSON.stringify(['“No pork, if we can.”']) &&
          JSON.stringify(r.picked) ===
            JSON.stringify(['Classic sausage sizzle (Beef sausages, Chicken sausages)'])
      )
  );
  const r2 = (rows(CASE_NOTHING) as any[]) ?? [];
  const r3 = (rows(CASE_NOTHING_IN) as any[]) ?? [];
  assert(
    'P',
    'P3 nothing picked yet (W9) and nothing picked in the always-planned sections (W8) sit in the table, each a line across it',
    r2.length === 2 &&
      r2[1]?.kind === 'line' &&
      r2[1]?.text === W9 &&
      r3.length === 2 &&
      r3[1]?.kind === 'line' &&
      r3[1]?.text === CASE_NOTHING_IN_LINES[1]
  );
  assert(
    'P',
    'P4 CONTROL: picksSummary is kept exactly: its code as at demo-ab-good, and its lines as written by hand for the three cases',
    !!PS?.picksSummary &&
      squash(bodyFrom(code(PICKS_FILE), 'export function picksSummary(')) ===
        squash(bodyFrom(stripComments(atTag(PICKS_FILE)), 'export function picksSummary(')) &&
      bodyFrom(code(PICKS_FILE), 'export function picksSummary(').length > 200 &&
      JSON.stringify(PS.picksSummary(CASE_PICKS)) === JSON.stringify(CASE_PICKS_LINES) &&
      JSON.stringify(PS.picksSummary(CASE_NOTHING)) === JSON.stringify(CASE_NOTHING_LINES) &&
      JSON.stringify(PS.picksSummary(CASE_NOTHING_IN)) === JSON.stringify(CASE_NOTHING_IN_LINES)
  );
  const drawn = MOD?.PicksTable ? render(createElement(MOD.PicksTable, { rows: r1 })) : '';
  const drawnNothing = MOD?.PicksTable ? render(createElement(MOD.PicksTable, { rows: r2 })) : '';
  assert(
    'P',
    'P5 the screen draws a table: "Section", "Picked", "Notes" in an upper-case header row, a row per row, fixed columns that wrap',
    CHECKS.tableDrawn(drawn, r1) && CHECKS.tableDrawn(drawnNothing, r2),
    drawn.slice(0, 300)
  );
  assert(
    'P',
    'P6 the questions draw it from picksRows, from their own two lists, under "What you’ve picked" and above the bar',
    CHECKS.modalTable(code(MODAL))
  );
  assert(
    'P',
    'P7 the headers: "Section" is Find a dish’s own word; "Picked" and "Notes" are the founder’s',
    JSON.stringify(PS?.PICKS_TABLE_WORDS) ===
      JSON.stringify({ SECTION: 'Section', PICKED: 'Picked', NOTES: 'Notes' }) &&
      /SECTION:\s*MENU_WORDS\.SECTION/.test(code(PICKS_FILE))
  );
}

// ══ Tweak 7 ══════════════════════════════════════════════════════════════════
async function layerM() {
  section('M — tweak 7: step 4, the message first, simple and the same every time');
  const TM = await load('../src/lib/preflight/tick-memory');
  const pageNow = code(PREFLIGHT);
  const pageHead = stripComments(atTag(PREFLIGHT));
  assert(
    'M',
    'M1 the message comes first, then its notes, then the controls in one fixed order: her line, "Read it as" (with their own nudge choice), the nudge question, the people left to her',
    CHECKS.stepFourOrder(pageNow)
  );
  assert(
    'M',
    'M2 the message is one readable email: its subject, then the text, each movement keeping its voice label ("Your voice", "Gather"), the opt-out line last; no new heading',
    CHECKS.emailBlock(pageNow)
  );
  const effect = (src: string) => {
    const m = src.match(
      /useEffect\(\(\) => \{\s*if \(data\) onPrint\(printOf\(data\)\);\s*\}, \[data, onPrint\]\);/
    );
    return m ? m[0] : '';
  };
  assert(
    'M',
    'M3 what step 4 fingerprints and ticks is as before: the same onPrint(printOf(data)), its stored and tick modules not edited, and its composing module differing by the two HAND_TO_HOST labels only (GTC-396 item 7)',
    effect(pageNow).length > 0 &&
      effect(pageNow) === effect(pageHead) &&
      spawnSync(
        'git',
        ['diff', '--quiet', 'demo-ab-good', '--', ...STEP4_LIBS.filter((f) => f !== COMPOSE_LIB)],
        { cwd: ROOT }
      ).status === 0 &&
      composeDiffersByThePillsOnly()
  );
  const data = {
    storedAuthorLine: 'See you there!',
    recipients: [{ personEventId: 'pe-1', name: 'Tom Brennan', channel: 'EMAIL' }],
    hostList: [{ personEventId: 'pe-2', name: 'June Walker' }],
    chase: { stored: null, resolved: 'BY_EMAIL', byRecipient: {}, notChased: [] },
  };
  const reordered = {
    chase: { notChased: [], byRecipient: {}, resolved: 'BY_EMAIL', stored: null },
    hostList: [{ name: 'June Walker', personEventId: 'pe-2' }],
    recipients: [{ channel: 'EMAIL', name: 'Tom Brennan', personEventId: 'pe-1' }],
    storedAuthorLine: 'See you there!',
  };
  assert(
    'M',
    'M4 the fingerprint is the same for the same inputs (hand-written, keys in any order) and differs when her line differs',
    !!TM?.printOf &&
      TM.printOf(data) === TM.printOf(reordered) &&
      TM.printOf(data) !== TM.printOf({ ...data, storedAuthorLine: 'See you soon!' })
  );
  assert(
    'M',
    'M5 no new words: every word step 4 says was in it before (the three part headings reused)',
    CHECKS.noNewWords(pageNow, pageHead)
  );
}

// ══ Tweak 8 ══════════════════════════════════════════════════════════════════
async function layerS() {
  section('S — tweak 8: the pretend list says "Invite only", and the link goes');
  const PS = await load('../src/lib/demo/pretend-send');
  const PP = await load('../src/components/demo/PretendSend');
  assert(
    'S',
    'S1 someone asked for nothing reads "Name · by email — Invite only", the line’s own separators kept',
    !!PS?.personLine &&
      PS.personLine({ name: 'Grace Liu', channel: 'EMAIL', withChildren: [], brief: 'nothing' }) ===
        `Grace Liu · by email — ${INVITE_ONLY}` &&
      PS.personLine({
        name: 'Hemi Walker',
        channel: 'TEXT',
        withChildren: [],
        brief: 'nothing',
      }) === `Hemi Walker · by text — ${INVITE_ONLY}`
  );
  assert(
    'S',
    'S2 someone asked for something reads as before',
    !!PS?.personLine &&
      PS.personLine({
        name: 'Aroha Ngata',
        channel: 'EMAIL',
        withChildren: ['Mere'],
        brief: 'bring Pavlova',
      }) === 'Aroha Ngata · by email · with Mere — bring Pavlova'
  );
  const list = {
    messages: [
      { name: 'Grace Liu', channel: 'EMAIL', withChildren: [], brief: 'nothing' },
      { name: 'Aroha Ngata', channel: 'EMAIL', withChildren: ['Mere'], brief: 'bring Pavlova' },
    ],
    emailed: 2,
    texted: 0,
    leftToHer: ['June Walker'],
    carrierFor: [],
  };
  const panel = PP?.default ? render(createElement(PP.default, { state: list } as any)) : '';
  assert(
    'S',
    'S3 the panel: the "Invite only" line, the sentence "Each would be the message in step 4, word for word.", and no link or button',
    panel.includes(`Grace Liu · by email — ${INVITE_ONLY}`) &&
      panel.includes('Aroha Ngata · by email · with Mere — bring Pavlova') &&
      panel.includes(W35_SAME) &&
      !/<button\b|<a\b/.test(panel) &&
      !panel.includes('Open step 4'),
    panel.slice(0, 300)
  );
  assert(
    'S',
    'S4 still names only, and it writes nothing: no address or number in the panel; no fetch or sender in either file',
    panel.length > 0 &&
      !/@|\+64|\d{7,}/.test(panel) &&
      [PRETEND_LIB, PRETEND_PANEL].every((f) => {
        const s = code(f);
        return (
          s.length > 0 &&
          !/fetch\(|sendSms|getResendClient|from '@\/lib\/(press|sms|email|tokens|prisma)['/]/.test(
            s
          )
        );
      })
  );
  const pre = code(PREFLIGHT);
  assert(
    'S',
    'S5 the link and its wiring are gone: no OPEN_STEP_4, no onOpenStep4, and the pre-flight hands the panel its list only',
    !!PS?.PRETEND_WORDS &&
      !('OPEN_STEP_4' in PS.PRETEND_WORDS) &&
      PS.PRETEND_WORDS.INVITE_ONLY === INVITE_ONLY &&
      PS.PRETEND_WORDS.SAME === W35_SAME &&
      !/onOpenStep4|OPEN_STEP_4/.test(code(PRETEND_PANEL) + code(PRETEND_LIB) + pre) &&
      /\{pretend && <PretendSend state=\{pretend\} \/>\}/.test(pre)
  );
}

// ══ Tweak 1 (b) ══════════════════════════════════════════════════════════════
async function layerB() {
  section('B — tweak 1 (b): the host’s card in four more places, the same definition');
  const AT = await load('../src/components/preflight/AfterThePress');
  PLACES_B.forEach((p, n) =>
    assert(
      'B',
      `B${n + 1} ${p.name} use it, behind the flag the screen already holds (${p.flags.join(', ')})`,
      CHECKS.usesHostCard(code(p.file), p.flags, true)
    )
  );
  assert(
    'B',
    'B5 nothing new is read: two optional fields on local types only (isHostHousehold on Who I chase’s, isHost on the reachability list’s), no hostId prop on the old board',
    /interface HouseholdView \{[^}]*isHostHousehold\?: boolean;[^}]*\}/.test(
      code(PLACES_B[0].file)
    ) &&
      /interface PersonDetail \{[^}]*isHost\?: boolean;[^}]*\}/.test(code(PLACES_B[2].file)) &&
      !/hostId/.test(code(PLACES_B[3].file)) &&
      spawnSync('git', ['diff', '--quiet', 'HEAD', '--', 'src/app/api'], { cwd: ROOT }).status === 0
  );
  const view = (households: any[]) =>
    AT?.AfterThePressView
      ? render(
          createElement(AT.AfterThePressView, {
            eventName: 'The Walker barbecue',
            sentAt: '2026-10-19T00:00:00.000Z',
            pace: null,
            households,
            unhoused: [],
            chase: null,
            saving: false,
            error: null,
            onMark: () => {},
            onException: () => {},
            onDefault: () => {},
          })
        )
      : '';
  const chase = view([
    {
      id: 'hh-host',
      label: 'Kate Walker',
      resolvedContactPersonEventId: 'pe-KateWalker',
      isHostHousehold: true,
      members: [member({ name: 'Kate Walker', markable: false })],
    },
    {
      id: 'hh-other',
      label: 'Tom Brennan',
      resolvedContactPersonEventId: 'pe-TomBrennan',
      isHostHousehold: false,
      members: [member({ name: 'Tom Brennan' })],
    },
  ]);
  assert(
    'B',
    'B6 Who I chase, rendered: the host’s household card wears it with the pill; another household’s does not',
    CHECKS.chaseCards(chase, 'Kate Walker', 'Tom Brennan'),
    chase.slice(0, 300)
  );
  assert(
    'B',
    'B7 CONTROL: the board’s host strip is left alone (founder ruling) and Moment 1’s summary is not edited (the host is never in its list)',
    LEFT_ALONE_B.every((f) => read(f).length > 0) &&
      spawnSync('git', ['diff', '--quiet', 'HEAD', '--', ...LEFT_ALONE_B], { cwd: ROOT }).status ===
        0 &&
      !code('src/components/glance/GlanceBoard.tsx').includes('person.isHost ?')
  );
}

async function main() {
  await layerH();
  await layerO();
  await layerD();
  await layerK();
  await layerA();
  await layerP();
  await layerM();
  await layerS();
  await layerB();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
