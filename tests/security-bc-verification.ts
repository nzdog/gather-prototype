/**
 * Security Verification: Conditions B & C
 *
 * B: Route protection consistency (401/403)
 * C: Authorization correctness (scope/team/frozen)
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

// Critical mutation routes to test
const MUTATION_ROUTES = [
  // Session-based (host/plan editor)
  {
    path: '/api/events',
    method: 'POST',
    auth: 'SESSION',
    body: { name: 'T', startDate: '2026-01-01', endDate: '2026-01-02' },
  },
  {
    path: (id: string) => `/api/events/${id}/teams`,
    method: 'POST',
    auth: 'SESSION',
    body: { name: 'T' },
  },
  {
    path: (id: string) => `/api/events/${id}/people`,
    method: 'POST',
    auth: 'SESSION',
    body: { name: 'T' },
  },

  // Coordinator token-based
  {
    path: '/api/c/TOKEN/items',
    method: 'POST',
    auth: 'COORDINATOR',
    body: { name: 'T', teamId: 'TEAM' },
  },
];

async function testNoAuthFails() {
  log(`\n${BOLD}${YELLOW}Test Suite 1: No-Auth Fail-Closed (401)${RESET}`);

  const res1 = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', startDate: '2026-01-01', endDate: '2026-01-02' }),
  });

  if (res1.status === 401) pass('POST /api/events without auth returns 401');
  else fail('POST /api/events no-auth', `Expected 401, got ${res1.status}`);

  const res2 = await fetch(`${BASE_URL}/api/events/${fixtures.eventDraft.id}/teams`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test Team' }),
  });

  if (res2.status === 401) pass('POST /api/events/:id/teams without auth returns 401');
  else fail('POST /api/events/:id/teams no-auth', `Expected 401, got ${res2.status}`);

  const res3 = await fetch(`${BASE_URL}/api/c/${fixtures.teamA.coordinator.token}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', teamId: fixtures.teamA.id }),
  });

  // This should work - it HAS auth. Testing the right endpoint.
  // Let me test a coordinator endpoint WITHOUT token
  const res3_noauth = await fetch(`${BASE_URL}/api/c/INVALID_TOKEN/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', teamId: fixtures.teamA.id }),
  });

  if (res3_noauth.status === 401 || res3_noauth.status === 403) {
    pass('POST /api/c/:token/items with invalid token returns 401/403');
  } else {
    fail('POST /api/c/:token/items invalid token', `Expected 401/403, got ${res3_noauth.status}`);
  }
}

async function testInvalidAuthFails() {
  log(`\n${BOLD}${YELLOW}Test Suite 2: Invalid Auth Fail-Closed (401)${RESET}`);

  const res1 = await fetch(`${BASE_URL}/api/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: 'session=INVALID' },
    body: JSON.stringify({ name: 'Test', startDate: '2026-01-01', endDate: '2026-01-02' }),
  });

  if (res1.status === 401) pass('Invalid session cookie returns 401');
  else fail('Invalid session cookie', `Expected 401, got ${res1.status}`);

  const res2 = await fetch(`${BASE_URL}/api/c/INVALID_TOKEN_123/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', teamId: fixtures.teamA.id }),
  });

  if (res2.status === 401 || res2.status === 403) {
    pass('Invalid coordinator token returns 401/403');
  } else {
    fail('Invalid coordinator token', `Expected 401/403, got ${res2.status}`);
  }
}

async function testWrongScopeFails() {
  log(`\n${BOLD}${YELLOW}Test Suite 3: Wrong Scope Returns 403${RESET}`);

  // Participant trying to do coordinator action
  const res1 = await fetch(`${BASE_URL}/api/c/${fixtures.teamA.participant.token}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Test', teamId: fixtures.teamA.id }),
  });

  // Participant token won't work on coordinator endpoint
  if (res1.status === 401 || res1.status === 403) {
    pass('Participant token on coordinator endpoint returns 401/403');
  } else {
    fail('Participant as coordinator', `Expected 401/403, got ${res1.status}`);
  }
}

async function testWrongTeamFails() {
  log(`\n${BOLD}${YELLOW}Test Suite 4: Wrong Team Returns 403${RESET}`);

  // Team A coordinator trying to mutate Team B item
  const res = await fetch(
    `${BASE_URL}/api/c/${fixtures.teamA.coordinator.token}/items/${fixtures.teamB.items[0].id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacked' }),
    }
  );

  if (res.status === 403 || res.status === 404) {
    pass('Team A coordinator cannot mutate Team B item (403/404)');
  } else {
    fail('Cross-team mutation', `Expected 403/404, got ${res.status}`);
  }
}

async function testFrozenEnforcement() {
  log(`\n${BOLD}${YELLOW}Test Suite 5: Frozen Enforcement (403)${RESET}`);

  // Create coordinator token for frozen event
  const { prisma } = require('../src/lib/prisma');
  const { randomBytes } = require('crypto');

  // Create a team in frozen event
  const frozenTeam = await prisma.team.create({
    data: { name: 'Frozen Team', eventId: fixtures.eventFrozen.id },
  });

  // Create coordinator for frozen team
  const frozenCoord = await prisma.person.create({
    data: { name: 'Frozen Coord', email: 'frozen@test.local' },
  });

  await prisma.personEvent.create({
    data: {
      personId: frozenCoord.id,
      eventId: fixtures.eventFrozen.id,
      teamId: frozenTeam.id,
      role: 'COORDINATOR',
    },
  });

  const frozenToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: frozenToken,
      scope: 'COORDINATOR',
      personId: frozenCoord.id,
      eventId: fixtures.eventFrozen.id,
      teamId: frozenTeam.id,
      expiresAt: new Date('2026-12-31'),
    },
  });

  await prisma.$disconnect();

  // Try to create item in frozen event
  const res = await fetch(`${BASE_URL}/api/c/${frozenToken}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Should Fail', teamId: frozenTeam.id }),
  });

  if (res.status === 403) {
    pass('Coordinator cannot create items when event is FROZEN (403)');
  } else {
    fail('Frozen event mutation', `Expected 403, got ${res.status}`);
  }
}

async function main() {
  log(`${BOLD}${YELLOW}=== Security Verification: Conditions B & C ===${RESET}\n`);

  try {
    // Check server
    try {
      await fetch(BASE_URL);
    } catch {
      log(`${RED}Server not running at ${BASE_URL}${RESET}`);
      process.exit(1);
    }

    log('Generating test fixtures...');
    await cleanup();
    fixtures = await generateFixtures();
    log('${GREEN}✓ Fixtures ready${RESET}\n');

    await testNoAuthFails();
    await testInvalidAuthFails();
    await testWrongScopeFails();
    await testWrongTeamFails();
    await testFrozenEnforcement();

    log(`\n${BOLD}${YELLOW}=== Summary ===${RESET}`);
    log(`Total: ${total}`);
    log(`${GREEN}Passed: ${passed}${RESET}`);
    log(`${RED}Failed: ${failed}${RESET}`);

    if (failed > 0) {
      log(`\n${BOLD}${RED}FAILURES:${RESET}`);
      failures.forEach((f) => log(`  ${f}`));
      process.exit(1);
    } else {
      log(`\n${GREEN}${BOLD}✓ All tests passed!${RESET}`);
      process.exit(0);
    }
  } catch (err: any) {
    log(`\n${RED}Fatal error: ${err.message}${RESET}`);
    process.exit(1);
  }
}

main();
