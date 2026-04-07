// POST /api/events/[id]/wrap-up/retry
// Retries failed wrap-up message dispatches
// SECURITY: Requires HOST role

import { NextRequest, NextResponse } from 'next/server';
import { requireEventRole } from '@/lib/auth/guards';
import { retryFailedDispatches } from '@/lib/wrap-up';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const retriedCount = await retryFailedDispatches(eventId);
    return NextResponse.json({
      success: true,
      retriedCount,
      message:
        retriedCount > 0
          ? `${retriedCount} message(s) queued for retry.`
          : 'No failed messages to retry.',
    });
  } catch (error) {
    console.error('Error retrying wrap-up dispatches:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
