// POST /api/events/[id]/gate-check
// Runs the gate check to determine if event can transition to CONFIRMING
// Returns: { passed: boolean, blocks: GateBlock[] }

import { NextRequest, NextResponse } from 'next/server';
import { runGateCheck } from '@/lib/workflow';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Run the gate check
    const result = await runGateCheck(eventId);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error running gate check:', error);
    return NextResponse.json(
      {
        error: 'Failed to run gate check',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
