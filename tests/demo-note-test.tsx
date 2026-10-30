/**
 * [[GTC-430]] — /demo SAYS "Under construction" WHEREVER THE "Try it yourself" BUTTON IS NOT.
 *
 * Founder rulings, 30 Oct 2026 (verbatim in docs/tickets/GTC-430.md):
 *   1. the words are exactly "Under construction", under the heading "Gather", where the button
 *      goes; nothing else is added (no apology, no date, no link);
 *   2. the note shows whenever the button is not shown: the button only in development AND with
 *      the demo start switch on; every other case shows the note and no button; the button and
 *      the sample page keep their development-only guard (the demo opens nowhere new);
 *   3. the front page, its button, the sample page, the routes and the switch are not touched.
 *
 * LAYERS
 *   R  the page drawn in this process, NODE_ENV and GATHER_DEMO_START set by hand for each case:
 *      production with the switch unset, "", "true", "1", "ON", "off" and "on"; development with
 *      it unset, "off" and "ON" (the note, no button, no link); development with exactly "on"
 *      (the button, no note); the heading "Gather" every time; and one loaded page following the
 *      switch from render to render (read at request time, not captured)
 *   C  the code: the page is a server component and the button file a client one; the page reads
 *      the switch only through isDemoStartOn() inside its render; no NEXT_PUBLIC variable; the
 *      button file reads no setting; the words are written once, in the page
 *   U  the files, between FIXED commits: Part B (GTC-429) changed exactly its seven files; this
 *      ticket's code commit stands on Part B's end and changed exactly the page and the new
 *      button file; the front page, the sample page, the switch and the routes are as at the
 *      branch point; package.json gained exactly this suite's one line
 *
 * SAFETY. No server, no browser, no database, no network: the page is rendered with
 * renderToStaticMarkup and git is read. Nothing is written.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/demo-note-test.tsx
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import DemoPage from '../src/app/demo/page';

const ROOT = path.join(__dirname, '..');

// ── Commits (fixed) ──────────────────────────────────────────────────────────
/** GitHub's main when this branch began (the branch point). */
const BRANCH_POINT = '4f91128792a3a26c2f40a7f766d2821ebc1f4d0b';
/** Part B's end: GTC-429's ticket commit. */
const PART_B_END = 'b0be32270fdfabb883f45b629bb62812a77bf4ed';
/** This ticket's code commit. */
const CODE = 'e23f432231866f45080525ffb6d5f76225a0b0a2';
const SUITE = 'tests/demo-note-test.tsx';
const NEW_SCRIPT = 'test:demo-note';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-note-test.tsx';
const UNTRACKED_SCRIPTS = ['scripts/dev-login.ts', 'scripts/print-host-link.ts'];
const PART_B_FILES = [
  'A\tdocs/tickets/GTC-429.md',
  'M\ttests/demo-tweaks-6-test.tsx',
  'M\ttests/demo-tweaks-7-test.tsx',
  'M\ttests/demo-tweaks-8-test.tsx',
  'M\ttests/demo-tweaks-9-test.tsx',
  'M\ttests/demo-tweaks-10-test.tsx',
  'M\ttests/demo-tweaks-11-test.tsx',
];
const PAGE = 'src/app/demo/page.tsx';
const BUTTON_FILE = 'src/components/demo/TryItYourselfButton.tsx';
const CODE_FILES = [`M\t${PAGE}`, `A\t${BUTTON_FILE}`];
/** Ruling 3: as at the branch point, at the code commit. */
const UNTOUCHED = [
  'src/app/page.tsx',
  'src/app/demo/new',
  'src/lib/demo/start-switch.ts',
  'src/lib',
  'src/app/api',
  'prisma',
  'package-lock.json',
];

// ── The words (hand-written) ─────────────────────────────────────────────────
const NOTE = 'Under construction';
const HEADING = 'Gather';
const TRY_IT = 'Try it yourself';
const SWITCH = 'GATHER_DEMO_START';

// ── Reporting ────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const reds: string[] = [];
function section(title: string) {
  console.log(`\n── ${title}`);
}
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

// ── Reading ──────────────────────────────────────────────────────────────────
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
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atRef = (ref: string, rel: string) => {
  const r = git(['show', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const objectAt = (ref: string, rel: string) => {
  const r = git(['rev-parse', `${ref}:${rel}`]);
  return r.status === 0 ? r.stdout.trim() : '';
};
const count = (s: string, needle: string) => s.split(needle).length - 1;
const walk = (dir: string): string[] => {
  const out: string[] = [];
  const go = (rel: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const q = `${rel}/${e.name}`;
      if (e.isDirectory()) go(q);
      else if (/\.(ts|tsx)$/.test(e.name)) out.push(q);
    }
  };
  go(dir);
  return out;
};

/** The page as a build for `nodeEnv` draws it, with the switch as given (undefined = unset). */
function draw(nodeEnv: string, demoStart: string | undefined): string {
  const env = process.env as Record<string, string | undefined>;
  const wasEnv = env.NODE_ENV;
  const wasSwitch = env[SWITCH];
  env.NODE_ENV = nodeEnv;
  if (demoStart === undefined) delete env[SWITCH];
  else env[SWITCH] = demoStart;
  try {
    return renderToStaticMarkup(createElement(DemoPage));
  } catch (e) {
    return `THREW ${(e as Error).message}`;
  } finally {
    if (wasEnv === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = wasEnv;
    if (wasSwitch === undefined) delete env[SWITCH];
    else env[SWITCH] = wasSwitch;
  }
}

// ── CHECKS-START: pure over their inputs ─────────────────────────────────────
export const CHECKS = {
  /** The visible words, tags taken out. */
  words(html: string): string {
    return html.replace(/<[^>]*>/g, '');
  },
  /** One heading, "Gather". */
  heading(html: string): boolean {
    const h1 = [...html.matchAll(/<h1\b[^>]*>([^<]*)<\/h1>/g)].map((m) => m[1]);
    return JSON.stringify(h1) === JSON.stringify([HEADING]) && count(html, '<h1') === 1;
  },
  /** Ruling 1: the heading, then exactly the note in one <p> where the button goes; no button, no link. */
  noteOnly(html: string): boolean {
    const notes = [...html.matchAll(/<p\b[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
    return (
      CHECKS.heading(html) &&
      CHECKS.words(html) === `${HEADING}${NOTE}` &&
      JSON.stringify(notes) === JSON.stringify([NOTE]) &&
      count(html, '<p') === 1 &&
      count(html, NOTE) === 1 &&
      html.indexOf('</h1>') < html.indexOf(NOTE) &&
      /<div class="flex flex-col gap-3"><p\b[^>]*>Under construction<\/p><\/div>/.test(html) &&
      !/<button\b/.test(html) &&
      !/<a\b/.test(html) &&
      !/href=/.test(html)
    );
  },
  /** Ruling 2: development and the switch exactly "on": the button, as before, and no note. */
  buttonOnly(html: string): boolean {
    const buttons = [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    return (
      CHECKS.heading(html) &&
      CHECKS.words(html) === `${HEADING}${TRY_IT}` &&
      JSON.stringify(buttons) === JSON.stringify([TRY_IT]) &&
      count(html, '<button') === 1 &&
      !html.includes(NOTE) &&
      !/<p\b/.test(html) &&
      !/<a\b/.test(html)
    );
  },
  /** A file's leading directive, if any ('use client' / 'use server'). */
  directive(src: string): string {
    const m = src.match(/^\s*(['"])(use client|use server)\1;?/);
    return m ? m[2] : '';
  },
  /**
   * The page reads the switch only through isDemoStartOn(), once, inside its render function, in
   * the button's condition; never at module scope, never by its name.
   */
  readsAtRender(src: string): boolean {
    const fn = src.indexOf('export default function DemoLandingPage()');
    const at = src.indexOf('isDemoStartOn()');
    const before = fn >= 0 ? src.slice(0, fn) : src;
    return (
      fn >= 0 &&
      count(src, 'isDemoStartOn()') === 1 &&
      at > fn &&
      !before.includes('isDemoStartOn()') &&
      /import \{ isDemoStartOn \} from '@\/lib\/demo\/start-switch';/.test(src) &&
      /\{process\.env\.NODE_ENV === 'development' && isDemoStartOn\(\) \? \(/.test(src) &&
      !src.includes(SWITCH) &&
      JSON.stringify(src.match(/process\.env(\.[A-Za-z_]+|\[)/g)) ===
        JSON.stringify(['process.env.NODE_ENV'])
    );
  },
  /** The button file: a client file that reads no setting and never the switch. */
  buttonFileIsQuiet(src: string): boolean {
    return (
      src.length > 100 &&
      !/process\.env/.test(src) &&
      !/start-switch|isDemoStartOn|GATHER_DEMO_START/.test(src) &&
      !/fetch\(/.test(src) &&
      /onClick=\{\(\) => window\.location\.assign\(href\)\}/.test(src)
    );
  },
  /** A `git diff --name-status` output is exactly the expected lines. */
  sameList(found: string | null, expected: string[]): boolean {
    if (found === null) return false;
    const a = found.split('\n').filter(Boolean).sort();
    const b = [...expected].sort();
    return a.length === b.length && new Set(a).size === a.length && a.every((x, i) => x === b[i]);
  },
  /** package.json differs by exactly one added line: the new script. */
  oneScriptLine(now: string, before: string): boolean {
    const a = before.split('\n');
    const b = now.split('\n');
    if (before === '' || b.length !== a.length + 1) return false;
    const i = b.findIndex((l, k) => l !== a[k]);
    return (
      i >= 0 &&
      b[i] === `    "${NEW_SCRIPT}": "${NEW_SCRIPT_VALUE}",` &&
      [...b.slice(0, i), ...b.slice(i + 1)].join('\n') === before
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

function layerR() {
  section('R — the page as each build draws it, the switch set by hand');
  const offValues: Array<[string, string | undefined]> = [
    ['unset', undefined],
    ['""', ''],
    ['"true"', 'true'],
    ['"1"', '1'],
    ['"ON"', 'ON'],
    ['"off"', 'off'],
  ];
  const prodOff = offValues.map(([name, v]) => [name, draw('production', v)] as const);
  const badProd = prodOff.filter(([, html]) => !CHECKS.noteOnly(html)).map(([n]) => n);
  assert(
    'R',
    'R1 production, the switch unset, "", "true", "1", "ON" or "off": the heading and exactly "Under construction" under it, no button, no link',
    badProd.length === 0,
    badProd.length ? `not the note for: ${badProd.join(', ')}` : undefined
  );
  const prodOn = draw('production', 'on');
  assert(
    'R',
    'R2 production with the switch exactly "on": still the note and no button (the demo opens nowhere new)',
    CHECKS.noteOnly(prodOn),
    prodOn.slice(0, 300)
  );
  const devOff = (
    [
      ['unset', undefined],
      ['"off"', 'off'],
      ['"ON"', 'ON'],
    ] as Array<[string, string | undefined]>
  ).map(([name, v]) => [name, draw('development', v)] as const);
  const badDev = devOff.filter(([, html]) => !CHECKS.noteOnly(html)).map(([n]) => n);
  assert(
    'R',
    'R3 development with the switch off (unset, "off", "ON"): the note and no button',
    badDev.length === 0,
    badDev.length ? `not the note for: ${badDev.join(', ')}` : undefined
  );
  const devOn = draw('development', 'on');
  assert(
    'R',
    'R4 development with the switch exactly "on": the button "Try it yourself" and no note',
    CHECKS.buttonOnly(devOn),
    devOn.slice(0, 300)
  );
  const all = [...prodOff.map(([, h]) => h), prodOn, ...devOff.map(([, h]) => h), devOn];
  assert(
    'R',
    `R5 the heading "Gather" is there, once, in all ${all.length} drawings`,
    all.length === 11 && all.every((h) => CHECKS.heading(h))
  );
  const turns = [
    draw('development', 'on'),
    draw('development', undefined),
    draw('development', 'on'),
    draw('development', 'off'),
  ];
  assert(
    'R',
    'R6 read at request time: one loaded page drawn with the switch on, unset, on, off follows it each time (button, note, button, note)',
    CHECKS.buttonOnly(turns[0]) &&
      CHECKS.noteOnly(turns[1]) &&
      CHECKS.buttonOnly(turns[2]) &&
      CHECKS.noteOnly(turns[3])
  );
}

function layerC() {
  section('C — the code');
  const page = read(PAGE);
  const button = read(BUTTON_FILE);
  assert(
    'C',
    'C1 the page is a server component (no "use client"), so the switch is read on the server; the button file is a client one',
    page.length > 200 && CHECKS.directive(page) === '' && CHECKS.directive(button) === 'use client'
  );
  assert(
    'C',
    'C2 the page reads the switch only through isDemoStartOn(), once, inside its render, in the button’s condition; NODE_ENV is its only other setting',
    CHECKS.readsAtRender(stripComments(page))
  );
  assert(
    'C',
    'C3 neither file holds a NEXT_PUBLIC variable; the button file reads no setting, never the switch, fetches nothing, and opens what it is handed',
    !/NEXT_PUBLIC/.test(page) &&
      !/NEXT_PUBLIC/.test(button) &&
      CHECKS.buttonFileIsQuiet(stripComments(button))
  );
  const holders = [...walk('src/app'), ...walk('src/components'), ...walk('src/lib')].filter((f) =>
    code(f).includes(NOTE)
  );
  assert(
    'C',
    'C4 "Under construction" is written once, in the page (`const UNDER_CONSTRUCTION`), and in no other source file',
    JSON.stringify(holders) === JSON.stringify([PAGE]) &&
      count(code(PAGE), NOTE) === 1 &&
      /const UNDER_CONSTRUCTION = 'Under construction';/.test(code(PAGE)),
    holders.join(', ')
  );
}

function layerU() {
  section('U — the files, between fixed commits');
  const b = git(['diff', '--name-status', '--no-renames', BRANCH_POINT, PART_B_END]);
  assert(
    'U',
    'U1 Part B (the branch point 4f91128 to GTC-429’s ticket commit) changed exactly the six demo-tweaks suites and its ticket',
    b.status === 0 && CHECKS.sameList(b.stdout, PART_B_FILES),
    b.stdout
  );
  const d = git(['diff', '--name-status', '--no-renames', PART_B_END, CODE]);
  assert(
    'U',
    'U2 the code commit stands on Part B’s end and changed exactly the page and the new button file',
    git(['rev-parse', `${CODE}^`]).stdout.trim() === PART_B_END &&
      d.status === 0 &&
      CHECKS.sameList(d.stdout, CODE_FILES),
    d.stdout
  );
  const moved = UNTOUCHED.filter((p) => {
    const o = objectAt(BRANCH_POINT, p);
    return o === '' || objectAt(CODE, p) !== o;
  });
  const home = atRef(CODE, 'src/app/page.tsx');
  const layout = atRef(CODE, 'src/app/demo/new/layout.tsx');
  assert(
    'U',
    'U3 at the code commit the front page, the sample page, the switch, src/lib, the routes, prisma and the lockfile are as at the branch point; the front page still sends "See it in action" to /demo, and the sample page is still a not-found outside development',
    moved.length === 0 &&
      /href="\/demo"\s+className="[^"]*"\s*>\s*See it in action →\s*<\/Link>/.test(home) &&
      layout.includes("if (process.env.NODE_ENV !== 'development') notFound();"),
    moved.join(', ')
  );
  const added = git(['log', '--diff-filter=A', '--format=%H', '--', SUITE])
    .stdout.trim()
    .split('\n')
    .filter(Boolean);
  const addCommit = added[added.length - 1] ?? '';
  assert(
    'U',
    `U4 package.json at the commit that added this suite (${addCommit.slice(0, 7) || 'none yet'}) differs from the code commit’s by "${NEW_SCRIPT}" and nothing else`,
    addCommit.length === 40 &&
      CHECKS.oneScriptLine(atRef(addCommit, 'package.json'), atRef(CODE, 'package.json'))
  );
  const tracked = UNTRACKED_SCRIPTS.filter(
    (f) => git(['log', '--oneline', `${BRANCH_POINT}..${CODE}`, '--', f]).stdout.trim().length > 0
  );
  assert(
    'U',
    'U5 neither untracked script is in any commit from the branch point to the code commit',
    tracked.length === 0 && git(['cat-file', '-t', CODE]).stdout.trim() === 'commit',
    tracked.join(', ')
  );
}

function main() {
  console.log('GTC-430 — /demo says "Under construction" wherever the button is not');
  layerR();
  layerC();
  layerU();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS only (DEMO_NOTE_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_NOTE_DRY_RUN !== '1') main();
