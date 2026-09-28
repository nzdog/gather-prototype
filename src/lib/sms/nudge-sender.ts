import { prisma } from '@/lib/prisma';
import { NudgeCandidate } from './nudge-eligibility';

/**
 * GTC-178 (E1, phase 5): ORDINAL. Was `'24h' | '48h'`. The legs are days 4 and 7 now and
 * GTC-179 (E2) makes even that adjustable, so the type says WHICH nudge, never when.
 *
 * This value reaches `InviteEvent.metadata.nudgeType` through `sendSms`, so it is a
 * stored vocabulary, not just an internal label. Keep it stable.
 */
export type NudgeLeg = 'first' | 'second';

/** The row kind each leg writes. `OutboundKind`'s docstring maps them one-to-one. */
export const CHASE_KIND = { first: 'CHASE_FIRST', second: 'CHASE_SECOND' } as const;

export interface ChaseQueued {
  personId: string;
  personName: string;
  nudgeType: NudgeLeg;
  channel: 'EMAIL' | 'TEXT';
  /** False only when a concurrent tick had already queued this leg. */
  queued: boolean;
  outboundMessageId?: string;
}

/**
 * [[GTC-189]] SLICE 8b, FOUNDER RULING D2 — THE CHASE WRITES ROWS AND THE DISPATCHER SENDS THEM.
 *
 * ⚠ THIS FUNCTION SENDS NOTHING. It used to be `processNudges`, which called `sendSms` itself: no
 * claim, so two overlapping ticks could both send; no row, so a chase email's bounce or complaint
 * could never be read back; and quiet hours deferred the whole run by logging and skipping. Now each
 * reminder is ONE `OutboundMessage` row of kind CHASE_FIRST or CHASE_SECOND, and `drainOnce` in
 * `src/lib/press/dispatch.ts` does the rest — the chooser re-run, the gates, quiet hours (text only),
 * the claim, the real senders, and the retry. There is no second send path.
 *
 * ⚠ ONE ROW PER LEG, AND THE LOCK IS WHAT MAKES "ONE" TRUE UNDER TWO TICKS. The schema refuses a
 * unique on (membership, kind) because ruling U's resend needs two ASK rows; so the check and the
 * create run under a transaction-scoped advisory lock keyed on the membership and the leg. A second
 * tick that races the first waits, finds the row, and writes nothing.
 */
export async function queueChase(candidates: {
  eligibleFirst: NudgeCandidate[];
  eligibleSecond: NudgeCandidate[];
}): Promise<ChaseQueued[]> {
  const out: ChaseQueued[] = [];
  const legs: [NudgeLeg, NudgeCandidate[]][] = [
    ['first', candidates.eligibleFirst],
    ['second', candidates.eligibleSecond],
  ];
  for (const [leg, list] of legs) {
    for (const c of list) {
      const kind = CHASE_KIND[leg];
      const id = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${c.personEventId}:${kind}`}))`;
        const existing = await tx.outboundMessage.findFirst({
          where: { personEventId: c.personEventId, kind },
          select: { id: true },
        });
        if (existing) return null;
        const row = await tx.outboundMessage.create({
          data: { eventId: c.eventId, personEventId: c.personEventId, kind, channel: c.channel },
          select: { id: true },
        });
        return row.id;
      });
      out.push({
        personId: c.personId,
        personName: c.personName,
        nudgeType: leg,
        channel: c.channel,
        queued: id !== null,
        ...(id ? { outboundMessageId: id } : {}),
      });
    }
  }
  return out;
}
