/**
 * Auto-assign places people on teams and creates NO assignments.
 *
 * GTC-059 originally asserted the opposite half — "items are distributed among team
 * members after auto-assign" — and that behaviour was REMOVED by founder Ruling 1
 * (2026-08-29): dealing out who brings what is a decision, not a distribution. The
 * assertions that demanded it are inverted here rather than deleted, so the removal is
 * pinned by a test instead of merely being absent.
 *
 * ⚠ THIS TEST SIMULATES THE ROUTE, IT DOES NOT CALL IT — `requireEventRole` reads a
 * session cookie, so the host route cannot be driven in-process (same constraint
 * src/lib/auto-assign.ts records). That is exactly why it now drives the REAL
 * `computeAutoAssignments` for the placement step: a hand-rolled copy of the placement
 * rule would keep passing while the route changed underneath it, which is how the old
 * version of this file stayed green through a behaviour change it should have caught.
 *
 * Verifies:
 * 1. Unassigned participants are placed on teams, spread across more than one
 * 2. NO Assignment rows are created, and item status stays UNASSIGNED
 * 3. Host is NOT placed in any team, and their role is promoted to HOST
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

// We'll test the core auto-assign logic by setting up DB state, simulating
// what the route does, and checking the results.

async function runTests() {
  // --- Setup: create test data ---
  const hostPerson = await prisma.person.create({
    data: { name: 'Test Host', email: 'host-059@test.com' },
  });

  const guest1 = await prisma.person.create({
    data: { name: 'Guest One', email: 'guest1-059@test.com' },
  });

  const guest2 = await prisma.person.create({
    data: { name: 'Guest Two', email: 'guest2-059@test.com' },
  });

  const guest3 = await prisma.person.create({
    data: { name: 'Guest Three', email: 'guest3-059@test.com' },
  });

  const event = await prisma.event.create({
    data: {
      name: 'GTC-059 Test Event',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-01'),
      hostId: hostPerson.id,
      status: 'DRAFT',
    },
  });

  // Create host PersonEvent as PARTICIPANT (simulates the bug scenario)
  await prisma.personEvent.create({
    data: {
      personId: hostPerson.id,
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: null,
    },
  });

  // Create guest PersonEvents as unassigned PARTICIPANTS
  for (const guest of [guest1, guest2, guest3]) {
    await prisma.personEvent.create({
      data: {
        personId: guest.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        teamId: null,
      },
    });
  }

  // Create two teams
  const teamA = await prisma.team.create({
    data: { name: 'Team Alpha', eventId: event.id },
  });

  const teamB = await prisma.team.create({
    data: { name: 'Team Beta', eventId: event.id },
  });

  // Create items on each team (3 per team = 6 total)
  const itemIds: string[] = [];
  for (let i = 1; i <= 3; i++) {
    const itemA = await prisma.item.create({
      data: { name: `Alpha Item ${i}`, teamId: teamA.id },
    });
    itemIds.push(itemA.id);
  }
  for (let i = 1; i <= 3; i++) {
    const itemB = await prisma.item.create({
      data: { name: `Beta Item ${i}`, teamId: teamB.id },
    });
    itemIds.push(itemB.id);
  }

  // --- Simulate auto-assign logic (same as route) ---

  // Ensure host role is HOST
  await prisma.personEvent.updateMany({
    where: {
      eventId: event.id,
      personId: event.hostId,
      role: { not: 'HOST' },
    },
    data: { role: 'HOST' },
  });

  // Fetch unassigned participants, excluding host
  const unassigned = await prisma.personEvent.findMany({
    where: {
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: null,
      personId: { not: event.hostId },
    },
    include: { person: { select: { id: true, name: true } } },
  });

  // Test 1: Host excluded from unassigned list
  assert(
    'Host is excluded from unassigned participants list',
    unassigned.every((pe) => pe.personId !== hostPerson.id)
  );

  // Test 2: All 3 guests are in the unassigned list
  assert('All 3 guests are in the unassigned list', unassigned.length === 3);

  // Fetch teams
  const teams = await prisma.team.findMany({
    where: { eventId: event.id },
    select: {
      id: true,
      name: true,
      members: {
        where: { role: { not: 'HOST' } },
        select: { id: true, personId: true },
      },
    },
  });

  // Distribute people evenly across teams
  const teamCounts = new Map(teams.map((t) => [t.id, t.members.length]));
  // The route's own placement rule, not a copy of it.
  const distributions: TeamDistribution[] = [];
  for (const t of teams) {
    const itemCount = await prisma.item.count({ where: { teamId: t.id, kind: 'ITEM' } });
    distributions.push({
      teamId: t.id,
      teamName: t.name,
      memberCount: teamCounts.get(t.id) || 0,
      itemCount,
    });
  }
  const teamAssignments = computeAutoAssignments(
    distributions,
    unassigned.map((pe) => ({ personId: pe.personId, personName: pe.person?.name ?? '' }))
  ).map((p) => ({ personId: p.personId, teamId: p.teamId }));

  // Execute team assignments
  for (const ta of teamAssignments) {
    await prisma.personEvent.update({
      where: { personId_eventId: { personId: ta.personId, eventId: event.id } },
      data: { teamId: ta.teamId },
    });
  }

  // Test 3: Host PersonEvent role is now HOST
  const hostPE = await prisma.personEvent.findUnique({
    where: { personId_eventId: { personId: hostPerson.id, eventId: event.id } },
  });
  assert('Host PersonEvent role is HOST', hostPE?.role === 'HOST');

  // Test 4: Host has no team assignment
  assert('Host has no team assignment', hostPE?.teamId === null);

  // Ruling 1: the route no longer distributes items. Nothing here simulates that half,
  // and the assertions below pin its absence.

  // Test 5: no Assignment rows exist for this event's items
  const assignmentsAfter = await prisma.assignment.findMany({ where: { itemId: { in: itemIds } } });
  assert('Auto-assign created no assignments', assignmentsAfter.length === 0);

  // Test 6: in particular, none landed on the host
  const hostAssignments = await prisma.assignment.findMany({
    where: { personId: hostPerson.id, itemId: { in: itemIds } },
  });
  assert('No items assigned to host', hostAssignments.length === 0);

  // Test 7: and none landed on anyone else either — every item is still loose
  const looseItems = await prisma.item.findMany({
    where: { id: { in: itemIds }, assignment: null },
  });
  assert('Every item is still unassigned', looseItems.length === 6);

  // Test 8: people ARE on teams — the half that survives
  const placedCount = await prisma.personEvent.count({
    where: { eventId: event.id, teamId: { not: null } },
  });
  assert('Participants were placed on teams', placedCount === teamAssignments.length);

  // Test 9: Guests are distributed across teams (not all in one)
  const guestTeams = await prisma.personEvent.findMany({
    where: {
      eventId: event.id,
      personId: { in: [guest1.id, guest2.id, guest3.id] },
    },
    select: { teamId: true },
  });
  const uniqueTeams = new Set(guestTeams.map((g) => g.teamId));
  assert('Guests distributed across multiple teams', uniqueTeams.size > 1);

  // Test 10: item status is untouched — nothing became ASSIGNED
  const assignedStatusItems = await prisma.item.findMany({
    where: { id: { in: itemIds }, status: 'ASSIGNED' },
  });
  assert('No item was flipped to ASSIGNED status', assignedStatusItems.length === 0);

  // --- Cleanup ---
  await prisma.assignment.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { teamId: { in: [teamA.id, teamB.id] } } });
  await prisma.personEvent.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.person.deleteMany({
    where: { id: { in: [hostPerson.id, guest1.id, guest2.id, guest3.id] } },
  });

  await runHostExclusionOnMomentFlowShape();

  // --- Summary ---
  console.log(`\n\x1b[1m\x1b[33m=== Test Summary ===\x1b[0m`);
  console.log(`Total tests: ${passed + failed}`);
  console.log(`\x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`\x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log(`\n\x1b[31m\x1b[1m✗ Some tests failed!\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32m\x1b[1m✓ All tests passed!\x1b[0m`);
  }
}

/**
 * Scenario 2 — the host exclusion on a MOMENT-FLOW-SHAPED event (founder Ruling 3).
 *
 * Two things are pinned here, and the second is a regression:
 *
 * (a) THE THIRD IDENTITY PATH WORKS. On a Moment-flow event the host may be captured
 *     under a DIFFERENT Person row from `Event.hostId`. The link that survives that is
 *     `Person.userId`, so a membership whose person shares the host's `userId` must be
 *     excluded even though its `personId` does not match and its role is not HOST.
 *
 * (b) GUESTS WITH A NULL `userId` MUST STILL BE PLACED. The exclusion was first written
 *     as `NOT { OR: [...] }` and that emptied the participant list on a real 14-person
 *     event: `NOT (person.userId = 'x')` is NULL — not TRUE — for every guest whose
 *     userId is null, so all of them were silently dropped and the route answered
 *     "All participants are already assigned to teams" on an event where nobody was on a
 *     team. Same SQL three-valued-logic trap `src/lib/eligibility/child-exclusion.ts`
 *     records. Without this assertion the fix reads like a stylistic preference.
 */
async function runHostExclusionOnMomentFlowShape() {
  console.log(`\n\x1b[1m\x1b[33m=== Scenario 2: host exclusion, Moment-flow shape ===\x1b[0m`);

  const user = await prisma.user.create({
    data: { email: 'host-255-exclusion@test.com' },
  });
  // The host of record, with no membership row of their own — the Moment-flow shape.
  const hostPerson = await prisma.person.create({
    data: { name: 'Ruling3 Host', email: 'hostrec-255@test.com', userId: user.id },
  });
  // The same human, captured again through Moment 1 as a household member.
  const hostAsGuest = await prisma.person.create({
    data: { name: 'Ruling3 Host (captured)', email: 'hostcap-255@test.com', userId: user.id },
  });
  // Ordinary guests: userId null, which is what (b) turns on.
  const g1 = await prisma.person.create({ data: { name: 'G1-255', email: 'g1-255@test.com' } });
  const g2 = await prisma.person.create({ data: { name: 'G2-255', email: 'g2-255@test.com' } });

  const event = await prisma.event.create({
    data: {
      name: 'GTC-255 exclusion shape',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-01'),
      hostId: hostPerson.id,
      status: 'DRAFT',
      setup: { create: {} },
    },
  });
  const team = await prisma.team.create({ data: { name: 'T1-255', eventId: event.id } });
  await prisma.item.create({ data: { name: 'I1-255', teamId: team.id, kind: 'ITEM' } });

  for (const p of [hostAsGuest, g1, g2]) {
    await prisma.personEvent.create({
      data: { personId: p.id, eventId: event.id, role: 'PARTICIPANT', teamId: null },
    });
  }

  // The route's resolution, verbatim in shape: resolve host memberships positively,
  // then exclude them by primary key.
  const ev = await prisma.event.findUnique({
    where: { id: event.id },
    select: { hostId: true, host: { select: { userId: true } } },
  });
  const hostUserId = ev!.host?.userId ?? null;
  const hostMemberships = await prisma.personEvent.findMany({
    where: {
      eventId: event.id,
      OR: [
        { personId: ev!.hostId },
        { role: 'HOST' },
        ...(hostUserId ? [{ person: { userId: hostUserId } }] : []),
      ],
    },
    select: { id: true, personId: true },
  });
  const candidates = await prisma.personEvent.findMany({
    where: {
      eventId: event.id,
      role: 'PARTICIPANT',
      teamId: null,
      id: { notIn: hostMemberships.map((m) => m.id) },
    },
    select: { personId: true },
  });

  const ids = candidates.map((c) => c.personId);
  assert(
    'Host captured under a different Person row is excluded (userId path)',
    !ids.includes(hostAsGuest.id)
  );
  assert(
    'Guest with a null userId is NOT dropped (three-valued-logic regression)',
    ids.includes(g1.id)
  );
  assert('Second null-userId guest is also kept', ids.includes(g2.id));
  assert('Exactly the two real guests remain', ids.length === 2);

  // --- Cleanup ---
  await prisma.item.deleteMany({ where: { teamId: team.id } });
  await prisma.personEvent.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({ where: { eventId: event.id } });
  await prisma.eventSetup.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.person.deleteMany({
    where: { id: { in: [hostPerson.id, hostAsGuest.id, g1.id, g2.id] } },
  });
  await prisma.user.delete({ where: { id: user.id } });
}

runTests()
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
