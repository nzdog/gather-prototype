import { NextRequest, NextResponse } from 'next/server';
import { findNudgeCandidatesForEvent } from '@/lib/sms/nudge-eligibility';
import { queueChase } from '@/lib/sms/nudge-sender';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // GTC-214: no provider check here. This route used to 400 with "SMS is not configured"
    // on `!isSmsEnabled()` — the Twilio predicate — while every candidate it finds is a
    // +64 number that routes to TNZ. `sendSms` selects the provider per destination and
    // reports per-recipient failures through `result.sent`, which this response already
    // surfaces.
    // Find candidates for this event only
    const candidates = await findNudgeCandidatesForEvent(eventId);

    // [[GTC-189]] slice 8b, ruling D2: the reminders are QUEUED as rows for the dispatcher, which
    // sends them on its next tick. Nothing is sent from this route, so nothing here can succeed or
    // fail at a provider; `queued` is the honest count.
    const queued = await queueChase(candidates);

    return NextResponse.json({
      success: true,
      // GTC-178 (E1, phase 5): ordinal keys — the legs are days 4 and 7 now.
      eligible: {
        first: candidates.eligibleFirst.length,
        second: candidates.eligibleSecond.length,
      },
      queued: queued.filter((r) => r.queued).length,
      details: queued.map((r) => ({
        name: r.personName,
        type: r.nudgeType,
        channel: r.channel,
        queued: r.queued,
      })),
    });
  } catch (error) {
    console.error('Error triggering nudges:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
