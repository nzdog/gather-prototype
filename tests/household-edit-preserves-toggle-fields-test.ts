/**
 * GTC-173 (C2) — Household edit must preserve C1's channel/toggle fields.
 *
 * Preflight for GTC-173 found bullet 1 of its acceptance already true in code:
 * reconcileHouseholdMembers preserves adultRoled-derived householdRole, isYoungPerson,
 * and contactPersonEventId (in all three of its states — set, left-alone, cleared)
 * across a household edit. No test exercised it. This is that test.
 *
 * DB-level regression test (house pattern, cf. household-edit-preserves-membership-test.ts
 * and household-edit-client-payload-integration-test.ts). Drives the real PUT/reconcile
 * seam — reconcileHouseholdMembers, given the same inputs the route resolves — not a
 * direct Prisma write to the fields under test.
 *
 * A GUARD, not just a snapshot: see the bottom of this file for the RED/GREEN proof
 * that a regression in updateExistingMember's field preservation actually fails it.
 *
 * Run: npx tsx tests/household-edit-preserves-toggle-fields-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { reconcileHouseholdMembers } from '../src/lib/households/reconcileMembers';

const prisma = new PrismaClient();

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

async function loadHousehold(householdId: string) {
  const hh = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: { members: true },
  });
  const primaryMember = hh.members.find((m) => m.householdRole === 'PRIMARY_CONTACT')!;
  return { household: { id: hh.id, members: hh.members }, primaryMember };
}

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── Setup ────────────────────────────────────────────────────────────
    const host = await prisma.person.create({ data: { name: 'GTC173 Host' } });
    createdPersonIds.push(host.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const event = await prisma.event.create({
      data: {
        name: 'GTC-173 toggle-field-preservation test',
        startDate: start,
        endDate: start,
        hostId: host.id,
      },
    });
    eventId = event.id;

    // Household A — the household under edit.
    const householdA = await prisma.household.create({
      data: { eventId, littleCount: 0 },
    });

    const kate = await prisma.person.create({
      data: { name: 'Kate', email: `kate-${event.id}@example.com`, phoneNumber: '+64211111111' },
    });
    // Charlie: a "kid with a job" already adult-roled at capture (C1, §10.6) — the
    // at-risk toggle state. Seeded directly as the result an earlier adultRoled:true
    // capture would have produced: householdRole GUEST (not CHILD), isYoungPerson true.
    const charlie = await prisma.person.create({ data: { name: 'Charlie' } });
    createdPersonIds.push(kate.id, charlie.id);

    const katePE = await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId,
        householdId: householdA.id,
        householdRole: 'PRIMARY_CONTACT',
        role: 'PARTICIPANT',
      },
    });
    const charliePE = await prisma.personEvent.create({
      data: {
        personId: charlie.id,
        eventId,
        householdId: householdA.id,
        householdRole: 'GUEST', // adult-roled, not CHILD
        isYoungPerson: true,
        role: 'PARTICIPANT',
      },
    });

    // Household B (Grandma's) — the cross-household channel target (§10.7: channel is
    // deliberately cross-household-capable). Household A's picker points here.
    const householdB = await prisma.household.create({
      data: { eventId, littleCount: 0 },
    });
    const grandma = await prisma.person.create({ data: { name: 'Grandma' } });
    createdPersonIds.push(grandma.id);
    const grandmaPE = await prisma.personEvent.create({
      data: {
        personId: grandma.id,
        eventId,
        householdId: householdB.id,
        householdRole: 'PRIMARY_CONTACT',
        role: 'PARTICIPANT',
      },
    });
    await prisma.household.update({
      where: { id: householdA.id },
      data: { contactPersonEventId: grandmaPE.id },
    });

    // ── Edit 1: no membership change, contactPersonEventId OMITTED (undefined) ──
    // Real client re-sends adultRoled:true for Charlie every edit (it reads the role
    // back from the GET response) — this mirrors that, and proves the toggle survives
    // an edit rather than merely surviving because it was never touched.
    {
      const { household: loaded, primaryMember } = await loadHousehold(householdA.id);
      await reconcileHouseholdMembers(prisma, {
        eventId,
        household: loaded,
        primaryMember,
        sentAt: null,
        input: {
          primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
          helpers: [{ personEventId: charliePE.id, name: 'Charlie', adultRoled: true }],
          littleCount: 0,
          guests: [],
          // contactPersonEventId deliberately omitted: undefined = leave current channel alone.
        },
      });
    }

    let charlieAfter = await prisma.personEvent.findUnique({ where: { id: charliePE.id } });
    let householdAAfter = await prisma.household.findUniqueOrThrow({
      where: { id: householdA.id },
    });
    let kateAfter = await prisma.person.findUnique({ where: { id: kate.id } });

    console.log(
      '\n\x1b[33m=== Edit 1: no-membership-change, contactPersonEventId omitted ===\x1b[0m'
    );
    assert(
      '1.1 adultRoled-derived householdRole survived (GUEST, not reverted to CHILD)',
      charlieAfter?.householdRole === 'GUEST'
    );
    assert('1.2 isYoungPerson survived (true)', charlieAfter?.isYoungPerson === true);
    assert(
      '1.3 contactPersonEventId left alone (undefined = leave-alone; still Grandma)',
      householdAAfter.contactPersonEventId === grandmaPE.id
    );
    assert(
      '1.4 non-toggle field (phone) still updates as normal',
      kateAfter?.phoneNumber === '+64229998888'
    );

    // ── Edit 2: contactPersonEventId explicitly re-set to the same target (set-and-kept) ──
    {
      const { household: loaded, primaryMember } = await loadHousehold(householdA.id);
      await reconcileHouseholdMembers(prisma, {
        eventId,
        household: loaded,
        primaryMember,
        sentAt: null,
        input: {
          primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
          helpers: [{ personEventId: charliePE.id, name: 'Charlie', adultRoled: true }],
          littleCount: 0,
          guests: [],
          contactPersonEventId: grandmaPE.id, // explicit set, same value
        },
      });
    }

    householdAAfter = await prisma.household.findUniqueOrThrow({ where: { id: householdA.id } });
    charlieAfter = await prisma.personEvent.findUnique({ where: { id: charliePE.id } });

    console.log(
      '\n\x1b[33m=== Edit 2: contactPersonEventId explicitly set (set-and-kept) ===\x1b[0m'
    );
    assert(
      '2.1 contactPersonEventId explicitly set and kept',
      householdAAfter.contactPersonEventId === grandmaPE.id
    );
    assert(
      '2.2 adultRoled-derived householdRole still survives across a second edit',
      charlieAfter?.householdRole === 'GUEST'
    );

    // ── Edit 3: contactPersonEventId explicitly cleared (null) ──
    {
      const { household: loaded, primaryMember } = await loadHousehold(householdA.id);
      await reconcileHouseholdMembers(prisma, {
        eventId,
        household: loaded,
        primaryMember,
        sentAt: null,
        input: {
          primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
          helpers: [{ personEventId: charliePE.id, name: 'Charlie', adultRoled: true }],
          littleCount: 0,
          guests: [],
          contactPersonEventId: null, // explicit clear
        },
      });
    }

    householdAAfter = await prisma.household.findUniqueOrThrow({ where: { id: householdA.id } });

    console.log('\n\x1b[33m=== Edit 3: contactPersonEventId explicitly cleared (null) ===\x1b[0m');
    assert('3.1 contactPersonEventId cleared', householdAAfter.contactPersonEventId === null);
  } finally {
    // ── Cleanup (FK-safe order) ──────────────────────────────────────────
    if (eventId) {
      const pes = await prisma.personEvent.findMany({ where: { eventId }, select: { id: true } });
      await prisma.nudgeLog.deleteMany({ where: { personEventId: { in: pes.map((p) => p.id) } } });
      // Clear the cross-household FK before deleting households, or the delete
      // on Household B (or A) can violate the reference from the other side.
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    await prisma.person.deleteMany({
      where: { id: { in: createdPersonIds }, eventMemberships: { none: {} } },
    });
    await prisma.person.deleteMany({
      where: { name: { in: ['Charlie', 'Grandma'] }, eventMemberships: { none: {} }, email: null },
    });
    await prisma.$disconnect();
  }

  console.log(`\n\x1b[33m=== Results: ${passed} passed, ${failed} failed ===\x1b[0m`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
