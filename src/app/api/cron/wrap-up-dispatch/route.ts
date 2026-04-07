// GET/POST /api/cron/wrap-up-dispatch
// Cron job: dispatches pending wrap-up messages (delayed 10+ min after creation)
// Security: Requires CRON_SECRET header or query param

import { NextRequest, NextResponse } from 'next/server';
import { dispatchPendingWrapUpMessages } from '@/lib/wrap-up';

const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (CRON_SECRET && providedSecret !== CRON_SECRET) {
    console.warn('[Cron WrapUp] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchPendingWrapUpMessages();

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron WrapUp] Error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
