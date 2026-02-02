/**
 * Test script: Create event and run Generate Plan
 */
import { PrismaClient } from '@prisma/client';
import { generatePlan, EventParams } from '../src/lib/ai/generate';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🎄 Creating McKorbett Christmas 2025 event...\n');

  // First, create or find a test Person to be the host
  let host = await prisma.person.findFirst({
    where: { email: 'test@example.com' },
  });

  if (!host) {
    host = await prisma.person.create({
      data: {
        email: 'test@example.com',
        name: 'Test Host',
        phone: '+1234567890',
      },
    });
    console.log('✅ Created test host person');
  } else {
    console.log('✅ Found existing test host person');
  }

  // Delete existing event with same name (for clean test)
  await prisma.event.deleteMany({
    where: { name: 'McKorbett Christmas 2025' },
  });

  // Create the event
  const event = await prisma.event.create({
    data: {
      name: 'McKorbett Christmas 2025',
      startDate: new Date('2025-12-25'),
      endDate: new Date('2025-12-25'),
      hostId: host.id,
      occasionType: 'CHRISTMAS',
      guestCount: 30,
      dietaryVegetarian: 5,
      dietaryGlutenFree: 3,
      dietaryDairyFree: 0,
      dietaryAllergies: null,
      venueName: 'Home',
      venueOvenCount: 2,
      venueBbqAvailable: true,
      days: {
        create: [
          {
            date: new Date('2025-12-25'),
            name: 'Christmas Day',
          },
        ],
      },
    },
    include: {
      days: true,
    },
  });

  console.log(`✅ Event created: ${event.name} (ID: ${event.id})\n`);
  console.log('Event details:');
  console.log(`  - Occasion: ${event.occasionType}`);
  console.log(`  - Guests: ${event.guestCount}`);
  console.log(`  - Vegetarian: ${event.dietaryVegetarian}`);
  console.log(`  - Gluten-Free: ${event.dietaryGlutenFree}`);
  console.log(`  - Venue: ${event.venueName}`);
  console.log(`  - Ovens: ${event.venueOvenCount}`);
  console.log(`  - BBQ: ${event.venueBbqAvailable}`);
  console.log(`  - Days: ${event.days.length}\n`);

  // Now call the Generate Plan function directly
  console.log('🤖 Generating plan with AI...\n');

  // Build event parameters for AI
  const eventParams: EventParams = {
    occasion: event.occasionType || 'gathering',
    guests: event.guestCount || 10,
    dietary: {
      vegetarian: event.dietaryVegetarian || 0,
      glutenFree: event.dietaryGlutenFree || 0,
      dairyFree: event.dietaryDairyFree || 0,
      nutFree: 0,
      other: event.dietaryAllergies || undefined,
    },
    venue: {
      name: event.venueName || 'Unknown venue',
      ovenCount: event.venueOvenCount || undefined,
      bbqAvailable: event.venueBbqAvailable || undefined,
      fridgeSpace: undefined,
    },
    days: event.days.length || 1,
  };

  // Generate plan using Claude AI
  const aiResponse = await generatePlan(eventParams);

  console.log('✅ AI generation completed!');
  console.log(`   Teams: ${aiResponse.teams.length}`);
  console.log(`   Items: ${aiResponse.items.length}\n`);

  // Create teams and items in database (mimicking the API route logic)
  const generatedBatchId = randomBytes(8).toString('hex');
  let teamsCreated = 0;
  let itemsCreated = 0;

  console.log('💾 Writing to database...\n');

  for (const teamData of aiResponse.teams) {
    // Create team
    const team = await prisma.team.create({
      data: {
        name: teamData.name,
        scope: teamData.scope,
        domain: teamData.domain as any,
        eventId: event.id,
        coordinatorId: event.hostId,
        source: 'GENERATED',
      },
    });
    teamsCreated++;

    // Create items for this team
    const teamItems = aiResponse.items.filter((item) => item.teamName === teamData.name);

    for (const itemData of teamItems) {
      const quantityState =
        itemData.quantityAmount === null || itemData.quantityUnit === null
          ? 'PLACEHOLDER'
          : 'SPECIFIED';

      const quantityText =
        itemData.quantityAmount && itemData.quantityUnit
          ? `${itemData.quantityAmount} ${itemData.quantityUnit}`
          : null;

      await prisma.item.create({
        data: {
          name: itemData.name,
          teamId: team.id,
          quantityAmount: itemData.quantityAmount,
          quantityUnit: itemData.quantityUnit as any,
          quantityState: quantityState,
          quantityText: quantityText,
          quantityLabel: itemData.quantityLabel,
          notes: itemData.quantityReasoning,
          critical: itemData.critical,
          criticalReason: itemData.criticalReason,
          vegetarian: itemData.dietaryTags.includes('VEGETARIAN'),
          glutenFree: itemData.dietaryTags.includes('GLUTEN_FREE'),
          dairyFree: itemData.dietaryTags.includes('DAIRY_FREE'),
          source: 'GENERATED',
          generatedBatchId,
          aiGenerated: true,
          userConfirmed: false,
        },
      });
      itemsCreated++;
    }
  }

  console.log('✅ Database write completed!');
  console.log(`   Teams created: ${teamsCreated}`);
  console.log(`   Items created: ${itemsCreated}\n`);

  // Fetch the generated data from database
  console.log('📊 RAW DATABASE DATA:\n');
  console.log('='.repeat(80));

  const teams = await prisma.team.findMany({
    where: { eventId: event.id },
    include: {
      items: {
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });

  for (const team of teams) {
    console.log(`\n🏷️  TEAM: ${team.name}`);
    console.log(`   Domain: ${team.domain}`);
    console.log(`   Scope: ${team.scope}`);
    console.log(`   Source: ${team.source}`);
    console.log('   Items:');

    for (const item of team.items) {
      console.log(`\n   📦 ${item.name}`);
      console.log(`      quantityAmount: ${item.quantityAmount}`);
      console.log(`      quantityUnit: ${item.quantityUnit}`);
      console.log(`      quantityText: ${item.quantityText}`);
      console.log(`      quantityState: ${item.quantityState}`);
      console.log(`      quantityLabel: ${item.quantityLabel}`);
      console.log(`      critical: ${item.critical}`);
      if (item.critical && item.criticalReason) {
        console.log(`      criticalReason: ${item.criticalReason}`);
      }
      console.log(
        `      notes: ${item.notes?.substring(0, 100)}${item.notes && item.notes.length > 100 ? '...' : ''}`
      );
      const dietary = [];
      if (item.vegetarian) dietary.push('VEGETARIAN');
      if (item.glutenFree) dietary.push('GLUTEN_FREE');
      if (item.dairyFree) dietary.push('DAIRY_FREE');
      if (dietary.length > 0) {
        console.log(`      dietary: ${dietary.join(', ')}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n💻 WHAT USER SEES ON PLAN PAGE:\n');
  console.log('='.repeat(80));

  // Simulate what the UI displays
  for (const team of teams) {
    console.log(`\n📋 ${team.name.toUpperCase()}`);
    console.log(`   ${team.scope}`);
    console.log('   Items:');

    for (const item of team.items) {
      // This mimics how the UI formats the quantity display
      let displayText = `• ${item.name}`;

      if (item.quantityText) {
        displayText += ` - ${item.quantityText}`;
      } else if (item.quantityAmount && item.quantityUnit) {
        displayText += ` - ${item.quantityAmount} ${item.quantityUnit}`;
      } else {
        displayText += ' - TBD';
      }

      if (item.critical) {
        displayText += ' ⚠️ CRITICAL';
      }

      console.log(`   ${displayText}`);

      // Show quantity label indicator
      if (item.quantityLabel === 'CALCULATED') {
        console.log(`     └─ ✓ Calculated quantity`);
      } else if (item.quantityLabel === 'HEURISTIC') {
        console.log(`     └─ ~ Estimated (rule of thumb)`);
      } else if (item.quantityLabel === 'PLACEHOLDER') {
        console.log(`     └─ ? Needs confirmation`);
      }

      const dietary = [];
      if (item.vegetarian) dietary.push('🌱 Vegetarian');
      if (item.glutenFree) dietary.push('🌾 Gluten-Free');
      if (item.dairyFree) dietary.push('🥛 Dairy-Free');
      if (dietary.length > 0) {
        console.log(`     └─ ${dietary.join(' • ')}`);
      }
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('\n✨ Test complete!\n');
  console.log(`Event ID: ${event.id}`);
  console.log(`View at: http://localhost:3000/plan/${event.id}\n`);
}

main()
  .catch((e) => {
    console.error('❌ Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
