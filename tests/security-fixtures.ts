/**
 * Security Test Fixtures Generator
 *
 * Creates comprehensive test data for security verification:
 * - Test user with session cookie
 * - Test event (DRAFT and FROZEN states)
 * - Two teams (Team A, Team B)
 * - People assigned to teams (host, coordinators, participants)
 * - Items in each team
 * - All necessary access tokens
 *
 * Run with: npx tsx tests/security-fixtures.ts
 *
 * SAFETY: Only runs against local dev database
 */

import { prisma } from '../src/lib/prisma';
import { randomBytes } from 'crypto';

// Safety check: only run against local dev DB
function safetyCheck() {
  const dbUrl = process.env.DATABASE_URL || '';

  if (!dbUrl.includes('localhost') && !dbUrl.includes('127.0.0.1')) {
    console.error('ERROR: This script only runs against localhost database');
    console.error(`Current DATABASE_URL: ${dbUrl.substring(0, 30)}...`);
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    console.error('ERROR: Cannot run in production environment');
    process.exit(1);
  }
}

interface Fixtures {
  user: {
    id: string;
    email: string;
    sessionToken: string;
    sessionCookie: string;
  };
  eventDraft: {
    id: string;
    name: string;
    status: string;
  };
  eventFrozen: {
    id: string;
    name: string;
    status: string;
  };
  host: {
    id: string;
    name: string;
    token: string;
  };
  teamA: {
    id: string;
    name: string;
    coordinator: {
      id: string;
      name: string;
      personId: string;
      token: string;
    };
    participant: {
      id: string;
      name: string;
      personId: string;
      token: string;
    };
    items: Array<{
      id: string;
      name: string;
    }>;
  };
  teamB: {
    id: string;
    name: string;
    coordinator: {
      id: string;
      name: string;
      personId: string;
      token: string;
    };
    participant: {
      id: string;
      name: string;
      personId: string;
      token: string;
    };
    items: Array<{
      id: string;
      name: string;
    }>;
  };
}

async function cleanup() {
  console.log('Cleaning up old test fixtures...');

  // Delete old test events (cascade will handle related data)
  await prisma.event.deleteMany({
    where: {
      name: {
        in: ['Security Test Event (DRAFT)', 'Security Test Event (FROZEN)']
      }
    }
  });

  // Delete test people (order matters due to relations)
  await prisma.person.deleteMany({
    where: {
      email: {
        in: [
          'security-test@gather.test',
          'coord-a@test.local',
          'coord-b@test.local',
          'part-a@test.local',
          'part-b@test.local',
          'frozen@test.local'
        ]
      }
    }
  });

  // Delete old test user sessions
  await prisma.session.deleteMany({
    where: {
      user: {
        email: 'security-test@gather.test'
      }
    }
  });

  // Delete old test user
  await prisma.user.deleteMany({
    where: {
      email: 'security-test@gather.test'
    }
  });

  console.log('✓ Cleanup complete\n');
}

async function generateFixtures(): Promise<Fixtures> {
  console.log('Generating security test fixtures...\n');

  // 1. Create test user with session
  console.log('1. Creating test user...');
  const user = await prisma.user.create({
    data: {
      email: 'security-test@gather.test',
      billingStatus: 'ACTIVE'
    }
  });

  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  await prisma.session.create({
    data: {
      userId: user.id,
      token: sessionToken,
      expiresAt
    }
  });

  console.log(`   ✓ User: ${user.email}`);
  console.log(`   ✓ Session token: ${sessionToken}\n`);

  // 2. Create host person (or find existing)
  console.log('2. Creating host person...');
  let hostPerson = await prisma.person.findFirst({
    where: { userId: user.id }
  });

  if (!hostPerson) {
    hostPerson = await prisma.person.create({
      data: {
        name: 'Security Test Host',
        email: user.email,
        userId: user.id
      }
    });
  }
  console.log(`   ✓ Host: ${hostPerson.name}\n`);

  // 3. Create DRAFT event
  console.log('3. Creating DRAFT event...');
  const eventDraft = await prisma.event.create({
    data: {
      name: 'Security Test Event (DRAFT)',
      startDate: new Date('2026-06-01'),
      endDate: new Date('2026-06-03'),
      status: 'DRAFT',
      hostId: hostPerson.id,
      guestCount: 20
    }
  });
  console.log(`   ✓ Event ID: ${eventDraft.id}\n`);

  // 4. Create FROZEN event
  console.log('4. Creating FROZEN event...');
  const eventFrozen = await prisma.event.create({
    data: {
      name: 'Security Test Event (FROZEN)',
      startDate: new Date('2026-07-01'),
      endDate: new Date('2026-07-03'),
      status: 'FROZEN',
      hostId: hostPerson.id,
      guestCount: 20
    }
  });
  console.log(`   ✓ Event ID: ${eventFrozen.id}\n`);

  // 5. Create EventRoles for both events
  await prisma.eventRole.createMany({
    data: [
      { userId: user.id, eventId: eventDraft.id, role: 'HOST' },
      { userId: user.id, eventId: eventFrozen.id, role: 'HOST' }
    ]
  });

  // 6. Create Team A and Team B for DRAFT event
  console.log('5. Creating teams...');
  const teamA = await prisma.team.create({
    data: {
      name: 'Team A',
      eventId: eventDraft.id
    }
  });

  const teamB = await prisma.team.create({
    data: {
      name: 'Team B',
      eventId: eventDraft.id
    }
  });
  console.log(`   ✓ Team A: ${teamA.id}`);
  console.log(`   ✓ Team B: ${teamB.id}\n`);

  // 7. Create people for teams
  console.log('6. Creating team members...');

  // Team A coordinator
  const coordAPersonData = await prisma.person.create({
    data: { name: 'Team A Coordinator', email: 'coord-a@test.local' }
  });
  await prisma.personEvent.create({
    data: {
      personId: coordAPersonData.id,
      eventId: eventDraft.id,
      teamId: teamA.id,
      role: 'COORDINATOR'
    }
  });
  await prisma.team.update({
    where: { id: teamA.id },
    data: { coordinatorId: coordAPersonData.id }
  });

  // Team A participant
  const partAPersonData = await prisma.person.create({
    data: { name: 'Team A Participant', email: 'part-a@test.local' }
  });
  await prisma.personEvent.create({
    data: {
      personId: partAPersonData.id,
      eventId: eventDraft.id,
      teamId: teamA.id,
      role: 'PARTICIPANT'
    }
  });

  // Team B coordinator
  const coordBPersonData = await prisma.person.create({
    data: { name: 'Team B Coordinator', email: 'coord-b@test.local' }
  });
  await prisma.personEvent.create({
    data: {
      personId: coordBPersonData.id,
      eventId: eventDraft.id,
      teamId: teamB.id,
      role: 'COORDINATOR'
    }
  });
  await prisma.team.update({
    where: { id: teamB.id },
    data: { coordinatorId: coordBPersonData.id }
  });

  // Team B participant
  const partBPersonData = await prisma.person.create({
    data: { name: 'Team B Participant', email: 'part-b@test.local' }
  });
  await prisma.personEvent.create({
    data: {
      personId: partBPersonData.id,
      eventId: eventDraft.id,
      teamId: teamB.id,
      role: 'PARTICIPANT'
    }
  });

  console.log(`   ✓ Team A members created`);
  console.log(`   ✓ Team B members created\n`);

  // 8. Create items
  console.log('7. Creating items...');
  const itemA1 = await prisma.item.create({
    data: {
      name: 'Item A1',
      teamId: teamA.id,
      status: 'UNASSIGNED'
    }
  });

  const itemA2 = await prisma.item.create({
    data: {
      name: 'Item A2',
      teamId: teamA.id,
      status: 'UNASSIGNED'
    }
  });

  const itemB1 = await prisma.item.create({
    data: {
      name: 'Item B1',
      teamId: teamB.id,
      status: 'UNASSIGNED'
    }
  });

  const itemB2 = await prisma.item.create({
    data: {
      name: 'Item B2',
      teamId: teamB.id,
      status: 'UNASSIGNED'
    }
  });

  console.log(`   ✓ Items created\n`);

  // 9. Generate access tokens
  console.log('8. Generating access tokens...');

  const hostToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: hostToken,
      scope: 'HOST',
      personId: hostPerson.id,
      eventId: eventDraft.id,
      expiresAt: new Date('2026-12-31')
    }
  });

  const coordAToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: coordAToken,
      scope: 'COORDINATOR',
      personId: coordAPersonData.id,
      eventId: eventDraft.id,
      teamId: teamA.id,
      expiresAt: new Date('2026-12-31')
    }
  });

  const coordBToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: coordBToken,
      scope: 'COORDINATOR',
      personId: coordBPersonData.id,
      eventId: eventDraft.id,
      teamId: teamB.id,
      expiresAt: new Date('2026-12-31')
    }
  });

  const partAToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: partAToken,
      scope: 'PARTICIPANT',
      personId: partAPersonData.id,
      eventId: eventDraft.id,
      expiresAt: new Date('2026-12-31')
    }
  });

  const partBToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: partBToken,
      scope: 'PARTICIPANT',
      personId: partBPersonData.id,
      eventId: eventDraft.id,
      expiresAt: new Date('2026-12-31')
    }
  });

  console.log(`   ✓ Access tokens generated\n`);

  // Build fixtures object
  const fixtures: Fixtures = {
    user: {
      id: user.id,
      email: user.email,
      sessionToken,
      sessionCookie: `session=${sessionToken}`
    },
    eventDraft: {
      id: eventDraft.id,
      name: eventDraft.name,
      status: eventDraft.status
    },
    eventFrozen: {
      id: eventFrozen.id,
      name: eventFrozen.name,
      status: eventFrozen.status
    },
    host: {
      id: hostPerson.id,
      name: hostPerson.name,
      token: hostToken
    },
    teamA: {
      id: teamA.id,
      name: teamA.name,
      coordinator: {
        id: coordAPersonData.id,
        name: coordAPersonData.name,
        personId: coordAPersonData.id,
        token: coordAToken
      },
      participant: {
        id: partAPersonData.id,
        name: partAPersonData.name,
        personId: partAPersonData.id,
        token: partAToken
      },
      items: [
        { id: itemA1.id, name: itemA1.name },
        { id: itemA2.id, name: itemA2.name }
      ]
    },
    teamB: {
      id: teamB.id,
      name: teamB.name,
      coordinator: {
        id: coordBPersonData.id,
        name: coordBPersonData.name,
        personId: coordBPersonData.id,
        token: coordBToken
      },
      participant: {
        id: partBPersonData.id,
        name: partBPersonData.name,
        personId: partBPersonData.id,
        token: partBToken
      },
      items: [
        { id: itemB1.id, name: itemB1.name },
        { id: itemB2.id, name: itemB2.name }
      ]
    }
  };

  return fixtures;
}

async function main() {
  try {
    safetyCheck();

    await cleanup();
    const fixtures = await generateFixtures();

    console.log('========================================');
    console.log('FIXTURES GENERATED SUCCESSFULLY');
    console.log('========================================\n');

    console.log(JSON.stringify(fixtures, null, 2));

    console.log('\n========================================');
    console.log('Quick Reference:');
    console.log('========================================');
    console.log(`Session Cookie: ${fixtures.user.sessionCookie}`);
    console.log(`Host Token: ${fixtures.host.token}`);
    console.log(`Team A Coordinator Token: ${fixtures.teamA.coordinator.token}`);
    console.log(`Team B Coordinator Token: ${fixtures.teamB.coordinator.token}`);
    console.log(`Draft Event ID: ${fixtures.eventDraft.id}`);
    console.log(`Frozen Event ID: ${fixtures.eventFrozen.id}`);
    console.log('========================================\n');

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('Error generating fixtures:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// If run directly, generate fixtures
if (require.main === module) {
  main();
}

// Export for use in tests
export { generateFixtures, cleanup };
export type { Fixtures };
