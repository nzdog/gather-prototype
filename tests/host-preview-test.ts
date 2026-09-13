/**
 * Host Invite Link Preview — Regression Test
 *
 * GTC-072: When the host opens a participant invite link, they should see
 * a preview state ("Link checked, good to send") instead of the full
 * participant flow. Non-host guests see the normal participant view.
 *
 * Tests validate the API route logic and the client-side rendering branch.
 *
 * Run with: npx tsx tests/host-preview-test.ts
 */

import { readFileSync } from 'fs';
import { join } from 'path';

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

// ─── Types (mirror what the API returns) ────────────────────────────────────

interface HostPreviewResponse {
  isHostPreview: true;
  person: { id: string; name: string };
  event: { id: string; name: string };
  assignments: {
    id: string;
    response: string;
    item: {
      id: string;
      name: string;
      quantity: string | null;
      critical: boolean;
      day: { id: string; name: string } | null;
    };
  }[];
}

interface ParticipantResponse {
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
  team: unknown;
  // GTC-174 (D1): derived attendance replaces the retired rsvpStatus.
  attendance: string;
  assignments: unknown[];
}

// ─── Mock data ──────────────────────────────────────────────────────────────

const mockHostPreview: HostPreviewResponse = {
  isHostPreview: true,
  person: { id: 'p1', name: 'Emma Guest' },
  event: { id: 'evt1', name: 'Henderson Family Christmas' },
  assignments: [
    {
      id: 'a1',
      response: 'PENDING',
      item: {
        id: 'i1',
        name: 'Pavlova',
        quantity: '2',
        critical: true,
        day: { id: 'd1', name: 'Day 1' },
      },
    },
    {
      id: 'a2',
      response: 'ACCEPTED',
      item: {
        id: 'i2',
        name: 'Lemonade',
        quantity: null,
        critical: false,
        day: null,
      },
    },
  ],
};

const mockParticipantData: ParticipantResponse = {
  isDemo: false,
  person: { id: 'p1', name: 'Emma Guest' },
  event: {
    id: 'evt1',
    name: 'Henderson Family Christmas',
    startDate: '2026-12-25T00:00:00.000Z',
    endDate: '2026-12-26T00:00:00.000Z',
    status: 'CONFIRMING',
    guestCount: 12,
    venueName: null,
  },
  team: null,
  attendance: 'PENDING',
  assignments: [],
};

// ─── Simulate the client-side routing logic ─────────────────────────────────

function isHostPreviewResponse(data: unknown): data is HostPreviewResponse {
  return (
    typeof data === 'object' &&
    data !== null &&
    'isHostPreview' in data &&
    (data as HostPreviewResponse).isHostPreview === true
  );
}

function isParticipantResponse(data: unknown): data is ParticipantResponse {
  return (
    typeof data === 'object' && data !== null && !('isHostPreview' in data) && 'attendance' in data
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

console.log('\x1b[33m\x1b[1m=== Host Invite Link Preview Test (GTC-072) ===\x1b[0m\n');

console.log('\x1b[33mTest Suite 1: API response shape\x1b[0m');

test('host preview response has isHostPreview: true', () => {
  if (!mockHostPreview.isHostPreview) {
    throw new Error('Expected isHostPreview to be true');
  }
});

test('host preview response contains person name', () => {
  if (!mockHostPreview.person.name) {
    throw new Error('Expected person.name to be present');
  }
});

test('host preview response contains event name', () => {
  if (!mockHostPreview.event.name) {
    throw new Error('Expected event.name to be present');
  }
});

test('host preview response contains event id for back link', () => {
  if (!mockHostPreview.event.id) {
    throw new Error('Expected event.id to be present');
  }
});

test('host preview contains assignment items with names', () => {
  if (mockHostPreview.assignments.length !== 2) {
    throw new Error(`Expected 2 assignments, got ${mockHostPreview.assignments.length}`);
  }
  if (mockHostPreview.assignments[0].item.name !== 'Pavlova') {
    throw new Error(
      `Expected first item "Pavlova", got "${mockHostPreview.assignments[0].item.name}"`
    );
  }
});

test('host preview does not include rsvpStatus (no RSVP controls)', () => {
  if ('rsvpStatus' in mockHostPreview) {
    throw new Error(
      'Host preview should not include rsvpStatus — RSVP controls should not be shown'
    );
  }
});

// GTC-174 (D1): strengthened from "not in the host preview" to "nowhere in the route".
// rsvpStatus is retained-but-unwritten and attendance is derived, so the participant
// payload must not carry it either — the old assertion would have passed while the
// guest branch still emitted it.
test('the participant route emits no rsvpStatus anywhere (GTC-174)', () => {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  // Comment lines are stripped: the route's doc-comment legitimately names rsvpStatus
  // to record what was superseded. Only executable references are a violation.
  const src = fs
    .readFileSync(path.resolve(__dirname, '..', 'src/app/api/p/[token]/route.ts'), 'utf8')
    .split('\n')
    .filter((l: string) => {
      const t = l.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
  if (/rsvpStatus/.test(src)) {
    throw new Error(
      'src/app/api/p/[token]/route.ts still references rsvpStatus — attendance is derived (Hinge §3)'
    );
  }
});

test('the participant payload carries derived attendance instead (GTC-174)', () => {
  if (!('attendance' in mockParticipantData)) {
    throw new Error('Participant response should carry derived `attendance`');
  }
});

test('participant response does not have isHostPreview flag', () => {
  if ('isHostPreview' in mockParticipantData) {
    throw new Error('Participant response should not have isHostPreview flag');
  }
});

console.log('\n\x1b[33mTest Suite 2: Client-side routing\x1b[0m');

test('client correctly identifies host preview response', () => {
  if (!isHostPreviewResponse(mockHostPreview)) {
    throw new Error('Should identify host preview response');
  }
});

test('client correctly identifies participant response', () => {
  if (!isParticipantResponse(mockParticipantData)) {
    throw new Error('Should identify participant response');
  }
});

test('client does not misidentify participant data as host preview', () => {
  if (isHostPreviewResponse(mockParticipantData)) {
    throw new Error('Should not identify participant data as host preview');
  }
});

test('client does not misidentify host preview as participant data', () => {
  if (isParticipantResponse(mockHostPreview)) {
    throw new Error('Should not identify host preview as participant data');
  }
});

console.log('\n\x1b[33mTest Suite 3: Source code verification\x1b[0m');

test('API route imports getUser for session detection', () => {
  const routeSource = readFileSync(join(__dirname, '../src/app/api/p/[token]/route.ts'), 'utf-8');
  if (!routeSource.includes("import { getUser } from '@/lib/auth/session'")) {
    throw new Error('API route must import getUser from auth/session');
  }
});

test('API route checks EventRole for HOST role', () => {
  const routeSource = readFileSync(join(__dirname, '../src/app/api/p/[token]/route.ts'), 'utf-8');
  if (!routeSource.includes("role: 'HOST'")) {
    throw new Error('API route must check for HOST role in EventRole');
  }
});

test('API route returns isHostPreview flag', () => {
  const routeSource = readFileSync(join(__dirname, '../src/app/api/p/[token]/route.ts'), 'utf-8');
  if (!routeSource.includes('isHostPreview: true')) {
    throw new Error('API route must return isHostPreview: true for host viewers');
  }
});

test('client component renders "Link checked, good to send" heading', () => {
  const pageSource = readFileSync(join(__dirname, '../src/app/p/[token]/page.tsx'), 'utf-8');
  if (!pageSource.includes('Link checked, good to send')) {
    throw new Error('Page must show "Link checked, good to send" heading for host preview');
  }
});

test('client component has "Back to event" link', () => {
  const pageSource = readFileSync(join(__dirname, '../src/app/p/[token]/page.tsx'), 'utf-8');
  if (!pageSource.includes('Back to event')) {
    throw new Error('Page must have "Back to event" link in host preview');
  }
});

test('back to event link uses event id', () => {
  const pageSource = readFileSync(join(__dirname, '../src/app/p/[token]/page.tsx'), 'utf-8');
  if (!pageSource.includes('hostPreview.event.id')) {
    throw new Error('Back to event link must use hostPreview.event.id for URL');
  }
});

test('host preview skips link-open tracking', () => {
  const routeSource = readFileSync(join(__dirname, '../src/app/api/p/[token]/route.ts'), 'utf-8');
  // The host check returns early before the tracking code
  const hostReturnIndex = routeSource.indexOf('isHostPreview: true');
  const trackingIndex = routeSource.indexOf('Track first link open');
  if (hostReturnIndex === -1 || trackingIndex === -1) {
    throw new Error('Expected both host preview return and link tracking to exist');
  }
  if (hostReturnIndex > trackingIndex) {
    throw new Error('Host preview must return before link-open tracking runs');
  }
});

// ─── Summary ────────────────────────────────────────────────────────────────

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
