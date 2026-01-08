/**
 * End-to-End test with the auth fix
 *
 * Complete flow:
 * 1. Create fresh event
 * 2. Add people and items
 * 3. Transition to CONFIRMING
 * 4. Verify invite links load on Plan page (using hostId auth)
 * 5. Verify invite links are displayed correctly
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3002';

async function main() {
  console.log('🧪 End-to-End Test with Auth Fix\n');
  console.log('='.repeat(60));

  // Clean up
  const existingPeople = await prisma.person.findMany({
    where: { email: { in: ['e2e-host@test.com', 'e2e-kate@test.com', 'e2e-tom@test.com'] } },
    select: { id: true },
  });

  if (existingPeople.length > 0) {
    const personIds = existingPeople.map((p) => p.id);
    await prisma.event.deleteMany({ where: { hostId: { in: personIds } } });
    await prisma.person.deleteMany({ where: { id: { in: personIds } } });
  }

  // Create people
  console.log('\n📝 STEP 1: Creating event and people...\n');

  const host = await prisma.person.create({
    data: { name: 'E2E Host', email: 'e2e-host@test.com' },
  });

  const kate = await prisma.person.create({
    data: { name: 'Kate', email: 'e2e-kate@test.com' },
  });

  const tom = await prisma.person.create({
    data: { name: 'Tom', email: 'e2e-tom@test.com' },
  });

  console.log(`✅ Created host: ${host.name}`);
  console.log(`✅ Created coordinator: ${kate.name}`);
  console.log(`✅ Created participant: ${tom.name}`);

  // Create event
  const event = await prisma.event.create({
    data: {
      name: 'E2E Test Event',
      status: 'DRAFT',
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      hostId: host.id,
    },
  });

  console.log(`✅ Created event: ${event.name} (${event.id})\n`);

  // Create team and add people
  console.log('📝 STEP 2: Creating team and adding people...\n');

  const team = await prisma.team.create({
    data: {
      name: 'Desserts',
      scope: 'All desserts',
      source: 'MANUAL',
      eventId: event.id,
      coordinatorId: kate.id,
    },
  });

  await prisma.personEvent.create({
    data: { personId: kate.id, eventId: event.id, role: 'COORDINATOR', teamId: team.id },
  });

  await prisma.personEvent.create({
    data: { personId: tom.id, eventId: event.id, role: 'PARTICIPANT', teamId: team.id },
  });

  console.log(`✅ Created team: ${team.name}`);
  console.log(`✅ Added people to event\n`);

  // Create items
  const cake = await prisma.item.create({
    data: {
      name: 'Cake',
      critical: true,
      quantityState: 'SPECIFIED',
      quantityAmount: 1,
      quantityUnit: 'COUNT',
      source: 'MANUAL',
      teamId: team.id,
    },
  });

  console.log(`✅ Created item: ${cake.name}\n`);

  // Transition to CONFIRMING
  console.log('📝 STEP 3: Transitioning to CONFIRMING...\n');

  const transitionResponse = await fetch(`${BASE_URL}/api/events/${event.id}/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actorId: host.id, toStatus: 'CONFIRMING' }),
  });

  if (!transitionResponse.ok) {
    console.error('❌ Transition failed');
    process.exit(1);
  }

  console.log(`✅ Transition successful\n`);

  // Verify tokens were created
  const tokens = await prisma.accessToken.findMany({
    where: { eventId: event.id },
  });

  console.log(`✅ Created ${tokens.length} tokens\n`);

  // Test Plan page can load invite links
  console.log('📝 STEP 4: Testing Plan page can load invite links...\n');

  // Simulate what the Plan page does
  const eventResponse = await fetch(`${BASE_URL}/api/events/${event.id}`);
  const eventData = await eventResponse.json();

  console.log(`✅ Fetched event data (hostId: ${eventData.event.hostId})`);

  // Use hostId to fetch tokens (this is what the Plan page does now)
  const tokensResponse = await fetch(
    `${BASE_URL}/api/events/${event.id}/tokens?hostId=${eventData.event.hostId}`
  );

  if (!tokensResponse.ok) {
    console.error(`❌ Failed to fetch tokens: ${tokensResponse.status}`);
    const error = await tokensResponse.json();
    console.error('Error:', error);
    process.exit(1);
  }

  const tokensData = await tokensResponse.json();

  console.log(`✅ Plan page successfully loaded ${tokensData.inviteLinks.length} invite links:`);
  tokensData.inviteLinks.forEach((link: any) => {
    console.log(`   - ${link.role.padEnd(12)} ${link.personName.padEnd(20)} ${link.url}`);
  });

  // Verify invite links content
  console.log('\n📝 STEP 5: Verifying invite link content...\n');

  const hostLink = tokensData.inviteLinks.find((l: any) => l.scope === 'HOST');
  const coordLink = tokensData.inviteLinks.find((l: any) => l.scope === 'COORDINATOR');
  const partLink = tokensData.inviteLinks.find((l: any) => l.scope === 'PARTICIPANT');

  const checks = [
    { name: 'Host link exists', test: !!hostLink },
    { name: 'Host link has /h/ prefix', test: hostLink?.url.includes('/h/') },
    { name: 'Host person is correct', test: hostLink?.personName === 'E2E Host' },
    { name: 'Coordinator link exists', test: !!coordLink },
    { name: 'Coordinator link has /c/ prefix', test: coordLink?.url.includes('/c/') },
    { name: 'Coordinator person is Kate', test: coordLink?.personName === 'Kate' },
    { name: 'Coordinator team is Desserts', test: coordLink?.teamName === 'Desserts' },
    { name: 'Participant link exists', test: !!partLink },
    { name: 'Participant link has /p/ prefix', test: partLink?.url.includes('/p/') },
    { name: 'Participant person is Tom', test: partLink?.personName === 'Tom' },
  ];

  checks.forEach((check) => {
    console.log(`${check.test ? '✅' : '❌'} ${check.name}`);
  });

  const failures = checks.filter((c) => !c.test);
  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} checks failed!`);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('\n🎉 END-TO-END TEST PASSED!\n');
  console.log('✅ Event created and transitioned to CONFIRMING');
  console.log('✅ Tokens generated automatically');
  console.log('✅ Plan page can load invite links using hostId auth');
  console.log('✅ No localStorage required');
  console.log('✅ All invite links have correct content and format\n');

  console.log('🌐 Test URLs:\n');
  console.log(`Plan page:         ${BASE_URL}/plan/${event.id}`);
  console.log(`Host view:         ${BASE_URL}${hostLink?.url}`);
  console.log(`Coordinator view:  ${BASE_URL}${coordLink?.url}`);
  console.log(`Participant view:  ${BASE_URL}${partLink?.url}\n`);
}

main()
  .catch((error) => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
