import type { Prisma, PrismaClient } from '@prisma/client';

/**
 * [[GTC-392]] part A — A VISITOR'S OWN SAMPLE EVENT. Founder plan rulings, 18 Oct 2026 (Q1, Q8 to
 * Q10, W12 to W14).
 *
 * One transaction writes the rows a paid event starts with (`POST /api/events`), minus Stripe,
 * plus `isDemo` and her two-hour session: a throwaway account, its host Person, the event with its
 * empty setup record, a HOST role, and the session. A failure anywhere writes nothing. The caller
 * (`POST /api/demo/session`, its copy shape) sets the cookie after the commit.
 *
 * WHAT MARKS A COPY (Q10), until part D retires the shared sample: its host account's address ends
 * `@demo-copy.invalid`, a reserved name that cannot be delivered to. No column.
 */

/** Random hex from Web Crypto (Node 20 and the browser alike), so the /demo page may import this chain. */
function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const DEMO_COPY_EMAIL_DOMAIN = 'demo-copy.invalid';
/** W12 */
export const DEMO_COPY_NAME = 'Your sample gathering';
/** W13 — seen in her messages' sign-off. */
export const DEMO_HOST_NAME = 'Sam';
/** Q8 — as GTC-269 ruled for the old demo. */
export const DEMO_SESSION_HOURS = 2;

/** The rows that are copies: sample events whose host's account is a copy's. */
export function copyEventWhere(): Prisma.EventWhereInput {
  return { isDemo: true, host: { user: { email: { endsWith: `@${DEMO_COPY_EMAIL_DOMAIN}` } } } };
}

/**
 * W14 — the copy's day: today's NZ date plus four weeks, then on to the Saturday (the same day if
 * it is one), stored as a bare day at 00:00 UTC, as the other writers store a day.
 */
export function demoCopyDay(now: Date): Date {
  const nzDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Pacific/Auckland',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = nzDate.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d + 28));
  day.setUTCDate(day.getUTCDate() + ((6 - day.getUTCDay() + 7) % 7));
  return day;
}

export interface StartedCopy {
  eventId: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}

/**
 * [[GTC-443]] One key for every copy start, so the start limits are read and the copy written in
 * turn. ai-cap's key is 392001; nothing else in src names this one.
 */
export const DEMO_START_LOCK_KEY = 392_002;

/**
 * [[GTC-443]] A copy's account address: 32 hex. With a visitor's tag (8 hex, start-limit.ts), the
 * first 24 are random and the last 8 are the tag, so `crowdTagOf` (the first 8) is unchanged and
 * the start limit counts her copies by their ending. With none, all 32 are random.
 */
export function copyAccountAddress(visitorTag?: string | null): string {
  const tag = typeof visitorTag === 'string' && /^[0-9a-f]{8}$/.test(visitorTag) ? visitorTag : '';
  return `${randomHex(tag ? 12 : 16)}${tag}@${DEMO_COPY_EMAIL_DOMAIN}`;
}

/** Run inside the copy's transaction, after the lock and before any write. */
export type DemoStartCheck = (
  tx: Prisma.TransactionClient,
  now: Date
) => Promise<{ ok: true } | { ok: false; words: string }>;

/**
 * [[GTC-443]] THE CHECK AND THE WRITE, IN ONE TRANSACTION UNDER ONE LOCK: the lock first, then
 * `check` (the start limits), then the six rows. A refusal writes nothing.
 */
export async function startDemoCopyWithinLimit(
  db: PrismaClient,
  check: DemoStartCheck,
  options: { now?: Date; visitorTag?: string | null } = {}
): Promise<{ ok: true; copy: StartedCopy } | { ok: false; words: string }> {
  const now = options.now ?? new Date();
  const email = copyAccountAddress(options.visitorTag);
  const day = demoCopyDay(now);
  const sessionToken = randomHex(32);
  const expiresAt = new Date(now.getTime() + DEMO_SESSION_HOURS * 60 * 60 * 1000);

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DEMO_START_LOCK_KEY}::bigint)`;
    // The clock is read once the lock is held: a start that waited must count the copy written
    // while it waited, whose createdAt is later than any time taken before the wait.
    const limit = await check(tx, options.now ?? new Date());
    if (!limit.ok) return { ok: false, words: limit.words } as const;
    const user = await tx.user.create({ data: { email } });
    const host = await tx.person.create({
      data: { name: DEMO_HOST_NAME, email, userId: user.id },
    });
    const event = await tx.event.create({
      data: {
        name: DEMO_COPY_NAME,
        startDate: day,
        endDate: day,
        status: 'DRAFT',
        structureMode: 'EDITABLE',
        isLegacy: false,
        isDemo: true,
        guestCountConfidence: 'MEDIUM',
        dietaryStatus: 'UNSPECIFIED',
        dietaryVegetarian: 0,
        dietaryVegan: 0,
        dietaryGlutenFree: 0,
        dietaryDairyFree: 0,
        venueOvenCount: 0,
        hostId: host.id,
        setup: { create: {} },
      },
    });
    // [[GTC-441]] T2: the host is a sample person too; the event's id exists only now.
    await tx.person.update({ where: { id: host.id }, data: { sampleEventId: event.id } });
    await tx.eventRole.create({ data: { userId: user.id, eventId: event.id, role: 'HOST' } });
    await tx.session.create({ data: { userId: user.id, token: sessionToken, expiresAt } });
    return {
      ok: true,
      copy: { eventId: event.id, userId: user.id, sessionToken, expiresAt },
    } as const;
  });
}

/** A copy with no limit to check (the suites' own starts): the same transaction and lock. */
export async function startDemoCopy(
  db: PrismaClient,
  options: { now?: Date; visitorTag?: string | null } = {}
): Promise<StartedCopy> {
  const started = await startDemoCopyWithinLimit(db, async () => ({ ok: true }), options);
  if (!started.ok) throw new Error(started.words);
  return started.copy;
}
