import type { PrismaClient } from '@prisma/client';

/**
 * GTC-189 slice 5c, FIRST HALF — the drain's two passes and its two claims.
 *
 * ⚠ NOTHING HERE SENDS ANYTHING, AND NOTHING HERE IS CALLED BY THE ROUTE'S DRAIN YET.
 *
 * The claim primitives below are built and proven against real rows
 * (`tests/outbound-dispatch-test.ts` layers C and Y), and the cron route reports what it WOULD
 * drain without taking a claim. That boundary is not caution, it is the schema's own definition:
 *
 *   "a row left with `attemptedAt` set and no end state below is a crashed attempt — a visible
 *    fact rather than a silent resend."
 *
 * So a route that claimed rows before a transport existed would turn EVERY row it touched into a
 * permanent crashed attempt, on a press ruled one act with no recall (Hinge §2, ruled gap #1).
 * The claim goes live in the same commit as the thing that can finish a row.
 *
 * ── THE FIRST CLAIM IS THE SCHEMA'S INSTRUCTION ───────────────────────────────
 *
 * `updateMany` on `attemptedAt: null`, and send only when the update count is 1. The schema
 * states both the mechanism and why this model departs from the house dispatcher pattern
 * deliberately: `dispatchPendingWrapUpMessages` in src/lib/wrap-up.ts marks its rows AFTER
 * sending, so a crash between the send and the mark re-sends on the next tick and two overlapping
 * cron runs both send. For a wrap-up thank-you that is a duplicate thank-you. For the press it is
 * a second invitation to everyone in the window.
 *
 * ── ⚠ THE RETRY CLAIM IS THE EXECUTOR'S, AND THE SCHEMA DOES NOT SETTLE IT ────
 *
 * Founder confirmation, 2026-09-19: *"your compare-and-swap on nextAttemptAt is right and the
 * schema genuinely does not settle it. Record that as yours rather than the schema's."*
 *
 * On a retry `attemptedAt` is ALREADY SET, so the schema's `attemptedAt: null` predicate matches
 * nothing and cannot be reused. The compare-and-swap is on `nextAttemptAt`, which the claim also
 * CLEARS. A row is therefore either WAITING (`nextAttemptAt` set) or IN FLIGHT (cleared) and never
 * both — so the retry pass is as unforgeable as the first, and the two predicates are disjoint,
 * which is what stops one tick claiming the same row through both passes.
 *
 * ── THE ORDER THE SECOND HALF MUST KEEP ───────────────────────────────────────
 *
 * ⚠ GATES, THEN QUIET HOURS, THEN CLAIM, THEN SEND. Ruled 2026-09-19, and the reason is the
 * ruling: claiming first and then deferring leaves `attemptedAt` set with no outcome, which the
 * schema defines as a crashed attempt. A deferred row must be left UNTOUCHED — the wrap-up
 * dispatcher's deferral is "implicit and durable — no scheduler, no timer", and this one is the
 * same, except per row and for text only, because quiet hours binds one channel and the ask is
 * mixed.
 *
 * ── THREE RULINGS THE SECOND HALF INHERITS, RECORDED HERE SO IT MEETS THEM ────
 *
 * ⚠ 1. `SMS_DISABLED` IS A WITHHOLDING, NOT A PROVIDER ERROR. Ruled 2026-09-19. `sendSms` answers
 * `blocked: 'SMS_DISABLED'` when no provider is configured — which in this environment is the ONLY
 * text outcome, because `TNZ_AUTH_TOKEN` is absent from both env files, so a `+64` number is
 * refused before any provider call. Gather did not send it and the provider never saw it, so it
 * belongs in `withheldWhy` and never in `providerError`. **Ruled for that reason and not merely
 * ruled:** ruling AN separated the two outcome doors precisely so this could not be settled by
 * whichever branch happened to get written first, and this is the case that would have settled it.
 *
 * ⚠ 2. THE ASK'S TEXT SEND WILL WRITE A FALSE `NUDGE_SENT_AUTO`, AND THAT IS A RULED STOPGAP.
 * `InviteEventType` has no member for an ask being sent, and `sendSms` writes `NUDGE_SENT_AUTO`
 * unconditionally, inside itself. So an accepted ask text logs a row saying a nudge was sent, at
 * the press, before any nudge exists. Ruled 2026-09-19: leave it, record the falsity here, and
 * file the fix — which is [[GTC-288]]'s, because the only thing that row is carrying is the STOP
 * attribution, and `POST /api/sms/inbound` can read `OutboundMessage.providerMessageId` instead of
 * scanning `InviteEvent.metadata`. That retires the index rather than adding a member to it.
 * Measured at the ruling: the ask is 231 EMAIL to 1 TEXT, so a press writes ONE false row today;
 * and `NUDGE_SENT_AUTO` has ZERO rows in `gather_dev`, so nothing live depends on it either way.
 * ⚠ DO NOT "FIX" THIS BY ADDING AN ENUM MEMBER. That is a migration bought to feed an index
 * GTC-288 is retiring.
 *
 * ⚠ 3. A 401 OR 403 FROM EITHER PROVIDER IS TERMINAL AND LOUD. Ruled 2026-09-19. In this
 * environment every provider answer is an auth failure ([[GTC-247]]), so a policy that retries
 * "any error" queues every row three times against a key that will never work, and the noise is
 * indistinguishable from a transient outage. Retry only a thrown or network error and a 429 or
 * 5xx; never a 4xx that is not 429, never a `blocked` value, never a withholding.
 */

/** A row the drain may take. Deliberately narrow: the second half widens it when it sends. */
export interface DrainCandidate {
  id: string;
  eventId: string;
  personEventId: string;
  createdAt: Date;
  attemptCount: number;
}

const CANDIDATE_SELECT = {
  id: true,
  eventId: true,
  personEventId: true,
  createdAt: true,
  attemptCount: true,
} as const;

/**
 * Pass one: rows nobody has attempted, oldest first.
 *
 * FIFO by `createdAt`, which is the order `@@index([attemptedAt, createdAt])` exists for — the
 * schema names it "THE DRAIN, in the shape of `WrapUpLink`'s @@index([dispatched, createdAt])".
 *
 * ⚠ BOUNDED, ALWAYS. A tick that reads an unbounded table is a tick whose cost is a property of
 * the database's history rather than of the work in front of it. The schema also instructs slice 5
 * to `EXPLAIN (ANALYZE, BUFFERS)` the real drain against a table large enough to mean something —
 * `OutboundMessage` holds 0 rows today, so that measurement is owed and is named as unsizeable in
 * this slice's evidence.
 */
export async function findNeverAttempted(
  db: PrismaClient,
  take: number
): Promise<DrainCandidate[]> {
  return db.outboundMessage.findMany({
    where: { attemptedAt: null },
    orderBy: { createdAt: 'asc' },
    take,
    select: CANDIDATE_SELECT,
  });
}

/**
 * Pass two: rows whose backoff has elapsed, earliest due first.
 *
 * `nextAttemptAt` is both the wait and the claim key — see `claimForRetry`. A row with a FUTURE
 * `nextAttemptAt` is deliberately not returned: the backoff is a wait, not a queue position.
 */
export async function findDueForRetry(
  db: PrismaClient,
  take: number,
  now: Date = new Date()
): Promise<DrainCandidate[]> {
  return db.outboundMessage.findMany({
    where: { nextAttemptAt: { not: null, lte: now } },
    orderBy: { nextAttemptAt: 'asc' },
    take,
    select: CANDIDATE_SELECT,
  });
}

/**
 * Take a row for its FIRST attempt. True when this caller got it.
 *
 * The schema's own instruction, and the guarantee it buys: two overlapping cron runs cannot both
 * send, because only one `updateMany` can match `attemptedAt: null`. A double-send is
 * structurally impossible rather than merely unlikely.
 *
 * ⚠ THE CLAIM IS SET BEFORE THE PROVIDER IS CALLED, NOT AFTER, and a failed claim touches
 * nothing — no stamp, no increment.
 */
export async function claimForFirstAttempt(db: PrismaClient, id: string): Promise<boolean> {
  const { count } = await db.outboundMessage.updateMany({
    where: { id, attemptedAt: null },
    data: { attemptedAt: new Date(), attemptCount: { increment: 1 } },
  });
  return count === 1;
}

/**
 * Take a row for a RETRY. True when this caller got it.
 *
 * ⚠ THE COMPARE-AND-SWAP, AND IT IS THE EXECUTOR'S RATHER THAN THE SCHEMA'S — see the module
 * docstring. The predicate is `nextAttemptAt` being set AND due, and the claim clears it. So:
 *
 *   - a row waiting for its backoff has `nextAttemptAt` set and cannot be sent;
 *   - a row in flight has it cleared and cannot be claimed again;
 *   - and `attemptedAt` is re-stamped, so this attempt's own crash is visible as one.
 *
 * The two claim predicates are DISJOINT — `attemptedAt: null` and `nextAttemptAt` set — so no row
 * can be taken by both passes on the same tick. That disjointness is the property, not an
 * accident of ordering the two calls.
 */
export async function claimForRetry(
  db: PrismaClient,
  id: string,
  now: Date = new Date()
): Promise<boolean> {
  const { count } = await db.outboundMessage.updateMany({
    where: { id, nextAttemptAt: { not: null, lte: now } },
    data: { nextAttemptAt: null, attemptedAt: now, attemptCount: { increment: 1 } },
  });
  return count === 1;
}

/** What a tick would take, without taking it. */
export interface DrainDescription {
  neverAttempted: number;
  dueForRetry: number;
  wouldDrain: number;
  /** Always 0 in this half. The second half replaces this with what it actually did. */
  claimed: number;
  sent: number;
}

/**
 * Read both passes and report them. **Claims nothing.**
 *
 * This is what the cron route calls in slice 5c's first half. It exists so the route's auth shape,
 * its registration and both drain queries are exercised and asserted before anything can be
 * claimed — and so the operator hitting the endpoint gets a true answer rather than a 200 that
 * means nothing.
 */
export async function describeDrain(db: PrismaClient, take: number): Promise<DrainDescription> {
  const [never, due] = await Promise.all([findNeverAttempted(db, take), findDueForRetry(db, take)]);
  return {
    neverAttempted: never.length,
    dueForRetry: due.length,
    wouldDrain: never.length + due.length,
    claimed: 0,
    sent: 0,
  };
}

/** How many rows one tick looks at. Bounded; see `findNeverAttempted`. */
export const DRAIN_BATCH = 100;
