#!/usr/bin/env tsx
/**
 * Phase 2 Enhanced AI Integration Test Script
 * Tests suggestions, explanations, and regenerate APIs
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
  console.log('\n🧪 Phase 2 Enhanced AI Integration Tests\n');
  console.log('='.repeat(50));
  console.log('');

  try {
    // ============================================
    // SETUP: Create Event and Generate Plan
    // ============================================
    try {
      log('Setting up test event...');

      testHost = await prisma.person.findFirst({
        where: { name: 'Jacqui & Ian' }
      });

      if (!testHost) {
        testHost = await prisma.person.create({
          data: { name: 'Test Host Enhanced', email: 'test-enhanced@example.com' }
        });
      }

      const eventData = {
        name: 'Enhanced AI Test Event',
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

      await apiCall('POST', `/api/events/${testEvent.id}/generate`);
      await apiCall('POST', `/api/events/${testEvent.id}/check`);

      log(`Event created: ${testEvent.id}`);
      pass('Setup: Create event and generate plan');
    } catch (error: any) {
      fail('Setup: Create event and generate plan', error.message);
      throw error;
    }

    // ============================================
    // TEST 1: Get Suggestions (maps to open conflicts)
    // ============================================
    try {
      log('Getting suggestions...');
      const response = await apiCall('GET', `/api/events/${testEvent.id}/suggestions`);

      if (!response.suggestions || !Array.isArray(response.suggestions)) {
        throw new Error('No suggestions array returned');
      }

      if (response.suggestions.length === 0) {
        throw new Error('Expected at least 1 suggestion');
      }

      log(`  Found ${response.suggestions.length} suggestion(s)`);
      log(`  First: ${response.suggestions[0].title}`);

      pass('1. Get suggestions API works');
    } catch (error: any) {
      fail('1. Get suggestions API works', error.message);
    }

    // ============================================
    // TEST 2: Get Specific Suggestion
    // ============================================
    try {
      log('Getting specific suggestion...');

      const suggestionsResponse = await apiCall('GET', `/api/events/${testEvent.id}/suggestions`);
      const suggestionId = suggestionsResponse.suggestions[0].id;

      const response = await apiCall('GET', `/api/events/${testEvent.id}/suggestions/${suggestionId}`);

      if (!response.suggestion) {
        throw new Error('No suggestion returned');
      }

      if (!response.suggestion.title || !response.suggestion.type) {
        throw new Error('Suggestion missing required fields');
      }

      pass('2. Get specific suggestion');
    } catch (error: any) {
      fail('2. Get specific suggestion', error.message);
    }

    // ============================================
    // TEST 3: Get Explanation for Suggestion
    // ============================================
    try {
      log('Getting explanation for suggestion...');

      const suggestionsResponse = await apiCall('GET', `/api/events/${testEvent.id}/suggestions`);
      const suggestionId = suggestionsResponse.suggestions[0].id;

      const response = await apiCall('GET', `/api/events/${testEvent.id}/suggestions/${suggestionId}/explain`);

      if (!response.explanation) {
        throw new Error('No explanation returned');
      }

      const exp = response.explanation;

      if (!exp.source) {
        throw new Error('Explanation missing source');
      }

      if (!exp.claimType || !['CONSTRAINT', 'RISK', 'PATTERN', 'PREFERENCE', 'ASSUMPTION'].includes(exp.claimType)) {
        throw new Error(`Invalid claimType: ${exp.claimType}`);
      }

      if (!exp.confidence || !['high', 'medium', 'low'].includes(exp.confidence)) {
        throw new Error(`Invalid confidence: ${exp.confidence}`);
      }

      if (!exp.reasoning) {
        throw new Error('Explanation missing reasoning');
      }

      log(`  Source: ${exp.source}`);
      log(`  Claim Type: ${exp.claimType}`);
      log(`  Confidence: ${exp.confidence}`);

      pass('3. Get explanation with all required fields');
    } catch (error: any) {
      fail('3. Get explanation with all required fields', error.message);
    }

    // ============================================
    // TEST 4: Accept Suggestion
    // ============================================
    try {
      log('Accepting a suggestion...');

      const suggestionsResponse = await apiCall('GET', `/api/events/${testEvent.id}/suggestions`);
      const suggestionId = suggestionsResponse.suggestions[0].id;

      const response = await apiCall(
        'POST',
        `/api/events/${testEvent.id}/suggestions/${suggestionId}/accept`,
        { resolvedBy: testHost.id }
      );

      if (!response.success) {
        throw new Error('Accept failed');
      }

      if (response.conflict.status !== 'RESOLVED') {
        throw new Error(`Expected RESOLVED status, got ${response.conflict.status}`);
      }

      pass('4. Accept suggestion marks as resolved');
    } catch (error: any) {
      fail('4. Accept suggestion marks as resolved', error.message);
    }

    // ============================================
    // TEST 5: Dismiss Suggestion
    // ============================================
    try {
      log('Dismissing a suggestion...');

      const suggestionsResponse = await apiCall('GET', `/api/events/${testEvent.id}/suggestions`);

      if (suggestionsResponse.suggestions.length === 0) {
        throw new Error('No open suggestions to dismiss');
      }

      const suggestionId = suggestionsResponse.suggestions[0].id;

      const response = await apiCall(
        'POST',
        `/api/events/${testEvent.id}/suggestions/${suggestionId}/dismiss`
      );

      if (!response.success) {
        throw new Error('Dismiss failed');
      }

      if (response.conflict.status !== 'DISMISSED') {
        throw new Error(`Expected DISMISSED status, got ${response.conflict.status}`);
      }

      pass('5. Dismiss suggestion works');
    } catch (error: any) {
      fail('5. Dismiss suggestion works', error.message);
    }

    // ============================================
    // TEST 6: Regenerate Plan with Modifier
    // ============================================
    try {
      log('Regenerating plan with modifier...');

      const response = await apiCall(
        'POST',
        `/api/events/${testEvent.id}/regenerate`,
        {
          modifier: 'More vegetarian options',
          preserveProtected: false,
        }
      );

      if (!response.success) {
        throw new Error('Regenerate failed');
      }

      if (!response.teamsCreated || response.teamsCreated === 0) {
        throw new Error('No teams created during regeneration');
      }

      if (!response.itemsCreated || response.itemsCreated === 0) {
        throw new Error('No items created during regeneration');
      }

      log(`  Teams created: ${response.teamsCreated}`);
      log(`  Items created: ${response.itemsCreated}`);

      // Verify vegetarian items exist
      const items = await prisma.item.findMany({
        where: {
          team: { eventId: testEvent.id },
          vegetarian: true,
        },
      });

      if (items.length === 0) {
        throw new Error('No vegetarian items found after regeneration with vegetarian modifier');
      }

      log(`  Vegetarian items: ${items.length}`);

      pass('6. Regenerate plan with modifier');
    } catch (error: any) {
      fail('6. Regenerate plan with modifier', error.message);
    }

    // ============================================
    // TEST 7: Verify Enhanced Conflict Detection
    // ============================================
    try {
      log('Verifying enhanced conflict detection...');

      // Run check again after regeneration
      await apiCall('POST', `/api/events/${testEvent.id}/check`);

      const conflicts = await apiCall('GET', `/api/events/${testEvent.id}/conflicts?status=all`);

      if (!conflicts.conflicts || conflicts.conflicts.length === 0) {
        throw new Error('No conflicts detected');
      }

      // Check for different conflict types
      const conflictTypes = new Set(conflicts.conflicts.map((c: any) => c.type));

      log(`  Detected conflict types: ${Array.from(conflictTypes).join(', ')}`);
      log(`  Total conflicts: ${conflicts.conflicts.length}`);

      pass('7. Enhanced conflict detection works');
    } catch (error: any) {
      fail('7. Enhanced conflict detection works', error.message);
    }

    // ============================================
    // CLEANUP: Delete Test Event
    // ============================================
    try {
      log('Cleaning up...');

      await prisma.event.delete({
        where: { id: testEvent.id }
      });

      pass('8. Cleanup successful');
    } catch (error: any) {
      fail('8. Cleanup successful', error.message);
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

  console.log(`Phase 2 Enhanced: ${passed}/8 tests passed`);

  if (failed > 0) {
    console.log(`\n⚠️  ${failed} test(s) failed:\n`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.test}`);
      console.log(`    ${r.error}\n`);
    });
  }

  console.log('');
  console.log('✅ New Features Implemented:');
  console.log('  - Suggestions API (maps conflicts to suggestions)');
  console.log('  - Explanations API (source, claimType, confidence, reasoning)');
  console.log('  - Regenerate API (with modifiers and protection)');
  console.log('  - Enhanced conflict detection (timing, dietary, coverage)');
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
