#!/usr/bin/env tsx
/**
 * Phase 2 AI Integration Test Script
 * Tests AI plan generation and conflict detection
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

interface TestResult {
  test: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];
let testEvent: any = null;
let testHost: any = null;
let testConflicts: any[] = [];

function log(message: string) {
  console.log(`  ${message}`);
}

function pass(testName: string) {
  results.push({ test: testName, passed: true });
  console.log(`✓ PASS: ${testName}`);
}

function fail(testName: string, error: string) {
  results.push({ test: testName, passed: false, error });
  console.log(`✗ FAIL: ${testName}`);
  console.log(`  Error: ${error}`);
}

async function apiCall(method: string, path: string, body?: any) {
  const options: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${BASE_URL}${path}`, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function runTests() {
  console.log('\n🧪 Phase 2 AI Integration Tests\n');
  console.log('='.repeat(50));
  console.log('');

  try {
    // ============================================
    // TEST 1: Create Event with AI-friendly parameters
    // ============================================
    try {
      log('Creating test event with AI parameters...');

      // Get or create a host
      testHost = await prisma.person.findFirst({
        where: { name: 'Jacqui & Ian' },
      });

      if (!testHost) {
        testHost = await prisma.person.create({
          data: { name: 'Test Host AI', email: 'test-ai@example.com' },
        });
      }

      const eventData = {
        name: 'AI Test Christmas 2025',
        startDate: new Date('2025-12-24').toISOString(),
        endDate: new Date('2025-12-26').toISOString(),
        occasionType: 'CHRISTMAS',
        guestCount: 40,
        dietaryVegetarian: 4,
        dietaryGlutenFree: 2,
        venueName: 'Test Venue',
        venueType: 'HOME',
        venueKitchenAccess: 'FULL',
        venueOvenCount: 1,
      };

      const response = await apiCall('POST', '/api/events', eventData);
      testEvent = response.event;

      if (!testEvent || !testEvent.id) {
        throw new Error('Event creation failed');
      }

      pass('1. Create event with AI parameters');
    } catch (error: any) {
      fail('1. Create event with AI parameters', error.message);
      throw error; // Stop if event creation fails
    }

    // ============================================
    // TEST 2: Generate Plan via POST /api/events/[id]/generate
    // ============================================
    try {
      log('Generating plan with AI...');
      const response = await apiCall('POST', `/api/events/${testEvent.id}/generate`);

      if (!response.success) {
        throw new Error('Plan generation failed');
      }

      if (!response.teams || response.teams < 1) {
        throw new Error('No teams created');
      }

      if (!response.items || response.items < 1) {
        throw new Error('No items created');
      }

      log(`  Generated ${response.teams} team(s) and ${response.items} item(s)`);

      // Verify teams were created
      const teams = await prisma.team.findMany({
        where: { eventId: testEvent.id },
      });

      if (teams.length === 0) {
        throw new Error('No teams found in database after generation');
      }

      // Verify items were created
      const items = await prisma.item.findMany({
        where: { team: { eventId: testEvent.id } },
      });

      if (items.length === 0) {
        throw new Error('No items found in database after generation');
      }

      // Check for structured quantities
      const itemsWithQuantity = items.filter(
        (i) => i.quantityAmount !== null || i.quantityState === 'SPECIFIED'
      );

      if (itemsWithQuantity.length === 0) {
        throw new Error('No items have structured quantities');
      }

      pass('2. Generate plan (teams, items, quantities)');
    } catch (error: any) {
      fail('2. Generate plan (teams, items, quantities)', error.message);
    }

    // ============================================
    // TEST 3: Check Plan via POST /api/events/[id]/check
    // ============================================
    try {
      log('Checking plan for conflicts...');
      const response = await apiCall('POST', `/api/events/${testEvent.id}/check`);

      if (!response.success) {
        throw new Error('Plan check failed');
      }

      if (response.conflicts === undefined) {
        throw new Error('No conflicts count returned');
      }

      log(`  Found ${response.conflicts} conflict(s)`);

      // Verify at least one conflict was detected (placeholder quantities)
      if (response.conflicts === 0) {
        throw new Error('Expected at least 1 conflict (placeholder quantities)');
      }

      pass('3. Check plan and detect conflicts');
    } catch (error: any) {
      fail('3. Check plan and detect conflicts', error.message);
    }

    // ============================================
    // TEST 4: Get Conflicts via GET /api/events/[id]/conflicts
    // ============================================
    try {
      log('Fetching conflicts list...');
      const response = await apiCall('GET', `/api/events/${testEvent.id}/conflicts`);

      if (!response.conflicts || !Array.isArray(response.conflicts)) {
        throw new Error('No conflicts array returned');
      }

      if (response.conflicts.length === 0) {
        throw new Error('Expected at least 1 conflict in the list');
      }

      testConflicts = response.conflicts;

      // Verify conflict has required fields
      const firstConflict = testConflicts[0];
      if (!firstConflict.title || !firstConflict.description || !firstConflict.type) {
        throw new Error('Conflict missing required fields');
      }

      // Verify summary exists
      if (!response.summary) {
        throw new Error('No summary returned');
      }

      log(`  Retrieved ${testConflicts.length} conflict(s)`);
      log(`  First conflict: ${firstConflict.title}`);

      pass('4. Get conflicts list with details');
    } catch (error: any) {
      fail('4. Get conflicts list with details', error.message);
    }

    // ============================================
    // TEST 5: Get Specific Conflict via GET /api/events/[id]/conflicts/[conflictId]
    // ============================================
    try {
      log('Fetching specific conflict...');

      if (testConflicts.length === 0) {
        throw new Error('No conflicts available to fetch');
      }

      const conflictId = testConflicts[0].id;
      const response = await apiCall('GET', `/api/events/${testEvent.id}/conflicts/${conflictId}`);

      if (!response.conflict) {
        throw new Error('No conflict returned');
      }

      if (response.conflict.id !== conflictId) {
        throw new Error('Wrong conflict returned');
      }

      // Verify conflict details
      if (!response.conflict.severity || !response.conflict.claimType) {
        throw new Error('Conflict missing severity or claimType');
      }

      log(`  Severity: ${response.conflict.severity}`);
      log(`  Claim Type: ${response.conflict.claimType}`);

      pass('5. Get specific conflict details');
    } catch (error: any) {
      fail('5. Get specific conflict details', error.message);
    }

    // ============================================
    // TEST 6: Resolve Conflict via POST /api/events/[id]/conflicts/[conflictId]/resolve
    // ============================================
    try {
      log('Resolving a conflict...');

      if (testConflicts.length === 0) {
        throw new Error('No conflicts available to resolve');
      }

      const conflictId = testConflicts[0].id;
      const response = await apiCall(
        'POST',
        `/api/events/${testEvent.id}/conflicts/${conflictId}/resolve`,
        { resolvedBy: testHost.id }
      );

      if (!response.conflict) {
        throw new Error('No conflict returned');
      }

      if (response.conflict.status !== 'RESOLVED') {
        throw new Error(`Conflict status is ${response.conflict.status}, expected RESOLVED`);
      }

      if (!response.conflict.resolvedAt) {
        throw new Error('No resolvedAt timestamp');
      }

      pass('6. Resolve conflict successfully');
    } catch (error: any) {
      fail('6. Resolve conflict successfully', error.message);
    }

    // ============================================
    // TEST 7: Create Conflict Manually and Dismiss It
    // ============================================
    try {
      log('Creating conflict manually and dismissing it...');

      // Create a conflict directly in the database
      const testConflict = await prisma.conflict.create({
        data: {
          eventId: testEvent.id,
          fingerprint: `test-conflict-${Date.now()}`,
          type: 'DIETARY_GAP',
          severity: 'SIGNIFICANT',
          claimType: 'RISK',
          resolutionClass: 'FIX_IN_PLAN',
          title: 'Test Dietary Gap',
          description: 'This is a test conflict for dismissal testing',
          status: 'OPEN',
        },
      });

      // Verify it was created
      if (!testConflict || !testConflict.id) {
        throw new Error('Failed to create test conflict');
      }

      // Dismiss the conflict
      const dismissResponse = await apiCall(
        'POST',
        `/api/events/${testEvent.id}/conflicts/${testConflict.id}/dismiss`
      );

      if (dismissResponse.conflict.status !== 'DISMISSED') {
        throw new Error(
          `Conflict status is ${dismissResponse.conflict.status}, expected DISMISSED`
        );
      }

      if (!dismissResponse.conflict.dismissedAt) {
        throw new Error('No dismissedAt timestamp');
      }

      pass('7. Create and dismiss conflict');
    } catch (error: any) {
      fail('7. Create and dismiss conflict', error.message);
    }

    // ============================================
    // TEST 8: Verify Conflict Filtering
    // ============================================
    try {
      log('Verifying conflict status filtering...');

      // Get all conflicts
      const allResponse = await apiCall('GET', `/api/events/${testEvent.id}/conflicts?status=all`);

      // Get only resolved
      const resolvedResponse = await apiCall(
        'GET',
        `/api/events/${testEvent.id}/conflicts?status=resolved`
      );

      // Get only dismissed
      const dismissedResponse = await apiCall(
        'GET',
        `/api/events/${testEvent.id}/conflicts?status=dismissed`
      );

      // Verify we have different counts
      if (!allResponse.conflicts || !resolvedResponse.conflicts || !dismissedResponse.conflicts) {
        throw new Error('Missing conflicts arrays');
      }

      const allCount = allResponse.conflicts.length;
      const resolvedCount = resolvedResponse.conflicts.length;
      const dismissedCount = dismissedResponse.conflicts.length;

      if (allCount === 0) {
        throw new Error('No conflicts found at all');
      }

      if (resolvedCount === 0 && dismissedCount === 0) {
        throw new Error('Expected at least one resolved or dismissed conflict');
      }

      log(`  Total: ${allCount}, Resolved: ${resolvedCount}, Dismissed: ${dismissedCount}`);

      pass('8. Verify conflict status filtering');
    } catch (error: any) {
      fail('8. Verify conflict status filtering', error.message);
    }

    // ============================================
    // TEST 9: Cleanup - Delete Test Event
    // ============================================
    try {
      log('Cleaning up: deleting test event...');

      await prisma.event.delete({
        where: { id: testEvent.id },
      });

      const event = await prisma.event.findUnique({
        where: { id: testEvent.id },
      });

      if (event !== null) {
        throw new Error('Event still exists after deletion');
      }

      pass('9. Cleanup: Delete test event');
    } catch (error: any) {
      fail('9. Cleanup: Delete test event', error.message);
    }
  } catch (error: any) {
    console.error('\n❌ Fatal error during tests:', error.message);
  }

  // ============================================
  // SUMMARY
  // ============================================
  console.log('');
  console.log('='.repeat(50));
  console.log('\n📊 TEST SUMMARY\n');

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  console.log(`Phase 2 AI Integration: ${passed}/9 tests passed`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed:\n`);
    results
      .filter((r) => !r.passed)
      .forEach((r) => {
        console.log(`  - ${r.test}`);
        console.log(`    ${r.error}\n`);
      });
  }

  console.log('');
  console.log('📝 Notes:');
  console.log('  - Plan generation creates demo data (not full AI yet)');
  console.log('  - Enhanced conflict detection: timing, dietary gaps, coverage gaps');
  console.log('  - Suggestions API implemented (maps open conflicts)');
  console.log('  - Explanations API implemented (source, claimType, confidence, reasoning)');
  console.log('  - Regenerate API implemented (with modifiers and protection)');
  console.log('  - Run test-phase-2-enhanced.ts for full AI feature tests');
  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

// Run the tests
runTests()
  .catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
