/**
 * [[GTC-369]] — the sign-in hole's footprint, counted, for the founder to run at the deploy.
 *
 * Founder ruling Q13, 2026-10-08: "the production check script opens a read-only transaction and
 * prints numbers only (no names, emails or ids) and never prints the connection string. You never
 * run it against production; I run it at the deploy."
 *
 * WHAT IT CAN SHOW. The claim branch of `POST /api/auth/verify` is the only code that grants a
 * HOST or COHOST EventRole after an event exists: `POST /api/events` writes its HOST role in the
 * same transaction as the event, and the demo account (left out here) has its own route. So:
 *   1. claim-made roles — HOST/COHOST roles made more than 5 minutes after their event. Every one
 *      came from a claim, honest or not. GTC-309 measured that a paid event cannot have an
 *      unclaimed host, so an honest one should be rare in production.
 *   2. of those, roles whose person now belongs to a different user — someone moved since.
 *   3. events where a HOST role's user is not the host Person's user — what a move leaves behind
 *      (the previous owner keeps her role).
 *   4. users with two or more Person rows — [[GTC-263]]'s shape, which the claim branch also makes.
 *   5. hosts or co-hosts whose User's email differs from their Person's own email — candidates
 *      only: an honest claim may use a different address.
 *
 * WHAT IT CANNOT SHOW. An outsider who claimed an unclaimed host looks like an honest claim except
 * in count 5. The redirect (point 3 of the ruling) leaves nothing in the database: MagicLink never
 * recorded a returnUrl. Person has no timestamps.
 *
 * Every count is a number. No row's name, email or id is read out, errors are reported by their
 * code only, and the connection string is never printed (it comes from DATABASE_URL).
 *
 * Run: npx tsx scripts/gtc369-prod-footprint.ts
 */

import { PrismaClient } from '@prisma/client';

const DEMO_SESSION_EMAIL = 'demo-session@demo.gather';
const CLAIM_GAP_MINUTES = 5;

type CountRow = { n: number };

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const counts = await prisma.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const ro = await tx.$queryRaw<
          { ro: string }[]
        >`SELECT current_setting('transaction_read_only') AS ro`;
        if (ro[0]?.ro !== 'on') throw new Error('the transaction is not read-only');

        const one = (rows: CountRow[]) => Number(rows[0]?.n ?? 0);

        const events = one(await tx.$queryRaw<CountRow[]>`SELECT count(*)::int AS n FROM "Event"`);
        const hostRoles = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(*)::int AS n FROM "EventRole" er
            JOIN "User" u ON u.id = er."userId"
            WHERE er.role IN ('HOST', 'COHOST') AND u.email <> ${DEMO_SESSION_EMAIL}`
        );
        const claimMade = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(*)::int AS n FROM "EventRole" er
            JOIN "Event" e ON e.id = er."eventId"
            JOIN "User" u ON u.id = er."userId"
            WHERE er.role IN ('HOST', 'COHOST') AND u.email <> ${DEMO_SESSION_EMAIL}
              AND er."createdAt" > e."createdAt" + ${CLAIM_GAP_MINUTES} * interval '1 minute'`
        );
        const claimMadeMoved = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(*)::int AS n FROM "EventRole" er
            JOIN "Event" e ON e.id = er."eventId"
            JOIN "User" u ON u.id = er."userId"
            LEFT JOIN "Person" p
              ON p.id = CASE WHEN er.role = 'HOST' THEN e."hostId" ELSE e."coHostId" END
            WHERE er.role IN ('HOST', 'COHOST') AND u.email <> ${DEMO_SESSION_EMAIL}
              AND er."createdAt" > e."createdAt" + ${CLAIM_GAP_MINUTES} * interval '1 minute'
              AND p."userId" IS DISTINCT FROM er."userId"`
        );
        const hostRoleMismatch = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(DISTINCT e.id)::int AS n FROM "EventRole" er
            JOIN "Event" e ON e.id = er."eventId"
            JOIN "User" u ON u.id = er."userId"
            JOIN "Person" p ON p.id = e."hostId"
            WHERE er.role = 'HOST' AND u.email <> ${DEMO_SESSION_EMAIL}
              AND p."userId" IS DISTINCT FROM er."userId"`
        );
        const usersWithTwoPersons = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(*)::int AS n FROM (
              SELECT "userId" FROM "Person" WHERE "userId" IS NOT NULL
              GROUP BY "userId" HAVING count(*) > 1
            ) t`
        );
        const hostEmailDiffers = one(
          await tx.$queryRaw<CountRow[]>`
            SELECT count(DISTINCT p.id)::int AS n FROM "Person" p
            JOIN "Event" e ON e."hostId" = p.id OR e."coHostId" = p.id
            JOIN "User" u ON u.id = p."userId"
            WHERE p.email IS NOT NULL AND lower(u.email) <> lower(p.email)`
        );

        return {
          events,
          hostRoles,
          claimMade,
          claimMadeMoved,
          hostRoleMismatch,
          usersWithTwoPersons,
          hostEmailDiffers,
        };
      },
      { timeout: 60_000 }
    );

    const lines: Array<[string, number]> = [
      ['events', counts.events],
      ['HOST/COHOST roles, demo account left out', counts.hostRoles],
      [`1. roles made by a claim (> ${CLAIM_GAP_MINUTES} min after the event)`, counts.claimMade],
      ['2. ...of which the person now belongs to another user', counts.claimMadeMoved],
      ["3. events with a HOST role not the host's own user", counts.hostRoleMismatch],
      ['4. users with two or more Person rows', counts.usersWithTwoPersons],
      ['5. hosts whose account email differs from their own', counts.hostEmailDiffers],
    ];
    console.log('GTC-369 footprint (read-only transaction: on; numbers only)');
    for (const [label, n] of lines) console.log(`  ${label.padEnd(56)} ${n}`);
  } catch (error) {
    const e = error as { code?: string; constructor?: { name?: string } };
    console.error(`GTC-369 footprint: stopped (${e?.code ?? e?.constructor?.name ?? 'error'})`);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
