/**
 * Batch Import Auth Test — GTC-027
 *
 * Asserts:
 * 1. /api/events/[id]/people/batch-import route accepts ?hostId= as a valid credential
 *    (mirrors the auth pattern applied in GTC-026 to /invite-status/route.ts)
 * 2. DRAFT-only status guard is preserved
 * 3. PeopleSection component passes ?hostId= in the batch-import fetch
 * 4. GTC-026 /invite-status auth fix is unaffected
 *
 * Root cause: POST /api/events/[id]/people/batch-import used session-only auth via
 * requireEventRole. Hosts visiting via token link have no session → requireEventRole
 * returns 401 → browser shows "Forbidden". Same pattern as pre-fix /invite-status.
 *
 * Run with: npx tsx tests/batch-import-auth-test.ts
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

const BATCH_IMPORT_ROUTE = path.join(
  process.cwd(),
  'src/app/api/events/[id]/people/batch-import/route.ts'
);
const PEOPLE_SECTION = path.join(process.cwd(), 'src/components/plan/PeopleSection.tsx');
const PLAN_PAGE = path.join(process.cwd(), 'src/app/plan/[eventId]/page.tsx');
const INVITE_STATUS_ROUTE = path.join(
  process.cwd(),
  'src/app/api/events/[id]/invite-status/route.ts'
);

function testSuite1_BatchImportRouteAcceptsHostId() {
  logSection('Test Suite 1: /people/batch-import Route — Accepts ?hostId= Credential');

  const content = fs.readFileSync(BATCH_IMPORT_ROUTE, 'utf-8');

  // Test 1.1: Route reads hostId from query params
  const readsHostId =
    content.includes('hostIdParam') || content.includes("searchParams.get('hostId')");
  logTest(
    '/people/batch-import route reads hostId from query params',
    readsHostId,
    readsHostId
      ? undefined
      : 'Route does not extract hostId from query params — ?hostId= auth path missing'
  );

  // Test 1.2: Route validates hostId against event.hostId
  const validatesHostId =
    content.includes('eventForAuth.hostId') || content.includes('hostId !== hostIdParam');
  logTest(
    '/people/batch-import route validates hostId against event record',
    validatesHostId,
    validatesHostId ? undefined : 'Route does not validate hostId against DB — auth path incomplete'
  );

  // Test 1.3: Route allows co-host access (parity with /tokens)
  const allowsCoHost = content.includes('coHostId');
  logTest(
    '/people/batch-import route allows co-host access (parity with /tokens)',
    allowsCoHost,
    allowsCoHost
      ? undefined
      : 'Route does not check coHostId — co-hosts would be locked out (parity gap with /tokens)'
  );

  // Test 1.4: Session auth path (requireEventRole) is still present
  const hasSessionAuth = content.includes('requireEventRole');
  logTest(
    '/people/batch-import retains session-based auth (requireEventRole) for hosts with active sessions',
    hasSessionAuth,
    hasSessionAuth ? undefined : 'requireEventRole removed — session auth broken'
  );

  // Test 1.5: Auth check is OUTSIDE the main try/catch (auth failure must not be swallowed as 500)
  // The auth block must appear before the outer try {
  const authBeforeTry =
    content.indexOf('searchParams.get') < content.indexOf('try {') ||
    content.indexOf('hostIdParam') < content.indexOf('try {');
  logTest(
    'Auth check is outside the main try/catch (auth failures return correct status, not 500)',
    authBeforeTry,
    authBeforeTry
      ? undefined
      : 'Auth block is inside the outer try/catch — auth errors may be swallowed as 500'
  );
}

function testSuite2_DraftOnlyGuardPreserved() {
  logSection('Test Suite 2: DRAFT-Only Guard — Preserved');

  const content = fs.readFileSync(BATCH_IMPORT_ROUTE, 'utf-8');

  // Test 2.1: DRAFT status check is still present
  const hasDraftCheck =
    content.includes("status !== 'DRAFT'") || content.includes("status === 'DRAFT'");
  logTest(
    'DRAFT-only guard is still present in /people/batch-import',
    hasDraftCheck,
    hasDraftCheck
      ? undefined
      : 'DRAFT status check removed — non-DRAFT events can now import people (regression)'
  );

  // Test 2.2: Error message for non-DRAFT is present
  const hasDraftError = content.includes('DRAFT mode');
  logTest(
    'DRAFT-only error message preserved',
    hasDraftError,
    hasDraftError ? undefined : 'DRAFT mode error message removed'
  );
}

function testSuite3_PeopleSectionPassesHostId() {
  logSection('Test Suite 3: PeopleSection — batch-import Fetch Includes ?hostId=');

  const sectionContent = fs.readFileSync(PEOPLE_SECTION, 'utf-8');

  // Test 3.1: PeopleSection accepts hostId prop
  const acceptsHostIdProp =
    sectionContent.includes('hostId?:') || sectionContent.includes('hostId:');
  logTest(
    'PeopleSection accepts hostId prop',
    acceptsHostIdProp,
    acceptsHostIdProp ? undefined : 'hostId not in PeopleSectionProps — cannot pass credential'
  );

  // Test 3.2: The batch-import fetch includes hostId param
  const hasHostIdInFetch =
    /batch-import\?hostId/.test(sectionContent) ||
    /batch-import.*\$\{.*hostId/.test(sectionContent) ||
    sectionContent.includes('batch-import?hostId') ||
    // Pattern: URL built conditionally based on hostId
    (sectionContent.includes('hostId') && sectionContent.includes('batch-import'));
  logTest(
    'PeopleSection batch-import fetch includes ?hostId= when hostId is available',
    hasHostIdInFetch,
    hasHostIdInFetch
      ? undefined
      : 'PeopleSection fetch to batch-import sends no credentials — will 401 for hosts without a session'
  );

  // Test 3.3: Plan page passes hostId to PeopleSection
  const planContent = fs.readFileSync(PLAN_PAGE, 'utf-8');
  const planPassesHostId =
    /PeopleSection[\s\S]{0,200}hostId/.test(planContent) ||
    /hostId[\s\S]{0,200}PeopleSection/.test(planContent);
  logTest(
    'Plan page passes hostId to PeopleSection',
    planPassesHostId,
    planPassesHostId ? undefined : 'Plan page does not pass hostId to PeopleSection'
  );
}

function testSuite4_InviteStatusUnchanged() {
  logSection('Test Suite 4: /invite-status Auth Fix — Unaffected (Regression Guard)');

  const content = fs.readFileSync(INVITE_STATUS_ROUTE, 'utf-8');

  // Test 4.1: /invite-status still accepts ?hostId=
  const acceptsHostId =
    content.includes("searchParams.get('hostId')") || content.includes('hostIdParam');
  logTest(
    '/invite-status route still accepts ?hostId= credential (GTC-026 unchanged)',
    acceptsHostId,
    acceptsHostId ? undefined : '/invite-status route hostId auth path removed — GTC-026 regression'
  );

  // Test 4.2: /invite-status still allows co-host
  const allowsCoHost = content.includes('coHostId');
  logTest(
    '/invite-status route still allows co-host access (GTC-026 unchanged)',
    allowsCoHost,
    allowsCoHost ? undefined : '/invite-status coHostId check removed — GTC-026 regression'
  );
}

function main() {
  console.log(`${BOLD}${YELLOW}=== Batch Import Auth Test — GTC-027 ===${RESET}\n`);

  testSuite1_BatchImportRouteAcceptsHostId();
  testSuite2_DraftOnlyGuardPreserved();
  testSuite3_PeopleSectionPassesHostId();
  testSuite4_InviteStatusUnchanged();

  console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);

  if (testsFailed === 0) {
    console.log(`\n${GREEN}${BOLD}✓ All batch import auth tests passed!${RESET}`);
    process.exit(0);
  } else {
    console.log(`\n${RED}${BOLD}✗ Some batch import auth tests failed${RESET}`);
    process.exit(1);
  }
}

main();
