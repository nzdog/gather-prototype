/**
 * Security Validation Test Suite
 *
 * Tests the two critical security fixes:
 * 1. Authentication required on /api/events/[id]/* routes
 * 2. Server-side frozen state validation on coordinator routes
 *
 * Run with: npx tsx tests/security-validation.ts
 */

import { prisma } from '../src/lib/prisma';
import { requireEventRole, requireNotFrozen, requireTokenScope } from '../src/lib/auth/guards';
import type { EventStatus } from '@prisma/client';

// Test results tracking
let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;

// ANSI color codes
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function logTest(name: string, passed: boolean, message?: string) {
  testsRun++;
  if (passed) {
    testsPassed++;
    console.log(`${GREEN}✓${RESET} ${name}`);
  } else {
    testsFailed++;
    console.log(`${RED}✗${RESET} ${name}`);
    if (message) {
      console.log(`  ${RED}Error: ${message}${RESET}`);
    }
  }
}

function logSection(title: string) {
  console.log(`\n${BOLD}${YELLOW}${title}${RESET}`);
}

function isErrorResponse(result: any): boolean {
  return result && typeof result === 'object' && 'status' in result;
}

async function testSuite1_AuthGuards() {
  logSection('Test Suite 1: Auth Guard Functions');

  // Test 1.1: requireEventRole with no user (should fail)
  try {
    // This would normally check getUser() which returns null in test env
    // We'll test this by mocking later, for now just verify the guard exists
    const guardExists = typeof requireEventRole === 'function';
    logTest('requireEventRole function exists', guardExists);
  } catch (error: any) {
    logTest('requireEventRole function exists', false, error.message);
  }

  // Test 1.2: requireNotFrozen with frozen event (should fail)
  try {
    const frozenEvent = {
      id: 'test-event',
      status: 'FROZEN' as EventStatus,
      name: 'Test Event',
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      guestCount: null,
      occasionType: null,
      occasionDescription: null,
      guestCountConfidence: 'MEDIUM',
      guestCountMin: null,
      guestCountMax: null,
      dietaryStatus: 'UNSPECIFIED',
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      dietaryAllergies: null,
      venueName: null,
      venueType: null,
      venueKitchenAccess: null,
      venueOvenCount: 0,
      venueStoretopBurners: null,
      venueBbqAvailable: null,
      venueTimingStart: null,
      venueTimingEnd: null,
      venueNotes: null,
      hostId: 'test-host',
      coHostId: null,
      structureMode: 'EDITABLE',
      archived: false,
      isLegacy: false,
    };

    const result = requireNotFrozen(frozenEvent, false);
    const blocked = isErrorResponse(result);
    logTest(
      'requireNotFrozen blocks FROZEN event',
      blocked,
      blocked ? undefined : 'Should have blocked FROZEN event'
    );
  } catch (error: any) {
    logTest('requireNotFrozen blocks FROZEN event', false, error.message);
  }

  // Test 1.3: requireNotFrozen with draft event (should pass)
  try {
    const draftEvent = {
      id: 'test-event',
      status: 'DRAFT' as EventStatus,
      name: 'Test Event',
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      guestCount: null,
      occasionType: null,
      occasionDescription: null,
      guestCountConfidence: 'MEDIUM',
      guestCountMin: null,
      guestCountMax: null,
      dietaryStatus: 'UNSPECIFIED',
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      dietaryAllergies: null,
      venueName: null,
      venueType: null,
      venueKitchenAccess: null,
      venueOvenCount: 0,
      venueStoretopBurners: null,
      venueBbqAvailable: null,
      venueTimingStart: null,
      venueTimingEnd: null,
      venueNotes: null,
      hostId: 'test-host',
      coHostId: null,
      structureMode: 'EDITABLE',
      archived: false,
      isLegacy: false,
    };

    const result = requireNotFrozen(draftEvent, false);
    const allowed = !isErrorResponse(result);
    logTest(
      'requireNotFrozen allows DRAFT event',
      allowed,
      allowed ? undefined : 'Should have allowed DRAFT event'
    );
  } catch (error: any) {
    logTest('requireNotFrozen allows DRAFT event', false, error.message);
  }

  // Test 1.4: requireNotFrozen with FROZEN + override (should pass)
  try {
    const frozenEvent = {
      id: 'test-event',
      status: 'FROZEN' as EventStatus,
      name: 'Test Event',
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      guestCount: null,
      occasionType: null,
      occasionDescription: null,
      guestCountConfidence: 'MEDIUM',
      guestCountMin: null,
      guestCountMax: null,
      dietaryStatus: 'UNSPECIFIED',
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      dietaryAllergies: null,
      venueName: null,
      venueType: null,
      venueKitchenAccess: null,
      venueOvenCount: 0,
      venueStoretopBurners: null,
      venueBbqAvailable: null,
      venueTimingStart: null,
      venueTimingEnd: null,
      venueNotes: null,
      hostId: 'test-host',
      coHostId: null,
      structureMode: 'EDITABLE',
      archived: false,
      isLegacy: false,
    };

    const result = requireNotFrozen(frozenEvent, true); // allowOverride = true
    const allowed = !isErrorResponse(result);
    logTest(
      'requireNotFrozen allows FROZEN with override',
      allowed,
      allowed ? undefined : 'Should have allowed FROZEN event with override'
    );
  } catch (error: any) {
    logTest('requireNotFrozen allows FROZEN with override', false, error.message);
  }

  // Test 1.5: requireNotFrozen blocks COMPLETE event
  try {
    const completeEvent = {
      id: 'test-event',
      status: 'COMPLETE' as EventStatus,
      name: 'Test Event',
      startDate: new Date(),
      endDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      guestCount: null,
      occasionType: null,
      occasionDescription: null,
      guestCountConfidence: 'MEDIUM',
      guestCountMin: null,
      guestCountMax: null,
      dietaryStatus: 'UNSPECIFIED',
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      dietaryAllergies: null,
      venueName: null,
      venueType: null,
      venueKitchenAccess: null,
      venueOvenCount: 0,
      venueStoretopBurners: null,
      venueBbqAvailable: null,
      venueTimingStart: null,
      venueTimingEnd: null,
      venueNotes: null,
      hostId: 'test-host',
      coHostId: null,
      structureMode: 'EDITABLE',
      archived: false,
      isLegacy: false,
    };

    const result = requireNotFrozen(completeEvent, false);
    const blocked = isErrorResponse(result);
    logTest(
      'requireNotFrozen blocks COMPLETE event',
      blocked,
      blocked ? undefined : 'Should have blocked COMPLETE event'
    );
  } catch (error: any) {
    logTest('requireNotFrozen blocks COMPLETE event', false, error.message);
  }
}

async function testSuite2_DatabaseIntegrity() {
  logSection('Test Suite 2: Database Schema Integrity');

  try {
    // Test 2.1: Verify auth guards library imports correctly
    const guardsImported =
      typeof requireEventRole === 'function' &&
      typeof requireNotFrozen === 'function' &&
      typeof requireTokenScope === 'function';

    logTest('Auth guards library imports correctly', guardsImported);
  } catch (error: any) {
    logTest('Auth guards library imports correctly', false, error.message);
  }

  try {
    // Test 2.2: Verify database connection
    await prisma.$connect();
    logTest('Database connection successful', true);
  } catch (error: any) {
    logTest('Database connection successful', false, error.message);
  }

  try {
    // Test 2.3: Verify EventRole model exists (for requireEventRole)
    const eventRoleCount = await prisma.eventRole.count();
    logTest(
      'EventRole model accessible',
      typeof eventRoleCount === 'number',
      typeof eventRoleCount === 'number' ? undefined : 'EventRole table not found'
    );
  } catch (error: any) {
    logTest('EventRole model accessible', false, error.message);
  }

  try {
    // Test 2.4: Verify AccessToken model exists (for requireTokenScope)
    const tokenCount = await prisma.accessToken.count();
    logTest(
      'AccessToken model accessible',
      typeof tokenCount === 'number',
      typeof tokenCount === 'number' ? undefined : 'AccessToken table not found'
    );
  } catch (error: any) {
    logTest('AccessToken model accessible', false, error.message);
  }

  try {
    // Test 2.5: Verify Event model has status field
    const events = await prisma.event.findMany({ take: 1 });
    const hasStatusField = events.length === 0 || 'status' in events[0];
    logTest(
      'Event model has status field',
      hasStatusField,
      hasStatusField ? undefined : 'Event.status field not found'
    );
  } catch (error: any) {
    logTest('Event model has status field', false, error.message);
  }
}

async function testSuite3_RouteProtection() {
  logSection('Test Suite 3: Route Protection Verification');

  // These tests verify the files have been modified correctly
  const fs = require('fs');
  const path = require('path');

  // Test 3.1: Verify teams route imports auth guards
  try {
    const teamsRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/events/[id]/teams/route.ts'),
      'utf8'
    );
    const hasImport = teamsRoute.includes("from '@/lib/auth/guards'");
    const hasGuard = teamsRoute.includes('requireEventRole');
    logTest(
      'Teams route imports and uses auth guards',
      hasImport && hasGuard,
      hasImport && hasGuard
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasGuard ? 'guard usage' : ''}`
    );
  } catch (error: any) {
    logTest('Teams route imports and uses auth guards', false, error.message);
  }

  // Test 3.2: Verify people route imports auth guards
  try {
    const peopleRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/events/[id]/people/route.ts'),
      'utf8'
    );
    const hasImport = peopleRoute.includes("from '@/lib/auth/guards'");
    const hasGuard = peopleRoute.includes('requireEventRole');
    logTest(
      'People route imports and uses auth guards',
      hasImport && hasGuard,
      hasImport && hasGuard
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasGuard ? 'guard usage' : ''}`
    );
  } catch (error: any) {
    logTest('People route imports and uses auth guards', false, error.message);
  }

  // Test 3.3: Verify assign route imports auth guards
  try {
    const assignRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/events/[id]/items/[itemId]/assign/route.ts'),
      'utf8'
    );
    const hasImport = assignRoute.includes("from '@/lib/auth/guards'");
    const hasRequireEventRole = assignRoute.includes('requireEventRole');
    const hasRequireNotFrozen = assignRoute.includes('requireNotFrozen');
    const allPresent = hasImport && hasRequireEventRole && hasRequireNotFrozen;
    logTest(
      'Assign route imports and uses auth guards + frozen check',
      allPresent,
      allPresent
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasRequireEventRole ? 'requireEventRole' : ''} ${!hasRequireNotFrozen ? 'requireNotFrozen' : ''}`
    );
  } catch (error: any) {
    logTest('Assign route imports and uses auth guards + frozen check', false, error.message);
  }

  // Test 3.4: Verify coordinator items route has frozen validation
  try {
    const coordItemsRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/c/[token]/items/route.ts'),
      'utf8'
    );
    const hasImport = coordItemsRoute.includes("from '@/lib/auth/guards'");
    const hasCheck = coordItemsRoute.includes('requireNotFrozen');
    const hasSecurityComment = coordItemsRoute.includes('SECURITY');
    logTest(
      'Coordinator items route has frozen validation',
      hasImport && hasCheck && hasSecurityComment,
      hasImport && hasCheck && hasSecurityComment
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasCheck ? 'frozen check' : ''} ${!hasSecurityComment ? 'security comment' : ''}`
    );
  } catch (error: any) {
    logTest('Coordinator items route has frozen validation', false, error.message);
  }

  // Test 3.5: Verify coordinator item edit route has frozen validation
  try {
    const coordItemRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/c/[token]/items/[itemId]/route.ts'),
      'utf8'
    );
    const hasImport = coordItemRoute.includes("from '@/lib/auth/guards'");
    const hasCheck = coordItemRoute.includes('requireNotFrozen');
    const hasPatchFrozen = coordItemRoute.includes('// SECURITY: Block mutations when FROZEN');
    const hasDeleteFrozen =
      coordItemRoute.split('// SECURITY: Block mutations when FROZEN').length > 2; // Should appear twice
    logTest(
      'Coordinator item edit/delete routes have frozen validation',
      hasImport && hasCheck && hasPatchFrozen && hasDeleteFrozen,
      hasImport && hasCheck && hasPatchFrozen && hasDeleteFrozen
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasCheck ? 'frozen check' : ''} ${!hasPatchFrozen || !hasDeleteFrozen ? 'both PATCH and DELETE checks' : ''}`
    );
  } catch (error: any) {
    logTest(
      'Coordinator item edit/delete routes have frozen validation',
      false,
      error.message
    );
  }

  // Test 3.6: Verify coordinator assign route has frozen validation
  try {
    const coordAssignRoute = fs.readFileSync(
      path.join(__dirname, '../src/app/api/c/[token]/items/[itemId]/assign/route.ts'),
      'utf8'
    );
    const hasImport = coordAssignRoute.includes("from '@/lib/auth/guards'");
    const hasCheck = coordAssignRoute.includes('requireNotFrozen');
    const hasPostFrozen =
      coordAssignRoute.includes('// SECURITY: Block mutations when FROZEN');
    const hasDeleteFrozen =
      coordAssignRoute.split('// SECURITY: Block mutations when FROZEN').length > 2; // Should appear twice
    logTest(
      'Coordinator assign/unassign routes have frozen validation',
      hasImport && hasCheck && hasPostFrozen && hasDeleteFrozen,
      hasImport && hasCheck && hasPostFrozen && hasDeleteFrozen
        ? undefined
        : `Missing: ${!hasImport ? 'import' : ''} ${!hasCheck ? 'frozen check' : ''} ${!hasPostFrozen || !hasDeleteFrozen ? 'both POST and DELETE checks' : ''}`
    );
  } catch (error: any) {
    logTest('Coordinator assign/unassign routes have frozen validation', false, error.message);
  }
}

async function main() {
  console.log(`${BOLD}${YELLOW}=== Security Validation Test Suite ===${RESET}\n`);
  console.log('Testing two critical security fixes:');
  console.log('1. Authentication required on /api/events/[id]/* routes');
  console.log('2. Server-side frozen state validation on coordinator routes\n');

  try {
    await testSuite1_AuthGuards();
    await testSuite2_DatabaseIntegrity();
    await testSuite3_RouteProtection();

    // Summary
    console.log(`\n${BOLD}${YELLOW}=== Test Summary ===${RESET}`);
    console.log(`Total tests: ${testsRun}`);
    console.log(`${GREEN}Passed: ${testsPassed}${RESET}`);
    console.log(`${RED}Failed: ${testsFailed}${RESET}`);

    if (testsFailed === 0) {
      console.log(`\n${GREEN}${BOLD}✓ All security tests passed!${RESET}`);
      process.exit(0);
    } else {
      console.log(`\n${RED}${BOLD}✗ Some security tests failed${RESET}`);
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`\n${RED}${BOLD}Fatal error:${RESET}`, error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
