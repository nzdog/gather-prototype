import type { PrismaClient } from '@prisma/client';
import { getResendClient } from '@/lib/email';
import { BLOCKING_OUTCOMES, recordEmailBlock } from '@/lib/eligibility/email-block';
import {
  interpretResendLastEvent,
  readResendPollResponse,
  type ResendOutcomeKind,
} from './resend-delivery-contract';

/**
 * GTC-289 phase 4 ([[GTC-189]] slice 6) — THE POLLER. Gather asks Resend what happened.
 *
 * Phase 1 built the interpreter, phase 2 the submission-error contract, phase 3 the columns and the
 * writer for the code. This is the thing that fills the other four, and it is the first code in this
 * ticket that talks to a provider.
 *
 * ── WHY IT LIVES HERE AND NOT BESIDE THE DISPATCHER ───────────────────────────
 *
 * `src/lib/press/dispatch.ts` is the PRESS's dispatcher — that is the stated reason for its home. A
 * delivery poll is not the press: it runs after acceptance, for one channel, reading the contract in
 * this directory. So it sits with the contract it consumes. (The precedent rule: cite the reason a
 * previous build gave and check the reason still holds. [[GTC-192]]'s standing warning.)
 *
 * ── THE TWO PASSES, AND WHERE THEY CAME FROM ──────────────────────────────────
 *
 * ✅ THE REHEARSAL SPECIFIED THIS SHAPE BEFORE THE POLLER WAS WRITTEN. Phase 3a's `EXPLAIN` showed the
 * new index serving the PREDICATE and then SORTING anyway, because a btree ASC index orders NULLs LAST
 * and a never-checked row must sort FIRST. So: two passes, never-checked and then oldest-checked, each
 * reading in index order.
 *
 * ⚠ WHICH IS THE DRAIN'S OWN SHAPE, ARRIVED AT INDEPENDENTLY FOR A DIFFERENT REASON — slice 5c split
 * `findNeverAttempted` from `findDueForRetry` because the two predicates must be disjoint so one tick
 * cannot claim the same row twice. Two independent arrivals at one shape is the strongest evidence
 * available that the shape is the tree's rather than a preference.
 *
 * ── ⚠ AND UNLIKE THE DRAIN, THERE IS NO CLAIM. THAT IS DELIBERATE ─────────────
 *
 * The drain claims before sending because a double send is a second invitation to a real person, on a
 * press ruled ONE ACT, NO RECALL. **A double poll is two reads and one redundant write of the same
 * value.** So two overlapping cron runs polling the same row is harmless, and a claim would add a
 * column, a failure mode (a crashed poll leaving a row claimed forever) and nothing else. Do not add
 * one to make this look like the drain.
 *
 * ── ⚠ THE STOPPING RULE IS RULED; THE CADENCE IS PROPOSED ──────────────────────
 *
 * **STOP AFTER 24 HOURS OR A TERMINAL STATE, WHICHEVER COMES FIRST** — founder ruling, 2026-09-19:
 * *"A message that has not resolved in a day will not resolve, and a row polled forever is a queue
 * that grows without bound."*
 *
 * The CADENCE below is the executor's proposal and is one edit to change — see `POLL_LADDER`.
 */

/** Founder ruling, 2026-09-19. Measured from the provider's acceptance, not from the press. */
export const POLL_STOP_AFTER_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/**
 * HOW OFTEN ONE ROW IS ASKED ABOUT, BY ITS AGE SINCE ACCEPTANCE. ⚠ PROPOSED, NOT RULED.
 *
 * ── THE NUMBER THE FOUNDER ASKED ABOUT IS THIS ONE, NOT THE CRON'S ────────────
 *
 * The cron cadence is not a new decision: this runs on the drain's existing 2-minute tick (see the
 * route), so the heartbeat is already set. **What decides the request volume is the per-row interval
 * below.** The founder's arithmetic — *"polling every unresolved row every two minutes for a day is 720
 * requests per message"* — is exactly what this table exists to avoid: the tick wakes 720 times, and
 * asks about any one message about **31** times.
 *
 *   under 1 hour   → every 5 minutes    (12 asks)   the common case resolves in the first one or two
 *   1 to 6 hours   → every 30 minutes   (10 asks)   a soft bounce retried by the receiving MTA
 *   6 to 24 hours  → every 2 hours      ( 9 asks)   the long tail, then the stop
 *
 * **Why a ladder rather than one interval.** A fixed 15 minutes would be 96 asks per message AND a
 * slower first answer; a fixed 2 hours would be 12 asks and a two-hour-old board. The ladder is the
 * same shape as the retry's `BACKOFF_MINUTES`, which is already in this tree, so it is not new
 * machinery.
 *
 * ⚠ IT IS KEYED ON AGE AND NOT ON A COUNT, which is why phase 3a needed no poll-count column: the
 * age is `now - acceptedAt` and both are already stored.
 *
 * ⚠ AND NO OBSERVED LATENCY IS BEHIND ANY OF THESE NUMBERS. No accepted send has ever been made in
 * this environment ([[GTC-247]]) and Resend's own timings are not in the record ([[GTC-323]]). The
 * shape is defensible; the numbers are a proposal, and they are a table rather than three literals so
 * a ruling is one edit.
 */
export const POLL_LADDER: ReadonlyArray<{ throughMs: number; everyMs: number }> = [
  { throughMs: 1 * HOUR, everyMs: 5 * MINUTE },
  { throughMs: 6 * HOUR, everyMs: 30 * MINUTE },
  { throughMs: POLL_STOP_AFTER_MS, everyMs: 2 * HOUR },
];

/** How long to wait before asking again about a message this old. */
export function pollIntervalMsFor(ageSinceAcceptanceMs: number): number {
  for (const step of POLL_LADDER) {
    if (ageSinceAcceptanceMs < step.throughMs) return step.everyMs;
  }
  return POLL_LADDER[POLL_LADDER.length - 1].everyMs;
}

/**
 * ⚠ SMALLER THAN THE DRAIN'S 100, AND THE REASON IS THE SHARED ROUTE. Every row here is a network
 * round trip to Resend, and this runs on the SAME tick as the drain — after it, deliberately. A long
 * poll would delay the one job that is time-sensitive, and nobody is watching a delivery outcome.
 */
export const POLL_BATCH = 25;

/**
 * WHICH OUTCOMES END THE ASKING.
 *
 * ⚠ `PROVIDER_REPORTS_DELIVERED` IS NOT HERE, AND THAT IS THE ONE DECISION IN THIS FILE WORTH
 * ARGUING WITH. Stopping at `delivered` would be cheaper — the common case would resolve in one or two
 * asks instead of running to the 24-hour stop.
 *
 * **It is excluded because stopping there would foreclose a bounce or a complaint that arrives AFTER a
 * delivery, on an assumption nobody in this repo can check.** `last_event` is the LAST event, and
 * `complained` and `bounced` are two of its twelve values — so a complaint after a delivery would have
 * to appear there for the field to mean anything. **Whether it does is unobserved** ([[GTC-323]]).
 *
 * So the choice is between spending requests and depending on an unverified provider behaviour, and
 * the cost of being wrong is not symmetric: requests are cheap and a lost bounce is [[GTC-189]] Hinge
 * §7's whole rule failing silently. [[GTC-324]] is the same question for complaints and is High and
 * unruled.
 *
 * Also absent: `UNRECOGNISED`. A value the installed SDK does not declare means the SDK and the live
 * API have diverged, which is the last moment to stop looking.
 */
const TERMINAL_FOR_POLLING: ReadonlySet<ResendOutcomeKind> = new Set<ResendOutcomeKind>([
  'BOUNCED',
  'PROVIDER_FAILED',
  'SUPPRESSED',
  'COMPLAINED',
  'CANCELLED',
]);

export function isTerminalForPolling(kind: ResendOutcomeKind): boolean {
  return TERMINAL_FOR_POLLING.has(kind);
}

export interface PollResult {
  /** Rows looked at this tick. */
  considered: number;
  /** Rows the provider gave a state for. */
  read: number;
  /** Of those, rows that reached a terminal state and will not be asked about again. */
  resolved: number;
  /** Rows retired because nothing can ever be asked: accepted with no join key. */
  unjoinable: number;
  /** Rows retired at the 24-hour stop without ever resolving. */
  timedOut: number;
  /** Rows asked about where no state could be read — the only outcome this environment produces. */
  unreadable: number;
  /** ⚠ Rows where the provider answered about a DIFFERENT message id. See `pollOne`. */
  mismatched: number;
}

const EMPTY: PollResult = {
  considered: 0,
  read: 0,
  resolved: 0,
  unjoinable: 0,
  timedOut: 0,
  unreadable: 0,
  mismatched: 0,
};

/**
 * THE SECOND QUADRANT, REALISED. Accepted, no join key, so there is nothing to ask WITH.
 *
 * These rows leave the queue permanently with no delivery state, which is the state pair phase 3a's
 * schema note describes: `deliveryState` NULL and `deliveryPollDoneAt` set. [[GTC-264]] records how
 * they happen — `sendViaTnz` treats a 2xx with an unparseable body as a success and leaves the id
 * undefined — and the email half can do the same if Resend ever accepts without returning `data.id`.
 */
export async function retireUnjoinable(db: PrismaClient, now: Date = new Date()): Promise<number> {
  const { count } = await db.outboundMessage.updateMany({
    where: {
      channel: 'EMAIL',
      deliveryPollDoneAt: null,
      acceptedAt: { not: null },
      providerMessageId: null,
    },
    data: { deliveryPollDoneAt: now },
  });
  return count;
}

interface Candidate {
  id: string;
  providerMessageId: string | null;
  acceptedAt: Date | null;
  deliveryCheckedAt: Date | null;
}

const CANDIDATE_SELECT = {
  id: true,
  providerMessageId: true,
  acceptedAt: true,
  deliveryCheckedAt: true,
} as const;

/** Pass one: never asked. Reads in index order; nothing to sort. */
export async function findNeverChecked(db: PrismaClient, limit: number): Promise<Candidate[]> {
  return db.outboundMessage.findMany({
    where: {
      channel: 'EMAIL',
      deliveryPollDoneAt: null,
      deliveryCheckedAt: null,
      acceptedAt: { not: null },
      providerMessageId: { not: null },
    },
    orderBy: { acceptedAt: 'asc' },
    take: limit,
    select: CANDIDATE_SELECT,
  });
}

/**
 * Pass two: asked before, oldest first.
 *
 * ⚠ `deliveryCheckedAt: { not: null }` IS WHAT MAKES THE ORDER FREE, and it is the whole reason there
 * are two passes rather than one. With NULLs excluded, `ORDER BY deliveryCheckedAt ASC` reads straight
 * off the index; with them included, the never-checked rows must sort FIRST and a btree ASC index puts
 * NULLs LAST. Phase 3a's rehearsal measured exactly that plan.
 *
 * The per-row interval is applied in `pollOnce` rather than in SQL, because it depends on the row's
 * age since acceptance — see `POLL_LADDER`.
 */
export async function findDueForCheck(db: PrismaClient, limit: number): Promise<Candidate[]> {
  return db.outboundMessage.findMany({
    where: {
      channel: 'EMAIL',
      deliveryPollDoneAt: null,
      deliveryCheckedAt: { not: null },
      acceptedAt: { not: null },
      providerMessageId: { not: null },
    },
    orderBy: { deliveryCheckedAt: 'asc' },
    take: limit,
    select: CANDIDATE_SELECT,
  });
}

/** Is this row due, by its age since acceptance and when it was last asked about? */
export function isDueForCheck(row: Candidate, now: Date): boolean {
  if (!row.acceptedAt) return false;
  if (!row.deliveryCheckedAt) return true;
  const age = now.getTime() - row.acceptedAt.getTime();
  return now.getTime() - row.deliveryCheckedAt.getTime() >= pollIntervalMsFor(age);
}

/** Has this row run out of time? Ruled: 24 hours from acceptance. */
export function hasTimedOut(row: Candidate, now: Date): boolean {
  if (!row.acceptedAt) return false;
  return now.getTime() - row.acceptedAt.getTime() >= POLL_STOP_AFTER_MS;
}

/**
 * ASK ABOUT ONE MESSAGE, AND WRITE DOWN WHAT CAME BACK.
 *
 * ── ⚠ THE JOIN IS VERIFIED HERE, ON EVERY POLL, AND THAT IS THE POINT OF IT ───
 *
 * GTC-289's own finding: *"the id join is UNVERIFIED, and it is the single thing most likely to fail
 * silently on the day a working key exists — in the direction that looks like nothing happened."* The
 * send stores `data.id`; the poll answers with `id` AND `message_id`; the webhook carries `email_id`
 * AND `message_id`. Which one joins has never been observed.
 *
 * **So this function refuses to write a state read off a response whose `id` is not the id it asked
 * about.** It counts the mismatch, logs it at error level and leaves `deliveryState` alone — because a
 * delivery state belonging to a different message is worse than none at all.
 *
 * ✅ That turns the ticket's one-off *"verify the join before any board reads a bounce off it"* into a
 * permanent guard: if the join is wrong, the counter is non-zero and the log says so, instead of every
 * bounce quietly failing to match.
 *
 * ⚠ AND `deliveryCheckedAt` IS WRITTEN EVEN WHEN NOTHING COULD BE READ, which is deliberate: we asked.
 * Not writing it would re-ask the same row on every tick against whatever is broken — the hot loop the
 * retry policy exists to avoid. The pair *(checkedAt set, state NULL, pollDone NULL)* therefore means
 * **asked, no readable answer yet**, and in this environment it is the only pair a poll can produce.
 */
export async function pollOne(
  db: PrismaClient,
  row: Candidate,
  now: Date = new Date()
): Promise<Pick<PollResult, 'read' | 'resolved' | 'unreadable' | 'mismatched'>> {
  const askedAbout = row.providerMessageId!;
  let response: unknown = null;
  let failure: string | null = null;
  try {
    const client = getResendClient();
    const answer = await client.emails.get(askedAbout);
    if (answer.error) {
      failure = answer.error.message ?? answer.error.name ?? 'Unknown Resend error';
    } else {
      response = answer.data;
    }
  } catch (error) {
    // getResendClient() throws when RESEND_API_KEY is missing. Same outcome, different door.
    failure = error instanceof Error ? error.message : 'Unknown error';
  }

  if (failure !== null || response === null) {
    console.error(`[DeliveryPoll] could not read ${askedAbout}:`, failure ?? 'empty response');
    await db.outboundMessage.update({
      where: { id: row.id },
      data: { deliveryCheckedAt: now },
    });
    return { read: 0, resolved: 0, unreadable: 1, mismatched: 0 };
  }

  const parsed = readResendPollResponse(response);
  if (!parsed.ok) {
    console.error(`[DeliveryPoll] unreadable response for ${askedAbout}: ${parsed.why}`);
    await db.outboundMessage.update({
      where: { id: row.id },
      data: { deliveryCheckedAt: now },
    });
    return { read: 0, resolved: 0, unreadable: 1, mismatched: 0 };
  }

  if (parsed.emailId !== askedAbout) {
    console.error(
      `[DeliveryPoll] ⚠ ID MISMATCH: asked about ${askedAbout} and the response identified ` +
        `${parsed.emailId}. No delivery state written. This is GTC-289's unverified join, and it is ` +
        `now a counted failure rather than a silent one.`
    );
    await db.outboundMessage.update({
      where: { id: row.id },
      data: { deliveryCheckedAt: now },
    });
    return { read: 0, resolved: 0, unreadable: 0, mismatched: 1 };
  }

  const terminal = isTerminalForPolling(parsed.outcome.kind);
  const kind = parsed.outcome.kind;
  /*
   * ⚠ [[GTC-189]] SLICE 8a — ONE TRANSACTION, FOR FOUNDER Q2's REASON AT THE PRESS AND 7b's M8 AT
   * THE DOOR: a fact written beside the write it describes is free to survive that write's failure.
   * The outcome, the address-wide block (GTC-324 ruling 2, D6) and — for a complaint only — the
   * event's opt-out (ruling 1) land together or not at all.
   */
  await db.$transaction(async (tx) => {
    await tx.outboundMessage.update({
      where: { id: row.id },
      data: {
        deliveryState: kind,
        providerLastEvent: parsed.outcome.lastEvent,
        deliveryCheckedAt: now,
        deliveryPollDoneAt: terminal ? now : null,
      },
    });
    if (!BLOCKING_OUTCOMES.has(kind)) return;
    const message = await tx.outboundMessage.findUnique({
      where: { id: row.id },
      select: { eventId: true, personEvent: { select: { personId: true } } },
    });
    if (!message) return;
    for (const address of parsed.to) {
      await recordEmailBlock(tx, {
        address,
        reason: kind,
        outboundMessageId: row.id,
        eventId: message.eventId,
      });
    }
    /*
     * GTC-324 RULING 1 — A SPAM REPORT COUNTS AS AN UNSUBSCRIBE FROM THAT EVENT. The same row an
     * unsubscribe click writes, so everything GTC-296 built applies to this event. A bounce and a
     * suppression are not a person's no, and write none.
     */
    if (kind === 'COMPLAINED') {
      await tx.emailOptOut.upsert({
        where: {
          personId_eventId: { personId: message.personEvent.personId, eventId: message.eventId },
        },
        create: { personId: message.personEvent.personId, eventId: message.eventId },
        update: {},
      });
    }
  });
  return { read: 1, resolved: terminal ? 1 : 0, unreadable: 0, mismatched: 0 };
}

/**
 * ONE TICK.
 *
 * Order: retire what can never be asked, then the never-checked pass, then the oldest-checked pass.
 * A row past the 24-hour stop is retired when it is reached rather than filtered out of the query —
 * filtering it would leave it in the queue forever, scanned on every tick and never finished.
 */
export async function pollOnce(
  db: PrismaClient,
  options: { now?: Date; limit?: number } = {}
): Promise<PollResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? POLL_BATCH;
  const result: PollResult = { ...EMPTY };

  result.unjoinable = await retireUnjoinable(db, now);

  const never = await findNeverChecked(db, limit);
  const due = never.length < limit ? await findDueForCheck(db, limit - never.length) : [];

  for (const row of [...never, ...due]) {
    result.considered++;

    if (hasTimedOut(row, now)) {
      await db.outboundMessage.update({
        where: { id: row.id },
        data: { deliveryPollDoneAt: now },
      });
      result.timedOut++;
      continue;
    }
    if (!isDueForCheck(row, now)) continue;

    const one = await pollOne(db, row, now);
    result.read += one.read;
    result.resolved += one.resolved;
    result.unreadable += one.unreadable;
    result.mismatched += one.mismatched;
  }

  return result;
}

/** Re-exported so a caller classifying a stored `providerLastEvent` uses the one interpreter. */
export { interpretResendLastEvent };
