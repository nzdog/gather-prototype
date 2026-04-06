/**
 * Create 5 permanent test fixture events in production for ongoing development testing.
 * All events hosted by gathertesting@proton.me. isDemo: false on all events.
 *
 * Run via:  railway run tsx scripts/create-test-fixtures.ts
 *
 * Events created:
 *   1. TEST-FIXTURE — Draft Empty         (DRAFT, no details, no participants)
 *   2. TEST-FIXTURE — Draft With People   (DRAFT, details + 8 participants)
 *   3. TEST-FIXTURE — Confirming With Plan (CONFIRMING, plan, teams, participants)
 *   4. TEST-FIXTURE — Confirming Paid      (CONFIRMING, paid, teams, participants w/ tokens)
 *   5. TEST-FIXTURE — Frozen               (FROZEN, teams, participants)
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

const FIXTURE_NAMES = [
  'TEST-FIXTURE — Draft Empty',
  'TEST-FIXTURE — Draft With People',
  'TEST-FIXTURE — Confirming With Plan',
  'TEST-FIXTURE — Confirming Paid',
  'TEST-FIXTURE — Frozen',
];

const PARTICIPANT_NAMES = ['Alex', 'Blair', 'Casey', 'Drew', 'Evelyn', 'Finn', 'Grace', 'Harper'];

function participantEmail(eventNum: number, idx: number): string {
  return `fixture-e${eventNum}-p${idx + 1}@gather-fixture.invalid`;
}

// ── Team + item definitions (reused across Events 3, 4, 5) ────────────────────
const TEAM_DEFS = [
  {
    name: 'Mains',
    domain: 'PROTEINS' as const,
    items: ['Roast Chicken', 'Beef Brisket', 'Honey-Glazed Ham'],
  },
  {
    name: 'Sides & Salads',
    domain: 'SIDES' as const,
    items: ['Roast Potatoes', 'Green Bean Salad', 'Garlic Bread'],
  },
  {
    name: 'Drinks',
    domain: 'DRINKS' as const,
    items: ['Wine & Beer', 'Soft Drinks', 'Ice & Mixers'],
  },
];

// Participant assignments across 3 teams (indices into PARTICIPANT_NAMES)
// [teamIdx, isCoordinator]
const TEAM_ASSIGNMENTS: [number, boolean][] = [
  [0, true], // p1 — coordinator, Team Mains
  [0, false], // p2 — member,      Team Mains
  [0, false], // p3 — member,      Team Mains
  [1, true], // p4 — coordinator, Team Sides & Salads
  [1, false], // p5 — member,      Team Sides & Salads
  [1, false], // p6 — member,      Team Sides & Salads
  [2, true], // p7 — coordinator, Team Drinks
  [2, false], // p8 — member,      Team Drinks
];

async function createTeamsWithItems(eventId: string) {
  const teams = [];
  for (let i = 0; i < TEAM_DEFS.length; i++) {
    const def = TEAM_DEFS[i];
    const team = await prisma.team.create({
      data: {
        name: def.name,
        domain: def.domain,
        displayOrder: i,
        eventId,
        source: 'MANUAL',
      },
    });
    for (const itemName of def.items) {
      await prisma.item.create({
        data: {
          name: itemName,
          teamId: team.id,
          status: 'UNASSIGNED',
          source: 'MANUAL',
        },
      });
    }
    teams.push(team);
  }
  return teams;
}

interface ParticipantToken {
  name: string;
  email: string;
  participantToken: string;
  coordinatorToken?: string;
  role: 'COORDINATOR' | 'PARTICIPANT';
}

async function createParticipantsWithTeams(
  eventId: string,
  eventNum: number,
  teams: { id: string }[],
  expiresAt: Date
): Promise<ParticipantToken[]> {
  const result: ParticipantToken[] = [];

  for (let i = 0; i < 8; i++) {
    const [teamIdx, isCoord] = TEAM_ASSIGNMENTS[i];
    const team = teams[teamIdx];
    const personName = `${PARTICIPANT_NAMES[i]} Fixture`;
    const email = participantEmail(eventNum, i);

    const person = await prisma.person.create({
      data: { name: personName, email },
    });

    if (isCoord) {
      await prisma.team.update({
        where: { id: team.id },
        data: { coordinatorId: person.id },
      });
    }

    const role = isCoord ? 'COORDINATOR' : 'PARTICIPANT';

    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId,
        teamId: team.id,
        role,
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });

    // Participant-scoped access token (used for /p/[token] links)
    const participantToken = generateToken();
    await prisma.accessToken.create({
      data: {
        token: participantToken,
        scope: 'PARTICIPANT',
        personId: person.id,
        eventId,
        expiresAt,
      },
    });

    let coordinatorToken: string | undefined;
    if (isCoord) {
      coordinatorToken = generateToken();
      await prisma.accessToken.create({
        data: {
          token: coordinatorToken,
          scope: 'COORDINATOR',
          personId: person.id,
          eventId,
          teamId: team.id,
          expiresAt,
        },
      });
    }

    result.push({ name: personName, email, participantToken, coordinatorToken, role });
  }

  return result;
}

async function main() {
  // ── 0. Guard: warn if any fixture already exists ──────────────────────────
  const existing = await prisma.event.findMany({
    where: { name: { in: FIXTURE_NAMES } },
    select: { name: true, id: true },
  });
  if (existing.length > 0) {
    console.error('\n⛔  One or more fixtures already exist. Aborting to prevent duplicates.');
    existing.forEach((e) => console.error(`   "${e.name}"  ${e.id}`));
    console.error('\nTo re-run, delete those events first.');
    process.exit(1);
  }

  // ── 1. Resolve host ───────────────────────────────────────────────────────
  const hostUser = await prisma.user.findUnique({
    where: { email: 'gathertesting@proton.me' },
    include: { people: true },
  });
  if (!hostUser) throw new Error('User gathertesting@proton.me not found in DB');
  if (hostUser.people.length === 0) throw new Error('No Person record linked to host user');
  const hostPerson = hostUser.people[0];

  console.log(`Host: ${hostUser.email}`);
  console.log(`  userId:   ${hostUser.id}`);
  console.log(`  personId: ${hostPerson.id}\n`);

  const now = new Date();
  const expiresAt = new Date(now);
  expiresAt.setFullYear(expiresAt.getFullYear() + 2); // 2 years

  // Event date: 60 days from now (same for all fixtures)
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 60);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT 1 — DRAFT, no details, no participants
  // Purpose: testing setup modal and initial flow
  // ══════════════════════════════════════════════════════════════════════════
  const event1 = await prisma.event.create({
    data: {
      name: 'TEST-FIXTURE — Draft Empty',
      startDate,
      endDate,
      status: 'DRAFT',
      hostId: hostPerson.id,
    },
  });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event1.id, role: 'HOST' },
  });
  console.log(`✓ Event 1 (Draft Empty):         ${event1.id}`);

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT 2 — DRAFT, with details and 8 participants
  // Purpose: testing plan generation, auto-assign
  // ══════════════════════════════════════════════════════════════════════════
  const event2 = await prisma.event.create({
    data: {
      name: 'TEST-FIXTURE — Draft With People',
      startDate,
      endDate,
      status: 'DRAFT',
      hostId: hostPerson.id,
      occasionType: 'BIRTHDAY',
      guestCount: 20,
      guestCountConfidence: 'MEDIUM',
      venueName: 'The Family Home',
      venueType: 'HOME',
      venueKitchenAccess: 'FULL',
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 3,
      dietaryGlutenFree: 1,
    },
  });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event2.id, role: 'HOST' },
  });

  const e2Tokens: { name: string; participantToken: string }[] = [];
  for (let i = 0; i < 8; i++) {
    const person = await prisma.person.create({
      data: {
        name: `${PARTICIPANT_NAMES[i]} Fixture`,
        email: participantEmail(2, i),
      },
    });
    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId: event2.id,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });
    const token = generateToken();
    await prisma.accessToken.create({
      data: { token, scope: 'PARTICIPANT', personId: person.id, eventId: event2.id, expiresAt },
    });
    e2Tokens.push({ name: person.name, participantToken: token });
  }
  console.log(`✓ Event 2 (Draft With People):   ${event2.id}`);

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT 3 — CONFIRMING, with plan, 3 teams, participants assigned
  // Purpose: testing coordinator view, gate check, conflicts
  // ══════════════════════════════════════════════════════════════════════════
  const event3 = await prisma.event.create({
    data: {
      name: 'TEST-FIXTURE — Confirming With Plan',
      startDate,
      endDate,
      status: 'CONFIRMING',
      hostId: hostPerson.id,
      occasionType: 'CHRISTMAS',
      guestCount: 20,
      guestCountConfidence: 'HIGH',
      venueName: 'Grand Hall',
      venueType: 'HIRED_VENUE',
      venueKitchenAccess: 'FULL',
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 4,
      dietaryGlutenFree: 2,
      transitionedToConfirmingAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      lastCheckPlanAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event3.id, role: 'HOST' },
  });
  const e3Teams = await createTeamsWithItems(event3.id);
  const e3Participants = await createParticipantsWithTeams(event3.id, 3, e3Teams, expiresAt);
  console.log(`✓ Event 3 (Confirming w/ Plan):  ${event3.id}`);

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT 4 — CONFIRMING, paid, 3 teams, participants with AccessTokens
  // Purpose: testing participant link, host monitoring view, GTC-005
  // ══════════════════════════════════════════════════════════════════════════
  const event4 = await prisma.event.create({
    data: {
      name: 'TEST-FIXTURE — Confirming Paid',
      startDate,
      endDate,
      status: 'CONFIRMING',
      hostId: hostPerson.id,
      occasionType: 'WEDDING',
      guestCount: 20,
      guestCountConfidence: 'HIGH',
      venueName: 'Riverside Estate',
      venueType: 'HIRED_VENUE',
      venueKitchenAccess: 'FULL',
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 3,
      dietaryVegan: 2,
      transitionedToConfirmingAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      lastCheckPlanAt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000),
      paidAt: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000),
      amountPaid: 2900,
      stripePaymentIntentId: `pi_test_fixture_${generateToken().slice(0, 20)}`,
    },
  });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event4.id, role: 'HOST' },
  });
  const e4Teams = await createTeamsWithItems(event4.id);
  const e4Participants = await createParticipantsWithTeams(event4.id, 4, e4Teams, expiresAt);
  console.log(`✓ Event 4 (Confirming Paid):     ${event4.id}`);

  // ══════════════════════════════════════════════════════════════════════════
  // EVENT 5 — FROZEN, 3 teams, participants assigned
  // Purpose: testing frozen state restrictions
  // ══════════════════════════════════════════════════════════════════════════
  const event5 = await prisma.event.create({
    data: {
      name: 'TEST-FIXTURE — Frozen',
      startDate,
      endDate,
      status: 'FROZEN',
      hostId: hostPerson.id,
      occasionType: 'THANKSGIVING',
      guestCount: 20,
      guestCountConfidence: 'HIGH',
      venueName: 'Country House',
      venueType: 'HOME',
      venueKitchenAccess: 'FULL',
      dietaryStatus: 'SPECIFIED',
      dietaryVegetarian: 2,
      transitionedToConfirmingAt: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
      lastCheckPlanAt: new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000),
      frozenAt: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000),
      complianceAtFreeze: 94.5,
      freezeReason: 'Test fixture — frozen for participant response phase testing',
    },
  });
  await prisma.eventRole.create({
    data: { userId: hostUser.id, eventId: event5.id, role: 'HOST' },
  });
  const e5Teams = await createTeamsWithItems(event5.id);
  const e5Participants = await createParticipantsWithTeams(event5.id, 5, e5Teams, expiresAt);
  console.log(`✓ Event 5 (Frozen):              ${event5.id}`);

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('TEST FIXTURES CREATED');
  console.log('════════════════════════════════════════════════════════════════');

  console.log('\n── Event 1 — TEST-FIXTURE: Draft Empty ─────────────────────────');
  console.log(`   Status:   DRAFT (no details, no participants)`);
  console.log(`   Event ID: ${event1.id}`);
  console.log(`   Plan URL: /plan/${event1.id}`);

  console.log('\n── Event 2 — TEST-FIXTURE: Draft With People ───────────────────');
  console.log(`   Status:   DRAFT`);
  console.log(`   Event ID: ${event2.id}`);
  console.log(`   Plan URL: /plan/${event2.id}`);
  console.log(`   Participants: 8 added, no teams`);

  console.log('\n── Event 3 — TEST-FIXTURE: Confirming With Plan ────────────────');
  console.log(`   Status:   CONFIRMING`);
  console.log(`   Event ID: ${event3.id}`);
  console.log(`   Plan URL: /plan/${event3.id}`);
  console.log(`   Teams: Mains, Sides & Salads, Drinks (3 items each)`);
  console.log(`   Participants: 8 assigned to teams`);
  console.log(`   Sample participant link: /p/${e3Participants[0].participantToken}`);
  console.log(
    `   Sample coordinator link (${e3Participants[0].name}): /c/${e3Participants[0].coordinatorToken}`
  );

  console.log('\n── Event 4 — TEST-FIXTURE: Confirming Paid ─────────────────────');
  console.log(`   Status:   CONFIRMING (paidAt set, amountPaid: 2900)`);
  console.log(`   Event ID: ${event4.id}`);
  console.log(`   Plan URL: /plan/${event4.id}`);
  console.log(`   Teams: Mains, Sides & Salads, Drinks (3 items each)`);
  console.log(`   Participant links:`);
  for (const p of e4Participants) {
    const role = p.role === 'COORDINATOR' ? ' [COORD]' : '';
    console.log(`     /p/${p.participantToken}  ← ${p.name}${role}`);
  }
  console.log(`   Coordinator links:`);
  for (const p of e4Participants.filter((p) => p.coordinatorToken)) {
    console.log(`     /c/${p.coordinatorToken}  ← ${p.name}`);
  }

  console.log('\n── Event 5 — TEST-FIXTURE: Frozen ──────────────────────────────');
  console.log(`   Status:   FROZEN (frozenAt set, compliance: 94.5%)`);
  console.log(`   Event ID: ${event5.id}`);
  console.log(`   Plan URL: /plan/${event5.id}`);
  console.log(`   Teams: Mains, Sides & Salads, Drinks (3 items each)`);
  console.log(`   Sample participant link: /p/${e5Participants[0].participantToken}`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('Done. Do NOT re-run — use the existing event IDs above.');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('\nFatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
