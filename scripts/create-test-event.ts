/**
 * Creates a test event for testing invite links flow
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Creating test event for invite links flow...\n');

  // Clean up any existing test data
  const existingPeople = await prisma.person.findMany({
    where: {
      email: {
        in: ['sarah@example.com', 'mike@example.com', 'emma@example.com', 'james@example.com'],
      },
    },
    select: { id: true },
  });

  if (existingPeople.length > 0) {
    const personIds = existingPeople.map((p) => p.id);
    // Delete events first
    await prisma.event.deleteMany({
      where: { hostId: { in: personIds } },
    });
    // Then delete people
    await prisma.person.deleteMany({
      where: { id: { in: personIds } },
    });
  }

  // Create host
  const host = await prisma.person.create({
    data: {
      name: 'Sarah (Host)',
      email: 'sarah@example.com',
    },
  });
  console.log(`✅ Created host: ${host.name} (${host.id})`);

  // Create coordinator
  const coordinator = await prisma.person.create({
    data: {
      name: 'Mike (Coordinator)',
      email: 'mike@example.com',
    },
  });
  console.log(`✅ Created coordinator: ${coordinator.name}`);

  // Create participants
  const participant1 = await prisma.person.create({
    data: {
      name: 'Emma',
      email: 'emma@example.com',
    },
  });

  const participant2 = await prisma.person.create({
    data: {
      name: 'James',
      email: 'james@example.com',
    },
  });
  console.log(`✅ Created participants: ${participant1.name}, ${participant2.name}`);

  // Create event
  const event = await prisma.event.create({
    data: {
      name: 'Summer BBQ Party',
      status: 'DRAFT',
      occasionType: 'BIRTHDAY',
      occasionDescription: 'Annual summer gathering',
      guestCount: 25,
      guestCountConfidence: 'HIGH',
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 3,
      dietaryVegan: 2,
      dietaryGlutenFree: 1,
      dietaryDairyFree: 0,
      venueName: 'Backyard',
      venueType: 'HOME',
      venueKitchenAccess: 'FULL',
      venueOvenCount: 1,
      venueStoretopBurners: 4,
      venueBbqAvailable: true,
      startDate: new Date('2026-07-15'),
      endDate: new Date('2026-07-15'),
      hostId: host.id,
    },
  });
  console.log(`✅ Created event: ${event.name} (${event.id})`);

  // Create team
  const team = await prisma.team.create({
    data: {
      name: 'Main Dishes',
      scope: 'Responsible for all grilled items and main courses',
      source: 'MANUAL',
      eventId: event.id,
      coordinatorId: coordinator.id,
    },
  });
  console.log(`✅ Created team: ${team.name}`);

  // Add people to event
  await prisma.personEvent.create({
    data: {
      personId: coordinator.id,
      eventId: event.id,
      role: 'COORDINATOR',
      teamId: team.id,
    },
  });

  await prisma.personEvent.create({
    data: {
      personId: participant1.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: team.id,
    },
  });

  await prisma.personEvent.create({
    data: {
      personId: participant2.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: team.id,
    },
  });
  console.log(`✅ Added people to event`);

  // Create some items
  await prisma.item.create({
    data: {
      name: 'Burgers',
      description: 'Beef and veggie burgers',
      critical: true,
      quantityState: 'SPECIFIED',
      quantityAmount: 30,
      quantityUnit: 'COUNT',
      source: 'MANUAL',
      teamId: team.id,
    },
  });

  await prisma.item.create({
    data: {
      name: 'Hot Dogs',
      description: 'Classic BBQ hot dogs',
      critical: true,
      quantityState: 'SPECIFIED',
      quantityAmount: 40,
      quantityUnit: 'COUNT',
      source: 'MANUAL',
      teamId: team.id,
    },
  });
  console.log(`✅ Created items`);

  console.log('\n✨ Test event created successfully!');
  console.log(`\n📝 Next steps:`);
  console.log(`1. Open http://localhost:3002/plan/${event.id}`);
  console.log(`2. Click "Check Plan" to verify no conflicts`);
  console.log(`3. Transition to CONFIRMING status`);
  console.log(`4. Verify invite links appear on the page`);
  console.log(`\n🔑 Event ID: ${event.id}`);
}

main()
  .catch((error) => {
    console.error('❌ Error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
