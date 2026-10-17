/**
 * GTC-236: seed a fresh V2 event for regenerate-plan verification.
 *
 * Creates a host-owned V2 event with a complete EventSetup (copied from the standing
 * GTC-133 fixture so the OptionTree selections are realistic) and two households for
 * headcount — NO plan, so Scenario 1 exercises generate → regenerate end to end.
 * Exists because UI event creation is Stripe-gated (GTC-233 finding) and the executor
 * cannot enter card details.
 *
 * Usage:
 *   npx tsx scripts/seed-gtc236-test-event.ts            # fresh event, aiCallsUsed=0
 *   npx tsx scripts/seed-gtc236-test-event.ts --ai-calls 10   # for the 429 scenario
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const SETUP_DONOR_EVENT = 'cmsttnrkj00011ydrkn3jfvue'; // GTC-133 fixture (V2, full setup)
const HOST_EMAIL = 'nigel@mckorbett.co.nz';

async function main() {
  const aiCallsArg = process.argv.indexOf('--ai-calls');
  const aiCallsUsed = aiCallsArg >= 0 ? parseInt(process.argv[aiCallsArg + 1], 10) : 0;

  const user = await prisma.user.findUnique({ where: { email: HOST_EMAIL } });
  if (!user) throw new Error(`No user for ${HOST_EMAIL} — run a magic-link sign-in first`);
  const hostPerson = await prisma.person.findFirst({ where: { userId: user.id } });
  if (!hostPerson) throw new Error('No Person row for the host user');

  const donorSetup = await prisma.eventSetup.findUnique({
    where: { eventId: SETUP_DONOR_EVENT },
  });
  if (!donorSetup) throw new Error(`Donor event ${SETUP_DONOR_EVENT} has no EventSetup`);

  const event = await prisma.event.create({
    data: {
      name: `GTC-236 Regenerate Fixture (${new Date().toISOString().slice(0, 16)})`,
      status: 'DRAFT',
      occasionType: 'CHRISTMAS',
      guestCount: 8,
      startDate: new Date('2026-12-20'),
      endDate: new Date('2026-12-20'),
      hostId: hostPerson.id,
      aiCallsUsed,
    },
  });
  await prisma.eventRole.create({
    data: { eventId: event.id, userId: user.id, role: 'HOST' },
  });

  const {
    id: _drop,
    eventId: _drop2,
    ...setupFields
  } = donorSetup as Record<string, unknown> & {
    id: string;
    eventId: string;
  };
  await prisma.eventSetup.create({
    data: { ...(setupFields as object), eventId: event.id } as never,
  });

  // Two small households → headcount 5 adults + 1 kid
  for (const [primary, partner, kids] of [
    ['Alice Fixture', 'Ben Fixture', 1],
    ['Cora Fixture', null, 0],
  ] as const) {
    const household = await prisma.household.create({
      data: { eventId: event.id, littleCount: 0 },
    });
    const mk = async (name: string, role: 'PRIMARY_CONTACT' | 'PARTNER' | 'CHILD') => {
      const person = await prisma.person.create({ data: { name } });
      await prisma.personEvent.create({
        data: {
          eventId: event.id,
          personId: person.id,
          role: 'PARTICIPANT',
          householdId: household.id,
          householdRole: role,
        },
      });
    };
    await mk(primary, 'PRIMARY_CONTACT');
    if (partner) await mk(partner, 'PARTNER');
    for (let i = 0; i < kids; i++) await mk(`Kid ${i + 1} Fixture`, 'CHILD');
  }

  console.warn(`[GTC-236 seed] event=${event.id} aiCallsUsed=${aiCallsUsed}`);
  console.warn(`[GTC-236 seed] open http://localhost:3000/plan/${event.id}/setup`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
