/**
 * Demo Endpoints Test — GTC-015, narrowed by GTC-269
 *
 * Asserts:
 * 1. Both demo routes are REACHABLE in production — the GTC-015 decision
 * 2. Demo seed data exists in DB (event + required persona tokens)
 * 3. The tokens route is scoped to specific demo personas (not all tokens)
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
 * NOT ASSERTED HERE, AND DELIBERATELY: whether the session these routes mint is
 * safe. It is not this file's contract and a source scan cannot see it. GTC-269
 * bounds what the demo session reaches and asserts it behaviourally, by
 * enumeration, in suite 11 of `tests/security-validation.ts`.
 * ───────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../src/lib/prisma';

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

const DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';
const TOKENS_ROUTE = path.join(process.cwd(), 'src/app/api/demo/tokens/route.ts');
const SESSION_ROUTE = path.join(process.cwd(), 'src/app/api/demo/session/route.ts');

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

  // Test 1.1: tokens route does not refuse on the environment
  try {
    const { gated, evidence } = hasEnvironmentRefusal(fs.readFileSync(TOKENS_ROUTE, 'utf-8'));
    logTest(
      'GET /api/demo/tokens: no environment refusal — reachable in production',
      !gated,
      gated
        ? `Found an environment gate: "${evidence}". GTC-015 removed this on purpose ` +
            `so the deployed demo works. If it is being reintroduced, that reverses a ` +
            `product decision — get a ruling and update the header of this file. Do ` +
            `NOT assume this assertion is the stale one.`
        : undefined
    );
  } catch (err: any) {
    logTest('GET /api/demo/tokens: no environment refusal', false, err.message);
  }

  // Test 1.2: session route does not refuse on the environment
  try {
    const { gated, evidence } = hasEnvironmentRefusal(fs.readFileSync(SESSION_ROUTE, 'utf-8'));
    logTest(
      'POST /api/demo/session: no environment refusal — reachable in production',
      !gated,
      gated
        ? `Found an environment gate: "${evidence}". GTC-015 removed this on purpose ` +
            `so the deployed demo works, and GTC-269 reaffirmed it: the fix there was ` +
            `to bound what the minted session REACHES, not to gate who may call the ` +
            `route. That containment is asserted in suite 11 of ` +
            `tests/security-validation.ts. If a gate is being reintroduced, that ` +
            `reverses a product decision — get a ruling.`
        : undefined
    );
  } catch (err: any) {
    logTest('POST /api/demo/session: no environment refusal', false, err.message);
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
        'broken and tests 1.1 and 1.2 above prove nothing.'
    );
  } catch (err: any) {
    logTest(
      'CONTROL: the same check DOES detect the gate on POST /api/demo/reset',
      false,
      err.message
    );
  }

  // Test 1.3: tokens route is scoped to specific demo personas (not a findMany of all tokens)
  try {
    const content = fs.readFileSync(TOKENS_ROUTE, 'utf-8');
    // The route must target specific demo personas, not return every token in the DB
    const scopedToPersonas =
      content.includes('Sarah Henderson') ||
      content.includes('DEMO_') ||
      content.includes('personName') ||
      content.includes('where:');
    logTest(
      'GET /api/demo/tokens: scoped query (not all tokens)',
      scopedToPersonas,
      scopedToPersonas
        ? undefined
        : 'Route must query specific demo personas, not return all tokens from DB'
    );
  } catch (err: any) {
    logTest('GET /api/demo/tokens: scoped query (not all tokens)', false, err.message);
  }
}

async function testSuite2_DemoSeedData() {
  logSection('Test Suite 2: Demo Seed Data Present in DB');

  // Test 2.1: Demo event exists
  let eventId: string | null = null;
  try {
    const event = await prisma.event.findFirst({
      where: { name: DEMO_EVENT_NAME },
      select: { id: true },
    });
    const exists = event !== null;
    eventId = event?.id ?? null;
    logTest(
      `Demo event "${DEMO_EVENT_NAME}" exists in DB`,
      exists,
      exists ? undefined : 'Demo seed not run — no demo event found'
    );
  } catch (err: any) {
    logTest(`Demo event "${DEMO_EVENT_NAME}" exists in DB`, false, err.message);
  }

  if (!eventId) {
    console.log(`\n${YELLOW}⚠ Skipping token checks — demo event not found${RESET}`);
    return;
  }

  // Test 2.2: Sarah Henderson has a HOST token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'HOST',
        eventId,
        person: { name: 'Sarah Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Sarah Henderson has HOST token',
      exists,
      exists ? undefined : 'No HOST token found for Sarah Henderson'
    );
  } catch (err: any) {
    logTest('Sarah Henderson has HOST token', false, err.message);
  }

  // Test 2.3: Rob Henderson has a COORDINATOR token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'COORDINATOR',
        eventId,
        person: { name: 'Rob Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Rob Henderson has COORDINATOR token',
      exists,
      exists ? undefined : 'No COORDINATOR token found for Rob Henderson'
    );
  } catch (err: any) {
    logTest('Rob Henderson has COORDINATOR token', false, err.message);
  }

  // Test 2.4: Emma Henderson has a PARTICIPANT token
  try {
    const token = await prisma.accessToken.findFirst({
      where: {
        scope: 'PARTICIPANT',
        eventId,
        person: { name: 'Emma Henderson' },
      },
    });
    const exists = token !== null;
    logTest(
      'Emma Henderson has PARTICIPANT token',
      exists,
      exists ? undefined : 'No PARTICIPANT token found for Emma Henderson'
    );
  } catch (err: any) {
    logTest('Emma Henderson has PARTICIPANT token', false, err.message);
  }

  // Test 2.5: tokens endpoint returns all 3 required personas
  try {
    const tokens = await prisma.accessToken.findMany({
      where: {
        eventId,
        person: {
          name: { in: ['Sarah Henderson', 'Rob Henderson', 'Emma Henderson'] },
        },
      },
      include: { person: true },
    });
    const hasHost = tokens.some((t) => t.scope === 'HOST' && t.person.name === 'Sarah Henderson');
    const hasCoord = tokens.some(
      (t) => t.scope === 'COORDINATOR' && t.person.name === 'Rob Henderson'
    );
    const hasParticipant = tokens.some(
      (t) => t.scope === 'PARTICIPANT' && t.person.name === 'Emma Henderson'
    );
    const allPresent = hasHost && hasCoord && hasParticipant;
    logTest(
      'All 3 required demo persona tokens present',
      allPresent,
      allPresent
        ? undefined
        : `Missing: ${!hasHost ? 'Sarah HOST' : ''} ${!hasCoord ? 'Rob COORD' : ''} ${!hasParticipant ? 'Emma PARTICIPANT' : ''}`
    );
  } catch (err: any) {
    logTest('All 3 required demo persona tokens present', false, err.message);
  }
}

async function testSuite3_ErrorVisibility() {
  logSection('Test Suite 3: Demo Page Error Visibility');

  // Test 3.1: Demo page has user-facing error handling (no silent failures)
  try {
    const demoPage = fs.readFileSync(path.join(process.cwd(), 'src/app/demo/page.tsx'), 'utf-8');
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
    await testSuite2_DemoSeedData();
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
  } finally {
    await prisma.$disconnect();
  }
}

main();
