/**
 * GTC-171 (B2) — Auto-assign must place nobody on a task team.
 *
 * B2 creates task teams ("Set up" / "Clean up" / "Other jobs") that hold only `kind: 'TASK'`
 * rows and, by construction, have zero members — nobody is ever a member of a task team.
 *
 * Auto-assign places each unassigned participant on the team with the FEWEST members. Three
 * brand-new zero-member task teams are therefore the three lowest-count targets, so they
 * capture the first participants through the door.
 *
 * That is not a cosmetic misplacement. `PersonEvent.teamId` is singular
 * (`@@unique([personId, eventId])`), and the assign gate requires
 * `personEvent.teamId === item.teamId` for food rows. A participant parked on "Clean up" can
 * therefore never be assigned a single food item — they are stranded, silently, with no error
 * anywhere.
 *
 * RED state before fix (observed):
 *   ✗ P3 nobody is placed on a team with zero ITEM rows
 *   ✗ P4 every placement lands on a team that has ITEM rows
 *   ✗ P6 placements still distribute evenly across the food teams
 *
 * P5 (all 3 participants still placed) passes in both states, by design — the count is
 * never the problem, the destination is. It is a control against a test that "passes" by
 * simply placing nobody.
 *
 * Suite Q asserts the other half of the fix — that the team query counts ITEM rows only, so
 * the input handed to computeAutoAssignments reports a task team as itemCount 0.
 *
 * Run with: npx tsx tests/task-row-auto-assign-placement-test.ts
 */

import { prisma } from '../src/lib/prisma';
import { computeAutoAssignments, type TeamDistribution } from '../src/lib/auto-assign';

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

const EVENT_NAME = 'GTC-171 Auto-Assign Placement Test Event';
const HOST_EMAIL = 'host-171-autoassign@test.local';
const GUEST_DOMAIN = 'guest-171-autoassign.test.local';

async function cleanup() {
  const events = await prisma.event.findMany({ where: { name: EVENT_NAME } });
  for (const e of events) {
    await prisma.personEvent.deleteMany({ where: { eventId: e.id } });
    await prisma.team.deleteMany({ where: { eventId: e.id } });
    await prisma.event.delete({ where: { id: e.id } });
  }
  await prisma.person.deleteMany({ where: { email: HOST_EMAIL } });
  await prisma.person.deleteMany({ where: { email: { endsWith: GUEST_DOMAIN } } });
}

async function runTests() {
  console.log('\x1b[33m=== GTC-171 (B2): auto-assign places nobody on a task team ===\x1b[0m\n');

  await cleanup();

  const host = await prisma.person.create({
    data: { name: 'Auto-Assign Test Host', email: HOST_EMAIL },
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

  // Two food teams, each already holding an ITEM row and one member.
  const mains = await prisma.team.create({
    data: { name: 'Mains', eventId: event.id, source: 'GENERATED', displayOrder: 1 },
  });
  const sides = await prisma.team.create({
    data: { name: 'Sides', eventId: event.id, source: 'GENERATED', displayOrder: 2 },
  });
  // One task team: TASK rows only, zero members — the lowest-count target.
  const cleanUp = await prisma.team.create({
    data: {
      name: 'Clean up',
      eventId: event.id,
      source: 'GENERATED',
      domain: 'CLEANUP',
      displayOrder: 3,
    },
  });

  await prisma.item.create({
    data: { name: 'Glazed ham', kind: 'ITEM', teamId: mains.id, source: 'GENERATED' },
  });
  await prisma.item.create({
    data: { name: 'Potato salad', kind: 'ITEM', teamId: sides.id, source: 'GENERATED' },
  });
  await prisma.item.create({
    data: {
      name: 'Wash the dishes',
      kind: 'TASK',
      teamId: cleanUp.id,
      source: 'GENERATED',
      quantityState: 'NA',
    },
  });

  // Seat one existing member on each food team so the task team is strictly lowest.
  for (const [i, team] of [mains, sides].entries()) {
    const seated = await prisma.person.create({
      data: { name: `Seated ${i}`, email: `seated-${i}@${GUEST_DOMAIN}` },
    });
    await prisma.personEvent.create({
      data: { personId: seated.id, eventId: event.id, teamId: team.id, role: 'PARTICIPANT' },
    });
  }

  const participants = [];
  for (let i = 0; i < 3; i++) {
    const p = await prisma.person.create({
      data: { name: `Guest ${i}`, email: `guest-${i}@${GUEST_DOMAIN}` },
    });
    await prisma.personEvent.create({
      data: { personId: p.id, eventId: event.id, role: 'PARTICIPANT' },
    });
    participants.push({ personId: p.id, personName: p.name });
  }

  // -------------------------------------------------------------------------
  // Suite Q — the team query must count ITEM rows only.
  // -------------------------------------------------------------------------
  console.log('\x1b[33mSuite Q: team item counts exclude task rows\x1b[0m');

  const queried = await prisma.team.findMany({
    where: { eventId: event.id },
    select: {
      id: true,
      name: true,
      _count: { select: { items: { where: { kind: 'ITEM' } } } },
      members: { where: { role: { not: 'HOST' } }, select: { id: true, personId: true } },
    },
    orderBy: { displayOrder: 'asc' },
  });

  const taskTeamRow = queried.find((t) => t.id === cleanUp.id);
  const mainsRow = queried.find((t) => t.id === mains.id);
  assert(
    'Q1 task team reports itemCount 0 when counting ITEM rows only',
    taskTeamRow?._count.items === 0
  );
  assert('Q2 food team still reports its ITEM rows', mainsRow?._count.items === 1);

  // -------------------------------------------------------------------------
  // Suite P — placement. THESE are the RED assertions against unpatched code.
  // -------------------------------------------------------------------------
  console.log('\n\x1b[33mSuite P: computeAutoAssignments placement\x1b[0m');

  const distributions: TeamDistribution[] = queried.map((t) => ({
    teamId: t.id,
    teamName: t.name,
    memberCount: t.members.length,
    itemCount: t._count.items,
  }));

  const placements = computeAutoAssignments(distributions, participants);

  const taskTeamIds = new Set(distributions.filter((d) => d.itemCount === 0).map((d) => d.teamId));

  assert(
    'P1 task team is present in the input (fixture is meaningful)',
    taskTeamIds.has(cleanUp.id)
  );
  assert(
    'P2 unpatched behaviour would target it: task team has the fewest members',
    Math.min(...distributions.map((d) => d.memberCount)) === (taskTeamRow?.members.length ?? -1)
  );
  assert(
    'P3 nobody is placed on a team with zero ITEM rows',
    placements.every((p) => !taskTeamIds.has(p.teamId))
  );
  assert(
    'P4 every placement lands on a team that has ITEM rows',
    placements.every((p) => distributions.find((d) => d.teamId === p.teamId)!.itemCount > 0)
  );
  assert('P5 all 3 participants still placed', placements.length === 3);
  assert(
    'P6 placements still distribute evenly across the food teams',
    new Set(placements.map((p) => p.teamId)).size === 2
  );

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
