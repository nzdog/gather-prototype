/**
 * [[GTC-395]] — THE DEMO TWEAKS, LIST THREE: the founder's seven items after his look at GTC-394.
 *
 * Founder rulings, 20 Oct 2026 (his prompt, through Cowork). Each item adds its own layer here, in
 * its own commit.
 *
 * THE LAYERS
 *   F  items 1 and 2: the front page has only "Try it yourself"; the Sarah button and its handler
 *      go, the session route behind it is not touched.
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
// Imported statically, as GTC-394 ruled for the demo page (a dynamic import() would give the page
// a second toast context if it ever used one).
import DemoPage from '../src/app/demo/page';

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
/** The tag the founder last looked at (GTC-395's rollback structure). */
const GOOD_TAG = 'demo-tweaks-good';
const unchangedSinceGood = (paths: string[]) =>
  spawnSync('git', ['diff', '--quiet', GOOD_TAG, '--', ...paths], { cwd: ROOT }).status === 0;
const render = (el: any) => {
  try {
    return renderToStaticMarkup(el);
  } catch (err) {
    console.log(`    (render threw: ${String((err as Error).message).split('\n')[0]})`);
    return '';
  }
};

// ── Items 1 and 2: the front page, hand-written ──────────────────────────────
const DEMO_PAGE = 'src/app/demo/page.tsx';
/** The one button (GTC-394 tweak 3's own label, founder's words). */
const TRY_IT = 'Try it yourself';
/** The route behind the old Sarah button and the sample's own code: none of them edited. */
const NOT_EDITED_F = [
  'src/app/api/demo/session/route.ts',
  'src/app/api/demo/tokens/route.ts',
  'src/app/api/demo/reset/route.ts',
  'src/lib/demo/copy.ts',
  'src/lib/demo/start-limit.ts',
  'src/lib/demo/send-wall.ts',
  'src/lib/demo/ai-cap.ts',
];

export const CHECKS = {
  /** F1, F2 — the first page: the heading "Gather" and its buttons, and nothing else. */
  frontPage(html: string, buttonsWanted: string[]) {
    const buttons = [...html.matchAll(/<button\b[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
    const h1 = html.match(/<h1\b[^>]*>([^<]*)<\/h1>/);
    return (
      !!h1 &&
      h1[1] === 'Gather' &&
      (html.match(/<h1\b/g) ?? []).length === 1 &&
      JSON.stringify(buttons) === JSON.stringify(buttonsWanted) &&
      (html.match(/<button\b/g) ?? []).length === buttons.length &&
      !/<(h2|h3|p|a|section|hr|img)\b/.test(html) &&
      !/Sarah|Henderson|Christmas/.test(html)
    );
  },
  /** F3 — the page's code: no Sarah door left, and nothing posts to the session route bare. */
  noSarah(src: string) {
    return (
      src.length > 200 &&
      !/Sarah|Henderson/.test(src) &&
      !/handleOpen/.test(src) &&
      !/\/glance/.test(src) &&
      !/fetch\('\/api\/demo\/session',\s*\{\s*method:\s*'POST'\s*\}\)/.test(src) &&
      !/useToast|toast\./.test(src) &&
      /process\.env\.NODE_ENV === 'development' && \(\s*<button\b/.test(src)
    );
  },
};
// ── CHECKS-END ───────────────────────────────────────────────────────────────

// ══ Items 1 and 2 ════════════════════════════════════════════════════════════
async function layerF() {
  section('F — items 1 and 2: the front page has only "Try it yourself"');
  /** The page as a build for `env` draws it (the button is development-only until part D). */
  const draw = (env: string) => {
    const was = process.env.NODE_ENV;
    (process.env as any).NODE_ENV = env;
    try {
      return render(createElement(DemoPage));
    } finally {
      (process.env as any).NODE_ENV = was;
    }
  };
  const dev = draw('development');
  const prod = draw('production');
  assert(
    'F',
    'F1 on the founder’s Mac (development): the heading "Gather" and one button, "Try it yourself", and nothing else',
    CHECKS.frontPage(dev, [TRY_IT]),
    dev.slice(0, 400)
  );
  assert(
    'F',
    'F2 in a production build: the heading "Gather" and no button (until GTC-392 part D)',
    CHECKS.frontPage(prod, []),
    prod.slice(0, 400)
  );
  assert(
    'F',
    'F3 the page’s code: the Sarah button and its handler gone, nothing posts to the session route without a body',
    CHECKS.noSarah(code(DEMO_PAGE))
  );
  assert(
    'F',
    'F4 CONTROL: the session, tokens and reset routes and the sample’s own code are not edited since demo-tweaks-good',
    NOT_EDITED_F.every((f) => read(f).length > 0) && unchangedSinceGood(NOT_EDITED_F)
  );
}

async function main() {
  await layerF();
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log(reds.map((r) => `  - ${r}`).join('\n'));
    process.exit(1);
  }
  process.exit(0);
}

// A dry run imports CHECKS only (DEMO_TWEAKS_2_DRY_RUN=1); the suite runs otherwise.
if (process.env.DEMO_TWEAKS_2_DRY_RUN !== '1') {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
