import { NextRequest, NextResponse } from 'next/server';
import { findNudgeCandidatesForEvent } from '@/lib/sms/nudge-eligibility';
import { processNudges } from '@/lib/sms/nudge-sender';
import { isSmsEnabled } from '@/lib/sms/twilio-client';

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  const { id: eventId } = params;

  // TODO: Add authentication when session is properly configured
  // For now, allow open access to match the event endpoint pattern

  if (!isSmsEnabled()) {
    return NextResponse.json({ error: 'SMS is not configured' }, { status: 400 });
  }

  try {
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
