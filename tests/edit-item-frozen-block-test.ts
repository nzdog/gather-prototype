/**
 * GTC-025 → REPLACED BY GTC-197 (A3c).
 *
 * The original contract: "Edit Item dialog must be blocked on FROZEN events."
 * The send-lock model supersedes it — post-send edits are ALLOWED and RECORDED, not
 * refused (Moment 4 §7, "the fact is welcome; the challenge is forbidden").
 *
 * The assertions are REPLACED, not deleted, and at equal strength: this file now
 * proves the opposite property in every direction the original covered, so a
 * reintroduced lifecycle block fails here rather than passing silently.
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

console.log('\x1b[33m=== GTC-197: Edit Item is never lifecycle-blocked ===\x1b[0m\n');

// ── Core invariant, INVERTED: FROZEN must NOT block ───────────────────────────
console.log('\x1b[33mTest Suite 1: a legacy FROZEN event no longer blocks edit\x1b[0m');
assert('isEditItemBlocked returns FALSE for FROZEN', isEditItemBlocked('FROZEN') === false);

// ── No status blocks ──────────────────────────────────────────────────────────
console.log('\n\x1b[33mTest Suite 2: no status blocks edit\x1b[0m');
assert('isEditItemBlocked returns false for DRAFT', isEditItemBlocked('DRAFT') === false);
assert('isEditItemBlocked returns false for CONFIRMING', isEditItemBlocked('CONFIRMING') === false);
assert(
  "isEditItemBlocked returns false for COMPLETE — §8.8 resolves the day's corrections later",
  isEditItemBlocked('COMPLETE') === false
);
assert('isEditItemBlocked returns false for empty string', isEditItemBlocked('') === false);

// ── Edge cases ────────────────────────────────────────────────────────────────
console.log('\n\x1b[33mTest Suite 3: nothing blocks, whatever it is called\x1b[0m');
assert('lowercase "frozen" is not blocked', isEditItemBlocked('frozen') === false);
assert('no lock-like status blocks', isEditItemBlocked('LOCKED') === false);
assert('SENT does not block', isEditItemBlocked('SENT') === false);
assert(
  'the predicate is total — no input produces a block',
  ['DRAFT', 'CONFIRMING', 'FROZEN', 'COMPLETE', 'SENT', '', 'anything'].every(
    (s) => isEditItemBlocked(s) === false
  )
);

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(
  `\n${passed + failed} tests: \x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`
);
if (failed > 0) process.exit(1);
