/**
 * GTC Test Event — DRAFT seed script
 * Creates a fresh DRAFT event owned by gathertesting@proton.me with 5 placeholder participants.
 * Run via: railway run tsx scripts/create-gtc-test-event.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  // ── 1. Resolve host User + Person ─────────────────────────────────────────
  const hostUser = await prisma.user.findUnique({
    where: { email: 'gathertesting@proton.me' },
    include: { people: true },
  });

  if (!hostUser) {
    throw new Error('User gathertesting@proton.me not found in production DB');
  }

  if (hostUser.people.length === 0) {
    throw new Error('No Person record linked to gathertesting@proton.me — cannot set hostId');
  }

  const hostPerson = hostUser.people[0];
  console.log(`Host user:   ${hostUser.email} (userId: ${hostUser.id})`);
  console.log(`Host person: ${hostPerson.name} (personId: ${hostPerson.id})`);

  // ── 2. Create the event ───────────────────────────────────────────────────
  const now = new Date();
  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() + 30); // 30 days from now
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 1);

  const event = await prisma.event.create({
    data: {
      name: 'GTC Test Event — DRAFT',
      startDate,
      endDate,
      status: 'DRAFT',
      hostId: hostPerson.id,
      guestCount: 20,
    },
  });

  console.log(`\nCreated event: ${event.name}`);
  console.log(`Event ID:      ${event.id}`);
  console.log(`Status:        ${event.status}`);

  // ── 3. Create EventRole for host (required by requireEventRole auth guard) ─
  await prisma.eventRole.create({
    data: {
      userId: hostUser.id,
      eventId: event.id,
      role: 'HOST',
    },
  });
  console.log('EventRole HOST created for host user');

  // ── 4. Create 5 placeholder participants ─────────────────────────────────
  const participants = [
    { name: 'Alice Test', email: 'alice.test@example.com' },
    { name: 'Bob Test', email: 'bob.test@example.com' },
    { name: 'Carol Test', email: 'carol.test@example.com' },
    { name: 'Dave Test', email: 'dave.test@example.com' },
    { name: 'Eve Test', email: 'eve.test@example.com' },
  ];

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  console.log('\nCreating participants...');
  for (const p of participants) {
    const person = await prisma.person.create({
      data: {
        name: p.name,
        email: p.email,
      },
    });

    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });

    await prisma.accessToken.create({
      data: {
        token: generateToken(),
        scope: 'PARTICIPANT',
        personId: person.id,
        eventId: event.id,
        teamId: null,
        expiresAt,
      },
    });

    console.log(`  ✓ ${person.name} (${person.email}) — personId: ${person.id}`);
  }

  // ── 5. Summary ─────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log('GTC Test Event created successfully');
  console.log('════════════════════════════════════════');
  console.log(`Event ID:  ${event.id}`);
  console.log(`Plan URL:  /plan/${event.id}`);
  console.log(`Status:    ${event.status}`);
  console.log(`Guests:    ${participants.length} participants added`);
}

main()
  .catch((e) => {
    console.error('Fatal error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
