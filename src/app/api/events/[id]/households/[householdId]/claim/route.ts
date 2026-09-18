import { NextRequest, NextResponse } from 'next/server';

// POST /api/events/[id]/households/[householdId]/claim
// This route was built for the old HouseholdMember model.
// The Moment 1 redesign replaced HouseholdMember with direct PersonEvent
// membership via householdId + householdRole. This endpoint needs redesign
// for the new schema in a future ticket.
export async function POST(
  _request: NextRequest,
  _context: { params: Promise<{ id: string; householdId: string }> }
) {
  return NextResponse.json(
    { error: 'Household claim endpoint is being redesigned for the new household model' },
    { status: 501 }
  );
}
