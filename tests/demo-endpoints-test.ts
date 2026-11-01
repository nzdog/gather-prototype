/**
 * Demo Endpoints Test — GTC-015, narrowed by GTC-269, the old demo retired by GTC-442
 *
 * Asserts:
 * 1. The demo route is REACHABLE in production — the GTC-015 decision — and its one shape
 *    is the visitor's own sample: every other body answers 404 first (GTC-442)
 * 2. The old shared demo is gone: no tokens route, nothing in src names it, no code reads
 *    the shared event's name (GTC-442, replacing the old seed-data and tokens checks)
 * 3. The sample page shows its failures
 *
 * Run with: npx tsx tests/demo-endpoints-test.ts
 *
 * ───────────────────────────────────────────────────────────────────────────────
 * NARROWED BY GTC-269, 2026-09-11. The original reasoning is preserved below
 * because the inversion is a decision, not a regression — GTC-267's precedent.
 *
 * WHAT GTC-015 DECIDED, and it still stands. Commit `f6e4b41` (2026-03-08),
 * "enable demo APIs in production": both demo routes carried
 * `if (process.env.NODE_ENV === 'production') return 404` and both had it removed
 * on purpose, so that a stranger on the deployed site can try the demo. The
 * founder reaffirmed that on 2026-09-11. This file was written in that same
 * commit to hold the decision in place, and holding it is still correct.
 *
 * WHAT WAS WRONG WITH HOW IT HELD IT. Suite 1 asserted
 * `!content.includes("process.env.NODE_ENV === 'production'")` on each route's
 * source, and its failure message read "Route still returns 404 in production —
 * guard must be removed". So a green test carried an instruction to reintroduce a
 * vulnerability, in the file GTC-269 was editing. Founder ruling, 2026-09-11:
 * "A green test whose failure message instructs the reader to reintroduce a
 * vulnerability is not an adjacent problem, it is a loaded gun in the file you
 * are editing."
 *
 * Two further reasons the old shape was unsound, both worth stating plainly:
 *
 *   A SUBSTRING MATCH IS NOT A SECURITY ASSERTION. It tests the spelling of the
 *   code, not its behaviour. The proof: the route's cookie flag reads
 *   `(process.env.NODE_ENV as string) === 'production'` — a cast added in
 *   `a20fbad` (2026-02-21), which PREDATES GTC-015 and has nothing to do with
 *   gating. That cast is the only reason the substring failed to match and the
 *   only reason this suite was green. Delete the cast, change no behaviour
 *   whatsoever, and the old assertion failed.
 *
 *   IT ASSERTED THE ABSENCE OF A MECHANISM, NOT THE PRESENCE OF A PROPERTY.
 *   "No NODE_ENV string anywhere in this file" forbids every future use of
 *   NODE_ENV in these routes, including uses that have nothing to do with gating.
 *   What GTC-015 actually wanted is narrower and is what is asserted now: the
 *   handler does not refuse on the grounds of the environment.
 *
 * WHAT IS ASSERTED NOW. That each demo handler contains no refusal branch keyed
 * on the environment — a `NODE_ENV` test in an `if` whose body returns a 4xx.
 * That is the shape of an environment gate, and it is the same shape
 * `collectEnvGate` in `tests/security-route-scan.ts` looks for, so the two files
 * agree on what a gate is. A `NODE_ENV` reference that is not a refusal — the
 * cookie's `secure` flag — is correctly ignored.
 *
 * THE COPY-START SHAPE, FOUNDER RULING 29 OCT 2026 ([[GTC-425]]). GTC-015's decision
 * stands for the route: it is reachable in production and carries no environment
 * refusal. The copy-start shape of `POST /api/demo/session` (`{ start: 'copy' }`) is
 * now gated by a switch, GATHER_DEMO_START, that the founder turns on at launch; off,
 * that shape answers 404. Test 1.2 holds both.
 *
 * THE OLD SHARED DEMO RETIRED, FOUNDER RULINGS 1 NOV 2026 ([[GTC-442]], Q10, Q14, Q15). The
 * no-body shape of `POST /api/demo/session` (the shared Henderson session) now answers 404
 * before anything else, and `GET /api/demo/tokens` is deleted. Their checks here were retired,
 * each replaced by a check that its subject is gone: 1.1 and 1.3b (the tokens route) by G1 and
 * G2; 2.1 to 2.5 (the shared event's seed rows) by G3. 1.2 is re-aimed at the 404. The local
 * "…2025" row and the seed are left as they are (the plan), so G3 reads src code, not the
 * database.
 *
 * NOT ASSERTED HERE, AND DELIBERATELY: whether the session these routes mint is
 * safe. It is not this file's contract and a source scan cannot see it. GTC-269
 * bounds what the demo session reaches and asserts it behaviourally, by
 * enumeration, in suite 11 of `tests/security-validation.ts`.
 * ───────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'fs';
import * as path from 'path';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function logTest(name: string, passed: boolean, message?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    if (message) {
      console.log(`  ${RED}Error: ${message}${RESET}`);
    }
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

const OLD_DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';
const TOKENS_DIR = path.join(process.cwd(), 'src/app/api/demo/tokens');
const SESSION_ROUTE = path.join(process.cwd(), 'src/app/api/demo/session/route.ts');

/** Every file under a folder, on disk (untracked files included). */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out.push(full);
    }
  };
  walk(dir);
  return out;
}
/** Code only: block and line comments stripped (a URL's `://` is kept). */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

/**
 * CHECKS, pure, so each can be tried on a passing and a failing input.
 */
export const CHECKS = {
  /** The first thing after the body is read: any body but the copy shape answers 404. */
  retiredFirst(source: string): boolean {
    const code = codeOnly(source);
    const handler = code.slice(Math.max(0, code.indexOf('export async function POST')));
    const bodyAt = handler.indexOf('const body =');
    const firstIf = bodyAt < 0 ? -1 : handler.indexOf('if (', bodyAt);
    if (firstIf < 0) return false;
    const retired =
      /^if \(body\?\.start !== 'copy'\) \{\s*return NextResponse\.json\(\{ error: 'Not found' \}, \{ status: 404 \}\);/.test(
        handler.slice(firstIf)
      );
    const before = (needle: string) => {
      const i = handler.indexOf(needle);
      return i < 0 || firstIf < i;
    };
    return retired && before('cookies()') && before('prisma.') && before('isDemoStartOn()');
  },
  /** Files whose raw text holds the needle (comments included). */
  naming(files: Array<{ file: string; text: string }>, needle: string): string[] {
    return files.filter((f) => f.text.includes(needle)).map((f) => f.file);
  },
  /** .ts/.tsx files whose CODE holds the needle (comments stripped). */
  codeNaming(files: Array<{ file: string; text: string }>, needle: string): string[] {
    return files
      .filter((f) => /\.tsx?$/.test(f.file) && codeOnly(f.text).includes(needle))
      .map((f) => f.file);
  },
};

/**
 * Does this source refuse on the grounds of the environment?
 *
 * GTC-269: replaces a bare `content.includes("process.env.NODE_ENV === 'production'")`.
 * An environment gate has a shape — a `NODE_ENV` test in an `if` whose body returns
 * a 4xx — and that shape is what is looked for here. A `NODE_ENV` reference that is
 * not a refusal (the cookie's `secure` flag) is not a gate and is ignored.
 *
 * Comments are stripped first. Both routes now carry headed comments explaining the
 * GTC-015 decision, and those comments quote the gate they are explaining the
 * absence of. Reading a tombstone as the thing itself is the mistake GTC-267's
 * `readCode` helper exists to prevent; this is the same guard rail.
 */
function hasEnvironmentRefusal(source: string): { gated: boolean; evidence: string } {
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // An `if (...NODE_ENV...)` and, within the next few lines, a 4xx return.
  const re = /if\s*\([^)]*NODE_ENV[^)]*\)\s*\{?[\s\S]{0,240}?status:\s*4\d{2}/;
  const m = re.exec(code);
  return { gated: m !== null, evidence: m ? m[0].replace(/\s+/g, ' ').slice(0, 120) : '' };
}

async function testSuite1_RouteFileContent() {
  logSection('Test Suite 1: Route Files — reachable in production (GTC-015 decision)');

  // Test 1.2: session route — GTC-015's reachability, and the copy-start shape's switch.
  //
  // GTC-015 decided this route is reachable in production, and GTC-269 reaffirmed it: no
  // environment refusal. By the founder's ruling of 29 Oct 2026 ([[GTC-425]]) the copy-start
  // shape (`{ start: 'copy' }`) is now gated by a switch, GATHER_DEMO_START, which the founder
  // turns on at launch; while it is off that shape answers 404. [[GTC-442]] (founder ruling
  // Q15, 1 Nov 2026): the old no-body shape is retired, so the first thing after the body is
  // read answers every other body 404, before the switch, the cookie and the database. Its
  // behaviour over HTTP is held by tests/demo-start-switch-test.ts and security suite 11.
  const TEST_1_2 =
    'POST /api/demo/session: no environment refusal (GTC-015); any body but the copy shape ' +
    'answers 404 first (GTC-442); the copy shape is switched by GATHER_DEMO_START, 404 while off';
  try {
    const source = fs.readFileSync(SESSION_ROUTE, 'utf-8');
    const { gated, evidence } = hasEnvironmentRefusal(source);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const switched =
      /if\s*\(\s*body\?\.start\s*===\s*'copy'\s*&&\s*!isDemoStartOn\(\)\s*\)\s*\{\s*return NextResponse\.json\([^;]*status:\s*404/.test(
        code
      );
    const readOnce = (code.match(/isDemoStartOn\(\)/g) ?? []).length === 1;
    const retired = CHECKS.retiredFirst(source);
    logTest(
      TEST_1_2,
      !gated && switched && readOnce && retired,
      gated
        ? `Found an environment gate: "${evidence}". GTC-015 removed this on purpose ` +
            `so the deployed demo works, and GTC-269 reaffirmed it: the fix there was ` +
            `to bound what the minted session REACHES, not to gate who may call the ` +
            `route. That containment is asserted in suite 11 of ` +
            `tests/security-validation.ts. If a gate is being reintroduced, that ` +
            `reverses a product decision — get a ruling.`
        : !switched || !readOnce
          ? `The copy-start shape must answer 404 unless GATHER_DEMO_START is exactly "on", ` +
            `and the switch must be read once, for that shape only (founder ruling, ` +
            `29 Oct 2026, GTC-425). Removing it opens sample copies to anyone in ` +
            `production before launch — get a ruling.`
          : !retired
            ? 'The old no-body shape must be gone: right after the body is read, any body but ' +
              "{ start: 'copy' } answers 404 { error: 'Not found' }, before the switch, the " +
              'cookie and any database call (founder ruling Q15, 1 Nov 2026, GTC-442).'
            : undefined
    );
  } catch (err: any) {
    logTest(TEST_1_2, false, err.message);
  }

  // Test 1.3: the check above can actually see a gate.
  //
  // GTC-269: without this, tests 1.1 and 1.2 are two assertions that a regex found
  // nothing — and a regex that never matches anything finds nothing too. The
  // control is `src/app/api/demo/reset/route.ts`, which DOES carry the gate, and is
  // asserted here to be detected as gated. An empty search result is a claim, and a
  // claim needs a control (GTC-267).
  try {
    const resetRoute = path.join(process.cwd(), 'src/app/api/demo/reset/route.ts');
    const { gated } = hasEnvironmentRefusal(fs.readFileSync(resetRoute, 'utf-8'));
    logTest(
      'CONTROL: the same check DOES detect the gate on POST /api/demo/reset',
      gated,
      'demo/reset is gated on NODE_ENV. If this reports not-gated, the detector is ' +
        'broken and test 1.2 above proves nothing.'
    );
  } catch (err: any) {
    logTest(
      'CONTROL: the same check DOES detect the gate on POST /api/demo/reset',
      false,
      err.message
    );
  }
}

async function testSuite2_OldDemoGone() {
  logSection('Test Suite 2: the old shared demo is gone (GTC-442)');

  // G1 replaces 1.1 and 1.3b: their subject, the tokens route, is deleted.
  logTest(
    'G1 GET /api/demo/tokens is gone: no route file or folder at src/app/api/demo/tokens',
    !fs.existsSync(TOKENS_DIR),
    'src/app/api/demo/tokens still exists. Founder ruling Q10, 1 Nov 2026: it is deleted, ' +
      "not guarded. It vended the shared demo's raw tokens to any caller."
  );

  const src = filesUnder(path.join(process.cwd(), 'src')).map((f) => ({
    file: path.relative(process.cwd(), f),
    text: fs.readFileSync(f, 'latin1'),
  }));

  // G2: nothing in src calls it, links to it or describes it, comments included.
  const naming = CHECKS.naming(src, '/api/demo/tokens');
  logTest(
    'G2 nothing in src names /api/demo/tokens (code, links or comments)',
    src.length > 100 && naming.length === 0,
    `named in: ${naming.join(', ')}`
  );

  // G3 replaces 2.1 to 2.5: their subject, the shared event's seed rows, is no longer read. The
  // local row and the seed stay (the plan), so this reads the code that would look for it.
  const reading = CHECKS.codeNaming(src, OLD_DEMO_EVENT_NAME);
  logTest(
    `G3 no code in src reads "${OLD_DEMO_EVENT_NAME}" (comments may still name it)`,
    src.length > 100 && reading.length === 0,
    `read in: ${reading.join(', ')}`
  );
}

async function testSuite3_ErrorVisibility() {
  logSection('Test Suite 3: Demo Page Error Visibility');

  // Test 3.1: Demo page has user-facing error handling (no silent failures)
  try {
    // [[GTC-395]] item 3 (founder's ruling, 20 Oct 2026): the sample now starts on its own page, so
    // the page that can fail is read: the new sample page, not /demo.
    const demoPage = fs.readFileSync(
      path.join(process.cwd(), 'src/app/demo/new/page.tsx'),
      'utf-8'
    );
    // The demo page must show error state when tokens are unavailable
    const hasErrorState =
      demoPage.includes('error') || demoPage.includes('Error') || demoPage.includes('unavailable');
    logTest(
      'Demo page handles unavailable state (no silent failures)',
      hasErrorState,
      hasErrorState ? undefined : 'Demo page has no error/unavailable handling'
    );
  } catch (err: any) {
    logTest('Demo page handles unavailable state (no silent failures)', false, err.message);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== Demo Endpoints Test — GTC-015 ===${RESET}\n`);

  try {
    await testSuite1_RouteFileContent();
    await testSuite2_OldDemoGone();
    await testSuite3_ErrorVisibility();

    console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);

    if (testsFailed === 0) {
      console.log(`\n${GREEN}${BOLD}✓ All demo endpoint tests passed!${RESET}`);
      process.exit(0);
    } else {
      console.log(`\n${RED}${BOLD}✗ Some demo endpoint tests failed${RESET}`);
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, err.message);
    process.exit(1);
  }
}

if (process.env.DEMO_ENDPOINTS_DRY_RUN !== '1') main();
