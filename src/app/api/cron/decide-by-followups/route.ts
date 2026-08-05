// GET/POST /api/cron/decide-by-followups
// Cron job (GTC-175 / D2): sends the maybe's single decide-by follow-up.
// A maybe gets no nudge cadence (Hinge §8) — this is its own clock, on its own sweep.
// Security: Requires CRON_SECRET header or query param — same shape as the two existing
// cron routes. (The `CRON_SECRET &&` guard means an unset secret leaves this open, which
// is pre-existing behaviour shared by /api/cron/nudges and /api/cron/wrap-up-dispatch;
// deliberately copied rather than diverged from, so the fix lands in one ticket.)

import { NextRequest, NextResponse } from 'next/server';
import { runDecideByFollowups } from '@/lib/sms/decide-by-scheduler';

const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    console.warn('[Cron DecideBy] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDecideByFollowups();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron DecideBy] Error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
