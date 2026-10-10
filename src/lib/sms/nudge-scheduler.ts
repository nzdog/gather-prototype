import { findNudgeCandidates } from './nudge-eligibility';
import { queueChase } from './nudge-sender';
import { isSmsEnabled } from './twilio-client';
import { isTnzEnabled } from './tnz-client';

export interface NudgeRunResult {
  timestamp: Date;
  /**
   * Did this run do its own job — line reminders up? False only when the catch below fires.
   * `GET` in cron/nudges/route.ts derives its `success` and its status code from this (GTC-214's
   * shape). [[GTC-339]] Q2: it no longer reads provider configuration or the live switch, because
   * this run sends nothing; send health is the sending crons' (`sendRunHealth`).
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
 * ⚠ ITS HEALTH IS ITS OWN JOB — [[GTC-339]] Q2, founder ruling 2026-09-30, verbatim as chosen:
 * *"Reports 'failed' only when it can't line reminders up. Send failures are the sending job's to
 * report, under the per-channel rule you just chose. Removes an alarm that would fire every 15
 * minutes if production ever had no text provider set up. cron-job.org switches a job off after more
 * than 25 failures in a row (about six hours here), which would stop every reminder, email ones
 * included."* So `ok` is false only when the catch fires. `isNudgeRunHealthy` (GTC-214, extended by
 * GTC-274 to read the live switch) is retired; its send quadrants live in `sendRunHealth`
 * (src/lib/send-health.ts), where the sends are. `smsConfigured` stays, as a report.
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
      ok: true,
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
