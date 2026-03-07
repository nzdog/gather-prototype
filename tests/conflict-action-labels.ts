/**
 * Conflict Action Label Test
 *
 * Asserts that every known action type code produced by the conflict
 * detection engine (src/lib/ai/check.ts) maps to a human-readable
 * string — NOT the raw internal code.
 *
 * Run with: npx tsx tests/conflict-action-labels.ts
 */

import { ACTION_LABELS } from '../src/lib/conflicts/action-labels';

// ANSI helpers
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
    if (message) console.log(`  ${RED}Error: ${message}${RESET}`);
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

// All action codes produced by src/lib/ai/check.ts — enumerated during GTC-007
const KNOWN_ACTION_CODES = [
  'specify_quantities',
  'adjust_timing',
  'add_items',
  'add_teams',
  'assign_coordinator',
] as const;

function runTests() {
  logSection('Conflict Action Label Tests');

  // 1. Label map is exported and is an object
  logTest(
    'ACTION_LABELS is exported as an object',
    typeof ACTION_LABELS === 'object' && ACTION_LABELS !== null,
    'ACTION_LABELS must be a non-null object'
  );

  // 2. Every known code has a label
  for (const code of KNOWN_ACTION_CODES) {
    const label = ACTION_LABELS[code];
    logTest(
      `"${code}" maps to a human-readable label`,
      typeof label === 'string' && label.length > 0,
      `Expected a non-empty string label for "${code}", got: ${JSON.stringify(label)}`
    );
  }

  // 3. No label is equal to its own key (raw code would be a copy of the key)
  for (const code of KNOWN_ACTION_CODES) {
    const label = ACTION_LABELS[code];
    logTest(
      `"${code}" label is not the raw code string`,
      label !== code,
      `Label for "${code}" must not equal the raw code — that would render raw internal values`
    );
  }

  // Summary
  console.log(`\n${BOLD}=== Test Summary ===${RESET}`);
  console.log(`Total tests: ${testsRun}`);
  console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
  console.log(testsFailed > 0 ? `${RED}Failed: ${testsFailed}${RESET}` : `Failed: 0`);

  if (testsFailed > 0) {
    console.log(`\n${RED}${BOLD}✗ Some tests failed${RESET}`);
    process.exit(1);
  } else {
    console.log(`\n${GREEN}${BOLD}✓ All action label tests passed!${RESET}`);
    process.exit(0);
  }
}

runTests();
