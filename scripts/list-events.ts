/**
 * List Events Script
 *
 * Usage: npx tsx scripts/list-events.ts
 *
 * Shows all events in the database with their IDs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function listEvents() {
  console.log('\n📋 Events in database:\n');

  const events = await prisma.event.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: {
          teams: true,
          conflicts: true,
        },
      },
    },
  });

  if (events.length === 0) {
    console.log('No events found. Create an event first!\n');
    return;
  }

  events.forEach((event, index) => {
    console.log(`${index + 1}. ${event.name}`);
    console.log(`   ID: ${event.id}`);
    console.log(`   Status: ${event.status}`);
    console.log(`   Teams: ${event._count.teams}`);
    console.log(`   Conflicts: ${event._count.conflicts}`);
    console.log(`   URL: http://localhost:3000/plan/${event.id}`);
    console.log('');
  });

  console.log(`Total: ${events.length} event(s)\n`);
}

listEvents()
  .then(() => {
    prisma.$disconnect();
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error listing events:', error);
    prisma.$disconnect();
    process.exit(1);
  });
