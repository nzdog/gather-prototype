/**
 * Batch Import Auth Test — GTC-027, INVERTED BY GTC-267
 *
 * ⚠ THIS FILE ASSERTED THE OPPOSITE UNTIL 2026-09-11, AND THE INVERSION IS THE POINT.
 *
 * GTC-027 made this file assert that `POST /api/events/[id]/people/batch-import`
 * ACCEPTS `?hostId=` as a credential, copying what GTC-026 had done to
 * `/invite-status`. Its root cause is recorded here so the reversal reads as a
 * decision and not a regression: "POST .../batch-import used session-only auth via
 * requireEventRole. Hosts visiting via token link have no session → requireEventRole
 * returns 401 → browser shows 'Forbidden'."
 *
 * GTC-267 removed the parameter. `GET /api/events/[id]` served that same `hostId` to
 * anonymous callers, which made this route — the only WRITE that accepted it — an
 * unauthenticated import of arbitrary people into someone else's event, reachable
 * from an event id alone. The GTC-027 justification does not survive that fix: the
 * only route that reveals a hostId now requires a session itself.
 *
 * Suite 2 (the DRAFT-only guard) is untouched and still asserts what it always did.
 *
 * ⚠ EVERY CHECK READS CODE, NOT PROSE — see `readCode` below and the same note in
 * `tests/invite-status-auth-test.ts`. The behavioural half, that an unauthenticated
 * `?hostId=` POST is actually refused over HTTP, is in `tests/security-validation.ts`
 * suite 10.
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

/**
 * Source with comments removed — GTC-267's fix explains the removed `?hostId=` branch
 * in prose, and a raw substring match reads that explanation as the branch itself.
 * Same guard as `readCode` in `tests/security-validation.ts`.
 */
function readCode(file: string): string {
  return fs
    .readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function testSuite1_BatchImportRouteRefusesHostId() {
  logSection('Test Suite 1: /people/batch-import Route — ?hostId= is NOT a credential');

  const content = readCode(BATCH_IMPORT_ROUTE);

  // Test 1.1: the query param is not read at all.
  const readsHostId =
    content.includes('hostIdParam') || content.includes("searchParams.get('hostId')");
  logTest(
    '/people/batch-import no longer reads hostId from query params (GTC-267)',
    !readsHostId,
    readsHostId
      ? 'The ?hostId= auth path is back — on a WRITE route, reachable from an event id'
      : undefined
  );

  // Test 1.2: nothing compares a caller-supplied id to the event record.
  const comparesHostId =
    content.includes('eventForAuth.hostId') ||
    content.includes('hostId !== hostIdParam') ||
    content.includes('coHostId');
  logTest(
    '/people/batch-import no longer compares a supplied id against the event record',
    !comparesHostId,
    comparesHostId ? 'A param-vs-record comparison is back in the auth path' : undefined
  );

  // Test 1.3: the session guard is the only path.
  const hasSessionAuth = content.includes('requireEventRole');
  logTest(
    '/people/batch-import authenticates via requireEventRole and nothing else',
    hasSessionAuth,
    hasSessionAuth ? undefined : 'requireEventRole removed — session auth broken'
  );

  // Test 1.4: co-hosts keep the access the removed branch gave them.
  const allowsCoHost = /requireEventRole\([^)]*COHOST/s.test(content);
  logTest(
    '/people/batch-import still admits the co-host, through the guard role list',
    allowsCoHost,
    allowsCoHost ? undefined : 'COHOST dropped from the role list — co-hosts locked out'
  );

  // Test 1.5: unchanged in intent from GTC-027 — the auth check must still sit outside
  // the main try/catch, so an auth failure answers 401/403 and never a swallowed 500.
  // Re-anchored onto the guard call, since the param it used to look for is gone.
  const authBeforeTry = content.indexOf('requireEventRole') < content.indexOf('const body');
  logTest(
    'Auth check is outside the main try/catch (auth failures return a status, not 500)',
    authBeforeTry && content.indexOf('requireEventRole') > -1,
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

function testSuite3_PeopleSectionSendsNoHostId() {
  logSection('Test Suite 3: PeopleSection — the batch-import fetch sends no ?hostId=');

  const sectionContent = readCode(PEOPLE_SECTION);

  // Test 3.1: the prop survives — it is still read to mark who the host is in the
  // people list. What changed is that it is no longer sent as a credential.
  const acceptsHostIdProp =
    sectionContent.includes('hostId?:') || sectionContent.includes('hostId:');
  logTest(
    'PeopleSection still takes a hostId prop (it marks the host in the list)',
    acceptsHostIdProp,
    acceptsHostIdProp ? undefined : 'hostId dropped from PeopleSectionProps'
  );

  // Test 3.2: but the fetch no longer carries it.
  const hasHostIdInFetch = /batch-import\?hostId/.test(sectionContent);
  logTest(
    'PeopleSection batch-import fetch no longer sends ?hostId= (GTC-267)',
    !hasHostIdInFetch,
    hasHostIdInFetch ? 'The param is back on the write path' : undefined
  );

  // Test 3.3: the positive half — the bare call is present, so "no ?hostId=" cannot
  // be satisfied by the fetch having been deleted.
  const bareFetch = /batch-import`/.test(sectionContent);
  logTest(
    'PeopleSection posts to batch-import on the session alone',
    bareFetch,
    bareFetch ? undefined : 'The batch-import fetch is missing entirely'
  );
}

function testSuite4_InviteStatusMatches() {
  logSection('Test Suite 4: /invite-status — the same removal (parity guard)');

  const content = readCode(INVITE_STATUS_ROUTE);

  // Test 4.1: the sibling this route copied its auth from lost the param too. The
  // parity guard is kept, with its sign flipped: the two must not drift apart.
  const acceptsHostId =
    content.includes("searchParams.get('hostId')") || content.includes('hostIdParam');
  logTest(
    '/invite-status route no longer accepts ?hostId= either (GTC-267 parity)',
    !acceptsHostId,
    acceptsHostId ? 'The two routes have drifted — /invite-status takes the param again' : undefined
  );

  // Test 4.2: and co-host access still exists on that sibling, via the guard.
  const allowsCoHost = /requireEventRole\([^)]*COHOST/s.test(content);
  logTest(
    '/invite-status still admits the co-host, through the guard role list',
    allowsCoHost,
    allowsCoHost ? undefined : 'COHOST dropped from the role list — co-hosts locked out'
  );
}

function main() {
  console.log(
    `${BOLD}${YELLOW}=== Batch Import Auth Test — GTC-027, inverted by GTC-267 ===${RESET}\n`
  );

  testSuite1_BatchImportRouteRefusesHostId();
  testSuite2_DraftOnlyGuardPreserved();
  testSuite3_PeopleSectionSendsNoHostId();
  testSuite4_InviteStatusMatches();

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
