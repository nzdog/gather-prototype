/**
 * [[GTC-487]] — THE POTATOES PARAGRAPH: two short paragraphs on /demo, directly under the line
 * beneath the button. Founder ruling of 28 Nov 2026, verbatim in docs/tickets/GTC-487.md:
 *
 *   On /demo, directly under the line "Start your own sample event. Nothing is sent to anyone.",
 *   add two short paragraphs. The words, exactly:
 *   Paragraph 1: Last Christmas, Elizabeth's spreadsheet, lovingly crafted, asked Jeremy to bring
 *     the salad and the potatoes. Jeremy is not good with spreadsheets. He only saw the salad.
 *     There were no potatoes. Some are now calling it Potatogate.
 *   Paragraph 2: Gather would have sent Jeremy one message: bring the salad and the potatoes.
 *     There would have been potatoes.
 *   - Curly apostrophes, to match the rest of the page.
 *   - Quiet body text, smaller than the headline, in the page's existing style. No box, no
 *     picture, no new colour.
 *   - Nothing else on the page changes.
 *   - It shows only when the demo is switched on.
 *   - No price on /demo. No new tracking of any kind.
 *
 * Layers:
 *   W  the words, as ruled.
 *   R  the page drawn in Next's request scope with the switch on.
 *   O  the page drawn with the switch off (GTC-430's note, unchanged).
 *   S  the code, read as text, against main as this ticket began.
 *   H  over HTTP, the dev server (the switch on, as .env.local has it). GETs only, with no
 *      Sec-Fetch headers, so the server writes no visit line for them.
 *
 * SAFETY. No browser, no database, no writes. Nothing is pressed.
 *
 * DEMO_POTATOES_DRY_RUN=1: every check is also run on an input made to fail it. Each must go red
 * there, and each breaking change must really change the input; otherwise the dry run fails.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/demo-potatoes-test.tsx
 */
// The helper first: it must set up Next's request stores before any page is loaded.
import { drawInNext } from './helpers/next-request-scope';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import DemoPage from '../src/app/demo/page';

const ROOT = path.join(__dirname, '..');
const DRY_RUN = process.env.DEMO_POTATOES_DRY_RUN === '1';
const BASE_URL = process.env.DEMO_SANDBOX_BASE_URL ?? 'http://localhost:3000';

// ── Commits (fixed) ──────────────────────────────────────────────────────────────────────────
/** origin/main when this ticket began: the merge of pull request #128 (GTC-482). */
const BASE = '89da9a344b02405cbc58028a3f6fc7e2f3d94e88';

// ── Files ────────────────────────────────────────────────────────────────────────────────────
const PAGE = 'src/app/demo/page.tsx';
const WORDS = 'src/lib/demo/explainer-words.ts';
const EXPLAINER = 'src/components/demo/DemoExplainer.tsx';
const BUTTON = 'src/components/demo/TryItYourselfButton.tsx';
const PAGE_VISIT = 'src/lib/page-visit.ts';
const SAMPLE_LAYOUT = 'src/app/demo/new/layout.tsx';
/** Every file the page draws or counts with: each must be exactly as at BASE. */
const UNCHANGED = [WORDS, EXPLAINER, BUTTON, PAGE_VISIT, SAMPLE_LAYOUT];

// ── The ruled words (28 Nov 2026) ────────────────────────────────────────────────────────────
/** Paragraph 1, with the page's own curly apostrophe (’), as ruled. */
const STORY =
  'Last Christmas, Elizabeth’s spreadsheet, lovingly crafted, asked Jeremy to bring the salad and the potatoes. Jeremy is not good with spreadsheets. He only saw the salad. There were no potatoes. Some are now calling it Potatogate.';
/** Paragraph 2. */
const STORY_GATHER =
  'Gather would have sent Jeremy one message: bring the salad and the potatoes. There would have been potatoes.';
/** The line the paragraphs sit under (GTC-486, wording A1). */
const START_LINE = 'Start your own sample event. Nothing is sent to anyone.';
/** The explainer's introduction (GTC-486, wording A1): the steps start after the paragraphs. */
const INTRO = 'Rather read first? Each step below shows what happens.';
const HEADING = 'Gather';
const NOTE = 'Under construction';
/** The explainer introduction's text classes: the page's existing body text (reading 4). */
const BODY_TEXT = ['text-sm', 'leading-relaxed', 'text-warm-grey-700'];
/** Tailwind's text sizes, smallest first. */
const SIZES = ['text-xs', 'text-sm', 'text-base', 'text-lg', 'text-xl', 'text-2xl', 'text-3xl'];

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
/** Every run of white space as one space, so the formatter's line breaks do not count. */
const flat = (s: string) => s.replace(/\s+/g, ' ').trim();
const count = (s: string, needle: string) => (needle === '' ? 0 : s.split(needle).length - 1);
/** The visible words: tags taken out, again and again until nothing changes (as demo-entry). */
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
/** Every class on every tag in a piece of html. */
const classes = (html: string) =>
  [...html.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/).filter(Boolean));
/** A text colour class: text-warm-grey-700, text-sage-600, text-white (not a size or alignment). */
const isTextColour = (c: string) =>
  /^(?:[a-z]+:)*text-(?:[a-z]+-)*(?:\d{2,3}|white|black)$/.test(c);
/** The switch's on-branch in the page's code: from `{isDemoStartOn() ? (` to `) : (`. */
function onBranch(src: string): string {
  const code = codeOnly(src);
  const at = code.indexOf('{isDemoStartOn() ? (');
  const end = code.indexOf(') : (', at);
  return at >= 0 && end > at ? code.slice(at, end) : '';
}
/**
 * The page's code with this ticket's additions taken out: the two constants and the one block.
 * What is left must be main's code exactly (white space aside).
 */
const withoutStory = (src: string) =>
  flat(
    codeOnly(src)
      .replace(/const STORY =\s*'[^'\n]*';/, '')
      .replace(/const STORY_GATHER =\s*'[^'\n]*';/, '')
      .replace(/<div\s+data-demo-story=""[\s\S]*?<\/div>/, '')
  );
const imports = (src: string) =>
  [...codeOnly(src).matchAll(/^import [^;]+;/gm)].map((m) => flat(m[0])).sort();

// ── The input every check reads ──────────────────────────────────────────────────────────────
interface Input {
  page: string;
  basePage: string;
  /** Each UNCHANGED file, now and at BASE. */
  kept: Record<string, { now: string; base: string }>;
  /** Every file under src, for the searches. */
  src: Record<string, string>;
  on: string;
  off: string;
  demo: { status: number; html: string };
}
type Check = {
  layer: 'W' | 'R' | 'O' | 'S' | 'H';
  label: string;
  test: (i: Input) => boolean;
  breakIt: (i: Input) => Input;
};

const editPage = (i: Input, from: string | RegExp, to: string): Input => ({
  ...i,
  page: i.page.replace(from, to),
  src: { ...i.src, [PAGE]: i.src[PAGE].replace(from, to) },
});
const html = (i: Input, key: 'on' | 'off', from: string | RegExp, to: string): Input => ({
  ...i,
  [key]: i[key].replace(from, to),
});

/** A ruled paragraph, in its own constant, once, and in no other file under src. */
const inItsConstant = (i: Input, name: string, text: string) =>
  count(flat(codeOnly(i.page)), `const ${name} = '${text}';`) === 1 &&
  count(i.page, text) === 1 &&
  Object.entries(i.src).filter(([, s]) => s.includes(text)).length === 1;

const CHECKS: Check[] = [
  // W — the words.
  {
    layer: 'W',
    label: `W1 paragraph 1 reads exactly, once, in the page's own constant, with the curly apostrophe: "${STORY}"; the straight "Elizabeth's" in no file under src`,
    test: (i) =>
      inItsConstant(i, 'STORY', STORY) &&
      STORY.includes('Elizabeth’s') &&
      !Object.values(i.src).some((s) => s.includes("Elizabeth's")),
    breakIt: (i) => editPage(i, 'Elizabeth’s', "Elizabeth's"),
  },
  {
    layer: 'W',
    label: `W2 paragraph 2 reads exactly, once, in the page's own constant: "${STORY_GATHER}"`,
    test: (i) => inItsConstant(i, 'STORY_GATHER', STORY_GATHER),
    breakIt: (i) => editPage(i, 'one message: bring', 'one text: bring'),
  },
  {
    layer: 'W',
    label:
      'W3 the page as drawn: every apostrophe curly (no straight one, raw or escaped), and no price (no "$" before a number, no "NZD")',
    test: (i) => {
      const seen = words(i.on);
      return (
        i.on.length > 0 &&
        !seen.includes("'") &&
        !/&#x27;|&#39;|&apos;/.test(i.on) &&
        !/\$\s?\d/.test(seen) &&
        !/\bNZD\b/.test(seen)
      );
    },
    breakIt: (i) => html(i, 'on', 'won’t', 'won&#x27;t'),
  },

  // R — drawn with the switch on.
  {
    layer: 'R',
    label:
      "R1 the place: the paragraphs come straight after the line under the button (its block closes, then theirs opens), in the button's column, and the steps come straight after them",
    test: (i) => {
      const h = i.on;
      const line = element(h, 'data-demo-start-line=""');
      const story = element(h, 'data-demo-story=""');
      const section = element(h, 'data-demo-explainer=""');
      if (!line || !story || !section) return false;
      const lineEnd = h.indexOf(line) + line.length;
      const storyAt = h.indexOf(story);
      const own = classes(story.slice(0, story.indexOf('>') + 1));
      return (
        count(h, 'data-demo-story=""') === 1 &&
        h.slice(lineEnd, storyAt) === '</div>' &&
        storyAt + story.length === h.indexOf(section) &&
        ['mx-auto', 'w-full', 'max-w-sm'].every((c) => own.includes(c))
      );
    },
    breakIt: (i) => {
      // The paragraphs moved below the steps.
      const story = element(i.on, 'data-demo-story=""');
      const section = element(i.on, 'data-demo-explainer=""');
      return { ...i, on: i.on.replace(story, '').replace(section, `${section}${story}`) };
    },
  },
  {
    layer: 'R',
    label:
      'R2 the words drawn: the block holds exactly two paragraphs, paragraph 1 then paragraph 2, each whole in its own <p>, and nothing else; each is on the page once',
    test: (i) => {
      const story = element(i.on, 'data-demo-story=""');
      const ps = [...story.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]);
      return (
        story !== '' &&
        ps.length === 2 &&
        ps[0] === STORY &&
        ps[1] === STORY_GATHER &&
        words(story) === `${STORY}${STORY_GATHER}` &&
        count(i.on, STORY) === 1 &&
        count(i.on, STORY_GATHER) === 1
      );
    },
    breakIt: (i) => html(i, 'on', `${STORY_GATHER}</p>`, `${STORY_GATHER}</p><p>Sign up now</p>`),
  },
  {
    layer: 'R',
    label:
      "R3 quiet body text in the page's style: the explainer introduction's text classes, one size and smaller than the headline's, no serif or bold, every colour already on the page at main; no box (border, background, shadow, ring, rounding) and no picture",
    test: (i) => {
      const story = element(i.on, 'data-demo-story=""');
      const lead = element(i.on, 'data-demo-lead=""');
      if (!story || !lead) return false;
      const cs = classes(story);
      const sizes = cs.filter((c) => SIZES.includes(c));
      const leadSize = classes(lead.slice(0, lead.indexOf('>') + 1)).find((c) => SIZES.includes(c));
      const mainCode = `${i.basePage}\n${i.kept[EXPLAINER].base}`;
      return (
        BODY_TEXT.every((c) => cs.includes(c)) &&
        sizes.length === 1 &&
        !!leadSize &&
        SIZES.indexOf(sizes[0]) < SIZES.indexOf(leadSize) &&
        !cs.some((c) => /^(?:[a-z]+:)*font-/.test(c)) &&
        cs.filter(isTextColour).every((c) => mainCode.includes(c)) &&
        !cs.some((c) => /^(?:[a-z]+:)*(?:bg|border|shadow|ring|outline|rounded)(?:-|$)/.test(c)) &&
        !/<(?:img|svg|picture|figure|video|canvas|iframe)\b/.test(story)
      );
    },
    breakIt: (i) =>
      html(i, 'on', 'data-demo-story=""', 'data-demo-story="" style="" class="rounded-xl border"'),
  },

  // O — drawn with the switch off.
  {
    layer: 'O',
    label:
      'O1 the switch off: the heading and "Under construction" only, as GTC-430 ruled; neither paragraph',
    test: (i) =>
      words(i.off) === `${HEADING}${NOTE}` &&
      !i.off.includes(STORY) &&
      !i.off.includes(STORY_GATHER) &&
      !i.off.includes('data-demo-story'),
    breakIt: (i) => html(i, 'off', '</h1>', `</h1><p>${STORY}</p>`),
  },

  // S — the code, as text.
  {
    layer: 'S',
    label:
      "S1 in the code, once each and only in the switch's on-branch: {STORY} and {STORY_GATHER}, in one block between the first button's block and <DemoExplainer />",
    test: (i) => {
      const code = codeOnly(i.page);
      const on = onBranch(i.page);
      const startAt = on.indexOf('data-demo-start=""');
      const storyAt = on.indexOf('data-demo-story=""');
      const explainerAt = on.indexOf('<DemoExplainer />');
      return (
        count(code, '{STORY}') === 1 &&
        count(code, '{STORY_GATHER}') === 1 &&
        count(on, '{STORY}') === 1 &&
        count(on, '{STORY_GATHER}') === 1 &&
        startAt >= 0 &&
        startAt < storyAt &&
        storyAt < on.indexOf('{STORY}') &&
        on.indexOf('{STORY}') < on.indexOf('{STORY_GATHER}') &&
        on.indexOf('{STORY_GATHER}') < explainerAt
      );
    },
    breakIt: (i) =>
      editPage(
        i,
        '<p className="text-warm-grey-600">{UNDER_CONSTRUCTION}</p>',
        '<><p>{STORY}</p><p className="text-warm-grey-600">{UNDER_CONSTRUCTION}</p></>'
      ),
  },
  {
    layer: 'S',
    label:
      "S2 nothing else on the page changes: take out the two constants and the one block, and the page's code is main's (89da9a3) exactly; the button, the explainer and its words as at main",
    test: (i) =>
      i.basePage.length > 100 &&
      withoutStory(i.page) === withoutStory(i.basePage) &&
      [WORDS, EXPLAINER, BUTTON].every(
        (f) => i.kept[f].base.length > 100 && i.kept[f].now === i.kept[f].base
      ),
    breakIt: (i) => editPage(i, 'font-serif text-xl', 'font-serif text-2xl'),
  },
  {
    layer: 'S',
    label:
      "S3 no new tracking: the page imports what it did and counts its visit once, as at main; the visit counter and the sample page's layout as at main; no storage, cookie, request or beacon",
    test: (i) => {
      const code = codeOnly(i.page);
      return (
        JSON.stringify(imports(i.page)) === JSON.stringify(imports(i.basePage)) &&
        count(code, 'countPageVisit(') === 1 &&
        count(codeOnly(i.basePage), 'countPageVisit(') === 1 &&
        [PAGE_VISIT, SAMPLE_LAYOUT].every(
          (f) => i.kept[f].base.length > 50 && i.kept[f].now === i.kept[f].base
        ) &&
        !/localStorage|sessionStorage|indexedDB|document\.cookie|cookies\(|fetch\(|sendBeacon|gtag|dataLayer|analytics|new Image\(/.test(
          code
        ) &&
        !/^\s*['"]use client['"]/.test(i.page)
      );
    },
    breakIt: (i) =>
      editPage(
        i,
        'await connection();',
        "await connection();\n  void fetch('/api/track', { method: 'POST' });"
      ),
  },

  // H — over HTTP.
  {
    layer: 'H',
    label:
      "H1 GET /demo from the dev server is 200 and carries, in order and each drawn once: the line under the button, paragraph 1, paragraph 2, then the steps' introduction",
    test: (i) => {
      const h = i.demo.html;
      const parts = [START_LINE, `>${STORY}</p>`, `>${STORY_GATHER}</p>`, `>${INTRO}</p>`];
      const at = parts.map((p) => h.indexOf(p));
      // Drawn once: counted as paragraphs (`>words</p>`), because the served page also carries
      // Next's own copy of the page's data in a script at its foot, where the words appear again.
      return (
        i.demo.status === 200 &&
        at.every((x, k) => x >= 0 && (k === 0 || x > at[k - 1])) &&
        count(h, `>${STORY}</p>`) === 1 &&
        count(h, `>${STORY_GATHER}</p>`) === 1
      );
    },
    breakIt: (i) => ({ ...i, demo: { ...i.demo, html: i.demo.html.replace(STORY, '') } }),
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
  const kept: Input['kept'] = {};
  for (const f of UNCHANGED) kept[f] = { now: read(f), base: atBase(f) };
  const [on, off, demo] = [await draw('on'), await draw(undefined), await get('/demo')];
  const input: Input = {
    page: read(PAGE),
    basePage: atBase(PAGE),
    kept,
    src,
    on,
    off,
    demo: { status: demo.status, html: demo.html },
  };
  if (demo.error) console.log(`    (GET /demo: ${demo.error})`);
  if (on.startsWith('THREW')) console.log(`    (the page did not draw: ${on})`);

  if (DRY_RUN) {
    console.log(
      'demo-potatoes DRY RUN: each check on this tree, and on an input made to fail it\n'
    );
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
