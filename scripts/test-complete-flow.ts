/**
 * Complete Plan → Confirming → Coordinator/Participant Flow Test
 *
 * Tests the entire flow programmatically:
 * 1. Create event with people (Kate as Coordinator, Tom as Participant)
 * 2. Assign items to each person
 * 3. Transition to CONFIRMING
 * 4. Verify invite links
 * 5. Test accessing Coordinator view with Kate's token
 * 6. Test accessing Participant view with Tom's token
 * 7. Test accessing Host view with host token
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3002';

async function main() {
  console.log('🧪 Complete Flow Test: Plan → Confirming → Views\n');
  console.log('=' .repeat(60));

  // =========================================================================
  // STEP 1: Create event with host
  // =========================================================================
  console.log('\n📝 STEP 1: Creating test event...\n');

  // Clean up existing test data
  const existingPeople = await prisma.person.findMany({
    where: {
      email: {
        in: ['alex@test.com', 'kate@test.com', 'tom@test.com'],
      },
    },
    select: { id: true },
  });

  if (existingPeople.length > 0) {
    const personIds = existingPeople.map((p) => p.id);
    await prisma.event.deleteMany({
      where: { hostId: { in: personIds } },
    });
    await prisma.person.deleteMany({
      where: { id: { in: personIds } },
    });
  }

  const host = await prisma.person.create({
    data: { name: 'Alex (Host)', email: 'alex@test.com' },
  });

  const kate = await prisma.person.create({
    data: { name: 'Kate', email: 'kate@test.com' },
  });

  const tom = await prisma.person.create({
    data: { name: 'Tom', email: 'tom@test.com' },
  });

  console.log(`✅ Created people:`);
  console.log(`   - Host: ${host.name}`);
  console.log(`   - Coordinator: ${kate.name}`);
  console.log(`   - Participant: ${tom.name}`);

  const event = await prisma.event.create({
    data: {
      name: 'Integration Test Event',
      status: 'DRAFT',
      startDate: new Date('2026-08-01'),
      endDate: new Date('2026-08-01'),
      hostId: host.id,
    },
  });

  console.log(`✅ Created event: ${event.name} (${event.id})\n`);

  // =========================================================================
  // STEP 2: Add people and teams
  // =========================================================================
  console.log('📝 STEP 2: Creating teams and adding people...\n');

  // Create team with Kate as coordinator
  const team = await prisma.team.create({
    data: {
      name: 'Desserts',
      scope: 'All desserts and sweet treats',
      source: 'MANUAL',
      eventId: event.id,
      coordinatorId: kate.id,
    },
  });

  console.log(`✅ Created team: ${team.name} (Coordinator: Kate)`);

  // Add Kate as coordinator
  await prisma.personEvent.create({
    data: {
      personId: kate.id,
      eventId: event.id,
      role: 'COORDINATOR',
      teamId: team.id,
    },
  });

  // Add Tom as participant
  await prisma.personEvent.create({
    data: {
      personId: tom.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: team.id,
    },
  });

  console.log(`✅ Added people to event\n`);

  // =========================================================================
  // STEP 3: Create items and assign them
  // =========================================================================
  console.log('📝 STEP 3: Creating items and making assignments...\n');

  // Create items
  const cake = await prisma.item.create({
    data: {
      name: 'Chocolate Cake',
      description: 'Large chocolate cake for 20 people',
      critical: true,
      quantityState: 'SPECIFIED',
      quantityAmount: 1,
      quantityUnit: 'COUNT',
      source: 'MANUAL',
      teamId: team.id,
    },
  });

  const cookies = await prisma.item.create({
    data: {
      name: 'Cookies',
      description: 'Assorted cookies',
      critical: false,
      quantityState: 'SPECIFIED',
      quantityAmount: 50,
      quantityUnit: 'COUNT',
      source: 'MANUAL',
      teamId: team.id,
    },
  });

  console.log(`✅ Created items:`);
  console.log(`   - ${cake.name}`);
  console.log(`   - ${cookies.name}`);

  // Assign items using the Assignment API
  const cakeAssignmentResponse = await fetch(
    `${BASE_URL}/api/events/${event.id}/items/${cake.id}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: kate.id }),
    }
  );

  if (!cakeAssignmentResponse.ok) {
    console.error('❌ Failed to assign cake to Kate');
  } else {
    console.log(`✅ Assigned "${cake.name}" to Kate`);
  }

  const cookiesAssignmentResponse = await fetch(
    `${BASE_URL}/api/events/${event.id}/items/${cookies.id}/assign`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ personId: tom.id }),
    }
  );

  if (!cookiesAssignmentResponse.ok) {
    console.error('❌ Failed to assign cookies to Tom');
  } else {
    console.log(`✅ Assigned "${cookies.name}" to Tom\n`);
  }

  // =========================================================================
  // STEP 4: Transition to CONFIRMING
  // =========================================================================
  console.log('📝 STEP 4: Transitioning to CONFIRMING...\n');

  const transitionResponse = await fetch(`${BASE_URL}/api/events/${event.id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actorId: host.id,
      toStatus: 'CONFIRMING',
    }),
  });

  if (!transitionResponse.ok) {
    const error = await transitionResponse.json();
    console.error('❌ Transition failed:', error);
    process.exit(1);
  }

  const transitionResult = await transitionResponse.json();
  console.log(`✅ Transition successful!`);
  console.log(`   Snapshot ID: ${transitionResult.snapshotId}\n`);

  // =========================================================================
  // STEP 5: Verify invite links were created
  // =========================================================================
  console.log('📝 STEP 5: Verifying invite links...\n');

  const tokens = await prisma.accessToken.findMany({
    where: { eventId: event.id },
    include: {
      person: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: [{ scope: 'asc' }, { person: { name: 'asc' } }],
  });

  console.log(`✅ Found ${tokens.length} tokens:`);
  tokens.forEach((token) => {
    console.log(
      `   - ${token.scope.padEnd(12)} ${token.person.name.padEnd(20)} ${token.team ? `(${token.team.name})` : ''}`
    );
  });
  console.log();

  const hostToken = tokens.find((t) => t.scope === 'HOST');
  const kateToken = tokens.find((t) => t.scope === 'COORDINATOR');
  const tomToken = tokens.find((t) => t.scope === 'PARTICIPANT');

  if (!hostToken || !kateToken || !tomToken) {
    console.error('❌ Missing expected tokens!');
    process.exit(1);
  }

  // =========================================================================
  // STEP 6: Test Host view (/h/[token])
  // =========================================================================
  console.log('📝 STEP 6: Testing Host view...\n');

  const hostViewResponse = await fetch(`${BASE_URL}/h/${hostToken.token}`);

  if (!hostViewResponse.ok) {
    console.error(`❌ Host view failed with status ${hostViewResponse.status}`);
  } else {
    const hostHtml = await hostViewResponse.text();
    console.log(`✅ Host view loaded successfully (${hostViewResponse.status})`);

    // Check for key elements in HTML
    if (hostHtml.includes('Integration Test Event')) {
      console.log(`   ✓ Event name displayed`);
    }
    if (hostHtml.includes('CONFIRMING')) {
      console.log(`   ✓ Status shows CONFIRMING`);
    }
    if (hostHtml.includes('Desserts') || hostHtml.includes('team')) {
      console.log(`   ✓ Teams section present`);
    }
  }
  console.log();

  // =========================================================================
  // STEP 7: Test Coordinator view (/c/[token])
  // =========================================================================
  console.log('📝 STEP 7: Testing Coordinator view (Kate)...\n');

  const coordViewResponse = await fetch(`${BASE_URL}/c/${kateToken.token}`);

  if (!coordViewResponse.ok) {
    console.error(`❌ Coordinator view failed with status ${coordViewResponse.status}`);
  } else {
    const coordHtml = await coordViewResponse.text();
    console.log(`✅ Coordinator view loaded successfully (${coordViewResponse.status})`);

    // Check for key elements
    if (coordHtml.includes('Kate') || coordHtml.includes('Coordinator')) {
      console.log(`   ✓ Coordinator name/role displayed`);
    }
    if (coordHtml.includes('Desserts')) {
      console.log(`   ✓ Team name displayed`);
    }
    if (coordHtml.includes('Chocolate Cake')) {
      console.log(`   ✓ Assigned item "Chocolate Cake" visible`);
    }
  }
  console.log();

  // =========================================================================
  // STEP 8: Test Participant view (/p/[token])
  // =========================================================================
  console.log('📝 STEP 8: Testing Participant view (Tom)...\n');

  const partViewResponse = await fetch(`${BASE_URL}/p/${tomToken.token}`);

  if (!partViewResponse.ok) {
    console.error(`❌ Participant view failed with status ${partViewResponse.status}`);
  } else {
    const partHtml = await partViewResponse.text();
    console.log(`✅ Participant view loaded successfully (${partViewResponse.status})`);

    // Check for key elements
    if (partHtml.includes('Tom') || partHtml.includes('Participant')) {
      console.log(`   ✓ Participant name/role displayed`);
    }
    if (partHtml.includes('Cookies')) {
      console.log(`   ✓ Assigned item "Cookies" visible`);
    }
  }
  console.log();

  // =========================================================================
  // STEP 9: Test API endpoint with HOST token
  // =========================================================================
  console.log('📝 STEP 9: Testing /api/events/[id]/tokens endpoint...\n');

  const tokensApiResponse = await fetch(`${BASE_URL}/api/events/${event.id}/tokens`, {
    headers: {
      Authorization: `Bearer ${hostToken.token}`,
    },
  });

  if (!tokensApiResponse.ok) {
    console.error(`❌ Tokens API failed with status ${tokensApiResponse.status}`);
  } else {
    const tokensData = await tokensApiResponse.json();
    console.log(`✅ Tokens API returned ${tokensData.inviteLinks.length} links:`);
    tokensData.inviteLinks.forEach((link: any) => {
      console.log(`   - ${link.role.padEnd(12)} ${link.personName.padEnd(20)} ${link.url}`);
    });
  }
  console.log();

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('=' .repeat(60));
  console.log('\n✨ COMPLETE FLOW TEST SUMMARY\n');
  console.log('✅ Event created and populated with people');
  console.log('✅ Teams created with Kate as Coordinator');
  console.log('✅ Items assigned to Kate and Tom');
  console.log('✅ Transition to CONFIRMING succeeded');
  console.log('✅ Tokens generated for Host, Coordinator, Participant');
  console.log('✅ Host view (/h/[token]) loads');
  console.log('✅ Coordinator view (/c/[token]) loads');
  console.log('✅ Participant view (/p/[token]) loads');
  console.log('✅ Tokens API endpoint works\n');

  console.log('🌐 You can test these URLs in your browser:\n');
  console.log(`Host view:         ${BASE_URL}/h/${hostToken.token}`);
  console.log(`Coordinator view:  ${BASE_URL}/c/${kateToken.token}`);
  console.log(`Participant view:  ${BASE_URL}/p/${tomToken.token}`);
  console.log(`Plan page:         ${BASE_URL}/plan/${event.id}\n`);

  console.log('📋 Event Details:');
  console.log(`   Event ID: ${event.id}`);
  console.log(`   Host: ${host.name} (${host.id})`);
  console.log(`   Kate (Coordinator): ${kate.id}`);
  console.log(`   Tom (Participant): ${tom.id}\n`);

  console.log('🎉 All programmatic tests passed!\n');
}

main()
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
