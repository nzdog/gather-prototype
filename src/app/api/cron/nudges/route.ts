import { NextRequest, NextResponse } from 'next/server';
import { runNudgeScheduler } from '@/lib/sms/nudge-scheduler';

// Verify cron secret to prevent unauthorized access
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * GET /api/cron/nudges
 *
 * Called by cron service every 15 minutes to process nudges
 *
 * Security: Requires CRON_SECRET header or query param
 */
export async function GET(request: NextRequest) {
  // Verify authorization
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');

  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    console.warn('[Cron Nudges] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runNudgeScheduler();

    // GTC-214: `success` is DERIVED, never asserted. This route used to return
    // `{ success: true, ...result }` with HTTP 200 even when the run reported
    // `smsEnabled: false` or its catch had fired — a monitor watching the status code or
    // `success` saw a healthy cron that had sent nothing. 500 rather than 503 because it
    // is the status this route's error path already uses, so alerting needs no change.
    return NextResponse.json({ success: result.ok, ...result }, { status: result.ok ? 200 : 500 });
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
