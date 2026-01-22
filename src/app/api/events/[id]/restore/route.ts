import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// POST /api/events/[id]/restore - Restore an archived event
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

    // SECURITY: Require HOST role to restore events
    const auth = await requireEventRole(id, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.update({
      where: { id },
      data: { archived: false },
    });

    return NextResponse.json({ event });
  } catch (error: any) {
    console.error('Error restoring event:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
