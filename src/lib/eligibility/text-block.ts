import type { Prisma } from '@prisma/client';

/**
 * [[GTC-258]] — A NUMBER GATHER WILL NOT TEXT AGAIN, FOR ANY HOST. The fact, its one writer's rule,
 * and the reads. The text twin of `./email-block.ts`.
 *
 * Founder ruling Q2, 2026-10-02: *"A number that doesn't work is never texted again, and later
 * messages go by email. A number on TNZ's opt-out list isn't shown red, but isn't texted again."*
 * Plan ruling Q1: *"A number on TNZ's opt-out list is the guest's own STOP. Ruling O ... applies, as
 * it does to a STOP that reaches Gather."*
 *
 * ── THE TWO REASONS, AND HOW EACH IS READ ────────────────────────────────────
 *
 *   DEAD_CHANNEL — TNZ said the number cannot receive. The chooser treats it as a number Gather
 *                  cannot text, which is what PHONE_UNUSABLE already means (`numberDead`).
 *   OPTED_OUT    — TNZ said the number is on their opt-out list. It joins the opt-out fact
 *                  (`smsOptedOutFact` in `src/lib/preflight/ask-preview.ts`), so every reader of
 *                  that fact treats it as the guest's own STOP.
 *
 * ⚠ THIS IS NOT ZONE 7, AND IT MUST NEVER WRITE ZONE 7. A delivery report is not licence to write
 * the opt-out table or the person's flag: those are written only by a guest's own STOP or START
 * (`src/lib/sms/tnz-reply-record.ts`). So the fact lives here, and the readers merge it.
 *
 * ⚠ KEYED ON THE NUMBER, EXACTLY AS THE SEND WAS GIVEN IT, E.164 — the form every reader compares.
 */

export type TextBlockReason = 'DEAD_CHANNEL' | 'OPTED_OUT';

export interface TextBlockFact {
  reason: TextBlockReason;
  eventId: string | null;
  firstSeenAt: Date;
}

/**
 * The blocks IN FORCE for a set of numbers, in ONE query — the shape `listEmailBlocks` uses, for its
 * reason: a roster walk must not put the query count under the guest list's control.
 */
export async function listTextBlocks(
  db: Prisma.TransactionClient,
  numbers: readonly (string | null | undefined)[]
): Promise<Map<string, TextBlockFact>> {
  const wanted = [...new Set(numbers.filter((n): n is string => !!n))];
  if (wanted.length === 0) return new Map();
  const rows = await db.textBlock.findMany({
    where: { phoneNumber: { in: wanted }, liftedAt: null },
    select: { phoneNumber: true, reason: true, eventId: true, firstSeenAt: true },
  });
  return new Map(
    rows.map((r) => [
      r.phoneNumber,
      { reason: r.reason as TextBlockReason, eventId: r.eventId, firstSeenAt: r.firstSeenAt },
    ])
  );
}

/** TNZ said this number does not work. */
export function numberDeadOf(
  phoneNumber: string | null | undefined,
  blocks: ReadonlyMap<string, TextBlockFact>
): boolean {
  return !!phoneNumber && blocks.get(phoneNumber)?.reason === 'DEAD_CHANNEL';
}

/** TNZ said this number is on their opt-out list — the guest's own STOP (plan ruling Q1). */
export function tnzOptedOutOf(
  phoneNumber: string | null | undefined,
  blocks: ReadonlyMap<string, TextBlockFact>
): boolean {
  return !!phoneNumber && blocks.get(phoneNumber)?.reason === 'OPTED_OUT';
}

/**
 * THE ONE WRITER'S RULE. Called only where a TNZ delivery report is applied
 * (`src/lib/sms/tnz-delivery-record.ts`), inside the transaction that applies it.
 *
 * First write wins: TNZ retry a report for 24 hours, and two reports can name one number. A LIFTED
 * row is re-armed by the next blocking report, with that report's reason, message and event — a
 * START took the number off TNZ's list, and a later report says it is blocked again.
 */
export async function recordTextBlock(
  tx: Prisma.TransactionClient,
  args: {
    phoneNumber: string;
    reason: TextBlockReason;
    outboundMessageId: string | null;
    eventId: string | null;
  }
): Promise<void> {
  // An upsert rather than read-then-create: two reports racing must not fail on the unique.
  await tx.textBlock.upsert({
    where: { phoneNumber: args.phoneNumber },
    create: {
      phoneNumber: args.phoneNumber,
      reason: args.reason,
      outboundMessageId: args.outboundMessageId,
      eventId: args.eventId,
    },
    update: {},
  });
  await tx.textBlock.updateMany({
    where: { phoneNumber: args.phoneNumber, liftedAt: { not: null } },
    data: {
      liftedAt: null,
      reason: args.reason,
      firstSeenAt: new Date(),
      outboundMessageId: args.outboundMessageId,
      eventId: args.eventId,
    },
  });
}

/**
 * A START from the number (plan ruling Q11). TNZ's page: a START takes the number off their opt-out
 * list, so Gather may text it again. Only an OPTED_OUT block is lifted; a START never lifts a dead
 * number. Returns how many rows it lifted.
 *
 * ⚠ CALLED BY THE WEBHOOK ROUTE BESIDE `recordTnzReply`, NOT FROM INSIDE IT: Zone 7's writer is
 * not edited for this. It lifts whether or not Gather had its own opt-out in force for the number —
 * the case TNZ's list holds a number Gather never heard a STOP from.
 */
export async function liftTextOptOutBlock(
  db: Prisma.TransactionClient,
  phoneNumber: string | null
): Promise<number> {
  if (!phoneNumber) return 0;
  const { count } = await db.textBlock.updateMany({
    where: { phoneNumber, reason: 'OPTED_OUT', liftedAt: null },
    data: { liftedAt: new Date() },
  });
  return count;
}
