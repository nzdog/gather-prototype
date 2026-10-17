/**
 * GTC-322 — THE EVENTS THAT WERE "SENT" BEFORE ANYTHING COULD SEND.
 *
 * `Event.sentAt` has been written since [[GTC-169]] by a press that dispatched nothing. Eight
 * events in `gather_dev` carry a send stamp and ZERO `OutboundMessage` rows, and 109
 * `PersonEvent.sentAt` stamps claim a provider acceptance that never happened.
 *
 * Founder ruling, 2026-09-19 — shape 3, in two halves:
 *
 * > SHAPE 3, backfill withheld rows. Those 109 stamps assert something that never happened, and
 * > leaving them means slice 8 chases a third of the database about an ask nobody composed. Your
 * > worry about a withholding no gate produced is real, so answer it in the `withheldWhy` rather
 * > than by avoiding the shape — the code says exactly what is true, which is that this event
 * > predates the press and no message was ever composed for these people.
 *
 * > THE 109 STAMPS — CLEAR THEM, in the same migration, and that is what makes my reason true
 * > rather than half-true. Ruling G says the stamp means a provider accepted; on these events no
 * > provider ever did. A stamp asserting something that never happened is the defect, and the row
 * > repair without it is bookkeeping.
 *
 * ── ⚠ WHY THIS IS A SCRIPT AND NOT A MIGRATION, WHICH IS A DEPARTURE FROM THE PRECEDENT ──
 *
 * This repo backfills through data-only migrations — `20260803230610_gtc202_backfill_send_clocks`
 * and `20260918062839_gtc312_backfill_phone_number`, each one `UPDATE`, zero DDL, authored into a
 * migration Prisma generated empty. **Half of this backfill could be written that way and half
 * could not.**
 *
 *   * THE STAMP CLEARING IS EXPRESSIBLE IN SQL, exactly and reviewably — see `SQL_EQUIVALENT`
 *     below, which is printed by every run so the change can be read as SQL even though it is
 *     executed as Prisma.
 *   * ⚠ THE ROW POPULATION IS NOT. Which memberships get a row is `chooseAskRoute`'s answer — a
 *     ladder over household roles, picked contacts, mute switches, the host exclusion, two
 *     opt-out facts and a phone predicate, run per person. **A SQL approximation of the chooser
 *     is a second definition of the chooser**, and this ticket set has spent a week refusing
 *     exactly that shape. The chooser is TypeScript, so its callers are too.
 *
 * ⚠ AND BOTH HALVES RUN IN ONE TRANSACTION, which is what the founder's *"in the same migration"*
 * was for: a run that cleared the stamps and failed before the rows would leave the record
 * claiming less than it did before.
 *
 * ── ⚠ ONE PREDICATE, SHARED WITH `enrolMiniSends` ─────────────────────────────
 *
 * Founder ruling: *"identical populations is a property, not a margin, and one person of
 * difference is a real invitation from an event pressed months ago."* Writing ASK rows for these
 * events **flips `enrolMiniSends`' event predicate** — it refuses an event with no ask rows, and
 * after this they all have some — so the two-minute cron starts considering all eight. It enrols
 * nobody **only because this script and that sweep ask `askRowPopulation`, the same function.**
 *
 * ── WHAT IT DOES NOT DO ───────────────────────────────────────────────────────
 *
 *   * No board moves. `PREDATES_SENDER` maps to `null` in `WITHHELD_MEANS_UNREACHABLE` — the
 *     founder's ruling, on the ground that a red here would put a one-press "send it again" on 86
 *     guests across eight legacy boards, two of them seeded demo boards: *"no record repair should
 *     buy an affordance."*
 *   * `Event.sentAt` is untouched. The event WAS pressed, by machinery that could not send; that
 *     is the fact this records rather than erases.
 *   * Nothing is ever sent. Every row is born withheld and `findNeverAttempted` excludes it.
 *
 * Run: `npx tsx scripts/backfill-gtc322.ts` — DRY RUN, writes nothing, prints what it would do.
 *      `npx tsx scripts/backfill-gtc322.ts --apply` — one transaction, idempotent.
 */

import { PrismaClient } from '@prisma/client';
import { askRowPopulation, readAskPreview } from '../src/lib/preflight/ask-preview';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

/**
 * The half that IS expressible, printed so the change can be reviewed as SQL.
 *
 * ⚠ IT IS NOT EXECUTED. The transaction below runs the Prisma equivalent, so that both halves
 * share one transaction and one definition of which events are legacy. This string exists to be
 * read, and `tests/legacy-press-test.ts` asserts the predicate it describes matches the one the
 * code uses — a printed SQL that has drifted from the code is worse than none.
 */
const SQL_EQUIVALENT = `
-- The stamp clearing, as SQL. Ruling G: PersonEvent.sentAt means "this person's provider
-- accepted their message". On a legacy event no provider ever did.
UPDATE "PersonEvent" pe
   SET "sentAt" = NULL
  FROM "Event" e
 WHERE pe."eventId" = e.id
   AND e."sentAt" IS NOT NULL
   AND pe."sentAt" IS NOT NULL
   AND NOT EXISTS (
         SELECT 1 FROM "OutboundMessage" om
          WHERE om."eventId" = e.id AND om.kind = 'ASK'
       );
`.trim();

/**
 * A LEGACY PRESSED EVENT: stamped by the old press, and holding no row the new one wrote.
 *
 * ⚠ THE SECOND CLAUSE IS `enrolMiniSends`' OWN, AND IT IS WHY BOTH ARE SAFE. That sweep keys on
 * *an ask row exists* to refuse these events — *"an event with `sentAt` and no rows was pressed by
 * machinery that did not send"*. This is its exact complement, so the two cannot both claim a
 * person. After this runs the complement is empty and the sweep owns them all.
 */
const LEGACY_EVENT = {
  sentAt: { not: null },
  outboundMessages: { none: { kind: 'ASK' as const } },
};

async function main() {
  console.log(APPLY ? '⚠ APPLYING\n' : 'DRY RUN — nothing is written\n');
  console.log(SQL_EQUIVALENT);
  console.log();

  const events = await prisma.event.findMany({
    where: LEGACY_EVENT,
    select: { id: true, name: true },
    orderBy: { sentAt: 'asc' },
  });
  console.log(`Legacy pressed events: ${events.length}`);

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const plan: { eventId: string; name: string; personEventIds: string[]; stamps: number }[] = [];

  for (const event of events) {
    const preview = await readAskPreview(prisma, event.id, baseUrl);
    if (!preview) {
      console.log(`  ⚠ ${event.name}: no preview — SKIPPED, and that is a stop condition`);
      continue;
    }
    /*
     * ⚠ BOTH POPULATIONS, AND THE FIRST DRY RUN IS WHY — IT WAS WRITTEN `ready`-ONLY AND THAT
     * WAS WRONG.
     *
     * Only 20 of the 86 memberships on these events hold a PARTICIPANT token; the other 66 read
     * `AT_PRESS`. Writing rows for the 20 alone gives all eight events ask rows, which **flips
     * `enrolMiniSends`' event predicate** — and the sweep then finds 66 people with no row,
     * counts them `awaitingLink`, and waits. **It waits for a token.** The moment anything mints
     * one — [[GTC-316]] is the ticket that will — the sweep enrols them and the drain sends 66
     * real invitations from events pressed months ago.
     *
     * **That converts a closed door into a door held shut by a missing token**, which is a worse
     * state than the one being repaired and is a new exposure created by the repair itself.
     *
     * A row for an `AT_PRESS` membership is not this script inventing a routing decision: the
     * `withheldWhy` claims nothing about routing. It says THIS EVENT PREDATES THE PRESS AND NO
     * MESSAGE WAS EVER COMPOSED FOR THESE PEOPLE, which is equally true of somebody who holds no
     * link — truer, if anything. And a row is what puts them in the sweep's `dealtWith` set for
     * good.
     */
    const { ready, awaitingLink } = askRowPopulation(preview.recipients);
    const decided = [...ready, ...awaitingLink];
    const stamps = await prisma.personEvent.count({
      where: { eventId: event.id, sentAt: { not: null } },
    });
    plan.push({
      eventId: event.id,
      name: event.name,
      personEventIds: decided.map((r) => r.personEventId),
      stamps,
    });
    console.log(
      `  ${event.name}: ${decided.length} rows (${ready.length} held a link, ` +
        `${awaitingLink.length} never did), ${stamps} stamps to clear`
    );
  }

  const rows = plan.reduce((n, p) => n + p.personEventIds.length, 0);
  const stamps = plan.reduce((n, p) => n + p.stamps, 0);
  console.log(`\nTOTAL: ${rows} withheld rows, ${stamps} stamps cleared, ${plan.length} events`);

  if (!APPLY) {
    console.log('\nDry run. Re-run with --apply to write it.');
    return;
  }

  const written = await prisma.$transaction(
    async (tx) => {
      let created = 0;
      let cleared = 0;
      for (const p of plan) {
        /*
         * ⚠ IDEMPOTENT BY CONSTRUCTION: re-selecting the legacy predicate INSIDE the transaction
         * means a second run finds nothing, because the first run's rows disqualify the event.
         * A re-run is a no-op rather than a duplicate — the property `gtc312_backfill_phone_number`
         * got from its `IS NULL` guard, reached here through the predicate instead.
         */
        const stillLegacy = await tx.event.count({ where: { id: p.eventId, ...LEGACY_EVENT } });
        if (stillLegacy === 0) continue;

        const result = await tx.outboundMessage.createMany({
          data: p.personEventIds.map((personEventId) => ({
            eventId: p.eventId,
            personEventId,
            kind: 'ASK' as const,
            // ⚠ NULL, and it is [[GTC-325]] that made it expressible. No chooser ran at that
            // press, so any value would date a routing decision to a press that never made one.
            channel: null,
            withheldAt: new Date(),
            withheldWhy: 'PREDATES_SENDER',
          })),
        });
        created += result.count;

        const upd = await tx.personEvent.updateMany({
          where: { eventId: p.eventId, sentAt: { not: null } },
          data: { sentAt: null },
        });
        cleared += upd.count;
      }
      return { created, cleared };
    },
    { timeout: 120_000, maxWait: 20_000 }
  );

  console.log(`\n✓ wrote ${written.created} rows, cleared ${written.cleared} stamps`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
