/**
 * GTC-009 — Setup modal header must update with each step.
 *
 * Tests the pure getStepLabel function exported from EditEventModal.
 * Asserts the correct "Step X of 3: <title>" string for each step value.
 */

import { getStepLabel } from '../src/components/plan/EditEventModal';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}

// Step 1
assert(
  'Step 1 label is "Step 1 of 3: Event Basics"',
  getStepLabel(1) === 'Step 1 of 3: Event Basics'
);

// Step 2
assert(
  'Step 2 label is "Step 2 of 3: Guests & Dietary"',
  getStepLabel(2) === 'Step 2 of 3: Guests & Dietary'
);

// Step 3
assert(
  'Step 3 label is "Step 3 of 3: Venue Details"',
  getStepLabel(3) === 'Step 3 of 3: Venue Details'
);

console.log(`\nTotal tests: ${passed + failed}`);
if (passed > 0) console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
if (failed > 0) console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

if (failed > 0) {
  console.error('\n\x1b[31m\x1b[1m✗ Tests failed!\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m');
}
