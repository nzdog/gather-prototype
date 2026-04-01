/**
 * GTC-025 — Edit Item dialog must be blocked on FROZEN events.
 *
 * Tests the pure isEditItemBlocked function exported from EditItemModal.
 * Asserts that FROZEN events block the editable dialog, and that DRAFT /
 * CONFIRMING events allow it through normally.
 */

import { isEditItemBlocked } from '../src/components/plan/EditItemModal';

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

console.log('\x1b[33m=== GTC-025: Edit Item Frozen Block Tests ===\x1b[0m\n');

// ── Core invariant: FROZEN must be blocked ────────────────────────────────────
console.log('\x1b[33mTest Suite 1: FROZEN event blocks edit\x1b[0m');
assert('isEditItemBlocked returns true for FROZEN', isEditItemBlocked('FROZEN') === true);

// ── Non-frozen statuses must NOT be blocked ───────────────────────────────────
console.log('\n\x1b[33mTest Suite 2: Non-frozen statuses allow edit\x1b[0m');
assert('isEditItemBlocked returns false for DRAFT', isEditItemBlocked('DRAFT') === false);
assert('isEditItemBlocked returns false for CONFIRMING', isEditItemBlocked('CONFIRMING') === false);
assert('isEditItemBlocked returns false for COMPLETE', isEditItemBlocked('COMPLETE') === false);
assert('isEditItemBlocked returns false for empty string', isEditItemBlocked('') === false);

// ── Edge cases ────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mTest Suite 3: Edge cases\x1b[0m');
assert(
  'isEditItemBlocked is case-sensitive — lowercase "frozen" is not blocked',
  isEditItemBlocked('frozen') === false
);
assert(
  'isEditItemBlocked only blocks FROZEN, not other lock-like statuses',
  isEditItemBlocked('LOCKED') === false
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
