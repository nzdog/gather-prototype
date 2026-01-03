/**
 * Phase 5: Templates & Memory - Manual Test Runner
 *
 * This script tests the Phase 5 endpoints by making HTTP requests.
 * Run with: tsx tests/phase-5/manual-test-runner.ts
 *
 * Prerequisites:
 * 1. Server running on http://localhost:3000
 * 2. Database seeded with test data
 * 3. At least one completed event exists
 */

const BASE_URL = 'http://localhost:3000';

// Test configuration - ACTUAL IDs from database
const TEST_CONFIG = {
  hostId: 'cmjwbjrpw0000n99xs11r44qh',
  eventId: 'cmjwbjrqa000un99xtt121fx5',
  templateName: 'Test Template ' + new Date().toISOString()
} as any;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function logSuccess(test: string) {
  results.push({ name: test, passed: true });
  console.log(`✅ ${test}`);
}

function logFailure(test: string, error: string) {
  results.push({ name: test, passed: false, error });
  console.error(`❌ ${test}: ${error}`);
}

async function runTest(name: string, testFn: () => Promise<void>) {
  log(`Running: ${name}`);
  try {
    await testFn();
    logSuccess(name);
  } catch (error: any) {
    logFailure(name, error.message);
  }
}

// Test 1: Get templates (should be empty initially)
async function testGetTemplates() {
  const response = await fetch(`${BASE_URL}/api/templates?hostId=${TEST_CONFIG.hostId}`);
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!Array.isArray(data.templates)) {
    throw new Error('Expected templates to be an array');
  }
}

// Test 2: Create template from event
async function testCreateTemplate() {
  const response = await fetch(`${BASE_URL}/api/templates`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: TEST_CONFIG.hostId,
      eventId: TEST_CONFIG.eventId,
      name: TEST_CONFIG.templateName
    })
  });

  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(data)}`);
  }

  if (!data.template || !data.template.id) {
    throw new Error('Template was not created');
  }

  // Store template ID for later tests
  TEST_CONFIG.templateId = data.template.id;
}

// Test 3: Get Gather curated templates
async function testGetGatherTemplates() {
  const response = await fetch(`${BASE_URL}/api/templates/gather`);
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!Array.isArray(data.templates)) {
    throw new Error('Expected templates to be an array');
  }
}

// Test 4: Get template by ID
async function testGetTemplateById() {
  if (!TEST_CONFIG.templateId) {
    throw new Error('No template ID available - create template first');
  }

  const response = await fetch(
    `${BASE_URL}/api/templates/${TEST_CONFIG.templateId}?hostId=${TEST_CONFIG.hostId}`
  );
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!data.template) {
    throw new Error('Template not found');
  }
}

// Test 5: Clone template
async function testCloneTemplate() {
  if (!TEST_CONFIG.templateId) {
    throw new Error('No template ID available - create template first');
  }

  const response = await fetch(`${BASE_URL}/api/templates/${TEST_CONFIG.templateId}/clone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: TEST_CONFIG.hostId,
      eventName: 'Test Cloned Event',
      startDate: new Date('2026-12-24').toISOString(),
      endDate: new Date('2026-12-26').toISOString(),
      guestCount: 30,
      applyQuantityScaling: false,
      occasionType: 'CHRISTMAS'
    })
  });

  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}: ${JSON.stringify(data)}`);
  }

  if (!data.eventId) {
    throw new Error('Event was not created from template');
  }

  TEST_CONFIG.clonedEventId = data.eventId;
}

// Test 6: Get host memory
async function testGetHostMemory() {
  const response = await fetch(`${BASE_URL}/api/memory?hostId=${TEST_CONFIG.hostId}`);
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!data.hostMemory) {
    throw new Error('Host memory not found');
  }

  if (data.hostMemory.learningEnabled !== false) {
    throw new Error('Default learningEnabled should be false');
  }

  if (data.hostMemory.aggregateContributionConsent !== false) {
    throw new Error('Default aggregateContributionConsent should be false');
  }
}

// Test 7: Get patterns
async function testGetPatterns() {
  const response = await fetch(`${BASE_URL}/api/memory/patterns?hostId=${TEST_CONFIG.hostId}`);
  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!Array.isArray(data.patterns)) {
    throw new Error('Expected patterns to be an array');
  }
}

// Test 8: Update memory settings
async function testUpdateMemorySettings() {
  const response = await fetch(`${BASE_URL}/api/memory/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      hostId: TEST_CONFIG.hostId,
      learningEnabled: true,
      aggregateContributionConsent: false
    })
  });

  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }

  if (!data.hostMemory || data.hostMemory.learningEnabled !== true) {
    throw new Error('Settings were not updated correctly');
  }
}

// Test 9: Delete template
async function testDeleteTemplate() {
  if (!TEST_CONFIG.templateId) {
    throw new Error('No template ID available - create template first');
  }

  const response = await fetch(`${BASE_URL}/api/templates/${TEST_CONFIG.templateId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hostId: TEST_CONFIG.hostId })
  });

  const data = await response.json();

  if (response.status !== 200) {
    throw new Error(`Expected 200, got ${response.status}`);
  }
}

// Main test runner
async function runAllTests() {
  console.log('\n='.repeat(60));
  console.log('Phase 5: Templates & Memory - Manual Test Runner');
  console.log('='.repeat(60));
  console.log('');

  log('Starting test suite...');
  log(`Testing against: ${BASE_URL}`);
  log(`Host ID: ${TEST_CONFIG.hostId}`);
  log(`Event ID: ${TEST_CONFIG.eventId}`);
  log('');

  // Template Tests
  console.log('\n📋 Template Endpoint Tests\n');
  await runTest('Test 1: Get templates (initial)', testGetTemplates);
  await runTest('Test 2: Create template from event', testCreateTemplate);
  await runTest('Test 3: Get Gather curated templates', testGetGatherTemplates);
  await runTest('Test 4: Get template by ID', testGetTemplateById);
  await runTest('Test 5: Clone template to new event', testCloneTemplate);

  // Host Memory Tests
  console.log('\n🧠 Host Memory Endpoint Tests\n');
  await runTest('Test 6: Get host memory (with defaults)', testGetHostMemory);
  await runTest('Test 7: Get patterns', testGetPatterns);
  await runTest('Test 8: Update memory settings', testUpdateMemorySettings);

  // Cleanup
  console.log('\n🧹 Cleanup Tests\n');
  await runTest('Test 9: Delete template', testDeleteTemplate);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('Test Summary');
  console.log('='.repeat(60));

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nTotal Tests: ${results.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed Tests:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.error}`);
    });
  }

  console.log('');

  process.exit(failed > 0 ? 1 : 0);
}

// Add type to TEST_CONFIG
declare module './manual-test-runner' {
  interface TestConfig {
    hostId: string;
    eventId: string;
    templateName: string;
    templateId?: string;
    clonedEventId?: string;
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error('Test runner error:', error);
  process.exit(1);
});
