/**
 * GTC-192 (J1) — seed two events for looking at the glance screen.
 *
 * Phase 2's proof is "a browser walk on a seeded event, plus a deliberately oversized
 * one" (this ticket's Execution phasing). This builds both, plus the session cookie the
 * host-scoped page needs, and prints the two URLs.
 *
 * Event A — the mixed board. Every one of the five strip states on screen at once,
 * arranged after the reference's own cast so the screen can be compared to the mockup:
 * a red by expired maybe, a red by reversal, ambers, greens, a NOT_CHASED person holding
 * an expired maybe (Ruling 14 made visible), an OUT person, and a household-less guest.
 *
 * Event B — the oversized board. Ruling 5 says green never folds at any event size, and
 * the only way to see that is to look at an event big enough to want to.
 *
 * Re-runnable: it deletes anything it made before, by the tag below, and makes it again.
 *
 * Run: npx tsx scripts/seed-gtc192-glance.ts
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

const TAG = 'gtc192-glance';
const EMAIL = `${TAG}@example.com`;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

type Spec = {
  name: string;
  householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD';
  /** PENDING → amber, ACCEPTED → green, DECLINED → red (reversal), MAYBE → amber or red */
  rows?: {
    name: string;
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
    expired?: boolean;
    critical?: boolean;
  }[];
  dontChase?: boolean;
  out?: boolean;
  /**
   * Phase 4: which team this person is on, and therefore which rows they may be offered.
   *
   * WITHOUT THIS THE REASSIGN PICKER IS EMPTY AND LOOKS BROKEN. `PersonEvent.teamId` was
   * null for everyone in the phase 2/3 seed, and the same-team rule (GTC-171) refuses a
   * null-team candidate for an ITEM row — so a browser walk would have shown a picker with
   * nothing in it and no way to tell a bug from the rule working. Two teams, so the rule
   * is visible REFUSING as well as permitting.
   *
   * The host is deliberately on NO team — see src/lib/assignment/same-team.ts on why
   * putting her on one would be wrong three times over. Her rows are reachable through
   * Ruling 9's self-pick instead.
   */
  team?: 'Mains' | 'Desserts';
  /**
   * Phase 4: a valid NZ mobile, so this person's REMIND takes the SMS leg.
   *
   * THE TWO LEGS DO NOT FAIL THE SAME WAY, and the walk should show both. `sendSms`
   * returns `{success:false}` when TNZ is unconfigured, so the route answers 502 and the
   * surface says so. `sendNudgeEmail` does NOT inspect Resend's returned `error` object
   * (src/lib/email.ts), so an invalid key comes back as a SUCCESS — see the phase 4
   * evidence in docs/tickets/GTC-192.md. Everyone else here is email-only, which is why
   * that second, quieter failure is visible on the same board.
   */
  phone?: string;
};

async function wipe() {
  const events = await prisma.event.findMany({
    where: { name: { startsWith: 'GTC-192 glance' } },
    select: { id: true },
  });
  for (const { id } of events) {
    await prisma.assignment.deleteMany({ where: { item: { team: { eventId: id } } } });
    await prisma.item.deleteMany({ where: { team: { eventId: id } } });
    await prisma.team.deleteMany({ where: { eventId: id } });
    await prisma.accessToken.deleteMany({ where: { eventId: id } });
    await prisma.personEvent.deleteMany({ where: { eventId: id } });
    await prisma.household.deleteMany({ where: { eventId: id } });
    await prisma.eventRole.deleteMany({ where: { eventId: id } });
    await prisma.event.delete({ where: { id } }).catch(() => {});
  }
  await prisma.person.deleteMany({ where: { email: { contains: `+${TAG}@` } } });
}

async function buildEvent(
  user: { id: string },
  hostPersonId: string,
  label: string,
  cast: { household: string; members: Spec[] }[],
  unhoused: Spec[],
  /** Ruling 8: items with no Assignment row at all. Criticals name the strip; the rest count. */
  loose: { name: string; critical: boolean }[] = []
) {
  const now = new Date();
  const sentAt = new Date(now.getTime() - 10 * DAY);
  const event = await prisma.event.create({
    data: {
      name: `GTC-192 glance — ${label}`,
      startDate: new Date(now.getTime() + 100 * HOUR),
      endDate: new Date(now.getTime() + 130 * HOUR),
      hostId: hostPersonId,
      status: 'CONFIRMING',
      sentAt,
    },
  });
  await prisma.eventRole.create({ data: { userId: user.id, eventId: event.id, role: 'HOST' } });
  const teams = {
    Mains: await prisma.team.create({ data: { eventId: event.id, name: 'Mains' } }),
    Desserts: await prisma.team.create({ data: { eventId: event.id, name: 'Desserts' } }),
  };
  const team = teams.Mains;

  let seq = 0;
  async function addPerson(spec: Spec, householdId: string | null, isHost: boolean) {
    seq += 1;
    const person = isHost
      ? await prisma.person.findUniqueOrThrow({ where: { id: hostPersonId } })
      : await prisma.person.create({
          data: {
            name: spec.name,
            email: `${label}-${seq}+${TAG}@example.com`,
            phoneNumber: spec.phone ?? null,
          },
        });
    await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId: event.id,
        role: isHost ? 'HOST' : 'PARTICIPANT',
        // The host stays on no team, by design. Everyone else gets one so the picker has
        // something to offer and something to refuse.
        teamId: isHost ? null : teams[spec.team ?? 'Mains'].id,
        householdId,
        householdRole: spec.householdRole,
        nudgeMark: spec.dontChase ? 'DONT_CHASE' : null,
        attendanceAnswer: spec.out ? 'NO' : null,
        sentAt,
      },
    });
    for (const row of spec.rows ?? []) {
      const item = await prisma.item.create({
        data: {
          // The row lives on the HOLDER's team, so the same-team rule has a real referent.
          teamId: isHost ? team.id : teams[spec.team ?? 'Mains'].id,
          name: row.name,
          kind: 'ITEM',
          critical: row.critical ?? false,
          // 200h before a needed-by 130h away puts the decide-by 70h in the past.
          decideByOffsetHours: row.expired ? 200 : null,
        },
      });
      await prisma.assignment.create({
        data: { itemId: item.id, personId: person.id, response: row.response },
      });
    }
  }

  for (const { members } of cast) {
    const hh = await prisma.household.create({ data: { eventId: event.id } });
    for (const spec of members) await addPerson(spec, hh.id, spec.name === 'Kate Whittaker');
  }
  for (const spec of unhoused) await addPerson(spec, null, false);

  for (const item of loose) {
    await prisma.item.create({
      data: { teamId: team.id, name: item.name, kind: 'ITEM', critical: item.critical },
    });
  }

  return event.id;
}

async function main() {
  await wipe();

  const user = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {},
    create: { email: EMAIL },
  });
  const hostPerson = await prisma.person.upsert({
    where: { email: EMAIL },
    update: { userId: user.id },
    create: { name: 'Kate Whittaker', email: EMAIL, userId: user.id },
  });

  await prisma.session.deleteMany({ where: { userId: user.id } });
  const token = randomBytes(24).toString('hex');
  await prisma.session.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 7 * DAY) },
  });

  // ── Event A: the mixed board ────────────────────────────────────────────
  const mixed = await buildEvent(
    user,
    hostPerson.id,
    'mixed',
    [
      {
        household: 'Whittaker',
        members: [
          // The host, holding the critical ham on a row she picked herself.
          {
            name: 'Kate Whittaker',
            householdRole: 'PRIMARY_CONTACT',
            rows: [{ name: 'The ham', response: 'PENDING', critical: true }],
          },
          {
            name: 'Rob Whittaker',
            householdRole: 'PARTNER',
            rows: [{ name: 'The gravy', response: 'ACCEPTED' }],
          },
        ],
      },
      {
        household: 'Turner',
        members: [
          {
            name: 'Amelia Turner',
            householdRole: 'PRIMARY_CONTACT',
            team: 'Mains',
            rows: [
              { name: 'The trifle', response: 'MAYBE' },
              { name: 'The pavlova', response: 'MAYBE', expired: true, critical: true },
            ],
          },
          {
            name: 'Charlotte Turner',
            householdRole: 'PARTNER',
            team: 'Mains',
            rows: [{ name: 'The salad', response: 'ACCEPTED' }],
          },
          // GTC-207's kid with a job: CHILD role, on the team, and therefore OFFERED in the
          // reassign picker. The child rule is message-only and must never reach assignment.
          {
            name: 'James Turner',
            householdRole: 'CHILD',
            team: 'Mains',
            rows: [{ name: 'The crackers', response: 'ACCEPTED' }],
          },
        ],
      },
      {
        household: 'Nguyen',
        members: [
          // The one person on the board with a phone: her REMIND takes the SMS leg and
          // fails honestly at the provider, where the email-only reds do not.
          {
            name: 'Chloe Nguyen',
            team: 'Desserts',
            householdRole: 'PRIMARY_CONTACT',
            phone: '+64211234567',
            rows: [{ name: 'The trifle bowl', response: 'DECLINED' }],
          },
          {
            name: 'Minh Nguyen',
            team: 'Desserts',
            householdRole: 'PARTNER',
            rows: [{ name: 'The bread', response: 'ACCEPTED' }],
          },
          {
            name: 'Grace Nguyen',
            team: 'Desserts',
            householdRole: 'GUEST',
            rows: [{ name: 'The cheese', response: 'PENDING' }],
          },
        ],
      },
      {
        household: 'Dalton',
        members: [
          { name: 'Ray Dalton', householdRole: 'PRIMARY_CONTACT', out: true },
          {
            name: 'Sarah Dalton',
            householdRole: 'PARTNER',
            rows: [{ name: 'The wine', response: 'PENDING' }],
          },
        ],
      },
      {
        household: "O'Brien",
        members: [
          {
            name: 'Connor OBrien',
            team: 'Desserts',
            householdRole: 'PRIMARY_CONTACT',
            rows: [{ name: 'The ice', response: 'PENDING' }],
          },
          // Ruling 14 on screen: an expired maybe on the person Kate switched off stays grey.
          {
            name: 'Aoife OBrien',
            team: 'Desserts',
            householdRole: 'PARTNER',
            dontChase: true,
            rows: [{ name: 'The cake', response: 'MAYBE', expired: true, critical: true }],
          },
        ],
      },
    ],
    [
      {
        name: 'Bob Unhoused',
        householdRole: 'GUEST',
        rows: [{ name: 'The napkins', response: 'ACCEPTED' }],
      },
    ],
    // Ruling 8: two ownerless criticals to name, four ordinary ones to count.
    [
      { name: 'the glazed ham', critical: true },
      { name: 'the marquee', critical: true },
      { name: 'the paper cups', critical: false },
      { name: 'the serviettes', critical: false },
      { name: 'the spare chairs', critical: false },
      { name: 'the ice buckets', critical: false },
    ]
  );

  // ── Event B: the oversized board (Ruling 5) ─────────────────────────────
  const bigCast = Array.from({ length: 16 }, (_, h) => ({
    household: `House ${h}`,
    members: Array.from({ length: 4 }, (_, m) => ({
      name: h === 0 && m === 0 ? 'Kate Whittaker' : `Person ${h}-${m}`,
      householdRole: (m === 0
        ? 'PRIMARY_CONTACT'
        : m === 1
          ? 'PARTNER'
          : 'CHILD') as Spec['householdRole'],
      rows: [{ name: `Row ${h}-${m}`, response: 'ACCEPTED' as const }],
    })),
  }));
  const oversized = await buildEvent(user, hostPerson.id, 'oversized', bigCast, []);

  console.log('\nSession cookie (set it on localhost, name "session"):');
  console.log(`  ${token}\n`);
  console.log('Mixed board:      /plan/' + mixed + '/glance');
  console.log('Oversized board:  /plan/' + oversized + '/glance\n');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
