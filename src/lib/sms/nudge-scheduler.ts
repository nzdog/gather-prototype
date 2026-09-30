import { findNudgeCandidates } from './nudge-eligibility';
import { queueChase } from './nudge-sender';
import { isSmsEnabled } from './twilio-client';
import { isTnzEnabled } from './tnz-client';
import { isLiveSendingOn } from '@/lib/live-sends';

export interface NudgeRunResult {
  timestamp: Date;
  /**
   * Did this run execute as intended? False when no SMS provider is configured at all,
   * and false when the catch below fires. GTC-214: `GET` in cron/nudges/route.ts derives
   * its `success` and its status code from this, so a run that cannot send stops reading
   * as a healthy cron.
   */
  ok: boolean;
  /** Any provider at all — TNZ or Twilio. A report, never a gate; see runNudgeScheduler. */
  smsConfigured: boolean;
  candidates: {
    /** GTC-178 (E1, phase 5): ordinal — the legs are days 4 and 7, and adjustable next. */
    eligibleFirst: number;
    eligibleSecond: number;
    /** [[GTC-251]] slice 251c — further reminders the host asked for. */
    eligibleMore: number;
    skipped: { reason: string; count: number }[];
  };
  results: {
    sent: number;
    succeeded: number;
    failed: number;
    deferred: number;
  };
  errors: string[];
}

/**
 * Is a completed run healthy enough for a monitor to leave alone? (GTC-214)
 *
 * Pure, and exported so both directions can be asserted without a database or a provider
 * — the live cron can only ever demonstrate one quadrant per process, because provider
 * configuration is captured at module scope.
 *
 * Three ways a run is unhealthy:
 *
 *  0. Live sending is off ([[GTC-274]]). Nothing leaves this process, whatever is configured.
 *  1. No provider is configured at all. Nothing it attempts can succeed.
 *  2. It had work to do and NONE of it landed. `smsConfigured` is deliberately
 *     destination-agnostic — TNZ or Twilio, either one — so it is true on a Twilio-only
 *     deployment where every +64 nudge fails at the TNZ arm. That configuration is not
 *     hypothetical: it is the local dev default. Without this second test the cron would
 *     report 200 / success:true while sending nothing, which is the same false-healthy
 *     signal this ticket exists to remove, one layer further in.
 *
 * `attempted` counts sends, not candidates, so a quiet-hours run that deferred everything
 * has attempted 0 and stays healthy — deferring is the machinery working. And a partial
 * failure stays healthy: one bad number must not flap the alert.
 */
export function isNudgeRunHealthy(input: {
  smsConfigured: boolean;
  /**
   * [[GTC-274]] — is live sending on (`isLiveSendingOn`)? A run where it is off cannot send anything,
   * whatever is configured, so it is not a healthy run: the same false-healthy signal GTC-214 removed,
   * one switch further out. REQUIRED, so no caller can leave it out and read as live.
   */
  live: boolean;
  attempted: number;
  succeeded: number;
}): boolean {
  if (!input.live) return false;
  if (!input.smsConfigured) return false;
  if (input.attempted > 0 && input.succeeded === 0) return false;
  return true;
}

/**
 * Run the nudge scheduler — every 15 minutes.
 *
 * ⚠ [[GTC-189]] SLICE 8b: IT QUEUES AND SENDS NOTHING (founder ruling D2). Each due reminder becomes
 * one `OutboundMessage` row; the dispatcher (`/api/cron/outbound-dispatch`, `drainOnce`) sends it.
 * So `results.sent` counts rows QUEUED, and `succeeded`/`failed` are about queueing, not delivery.
 *
 * ⚠ RULINGS V AND AE — THE HOUSEHOLD PROXY REMINDER IS RETIRED HERE. It texted a household's contact
 * about its unconfirmed members, adults included, which THE ASK ruled the household is not; it ran
 * on `PersonEvent.contactMethod`, the column ruling C measured as wrong; and its replacement is a
 * different object the host chooses to send ([[GTC-298]]). A carried child's ask is chased through
 * the chase itself (ruling R). Nothing calls the proxy finder now.
 *
 * ⚠ ITS HEALTH IS STILL GTC-214's — `smsConfigured` — AND THAT IS NOW A QUESTION, NOT A SETTLED
 * FACT. The run no longer attempts a send, so "no provider" no longer means this run failed; the
 * dispatcher's run is where a send can fail. Kept as it was because `tests/nudge-provider-gate-test.ts`
 * pins it, and moving it is the founder's call, raised at slice 8b.
 */
export async function runNudgeScheduler(
  now: Date = new Date(),
  scope: { eventIds?: string[] } = {}
): Promise<NudgeRunResult> {
  const timestamp = now;
  const errors: string[] = [];

  // GTC-214: this is a REPORT, NOT A GATE. Do not restore a gate here in any form.
  const smsConfigured = isTnzEnabled() || isSmsEnabled();

  try {
    const candidates = await findNudgeCandidates(now, scope);
    const queued = await queueChase(candidates);
    const written = queued.filter((q) => q.queued).length;

    return {
      timestamp,
      ok: isNudgeRunHealthy({ smsConfigured, live: isLiveSendingOn(), attempted: 0, succeeded: 0 }),
      smsConfigured,
      candidates: {
        eligibleFirst: candidates.eligibleFirst.length,
        eligibleSecond: candidates.eligibleSecond.length,
        eligibleMore: candidates.eligibleMore.length,
        skipped: candidates.skipped,
      },
      results: {
        sent: written,
        succeeded: written,
        failed: 0,
        deferred: 0,
      },
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Nudge Scheduler] Error:', errorMessage);

    // A caught run-level exception is not a healthy run either.
    return {
      timestamp,
      ok: false,
      smsConfigured,
      candidates: { eligibleFirst: 0, eligibleSecond: 0, eligibleMore: 0, skipped: [] },
      results: { sent: 0, succeeded: 0, failed: 0, deferred: 0 },
      errors: [errorMessage],
    };
  }
}
