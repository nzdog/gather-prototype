#!/usr/bin/env tsx
/**
 * Phase 4 Gate & Transition Test Script
 * Tests gate check logic and transition from DRAFT to CONFIRMING
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
let snapshotId: string | null = null;

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

  // Don't throw on expected failures (400 status)
  if (!response.ok && response.status !== 400) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return { data, status: response.status, ok: response.ok };
}

async function runTests() {
  console.log('\n🧪 Phase 4 Gate & Transition Tests\n');
  console.log('='.repeat(50));
  console.log('');

  try {
    // ============================================
    // TEST 1: Create Event in DRAFT Status
    // ============================================
    try {
      log('Creating test event in DRAFT status...');

      testHost = await prisma.person.findFirst({
        where: { name: 'Jacqui & Ian' }
      });

      if (!testHost) {
        testHost = await prisma.person.create({
          data: { name: 'Test Host Phase 4', email: 'test-phase4@example.com' }
        });
      }

      const eventData = {
        name: 'Phase 4 Gate Test Event',
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
      testEvent = response.data.event;

      if (testEvent.status !== 'DRAFT') {
        throw new Error(`Expected status DRAFT, got ${testEvent.status}`);
      }

      log(`  Event ID: ${testEvent.id}`);
      log(`  Status: ${testEvent.status}`);

      pass('1. Create event in DRAFT status');
    } catch (error: any) {
      fail('1. Create event in DRAFT status', error.message);
      throw error;
    }

    // ============================================
    // TEST 2: Gate Check with NO Teams/Items
    // ============================================
    try {
      log('Running gate check with no teams/items...');

      const response = await apiCall('POST', `/api/events/${testEvent.id}/gate-check`);

      if (!response.data.hasOwnProperty('passed')) {
        throw new Error('No "passed" field in response');
      }

      if (response.data.passed !== false) {
        throw new Error('Expected passed=false with no teams/items');
      }

      if (!response.data.blocks || !Array.isArray(response.data.blocks)) {
        throw new Error('No blocks array returned');
      }

      // Verify expected blocks
      const blockCodes = response.data.blocks.map((b: any) => b.code);

      if (!blockCodes.includes('STRUCTURAL_MINIMUM_TEAMS')) {
        throw new Error('Missing STRUCTURAL_MINIMUM_TEAMS block');
      }

      if (!blockCodes.includes('STRUCTURAL_MINIMUM_ITEMS')) {
        throw new Error('Missing STRUCTURAL_MINIMUM_ITEMS block');
      }

      log(`  Passed: ${response.data.passed}`);
      log(`  Blocks: ${blockCodes.join(', ')}`);

      pass('2. Gate check fails with minimum structure blocks');
    } catch (error: any) {
      fail('2. Gate check fails with minimum structure blocks', error.message);
    }

    // ============================================
    // TEST 3: Generate Plan (Create Teams + Items)
    // ============================================
    try {
      log('Generating plan...');

      await apiCall('POST', `/api/events/${testEvent.id}/generate`);

      // Verify teams and items were created
      const teams = await prisma.team.findMany({
        where: { eventId: testEvent.id }
      });

      const items = await prisma.item.findMany({
        where: { team: { eventId: testEvent.id } }
      });

      if (teams.length === 0) {
        throw new Error('No teams created');
      }

      if (items.length === 0) {
        throw new Error('No items created');
      }

      log(`  Teams: ${teams.length}, Items: ${items.length}`);

      pass('3. Generate plan creates teams and items');
    } catch (error: any) {
      fail('3. Generate plan creates teams and items', error.message);
    }

    // ============================================
    // TEST 4: Gate Check After Generation
    // ============================================
    try {
      log('Running gate check after generation...');

      const response = await apiCall('POST', `/api/events/${testEvent.id}/gate-check`);

      log(`  Passed: ${response.data.passed}`);

      if (response.data.blocks && response.data.blocks.length > 0) {
        log(`  Blocks: ${response.data.blocks.map((b: any) => b.code).join(', ')}`);
      }

      pass('4. Gate check runs after generation');
    } catch (error: any) {
      fail('4. Gate check runs after generation', error.message);
    }

    // ============================================
    // TEST 5: Run Check Plan to Get Conflicts
    // ============================================
    try {
      log('Running check plan to detect conflicts...');

      await apiCall('POST', `/api/events/${testEvent.id}/check`);

      const conflictsResponse = await apiCall('GET', `/api/events/${testEvent.id}/conflicts`);

      const conflicts = conflictsResponse.data.conflicts;

      log(`  Conflicts detected: ${conflicts.length}`);

      pass('5. Check plan detects conflicts');
    } catch (error: any) {
      fail('5. Check plan detects conflicts', error.message);
    }

    // ============================================
    // TEST 6: Acknowledge All CRITICAL Conflicts
    // ============================================
    try {
      log('Acknowledging CRITICAL conflicts...');

      const conflictsResponse = await apiCall('GET', `/api/events/${testEvent.id}/conflicts`);
      const criticalConflicts = conflictsResponse.data.conflicts.filter(
        (c: any) => c.severity === 'CRITICAL' && c.status === 'OPEN'
      );

      log(`  Found ${criticalConflicts.length} CRITICAL conflicts`);

      for (const conflict of criticalConflicts) {
        await apiCall(
          'POST',
          `/api/events/${testEvent.id}/conflicts/${conflict.id}/acknowledge`,
          {
            acknowledgedBy: testHost.id,
            impactStatement: `Acknowledged ${conflict.type} - will handle via alternative arrangements with affected guests`,
            impactUnderstood: true,
            mitigationPlanType: 'COMMUNICATE',
          }
        );
      }

      if (criticalConflicts.length > 0) {
        log(`  Acknowledged ${criticalConflicts.length} conflict(s)`);
      }

      pass('6. Acknowledge all CRITICAL conflicts');
    } catch (error: any) {
      fail('6. Acknowledge all CRITICAL conflicts', error.message);
    }

    // ============================================
    // TEST 7: Handle Placeholder Quantities
    // ============================================
    try {
      log('Handling placeholder quantities...');

      const placeholderItems = await prisma.item.findMany({
        where: {
          team: { eventId: testEvent.id },
          critical: true,
          quantityState: 'PLACEHOLDER',
          placeholderAcknowledged: false,
        },
      });

      log(`  Found ${placeholderItems.length} critical placeholder(s)`);

      // Set placeholderAcknowledged to true for all
      for (const item of placeholderItems) {
        await prisma.item.update({
          where: { id: item.id },
          data: { placeholderAcknowledged: true },
        });
      }

      if (placeholderItems.length > 0) {
        log(`  Acknowledged ${placeholderItems.length} placeholder(s)`);
      }

      pass('7. Handle critical placeholder quantities');
    } catch (error: any) {
      fail('7. Handle critical placeholder quantities', error.message);
    }

    // ============================================
    // TEST 8: Gate Check Should Pass Now
    // ============================================
    try {
      log('Running gate check (should pass now)...');

      const response = await apiCall('POST', `/api/events/${testEvent.id}/gate-check`);

      if (response.data.passed !== true) {
        const blockCodes = response.data.blocks?.map((b: any) => b.code) || [];
        throw new Error(`Expected passed=true, got false. Blocks: ${blockCodes.join(', ')}`);
      }

      if (response.data.blocks && response.data.blocks.length > 0) {
        throw new Error(`Expected no blocks, got ${response.data.blocks.length}`);
      }

      log(`  Passed: ${response.data.passed}`);
      log(`  Blocks: []`);

      pass('8. Gate check passes after resolving issues');
    } catch (error: any) {
      fail('8. Gate check passes after resolving issues', error.message);
    }

    // ============================================
    // TEST 9: Attempt Transition to CONFIRMING
    // ============================================
    try {
      log('Attempting transition to CONFIRMING...');

      const response = await apiCall('POST', `/api/events/${testEvent.id}/transition`, {
        actorId: testHost.id,
      });

      if (!response.ok) {
        throw new Error(`Transition failed: ${response.data.error || 'Unknown error'}`);
      }

      if (response.data.success !== true) {
        throw new Error('Expected success=true');
      }

      if (!response.data.snapshotId) {
        throw new Error('No snapshotId returned');
      }

      snapshotId = response.data.snapshotId;

      log(`  Success: ${response.data.success}`);
      log(`  Snapshot ID: ${snapshotId}`);

      pass('9. Transition succeeds and returns snapshotId');
    } catch (error: any) {
      fail('9. Transition succeeds and returns snapshotId', error.message);
    }

    // ============================================
    // TEST 10: Verify Event Status Changed
    // ============================================
    try {
      log('Verifying event status changed...');

      const eventResponse = await apiCall('GET', `/api/events/${testEvent.id}`);
      const event = eventResponse.data.event;

      if (event.status !== 'CONFIRMING') {
        throw new Error(`Expected status CONFIRMING, got ${event.status}`);
      }

      if (event.structureMode !== 'LOCKED') {
        throw new Error(`Expected structureMode LOCKED, got ${event.structureMode}`);
      }

      if (!event.planSnapshotIdAtConfirming) {
        throw new Error('planSnapshotIdAtConfirming not set');
      }

      if (!event.transitionedToConfirmingAt) {
        throw new Error('transitionedToConfirmingAt not set');
      }

      log(`  Status: ${event.status}`);
      log(`  Structure Mode: ${event.structureMode}`);
      log(`  Snapshot ID: ${event.planSnapshotIdAtConfirming}`);
      log(`  Transitioned At: ${new Date(event.transitionedToConfirmingAt).toISOString()}`);

      pass('10. Event status updated correctly');
    } catch (error: any) {
      fail('10. Event status updated correctly', error.message);
    }

    // ============================================
    // TEST 11: Verify PlanSnapshot Contents
    // ============================================
    try {
      log('Verifying PlanSnapshot contents...');

      if (!snapshotId) {
        throw new Error('No snapshotId available');
      }

      const snapshot = await prisma.planSnapshot.findUnique({
        where: { id: snapshotId },
      });

      if (!snapshot) {
        throw new Error('PlanSnapshot not found');
      }

      // Verify snapshot contains required arrays
      const teams = snapshot.teams as any;
      const items = snapshot.items as any;
      const criticalFlags = snapshot.criticalFlags as any;
      const acknowledgements = snapshot.acknowledgements as any;

      if (!Array.isArray(teams)) {
        throw new Error('teams is not an array');
      }

      if (!Array.isArray(items)) {
        throw new Error('items is not an array');
      }

      if (!Array.isArray(criticalFlags)) {
        throw new Error('criticalFlags is not an array');
      }

      if (!Array.isArray(acknowledgements)) {
        throw new Error('acknowledgements is not an array');
      }

      log(`  Teams: ${teams.length}`);
      log(`  Items: ${items.length}`);
      log(`  Critical Flags: ${criticalFlags.length}`);
      log(`  Acknowledgements: ${acknowledgements.length}`);

      pass('11. PlanSnapshot contains all required data');
    } catch (error: any) {
      fail('11. PlanSnapshot contains all required data', error.message);
    }

    // ============================================
    // TEST 12: Attempt Transition Again (Should Fail)
    // ============================================
    try {
      log('Attempting transition again (should fail)...');

      const response = await apiCall('POST', `/api/events/${testEvent.id}/transition`, {
        actorId: testHost.id,
      });

      if (response.ok) {
        throw new Error('Expected transition to fail for already CONFIRMING event');
      }

      if (response.status !== 400 && response.status !== 500) {
        throw new Error(`Expected 400 or 500 status, got ${response.status}`);
      }

      // Check for error in either error field or blocks
      const hasError = response.data.error || (response.data.blocks && response.data.blocks.length > 0);

      if (!hasError) {
        throw new Error('No error message or blocks returned');
      }

      if (response.data.error) {
        log(`  Error (expected): ${response.data.error}`);
      } else if (response.data.blocks) {
        log(`  Blocks (expected): ${response.data.blocks.map((b: any) => b.code).join(', ')}`);
      }

      pass('12. Second transition attempt fails appropriately');
    } catch (error: any) {
      fail('12. Second transition attempt fails appropriately', error.message);
    }

    // ============================================
    // TEST 13: Cleanup Test Data
    // ============================================
    try {
      log('Cleaning up test data...');

      await prisma.event.delete({
        where: { id: testEvent.id }
      });

      pass('13. Cleanup successful');
    } catch (error: any) {
      fail('13. Cleanup successful', error.message);
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

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`Phase 4 Gate & Transition: ${passed}/13 tests passed`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed:\n`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.test}`);
      console.log(`    ${r.error}\n`);
    });
  }

  console.log('');
  console.log('✅ Gate & Transition Features Tested:');
  console.log('  - Gate check blocks (STRUCTURAL_MINIMUM_TEAMS, STRUCTURAL_MINIMUM_ITEMS)');
  console.log('  - Conflict acknowledgement requirement');
  console.log('  - Placeholder quantity handling');
  console.log('  - Successful transition to CONFIRMING');
  console.log('  - PlanSnapshot creation with all data');
  console.log('  - Status and structureMode updates');
  console.log('  - Prevention of duplicate transitions');
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
