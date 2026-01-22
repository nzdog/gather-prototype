import { prisma } from '../src/lib/prisma';
import { ensureEventTokens } from '../src/lib/tokens';

async function main() {
  console.log('🔍 Finding Browser Test Event...');

  const event = await prisma.event.findFirst({
    where: { name: 'Browser Test Event' },
  });

  if (!event) {
    console.error('❌ Browser Test Event not found');
    process.exit(1);
  }

  console.log(`✓ Found event: ${event.name} (${event.id})`);

  // Check Kate's current tokens
  console.log("\n📋 Kate's tokens BEFORE fix:");
  const kataBefore = await prisma.person.findFirst({
    where: {
      name: 'Kate',
      eventMemberships: { some: { eventId: event.id } },
    },
    include: {
      tokens: {
        where: { eventId: event.id },
      },
      eventMemberships: {
        where: { eventId: event.id },
        include: { team: true },
      },
    },
  });

  if (kataBefore) {
    console.log(`  Person: ${kataBefore.name} (${kataBefore.id})`);
    console.log(`  Role: ${kataBefore.eventMemberships[0]?.role || 'N/A'}`);
    console.log(`  Team: ${kataBefore.eventMemberships[0]?.team?.name || 'N/A'}`);
    console.log(`  Tokens: ${kataBefore.tokens.length}`);
    kataBefore.tokens.forEach((t) => {
      console.log(`    - ${t.scope} token (teamId: ${t.teamId || 'null'})`);
    });
  } else {
    console.log('  ❌ Kate not found in this event');
  }

  // Run ensureEventTokens
  console.log('\n🔧 Running ensureEventTokens()...');
  await ensureEventTokens(event.id);
  console.log('✓ Done');

  // Check Kate's tokens after
  console.log("\n📋 Kate's tokens AFTER fix:");
  const kateAfter = await prisma.person.findFirst({
    where: {
      name: 'Kate',
      eventMemberships: { some: { eventId: event.id } },
    },
    include: {
      tokens: {
        where: { eventId: event.id },
      },
      eventMemberships: {
        where: { eventId: event.id },
        include: { team: true },
      },
    },
  });

  if (kateAfter) {
    console.log(`  Person: ${kateAfter.name} (${kateAfter.id})`);
    console.log(`  Role: ${kateAfter.eventMemberships[0]?.role || 'N/A'}`);
    console.log(`  Team: ${kateAfter.eventMemberships[0]?.team?.name || 'N/A'}`);

    console.log(`  Tokens: ${kateAfter.tokens.length}`);
    kateAfter.tokens.forEach((t) => {
      console.log(`    - ${t.scope} token: ${t.token} (teamId: ${t.teamId || 'null'})`);
    });

    // Get the coordinator token for testing
    const coordToken = kateAfter.tokens.find((t) => t.scope === 'COORDINATOR');
    if (coordToken) {
      console.log(`\n✓ SUCCESS! Kate now has a COORDINATOR token`);
      console.log(`\n🔗 Test URL: http://localhost:3000/c/${coordToken.token}`);
    } else {
      console.log('\n❌ FAILED: Kate still has no COORDINATOR token');
    }
  } else {
    console.log('  ❌ Kate not found in this event');
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
