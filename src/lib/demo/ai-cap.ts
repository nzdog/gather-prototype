import type { PrismaClient } from '@prisma/client';
import { nzDayStart } from '@/lib/lifecycle';
import { copyEventWhere } from '@/lib/demo/copy';

/**
 * [[GTC-392]] part A — THE AI CAP FOR SAMPLE COPIES. Founder plan rulings, 18 Oct 2026 (Q6, Q7,
 * W5, W6). Called by all six AI routes before their first costly step.
 *
 * A real event answers "not a demo" and its route does exactly what it did: its own limit, its own
 * count. A copy, in one short transaction under an advisory lock (so two presses cannot both pass):
 *   - the day's total, the sum of `aiCallsUsed` over copies started since today's NZ midnight, at
 *     or over its number refuses with W6;
 *   - the copy's own allowance is taken by a conditional update; none left refuses with W5;
 *   - otherwise the call is counted BEFORE it is made (a failed call still used one, GTC-237's
 *     rule), and the route skips its own count.
 * Kept out of `src/lib/ai` on purpose: suites run `git diff` on that folder.
 */

export const DEMO_AI_LIMITS = { perCopy: 3, perDay: 100 } as const;

export const DEMO_AI_WORDS = {
  /** W5 */
  COPY_USED_UP:
    'This sample event has made all the plans it can. You can still change the plan by hand.',
  /** W6 */
  DAY_USED_UP: 'The sample has made all the plans it can for today. Please try again tomorrow.',
} as const;

export type DemoAiLimits = { perCopy: number; perDay: number };
export type DemoAiTake = { ok: true; counted: boolean } | { ok: false; words: string };

/** One key for every copy's AI count, so the day's total is read and taken in turn. */
const AI_LOCK_KEY = 392_001;

/** Plans made today by every copy started today (NZ day). */
export async function demoAiUsedToday(
  db: Pick<PrismaClient, 'event'>,
  now: Date = new Date()
): Promise<number> {
  const sum = await db.event.aggregate({
    where: { ...copyEventWhere(), createdAt: { gte: nzDayStart(now) } },
    _sum: { aiCallsUsed: true },
  });
  return sum._sum.aiCallsUsed ?? 0;
}

export async function takeDemoAiCall(
  db: PrismaClient,
  eventId: string,
  options: { now?: Date; limits?: DemoAiLimits } = {}
): Promise<DemoAiTake> {
  const now = options.now ?? new Date();
  const limits = options.limits ?? DEMO_AI_LIMITS;
  const copy = await db.event.findFirst({
    where: { id: eventId, ...copyEventWhere() },
    select: { id: true },
  });
  if (!copy) return { ok: true, counted: false };

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${AI_LOCK_KEY}::bigint)`;
    if ((await demoAiUsedToday(tx, now)) >= limits.perDay) {
      return { ok: false, words: DEMO_AI_WORDS.DAY_USED_UP } as const;
    }
    const taken = await tx.event.updateMany({
      where: { id: eventId, aiCallsUsed: { lt: limits.perCopy } },
      data: { aiCallsUsed: { increment: 1 } },
    });
    if (taken.count === 0) return { ok: false, words: DEMO_AI_WORDS.COPY_USED_UP } as const;
    return { ok: true, counted: true } as const;
  });
}
