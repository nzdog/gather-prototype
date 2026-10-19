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
  /** O1 — the two titles, the strip's own first two labels, read from MomentArc as it stands. */
  titlesMatchArc(titles: string, arc: string) {
    const label = (n: number) =>
      arc.match(new RegExp(`number:\\s*${n},\\s*label:\\s*"([^"]*)"`))?.[1];
    return (
      label(1) === TITLE_1 &&
      label(2) === TITLE_2 &&
      titles.includes(`1: "${label(1)}"`) &&
      titles.includes(`2: "${label(2)}"`)
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
      STRIP_ONLY.every((w) => !html.includes(w)) &&
      !html.includes('data-moment-strip') &&
      !/herd of cats/.test(html) &&
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
      !/onInvitesOnly=|onOwnPlan=|ownPlanState=|ownPlanExists=|doors=/.test(opening) &&
      opening.includes('planWaiting={invitesOnly && planWaiting}') &&
      opening.includes('invitesOnlyState={invitesOnlyState}') &&
      first.length > 0 &&
      !/doors=/.test(first) &&
      same('const chooseInvitesOnly = async () =>') &&
      same('const writeOwnList = async () =>')
    );
  },
  /** O9 — the two opening components hold no strip, no herd line and no quieter choice. */
  openingSources(one: string, two: string) {
    return (
      one.length > 0 &&
      two.length > 0 &&
      [one, two].every(
        (s) =>
          !s.includes('<MomentArc') &&
          !s.includes('herd of cats') &&
          !s.includes('OWN_PLAN_WORDS') &&
          !s.includes('data-own-plan') &&
          !s.includes('data-invites-only=') &&
          !s.includes('INVITES_ONLY_WORDS.CHOOSE') &&
          !s.includes('INVITES_ONLY_WORDS.EXPLAIN') &&
          s.includes("from '@/lib/moments/opening-titles'")
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
      JSON.stringify(buttons) === JSON.stringify(dev ? [SARAH_DEMO, TRY_IT] : [SARAH_DEMO]) &&
      (html.match(/<button\b/g) ?? []).length === buttons.length &&
      !/<(h2|h3|p|a|section|hr)\b/.test(html) &&
      GONE_FROM_DEMO.every((w) => !html.includes(w))
    );
  },
  /** D3 — the page's code: the two doors, as they were, Sarah to the board; nothing else fetched. */
  demoSource(src: string, head: string) {
    const sarah = bodyFrom(src, 'const handleOpenSarah = async () =>');
    const old = bodyFrom(head, 'const handleOpenDashboard = async () =>');
    const sameCopy =
      bodyFrom(head, 'const handleStartCopy = async () =>').length > 200 &&
      squash(bodyFrom(src, 'const handleStartCopy = async () =>')) ===
        squash(bodyFrom(head, 'const handleStartCopy = async () =>'));
    return (
      sameCopy &&
      old.length > 200 &&
      squash(sarah.replace('handleOpenSarah', 'handleOpenDashboard'))
        .replace(/setOpeningSarah/g, 'setOpeningDashboard')
        .replace('`/plan/${eventId}/glance`', '`/plan/${eventId}`') === squash(old) &&
      sarah.includes("fetch('/api/demo/session', { method: 'POST' })") &&
      sarah.includes('window.location.href = `/plan/${eventId}/glance`;') &&
      /process\.env\.NODE_ENV === 'development' && \(\s*<button\s+onClick=\{handleStartCopy\}/.test(
        src
      ) &&
      (src.match(/fetch\(/g) ?? []).length === 3 &&
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
    'O1 the two titles are the strip’s own first two labels, read from MomentArc.tsx as it stands',
    CHECKS.titlesMatchArc(read(TITLES_FILE), read(ARC_FILE)) &&
      OT?.OPENING_TITLES?.[1] === TITLE_1 &&
      OT?.OPENING_TITLES?.[2] === TITLE_2
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
    'O3 Moment 1’s page: the title, the two paragraphs and one button; no strip, no herd line',
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
    'O4 Moment 2’s page: the title, the two paragraphs and one button, and its way back; no strip, no choices',
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
    'O8 the setup page: the questions get both choices under the one rule; the opening pages get neither; the handlers are as they were',
    CHECKS.setupWiring(code(SETUP), stripComments(atTag(SETUP)))
  );
  assert(
    'O',
    'O9 the two opening components hold no strip, no herd line and no quieter choice; the main button’s words and the way back stay',
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
    'D1 on the founder’s Mac (development): the heading "Gather" and two buttons, "Sarah demo" and "Try it yourself", and nothing else',
    CHECKS.demoPage(dev, true),
    dev.slice(0, 400)
  );
  assert(
    'D',
    'D2 in a production build: the heading and only "Sarah demo" (the copy button waits for part D)',
    CHECKS.demoPage(prod, false),
    prod.slice(0, 400)
  );
  assert(
    'D',
    'D3 the two doors as they were, Sarah’s now opening /plan/{eventId}/glance; no tokens fetch, no Reset',
    CHECKS.demoSource(code(DEMO_PAGE), stripComments(atTag(DEMO_PAGE)))
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

async function main() {
  await layerH();
  await layerO();
  await layerD();
  await layerK();
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
