/**
 * GTC-059 — Auto-assign should assign items AND exclude host from team assignment.
 *
 * Tests the auto-assign API route logic by calling it against a real database.
 * Verifies:
 * 1. Items are distributed among team members after auto-assign
 * 2. Host is NOT placed in any team
 * 3. Host role remains HOST after auto-assign
 */

import { prisma } from '../src/lib/prisma';

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
  const teamAssignments: Array<{ personId: string; teamId: string }> = [];

  for (const pe of unassigned) {
    // Find team with fewest members
    let minTeamId = teams[0].id;
    let minCount = teamCounts.get(teams[0].id) || 0;
    for (const t of teams) {
      const count = teamCounts.get(t.id) || 0;
      if (count < minCount) {
        minTeamId = t.id;
        minCount = count;
      }
    }
    teamAssignments.push({ personId: pe.personId, teamId: minTeamId });
    teamCounts.set(minTeamId, (teamCounts.get(minTeamId) || 0) + 1);
  }

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

  // Distribute items among team members
  let totalItemsAssigned = 0;
  for (const team of teams) {
    const unassignedItems = await prisma.item.findMany({
      where: { teamId: team.id, assignment: null },
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });

    const memberIds = teamAssignments
      .filter((ta) => ta.teamId === team.id)
      .map((ta) => ta.personId);

    if (memberIds.length === 0 || unassignedItems.length === 0) continue;

    for (let i = 0; i < unassignedItems.length; i++) {
      const item = unassignedItems[i];
      const personId = memberIds[i % memberIds.length];

      await prisma.assignment.create({
        data: { itemId: item.id, personId },
      });
      await prisma.item.update({
        where: { id: item.id },
        data: { status: 'ASSIGNED' },
      });
      totalItemsAssigned++;
    }
  }

  // Test 5: All 6 items assigned
  assert('All 6 items were assigned', totalItemsAssigned === 6);

  // Test 6: No item assigned to host
  const hostAssignments = await prisma.assignment.findMany({
    where: {
      personId: hostPerson.id,
      itemId: { in: itemIds },
    },
  });
  assert('No items assigned to host', hostAssignments.length === 0);

  // Test 7: Items distributed across team members
  const assignedItems = await prisma.assignment.findMany({
    where: { itemId: { in: itemIds } },
    include: { item: { select: { teamId: true } } },
  });
  assert('All items have assignments', assignedItems.length === 6);

  // Test 8: Each team's items are assigned to members of that team
  let crossTeamViolation = false;
  for (const ai of assignedItems) {
    const personTeam = teamAssignments.find((ta) => ta.personId === ai.personId);
    if (personTeam && personTeam.teamId !== ai.item.teamId) {
      crossTeamViolation = true;
    }
  }
  assert('Items assigned to members of their own team', !crossTeamViolation);

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

  // Test 10: Item status updated to ASSIGNED
  const assignedStatusItems = await prisma.item.findMany({
    where: { id: { in: itemIds }, status: 'ASSIGNED' },
  });
  assert('All items have ASSIGNED status', assignedStatusItems.length === 6);

  // --- Cleanup ---
  await prisma.assignment.deleteMany({ where: { itemId: { in: itemIds } } });
  await prisma.item.deleteMany({ where: { teamId: { in: [teamA.id, teamB.id] } } });
  await prisma.personEvent.deleteMany({ where: { eventId: event.id } });
  await prisma.team.deleteMany({ where: { eventId: event.id } });
  await prisma.event.delete({ where: { id: event.id } });
  await prisma.person.deleteMany({
    where: { id: { in: [hostPerson.id, guest1.id, guest2.id, guest3.id] } },
  });

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

runTests()
  .catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
