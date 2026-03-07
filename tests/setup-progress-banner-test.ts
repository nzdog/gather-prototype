/**
 * GTC-008 — "All set" banner must not render when unresolved conflicts exist.
 *
 * Tests the pure computeSetupProgress function exported from useEventSetupProgress.
 * This avoids needing a React runtime — the hook wraps the same logic in useMemo.
 */

import { computeSetupProgress } from '../src/hooks/useEventSetupProgress';

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

// Shared base params — all steps complete
const baseEvent = {
  id: 'evt-1',
  guestCount: 8,
  lastCheckPlanAt: '2026-01-01T00:00:00Z',
  hostId: 'host-1',
};
const basePeople = [
  { id: 'ep-1', personId: 'person-1' }, // non-host
];
const baseTeams = [{ id: 'team-1' }];
const noop = () => {};

const baseParams = {
  event: baseEvent,
  people: basePeople,
  teams: baseTeams,
  unresolvedConflictCount: 0,
  onOpenEditDetails: noop,
  onOpenAddPerson: noop,
  onOpenCreatePlan: noop,
  onRunPlanCheck: noop,
};

console.log('\x1b[33m=== GTC-008: Setup Progress Banner Tests ===\x1b[0m\n');

console.log('\x1b[33mTest Suite 1: "All set" suppressed when conflicts exist\x1b[0m');

// GTC-008 core: allComplete must be false when unresolvedConflictCount > 0
const withConflicts = computeSetupProgress({ ...baseParams, unresolvedConflictCount: 1 });
assert('allComplete is false when 1 unresolved conflict', withConflicts.allComplete === false);

const withManyConflicts = computeSetupProgress({ ...baseParams, unresolvedConflictCount: 3 });
assert('allComplete is false when 3 unresolved conflicts', withManyConflicts.allComplete === false);

// steps themselves should still all be complete — only allComplete is suppressed
assert('all 5 steps still show complete when conflicts exist', withConflicts.completedCount === 5);

console.log('\n\x1b[33mTest Suite 2: "All set" shown when no conflicts\x1b[0m');

const noConflicts = computeSetupProgress({ ...baseParams, unresolvedConflictCount: 0 });
assert(
  'allComplete is true when 0 unresolved conflicts and all steps done',
  noConflicts.allComplete === true
);

// Conflicts resolved → allComplete flips back
const resolvedConflicts = computeSetupProgress({ ...baseParams, unresolvedConflictCount: 0 });
assert('allComplete is true after conflicts drop to 0', resolvedConflicts.allComplete === true);

console.log('\n\x1b[33mTest Suite 3: Incomplete steps still block allComplete\x1b[0m');

const noCheckYet = computeSetupProgress({
  ...baseParams,
  event: { ...baseEvent, lastCheckPlanAt: null },
  unresolvedConflictCount: 0,
});
assert(
  'allComplete is false when plan check not run (no conflicts)',
  noCheckYet.allComplete === false
);

const noTeams = computeSetupProgress({
  ...baseParams,
  teams: [],
  unresolvedConflictCount: 0,
});
assert('allComplete is false when no teams yet', noTeams.allComplete === false);

console.log(
  '\n\x1b[33mTest Suite 4: Conflict count does not affect step completion display\x1b[0m'
);

assert(
  'completedCount is 5 with conflicts present (step indicators unaffected)',
  withConflicts.completedCount === 5
);
assert('completedCount is 5 with no conflicts', noConflicts.completedCount === 5);

console.log(`\n\x1b[33m=== Test Summary ===\x1b[0m`);
console.log(`Total tests: ${passed + failed}`);
console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

if (failed > 0) {
  console.error('\n\x1b[31m✗ Tests failed\x1b[0m');
  process.exit(1);
} else {
  console.log('\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m');
}
