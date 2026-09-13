/**
 * Seed a fresh test event for GTC-133 sub-commit (g) browser walk.
 *
 * Direct Prisma writes (no API). Each run creates a fresh event. Pass --reset
 * to delete previously-seeded events (matched by name) before seeding a fresh
 * one; the delete cascades to their Households, PersonEvents, EventRoles, and
 * EventSetup rows. Person rows are shared across events (found-or-created by
 * email) and are intentionally left in place by --reset.
 *
 * Usage: npx tsx scripts/seed-gtc-133-test-event.ts [--reset]
 */

import { PrismaClient, HouseholdRole } from '@prisma/client';

const prisma = new PrismaClient();

const EVENT_NAME = 'GTC-133 Sub-commit (g) Test';

// Exclude fixture events that other scripts depend on by ID even though they
// share this script's event name (an artifact of having been created by an
// earlier run of this same script, before being repurposed as a fixture).
// Deleting one of these would silently break its dependent script.
const RESET_EXCLUDE_IDS = [
  'cmsttnrkj00011ydrkn3jfvue', // SETUP_DONOR_EVENT in scripts/seed-gtc236-test-event.ts:17
];

async function resetSeededEvents() {
  const existing = await prisma.event.findMany({
    where: { name: EVENT_NAME, id: { notIn: RESET_EXCLUDE_IDS } },
    select: { id: true },
  });
  if (existing.length === 0) {
    process.stdout.write(
      '--reset: no previously-seeded events found (excluding protected fixtures).\n'
    );
    return;
  }
  const { count } = await prisma.event.deleteMany({
    where: { id: { in: existing.map((e) => e.id) } },
  });
  process.stdout.write(
    `--reset: deleted ${count} previously-seeded event(s) (id${existing.length === 1 ? '' : 's'}: ${existing
      .map((e) => e.id)
      .join(
        ', '
      )}), cascading to their Households, PersonEvents, EventRoles, and EventSetup rows.\n`
  );
}

interface MemberSeed {
  name: string;
  email?: string;
  phoneNumber?: string;
  role: HouseholdRole;
}

interface HouseholdSeed {
  label: string;
  littleCount?: number;
  members: MemberSeed[];
}

const HOUSEHOLDS: HouseholdSeed[] = [
  {
    label: 'Kate & Matt',
    littleCount: 1,
    members: [
      {
        name: 'Kate',
        email: 'kate@example.com',
        phoneNumber: '0211234567',
        role: 'PRIMARY_CONTACT',
      },
      { name: 'Matt', role: 'PARTNER' },
      { name: 'Charlie', role: 'CHILD' },
      { name: 'Rosie', role: 'CHILD' },
    ],
  },
  {
    label: 'Pete & Suzanne',
    members: [
      {
        name: 'Pete',
        email: 'pete@example.com',
        phoneNumber: '0211234568',
        role: 'PRIMARY_CONTACT',
      },
      { name: 'Suzanne', email: 'suzanne@example.com', role: 'PARTNER' },
      { name: 'Gus', role: 'CHILD' },
    ],
  },
  {
    label: 'Jacqui & Ian',
    members: [
      { name: 'Jacqui', email: 'jacqui@example.com', role: 'PRIMARY_CONTACT' },
      { name: 'Ian', email: 'ian@example.com', role: 'PARTNER' },
    ],
  },
  {
    label: 'Joanna',
    members: [
      {
        name: 'Joanna',
        email: 'joanna@example.com',
        phoneNumber: '0211234569',
        role: 'PRIMARY_CONTACT',
      },
    ],
  },
  {
    label: 'Jane & Gavin',
    members: [
      { name: 'Jane', email: 'jane@example.com', role: 'PRIMARY_CONTACT' },
      { name: 'Gavin', role: 'PARTNER' },
    ],
  },
  {
    label: 'Robyn & Dougal',
    littleCount: 2,
    members: [
      { name: 'Robyn', email: 'robyn@example.com', role: 'PRIMARY_CONTACT' },
      { name: 'Dougal', role: 'PARTNER' },
    ],
  },
];

async function main() {
  if (process.argv.includes('--reset')) {
    await resetSeededEvents();
  }

  // Resolve which User owns the seeded event. Order:
  //   1. SEED_HOST_EMAIL env var (explicit override).
  //   2. nigel@mckorbett.co.nz (the realistic dev case).
  //   3. First existing User (createdAt asc).
  //   4. Fallback test@gtc-133.local (newly created).
  // The chosen User must match whoever is logged in to the browser session, or
  // /api/events/{id}/households returns 403 and Moment 1 renders empty.
  const explicitEmail = process.env.SEED_HOST_EMAIL?.trim();
  let user = explicitEmail
    ? await prisma.user.findUnique({ where: { email: explicitEmail } })
    : null;
  if (explicitEmail && !user) {
    user = await prisma.user.create({ data: { email: explicitEmail } });
    console.warn(`Created user ${explicitEmail} (SEED_HOST_EMAIL did not exist).`);
  }
  if (!user) {
    user = await prisma.user.findUnique({ where: { email: 'nigel@mckorbett.co.nz' } });
  }
  if (!user) {
    user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  }
  if (!user) {
    user = await prisma.user.create({ data: { email: 'test@gtc-133.local' } });
    console.warn(`Created fallback user ${user.email} (no existing user found).`);
  }

  // Find-or-create the host Person linked to that user.
  let hostPerson = await prisma.person.findFirst({
    where: { userId: user.id },
    orderBy: { id: 'asc' },
  });
  if (!hostPerson) {
    hostPerson = await prisma.person.create({
      data: {
        name: 'Test Host',
        email: user.email,
        userId: user.id,
      },
    });
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 14);
  const endDate = new Date(startDate);

  const event = await prisma.event.create({
    data: {
      name: EVENT_NAME,
      startDate,
      endDate,
      hostId: hostPerson.id,
      // status defaults to DRAFT — schema has no SETUP value (DRAFT is the
      // pre-confirming state where Moment 2 Step 1 is the active flow).
    },
  });

  await prisma.eventRole.create({
    data: { userId: user.id, eventId: event.id, role: 'HOST' },
  });

  let personEventCount = 0;
  let totalLittles = 0;
  const householdSummaries: { label: string; members: number; littles: number }[] = [];

  for (const hh of HOUSEHOLDS) {
    const household = await prisma.household.create({
      data: {
        eventId: event.id,
        littleCount: hh.littleCount ?? 0,
      },
    });
    totalLittles += hh.littleCount ?? 0;

    for (const m of hh.members) {
      let person = m.email ? await prisma.person.findUnique({ where: { email: m.email } }) : null;
      if (!person) {
        person = await prisma.person.create({
          data: {
            name: m.name,
            email: m.email ?? null,
            phoneNumber: m.phoneNumber ?? null,
          },
        });
      }
      await prisma.personEvent.create({
        data: {
          personId: person.id,
          eventId: event.id,
          householdId: household.id,
          householdRole: m.role,
          role: 'PARTICIPANT',
        },
      });
      personEventCount++;
    }

    householdSummaries.push({
      label: hh.label,
      members: hh.members.length,
      littles: hh.littleCount ?? 0,
    });
  }

  // Verification
  const verifyCount = await prisma.personEvent.count({ where: { eventId: event.id } });
  const verifyHouseholds = await prisma.household.count({ where: { eventId: event.id } });

  const url = `http://localhost:3000/plan/${event.id}`;

  process.stdout.write(
    [
      '',
      '─── GTC-133 sub-commit (g) test event seeded ───',
      `Event ID:           ${event.id}`,
      `Event URL:          ${url}`,
      `Host (User):        ${user.email}`,
      `Host (Person):      ${hostPerson.name} (${hostPerson.id})`,
      `Status:             ${event.status} (note: schema has no SETUP — DRAFT is the pre-confirming state)`,
      `Start / End:        ${startDate.toISOString().slice(0, 10)} / ${endDate.toISOString().slice(0, 10)}`,
      '',
      'Households:',
      ...householdSummaries.map(
        (s) => `  • ${s.label.padEnd(20)} members=${s.members}  littles=${s.littles}`
      ),
      '',
      `PersonEvent rows:   ${verifyCount} (expected = ${personEventCount})`,
      `Households:         ${verifyHouseholds} (expected = ${HOUSEHOLDS.length})`,
      `Littles total:      ${totalLittles}`,
      '',
      'Note: the brief stated "16 people total (8 adults, 4 kids, 4 littles)".',
      'The listed household contents actually sum to 11 adults + 3 kids w/ jobs +',
      `${totalLittles} littles = ${11 + 3 + totalLittles} people. PersonEvent rows = ${personEventCount}`,
      '(littles are tracked via Household.littleCount only, no PersonEvent row).',
      '',
    ].join('\n')
  );

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
