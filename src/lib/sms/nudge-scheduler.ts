import { findNudgeCandidates } from './nudge-eligibility';
import { processNudges } from './nudge-sender';
import { findProxyNudgeCandidates } from './proxy-nudge-eligibility';
import { processProxyNudges } from './proxy-nudge-sender';
import { isSmsEnabled } from './twilio-client';
import { isTnzEnabled } from './tnz-client';

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
    eligible24h: number;
    eligible48h: number;
    skipped: { reason: string; count: number }[];
  };
  proxyCandidates?: {
    eligible: number;
    skipped: { reason: string; count: number }[];
  };
  results: {
    sent: number;
    succeeded: number;
    failed: number;
    deferred: number;
  };
  proxyResults?: {
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
 * Two ways a run is unhealthy:
 *
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
  attempted: number;
  succeeded: number;
}): boolean {
  if (!input.smsConfigured) return false;
  if (input.attempted > 0 && input.succeeded === 0) return false;
  return true;
}

/**
 * Run the nudge scheduler
 * This should be called periodically (e.g., every 15 minutes)
 */
export async function runNudgeScheduler(): Promise<NudgeRunResult> {
  const timestamp = new Date();
  const errors: string[] = [];

  // GTC-214: this is a REPORT, NOT A GATE. The run proceeds either way, and `sendSms`
  // selects the provider per destination — the only place that decision is correct. There
  // used to be an early return here on `!isSmsEnabled()`, the TWILIO predicate, which
  // killed all three nudge families on a TNZ-only deployment before a single query ran.
  // Do not restore a gate here in any form, widened or otherwise.
  // tests/nudge-provider-gate-test.ts case B asserts the run proceeds with no provider
  // configured; that assertion is what holds this open, not this comment.
  const smsConfigured = isTnzEnabled() || isSmsEnabled();

  try {
    // Find eligible candidates for direct nudges
    const candidates = await findNudgeCandidates();

    // Process direct nudges
    const processResult = await processNudges(candidates);

    const succeeded = processResult.sent.filter((r) => r.success).length;
    const failed = processResult.sent.filter((r) => !r.success).length;

    // Collect errors
    processResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`${r.personName}: ${r.error}`));

    // Find eligible candidates for proxy nudges
    const proxyCandidates = await findProxyNudgeCandidates();

    // Process proxy nudges
    const proxyProcessResult = await processProxyNudges(proxyCandidates);

    const proxySucceeded = proxyProcessResult.sent.filter((r) => r.success).length;
    const proxyFailed = proxyProcessResult.sent.filter((r) => !r.success).length;

    // Collect proxy errors
    proxyProcessResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`Proxy ${r.primaryContactName}: ${r.error}`));

    const attempted = processResult.sent.length + proxyProcessResult.sent.length;

    return {
      timestamp,
      ok: isNudgeRunHealthy({
        smsConfigured,
        attempted,
        succeeded: succeeded + proxySucceeded,
      }),
      smsConfigured,
      candidates: {
        eligible24h: candidates.eligible24h.length,
        eligible48h: candidates.eligible48h.length,
        skipped: candidates.skipped,
      },
      proxyCandidates: {
        eligible: proxyCandidates.eligible.length,
        skipped: proxyCandidates.skipped,
      },
      results: {
        sent: processResult.sent.length,
        succeeded,
        failed,
        deferred: processResult.deferred,
      },
      proxyResults: {
        sent: proxyProcessResult.sent.length,
        succeeded: proxySucceeded,
        failed: proxyFailed,
        deferred: proxyProcessResult.deferred,
      },
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Nudge Scheduler] Error:', errorMessage);

    // A caught run-level exception is not a healthy run either — it used to report
    // `smsEnabled: true`, which the cron route spread into `success: true` / HTTP 200.
    return {
      timestamp,
      ok: false,
      smsConfigured,
      candidates: { eligible24h: 0, eligible48h: 0, skipped: [] },
      results: { sent: 0, succeeded: 0, failed: 0, deferred: 0 },
      errors: [errorMessage],
    };
  }
}
