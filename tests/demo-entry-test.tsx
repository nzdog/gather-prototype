/**
 * [[GTC-486]] — THE DEMO ENTRY: the /demo page's button as the main instruction, the explainer's
 * one-line introduction, a second "Try it yourself" at the foot of the steps, and the campaign line
 * under the heading. Founder rulings of 26 Nov 2026, verbatim in docs/tickets/GTC-486.md:
 *
 *   A: wording A1. Under the button: "Start your own sample event. Nothing is sent to anyone."
 *      Intro: "Rather read first? Each step below shows what happens." Remove "Tap a step to open
 *      it." Add a second "Try it yourself" button at the foot of the steps, under the same switch
 *      as the first. No button stuck to the bottom of the screen.
 *   D: one line only, under the Gather heading and above the button: "You're onto it. Finally,
 *      you can show them."
 *   B and C are not in this ticket. No price on /demo.
 *
 * And of 27 Nov 2026: the line under the heading now reads exactly "Because those potatoes won't
 * bring themselves to lunch.", replacing D's words, with the curly apostrophe; nothing else on the
 * page changes.
 *
 * ⚠ [[GTC-487]] (28 Nov 2026, the founder's ruling: two short paragraphs "directly under the line
 * 'Start your own sample event. Nothing is sent to anyone.'", and "If any existing check pins the
 * page's shape and has to be widened, widen it as narrowly as you can"). R2 (every visible word)
 * and R4 (what follows the first button, up to the steps) pinned the page's words exactly, so each
 * now lets in GTC-487's two paragraphs, in that one place, and nothing else. The paragraphs
 * themselves are held by tests/demo-potatoes-test.tsx. Every other check is as GTC-486 left it.
 *
 * Ruling E (the sample's start page counted as a fourth page) is held by tests/page-visit-test.ts
 * (U6, S9, S10); the privacy page's words by tests/privacy-words-test.ts.
 *
 * Layers:
 *   W  the words, as ruled, and nothing else of the explainer moved.
 *   R  the page drawn in Next's request scope with the switch on.
 *   O  the page drawn with the switch off (GTC-430's note, unchanged).
 *   S  the code, read as text.
 *   H  over HTTP, the dev server (the switch on, as .env.local has it). GETs only, with no
 *      Sec-Fetch headers, so the server writes no visit line for them.
 *
 * SAFETY. No browser, no database, no writes. Nothing is pressed.
 *
 * DEMO_ENTRY_DRY_RUN=1: every check is also run on an input made to fail it. Each must go red
 * there, and each breaking change must really change the input; otherwise the dry run fails.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/demo-entry-test.tsx
 */
// The helper first: it must set up Next's request stores before any page is loaded.
import { drawInNext } from './helpers/next-request-scope';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import ts from 'typescript';
import DemoPage from '../src/app/demo/page';

const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.env.DEMO_ENTRY_DRY_RUN === '1';
const BASE_URL = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';

// ── Commits (fixed) ──────────────────────────────────────────────────────────────────────────
/** origin/main when this ticket began: the merge of pull request #125 (GTC-483). */
const BASE = 'c8b9b4246d82a47d16a1fef67c5e974ef7121e54';

// ── Files ────────────────────────────────────────────────────────────────────────────────────
const PAGE = 'src/app/demo/page.tsx';
const WORDS = 'src/lib/demo/explainer-words.ts';
const EXPLAINER = 'src/components/demo/DemoExplainer.tsx';
const BUTTON = 'src/components/demo/TryItYourselfButton.tsx';

// ── The ruled words (26 Nov 2026) ────────────────────────────────────────────────────────────
/**
 * D, in the words of the founder's ruling of 27 Nov 2026. Drawn with the page's own apostrophe
 * (’), as the explainer under it is written.
 */
const LEAD = 'Because those potatoes won’t bring themselves to lunch.';
/** D's words of 26 Nov 2026, replaced on 27 Nov: in no file under src. */
const OLD_LEAD = 'You’re onto it. Finally, you can show them.';
/** A1, under the button. */
const START_LINE = 'Start your own sample event. Nothing is sent to anyone.';
/** A1, the intro. */
const INTRO = 'Rather read first? Each step below shows what happens.';
/**
 * [[GTC-487]] (28 Nov 2026): the two paragraphs under the line beneath the button, as ruled,
 * joined as the page's visible words read them (two paragraphs, no space between).
 */
const GTC487_STORY =
  'Last Christmas, Elizabeth’s spreadsheet, lovingly crafted, asked Jeremy to bring the salad and the potatoes. Jeremy is not good with spreadsheets. He only saw the salad. There were no potatoes. Some are now calling it Potatogate.' +
  'Gather would have sent Jeremy one message: bring the salad and the potatoes. There would have been potatoes.';
/** A1: removed. */
const TAP_A_STEP = 'Tap a step to open it';
const HEADING = 'Gather';
const TRY_IT = 'Try it yourself';
const NOTE = 'Under construction';
const BUTTON_USE = '<TryItYourselfButton href={SAMPLE_PAGE} label={TRY_IT_YOURSELF} />';

// ── Helpers ──────────────────────────────────────────────────────────────────────────────────
const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const atBase = (rel: string) => {
  const r = git(['show', `${BASE}:${rel}`]);
  return r.status === 0 ? r.stdout : '';
};
const read = (rel: string) => {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return '';
  }
};
/** Code only: JSX, block and line comments stripped (a URL's `://` is kept). */
const codeOnly = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const count = (s: string, needle: string) => (needle === '' ? 0 : s.split(needle).length - 1);
/**
 * The visible words: tags taken out, again and again until nothing changes, so no piece of a tag
 * can be left behind (CodeQL alert 158, 27 Nov 2026; the result for Gather's own page is the same).
 */
const words = (html: string) => {
  let out = html;
  let previous: string;
  do {
    previous = out;
    out = out.replace(/<[^>]*>/g, '');
  } while (out !== previous);
  return out;
};
function walk(dir: string): string[] {
  const out: string[] = [];
  const full = path.join(ROOT, dir);
  if (!fs.existsSync(full)) return out;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(rel));
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(rel);
  }
  return out;
}

interface ExplainerMod {
  EXPLAINER_WORDS: { TITLE: string; INTRO: string };
  EXPLAINER_STEPS: unknown[];
}
/** The words file loaded from its text (it imports nothing), so a broken copy can be loaded too. */
function wordsFrom(src: string): ExplainerMod | null {
  try {
    const js = ts.transpileModule(src, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    }).outputText;
    const exports: Record<string, unknown> = {};
    new Function('exports', 'require', js)(exports, () => {
      throw new Error('the words file imports nothing');
    });
    const m = exports as unknown as ExplainerMod;
    return m.EXPLAINER_WORDS && Array.isArray(m.EXPLAINER_STEPS) ? m : null;
  } catch {
    return null;
  }
}

async function draw(demoStart: string | undefined): Promise<string> {
  const d = await drawInNext({
    route: '/demo',
    scope: 'request',
    nodeEnv: 'development',
    demoStart,
    make: () => (DemoPage as () => unknown)(),
  });
  return d.threw ? `THREW ${d.threw}` : d.html;
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

// ── The input every check reads ──────────────────────────────────────────────────────────────
interface Input {
  page: string;
  words: string;
  explainer: string;
  button: string;
  base: { page: string; words: string; explainer: string; button: string };
  /** Every file under src, for the searches. */
  src: Record<string, string>;
  on: string;
  off: string;
  demo: { status: number; html: string };
  sample: { status: number; html: string };
}
type Check = {
  layer: 'W' | 'R' | 'O' | 'S' | 'H';
  label: string;
  test: (i: Input) => boolean;
  breakIt: (i: Input) => Input;
};

/** The first element whose opening tag carries `attr`, whole; '' when there is none. */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  if (at < 0) return '';
  const open = html.lastIndexOf('<', at);
  const tag = /^<([a-z0-9]+)/.exec(html.slice(open))?.[1];
  if (!tag) return '';
  let depth = 0;
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = open;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
  }
  return '';
}
/** Positions of every `>Try it yourself</button>` in the html. */
const tryIts = (html: string) => {
  const out: number[] = [];
  for (let at = html.indexOf(`>${TRY_IT}</button>`); at >= 0; ) {
    out.push(at);
    at = html.indexOf(`>${TRY_IT}</button>`, at + 1);
  }
  return out;
};
/** The switch's on-branch in the page's code: from `{isDemoStartOn() ? (` to `) : (`. */
function onBranch(src: string): string {
  const code = codeOnly(src);
  const at = code.indexOf('{isDemoStartOn() ? (');
  const end = code.indexOf(') : (', at);
  return at >= 0 && end > at ? code.slice(at, end) : '';
}
const imports = (src: string) =>
  [...codeOnly(src).matchAll(/^import [^;]+;/gm)].map((m) => m[0].replace(/\s+/g, ' ')).sort();

const edit = (i: Input, key: 'page' | 'words' | 'explainer' | 'button', from: string, to: string) =>
  ({ ...i, [key]: i[key].replace(from, to) }) as Input;
const html = (i: Input, key: 'on' | 'off', from: string | RegExp, to: string): Input => ({
  ...i,
  [key]: i[key].replace(from, to),
});

const CHECKS: Check[] = [
  // W — the words.
  {
    layer: 'W',
    label: `W1 D: the line under the heading reads, once, in the page's own constant: "${LEAD}"; the old words in no code under src`,
    test: (i) =>
      count(codeOnly(i.page), `const LEAD = '${LEAD}';`) === 1 &&
      Object.entries(i.src).filter(([, s]) => s.includes(LEAD)).length === 1 &&
      count(i.page, LEAD) === 1 &&
      !Object.values(i.src).some((s) => codeOnly(s).includes(OLD_LEAD)),
    // The straight apostrophe in place of the ruled curly one.
    breakIt: (i) =>
      edit(i, 'page', LEAD, 'Because those potatoes won' + "'" + 't bring themselves to lunch.'),
  },
  {
    layer: 'W',
    label: `W2 A1: the line under the button reads, once, in the page's own constant: "${START_LINE}"`,
    test: (i) =>
      count(codeOnly(i.page), `const START_LINE = '${START_LINE}';`) === 1 &&
      Object.entries(i.src).filter(([, s]) => s.includes(START_LINE)).length === 1 &&
      count(i.page, START_LINE) === 1,
    breakIt: (i) => edit(i, 'page', START_LINE, 'Start your own sample event. Nothing is sent.'),
  },
  {
    layer: 'W',
    label: `W3 A1: the explainer's introduction is the one line "${INTRO}"`,
    test: (i) => wordsFrom(i.words)?.EXPLAINER_WORDS.INTRO === INTRO,
    breakIt: (i) => edit(i, 'words', INTRO, `${INTRO} Tap a step to open it.`),
  },
  {
    layer: 'W',
    label: `W4 A1: "${TAP_A_STEP}." is in no file under src (it was in the old introduction)`,
    test: (i) =>
      Object.keys(i.src).length > 100 &&
      Object.values(i.src).every((s) => !s.toLowerCase().includes(TAP_A_STEP.toLowerCase())) &&
      i.base.words.includes(`${TAP_A_STEP}.`),
    breakIt: (i) => ({ ...i, src: { ...i.src, [WORDS]: `${i.src[WORDS]}\n// ${TAP_A_STEP}.` } }),
  },
  {
    layer: 'W',
    label:
      'W5 nothing else of the explainer moves: its title and its five steps are exactly as at main c8b9b42 (only the introduction is ruled)',
    test: (i) => {
      const now = wordsFrom(i.words);
      const was = wordsFrom(i.base.words);
      return (
        !!now &&
        !!was &&
        now.EXPLAINER_STEPS.length === 5 &&
        now.EXPLAINER_WORDS.TITLE === was.EXPLAINER_WORDS.TITLE &&
        JSON.stringify(now.EXPLAINER_STEPS) === JSON.stringify(was.EXPLAINER_STEPS) &&
        now.EXPLAINER_WORDS.INTRO !== was.EXPLAINER_WORDS.INTRO
      );
    },
    breakIt: (i) => edit(i, 'words', "heading: 'Who’s coming?'", "heading: 'Who is coming?'"),
  },
  {
    layer: 'W',
    label:
      'W6 no price on /demo: no "$" before a number and no "NZD" in the page, its words or the page as drawn',
    test: (i) =>
      i.on.length > 0 &&
      [codeOnly(i.page), codeOnly(i.words), words(i.on)].every(
        (s) => !/\$\s?\d/.test(s) && !/\bNZD\b/.test(s)
      ),
    breakIt: (i) => html(i, 'on', START_LINE, `${START_LINE} $25`),
  },

  // R — drawn with the switch on.
  {
    layer: 'R',
    label:
      'R1 in order: the heading, the D line, "Try it yourself", the line under it, the explainer, and a second "Try it yourself" at its foot; nothing after it',
    test: (i) => {
      const h = i.on;
      const btn = tryIts(h);
      const lead = element(h, 'data-demo-lead=""');
      const line = element(h, 'data-demo-start-line=""');
      const section = element(h, 'data-demo-explainer=""');
      const afterFoot = btn.length === 2 ? h.slice(btn[1] + `>${TRY_IT}</button>`.length) : 'x';
      return (
        btn.length === 2 &&
        lead !== '' &&
        line !== '' &&
        section !== '' &&
        h.indexOf('</h1>') < h.indexOf(lead) &&
        h.indexOf(lead) < btn[0] &&
        btn[0] < h.indexOf(line) &&
        h.indexOf(line) < h.indexOf(section) &&
        h.indexOf(section) + section.length < btn[1] &&
        words(afterFoot) === ''
      );
    },
    breakIt: (i) => {
      // The second button moved above the explainer.
      const section = element(i.on, 'data-demo-explainer=""');
      const foot = element(i.on, 'data-demo-foot=""');
      return { ...i, on: i.on.replace(foot, '').replace(section, `${foot}${section}`) };
    },
  },
  {
    layer: 'R',
    label:
      "R2 every visible word on the page: the heading, the D line, the button, the line under it, GTC-487's two paragraphs, the explainer, the button again; nothing more",
    test: (i) => {
      const section = element(i.on, 'data-demo-explainer=""');
      // [[GTC-487]]: its two paragraphs, between the line under the button and the explainer.
      return (
        section !== '' &&
        words(i.on) ===
          `${HEADING}${LEAD}${TRY_IT}${START_LINE}${GTC487_STORY}${words(section)}${TRY_IT}`
      );
    },
    breakIt: (i) => html(i, 'on', '</h1>', '</h1><p>Sign up now</p>'),
  },
  {
    layer: 'R',
    label:
      'R3 exactly two "Try it yourself" buttons, and no other button but the five step rows; no link out of the page but the screenshots',
    test: (i) => {
      const section = element(i.on, 'data-demo-explainer=""');
      const outside = i.on.replace(section, '');
      return (
        section !== '' &&
        tryIts(i.on).length === 2 &&
        count(outside, '<button') === 2 &&
        count(section, '<button') === 5 &&
        !/<a\b/.test(outside)
      );
    },
    breakIt: (i) => html(i, 'on', '</h1>', `</h1><button>${TRY_IT}</button>`),
  },
  {
    layer: 'R',
    label:
      "R4 the D line sits between the heading and the first button with nothing else; the line under the button is the next thing after it, in the same block (then GTC-487's two paragraphs, before the explainer)",
    test: (i) => {
      const h = i.on;
      const btn = tryIts(h);
      // Up to the start of the first button's opening tag (btn[0] is that tag's closing ">").
      const between = btn.length ? h.slice(h.indexOf('</h1>') + 5, h.lastIndexOf('<', btn[0])) : '';
      const firstBlock = element(h, 'data-demo-start="');
      const sectionAt = h.lastIndexOf('<', h.indexOf('data-demo-explainer'));
      const afterButton = btn.length
        ? h.slice(btn[0] + `>${TRY_IT}</button>`.length, sectionAt)
        : '';
      return (
        words(between) === LEAD &&
        firstBlock !== '' &&
        words(firstBlock) === `${TRY_IT}${START_LINE}` &&
        // [[GTC-487]]: after the line come its two paragraphs, then the explainer.
        words(afterButton) === `${START_LINE}${GTC487_STORY}` &&
        /^<p\b[^>]*data-demo-start-line=""[^>]*>/.test(afterButton)
      );
    },
    breakIt: (i) =>
      html(i, 'on', /(<p\b[^>]*data-demo-start-line=""[^>]*>)/, '<span>Free!</span>$1'),
  },
  {
    layer: 'R',
    label: `R5 the explainer opens with the one-line introduction, the old one gone, and its five steps closed on arrival`,
    test: (i) => {
      const section = element(i.on, 'data-demo-explainer=""');
      return (
        section.includes(`>${INTRO}</p>`) &&
        !section.includes('This is a working copy of Gather') &&
        !section.includes(TAP_A_STEP) &&
        count(section, 'aria-expanded="false"') === 5 &&
        count(section, 'aria-expanded="true"') === 0
      );
    },
    breakIt: (i) => html(i, 'on', `>${INTRO}</p>`, `>${INTRO} ${TAP_A_STEP}.</p>`),
  },
  {
    layer: 'R',
    label:
      'R6 no button stuck to the screen: nothing on the page is fixed or sticky (the ruling: "No button stuck to the bottom of the screen")',
    test: (i) =>
      i.on.length > 0 &&
      ![...i.on.matchAll(/class="([^"]*)"/g)].some((m) =>
        m[1].split(/\s+/).some((c) => /^(?:[a-z]+:)*(fixed|sticky)$/.test(c))
      ),
    breakIt: (i) => html(i, 'on', 'data-demo-foot=""', 'data-demo-foot="" class="fixed bottom-0"'),
  },

  // O — drawn with the switch off.
  {
    layer: 'O',
    label:
      'O1 the switch off: the heading and "Under construction" only, as GTC-430 ruled; no D line, no line under a button, no button, no explainer',
    test: (i) =>
      words(i.off) === `${HEADING}${NOTE}` &&
      !i.off.includes(LEAD) &&
      !i.off.includes(START_LINE) &&
      !/<button\b/.test(i.off) &&
      !i.off.includes('data-demo-explainer'),
    breakIt: (i) => html(i, 'off', '</h1>', `</h1><p>${LEAD}</p>`),
  },

  // S — the code, as text.
  {
    layer: 'S',
    label:
      'S1 one switch, read once: both "Try it yourself" buttons, the D line and the line under the button are all in its on-branch; the off-branch is the note alone',
    test: (i) => {
      const code = codeOnly(i.page);
      const on = onBranch(i.page);
      return (
        count(code, 'isDemoStartOn()') === 1 &&
        count(code, BUTTON_USE) === 2 &&
        count(on, BUTTON_USE) === 2 &&
        count(on, '{LEAD}') === 1 &&
        count(on, '{START_LINE}') === 1 &&
        count(code, '{LEAD}') === 1 &&
        count(code, '{START_LINE}') === 1 &&
        /\) : \(\s*<p className="text-warm-grey-600">\{UNDER_CONSTRUCTION\}<\/p>\s*\)\}/.test(code)
      );
    },
    breakIt: (i) =>
      edit(
        i,
        'page',
        '<p className="text-warm-grey-600">{UNDER_CONSTRUCTION}</p>',
        `<>${BUTTON_USE}<p className="text-warm-grey-600">{UNDER_CONSTRUCTION}</p></>`
      ),
  },
  {
    layer: 'S',
    label:
      "S2 the button and the explainer's own component are exactly as at main c8b9b42; the page imports exactly what it did",
    test: (i) =>
      i.base.button.length > 100 &&
      i.base.explainer.length > 100 &&
      i.button === i.base.button &&
      i.explainer === i.base.explainer &&
      JSON.stringify(imports(i.page)) === JSON.stringify(imports(i.base.page)),
    breakIt: (i) =>
      edit(i, 'button', 'window.location.assign(href)', 'window.location.href = href'),
  },
  {
    layer: 'S',
    label:
      'S3 nothing stored, nothing asked of the server: the page and its words use no browser storage, no cookie and no request, and the page is still drawn on the server',
    test: (i) =>
      [codeOnly(i.page), codeOnly(i.words)].every(
        (s) =>
          s.length > 100 &&
          !/localStorage|sessionStorage|indexedDB|document\.cookie|cookies\(|fetch\(|navigator\.sendBeacon/.test(
            s
          )
      ) && !/^\s*['"]use client['"]/.test(i.page),
    breakIt: (i) =>
      edit(
        i,
        'page',
        'const SAMPLE_PAGE',
        "const SEEN = () => localStorage.getItem('x');\nconst SAMPLE_PAGE"
      ),
  },

  // H — over HTTP.
  {
    layer: 'H',
    label:
      'H1 GET /demo from the dev server is 200 and carries, in order, the heading, the D line, "Try it yourself", the line under it, the introduction and the second "Try it yourself"',
    test: (i) => {
      const h = i.demo.html;
      const parts = [`>${HEADING}</h1>`, LEAD, `>${TRY_IT}</button>`, START_LINE, `>${INTRO}</p>`];
      const at = parts.map((p) => h.indexOf(p));
      const second = h.indexOf(`>${TRY_IT}</button>`, at[4]);
      return (
        i.demo.status === 200 &&
        at.every((x, k) => x >= 0 && (k === 0 || x > at[k - 1])) &&
        second > at[4] &&
        !h.includes(TAP_A_STEP)
      );
    },
    breakIt: (i) => ({ ...i, demo: { ...i.demo, html: i.demo.html.replace(LEAD, '') } }),
  },
  {
    layer: 'H',
    label:
      'H2 GET /demo/new from the dev server is still 200 with "Create Your Event": the layout that now counts the page still opens it',
    test: (i) => i.sample.status === 200 && i.sample.html.includes('Create Your Event'),
    breakIt: (i) => ({ ...i, sample: { ...i.sample, status: 404 } }),
  },
];

// ── Run ──────────────────────────────────────────────────────────────────────────────────────
function safely(c: Check, i: Input): boolean {
  try {
    return c.test(i);
  } catch (e) {
    console.log(`    (threw: ${e instanceof Error ? e.message.split('\n')[0] : String(e)})`);
    return false;
  }
}

async function main() {
  const src: Record<string, string> = {};
  for (const f of walk('src')) src[f] = read(f);
  const [on, off, demo, sample] = [
    await draw('on'),
    await draw(undefined),
    await get('/demo'),
    await get('/demo/new'),
  ];
  const input: Input = {
    page: read(PAGE),
    words: read(WORDS),
    explainer: read(EXPLAINER),
    button: read(BUTTON),
    base: {
      page: atBase(PAGE),
      words: atBase(WORDS),
      explainer: atBase(EXPLAINER),
      button: atBase(BUTTON),
    },
    src,
    on,
    off,
    demo: { status: demo.status, html: demo.html },
    sample: { status: sample.status, html: sample.html },
  };
  if (demo.error) console.log(`    (GET /demo: ${demo.error})`);
  if (on.startsWith('THREW')) console.log(`    (the page did not draw: ${on})`);

  if (DRY_RUN) {
    console.log('demo-entry DRY RUN: each check on this tree, and on an input made to fail it\n');
    let bad = 0;
    for (const c of CHECKS) {
      const here = safely(c, input);
      const broken = c.breakIt(input);
      const changed = JSON.stringify(broken) !== JSON.stringify(input);
      const brokenResult = safely(c, broken);
      const ok = changed && !brokenResult;
      if (!ok) bad++;
      console.log(
        `${ok ? 'ok ' : 'BAD'} ${c.label.split(' ')[0].padEnd(3)} this tree: ${here ? 'green' : 'red  '}  broken input: ${
          brokenResult ? 'GREEN (wrong)' : 'red'
        }${changed ? '' : '  (the break changed nothing)'}`
      );
    }
    console.log(`\nDRY RUN: ${CHECKS.length - bad} of ${CHECKS.length} checks go red when broken`);
    process.exit(bad > 0 ? 1 : 0);
  }

  const TITLES: Record<Check['layer'], string> = {
    W: 'W — the words',
    R: 'R — the page, drawn with the switch on',
    O: 'O — the page, drawn with the switch off',
    S: 'S — the code, read as text',
    H: `H — over HTTP, the dev server at ${BASE_URL}`,
  };
  let passed = 0;
  let failed = 0;
  const reds: string[] = [];
  let last = '';
  for (const c of CHECKS) {
    if (c.layer !== last) {
      console.log(`\n${TITLES[c.layer]}`);
      last = c.layer;
    }
    const ok = safely(c, input);
    if (ok) passed++;
    else {
      failed++;
      reds.push(c.label.split(' ')[0]);
    }
    console.log(`${ok ? '✓' : '✗'} [${c.layer}] ${c.label}`);
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(`red: ${reds.join(' ')}`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
