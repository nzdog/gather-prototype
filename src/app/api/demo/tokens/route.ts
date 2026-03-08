import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';

// The three specific demo personas shown on the /demo page
const DEMO_PERSONAS = [
  { name: 'Sarah Henderson', scope: 'HOST' },
  { name: 'Rob Henderson', scope: 'COORDINATOR' },
  { name: 'Emma Henderson', scope: 'PARTICIPANT' },
] as const;

/**
 * GET /api/demo/tokens
 * Returns access tokens for the three demo personas on the /demo landing page.
 * Scoped to specific named personas in the demo event — does not expose all tokens.
 */
export async function GET() {
  try {
    const event = await prisma.event.findFirst({
      where: { name: DEMO_EVENT_NAME },
      select: { id: true },
    });

    if (!event) {
      return NextResponse.json({ tokens: [] });
    }

    const tokens = await prisma.accessToken.findMany({
      where: {
        eventId: event.id,
        person: {
          name: { in: DEMO_PERSONAS.map((p) => p.name) },
        },
        scope: { in: DEMO_PERSONAS.map((p) => p.scope) },
      },
      include: {
        person: true,
        team: { select: { name: true } },
      },
    });

    const formattedTokens = tokens.map((t) => ({
      scope: t.scope,
      token: t.token,
      personName: t.person.name,
      teamName: t.team?.name,
    }));

    return NextResponse.json({ tokens: formattedTokens });
  } catch (error) {
    console.error('[TokenAPI] Failed to fetch tokens:', error);
    return NextResponse.json({ error: 'Failed to fetch tokens' }, { status: 500 });
  }
}
