#!/usr/bin/env tsx
/**
 * Migration script for Ticket 2.10: Legacy Event Grandfathering
 *
 * This script marks all existing events as isLegacy: true at monetisation launch.
 * Legacy events:
 * - Don't count against free tier event limits
 * - Remain editable regardless of billing status
 *
 * Run once at monetisation launch with: npx tsx scripts/mark-legacy-events.ts
 */

import { prisma } from '../src/lib/prisma';

async function markLegacyEvents() {
  console.log('Starting legacy event migration...\n');

  try {
    // Count events that will be marked as legacy
    const totalEvents = await prisma.event.count();
    const alreadyLegacy = await prisma.event.count({
      where: { isLegacy: true },
    });
    const toMark = totalEvents - alreadyLegacy;

    console.log(`Total events: ${totalEvents}`);
    console.log(`Already marked as legacy: ${alreadyLegacy}`);
    console.log(`Events to mark as legacy: ${toMark}\n`);

    if (toMark === 0) {
      console.log('No events to mark. Migration complete.');
      return;
    }

    // Mark all non-legacy events as legacy
    const result = await prisma.event.updateMany({
      where: { isLegacy: false },
      data: { isLegacy: true },
    });

    console.log(`✓ Successfully marked ${result.count} events as legacy`);
    console.log('\nMigration complete!');
    console.log('All existing events are now grandfathered and:');
    console.log('- Will not count against free tier limits');
    console.log('- Remain editable regardless of billing status\n');
  } catch (error) {
    console.error('Error during migration:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
markLegacyEvents()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
