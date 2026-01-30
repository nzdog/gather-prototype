import { findNudgeCandidates } from './nudge-eligibility';
import { processNudges } from './nudge-sender';
import { findProxyNudgeCandidates } from './proxy-nudge-eligibility';
import { processProxyNudges } from './proxy-nudge-sender';
import { isSmsEnabled } from './twilio-client';

export interface NudgeRunResult {
  timestamp: Date;
  smsEnabled: boolean;
  candidates: {
    eligible24h: number;
    eligible48h: number;
    skipped: { reason: string; count: number }[];
  };
  proxyCandidates?: {
    eligible24h: number;
    eligible48h: number;
    eligibleEscalation: number;
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
    escalated: number;
    deferred: number;
  };
  errors: string[];
}

/**
 * Run the nudge scheduler
 * This should be called periodically (e.g., every 15 minutes)
 */
export async function runNudgeScheduler(): Promise<NudgeRunResult> {
  const timestamp = new Date();
  const errors: string[] = [];

  console.log(`[Nudge Scheduler] Starting run at ${timestamp.toISOString()}`);

  // Check if SMS is enabled
  if (!isSmsEnabled()) {
    console.log('[Nudge Scheduler] SMS not enabled - skipping');
    return {
      timestamp,
      smsEnabled: false,
      candidates: { eligible24h: 0, eligible48h: 0, skipped: [] },
      results: { sent: 0, succeeded: 0, failed: 0, deferred: 0 },
      errors: ['SMS not configured'],
    };
  }

  try {
    // Find eligible candidates for direct nudges
    const candidates = await findNudgeCandidates();

    console.log(
      `[Nudge Scheduler] Found ${candidates.eligible24h.length} for 24h, ${candidates.eligible48h.length} for 48h`
    );

    if (candidates.skipped.length > 0) {
      console.log('[Nudge Scheduler] Skipped:', candidates.skipped);
    }

    // Process direct nudges
    const processResult = await processNudges(candidates);

    const succeeded = processResult.sent.filter((r) => r.success).length;
    const failed = processResult.sent.filter((r) => !r.success).length;

    console.log(
      `[Nudge Scheduler] Sent: ${processResult.sent.length}, Succeeded: ${succeeded}, Failed: ${failed}, Deferred: ${processResult.deferred}`
    );

    // Collect errors
    processResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`${r.personName}: ${r.error}`));

    // Find eligible candidates for proxy nudges
    const proxyCandidates = await findProxyNudgeCandidates();

    console.log(
      `[Nudge Scheduler] Found ${proxyCandidates.eligible24h.length} proxy households for 24h, ${proxyCandidates.eligible48h.length} for 48h, ${proxyCandidates.eligibleEscalation.length} for escalation`
    );

    if (proxyCandidates.skipped.length > 0) {
      console.log('[Nudge Scheduler] Proxy skipped:', proxyCandidates.skipped);
    }

    // Process proxy nudges
    const proxyProcessResult = await processProxyNudges(proxyCandidates);

    const proxySucceeded = proxyProcessResult.sent.filter((r) => r.success).length;
    const proxyFailed = proxyProcessResult.sent.filter((r) => !r.success).length;
    const escalated = proxyProcessResult.escalated.filter((r) => r.success).length;

    console.log(
      `[Nudge Scheduler] Proxy sent: ${proxyProcessResult.sent.length}, Succeeded: ${proxySucceeded}, Failed: ${proxyFailed}, Escalated: ${escalated}, Deferred: ${proxyProcessResult.deferred}`
    );

    // Collect proxy errors
    proxyProcessResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`Proxy ${r.proxyName}: ${r.error}`));

    proxyProcessResult.escalated
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`Escalation ${r.proxyName}: ${r.error}`));

    return {
      timestamp,
      smsEnabled: true,
      candidates: {
        eligible24h: candidates.eligible24h.length,
        eligible48h: candidates.eligible48h.length,
        skipped: candidates.skipped,
      },
      proxyCandidates: {
        eligible24h: proxyCandidates.eligible24h.length,
        eligible48h: proxyCandidates.eligible48h.length,
        eligibleEscalation: proxyCandidates.eligibleEscalation.length,
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
        escalated,
        deferred: proxyProcessResult.deferred,
      },
      errors,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Nudge Scheduler] Error:', errorMessage);

    return {
      timestamp,
      smsEnabled: true,
      candidates: { eligible24h: 0, eligible48h: 0, skipped: [] },
      results: { sent: 0, succeeded: 0, failed: 0, deferred: 0 },
      errors: [errorMessage],
    };
  }
}
