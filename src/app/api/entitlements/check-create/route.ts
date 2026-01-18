// GET /api/entitlements/check-create - Check if user can create a new event
import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth/session';
import { canCreateEvent } from '@/lib/entitlements';

export async function GET() {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if user can create a new event
    const allowed = await canCreateEvent(user.id);

    return NextResponse.json({
      canCreate: allowed,
    });
  } catch (error) {
    console.error('Error checking create entitlement:', error);
    return NextResponse.json(
      {
        error: 'Failed to check entitlement',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
