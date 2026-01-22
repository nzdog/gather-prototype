/**
 * Phase 5: Plan Editor CRUD Test
 * Tests full CRUD workflow for teams and items in the plan editor
 *
 * Uses existing event from database - run get-test-ids.ts first
 */

interface TestResult {
  testName: string;
  passed: boolean;
  message: string;
}

const results: TestResult[] = [];

// Use existing event from database
const EVENT_ID = 'cmjwbjrqa000un99xtt121fx5';
const HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

async function runTests() {
  console.log('\n🧪 Starting Plan Editor CRUD Tests...\n');
  console.log(`Using Event ID: ${EVENT_ID}`);
  console.log(`Using Host ID: ${HOST_ID}\n`);

  let teamId: string;
  let itemId: string;

  // Test 1: Add Team (POST /api/events/[id]/teams)
  try {
    const response = await fetch(`http://localhost:3000/api/events/${EVENT_ID}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test Proteins Team',
        scope: 'Provide all protein dishes for the event',
        domain: 'PROTEINS',
        coordinatorId: HOST_ID,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create team: ${response.status} - ${error}`);
    }

    const data = await response.json();
    teamId = data.team.id;

    results.push({
      testName: 'Add Team',
      passed: !!data.team.id && data.team.name === 'Test Proteins Team',
      message: `Created team: ${data.team.name}`,
    });
  } catch (error: any) {
    results.push({
      testName: 'Add Team',
      passed: false,
      message: error.message,
    });
  }

  // Test 2: Add Item to Team (POST /api/events/[id]/teams/[teamId]/items)
  try {
    const response = await fetch(
      `http://localhost:3000/api/events/${EVENT_ID}/teams/${teamId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Grilled Chicken Skewers',
          description: 'Marinated chicken with vegetables',
          quantityAmount: 100,
          quantityUnit: 'SERVINGS',
          critical: true,
          dietaryTags: ['glutenFree'],
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to create item: ${response.status} - ${error}`);
    }

    const data = await response.json();
    itemId = data.item.id;

    results.push({
      testName: 'Add Item',
      passed: !!data.item.id && data.item.name === 'Grilled Chicken Skewers',
      message: `Created item: ${data.item.name}`,
    });
  } catch (error: any) {
    results.push({
      testName: 'Add Item',
      passed: false,
      message: error.message,
    });
  }

  // Test 3: View Items (GET /api/events/[id]/teams/[teamId]/items)
  try {
    const response = await fetch(
      `http://localhost:3000/api/events/${EVENT_ID}/teams/${teamId}/items`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch items: ${response.status}`);
    }

    const data = await response.json();

    results.push({
      testName: 'View Items',
      passed: data.items.length === 1 && data.items[0].name === 'Grilled Chicken Skewers',
      message: `Found ${data.items.length} item(s)`,
    });
  } catch (error: any) {
    results.push({
      testName: 'View Items',
      passed: false,
      message: error.message,
    });
  }

  // Test 4: Edit Item (PATCH /api/events/[id]/items/[itemId])
  try {
    const response = await fetch(`http://localhost:3000/api/events/${EVENT_ID}/items/${itemId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Updated Grilled Chicken Skewers',
        description: 'Marinated chicken with peppers and onions',
        critical: false,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to update item: ${response.status} - ${error}`);
    }

    const data = await response.json();

    results.push({
      testName: 'Edit Item',
      passed: data.item.name === 'Updated Grilled Chicken Skewers' && data.item.critical === false,
      message: `Updated item name and critical status`,
    });
  } catch (error: any) {
    results.push({
      testName: 'Edit Item',
      passed: false,
      message: error.message,
    });
  }

  // Test 5: Add Second Item (for delete team test)
  try {
    const response = await fetch(
      `http://localhost:3000/api/events/${EVENT_ID}/teams/${teamId}/items`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Beef Burgers',
          description: 'Classic beef burgers with toppings',
          quantityAmount: 50,
          quantityUnit: 'SERVINGS',
          critical: false,
          dietaryTags: [],
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to create second item: ${response.status}`);
    }

    results.push({
      testName: 'Add Second Item',
      passed: true,
      message: 'Created second item for delete test',
    });
  } catch (error: any) {
    results.push({
      testName: 'Add Second Item',
      passed: false,
      message: error.message,
    });
  }

  // Test 6: Delete Item (DELETE /api/events/[id]/items/[itemId])
  try {
    const response = await fetch(`http://localhost:3000/api/events/${EVENT_ID}/items/${itemId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete item: ${response.status} - ${error}`);
    }

    const data = await response.json();

    // Verify item was deleted
    const verifyResponse = await fetch(
      `http://localhost:3000/api/events/${EVENT_ID}/teams/${teamId}/items`
    );
    const verifyData = await verifyResponse.json();

    results.push({
      testName: 'Delete Item',
      passed: data.success && verifyData.items.length === 1,
      message: `Deleted item, ${verifyData.items.length} item(s) remaining`,
    });
  } catch (error: any) {
    results.push({
      testName: 'Delete Item',
      passed: false,
      message: error.message,
    });
  }

  // Test 7: Delete Team (DELETE /api/events/[id]/teams/[teamId])
  try {
    const response = await fetch(`http://localhost:3000/api/events/${EVENT_ID}/teams/${teamId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to delete team: ${response.status} - ${error}`);
    }

    const data = await response.json();

    results.push({
      testName: 'Delete Team',
      passed: data.success && data.itemsDeleted === 1,
      message: `Deleted team with ${data.itemsDeleted} item(s)`,
    });
  } catch (error: any) {
    results.push({
      testName: 'Delete Team',
      passed: false,
      message: error.message,
    });
  }

  printResults();
}

function printResults() {
  console.log('\n📊 Test Results:\n');
  console.log('━'.repeat(80));

  results.forEach((result, index) => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} Test ${index + 1}: ${result.testName}`);
    console.log(`   ${result.message}\n`);
  });

  console.log('━'.repeat(80));

  const passedCount = results.filter((r) => r.passed).length;
  const totalCount = results.length;
  const passRate = ((passedCount / totalCount) * 100).toFixed(1);

  console.log(`\n📈 Summary: ${passedCount}/${totalCount} tests passed (${passRate}%)\n`);

  if (passedCount === totalCount) {
    console.log('🎉 All tests passed! Plan Editor CRUD is fully functional.\n');
  } else {
    console.log('⚠️  Some tests failed. Please review the errors above.\n');
  }
}

// Run tests
runTests().catch(console.error);
