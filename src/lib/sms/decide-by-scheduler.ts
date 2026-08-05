import { findDecideByFollowupCandidates } from './decide-by-eligibility';
import { processDecideByFollowups } from './decide-by-sender';

/**
 * GTC-175 (D2) — the decide-by sweep.
 *
 * WHY THIS IS NOT A FOURTH BRANCH INSIDE runNudgeScheduler. Three reasons, in order of
 * how badly each would have bitten:
 *
 *  1. `runNudgeScheduler` early-returns on `!isSmsEnabled()`, and `isSmsEnabled()` is the
 *     TWILIO predicate (twilio-client.ts:23) while NZ traffic routes to TNZ
 *     (send-sms.ts:11). On a TNZ-only configuration D2 would never fire, silently. The
 *     alternative — loosening that gate — is a behaviour change to E1's nudge machinery
 *     smuggled in under D2, which is not D2's to make.
 *  2. Its three existing branches share one `try` whose `catch` returns a shape that
 *     drops the other branches' counts. A fourth member inherits that.
 *  3. `now` is not injectable there. This feature IS a clock; a test that cannot fix the
 *     clock cannot assert anything about it (the reasoning
 *     tests/wrap-up-quiet-hours-test.ts:11-18 records).
 *
 * The shape here is `dispatchPendingWrapUpMessages`'s (wrap-up.ts:183): injectable `now`,
 * its own cron route, no enablement gate of its own — `sendSms` decides per destination,
 * which is the only place that decision is correct.
 *
 * And it keeps GTC-175's Do-Not-Touch literally true: nothing in the maybe's path
 * touches `nudge-eligibility.ts`'s candidate-finding.
 */

export interface DecideByRunResult {
  timestamp: Date;
  candidates: {
    eligible: number;
    skipped: { reason: string; count: number }[];
  };
  results: {
    sent: number;
    succeeded: number;
    failed: number;
    deferred: number;
    deferredUntilMinutes: number;
  };
  errors: string[];
}

export async function runDecideByFollowups(now: Date = new Date()): Promise<DecideByRunResult> {
  const errors: string[] = [];

  const candidates = await findDecideByFollowupCandidates(now);
  const processed = await processDecideByFollowups(candidates.eligible, now);

  processed.sent
    .filter((r) => !r.success)
    .forEach((r) => errors.push(`Decide-by follow-up ${r.personName}: ${r.error}`));

  return {
    timestamp: now,
    candidates: {
      eligible: candidates.eligible.length,
      skipped: candidates.skipped,
    },
    results: {
      sent: processed.sent.length,
      succeeded: processed.sent.filter((r) => r.success).length,
      failed: processed.sent.filter((r) => !r.success).length,
      deferred: processed.deferred,
      deferredUntilMinutes: processed.deferredUntilMinutes,
    },
    errors,
  };
}
