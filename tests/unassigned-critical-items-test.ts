/**
 * GTC-098 — Add conflict detection: critical items with no assignee
 *
 * detectUnassignedCriticalItems() in src/lib/ai/check.ts flags critical items
 * that have no assignment. This test reproduces the detection logic inline
 * and validates it with mock event data.
 *
 * Run with: npx tsx tests/unassigned-critical-items-test.ts
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

interface MockAssignment {
  id: string;
  personId: string;
  response: string;
}

interface MockItem {
  id: string;
  name: string;
  critical: boolean;
  assignment: MockAssignment | null;
}

interface MockTeam {
  id: string;
  name: string;
  items: MockItem[];
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
  affectedParties?: string[];
  canDelegate?: boolean;
}

// ─── Logic under test (mirrors check.ts detectUnassignedCriticalItems) ───────

function detectUnassignedCriticalItems(event: MockEvent): ConflictData[] {
  const conflicts: ConflictData[] = [];

  for (const team of event.teams) {
    for (const item of team.items) {
      if (item.critical && !item.assignment) {
        conflicts.push({
          fingerprint: `unassigned-critical-item-${event.id}-${item.id}`,
          type: 'QUANTITY_MISSING',
          severity: 'CRITICAL',
          claimType: 'RISK',
          resolutionClass: 'FIX_IN_PLAN',
          title: `"${item.name}" is critical but has no assignee`,
          description: `This item is marked critical but hasn't been assigned to anyone. It may not get brought to the event.`,
          affectedParties: [team.name],
          canDelegate: false,
        });
      }
    }
  }

  return conflicts;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeItem(overrides: Partial<MockItem> & { id: string; name: string }): MockItem {
  return {
    critical: false,
    assignment: null,
    ...overrides,
  };
}

function makeEvent(teams: MockTeam[]): MockEvent {
  return { id: 'event-1', teams };
}

function makeTeam(name: string, items: MockItem[]): MockTeam {
  return { id: `team-${name.toLowerCase().replace(/\s/g, '-')}`, name, items };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

console.log('\nGTC-098 — Unassigned critical items conflict detection\n');

// Assertion 1: Critical item with no assignee generates a CRITICAL conflict
test('1. Critical unassigned item generates conflict with correct title', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts.length !== 1) throw new Error(`Expected 1 conflict, got ${conflicts.length}`);
  if (conflicts[0].title !== '"Turkey" is critical but has no assignee')
    throw new Error(`Unexpected title: ${conflicts[0].title}`);
});

// Assertion 2: Conflict type is QUANTITY_MISSING and severity is CRITICAL
test('2. Conflict type is QUANTITY_MISSING, severity is CRITICAL', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts[0].type !== 'QUANTITY_MISSING')
    throw new Error(`Expected QUANTITY_MISSING, got ${conflicts[0].type}`);
  if (conflicts[0].severity !== 'CRITICAL')
    throw new Error(`Expected CRITICAL, got ${conflicts[0].severity}`);
});

// Assertion 3: affectedParties contains team name
test('3. affectedParties contains the team name', () => {
  const event = makeEvent([
    makeTeam('Desserts', [
      makeItem({ id: 'item-2', name: 'Cake', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (!conflicts[0].affectedParties || conflicts[0].affectedParties[0] !== 'Desserts')
    throw new Error(
      `Expected affectedParties=["Desserts"], got ${JSON.stringify(conflicts[0].affectedParties)}`
    );
});

// Assertion 4: Assigning the item resolves the conflict (no conflict generated)
test('4. Assigned critical item does not generate conflict (auto-resolve on re-check)', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({
        id: 'item-1',
        name: 'Turkey',
        critical: true,
        assignment: { id: 'assign-1', personId: 'person-1', response: 'PENDING' },
      }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts.length !== 0)
    throw new Error(`Expected 0 conflicts after assignment, got ${conflicts.length}`);
});

// Assertion 5: Critical item that IS assigned does not generate this conflict
test('5. Critical assigned item produces no conflict', () => {
  const event = makeEvent([
    makeTeam('Drinks', [
      makeItem({
        id: 'item-3',
        name: 'Wine',
        critical: true,
        assignment: { id: 'assign-2', personId: 'person-2', response: 'ACCEPTED' },
      }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts.length !== 0)
    throw new Error(`Expected 0 conflicts for assigned item, got ${conflicts.length}`);
});

// Assertion 6: Non-critical unassigned item does not generate this conflict
test('6. Non-critical unassigned item produces no conflict', () => {
  const event = makeEvent([
    makeTeam('Sides', [
      makeItem({ id: 'item-4', name: 'Napkins', critical: false, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts.length !== 0)
    throw new Error(`Expected 0 conflicts for non-critical item, got ${conflicts.length}`);
});

// Assertion 7: canDelegate is false
test('7. canDelegate is false on generated conflicts', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts[0].canDelegate !== false)
    throw new Error(`Expected canDelegate=false, got ${conflicts[0].canDelegate}`);
});

// Assertion 8: Multiple critical unassigned items across teams
test('8. Multiple critical unassigned items across teams each produce a conflict', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
      makeItem({ id: 'item-5', name: 'Gravy', critical: false, assignment: null }),
    ]),
    makeTeam('Desserts', [
      makeItem({ id: 'item-2', name: 'Cake', critical: true, assignment: null }),
      makeItem({
        id: 'item-6',
        name: 'Pie',
        critical: true,
        assignment: { id: 'assign-3', personId: 'person-3', response: 'PENDING' },
      }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  if (conflicts.length !== 2) throw new Error(`Expected 2 conflicts, got ${conflicts.length}`);
  if (conflicts[0].affectedParties![0] !== 'Mains')
    throw new Error(`First conflict should be for Mains team`);
  if (conflicts[1].affectedParties![0] !== 'Desserts')
    throw new Error(`Second conflict should be for Desserts team`);
});

// Assertion 9: Fingerprint is unique per item
test('9. Each conflict has a unique fingerprint per item', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
      makeItem({ id: 'item-2', name: 'Ham', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedCriticalItems(event);
  const fingerprints = conflicts.map((c) => c.fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length)
    throw new Error(`Fingerprints are not unique: ${JSON.stringify(fingerprints)}`);
  if (!fingerprints[0].includes('item-1')) throw new Error(`Fingerprint should contain item ID`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed}/${testsRun} passed`);
if (testsFailed > 0) {
  console.log(`${testsFailed} FAILED`);
  process.exit(1);
}
