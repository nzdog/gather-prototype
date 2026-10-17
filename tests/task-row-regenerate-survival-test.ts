/**
 * GTC-171 (B2) — Task rows must survive regeneration, in BOTH branches.
 *
 * B2 writes day-of task rows (`Item.kind = 'TASK'`) with `source: 'GENERATED'`, which puts
 * them squarely in the path of the regenerate route's plan-clearing deletes. Regenerate is
 * the legacy V1 path and does NOT produce task rows, so anything it destroys is gone for good.
 *
 * The trap this test exists for: `Item.team` is `onDelete: Cascade`
 * (prisma/schema.prisma:253). Filtering ONLY the item-delete looks like a complete fix and
 * silently is not — the unscoped `team.deleteMany` that follows cascades the spared rows away
 * one statement later. Suite A proves that mechanism directly; Suite B is the regression guard
 * on the real code path.
 *
 * RED state before fix (Suite B, both branches):
 *   ✗ preserveProtected=true  — task row deleted (matches source:'GENERATED', isProtected:false)
 *   ✗ preserveProtected=true  — task team swept (left with 0 items)
 *   ✗ preserveProtected=false — task row deleted (unfiltered item delete)
 *   ✗ preserveProtected=false — task team deleted (unfiltered team delete)
 *
 * Suite A passes in both states by design: it demonstrates raw Prisma cascade semantics, which
 * the fix does not change. It is the evidence for WHY the fix takes the shape it does.
 *
 * Run with: npx tsx tests/task-row-regenerate-survival-test.ts
 */

import { prisma } from '../src/lib/prisma';
import { clearPlanForRegeneration } from '../src/lib/workflow';

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

const EVENT_NAME = 'GTC-171 Regenerate Survival Test Event';
const HOST_EMAIL = 'host-171-regen@test.local';

interface Fixture {
  eventId: string;
  foodTeamId: string;
  taskTeamId: string;
  itemRowId: string;
  taskRowId: string;
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { name: EVENT_NAME } });
  for (const e of events) {
    // Items cascade from Team; Team cascades from Event.
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: HOST_EMAIL } });
}

/** A food team with one ITEM row, and a task team with one TASK row. */
async function buildFixture(): Promise<Fixture> {
  await cleanup();

  const host = await prisma.person.create({
    data: { name: 'Regen Test Host', email: HOST_EMAIL },
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

  const itemRow = await prisma.item.create({
    data: { name: 'Glazed ham', kind: 'ITEM', teamId: foodTeam.id, source: 'GENERATED' },
  });
  const taskRow = await prisma.item.create({
    data: {
      name: 'Wash the dishes',
      kind: 'TASK',
      teamId: taskTeam.id,
      source: 'GENERATED',
      quantityState: 'NA',
    },
  });

  return {
    eventId: event.id,
    foodTeamId: foodTeam.id,
    taskTeamId: taskTeam.id,
    itemRowId: itemRow.id,
    taskRowId: taskRow.id,
  };
}

const exists = {
  async item(id: string) {
    return (await prisma.item.findUnique({ where: { id } })) !== null;
  },
  async team(id: string) {
    return (await prisma.team.findUnique({ where: { id } })) !== null;
  },
};

async function runTests() {
  console.log(
    '\x1b[33m=== GTC-171 (B2): task rows survive regeneration — both branches ===\x1b[0m\n'
  );

  // -------------------------------------------------------------------------
  // Suite A — the cascade mechanism, proved directly against the DB.
  // These assertions hold before AND after the fix. They are the evidence that
  // filtering the item-delete alone cannot work.
  // -------------------------------------------------------------------------
  console.log('\x1b[33mSuite A: onDelete:Cascade defeats an item-only filter\x1b[0m');

  {
    const f = await buildFixture();
    // The NAIVE half-fix: filter the item delete, leave the team delete unscoped.
    await prisma.item.deleteMany({ where: { team: { eventId: f.eventId }, kind: 'ITEM' } });
    assert(
      'A1 half-fix: task row survives the filtered item-delete itself',
      await exists.item(f.taskRowId)
    );
    await prisma.team.deleteMany({ where: { eventId: f.eventId } });
    assert(
      'A2 half-fix is INSUFFICIENT: unscoped team-delete cascades the spared task row away',
      !(await exists.item(f.taskRowId))
    );
    assert('A3 half-fix: task team also gone', !(await exists.team(f.taskTeamId)));
  }

  {
    const f = await buildFixture();
    // The REAL fix: filter the item delete AND scope the team delete to empty teams.
    await prisma.item.deleteMany({ where: { team: { eventId: f.eventId }, kind: 'ITEM' } });
    await prisma.team.deleteMany({ where: { eventId: f.eventId, items: { none: {} } } });
    assert(
      'A4 scoped team-delete is what actually spares the task row',
      await exists.item(f.taskRowId)
    );
    assert('A5 scoped team-delete spares the task team', await exists.team(f.taskTeamId));
    assert(
      'A6 scoped team-delete still removes the emptied food team',
      !(await exists.team(f.foodTeamId))
    );
    assert('A7 scoped team-delete still removes the item row', !(await exists.item(f.itemRowId)));
  }

  // -------------------------------------------------------------------------
  // Suite B — the regression guard on the real code path.
  // THESE are the RED assertions against unpatched code.
  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mSuite B: clearPlanForRegeneration preserves task rows\x1b[0m');

  {
    const f = await buildFixture();
    await clearPlanForRegeneration(f.eventId, true);
    assert('B1 preserveProtected=true — task row survives', await exists.item(f.taskRowId));
    assert('B2 preserveProtected=true — task team survives', await exists.team(f.taskTeamId));
    assert(
      'B3 preserveProtected=true — GENERATED item row still removed',
      !(await exists.item(f.itemRowId))
    );
  }

  {
    const f = await buildFixture();
    await clearPlanForRegeneration(f.eventId, false);
    assert('B4 preserveProtected=false — task row survives', await exists.item(f.taskRowId));
    assert('B5 preserveProtected=false — task team survives', await exists.team(f.taskTeamId));
    assert(
      'B6 preserveProtected=false — item row still removed',
      !(await exists.item(f.itemRowId))
    );
    assert(
      'B7 preserveProtected=false — emptied food team still removed',
      !(await exists.team(f.foodTeamId))
    );
  }

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
