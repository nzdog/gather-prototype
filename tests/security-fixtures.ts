/**
 * Security Test Fixtures Generator
 *
 * Creates test data for security verification across the FOUR lifecycle phases the
 * send-lock model distinguishes (GTC-169 / A3a). Each event gets a full scaffold —
 * two teams, coordinators, participants, items, assignments, tokens — so route
 * protection can be exercised behaviourally rather than by grepping source text.
 *
 * | Fixture | Shape | What it proves |
 * |---|---|---|
 * | DRAFT       | status DRAFT, no sentAt          | pre-send baseline |
 * | SENT        | CONFIRMING, sentAt, future end   | the new model's sent event |
 * | SENT-LEGACY | FROZEN, sentAt, future end       | the compat shim — a pre-migration event must still read as sent |
 * | PAST        | CONFIRMING, sentAt, past end     | derived COMPLETE, and the nudges-must-not-fire-after rule |
 *
 * SENT-LEGACY replaces the old `Security Test Event (FROZEN)`. It is the same row
 * shape, repurposed: it used to prove that FROZEN blocks mutations; it now proves
 * that a legacy FROZEN event is read as SENT and is NOT blocked. Nothing else in the
 * suite covers the read-compatibility claim that GTC-199 (A4) depends on.
 *
 * PAST carries a nudge-eligible person (valid NZ phone + inviteAnchorAt 48h old +
 * PARTICIPANT token) so `findNudgeCandidates()` can be asserted against it.
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

const EVENT_NAMES = [
  'Security Test Event (DRAFT)',
  'Security Test Event (SENT)',
  'Security Test Event (SENT-LEGACY)',
  'Security Test Event (PAST)',
  // Retired name — still cleaned so a stale row from before GTC-169 cannot linger.
  'Security Test Event (FROZEN)',
];

const PERSON_EMAIL_DOMAIN = 'test.local';
const HOST_EMAIL = 'security-test@gather.test';

interface TeamScaffold {
  id: string;
  name: string;
  coordinator: { personId: string; name: string; token: string };
  participant: { personId: string; name: string; token: string; assignmentId: string };
  items: Array<{ id: string; name: string }>;
}

interface EventScaffold {
  id: string;
  name: string;
  status: string;
  sentAt: string | null;
  endDate: string;
  hostToken: string;
  teamA: TeamScaffold;
  teamB: TeamScaffold;
}

interface Fixtures {
  user: { id: string; email: string; sessionToken: string; sessionCookie: string };
  host: { id: string; name: string; token: string };
  eventDraft: EventScaffold;
  eventSent: EventScaffold;
  eventSentLegacy: EventScaffold;
  eventPast: EventScaffold;
  /** Nudge-eligible person on the PAST event (zone-7 / §10.1 assertions). */
  nudgeCandidate: { personId: string; phoneNumber: string; eventId: string };
  /** Back-compat aliases onto the DRAFT scaffold. */
  teamA: TeamScaffold;
  teamB: TeamScaffold;
}

async function cleanup() {
  console.log('Cleaning up old test fixtures...');

  await prisma.event.deleteMany({ where: { name: { in: EVENT_NAMES } } });

  await prisma.person.deleteMany({
    where: {
      OR: [{ email: { endsWith: `@${PERSON_EMAIL_DOMAIN}` } }, { email: HOST_EMAIL }],
    },
  });

  await prisma.session.deleteMany({ where: { user: { email: HOST_EMAIL } } });
  await prisma.user.deleteMany({ where: { email: HOST_EMAIL } });

  console.log('✓ Cleanup complete\n');
}

/**
 * Build a complete, independently-exercisable event: two teams, each with a
 * coordinator, a participant holding an assignment, and two items.
 *
 * Every route the send-lock touches can then be driven against any phase without
 * cross-contamination between fixtures.
 */
async function scaffoldEvent(params: {
  key: string;
  name: string;
  status: 'DRAFT' | 'CONFIRMING' | 'FROZEN';
  sentAt: Date | null;
  startDate: Date;
  endDate: Date;
  hostPersonId: string;
  userId: string;
}): Promise<EventScaffold> {
  const { key, name, status, sentAt, startDate, endDate, hostPersonId, userId } = params;

  const event = await prisma.event.create({
    data: { name, startDate, endDate, status, sentAt, hostId: hostPersonId, guestCount: 20 },
  });

  await prisma.eventRole.create({ data: { userId, eventId: event.id, role: 'HOST' } });

  const hostToken = randomBytes(32).toString('hex');
  await prisma.accessToken.create({
    data: {
      token: hostToken,
      scope: 'HOST',
      personId: hostPersonId,
      eventId: event.id,
      expiresAt: new Date('2027-12-31'),
    },
  });

  async function scaffoldTeam(teamKey: 'a' | 'b', teamName: string): Promise<TeamScaffold> {
    const team = await prisma.team.create({ data: { name: teamName, eventId: event.id } });

    const coordinator = await prisma.person.create({
      data: {
        name: `${teamName} Coordinator`,
        email: `coord-${teamKey}-${key}@${PERSON_EMAIL_DOMAIN}`,
      },
    });
    await prisma.personEvent.create({
      data: { personId: coordinator.id, eventId: event.id, teamId: team.id, role: 'COORDINATOR' },
    });
    await prisma.team.update({ where: { id: team.id }, data: { coordinatorId: coordinator.id } });

    const participant = await prisma.person.create({
      data: {
        name: `${teamName} Participant`,
        email: `part-${teamKey}-${key}@${PERSON_EMAIL_DOMAIN}`,
      },
    });
    await prisma.personEvent.create({
      data: { personId: participant.id, eventId: event.id, teamId: team.id, role: 'PARTICIPANT' },
    });

    const item1 = await prisma.item.create({
      data: { name: `Item ${teamName} 1`, teamId: team.id, status: 'ASSIGNED' },
    });
    const item2 = await prisma.item.create({
      data: { name: `Item ${teamName} 2`, teamId: team.id, status: 'UNASSIGNED' },
    });

    // item1 is claimed, so post-send mutations have something real to move.
    const assignment = await prisma.assignment.create({
      data: { itemId: item1.id, personId: participant.id, response: 'ACCEPTED' },
    });

    const coordToken = randomBytes(32).toString('hex');
    await prisma.accessToken.create({
      data: {
        token: coordToken,
        scope: 'COORDINATOR',
        personId: coordinator.id,
        eventId: event.id,
        teamId: team.id,
        expiresAt: new Date('2027-12-31'),
      },
    });

    const partToken = randomBytes(32).toString('hex');
    await prisma.accessToken.create({
      data: {
        token: partToken,
        scope: 'PARTICIPANT',
        personId: participant.id,
        eventId: event.id,
        expiresAt: new Date('2027-12-31'),
      },
    });

    return {
      id: team.id,
      name: team.name,
      coordinator: { personId: coordinator.id, name: coordinator.name, token: coordToken },
      participant: {
        personId: participant.id,
        name: participant.name,
        token: partToken,
        assignmentId: assignment.id,
      },
      items: [
        { id: item1.id, name: item1.name },
        { id: item2.id, name: item2.name },
      ],
    };
  }

  const teamA = await scaffoldTeam('a', 'Team A');
  const teamB = await scaffoldTeam('b', 'Team B');

  return {
    id: event.id,
    name: event.name,
    status: event.status,
    sentAt: event.sentAt?.toISOString() ?? null,
    endDate: event.endDate.toISOString(),
    hostToken,
    teamA,
    teamB,
  };
}

async function generateFixtures(): Promise<Fixtures> {
  console.log('Generating security test fixtures...\n');

  console.log('1. Creating test user...');
  const user = await prisma.user.create({
    data: { email: HOST_EMAIL, billingStatus: 'ACTIVE' },
  });

  const sessionToken = randomBytes(32).toString('hex');
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);
  await prisma.session.create({ data: { userId: user.id, token: sessionToken, expiresAt } });
  console.log(`   ✓ User: ${user.email}\n`);

  console.log('2. Creating host person...');
  const hostPerson = await prisma.person.create({
    data: { name: 'Security Test Host', email: HOST_EMAIL, userId: user.id },
  });
  console.log(`   ✓ Host: ${hostPerson.name}\n`);

  const now = Date.now();
  const DAY = 86_400_000;
  // GTC-178 (E1, phase 5): was 7 days. The second nudge leg is now due at exactly day 7,
  // so a 7-day-old clock made suite 8's positive half a boundary test by accident — it
  // passed only on the milliseconds elapsed between fixture creation and assertion. Ten
  // days puts it clear of both legs.
  const sentAt = new Date(now - 10 * DAY);

  console.log('3. Scaffolding the four lifecycle phases...');
  const common = { hostPersonId: hostPerson.id, userId: user.id };

  const eventDraft = await scaffoldEvent({
    ...common,
    key: 'draft',
    name: 'Security Test Event (DRAFT)',
    status: 'DRAFT',
    sentAt: null,
    startDate: new Date(now + 30 * DAY),
    endDate: new Date(now + 32 * DAY),
  });
  console.log(`   ✓ DRAFT        ${eventDraft.id}`);

  const eventSent = await scaffoldEvent({
    ...common,
    key: 'sent',
    name: 'Security Test Event (SENT)',
    status: 'CONFIRMING',
    sentAt,
    startDate: new Date(now + 30 * DAY),
    endDate: new Date(now + 32 * DAY),
  });
  console.log(`   ✓ SENT         ${eventSent.id}`);

  // Legacy shape: frozen before the migration. isSent() must still read it as sent.
  const eventSentLegacy = await scaffoldEvent({
    ...common,
    key: 'legacy',
    name: 'Security Test Event (SENT-LEGACY)',
    status: 'FROZEN',
    sentAt,
    startDate: new Date(now + 30 * DAY),
    endDate: new Date(now + 32 * DAY),
  });
  console.log(`   ✓ SENT-LEGACY  ${eventSentLegacy.id}`);

  const eventPast = await scaffoldEvent({
    ...common,
    key: 'past',
    name: 'Security Test Event (PAST)',
    status: 'CONFIRMING',
    sentAt,
    startDate: new Date(now - 5 * DAY),
    endDate: new Date(now - 3 * DAY),
  });
  console.log(`   ✓ PAST         ${eventPast.id}\n`);

  // 4. A nudge-eligible person on the PAST event.
  //
  // Every condition findNudgeCandidates() checks is satisfied: valid NZ mobile,
  // a personal send clock older than 48h, a PARTICIPANT token, no nudge yet sent, not
  // opted out. The ONLY thing that should exclude them is that the event date has passed
  // — which is exactly the §10.1 rule ("nudges must never fire after it") that the
  // status-filter inversion enforces.
  //
  // GTC-178 (E1, phase 2) — WHY `PersonEvent.sentAt` IS SET BELOW AND MUST STAY SET.
  // The clock moved from the global `Person.inviteAnchorAt` to the per-event
  // `PersonEvent.sentAt`, and this row had no `sentAt`. That would have made suite 8's
  // negative pass because the person has NO CLOCK, not because the event date passed —
  // the assertion would still be green while proving nothing, which is precisely the
  // wrong-reason failure GTC-202 (A3c-2) fixed on the positive half of this same pair.
  // Setting it keeps the pair honest: the past and live fixtures now differ in their
  // event's phase and in nothing else.
  console.log('4. Creating nudge-eligible person on the PAST event...');
  const phoneNumber = '+64211234567';
  const nudgePerson = await prisma.person.create({
    data: {
      name: 'Nudge Candidate',
      email: `nudge-past@${PERSON_EMAIL_DOMAIN}`,
      phoneNumber,
      inviteAnchorAt: new Date(now - 3 * DAY),
    },
  });
  await prisma.personEvent.create({
    data: {
      personId: nudgePerson.id,
      eventId: eventPast.id,
      teamId: eventPast.teamA.id,
      role: 'PARTICIPANT',
      sentAt,
    },
  });
  await prisma.accessToken.create({
    data: {
      token: randomBytes(32).toString('hex'),
      scope: 'PARTICIPANT',
      personId: nudgePerson.id,
      eventId: eventPast.id,
      expiresAt: new Date('2027-12-31'),
    },
  });
  console.log(`   ✓ ${nudgePerson.name} (${phoneNumber})\n`);

  // 5. The SAME person, on the SENT event — GTC-202 (A3c-2).
  //
  // The nudge predicate has two halves and only one of them was fixtured. Plan §10.2:
  // "sent event with a live date yields candidates; complete event yields none — BOTH
  // true", and GTC-169's acceptance says "verified both ways". Suite 8 asserted only
  // the negative, and could not have asserted the positive: NO member of the SENT event
  // had a phone or an anchor, so findNudgeCandidates() returned zero from that event no
  // matter what the predicate said. The passing half was passing for the wrong reason.
  //
  // This person is deliberately IDENTICAL in shape to the PAST one — same phone format,
  // same personal send clock, same role and token. The only difference between them is
  // their event's phase, which is what makes the pair an assertion about the PREDICATE
  // rather than about fixture data.
  console.log('5. Creating nudge-eligible person on the SENT event (the positive half)...');
  const livePhoneNumber = '+64211234568';
  const liveNudgePerson = await prisma.person.create({
    data: {
      name: 'Nudge Candidate Live',
      email: `nudge-live@${PERSON_EMAIL_DOMAIN}`,
      phoneNumber: livePhoneNumber,
      inviteAnchorAt: new Date(now - 3 * DAY),
    },
  });
  await prisma.personEvent.create({
    data: {
      personId: liveNudgePerson.id,
      eventId: eventSent.id,
      teamId: eventSent.teamA.id,
      role: 'PARTICIPANT',
      sentAt,
    },
  });
  await prisma.accessToken.create({
    data: {
      token: randomBytes(32).toString('hex'),
      scope: 'PARTICIPANT',
      personId: liveNudgePerson.id,
      eventId: eventSent.id,
      expiresAt: new Date('2027-12-31'),
    },
  });
  console.log(`   ✓ ${liveNudgePerson.name} (${livePhoneNumber})\n`);

  return {
    user: {
      id: user.id,
      email: user.email,
      sessionToken,
      sessionCookie: `session=${sessionToken}`,
    },
    host: { id: hostPerson.id, name: hostPerson.name, token: eventDraft.hostToken },
    eventDraft,
    eventSent,
    eventSentLegacy,
    eventPast,
    nudgeCandidate: { personId: nudgePerson.id, phoneNumber, eventId: eventPast.id },
    liveNudgeCandidate: {
      personId: liveNudgePerson.id,
      phoneNumber: livePhoneNumber,
      eventId: eventSent.id,
    },
    teamA: eventDraft.teamA,
    teamB: eventDraft.teamB,
  };
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
    console.log(`Session Cookie:       ${fixtures.user.sessionCookie}`);
    console.log(`Host Token (DRAFT):   ${fixtures.host.token}`);
    console.log(`DRAFT Event ID:       ${fixtures.eventDraft.id}`);
    console.log(`SENT Event ID:        ${fixtures.eventSent.id}`);
    console.log(`SENT-LEGACY Event ID: ${fixtures.eventSentLegacy.id}`);
    console.log(`PAST Event ID:        ${fixtures.eventPast.id}`);
    console.log('========================================\n');

    await prisma.$disconnect();
  } catch (error: any) {
    console.error('Error generating fixtures:', error.message);
    await prisma.$disconnect();
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

export { generateFixtures, cleanup };
export type { Fixtures, EventScaffold, TeamScaffold };
