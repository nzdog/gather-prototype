// GET/POST /api/cron/decide-by-followups
// Cron job (GTC-175 / D2): sends the maybe's single decide-by follow-up.
// A maybe gets no nudge cadence (Hinge §8) — this is its own clock, on its own sweep.
//
// Security: requires CRON_SECRET header or query param — same shape as the two other
// cron routes. GTC-270 closed the fail-open guard this file used to carry and used to
// describe: `CRON_SECRET &&` meant an unset secret left all three routes open, and the
// ticket this comment promised had never been filed. It is filed, and it is GTC-270.

import { NextRequest, NextResponse } from 'next/server';
import { runDecideByFollowups } from '@/lib/sms/decide-by-scheduler';
import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';
import { withoutRecipientNames } from '../cron-response';

// GTC-270: read at module scope — see the note in ../nudges/route.ts.
const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  // Two refusals, deliberately separate: a deployment that never configured the secret
  // is an operator error worth an error-level log, and a caller probing the endpoint is
  // not. Both answer 401 identically on the wire.
  if (!isCronSecretConfigured(CRON_SECRET)) {
    console.error('[Cron DecideBy] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron DecideBy] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runDecideByFollowups();

    // GTC-270 finding 2: the per-recipient errors carry guest names. They go to the
    // server log; the wire body gets a count. See ../cron-response.ts.
    if (result.errors.length > 0) {
      console.error('[Cron DecideBy] send failures:', result.errors);
    }

    return NextResponse.json({
      success: true,
      ...withoutRecipientNames(result),
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
