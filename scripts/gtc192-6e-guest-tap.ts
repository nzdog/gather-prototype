/**
 * GTC-192 phase 6 slice 6e — A GUEST'S TAP, ON A SECOND CONNECTION.
 *
 * The 6e browser walk needs a response to land in `gather_dev` WHILE the host's board is open,
 * so the ~20-second poll can be seen picking it up. This is that tap.
 *
 * ── IT DRIVES THE REAL ROUTE. IT WRITES NOTHING ITSELF. ────────────────────────────────────
 *
 * The standing warning at the head of GTC-192's phase 6 section: *"Every glance fixture writes
 * the rows the real route writes... or better, drives the route."* This drives the route —
 * `POST /api/p/[token]/ack/[assignmentId]` over HTTP against the running dev server, with a
 * real PARTICIPANT token, which is byte-for-byte what the guest's phone sends. The
 * `ACCEPT_ASSIGNMENT` / `DECLINE_ASSIGNMENT` / `MAYBE_ASSIGNMENT` `AuditEntry` is written by the
 * route, inside its own transaction. Nothing here sets `Assignment.response` beside a ledger,
 * and nothing here synthesises an audit row.
 *
 * That matters even though the LIVE diff needs no ledger at all: a response written without one
 * leaves a board the arrival replay could never derive (Ruling 28, positive evidence only), so a
 * walk done on it would be measuring a board the product cannot produce.
 *
 * ── IT IS IDEMPOTENT, AND THAT IS PROVABLE RATHER THAN CLAIMED ────────────────────────────
 *
 * 6c's walk fixture was not, and reported a board different from the one it was thought to have
 * measured. This one leans on the ack route's own idempotency —
 * `if (assignment.response === response) return { changed: false }` writes no row — so running it
 * twice with the same target and response produces a byte-identical dump. Run it twice and diff
 * before trusting a number from it.
 *
 * Run: npx tsx scripts/gtc192-6e-guest-tap.ts <assignmentId> <ACCEPTED|DECLINED|MAYBE>
 * Writes: exactly what one guest tap writes, through the route, and nothing else.
 */

import { PrismaClient } from '@prisma/client';
import { ensureEventTokens } from '../src/lib/tokens';
import { readEventGlance } from '../src/lib/glance/read';

const prisma = new PrismaClient();
const BASE = process.env.GLANCE_TEST_BASE_URL ?? 'http://localhost:3000';

async function main() {
  const assignmentId = process.argv[2];
  const response = process.argv[3];
  if (!assignmentId || !response) {
    throw new Error('usage: tsx scripts/gtc192-6e-guest-tap.ts <assignmentId> <RESPONSE>');
  }

  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: {
      personId: true,
      // `Item` carries no eventId of its own — it hangs off the team (or the day).
      item: { select: { name: true, team: { select: { eventId: true } } } },
    },
  });
  const eventId = assignment.item.team!.eventId;

  await ensureEventTokens(eventId);
  const token = await prisma.accessToken.findFirstOrThrow({
    where: { eventId, personId: assignment.personId, scope: 'PARTICIPANT' },
    select: { token: true, person: { select: { name: true } } },
  });

  const res = await fetch(`${BASE}/api/p/${token.token}/ack/${assignmentId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ response }),
  });
  const body = await res.text();

  // The canonical dump. Everything that could differ between two runs is in it.
  const after = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    select: { response: true },
  });
  const ledger = await prisma.auditEntry.findMany({
    where: { targetId: assignmentId },
    orderBy: { timestamp: 'asc' },
    select: { actionType: true },
  });
  const glance = await readEventGlance(prisma, eventId, new Date());
  const people = [...glance.households.flatMap((h) => h.members), ...glance.unhoused];
  const holder = people.find((p) => p.personId === assignment.personId);

  console.log(`route            ${res.status} ${body}`);
  console.log(`item             ${assignment.item.name}`);
  console.log(`holder           ${token.person?.name ?? '?'}`);
  console.log(`response         ${after.response}`);
  console.log(`ledger rows      ${ledger.map((r) => r.actionType).join(' → ') || '(none)'}`);
  console.log(`holder state     ${holder?.state ?? '(not on board)'}`);
  console.log(
    `summary          ${glance.summary.needYou} need you / ${glance.summary.withGather} with Gather / ${glance.summary.settled} settled`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
