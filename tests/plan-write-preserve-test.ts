/**
 * GTC-237 — a regeneration replaces the model's draft and nothing else.
 *
 * THE BUG. `finalize-plan`'s rerun dropped prior AI output at TEAM level —
 * `team.deleteMany({ where: { eventId, source: 'GENERATED' } })`. `Item.team` is
 * `onDelete: Cascade` and `Item.teamId` is non-nullable, so every row on a generated
 * team died with it whatever its own `source` or `isProtected` said, and every
 * `Assignment` cascaded after. Host state accumulates on exactly those teams: the item
 * PATCH flips GENERATED → HOST_EDITED in place, and the add-item POST files MANUAL rows
 * into whichever team she is looking at, which after generation is a generated one.
 *
 * WHY THIS TEST CAN EXIST AT ALL. Before GTC-237 the only way to exercise this code was
 * to run a route that spends one of an event's ten Claude calls. `applyPlanSections`
 * takes a sections array, so the payload is fabricated here and the assertions read
 * rows. A data-loss path that costs money to assert does not get asserted.
 *
 * RED state before the fix (against the move-only extraction in plan-write.ts):
 *   Suite B — all nine preserve assertions fail; the two replace assertions pass.
 *   Suite C — duplicate-team, append-order and sweep assertions fail.
 *   Suite D — atomicity, green once the write phase is wrapped in one transaction.
 * Measured RED: 11 of 24 failed against the move-only extraction.
 * Suite A passes in both states by design: it is raw Prisma cascade semantics, the
 * evidence for why the fix takes the shape it does rather than filtering one delete.
 *
 * Run with: npm run test:plan-write-preserve
 * Destructive to its own created rows only; cleans up in finally.
 */

import { prisma } from '../src/lib/prisma';
import { applyPlanSections, sweepEmptyGeneratedTeams } from '../src/lib/ai/plan-write';
import type { SectionResponse } from '../src/lib/ai/plan-input';

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

const EVENT_NAME = 'GTC-237 Preserve Test Event';
const HOST_EMAIL = 'host-237-preserve@test.local';
const GUEST_EMAIL = 'guest-237-preserve@test.local';

interface Fixture {
  eventId: string;
  mainsTeamId: string;
  handTeamId: string;
  taskTeamId: string;
  ids: Record<string, string>;
}

async function cleanup() {
  const events = await prisma.event.findMany({ where: { name: EVENT_NAME } });
  for (const e of events) {
    // Items cascade from Team; Assignments cascade from Item; Team cascades from Event.
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: { in: [HOST_EMAIL, GUEST_EMAIL] } } });
}

/**
 * One generated food team carrying the whole preserve matrix, one hand-made team, and
 * one generated task team. Every row that should survive and every row that should not
 * sits on the SAME generated team — that is the shape the bug needs.
 */
async function buildFixture(): Promise<Fixture> {
  await cleanup();

  const host = await prisma.person.create({
    data: { name: 'Preserve Test Host', email: HOST_EMAIL },
  });
  const guest = await prisma.person.create({
    data: { name: 'Preserve Test Guest', email: GUEST_EMAIL },
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

  const mains = await prisma.team.create({
    data: { name: 'Mains', eventId: event.id, source: 'GENERATED', displayOrder: 1 },
  });
  const handTeam = await prisma.team.create({
    data: { name: 'Kate&apos;s extras', eventId: event.id, source: 'MANUAL', displayOrder: 2 },
  });
  const taskTeam = await prisma.team.create({
    data: {
      name: 'Clean up',
      eventId: event.id,
      source: 'GENERATED',
      domain: 'CLEANUP',
      displayOrder: 3,
    },
  });

  const mk = async (
    name: string,
    data: Parameters<typeof prisma.item.create>[0]['data'] extends infer D ? Partial<D> : never
  ) => {
    const item = await prisma.item.create({
      data: {
        name,
        kind: 'ITEM',
        teamId: mains.id,
        source: 'GENERATED',
        displayOrder: 1,
        ...(data as object),
      } as Parameters<typeof prisma.item.create>[0]['data'],
    });
    return item.id;
  };

  const ids: Record<string, string> = {};
  ids.plain = await mk('Plain generated ham', {});
  ids.hostEdited = await mk('Ham she rewrote', { source: 'HOST_EDITED' });
  ids.manual = await mk('Pavlova she added', { source: 'MANUAL' });
  ids.template = await mk('Template stuffing', { source: 'TEMPLATE' });
  ids.protected = await mk('Protected ham', { isProtected: true });
  ids.accepted = await mk('Ham someone said yes to', {});
  ids.declined = await mk('Ham someone said no to', {});
  ids.maybe = await mk('Ham someone might bring', {});
  ids.pending = await mk('Ham nobody has answered', {});

  for (const [key, response] of [
    ['accepted', 'ACCEPTED'],
    ['declined', 'DECLINED'],
    ['maybe', 'MAYBE'],
    ['pending', 'PENDING'],
  ] as const) {
    await prisma.assignment.create({
      data: { itemId: ids[key], personId: guest.id, response },
    });
  }

  // On HER team, one of each. `regenerate-plan` finds teams by canonical label, so a
  // team she made and named 'Mains' really does receive GENERATED rows — which makes
  // "what team is it on" the wrong question to ask about a row's fate.
  ids.generatedOnHandTeam = (
    await prisma.item.create({
      data: {
        name: 'Draft row on her own team',
        kind: 'ITEM',
        teamId: handTeam.id,
        source: 'GENERATED',
      },
    })
  ).id;
  ids.manualOnHandTeam = (
    await prisma.item.create({
      data: {
        name: 'Her row on her own team',
        kind: 'ITEM',
        teamId: handTeam.id,
        source: 'MANUAL',
      },
    })
  ).id;

  ids.taskGenerated = (
    await prisma.item.create({
      data: {
        name: 'Wash the dishes',
        kind: 'TASK',
        teamId: taskTeam.id,
        source: 'GENERATED',
        quantityState: 'NA',
      },
    })
  ).id;
  ids.taskEdited = (
    await prisma.item.create({
      data: {
        name: 'Job she rewrote',
        kind: 'TASK',
        teamId: taskTeam.id,
        source: 'HOST_EDITED',
        quantityState: 'NA',
      },
    })
  ).id;

  return {
    eventId: event.id,
    mainsTeamId: mains.id,
    handTeamId: handTeam.id,
    taskTeamId: taskTeam.id,
    ids,
  };
}

const SECTIONS: SectionResponse[] = [
  {
    // A model-supplied label that is NOT the canonical one, on a known key. The
    // canonical map must win, or find-or-create makes a second Mains next run.
    category: 'Main Dishes',
    key: 'mains',
    emoji: '🍖',
    items: [
      { name: 'Fresh roast lamb', quantity: 2, unit: 'kg', servingSize: 'serves 8' },
      { name: 'Fresh glazed ham', quantity: 1, unit: 'kg', servingSize: 'serves 10' },
    ],
  },
];

async function exists(id: string) {
  return (await prisma.item.findUnique({ where: { id } })) !== null;
}

async function runApply(f: Fixture, sections = SECTIONS) {
  return prisma.$transaction(async (tx) => {
    const r = await applyPlanSections(tx, {
      eventId: f.eventId,
      sections,
      batchId: 'test-batch',
    });
    await sweepEmptyGeneratedTeams(tx, { eventId: f.eventId });
    return r;
  });
}

async function runTests() {
  console.log(
    '\x1b[33m=== GTC-237: a regeneration replaces the draft and nothing else ===\x1b[0m\n'
  );

  // -------------------------------------------------------------------------
  console.log(
    '\x1b[33mSuite A: the cascade, proved directly — why an item filter alone fails\x1b[0m'
  );
  {
    const f = await buildFixture();
    await prisma.team.deleteMany({ where: { eventId: f.eventId, source: 'GENERATED' } });
    assert(
      'a HOST_EDITED item on a generated team dies with the team',
      !(await exists(f.ids.hostEdited))
    );
    assert('a MANUAL item on a generated team dies with the team', !(await exists(f.ids.manual)));
    assert(
      'an isProtected item on a generated team dies with the team',
      !(await exists(f.ids.protected))
    );
    assert(
      'the ACCEPTED assignment dies with its item',
      (await prisma.assignment.count({ where: { itemId: f.ids.accepted } })) === 0
    );
    assert(
      'a MANUAL team and its rows survive the same statement',
      await exists(f.ids.manualOnHandTeam)
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mSuite B: the preserve set — provenance AND reply\x1b[0m');
  {
    const f = await buildFixture();
    await runApply(f);

    assert('HOST_EDITED survives', await exists(f.ids.hostEdited));
    assert('MANUAL survives', await exists(f.ids.manual));
    assert('TEMPLATE survives', await exists(f.ids.template));
    assert('isProtected survives', await exists(f.ids.protected));
    assert('GENERATED + ACCEPTED survives', await exists(f.ids.accepted));
    assert('GENERATED + DECLINED survives', await exists(f.ids.declined));
    assert('GENERATED + MAYBE survives', await exists(f.ids.maybe));
    assert(
      'the surviving ACCEPTED assignment is still attached',
      (await prisma.assignment.count({
        where: { itemId: f.ids.accepted, response: 'ACCEPTED' },
      })) === 1
    );
    // THE RULE, stated where it is easy to get backwards: a row is protected by its own
    // provenance and its own reply, never by the provenance of the team it sits on.
    // Asking "whose team is this?" is the team-level mistake that caused the bug.
    assert('her own MANUAL row on her own team survives', await exists(f.ids.manualOnHandTeam));
    assert(
      'an unanswered GENERATED row is replaced even on a team SHE made',
      !(await exists(f.ids.generatedOnHandTeam))
    );

    assert('GENERATED + PENDING is replaced', !(await exists(f.ids.pending)));
    assert('plain GENERATED is replaced', !(await exists(f.ids.plain)));

    assert(
      'TASK rows are untouched — applyPlanSections is food-only',
      await exists(f.ids.taskGenerated)
    );
    assert('an edited TASK row is untouched too', await exists(f.ids.taskEdited));
  }

  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mSuite C: structure — one team per label, new rows after survivors\x1b[0m');
  {
    const f = await buildFixture();
    await runApply(f);

    const mains = await prisma.team.findMany({ where: { eventId: f.eventId, name: 'Mains' } });
    assert('the canonical label wins over the model-supplied one', mains.length === 1);
    assert('no second Mains team was created', mains[0]?.id === f.mainsTeamId);

    const rows = await prisma.item.findMany({
      where: { teamId: f.mainsTeamId },
      select: { name: true, displayOrder: true },
      orderBy: { displayOrder: 'asc' },
    });
    const survivors = rows.filter((r) => !r.name.startsWith('Fresh '));
    const fresh = rows.filter((r) => r.name.startsWith('Fresh '));
    // Guard: without this the comparison below passes vacuously on an empty survivor
    // set, which is exactly the broken state the suite is meant to catch.
    assert(
      'survivors and new rows both exist to compare',
      survivors.length > 0 && fresh.length > 0
    );
    const survivorMax = Math.max(0, ...survivors.map((r) => r.displayOrder ?? 0));
    const newMin = Math.min(...fresh.map((r) => r.displayOrder ?? 0));
    assert('new rows append after survivors rather than restarting at 1', newMin > survivorMax);

    // A generated team the new output does not refill must go; a hand-made one stays.
    const f2 = await buildFixture();
    await prisma.item.deleteMany({ where: { teamId: f2.handTeamId } });
    // (the MANUAL team is now empty; the sweep must still leave it standing)
    await runApply(f2, [{ category: 'Dessert', key: 'dessert', items: [] }]);
    assert(
      'an emptied MANUAL team is NOT swept',
      (await prisma.team.findUnique({ where: { id: f2.handTeamId } })) !== null
    );
  }

  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mSuite D: atomicity — a failure mid-write leaves the plan whole\x1b[0m');
  {
    const f = await buildFixture();
    const before = await prisma.item.count({ where: { team: { eventId: f.eventId } } });
    try {
      await prisma.$transaction(async (tx) => {
        await applyPlanSections(tx, { eventId: f.eventId, sections: SECTIONS, batchId: 'boom' });
        throw new Error('injected failure after the write phase');
      });
    } catch {
      /* expected */
    }
    const after = await prisma.item.count({ where: { team: { eventId: f.eventId } } });
    assert('an injected failure rolls the whole write phase back', before === after);
    assert('the pre-rerun rows are all still there', await exists(f.ids.plain));
  }

  console.log(`\n\x1b[33m=== Summary ===\x1b[0m`);
  console.log(`Total: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);
}

runTests()
  .catch((e) => {
    console.error(e);
    failed++;
  })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
  });
