/**
 * Demo UI Isolation Test — GTC-005
 *
 * Asserts that the "Back to Demo" link in the participant view is gated
 * by an isDemo flag and that the participant API returns that flag correctly.
 *
 * Run with: npx tsx tests/demo-ui-isolation.ts
 */

import * as fs from 'fs';
import * as path from 'path';

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
      console.log(`  ${RED}Reason: ${message}${RESET}`);
    }
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

function testSuite_DemoUiIsolation() {
  logSection('Test Suite: Demo UI Isolation (GTC-005)');

  const participantPageSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/p/[token]/page.tsx'),
    'utf-8'
  );
  const participantApiSrc = fs.readFileSync(
    path.join(process.cwd(), 'src/app/api/p/[token]/route.ts'),
    'utf-8'
  );

  // Test 1: ParticipantData interface declares isDemo
  logTest(
    'ParticipantData interface declares isDemo field',
    /isDemo\s*:\s*boolean/.test(participantPageSrc),
    'ParticipantData interface must include "isDemo: boolean"'
  );

  // Test 2: Participant API includes isDemo in JSON response
  logTest(
    'Participant API returns isDemo in JSON response',
    /isDemo\s*:/.test(participantApiSrc),
    'Route handler must include isDemo in the NextResponse.json() body'
  );

  // Test 3: isDemo is derived from the demo event name constant
  logTest(
    'Participant API identifies demo event by known event name',
    /Henderson Family Christmas 2025/.test(participantApiSrc),
    'API must compare event name to "Henderson Family Christmas 2025" to set isDemo'
  );

  // Test 4: "Back to Demo" link is inside an isDemo conditional
  // Find the "Back to Demo" text and inspect the ~300 chars before it for a guard
  const backToDemoIdx = participantPageSrc.indexOf('Back to Demo');
  if (backToDemoIdx === -1) {
    logTest(
      '"Back to Demo" link is guarded by isDemo conditional',
      false,
      '"Back to Demo" text not found in participant page source'
    );
  } else {
    const preceding = participantPageSrc.substring(Math.max(0, backToDemoIdx - 300), backToDemoIdx);
    const isGuarded = /data\.isDemo/.test(preceding) || /isDemo/.test(preceding);
    logTest(
      '"Back to Demo" link is guarded by isDemo conditional',
      isGuarded,
      '"Back to Demo" must be inside a block that checks data.isDemo or isDemo'
    );
  }
}

async function main() {
  console.log('Demo UI Isolation Test — GTC-005\n');

  testSuite_DemoUiIsolation();

  console.log(`\n${BOLD}=== Test Summary ===${RESET}`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(`${RED}Failed: ${testsFailed}${RESET}`);

  if (testsFailed > 0) {
    console.log(`\n${RED}${BOLD}✗ ${testsFailed} test(s) failed${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}✓ All demo UI isolation tests passed!${RESET}`);
  }
}

main().catch((err) => {
  console.error('Test suite error:', err);
  process.exit(1);
});
