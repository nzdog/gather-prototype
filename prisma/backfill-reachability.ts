/**
 * Backfill script for reachability fields on PersonEvent
 *
 * This script updates all existing PersonEvent records to set:
 * - reachabilityTier based on contact availability
 * - contactMethod based on phone/email presence
 *
 * Run with: npx tsx prisma/backfill-reachability.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting reachability backfill...\n');

  // Fetch all PersonEvent records with their associated Person
  const personEvents = await prisma.personEvent.findMany({
    include: {
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          phoneNumber: true,
        },
      },
    },
  });

  console.log(`Found ${personEvents.length} PersonEvent records to process\n`);

  let updated = 0;
  let skipped = 0;

  for (const pe of personEvents) {
    const person = pe.person;

    // Determine reachability tier and contact method
    let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
    let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

    if (person.phoneNumber || person.phone) {
      contactMethod = 'SMS';
      reachabilityTier = 'DIRECT';
    } else if (person.email) {
      contactMethod = 'EMAIL';
      reachabilityTier = 'DIRECT';
    }

    // Only update if values would change
    if (pe.reachabilityTier !== reachabilityTier || pe.contactMethod !== contactMethod) {
      await prisma.personEvent.update({
        where: { id: pe.id },
        data: {
          reachabilityTier,
          contactMethod,
        },
      });

      console.log(`✓ Updated ${person.name}: ${contactMethod} / ${reachabilityTier}`);
      updated++;
    } else {
      skipped++;
    }
  }

  console.log(`\nBackfill complete!`);
  console.log(`- Updated: ${updated}`);
  console.log(`- Skipped (already correct): ${skipped}`);
  console.log(`- Total: ${personEvents.length}`);
}

main()
  .catch((e) => {
    console.error('Error during backfill:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
