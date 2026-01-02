#!/usr/bin/env tsx
/**
 * Phase 1 Foundation Test Script
 * Tests all foundation CRUD functionality
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
let testDays: any[] = [];
let testTeams: any[] = [];
let testItems: any[] = [];
let testHost: any = null;

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
  console.log('\n🧪 Phase 1 Foundation Tests\n');
  console.log('='.repeat(50));
  console.log('');

  try {
    // ============================================
    // TEST 1: Create Event via POST /api/events
    // ============================================
    try {
      log('Creating test event...');

      // Get or create a host from seed data
      testHost = await prisma.person.findFirst({
        where: { name: 'Jacqui & Ian' }
      });

      if (!testHost) {
        testHost = await prisma.person.create({
          data: { name: 'Test Host', email: 'test@example.com' }
        });
      }

      const eventData = {
        name: 'Test Christmas 2025',
        startDate: new Date('2025-12-24').toISOString(),
        endDate: new Date('2025-12-26').toISOString(),
        guestCount: 40,
        guestCountConfidence: 'HIGH',
        dietaryStatus: 'SPECIFIED',
        dietaryVegetarian: 4,
        dietaryGlutenFree: 2,
        venueName: 'Test Venue',
        venueType: 'HOME',
        venueKitchenAccess: 'FULL',
        venueOvenCount: 2,
      };

      const response = await apiCall('POST', '/api/events', eventData);
      testEvent = response.event;

      if (!testEvent || !testEvent.id) {
        throw new Error('Event creation failed - no ID returned');
      }

      pass('1. Create event via POST /api/events');
    } catch (error: any) {
      fail('1. Create event via POST /api/events', error.message);
      throw error; // Stop if event creation fails
    }

    // ============================================
    // TEST 2: Fetch Event via GET /api/events/[id]
    // ============================================
    try {
      log('Fetching event...');
      const response = await apiCall('GET', `/api/events/${testEvent.id}`);

      if (!response.event || response.event.id !== testEvent.id) {
        throw new Error('Event fetch failed');
      }

      if (response.event.name !== 'Test Christmas 2025') {
        throw new Error(`Event name mismatch: ${response.event.name}`);
      }

      if (response.event.guestCount !== 40) {
        throw new Error(`Guest count mismatch: ${response.event.guestCount}`);
      }

      pass('2. Fetch event via GET /api/events/[id]');
    } catch (error: any) {
      fail('2. Fetch event via GET /api/events/[id]', error.message);
    }

    // ============================================
    // TEST 3 & 4: Create Days via Prisma (API not required for Phase 1)
    // ============================================
    try {
      log('Creating days directly via Prisma...');

      const day1 = await prisma.day.create({
        data: {
          name: 'Christmas Eve',
          date: new Date('2025-12-24'),
          eventId: testEvent.id,
        }
      });

      const day2 = await prisma.day.create({
        data: {
          name: 'Christmas Day',
          date: new Date('2025-12-25'),
          eventId: testEvent.id,
        }
      });

      testDays = [day1, day2];
      pass('3. Create days via Prisma');
    } catch (error: any) {
      fail('3. Create days via Prisma', error.message);
    }

    // ============================================
    // TEST 4: List Days via Prisma
    // ============================================
    try {
      log('Listing days...');
      const days = await prisma.day.findMany({
        where: { eventId: testEvent.id }
      });

      if (days.length !== 2) {
        throw new Error(`Expected 2 days, got ${days.length}`);
      }

      pass('4. List days and verify 2 returned');
    } catch (error: any) {
      fail('4. List days and verify 2 returned', error.message);
    }

    // ============================================
    // TEST 5: Create Teams via Prisma
    // ============================================
    try {
      log('Creating teams...');

      const team1 = await prisma.team.create({
        data: {
          name: 'Mains',
          scope: 'Main protein dishes',
          domain: 'PROTEINS',
          eventId: testEvent.id,
          coordinatorId: testHost.id,
        }
      });

      const team2 = await prisma.team.create({
        data: {
          name: 'Sides',
          scope: 'Side dishes',
          domain: 'SIDES',
          eventId: testEvent.id,
          coordinatorId: testHost.id,
        }
      });

      const team3 = await prisma.team.create({
        data: {
          name: 'Desserts',
          scope: 'Desserts and sweets',
          domain: 'DESSERTS',
          eventId: testEvent.id,
          coordinatorId: testHost.id,
        }
      });

      testTeams = [team1, team2, team3];
      pass('5. Create 3 teams via Prisma');
    } catch (error: any) {
      fail('5. Create 3 teams via Prisma', error.message);
    }

    // ============================================
    // TEST 6: List Teams via GET /api/events/[id]/teams
    // ============================================
    try {
      log('Listing teams...');
      const response = await apiCall('GET', `/api/events/${testEvent.id}/teams`);

      if (!response.teams || response.teams.length !== 3) {
        throw new Error(`Expected 3 teams, got ${response.teams?.length || 0}`);
      }

      pass('6. List teams and verify 3 returned');
    } catch (error: any) {
      fail('6. List teams and verify 3 returned', error.message);
    }

    // ============================================
    // TEST 7 & 8: Create Items in Teams via Prisma
    // ============================================
    try {
      log('Creating items in Mains team...');

      const item1 = await prisma.item.create({
        data: {
          name: 'Roast Turkey',
          quantityAmount: 7,
          quantityUnit: 'KG',
          quantityState: 'SPECIFIED',
          teamId: testTeams[0].id, // Mains
          dayId: testDays[1].id, // Christmas Day
        }
      });

      const item2 = await prisma.item.create({
        data: {
          name: 'Glazed Ham',
          quantityAmount: 4,
          quantityUnit: 'KG',
          quantityState: 'SPECIFIED',
          teamId: testTeams[0].id, // Mains
          dayId: testDays[1].id, // Christmas Day
        }
      });

      testItems.push(item1, item2);
      pass('7. Create 2 items in Mains team');
    } catch (error: any) {
      fail('7. Create 2 items in Mains team', error.message);
    }

    // ============================================
    // TEST 8: Create Item in Desserts
    // ============================================
    try {
      log('Creating item in Desserts team...');

      const item3 = await prisma.item.create({
        data: {
          name: 'Pavlova',
          critical: true,
          teamId: testTeams[2].id, // Desserts
          dayId: testDays[1].id, // Christmas Day
        }
      });

      testItems.push(item3);
      pass('8. Create 1 item in Desserts with critical=true');
    } catch (error: any) {
      fail('8. Create 1 item in Desserts with critical=true', error.message);
    }

    // ============================================
    // TEST 9: List All Items via GET /api/events/[id]/items
    // ============================================
    try {
      log('Listing all items...');
      const response = await apiCall('GET', `/api/events/${testEvent.id}/items`);

      if (!response.items || response.items.length !== 3) {
        throw new Error(`Expected 3 items, got ${response.items?.length || 0}`);
      }

      pass('9. List all items and verify 3 returned');
    } catch (error: any) {
      fail('9. List all items and verify 3 returned', error.message);
    }

    // ============================================
    // TEST 10: Update Item via PATCH /api/events/[id]/items/[itemId]
    // ============================================
    try {
      log('Updating item quantity...');
      const response = await apiCall(
        'PATCH',
        `/api/events/${testEvent.id}/items/${testItems[0].id}`,
        { quantityAmount: 8 }
      );

      if (!response.item || response.item.quantityAmount !== 8) {
        throw new Error('Item quantity update failed');
      }

      pass('10. Update item quantity from 7 to 8');
    } catch (error: any) {
      fail('10. Update item quantity from 7 to 8', error.message);
    }

    // ============================================
    // TEST 11 & 12: Move Item Between Teams via Prisma
    // ============================================
    try {
      log('Moving Glazed Ham from Mains to Sides...');

      const updatedItem = await prisma.item.update({
        where: { id: testItems[1].id },
        data: { teamId: testTeams[1].id }, // Move to Sides
      });

      if (updatedItem.teamId !== testTeams[1].id) {
        throw new Error('Item move failed');
      }

      pass('11. Move item from Mains to Sides team');
    } catch (error: any) {
      fail('11. Move item from Mains to Sides team', error.message);
    }

    // ============================================
    // TEST 12: Verify Item is in Sides Team
    // ============================================
    try {
      log('Verifying item is now in Sides team...');

      const item = await prisma.item.findUnique({
        where: { id: testItems[1].id },
        include: { team: true }
      });

      if (!item || item.team.name !== 'Sides') {
        throw new Error(`Item is in wrong team: ${item?.team.name}`);
      }

      pass('12. Verify item is now in Sides team');
    } catch (error: any) {
      fail('12. Verify item is now in Sides team', error.message);
    }

    // ============================================
    // TEST 13: Delete Item via Prisma
    // ============================================
    try {
      log('Deleting one item...');

      await prisma.item.delete({
        where: { id: testItems[2].id } // Pavlova
      });

      const items = await prisma.item.findMany({
        where: { team: { eventId: testEvent.id } }
      });

      if (items.length !== 2) {
        throw new Error(`Expected 2 items after deletion, got ${items.length}`);
      }

      pass('13. Delete one item');
    } catch (error: any) {
      fail('13. Delete one item', error.message);
    }

    // ============================================
    // TEST 14: Delete Team via Prisma
    // ============================================
    try {
      log('Deleting one team...');

      await prisma.team.delete({
        where: { id: testTeams[2].id } // Desserts
      });

      const teams = await prisma.team.findMany({
        where: { eventId: testEvent.id }
      });

      if (teams.length !== 2) {
        throw new Error(`Expected 2 teams after deletion, got ${teams.length}`);
      }

      pass('14. Delete one team');
    } catch (error: any) {
      fail('14. Delete one team', error.message);
    }

    // ============================================
    // TEST 15: Delete Day via Prisma
    // ============================================
    try {
      log('Deleting one day...');

      await prisma.day.delete({
        where: { id: testDays[0].id } // Christmas Eve
      });

      const days = await prisma.day.findMany({
        where: { eventId: testEvent.id }
      });

      if (days.length !== 1) {
        throw new Error(`Expected 1 day after deletion, got ${days.length}`);
      }

      pass('15. Delete one day');
    } catch (error: any) {
      fail('15. Delete one day', error.message);
    }

    // ============================================
    // TEST 16: Cleanup - Delete Test Event
    // ============================================
    try {
      log('Cleaning up: deleting test event...');

      await prisma.event.delete({
        where: { id: testEvent.id }
      });

      const event = await prisma.event.findUnique({
        where: { id: testEvent.id }
      });

      if (event !== null) {
        throw new Error('Event still exists after deletion');
      }

      pass('16. Cleanup: Delete test event');
    } catch (error: any) {
      fail('16. Cleanup: Delete test event', error.message);
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

  console.log(`Phase 1 Foundation: ${passed}/16 tests passed`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed:\n`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.test}`);
      console.log(`    ${r.error}\n`);
    });
  }

  console.log('');
  console.log('📝 Manual UI Verification Required:');
  console.log('  - Visit http://localhost:3000/plan/new');
  console.log('  - Visit http://localhost:3000/plan/[eventId]');
  console.log('  - Verify pages load without error');
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
