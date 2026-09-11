import { NextRequest, NextResponse } from 'next/server';
import { runNudgeScheduler } from '@/lib/sms/nudge-scheduler';
import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';
import { withoutRecipientNames } from '../cron-response';

// Verify cron secret to prevent unauthorized access.
//
// GTC-270: read at MODULE SCOPE, so a change to the variable in a deployment needs a
// restart or a redeploy before it takes effect. That is a wart in every respect but
// one — it is what lets suite 12 in tests/security-validation.ts delete the variable
// and then import this module to reproduce the unset case in-process, without
// restarting a server.
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/nudges
 *
 * Called by cron service every 15 minutes to process nudges
 *
 * Security: requires CRON_SECRET, supplied either as `Authorization: Bearer <secret>`
 * or as `?secret=<secret>`. GTC-270: an UNSET secret refuses every caller.
 *
 * The two refusals below are deliberately separate. A deployment that never configured
 * the secret and a stranger probing the endpoint are different events, and only the
 * first is an operator error worth an error-level log. Both answer 401 with the same
 * body, so nothing on the wire can tell them apart.
 */
export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');

  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (!isCronSecretConfigured(CRON_SECRET)) {
    console.error('[Cron Nudges] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron Nudges] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNudgeScheduler();

    // GTC-270 finding 2: the per-recipient errors carry guest names. They go to the
    // server log; the wire body gets a count. See ../cron-response.ts.
    if (result.errors.length > 0) {
      console.error('[Cron Nudges] send failures:', result.errors);
    }

    // GTC-214: `success` is DERIVED, never asserted. This route used to return
    // `{ success: true, ...result }` with HTTP 200 even when the run reported
    // `smsEnabled: false` or its catch had fired — a monitor watching the status code or
    // `success` saw a healthy cron that had sent nothing. 500 rather than 503 because it
    // is the status this route's error path already uses, so alerting needs no change.
    return NextResponse.json(
      { success: result.ok, ...withoutRecipientNames(result) },
      { status: result.ok ? 200 : 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron Nudges] Error:', errorMessage);

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
      },
      { status: 500 }
    );
  }
}

// Also support POST for flexibility
export async function POST(request: NextRequest) {
  return GET(request);
}
