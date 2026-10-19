/**
 * GTC-386 — walkthrough batch 16: the 14 Oct walk's third batch, items 66 and 68.
 *
 * Nigel walked the launch code on 2026-10-14 ("Gather Tweaks 2"). This suite pins the two items
 * to his plan rulings (GTC-386, Q1 to Q8, 2026-10-15):
 *
 *   66  step 4 of the pre-flight in three labelled parts, in this order: "What guests will
 *       receive" (her line, the notes, "Read it as", each person's own nudge choice and the
 *       message, in today's order, Q4), "How I nudge" (the question "When someone hasn’t answered
 *       and has no mobile I can text, how do you want to handle it?" and the two choices as they
 *       are, on step 4 and after the press, Q3) and "People I’ll leave to you" (group A under
 *       "I won't message them", its line without its first sentence, then group B under "I'll
 *       ask, but won't nudge", Q1, Q1b, Q2); the blurb "Exactly what each person will receive,
 *       how I nudge, and who I’ll leave to you." (Q5); the labels in Moment 2's quiet
 *       small-capitals divider (Q6); the choice buttons say which one is on (aria-pressed)
 *   68  the five ticks remembered in this browser, per event and per person (Q8): a step number
 *       and a short fingerprint, no names; a tick goes when what its step shows changed somewhere
 *       other than this page, Ready with any of steps 1 to 4 (Q7); a settled step never stored;
 *       forgotten after the press; blocked storage leaves the page as it was
 *
 * Layers W, R, P and S run in memory (words, renders, pure functions and source). Layer C drives
 * the dev server in the walled-off headless Chrome (port 9483) at 1280 and 390, on a fixture of
 * its own (example.com addresses, no phones, nothing queued), behind the three safeguards of
 * GATHER-BUILD-CONSTANTS.md and the send wall, proven on probe URLs first. Send is never pressed.
 * The live checks read facts from the page; the conditions are the pure functions between the
 * CHECKS markers, dry-run on a passing and a failing input before RED.
 *
 * Every new assertion carries a presence clause, so a check of something absent cannot pass before
 * the build.
 *
 * GTC386_SHOTS=before|after saves pictures to ~/Desktop/GTC-386 looks; unset, none are taken.
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
import * as APC from '../src/lib/preflight/ask-preview-compose';
import { Pill } from '../src/components/preflight/mark-rows';

const realFetch = globalThis.fetch;
installProviderTrap();
const BASE = 'http://localhost:3000';
const ROOT = process.cwd();
const PORT = 9483;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const SHOTS = process.env.GTC386_SHOTS ?? '';
const SHOT_DIR = join(homedir(), 'Desktop', 'GTC-386 looks');

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
/** The file as it stands at HEAD. */
const atHead = (rel: string) => git(['show', `HEAD:${rel}`]).stdout ?? '';

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
  try {
    walk(rel);
  } catch {
    // an absent directory has no files
  }
  return out;
}

const PAGE = 'src/app/plan/[eventId]/pre-flight/page.tsx';
const ROUTE = 'src/app/api/events/[id]/pre-flight/route.ts';
const AFTER = 'src/components/preflight/AfterThePress.tsx';
const MEMORY = 'src/lib/preflight/tick-memory.ts';
const MOMENT2 = 'src/components/plan/Moment2Step1Modal.tsx';

// ─── The ruled words (GTC-386 plan rulings, 2026-10-15) ───────────────────────

const PARTS = ['What guests will receive', 'How I nudge', 'People I’ll leave to you'];
const QUESTION =
  'When someone hasn’t answered and has no mobile I can text, how do you want to handle it?';
const BLURB = 'Exactly what each person will receive, how I nudge, and who I’ll leave to you.';
const OLD_BLURB = "Exactly what each person will receive, and who I'll nudge.";
const A_LINE = 'Each is named with what they have been asked for, and why it comes to you.';
const DROPPED = 'Gather will not message these people.';
const OLD_STATEMENTS = [
  "When someone hasn't answered and has no mobile I can text, I'll nudge them by email.",
  "When someone hasn't answered and has no mobile I can text, I'll leave them to you.",
];
/** As they stand at HEAD, for the controls. */
const A_HEAD = "I won't message them";
const B_HEAD = "I'll ask, but won't nudge";
const B_LINE =
  "Their asks go out, and I won't follow up on them. If they haven't answered, they're yours.";
const PILLS = { BY_EMAIL: 'Nudge them by email', HAND_TO_HOST: 'Leave them to me' };
const SUFFIX = ' (the default)';
/** Moment 2's quiet small-capitals divider (Moment2Step1Modal L784, L938), Q6. */
const DIVIDER = 'text-xs uppercase tracking-wider text-gray-500';
const DIVIDER_RULE = 'mt-6 mb-2 border-t border-gray-200 pt-4';
/** Pill's class at HEAD (mark-rows.tsx L61-66), active and not. */
const PILL_ON =
  'px-3 py-1.5 text-sm rounded-full border transition-colors bg-accent text-white border-accent';
const PILL_OFF =
  'px-3 py-1.5 text-sm rounded-full border transition-colors bg-white text-gray-600 border-gray-300 hover:border-gray-400';
const KEY_PREFIX = 'gather:preflight-ticks:';
const FIXTURE_WORDS = [
  'Kate',
  'Lowe',
  'Gus',
  'Mere',
  'Hine',
  'Tama',
  'Jo ',
  'example.com',
  'Pavlova',
  'salad',
  '@',
];

/** Every `<button …>text</button>` in a render, as [opening tag, text]. */
const buttons = (h: string) =>
  [...h.matchAll(/(<button\b[^>]*>)([^<]*)<\/button>/g)].map((m) => [m[1], m[2]] as const);

// ── CHECKS ── (pure; dry-run on a passing and a failing input before RED)
const CHECKS = {
  /** R1: one Pill, its words, HEAD's class, and the pressed marker. */
  R_PILL: (h: string, text: string, pressed: boolean) => {
    const b = buttons(h);
    return (
      b.length === 1 &&
      b[0][1] === text &&
      b[0][0].includes(`class="${pressed ? PILL_ON : PILL_OFF}"`) &&
      b[0][0].includes(`aria-pressed="${pressed}"`)
    );
  },
  /** R2: after the press, the question once, then both choices, the default marked and pressed. */
  R_SWITCH: (h: string) => {
    const b = buttons(h);
    const on = b.find((x) => x[1] === PILLS.BY_EMAIL + SUFFIX);
    const off = b.find((x) => x[1] === PILLS.HAND_TO_HOST);
    return (
      h.split(`>${QUESTION}</p>`).length === 2 &&
      !!on &&
      !!off &&
      on[0].includes('aria-pressed="true"') &&
      off[0].includes('aria-pressed="false"') &&
      h.indexOf(QUESTION) < h.indexOf(PILLS.BY_EMAIL) &&
      OLD_STATEMENTS.every((s) => !h.includes(s) && !h.includes(s.replace(/'/g, '&#x27;')))
    );
  },
  /** C1: three parts in order, each opening with its label. */
  C_PARTS: (f: any) =>
    !!f &&
    JSON.stringify(f.order) === '["1","2","3"]' &&
    JSON.stringify(f.labels) === JSON.stringify(PARTS) &&
    f.firstTags.every((t: string) => t === 'H3'),
  /** C2: part 1 holds the message, the amber box, her line, "Read it as" and the per-person choice, in that order (GTC-394 tweak 7; it was her line first, the message last). */
  C_PART1: (f: any) =>
    !!f &&
    f.p1.every((i: number) => i >= 0) &&
    f.p1.every((i: number, k: number) => k === 0 || i > f.p1[k - 1]) &&
    f.p1Elsewhere === false,
  /** C3: part 2 is the question and exactly the two choices, one pressed. */
  C_PART2: (f: any, expectOn: string) =>
    !!f &&
    f.question === QUESTION &&
    f.pills.length === 2 &&
    f.pills.filter((p: any) => p.pressed === 'true').length === 1 &&
    f.pills.find((p: any) => p.pressed === 'true')?.text === expectOn &&
    f.pills.every((p: any) => p.pressed === 'true' || p.pressed === 'false') &&
    !f.oldStatement,
  /** C4: part 3 is group A (its heading, its line, its names), then group B (Gus), nothing false above. */
  C_PART3: (f: any) =>
    !!f &&
    f.p3.aHead >= 0 &&
    f.p3.aLine > f.p3.aHead &&
    f.p3.mere > f.p3.aLine &&
    f.p3.hine > f.p3.aLine &&
    f.p3.bHead > Math.max(f.p3.mere, f.p3.hine) &&
    f.p3.gus > f.p3.bHead &&
    f.p3.gusFirst === f.p3.gus &&
    f.dropped === false &&
    f.oldLabel === false &&
    f.bInPart2 === false,
  /** C5: the three labels look alike, in small capitals, Moment 2's grey. */
  C_LOOK: (f: any) =>
    !!f &&
    f.styles.length === 3 &&
    f.styles.every((s: string) => s === f.styles[0]) &&
    /^uppercase\|12px\|rgb\(107, 114, 128\)/.test(f.styles[0]),
  /** C6: the closed row's blurb, and no sideways scroll. */
  C_ROW: (f: any, width: number) =>
    !!f && f.blurb === true && f.oldBlurb === false && f.scrollWidth <= width,
  /** C8: the stored entry for this event and this person: step numbers and short prints, no names. */
  C_STORED: (store: any, key: string, steps: number[]) => {
    if (!store || store.error) return false;
    const raw = store[key];
    if (typeof raw !== 'string') return false;
    let v: any;
    try {
      v = JSON.parse(raw);
    } catch {
      return false;
    }
    const keys = Object.keys(v?.ticks ?? {}).sort();
    return (
      v.v === 1 &&
      JSON.stringify(keys) === JSON.stringify(steps.map(String)) &&
      keys.every((k) => typeof v.ticks[k] === 'string' && v.ticks[k].length <= 16) &&
      FIXTURE_WORDS.every((w) => !raw.includes(w))
    );
  },
  /** C19: this event's entry was there before it was sent and is gone after; another event's stays; the question with the default pressed. */
  C_GONE: (before: any, after: any, q: any, key: string, other: string) =>
    typeof before[key] === 'string' &&
    after[key] === undefined &&
    typeof after[other] === 'string' &&
    q.q === true &&
    q.on.includes(PILLS.BY_EMAIL + SUFFIX),
  /** The five boxes as expected (true, false), read from the page or from its first frame. */
  C_BOXES: (seen: any, expect: boolean[]) =>
    !!seen && [1, 2, 3, 4, 5].every((n, i) => seen[n] === expect[i]),
};
// ── END CHECKS ──

// ─── Layers W, R, P, S: in memory ─────────────────────────────────────────────

async function runInMemory() {
  const A = APC as any;

  // W — the words.
  assert(
    'W',
    'W1 the three parts’ labels, in order (Q1b, ruled words)',
    ok(() => JSON.stringify(A.MESSAGE_STEP_PARTS) === JSON.stringify(PARTS))
  );
  assert(
    'W',
    'W2 the list’s heading is part 3’s label, one spelling (Q1b)',
    ok(() => A.HOST_LIST_HEADING === PARTS[2] && A.MESSAGE_STEP_PARTS[2] === A.HOST_LIST_HEADING)
  );
  assert(
    'W',
    'W3 the question (Q3)',
    ok(() => A.CHASE_DEFAULT_QUESTION === QUESTION)
  );
  assert(
    'W',
    'W4 the statement is gone from the module, so no screen can draw it (Q3)',
    ok(() => A.CHASE_DEFAULT_QUESTION === QUESTION && !('CHASE_DEFAULT_SENTENCE' in A))
  );
  assert(
    'W',
    'W5 group A’s line without its first sentence (Q2)',
    ok(() => A.HOST_LIST_BLURB === A_LINE)
  );
  assert(
    'W',
    'W6 CONTROL: the two choices, the default suffix and both groups’ headings and B’s line as at HEAD',
    ok(
      () =>
        JSON.stringify(A.CHASE_DEFAULT_PILLS) === JSON.stringify(PILLS) &&
        A.DEFAULT_SUFFIX === SUFFIX &&
        A.HOST_LIST_NOT_ASKED_HEADING === A_HEAD &&
        A.HOST_LIST_NOT_CHASED_HEADING === B_HEAD &&
        A.HOST_LIST_NOT_CHASED_BLURB === B_LINE &&
        A.HOST_LIST_EMPTY === 'Nobody.'
    )
  );

  // R — renders.
  const on = render(
    createElement(Pill, { active: true, onClick: () => {} }, 'Nudge them by email')
  );
  const off = render(createElement(Pill, { active: false, onClick: () => {} }, 'Leave them to me'));
  assert(
    'R',
    'R1 a choice button says whether it is on (aria-pressed), its words and class as at HEAD',
    ok(
      () =>
        CHECKS.R_PILL(on, 'Nudge them by email', true) &&
        CHECKS.R_PILL(off, 'Leave them to me', false)
    ),
    `${on} | ${off}`
  );
  const AP = await load('../src/components/preflight/AfterThePress');
  const after = AP?.AfterThePressView
    ? render(
        createElement(AP.AfterThePressView, {
          eventName: 'GTC-386 walk',
          sentAt: new Date('2026-10-15T01:00:00Z').toISOString(),
          pace: null,
          households: [],
          unhoused: [],
          chase: { stored: null, resolved: 'BY_EMAIL', byRecipient: {} },
          saving: false,
          error: null,
          onMark: () => {},
          onException: () => {},
          onDefault: () => {},
        })
      )
    : '';
  assert(
    'R',
    'R2 after the press, the switch asks the question, the default marked and pressed (Q3)',
    ok(() => after.includes('Who I nudge') && CHECKS.R_SWITCH(after)),
    after.slice(after.indexOf('<section'), after.indexOf('<section') + 400)
  );

  // P — the tick memory, no browser.
  const TM = await load('../src/lib/preflight/tick-memory');
  const fns = [
    'tickKey',
    'readTicks',
    'writeTicks',
    'forgetTicks',
    'printOf',
    'standingTicks',
    'settleStepFour',
    'preflightPrints',
    'browserStore',
  ];
  assert(
    'P',
    'P1 the module and its nine pure pieces exist',
    ok(
      () =>
        !!TM && fns.every((f) => typeof TM[f] === 'function') && typeof TM.READY_PRINT === 'string'
    ),
    TM ? fns.filter((f) => typeof TM[f] !== 'function').join(',') : 'no module'
  );
  assert(
    'P',
    'P2 one key per event and per person (Q8)',
    ok(() => {
      const k = TM.tickKey('ev1', 'u1');
      return (
        k === `${KEY_PREFIX}ev1:u1` &&
        k !== TM.tickKey('ev1', 'u2') &&
        k !== TM.tickKey('ev2', 'u1')
      );
    })
  );
  const mapStore = () => {
    const m = new Map<string, string>();
    return {
      m,
      getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    };
  };
  assert(
    'P',
    'P3 written, read back the same; an empty set leaves nothing stored',
    ok(() => {
      const s = mapStore();
      const t = { 1: 'a1b2c3d4', 2: '0f0f0f0f' };
      const wrote = TM.writeTicks(s, 'k', t);
      const back = TM.readTicks(s, 'k');
      const raw = JSON.parse(s.m.get('k')!);
      TM.writeTicks(s, 'k', {});
      return (
        wrote === true && JSON.stringify(back) === JSON.stringify(t) && raw.v === 1 && !s.m.has('k')
      );
    })
  );
  assert(
    'P',
    'P4 storage that throws, or none: read is empty, write says false, forget is quiet',
    ok(() => {
      const boom = () => {
        throw new Error('SecurityError');
      };
      const bad = { getItem: boom, setItem: boom, removeItem: boom };
      TM.forgetTicks(bad, 'k');
      TM.forgetTicks(null, 'k');
      return (
        JSON.stringify(TM.readTicks(bad, 'k')) === '{}' &&
        TM.writeTicks(bad, 'k', { 1: 'a1b2c3d4' }) === false &&
        JSON.stringify(TM.readTicks(null, 'k')) === '{}' &&
        TM.writeTicks(null, 'k', { 1: 'a1b2c3d4' }) === false
      );
    })
  );
  assert(
    'P',
    'P5 anything malformed reads as nothing: not JSON, another version, a step out of range, a print not a string',
    ok(() => {
      const s = mapStore();
      s.setItem('a', 'not json');
      s.setItem('b', JSON.stringify({ v: 2, ticks: { 1: 'a1b2c3d4' } }));
      s.setItem('c', JSON.stringify({ v: 1, ticks: { 7: 'a1b2c3d4', 1: 5, 2: 'a1b2c3d4' } }));
      return (
        JSON.stringify(TM.readTicks(s, 'a')) === '{}' &&
        JSON.stringify(TM.readTicks(s, 'b')) === '{}' &&
        JSON.stringify(TM.readTicks(s, 'c')) === JSON.stringify({ 2: 'a1b2c3d4' })
      );
    })
  );
  assert(
    'P',
    'P6 a fingerprint: the same data twice is the same print, key order does not matter, other data differs',
    ok(() => {
      const a = TM.printOf({ x: 1, y: [1, 2], z: { b: 2, a: 1 } });
      return (
        /^[0-9a-f]{8}$/.test(a) &&
        a === TM.printOf({ z: { a: 1, b: 2 }, y: [1, 2], x: 1 }) &&
        a !== TM.printOf({ x: 1, y: [2, 1], z: { b: 2, a: 1 } })
      );
    })
  );
  const sample = (over: any = {}) => ({
    event: { nudgePace: null, ...(over.event ?? {}) },
    coverage: {
      unassignedItems: [{ id: 'i1', name: 'Pavlova', critical: false, teamName: 'Mains' }],
      ...(over.coverage ?? {}),
    },
    dietary: over.dietary ?? { status: 'unanswered', requirements: [] },
    households: [
      {
        id: 'h1',
        label: 'Kate Lowe',
        littleCount: 0,
        contactPersonEventId: null,
        resolvedContactPersonEventId: 'pe1',
        members: [
          {
            personEventId: 'pe1',
            name: 'Kate Lowe',
            email: 'kate@example.com',
            nudgeMark: null,
            householdRole: 'PRIMARY_CONTACT',
          },
        ],
      },
    ],
    unhoused: [],
    channelCandidates: [],
  });
  assert(
    'P',
    'P7 what is stored holds no name, address or item: prints of named data, written',
    ok(() => {
      const s = mapStore();
      const p = TM.preflightPrints(sample());
      TM.writeTicks(s, 'k', { 1: p[1], 2: p[2], 3: p[3], 5: TM.READY_PRINT });
      const raw = s.m.get('k')!;
      return (
        [1, 2, 3].every((n) => /^[0-9a-f]{8}$/.test(p[n])) &&
        FIXTURE_WORDS.every((w) => !raw.includes(w))
      );
    })
  );
  assert(
    'P',
    'P8 each step’s print moves with that step only: a new critical item, the dietary answer, the pace',
    ok(() => {
      const p = TM.preflightPrints(sample());
      const c = TM.preflightPrints(
        sample({
          coverage: {
            unassignedItems: [{ id: 'i1', name: 'Pavlova', critical: true, teamName: 'Mains' }],
          },
        })
      );
      const d = TM.preflightPrints(
        sample({ dietary: { status: 'confirmed_none', requirements: [] } })
      );
      const e = TM.preflightPrints(sample({ event: { nudgePace: 'RELAXED' } }));
      return (
        c[1] !== p[1] &&
        c[2] === p[2] &&
        c[3] === p[3] &&
        d[2] !== p[2] &&
        d[1] === p[1] &&
        d[3] === p[3] &&
        e[3] !== p[3] &&
        e[1] === p[1] &&
        e[2] === p[2]
      );
    })
  );
  assert(
    'P',
    'P9 the rule (Q7): a changed print drops that step only; Ready goes with any of 1 to 4; a settled step is never kept; step 4 unknown yet stays',
    ok(() => {
      const stored = {
        1: 'aaaaaaaa',
        2: 'bbbbbbbb',
        3: 'cccccccc',
        4: 'dddddddd',
        5: TM.READY_PRINT,
      };
      const same = { 1: 'aaaaaaaa', 2: 'bbbbbbbb', 3: 'cccccccc', 4: 'dddddddd' };
      const keep = TM.standingTicks(stored, same, {});
      const moved = TM.standingTicks(stored, { ...same, 2: 'eeeeeeee' }, {});
      const settled = TM.standingTicks(stored, same, { 1: true, 2: true });
      const pending = TM.standingTicks(stored, { ...same, 4: null }, {});
      return (
        JSON.stringify(Object.keys(keep)) === '["1","2","3","4","5"]' &&
        JSON.stringify(Object.keys(moved)) === '["1","3","4"]' &&
        JSON.stringify(Object.keys(settled)) === '["3","4","5"]' &&
        JSON.stringify(Object.keys(pending)) === '["1","2","3","4","5"]'
      );
    })
  );
  assert(
    'P',
    'P10 step 4 checked when its message arrives: the same print keeps it, another drops it and Ready',
    ok(() => {
      const t = { 1: 'aaaaaaaa', 4: 'dddddddd', 5: TM.READY_PRINT };
      return (
        JSON.stringify(TM.settleStepFour(t, 'dddddddd')) === JSON.stringify(t) &&
        JSON.stringify(Object.keys(TM.settleStepFour(t, 'ffffffff'))) === '["1"]' &&
        JSON.stringify(TM.settleStepFour({ 1: 'aaaaaaaa' }, 'ffffffff')) ===
          JSON.stringify({ 1: 'aaaaaaaa' })
      );
    })
  );

  // S — source.
  const raw = read(PAGE);
  const page = codeOnly(raw);
  assert(
    'S',
    'S1 step 4’s blurb is the ruled one, literal in the page; the old one is gone (Q5)',
    raw.includes(`blurb="${BLURB}"`) && !raw.includes(OLD_BLURB)
  );
  const at = (n: number) => page.indexOf(`data-message-part="${n}"`);
  const msgFn = page.slice(page.indexOf('function MessageStep'));
  const mAt = (s: string) => msgFn.indexOf(s);
  const p1 = msgFn.indexOf('data-message-part="1"');
  const p2 = msgFn.indexOf('data-message-part="2"');
  const p3 = msgFn.indexOf('data-message-part="3"');
  assert(
    'S',
    'S2 MessageStep draws its three parts in order, each label from the module; her line, the per-person choice and the message in part 1; the question in part 2; group A then group B in part 3 (Q1, Q4)',
    at(1) > 0 &&
      p1 > 0 &&
      p2 > p1 &&
      p3 > p2 &&
      /\{MESSAGE_STEP_PARTS\[0\]\}/.test(msgFn.slice(p1, p2)) &&
      /\{MESSAGE_STEP_PARTS\[1\]\}/.test(msgFn.slice(p2, p3)) &&
      /\{HOST_LIST_HEADING\}/.test(msgFn.slice(p3)) &&
      mAt('Your line') > p1 &&
      mAt('Your line') < p2 &&
      mAt('chasePersonPills(') > p1 &&
      mAt('chasePersonPills(') < p2 &&
      mAt('current.ask.movements') > p1 &&
      mAt('current.ask.movements') < p2 &&
      mAt('{CHASE_DEFAULT_QUESTION}') > p2 &&
      mAt('{CHASE_DEFAULT_QUESTION}') < p3 &&
      mAt('{HOST_LIST_NOT_ASKED_HEADING}') > p3 &&
      mAt('{HOST_LIST_NOT_CHASED_HEADING}') > mAt('{HOST_LIST_NOT_ASKED_HEADING}')
  );
  const h3s = [...msgFn.matchAll(/<h3 className="([^"]*)"/g)].map((m) => m[1]);
  assert(
    'S',
    'S3 the three labels wear Moment 2’s small-capitals divider; parts 2 and 3 with its rule (Q6)',
    h3s.length === 3 &&
      h3s.every((c) => c.startsWith(DIVIDER)) &&
      h3s.slice(1).every((c) => c === `${DIVIDER} ${DIVIDER_RULE}`) &&
      read(MOMENT2).includes(`"${DIVIDER} ${DIVIDER_RULE}"`),
    h3s.join(' | ')
  );
  const srcFiles = filesUnder('src');
  const sentenceUsers = srcFiles.filter((f) => read(f).includes('CHASE_DEFAULT_SENTENCE'));
  assert(
    'S',
    'S4 the question on both screens: the page and AfterThePress draw {CHASE_DEFAULT_QUESTION}; nothing in src names the statement (Q3)',
    /\{CHASE_DEFAULT_QUESTION\}/.test(page) &&
      /\{CHASE_DEFAULT_QUESTION\}/.test(codeOnly(read(AFTER))) &&
      sentenceUsers.length === 0,
    sentenceUsers.join(',')
  );
  assert(
    'S',
    'S5 the ticks go through the memory module: imported, no storage call in the page, one tick() for all five boxes, the old comment gone',
    /from '@\/lib\/preflight\/tick-memory'/.test(page) &&
      !/localStorage|sessionStorage/.test(page) &&
      [1, 2, 3, 4, 5].every((n) => page.includes(`onCheck={(v) => tick(${n}, v)}`)) &&
      !raw.includes('CLIENT STATE ONLY')
  );
  const mem = read(MEMORY);
  assert(
    'S',
    'S6 the memory module touches storage only inside a try, and is client-safe (no prisma, no server import)',
    mem.length > 0 &&
      /window\.localStorage/.test(mem) &&
      !/PrismaClient|@\/lib\/prisma|next\/server/.test(mem) &&
      codeOnly(mem)
        .split('\n')
        .filter((l) => /localStorage/.test(l))
        .every(() => /try\s*\{[\s\S]*window\.localStorage[\s\S]*\}\s*catch/.test(codeOnly(mem)))
  );
  const branch = page.indexOf('if (data.event.sentAt)');
  const pageFn = page.slice(page.indexOf('export default function PreFlightPage'));
  const tail = pageFn.slice(pageFn.indexOf('if (data.event.sentAt)'), pageFn.indexOf('\n}\n'));
  const headSrc = atHead(PAGE);
  const slicePress = (s: string) =>
    s.slice(s.indexOf('const press = useCallback'), s.indexOf('}, [eventId, pressing, pressed]);'));
  const sendOf = (s: string) => {
    const i = s.indexOf('<button\n            type="button"\n            disabled={!allChecked');
    return i < 0 ? '' : s.slice(i, s.indexOf('</button>', i));
  };
  assert(
    'S',
    'S7 CONTROL: no hook after the after-the-press return; the press handler and Send byte for byte as at HEAD',
    branch > 0 &&
      tail.length > 0 &&
      !/\buse(State|Effect|Callback|Memo|Ref|Params)\(/.test(tail) &&
      slicePress(headSrc).length > 100 &&
      slicePress(read(PAGE)) === slicePress(headSrc) &&
      sendOf(headSrc).length > 100 &&
      sendOf(read(PAGE)) === sendOf(headSrc)
  );
  const route = codeOnly(read(ROUTE));
  assert(
    'S',
    'S8 the pre-flight answer says who is looking, from the guard it already runs; the guard unchanged (Q8)',
    /requireEventRole\(eventId, \['HOST', 'COHOST'\]\)/.test(route) &&
      /viewerId:\s*auth\.user\.id/.test(route)
  );
  const newApi = git(['status', '--porcelain', '--', 'src/app/api'])
    .stdout.split('\n')
    .filter((l) => l.startsWith('??'));
  assert(
    'S',
    'S9 CONTROL: no new route; schema, migrations, the route inventory, the security suite, Zone 4 and the AI untouched',
    newApi.length === 0 &&
      unchanged('prisma') &&
      unchanged('route-classifications.json') &&
      unchanged('src/app/api/billing') &&
      unchanged('src/lib/ai') &&
      filesUnder('tests')
        .filter((f) => /^tests\/security-/.test(f))
        .every(unchanged),
    newApi.join(',')
  );
}

// ─── Layer C: in the browser ──────────────────────────────────────────────────

const created = {
  users: [] as string[],
  people: [] as string[],
  events: [] as string[],
};

/** What step 4 shows, as facts; the conditions are CHECKS. */
const STEP4_FACTS = `(() => {
  const s = document.getElementById('step-4');
  if (!s) return null;
  const parts = [...s.querySelectorAll('[data-message-part]')];
  const part = (n) => s.querySelector('[data-message-part="' + n + '"]');
  const one = part(1), two = part(2), three = part(3);
  const t = (el) => (el ? el.textContent : '');
  const at = (el, w) => t(el).indexOf(w);
  const all = t(s);
  // GTC-394 tweak 7 (founder: "How step 4 shows it"): the message first, then the notes, her line, Read it as.
  const p1Words = ['Your voice', 'One person gets no message', 'Your line', 'Read it as', 'Nudges by'];
  const h3 = parts.map((p) => p.querySelector(':scope > h3'));
  const style = (h) => { if (!h) return ''; const c = getComputedStyle(h); return [c.textTransform, c.fontSize, c.color].join('|'); };
  const W = ${'${WORDS}'};
  const text3 = t(three);
  return {
    order: parts.map((p) => p.getAttribute('data-message-part')),
    labels: h3.map((h) => (h ? h.textContent.trim() : null)),
    firstTags: parts.map((p) => (p.firstElementChild ? p.firstElementChild.tagName : '')),
    p1: p1Words.map((w) => at(one, w)),
    p1Elsewhere: p1Words.some((w) => at(two, w) >= 0 || at(three, w) >= 0),
    question: two ? ((two.querySelector('p') || {}).textContent || '').trim() : null,
    pills: two ? [...two.querySelectorAll('button')].map((b) => ({ text: b.textContent.trim(), pressed: b.getAttribute('aria-pressed') })) : [],
    oldStatement: W.old.some((x) => document.body.textContent.includes(x)),
    p3: {
      aHead: text3.indexOf(W.aHead), aLine: text3.indexOf(W.aLine), mere: text3.indexOf('Mere Parata'),
      hine: text3.indexOf('Hine Wiremu'), bHead: text3.indexOf(W.bHead), gus: text3.lastIndexOf('Gus Henderson'),
      gusFirst: text3.indexOf('Gus Henderson'),
    },
    dropped: all.includes(W.dropped),
    oldLabel: document.body.textContent.includes('Yours to handle'),
    bInPart2: at(two, W.bHead) >= 0,
    styles: h3.map(style),
    blurb: t(s.querySelector('header')).includes(W.blurb),
    oldBlurb: t(s.querySelector('header')).includes(W.oldBlurb),
    scrollWidth: document.documentElement.scrollWidth,
  };
})()`.replace(
  '${WORDS}',
  JSON.stringify({
    old: OLD_STATEMENTS,
    aHead: A_HEAD,
    aLine: A_LINE,
    bHead: B_HEAD,
    dropped: 'Gather will not message these people',
    blurb: BLURB,
    oldBlurb: OLD_BLURB,
  })
);

/** Before any page script: the five boxes' state the first moment each one exists. */
const FIRST_FRAME = `(() => {
  window.__first = {};
  const look = () => {
    for (let n = 1; n <= 5; n++) {
      if (n in window.__first) continue;
      const b = document.querySelector('#step-' + n + ' header input[type=checkbox]');
      if (b) window.__first[n] = b.checked;
    }
  };
  new MutationObserver(look).observe(document, { childList: true, subtree: true, attributes: false });
})();`;

/** Storage that refuses every touch, as a locked-down browser does. */
const NO_STORAGE = `(() => {
  window.__errs = [];
  window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));
  const deny = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  try { Object.defineProperty(window, 'localStorage', { configurable: true, get: deny }); } catch (e) {}
})();`;

const STORE = `(() => { try { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i);
  if (k && k.startsWith(${JSON.stringify(KEY_PREFIX)})) o[k] = localStorage.getItem(k); } return o; } catch (e) { return { error: true }; } })()`;
const BOXES = `(() => { const o = {}; for (let n = 1; n <= 5; n++) { const b = document.querySelector('#step-' + n + ' header input[type=checkbox]'); o[n] = b ? b.checked : null; } return o; })()`;

async function runLive() {
  const up = await realFetch(`${BASE}/`)
    .then((r) => r.ok)
    .catch(() => false);
  if (!up) console.error('    the dev server does not answer on :3000 — every C assertion fails');
  const totals = async () => ({
    invite: await prisma.inviteEvent.count(),
    outbound: await prisma.outboundMessage.count(),
  });
  const before = await totals();

  const stamp = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const mail = (l: string) => `gtc386-${l}-${stamp}@example.com`;
  const user = await prisma.user.create({ data: { email: mail('kate') } });
  created.users.push(user.id);
  const ana = await prisma.user.create({ data: { email: mail('ana') } });
  created.users.push(ana.id);
  const kate = await prisma.person.create({
    data: { name: 'Kate Lowe', email: user.email, userId: user.id },
  });
  created.people.push(kate.id);
  const token = randomBytes(32).toString('hex');
  const anaToken = randomBytes(32).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 3600e3) },
  });
  await prisma.session.create({
    data: { userId: ana.id, token: anaToken, expiresAt: new Date(Date.now() + 3600e3) },
  });
  const guest = async (name: string, email: boolean) => {
    const p = await prisma.person.create({
      data: { name, email: email ? mail(name.split(' ')[0].toLowerCase()) : null },
    });
    created.people.push(p.id);
    return p.id;
  };
  const jo = await guest('Jo Lowe', true);
  const gus = await guest('Gus Henderson', true);
  const mere = await guest('Mere Parata', false);
  const hine = await guest('Hine Wiremu', false);
  const tama = await guest('Tama Wiremu', false);
  const start = new Date(Date.now() + 30 * 864e5);

  /** A held event of Kate's. */
  const mk = async (label: string, opts: { full?: boolean; invitesOnly?: boolean }) => {
    const ev = await prisma.event.create({
      data: {
        name: `GTC-386 — ${label}`,
        startDate: start,
        endDate: start,
        hostId: kate.id,
        status: 'CONFIRMING',
        venueName: 'Kate’s place',
      },
    });
    created.events.push(ev.id);
    await prisma.eventRole.create({ data: { eventId: ev.id, userId: user.id, role: 'HOST' } });
    await prisma.eventSetup.create({
      data: { eventId: ev.id, invitesOnly: opts.invitesOnly === true } as any,
    });
    const pe = (personId: string, householdId: string, householdRole: string, extra: any = {}) =>
      prisma.personEvent.create({
        data: {
          personId,
          eventId: ev.id,
          householdId,
          householdRole: householdRole as any,
          ...extra,
        },
      });
    const hk = await prisma.household.create({ data: { eventId: ev.id } });
    const kpe = await pe(kate.id, hk.id, 'PRIMARY_CONTACT', { role: 'HOST' });
    const h1 = await prisma.household.create({ data: { eventId: ev.id } });
    await pe(jo, h1.id, 'PRIMARY_CONTACT');
    const team = opts.invitesOnly
      ? null
      : await prisma.team.create({ data: { name: 'Mains', eventId: ev.id } });
    const give = async (name: string, personId: string) => {
      if (!team) return;
      const it = await prisma.item.create({
        data: { name, teamId: team.id, source: 'MANUAL', kind: 'ITEM' } as any,
      });
      await prisma.assignment.create({ data: { itemId: it.id, personId } });
    };
    await give('Green salad', jo);
    if (opts.full) {
      // Group B: Gus, handed to Kate. Group A: Mere (no email or mobile) and Hine. The amber box:
      // a household whose picked contact is Kate, with a child holding something.
      const h2 = await prisma.household.create({ data: { eventId: ev.id } });
      await pe(gus, h2.id, 'PRIMARY_CONTACT', { chaseException: 'HAND_TO_HOST' });
      const h3 = await prisma.household.create({ data: { eventId: ev.id } });
      await pe(mere, h3.id, 'PRIMARY_CONTACT');
      const h4 = await prisma.household.create({
        data: { eventId: ev.id, contactPersonEventId: kpe.id },
      });
      await pe(hine, h4.id, 'PRIMARY_CONTACT');
      await pe(tama, h4.id, 'CHILD');
      await give('Pavlova', gus);
      await give('Bread rolls', mere);
      await give('Fruit platter', tama);
    }
    return { id: ev.id, teamId: team?.id ?? null };
  };
  const evA = await mk('the full step', { full: true });
  const evB = await mk('another event', {});
  const evC = await mk('invites only', { invitesOnly: true });
  await prisma.eventRole.create({ data: { eventId: evA.id, userId: ana.id, role: 'COHOST' } });

  const evIn = { eventId: { in: created.events } };
  const rows = async () =>
    [
      await prisma.event.count({ where: { id: { in: created.events } } }),
      await prisma.eventSetup.count({ where: evIn }),
      await prisma.eventRole.count({ where: evIn }),
      await prisma.household.count({ where: evIn }),
      await prisma.personEvent.count({ where: evIn }),
      await prisma.person.count({ where: { id: { in: created.people } } }),
      await prisma.user.count({ where: { id: { in: created.users } } }),
      await prisma.session.count({ where: { userId: { in: created.users } } }),
      await prisma.team.count({ where: evIn }),
      await prisma.item.count({ where: { team: evIn } }),
      await prisma.assignment.count({ where: { item: { team: evIn } } }),
      await prisma.accessToken.count({ where: evIn }),
      await prisma.outboundMessage.count({ where: evIn }),
      await prisma.inviteEvent.count({ where: evIn }),
    ].join(',');

  const keyA = `${KEY_PREFIX}${evA.id}:${user.id}`;
  const keyAna = `${KEY_PREFIX}${evA.id}:${ana.id}`;
  const keyB = `${KEY_PREFIX}${evB.id}:${user.id}`;
  const keyC = `${KEY_PREFIX}${evC.id}:${user.id}`;

  let chrome: Headless | null = null;
  let probes = { plan: '', send: '' };
  let blocked: string[] = [];
  let dialogs: string[] = [];
  const refusals: string[] = [];
  if (SHOTS) mkdirSync(SHOT_DIR, { recursive: true });
  try {
    chrome = await openHeadless({ fetchImpl: realFetch, port: PORT });
    const c = chrome;
    await c.blockPlanMaking();
    await c.blockSends();
    c.answerLeaveDialogs(true);
    await c.navigate('/', 3000);
    probes = {
      plan: await c.evaluate<string>(
        `fetch('/api/gtc386-probe/finalize-plan', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
      send: await c.evaluate<string>(
        `fetch('/api/events/gtc386-probe/send', { method: 'POST' }).then(r => 'reached ' + r.status).catch(() => 'failed')`
      ),
    };
    assert(
      'C',
      'C0 PRECONDITION: both walls proven: a plan-making probe and a send probe fail in the browser',
      probes.plan === 'failed' && probes.send === 'failed',
      JSON.stringify(probes)
    );
    if (probes.plan !== 'failed' || probes.send !== 'failed') return;
    await c.setSessionCookie(token);
    const ev = <T = any,>(js: string) => c.evaluate<T>(js);
    const waitFor = async (js: string, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (
          await ev<boolean>(`(() => { try { return !!(${js}); } catch (e) { return false; } })()`)
        )
          return true;
        await sleep(150);
      }
      return false;
    };
    /** Open the page and wait for the steps, and for step 4's message to arrive. */
    const open = async (path: string) => {
      await c.navigate(path, 300);
      await waitFor(`document.getElementById('step-5')`);
      await waitFor(
        `document.querySelector('#step-4 [data-message-part], #step-4 textarea')`,
        8000
      );
      await sleep(600);
    };
    /** Click through the guard; a target that is not there is skipped, not refused. */
    const tap = async (selector: string, settleMs = 500) => {
      if (!(await ev<boolean>(`!!document.querySelector(${JSON.stringify(selector)})`)))
        return 'absent';
      const why = await c.clickGuarded(selector, settleMs);
      if (why) refusals.push(`${selector}: ${why}`);
      return why;
    };
    /** The button inside `scope` whose words are exactly `text`, tagged, then tapped. */
    const tapText = async (scope: string, text: string, settleMs = 500) => {
      const found =
        await ev<boolean>(`(() => { document.querySelectorAll('[data-t]').forEach((e) => e.removeAttribute('data-t'));
        const b = [...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find((x) => x.textContent.trim() === ${JSON.stringify(text)});
        if (!b) return false; b.setAttribute('data-t', 'x'); return true; })()`);
      return found ? tap('[data-t="x"]', settleMs) : 'absent';
    };
    const tick = (n: number) => tap(`#step-${n} header label`);
    const shotStep4 = async (name: string, width: number) => {
      if (!SHOTS) return;
      const r = await ev<{ y: number; h: number }>(
        `(() => { const s = document.getElementById('step-4'); const r = s.getBoundingClientRect(); return { y: r.top + window.scrollY, h: r.height }; })()`
      );
      await c.screenshot(join(SHOT_DIR, `${SHOTS}-${name}.png`), {
        x: 0,
        y: Math.max(0, r.y - 8),
        width,
        height: Math.ceil(r.h) + 16,
      });
    };
    const shotSteps = async (name: string, width: number) => {
      if (!SHOTS) return;
      const r = await ev<{ y: number; h: number }>(
        `(() => { const a = document.getElementById('step-1').getBoundingClientRect(); const b = document.getElementById('step-5').getBoundingClientRect(); return { y: a.top + window.scrollY, h: b.bottom - a.top }; })()`
      );
      await c.screenshot(join(SHOT_DIR, `${SHOTS}-${name}.png`), {
        x: 0,
        y: Math.max(0, r.y - 8),
        width,
        height: Math.ceil(r.h) + 16,
      });
    };

    // ── item 66 — step 4, at 1280 then 390 ─────────────────────────────────────
    for (const [w, h, mobile, tag] of [
      [1280, 900, false, 'desktop'],
      [390, 844, true, 'phone'],
    ] as const) {
      await c.setViewport(w, h, mobile);
      await open(`/plan/${evA.id}/pre-flight`);
      const row = await ev<any>(STEP4_FACTS);
      await tap(`#step-4 header button[aria-expanded]`, 1200);
      const f = await ev<any>(STEP4_FACTS);
      const d = JSON.stringify(f).slice(0, 700);
      const k = (id: string) => (tag === 'desktop' ? id : `${id}p`);
      assert(
        'C',
        `${k('C1')} ${tag}: step 4 is three parts in order, each opening with its label — ${PARTS.join(' / ')}`,
        ok(() => CHECKS.C_PARTS(f)),
        d
      );
      assert(
        'C',
        `${k('C2')} ${tag}: part 1 holds the message, the amber box, her line, "Read it as" and the person’s own nudge choice, in that order (GTC-394 tweak 7; Q4’s order was her line first)`,
        ok(() => CHECKS.C_PART1(f)),
        d
      );
      assert(
        'C',
        `${k('C3')} ${tag}: part 2 is the question and the two choices, the default pressed and marked; the statement nowhere (Q3)`,
        ok(() => CHECKS.C_PART2(f, PILLS.BY_EMAIL + SUFFIX)),
        d
      );
      assert(
        'C',
        `${k('C4')} ${tag}: part 3 is group A (its heading, the line without its first sentence, Mere and Hine) then group B (Gus); "Yours to handle" gone (Q1, Q2)`,
        ok(() => CHECKS.C_PART3(f)),
        d
      );
      assert(
        'C',
        `${k('C5')} ${tag}: the three labels look alike: small capitals, 12px, Moment 2’s grey (Q6)`,
        ok(() => CHECKS.C_LOOK(f)),
        d
      );
      assert(
        'C',
        `${k('C6')} ${tag}: the closed row reads the new blurb, and nothing scrolls sideways (Q5)`,
        ok(() => CHECKS.C_ROW(row, w) && CHECKS.C_ROW(f, w)),
        JSON.stringify({ b: row?.blurb, o: row?.oldBlurb, sw: f?.scrollWidth })
      );
      await shotStep4(`step4-${w}`, w);
    }

    // ── item 68 — the ticks, at 1280 ──────────────────────────────────────────
    await c.setViewport(1280, 900, false);
    await open(`/plan/${evA.id}/pre-flight`);
    const fresh = await ev<any>(STORE);
    assert(
      'C',
      'C7 PRECONDITION: a first visit has nothing stored and nothing ticked',
      ok(() => !fresh.error && Object.keys(fresh).length === 0) &&
        CHECKS.C_BOXES(await ev(BOXES), [false, false, false, false, false]),
      JSON.stringify(fresh)
    );
    await tick(1);
    await tick(2);
    const s8 = await ev<any>(STORE);
    assert(
      'C',
      'C8 ticking steps 1 and 2 stores them for this event and this person: step numbers and short prints, no names',
      ok(() => CHECKS.C_STORED(s8, keyA, [1, 2])),
      JSON.stringify(s8).slice(0, 300)
    );
    const firstId = await c.addInitScript(FIRST_FRAME);
    await open(`/plan/${evA.id}/pre-flight`);
    const first9 = await ev<any>('window.__first');
    const go9 = await ev<string>(
      `document.querySelector('[data-go-to-step]')?.innerText.trim() ?? ''`
    );
    assert(
      'C',
      'C9 after a reload, steps 1 and 2 are ticked from their first frame; the line names step 3',
      ok(
        () =>
          CHECKS.C_BOXES(first9, [true, true, false, false, false]) &&
          go9.startsWith('Go to step 3')
      ),
      `${JSON.stringify(first9)} "${go9}"`
    );
    await shotSteps('ticks-after-reload-1280', 1280);
    await c.navigate('/plan/events', 2500);
    await open(`/plan/${evA.id}/pre-flight`);
    const first10 = await ev<any>('window.__first');
    assert(
      'C',
      'C10 leave the page and come back: the same two ticks',
      ok(() => CHECKS.C_BOXES(first10, [true, true, false, false, false])),
      JSON.stringify(first10)
    );
    await tick(3);
    await tick(4);
    await tick(5);
    const send11 = await ev<any>(
      `(() => { const b = [...document.querySelectorAll('#step-5 button')].find((x) => x.innerText.trim().startsWith('Send')); return b ? { text: b.innerText.trim(), off: b.disabled } : null; })()`
    );
    await open(`/plan/${evA.id}/pre-flight`);
    await sleep(800);
    const first11 = await ev<any>('window.__first');
    const now11 = await ev<any>(BOXES);
    const sendAfter = await ev<any>(
      `(() => { const b = [...document.querySelectorAll('#step-5 button')].find((x) => x.innerText.trim().startsWith('Send')); return b ? { text: b.innerText.trim(), off: b.disabled } : null; })()`
    );
    assert(
      'C',
      'C11 all five ticked, reloaded: all five come back (1 to 3 from the first frame, 4 once its message is checked), and Send is ready as it was — never pressed',
      ok(
        () =>
          send11?.text === 'Send' &&
          send11.off === false &&
          first11[1] === true &&
          first11[2] === true &&
          first11[3] === true &&
          CHECKS.C_BOXES(now11, [true, true, true, true, true]) &&
          sendAfter?.text === 'Send' &&
          sendAfter.off === false
      ),
      `${JSON.stringify(send11)} ${JSON.stringify(first11)} ${JSON.stringify(now11)} ${JSON.stringify(sendAfter)}`
    );

    // Behind her back: a critical thing with no owner, added somewhere else.
    if (evA.teamId) {
      await prisma.item.create({
        data: {
          name: 'Glazed ham',
          teamId: evA.teamId,
          source: 'MANUAL',
          kind: 'ITEM',
          critical: true,
        } as any,
      });
    }
    await open(`/plan/${evA.id}/pre-flight`);
    await sleep(800);
    const first12 = await ev<any>('window.__first');
    const now12 = await ev<any>(BOXES);
    const s12 = await ev<any>(STORE);
    assert(
      'C',
      'C12 a change elsewhere (a critical thing added with no owner): step 1’s tick goes, and Ready with it; 2 to 4 stay; never drawn ticked first (Q7)',
      ok(
        () =>
          first12[1] === false &&
          CHECKS.C_BOXES(now12, [false, true, true, true, false]) &&
          CHECKS.C_STORED(s12, keyA, [2, 3, 4])
      ),
      `${JSON.stringify(first12)} ${JSON.stringify(now12)} ${JSON.stringify(s12).slice(0, 200)}`
    );

    // Her own changes on the page keep the tick: dietary in step 2, the switch in step 4.
    await tap(`#step-2 header button[aria-expanded]`, 900);
    await tapText('#step-2', 'No dietary needs', 400);
    await tapText('#step-2', 'Save this', 1500);
    const mid13 = await ev<any>(BOXES);
    await open(`/plan/${evA.id}/pre-flight`);
    const first13 = await ev<any>('window.__first');
    const stored13 = await prisma.eventSetup.findUnique({
      where: { eventId: evA.id },
      select: { dietaryData: true },
    });
    assert(
      'C',
      'C13 her own dietary save keeps step 2 ticked, on the page and after a reload (Q7)',
      ok(
        () =>
          JSON.stringify(stored13?.dietaryData ?? {}).includes('confirmed_none') &&
          mid13[2] === true &&
          first13[2] === true
      ),
      `${JSON.stringify(stored13?.dietaryData)} ${JSON.stringify(mid13)} ${JSON.stringify(first13)}`
    );
    await tap(`#step-4 header button[aria-expanded]`, 1200);
    await tapText('#step-4 [data-message-part="2"]', PILLS.HAND_TO_HOST, 2000);
    const f14 = await ev<any>(STEP4_FACTS);
    const mid14 = await ev<any>(BOXES);
    await open(`/plan/${evA.id}/pre-flight`);
    await sleep(800);
    const now14 = await ev<any>(BOXES);
    assert(
      'C',
      'C14 her own nudge choice ("Leave them to me") moves the pressed marker, drops "(the default)", and keeps step 4 ticked after a reload (Q3, Q7)',
      ok(
        () =>
          CHECKS.C_PART2(f14, PILLS.HAND_TO_HOST) &&
          !f14.pills.some((p: any) => p.text.endsWith(SUFFIX)) &&
          mid14[4] === true &&
          now14[4] === true
      ),
      `${JSON.stringify(f14?.pills)} ${JSON.stringify(mid14)} ${JSON.stringify(now14)}`
    );

    // Another event; another person on the same browser.
    await open(`/plan/${evB.id}/pre-flight`);
    const nowB = await ev<any>(BOXES);
    const sB = await ev<any>(STORE);
    assert(
      'C',
      'C15 another event shows none of this one’s ticks',
      ok(
        () =>
          CHECKS.C_BOXES(nowB, [false, false, false, false, false]) && typeof sB[keyA] === 'string'
      ),
      JSON.stringify(nowB)
    );
    await tick(1);
    await c.setSessionCookie(anaToken);
    await open(`/plan/${evA.id}/pre-flight`);
    const nowAna = await ev<any>(BOXES);
    await tick(3);
    const sAna = await ev<any>(STORE);
    await c.setSessionCookie(token);
    await open(`/plan/${evA.id}/pre-flight`);
    await sleep(800);
    const backKate = await ev<any>(BOXES);
    assert(
      'C',
      'C16 a co-host on the same browser sees none of the host’s ticks, and hers are kept apart; the host’s come back as she left them (Q8)',
      ok(
        () =>
          CHECKS.C_BOXES(nowAna, [false, false, false, false, false]) &&
          CHECKS.C_STORED(sAna, keyAna, [3]) &&
          CHECKS.C_STORED(sAna, keyA, [2, 3, 4]) &&
          CHECKS.C_BOXES(backKate, [false, true, true, true, false])
      ),
      `${JSON.stringify(nowAna)} ${JSON.stringify(backKate)} ${Object.keys(sAna).length}`
    );

    // Invites only: steps 1 and 2 are the event's, never stored.
    await open(`/plan/${evC.id}/pre-flight`);
    const nowC = await ev<any>(BOXES);
    await tick(3);
    const sC = await ev<any>(STORE);
    assert(
      'C',
      'C17 invites only: steps 1 and 2 ticked by the event and never stored; step 3 stored alone',
      ok(
        () =>
          nowC[1] === true &&
          nowC[2] === true &&
          nowC[3] === false &&
          CHECKS.C_STORED(sC, keyC, [3])
      ),
      `${JSON.stringify(nowC)} ${JSON.stringify(sC).slice(0, 200)}`
    );

    // C19's "before": read here, where storage works. C18's page refuses it, and taking the init
    // script away does not change a page already open (moved here at GREEN, GTC-386; the condition
    // is unchanged).
    const sBefore = await ev<any>(STORE);

    // Storage that refuses: the page works as it does today.
    const denyId = await c.addInitScript(NO_STORAGE);
    await open(`/plan/${evB.id}/pre-flight`);
    const denied = await ev<boolean>(
      `(() => { try { return !window.localStorage; } catch (e) { return true; } })()`
    );
    const deny0 = await ev<any>(BOXES);
    await tick(2);
    const deny1 = await ev<any>(BOXES);
    const errs = await ev<string[]>('window.__errs || []');
    const sendDeny = await ev<any>(
      `(() => { const b = [...document.querySelectorAll('#step-5 button')].find((x) => x.innerText.trim().startsWith('Send')); return b ? { text: b.innerText.trim(), off: b.disabled } : null; })()`
    );
    await c.removeInitScript(denyId);
    assert(
      'C',
      'C18 CONTROL: storage that throws (proven refused): the page loads, starts unticked, a tick works, Send waits as today, no error',
      ok(
        () =>
          denied === true &&
          CHECKS.C_BOXES(deny0, [false, false, false, false, false]) &&
          deny1[2] === true &&
          errs.length === 0 &&
          sendDeny?.off === true &&
          sendDeny.text === 'Send — finish the five checks first'
      ),
      `${denied} ${JSON.stringify(deny0)} ${JSON.stringify(deny1)} ${JSON.stringify(errs)} ${JSON.stringify(sendDeny)}`
    );

    // After the press (set here, never pressed): the entry goes.
    await prisma.event.update({ where: { id: evB.id }, data: { sentAt: new Date() } });
    await c.navigate(`/plan/${evB.id}/pre-flight`, 300);
    await waitFor(
      `[...document.querySelectorAll('h1')].some((h) => h.textContent.trim() === 'Who I nudge')`
    );
    await sleep(800);
    const sAfter = await ev<any>(STORE);
    const afterQ =
      await ev<any>(`(() => ({ q: document.body.textContent.includes(${JSON.stringify(QUESTION)}),
      on: [...document.querySelectorAll('button[aria-pressed="true"]')].map((b) => b.textContent.trim()) }))()`);
    assert(
      'C',
      'C19 once sent, the page is "Who I nudge", it asks the question with the default pressed, and this event’s stored ticks are gone (Q3)',
      ok(() => CHECKS.C_GONE(sBefore, sAfter, afterQ, keyB, keyA)),
      `${typeof sBefore[keyB]} ${typeof sAfter[keyB]} ${JSON.stringify(afterQ)}`
    );

    // At 390, the ticks come back too (the picture).
    await c.setViewport(390, 844, true);
    await open(`/plan/${evA.id}/pre-flight`);
    await sleep(800);
    const first20 = await ev<any>('window.__first');
    const now20 = await ev<any>(BOXES);
    assert(
      'C',
      'C20 at 390, after a reload, steps 2 to 4 come back ticked from their first frame',
      ok(
        () =>
          CHECKS.C_BOXES(first20, [false, true, true, true, false]) &&
          CHECKS.C_BOXES(now20, [false, true, true, true, false])
      ),
      `${JSON.stringify(first20)} ${JSON.stringify(now20)}`
    );
    await shotSteps('ticks-after-reload-390', 390);
    await c.removeInitScript(firstId);

    blocked = c.planMakingBlocked();
    dialogs = c.dialogs();
  } finally {
    chrome?.close();
  }

  assert(
    'K',
    'K1 CONTROL: nothing blocked but the two probes; no dialog; every click made (none refused)',
    blocked.length === 2 &&
      blocked.every((x) => /gtc386-probe/.test(x)) &&
      dialogs.length === 0 &&
      refusals.length === 0,
    `${blocked.join(' | ')} | ${dialogs.join(',')} | ${refusals.join(' ; ')}`
  );
  const whileExists = await rows();
  const ai = (
    await prisma.event.findMany({
      where: { id: { in: created.events } },
      select: { aiCallsUsed: true },
    })
  ).map((e) => e.aiCallsUsed);
  console.log(
    `    fixture while it existed (Event, EventSetup, EventRole, Household, PersonEvent, Person, User, Session, Team, Item, Assignment, AccessToken, OutboundMessage, InviteEvent): ${whileExists}`
  );
  console.log(`    aiCallsUsed while it existed: ${ai.join(',')}`);
  await cleanup();
  const left = await rows();
  const after = await totals();
  assert(
    'K',
    'K2 CONTROL: aiCallsUsed 0 on every fixture event; nothing queued; every fixture row removed by id; the InviteEvent and OutboundMessage totals as found',
    ai.length === 3 &&
      ai.every((x) => x === 0) &&
      whileExists.endsWith(',0,0') &&
      left === '0,0,0,0,0,0,0,0,0,0,0,0,0,0' &&
      after.invite === before.invite &&
      after.outbound === before.outbound,
    `ai ${ai} | ${left} | ${JSON.stringify(before)} → ${JSON.stringify(after)}`
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
  // Every row below was made by this suite: its three events and what hangs off them (households,
  // memberships, teams, items, assignments, roles and setups go with the event), its people, its
  // two users and their sessions. Tokens and audit rows, if any were written, by their event.
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
