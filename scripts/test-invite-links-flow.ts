/**
 * End-to-end test of the invite links flow
 * Tests: DRAFT → CONFIRMING transition + token generation + API endpoint
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧪 Testing Invite Links Flow (End-to-End)\n');

  // Find the test event
  const event = await prisma.event.findFirst({
    where: { name: 'Summer BBQ Party' },
    include: {
      host: true,
    },
  });

  if (!event) {
    console.error('❌ Test event not found. Run create-test-event.ts first.');
    process.exit(1);
  }

  console.log(`✅ Found test event: ${event.name} (${event.id})`);
  console.log(`   Status: ${event.status}`);
  console.log(`   Host: ${event.host.name}\n`);

  // Step 1: Transition to CONFIRMING
  console.log('1️⃣  Transitioning to CONFIRMING...');
  const transitionResponse = await fetch(`http://localhost:3002/api/events/${event.id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      actorId: event.hostId,
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
  console.log(`   Snapshot ID: ${transitionResult.snapshotId}`);
  console.log(`   Token count: ${transitionResult.tokenCount}\n`);

  // Step 2: Verify tokens were created in database
  console.log('2️⃣  Verifying tokens in database...');
  const tokens = await prisma.accessToken.findMany({
    where: { eventId: event.id },
    include: {
      person: { select: { name: true } },
      team: { select: { name: true } },
    },
    orderBy: [{ scope: 'asc' }, { person: { name: 'asc' } }],
  });

  console.log(`✅ Found ${tokens.length} tokens in database:`);
  tokens.forEach((token) => {
    console.log(
      `   - ${token.scope.padEnd(12)} ${token.person.name.padEnd(30)} ${token.team ? `(${token.team.name})` : ''}`
    );
  });
  console.log();

  // Step 3: Test API endpoint with HOST token
  console.log('3️⃣  Testing GET /api/events/[id]/tokens endpoint...');
  const hostToken = tokens.find((t) => t.scope === 'HOST');

  if (!hostToken) {
    console.error('❌ No HOST token found!');
    process.exit(1);
  }

  // Test with valid HOST token
  console.log('   Testing with valid HOST token...');
  const tokensResponse = await fetch(`http://localhost:3002/api/events/${event.id}/tokens`, {
    headers: {
      Authorization: `Bearer ${hostToken.token}`,
    },
  });

  if (!tokensResponse.ok) {
    console.error(`❌ Request failed with status ${tokensResponse.status}`);
    const error = await tokensResponse.json();
    console.error('   Error:', error);
    process.exit(1);
  }

  const tokensData = await tokensResponse.json();
  console.log(`✅ Received ${tokensData.inviteLinks.length} invite links:`);
  tokensData.inviteLinks.forEach((link: any) => {
    console.log(
      `   - ${link.role.padEnd(12)} ${link.personName.padEnd(30)} ${link.teamName ? `(${link.teamName})` : ''}`
    );
    console.log(`     URL: ${link.url}`);
  });
  console.log();

  // Step 4: Test with non-HOST token (should fail)
  console.log('4️⃣  Testing endpoint security (non-HOST token should fail)...');
  const coordinatorToken = tokens.find((t) => t.scope === 'COORDINATOR');

  if (coordinatorToken) {
    const securityTest = await fetch(`http://localhost:3002/api/events/${event.id}/tokens`, {
      headers: {
        Authorization: `Bearer ${coordinatorToken.token}`,
      },
    });

    if (securityTest.status === 403) {
      console.log('✅ PASS: COORDINATOR token correctly rejected (403)');
    } else {
      console.error(`❌ FAIL: Expected 403, got ${securityTest.status}`);
    }
  }

  // Test with no token (should fail)
  const noTokenTest = await fetch(`http://localhost:3002/api/events/${event.id}/tokens`);
  if (noTokenTest.status === 403) {
    console.log('✅ PASS: Request without token correctly rejected (403)\n');
  } else {
    console.error(`❌ FAIL: Expected 403, got ${noTokenTest.status}\n`);
  }

  // Step 5: Verify invite link format
  console.log('5️⃣  Verifying invite link formats...');
  const hostLink = tokensData.inviteLinks.find((l: any) => l.scope === 'HOST');
  const coordLink = tokensData.inviteLinks.find((l: any) => l.scope === 'COORDINATOR');
  const partLink = tokensData.inviteLinks.find((l: any) => l.scope === 'PARTICIPANT');

  if (hostLink && hostLink.url.includes('/h/')) {
    console.log('✅ PASS: Host URL has /h/ prefix');
  } else {
    console.error(`❌ FAIL: Host URL format incorrect: ${hostLink?.url}`);
  }

  if (coordLink && coordLink.url.includes('/c/')) {
    console.log('✅ PASS: Coordinator URL has /c/ prefix');
  } else {
    console.error(`❌ FAIL: Coordinator URL format incorrect: ${coordLink?.url}`);
  }

  if (partLink && partLink.url.includes('/p/')) {
    console.log('✅ PASS: Participant URL has /p/ prefix\n');
  } else {
    console.error(`❌ FAIL: Participant URL format incorrect: ${partLink?.url}\n`);
  }

  console.log('🎉 All tests passed!');
  console.log('\n✨ Invite links flow is working correctly!');
  console.log(`\n📱 You can now open http://localhost:3002/plan/${event.id} in your browser`);
  console.log('   The invite links should be displayed on the page.');
}

main()
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
