/**
 * GTC-192 (J1, phase 6, slice 6d) — the walk's second viewer, and its row dump.
 *
 * ── WHY IT EXISTS ────────────────────────────────────────────────────────────────────────
 *
 * Ruling 20 is the interesting case for 6d: "A reversal the host has watched settle stays
 * sticky red for the co-host until she watches it too." The demo board has one viewer, so the
 * walk needs a second — and the walk also has to prove a NEGATIVE ("the settling wrote
 * nothing"), which under the standing warning is only evidence against a dump taken before and
 * after and diffed.
 *
 * ── IDEMPOTENT, AND THE FIXED ID IS THE REASON ───────────────────────────────────────────
 *
 * Every id here is fixed and every write is an upsert, so `setup` twice lands on the same rows.
 * The standing warning at the head of this ticket's phase 6 requires the walk fixture be run
 * twice and diffed before a single number from it is trusted; `dump` is what that diff is
 * taken on.
 *
 * ── IT WRITES NOTHING THE SETTLING NEEDS ─────────────────────────────────────────────────
 *
 * The only rows it creates are a viewer — a `User` and an `EventRole` — which is the thing
 * Ruling 20 is about. It does not touch an Assignment, a PersonEvent, an Item or a ledger row,
 * because 6d must not either, and a fixture that arranged the board would be arranging the
 * answer.
 *
 * Run: npx tsx scripts/gtc192-6d-walk.ts <setup|dump|marks|clean>
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const EVENT_ID = 'gtc192-replay-arrival';
const COHOST_EMAIL = 'gtc192-6d-cohost@example.com';
const COHOST_USER_ID = 'gtc192-6d-cohost-user';
const COHOST_ROLE_ID = 'gtc192-6d-cohost-role';

async function hostAnchor(): Promise<Date> {
  const row = await prisma.eventRole.findFirstOrThrow({
    where: { eventId: EVENT_ID, role: 'HOST' },
    select: { glanceSeenAt: true },
  });
  if (row.glanceSeenAt === null) throw new Error('the host has no anchor — re-run the seed');
  return row.glanceSeenAt;
}

async function setup() {
  const anchor = await hostAnchor();
  await prisma.user.upsert({
    where: { id: COHOST_USER_ID },
    update: { email: COHOST_EMAIL },
    create: { id: COHOST_USER_ID, email: COHOST_EMAIL },
  });
  await prisma.eventRole.upsert({
    where: { id: COHOST_ROLE_ID },
    update: { glanceSeenAt: anchor },
    create: {
      id: COHOST_ROLE_ID,
      userId: COHOST_USER_ID,
      eventId: EVENT_ID,
      role: 'COHOST',
      glanceSeenAt: anchor,
    },
  });
  console.log(JSON.stringify({ eventId: EVENT_ID, cohost: COHOST_EMAIL, anchor }, null, 2));
}

/**
 * Everything on this board EXCEPT the two `glanceSeenAt` marks.
 *
 * The marks are the one thing 6d is allowed to move — 6b's stamp, per viewer — so they are
 * excluded here and printed by `marks` instead. Everything else is what "derived, never a
 * write" claims about, and a byte-for-byte diff of this across the settling is the proof.
 */
async function dump() {
  const [assignments, memberships, items, audits, invites] = await Promise.all([
    prisma.assignment.findMany({
      where: { item: { team: { eventId: EVENT_ID } } },
      select: { id: true, itemId: true, personId: true, response: true, createdAt: true },
      orderBy: { id: 'asc' },
    }),
    prisma.personEvent.findMany({
      where: { eventId: EVENT_ID },
      select: {
        id: true,
        personId: true,
        role: true,
        attendanceAnswer: true,
        nudgeMark: true,
        teamId: true,
        householdId: true,
        sentAt: true,
      },
      orderBy: { id: 'asc' },
    }),
    prisma.item.findMany({
      where: { team: { eventId: EVENT_ID } },
      select: { id: true, name: true, critical: true, status: true, teamId: true },
      orderBy: { id: 'asc' },
    }),
    prisma.auditEntry.findMany({
      where: { eventId: EVENT_ID },
      select: { id: true, actionType: true, targetType: true, targetId: true, timestamp: true },
      orderBy: { id: 'asc' },
    }),
    prisma.inviteEvent.count({ where: { eventId: EVENT_ID } }),
  ]);
  console.log(
    JSON.stringify({ assignments, memberships, items, audits, inviteEventCount: invites }, null, 2)
  );
}

async function marks() {
  const rows = await prisma.eventRole.findMany({
    where: { eventId: EVENT_ID },
    select: { id: true, role: true, glanceSeenAt: true },
    orderBy: { id: 'asc' },
  });
  console.log(JSON.stringify(rows, null, 2));
}

async function clean() {
  await prisma.session.deleteMany({ where: { userId: COHOST_USER_ID } });
  await prisma.magicLink.deleteMany({ where: { email: COHOST_EMAIL } });
  await prisma.eventRole.deleteMany({ where: { id: COHOST_ROLE_ID } });
  await prisma.user.deleteMany({ where: { id: COHOST_USER_ID } });
  console.log('co-host removed');
}

const mode = process.argv[2];
const run =
  mode === 'setup'
    ? setup
    : mode === 'dump'
      ? dump
      : mode === 'marks'
        ? marks
        : mode === 'clean'
          ? clean
          : null;

if (run === null) {
  console.error('usage: tsx scripts/gtc192-6d-walk.ts <setup|dump|marks|clean>');
  process.exit(1);
}

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
