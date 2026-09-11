/**
 * Invite Status Auth Test — GTC-026, INVERTED BY GTC-267
 *
 * ⚠ THIS FILE ASSERTED THE OPPOSITE UNTIL 2026-09-11, AND THE INVERSION IS THE POINT.
 *
 * GTC-026 made this file assert that `/api/events/[id]/invite-status` ACCEPTS
 * `?hostId=` as a credential, mirroring `/api/events/[id]/tokens`. Its root cause was
 * real and is recorded here so the reversal reads as a decision rather than a
 * regression: "The /invite-status fetch sent no credentials, so requireEventRole
 * called getUser() → null (no session in token-link flow) → 401 every time."
 *
 * GTC-267 removed that parameter from both routes, because it was never a credential.
 * `GET /api/events/[id]` published the same `hostId` to anonymous callers, so the
 * chain ran: event id → hostId → every access token on the event, the HOST one
 * included. The GTC-026 justification does not survive that fix — the only route that
 * reveals a hostId now requires a session itself, so any caller still able to supply
 * the parameter is one for which `requireEventRole` would already have succeeded.
 *
 * So the three suites below now assert the negative of what they used to, and the
 * file is kept rather than deleted precisely so this history is not lost.
 *
 * ⚠ EVERY CHECK READS CODE, NOT PROSE. These are substring assertions over route
 * source, and the first run after GTC-267 had two of them passing on the explanatory
 * COMMENTS the fix had just added — the word `hostId` appears there several times.
 * `readCode` strips comments before matching, the same guard
 * `tests/security-validation.ts` uses for its residue gate.
 *
 * The behavioural half of this contract — that an unauthenticated `?hostId=` is
 * actually refused over HTTP — lives in `tests/security-validation.ts`, suite 10.
 * This file only holds the shape of the source.
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

/**
 * Source with comments removed.
 *
 * Every assertion below is a substring match over route source, and GTC-267's fix
 * carries comments that explain the removed `?hostId=` branch at length. Matching raw
 * text would read that explanation as the branch itself — two of these checks passed
 * that way on the first run after the fix. Same guard, same reason, as `readCode` in
 * `tests/security-validation.ts`.
 */
function readCode(file: string): string {
  return fs
    .readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function testSuite1_InviteStatusRouteRefusesHostId() {
  logSection('Test Suite 1: /invite-status Route — ?hostId= is NOT a credential');

  const content = readCode(INVITE_STATUS_ROUTE);

  // Test 1.1: the query param is not read at all.
  const readsHostId =
    content.includes('hostIdParam') || content.includes("searchParams.get('hostId')");
  logTest(
    '/invite-status route no longer reads hostId from query params (GTC-267)',
    !readsHostId,
    readsHostId ? 'The ?hostId= auth path is back — it is not a credential' : undefined
  );

  // Test 1.2: nothing compares a caller-supplied id to the event's own host.
  const comparesHostId = content.includes('hostId !== hostIdParam') || content.includes('coHostId');
  logTest(
    '/invite-status route no longer compares a supplied id against the event record',
    !comparesHostId,
    comparesHostId ? 'A param-vs-record comparison is back in the auth path' : undefined
  );

  // Test 1.3: the session guard is the only path, and co-hosts keep their access
  // through its role list rather than through a coHostId comparison.
  const hasSessionAuth = content.includes('requireEventRole');
  logTest(
    '/invite-status authenticates via requireEventRole and nothing else',
    hasSessionAuth,
    hasSessionAuth ? undefined : 'requireEventRole removed — session auth broken'
  );

  const allowsCoHost = /requireEventRole\([^)]*COHOST/s.test(content);
  logTest(
    '/invite-status still admits the co-host, now through the guard role list',
    allowsCoHost,
    allowsCoHost ? undefined : 'COHOST dropped from the role list — co-hosts locked out'
  );
}

function testSuite2_PlanPageSendsNoHostId() {
  logSection('Test Suite 2: Plan Page — the fetch sends no ?hostId=');

  const content = readCode(PLAN_PAGE);

  // Test 2.1: the credential-bearing form is gone.
  const hasHostIdInFetch = /invite-status\?hostId=\$\{/.test(content);
  logTest(
    'Plan page /invite-status fetch no longer sends ?hostId= (GTC-267)',
    !hasHostIdInFetch,
    hasHostIdInFetch ? 'The param is back on the fetch' : undefined
  );

  // Test 2.2: and the bare call — which is now the correct one — is present. This is
  // the positive half: "no ?hostId=" would also be true of a deleted fetch.
  const bareInviteStatusFetch = /fetch\(`\/api\/events\/\$\{eventId\}\/invite-status`\)/.test(
    content
  );
  logTest(
    'Plan page fetches /invite-status on the session alone',
    bareInviteStatusFetch,
    bareInviteStatusFetch ? undefined : 'The invite-status fetch is missing entirely'
  );
}

function testSuite3_TokensRouteAlsoRefusesHostId() {
  logSection('Test Suite 3: /tokens Route — the same removal');

  const content = readCode(TOKENS_ROUTE);

  // Test 3.1: /tokens was the original of the pattern, and loses it too.
  const acceptsHostId =
    content.includes("searchParams.get('hostId')") || content.includes('hostIdParam');
  logTest(
    '/tokens route no longer accepts ?hostId= (GTC-267 — the takeover step)',
    !acceptsHostId,
    acceptsHostId ? '/tokens accepts the param again — the chain is reopened' : undefined
  );

  // Test 3.2: co-host access survives, via the guard.
  const allowsCoHost = /requireEventRole\([^)]*COHOST/s.test(content);
  logTest(
    '/tokens still admits the co-host, now through the guard role list',
    allowsCoHost,
    allowsCoHost ? undefined : 'COHOST dropped from the role list — co-hosts locked out'
  );

  // Test 3.3: the bearer-token path is untouched. Zone 3 is not this ticket's.
  const keepsBearer = content.includes('authorization') && content.includes('accessToken');
  logTest(
    '/tokens retains the HOST-scoped bearer path untouched (Zone 3)',
    keepsBearer,
    keepsBearer ? undefined : 'The bearer token path was removed — out of scope for GTC-267'
  );
}

function main() {
  console.log(
    `${BOLD}${YELLOW}=== Invite Status Auth Test — GTC-026, inverted by GTC-267 ===${RESET}\n`
  );

  testSuite1_InviteStatusRouteRefusesHostId();
  testSuite2_PlanPageSendsNoHostId();
  testSuite3_TokensRouteAlsoRefusesHostId();

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
