// GET /api/events/[id]/wrap-up/status
// Returns dispatch summary for wrap-up messages
// SECURITY: Requires HOST role

import { NextRequest, NextResponse } from 'next/server';
import { requireEventRole } from '@/lib/auth/guards';
import { getDispatchSummary } from '@/lib/wrap-up';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
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
    const summary = await getDispatchSummary(eventId);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    console.error('Error fetching wrap-up status:', error);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
