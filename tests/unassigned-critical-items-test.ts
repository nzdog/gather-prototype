/**
 * GTC-098 / GTC-100 — Unassigned items conflict detection
 *
 * detectUnassignedItems() in src/lib/ai/check.ts flags all unassigned items:
 *   - Critical items → severity CRITICAL
 *   - Non-critical items → severity ADVISORY
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

// ─── Logic under test (mirrors check.ts detectUnassignedItems) ────────────

function detectUnassignedItems(event: MockEvent): ConflictData[] {
  const conflicts: ConflictData[] = [];

  for (const team of event.teams) {
    for (const item of team.items) {
      if (!item.assignment) {
        const isCritical = item.critical === true;
        conflicts.push({
          fingerprint: `unassigned-item-${event.id}-${item.id}`,
          type: 'QUANTITY_MISSING',
          severity: isCritical ? 'CRITICAL' : 'ADVISORY',
          claimType: 'RISK',
          resolutionClass: 'FIX_IN_PLAN',
          title: `"${item.name}" has no assignee`,
          description: isCritical
            ? `This item is marked critical but hasn't been assigned to anyone. It may not get brought to the event.`
            : `This item hasn't been assigned to anyone.`,
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

console.log('\nGTC-100 — Unassigned items conflict detection\n');

// Assertion 1: Critical item with no assignee generates a CRITICAL conflict
test('1. Critical unassigned item generates conflict with correct title', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (conflicts.length !== 1) throw new Error(`Expected 1 conflict, got ${conflicts.length}`);
  if (conflicts[0].title !== '"Turkey" has no assignee')
    throw new Error(`Unexpected title: ${conflicts[0].title}`);
});

// Assertion 2: Critical → CRITICAL severity, non-critical → ADVISORY severity
test('2. Critical item → CRITICAL severity', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
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
  const conflicts = detectUnassignedItems(event);
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
  const conflicts = detectUnassignedItems(event);
  if (conflicts.length !== 0)
    throw new Error(`Expected 0 conflicts after assignment, got ${conflicts.length}`);
});

// Assertion 5: Assigned non-critical item produces no conflict
test('5. Assigned non-critical item produces no conflict', () => {
  const event = makeEvent([
    makeTeam('Drinks', [
      makeItem({
        id: 'item-3',
        name: 'Wine',
        critical: false,
        assignment: { id: 'assign-2', personId: 'person-2', response: 'ACCEPTED' },
      }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (conflicts.length !== 0)
    throw new Error(`Expected 0 conflicts for assigned item, got ${conflicts.length}`);
});

// Assertion 6: Non-critical unassigned item NOW generates ADVISORY conflict
test('6. Non-critical unassigned item produces ADVISORY conflict', () => {
  const event = makeEvent([
    makeTeam('Sides', [
      makeItem({ id: 'item-4', name: 'Napkins', critical: false, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (conflicts.length !== 1)
    throw new Error(
      `Expected 1 conflict for non-critical unassigned item, got ${conflicts.length}`
    );
  if (conflicts[0].severity !== 'ADVISORY')
    throw new Error(`Expected ADVISORY, got ${conflicts[0].severity}`);
  if (conflicts[0].title !== '"Napkins" has no assignee')
    throw new Error(`Unexpected title: ${conflicts[0].title}`);
});

// Assertion 7: canDelegate is false
test('7. canDelegate is false on generated conflicts', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (conflicts[0].canDelegate !== false)
    throw new Error(`Expected canDelegate=false, got ${conflicts[0].canDelegate}`);
});

// Assertion 8: Multiple unassigned items across teams each produce a conflict
test('8. Multiple unassigned items across teams each produce a conflict', () => {
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
  const conflicts = detectUnassignedItems(event);
  // Turkey (critical, unassigned), Gravy (non-critical, unassigned), Cake (critical, unassigned)
  if (conflicts.length !== 3) throw new Error(`Expected 3 conflicts, got ${conflicts.length}`);
  if (conflicts[0].severity !== 'CRITICAL') throw new Error(`Turkey should be CRITICAL`);
  if (conflicts[1].severity !== 'ADVISORY') throw new Error(`Gravy should be ADVISORY`);
  if (conflicts[2].severity !== 'CRITICAL') throw new Error(`Cake should be CRITICAL`);
});

// Assertion 9: Fingerprint uses new pattern (unassigned-item-, not unassigned-critical-item-)
test('9. Fingerprints use new pattern and are unique per item', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
      makeItem({ id: 'item-2', name: 'Ham', critical: false, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  const fingerprints = conflicts.map((c) => c.fingerprint);
  if (new Set(fingerprints).size !== fingerprints.length)
    throw new Error(`Fingerprints are not unique: ${JSON.stringify(fingerprints)}`);
  if (!fingerprints[0].startsWith('unassigned-item-'))
    throw new Error(`Fingerprint should start with unassigned-item-, got ${fingerprints[0]}`);
  if (fingerprints[0].includes('unassigned-critical-item-'))
    throw new Error(`Fingerprint should NOT use old pattern unassigned-critical-item-`);
});

// Assertion 10: Non-critical description differs from critical description
test('10. Non-critical item description is generic (not mentioning critical)', () => {
  const event = makeEvent([
    makeTeam('Sides', [
      makeItem({ id: 'item-4', name: 'Napkins', critical: false, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (conflicts[0].description.includes('critical'))
    throw new Error(`Non-critical description should not mention "critical"`);
  if (conflicts[0].description !== "This item hasn't been assigned to anyone.")
    throw new Error(`Unexpected description: ${conflicts[0].description}`);
});

// Assertion 11: Critical item description mentions critical
test('11. Critical item description mentions critical', () => {
  const event = makeEvent([
    makeTeam('Mains', [
      makeItem({ id: 'item-1', name: 'Turkey', critical: true, assignment: null }),
    ]),
  ]);
  const conflicts = detectUnassignedItems(event);
  if (!conflicts[0].description.includes('critical'))
    throw new Error(`Critical description should mention "critical"`);
});

// ─── Summary ──────────────────────────────────────────────────────────────────

console.log(`\n${testsPassed}/${testsRun} passed`);
if (testsFailed > 0) {
  console.log(`${testsFailed} FAILED`);
  process.exit(1);
}
