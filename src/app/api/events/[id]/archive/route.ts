import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// POST /api/events/[id]/archive - Archive an event
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // SECURITY: Require HOST role to archive events
    const auth = await requireEventRole(id, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.update({
      where: { id },
      data: { archived: true },
    });

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error archiving event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
