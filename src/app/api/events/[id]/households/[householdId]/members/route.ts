import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// POST /api/events/[id]/households/[householdId]/members - Proxy adds member names
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; householdId: string } }
) {
  try {
    const eventId = params.id;
    const householdId = params.householdId;

    // Require HOST, COHOST, or COORDINATOR role
    // In production, you might want to verify the user is the proxy person
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { name } = body;

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Verify household exists and belongs to this event
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: true,
      },
    });

    if (!household) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    if (household.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Household does not belong to this event' },
        { status: 400 }
      );
    }

    // Create household member
    const member = await prisma.householdMember.create({
      data: {
        householdId,
        name,
      },
    });

    return NextResponse.json({ member }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding household member:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
