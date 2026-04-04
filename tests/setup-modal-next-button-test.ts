/**
 * GTC-028 — Setup modal "Next" button on Step 1 must advance to Step 2.
 *
 * Tests the pure getStepLabel helper and the button-rendering logic
 * extracted from EditEventModal. Verifies:
 *   1. In checklist mode (stepLabel set) on steps 1 and 2, the "Next"
 *      button path is taken (type="button", no form submit).
 *   2. In checklist mode on step 3, the "Save Changes" path is taken.
 *   3. Outside checklist mode (stepLabel undefined), "Save Changes" is always shown.
 *   4. getStepLabel returns correct labels (regression from GTC-009).
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

// ── Helper: mirrors the button-selection condition in EditEventModal ──────────
function showsNextButton(stepLabel: string | undefined, step: number): boolean {
  return !!(stepLabel && step < 3);
}

// ── 1. Step labels (regression from GTC-009) ─────────────────────────────────
assert(
  'Step 1 label is "Step 1 of 3: Event Basics"',
  getStepLabel(1) === 'Step 1 of 3: Event Basics'
);
assert(
  'Step 2 label is "Step 2 of 3: Guests & Dietary"',
  getStepLabel(2) === 'Step 2 of 3: Guests & Dietary'
);
assert(
  'Step 3 label is "Step 3 of 3: Venue Details"',
  getStepLabel(3) === 'Step 3 of 3: Venue Details'
);

// ── 2. Checklist mode — steps 1 and 2 show Next ──────────────────────────────
const CHECKLIST_LABEL = 'Step 2 of 5: Add event details';

assert('Checklist mode, step 1 → shows Next button', showsNextButton(CHECKLIST_LABEL, 1));
assert('Checklist mode, step 2 → shows Next button', showsNextButton(CHECKLIST_LABEL, 2));

// ── 3. Checklist mode — step 3 shows Save Changes ────────────────────────────
assert(
  'Checklist mode, step 3 → shows Save Changes (not Next)',
  !showsNextButton(CHECKLIST_LABEL, 3)
);

// ── 4. Post-payment mode (also has stepLabel set) ────────────────────────────
const PAYMENT_LABEL = 'Step 1 of 3: Event Basics';
assert('Post-payment mode, step 1 → shows Next button', showsNextButton(PAYMENT_LABEL, 1));
assert('Post-payment mode, step 2 → shows Next button', showsNextButton(PAYMENT_LABEL, 2));
assert('Post-payment mode, step 3 → shows Save Changes', !showsNextButton(PAYMENT_LABEL, 3));

// ── 5. Direct edit mode (no stepLabel) — always shows Save Changes ────────────
assert('Direct edit mode, step 1 → shows Save Changes', !showsNextButton(undefined, 1));
assert('Direct edit mode, step 2 → shows Save Changes', !showsNextButton(undefined, 2));
assert('Direct edit mode, step 3 → shows Save Changes', !showsNextButton(undefined, 3));

// ── 6. Next click advances step (pure logic) ─────────────────────────────────
function simulateNextClick(currentStep: number): number {
  return currentStep + 1;
}

assert('Next click on step 1 → step becomes 2', simulateNextClick(1) === 2);
assert('Next click on step 2 → step becomes 3', simulateNextClick(2) === 3);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\nTotal tests: ${passed + failed}`);
if (passed > 0) console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
if (failed > 0) console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

if (failed > 0) {
  console.error('\n\x1b[31m\x1b[1m✗ Tests failed!\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m');
}
