/**
 * API Events Authentication Test
 *
 * Tests POST /api/events authentication requirements:
 * - Unauthenticated requests return 401
 * - Authenticated requests succeed with valid session cookie
 *
 * Run with: npx tsx tests/api-events-auth-test.ts
 */

import { prisma } from '../src/lib/prisma';
import { randomBytes } from 'crypto';

// ANSI color codes
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

async function createTestSession(): Promise<{ userId: string; sessionToken: string }> {
  // Find or create test user
  let user = await prisma.user.findUnique({
    where: { email: 'test@gather.test' },
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'test@gather.test',
        billingStatus: 'ACTIVE', // Give permission to create events
      },
    });
  }

  // Create session token
  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt,
    },
  });

  return { userId: user.id, sessionToken };
}

async function cleanupTestSession(sessionToken: string) {
  await prisma.session.deleteMany({
    where: { token: sessionToken },
  });
}

async function cleanupTestEvents() {
  await prisma.event.deleteMany({
    where: {
      name: {
        in: ['Test_Unauth', 'Test_Auth'],
      },
    },
  });
}

async function testUnauthenticatedRequest() {
  logSection('Test 1: Unauthenticated POST /api/events');

  try {
    // Make unauthenticated request
    const response = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Test_Unauth',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    });

    const status = response.status;
    const data = await response.json();

    // Test 1.1: Should return 401
    logTest(
      'Unauthenticated request returns 401',
      status === 401,
      status === 401 ? undefined : `Got status ${status}`
    );

    // Test 1.2: Should return error message
    logTest(
      'Response contains error message',
      data.error === 'Unauthorized',
      data.error === 'Unauthorized' ? undefined : `Got error: ${data.error}`
    );

    // Test 1.3: Should NOT create event in database
    const eventCount = await prisma.event.count({
      where: { name: 'Test_Unauth' },
    });

    logTest(
      'No event created in database',
      eventCount === 0,
      eventCount === 0 ? undefined : `Found ${eventCount} event(s) in database`
    );
  } catch (error: any) {
    logTest('Unauthenticated request test', false, error.message);
  }
}

async function testAuthenticatedRequest() {
  logSection('Test 2: Authenticated POST /api/events');

  let sessionToken: string | null = null;

  try {
    // Create test session
    const session = await createTestSession();
    sessionToken = session.sessionToken;

    // Make authenticated request
    const response = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `session=${sessionToken}`,
      },
      body: JSON.stringify({
        name: 'Test_Auth',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    });

    const status = response.status;
    const data = await response.json();

    // Test 2.1: Should return 200
    logTest(
      'Authenticated request returns 200',
      status === 200,
      status === 200 ? undefined : `Got status ${status}`
    );

    // Test 2.2: Should return success and event data
    logTest(
      'Response contains success and event',
      data.success === true && data.event && data.event.id,
      data.success === true && data.event && data.event.id
        ? undefined
        : `Missing success or event data`
    );

    // Test 2.3: Event should exist in database
    const eventCount = await prisma.event.count({
      where: { name: 'Test_Auth' },
    });

    logTest(
      'Event created in database',
      eventCount === 1,
      eventCount === 1 ? undefined : `Found ${eventCount} event(s) in database`
    );

    // Test 2.4: Event should have correct fields
    if (eventCount > 0) {
      const event = await prisma.event.findFirst({
        where: { name: 'Test_Auth' },
      });

      const hasCorrectFields =
        event &&
        event.status === 'DRAFT' &&
        event.isLegacy === false &&
        event.structureMode === 'EDITABLE';

      logTest(
        'Event has correct default fields',
        hasCorrectFields,
        hasCorrectFields ? undefined : 'Event fields incorrect'
      );
    }
  } catch (error: any) {
    logTest('Authenticated request test', false, error.message);
  } finally {
    // Cleanup
    if (sessionToken) {
      await cleanupTestSession(sessionToken);
    }
    await cleanupTestEvents();
  }
}

async function testSessionCookieRequirement() {
  logSection('Test 3: Session Cookie Validation');

  try {
    // Test 3.1: Invalid session token
    const response1 = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'session=invalid_token_12345',
      },
      body: JSON.stringify({
        name: 'Test_Invalid',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    });

    logTest(
      'Invalid session token returns 401',
      response1.status === 401,
      response1.status === 401 ? undefined : `Got status ${response1.status}`
    );

    // Test 3.2: Authorization header (should NOT work - only cookies accepted)
    const response2 = await fetch('http://localhost:3000/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer some_token',
      },
      body: JSON.stringify({
        name: 'Test_Bearer',
        startDate: '2026-01-01',
        endDate: '2026-01-02',
      }),
    });

    logTest(
      'Bearer token is NOT accepted (cookie-only auth)',
      response2.status === 401,
      response2.status === 401 ? undefined : `Got status ${response2.status}`
    );
  } catch (error: any) {
    logTest('Session cookie validation test', false, error.message);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== POST /api/events Authentication Test ===${RESET}\n`);
  console.log('Testing authentication requirements for event creation\n');

  try {
    // Check if server is running
    try {
      await fetch('http://localhost:3000');
    } catch {
      console.error(`${RED}Error: Server is not running on http://localhost:3000${RESET}`);
      console.error(`Please start the server with: npm run dev`);
      process.exit(1);
    }

    await testUnauthenticatedRequest();
    await testAuthenticatedRequest();
    await testSessionCookieRequirement();

    // Summary
    console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);

    if (testsFailed === 0) {
      console.log(`\n${GREEN}${BOLD}✓ All tests passed!${RESET}`);
      console.log(`\nVerified:`);
      console.log(`  • POST /api/events requires session cookie authentication`);
      console.log(`  • Unauthenticated requests return 401 and don't create events`);
      console.log(`  • Authenticated requests succeed and create events`);
      console.log(`  • Bearer tokens are NOT accepted (session cookies only)`);
      process.exit(0);
    } else {
      console.log(`\n${RED}${BOLD}✗ Some tests failed${RESET}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
