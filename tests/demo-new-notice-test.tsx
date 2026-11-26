/**
 * [[GTC-469]] — THE "CAN'T START A SAMPLE" MESSAGE ON /demo/new IS EASY TO MISS.
 *
 * Founder, 22 Nov 2026: "This error message needs to be more obvious." The message (and the
 * save-failed line) moves above the Create button, into an amber box like the sample banner, with
 * normal-size text; "Go to it →" is a link drawn like a button; the box is announced
 * (role="status") and scrolled into view. No word changes.
 *
 * These read the page's code. A page file cannot export a box to draw on its own, and nothing here
 * may run a server, so how it looks and reads is the founder's, in his browser.
 *
 *   N1 the box sits above the submit button; drawn only when `line` is set
 *   N2 amber box, normal-size text
 *   N3 announced (role="status") and scrolled into view when the outcome changes
 *   N4 "Go to it →" is a link drawn like a button, inside the box, only with a link
 *   N5 the old small grey line is gone; the privacy line is right under the button
 *   N6 CONTROL: the same outcomes reach the box; the pause and the privacy words are as at main
 *   N7 CONTROL: start-limit.ts, new-event.ts and the layout are as at main (no word changed);
 *      [[GTC-486]]: the layout but for the visit count's import and its one call
 *   N8 CONTROL: nothing of price, payment or Stripe
 *
 * SAFETY. No browser, no database, no network, no server. Reads files and runs `git` read-only.
 *
 * Run: npx tsx --tsconfig tests/tsconfig.json tests/demo-new-notice-test.tsx
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
/** origin/main when this ticket began: the merge of pull request 109. */
const MAIN = 'ab463caa05b60cd8a5db25a6a82ae6302c1d786b';

const PAGE = 'src/app/demo/new/page.tsx';
const WORD_FILES = [
  'src/lib/demo/start-limit.ts',
  'src/lib/demo/new-event.ts',
  'src/app/demo/new/layout.tsx',
];

const git = (args: string[]) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

/**
 * [[GTC-486]] (founder ruling E, 26 Nov 2026: "Count /demo/new as a fourth page", by "a layout
 * file with one call"): the one change N7 lets the layout carry. Against main ab463ca, nothing
 * removed, and the only added code is the counter's import and its one call, in that order; any
 * other added line is a comment.
 */
const LAYOUT = 'src/app/demo/new/layout.tsx';
const GTC486_LAYOUT_CODE = [
  "import { countPageVisit } from '@/lib/page-visit';",
  "  await countPageVisit('sample');",
];
function layoutMovedByGtc486Only(): boolean {
  const d = git(['diff', '--unified=0', MAIN, '--', LAYOUT]);
  if (d.status !== 0) return false;
  const lines = d.stdout.split('\n');
  const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---'));
  const added = lines
    .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
    .map((l) => l.slice(1))
    .filter((l) => !/^\s*(\/\*\*?|\*|\*\/|\/\/)/.test(l) && l.trim() !== '');
  return (
    removed.length === 0 &&
    JSON.stringify(added) === JSON.stringify(GTC486_LAYOUT_CODE) &&
    git(['status', '--porcelain', '--untracked-files=all', '--', LAYOUT]).stdout.trim() !==
      '?? ' + LAYOUT
  );
}
const stripComments = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
const count = (s: string, needle: string) => s.split(needle).length - 1;

/** The checks, as pure functions of the page's code, so a scratch copy can be put through them. */
export const CHECKS = {
  /** The box's code: from `{line && (` to the submit button; '' when it is not above the button. */
  box(src: string): string {
    const at = src.indexOf('{line && (');
    const button = src.indexOf('<button');
    return at >= 0 && button > at ? src.slice(at, button) : '';
  },
  /** N1 */
  aboveButton(src: string): boolean {
    const at = src.indexOf('{line && (');
    const close = src.indexOf('</button>');
    return (
      count(src, '{line && (') === 1 &&
      at >= 0 &&
      close > at &&
      count(src, '{line.words}') === 1 &&
      src.indexOf('{line.words}') > at &&
      src.indexOf('{line.words}') < close
    );
  },
  /** N2 */
  amber(src: string): boolean {
    const box = CHECKS.box(src);
    return (
      box !== '' &&
      box.includes('border-amber-300') &&
      box.includes('bg-amber-50') &&
      box.includes('text-amber-900') &&
      box.includes('text-base') &&
      !/text-(xs|sm)\b/.test(box)
    );
  },
  /** N3 */
  announced(src: string): boolean {
    const box = CHECKS.box(src);
    return (
      box.includes('role="status"') &&
      box.includes('ref={noticeRef}') &&
      /useRef</.test(src) &&
      /useEffect\(\(\) => \{[\s\S]*?noticeRef\.current[\s\S]*?scrollIntoView[\s\S]*?\}, \[outcome\]\)/.test(
        src
      )
    );
  },
  /** N4 */
  link(src: string): boolean {
    const box = CHECKS.box(src);
    // The classes live in one constant, so the tag stays on one line: `<a href={line.href} ...`.
    const a = /\{line\.href && \(\s*<a href=\{line\.href\} className=\{(\w+)\}>/.exec(box);
    const held = a ? new RegExp(`const ${a[1]} =\\s*'([^']*)';`).exec(src) : null;
    const classes = held?.[1] ?? '';
    return (
      !!a &&
      box.includes('{DEMO_START_WORDS.GO_TO_IT}') &&
      /\brounded/.test(classes) &&
      /\bpx-\d/.test(classes) &&
      /\bpy-\d/.test(classes) &&
      /\bfont-semibold\b/.test(classes) &&
      /\bbg-amber-800\b/.test(classes) &&
      /\btext-white\b/.test(classes) &&
      !box.includes('<button') &&
      count(src, '<button') === 1 &&
      count(src, '</button>') === 1
    );
  },
  /** N5 */
  oldLineGone(src: string): boolean {
    const privacy = src.indexOf('data-privacy-line');
    const afterPrivacy = src.slice(privacy);
    return (
      !/text-sm text-gray-700 text-center/.test(src) &&
      !afterPrivacy.includes('{line') &&
      !afterPrivacy.includes('line.words') &&
      /<\/button>\s*<p data-privacy-line="" className="[^"]*">\s*\{PRIVACY_LINE\}\s*<\/p>/.test(src)
    );
  },
  /** N6: the same outcomes reach `line`, the same pause, the same privacy words as at main. */
  sameOutcomes(src: string, mainSrc: string): boolean {
    const privacy = (s: string) => /const PRIVACY_LINE =\s*'([^']*)';/.exec(s)?.[1] ?? null;
    return (
      /outcome\?\.kind === 'saveError'\s*\?\s*\{ words: SAMPLE_EVENT_WORDS\.SAVE_FAILED, href: outcome\.href \}\s*:\s*outcome\?\.kind === 'refused'\s*\?\s*\{ words: outcome\.words, href: outcome\.href \}\s*:\s*null/.test(
        src
      ) &&
      src.includes('const SAVE_ERROR_PAUSE_MS = 3000;') &&
      /setTimeout\(\(\) => \{\s*window\.location\.href = result\.href;\s*\}, SAVE_ERROR_PAUSE_MS\);/.test(
        src
      ) &&
      privacy(src) !== null &&
      privacy(src) === privacy(mainSrc)
    );
  },
  /** N8 */
  noPayment(text: string): boolean {
    return (
      text.length > 0 && !/\$\s?\d|stripe|\bpay\b|\bpay\s*&|payment|checkout|billing/i.test(text)
    );
  },
};

let passed = 0;
let failed = 0;
const reds: string[] = [];
function assert(label: string, condition: boolean, detail?: string) {
  if (condition) {
    passed++;
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
  } else {
    failed++;
    reds.push(label);
    console.log(`\x1b[31m✗\x1b[0m ${label}${detail ? `\n    ${detail}` : ''}`);
  }
}

function main() {
  console.log('GTC-469 — the "can\'t start a sample" message on /demo/new');
  const src = stripComments(fs.readFileSync(path.join(ROOT, PAGE), 'utf8'));
  const atMain = git(['show', `${MAIN}:${PAGE}`]);
  const mainSrc = atMain.status === 0 ? stripComments(atMain.stdout) : '';

  assert(
    'N1 the outcome box sits above the Create button, drawn only when `line` is set',
    CHECKS.aboveButton(src)
  );
  assert(
    'N2 the box is amber (border-amber-300, bg-amber-50, text-amber-900) with normal-size text',
    CHECKS.amber(src)
  );
  assert(
    'N3 the box is role="status", and an effect scrolls it into view when the outcome changes',
    CHECKS.announced(src)
  );
  assert(
    'N4 "Go to it →" is a link drawn like a button, inside the box, only with a link; one <button>',
    CHECKS.link(src)
  );
  assert(
    'N5 the old small grey line is gone; nothing after the privacy line; privacy line right under the button',
    CHECKS.oldLineGone(src)
  );
  assert(
    'N6 CONTROL: the same outcomes reach the box; 3000 ms pause and privacy words as at main',
    mainSrc !== '' && CHECKS.sameOutcomes(src, mainSrc)
  );

  const moved = WORD_FILES.filter(
    (f) =>
      !(f === LAYOUT && layoutMovedByGtc486Only()) &&
      (git(['diff', '--quiet', MAIN, '--', f]).status !== 0 ||
        git(['status', '--porcelain', '--untracked-files=all', '--', f]).stdout.trim() !== '')
  );
  assert(
    'N7 CONTROL: start-limit.ts, new-event.ts and the layout are as at main ab463ca (the layout but for GTC-486’s visit count, its import and its one call)',
    moved.length === 0,
    moved.join(', ')
  );
  assert('N8 CONTROL: the page names nothing of price, payment or Stripe', CHECKS.noPayment(src));

  console.log(`\n${passed} passed, ${failed} failed`);
  if (reds.length) console.log(reds.map((r) => `  - ${r}`).join('\n'));
  process.exit(failed > 0 ? 1 : 0);
}

// A dry run imports CHECKS only (DEMO_NEW_NOTICE_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_NEW_NOTICE_DRY_RUN !== '1') main();
