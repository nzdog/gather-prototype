/**
 * GTC-171 (B2) — Item.kind must survive a revision round-trip.
 *
 * `createRevision` snapshots via a whole-row `findMany`, so `kind` serialises for free.
 * `restoreFromRevision` does NOT: it rebuilds each row with an explicit ~35-field
 * `tx.item.create` (src/lib/workflow.ts:987-1027). Any column missing from that list is
 * silently replaced by its schema default on restore — and `Item.kind` defaults to `ITEM`.
 *
 * So without the fix, restoring a revision quietly converts every task row into a food
 * item. Nothing throws. The row is still there, still assigned, still named
 * "Wash the dishes" — it has just stopped being a task, and the runbook (J3) loses it.
 *
 * This is invisible to the existing suite: Test Suite 7 in tests/security-validation.ts
 * (:467-510) exercises restoreFromRevision but asserts only that it does not throw, that a
 * checkpoint revision was created, and that an audit entry landed. It never asserts field
 * preservation, so it stays green through this bug.
 *
 * RED state before fix:
 *   ✗ task row is still kind='TASK' after restore   (comes back as 'ITEM')
 *   ✗ restored plan still has exactly 1 task row    (0 found)
 *
 * Run with: npx tsx tests/task-row-revision-roundtrip-test.ts
 */

import { prisma } from '../src/lib/prisma';
import { createRevision, restoreFromRevision } from '../src/lib/workflow';

let passed = 0;
let failed = 0;

function assert(label: string, condition: boolean) {
  if (condition) {
    console.log(`\x1b[32m✓\x1b[0m ${label}`);
    passed++;
  } else {
    console.error(`\x1b[31m✗\x1b[0m ${label}`);
    failed++;
  }
}

const EVENT_NAME = 'GTC-171 Revision Roundtrip Test Event';
const HOST_EMAIL = 'host-171-revision@test.local';

async function cleanup() {
  const events = await prisma.event.findMany({ where: { name: EVENT_NAME } });
  for (const e of events) {
    await prisma.event.update({ where: { id: e.id }, data: { currentRevisionId: null } });
    await prisma.auditEntry.deleteMany({ where: { eventId: e.id } });
    await prisma.planRevision.deleteMany({ where: { eventId: e.id } });
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: HOST_EMAIL } });
}

async function runTests() {
  console.log('\x1b[33m=== GTC-171 (B2): Item.kind survives a revision round-trip ===\x1b[0m\n');

  await cleanup();

  const host = await prisma.person.create({
    data: { name: 'Revision Test Host', email: HOST_EMAIL },
  });

  const event = await prisma.event.create({
    data: {
      name: EVENT_NAME,
      startDate: new Date('2026-12-25'),
      endDate: new Date('2026-12-25'),
      hostId: host.id,
      status: 'DRAFT',
    },
  });

  const foodTeam = await prisma.team.create({
    data: { name: 'Mains', eventId: event.id, source: 'GENERATED', displayOrder: 1 },
  });
  const taskTeam = await prisma.team.create({
    data: {
      name: 'Clean up',
      eventId: event.id,
      source: 'GENERATED',
      domain: 'CLEANUP',
      displayOrder: 2,
    },
  });

  await prisma.item.create({
    data: { name: 'Glazed ham', kind: 'ITEM', teamId: foodTeam.id, source: 'GENERATED' },
  });
  await prisma.item.create({
    data: {
      name: 'Wash the dishes',
      kind: 'TASK',
      teamId: taskTeam.id,
      source: 'GENERATED',
      quantityState: 'NA',
    },
  });

  // --- Snapshot, mutate, restore -------------------------------------------
  const revisionId = await createRevision(event.id, host.id, 'GTC-171 round-trip fixture');

  const snapshot = await prisma.planRevision.findUnique({ where: { id: revisionId } });
  const snapshotTeams = (snapshot?.teams as any[]) ?? [];
  const snapshotKinds = snapshotTeams.flatMap((t) => (t.items ?? []).map((i: any) => i.kind));
  assert(
    'S1 createRevision serialises kind into the snapshot (whole-row findMany)',
    snapshotKinds.includes('TASK')
  );

  // Mutate so the restore has real work to do.
  await prisma.item.deleteMany({ where: { team: { eventId: event.id } } });
  const afterWipe = await prisma.item.count({ where: { team: { eventId: event.id } } });
  assert('S2 fixture wiped before restore', afterWipe === 0);

  await restoreFromRevision(event.id, revisionId, host.id, { reason: 'GTC-171 round-trip' });

  // --- Assertions ----------------------------------------------------------
  const restored = await prisma.item.findMany({
    where: { team: { eventId: event.id } },
    include: { team: true },
  });

  const restoredTask = restored.find((i) => i.name === 'Wash the dishes');
  const restoredItem = restored.find((i) => i.name === 'Glazed ham');

  assert('R1 both rows come back', restored.length === 2);
  assert('R2 task row exists by name after restore', restoredTask !== undefined);
  assert("R3 task row is still kind='TASK' after restore", restoredTask?.kind === 'TASK');
  assert(
    'R4 restored plan still has exactly 1 task row',
    restored.filter((i) => i.kind === 'TASK').length === 1
  );
  assert("R5 food row is still kind='ITEM' after restore", restoredItem?.kind === 'ITEM');
  assert('R6 task row still sits on its task team', restoredTask?.team.domain === 'CLEANUP');

  await cleanup();

  console.log(`\n\x1b[32m${passed} passed\x1b[0m, \x1b[31m${failed} failed\x1b[0m`);
  if (failed > 0) process.exit(1);
}

runTests()
  .catch(async (e) => {
    console.error(e);
    await cleanup();
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
