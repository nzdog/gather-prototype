import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';

/**
 * GET /api/memory/patterns
 *
 * List learned patterns for the host.
 * SECURITY: Now uses session authentication instead of query param
 */
export async function GET(_request: NextRequest) {
  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hostId = user.id; // Use authenticated user's ID

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
