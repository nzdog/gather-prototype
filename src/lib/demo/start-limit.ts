import type { PrismaClient } from '@prisma/client';
import { nzDayStart } from '@/lib/lifecycle';
import { copyEventWhere } from '@/lib/demo/copy';
import { DEMO_AI_LIMITS, demoAiUsedToday, type DemoAiLimits } from '@/lib/demo/ai-cap';

/**
 * [[GTC-392]] part A — THE LIMIT ON STARTING COPIES, AND THE WORDS ABOUT STARTING ONE. Founder plan
 * rulings, 18 Oct 2026 (Q6, Q7, W7 to W11, W15).
 *
 * Checked in the demo route's copy shape, after the session-presence 409 and before the copy's
 * transaction. In order:
 *   - per visitor: 3 copies an hour, by address, in this server's memory (as GTC-388's test email
 *     keeps its limit); the header the platform sets is confirmed at deploy. A visitor who spoofs
 *     the header escapes only this one;
 *   - for everyone, counted from the database so a restart cannot reset it: 30 copies in the last
 *     hour (W8a), 150 since today's NZ midnight (W8b), and the day's AI total (W8b, Q7: nobody
 *     starts a copy that would stop at Moment 2).
 * Takes the client as an argument: the /demo page imports the words from here.
 */

export const DEMO_START_LIMITS = { perVisitorHour: 3, allHour: 30, allDay: 150 } as const;
export type DemoStartLimits = { perVisitorHour: number; allHour: number; allDay: number };

export const DEMO_START_WORDS = {
  /** W7 */
  OWN_LIMIT:
    "You've started a few sample events in the last hour. Please try again a little later.",
  /** W8a */
  BUSY: 'Lots of people are trying Gather right now. Please try again in a few minutes.',
  /** W8b */
  FULL: 'The sample is full for today. Please try again tomorrow.',
  /** W9 */
  SIGNED_IN: "You're signed in to Gather. Sign out first to try a sample event.",
  /** W10, and its link */
  ALREADY_OPEN: 'You already have a sample event open.',
  GO_TO_IT: 'Go to it →',
  /** W11 */
  BUTTON: 'Try it with your own sample event →',
  /** W15 */
  FAILED: 'The sample event could not be started. Please try again.',
} as const;

const HOUR_MS = 60 * 60 * 1000;

/** Start times per visitor, in this server's memory only. */
const startsByVisitor = new Map<string, number[]>();

/** The visitor: the first address in x-forwarded-for, else x-real-ip. */
export function visitorOf(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || headers.get('x-real-ip')?.trim() || 'unknown';
}

/** The starts that still count at `now`: within the last hour, and none from a time not yet come. */
function startsInWindow(times: readonly number[], now: number): number[] {
  return times.filter((t) => t <= now && now - t < HOUR_MS);
}

/** Record a copy started by this visitor (after the copy is written). */
export function noteStart(visitor: string, now: number = Date.now()): void {
  startsByVisitor.set(visitor, [...startsInWindow(startsByVisitor.get(visitor) ?? [], now), now]);
}

export async function checkStartLimit(
  db: PrismaClient,
  visitor: string,
  options: { now?: Date; limits?: DemoStartLimits; aiLimits?: DemoAiLimits } = {}
): Promise<{ ok: true } | { ok: false; words: string }> {
  const now = options.now ?? new Date();
  const limits = options.limits ?? DEMO_START_LIMITS;
  const aiLimits = options.aiLimits ?? DEMO_AI_LIMITS;

  const mine = startsInWindow(startsByVisitor.get(visitor) ?? [], now.getTime());
  if (mine.length >= limits.perVisitorHour) return { ok: false, words: DEMO_START_WORDS.OWN_LIMIT };

  const lastHour = await db.event.count({
    where: {
      ...copyEventWhere(),
      createdAt: { gt: new Date(now.getTime() - HOUR_MS), lte: now },
    },
  });
  if (lastHour >= limits.allHour) return { ok: false, words: DEMO_START_WORDS.BUSY };

  const today = await db.event.count({
    where: { ...copyEventWhere(), createdAt: { gte: nzDayStart(now), lte: now } },
  });
  if (today >= limits.allDay) return { ok: false, words: DEMO_START_WORDS.FULL };

  if ((await demoAiUsedToday(db, now)) >= aiLimits.perDay) {
    return { ok: false, words: DEMO_START_WORDS.FULL };
  }
  return { ok: true };
}
