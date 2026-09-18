/**
 * GTC-159 — Household edit must not destroy non-primary member state.
 *
 * DB-level regression test (house pattern, cf. verify-personevent-team-setnull.ts).
 * Exercises reconcileHouseholdMembers against a real dev DB with a manufactured
 * at-risk state (a no-email member on a team, with a NudgeLog).
 *
 * RED (pre-fix, delete-and-recreate): non-primary PersonEvent ids churn, teamId
 * and RSVP reset, NudgeLog cascades away, a duplicate Person is minted.
 * GREEN (diff-upsert): a no-membership-change edit preserves everything; a
 * member-removal deletes exactly the removed member's row.
 *
 * Run: npx tsx tests/household-edit-preserves-membership-test.ts
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
    const host = await prisma.person.create({ data: { name: 'GTC159 Host' } });
    createdPersonIds.push(host.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const event = await prisma.event.create({
      data: {
        name: 'GTC-159 household-edit test',
        startDate: start,
        endDate: start,
        hostId: host.id,
      },
    });
    eventId = event.id;

    const household = await prisma.household.create({
      data: { eventId, littleCount: 0 },
    });

    const kate = await prisma.person.create({
      data: { name: 'Kate', email: `kate-${event.id}@example.com`, phoneNumber: '+64211111111' },
    });
    const matt = await prisma.person.create({ data: { name: 'Matt' } }); // no email — the at-risk case
    const charlie = await prisma.person.create({ data: { name: 'Charlie' } }); // no email child
    createdPersonIds.push(kate.id, matt.id, charlie.id);

    await prisma.personEvent.create({
      data: {
        personId: kate.id,
        eventId,
        householdId: household.id,
        householdRole: 'PRIMARY_CONTACT',
        role: 'PARTICIPANT',
      },
    });
    const mattPE = await prisma.personEvent.create({
      data: {
        personId: matt.id,
        eventId,
        householdId: household.id,
        householdRole: 'PARTNER',
        role: 'PARTICIPANT',
        rsvpStatus: 'YES',
      },
    });
    const charliePE = await prisma.personEvent.create({
      data: {
        personId: charlie.id,
        eventId,
        householdId: household.id,
        householdRole: 'CHILD',
        role: 'PARTICIPANT',
      },
    });

    const team = await prisma.team.create({ data: { name: 'GTC159 Salads', eventId } });
    await prisma.personEvent.update({ where: { id: mattPE.id }, data: { teamId: team.id } });
    await prisma.nudgeLog.create({
      data: {
        personEventId: mattPE.id,
        nudgeType: 'test',
        scheduledFor: new Date(),
        status: 'SENT',
      },
    });

    const beforeNonPrimaryIds = [mattPE.id, charliePE.id].sort();

    // ── Edit 1: no membership change (change primary phone only) ──────────
    {
      const { household: loaded, primaryMember } = await loadHousehold(household.id);
      await reconcileHouseholdMembers(prisma, {
        eventId,
        household: loaded,
        primaryMember,
        inviteSendConfirmedAt: null,
        input: {
          primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
          partner: { personEventId: mattPE.id, name: 'Matt' },
          helpers: [{ personEventId: charliePE.id, name: 'Charlie' }],
          littleCount: 0,
          guests: [],
        },
      });
    }

    const afterNonPrimary = await prisma.personEvent.findMany({
      where: { eventId, householdRole: { not: 'PRIMARY_CONTACT' } },
    });
    const afterNonPrimaryIds = afterNonPrimary.map((pe) => pe.id).sort();
    const mattAfter = await prisma.personEvent.findUnique({ where: { id: mattPE.id } });
    const nudgeCount = await prisma.nudgeLog.count({ where: { personEventId: mattPE.id } });
    const partnerPEs = await prisma.personEvent.findMany({
      where: { eventId, householdRole: 'PARTNER' },
    });

    console.log('\n\x1b[33m=== Edit 1: no-membership-change edit ===\x1b[0m');
    assert(
      '1.1 non-primary PersonEvent id set is unchanged (no delete-recreate)',
      JSON.stringify(afterNonPrimaryIds) === JSON.stringify(beforeNonPrimaryIds)
    );
    assert('1.2 Matt PersonEvent row still exists', mattAfter !== null);
    assert('1.3 Matt teamId preserved', mattAfter?.teamId === team.id);
    assert(
      '1.4 Matt rsvpStatus preserved (YES, not reset to PENDING)',
      mattAfter?.rsvpStatus === 'YES'
    );
    assert('1.5 NudgeLog for Matt preserved (not cascaded away)', nudgeCount === 1);
    assert(
      '1.6 no new Person minted — partner row still points to original Person',
      partnerPEs.length === 1 && partnerPEs[0]?.personId === matt.id
    );

    // ── Edit 2: remove one member (drop Charlie) ─────────────────────────
    {
      const { household: loaded, primaryMember } = await loadHousehold(household.id);
      await reconcileHouseholdMembers(prisma, {
        eventId,
        household: loaded,
        primaryMember,
        inviteSendConfirmedAt: null,
        input: {
          primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
          partner: { personEventId: mattPE.id, name: 'Matt' },
          helpers: [],
          littleCount: 0,
          guests: [],
        },
      });
    }

    const afterRemoval = await prisma.personEvent.findMany({
      where: { eventId, householdRole: { not: 'PRIMARY_CONTACT' } },
    });
    const charlieGone = !(await prisma.personEvent.findUnique({ where: { id: charliePE.id } }));
    const mattStill = !!(await prisma.personEvent.findUnique({ where: { id: mattPE.id } }));

    console.log('\n\x1b[33m=== Edit 2: member-removal edit ===\x1b[0m');
    assert('2.1 exactly one non-primary member remains', afterRemoval.length === 1);
    assert('2.2 removed member (Charlie) PersonEvent deleted', charlieGone);
    assert('2.3 retained member (Matt) PersonEvent id stable', mattStill);
  } finally {
    // ── Cleanup (FK-safe order) ──────────────────────────────────────────
    if (eventId) {
      const pes = await prisma.personEvent.findMany({ where: { eventId }, select: { id: true } });
      await prisma.nudgeLog.deleteMany({ where: { personEventId: { in: pes.map((p) => p.id) } } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    // Delete any Person rows named Matt/Charlie left over (incl. duplicates from the buggy path)
    await prisma.person.deleteMany({
      where: { id: { in: createdPersonIds }, eventMemberships: { none: {} } },
    });
    await prisma.person.deleteMany({
      where: { name: { in: ['Matt', 'Charlie'] }, eventMemberships: { none: {} }, email: null },
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
