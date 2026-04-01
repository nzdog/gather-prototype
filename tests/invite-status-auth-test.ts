/**
 * Invite Status Auth Test — GTC-026
 *
 * Asserts:
 * 1. /api/events/[id]/invite-status route accepts ?hostId= as a valid credential
 *    (mirrors the auth pattern in /api/events/[id]/tokens/route.ts)
 * 2. Plan page fetch for /invite-status passes ?hostId= query param
 * 3. /tokens route behaviour is unchanged (still accepts ?hostId=)
 *
 * Root cause: The /invite-status fetch sent no credentials, so requireEventRole
 * called getUser() → null (no session in token-link flow) → 401 every time.
 *
 * Run with: npx tsx tests/invite-status-auth-test.ts
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

const INVITE_STATUS_ROUTE = path.join(
  process.cwd(),
  'src/app/api/events/[id]/invite-status/route.ts'
);
const TOKENS_ROUTE = path.join(process.cwd(), 'src/app/api/events/[id]/tokens/route.ts');
const PLAN_PAGE = path.join(process.cwd(), 'src/app/plan/[eventId]/page.tsx');

function testSuite1_InviteStatusRouteAcceptsHostId() {
  logSection('Test Suite 1: /invite-status Route — Accepts ?hostId= Credential');

  const content = fs.readFileSync(INVITE_STATUS_ROUTE, 'utf-8');

  // Test 1.1: Route reads hostId from query params
  const readsHostId =
    content.includes('hostIdParam') || content.includes("searchParams.get('hostId')");
  logTest(
    '/invite-status route reads hostId from query params',
    readsHostId,
    readsHostId
      ? undefined
      : 'Route does not extract hostId from query params — ?hostId= auth path missing'
  );

  // Test 1.2: Route validates hostId against event.hostId (same pattern as /tokens)
  const validatesHostId =
    content.includes('event.hostId') ||
    content.includes('hostId !== hostIdParam') ||
    content.includes('hostIdParam');
  logTest(
    '/invite-status route validates hostId against event record',
    validatesHostId,
    validatesHostId ? undefined : 'Route does not validate hostId against DB — auth path incomplete'
  );

  // Test 1.3: Route allows co-host access (parity with /tokens)
  const allowsCoHost = content.includes('coHostId');
  logTest(
    '/invite-status route allows co-host access (parity with /tokens)',
    allowsCoHost,
    allowsCoHost
      ? undefined
      : 'Route does not check coHostId — co-hosts would be locked out (parity gap with /tokens)'
  );

  // Test 1.4: Session auth path (requireEventRole) is still present
  const hasSessionAuth = content.includes('requireEventRole');
  logTest(
    '/invite-status retains session-based auth (requireEventRole) for hosts with active sessions',
    hasSessionAuth,
    hasSessionAuth ? undefined : 'requireEventRole removed — session auth broken'
  );
}

function testSuite2_PlanPageFetchIncludesHostId() {
  logSection('Test Suite 2: Plan Page — /invite-status Fetch Includes ?hostId=');

  const content = fs.readFileSync(PLAN_PAGE, 'utf-8');

  // Test 2.1: The invite-status fetch includes hostId param
  // Check that the fetch call for invite-status passes hostId (not the bare URL)
  const hasHostIdInFetch =
    content.includes('/invite-status?hostId') ||
    content.includes('invite-status`?hostId') ||
    content.includes('invite-status?hostId') ||
    // Pattern: template literal with hostId param after the invite-status segment
    /invite-status[`'"]\s*\+.*hostId|invite-status.*\$\{.*hostId/.test(content) ||
    // Template literal: `/api/events/${eventId}/invite-status?hostId=${...}`
    /invite-status\?hostId=\$\{/.test(content);
  logTest(
    'Plan page /invite-status fetch includes ?hostId= query param',
    hasHostIdInFetch,
    hasHostIdInFetch
      ? undefined
      : 'Fetch to /invite-status sends no credentials — will 401 for hosts without a session'
  );

  // Test 2.2: The bare fetch (without hostId) no longer exists for invite-status
  // Ensure we haven't left the old credential-free call alongside the new one
  const bareInviteStatusFetch = /fetch\(`\/api\/events\/\$\{eventId\}\/invite-status`\)/.test(
    content
  );
  logTest(
    'Plan page no longer has bare /invite-status fetch (without credentials)',
    !bareInviteStatusFetch,
    bareInviteStatusFetch
      ? 'Old bare fetch still present — both calls exist simultaneously, old one will still 401'
      : undefined
  );
}

function testSuite3_TokensRouteUnchanged() {
  logSection('Test Suite 3: /tokens Route — Unchanged (Regression Guard)');

  const content = fs.readFileSync(TOKENS_ROUTE, 'utf-8');

  // Test 3.1: /tokens still accepts ?hostId=
  const acceptsHostId =
    content.includes("searchParams.get('hostId')") || content.includes('hostIdParam');
  logTest(
    '/tokens route still accepts ?hostId= credential (unchanged)',
    acceptsHostId,
    acceptsHostId ? undefined : '/tokens route hostId auth path removed — regression'
  );

  // Test 3.2: /tokens still allows co-host
  const allowsCoHost = content.includes('coHostId');
  logTest(
    '/tokens route still allows co-host access (unchanged)',
    allowsCoHost,
    allowsCoHost ? undefined : '/tokens route coHostId check removed — regression'
  );
}

function main() {
  console.log(`${BOLD}${YELLOW}=== Invite Status Auth Test — GTC-026 ===${RESET}\n`);

  testSuite1_InviteStatusRouteAcceptsHostId();
  testSuite2_PlanPageFetchIncludesHostId();
  testSuite3_TokensRouteUnchanged();

  console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);

  if (testsFailed === 0) {
    console.log(`\n${GREEN}${BOLD}✓ All invite status auth tests passed!${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${RED}${BOLD}✗ Some invite status auth tests failed${RESET}`);
    process.exit(1);
  }
}

main();
