// POST /api/events/[id]/freeze-check
// Checks freeze readiness and returns warnings WITHOUT actually freezing
// This allows the UI to show warnings before committing to the freeze

import { NextRequest, NextResponse } from 'next/server';
import { checkFreezeReadiness } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check - require HOST role
  const auth = await requireEventRole(eventId, ['HOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    // Run freeze readiness check
    const result = await checkFreezeReadiness(eventId);

    return NextResponse.json({
      canFreeze: result.canFreeze,
      warnings: result.warnings,
      complianceRate: result.complianceRate,
      criticalGaps: result.criticalGaps,
    });
  } catch (error) {
    console.error('Error checking freeze readiness:', error);
    return NextResponse.json(
      {
        error: 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
