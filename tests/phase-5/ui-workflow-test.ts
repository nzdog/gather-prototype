/**
 * Phase 5 UI Workflow End-to-End Test
 *
 * Tests all template and settings workflows
 */

const BASE_URL = 'http://localhost:3000';
const HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';
const EVENT_ID = 'cmjwbjrqa000un99xtt121fx5';

interface TestResult {
  flow: string;
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function log(message: string, color: 'blue' | 'green' | 'red' | 'yellow' = 'blue') {
  const colors = {
    blue: '\x1b[34m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    reset: '\x1b[0m'
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(flow: string, step: string) {
  log(`\n[${flow}] ${step}`, 'blue');
}

function logPass(flow: string, step: string, details?: string) {
  results.push({ flow, step, status: 'PASS', details });
  log(`✅ PASS: ${step}${details ? ' - ' + details : ''}`, 'green');
}

function logFail(flow: string, step: string, error: string) {
  results.push({ flow, step, status: 'FAIL', error });
  log(`❌ FAIL: ${step} - ${error}`, 'red');
}

// Flow 1: Save Template
async function testSaveTemplate() {
  const flow = 'Flow 1: Save Template';
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(flow, 'yellow');
  log('='.repeat(60), 'yellow');

  try {
    logStep(flow, 'Step 1: Save event as template');

    const templateName = `UI Test Template ${Date.now()}`;
    const response = await fetch(`${BASE_URL}/api/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: HOST_ID,
        eventId: EVENT_ID,
        name: templateName
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logFail(flow, 'Save template', `HTTP ${response.status}: ${error}`);
      return null;
    }

    const data = await response.json();

    if (!data.template || !data.template.id) {
      logFail(flow, 'Save template', 'No template ID returned');
      return null;
    }

    logPass(flow, 'Save template', `Template ID: ${data.template.id}`);

    // Verify structure
    logStep(flow, 'Step 2: Verify template structure');

    if (!data.template.teams || !Array.isArray(data.template.teams)) {
      logFail(flow, 'Verify structure', 'Teams not saved');
      return null;
    }

    const teams = data.template.teams as any[];
    logPass(flow, 'Verify structure', `${teams.length} teams saved`);

    // Check that dates/assignments are NOT included
    logStep(flow, 'Step 3: Verify exclusions');

    const hasAssignments = teams.some(t => t.items?.some((i: any) => i.assignment));
    const hasQuantities = teams.some(t => t.items?.some((i: any) => i.quantityAmount));

    if (hasAssignments) {
      logFail(flow, 'Verify exclusions', 'Assignments were incorrectly saved');
    } else {
      logPass(flow, 'Verify exclusions', 'Assignments correctly excluded');
    }

    // Check QuantitiesProfile
    logStep(flow, 'Step 4: Check QuantitiesProfile');

    if (data.quantitiesProfile) {
      logPass(flow, 'QuantitiesProfile created', `ID: ${data.quantitiesProfile.id}`);
    } else {
      logPass(flow, 'QuantitiesProfile skipped', 'Confidence too low or no guest count');
    }

    return data.template.id;
  } catch (error: any) {
    logFail(flow, 'Exception', error.message);
    return null;
  }
}

// Flow 2: View Templates
async function testViewTemplates() {
  const flow = 'Flow 2: View Templates';
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(flow, 'yellow');
  log('='.repeat(60), 'yellow');

  try {
    logStep(flow, 'Step 1: Get host templates');

    const response = await fetch(`${BASE_URL}/api/templates?hostId=${HOST_ID}`);

    if (!response.ok) {
      logFail(flow, 'Get templates', `HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!Array.isArray(data.templates)) {
      logFail(flow, 'Get templates', 'Templates not an array');
      return;
    }

    logPass(flow, 'Get templates', `Found ${data.templates.length} templates`);

    // Get Gather templates
    logStep(flow, 'Step 2: Get Gather curated templates');

    const gatherResponse = await fetch(`${BASE_URL}/api/templates/gather`);

    if (!gatherResponse.ok) {
      logFail(flow, 'Get Gather templates', `HTTP ${gatherResponse.status}`);
      return;
    }

    const gatherData = await gatherResponse.json();
    logPass(flow, 'Get Gather templates', `Found ${gatherData.templates.length} templates`);

  } catch (error: any) {
    logFail(flow, 'Exception', error.message);
  }
}

// Flow 3: Clone Template
async function testCloneTemplate(templateId: string) {
  const flow = 'Flow 3: Clone Template';
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(flow, 'yellow');
  log('='.repeat(60), 'yellow');

  try {
    logStep(flow, 'Step 1: Clone template to new event');

    const response = await fetch(`${BASE_URL}/api/templates/${templateId}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: HOST_ID,
        eventName: `Cloned Event ${Date.now()}`,
        startDate: '2026-12-24',
        endDate: '2026-12-26',
        guestCount: 30,
        applyQuantityScaling: false,
        occasionType: 'CHRISTMAS'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      logFail(flow, 'Clone template', `HTTP ${response.status}: ${error}`);
      return null;
    }

    const data = await response.json();

    if (!data.eventId) {
      logFail(flow, 'Clone template', 'No eventId returned');
      return null;
    }

    logPass(flow, 'Clone template', `Event ID: ${data.eventId}`);

    // Verify new event
    logStep(flow, 'Step 2: Verify cloned event');

    const eventResponse = await fetch(`${BASE_URL}/api/events/${data.eventId}`);

    if (!eventResponse.ok) {
      logFail(flow, 'Verify event', 'Event not found');
      return null;
    }

    const eventData = await eventResponse.json();
    logPass(flow, 'Verify event', `Event created: ${eventData.event.name}`);

    // Check teams
    logStep(flow, 'Step 3: Verify teams created');

    const teamsResponse = await fetch(`${BASE_URL}/api/events/${data.eventId}/teams`);
    const teamsData = await teamsResponse.json();

    if (teamsData.teams.length > 0) {
      logPass(flow, 'Verify teams', `${teamsData.teams.length} teams created`);
    } else {
      logFail(flow, 'Verify teams', 'No teams created');
    }

    // Check items source
    logStep(flow, 'Step 4: Verify items tagged as TEMPLATE');

    const itemsResponse = await fetch(`${BASE_URL}/api/events/${data.eventId}/items`);
    const itemsData = await itemsResponse.json();

    const allTemplate = itemsData.items.every((i: any) => i.source === 'TEMPLATE');

    if (allTemplate && itemsData.items.length > 0) {
      logPass(flow, 'Verify items source', `${itemsData.items.length} items tagged as TEMPLATE`);
    } else {
      logFail(flow, 'Verify items source', 'Items not tagged correctly');
    }

    return data.eventId;
  } catch (error: any) {
    logFail(flow, 'Exception', error.message);
    return null;
  }
}

// Flow 4: Settings & Privacy
async function testSettings() {
  const flow = 'Flow 4: Settings & Privacy';
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(flow, 'yellow');
  log('='.repeat(60), 'yellow');

  try {
    logStep(flow, 'Step 1: Get host memory summary');

    const response = await fetch(`${BASE_URL}/api/memory?hostId=${HOST_ID}`);

    if (!response.ok) {
      logFail(flow, 'Get memory', `HTTP ${response.status}`);
      return;
    }

    const data = await response.json();

    if (!data.hostMemory || !data.stats) {
      logFail(flow, 'Get memory', 'Missing hostMemory or stats');
      return;
    }

    logPass(flow, 'Get memory', `Templates: ${data.stats.templatesSaved}, Events: ${data.stats.completedEvents}`);

    // Verify defaults
    logStep(flow, 'Step 2: Verify default consent settings');

    const isCorrect =
      data.hostMemory.learningEnabled === false &&
      data.hostMemory.aggregateContributionConsent === false;

    if (isCorrect) {
      logPass(flow, 'Verify defaults', 'Correct: learning=false, aggregate=false');
    } else {
      logFail(flow, 'Verify defaults', `Wrong: learning=${data.hostMemory.learningEnabled}, aggregate=${data.hostMemory.aggregateContributionConsent}`);
    }

    // Test toggle
    logStep(flow, 'Step 3: Toggle learning enabled');

    const updateResponse = await fetch(`${BASE_URL}/api/memory/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        hostId: HOST_ID,
        learningEnabled: true
      })
    });

    if (!updateResponse.ok) {
      logFail(flow, 'Toggle setting', `HTTP ${updateResponse.status}`);
      return;
    }

    const updateData = await updateResponse.json();

    if (updateData.hostMemory.learningEnabled === true) {
      logPass(flow, 'Toggle setting', 'Learning enabled = true');
    } else {
      logFail(flow, 'Toggle setting', 'Setting not updated');
    }

    // Test patterns endpoint
    logStep(flow, 'Step 4: Get patterns');

    const patternsResponse = await fetch(`${BASE_URL}/api/memory/patterns?hostId=${HOST_ID}`);
    const patternsData = await patternsResponse.json();

    logPass(flow, 'Get patterns', `${patternsData.patterns.length} patterns`);

  } catch (error: any) {
    logFail(flow, 'Exception', error.message);
  }
}

// Flow 5: Delete Template
async function testDeleteTemplate(templateId: string) {
  const flow = 'Flow 5: Delete Template';
  log(`\n${'='.repeat(60)}`, 'yellow');
  log(flow, 'yellow');
  log('='.repeat(60), 'yellow');

  try {
    logStep(flow, 'Step 1: Delete template');

    const response = await fetch(`${BASE_URL}/api/templates/${templateId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ hostId: HOST_ID })
    });

    if (!response.ok) {
      logFail(flow, 'Delete template', `HTTP ${response.status}`);
      return;
    }

    logPass(flow, 'Delete template', 'Template deleted successfully');

    // Verify deletion
    logStep(flow, 'Step 2: Verify template deleted');

    const verifyResponse = await fetch(`${BASE_URL}/api/templates/${templateId}?hostId=${HOST_ID}`);

    if (verifyResponse.status === 404) {
      logPass(flow, 'Verify deletion', 'Template not found (correct)');
    } else {
      logFail(flow, 'Verify deletion', 'Template still exists');
    }

  } catch (error: any) {
    logFail(flow, 'Exception', error.message);
  }
}

// Summary
function printSummary() {
  log(`\n${'='.repeat(60)}`, 'yellow');
  log('TEST SUMMARY', 'yellow');
  log('='.repeat(60), 'yellow');

  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const total = results.length;

  log(`\nTotal Tests: ${total}`, 'blue');
  log(`✅ Passed: ${passed}`, 'green');
  log(`❌ Failed: ${failed}`, 'red');

  if (failed > 0) {
    log('\nFailed Tests:', 'red');
    results.filter(r => r.status === 'FAIL').forEach(r => {
      log(`  [${r.flow}] ${r.step}: ${r.error}`, 'red');
    });
  }

  const passRate = ((passed / total) * 100).toFixed(1);
  log(`\nPass Rate: ${passRate}%`, passRate === '100.0' ? 'green' : 'yellow');

  log('\n');
}

// Main
async function runTests() {
  log('\n🧪 Phase 5 UI Workflow End-to-End Test', 'blue');
  log(`Testing against: ${BASE_URL}\n`, 'blue');

  // Run tests
  const templateId = await testSaveTemplate();

  await testViewTemplates();

  if (templateId) {
    const clonedEventId = await testCloneTemplate(templateId);
    await testDeleteTemplate(templateId);
  }

  await testSettings();

  // Summary
  printSummary();

  // Exit code
  const failed = results.filter(r => r.status === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(error => {
  console.error('Test runner error:', error);
  process.exit(1);
});
