/**
 * Security Regression Test: Transition Endpoint Auth
 *
 * Tests the /api/events/:id/transition endpoint to ensure:
 * 1. Unauthenticated requests are fail-closed (401, not 500)
 * 2. Invalid session cookies return 401, not 500
 * 3. Authenticated hosts can transition successfully
 * 4. Error responses never leak internal details (no Prisma errors)
 *
 * This test MUST fail before the auth fix and pass after.
 */

import { generateFixtures, cleanup, Fixtures } from './security-fixtures';

const BASE_URL = 'http://localhost:3000';
let fixtures: Fixtures;

// Test results
let total = 0;
let passed = 0;
let failed = 0;
const failures: string[] = [];

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function log(msg: string) {
  console.log(msg);
}
function pass(test: string) {
  total++;
  passed++;
  log(`${GREEN}✓${RESET} ${test}`);
}
function fail(test: string, detail: string) {
  total++;
  failed++;
  log(`${RED}✗${RESET} ${test}`);
  log(`  ${RED}${detail}${RESET}`);
  failures.push(`${test}: ${detail}`);
}

/**
 * Test 1: Unauthenticated transition must be fail-closed (401, NOT 500)
 * CRITICAL: This is the regression that exposed the security hole.
 */
async function testUnauthTransitionFailClosed() {
  log(`\n${BOLD}${YELLOW}Test 1: Unauthenticated Transition Fail-Closed${RESET}`);

  const res = await fetch(`${BASE_URL}/api/events/${fixtures.eventDraft.id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: 'not-a-real-id', to: 'FROZEN' }),
  });

  const body = await res.text();

  // CRITICAL: Must be 401 (fail-closed), NOT 500 (internal error leak)
  if (res.status === 401) {
    pass('POST /api/events/:id/transition without auth returns 401');
  } else if (res.status === 403) {
    pass('POST /api/events/:id/transition without auth returns 403 (acceptable)');
  } else if (res.status === 500) {
    fail(
      'Unauthenticated transition returns 500',
      `CRITICAL: Returns 500 instead of 401. This exposes internal errors. Body: ${body.substring(0, 200)}`
    );
  } else {
    fail(
      'Unauthenticated transition status',
      `Expected 401/403, got ${res.status}. Body: ${body.substring(0, 200)}`
    );
  }

  // Secondary check: Response must not leak Prisma details
  if (
    body.toLowerCase().includes('prisma') ||
    body.toLowerCase().includes('foreign key') ||
    body.toLowerCase().includes('actorId_fkey')
  ) {
    fail(
      'Prisma error leak in unauth response',
      `Response body contains internal database details: ${body.substring(0, 300)}`
    );
  } else {
    pass('Unauthenticated response does not leak internal details');
  }
}

/**
 * Test 2: Invalid session cookie must return 401, not 500
 */
async function testInvalidSessionTransition() {
  log(`\n${BOLD}${YELLOW}Test 2: Invalid Session Cookie Fail-Closed${RESET}`);

  const res = await fetch(`${BASE_URL}/api/events/${fixtures.eventDraft.id}/transition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: 'session=INVALID_SESSION_TOKEN_SHOULD_FAIL',
    },
    body: JSON.stringify({ actorId: 'fake-actor', to: 'FROZEN' }),
  });

  const body = await res.text();

  if (res.status === 401) {
    pass('POST /api/events/:id/transition with invalid session returns 401');
  } else if (res.status === 403) {
    pass('POST /api/events/:id/transition with invalid session returns 403 (acceptable)');
  } else if (res.status === 500) {
    fail(
      'Invalid session returns 500',
      `Should return 401, got 500. Body: ${body.substring(0, 200)}`
    );
  } else {
    fail(
      'Invalid session status',
      `Expected 401/403, got ${res.status}. Body: ${body.substring(0, 200)}`
    );
  }
}

/**
 * Test 3: Authenticated host can transition (or get proper validation error)
 */
async function testAuthenticatedTransition() {
  log(`\n${BOLD}${YELLOW}Test 3: Authenticated Transition Works${RESET}`);

  // Use session cookie to authenticate (this route is SESSION + requireEventRole)
  const res = await fetch(`${BASE_URL}/api/events/${fixtures.eventDraft.id}/transition`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: fixtures.user.sessionCookie,
    },
    body: JSON.stringify({}), // No actorId - should be derived from session
  });

  const body = await res.text();

  // Accept 200/2xx (success), 400 (validation error like missing fields or gate blocks), but NOT 401/500
  if (res.status >= 200 && res.status < 300) {
    pass('Authenticated host can transition (200-299)');
  } else if (res.status === 400) {
    // 400 is acceptable if there are gate blocks or validation errors
    pass('Authenticated host gets validation error (400) - acceptable');
  } else if (res.status === 401 || res.status === 403) {
    fail(
      'Authenticated transition auth failure',
      `Valid auth but got ${res.status}. Body: ${body.substring(0, 200)}`
    );
  } else if (res.status === 500) {
    fail(
      'Authenticated transition returns 500',
      `Should not return 500 for authed request. Body: ${body.substring(0, 200)}`
    );
  } else {
    fail(
      'Authenticated transition unexpected status',
      `Got ${res.status}. Body: ${body.substring(0, 200)}`
    );
  }
}

/**
 * Test 4: No Prisma leak test - any 500 response must be sanitized
 */
async function testNoPrismaLeak() {
  log(`\n${BOLD}${YELLOW}Test 4: No Prisma Error Leaks${RESET}`);

  // Try to cause various errors and ensure they don't leak Prisma details
  const tests = [
    {
      name: 'Unauth with fake actorId',
      url: `${BASE_URL}/api/events/${fixtures.eventDraft.id}/transition`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: 'not-a-real-id', to: 'FROZEN' }),
      },
    },
    {
      name: 'Unauth with non-existent event',
      url: `${BASE_URL}/api/events/cm000000000000000000000000/transition`,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actorId: 'fake', to: 'FROZEN' }),
      },
    },
  ];

  let anyLeak = false;

  for (const test of tests) {
    const res = await fetch(test.url, test.options);
    const body = await res.text();

    // Check for common Prisma error patterns
    const leakPatterns = [
      'prisma',
      'foreign key constraint',
      'actorId_fkey',
      'AuditEntry_actorId_fkey',
      'prisma.event',
      'prisma.auditEntry',
      '.findUnique',
      '.create',
      '@prisma',
      'PrismaClientKnownRequestError',
    ];

    const foundLeaks = leakPatterns.filter((pattern) =>
      body.toLowerCase().includes(pattern.toLowerCase())
    );

    if (foundLeaks.length > 0) {
      anyLeak = true;
      fail(
        `Prisma leak in ${test.name}`,
        `Found internal details: ${foundLeaks.join(', ')}. Body: ${body.substring(0, 300)}`
      );
    }
  }

  if (!anyLeak) {
    pass('No Prisma error details leaked in any response');
  }
}

async function main() {
  log(`${BOLD}${YELLOW}=== SECURITY REGRESSION TEST: Transition Auth ===${RESET}\n`);

  try {
    // Generate test fixtures
    log('Setting up test fixtures...');
    await cleanup();
    fixtures = await generateFixtures();
    log(`${GREEN}✓${RESET} Fixtures created`);

    // Run test suites
    await testUnauthTransitionFailClosed();
    await testInvalidSessionTransition();
    await testAuthenticatedTransition();
    await testNoPrismaLeak();

    // Summary
    log(`\n${BOLD}${YELLOW}=== SUMMARY ===${RESET}`);
    log(`Total tests: ${total}`);
    log(`${GREEN}Passed: ${passed}${RESET}`);
    log(`${RED}Failed: ${failed}${RESET}`);

    if (failed > 0) {
      log(`\n${BOLD}${RED}Failures:${RESET}`);
      failures.forEach((f) => log(`  - ${f}`));
      log(`\n${RED}${BOLD}✗ SECURITY TEST FAILED${RESET}`);
      process.exitCode = 1;
      return;
    } else {
      log(`\n${GREEN}${BOLD}✓ ALL SECURITY TESTS PASSED${RESET}`);
    }
  } catch (error) {
    console.error(`${RED}${BOLD}Test setup/execution error:${RESET}`, error);
    process.exitCode = 1;
    return;
  } finally {
    // Cleanup
    log('\nCleaning up test fixtures...');
    await cleanup();
    log(`${GREEN}✓${RESET} Cleanup complete`);
  }
}

main();
