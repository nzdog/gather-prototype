/**
 * Unit test: coordinator assignment for AI-generated teams (GTC-004)
 *
 * Regression test asserting that AI-generated teams are created with
 * coordinatorId = null (unassigned), never with the host's Person ID.
 *
 * Run with: npx tsx tests/coordinator-assignment.ts
 */

import { resolveGeneratedTeamCoordinatorId } from '../src/lib/ai/coordinator-assignment';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

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

console.log(`\n${BOLD}${YELLOW}=== GTC-004 Coordinator Assignment Test ===${RESET}`);
console.log('Invariant: generated team coordinatorId must never be the host Person ID\n');

// Simulate the host Person ID that would come from event.hostId
const MOCK_HOST_PERSON_ID = 'cmjwbjrpw0000n99xs11r44qh';
const ANOTHER_HOST_PERSON_ID = 'cma1b2c3d4000xyz00000000a';

// Test 1: coordinatorId must be null, not a host Person ID
const result1 = resolveGeneratedTeamCoordinatorId();
logTest(
  'generated team coordinator is null (not host Person ID)',
  result1 === null,
  `Expected null but got: ${JSON.stringify(result1)}`
);

// Test 2: must return null (called a second time — no state)
const result2 = resolveGeneratedTeamCoordinatorId();
logTest(
  'generated team coordinator is consistently null',
  result2 === null,
  `Expected null but got: ${JSON.stringify(result2)}`
);

// Test 3: invariant — result must never equal a host Person ID
const result3 = resolveGeneratedTeamCoordinatorId();
logTest(
  'coordinator does not reference host identity',
  result3 !== MOCK_HOST_PERSON_ID && result3 !== ANOTHER_HOST_PERSON_ID,
  `Coordinator was set to a host Person ID: ${result3}`
);

// Summary
console.log(`\n${BOLD}=== Test Summary ===${RESET}`);
console.log(`Total tests: ${testsRun}`);
console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
console.log(`${RED}Failed: ${testsFailed}${RESET}`);

if (testsFailed > 0) {
  console.log(`\n${RED}${BOLD}✗ Tests failed (RED phase confirmed)${RESET}`);
  process.exit(1);
} else {
  console.log(`\n${GREEN}${BOLD}✓ All tests passed${RESET}`);
  process.exit(0);
}
