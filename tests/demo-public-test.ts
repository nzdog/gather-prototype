/**
 * [[GTC-447]] — GOING PUBLIC: /demo AND /demo/new FOLLOW THE DEMO START SWITCH AND NOTHING ELSE.
 *
 * Founder rulings (GTC-392 part D, 1 Nov 2026; GTC-447 cases A to G, 3 Nov 2026):
 *   - /demo shows "Try it yourself" where GATHER_DEMO_START is exactly "on", and GTC-430's "Under
 *     construction" everywhere else (Q2), in production and in development alike (case B);
 *   - /demo/new opens where the switch is exactly "on", and is a plain not-found everywhere else;
 *   - both call `await connection()` first, so the switch is read at each request, never fixed
 *     when the site is built (case A, case F: start-switch.ts unchanged);
 *   - W58, GTC-392's privacy line (Q16), copied, not retyped, sits right under the start button
 *     on /demo/new, in one constant in the page and pinned once here (case D);
 *   - the reset route keeps its production 404; "Go to it →" is kept; the start route is not
 *     touched.
 *
 * LAYERS
 *   P  /demo drawn in this process inside Next's own request scope, NODE_ENV and the switch set by
 *      hand (tests/helpers/next-request-scope.ts)
 *   L  /demo/new: its layout round its page, drawn the same way
 *   D  dynamic by its own word: both drawn inside Next's build-time scope stop static generation
 *      with Next's DynamicServerError, which is how `next build` marks a route dynamic (ƒ); and
 *      the code says so
 *   W  W58: drawn once, right under the start button; written once in src; GTC-392's words
 *   O  the off state and the start route's 404, as before
 *   C  the files: what else stays as at 6bc9572; the constants row; src and package.json differ
 *      by exactly this ticket's change
 *   H  over HTTP on the gate's dev server (the switch on, as .env.local has it)
 *
 * What this suite cannot prove: that Railway's server reads the variable as this process does.
 * The founder's staging rehearsal proves that; CI's `next build` route list on the pull request
 * shows /demo and /demo/new as ƒ (case A).
 *
 * SAFETY. No browser, no database, no network but two GETs to the local dev server (H). Nothing
 * is written; the start button is never pressed.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/demo-public-test.ts
 */
// The helper first: it must set up Next's request stores before any page is loaded.
import { drawInNext, type Drawn } from './helpers/next-request-scope';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { createElement } from 'react';
import DemoPage from '../src/app/demo/page';
import DemoNewLayout from '../src/app/demo/new/layout';
import DemoNewPage from '../src/app/demo/new/page';
import { isDemoStartOn } from '../src/lib/demo/start-switch';

const ROOT = path.join(__dirname, '..');
const BASE_URL = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';

// ── Commits (fixed) ──────────────────────────────────────────────────────────
/** feat/demo-public when this ticket began: GTC-449's record commit. */
const BASE = '6bc9572754d52b86d8fc794699097c89af3ab1fa';

// ── Files ────────────────────────────────────────────────────────────────────
const PAGE = 'src/app/demo/page.tsx';
const LAYOUT = 'src/app/demo/new/layout.tsx';
const NEW_PAGE = 'src/app/demo/new/page.tsx';
const SWITCH_FILE = 'src/lib/demo/start-switch.ts';
const START_ROUTE = 'src/app/api/demo/session/route.ts';
const RESET_ROUTE = 'src/app/api/demo/reset/route.ts';
const KEPT = [
  SWITCH_FILE,
  START_ROUTE,
  'src/components/demo/TryItYourselfButton.tsx',
  'src/lib/demo/new-event.ts',
  'src/lib/demo/copy.ts',
  'src/lib/demo/start-limit.ts',
];
/**
 * Main's pull request 83 (the contact import), merged into this branch on 3 Nov 2026: nine new
 * files under src/lib/contact-import and src/lib/vcard.ts. Not this ticket's; named so C7 still
 * holds src to an exact list.
 */
const MAIN_PR83_SRC = [
  'A\tsrc/lib/contact-import/build-contact.ts',
  'A\tsrc/lib/contact-import/check-email.ts',
  'A\tsrc/lib/contact-import/check-phone.ts',
  'A\tsrc/lib/contact-import/read-csv.ts',
  'A\tsrc/lib/contact-import/read-paste.ts',
  'A\tsrc/lib/contact-import/read-vcard.ts',
  'A\tsrc/lib/contact-import/split-cells.ts',
  'A\tsrc/lib/contact-import/tidy-name.ts',
  'A\tsrc/lib/contact-import/types.ts',
  'M\tsrc/lib/vcard.ts',
];
const CHANGED_SRC = [
  `M\t${PAGE}`,
  `M\t${LAYOUT}`,
  `M\t${NEW_PAGE}`,
  ...MAIN_PR83_SRC,
  'M\tsrc/components/glance/GlanceLive.tsx',
  'M\tsrc/components/glance/GlancePersonReading.tsx',
  'M\tsrc/components/glance/PersonSurface.tsx',
  'M\tsrc/components/glance/reading.ts',
  'M\tsrc/lib/glance/live.ts',
];
const CONSTANTS = 'GATHER-BUILD-CONSTANTS.md';
const GTC_392 = 'docs/tickets/GTC-392.md';
const NEW_SCRIPT = 'test:demo-public';
const NEW_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/demo-public-test.ts';
/** Main's script line from pull request 83, merged in 3 Nov 2026. */
const MAIN_SCRIPT = 'test:contact-import';
const MAIN_SCRIPT_VALUE = 'tsx --tsconfig tests/tsconfig.json tests/contact-import-test.ts';
/** [[GTC-451]]'s script line, taken out (exactly once) before C8's two-line comparison. */
const GTC451_LINE =
  '    "test:glance-card-refresh": "NODE_OPTIONS=--experimental-websocket tsx tests/glance-card-refresh-test.ts",';

// ── The words (hand-written) ─────────────────────────────────────────────────
const HEADING = 'Gather';
const TRY_IT = 'Try it yourself';
const NOTE = 'Under construction';
const NEW_HEADING = 'Create Your Event';
const START_BUTTON = 'Create';
/**
 * W58, GTC-392's privacy line (founder ruling Q16, 1 Nov 2026). The ONE pin of its words in the
 * tests: if the founder rules new words, this line and the page's PRIVACY_LINE change, and W3
 * reads the new ruling instead of GTC-392's.
 */
const W58 =
  'Only you can see your sample. It, and everything you type into it, is deleted the next day.';
/** Not "on": the switch is exactly "on" or off. */
const OFF_VALUES: Array<[string, string | undefined]> = [
  ['unset', undefined],
  ['""', ''],
  ['"true"', 'true'],
  ['"1"', '1'],
  ['"ON"', 'ON'],
  ['"off"', 'off'],
  ['" on"', ' on'],
  ['"on "', 'on '],
];
const NOT_FOUND = 'NEXT_HTTP_ERROR_FALLBACK;404';
const DYNAMIC = 'DYNAMIC_SERVER_USAGE';

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
const atBase = (rel: string) => {
  const r = git(['show', `${BASE}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
/** The path is in BASE's tree, the working folder holds it as BASE does, nothing new under it. */
const keptAsAtBase = (rel: string) =>
  atBase(rel).length > 0 &&
  git(['diff', '--quiet', BASE, '--', rel]).status === 0 &&
  !git(['status', '--porcelain', '--untracked-files=all', '--', rel]).stdout.includes('??');
const count = (s: string, needle: string) => s.split(needle).length - 1;
const walk = (dir: string): string[] => {
  const out: string[] = [];
  const go = (rel: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true })) {
      const q = `${rel}/${e.name}`;
      if (e.isDirectory()) go(q);
      else if (/\.(ts|tsx|js|jsx|json|css|md)$/.test(e.name)) out.push(q);
    }
  };
  go(dir);
  return out;
};

// ── Drawing, inside Next's own scopes ────────────────────────────────────────
type Scope = 'request' | 'build';
/** /demo as a server for `nodeEnv` draws it, the switch as given (undefined = unset). */
const drawDemo = (nodeEnv: string, demoStart: string | undefined, scope: Scope = 'request') =>
  drawInNext({
    route: '/demo',
    scope,
    nodeEnv,
    demoStart,
    make: () => (DemoPage as () => unknown)(),
  });
/** /demo/new: its layout round its page, as Next draws the route. */
const drawNew = (nodeEnv: string, demoStart: string | undefined, scope: Scope = 'request') =>
  drawInNext({
    route: '/demo/new',
    scope,
    nodeEnv,
    demoStart,
    make: () =>
      (DemoNewLayout as (p: { children: unknown }) => unknown)({
        children: createElement(DemoNewPage),
      }),
  });

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
  /** GTC-430's off state: the heading, then exactly the note in one <p>; no button, no link. */
  noteOnly(d: Drawn): boolean {
    const html = d.html;
    const notes = [...html.matchAll(/<p\b[^>]*>([^<]*)<\/p>/g)].map((m) => m[1]);
    return (
      d.threw === '' &&
      CHECKS.heading(html) &&
      CHECKS.words(html) === `${HEADING}${NOTE}` &&
      JSON.stringify(notes) === JSON.stringify([NOTE]) &&
      count(html, '<p') === 1 &&
      /<div class="flex flex-col gap-3"><p\b[^>]*>Under construction<\/p><\/div>/.test(html) &&
      !/<button\b/.test(html) &&
      !/<a\b/.test(html) &&
      !/href=/.test(html) &&
      !html.includes(W58)
    );
  },
  /** The switch on: the heading and one button, "Try it yourself"; no note, no link. */
  buttonOnly(d: Drawn): boolean {
    const html = d.html;
    const buttons = [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    return (
      d.threw === '' &&
      CHECKS.heading(html) &&
      CHECKS.words(html) === `${HEADING}${TRY_IT}` &&
      JSON.stringify(buttons) === JSON.stringify([TRY_IT]) &&
      count(html, '<button') === 1 &&
      !html.includes(NOTE) &&
      !/<p\b/.test(html) &&
      !/<a\b/.test(html) &&
      !html.includes(W58)
    );
  },
  /** /demo/new drawn: its heading, its form and its start button. */
  newDraws(d: Drawn): boolean {
    const html = d.html;
    return (
      d.threw === '' &&
      new RegExp(`<h1\\b[^>]*>${NEW_HEADING}</h1>`).test(html) &&
      count(html, '<form') === 1 &&
      new RegExp(`<button type="submit"[^>]*>${START_BUTTON}</button>`).test(html)
    );
  },
  /** A plain not-found: nothing drawn, Next's 404 thrown. */
  notFound(d: Drawn): boolean {
    return d.html === '' && d.digest === NOT_FOUND;
  },
  /** Static generation stopped by Next's DynamicServerError, raised by connection(). */
  stopsBuild(d: Drawn): boolean {
    return d.html === '' && d.digest === DYNAMIC && /connection/.test(d.threw);
  },
  /**
   * The file imports connection from next/server; its default export is async; the first
   * statement of its body is `await connection();`.
   */
  connectionFirst(src: string, name: string): boolean {
    return (
      /import \{ connection \} from 'next\/server';/.test(src) &&
      count(src, 'export default') === 1 &&
      new RegExp(
        `export default async function ${name}\\([^)]*\\)[^{]*\\{\\s*await connection\\(\\);`
      ).test(src)
    );
  },
  /** No process.env and no NODE_ENV; the switch read once, through isDemoStartOn(), after. */
  switchOnly(src: string): boolean {
    const at = src.indexOf('isDemoStartOn()');
    const conn = src.indexOf('await connection();');
    return (
      src.length > 100 &&
      !/process\.env/.test(src) &&
      !/NODE_ENV/.test(src) &&
      !src.includes('GATHER_DEMO_START') &&
      /import \{ isDemoStartOn \} from '@\/lib\/demo\/start-switch';/.test(src) &&
      count(src, 'isDemoStartOn()') === 1 &&
      conn >= 0 &&
      at > conn
    );
  },
  /**
   * W58 drawn once, in one `<p data-privacy-line>`, the element right after the start button.
   * In the page's code, the line sits after the button and before the outcome line.
   */
  privacyUnderButton(html: string, src: string): boolean {
    const after = new RegExp(
      `<button type="submit"[^>]*>${START_BUTTON}</button><p data-privacy-line=""[^>]*>([^<]*)</p>`
    ).exec(html);
    const button = src.indexOf('</button>');
    const marker = src.indexOf('data-privacy-line');
    const outcome = src.indexOf('{line && (');
    return (
      !!after &&
      after[1] === W58 &&
      count(html, W58) === 1 &&
      count(html, 'data-privacy-line') === 1 &&
      count(src, 'data-privacy-line') === 1 &&
      count(src, '</button>') === 1 &&
      button >= 0 &&
      marker > button &&
      outcome > marker &&
      /<p data-privacy-line="" className="[^"]*">\s*\{PRIVACY_LINE\}\s*<\/p>/.test(src)
    );
  },
  /** The words written once in src, in the page, as `const PRIVACY_LINE`. */
  writtenOnce(files: Array<[string, string]>): boolean {
    const holders = files.filter(([, s]) => s.includes(W58));
    return (
      holders.length === 1 &&
      holders[0][0] === NEW_PAGE &&
      count(holders[0][1], W58) === 1 &&
      holders[0][1].includes(`const PRIVACY_LINE =\n  '${W58}';`) &&
      count(holders[0][1], 'PRIVACY_LINE') === 2
    );
  },
  /** GTC-392's W58, as the plan writes it (wrapped over lines, in double quotes). */
  w58In392(doc: string): string {
    const m = doc.match(/^- W58 \(privacy, \/demo\/new\): "([^"]+)"/m);
    return m ? m[1].replace(/\s+/g, ' ').trim() : '';
  },
  /** The start route still answers 404 for the copy shape when the switch is off. */
  routeShut(src: string): boolean {
    return /if \(body\?\.start === 'copy' && !isDemoStartOn\(\)\) \{\s*return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(
      src
    );
  },
  /** The reset route still answers 404 in production. */
  resetShut(src: string): boolean {
    return /if \(process\.env\.NODE_ENV === 'production'\) \{\s*return NextResponse\.json\(\{ error: 'Not Found' \}, \{ status: 404 \}\);/.test(
      src
    );
  },
  /** Every non-empty code line of `before` is in `now`, in order: no line was taken away. */
  onlyAdded(now: string, before: string): boolean {
    const lines = (s: string) =>
      s
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
    const a = lines(before);
    const b = lines(now);
    let i = 0;
    for (const l of b) if (i < a.length && l === a[i]) i++;
    return a.length > 50 && i === a.length;
  },
  /** The constants file's one GATHER_DEMO_START row says what the switch now opens. */
  constantsRow(doc: string): boolean {
    const rows = doc.split('\n').filter((l) => l.startsWith('| `GATHER_DEMO_START` |'));
    const row = rows[0] ?? '';
    return (
      rows.length === 1 &&
      row.includes('**Off unless exactly `on`.**') &&
      row.includes('Read on every request') &&
      row.includes('`/demo`') &&
      row.includes('`/demo/new`') &&
      row.includes('`POST /api/demo/session`') &&
      row.includes(TRY_IT) &&
      row.includes(NOTE) &&
      row.includes('not-found') &&
      row.includes('GTC-447') &&
      !row.includes('do not read it') &&
      !/no-body/.test(row) &&
      !/NODE_ENV/.test(row) &&
      row.endsWith('| `.env.local` (dev); Railway production env at launch |')
    );
  },
  /** A `git diff --name-status` output is exactly the expected lines. */
  sameList(found: string | null, expected: string[]): boolean {
    if (found === null) return false;
    const a = found.split('\n').filter(Boolean).sort();
    const b = [...expected].sort();
    return a.length === b.length && new Set(a).size === a.length && a.every((x, i) => x === b[i]);
  },
  /**
   * package.json differs by exactly two added script lines: this ticket's, and main's
   * test:contact-import (pull request 83, merged in 3 Nov 2026). Main's goes last in the block,
   * so the line before it gains the comma JSON needs; nothing else differs.
   */
  twoScriptLines(now: string, before: string): boolean {
    const a = before.split('\n');
    const b = now.split('\n');
    if (before === '' || b.length !== a.length + 2) return false;
    const ours = `    "${NEW_SCRIPT}": "${NEW_SCRIPT_VALUE}",`;
    const mains = `    "${MAIN_SCRIPT}": "${MAIN_SCRIPT_VALUE}"`;
    const i = b.indexOf(ours);
    const j = b.indexOf(mains);
    if (i < 0 || j < 0 || b.lastIndexOf(ours) !== i || b.lastIndexOf(mains) !== j) return false;
    if (b[j + 1] !== '  },') return false;
    const prev = j - 1 === i ? j - 2 : j - 1;
    if (prev < 0 || !b[prev].endsWith('",')) return false;
    const rest = b.filter((_, k) => k !== i && k !== j);
    const p = prev - (i < prev ? 1 : 0);
    rest[p] = rest[p].slice(0, -1);
    return rest.join('\n') === before;
  },
  /** [[GTC-451]] — the text without `line`, or '' unless `line` is in it exactly once. */
  withoutOneLine(text: string, line: string): string {
    const lines = text.split('\n');
    if (lines.filter((l) => l === line).length !== 1) return '';
    return lines.filter((l) => l !== line).join('\n');
  },
  /** H1: /demo over HTTP, the switch on: 200 and the button, no note. */
  demoOverHttp(status: number, html: string): boolean {
    return (
      status === 200 &&
      count(html, `>${TRY_IT}</button>`) === 1 &&
      !html.includes(NOTE) &&
      !html.includes(W58)
    );
  },
  /** H2: /demo/new over HTTP: 200, its heading, and W58 right after the start button. */
  newOverHttp(status: number, html: string): boolean {
    return (
      status === 200 &&
      new RegExp(`<h1\\b[^>]*>${NEW_HEADING}</h1>`).test(html) &&
      new RegExp(
        `<button type="submit"[^>]*>${START_BUTTON}</button><p data-privacy-line=""[^>]*>${W58.replace(/\./g, '\\.')}</p>`
      ).test(html) &&
      count(html, W58) === 1
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

const show = (d: Drawn) => (d.threw ? `threw: ${d.threw.slice(0, 160)}` : d.html.slice(0, 240));

async function layerP() {
  section('P — /demo inside Next’s request scope, NODE_ENV and the switch set by hand');
  const prodOn = await drawDemo('production', 'on');
  assert(
    'P',
    'P1 production, the switch exactly "on": the heading "Gather" and one button, "Try it yourself"; no note',
    CHECKS.buttonOnly(prodOn),
    show(prodOn)
  );
  const bad: string[] = [];
  for (const [name, v] of OFF_VALUES) {
    if (!CHECKS.noteOnly(await drawDemo('production', v))) bad.push(name);
  }
  assert(
    'P',
    `P2 production, the switch ${OFF_VALUES.map(([n]) => n).join(', ')}: the heading and "Under construction" only`,
    bad.length === 0,
    bad.length ? `not the note for: ${bad.join(', ')}` : undefined
  );
  const devOn = await drawDemo('development', 'on');
  assert(
    'P',
    'P3 CONTROL: development, the switch exactly "on": the button (fails if Next’s request scope stops working)',
    CHECKS.buttonOnly(devOn),
    show(devOn)
  );
  const devBad: string[] = [];
  for (const [name, v] of OFF_VALUES.filter(([n]) => ['unset', '"off"', '"ON"'].includes(n))) {
    const d = await drawDemo('development', v);
    if (!CHECKS.noteOnly(d)) devBad.push(`${name} (${show(d).slice(0, 80)})`);
  }
  assert(
    'P',
    'P4 CONTROL: development, the switch unset, "off" or "ON": the note (fails if Next’s request scope stops working)',
    devBad.length === 0,
    devBad.join('; ')
  );
  const turns = [
    await drawDemo('production', 'on'),
    await drawDemo('production', undefined),
    await drawDemo('production', 'on'),
    await drawDemo('production', 'off'),
  ];
  assert(
    'P',
    'P5 read at each request: one loaded page, production, the switch on, unset, on, off gives button, note, button, note',
    CHECKS.buttonOnly(turns[0]) &&
      CHECKS.noteOnly(turns[1]) &&
      CHECKS.buttonOnly(turns[2]) &&
      CHECKS.noteOnly(turns[3])
  );
}

async function layerL() {
  section('L — /demo/new: its layout round its page, inside Next’s request scope');
  const prodOn = await drawNew('production', 'on');
  assert(
    'L',
    'L1 production, the switch exactly "on": /demo/new draws its heading, its form and its start button',
    CHECKS.newDraws(prodOn),
    show(prodOn)
  );
  const bad: string[] = [];
  for (const [name, v] of OFF_VALUES) {
    const d = await drawNew('production', v);
    if (!CHECKS.notFound(d)) bad.push(`${name} (${show(d).slice(0, 80)})`);
  }
  assert(
    'L',
    'L2 CONTROL: production, the switch off (every value but "on"): a plain not-found, Next’s own 404 (fails if Next’s request scope stops working)',
    bad.length === 0,
    bad.join('; ')
  );
  const devOn = await drawNew('development', 'on');
  assert(
    'L',
    'L3 CONTROL: development, the switch exactly "on": /demo/new draws (fails if Next’s request scope stops working)',
    CHECKS.newDraws(devOn),
    show(devOn)
  );
  const devBad: string[] = [];
  for (const [name, v] of OFF_VALUES.filter(([n]) => ['unset', '"off"', '"ON"'].includes(n))) {
    const d = await drawNew('development', v);
    if (!CHECKS.notFound(d)) devBad.push(`${name} (${show(d).slice(0, 80)})`);
  }
  assert(
    'L',
    'L4 development, the switch unset, "off" or "ON": a plain not-found, as in production (ruling B)',
    devBad.length === 0,
    devBad.join('; ')
  );
  const turns = [
    await drawNew('production', 'on'),
    await drawNew('production', undefined),
    await drawNew('production', 'on'),
    await drawNew('production', 'off'),
  ];
  assert(
    'L',
    'L5 read at each request: one loaded layout, production, the switch on, unset, on, off gives drawn, not-found, drawn, not-found',
    CHECKS.newDraws(turns[0]) &&
      CHECKS.notFound(turns[1]) &&
      CHECKS.newDraws(turns[2]) &&
      CHECKS.notFound(turns[3]),
    turns.map(show).join(' | ').slice(0, 300)
  );
}

async function layerD() {
  section('D — dynamic by its own word');
  const page = await drawDemo('production', 'on', 'build');
  assert(
    'D',
    'D1 /demo, called inside Next’s build-time scope: static generation stops with Next’s DynamicServerError from connection() (the route is ƒ)',
    CHECKS.stopsBuild(page),
    show(page)
  );
  const layout = await drawNew('production', 'on', 'build');
  assert(
    'D',
    'D2 /demo/new’s layout, likewise (the switch on): DynamicServerError from connection()',
    CHECKS.stopsBuild(layout),
    show(layout)
  );
  assert(
    'D',
    'D3 the code: each file imports connection from next/server, its default export is async, and its first statement is `await connection();`',
    CHECKS.connectionFirst(code(PAGE), 'DemoLandingPage') &&
      CHECKS.connectionFirst(code(LAYOUT), 'DemoNewLayout')
  );
  assert(
    'D',
    'D4 the code: neither file names process.env or NODE_ENV; each reads the switch once, through isDemoStartOn(), after connection()',
    CHECKS.switchOnly(code(PAGE)) && CHECKS.switchOnly(code(LAYOUT))
  );
  const env = process.env as Record<string, string | undefined>;
  const was = env.GATHER_DEMO_START;
  const reads: boolean[] = [];
  const at = (v: string | undefined) => {
    if (v === undefined) delete env.GATHER_DEMO_START;
    else env.GATHER_DEMO_START = v;
    reads.push(isDemoStartOn());
  };
  for (const [, v] of OFF_VALUES) at(v);
  at('on');
  at(undefined);
  at('on');
  if (was === undefined) delete env.GATHER_DEMO_START;
  else env.GATHER_DEMO_START = was;
  assert(
    'D',
    'D5 CONTROL: isDemoStartOn() is on for exactly "on" and nothing else, read at each call; start-switch.ts as at 6bc9572 (ruling F)',
    JSON.stringify(reads) === JSON.stringify([...OFF_VALUES.map(() => false), true, false, true]) &&
      keptAsAtBase(SWITCH_FILE)
  );
}

async function layerW() {
  section('W — W58, the privacy line');
  const drawn = await drawNew('development', 'on');
  assert(
    'W',
    'W1 /demo/new drawn: W58 once, in one <p data-privacy-line>, the element right after the start button and before any outcome line',
    CHECKS.privacyUnderButton(drawn.html, code(NEW_PAGE)),
    show(drawn)
  );
  const src = walk('src').map((f) => [f, read(f)] as [string, string]);
  const demos = [
    await drawDemo('production', 'on'),
    await drawDemo('production', undefined),
    await drawDemo('development', 'on'),
  ];
  assert(
    'W',
    'W2 W58 is written once in src, in the sample page as `const PRIVACY_LINE`, and no drawing of /demo holds it',
    CHECKS.writtenOnce(src) && demos.every((d) => d.html.length > 0 && !d.html.includes(W58))
  );
  const planned = CHECKS.w58In392(read(GTC_392));
  assert(
    'W',
    'W3 CONTROL: this suite’s W58 is GTC-392’s W58 as approved (Q16), copied, not retyped',
    planned === W58,
    planned
  );
}

async function layerO() {
  section('O — the off state and the start route, as before');
  const offs = [
    await drawDemo('production', undefined),
    await drawDemo('production', 'off'),
    await drawDemo('development', undefined),
    await drawDemo('development', 'off'),
  ];
  assert(
    'O',
    'O1 the off state: /demo with the switch off, production and development, is the heading and exactly "Under construction" in one <p>, no button, no link (GTC-430)',
    offs.every((d) => CHECKS.noteOnly(d)),
    offs.map(show).join(' | ').slice(0, 300)
  );
  assert(
    'O',
    'O2 CONTROL: the start route is as at 6bc9572 and still answers 404 to the copy shape when the switch is off',
    keptAsAtBase(START_ROUTE) && CHECKS.routeShut(code(START_ROUTE))
  );
}

function layerC() {
  section('C — the files');
  const now = code(NEW_PAGE);
  assert(
    'C',
    'C2 CONTROL: every code line of the sample page at 6bc9572 is still there, in order ("Go to it →" and its link included); no line was taken away',
    CHECKS.onlyAdded(now, stripComments(atBase(NEW_PAGE))) &&
      now.includes('{DEMO_START_WORDS.GO_TO_IT}') &&
      /\{line\.href && \(\s*<a href=\{line\.href\}/.test(now)
  );
  assert(
    'C',
    'C4 CONTROL: the reset route is as at 6bc9572 and keeps its production 404',
    keptAsAtBase(RESET_ROUTE) && CHECKS.resetShut(code(RESET_ROUTE))
  );
  const moved = KEPT.filter((f) => !keptAsAtBase(f));
  assert(
    'C',
    'C5 CONTROL: the switch file, the start route, the button file, new-event.ts, copy.ts and start-limit.ts are as at 6bc9572',
    moved.length === 0,
    moved.join(', ')
  );
  assert(
    'C',
    'C6 the constants row: GATHER_DEMO_START opens /demo’s button, /demo/new and the start route; still "Off unless exactly `on`" and "Read on every request"; no "do not read it", no no-body shape',
    CHECKS.constantsRow(read(CONSTANTS))
  );
  const diff = git(['diff', '--name-status', BASE, '--', 'src']);
  const untracked = git(['status', '--porcelain', '--untracked-files=all', '--', 'src'])
    .stdout.split('\n')
    .filter((l) => l.startsWith('??'));
  assert(
    'C',
    'C7 src differs from 6bc9572 in exactly the three files (the /demo page, the /demo/new layout and the sample page) plus the ten from main’s pull request 83 (nine new under src/lib/contact-import, and src/lib/vcard.ts)',
    diff.status === 0 && untracked.length === 0 && CHECKS.sameList(diff.stdout, CHANGED_SRC),
    `${diff.stdout.trim().replace(/\n/g, ', ')}${untracked.length ? ` + ${untracked.join(', ')}` : ''}`
  );
  assert(
    'C',
    `C8 package.json differs from 6bc9572 by exactly two script lines, "${NEW_SCRIPT}" and main’s "${MAIN_SCRIPT}" (pull request 83), with the comma JSON needs before main’s`,
    CHECKS.twoScriptLines(
      CHECKS.withoutOneLine(read('package.json'), GTC451_LINE),
      atBase('package.json')
    )
  );
}

async function get(p: string): Promise<{ status: number; html: string; error: string }> {
  try {
    const res = await fetch(`${BASE_URL}${p}`, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(180_000),
    });
    return { status: res.status, html: await res.text(), error: '' };
  } catch (err) {
    return { status: 0, html: '', error: String((err as Error).message) };
  }
}

async function layerH() {
  section(`H — over HTTP, the dev server at ${BASE_URL} (the switch on, as .env.local has it)`);
  const demo = await get('/demo');
  assert(
    'H',
    'H1 GET /demo is 200 with the "Try it yourself" button and no note',
    CHECKS.demoOverHttp(demo.status, demo.html),
    demo.error || `status ${demo.status}`
  );
  const sample = await get('/demo/new');
  assert(
    'H',
    'H2 GET /demo/new is 200, its heading drawn, W58 right after the start button (the layout’s connection() works round a client page)',
    CHECKS.newOverHttp(sample.status, sample.html),
    sample.error || `status ${sample.status}`
  );
}

async function main() {
  console.log('GTC-447 — going public: /demo and /demo/new follow the demo start switch');
  await layerP();
  await layerL();
  await layerD();
  await layerW();
  await layerO();
  layerC();
  await layerH();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS only (DEMO_PUBLIC_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_PUBLIC_DRY_RUN !== '1') main();
