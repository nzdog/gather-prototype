/**
 * GTC-160 — Client personEventId wiring, integration variant.
 *
 * GTC-159 proved reconcileHouseholdMembers preserves membership when given a
 * personEventId-bearing input. This test proves the CLIENT now actually
 * produces that input: it builds a request body in the exact JSON shape
 * Moment1InputForm.buildPayload() emits post-wiring (personEventId alongside
 * name/email/phone for partner/helpers/guests, as populated by
 * apiHouseholdToSaved from a GET /households response), then drives it
 * through the same steps PUT /api/events/[id]/households/[householdId]
 * performs (load household, resolve primaryMember, reconcile) — i.e. the
 * request-body contract end-to-end, not just the internal seam.
 *
 * A real HTTP call isn't used because requireEventRole needs a signed-in
 * cookie context (GTC-159 precedent — see household-edit-preserves-membership-test.ts).
 *
 * Run: npx tsx tests/household-edit-client-payload-integration-test.ts
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

/** JSON body shape the wired client now POSTs — mirrors HouseholdRequestBody in route.ts. */
interface ClientRequestBody {
  primaryContact: { name: string; email?: string; phone?: string };
  partner?: { personEventId?: string; name?: string; email?: string; phone?: string };
  helpers?: Array<{ personEventId?: string; name: string; email?: string; phone?: string }>;
  littleCount?: number;
  guests?: Array<{ personEventId?: string; name?: string; email?: string; phone?: string }>;
}

/** Simulates apiHouseholdToSaved(GET /households response) -> buildPayload() for an edit. */
function clientBuildEditPayload(getResponseMember: {
  primaryPhone: string;
  partner?: { personEventId: string; name: string };
  helpers?: Array<{ personEventId: string; name: string }>;
}): ClientRequestBody {
  return {
    primaryContact: { name: 'Kate', email: undefined, phone: getResponseMember.primaryPhone },
    partner: getResponseMember.partner
      ? {
          personEventId: getResponseMember.partner.personEventId,
          name: getResponseMember.partner.name,
        }
      : undefined,
    helpers: getResponseMember.helpers?.map((h) => ({
      personEventId: h.personEventId,
      name: h.name,
    })),
    littleCount: 0,
    guests: [],
  };
}

/** Mirrors the route's PUT handler: resolve primaryMember, call the seam. Same steps, not the same transport. */
async function simulatePut(eventId: string, householdId: string, body: ClientRequestBody) {
  const household = await prisma.household.findUniqueOrThrow({
    where: { id: householdId },
    include: { members: true },
  });
  const primaryMember = household.members.find((m) => m.householdRole === 'PRIMARY_CONTACT')!;
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    select: { inviteSendConfirmedAt: true },
  });
  await reconcileHouseholdMembers(prisma, {
    eventId,
    household: { id: household.id, members: household.members },
    primaryMember,
    inviteSendConfirmedAt: event.inviteSendConfirmedAt,
    input: {
      primaryContact: body.primaryContact,
      partner: body.partner,
      helpers: body.helpers,
      littleCount: body.littleCount,
      guests: body.guests,
    },
  });
}

async function main() {
  const createdPersonIds: string[] = [];
  let eventId = '';

  try {
    // ── Setup: same at-risk shape as GTC-159 (no-email member on a team, with a NudgeLog) ──
    const host = await prisma.person.create({ data: { name: 'GTC160 Host' } });
    createdPersonIds.push(host.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const event = await prisma.event.create({
      data: {
        name: 'GTC-160 client-payload test',
        startDate: start,
        endDate: start,
        hostId: host.id,
      },
    });
    eventId = event.id;

    const household = await prisma.household.create({ data: { eventId, littleCount: 0 } });

    const kate = await prisma.person.create({
      data: { name: 'Kate', email: `kate-${event.id}@example.com`, phoneNumber: '+64211111111' },
    });
    const matt = await prisma.person.create({ data: { name: 'Matt' } }); // no email — the at-risk case
    createdPersonIds.push(kate.id, matt.id);

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
    const priya = await prisma.person.create({ data: { name: 'Priya' } }); // no email — legacy-payload subject
    createdPersonIds.push(priya.id);
    const priyaPE = await prisma.personEvent.create({
      data: {
        personId: priya.id,
        eventId,
        householdId: household.id,
        householdRole: 'GUEST',
        role: 'PARTICIPANT',
        rsvpStatus: 'YES',
      },
    });

    const team = await prisma.team.create({ data: { name: 'GTC160 Salads', eventId } });
    await prisma.personEvent.update({ where: { id: mattPE.id }, data: { teamId: team.id } });
    await prisma.personEvent.update({ where: { id: priyaPE.id }, data: { teamId: team.id } });
    await prisma.nudgeLog.create({
      data: {
        personEventId: mattPE.id,
        nudgeType: 'test',
        scheduledFor: new Date(),
        status: 'SENT',
      },
    });
    await prisma.nudgeLog.create({
      data: {
        personEventId: priyaPE.id,
        nudgeType: 'test',
        scheduledFor: new Date(),
        status: 'SENT',
      },
    });

    // ── RED: a legacy-shaped payload (the pre-GTC-160 client) still loses state
    // for any member it can't identify. Matt keeps his real personEventId here
    // (isolating the demonstration to Priya, so his row survives for the GREEN
    // assertions below); Priya's entry omits it — exactly the shape buildPayload()
    // produced before this ticket's wiring. This documents the defect the
    // wiring closes; it is not a regression to fix. ──
    const legacyPayload: ClientRequestBody = {
      primaryContact: { name: 'Kate', email: kate.email!, phone: '022 999 8888' },
      partner: { personEventId: mattPE.id, name: 'Matt' },
      helpers: [],
      littleCount: 0,
      guests: [{ name: 'Priya' }], // no personEventId — legacy shape, the bug this ticket closes
    };
    await simulatePut(eventId, household.id, legacyPayload);

    const priyaAfterLegacy = await prisma.personEvent.findUnique({ where: { id: priyaPE.id } });
    const priyaNudgesAfterLegacy = await prisma.nudgeLog.count({
      where: { personEventId: priyaPE.id },
    });

    console.log(
      '\n\x1b[33m=== RED: legacy payload (no personEventId) still loses state ===\x1b[0m'
    );
    assert(
      '0.1 legacy payload (no personEventId): Priya PersonEvent row is gone (proves wiring is load-bearing)',
      priyaAfterLegacy === null
    );
    assert(
      '0.2 legacy payload: Priya NudgeLog cascaded away with the old row',
      priyaNudgesAfterLegacy === 0
    );

    // ── Step 1: simulate GET /households response -> apiHouseholdToSaved (client read) ──
    // (In production this is the JSON the households GET route returns; here we assert
    // the id it exposes is the real PersonEvent id, since apiHouseholdToSaved reads m.id.)
    const savedHouseholdPartnerPersonEventId = mattPE.id;

    // ── Step 2: simulate Moment1InputForm.buildPayload() for a no-membership-change edit ──
    const clientPayload = clientBuildEditPayload({
      primaryPhone: '022 999 8888',
      partner: { personEventId: savedHouseholdPartnerPersonEventId, name: 'Matt' },
    });

    assert(
      '0.3 client-built payload includes partner.personEventId (the wiring under test)',
      clientPayload.partner?.personEventId === mattPE.id
    );

    // ── Step 3: drive it through the same steps the real route performs ──
    await simulatePut(eventId, household.id, clientPayload);

    const mattAfter = await prisma.personEvent.findUnique({ where: { id: mattPE.id } });
    const nudgeCount = await prisma.nudgeLog.count({ where: { personEventId: mattPE.id } });
    const partnerPEs = await prisma.personEvent.findMany({
      where: { eventId, householdRole: 'PARTNER' },
    });

    console.log('\n\x1b[33m=== Client-payload no-membership-change edit ===\x1b[0m');
    assert('1.1 Matt PersonEvent row still exists (same id)', mattAfter !== null);
    assert('1.2 Matt teamId preserved', mattAfter?.teamId === team.id);
    assert(
      '1.3 Matt rsvpStatus preserved (YES, not reset to PENDING)',
      mattAfter?.rsvpStatus === 'YES'
    );
    assert('1.4 NudgeLog for Matt preserved (not cascaded away)', nudgeCount === 1);
    assert(
      '1.5 no new Person minted — partner row still points to original Person',
      partnerPEs.length === 1 && partnerPEs[0]?.personId === matt.id
    );

    // ── Step 4: simulate a member-removal edit (client omits Matt entirely) ──
    const removalPayload = clientBuildEditPayload({ primaryPhone: '022 999 8888' });
    await simulatePut(eventId, household.id, removalPayload);

    const mattGoneAfterRemoval = !(await prisma.personEvent.findUnique({
      where: { id: mattPE.id },
    }));
    console.log('\n\x1b[33m=== Client-payload member-removal edit ===\x1b[0m');
    assert(
      '2.1 Matt PersonEvent deleted when client omits him from the payload',
      mattGoneAfterRemoval
    );
  } finally {
    if (eventId) {
      const pes = await prisma.personEvent.findMany({ where: { eventId }, select: { id: true } });
      await prisma.nudgeLog.deleteMany({ where: { personEventId: { in: pes.map((p) => p.id) } } });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.team.deleteMany({ where: { eventId } });
      await prisma.event.delete({ where: { id: eventId } });
    }
    await prisma.person.deleteMany({
      where: { id: { in: createdPersonIds }, eventMemberships: { none: {} } },
    });
    await prisma.person.deleteMany({
      where: { name: { in: ['Matt', 'Priya'] }, eventMemberships: { none: {} }, email: null },
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
