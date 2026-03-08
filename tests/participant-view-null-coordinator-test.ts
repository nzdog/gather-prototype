/**
 * Participant View — Null Coordinator Regression Test
 *
 * GTC-021: /p/ crashes with client-side exception when a team has no
 * coordinator assigned (coordinatorId is null on the Team record).
 *
 * The API route correctly returns coordinator: null, but the page component
 * was unconditionally accessing data.team.coordinator.name, causing a
 * TypeError at render time → white screen.
 *
 * Run with: npx tsx tests/participant-view-null-coordinator-test.ts
 */

// Test results tracking
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

// ─── Types (mirror the component's ParticipantData interface) ───────────────

interface CoordinatorInfo {
  id: string;
  name: string;
}

// Pre-fix interface: coordinator is non-nullable (BUG)
interface ParticipantDataPreFix {
  isDemo: boolean;
  person: { id: string; name: string };
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    guestCount: number | null;
    venueName: string | null;
  };
  team: {
    id: string;
    name: string;
    coordinator: CoordinatorInfo; // non-nullable — BUG
  } | null;
  rsvpStatus: 'PENDING' | 'YES' | 'NO' | 'NOT_SURE';
  rsvpRespondedAt: string | null;
  rsvpFollowupSentAt: string | null;
  assignments: Array<{ id: string }>;
}

// Post-fix interface: coordinator is nullable (correct)
interface ParticipantDataPostFix {
  isDemo: boolean;
  person: { id: string; name: string };
  event: {
    id: string;
    name: string;
    startDate: string;
    endDate: string;
    status: string;
    guestCount: number | null;
    venueName: string | null;
  };
  team: {
    id: string;
    name: string;
    coordinator: CoordinatorInfo | null; // nullable — correct
  } | null;
  rsvpStatus: 'PENDING' | 'YES' | 'NO' | 'NOT_SURE';
  rsvpRespondedAt: string | null;
  rsvpFollowupSentAt: string | null;
  assignments: Array<{ id: string }>;
}

// ─── Mock data ───────────────────────────────────────────────────────────────

const mockDataNullCoordinator: ParticipantDataPostFix = {
  isDemo: false,
  person: { id: 'p1', name: 'Emma Guest' },
  event: {
    id: 'cmmh3js22001dpi0ps0bk3wad',
    name: 'Henderson Family Christmas',
    startDate: '2026-12-25T00:00:00.000Z',
    endDate: '2026-12-26T00:00:00.000Z',
    status: 'CONFIRMING',
    guestCount: 12,
    venueName: null,
  },
  team: {
    id: 't1',
    name: 'Drinks Team',
    coordinator: null, // team has no coordinator assigned — this is the crash case
  },
  rsvpStatus: 'PENDING',
  rsvpRespondedAt: null,
  rsvpFollowupSentAt: null,
  assignments: [],
};

const mockDataWithCoordinator: ParticipantDataPostFix = {
  ...mockDataNullCoordinator,
  team: {
    id: 't1',
    name: 'Drinks Team',
    coordinator: { id: 'coord1', name: 'Rob Coord' },
  },
};

const mockDataNoTeam: ParticipantDataPostFix = {
  ...mockDataNullCoordinator,
  team: null,
};

// ─── Simulate pre-fix rendering logic ────────────────────────────────────────

// Pre-fix: unconditional access — crashes when coordinator is null
function preFix_renderCoordinatorHeader(data: ParticipantDataPreFix): string {
  if (data.team) {
    // This is what the pre-fix code did:
    return `Coordinator: ${data.team.coordinator.name}`; // throws if coordinator is null
  }
  return '';
}

function preFix_renderCoordinatorFooter(data: ParticipantDataPreFix): string {
  if (data.team) {
    return data.team.coordinator.name; // throws if coordinator is null
  }
  return '';
}

// Post-fix: guarded access — safe when coordinator is null
function postFix_renderCoordinatorHeader(data: ParticipantDataPostFix): string {
  if (data.team && data.team.coordinator) {
    return `Coordinator: ${data.team.coordinator.name}`;
  }
  return '';
}

function postFix_renderCoordinatorFooter(data: ParticipantDataPostFix): string {
  if (data.team && data.team.coordinator) {
    return data.team.coordinator.name;
  }
  return '';
}

// ─── Tests ───────────────────────────────────────────────────────────────────

console.log('\x1b[33m\x1b[1m=== Participant View — Null Coordinator Test ===\x1b[0m\n');

console.log('\x1b[33mTest Suite 1: Pre-fix behaviour (documents the bug)\x1b[0m');

test('pre-fix: crashes with TypeError when coordinator is null (header)', () => {
  let crashed = false;
  try {
    preFix_renderCoordinatorHeader(mockDataNullCoordinator as unknown as ParticipantDataPreFix);
  } catch (e) {
    if (e instanceof TypeError) {
      crashed = true;
    }
  }
  if (!crashed) {
    throw new Error('Expected TypeError but no error was thrown — bug may already be fixed');
  }
});

test('pre-fix: crashes with TypeError when coordinator is null (footer)', () => {
  let crashed = false;
  try {
    preFix_renderCoordinatorFooter(mockDataNullCoordinator as unknown as ParticipantDataPreFix);
  } catch (e) {
    if (e instanceof TypeError) {
      crashed = true;
    }
  }
  if (!crashed) {
    throw new Error('Expected TypeError but no error was thrown — bug may already be fixed');
  }
});

test('pre-fix: works fine when coordinator is present', () => {
  const result = preFix_renderCoordinatorHeader(
    mockDataWithCoordinator as unknown as ParticipantDataPreFix
  );
  if (!result.includes('Rob Coord')) {
    throw new Error(`Expected coordinator name in output, got: ${result}`);
  }
});

console.log('\n\x1b[33mTest Suite 2: Post-fix behaviour (the fix)\x1b[0m');

test('post-fix: renders without crash when coordinator is null (header)', () => {
  const result = postFix_renderCoordinatorHeader(mockDataNullCoordinator);
  if (result !== '') {
    throw new Error(`Expected empty string for null coordinator, got: "${result}"`);
  }
});

test('post-fix: renders without crash when coordinator is null (footer)', () => {
  const result = postFix_renderCoordinatorFooter(mockDataNullCoordinator);
  if (result !== '') {
    throw new Error(`Expected empty string for null coordinator, got: "${result}"`);
  }
});

test('post-fix: renders coordinator name when coordinator is present (header)', () => {
  const result = postFix_renderCoordinatorHeader(mockDataWithCoordinator);
  if (!result.includes('Rob Coord')) {
    throw new Error(`Expected coordinator name in output, got: "${result}"`);
  }
});

test('post-fix: renders coordinator name when coordinator is present (footer)', () => {
  const result = postFix_renderCoordinatorFooter(mockDataWithCoordinator);
  if (result !== 'Rob Coord') {
    throw new Error(`Expected "Rob Coord", got: "${result}"`);
  }
});

test('post-fix: renders safely when team is null', () => {
  const header = postFix_renderCoordinatorHeader(mockDataNoTeam);
  const footer = postFix_renderCoordinatorFooter(mockDataNoTeam);
  if (header !== '' || footer !== '') {
    throw new Error('Expected empty strings for null team');
  }
});

// ─── Summary ─────────────────────────────────────────────────────────────────

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
