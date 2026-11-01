import type { Prisma, PrismaClient } from '@prisma/client';
import { nzDayStart } from '@/lib/lifecycle';
import { copyEventWhere, DEMO_COPY_EMAIL_DOMAIN } from '@/lib/demo/copy';
import { DEMO_AI_LIMITS, demoAiUsedToday, type DemoAiLimits } from '@/lib/demo/ai-cap';

/**
 * [[GTC-392]] part A — THE LIMIT ON STARTING COPIES, AND THE WORDS ABOUT STARTING ONE. Founder plan
 * rulings, 18 Oct 2026 (Q6, Q7, W7 to W11, W15).
 *
 * [[GTC-443]] (founder rulings, 1 Nov 2026, Q12 (a) and Q13 as amended): every count comes from
 * the database, so a deploy cannot reset it, and runs inside the copy's own transaction under
 * one lock (copy.ts), so two quick starts cannot both slip through. In order:
 *   - per visitor: 3 copies an hour. The visitor is X-Real-IP, else one X-Forwarded-For entry
 *     (`pickForwardedEntry`). Her address is never stored: its keyed hash, 8 hex, is the last 8
 *     characters of each copy's throwaway address, and the count is the copies of the last hour
 *     whose address ends `<tag>@demo-copy.invalid`. With no header (or no key) this one is skipped;
 *   - for everyone: 30 copies in the last hour (W8a), 150 since today's NZ midnight (W8b), and the
 *     day's AI total (W8b, Q7: nobody starts a copy that would stop at Moment 2).
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

/**
 * WHICH X-FORWARDED-FOR ENTRY IS THE VISITOR. NOT FINAL ([[GTC-443]], Q13): the end is chosen
 * after the founder's staging check. Until then, the plan's recommendation: the LAST entry, the
 * one the platform's edge appends. Reading the first instead is this one line: `entries[0]`.
 */
export function pickForwardedEntry(entries: readonly string[]): string | undefined {
  return entries[entries.length - 1];
}

/** What the start's headers say. `address` is only ever hashed: never logged, never stored. */
export interface DemoVisitor {
  address: string | null;
  realIpPresent: boolean;
  forwardedEntries: number;
}

/** X-Real-IP first, else the picked X-Forwarded-For entry; neither gives no address. */
export function visitorOf(
  headers: Headers,
  pick: (entries: readonly string[]) => string | undefined = pickForwardedEntry
): DemoVisitor {
  const realIp = headers.get('x-real-ip')?.trim() ?? '';
  const entries = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const address = realIp || pick(entries) || '';
  return {
    address: address ? address.toLowerCase() : null,
    realIpPresent: realIp !== '',
    forwardedEntries: entries.length,
  };
}

/** The one log line per start: counts only, never a value. */
export function startLogLine(visitor: DemoVisitor, tagged: boolean): string {
  const counts =
    `[demo-start] x-real-ip ${visitor.realIpPresent ? 'present' : 'absent'}; ` +
    `x-forwarded-for entries ${visitor.forwardedEntries}`;
  if (visitor.address === null) return `${counts}; no visitor header, per-visitor limit skipped`;
  if (!tagged) return `${counts}; no key, per-visitor limit skipped`;
  return counts;
}

/** The fixed label the tag's key is derived with, from CRON_SECRET. */
export const VISITOR_TAG_LABEL = 'gather demo start: visitor tag key, v1';

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** HMAC-SHA256 by Web Crypto (Node and the browser alike: the /demo page imports this file). */
async function hmac(key: BufferSource, message: string): Promise<Uint8Array<ArrayBuffer>> {
  const subtle = globalThis.crypto.subtle;
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, new TextEncoder().encode(message)));
}

/**
 * The visitor's tag: 8 hex of HMAC-SHA256(address), keyed by HMAC-SHA256(CRON_SECRET, the label).
 * No secret, no tag (the per-visitor limit is then skipped).
 */
export async function visitorTagOf(
  address: string,
  secret: string | undefined = process.env.CRON_SECRET
): Promise<string | null> {
  if (typeof secret !== 'string' || secret.length === 0) return null;
  const key = await hmac(new TextEncoder().encode(secret), VISITOR_TAG_LABEL);
  return hex((await hmac(key, address)).subarray(0, 4));
}

type Counter = Pick<PrismaClient, 'event'> | Pick<Prisma.TransactionClient, 'event'>;

/** The limits, in order. Called by copy.ts inside the copy's transaction, under its lock. */
export async function checkStartLimit(
  db: Counter,
  visitorTag: string | null,
  options: { now?: Date; limits?: DemoStartLimits; aiLimits?: DemoAiLimits } = {}
): Promise<{ ok: true } | { ok: false; words: string }> {
  const now = options.now ?? new Date();
  const limits = options.limits ?? DEMO_START_LIMITS;
  const aiLimits = options.aiLimits ?? DEMO_AI_LIMITS;
  const lastHour = { gt: new Date(now.getTime() - HOUR_MS), lte: now };

  if (visitorTag) {
    const mine = await db.event.count({
      where: {
        isDemo: true,
        host: { user: { email: { endsWith: `${visitorTag}@${DEMO_COPY_EMAIL_DOMAIN}` } } },
        createdAt: lastHour,
      },
    });
    if (mine >= limits.perVisitorHour) return { ok: false, words: DEMO_START_WORDS.OWN_LIMIT };
  }

  const hour = await db.event.count({ where: { ...copyEventWhere(), createdAt: lastHour } });
  if (hour >= limits.allHour) return { ok: false, words: DEMO_START_WORDS.BUSY };

  const today = await db.event.count({
    where: { ...copyEventWhere(), createdAt: { gte: nzDayStart(now), lte: now } },
  });
  if (today >= limits.allDay) return { ok: false, words: DEMO_START_WORDS.FULL };

  if ((await demoAiUsedToday(db, now)) >= aiLimits.perDay) {
    return { ok: false, words: DEMO_START_WORDS.FULL };
  }
  return { ok: true };
}
