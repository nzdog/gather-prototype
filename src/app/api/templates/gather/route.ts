import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/templates/gather
 *
 * Returns Gather curated templates.
 */
export async function GET(request: NextRequest) {
  const templates = await prisma.structureTemplate.findMany({
    where: {
      templateSource: 'GATHER_CURATED'
    },
    orderBy: {
      publishedAt: 'desc'
    }
  });

  return NextResponse.json({ templates });
}
