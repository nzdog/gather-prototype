import { findDecideByFollowupCandidates } from './decide-by-eligibility';
import { processDecideByFollowups } from './decide-by-sender';

/**
 * GTC-175 (D2) — the decide-by sweep.
 *
 * WHY THIS IS NOT A FOURTH BRANCH INSIDE runNudgeScheduler. Three reasons, in order of
 * how badly each would have bitten:
 *
 *  1. SUPERSEDED BY GTC-214 — kept as the record of why D2 sat outside rather than as a
 *     live constraint. D2 found that `runNudgeScheduler` early-returned on the TWILIO
 *     predicate (`isSmsEnabled` in twilio-client.ts) while NZ traffic routes to TNZ
 *     (`shouldUseTnz` in send-sms.ts), so on a TNZ-only configuration D2 would never have
 *     fired, silently — and routed around the gate rather than fixing it, because
 *     loosening E1's machinery was not D2's to do. GTC-214 deleted that gate. The reason
 *     no longer holds; reasons 2 and 3 do, and they are why this still lives here.
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
