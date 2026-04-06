/**
 * Repopulates people for three test-fixture events that lost their participants/coordinators.
 *
 * Events targeted (must already exist — do NOT touch demo event):
 *   cmncij2kn001d1yqz5mtr8v9x  TEST-FIXTURE — Confirming With Plan
 *   cmncij8fb003f1yqzfn8fzrl0  TEST-FIXTURE — Confirming Paid
 *   cmncijdxp005h1yqzop82rdwh  TEST-FIXTURE — Frozen
 *
 * Per-event additions:
 *   Events 3 & 4: 8 participants (3 of whom are also coordinators for the 3 teams)
 *   Event 5:      8 participants only (no coordinator role or tokens)
 *
 * Run via:  railway run tsx scripts/repopulate-fixture-people.ts
 *
 * Idempotent: uses upsert for Person and PersonEvent records; skips AccessToken
 * creation if one already exists for that (eventId, personId, scope, teamId) combination.
 */

import { PrismaClient } from '@prisma/client';
import { randomBytes } from 'crypto';

const prisma = new PrismaClient();

function generateToken(): string {
  return randomBytes(32).toString('hex');
}

const EVENT_3_ID = 'cmncij2kn001d1yqz5mtr8v9x'; // Confirming With Plan
const EVENT_4_ID = 'cmncij8fb003f1yqzfn8fzrl0'; // Confirming Paid
const EVENT_5_ID = 'cmncijdxp005h1yqzop82rdwh'; // Frozen

// Names and email keys for the 8 fixture participants
const NAMES = ['Alex', 'Blair', 'Casey', 'Drew', 'Evelyn', 'Finn', 'Grace', 'Harper'];

// Team assignment + coordinator flag for events 3 and 4
// teamName index 0=Mains, 1=Sides & Salads, 2=Drinks
const ASSIGNMENTS: { teamIdx: number; isCoord: boolean }[] = [
  { teamIdx: 0, isCoord: true }, // Alex   — coordinator, Mains
  { teamIdx: 0, isCoord: false }, // Blair  — member,      Mains
  { teamIdx: 0, isCoord: false }, // Casey  — member,      Mains
  { teamIdx: 1, isCoord: true }, // Drew   — coordinator, Sides & Salads
  { teamIdx: 1, isCoord: false }, // Evelyn — member,      Sides & Salads
  { teamIdx: 1, isCoord: false }, // Finn   — member,      Sides & Salads
  { teamIdx: 2, isCoord: true }, // Grace  — coordinator, Drinks
  { teamIdx: 2, isCoord: false }, // Harper — member,      Drinks
];

const TEAM_NAMES = ['Mains', 'Sides & Salads', 'Drinks'];

function email(eventKey: string, idx: number) {
  return `fixture-${eventKey}-p${idx + 1}@gather-fixture.invalid`;
}

/**
 * Creates or skips an AccessToken.
 * Returns the token string (either newly created or the existing one).
 */
async function upsertToken(opts: {
  eventId: string;
  personId: string;
  scope: 'PARTICIPANT' | 'COORDINATOR';
  teamId: string | null;
  expiresAt: Date;
}): Promise<string> {
  const existing = await prisma.accessToken.findFirst({
    where: {
      eventId: opts.eventId,
      personId: opts.personId,
      scope: opts.scope,
      teamId: opts.teamId ?? null,
    },
  });
  if (existing) return existing.token;

  const token = generateToken();
  await prisma.accessToken.create({
    data: {
      token,
      scope: opts.scope,
      personId: opts.personId,
      eventId: opts.eventId,
      teamId: opts.teamId,
      expiresAt: opts.expiresAt,
    },
  });
  return token;
}

interface PersonResult {
  name: string;
  email: string;
  participantToken: string;
  coordinatorToken?: string;
  isCoord: boolean;
}

async function addParticipantsWithCoords(
  eventId: string,
  eventKey: string,
  teams: { id: string; name: string }[],
  expiresAt: Date
): Promise<PersonResult[]> {
  const results: PersonResult[] = [];

  for (let i = 0; i < 8; i++) {
    const { teamIdx, isCoord } = ASSIGNMENTS[i];
    const team = teams[teamIdx];
    const personName = `${NAMES[i]} Fixture`;
    const personEmail = email(eventKey, i);
    const role = isCoord ? 'COORDINATOR' : 'PARTICIPANT';

    // Upsert person
    const person = await prisma.person.upsert({
      where: { email: personEmail },
      update: {},
      create: { name: personName, email: personEmail },
    });

    // If coordinator, assign them to the team
    if (isCoord) {
      await prisma.team.update({
        where: { id: team.id },
        data: { coordinatorId: person.id },
      });
    }

    // Upsert PersonEvent
    await prisma.personEvent.upsert({
      where: { personId_eventId: { personId: person.id, eventId } },
      update: {},
      create: {
        personId: person.id,
        eventId,
        teamId: team.id,
        role,
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });

    // PARTICIPANT-scoped token
    const participantToken = await upsertToken({
      eventId,
      personId: person.id,
      scope: 'PARTICIPANT',
      teamId: null,
      expiresAt,
    });

    // COORDINATOR-scoped token (coordinators only)
    let coordinatorToken: string | undefined;
    if (isCoord) {
      coordinatorToken = await upsertToken({
        eventId,
        personId: person.id,
        scope: 'COORDINATOR',
        teamId: team.id,
        expiresAt,
      });
    }

    results.push({
      name: personName,
      email: personEmail,
      participantToken,
      coordinatorToken,
      isCoord,
    });
    console.log(`  ✓ ${personName} (${role}) — ${person.id}`);
  }

  return results;
}

async function addParticipantsOnly(
  eventId: string,
  eventKey: string,
  expiresAt: Date
): Promise<PersonResult[]> {
  const results: PersonResult[] = [];

  for (let i = 0; i < 8; i++) {
    const personName = `${NAMES[i]} Fixture`;
    const personEmail = email(eventKey, i);

    const person = await prisma.person.upsert({
      where: { email: personEmail },
      update: {},
      create: { name: personName, email: personEmail },
    });

    await prisma.personEvent.upsert({
      where: { personId_eventId: { personId: person.id, eventId } },
      update: {},
      create: {
        personId: person.id,
        eventId,
        role: 'PARTICIPANT',
        reachabilityTier: 'DIRECT',
        contactMethod: 'EMAIL',
      },
    });

    const participantToken = await upsertToken({
      eventId,
      personId: person.id,
      scope: 'PARTICIPANT',
      teamId: null,
      expiresAt,
    });

    results.push({ name: personName, email: personEmail, participantToken, isCoord: false });
    console.log(`  ✓ ${personName} — ${person.id}`);
  }

  return results;
}

async function main() {
  // Verify all three events exist and are NOT the demo event
  const DEMO_EVENT_ID = 'cmmh3js22001dpi0ps0bk3wad';
  const TARGET_IDS = [EVENT_3_ID, EVENT_4_ID, EVENT_5_ID];

  if (TARGET_IDS.includes(DEMO_EVENT_ID)) {
    throw new Error('Safety check: demo event ID appears in target list — aborting');
  }

  const events = await prisma.event.findMany({
    where: { id: { in: TARGET_IDS } },
    select: { id: true, name: true, status: true, isDemo: true },
  });

  if (events.length !== 3) {
    throw new Error(`Expected 3 events, found ${events.length}. Check event IDs.`);
  }

  for (const ev of events) {
    if (ev.isDemo) throw new Error(`Safety check: event ${ev.id} has isDemo=true — aborting`);
    console.log(`Found: "${ev.name}" (${ev.status})`);
  }

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);

  // ── Event 3 — Confirming With Plan ─────────────────────────────────────────
  console.log('\n── Event 3: Confirming With Plan ──────────────────────────────');
  const e3Teams = await prisma.team.findMany({
    where: { eventId: EVENT_3_ID, name: { in: TEAM_NAMES } },
    orderBy: { displayOrder: 'asc' },
  });
  if (e3Teams.length !== 3) throw new Error(`Event 3: expected 3 teams, found ${e3Teams.length}`);
  const e3 = await addParticipantsWithCoords(EVENT_3_ID, 'e3', e3Teams, expiresAt);

  // ── Event 4 — Confirming Paid ───────────────────────────────────────────────
  console.log('\n── Event 4: Confirming Paid ───────────────────────────────────');
  const e4Teams = await prisma.team.findMany({
    where: { eventId: EVENT_4_ID, name: { in: TEAM_NAMES } },
    orderBy: { displayOrder: 'asc' },
  });
  if (e4Teams.length !== 3) throw new Error(`Event 4: expected 3 teams, found ${e4Teams.length}`);
  const e4 = await addParticipantsWithCoords(EVENT_4_ID, 'e4', e4Teams, expiresAt);

  // ── Event 5 — Frozen ────────────────────────────────────────────────────────
  console.log('\n── Event 5: Frozen ────────────────────────────────────────────');
  const e5 = await addParticipantsOnly(EVENT_5_ID, 'e5', expiresAt);

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('REPOPULATION COMPLETE');
  console.log('════════════════════════════════════════════════════════════════');

  console.log('\n── EVENT 3: TEST-FIXTURE — Confirming With Plan ────────────────');
  console.log(`   Event ID: ${EVENT_3_ID}`);
  console.log('   Participant links (/p/):');
  for (const p of e3) {
    const tag = p.isCoord ? ' [COORD]' : '';
    console.log(`     /p/${p.participantToken}  ← ${p.name}${tag}`);
  }
  console.log('   Coordinator links (/c/):');
  for (const p of e3.filter((p) => p.coordinatorToken)) {
    const team = e3Teams[ASSIGNMENTS[e3.indexOf(p)].teamIdx];
    console.log(`     /c/${p.coordinatorToken}  ← ${p.name} (${team.name})`);
  }

  console.log('\n── EVENT 4: TEST-FIXTURE — Confirming Paid ─────────────────────');
  console.log(`   Event ID: ${EVENT_4_ID}`);
  console.log('   Participant links (/p/):');
  for (const p of e4) {
    const tag = p.isCoord ? ' [COORD]' : '';
    console.log(`     /p/${p.participantToken}  ← ${p.name}${tag}`);
  }
  console.log('   Coordinator links (/c/):');
  for (const p of e4.filter((p) => p.coordinatorToken)) {
    const team = e4Teams[ASSIGNMENTS[e4.indexOf(p)].teamIdx];
    console.log(`     /c/${p.coordinatorToken}  ← ${p.name} (${team.name})`);
  }

  console.log('\n── EVENT 5: TEST-FIXTURE — Frozen ──────────────────────────────');
  console.log(`   Event ID: ${EVENT_5_ID}`);
  console.log('   Participant links (/p/):');
  for (const p of e5) {
    console.log(`     /p/${p.participantToken}  ← ${p.name}`);
  }

  console.log('\n════════════════════════════════════════════════════════════════\n');
}

main()
  .catch((e) => {
    console.error('\nFatal:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
