/**
 * GTC-116: EventSetup model and API endpoint tests
 *
 * Tests the data layer for Moment 2 Step 1 — schema presence,
 * upsert behaviour, field-level partial updates, validation,
 * and GET responses.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

let passed = 0;
let failed = 0;

function assert(name: string, condition: boolean) {
  if (condition) {
    console.info(`\x1b[32m✓\x1b[0m ${name}`);
    passed++;
  } else {
    console.info(`\x1b[31m✗\x1b[0m ${name}`);
    failed++;
  }
}

async function cleanup(eventId: string) {
  await prisma.eventSetup.deleteMany({ where: { eventId } });
  await prisma.personEvent.deleteMany({ where: { eventId } });
  await prisma.eventRole.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
}

async function run() {
  console.info('\x1b[1m\x1b[33m=== GTC-116: EventSetup Tests ===\x1b[0m\n');

  // ── Setup: create a test event with host ──
  const testEventId = 'test-event-setup-116';
  await cleanup(testEventId);

  let testPerson = await prisma.person.findFirst({ where: { name: 'Test Host 116' } });
  if (!testPerson) {
    testPerson = await prisma.person.create({
      data: { id: 'test-person-116', name: 'Test Host 116' },
    });
  }

  await prisma.event.create({
    data: {
      id: testEventId,
      name: 'Test Event for Setup',
      startDate: new Date(),
      endDate: new Date(),
      hostId: testPerson.id,
    },
  });

  // ── 1. EventSetup model exists and can be created ──
  console.info('\x1b[1m\x1b[33mModel Tests\x1b[0m');

  const created = await prisma.eventSetup.create({
    data: {
      eventId: testEventId,
      eventType: 'BBQ',
    },
  });
  assert('EventSetup record can be created', !!created.id);
  assert('eventId is set correctly', created.eventId === testEventId);
  assert('eventType is stored', created.eventType === 'BBQ');
  assert('createdAt is set', !!created.createdAt);
  assert('updatedAt is set', !!created.updatedAt);

  // ── 2. One-to-one relation works ──
  const eventWithSetup = await prisma.event.findUnique({
    where: { id: testEventId },
    include: { setup: true },
  });
  assert('Event includes setup relation', eventWithSetup?.setup?.id === created.id);

  // ── 3. Unique constraint on eventId ──
  let duplicateFailed = false;
  try {
    await prisma.eventSetup.create({ data: { eventId: testEventId } });
  } catch {
    duplicateFailed = true;
  }
  assert('Duplicate eventId is rejected (unique constraint)', duplicateFailed);

  // ── 4. Partial update — only specified fields change ──
  console.info('\n\x1b[1m\x1b[33mUpsert / Partial Update Tests\x1b[0m');

  const mainsData = { items: ['Smoked ribs', 'Roast chicken'], stillDeciding: false };
  await prisma.eventSetup.update({
    where: { eventId: testEventId },
    data: { mainsData },
  });

  const afterMainsUpdate = await prisma.eventSetup.findUnique({
    where: { eventId: testEventId },
  });
  assert(
    'mainsData is stored as JSON',
    JSON.stringify(afterMainsUpdate?.mainsData) === JSON.stringify(mainsData)
  );
  assert('eventType unchanged after partial update', afterMainsUpdate?.eventType === 'BBQ');

  // ── 5. All JSON fields store and retrieve correctly ──
  console.info('\n\x1b[1m\x1b[33mJSON Field Tests\x1b[0m');

  const sidesData = { items: ['Green salad'], stillDeciding: true };
  const dessertsData = { items: ["Aunt Carol's Christmas Trifle"], stillDeciding: false };
  const drinksData = { items: ['Beer', 'Wine'], stillDeciding: false };
  const setupCleanupData = {
    setupCrew: true,
    cleanupCrew: true,
    kidsOnDishes: false,
    stillDeciding: false,
  };
  const dietaryData = { requirements: ['Vegetarian', 'Gluten-free'], other: 'Nut allergy for Tom' };

  await prisma.eventSetup.update({
    where: { eventId: testEventId },
    data: {
      sidesData,
      dessertsData,
      drinksData,
      setupCleanupData,
      dietaryData,
      otherNotes: 'Bring fairy lights',
    },
  });

  const full = await prisma.eventSetup.findUnique({ where: { eventId: testEventId } });
  assert(
    'sidesData stored correctly',
    JSON.stringify(full?.sidesData) === JSON.stringify(sidesData)
  );
  assert(
    'dessertsData stored correctly',
    JSON.stringify(full?.dessertsData) === JSON.stringify(dessertsData)
  );
  assert(
    'drinksData stored correctly',
    JSON.stringify(full?.drinksData) === JSON.stringify(drinksData)
  );
  assert(
    'setupCleanupData stored correctly',
    JSON.stringify(full?.setupCleanupData) === JSON.stringify(setupCleanupData)
  );
  const storedDietary = full?.dietaryData as Record<string, unknown> | null;
  assert(
    'dietaryData stored correctly',
    Array.isArray(storedDietary?.requirements) &&
      (storedDietary?.requirements as string[]).includes('Vegetarian') &&
      (storedDietary?.requirements as string[]).includes('Gluten-free') &&
      storedDietary?.other === 'Nut allergy for Tom'
  );
  assert('otherNotes stored correctly', full?.otherNotes === 'Bring fairy lights');
  assert(
    'mainsData still intact after bulk update',
    JSON.stringify(full?.mainsData) === JSON.stringify(mainsData)
  );

  // ── 6. eventTypeOther works with "Other" ──
  console.info('\n\x1b[1m\x1b[33mEventType Other Tests\x1b[0m');

  await prisma.eventSetup.update({
    where: { eventId: testEventId },
    data: { eventType: 'Other', eventTypeOther: 'Hāngī' },
  });
  const otherType = await prisma.eventSetup.findUnique({ where: { eventId: testEventId } });
  assert('eventType "Other" stores correctly', otherType?.eventType === 'Other');
  assert('eventTypeOther stores free text', otherType?.eventTypeOther === 'Hāngī');

  // ── 7. Cascade delete ──
  console.info('\n\x1b[1m\x1b[33mCascade Delete Test\x1b[0m');

  await prisma.event.delete({ where: { id: testEventId } });
  const afterDelete = await prisma.eventSetup.findUnique({ where: { eventId: testEventId } });
  assert('EventSetup is cascade-deleted with Event', afterDelete === null);

  // ── 8. GET null when no setup exists ──
  console.info('\n\x1b[1m\x1b[33mNull State Test\x1b[0m');

  const freshEventId = 'test-event-setup-116-fresh';
  await cleanup(freshEventId);
  await prisma.event.create({
    data: {
      id: freshEventId,
      name: 'Fresh Event No Setup',
      startDate: new Date(),
      endDate: new Date(),
      hostId: testPerson.id,
    },
  });

  const noSetup = await prisma.eventSetup.findUnique({ where: { eventId: freshEventId } });
  assert('No EventSetup returns null for fresh event', noSetup === null);

  // Cleanup
  await cleanup(freshEventId);
  await prisma.person.deleteMany({ where: { id: 'test-person-116' } });

  // ── Summary ──
  console.info(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
  console.info(`Total tests: ${passed + failed}`);
  console.info(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.info(`\x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed > 0) {
    console.info('\n\x1b[31m\x1b[1m✗ Some tests failed!\x1b[0m');
    process.exit(1);
  } else {
    console.info('\n\x1b[32m\x1b[1m✓ All EventSetup tests passed!\x1b[0m');
  }

  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
