import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/templates/gather
 *
 * Returns Gather curated templates.
 */
export async function GET(_request: NextRequest) {
  const templates = await prisma.structureTemplate.findMany({
    where: {
      templateSource: 'GATHER_CURATED',
    },
    orderBy: {
      publishedAt: 'desc',
    },
  });

  return NextResponse.json({ templates });
}
