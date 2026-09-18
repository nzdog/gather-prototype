// POST /api/events/[id]/freeze-check
// Sweeps the plan for gaps and returns warnings. Never blocks.
// GTC-169: the path keeps its name until A3c migrates the UI; the concept is now
// send-readiness (Hinge §1's pre-flight), not freeze-readiness.

import { NextRequest, NextResponse } from 'next/server';
import { checkSendReadiness } from '@/lib/workflow';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check - require HOST role
  const auth = await requireEventRole(eventId, ['HOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    // Sweep for gaps. Warnings only — nothing here blocks (Moment 4 §2/§7).
    const result = await checkSendReadiness(eventId);

    return NextResponse.json({
      // Legacy wire key, always true. The internal canFreeze field is gone; this
      // stays until GTC-197 (A3c) migrates TransitionModal off it — A3a does not
      // change wire shapes.
      canFreeze: true,
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
