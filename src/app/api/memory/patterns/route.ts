import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/memory/patterns?hostId={hostId}
 *
 * List learned patterns for the host.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const hostId = searchParams.get('hostId');

  if (!hostId) {
    return NextResponse.json({ error: 'hostId is required' }, { status: 400 });
  }

  const hostMemory = await prisma.hostMemory.findUnique({
    where: { hostId },
    include: {
      patterns: {
        orderBy: {
          updatedAt: 'desc',
        },
      },
    },
  });

  if (!hostMemory) {
    return NextResponse.json({ patterns: [] });
  }

  return NextResponse.json({ patterns: hostMemory.patterns });
}
