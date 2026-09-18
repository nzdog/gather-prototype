// GET/POST /api/cron/wrap-up-dispatch
// Cron job: dispatches pending wrap-up messages (delayed 10+ min after creation)
//
// The dispatcher sends SMS and, where SMS fails or the link's channel is email, EMAIL
// via Resend (`dispatchPendingWrapUpMessages` in src/lib/wrap-up.ts). Both are real
// messages to real guests; this route decides only who may trigger them.
//
// Security: requires CRON_SECRET header or query param. GTC-270: an UNSET secret
// refuses every caller.

import { NextRequest, NextResponse } from 'next/server';
import { dispatchPendingWrapUpMessages } from '@/lib/wrap-up';
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
    console.error('[Cron WrapUp] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron WrapUp] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await dispatchPendingWrapUpMessages();

    // GTC-270 finding 2: this dispatcher's result carries counts and no recipient
    // names, unlike the two nudge schedulers — verified, not assumed. The redaction is
    // applied anyway so all three cron routes put the same shape on the wire, and so a
    // later `errors` array added to this dispatcher cannot leak by default.
    return NextResponse.json({
      success: true,
      ...withoutRecipientNames(result),
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
