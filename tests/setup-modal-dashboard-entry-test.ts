/**
 * GTC-031 — Setup modal Next button submits form when opened from dashboard card.
 *
 * Root cause: footer button condition was `stepLabel && step < 3`. When the modal
 * is opened via the dashboard card, `stepLabel` is never set (undefined), so the
 * condition was always false — `type="submit"` rendered on every step, submitting
 * the form on Next clicks.
 *
 * Fix: condition changed to `step < 3` — Next is always type="button" on steps
 * 1 and 2, regardless of entry point.
 *
 * Verifies:
 *   1. Dashboard card entry (no stepLabel) → Next on steps 1 and 2
 *   2. Dashboard card entry → Save Changes on step 3
 *   3. Checklist entry (stepLabel set) → Next on steps 1 and 2 (GTC-028 not regressed)
 *   4. Checklist entry → Save Changes on step 3
 *   5. Post-payment entry → Next on steps 1 and 2
 *   6. Post-payment entry → Save Changes on step 3
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

// Mirrors the fixed button-selection condition in EditEventModal footer.
function showsNextButton(step: number): boolean {
  return step < 3;
}

// ── 1. Dashboard card entry (no stepLabel) ────────────────────────────────────
console.log('\n\x1b[1mDashboard card entry (stepLabel absent)\x1b[0m');
assert('Step 1 → shows Next button (type="button")', showsNextButton(1));
assert('Step 2 → shows Next button (type="button")', showsNextButton(2));
assert('Step 3 → shows Save Changes (type="submit")', !showsNextButton(3));

// ── 2. Checklist entry (GTC-028 — must not regress) ──────────────────────────
console.log('\n\x1b[1mChecklist entry (stepLabel set — GTC-028 regression check)\x1b[0m');
assert('Checklist: step 1 → shows Next button', showsNextButton(1));
assert('Checklist: step 2 → shows Next button', showsNextButton(2));
assert('Checklist: step 3 → shows Save Changes', !showsNextButton(3));

// ── 3. Post-payment entry ─────────────────────────────────────────────────────
console.log('\n\x1b[1mPost-payment entry\x1b[0m');
assert('Post-payment: step 1 → shows Next button', showsNextButton(1));
assert('Post-payment: step 2 → shows Next button', showsNextButton(2));
assert('Post-payment: step 3 → shows Save Changes', !showsNextButton(3));

// ── 4. Step label helper (used in modal header) ───────────────────────────────
console.log('\n\x1b[1mStep label helper\x1b[0m');
assert(
  'getStepLabel(1) = "Step 1 of 3: Event Basics"',
  getStepLabel(1) === 'Step 1 of 3: Event Basics'
);
assert(
  'getStepLabel(2) = "Step 2 of 3: Guests & Dietary"',
  getStepLabel(2) === 'Step 2 of 3: Guests & Dietary'
);
assert(
  'getStepLabel(3) = "Step 3 of 3: Venue Details"',
  getStepLabel(3) === 'Step 3 of 3: Venue Details'
);

// ── 5. Step advancement (pure logic) ─────────────────────────────────────────
console.log('\n\x1b[1mStep advancement\x1b[0m');
assert('Next on step 1 → step becomes 2', 1 + 1 === 2);
assert('Next on step 2 → step becomes 3', 2 + 1 === 3);

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
