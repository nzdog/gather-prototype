/**
 * Seed Test Conflicts Script
 *
 * Usage: npx tsx scripts/seed-test-conflicts.ts <eventId>
 *
 * Creates test conflicts for Phase 3 testing:
 * - CRITICAL conflicts (test Acknowledge)
 * - SIGNIFICANT conflicts with canDelegate (test Delegate)
 * - ADVISORY conflicts (test Dismiss)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedTestConflicts(eventId: string) {
  try {
    console.log(`\n🌱 Seeding test conflicts for event: ${eventId}\n`);

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      console.error(`❌ Event not found: ${eventId}`);
      process.exit(1);
    }

    console.log(`✓ Event found: ${event.name}\n`);

    // Clear existing test conflicts (ones with fingerprints starting with 'test-')
    const deleted = await prisma.conflict.deleteMany({
      where: {
        eventId,
        fingerprint: {
          startsWith: 'test-',
        },
      },
    });

    console.log(`🗑️  Cleared ${deleted.count} existing test conflicts\n`);

    // Create CRITICAL conflicts
    console.log('Creating CRITICAL conflicts...');

    const critical1 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-critical-dietary-gap-veg',
        type: 'DIETARY_GAP',
        severity: 'CRITICAL',
        claimType: 'CONSTRAINT',
        resolutionClass: 'DECISION_REQUIRED',
        title: 'No vegetarian main',
        description: '6 vegetarian guests will have no main course option.',
        affectedParties: ['6 vegetarian guests'],
        dietaryType: 'vegetarian',
        guestCount: 6,
        category: 'mains',
        currentCoverage: 0,
        minimumNeeded: 1,
        inputsReferenced: [
          {
            type: 'event',
            field: 'dietaryVegetarian',
            valueAtDetection: 6,
          },
        ],
        suggestion: {
          action: 'add_item',
          reasoning: 'Add a vegetarian main dish to accommodate these guests',
          proposedChanges: [
            {
              type: 'create_item',
              teamName: 'Mains - Vegetarian',
              itemName: 'Vegetarian lasagna',
              dietaryTags: ['vegetarian'],
            },
          ],
        },
        status: 'OPEN',
        canDelegate: false,
        delegateToRoles: [],
      },
    });

    console.log(`  ✓ Created: ${critical1.title}`);

    const critical2 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-critical-dietary-gap-vegan',
        type: 'DIETARY_GAP',
        severity: 'CRITICAL',
        claimType: 'CONSTRAINT',
        resolutionClass: 'DECISION_REQUIRED',
        title: 'No vegan dessert',
        description: '2 vegan guests will have no dessert option.',
        affectedParties: ['2 vegan guests'],
        dietaryType: 'vegan',
        guestCount: 2,
        category: 'desserts',
        currentCoverage: 0,
        minimumNeeded: 1,
        inputsReferenced: [
          {
            type: 'event',
            field: 'dietaryVegan',
            valueAtDetection: 2,
          },
        ],
        suggestion: {
          action: 'add_item',
          reasoning: 'Add a vegan dessert option',
          proposedChanges: [],
        },
        status: 'OPEN',
        canDelegate: false,
        delegateToRoles: [],
      },
    });

    console.log(`  ✓ Created: ${critical2.title}`);

    // Create SIGNIFICANT conflicts with canDelegate
    console.log('\nCreating SIGNIFICANT conflicts (with delegation)...');

    const significant1 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-significant-quantity-missing',
        type: 'QUANTITY_MISSING',
        severity: 'SIGNIFICANT',
        claimType: 'RISK',
        resolutionClass: 'DELEGATE_ALLOWED',
        title: 'Missing quantities for 3 items',
        description:
          'Some items are missing quantity specifications. Coordinators can help determine amounts.',
        affectedItems: [],
        affectedParties: ['Team coordinators'],
        inputsReferenced: [],
        suggestion: {
          action: 'delegate_to_coordinator',
          reasoning: 'Coordinators know their items best and can specify quantities',
        },
        status: 'OPEN',
        canDelegate: true,
        delegateToRoles: ['coordinator'],
      },
    });

    console.log(`  ✓ Created: ${significant1.title}`);

    const significant2 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-significant-timing-conflict',
        type: 'TIMING',
        severity: 'SIGNIFICANT',
        claimType: 'CONSTRAINT',
        resolutionClass: 'FIX_IN_PLAN',
        title: 'Timing conflict: 3 oven items at 11:00am',
        description: 'Your venue has 1 oven. These items cannot all use it simultaneously.',
        equipment: 'oven',
        timeSlot: '11:00am',
        capacityAvailable: 1,
        capacityRequired: 3,
        affectedItems: [],
        affectedParties: ['Coordinators managing oven items'],
        inputsReferenced: [
          {
            type: 'event',
            field: 'venueOvenCount',
            valueAtDetection: 1,
          },
        ],
        suggestion: {
          action: 'stagger_times',
          reasoning: 'Adjust serving times to avoid oven conflicts',
          proposedChanges: [],
        },
        status: 'OPEN',
        canDelegate: false,
        delegateToRoles: [],
      },
    });

    console.log(`  ✓ Created: ${significant2.title}`);

    // Create ADVISORY conflicts
    console.log('\nCreating ADVISORY conflicts...');

    const advisory1 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-advisory-structural-imbalance',
        type: 'STRUCTURAL_IMBALANCE',
        severity: 'ADVISORY',
        claimType: 'PATTERN',
        resolutionClass: 'INFORMATIONAL',
        title: 'Teams are unbalanced',
        description:
          'Mains has 12 items; Salads has 1. Consider redistributing for better coordination.',
        affectedParties: ['Team coordinators'],
        inputsReferenced: [],
        status: 'OPEN',
        canDelegate: false,
        delegateToRoles: [],
      },
    });

    console.log(`  ✓ Created: ${advisory1.title}`);

    const advisory2 = await prisma.conflict.create({
      data: {
        eventId,
        fingerprint: 'test-advisory-coverage-gap',
        type: 'COVERAGE_GAP',
        severity: 'ADVISORY',
        claimType: 'PATTERN',
        resolutionClass: 'INFORMATIONAL',
        title: 'No team covers drinks',
        description:
          'Based on domain mapping, no team appears to cover drinks. This may be intentional.',
        inputsReferenced: [
          {
            type: 'event',
            field: 'occasionType',
            valueAtDetection: event.occasionType,
          },
        ],
        status: 'OPEN',
        canDelegate: false,
        delegateToRoles: [],
      },
    });

    console.log(`  ✓ Created: ${advisory2.title}`);

    // Summary
    console.log('\n✅ Test conflicts created successfully!\n');
    console.log('Summary:');
    console.log('  - 2 CRITICAL conflicts (test Acknowledge)');
    console.log('  - 2 SIGNIFICANT conflicts (1 with delegation)');
    console.log('  - 2 ADVISORY conflicts (test Dismiss)\n');
    console.log(`Visit: http://localhost:3000/plan/${eventId}`);
    console.log('Click "Check Plan" to see conflicts, or refresh the page.\n');
  } catch (error) {
    console.error('❌ Error during conflict seeding:', error);
    throw error;
  }
}

// Main execution
const eventId = process.argv[2];

if (!eventId) {
  console.error('\n❌ Error: Event ID required\n');
  console.log('Usage: npx tsx scripts/seed-test-conflicts.ts <eventId>\n');
  console.log('Example: npx tsx scripts/seed-test-conflicts.ts cm5abc123xyz\n');
  process.exit(1);
}

seedTestConflicts(eventId)
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error seeding conflicts:', error);
    prisma.$disconnect();
    process.exit(1);
  });
