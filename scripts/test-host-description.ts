#!/usr/bin/env tsx
/**
 * Test script for host description feature
 * Tests generating a plan with host description
 */

import { generatePlan } from '../src/lib/ai/generate';

async function testHostDescription() {
  console.log('🧪 Testing plan generation with host description\n');

  const params = {
    occasion: 'BBQ',
    guests: 30,
    dietary: {
      vegetarian: 3,
      glutenFree: 2,
      dairyFree: 0,
      nutFree: 0,
    },
    venue: {
      name: 'Backyard',
      ovenCount: 1,
      bbqAvailable: true,
    },
    days: 1,
  };

  const hostDescription = 'Casual summer BBQ, families and couples, outdoor by the pool';

  console.log('Event Parameters:');
  console.log(JSON.stringify(params, null, 2));
  console.log('\nHost Description:', hostDescription);
  console.log('\n🤖 Generating plan with AI...\n');

  try {
    const result = await generatePlan(params, hostDescription);

    console.log('✅ Plan generated successfully!\n');
    console.log(`Teams: ${result.teams.length}`);
    console.log(`Items: ${result.items.length}`);
    console.log(`Critical items: ${result.items.filter((i) => i.critical).length}\n`);

    console.log('Teams:');
    result.teams.forEach((team) => {
      console.log(`  - ${team.name} (${team.domain})`);
    });

    console.log('\nItems by team:');
    result.teams.forEach((team) => {
      const teamItems = result.items.filter((item) => item.teamName === team.name);
      console.log(`\n📋 ${team.name} (${teamItems.length} items):`);
      teamItems.forEach((item) => {
        const critical = item.critical ? ' ⚠️ CRITICAL' : '';
        const qty =
          item.quantityAmount && item.quantityUnit
            ? `${item.quantityAmount} ${item.quantityUnit}`
            : 'TBD';
        console.log(`   • ${item.name} - ${qty}${critical}`);
      });
    });

    console.log('\n✨ Test complete!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

testHostDescription();
