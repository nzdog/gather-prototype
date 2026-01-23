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

    return NextResponse.json({
      success: true,
      ...result,
    });
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
