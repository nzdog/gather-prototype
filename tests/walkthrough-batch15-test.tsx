/**
 * GTC-385 — walkthrough batch 15: the 14 Oct walk's second batch, items 53, 58 and 59.
 *
 * Nigel walked the launch code on 2026-10-14 ("Gather Tweaks 2"). This suite pins the three items
 * to his plan rulings (GTC-385, Q1 to Q12, 2026-10-15):
 *
 *   53  the event date: New Event and Edit Event ask for one "Date", with a link "It runs over more
 *       than one day" that opens "First day" and "Last day" ("Just the one day" closes it); the end
 *       box exists only while it is open, so one date always sends end = start; a backwards pair
 *       reads "The last day can’t be before the first day." (Q1); Edit Event's PATCH and the clone
 *       route refuse a backwards pair with a 400 that writes nothing, a PATCH moving only the start
 *       past the stored end included; Zone 4 and the post-payment route untouched (Q2)
 *   58  a progress bar while Generate plan waits: an estimate that never passes 95 until the plan
 *       has arrived and never goes back, then 100; five stage words on a clock (Q3); a failed or
 *       refused Generate goes back to the questions with the same toast (Q4)
 *   59  dietary marks on dishes: all five (V, VG, GF, DF, NF) exactly as the tags say, from one
 *       reader of the three spellings (Q6); never in the two drinks sections, never on a job (Q7,
 *       Q12); on Moment 2's plan, Moment 3 and the print only (Q8); five ticks in the dish editor
 *       and "+ Add item", food only, saved through the item PATCH that exists (Q9, Q12); the key
 *       and its warning, Moment 3 without "tap a dish" (Q10, Q11)
 *
 * Layers D, P, M and Z run in memory (renders, pure functions and source). Layer C drives the dev
 * server in the walled-off headless Chrome (port 9482) at 1280 and 390, on a fixture of its own
 * (example.com addresses, no phones, nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md and the send wall, proven on probe URLs first. Layer H sends three
 * HTTP requests with the fixture host's session: two PATCHes and a clone, all backwards pairs.
 *
 * THE ONE PRESS (Q5, this suite only): layer G presses "Generate plan →" once. Four walls: (1) an
 * init script answers POST …/finalize-plan inside the page with a stand-in the suite holds open,
 * so the request never leaves the browser; (2) the browser's block still fails finalize-plan and
 * every other plan-making request; (3) the dev server runs with the AI key blanked; (4) after, the
 * fixture's aiCallsUsed is 0 and nothing but the probe was blocked. The dev log is read by hand.
 * The stand-in is answered with a 500, never with a plan.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build. The render checks are the pure functions between the CHECKS markers below, dry-run on
 * a passing and a failing render before RED.
 *
 * GTC385_SHOTS=before|after saves pictures to ~/Desktop/GTC-385 looks; unset, none are taken.
 *
 * Needs the dev server on :3000 and a global WebSocket (NODE_OPTIONS=--experimental-websocket).
 */

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync, readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';

import { prisma } from '../src/lib/prisma';
import { installProviderTrap } from './helpers/provider-trap';
import { openHeadless, type Headless } from './helpers/headless';
import { ToastProvider } from '../src/contexts/ToastContext';
import * as PV from '../src/components/plan/Moment2PlanView';
import * as SK from '../src/components/plan/Moment2Step2Skeleton';
import Moment3AssignView from '../src/components/plan/Moment3AssignView';
import { whenLine } from '../src/components/shared/EventDetails';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9482;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.GTC385_SHOTS ?? '';
const SHOT_DIR = join(homedir(), 'Desktop', 'GTC-385 looks');

let passed = 0;
let failed = 0;
const redAssertions: string[] = [];

function assert(phase: string, label: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m [${phase}] ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m [${phase}] ${label}${detail ? `  (${detail})` : ''}`);
    failed++;
    redAssertions.push(`[${phase}] ${label}`);
  }
}

function ok(fn: () => boolean): boolean {
  try {
    return fn() === true;
  } catch {
    return false;
  }
}

const read = (rel: string) => {
  try {
    return readFileSync(join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};

/** Source with comments removed, so a sentence quoted in a comment is never mistaken for code. */
function codeOnly(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

async function load(rel: string): Promise<any> {
  try {
    return await import(rel);
  } catch {
    return null;
  }
}

/** A render that never throws: an empty string when the component cannot render. */
function render(el: any): string {
  try {
    return renderToStaticMarkup(el);
  } catch (e) {
    console.error('    render threw:', (e as Error).message.split('\n')[0]);
    return '';
  }
}

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
/** True when the path is the same as at HEAD (no staged or unstaged change). */
const unchanged = (rel: string) => git(['diff', '--quiet', 'HEAD', '--', rel]).status === 0;

/** Every file under a directory, relative to the repo. */
function filesUnder(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const p = `${dir}/${f}`;
      if (statSync(join(ROOT, p)).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) out.push(p);
    }
  };
  walk(rel);
  return out;
}

// ── The ruled words, verbatim (GTC-385, plan rulings 2026-10-15), curly in the app ──
const DATE = 'Date';
const MORE_DAYS = 'It runs over more than one day';
const FIRST_DAY = 'First day';
const LAST_DAY = 'Last day';
const ONE_DAY = 'Just the one day';
const BACKWARDS = 'The last day can’t be before the first day.';
/** Q3: five, in this order, a real ellipsis. */
const STAGES = [
  'Reading your answers…',
  'Choosing the dishes…',
  'Working out quantities…',
  'Checking dietary needs…',
  'Putting the plan in order…',
];
const WAIT_HEADING = 'Putting your plan together...';
const TOAST_FAILED = 'Failed to generate plan. Please try again.';
const TOAST_LIMIT = "You've used all 10 AI calls for this event.";
const KEY = 'V vegetarian, VG vegan, GF gluten-free, DF dairy-free, NF nut-free.';
/** Q10: Moment 2's plan. */
const PLAN_KEY = `${KEY} These are Gather’s guesses: check with whoever’s cooking, and tap a dish to change them.`;
/** Q11: Moment 3, the untrue part dropped. */
const M3_KEY = `${KEY} These are Gather’s guesses: check with whoever’s cooking.`;
/** Q10: the print. */
const PRINT_NOTE = 'Marks are Gather’s guesses, check with the cook.';
const TICKS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut-free'];
const MARKS = ['V', 'VG', 'GF', 'DF', 'NF'];

// ── CHECKS-START: the render checks, pure, dry-run verbatim before RED ───────
/** Text as a reader sees it: tags to line breaks, React's text separators gone. */
const lines = (h: string) =>
  h
    .replace(/<!-- -->/g, '')
    .replace(/<[^>]+>/g, '\n')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
const dateInputs = (h: string) => (h.match(/<input[^>]*type="date"[^>]*>/g) ?? []).length;
const CHECKS = {
  /** D (53): one date, the link, no end box. */
  D_ONE: (h: string, label: string) =>
    h.includes('data-event-dates="one"') &&
    dateInputs(h) === 1 &&
    lines(h).includes(label) &&
    h.includes(`>${MORE_DAYS}</button>`) &&
    !h.includes('name="endDate"') &&
    !lines(h).some((l) => l.startsWith(FIRST_DAY) || l.startsWith(LAST_DAY)) &&
    !h.includes(BACKWARDS),
  /** D (53): open, first and last, the last's min is the first day, the link to close. */
  D_MORE: (h: string, first: string) => {
    const end = (h.match(/<input[^>]*name="endDate"[^>]*>/) ?? [''])[0];
    const ls = lines(h);
    return (
      h.includes('data-event-dates="more"') &&
      dateInputs(h) === 2 &&
      ls.some((l) => l.startsWith(FIRST_DAY)) &&
      ls.some((l) => l.startsWith(LAST_DAY)) &&
      end.includes(`min="${first}"`) &&
      h.includes(`>${ONE_DAY}</button>`) &&
      !h.includes(MORE_DAYS) &&
      !h.includes(BACKWARDS)
    );
  },
  /** D (53): a backwards pair says so. */
  D_BACK: (h: string) =>
    h.includes('data-event-dates="more"') &&
    h.includes(`role="alert"`) &&
    h.includes(`>${BACKWARDS}</p>`),
  /** P (58): the bar at a percent, and its stage words (or none). */
  P_BAR: (h: string, pct: number, stage: string | null) => {
    const bar = (h.match(/<div[^>]*role="progressbar"[^>]*>/) ?? [''])[0];
    return (
      bar.includes(`aria-valuenow="${pct}"`) &&
      bar.includes('aria-valuemin="0"') &&
      bar.includes('aria-valuemax="100"') &&
      h.includes(`width:${pct}%`) &&
      (stage === null
        ? STAGES.every((s) => !h.includes(s))
        : h.includes(`>${stage}</p>`) && STAGES.filter((s) => h.includes(s)).length === 1)
    );
  },
  /** M (59): the marks right after the dish's name, outside its button (or none). */
  M_ROW: (h: string, nameTag: string, marks: string[]) => {
    const at = h.indexOf(nameTag);
    if (at < 0) return false;
    const after = h.slice(at + nameTag.length);
    if (marks.length === 0) return !after.startsWith('<span data-dish-marks');
    const m = after.match(/^<span data-dish-marks[^>]*>([\s\S]*?)<\/span>/);
    if (!m) return false;
    const got = [...m[1].matchAll(/<abbr[^>]*>([^<]+)<\/abbr>/g)].map((x) => x[1]);
    return got.join(' ') === marks.join(' ');
  },
  /** M (59): the key line, once, in these words. */
  M_KEY: (h: string, words: string) =>
    h.split('data-dish-key').length === 2 && h.includes(`>${words}</p>`),
  /** M (59): five ticks in order, these ones ticked. */
  M_TICKS: (h: string, ticked: string[]) => {
    const f = (h.match(/<fieldset data-dish-ticks[\s\S]*?<\/fieldset>/) ?? [''])[0];
    const got = [...f.matchAll(/<label[^>]*>(<input[^>]*>)([^<]+)<\/label>/g)];
    return (
      got.length === 5 &&
      got.map((g) => g[2]).join('|') === TICKS.join('|') &&
      got.every((g) => g[1].includes('type="checkbox"')) &&
      got
        .filter((g) => /\schecked=""/.test(g[1]))
        .map((g) => g[2])
        .join('|') === ticked.join('|')
    );
  },
  /**
   * K1: every address Chrome asked for that is NOT allowed. Allowed: localhost:3000, and by name a
   * `data:` or `about:` address (New Event's date box loads a `data:image/svg+xml` icon, whose
   * host is empty). Any other host fails, an empty one from any other kind of address included.
   */
  /**
   * W2 (Q13, "let every name wrap"): every piece of a Moment 3 row's text — each line of the name,
   * each mark, each line of the amount — lies wholly inside the row's text box, and the box does
   * not overflow. Returns what does not fit.
   */
  M3_FIT: (
    rows: {
      row: string;
      overflowX: number;
      box: { l: number; r: number; t: number; b: number };
      parts: { what: string; l: number; r: number; t: number; b: number }[];
    }[]
  ) =>
    rows.flatMap((x) => [
      ...(x.overflowX > 0 ? [`${x.row}: its text overflows by ${x.overflowX}px`] : []),
      ...x.parts
        .filter(
          (p) =>
            p.l < x.box.l - 0.5 || p.r > x.box.r + 0.5 || p.t < x.box.t - 0.5 || p.b > x.box.b + 0.5
        )
        .map((p) => `${x.row}: ${p.what} outside its row`),
    ]),
  /**
   * W3 (Q14, "move whole, wrap if too long"): measured on the amount's own text (a Range), so text
   * spilling out of its span counts too. A short amount ("2 trays") lies on one line, never split;
   * every amount, the long free-text one included, lies wholly inside its row's text box; and the
   * page does not scroll sideways. Returns what is wrong.
   */
  M3_AMOUNT: (
    rows: {
      row: string;
      amount: string;
      long: boolean;
      lineH: number;
      box: { l: number; r: number; t: number; b: number };
      lines: { l: number; r: number; t: number; b: number }[];
    }[],
    pageWide: boolean
  ) => [
    ...(pageWide ? [] : ['the page scrolls sideways']),
    ...rows.flatMap((x) => {
      const tops = x.lines.map((q) => q.t).sort((a, b) => a - b);
      const count = tops.filter((t, i) => i === 0 || t - tops[i - 1] > x.lineH / 2).length;
      const out = x.lines.some(
        (q) =>
          q.l < x.box.l - 0.5 || q.r > x.box.r + 0.5 || q.t < x.box.t - 0.5 || q.b > x.box.b + 0.5
      );
      return [
        ...(count === 0 ? [`${x.row}: no amount`] : []),
        ...(!x.long && count > 1 ? [`${x.row}: "${x.amount}" split over ${count} lines`] : []),
        ...(out ? [`${x.row}: "${x.amount}" runs outside its row`] : []),
      ];
    }),
  ],
  K1_OUTSIDE: (urls: string[]) =>
    urls.filter((u) => {
      if (/^(data|about):/i.test(u)) return false;
      try {
        return new URL(u).host !== 'localhost:3000';
      } catch {
        return true;
      }
    }),
};
// ── CHECKS-END ────────────────────────────────────────────────────────────────

// ══ IN MEMORY ═══════════════════════════════════════════════════════════════════
async function runInMemory() {
  // ── D — item 53, the date ─────────────────────────────────────────────────────
  const DP = await load('../src/lib/events/date-pair');
  assert(
    'D',
    'D1 the words, as ruled (Q1): Date, the link, First day, Last day, Just the one day, the backwards line',
    ok(
      () =>
        DP.DATE_WORDS.DATE === DATE &&
        DP.DATE_WORDS.MORE_DAYS === MORE_DAYS &&
        DP.DATE_WORDS.FIRST_DAY === FIRST_DAY &&
        DP.DATE_WORDS.LAST_DAY === LAST_DAY &&
        DP.DATE_WORDS.ONE_DAY === ONE_DAY &&
        DP.DATE_WORDS.BACKWARDS === BACKWARDS
    )
  );
  assert(
    'D',
    'D2 one date always sends end = start; open with a last day sends it; open with none sends one day',
    ok(() => {
      const a = DP.datePairToSend({ first: '2026-12-19', last: '', moreDays: false });
      const b = DP.datePairToSend({ first: '2026-12-19', last: '2026-12-20', moreDays: false });
      const c = DP.datePairToSend({ first: '2026-12-19', last: '2026-12-20', moreDays: true });
      const d = DP.datePairToSend({ first: '2026-12-19', last: '', moreDays: true });
      return (
        a.startDate === '2026-12-19' &&
        a.endDate === '2026-12-19' &&
        b.endDate === '2026-12-19' &&
        c.endDate === '2026-12-20' &&
        d.endDate === '2026-12-19'
      );
    })
  );
  assert(
    'D',
    'D3 opening fills the last day with the first; moving the first past the last moves the last with it; closing puts it back to the first; a weekend stays as it is',
    ok(() => {
      const open = DP.openMoreDays({ first: '2026-12-19', last: '', moreDays: false });
      const moved = DP.changeFirst(
        { first: '2026-12-19', last: '2026-12-20', moreDays: true },
        '2026-12-24'
      );
      const kept = DP.changeFirst(
        { first: '2026-12-19', last: '2026-12-20', moreDays: true },
        '2026-12-18'
      );
      const closed = DP.closeMoreDays({ first: '2026-12-19', last: '2026-12-20', moreDays: true });
      return (
        open.moreDays === true &&
        open.last === '2026-12-19' &&
        moved.last === '2026-12-24' &&
        kept.last === '2026-12-20' &&
        closed.moreDays === false &&
        closed.last === '2026-12-19'
      );
    })
  );
  assert(
    'D',
    'D4 a stored event opens closed when it is one day, open when it runs over more, and open when it is backwards; only a backwards open pair is a problem',
    ok(() => {
      const one = DP.datePairFrom('2026-12-19T00:00:00.000Z', '2026-12-19T00:00:00.000Z');
      const two = DP.datePairFrom('2026-12-19T00:00:00.000Z', '2026-12-20T00:00:00.000Z');
      const back = DP.datePairFrom('2026-12-20T00:00:00.000Z', '2026-12-19T00:00:00.000Z');
      return (
        one.moreDays === false &&
        one.first === '2026-12-19' &&
        two.moreDays === true &&
        two.last === '2026-12-20' &&
        back.moreDays === true &&
        DP.datePairProblem(back) === BACKWARDS &&
        DP.datePairProblem(two) === null &&
        DP.datePairProblem(one) === null
      );
    })
  );
  assert(
    'D',
    'D5 endBeforeStart reads strings and Dates; the same day and a later day are not backwards',
    ok(
      () =>
        DP.endBeforeStart('2026-12-20', '2026-12-19') === true &&
        DP.endBeforeStart(new Date('2026-12-20'), new Date('2026-12-19')) === true &&
        DP.endBeforeStart('2026-12-19', '2026-12-19') === false &&
        DP.endBeforeStart('2026-12-19', new Date('2026-12-21')) === false
    )
  );

  const EDF = (await load('../src/components/plan/EventDateFields'))?.default;
  const dates = (value: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
    EDF
      ? render(
          createElement(EDF, {
            value,
            onChange: () => {},
            labelClassName: 'block',
            inputClassName: 'w-full',
            ...extra,
          })
        )
      : '';
  const closedR = dates({ first: '2026-12-19', last: '2026-12-19', moreDays: false });
  const openR = dates({ first: '2026-12-19', last: '2026-12-21', moreDays: true });
  const backR = dates({ first: '2026-12-21', last: '2026-12-19', moreDays: true });
  const starR = dates({ first: '2026-12-19', last: '2026-12-19', moreDays: false }, { star: true });
  assert(
    'D',
    'D6 closed: one "Date", the link, no end box',
    CHECKS.D_ONE(closedR, DATE),
    `${closedR.length}`
  );
  assert(
    'D',
    'D7 open: "First day" and "Last day", the last day’s min is the first, "Just the one day"',
    CHECKS.D_MORE(openR, '2026-12-19')
  );
  assert(
    'D',
    'D8 a backwards pair says "The last day can’t be before the first day."',
    CHECKS.D_BACK(backR)
  );
  assert('D', 'D9 Edit Event’s style: "Date *"', CHECKS.D_ONE(starR, `${DATE} *`));

  const planNew = codeOnly(read('src/app/plan/new/page.tsx'));
  assert(
    'D',
    'D10 New Event draws its date with EventDateFields and sends datePairToSend: no end box of its own, and a missing date reads "Date is required"',
    planNew.includes('<EventDateFields') &&
      /datePairToSend\(/.test(planNew) &&
      /datePairProblem\(/.test(planNew) &&
      !planNew.includes('type="date"') &&
      planNew.includes("'Date is required'") &&
      !planNew.includes("'End date is required'") &&
      planNew.includes('gather_new_event')
  );
  const editModal = codeOnly(read('src/components/plan/EditEventModal.tsx'));
  assert(
    'D',
    'D11 Edit Event draws its date with EventDateFields (star), opens from the stored pair, refuses a backwards pair and sends datePairToSend',
    editModal.includes('<EventDateFields') &&
      /datePairFrom\(/.test(editModal) &&
      /datePairProblem\(/.test(editModal) &&
      /datePairToSend\(/.test(editModal) &&
      !editModal.includes('type="date"')
  );
  const patchRoute = codeOnly(read('src/app/api/events/[id]/route.ts'));
  const patchBody = patchRoute.slice(patchRoute.indexOf('export async function PATCH'));
  const refuseAt = patchBody.search(/endBeforeStart\(/);
  assert(
    'D',
    'D12 PATCH /api/events/[id] checks the pair it would store (the body’s date, else the stored one) and answers 400 with the line, before any write',
    refuseAt > 0 &&
      /existingEvent\.startDate/.test(patchBody.slice(refuseAt - 400, refuseAt + 200)) &&
      /existingEvent\.endDate/.test(patchBody.slice(refuseAt - 400, refuseAt + 200)) &&
      /DATE_WORDS\.BACKWARDS[\s\S]{0,40}status:\s*400/.test(
        patchBody.slice(refuseAt, refuseAt + 400)
      ) &&
      refuseAt < patchBody.indexOf('prisma.event.update') &&
      refuseAt < patchBody.indexOf('ledgerActorForUser')
  );
  const cloneRoute = codeOnly(read('src/app/api/templates/[id]/clone/route.ts'));
  const cloneAt = cloneRoute.search(/endBeforeStart\(/);
  assert(
    'D',
    'D13 the clone route refuses a backwards pair with a 400 and the line, before it reads a template',
    cloneAt > 0 &&
      /DATE_WORDS\.BACKWARDS[\s\S]{0,40}status:\s*400/.test(
        cloneRoute.slice(cloneAt, cloneAt + 400)
      ) &&
      cloneAt < cloneRoute.indexOf('prisma.structureTemplate.findUnique')
  );
  assert(
    'D',
    'D14 CONTROL: Zone 4 and the post-payment route are untouched; a one-day event reads one date ("Sat 19 Dec 2026")',
    unchanged('src/app/api/billing') &&
      unchanged('src/app/api/events/route.ts') &&
      whenLine('2026-12-18T11:00:00.000Z', '2026-12-18T11:00:00.000Z') === 'Sat 19 Dec 2026'
  );

  // ── P — item 58, the wait ─────────────────────────────────────────────────────
  const PW = await load('../src/lib/setup/plan-wait');
  assert(
    'P',
    'P1 the five stage words, exactly, in order (Q3)',
    ok(
      () => Array.isArray(PW.PLAN_WAIT_STAGES) && PW.PLAN_WAIT_STAGES.join('|') === STAGES.join('|')
    )
  );
  // The fake clock: every 100ms from 0 to 300s, no real timer.
  const curve = ok(() => typeof PW.planWaitPercent === 'function')
    ? Array.from({ length: 3001 }, (_, i) => PW.planWaitPercent(i * 100, false) as number)
    : [];
  assert(
    'P',
    'P2 on a made-up clock the bar starts at 0, rises, never goes back and never passes 95 before the plan arrives',
    curve.length === 3001 &&
      curve[0] === 0 &&
      curve.every(
        (v, i) => Number.isFinite(v) && v >= 0 && v <= 95 && (i === 0 || v >= curve[i - 1])
      ) &&
      curve[100] > curve[10] &&
      curve[3000] > 90,
    curve.length
      ? `0s ${curve[0]}, 10s ${curve[100]}, 60s ${curve[600]}, 300s ${curve[3000]}`
      : 'no curve'
  );
  assert(
    'P',
    'P3 the measured curve: about 78 at 60s and 85 at 80s; 100 once the plan has arrived, at any time',
    ok(
      () =>
        curve[600] >= 75 &&
        curve[600] <= 81 &&
        curve[800] >= 82 &&
        curve[800] <= 88 &&
        PW.planWaitPercent(0, true) === 100 &&
        PW.planWaitPercent(5_000, true) === 100 &&
        PW.planWaitPercent(400_000, true) === 100
    )
  );
  const stageAt = (ms: number) =>
    ok(() => typeof PW.planWaitStage === 'function') ? PW.planWaitStage(ms) : '';
  const switches: number[] = [];
  for (let t = 100; t <= 300_000; t += 100) if (stageAt(t) !== stageAt(t - 100)) switches.push(t);
  assert(
    'P',
    'P4 the words change on the clock, first to last, each after 10 to 20 seconds; the last stays to 300s; none counts or says done',
    stageAt(0) === STAGES[0] &&
      switches.length === 4 &&
      switches.every((t, i) => stageAt(t) === STAGES[i + 1]) &&
      [switches[0], ...switches.slice(1).map((t, i) => t - switches[i])].every(
        (gap) => gap >= 10_000 && gap <= 20_000
      ) &&
      stageAt(300_000) === STAGES[4] &&
      STAGES.every((s) => !/\d|done/i.test(s)),
    switches.join(',')
  );
  const Bar = (SK as any).PlanWaitBar;
  const barR = Bar ? render(createElement(Bar, { percent: 42, stage: STAGES[1] })) : '';
  assert(
    'P',
    'P5 PlanWaitBar at 42: a progressbar at 42, its stage words under it',
    CHECKS.P_BAR(barR, 42, STAGES[1])
  );
  const waitingR = render(
    createElement((SK as any).default, { eventName: 'Boxing Day', plan: null, onApprove: () => {} })
  );
  assert(
    'P',
    'P6 the waiting screen: "Putting your plan together..." stays the heading, the bar under it at 0 with the first words; no "about a minute"',
    waitingR.includes(`>${WAIT_HEADING}</p>`) &&
      CHECKS.P_BAR(waitingR, 0, STAGES[0]) &&
      waitingR.indexOf('role="progressbar"') > waitingR.indexOf(WAIT_HEADING) &&
      !waitingR.includes('about a minute')
  );
  const arrivedR = render(
    createElement((SK as any).default, {
      eventName: 'Boxing Day',
      plan: {
        categories: [
          {
            name: 'Mains',
            emoji: '🍖',
            items: [{ name: 'Glazed ham', quantity: 1, unit: 'whole' }],
          },
        ],
        dietaryCoverage: [],
        thingsToConsider: [],
      },
      onApprove: () => {},
    })
  );
  assert(
    'P',
    'P7 the plan has arrived: the bar at 100, no stage words, no "Putting your plan together..."',
    CHECKS.P_BAR(arrivedR, 100, null) && !arrivedR.includes(WAIT_HEADING)
  );
  const setupSrc = codeOnly(read('src/app/plan/[eventId]/setup/page.tsx'));
  const gen = setupSrc.slice(
    setupSrc.indexOf('onGenerate={async () => {'),
    setupSrc.indexOf('onBack={() => void goToMoment(')
  );
  const back429 = gen.slice(gen.indexOf('res.status === 429'), gen.indexOf('if (!res.ok)'));
  const backFail = gen.slice(gen.indexOf('} catch {'));
  assert(
    'P',
    'P8 a refused (429) or failed Generate goes back to the questions, the same toasts as today (Q4)',
    gen.length > 0 &&
      back429.includes(`toast.error("${TOAST_LIMIT}")`) &&
      /setShowMoment2Step2Skeleton\(false\);\s*setShowMoment2Step1\(true\);/.test(back429) &&
      backFail.includes(`toast.error('${TOAST_FAILED}')`) &&
      /setShowMoment2Step2Skeleton\(false\);\s*setShowMoment2Step1\(true\);/.test(backFail)
  );

  // ── M — item 59, the marks ────────────────────────────────────────────────────
  const DM = await load('../src/lib/items/dish-marks');
  assert(
    'M',
    'M1 one reader, three spellings: VEGETARIAN / vegetarian, glutenFree / gluten-free, all five in order V VG GF DF NF, each once; nothing else is a mark',
    ok(
      () =>
        DM.dishMarks(['NUT_FREE', 'DAIRY_FREE', 'GLUTEN_FREE', 'VEGAN', 'VEGETARIAN']).join(' ') ===
          MARKS.join(' ') &&
        DM.dishMarks(['vegetarian', 'glutenFree', 'dairyFree']).join(' ') === 'V GF DF' &&
        DM.dishMarks(['gluten-free', 'vegan', 'nut-free', 'GLUTEN_FREE']).join(' ') ===
          'VG GF NF' &&
        DM.dishMarks(['gluten-free-check', 'HALAL', 3, null]).length === 0 &&
        DM.dishMarks(null).length === 0 &&
        DM.dishMarks('VEGAN').length === 0
    )
  );
  assert(
    'M',
    'M2 exactly what the tags say: a vegan dish with no VEGETARIAN tag shows VG alone (Q6)',
    ok(() => DM.dishMarks(['VEGAN', 'GLUTEN_FREE']).join(' ') === 'VG GF')
  );
  assert(
    'M',
    'M3 saving the ticks keeps every other tag and writes the five as the AI does',
    ok(() => {
      const t = DM.withMarks(['glutenFree', 'HALAL', 'VEGETARIAN', 'nut-free'], ['V', 'DF']);
      return t.join(',') === 'HALAL,VEGETARIAN,DAIRY_FREE';
    })
  );
  assert(
    'M',
    'M4 no marks in the two drinks sections or on a job; food dishes in any other section carry them (Q7, Q12)',
    ok(
      () =>
        DM.marksApply('Alcoholic Drinks', 'ITEM') === false &&
        DM.marksApply('Non-Alcoholic Drinks', 'ITEM') === false &&
        DM.marksApply('Mains', 'TASK') === false &&
        DM.marksApply('Mains', 'ITEM') === true &&
        DM.marksApply('Mains', undefined) === true &&
        DM.marksApply('Nibbles from Nan', 'ITEM') === true &&
        DM.shownMarks('Alcoholic Drinks', 'ITEM', ['VEGAN']).length === 0
    )
  );
  assert(
    'M',
    'M5 the words, as ruled: the key, the plan’s warning, Moment 3’s without "tap a dish", the print’s note (Q10, Q11)',
    ok(
      () =>
        `${DM.DISH_MARKS_KEY} ${DM.DISH_MARKS_GUESS_PLAN}` === PLAN_KEY &&
        `${DM.DISH_MARKS_KEY} ${DM.DISH_MARKS_GUESS_M3}` === M3_KEY &&
        DM.DISH_MARKS_PRINT === PRINT_NOTE &&
        DM.DISH_MARKS.map((d: any) => d.word).join('|') === TICKS.join('|')
    )
  );

  const cats = [
    {
      id: 'c1',
      name: 'Mains',
      emoji: '🍖',
      items: [
        {
          id: 'i1',
          name: 'Stuffed mushrooms',
          quantity: 2,
          unit: 'trays',
          servingSize: '',
          kind: 'ITEM',
          dietaryFlags: ['VEGETARIAN', 'GLUTEN_FREE', 'NUT_FREE'],
        },
        { id: 'i2', name: 'Bread rolls', quantity: 24, unit: '', servingSize: '', kind: 'ITEM' },
      ],
    },
    {
      id: 'c2',
      name: 'Alcoholic Drinks',
      emoji: '🍷',
      items: [
        {
          id: 'i3',
          name: 'Pinot noir',
          quantity: 6,
          unit: 'bottles',
          servingSize: '',
          kind: 'ITEM',
          dietaryFlags: ['VEGAN', 'GLUTEN_FREE', 'DAIRY_FREE'],
        },
      ],
    },
    {
      id: 'c3',
      name: 'On the day',
      emoji: '📋',
      items: [
        {
          id: 'i4',
          name: 'Set the tables',
          quantity: 0,
          unit: '',
          servingSize: '',
          kind: 'TASK',
          dietaryFlags: ['VEGAN'],
        },
      ],
    },
  ];
  const planProps = {
    eventId: 'e1',
    eventName: 'Boxing Day',
    guestCount: 6,
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
  };
  const planView = (categories: unknown) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(PV.default as any, { ...planProps, categories })
      )
    );
  const marked = planView(cats);
  assert(
    'M',
    'M6 Moment 2’s plan: "Stuffed mushrooms" then V GF NF, outside its button; Bread rolls none; the drink and the job none',
    marked.length > 0 &&
      CHECKS.M_ROW(marked, '>Stuffed mushrooms</button>', ['V', 'GF', 'NF']) &&
      CHECKS.M_ROW(marked, '>Bread rolls</button>', []) &&
      CHECKS.M_ROW(marked, '>Pinot noir</button>', []) &&
      CHECKS.M_ROW(marked, '>Set the tables</button>', []) &&
      marked.includes('title="Vegetarian"')
  );
  assert(
    'M',
    'M7 Moment 2’s plan carries the key and its warning once, his full words (Q10)',
    CHECKS.M_KEY(marked, PLAN_KEY)
  );
  const plain = planView([{ ...cats[0], items: [cats[0].items[1]] }, cats[1], cats[2]]);
  assert(
    'M',
    'M8 CONTROL: with no marked food dish there is no key line and no marks at all',
    plain.length > 0 &&
      plain.includes('>Bread rolls</button>') &&
      !plain.includes('data-dish-key') &&
      !plain.includes('data-dish-marks')
  );
  const EditForm = (PV as any).ItemEditForm;
  const AddForm = (PV as any).AddItemForm;
  const editR = (item: unknown, showMarks: boolean) =>
    EditForm
      ? render(
          createElement(EditForm, {
            item,
            showMarks,
            onSave: async () => {},
            onCancel: () => {},
            onRemove: async () => {},
          })
        )
      : '';
  const editFood = editR(cats[0].items[0], true);
  const editDrink = editR(cats[1].items[0], false);
  assert(
    'M',
    'M9 the dish editor on a food dish: five ticks, Vegetarian, Gluten-free and Nut-free ticked (Q9)',
    CHECKS.M_TICKS(editFood, ['Vegetarian', 'Gluten-free', 'Nut-free'])
  );
  assert(
    'M',
    'M10 the dish editor on a drink or a job: no ticks (Q12)',
    editDrink.includes('>Name<') &&
      !editDrink.includes('data-dish-ticks') &&
      !TICKS.some((t) => editDrink.includes(`>${t}</label>`))
  );
  const addR = (marksAllowed: boolean) =>
    AddForm
      ? render(createElement(AddForm, { marksAllowed, onAdd: async () => {}, onCancel: () => {} }))
      : '';
  const addFood = addR(true);
  const addDrink = addR(false);
  assert(
    'M',
    'M11 "+ Add item" in a food section: five ticks, none ticked (Q9)',
    CHECKS.M_TICKS(addFood, [])
  );
  assert(
    'M',
    'M12 "+ Add item" in a drinks section: no ticks (Q12)',
    addDrink.includes('>Name<') && !addDrink.includes('data-dish-ticks')
  );
  const planSrc = codeOnly(read('src/components/plan/Moment2PlanView.tsx'));
  assert(
    'M',
    'M13 the plan view decides by marksApply for the row, the editor and "+ Add item"; the editor sends the tags only when its ticks changed',
    (planSrc.match(/marksApply\(/g) ?? []).length >= 2 &&
      /showMarks=\{/.test(planSrc) &&
      /marksAllowed=\{/.test(planSrc) &&
      /sameMarks\(/.test(planSrc) &&
      /withMarks\(/.test(planSrc)
  );

  const m3 = (categories: unknown) =>
    render(
      createElement(
        ToastProvider as any,
        null,
        createElement(Moment3AssignView as any, {
          eventId: 'e1',
          event: { id: 'e1', status: 'DRAFT', sentAt: null },
          hostPersonId: 'p-kate',
          headcount: 4,
          categories,
          initialHolders: {},
          households: [],
          askForReason: async () => ({ proceed: true }),
          askForBatchReason: async () => ({ proceed: true }),
          onBack: () => {},
          onMoveOn: () => {},
          stripDoors: {},
        })
      )
    );
  const m3Marked = m3([
    {
      id: 'c1',
      name: 'Mains',
      emoji: '🍖',
      items: [
        {
          id: 'i1',
          name: 'Stuffed mushrooms',
          kind: 'ITEM',
          detail: '2 trays',
          marks: ['V', 'GF', 'NF'],
        },
        { id: 'i2', name: 'Bread rolls', kind: 'ITEM', detail: '24' },
      ],
    },
  ]);
  const m3Plain = m3([
    {
      id: 'c1',
      name: 'Mains',
      emoji: '🍖',
      items: [{ id: 'i2', name: 'Bread rolls', kind: 'ITEM', detail: '24' }],
    },
  ]);
  assert(
    'M',
    'M14 Moment 3: the marks after the dish’s name, and the key without "tap a dish" (Q11)',
    CHECKS.M_ROW(m3Marked, '<span>Stuffed mushrooms</span>', ['V', 'GF', 'NF']) &&
      CHECKS.M_ROW(m3Marked, '<span>Bread rolls</span>', []) &&
      CHECKS.M_KEY(m3Marked, M3_KEY) &&
      !m3Marked.includes('tap a dish')
  );
  assert(
    'M',
    'M15 CONTROL: Moment 3 with no marked dish: no key line, no marks',
    m3Plain.includes('<span>Bread rolls</span>') &&
      !m3Plain.includes('data-dish-key') &&
      !m3Plain.includes('data-dish-marks')
  );

  const PR = await load('../src/lib/print/item-list');
  const pItem = (name: string, team: string, tags: unknown, kind = 'ITEM') => ({
    name,
    kind,
    quantityAmount: 2,
    quantityUnit: 'TRAYS',
    quantityUnitCustom: null,
    quantityText: null,
    dietaryTags: tags,
    team: { name: team, displayOrder: 0 },
    assignment: null,
  });
  const printed = ok(() => typeof PR.itemListHtml === 'function')
    ? (PR.itemListHtml({
        eventName: 'Boxing Day',
        eventDate: '26 December 2026',
        items: PR.toPrintItems([
          pItem('Stuffed mushrooms', 'Mains', ['VEGETARIAN', 'gluten-free']),
          pItem('Bread rolls', 'Mains', []),
          pItem('Pinot noir', 'Alcoholic Drinks', ['VEGAN']),
        ]),
      }) as string)
    : '';
  const printedPlain = ok(() => typeof PR.itemListHtml === 'function')
    ? (PR.itemListHtml({
        eventName: 'Boxing Day',
        eventDate: '26 December 2026',
        items: PR.toPrintItems([pItem('Bread rolls', 'Mains', [])]),
      }) as string)
    : '';
  assert(
    'M',
    'M16 the print: "Stuffed mushrooms V GF" in its cell, the drink unmarked, the note once under the date (Q10)',
    /<td>Stuffed mushrooms <span[^>]*>V GF<\/span><\/td>/.test(printed) &&
      printed.includes('<td>Bread rolls</td>') &&
      printed.includes('<td>Pinot noir</td>') &&
      printed.split(PRINT_NOTE).length === 2 &&
      printed.indexOf(PRINT_NOTE) > printed.indexOf('26 December 2026')
  );
  assert(
    'M',
    'M17 CONTROL: a print with no marked dish has no note',
    printedPlain.includes('<td>Bread rolls</td>') && !printedPlain.includes(PRINT_NOTE)
  );
  assert(
    'M',
    'M18 the setup page: the plan rows carry kind and tags, the editor’s tags go to the item PATCH, "+ Add item" sends its ticks, and Moment 3’s rows get their marks from shownMarks',
    /kind:\s*item\.kind/.test(setupSrc) &&
      /body\.dietaryTags\s*=\s*updates\.dietaryFlags/.test(setupSrc) &&
      /dietaryTags:\s*newItem\.dietaryTags/.test(setupSrc) &&
      /marks:\s*shownMarks\(/.test(setupSrc)
  );
  const guestSide = [
    'src/app/p/[token]/page.tsx',
    'src/app/h/[token]/page.tsx',
    'src/app/h/[token]/team/[teamId]/page.tsx',
    'src/app/c/[token]/page.tsx',
    ...filesUnder('src/lib/messages'),
    ...filesUnder('src/lib/preflight'),
  ];
  assert(
    'M',
    'M19 CONTROL: never on a guest’s page or in an ask, and the old dashboard is untouched (Q8)',
    guestSide.length > 6 &&
      guestSide.every((f) => read(f).length > 0 && !/dish-marks|DishMarks/.test(read(f))) &&
      unchanged('src/app/plan/[eventId]/page.tsx') &&
      unchanged('src/components/plan/EditItemModal.tsx') &&
      unchanged('src/components/plan/AddItemModal.tsx')
  );

  // ── Z — the edges ─────────────────────────────────────────────────────────────
  const routesNow = filesUnder('src/app/api').filter((f) => f.endsWith('/route.ts')).length;
  const routesHead = git(['ls-tree', '-r', '--name-only', 'HEAD', 'src/app/api'])
    .stdout.split('\n')
    .filter((f) => f.endsWith('/route.ts')).length;
  assert(
    'Z',
    'Z1 CONTROL: no new route, no migration, no schema change: route.ts files as at HEAD, prisma/ and route-classifications.json untouched',
    routesNow > 0 &&
      routesNow === routesHead &&
      unchanged('prisma') &&
      unchanged('route-classifications.json')
  );
  assert(
    'Z',
    'Z2 CONTROL: the AI is asked nothing new (src/lib/ai untouched), the Generate button’s modal is untouched, and so is every tests/security-* file',
    unchanged('src/lib/ai') &&
      unchanged('src/components/plan/Moment2Step1Modal.tsx') &&
      git(['diff', '--quiet', 'HEAD', '--', 'tests/security-*']).status === 0
  );
}

// ══ LIVE — the dev server, in the walled-off headless Chrome ════════════════════
const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
};

/** Q5's wall (1): POST …/finalize-plan answered inside the page, held until the suite says. */
const STAND_IN = `(() => {
  const real = window.fetch.bind(window);
  const st = (window.__gtc385 = { calls: 0, pending: null, answered: null });
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = ((init && init.method) || (input && input.method) || 'GET').toUpperCase();
    if (/finalize-plan/.test(url) && method === 'POST') {
      st.calls++;
      return new Promise((resolve) => { st.pending = resolve; });
    }
    return real(input, init);
  };
  st.answer = (status) => {
    if (!st.pending) return 'nothing waiting';
    const r = st.pending; st.pending = null; st.answered = status;
    r(new Response(JSON.stringify({ error: 'GTC-385 stand-in' }), { status, headers: { 'Content-Type': 'application/json' } }));
    return 'answered ' + status;
  };
})();`;

/** The row's own "Edit": up from the dish's name until a row holds an "Edit" button of its own. */
const ROW_EDIT = `((name) => { let el = [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === name);
  while (el && el.parentElement) { el = el.parentElement;
    const e = [...el.querySelectorAll(':scope > button')].find((b) => b.innerText.trim() === 'Edit'); if (e) return e; }
  return null; })`;

async function runLive() {
  const up = await realFetch(`${BASE}/`)
    .then((r) => r.status > 0)
    .catch(() => false);
  assert('C', 'C0 PRECONDITION: the dev server answers on :3000', up);
  if (!up) return;

  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const user = await prisma.user.create({ data: { email: `gtc385-kate-${stamp}@example.com` } });
  created.users.push(user.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate B15', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const day = new Date(Date.UTC(2026, 11, 19));
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const plusDays = (n: number) => new Date(day.getTime() + n * 864e5);
  const mkEvent = async (name: string) => {
    const ev = await prisma.event.create({
      data: { name, startDate: day, endDate: day, hostId: kate.id, status: 'DRAFT' } as any,
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    return ev;
  };
  const evDates = await mkEvent('GTC-385 b15 — dates');
  const evGen = await mkEvent('GTC-385 b15 — generate');
  await prisma.eventSetup.create({ data: { eventId: evGen.id, eventType: 'Christmas' } });
  const evPlan = await mkEvent('GTC-385 b15 — plan');
  await prisma.eventSetup.create({ data: { eventId: evPlan.id, eventType: 'Christmas' } });
  const evM3 = await mkEvent('GTC-385 b15 — moment 3');
  await prisma.eventSetup.create({
    data: { eventId: evM3.id, eventType: 'Christmas', planApprovedAt: new Date() },
  });
  const dishIds: Record<string, string> = {};
  let m3Mains = '';
  for (const ev of [evPlan, evM3]) {
    let order = 0;
    for (const [team, rows] of [
      [
        'Mains',
        [
          ['Stuffed mushrooms', 'ITEM', ['VEGETARIAN', 'GLUTEN_FREE', 'NUT_FREE']],
          ['Bread rolls', 'ITEM', []],
        ],
      ],
      ['Alcoholic Drinks', [['Pinot noir', 'ITEM', ['VEGAN', 'GLUTEN_FREE', 'DAIRY_FREE']]]],
      ['On the day', [['Set the tables', 'TASK', ['VEGAN']]]],
    ] as const) {
      const t = await prisma.team.create({
        data: {
          name: team,
          eventId: ev.id,
          displayOrder: order++,
          source: 'GENERATED',
          coordinatorId: kate.id,
        } as any,
      });
      if (ev.id === evM3.id && team === 'Mains') m3Mains = t.id;
      let i = 0;
      for (const [name, kind, tags] of rows) {
        const item = await prisma.item.create({
          data: {
            name,
            kind,
            teamId: t.id,
            source: 'GENERATED',
            aiGenerated: true,
            quantityAmount: kind === 'TASK' ? null : 2,
            quantityUnit: kind === 'TASK' ? null : 'TRAYS',
            status: 'UNASSIGNED',
            displayOrder: i++,
            dietaryTags: tags.length ? [...tags] : undefined,
          } as any,
        });
        if (ev.id === evPlan.id) dishIds[name] = item.id;
      }
    }
  }
  // Q13: Moment 3's long name and its all-five row, for W2.
  const LAMB = 'Slow-roasted lamb shoulder with rosemary, garlic and lemon';
  const KUMARA = 'Roast kumara and pumpkin';
  // Q14: a long free-text amount, for W3.
  const PAVLOVA = 'Pavlova';
  const LONG_AMOUNT =
    'enough for twelve people, plus seconds for the kids, and a tray to take home';
  for (const [i, [name, tags]] of (
    [
      [LAMB, ['GLUTEN_FREE', 'DAIRY_FREE', 'NUT_FREE']],
      [KUMARA, ['VEGETARIAN', 'VEGAN', 'GLUTEN_FREE', 'DAIRY_FREE', 'NUT_FREE']],
    ] as const
  ).entries()) {
    await prisma.item.create({
      data: {
        name,
        teamId: m3Mains,
        source: 'GENERATED',
        aiGenerated: true,
        quantityAmount: 2,
        quantityUnit: 'TRAYS',
        status: 'UNASSIGNED',
        displayOrder: 2 + i,
        dietaryTags: [...tags],
      } as any,
    });
  }
  // Q14: a dish with no amount and unit shows its free text, which has no length limit, for W3.
  await prisma.item.create({
    data: {
      name: PAVLOVA,
      teamId: m3Mains,
      source: 'GENERATED',
      aiGenerated: true,
      quantityText: LONG_AMOUNT,
      status: 'UNASSIGNED',
      displayOrder: 4,
    } as any,
  });

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.auditEntry.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  // ── H — the two routes, by HTTP, all backwards pairs ────────────────────────────
  const call = (path: string, method: string, body: unknown) =>
    realFetch(`${BASE}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `session=${token}` },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: await r.json().catch(() => null) }));
  const stored = async () => {
    const e = await prisma.event.findUnique({
      where: { id: evDates.id },
      select: { startDate: true, endDate: true },
    });
    return `${e?.startDate.toISOString().slice(0, 10)}..${e?.endDate.toISOString().slice(0, 10)}`;
  };
  const one = `${iso(day)}..${iso(day)}`;
  const h1 = await call(`/api/events/${evDates.id}`, 'PATCH', {
    startDate: iso(plusDays(1)),
    endDate: iso(day),
  });
  const s1 = await stored();
  assert(
    'H',
    'H1 PATCH /api/events/[id] with the last day before the first: 400, the line, nothing written (Q2)',
    h1.status === 400 && h1.body?.error === BACKWARDS && s1 === one,
    `${h1.status} ${JSON.stringify(h1.body)} stored ${s1}`
  );
  const h2 = await call(`/api/events/${evDates.id}`, 'PATCH', { startDate: iso(plusDays(3)) });
  const s2 = await stored();
  assert(
    'H',
    'H2 a PATCH moving only the start past the stored end: 400, nothing written (Q2)',
    h2.status === 400 && h2.body?.error === BACKWARDS && s2 === one,
    `${h2.status} ${JSON.stringify(h2.body)} stored ${s2}`
  );
  const eventsBefore = await prisma.event.count();
  const h3 = await call(`/api/templates/gtc385-no-such-template/clone`, 'POST', {
    eventName: 'GTC-385 clone',
    startDate: iso(plusDays(1)),
    endDate: iso(day),
  });
  assert(
    'H',
    'H3 the clone route with a backwards pair: 400 and the line, before any template is read; no event made (Q2)',
    h3.status === 400 &&
      h3.body?.error === BACKWARDS &&
      (await prisma.event.count()) === eventsBefore,
    `${h3.status} ${JSON.stringify(h3.body)}`
  );

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let hosts: string[] = [];
  let dialogs: string[] = [];
  let standIn: any = null;
  // K1 reads every address, not only its host: a second DevTools connection of the suite's own.
  const urls: string[] = [];
  let urlLog: any = null;
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    const targets = (await (await realFetch(`http://127.0.0.1:${PORT}/json/list`)).json()) as {
      type: string;
      webSocketDebuggerUrl: string;
    }[];
    urlLog = new (globalThis as any).WebSocket(
      targets.find((t) => t.type === 'page')!.webSocketDebuggerUrl
    );
    await new Promise((r) => urlLog.addEventListener('open', r));
    urlLog.addEventListener('message', (e: { data: string }) => {
      const m = JSON.parse(e.data);
      if (m.method === 'Network.requestWillBeSent') urls.push(m.params.request.url);
    });
    urlLog.send(JSON.stringify({ id: 1, method: 'Network.enable' }));
    await sleep(300);
    const shot = async (name: string) => {
      if (SHOTS) await c.screenshotViewport(join(SHOT_DIR, `${SHOTS}-${name}.png`));
    };
    await c.blockPlanMaking();
    await c.blockSends();
    await c.addInitScript(STAND_IN);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc385-probe/regenerate-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc385-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C1 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    if (probes.plan !== 'failed' || probes.send !== 'failed') return;
    const standInSet = await c.evaluate<boolean>(`typeof window.__gtc385?.answer === 'function'`);
    assert(
      'C',
      'C2 PRECONDITION: the stand-in is in the page before its own scripts',
      standInSet === true
    );
    if (!standInSet) return;
    await c.setSessionCookie(token);
    const text = `document.body.innerText`;

    for (const [tag, w, h, mobile] of [
      ['1280', 1280, 900, false],
      ['390', 390, 844, true],
    ] as const) {
      await c.setViewport(w, h, mobile);

      // ── N — New Event's date (nothing is paid, nothing is submitted) ─────────────
      await c.navigate('/plan/new', 6000);
      const n1 = await c.evaluate<any>(`(() => {
        const box = document.querySelector('[data-event-dates]');
        const labels = [...document.querySelectorAll('form label')].map((l) => l.innerText.trim());
        const link = [...document.querySelectorAll('form button')].find((b) => b.innerText.trim() === ${JSON.stringify(MORE_DAYS)});
        if (box) box.scrollIntoView({ block: 'center' });
        return { box: box && box.getAttribute('data-event-dates'), dates: document.querySelectorAll('input[type=date]').length,
          date: labels.includes(${JSON.stringify(DATE)}), link: !!link, wide: document.documentElement.scrollWidth <= innerWidth };
      })()`);
      await shot(`53-new-event-${tag}`);
      assert(
        'C',
        `N1 ${tag}: New Event asks for one "Date", with "${MORE_DAYS}" under it and no end box`,
        n1?.box === 'one' && n1.dates === 1 && n1.date && n1.link && n1.wide,
        JSON.stringify(n1)
      );
      await c.evaluate(
        `(() => { const b = [...document.querySelectorAll('form button')].find((x) => x.innerText.trim() === ${JSON.stringify(MORE_DAYS)}); if (b) b.setAttribute('data-gtc385', 'more'); return 1; })()`
      );
      const refusedMore = await c.clickGuarded('[data-gtc385="more"]', 500);
      const n2 = await c.evaluate<any>(`(() => {
        const labels = [...document.querySelectorAll('form label')].map((l) => l.innerText.trim());
        const end = document.querySelector('input[type=date][name=endDate]');
        const start = document.querySelector('input[type=date][name=startDate]');
        return { box: document.querySelector('[data-event-dates]')?.getAttribute('data-event-dates'),
          dates: document.querySelectorAll('input[type=date]').length,
          first: labels.includes(${JSON.stringify(FIRST_DAY)}), last: labels.includes(${JSON.stringify(LAST_DAY)}),
          endRequired: end ? end.required : null, startRequired: start ? start.required : null,
          close: [...document.querySelectorAll('form button')].some((b) => b.innerText.trim() === ${JSON.stringify(ONE_DAY)}) };
      })()`);
      await shot(`53-new-event-more-days-${tag}`);
      assert(
        'C',
        `N2 ${tag}: the link opens "First day" and "Last day", with "${ONE_DAY}" to close it`,
        refusedMore === null &&
          n2?.box === 'more' &&
          n2.dates === 2 &&
          n2.first &&
          n2.last &&
          n2.close &&
          n2.startRequired === true,
        JSON.stringify({ refusedMore, n2 })
      );

      // ── E — Edit Event, on the old dashboard (opened, nothing saved) ─────────────
      if (tag === '1280') {
        await c.navigate(`/plan/${evDates.id}`, 9000);
        await c.evaluate(
          `(() => { const h = [...document.querySelectorAll('h2')].find((x) => x.innerText.trim() === 'Event Details'); const card = h && h.closest('.cursor-pointer'); if (card) card.setAttribute('data-gtc385', 'details'); return !!card; })()`
        );
        const refusedCard = await c.clickGuarded('[data-gtc385="details"]', 1200);
        const e1 = await c.evaluate<any>(`(() => {
          const box = document.querySelector('.fixed [data-event-dates]');
          const labels = box ? [...box.querySelectorAll('label')].map((l) => l.innerText.trim()) : [];
          const dates = [...document.querySelectorAll('.fixed input[type=date]')].length;
          return { box: box && box.getAttribute('data-event-dates'), labels, dates,
            link: !!box && [...box.querySelectorAll('button')].some((b) => b.innerText.trim() === ${JSON.stringify(MORE_DAYS)}) };
        })()`);
        await shot(`53-edit-event-${tag}`);
        assert(
          'C',
          `E1 ${tag}: Edit Event on a one-day event opens with one "Date *" and the link`,
          refusedCard === null &&
            e1?.box === 'one' &&
            e1.dates === 1 &&
            e1.labels.join('|') === `${DATE} *` &&
            e1.link,
          JSON.stringify({ refusedCard, e1 })
        );
      }

      // ── V — Moment 2's plan, the marks ──────────────────────────────────────────
      await c.navigate(`/plan/${evPlan.id}/setup`, 7000);
      const v1 = await c.evaluate<any>(`(() => {
        const row = (name) => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === name); if (!b) return null;
          const s = b.nextElementSibling; return s && s.hasAttribute('data-dish-marks') ? s.innerText.replace(/\\s+/g, ' ').trim() : ''; };
        const key = [...document.querySelectorAll('[data-dish-key]')].map((p) => p.innerText.trim());
        return { mush: row('Stuffed mushrooms'), bread: row('Bread rolls'), wine: row('Pinot noir'), job: row('Set the tables'), key,
          wide: document.documentElement.scrollWidth <= innerWidth };
      })()`);
      await c.evaluate(
        `(() => { const k = document.querySelector('[data-dish-key]'); (k || document.querySelector('h1'))?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); return 1; })()`
      );
      await shot(`59-plan-marks-${tag}`);
      assert(
        'C',
        `V1 ${tag}: the plan shows "V GF NF" beside Stuffed mushrooms, nothing beside Bread rolls, the wine or the job, and the key once in his words`,
        v1?.mush === 'V GF NF' &&
          v1.bread === '' &&
          v1.wine === '' &&
          v1.job === '' &&
          v1.key.length === 1 &&
          v1.key[0] === PLAN_KEY &&
          v1.wide,
        JSON.stringify(v1)
      );

      // ── W — Moment 3, the marks ─────────────────────────────────────────────────
      await c.navigate(`/plan/${evM3.id}/setup`, 7000);
      const w1 = await c.evaluate<any>(`(() => {
        const row = [...document.querySelectorAll('button[data-m3-row]')].find((b) => b.innerText.includes('Stuffed mushrooms'));
        const marks = row && row.querySelector('[data-dish-marks]');
        const bread = [...document.querySelectorAll('button[data-m3-row]')].find((b) => b.innerText.includes('Bread rolls'));
        const key = [...document.querySelectorAll('[data-dish-key]')].map((p) => p.innerText.trim());
        return { marks: marks ? marks.innerText.replace(/\\s+/g, ' ').trim() : null, bread: !!bread && !bread.querySelector('[data-dish-marks]'),
          key, tap: document.body.innerText.includes('tap a dish'), wide: document.documentElement.scrollWidth <= innerWidth };
      })()`);
      await shot(`59-moment3-marks-${tag}`);
      assert(
        'C',
        `W1 ${tag}: Moment 3 shows "V GF NF" beside Stuffed mushrooms, none beside Bread rolls, and the key without "tap a dish"`,
        w1?.marks === 'V GF NF' &&
          w1.bread &&
          w1.key.length === 1 &&
          w1.key[0] === M3_KEY &&
          !w1.tap &&
          w1.wide,
        JSON.stringify(w1)
      );

      // ── W2 — Q13: every name wraps; no mark and no amount is ever cut or hidden ──────
      const w2 = await c.evaluate<any[]>(`(() => {
        const r = (x) => ({ l: x.left, r: x.right, t: x.top, b: x.bottom });
        return [...document.querySelectorAll('section button[data-m3-row]')].map((btn) => {
          const box = btn.firstElementChild;
          const name = box.firstElementChild;
          const marks = box.querySelector('[data-dish-marks]');
          const amount = box.querySelector('.ml-2');
          const parts = [];
          const add = (what, el) => { if (el) for (const q of el.getClientRects()) parts.push({ what, ...r(q) }); };
          add('name', name);
          if (marks) for (const a of marks.querySelectorAll('abbr')) add('mark ' + a.innerText.trim(), a);
          add('amount', amount);
          return { row: name.innerText.trim(), marks: marks ? marks.innerText.replace(/\\s+/g, ' ').trim() : '',
            amount: amount ? amount.innerText.trim() : '', overflowX: box.scrollWidth - box.clientWidth,
            box: r(box.getBoundingClientRect()), parts };
        });
      })()`);
      const fit = Array.isArray(w2) ? CHECKS.M3_FIT(w2) : ['no rows'];
      const lamb = (w2 ?? []).find((x) => x.row === LAMB);
      const kumara = (w2 ?? []).find((x) => x.row === KUMARA);
      await c.evaluate(
        `(() => { document.querySelector('[data-dish-key]')?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -40); return 1; })()`
      );
      await shot(`59-moment3-rows-${tag}`);
      assert(
        'C',
        `W2 ${tag}: on Moment 3 no name is cut: the long lamb name and the all-five kumara row show every mark and their "2 trays", every piece inside its row (Q13)`,
        !!lamb &&
          lamb.marks === 'GF DF NF' &&
          lamb.amount === '2 trays' &&
          !!kumara &&
          kumara.marks === 'V VG GF DF NF' &&
          kumara.amount === '2 trays' &&
          w2.length >= 4 &&
          fit.length === 0,
        JSON.stringify({ fit, lamb: lamb && { marks: lamb.marks, amount: lamb.amount } })
      );

      // ── W3 — Q14: "2 trays" moves whole; a long amount wraps inside its row ──────────
      const w3 = await c.evaluate<any>(`(() => {
        const r = (x) => ({ l: x.left, r: x.right, t: x.top, b: x.bottom });
        const rows = [...document.querySelectorAll('section button[data-m3-row]')].flatMap((btn) => {
          const box = btn.firstElementChild;
          const amount = box.querySelector('.ml-2');
          if (!amount) return [];
          const range = document.createRange();
          range.selectNodeContents(amount);
          const text = amount.innerText.trim();
          return [{ row: box.firstElementChild.innerText.trim(), amount: text, long: text === ${JSON.stringify(LONG_AMOUNT)},
            lineH: parseFloat(getComputedStyle(amount).lineHeight) || 20, box: r(box.getBoundingClientRect()),
            lines: [...range.getClientRects()].filter((q) => q.width > 0).map(r) }];
        });
        return { rows, wide: document.documentElement.scrollWidth <= innerWidth };
      })()`);
      const amountWrong = w3?.rows ? CHECKS.M3_AMOUNT(w3.rows, w3.wide) : ['no rows'];
      const amountOf = (name: string) => (w3?.rows ?? []).find((x: any) => x.row === name)?.amount;
      assert(
        'C',
        `W3 ${tag}: on Moment 3 "2 trays" is never split (it moves to the next line whole), and Pavlova's long free-text amount wraps inside its row with no sideways scroll (Q14)`,
        amountOf(LAMB) === '2 trays' &&
          amountOf(KUMARA) === '2 trays' &&
          amountOf('Stuffed mushrooms') === '2 trays' &&
          amountOf(PAVLOVA) === LONG_AMOUNT &&
          amountWrong.length === 0,
        JSON.stringify({ amountWrong })
      );
    }

    // ── T — the ticks: untick Gluten-free on Stuffed mushrooms and save (1280) ──────
    await c.setViewport(1280, 900, false);
    await c.navigate(`/plan/${evPlan.id}/setup`, 7000);
    const mark = (sel: string, js: string) =>
      c.evaluate(
        `(() => { const el = ${js}; if (el) el.setAttribute('data-gtc385', ${JSON.stringify(sel)}); return !!el; })()`
      );
    await mark('edit', `${ROW_EDIT}('Stuffed mushrooms')`);
    const refusedEdit = await c.clickGuarded('[data-gtc385="edit"]', 600);
    const t1 = await c.evaluate<any>(`(() => {
      const f = document.querySelector('[data-dish-ticks]');
      return f ? [...f.querySelectorAll('label')].map((l) => (l.querySelector('input').checked ? '+' : '-') + l.innerText.trim()) : null;
    })()`);
    await shot('59-editor-ticks-1280');
    assert(
      'C',
      'T1 1280: the dish editor shows the five ticks, Vegetarian, Gluten-free and Nut-free ticked',
      refusedEdit === null &&
        Array.isArray(t1) &&
        t1.join('|') === '+Vegetarian|-Vegan|+Gluten-free|-Dairy-free|+Nut-free',
      JSON.stringify({ refusedEdit, t1 })
    );
    await mark('gf', `document.querySelector('[data-dish-ticks] input[value="GF"]')`);
    const refusedGf = await c.clickGuarded('[data-gtc385="gf"]', 300);
    await mark(
      'save',
      `[...document.querySelectorAll('[data-dish-ticks]')].length ? [...document.querySelector('[data-dish-ticks]').closest('div.border').querySelectorAll('button')].find((b) => b.innerText.trim() === 'Save') : null`
    );
    const refusedSave = await c.clickGuarded('[data-gtc385="save"]', 2500);
    const saved = await prisma.item.findUnique({
      where: { id: dishIds['Stuffed mushrooms'] },
      select: { dietaryTags: true, source: true },
    });
    const shown = await c.evaluate<string>(
      `(() => { const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Stuffed mushrooms'); const s = b && b.nextElementSibling; return s && s.hasAttribute('data-dish-marks') ? s.innerText.replace(/\\s+/g, ' ').trim() : ''; })()`
    );
    assert(
      'C',
      'T2 unticked and saved: the row’s tags lose GLUTEN_FREE through the item PATCH, it is HOST_EDITED (kept by a regenerate), and the row shows "V NF"',
      refusedGf === null &&
        refusedSave === null &&
        JSON.stringify(saved?.dietaryTags) === JSON.stringify(['VEGETARIAN', 'NUT_FREE']) &&
        saved?.source === 'HOST_EDITED' &&
        shown === 'V NF',
      JSON.stringify({ refusedGf, refusedSave, saved, shown })
    );
    await mark('wine', `${ROW_EDIT}('Pinot noir')`);
    const refusedWine = await c.clickGuarded('[data-gtc385="wine"]', 600);
    const t3 = await c.evaluate<any>(
      `({ editor: [...document.querySelectorAll('input')].some((i) => i.value === 'Pinot noir'), ticks: !!document.querySelector('[data-dish-ticks]') })`
    );
    const wine = await prisma.item.findUnique({
      where: { id: dishIds['Pinot noir'] },
      select: { dietaryTags: true, source: true },
    });
    assert(
      'C',
      'T3 CONTROL 1280: the wine’s editor has no ticks, and nothing about it was saved',
      refusedWine === null &&
        t3?.editor === true &&
        t3.ticks === false &&
        JSON.stringify(wine?.dietaryTags) ===
          JSON.stringify(['VEGAN', 'GLUTEN_FREE', 'DAIRY_FREE']) &&
        wine?.source === 'GENERATED',
      JSON.stringify({ refusedWine, t3, wine })
    );

    // ── G — the one press (Q5): Generate, held by the stand-in, then a 500 ──────────
    await c.navigate(`/plan/${evGen.id}/setup`, 7000);
    const gen = await c.evaluate<any>(`(() => {
      const b = [...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Generate plan →');
      if (!b || b.disabled) return { found: !!b, disabled: b ? b.disabled : null };
      b.scrollIntoView({ block: 'center' });
      const r = b.getBoundingClientRect(); const x = r.left + r.width / 2; const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      if (!hit || !b.contains(hit)) return { found: true, why: 'the point is not inside the button' };
      b.setAttribute('data-gtc385', 'generate');
      return { found: true, ok: true };
    })()`);
    assert(
      'C',
      'C3 PRECONDITION: the questions show "Generate plan →", enabled, and the point is inside it',
      gen?.ok === true,
      JSON.stringify(gen)
    );
    if (gen?.ok === true) {
      // The one unguarded click in the suite, on the one control Q5 allows; checked just above.
      await c.click('[data-gtc385="generate"]');
      await sleep(1100);
      const read1 = `(() => { const b = document.querySelector('[role=progressbar]'); const w = document.querySelector('[data-plan-wait] p');
        return { calls: window.__gtc385.calls, pending: !!window.__gtc385.pending, now: b ? Number(b.getAttribute('aria-valuenow')) : null,
          stage: w ? w.innerText.trim() : null, heading: document.body.innerText.includes(${JSON.stringify(WAIT_HEADING)}) }; })()`;
      const g1 = await c.evaluate<any>(read1);
      await shot('58-waiting-1280');
      await c.setViewport(390, 844, true);
      await sleep(400);
      await shot('58-waiting-390');
      await c.setViewport(1280, 900, false);
      await sleep(12_500);
      const g2 = await c.evaluate<any>(read1);
      assert(
        'G',
        'G1 pressed once; the request held in the page; the bar rises from the start and stays under 95; "Reading your answers…" then "Choosing the dishes…"; the heading stays',
        g1?.calls === 1 &&
          g1.pending &&
          g2?.calls === 1 &&
          typeof g1.now === 'number' &&
          typeof g2.now === 'number' &&
          g1.now > 0 &&
          g2.now > g1.now &&
          g2.now < 95 &&
          g1.stage === STAGES[0] &&
          g2.stage === STAGES[1] &&
          g1.heading &&
          g2.heading,
        JSON.stringify({ g1, g2 })
      );
      standIn = await c.evaluate<string>(`window.__gtc385.answer(500)`);
      await sleep(1500);
      const g3 = await c.evaluate<any>(`(() => ({
        toast: document.body.innerText.includes(${JSON.stringify(TOAST_FAILED)}),
        questions: [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Generate plan →' && b.checkVisibility()),
        bar: !!document.querySelector('[role=progressbar]'), calls: window.__gtc385.calls }))()`);
      await shot('58-after-failure-1280');
      assert(
        'G',
        'G2 answered 500: the same toast, and she is back on the questions (Q4)',
        standIn === 'answered 500' && g3?.toast && g3.questions && !g3.bar && g3.calls === 1,
        JSON.stringify({ standIn, g3 })
      );
    }
    void text;
    blocked = c.planMakingBlocked();
    hosts = c.hostsRequested();
    dialogs = c.dialogs();
  } finally {
    urlLog?.close();
    chrome?.close();
  }

  const outside = CHECKS.K1_OUTSIDE(urls);
  const hostOf = (u: string) => {
    try {
      return new URL(u).host;
    } catch {
      return '(unparsable)';
    }
  };
  assert(
    'K',
    'K1 CONTROL: every address Chrome asked for is on localhost:3000, or a data: or about: address by name; the helper saw no host the address log did not; nothing blocked but the two probes (the stand-in held finalize-plan in the page); no dialog',
    urls.length > 0 &&
      outside.length === 0 &&
      hosts.length > 0 &&
      hosts.every((x) => urls.some((u) => hostOf(u) === x)) &&
      blocked.length === 2 &&
      blocked.every((x) => /gtc385-probe/.test(x)) &&
      dialogs.length === 0,
    `${urls.length} addresses | outside: ${outside.map((u) => u.slice(0, 80)).join(' , ')} | hosts ${hosts.join(',')} | ${blocked.join(' | ')} | ${dialogs.join(',')}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  const genItems = await prisma.item.count({ where: { team: { eventId: evGen.id } } });
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Person, User, Session, Team, Item, AccessToken, AuditEntry, OutboundMessage, InviteEvent): ${whileExists}`
  );
  console.log(`    aiCallsUsed while it existed: ${ai.join(',')}`);
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on every fixture event and no row on the pressed one; nothing queued; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 4 &&
      ai.every((x) => x === 0) &&
      genItems === 0 &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `ai ${ai} | gen items ${genItems} | ${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
  );
}

let cleaned = false;
async function cleanup() {
  if (cleaned) return;
  cleaned = true;
  const del = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (e) {
      console.error('cleanup:', (e as Error).message.split('\n')[0]);
    }
  };
  // Every row below was made by this suite: its four events and what hangs off them (the audit
  // rows a PATCH writes carry no foreign key, so they are removed by their event), its person,
  // its user and that user's sessions.
  const evIds = created.events;
  const tokenIds = (
    await prisma.accessToken.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((t) => t.id);
  await del(() => prisma.accessToken.deleteMany({ where: { id: { in: tokenIds } } }));
  const auditIds = (
    await prisma.auditEntry.findMany({ where: { eventId: { in: evIds } }, select: { id: true } })
  ).map((a) => a.id);
  await del(() => prisma.auditEntry.deleteMany({ where: { id: { in: auditIds } } }));
  await del(() => prisma.event.deleteMany({ where: { id: { in: evIds } } }));
  const sessionIds = (
    await prisma.session.findMany({
      where: { userId: { in: created.users } },
      select: { id: true },
    })
  ).map((s) => s.id);
  await del(() => prisma.session.deleteMany({ where: { id: { in: sessionIds } } }));
  await del(() => prisma.person.deleteMany({ where: { id: { in: created.people } } }));
  await del(() => prisma.user.deleteMany({ where: { id: { in: created.users } } }));
}

async function main() {
  await runInMemory();
  await runLive();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (redAssertions.length) {
    console.log('\nRED:');
    for (const x of redAssertions) console.log(`  ${x}`);
  }
}

main()
  .catch(async (e) => {
    console.error(e);
    failed++;
    await cleanup();
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
