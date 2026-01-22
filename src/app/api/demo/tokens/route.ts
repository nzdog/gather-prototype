import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';

export const dynamic = 'force-dynamic';

/**
 * GET /api/demo/tokens
 * DEV ONLY: Returns all access tokens for the demo landing page
 * SECURITY: This endpoint is DISABLED IN PRODUCTION
 * WARNING: Exposes sensitive authentication tokens - only for local development
 */
export async function GET() {
  // SECURITY: Disable in production - this endpoint exposes all tokens
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // SECURITY: Require authenticated user session
  const user = await getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[TokenAPI] Fetching all tokens from database...');
    const tokens = await prisma.accessToken.findMany({
      include: {
        person: true,
        team: {
          select: {
            name: true,
          },
        },
      },
      orderBy: [{ scope: 'asc' }, { person: { name: 'asc' } }],
    });

    const formattedTokens = tokens.map((t) => ({
      scope: t.scope,
      token: t.token,
      personName: t.person.name,
      teamName: t.team?.name,
    }));

    console.log(`[TokenAPI] Returning ${formattedTokens.length} tokens`);
    if (formattedTokens.length > 0) {
      console.log(
        `[TokenAPI] First HOST token: ${formattedTokens.find((t) => t.scope === 'HOST')?.token.substring(0, 16)}...`
      );
      console.log(
        `[TokenAPI] First COORD token: ${formattedTokens.find((t) => t.scope === 'COORDINATOR')?.token.substring(0, 16)}...`
      );
    }

    return NextResponse.json({ tokens: formattedTokens });
  } catch (error) {
    console.error('[TokenAPI] Failed to fetch tokens:', error);
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }
}
