/**
 * GTC-256 (phase 2) — the host is at her own party.
 *
 * DB-level regression test (house pattern, cf. household-edit-preserves-membership-test.ts).
 * Exercises the capture path, the sequence guarantee, the demotion guard and Ruling 6's
 * switch against a real database with manufactured state.
 *
 * The five things phase 2 must hold, and what each one looked like before it:
 *
 *   RED (pre-phase-2)                          GREEN (this test)
 *   ────────────────────────────────────────   ──────────────────────────────────────
 *   No PersonEvent for the host, on any        Her row exists, points at Event.hostId's
 *   Moment-flow event. All three identity      EXISTING Person (Ruling 10), carries
 *   paths return empty.                        role HOST + PRIMARY_CONTACT (7, 8).
 *
 *   "Hosting alone" had no representation      A household of ONE — not an absence
 *   at all.                                    (Ruling 2).
 *
 *   Her email in another household's guest     `hostHasMembership` is false before the
 *   row → createMember's create branch files   host household exists, so the households
 *   her `role: 'PARTICIPANT'`.                 POST refuses until it does.
 *
 *   Her email in HER OWN household's guest     `householdRole` stays PRIMARY_CONTACT,
 *   row → reconcile writes householdRole       `householdId` unmoved. Demotion would
 *   GUEST, which re-opens deletion, empties    re-open deletion and brick the household.
 *   the household of a primary and bricks
 *   the PUT (400, no PRIMARY_CONTACT).
 *
 *   Ruling 7 makes her her own household's     resolveHouseholdMuted returns MUTED for
 *   proxy channel by default, and a host       her household by default, and a host
 *   hosting alone is texted "1 person in       hosting alone cannot switch it on.
 *   your group hasn't confirmed yet" ABOUT
 *   HERSELF (Ruling 11).
 *
 * Run: npx tsx tests/host-household-capture-test.ts
 * Destructive to its own created rows only; cleans up in finally.
 */

import { PrismaClient } from '@prisma/client';
import { createHostHousehold, hostHasMembership } from '../src/lib/households/hostHousehold';
import { reconcileHouseholdMembers } from '../src/lib/households/reconcileMembers';
import { resolveHouseholdMuted, resolveHouseholdChannel } from '../src/lib/households/channel';

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

async function main() {
  const createdPersonIds: string[] = [];
  const createdEventIds: string[] = [];

  try {
    // ── Layer 0: resolveHouseholdMuted, as a pure function ────────────────
    //
    // Asserted before any DB work because it is the whole of Ruling 6's default and the
    // thing standing between Ruling 7 and a live send path. A NULL that reads as `false`
    // here is a host being texted about herself.
    const HOST = 'host-person-id';
    const two = [{ personId: HOST }, { personId: 'partner' }];

    assert(
      'Ruling 6: an ORDINARY household with no choice made SENDS — null is not a mute',
      resolveHouseholdMuted({ messagesMuted: null, members: [{ personId: 'someone' }] }, HOST) ===
        false
    );
    assert(
      "Ruling 6: the HOST's own household with no choice made is MUTED — the ruling's " +
        'intent, which Ruling 7 would otherwise have defaulted the other way',
      resolveHouseholdMuted({ messagesMuted: null, members: two }, HOST) === true
    );
    assert(
      'Ruling 6: she can switch her own household ON once there is somebody in it',
      resolveHouseholdMuted({ messagesMuted: false, members: two }, HOST) === false
    );
    assert(
      'Ruling 6: and back OFF again',
      resolveHouseholdMuted({ messagesMuted: true, members: two }, HOST) === true
    );
    assert(
      'Ruling 2 + 6 safety: a host hosting ALONE cannot switch hers on — a stored false ' +
        'is overridden, because a household of one has no household messages',
      resolveHouseholdMuted({ messagesMuted: false, members: [{ personId: HOST }] }, HOST) === true
    );
    assert(
      'and the safety is scoped to HER household only — an ordinary one-person household ' +
        'is untouched (the general member-count gate is Moment 4 §10.7, not this ticket)',
      resolveHouseholdMuted({ messagesMuted: null, members: [{ personId: 'gran' }] }, HOST) ===
        false
    );

    // ── Setup: an event exactly as POST /api/events leaves it ─────────────
    //
    // User → Person → Event.hostId → EventRole{HOST}, and NO PersonEvent. That is the
    // state the ticket measured on every event in the database, on both paths.
    const hostPerson = await prisma.person.create({
      data: { name: 'GTC256 Host', email: `gtc256-host-${Date.now()}@example.com` },
    });
    createdPersonIds.push(hostPerson.id);

    const start = new Date();
    start.setDate(start.getDate() + 14);
    const event = await prisma.event.create({
      data: {
        name: 'GTC-256 host-household test',
        startDate: start,
        endDate: start,
        hostId: hostPerson.id,
      },
    });
    createdEventIds.push(event.id);

    // ── The sequence guarantee, before ────────────────────────────────────
    assert(
      'SEQUENCE: the host has no membership on a freshly created event — the households ' +
        'POST refuses until she does',
      (await hostHasMembership(prisma, event.id, hostPerson.id)) === false
    );

    const personCountBefore = await prisma.person.count();

    // ── Ruling 2: "I'm hosting alone" ─────────────────────────────────────
    const alone = await prisma.$transaction((tx) =>
      createHostHousehold(tx, {
        eventId: event.id,
        hostPersonId: hostPerson.id,
        sentAt: null,
        input: { alone: true, name: 'Kate Hosting', phone: '021 555 0100' },
      })
    );

    const aloneHousehold = await prisma.household.findUniqueOrThrow({
      where: { id: alone.householdId },
      include: { members: { include: { person: true } } },
    });

    assert(
      'Ruling 2: "I\'m hosting alone" produces a household of ONE — not an absence',
      aloneHousehold.members.length === 1
    );
    assert(
      "Ruling 10: her PersonEvent points at Event.hostId's EXISTING Person",
      aloneHousehold.members[0].personId === hostPerson.id
    );
    assert(
      'Ruling 10: and no second Person row was minted for her',
      (await prisma.person.count()) === personCountBefore
    );
    assert(
      'Ruling 8: her membership carries role HOST — so ensureEventTokens issues her no ' +
        'PARTICIPANT token and the shared-link claim list cannot offer her name',
      aloneHousehold.members[0].role === 'HOST'
    );
    assert(
      'Ruling 7: and householdRole PRIMARY_CONTACT',
      aloneHousehold.members[0].householdRole === 'PRIMARY_CONTACT'
    );
    assert(
      'her name and phone were captured onto her own Person row',
      aloneHousehold.members[0].person.name === 'Kate Hosting' &&
        aloneHousehold.members[0].person.phoneNumber === '+6421555 0100'.replace(/\s/g, '')
    );
    assert(
      'Ruling 10: her account email survived the capture — it is read from the row, ' +
        'never taken from the client (Person.email is @unique and joins her to her User)',
      aloneHousehold.members[0].person.email === hostPerson.email
    );

    // ── Ruling 11: the alone host is not texted about herself ─────────────
    assert(
      "Ruling 7: with no pick made she IS her own household's channel — the mechanism " +
        'that makes Ruling 6 blocking',
      resolveHouseholdChannel(aloneHousehold) === aloneHousehold.members[0].id
    );
    assert(
      'RULING 11: and her household resolves MUTED, so findProxyNudgeCandidates never ' +
        'texts a host hosting alone "1 person in your group hasn\'t confirmed yet" about ' +
        'herself',
      resolveHouseholdMuted(aloneHousehold, event.hostId) === true
    );

    // ── The sequence guarantee, after ─────────────────────────────────────
    assert(
      'SEQUENCE: her row now exists, so other households may be entered',
      (await hostHasMembership(prisma, event.id, hostPerson.id)) === true
    );

    // ── Create-only: the route refuses a second household ─────────────────
    let refused = false;
    try {
      await prisma.$transaction((tx) =>
        createHostHousehold(tx, {
          eventId: event.id,
          hostPersonId: hostPerson.id,
          sentAt: null,
          input: { alone: true },
        })
      );
    } catch {
      refused = true;
    }
    assert('capture is CREATE-ONLY — a second host household is refused', refused);

    // ── THE DEMOTION GUARD ────────────────────────────────────────────────
    //
    // Her own email typed into a guest row of her OWN household — a form bug, a stale
    // client, or her typing it. Pre-guard, `existing.householdId === household.id` is
    // true and reconcile writes `householdRole: 'GUEST'`. Three things follow: she lands
    // in `existingNonPrimary` so the next edit that omits her DELETES her row and
    // cascades her NudgeLog; the household is left with no PRIMARY_CONTACT, which makes
    // the PUT 400 and the household uneditable; and resolveHouseholdChannel returns null
    // so the proxy finder skips it.
    const hostRowBefore = aloneHousehold.members[0];

    await prisma.$transaction((tx) =>
      reconcileHouseholdMembers(tx, {
        eventId: event.id,
        household: {
          id: aloneHousehold.id,
          members: aloneHousehold.members.map((m) => ({
            id: m.id,
            personId: m.personId,
            householdRole: m.householdRole,
          })),
        },
        primaryMember: {
          id: hostRowBefore.id,
          personId: hostRowBefore.personId,
          householdRole: hostRowBefore.householdRole,
        },
        sentAt: null,
        input: {
          primaryContact: { name: 'Kate Hosting', email: hostPerson.email ?? undefined },
          guests: [{ name: 'Kate Hosting', email: hostPerson.email ?? undefined }],
        },
      })
    );

    const afterDemotionAttempt = await prisma.personEvent.findUniqueOrThrow({
      where: { id: hostRowBefore.id },
    });

    assert(
      'DEMOTION GUARD: her householdRole is still PRIMARY_CONTACT after her own email ' +
        "appears in her household's guest rows (Ruling 7)",
      afterDemotionAttempt.householdRole === 'PRIMARY_CONTACT'
    );
    assert(
      'DEMOTION GUARD: her householdId was not moved',
      afterDemotionAttempt.householdId === aloneHousehold.id
    );
    assert('DEMOTION GUARD: her role is still HOST', afterDemotionAttempt.role === 'HOST');
    assert(
      'DEMOTION GUARD: and no duplicate row was created for her',
      (await prisma.personEvent.count({
        where: { personId: hostPerson.id, eventId: event.id },
      })) === 1
    );

    const stillHasPrimary = await prisma.personEvent.count({
      where: { householdId: aloneHousehold.id, householdRole: 'PRIMARY_CONTACT' },
    });
    assert(
      'DEMOTION GUARD: the household still has a PRIMARY_CONTACT, so the PUT route does ' +
        'not 400 and the household stays editable',
      stillHasPrimary === 1
    );

    // ── Ruling 7: she cannot be pulled into ANOTHER household ─────────────
    const otherPrimary = await prisma.person.create({
      data: { name: 'Gran', email: `gtc256-gran-${Date.now()}@example.com` },
    });
    createdPersonIds.push(otherPrimary.id);

    const otherHousehold = await prisma.household.create({
      data: { eventId: event.id, littleCount: 0 },
    });
    const otherPrimaryRow = await prisma.personEvent.create({
      data: {
        personId: otherPrimary.id,
        eventId: event.id,
        role: 'PARTICIPANT',
        householdId: otherHousehold.id,
        householdRole: 'PRIMARY_CONTACT',
      },
    });

    await prisma.$transaction((tx) =>
      reconcileHouseholdMembers(tx, {
        eventId: event.id,
        household: {
          id: otherHousehold.id,
          members: [
            {
              id: otherPrimaryRow.id,
              personId: otherPrimaryRow.personId,
              householdRole: otherPrimaryRow.householdRole,
            },
          ],
        },
        primaryMember: {
          id: otherPrimaryRow.id,
          personId: otherPrimaryRow.personId,
          householdRole: otherPrimaryRow.householdRole,
        },
        sentAt: null,
        input: {
          primaryContact: { name: 'Gran', email: otherPrimary.email ?? undefined },
          partner: { name: 'Kate Hosting', email: hostPerson.email ?? undefined },
        },
      })
    );

    const afterCrossAttempt = await prisma.personEvent.findUniqueOrThrow({
      where: { id: hostRowBefore.id },
    });
    assert(
      'Ruling 7: she cannot join another household as a PARTNER — her householdId is ' +
        'unmoved and her householdRole unchanged',
      afterCrossAttempt.householdId === aloneHousehold.id &&
        afterCrossAttempt.householdRole === 'PRIMARY_CONTACT'
    );

    // ── Ruling 2 + 6 on a household that grows ────────────────────────────
    //
    // She adds a partner. Now there IS somebody for Gather to talk to her about, so the
    // switch becomes meaningful — and it is still off until she says otherwise.
    await prisma.$transaction((tx) =>
      reconcileHouseholdMembers(tx, {
        eventId: event.id,
        household: {
          id: aloneHousehold.id,
          members: [
            {
              id: hostRowBefore.id,
              personId: hostRowBefore.personId,
              householdRole: 'PRIMARY_CONTACT',
            },
          ],
        },
        primaryMember: {
          id: hostRowBefore.id,
          personId: hostRowBefore.personId,
          householdRole: 'PRIMARY_CONTACT',
        },
        sentAt: null,
        input: {
          primaryContact: { name: 'Kate Hosting', email: hostPerson.email ?? undefined },
          partner: { name: 'Sam', phone: '021 555 0199' },
        },
      })
    );

    const grown = await prisma.household.findUniqueOrThrow({
      where: { id: aloneHousehold.id },
      include: { members: true },
    });
    assert(
      'Ruling 2: her household of one grows into a household of two',
      grown.members.length === 2
    );
    assert(
      'Ruling 6: still MUTED with no choice made, even now there is somebody in it',
      resolveHouseholdMuted(grown, event.hostId) === true
    );

    await prisma.household.update({
      where: { id: grown.id },
      data: { messagesMuted: false },
    });
    const switchedOn = await prisma.household.findUniqueOrThrow({
      where: { id: grown.id },
      include: { members: true },
    });
    assert(
      'Ruling 6: and she can switch it on — the choice is hers, and it round-trips',
      resolveHouseholdMuted(switchedOn, event.hostId) === false
    );
    assert(
      'GTC-172 is untouched: null still means "not picked" and still resolves to the ' +
        'PRIMARY_CONTACT — the no-backfill property is intact',
      switchedOn.contactPersonEventId === null &&
        resolveHouseholdChannel(switchedOn) === hostRowBefore.id
    );
  } finally {
    for (const eventId of createdEventIds) {
      await prisma.household.updateMany({
        where: { eventId },
        data: { contactPersonEventId: null },
      });
      await prisma.personEvent.deleteMany({ where: { eventId } });
      await prisma.household.deleteMany({ where: { eventId } });
      await prisma.event.deleteMany({ where: { id: eventId } });
    }
    await prisma.person.deleteMany({
      where: { id: { in: createdPersonIds }, eventMemberships: { none: {} } },
    });
    await prisma.person.deleteMany({
      where: { name: 'Sam', eventMemberships: { none: {} }, email: null },
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
