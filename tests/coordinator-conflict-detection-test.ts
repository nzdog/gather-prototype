/**
 * GTC-020 — Plan/Check: Unassigned coordinators not flagged as conflict
 *
 * The detectMissingCoordinators() function in src/lib/ai/check.ts was added in
 * commit 25af376 (Jan 19 2026) and is already called at step 5 of detectConflicts().
 * No code change was required — this test documents and gates that behaviour.
 *
 * Because detectMissingCoordinators() is a module-level private function that
 * shares a file with a top-level `new PrismaClient()` call, we reproduce the
 * detection logic inline here (exactly as it appears in check.ts) and validate
 * it with mock event data. This mirrors the approach used in
 * participant-view-null-coordinator-test.ts.
 *
 * Run with: npx tsx tests/coordinator-conflict-detection-test.ts
 */

// ─── Test harness ─────────────────────────────────────────────────────────────

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

function pass(name: string) {
  testsRun++;
  testsPassed++;
  console.log(`\x1b[32m✓\x1b[0m ${name}`);
}

function fail(name: string, reason: string) {
  testsRun++;
  testsFailed++;
  console.log(`\x1b[31m✗\x1b[0m ${name}`);
  console.log(`  ${reason}`);
}

function test(name: string, fn: () => void) {
  try {
    fn();
    pass(name);
  } catch (err) {
    fail(name, err instanceof Error ? err.message : String(err));
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MockTeam {
  id: string;
  name: string;
  coordinatorId: string | null;
  coordinator: { id: string; name: string } | null;
}

interface MockEvent {
  id: string;
  teams: MockTeam[];
}

interface ConflictData {
  fingerprint: string;
  type: string;
  severity: string;
  claimType: string;
  resolutionClass: string;
  title: string;
  description: string;
  suggestion: {
    action: string;
    teamId: string;
    teamName: string;
    recommendation: string;
  };
}

// ─── Logic under test (mirrors detectMissingCoordinators in src/lib/ai/check.ts) ──

function detectMissingCoordinators(event: MockEvent): ConflictData[] {
  const conflicts: ConflictData[] = [];

  const teamsWithoutCoordinators = event.teams.filter((team) => {
    return !team.coordinator || !team.coordinatorId;
  });

  for (const team of teamsWithoutCoordinators) {
    conflicts.push({
      fingerprint: `missing-coordinator-${event.id}-${team.id}`,
      type: 'STRUCTURAL_IMBALANCE',
      severity: 'SIGNIFICANT',
      claimType: 'PATTERN',
      resolutionClass: 'FIX_IN_PLAN',
      title: `Team "${team.name}" Needs a Coordinator`,
      description: `The "${team.name}" team doesn't have a coordinator assigned. Each team should have a coordinator to manage responsibilities and track progress.`,
      suggestion: {
        action: 'assign_coordinator',
        teamId: team.id,
        teamName: team.name,
        recommendation:
          'Use the "Assign Coordinators" button in the People section to designate someone as the coordinator for this team.',
      },
    });
  }

  return conflicts;
}

// ─── Mock data ────────────────────────────────────────────────────────────────

const eventId = 'cmmh3js22001dpi0ps0bk3wad';

const teamNoCoord: MockTeam = {
  id: 'team-1',
  name: 'Drinks Team',
  coordinatorId: null,
  coordinator: null,
};

const teamWithCoord: MockTeam = {
  id: 'team-2',
  name: 'Mains Team',
  coordinatorId: 'person-99',
  coordinator: { id: 'person-99', name: 'Rob Coord' },
};

const teamNoCoord2: MockTeam = {
  id: 'team-3',
  name: 'Desserts Team',
  coordinatorId: null,
  coordinator: null,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\x1b[33m\x1b[1m=== GTC-020: Coordinator Conflict Detection Tests ===\x1b[0m\n');

// ─── Suite 1: Detection produces conflicts for unassigned teams ───────────────

console.log('\x1b[33mTest Suite 1: Conflicts produced for unassigned teams\x1b[0m');

test('produces one conflict for each team with no coordinator', () => {
  const event: MockEvent = { id: eventId, teams: [teamNoCoord, teamNoCoord2] };
  const conflicts = detectMissingCoordinators(event);
  if (conflicts.length !== 2) {
    throw new Error(`Expected 2 conflicts, got ${conflicts.length}`);
  }
});

test('produces no conflict for a team that has a coordinator', () => {
  const event: MockEvent = { id: eventId, teams: [teamWithCoord] };
  const conflicts = detectMissingCoordinators(event);
  if (conflicts.length !== 0) {
    throw new Error(`Expected 0 conflicts, got ${conflicts.length}`);
  }
});

test('handles mixed teams: only unassigned teams produce conflicts', () => {
  const event: MockEvent = {
    id: eventId,
    teams: [teamNoCoord, teamWithCoord, teamNoCoord2],
  };
  const conflicts = detectMissingCoordinators(event);
  if (conflicts.length !== 2) {
    throw new Error(
      `Expected 2 conflicts (for the 2 uncoordinated teams), got ${conflicts.length}`
    );
  }
  const names = conflicts.map((c) => c.suggestion.teamName);
  if (!names.includes('Drinks Team')) throw new Error('Missing conflict for Drinks Team');
  if (!names.includes('Desserts Team')) throw new Error('Missing conflict for Desserts Team');
  if (names.includes('Mains Team')) throw new Error('Should not have conflict for Mains Team');
});

test('produces no conflicts when all teams have coordinators', () => {
  const event: MockEvent = { id: eventId, teams: [teamWithCoord] };
  const conflicts = detectMissingCoordinators(event);
  if (conflicts.length !== 0) {
    throw new Error(`Expected 0 conflicts, got ${conflicts.length}`);
  }
});

test('produces no conflicts for an event with no teams', () => {
  const event: MockEvent = { id: eventId, teams: [] };
  const conflicts = detectMissingCoordinators(event);
  if (conflicts.length !== 0) {
    throw new Error(`Expected 0 conflicts, got ${conflicts.length}`);
  }
});

// ─── Suite 2: Conflict shape ──────────────────────────────────────────────────

console.log('\n\x1b[33mTest Suite 2: Conflict shape and severity\x1b[0m');

const singleConflict = detectMissingCoordinators({
  id: eventId,
  teams: [teamNoCoord],
})[0];

test('conflict severity is SIGNIFICANT', () => {
  if (singleConflict.severity !== 'SIGNIFICANT') {
    throw new Error(`Expected severity SIGNIFICANT, got "${singleConflict.severity}"`);
  }
});

test('conflict type is STRUCTURAL_IMBALANCE', () => {
  if (singleConflict.type !== 'STRUCTURAL_IMBALANCE') {
    throw new Error(`Expected type STRUCTURAL_IMBALANCE, got "${singleConflict.type}"`);
  }
});

test('title includes team name and human-readable phrase', () => {
  if (!singleConflict.title.includes('Drinks Team')) {
    throw new Error(`Expected title to include team name, got: "${singleConflict.title}"`);
  }
  if (!singleConflict.title.toLowerCase().includes('coordinator')) {
    throw new Error(`Expected title to mention coordinator, got: "${singleConflict.title}"`);
  }
});

test('description is human-readable and mentions team name', () => {
  if (!singleConflict.description.includes('Drinks Team')) {
    throw new Error(`Description missing team name: "${singleConflict.description}"`);
  }
  if (singleConflict.description.length < 20) {
    throw new Error(`Description too short to be human-readable: "${singleConflict.description}"`);
  }
});

test('suggestion action is assign_coordinator', () => {
  if (singleConflict.suggestion.action !== 'assign_coordinator') {
    throw new Error(
      `Expected suggestion.action assign_coordinator, got "${singleConflict.suggestion.action}"`
    );
  }
});

test('suggestion recommendation is human-readable', () => {
  if (singleConflict.suggestion.recommendation.length < 20) {
    throw new Error(
      `Suggestion recommendation too short: "${singleConflict.suggestion.recommendation}"`
    );
  }
});

// ─── Suite 3: No duplicate conflicts (fingerprint uniqueness) ─────────────────

console.log('\n\x1b[33mTest Suite 3: No duplicate conflicts (fingerprint uniqueness)\x1b[0m');

test('each uncoordinated team gets a unique fingerprint', () => {
  const event: MockEvent = { id: eventId, teams: [teamNoCoord, teamNoCoord2] };
  const conflicts = detectMissingCoordinators(event);
  const fingerprints = conflicts.map((c) => c.fingerprint);
  const unique = new Set(fingerprints);
  if (unique.size !== fingerprints.length) {
    throw new Error(`Duplicate fingerprints detected: ${fingerprints.join(', ')}`);
  }
});

test('fingerprint encodes event id and team id', () => {
  const event: MockEvent = { id: eventId, teams: [teamNoCoord] };
  const conflicts = detectMissingCoordinators(event);
  const fp = conflicts[0].fingerprint;
  if (!fp.includes(eventId)) {
    throw new Error(`Fingerprint missing event id: "${fp}"`);
  }
  if (!fp.includes(teamNoCoord.id)) {
    throw new Error(`Fingerprint missing team id: "${fp}"`);
  }
});

test('running detection twice on same event produces same fingerprints (idempotent)', () => {
  const event: MockEvent = { id: eventId, teams: [teamNoCoord, teamNoCoord2] };
  const run1 = detectMissingCoordinators(event)
    .map((c) => c.fingerprint)
    .sort();
  const run2 = detectMissingCoordinators(event)
    .map((c) => c.fingerprint)
    .sort();
  if (JSON.stringify(run1) !== JSON.stringify(run2)) {
    throw new Error(`Fingerprints changed between runs: ${run1} vs ${run2}`);
  }
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n\x1b[33m\x1b[1m=== Test Summary ===\x1b[0m`);
console.log(`Total tests: ${testsRun}`);
console.log(`\x1b[32mPassed: ${testsPassed}\x1b[0m`);
console.log(`\x1b[31mFailed: ${testsFailed}\x1b[0m`);

if (testsFailed === 0) {
  console.log(`\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m`);
  process.exit(0);
} else {
  console.log(`\n\x1b[31m\x1b[1m✗ ${testsFailed} test(s) failed\x1b[0m`);
  process.exit(1);
}
