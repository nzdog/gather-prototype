import type { PrismaClient } from '@prisma/client';
import { getTnzMessageStatus } from './tnz-client';
import { parseTnzStatusResponse, type TnzStatusVerdict } from './tnz-status-contract';
import { recordPolledTnzResult } from './tnz-delivery-record';
import { applyTextOutcome, type TextPollStateKind } from './text-outcome';
import { canonicalTnzValue } from './tnz-delivery-contract';
import { noteTnzSightings, type TnzAlertKind, type TnzAlertOutcome } from './tnz-account-alert';

/**
 * [[GTC-290]] — THE TNZ STATUS POLL. Gather asks TNZ about the texts TNZ never report on.
 *
 * TNZ's delivery webhook ([[GTC-264]]) is not a complete channel, by TNZ's own table: a credit hold,
 * a blocked link, `Delayed` and `Pending` are never sent by webhook, and TNZ's answer D4 says even
 * PENDING webhooks are off. A credit hold silences every text and produces nothing at all — the
 * exact signature of a healthy send. So Gather asks.
 *
 * ── WHICH TEXTS ───────────────────────────────────────────────────────────────
 *
 * A TEXT `OutboundMessage` sent through TNZ (`provider = 'tnz'`: a Twilio row's id means nothing to
 * TNZ), accepted, with a MessageID, and not finished (`deliveryPollDoneAt IS NULL`). The webhook's
 * final report finishes a row through `applyTextOutcome`, so a text TNZ reported leaves the set by
 * itself. A text accepted with NO MessageID can never be asked about: it is retired at once, the
 * email poll's "we can never ask" pair (state NULL, pollDone set).
 *
 * ── WHEN — founder plan ruling Q7 ─────────────────────────────────────────────
 *
 * At fixed points from TNZ's acceptance: 15 minutes, 1 hour, 6 hours, 24 hours, 48 hours. Keyed on
 * age like the email poll's ladder, so no counter column: a row is due when its age has passed a
 * point and it has not been asked since that point, so a late cron still asks once per point. At
 * most five asks per text; none for the usual text, whose webhook arrives first. At most
 * `TEXT_POLL_BATCH` asks a run, one after another, inside `TEXT_POLL_RUN_BUDGET_MS`.
 *
 * ── THE STOP — TNZ: "configured to timeout after 48 hours with no result" ──────
 *
 * On the first run at or after 48 hours the text is asked once more, then:
 *   - a finished recipient → applied like any TNZ report;
 *   - still `CreditHold` (or the read fails and the stored state is the hold) → [[GTC-258]]'s
 *     `TEXT_OUR_FAULT` (SCOPED ruling Q2): red, W2, retried by email for the follow-up and the
 *     thank-you, the number not blocked; recorded at the decision, which is where [[GTC-335]]'s
 *     replay plays it;
 *   - anything else → `TEXT_STOPPED_CHECKING`, finished and still sent (plan ruling Q5). "We gave
 *     up" is a stored state, not an absence. A TNZ report arriving later still lands
 *     (`applyTextOutcome` accepts a stopped row).
 *
 * ── HOW A VERDICT IS WRITTEN ──────────────────────────────────────────────────
 *
 * A finished recipient is stored as an `SmsDeliveryReport` row with provider `'tnz-poll'` and
 * applied through the webhook's own path (`recordPolledTnzResult`) — the outcome, the number's
 * block, Zone 7 untouched, one transaction (plan ruling Q10). Held, in flight and stopped are
 * guarded updates on the TEXT row (`deliveryPollDoneAt IS NULL`), so a webhook landing between our
 * read and our write is never overwritten. An answer that cannot be read writes only the time we
 * asked — the email poll's rule, so a broken answer is not asked about on every tick.
 *
 * ── NO CLAIM, LIKE THE EMAIL POLL ─────────────────────────────────────────────
 *
 * Two overlapping runs asking about one text is two reads and one redundant guarded write. The one
 * thing that must happen once — the founder's email — has its own claim (`./tnz-account-alert.ts`).
 */

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

/** TNZ's own guidance, measured from TNZ's acceptance. */
export const TEXT_POLL_STOP_AFTER_MS = 48 * HOUR;

/** Plan ruling Q7: the points, by age since acceptance, at which a text is asked about. */
export const TEXT_POLL_CHECKPOINTS_MS: readonly number[] = [
  15 * MINUTE,
  1 * HOUR,
  6 * HOUR,
  24 * HOUR,
  TEXT_POLL_STOP_AFTER_MS,
];

/** At most this many asks a run (plan ruling Q7). */
export const TEXT_POLL_BATCH = 25;

/** A run stops asking after this long; what is left waits for the next run. */
export const TEXT_POLL_RUN_BUDGET_MS = 20_000;

interface Timed {
  acceptedAt: Date | null;
  deliveryCheckedAt: Date | null;
}

/** The latest point this age has passed, or null before the first. */
function lastPointPassed(ageMs: number): number | null {
  let passed: number | null = null;
  for (const p of TEXT_POLL_CHECKPOINTS_MS) if (ageMs >= p) passed = p;
  return passed;
}

/** Due when the text's age has passed a point and it has not been asked since that point. */
export function isDueForTextCheck(row: Timed, now: Date): boolean {
  if (!row.acceptedAt) return false;
  const point = lastPointPassed(now.getTime() - row.acceptedAt.getTime());
  if (point === null) return false;
  if (!row.deliveryCheckedAt) return true;
  return row.deliveryCheckedAt.getTime() < row.acceptedAt.getTime() + point;
}

/** 48 hours since TNZ accepted it. */
export function isPastTextStop(row: Timed, now: Date): boolean {
  return !!row.acceptedAt && now.getTime() - row.acceptedAt.getTime() >= TEXT_POLL_STOP_AFTER_MS;
}

const HELD: TextPollStateKind = 'TEXT_HELD_FOR_CREDIT';
const IN_FLIGHT: TextPollStateKind = 'TEXT_IN_FLIGHT';
const STOPPED: TextPollStateKind = 'TEXT_STOPPED_CHECKING';

export interface TextPollResult {
  /** Rows looked at this run. */
  considered: number;
  /** Rows asked about — a request attempted, or stopped by the switch. */
  asked: number;
  /** Answers that said something about the message: final, held or in flight. */
  read: number;
  /** A finished recipient, applied. */
  final: number;
  /** Held for credit, under 48 hours. */
  held: number;
  /** In flight, under 48 hours. */
  inFlight: number;
  /** At 48 hours, not held: `TEXT_STOPPED_CHECKING`. */
  stopped: number;
  /** At 48 hours, still held: `TEXT_OUR_FAULT`. */
  ourFaultAt48h: number;
  /** Accepted with no MessageID: retired, never asked. */
  unjoinable: number;
  /** The call failed or its answer could not be read. */
  unreadable: number;
  /** TNZ answered about a different MessageID. */
  mismatched: number;
  /** What the founder's email did, per kind sighted this run. */
  alerts: Record<TnzAlertKind, TnzAlertOutcome | null>;
  /** Alerts owed this run that did not go. */
  alertsNotSent: number;
}

/** The run's verdict: it fails when it had texts to ask about and could read none, or owed an email it could not send. */
export function pollRunHealth(r: Pick<TextPollResult, 'asked' | 'read' | 'alertsNotSent'>): {
  ok: boolean;
} {
  return { ok: !(r.asked > 0 && r.read === 0) && r.alertsNotSent === 0 };
}

const CANDIDATE_SELECT = {
  id: true,
  providerMessageId: true,
  destination: true,
  acceptedAt: true,
  deliveryCheckedAt: true,
  deliveryState: true,
  providerLastEvent: true,
} as const;

/**
 * ONE RUN. `scope` narrows every read and write to some events — for a suite, which must never touch
 * `gather_dev` unscoped (GTC-343's rule). The cron route passes none.
 */
export async function pollTextStatusOnce(
  db: PrismaClient,
  options: { now?: Date; limit?: number; scope?: { eventIds: string[] }; budgetMs?: number } = {}
): Promise<TextPollResult> {
  const now = options.now ?? new Date();
  const limit = options.limit ?? TEXT_POLL_BATCH;
  const deadline = Date.now() + (options.budgetMs ?? TEXT_POLL_RUN_BUDGET_MS);
  const scoped = options.scope ? { eventId: { in: options.scope.eventIds } } : {};
  const unfinished = {
    channel: 'TEXT' as const,
    provider: 'tnz',
    deliveryPollDoneAt: null,
    ...scoped,
  };
  const result: TextPollResult = {
    considered: 0,
    asked: 0,
    read: 0,
    final: 0,
    held: 0,
    inFlight: 0,
    stopped: 0,
    ourFaultAt48h: 0,
    unjoinable: 0,
    unreadable: 0,
    mismatched: 0,
    alerts: { CREDIT_HOLD: null, LINK_NOT_PERMITTED: null },
    alertsNotSent: 0,
  };

  result.unjoinable = (
    await db.outboundMessage.updateMany({
      where: { ...unfinished, acceptedAt: { not: null }, providerMessageId: null },
      data: { deliveryPollDoneAt: now },
    })
  ).count;

  const never = await db.outboundMessage.findMany({
    where: {
      ...unfinished,
      acceptedAt: { not: null, lte: new Date(now.getTime() - TEXT_POLL_CHECKPOINTS_MS[0]) },
      providerMessageId: { not: null },
      deliveryCheckedAt: null,
    },
    orderBy: { acceptedAt: 'asc' },
    take: limit,
    select: CANDIDATE_SELECT,
  });
  const asked =
    never.length < limit
      ? await db.outboundMessage.findMany({
          where: {
            ...unfinished,
            acceptedAt: { not: null },
            providerMessageId: { not: null },
            deliveryCheckedAt: { not: null },
          },
          orderBy: { deliveryCheckedAt: 'asc' },
          take: limit - never.length,
          select: CANDIDATE_SELECT,
        })
      : [];

  const sighted: Partial<Record<TnzAlertKind, string>> = {};
  /** Only unfinished rows are written, so a TNZ report that landed meanwhile is never undone. */
  const write = (id: string, data: Record<string, unknown>) =>
    db.outboundMessage.updateMany({ where: { id, deliveryPollDoneAt: null }, data });

  for (const row of [...never, ...asked]) {
    if (Date.now() > deadline) break;
    result.considered++;
    const past = isPastTextStop(row, now);
    if (!isDueForTextCheck(row, now) && !past) continue;

    let verdict: TnzStatusVerdict | null = null;
    if (isDueForTextCheck(row, now)) {
      result.asked++;
      const answer = await getTnzMessageStatus(row.providerMessageId!);
      verdict = answer.reached
        ? parseTnzStatusResponse(
            answer.httpStatus,
            answer.bodyText,
            row.providerMessageId!,
            row.destination
          )
        : { kind: 'POLL_FAILED', why: answer.error };
      if (verdict.kind === 'POLL_FAILED') result.unreadable++;
      if (verdict.kind === 'MISMATCH') {
        result.mismatched++;
        console.error(
          `[TnzStatusPoll] ⚠ asked about row ${row.id} and TNZ answered about another MessageID; nothing written.`
        );
      }
      if (verdict.kind === 'FINAL' || verdict.kind === 'HELD' || verdict.kind === 'IN_FLIGHT') {
        result.read++;
      }
    }

    if (verdict?.kind === 'FINAL') {
      result.final++;
      if (verdict.result && canonicalTnzValue(verdict.result) === 'linknotpermitted') {
        sighted.LINK_NOT_PERMITTED ??= row.id;
      }
      await recordPolledTnzResult(db, {
        providerMessageId: row.providerMessageId!,
        destination: verdict.destination ?? row.destination ?? '',
        status: verdict.status,
        result: verdict.result,
        providerJobNumber: verdict.jobNum,
        providerSentAt: verdict.sentAt,
      });
      continue;
    }
    if (verdict?.kind === 'HELD') sighted.CREDIT_HOLD ??= row.id;

    if (!past) {
      if (verdict?.kind === 'HELD' || verdict?.kind === 'IN_FLIGHT') {
        if (verdict.kind === 'HELD') result.held++;
        else result.inFlight++;
        await write(row.id, {
          deliveryState: verdict.kind === 'HELD' ? HELD : IN_FLIGHT,
          providerLastEvent: verdict.messageStatus,
          deliveryCheckedAt: now,
        });
      } else if (verdict) {
        await write(row.id, { deliveryCheckedAt: now });
      }
      continue;
    }

    // ── 48 hours: decide ──
    const read = verdict?.kind === 'HELD' || verdict?.kind === 'IN_FLIGHT';
    const stillHeld = read ? verdict!.kind === 'HELD' : row.deliveryState === HELD;
    if (stillHeld) {
      const applied = await db.$transaction((tx) =>
        applyTextOutcome(tx, {
          outboundMessageId: row.id,
          outcome: 'TEXT_OUR_FAULT',
          providerLastEvent: 'CreditHold',
          now,
        })
      );
      if (applied) result.ourFaultAt48h++;
    } else {
      const word =
        verdict?.kind === 'IN_FLIGHT' ? verdict.messageStatus : (row.providerLastEvent ?? null);
      const { count } = await write(row.id, {
        deliveryState: STOPPED,
        providerLastEvent: word,
        deliveryCheckedAt: now,
        deliveryPollDoneAt: now,
      });
      if (count === 1) result.stopped++;
    }
  }

  const alerts = await noteTnzSightings(db, sighted, now);
  result.alerts = alerts;
  result.alertsNotSent = Object.values(alerts).filter((a) => a === 'NOT_SENT').length;
  return result;
}
