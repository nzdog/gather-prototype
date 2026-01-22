/**
 * Test Add Team and Add Item functionality
 */

const BASE_URL = 'http://localhost:3000';
const EVENT_ID = 'cmjwbjrqa000un99xtt121fx5';
const HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

async function testAddTeam() {
  console.log('\n📋 Testing Add Team...\n');

  try {
    const response = await fetch(`${BASE_URL}/api/events/${EVENT_ID}/teams`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Beverages Team',
        scope:
          'Responsible for all drinks including hot beverages, soft drinks, and alcoholic options',
        domain: 'DRINKS',
        coordinatorId: HOST_ID,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to add team: ${response.status} - ${error}`);
      return null;
    }

    const data = await response.json();
    console.log('✅ Team added successfully!');
    console.log(`   Team ID: ${data.team.id}`);
    console.log(`   Name: ${data.team.name}`);
    console.log(`   Domain: ${data.team.domain}`);

    return data.team.id;
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

async function testAddItem(teamId: string) {
  console.log('\n🍽️  Testing Add Item...\n');

  try {
    const response = await fetch(`${BASE_URL}/api/events/${EVENT_ID}/teams/${teamId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Coffee and Tea Station',
        description: 'Hot beverages with milk, sugar, and alternatives',
        quantityAmount: 50,
        quantityUnit: 'SERVINGS',
        critical: true,
        dietaryTags: ['vegetarian', 'vegan'],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error(`❌ Failed to add item: ${response.status} - ${error}`);
      return null;
    }

    const data = await response.json();
    console.log('✅ Item added successfully!');
    console.log(`   Item ID: ${data.item.id}`);
    console.log(`   Name: ${data.item.name}`);
    console.log(`   Quantity: ${data.item.quantityAmount} ${data.item.quantityUnit}`);
    console.log(`   Critical: ${data.item.critical}`);
    console.log(`   Source: ${data.item.source}`);

    return data.item.id;
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return null;
  }
}

async function verifyTeam(teamId: string) {
  console.log('\n🔍 Verifying team in event...\n');

  try {
    const response = await fetch(`${BASE_URL}/api/events/${EVENT_ID}/teams`);
    const data = await response.json();

    const team = data.teams.find((t: any) => t.id === teamId);

    if (team) {
      console.log('✅ Team found in event teams list!');
      console.log(`   Name: ${team.name}`);
      console.log(`   Items: ${team._count.items}`);
      return true;
    } else {
      console.error('❌ Team not found in event teams list');
      return false;
    }
  } catch (error: any) {
    console.error(`❌ Error: ${error.message}`);
    return false;
  }
}

async function runTests() {
  console.log('🧪 Testing Add Team & Add Item Functionality');
  console.log('='.repeat(50));

  // Test 1: Add Team
  const teamId = await testAddTeam();

  if (!teamId) {
    console.error('\n❌ Cannot continue without team ID');
    process.exit(1);
  }

  // Test 2: Add Item to Team
  const itemId = await testAddItem(teamId);

  if (!itemId) {
    console.error('\n❌ Item creation failed');
    process.exit(1);
  }

  // Test 3: Verify Team
  const verified = await verifyTeam(teamId);

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log('='.repeat(50));

  if (teamId && itemId && verified) {
    console.log('\n✅ All tests passed!');
    console.log(`   Team ID: ${teamId}`);
    console.log(`   Item ID: ${itemId}`);
    console.log('\n🎉 Add Team and Add Item functionality is working!\n');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed');
    process.exit(1);
  }
}

runTests();
