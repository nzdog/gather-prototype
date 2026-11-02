// GET/POST /api/cron/demo-cleanup
// Cron job ([[GTC-442]]): deletes expired sample copies and everything a visitor made in them,
// oldest first, at most 25 a run; then ([[GTC-448]]) the orphan accounts a copy its visitor
// deleted leaves, at most 25 a run. Hourly at :17. See src/lib/demo/cleanup.ts. It answers 500
// when the sweep cannot run or a copy or an orphan account could not be deleted, and 200
// otherwise (skips included).
//
// Security: requires CRON_SECRET header or query param — the same shape as the five other cron
// routes, both refusals written out here, because GTC-268's scanner reads the conditions inside a
// handler and does not follow imports (GTC-270).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sweepExpiredCopies } from '@/lib/demo/cleanup';
import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';

// GTC-270: read at module scope — see the note in ../nudges/route.ts.
const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (!isCronSecretConfigured(CRON_SECRET)) {
    console.error('[Cron DemoCleanup] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron DemoCleanup] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const counts = await sweepExpiredCopies(prisma, new Date());
    // Founder ruling Q4 (1 Nov 2026): a copy that could not be deleted (rolled back) fails the
    // run, so the scheduler's failure email reaches the founder. A guard skip is not a failure.
    // [[GTC-448]] An orphan account that could not be deleted fails it the same way.
    const ok = counts.failed === 0 && counts.orphansFailed === 0;
    return NextResponse.json({ success: ok, ...counts }, { status: ok ? 200 : 500 });
  } catch (error) {
    // A sweep that cannot run answers 500, so the scheduler's failure email reaches the founder.
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron DemoCleanup] Error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
