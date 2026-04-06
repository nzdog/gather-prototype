/**
 * Adds 5 placeholder participants to the already-created GTC Test Event — DRAFT.
 * Run once only: event cmncd0xrc00011y4v0x74khyf already exists.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();
const EVENT_ID = 'cmncd0xrc00011y4v0x74khyf';

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

async function main() {
  const event = await prisma.event.findUnique({ where: { id: EVENT_ID } });
  if (!event) throw new Error(`Event ${EVENT_ID} not found`);
  console.log(`Adding participants to: ${event.name} (${event.id})\n`);

  const participants = [
    { name: 'Alice Test', email: 'alice.test@example.com' },
    { name: 'Bob Test', email: 'bob.test@example.com' },
    { name: 'Carol Test', email: 'carol.test@example.com' },
    { name: 'Dave Test', email: 'dave.test@example.com' },
    { name: 'Eve Test', email: 'eve.test@example.com' },
  ];

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 90);

  for (const p of participants) {
    // upsert Person — handles partial state from a previous failed run
    const person = await prisma.person.upsert({
      where: { email: p.email },
      update: {},
      create: { name: p.name, email: p.email },
    });

    // upsert PersonEvent — unique on [personId, eventId]
    await prisma.personEvent.upsert({
      where: { personId_eventId: { personId: person.id, eventId: EVENT_ID } },
      update: {},
      create: {
        personId: person.id,
        eventId: EVENT_ID,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });

    // upsert AccessToken — unique on [eventId, personId, scope, teamId]
    await prisma.accessToken.upsert({
      where: {
        eventId_personId_scope_teamId: {
          eventId: EVENT_ID,
          personId: person.id,
          scope: 'PARTICIPANT',
          teamId: '',
        },
      },
      update: {},
      create: {
        token: generateToken(),
        scope: 'PARTICIPANT',
        personId: person.id,
        eventId: EVENT_ID,
        teamId: null,
        expiresAt,
      },
    });

    console.log(`✓ ${person.name} (${person.email}) — personId: ${person.id}`);
  }

  console.log('\n════════════════════════════════════════');
  console.log('Done. 5 participants added.');
  console.log(`Event ID:  ${EVENT_ID}`);
  console.log(`Plan URL:  /plan/${EVENT_ID}`);
  console.log('════════════════════════════════════════');
}

main()
  .catch((e) => {
    console.error('Fatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
