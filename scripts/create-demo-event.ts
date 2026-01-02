#!/usr/bin/env tsx
/**
 * Create a demo event with AI features to showcase in UI
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function createDemoEvent() {
  console.log('🎄 Creating demo event with AI features...\n');

  try {
    // Get or create host
    let host = await prisma.person.findFirst({
      where: { name: 'Jacqui & Ian' }
    });

    if (!host) {
      host = await prisma.person.create({
        data: { name: 'Demo Host', email: 'demo@gather.app' }
      });
    }

    // Create event
    const event = await prisma.event.create({
      data: {
        name: 'AI Demo - Christmas Party 2025',
        startDate: new Date('2025-12-24'),
        endDate: new Date('2025-12-26'),
        occasionType: 'CHRISTMAS',
        guestCount: 40,
        guestCountConfidence: 'HIGH',
        dietaryStatus: 'SPECIFIED',
        dietaryVegetarian: 6,
        dietaryGlutenFree: 3,
        venueName: 'Family Home',
        venueType: 'HOME',
        venueKitchenAccess: 'FULL',
        venueOvenCount: 1,
        status: 'DRAFT',
        hostId: host.id,
      },
    });

    console.log(`✓ Event created: ${event.name}`);
    console.log(`  ID: ${event.id}`);
    console.log(`  Occasion: ${event.occasionType}`);
    console.log(`  Guests: ${event.guestCount} (${event.dietaryVegetarian} vegetarian, ${event.dietaryGlutenFree} GF)`);
    console.log('');

    // Create teams
    const mainsTeam = await prisma.team.create({
      data: {
        name: 'Main Dishes',
        scope: 'Main protein dishes',
        domain: 'PROTEINS',
        eventId: event.id,
        coordinatorId: host.id,
      },
    });

    const sidesTeam = await prisma.team.create({
      data: {
        name: 'Sides & Salads',
        scope: 'Side dishes and salads',
        domain: 'SIDES',
        eventId: event.id,
        coordinatorId: host.id,
      },
    });

    console.log(`✓ Created 2 teams`);
    console.log('');

    // Create items with issues that will trigger conflicts
    await prisma.item.create({
      data: {
        name: 'Roast Turkey',
        teamId: mainsTeam.id,
        critical: true,
        quantityState: 'PLACEHOLDER',
        quantityText: 'TBD based on final guest count',
        placeholderAcknowledged: false,
      },
    });

    await prisma.item.create({
      data: {
        name: 'Glazed Ham',
        teamId: mainsTeam.id,
        critical: true,
        quantityState: 'PLACEHOLDER',
        quantityText: 'Enough for all guests',
        placeholderAcknowledged: false,
      },
    });

    await prisma.item.create({
      data: {
        name: 'Green Salad',
        teamId: sidesTeam.id,
        critical: false,
        quantityAmount: 3,
        quantityUnit: 'SERVINGS',
        quantityState: 'SPECIFIED',
      },
    });

    console.log(`✓ Created 3 items`);
    console.log('  - 2 critical items with placeholder quantities');
    console.log('  - 1 regular item');
    console.log('');

    // Run AI check to detect conflicts
    console.log('🤖 Running AI conflict detection...\n');

    const checkResponse = await fetch(`http://localhost:3000/api/events/${event.id}/check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (checkResponse.ok) {
      const checkData = await checkResponse.json();
      console.log(`✓ AI check complete: ${checkData.conflicts} conflict(s) detected`);
      console.log('');
    }

    // Get conflicts to show what was detected
    const conflictsResponse = await fetch(`http://localhost:3000/api/events/${event.id}/conflicts`);
    if (conflictsResponse.ok) {
      const conflictsData = await conflictsResponse.json();

      console.log('📋 Detected Conflicts:\n');
      conflictsData.conflicts.forEach((conflict: any, index: number) => {
        console.log(`${index + 1}. ${conflict.title}`);
        console.log(`   Type: ${conflict.type}`);
        console.log(`   Severity: ${conflict.severity}`);
        console.log(`   ${conflict.description}`);
        console.log('');
      });
    }

    console.log('✅ Demo event ready!\n');
    console.log('🌐 Open in browser:');
    console.log(`   http://localhost:3000/plan/${event.id}`);
    console.log('');
    console.log('💡 You will see:');
    console.log('   - Event details with dietary requirements');
    console.log('   - Items & Quantities section');
    console.log('   - Conflicts detected by AI');
    console.log('   - Suggestions to fix issues');
    console.log('   - Gate check preventing transition');
    console.log('');

  } catch (error) {
    console.error('❌ Error creating demo event:', error);
  } finally {
    await prisma.$disconnect();
  }
}

createDemoEvent();
