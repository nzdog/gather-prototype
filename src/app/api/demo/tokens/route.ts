import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/demo/tokens
 * Returns all access tokens for the demo landing page
 */
export async function GET() {
  try {
    const tokens = await prisma.accessToken.findMany({
      include: {
        person: true,
        team: {
          select: {
            name: true
          }
        }
      },
      orderBy: [
        { scope: 'asc' },
        { person: { name: 'asc' } }
      ]
    });

    const formattedTokens = tokens.map(t => ({
      scope: t.scope,
      token: t.token,
      personName: t.person.name,
      teamName: t.team?.name
    }));

    return NextResponse.json({ tokens: formattedTokens });
  } catch (error) {
    console.error('Failed to fetch tokens:', error);
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }
}
