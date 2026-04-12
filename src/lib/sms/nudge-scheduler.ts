import { findNudgeCandidates, findRsvpFollowupCandidates } from './nudge-eligibility';
import { processNudges, processRsvpFollowupNudges } from './nudge-sender';
import { findProxyNudgeCandidates } from './proxy-nudge-eligibility';
import { processProxyNudges } from './proxy-nudge-sender';
import { isSmsEnabled } from './twilio-client';

export interface NudgeRunResult {
  timestamp: Date;
  smsEnabled: boolean;
  candidates: {
    eligible24h: number;
    eligible48h: number;
    eligibleRsvpFollowup?: number;
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
  rsvpFollowupResults?: {
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
 * Run the nudge scheduler
 * This should be called periodically (e.g., every 15 minutes)
 */
export async function runNudgeScheduler(): Promise<NudgeRunResult> {
  const timestamp = new Date();
  const errors: string[] = [];

  // Check if SMS is enabled
  if (!isSmsEnabled()) {
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

    // Process direct nudges
    const processResult = await processNudges(candidates);

    const succeeded = processResult.sent.filter((r) => r.success).length;
    const failed = processResult.sent.filter((r) => !r.success).length;

    // Collect errors
    processResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`${r.personName}: ${r.error}`));

    // Find eligible candidates for RSVP followup
    const rsvpFollowupResult = await findRsvpFollowupCandidates();

    // Process RSVP followup nudges
    const rsvpFollowupProcessResult = await processRsvpFollowupNudges(rsvpFollowupResult.eligible);

    const rsvpFollowupSucceeded = rsvpFollowupProcessResult.sent.filter((r) => r.success).length;
    const rsvpFollowupFailed = rsvpFollowupProcessResult.sent.filter((r) => !r.success).length;

    // Collect RSVP followup errors
    rsvpFollowupProcessResult.sent
      .filter((r) => !r.success)
      .forEach((r) => errors.push(`RSVP followup ${r.personName}: ${r.error}`));

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

    return {
      timestamp,
      smsEnabled: true,
      candidates: {
        eligible24h: candidates.eligible24h.length,
        eligible48h: candidates.eligible48h.length,
        eligibleRsvpFollowup: rsvpFollowupResult.eligible.length,
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
      rsvpFollowupResults: {
        sent: rsvpFollowupProcessResult.sent.length,
        succeeded: rsvpFollowupSucceeded,
        failed: rsvpFollowupFailed,
        deferred: rsvpFollowupProcessResult.deferred,
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

    return {
      timestamp,
      smsEnabled: true,
      candidates: { eligible24h: 0, eligible48h: 0, skipped: [] },
      results: { sent: 0, succeeded: 0, failed: 0, deferred: 0 },
      errors: [errorMessage],
    };
  }
}
