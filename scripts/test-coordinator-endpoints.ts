import { prisma } from '../src/lib/prisma';

async function main() {
  console.log('🧪 Testing coordinator tokens and endpoints...\n');

  // Get Browser Test Event
  const event = await prisma.event.findFirst({
    where: { name: 'Browser Test Event' },
  });

  if (!event) {
    console.error('❌ Event not found');
    process.exit(1);
  }

  // Get all coordinator tokens for this event
  const coordTokens = await prisma.accessToken.findMany({
    where: {
      eventId: event.id,
      scope: 'COORDINATOR',
    },
    include: {
      person: true,
      team: true,
    },
  });

  console.log(`Found ${coordTokens.length} COORDINATOR token(s) for "${event.name}":\n`);

  for (const token of coordTokens) {
    console.log(`  ✓ ${token.person.name} - ${token.team?.name || 'NO TEAM'}`);
    console.log(`    Token: ${token.token.substring(0, 32)}...`);
    console.log(`    TeamId: ${token.teamId}`);

    // Verify PersonEvent matches
    const pe = await prisma.personEvent.findFirst({
      where: {
        personId: token.personId,
        eventId: token.eventId,
      },
    });

    if (pe) {
      const match = pe.teamId === token.teamId ? '✓' : '❌';
      console.log(`    PersonEvent.teamId: ${pe.teamId} ${match}`);
      console.log(`    PersonEvent.role: ${pe.role}`);
    } else {
      console.log(`    ❌ No PersonEvent found!`);
    }
    console.log();
  }

  // Summary
  console.log('📊 Summary:');
  console.log(`  Total coordinators: ${coordTokens.length}`);
  console.log(
    `  Kate has coordinator token: ${coordTokens.some((t) => t.person.name === 'Kate') ? '✓ YES' : '❌ NO'}`
  );
  console.log(
    `  Demo Host has coordinator tokens: ${coordTokens.filter((t) => t.person.name === 'Demo Host').length}`
  );

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
