import type { OutboundChannel, PrismaClient } from '@prisma/client';
import { sendAskEmail } from '@/lib/email';
import { sendSms, type SmsBlockReason } from '@/lib/sms/send-sms';
import { isQuietHours } from '@/lib/sms/quiet-hours';
import { pressWillMessage, readAskPreview } from '@/lib/preflight/ask-preview';
import { composePreview } from '@/lib/preflight/ask-preview-compose';
import { interpretResendErrorCode } from '@/lib/email-delivery/resend-error-contract';

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
    /*
     * ⚠ `withheldAt: null` IS A CORRECTION FROM THIS SLICE'S SECOND HALF, AND IT IS LOAD-BEARING.
     * A withholding does NOT take the claim — see `recordWithholding` — because the claim means the
     * provider was called and a withholding means it was not. So a withheld row keeps
     * `attemptedAt: null` forever, and without this clause the never-attempted pass returned it on
     * every tick for the rest of time. Found by building the half that writes withholdings.
     */
    where: { attemptedAt: null, withheldAt: null },
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

// ─── The second half: the gates, quiet hours, the transports and the outcome ───

/**
 * Why Gather did not send a row. OUR words, never the provider's — `providerError` holds theirs.
 *
 * ⚠ THE TWO DOORS STAY APART BY RULING AN, and the schema says why at length: *"'Why would the
 * provider not take it' and 'why did Gather not send it' are two questions, and collapsing them is
 * the exact family this week keeps catching."* Do not merge them when merging looks tidy.
 *
 * Typed in TypeScript and stored as text, following `HostListWhy` and `ChaseNoneWhy` and the
 * ledger's own actions behind `AuditEntry.actionType String` — slice 4a's stated reason: it keeps a
 * vocabulary slice 5 has not finished discovering out of the migration.
 */
export type OutboundWithheldWhy =
  // The chooser, re-run at drain. Its own why-codes, passed through unchanged so the screen and
  // the row cannot disagree about why somebody was not reached.
  | 'NO_CHANNEL'
  | 'SMS_OPTED_OUT'
  | 'PHONE_UNUSABLE'
  | 'HOST_HOUSEHOLD_CHILD'
  | 'NO_CARRIER'
  | 'HOUSEHOLD_MUTED'
  | 'HOST_OWN_ASK'
  | 'CHILD_WITHOUT_ITEM'
  // The route changed to somebody else between the press and the drain.
  | 'NOT_THIS_RECIPIENT'
  // The press promised a link and issuance did not deliver one. `pressSend` refuses this at the
  // press; a row can still reach the drain with it if a token is revoked in the window.
  | 'NO_LINK'
  // `sendSms`'s refusals, all of which happen BEFORE any provider call.
  | 'SMS_DISABLED'
  | 'OPTED_OUT'
  | 'INVALID_NUMBER'
  // Ruling AC's state, arriving late: the host's account went away in the window.
  | 'NO_REPLY_TO'
  /*
   * ⚠ [[GTC-322]] — AND IT IS THE ONLY MEMBER OF THIS UNION NO GATE PRODUCES.
   *
   * Founder ruling, 2026-09-19, shape 3: the press predates the sender. `Event.sentAt` has been
   * written since [[GTC-169]] by a press that dispatched nothing, so eight events in `gather_dev`
   * carry a send stamp and zero ask rows, and nothing will ever create them — `enrolMiniSends`
   * refuses such an event by design. The backfill writes a row saying so.
   *
   * ⚠ IT NEEDED ITS OWN CODE RATHER THAN BORROWING A GATE'S, and the founder's reason is the
   * whole of why: *"the code says exactly what is true, which is that this event predates the
   * press and no message was ever composed for these people. That is not a false sentence; it is
   * a different one."* Every other member of this union is a decision the dispatcher took about a
   * message it was holding. This one is the absence of any such decision, recorded so the record
   * stops claiming a send that never happened.
   *
   * ⚠ DO NOT WRITE IT FROM THE DRAIN. Nothing in `drainOnce` may produce it: a row reaching the
   * dispatcher HAS a composed message behind it, so this code would be false of it. The backfill
   * migration is its only writer, and `tests/legacy-press-test.ts` asserts the absence here.
   */
  | 'PREDATES_SENDER';

/**
 * Every withholding is terminal — there is nothing to retry, because nothing was attempted.
 *
 * A `Record` keyed on the union, so a why added later is a COMPILE ERROR until somebody decides
 * whether it is terminal. That guard is demonstrated rather than asserted: slice 5b's mutation M5
 * made `tsc` refuse the tree for the equivalent map on `LinkState`.
 */
export const WITHHELD_WHY_IS_TERMINAL: Record<OutboundWithheldWhy, true> = {
  NO_CHANNEL: true,
  SMS_OPTED_OUT: true,
  PHONE_UNUSABLE: true,
  HOST_HOUSEHOLD_CHILD: true,
  NO_CARRIER: true,
  HOUSEHOLD_MUTED: true,
  HOST_OWN_ASK: true,
  CHILD_WITHOUT_ITEM: true,
  NOT_THIS_RECIPIENT: true,
  NO_LINK: true,
  SMS_DISABLED: true,
  OPTED_OUT: true,
  INVALID_NUMBER: true,
  NO_REPLY_TO: true,
  // [[GTC-322]]: terminal in the strongest sense of the word — there is no message to retry,
  // because none was ever composed.
  PREDATES_SENDER: true,
};

/**
 * `sendSms`'s `blocked` reason, classified into the right door.
 *
 * ⚠ RULED 2026-09-19, AND RULED FOR A REASON RATHER THAN MERELY RULED. Three of the four are
 * WITHHOLDINGS: `sendSms` refuses them before any provider call, so Gather did not send it and the
 * provider never saw it. `SEND_FAILED` is the one that is not — that is the provider refusing, and
 * it belongs in `providerError` with their words.
 *
 * ⚠ `SMS_DISABLED` IS THE CASE THAT WOULD HAVE SETTLED THIS BY ACCIDENT. `TNZ_AUTH_TOKEN` is
 * absent in this environment, so it is the ONLY text outcome available here — every text row lands
 * on it. Ruling AN separated the two doors precisely so a question like this could not be answered
 * by whichever branch happened to get written first.
 */
export function blockedToWithheld(blocked: SmsBlockReason): OutboundWithheldWhy | null {
  switch (blocked) {
    case 'SMS_DISABLED':
      return 'SMS_DISABLED';
    case 'OPTED_OUT':
      return 'OPTED_OUT';
    case 'INVALID_NUMBER':
      return 'INVALID_NUMBER';
    case 'SEND_FAILED':
      return null;
  }
}

/**
 * Does quiet hours hold this row back?
 *
 * ⚠ PER ROW, AND FOR TEXT ONLY. `dispatchPendingWrapUpMessages` checks once at the top of its
 * batch and defers the whole of it — which on a mixed-channel ask batch would hold the EMAIL for a
 * rule that binds text. The ask is 231 EMAIL to 1 TEXT, so a batch-level check would stop almost
 * everything for the sake of almost nothing.
 *
 * ⚠ AND A DEFERRAL IS NOT A WITHHOLDING. The row is left UNTOUCHED — no claim, no `withheldAt` —
 * so the first run after the window takes it unchanged. The wrap-up dispatcher calls its own
 * deferral "implicit and durable — no scheduler, no timer", and this is the same, per row.
 */
export function quietHoursDefers(channel: OutboundChannel, quiet: boolean): boolean {
  return channel === 'TEXT' && quiet;
}

/** THE SCHEDULE. Fixed, not computed — see `nextBackoffAt`. */
const BACKOFF_MINUTES = [1, 5] as const;

/**
 * When to try again, or null when this attempt was the last.
 *
 * ⚠ FIXED AND NOT COMPUTED, and the reason is GTC-264 Phase 1's restraint applied to a schedule
 * rather than to a column: do not model a vocabulary you have not observed. No provider error has
 * ever been observed in this environment, so there is nothing to derive a curve from.
 *
 * `attemptCount` is the value AFTER the claim incremented it, so attempt 1 waits a minute, attempt
 * 2 waits five, and attempt 3 is terminal.
 */
export function nextBackoffAt(attemptCount: number, now: Date = new Date()): Date | null {
  const minutes = BACKOFF_MINUTES[attemptCount - 1];
  if (minutes === undefined) return null;
  return new Date(now.getTime() + minutes * 60_000);
}

/** What the dispatcher knows about one failed attempt — GTC-289 phase 2. */
export interface ProviderFailure {
  /** The provider's words, as the sender returned them. Always present. */
  error: string;
  /**
   * Resend's `ErrorResponse.name`, verbatim — or absent.
   *
   * ⚠ ABSENT MEANS THE PROVIDER WAS NEVER REACHED, on the email path: the sender's `catch` sets no
   * code, because a thrown `Error` has a `.name` too and `TypeError` is not a provider answer. On the
   * text path it is always absent — TNZ has its own 21-value vocabulary and it arrives on a DELIVERY
   * RECEIPT rather than on a submission ([[GTC-264]]).
   */
  code?: string | null;
  /** Resend's `ErrorResponse.statusCode`. Declared `number | null` by the SDK. */
  status?: number | null;
}

/**
 * Is this provider error worth trying again?
 *
 * ✅ IT READS THE CODE NOW, AND THAT CLOSES A DEFECT THIS FUNCTION SHIPPED WITH — GTC-289 phase 2,
 * founder ruling 2026-09-19. Slice 5c's version matched a MESSAGE STRING because `SendResult` carried
 * nothing else; the SDK declares `ErrorResponse { message; statusCode; name }` with a closed 21-value
 * code union, so it was reading prose where a code existed. The widening was ruled to go BEFORE
 * GTC-289's migration, because *"a shipped predicate known to be reading the wrong field should not
 * wait behind a migration and a rehearsal."*
 *
 * ── THREE READINGS, MOST SPECIFIC FIRST ───────────────────────────────────────
 *
 * 1. **THE CODE**, when the provider gave one and the installed SDK declares it. Two kinds are worth
 *    another attempt — the provider being busy and the provider being broken — and everything else is
 *    terminal. The vocabulary lives in `src/lib/email-delivery/resend-error-contract.ts` and the
 *    policy lives here; a spent daily quota is the case that shows why those are two files.
 * 2. **THE STATUS**, when the code is one the SDK does not declare. A 429 or a 5xx is retried and every
 *    other answer is not — so a code newer than the installed SDK falls through to the PROTOCOL
 *    rather than to prose.
 * 3. **THE MESSAGE**, last. It is all a text send ever has, and all the email path has when
 *    `getResendClient()` threw and no request left the process.
 *
 * ⚠ 401 AND 403 STAY TERMINAL AT ONCE, WHATEVER THE ATTEMPT COUNT — ruled at slice 5c, unchanged
 * here, and now held in all three readings rather than in a regex. In this environment every provider
 * answer is an auth failure ([[GTC-247]]), so a retry-any-error policy queues every row three times
 * against a key that will never work, and the noise is indistinguishable from a transient outage.
 *
 * ⚠ AND IT CHANGES NOTHING OBSERVABLE IN THIS ENVIRONMENT, WHICH IS WHY THE PROOF IS A MUTATION AND
 * NOT A RUN. The live envelope was observed on 2026-09-19 — `validation_error` / 401 / "API key is
 * invalid" — which is `REQUEST_REFUSED` by the code and was already terminal by the message. The
 * widening's value is that the answer stops depending on the provider's prose.
 */
export function isRetryableProviderError(failure: ProviderFailure): boolean {
  // 1. THE CODE.
  const read = interpretResendErrorCode(failure.code);
  if (read.recognised) return read.kind === 'PROVIDER_BUSY' || read.kind === 'PROVIDER_FAULT';

  // 2. THE STATUS. Only reached when the code is absent or undeclared.
  if (typeof failure.status === 'number') {
    return failure.status === 429 || failure.status >= 500;
  }

  // 3. THE MESSAGE.
  if (/\b40[13]\b|unauthor|forbidden|api[ _-]?key/i.test(failure.error)) return false;
  return /\b429\b|\b5\d\d\b|rate[ _-]?limit|timeout|ETIMEDOUT|ECONNRESET|network/i.test(
    failure.error
  );
}

/**
 * The provider took it. Ruling G's clock starts here.
 *
 * ⚠ IT DOES NOT CLEAR `providerError` OR `providerErrorCode`, AND THAT IS UNCHANGED RATHER THAN
 * OVERLOOKED — named here at GTC-289 phase 3b because the new column makes it more visible. A row that
 * failed, retried and then succeeded keeps the LAST FAILURE'S words and code beside its acceptance.
 * That is how `providerError` has behaved since slice 5c, and the history is worth more than a tidy
 * row: the pair reads *"accepted, and here is what went wrong first"*, not *"accepted and refused"*.
 * `acceptedAt` is what says the send succeeded. Do not read a code on an accepted row as a
 * contradiction, and do not clear it to make the row look neat.
 */
export async function recordAcceptance(
  db: PrismaClient,
  args: { id: string; personEventId: string; provider: string; providerMessageId?: string }
): Promise<void> {
  const acceptedAt = new Date();
  await db.$transaction(async (tx) => {
    await tx.outboundMessage.update({
      where: { id: args.id },
      data: {
        acceptedAt,
        provider: args.provider,
        // ⚠ NEVER A PLACEHOLDER. Slice 6 joins on this value, so a stand-in would match nothing and
        // read as a LOST BOUNCE rather than as a send with no id. Slice 4b pins the same rule on
        // the sender's return.
        providerMessageId: args.providerMessageId ?? null,
        nextAttemptAt: null,
      },
    });
    /*
     * RULING G: "each person's clock starts when their provider accepts their message."
     *
     * ✅ FIRST ACCEPTANCE WINS — RULED 2026-09-19, in the founder's words: *"Ruling G says the clock
     * starts when that person's provider accepts; a second acceptance for the same person is the
     * same person's clock already running."*
     *
     * `sentAt: null` in the predicate is the whole of it. Ruling U's bounce door produces a SECOND
     * ASK row for the same membership, and a resend that moved the clock would give that person a
     * fresh four days because Gather tried again — Gather rewarding its own failure. Proposed as the
     * executor's reading at slice 5a; recorded as ruled now, because a reading and a ruling are not
     * the same sentence to whoever reads it next.
     */
    await tx.personEvent.updateMany({
      where: { id: args.personEventId, sentAt: null },
      data: { sentAt: acceptedAt },
    });
  });
}

/**
 * The provider refused it at submission. Their words, verbatim — and now their CODE beside them.
 *
 * ✅ THE CODE REACHES THE RECORD — GTC-289 phase 3b, founder ruling 2026-09-19: *"the decision reads
 * one and the record does not, and that gap is the thing slice 7 will need when it asks why a row is
 * red."* Phase 2 gave this decision the code and threw it away; phase 3a gave it a column.
 *
 * ⚠ AN EMPTY CODE IS STORED AS NULL, NEVER AS `''`. The ruling's own requirement: a `''` and a NULL
 * are the difference between *we asked and got nothing* and *we never asked*, and on an EMAIL row a
 * NULL code means the provider was never reached — the sender's `catch` sets no code, deliberately,
 * because a thrown `Error` has a `.name` too.
 *
 * ⚠ AND IT OVERWRITES, INCLUDING WITH NULL, WHICH IS CORRECT RATHER THAN CARELESS. `providerError`
 * has always described the LAST attempt; the code does the same, so a retry that fails differently
 * cannot leave the earlier attempt's code standing beside the later attempt's prose.
 */
export async function recordRejection(
  db: PrismaClient,
  args: { id: string; provider: string; error: string; code?: string | null }
): Promise<void> {
  await db.outboundMessage.update({
    where: { id: args.id },
    data: {
      rejectedAt: new Date(),
      provider: args.provider,
      providerError: args.error,
      providerErrorCode: args.code ? args.code : null,
      nextAttemptAt: null,
    },
  });
}

/**
 * Gather did not send it.
 *
 * The guard is the END STATE rather than `attemptedAt`, and the guarded `updateMany` is what stops
 * two overlapping runs both writing it.
 *
 * ⚠ AND WHETHER `attemptedAt` IS SET DEPENDS ON WHERE THE WITHHOLDING WAS DECIDED — corrected here
 * after a run showed the first wording overstated it:
 *
 *  - A GATE withholding (the chooser refuses, no link, no reply-to) happens BEFORE the claim, so
 *    `attemptedAt` stays NULL. Gather never called a provider and the row says so.
 *  - A SENDER withholding (`sendSms` answering `SMS_DISABLED`, `OPTED_OUT` or `INVALID_NUMBER`)
 *    happens AFTER the claim, because the claim is what precedes calling the sender at all. So
 *    `attemptedAt` IS set, and it is true: Gather attempted, and its own sender refused before
 *    reaching a provider.
 *
 * Both are end states, and `findNeverAttempted` excludes either on `withheldAt` — which is why that
 * clause is there rather than relying on `attemptedAt` alone.
 *
 * ⚠ SO A ROW WITH `attemptedAt` SET AND `withheldAt` SET IS NOT A CONTRADICTION. It is the
 * commonest text outcome in this environment, because `TNZ_AUTH_TOKEN` is absent.
 */
export async function recordWithholding(
  db: PrismaClient,
  args: { id: string; why: OutboundWithheldWhy }
): Promise<boolean> {
  const { count } = await db.outboundMessage.updateMany({
    where: { id: args.id, withheldAt: null, acceptedAt: null, rejectedAt: null },
    data: { withheldAt: new Date(), withheldWhy: args.why },
  });
  return count === 1;
}

/**
 * Try again later. The row stays unfinished on purpose; `nextAttemptAt` is the claim key.
 *
 * ⚠ IT RECORDS THE CODE TOO (GTC-289 phase 3b), and that is the half easy to leave out: a row waiting
 * to be tried again ALREADY has a provider answer, so writing the prose without the code would leave
 * the record thinnest on exactly the rows still moving. Same normalisation as `recordRejection` — an
 * empty code is NULL, and it overwrites, because both columns describe the last attempt.
 */
export async function scheduleRetry(
  db: PrismaClient,
  args: { id: string; provider: string; error: string; at: Date; code?: string | null }
): Promise<void> {
  await db.outboundMessage.update({
    where: { id: args.id },
    data: {
      provider: args.provider,
      providerError: args.error,
      providerErrorCode: args.code ? args.code : null,
      nextAttemptAt: args.at,
    },
  });
}

export interface DrainResult {
  considered: number;
  sent: number;
  rejected: number;
  withheld: number;
  deferred: number;
  retrying: number;
}

/**
 * ONE TICK.
 *
 * ⚠ THE ORDER IS A RULING (2026-09-19): GATES, THEN QUIET HOURS, THEN CLAIM, THEN SEND. The
 * founder's reason is the ruling — claiming first and then deferring leaves `attemptedAt` set with
 * no outcome, which the schema defines as a crashed attempt.
 *
 * ⚠ THE CHOOSER IS RE-RUN HERE AND THE ROW IS NOT TRUSTED. Somebody who opted out, lost their
 * address, or left the event between the press and the drain is withheld with the chooser's OWN
 * why-code — which is what `withheldWhy` was separated from `providerError` to hold. The re-run
 * goes through `readAskPreview`, once per event, so this and the pre-flight cannot answer "who is
 * reached" differently; a second construction of the chooser context is the drift `ask-preview.ts`
 * records GTC-294 catching in that very module.
 *
 * ⚠ AND IT CALLS THE REAL SENDERS. No seam, no injected transport, no NODE_ENV branch (founder
 * Q7): *"a fake provider that never ships is a second code path nobody exercises, and the first
 * thing it hides is the one thing we most need to see: what the board looks like when everything
 * fails."* In this environment every send is refused, and that is the state slice 7's fourth red has
 * to read.
 */
export async function drainOnce(
  db: PrismaClient,
  take: number,
  now: Date = new Date()
): Promise<DrainResult> {
  const candidates = [
    ...(await findNeverAttempted(db, take)),
    ...(await findDueForRetry(db, take, now)),
  ];
  const result: DrainResult = {
    considered: candidates.length,
    sent: 0,
    rejected: 0,
    withheld: 0,
    deferred: 0,
    retrying: 0,
  };
  if (candidates.length === 0) return result;

  const quiet = isQuietHours(now);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // One preview per event, not per row — and it is the same walk the pre-flight runs.
  const byEvent = new Map<string, typeof candidates>();
  for (const c of candidates) {
    const list = byEvent.get(c.eventId) ?? [];
    list.push(c);
    byEvent.set(c.eventId, list);
  }

  for (const [eventId, rows] of byEvent) {
    const preview = await readAskPreview(db, eventId, baseUrl);
    if (!preview) {
      // The event went away. Cascade should have taken the rows with it (decision 28); if it has
      // not, withholding is the honest end rather than a crash.
      for (const row of rows) {
        if (await recordWithholding(db, { id: row.id, why: 'NOT_THIS_RECIPIENT' }))
          result.withheld++;
      }
      continue;
    }
    const composed = composePreview(preview, preview.storedAuthorLine);
    const byPe = new Map(composed.rows.map((r) => [r.recipient.personEventId, r]));

    for (const row of rows) {
      const stored = await db.outboundMessage.findUnique({
        where: { id: row.id },
        select: {
          channel: true,
          personEvent: { select: { person: { select: { phoneNumber: true, email: true } } } },
        },
      });
      if (!stored) continue;

      /*
       * ── GATES. The chooser's answer NOW, not at the press.
       *
       * ⚠ THE HOST'S LIST IS CHECKED FIRST, AND THE ORDER IS THE WHOLE POINT. Somebody the chooser
       * now refuses is NOT in `preview.recipients` at all — they are on `preview.hostList` with a
       * why. Checking `recipients` first put every one of them through the generic
       * `NOT_THIS_RECIPIENT` branch and threw the chooser's own why-code away, which is exactly what
       * `withheldWhy` was separated from `providerError` to carry. Caught by the assertion that
       * expected `NO_CHANNEL` and read `NOT_THIS_RECIPIENT`.
       */
      const hostList = preview.hostList.find((l) => l.personEventId === row.personEventId);
      if (hostList) {
        if (await recordWithholding(db, { id: row.id, why: hostList.why })) result.withheld++;
        continue;
      }
      const composedRow = byPe.get(row.personEventId);
      if (!composedRow) {
        if (await recordWithholding(db, { id: row.id, why: 'NOT_THIS_RECIPIENT' }))
          result.withheld++;
        continue;
      }
      if (!composedRow.ask || !composedRow.recipient.link) {
        if (await recordWithholding(db, { id: row.id, why: 'NO_LINK' })) result.withheld++;
        continue;
      }
      if (!preview.replyTo && stored.channel === 'EMAIL') {
        if (await recordWithholding(db, { id: row.id, why: 'NO_REPLY_TO' })) result.withheld++;
        continue;
      }

      // ── QUIET HOURS. Defers; touches nothing.
      if (quietHoursDefers(stored.channel, quiet)) {
        result.deferred++;
        continue;
      }

      // ── CLAIM. Only now.
      const claimed =
        row.attemptCount === 0
          ? await claimForFirstAttempt(db, row.id)
          : await claimForRetry(db, row.id, now);
      if (!claimed) continue;
      const attemptCount = row.attemptCount + 1;

      // ── SEND. The real senders.
      if (stored.channel === 'EMAIL') {
        const to = stored.personEvent.person.email;
        if (!to) {
          if (await recordWithholding(db, { id: row.id, why: 'NO_CHANNEL' })) result.withheld++;
          continue;
        }
        const sent = await sendAskEmail({
          to,
          subject: composedRow.ask.subject,
          body: composedRow.ask.text,
          replyTo: preview.replyTo!,
          fromName: preview.hostName,
        });
        if (sent.success) {
          await recordAcceptance(db, {
            id: row.id,
            personEventId: row.personEventId,
            provider: 'resend',
            providerMessageId: sent.providerMessageId,
          });
          result.sent++;
        } else {
          const error = sent.error ?? 'Unknown Resend error';
          const at = isRetryableProviderError({
            error,
            code: sent.providerErrorCode,
            status: sent.providerStatusCode,
          })
            ? nextBackoffAt(attemptCount, now)
            : null;
          // GTC-289 phase 3b: the code the decision just read is also what the record keeps.
          const code = sent.providerErrorCode;
          if (at) {
            await scheduleRetry(db, { id: row.id, provider: 'resend', error, at, code });
            result.retrying++;
          } else {
            await recordRejection(db, { id: row.id, provider: 'resend', error, code });
            result.rejected++;
          }
        }
        continue;
      }

      const to = stored.personEvent.person.phoneNumber;
      if (!to) {
        if (await recordWithholding(db, { id: row.id, why: 'NO_CHANNEL' })) result.withheld++;
        continue;
      }
      /*
       * ⚠ `sendSms` WRITES A FALSE `NUDGE_SENT_AUTO` HERE AND IT IS A RULED STOPGAP. See this
       * module's header, rule 2. `InviteEventType` has no member for an ask being sent, and
       * `sendSms` logs unconditionally inside itself. The fix is [[GTC-288]]'s — the STOP
       * attribution moves to `OutboundMessage.providerMessageId` and the log row stops carrying
       * anything. DO NOT add an enum member for it.
       */
      const sent = await sendSms({
        to,
        message: composedRow.ask.text,
        eventId,
        personId: composedRow.recipient.personId,
        metadata: { type: 'ask', outboundMessageId: row.id },
      });
      if (sent.success) {
        await recordAcceptance(db, {
          id: row.id,
          personEventId: row.personEventId,
          provider: 'tnz',
          providerMessageId: sent.messageId,
        });
        result.sent++;
        continue;
      }
      const withheld = sent.blocked ? blockedToWithheld(sent.blocked) : null;
      if (withheld) {
        if (await recordWithholding(db, { id: row.id, why: withheld })) result.withheld++;
        continue;
      }
      const error = sent.error ?? 'Unknown SMS error';
      /*
       * The message alone: TNZ's result vocabulary arrives on a delivery receipt, not on a submission.
       * ⚠ AND NO `code` IS PASSED TO EITHER WRITER BELOW, DELIBERATELY — `providerErrorCode` stays NULL
       * on a TEXT row, which is the third of the column's three states. Do not fill it with a parsed
       * fragment of TNZ's prose to make the column look complete.
       */
      const at = isRetryableProviderError({ error }) ? nextBackoffAt(attemptCount, now) : null;
      if (at) {
        await scheduleRetry(db, { id: row.id, provider: 'tnz', error, at });
        result.retrying++;
      } else {
        await recordRejection(db, { id: row.id, provider: 'tnz', error });
        result.rejected++;
      }
    }
  }

  return result;
}

// ─── Slice 5e: the mini-send ───────────────────────────────────────────────────

export interface EnrolResult {
  /** Rows created for late arrivals. */
  enrolled: number;
  /** Late arrivals the press would message and the sweep cannot, for want of a link. */
  awaitingLink: number;
  /** Pressed events scanned. */
  events: number;
}

/**
 * GTC-189 slice 5e — A PERSON ADDED AFTER THE PRESS GETS THEIR OWN SEND, ON THEIR OWN CLOCK.
 *
 * Hinge §2, ruled gap #5. The build shape says *"mini-sends reuse the dispatcher"*, and that is the
 * whole design: this function creates the row and **everything after it is `drainOnce`** — the same
 * gates, the same quiet hours, the same claim, the same outcome, and ruling G's clock starting at
 * that person's own acceptance. There is no mini-send branch anywhere, and `isMiniSend` was removed
 * at slice 5a (decision 33) precisely because the per-person clock removes the need for one.
 *
 * ── WHY A SWEEP AND NOT A HOOK AT CAPTURE ─────────────────────────────────────
 *
 * Three paths add a person — `POST /api/events/[id]/people`, `createMember` in the households
 * route, and the batch import — and a fourth can be added tomorrow. A hook in each is three writers
 * of one rule, which is the shape decision 30 closed for the press itself.
 *
 * ⚠ THE PRECEDENT IS EXACT: `generateWrapUpLinks` in src/lib/wrap-up.ts, whose own comment says why
 * it is keyed on (event, person) rather than on the event — *"a guest added AFTER the press must
 * still get their link... an event-level 'already done' check would pass every duplicate test and
 * silently strip late guests instead."*
 *
 * ⚠ AND THE CONDITION IS "NO ASK ROW AT ALL", NOT "NO ACCEPTED ASK ROW". Accepted, rejected and
 * withheld all mean this membership has been dealt with. Keyed on acceptance, this sweep would
 * re-create a row for every withholding on every tick, for ever — each one a fresh attempt at
 * somebody the chooser has already refused. Ruling U's bounce-door resend is the one case that makes
 * a second ask row deliberately, and it already has one.
 *
 * ⚠ ONLY PRESSED EVENTS. A mini-send is a send AFTER the press. On an unpressed event the host has
 * not decided to send at all, and enrolling her guests would be the press happening by cron.
 *
 * ── ⚠ IT DOES NOT MINT TOKENS, AND THAT IS A PRECONDITION ON [[GTC-316]] ──────
 *
 * A late arrival holds no PARTICIPANT token, so `linkState` reads `AT_PRESS` and there is no link to
 * put in a message. The only thing that mints one is `ensureEventTokens`, and calling it from here
 * is **refused**: it mints a PARTICIPANT token for every CHILD membership — childness lives on
 * `PersonEvent.householdRole` and step 4 reads `role` — and the unauthenticated family directory
 * publishes it. On a cron that fires **every two minutes on every pressed event**, with no host
 * action at all.
 *
 * That is strictly worse than the state the founder's ordering ruling of 2026-09-19 reasoned about
 * (*"nothing presses until 5f wires the button"*), because **a cron does not wait for a button**. So
 * this sweep enrols only recipients who ALREADY hold a link and counts the rest as `awaitingLink`.
 *
 * ⚠ WHEN [[GTC-316]] LANDS, THE CHANGE HERE IS ONE CALL — and `tests/mini-send-test.ts` layer L
 * asserts the absence so it cannot be added without meeting this note.
 *
 * ── ⚠ RULING AJ IS NOT MET, AND IT IS SHIPPING INCOMPLETE RATHER THAN MET ─────
 *
 * Ruling AJ (decision 23) says the collapsed one-person pre-flight asks a late arrival the same
 * chase-channel question the others got, at their own send. **It cannot: the control does not
 * exist.** `PersonEvent.chaseException` is storage slice 4a landed; [[GTC-311]] owns the control,
 * the resolver and the screen, and `chooseChaseRoute` still has no caller in `src/`.
 *
 * Founder ruling, 2026-09-19: *"5e ships the mini-send without the question, records AJ as unmet
 * with GTC-311 named as what meets it... Say plainly that this is a ruling shipping incomplete, not
 * a ruling met."*
 *
 * ⚠ SO A MINI-SEND RECIPIENT FALLS TO `Event.chaseWhenNoMobileDefault` AND THE HOST IS NEVER ASKED
 * ABOUT THEM. Under ruling AH that default is *chase by email when there is no mobile*, ON — so a
 * late arrival with no usable phone is chased by email without her ever being offered the
 * *hand this one to me* exception every other recipient was offered. That is decision 23's hole,
 * still open, with the mini-send shipping over it.
 */
export async function enrolMiniSends(db: PrismaClient, takeEvents: number): Promise<EnrolResult> {
  /*
   * ⚠ AND IT IS NOT ENOUGH THAT `sentAt` IS SET — THE EVENT MUST HAVE ASK ROWS. This is the
   * sharpest thing in this function and it was found by running the sweep against `gather_dev`.
   *
   * `Event.sentAt` has been written since [[GTC-169]], by the OLD press — the one that stamped
   * clocks and sent nothing. So an event pressed before slice 5 has `sentAt` set and **zero**
   * `OutboundMessage` rows. Keyed on `sentAt` alone, this sweep reads every recipient on such an
   * event as a late arrival and enrols the entire guest list.
   *
   * ⚠ IT DID. The first run created 20 rows across four boards — three security-test events and
   * `GTC-192 replay — arrival`, a seeded DEMO board — and `drainOnce` then claimed and attempted a
   * send for every one. Nothing was delivered, because the Resend key does not authenticate and
   * every address was on a reserved domain. **On a real deployment that is every guest of every
   * event pressed before this slice, invited a second time.**
   *
   * So the predicate is `some ask row exists`: an event the NEW press has written for. An event with
   * `sentAt` and no rows was pressed by machinery that did not send, and a mini-send is a send after
   * a send — there is nothing for a late arrival to be late to.
   *
   * ⚠ WHAT THAT LEAVES OPEN, NAMED RATHER THAN HIDDEN: a legacy pressed event never gets ask rows
   * from anything, so its guests are never messaged by Gather at all. That is correct — nobody
   * decided to send them anything through this machinery — and if those events should be re-pressed
   * it is a migration decision and a founder ruling, not a sweep's to take.
   */
  const pressed = await db.event.findMany({
    where: { sentAt: { not: null }, outboundMessages: { some: { kind: 'ASK' } } },
    orderBy: { sentAt: 'desc' },
    take: takeEvents,
    select: { id: true },
  });

  const result: EnrolResult = { enrolled: 0, awaitingLink: 0, events: pressed.length };
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  for (const event of pressed) {
    const preview = await readAskPreview(db, event.id, baseUrl);
    if (!preview) continue;

    const existing = await db.outboundMessage.findMany({
      where: { eventId: event.id, kind: 'ASK' },
      select: { personEventId: true },
    });
    const dealtWith = new Set(existing.map((r) => r.personEventId));

    for (const recipient of preview.recipients) {
      if (dealtWith.has(recipient.personEventId)) continue;
      // The same predicate the press and the pre-flight use. One rule, three callers.
      if (!pressWillMessage(recipient.linkState)) continue;
      if (recipient.linkState !== 'READY') {
        // Addressed, and no link to carry. See the note above: minting is GTC-316's.
        result.awaitingLink++;
        continue;
      }
      await db.outboundMessage.create({
        data: {
          eventId: event.id,
          personEventId: recipient.personEventId,
          kind: 'ASK',
          channel: recipient.channel as OutboundChannel,
        },
      });
      result.enrolled++;
    }
  }

  return result;
}
