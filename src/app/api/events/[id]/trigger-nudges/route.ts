import { NextRequest, NextResponse } from 'next/server';
import { findNudgeCandidatesForEvent } from '@/lib/sms/nudge-eligibility';
import { processNudges } from '@/lib/sms/nudge-sender';
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

    // Process nudges
    const result = await processNudges(candidates);

    return NextResponse.json({
      success: true,
      eligible: {
        '24h': candidates.eligible24h.length,
        '48h': candidates.eligible48h.length,
      },
      sent: result.sent.length,
      succeeded: result.sent.filter((r) => r.success).length,
      failed: result.sent.filter((r) => !r.success).length,
      deferred: result.deferred,
      details: result.sent.map((r) => ({
        name: r.personName,
        type: r.nudgeType,
        success: r.success,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error('Error triggering nudges:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
