import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/events/[id]/restore - Restore an archived event
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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
