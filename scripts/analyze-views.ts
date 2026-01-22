/**
 * Analyze the actual HTML content of each view
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3002';

async function main() {
  console.log('🔍 Analyzing View Content\n');

  // Get the test event tokens
  const event = await prisma.event.findFirst({
    where: { name: 'Integration Test Event' },
  });

  if (!event) {
    console.error('❌ Test event not found');
    process.exit(1);
  }

  const tokens = await prisma.accessToken.findMany({
    where: { eventId: event.id },
    include: {
      person: { select: { name: true } },
    },
  });

  const hostToken = tokens.find((t) => t.scope === 'HOST');
  const coordToken = tokens.find((t) => t.scope === 'COORDINATOR');
  const partToken = tokens.find((t) => t.scope === 'PARTICIPANT');

  // =========================================================================
  // Host View
  // =========================================================================
  console.log('📱 HOST VIEW (/h/[token])\n');
  console.log('URL:', `${BASE_URL}/h/${hostToken?.token}\n`);

  const hostResponse = await fetch(`${BASE_URL}/h/${hostToken?.token}`);
  const hostHtml = await hostResponse.text();

  const hostChecks = [
    { name: 'Event name present', test: hostHtml.includes('Integration Test Event') },
    { name: 'Status CONFIRMING shown', test: hostHtml.includes('CONFIRMING') },
    { name: 'Team "Desserts" visible', test: hostHtml.includes('Desserts') },
    { name: 'Kate mentioned', test: hostHtml.includes('Kate') },
    { name: 'Tom mentioned', test: hostHtml.includes('Tom') },
    { name: 'Chocolate Cake item', test: hostHtml.includes('Chocolate Cake') },
    { name: 'Cookies item', test: hostHtml.includes('Cookies') },
  ];

  hostChecks.forEach((check) => {
    console.log(`${check.test ? '✅' : '❌'} ${check.name}`);
  });

  // =========================================================================
  // Coordinator View
  // =========================================================================
  console.log('\n📱 COORDINATOR VIEW (/c/[token])\n');
  console.log('URL:', `${BASE_URL}/c/${coordToken?.token}\n`);

  const coordResponse = await fetch(`${BASE_URL}/c/${coordToken?.token}`);
  const coordHtml = await coordResponse.text();

  const coordChecks = [
    { name: 'Event name present', test: coordHtml.includes('Integration Test Event') },
    { name: 'Kate name shown', test: coordHtml.includes('Kate') },
    { name: 'Team "Desserts" shown', test: coordHtml.includes('Desserts') },
    { name: 'Coordinator role/label', test: coordHtml.includes('Coordinator') },
    { name: 'Chocolate Cake (assigned to Kate)', test: coordHtml.includes('Chocolate Cake') },
    {
      name: 'Can see team items',
      test: coordHtml.includes('Cookies') || coordHtml.includes('item'),
    },
  ];

  coordChecks.forEach((check) => {
    console.log(`${check.test ? '✅' : '❌'} ${check.name}`);
  });

  // =========================================================================
  // Participant View
  // =========================================================================
  console.log('\n📱 PARTICIPANT VIEW (/p/[token])\n');
  console.log('URL:', `${BASE_URL}/p/${partToken?.token}\n`);

  const partResponse = await fetch(`${BASE_URL}/p/${partToken?.token}`);
  const partHtml = await partResponse.text();

  const partChecks = [
    { name: 'Event name present', test: partHtml.includes('Integration Test Event') },
    { name: 'Tom name shown', test: partHtml.includes('Tom') },
    { name: 'Cookies (assigned to Tom)', test: partHtml.includes('Cookies') },
    { name: 'Participant role/label', test: partHtml.includes('Participant') },
  ];

  partChecks.forEach((check) => {
    console.log(`${check.test ? '✅' : '❌'} ${check.name}`);
  });

  // =========================================================================
  // Plan Page with Invite Links
  // =========================================================================
  console.log('\n📱 PLAN PAGE (/plan/[eventId])\n');
  console.log('URL:', `${BASE_URL}/plan/${event.id}\n`);

  const planResponse = await fetch(`${BASE_URL}/plan/${event.id}`);
  const planHtml = await planResponse.text();

  const planChecks = [
    { name: 'Event name present', test: planHtml.includes('Integration Test Event') },
    { name: 'Status CONFIRMING shown', test: planHtml.includes('CONFIRMING') },
    { name: 'Invite Links section', test: planHtml.includes('Invite Links') },
    {
      name: 'Host link displayed',
      test: planHtml.includes('/h/') && planHtml.includes(hostToken?.token || ''),
    },
    {
      name: 'Coordinator link displayed',
      test: planHtml.includes('/c/') && planHtml.includes(coordToken?.token || ''),
    },
    {
      name: 'Participant link displayed',
      test: planHtml.includes('/p/') && planHtml.includes(partToken?.token || ''),
    },
    { name: 'Copy Link buttons', test: planHtml.includes('Copy Link') },
  ];

  planChecks.forEach((check) => {
    console.log(`${check.test ? '✅' : '❌'} ${check.name}`);
  });

  console.log('\n' + '='.repeat(60));
  console.log('\n✨ ANALYSIS COMPLETE\n');

  // Count failures
  const allChecks = [...hostChecks, ...coordChecks, ...partChecks, ...planChecks];
  const failures = allChecks.filter((c) => !c.test);

  if (failures.length === 0) {
    console.log('🎉 All checks passed! Everything is rendering correctly.\n');
  } else {
    console.log(`⚠️  ${failures.length} checks failed:\n`);
    failures.forEach((f) => {
      console.log(`   - ${f.name}`);
    });
    console.log();
  }
}

main()
  .catch((error) => {
    console.error('❌ Analysis failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
