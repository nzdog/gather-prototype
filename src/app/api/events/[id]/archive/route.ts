import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/events/[id]/archive - Archive an event
export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;

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
