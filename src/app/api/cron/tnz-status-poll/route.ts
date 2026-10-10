// GET/POST /api/cron/tnz-status-poll
// Cron job ([[GTC-290]]): asks TNZ about the texts TNZ never report on — a credit hold, a blocked
// link, and the in-flight states no webhook sends — and emails the founder once when it finds a
// hold or a blocked link. Every 15 minutes. See src/lib/sms/tnz-status-poll.ts.
//
// Security: requires CRON_SECRET header or query param — the same shape as the four other cron
// routes, both refusals written out here, because GTC-268's scanner reads the conditions inside a
// handler and does not follow imports (GTC-270).

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pollRunHealth, pollTextStatusOnce } from '@/lib/sms/tnz-status-poll';
import { cronSecretAccepted, isCronSecretConfigured } from '../cron-secret';
import { withoutRecipientNames } from '../cron-response';

// GTC-270: read at module scope — see the note in ../nudges/route.ts.
const CRON_SECRET = process.env.CRON_SECRET;

async function handleRequest(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const secretParam = request.nextUrl.searchParams.get('secret');
  const providedSecret = authHeader?.replace('Bearer ', '') || secretParam;

  if (!isCronSecretConfigured(CRON_SECRET)) {
    console.error('[Cron TnzStatusPoll] CRON_SECRET is not configured — refusing every caller.');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!cronSecretAccepted(CRON_SECRET, providedSecret)) {
    console.warn('[Cron TnzStatusPoll] Unauthorized access attempt');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await pollTextStatusOnce(prisma);

    // The run fails when it had texts to ask about and could read none, or owed the founder an
    // email it could not send — so the scheduler's failure email is the second channel.
    const health = pollRunHealth(result);

    return NextResponse.json(
      { success: health.ok, ...withoutRecipientNames(result) },
      { status: health.ok ? 200 : 500 }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Cron TnzStatusPoll] Error:', errorMessage);
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handleRequest(request);
}

export async function POST(request: NextRequest) {
  return handleRequest(request);
}
