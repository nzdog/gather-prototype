// GET /api/events/[id]/tokens
// Returns all invite links for an event
// SECURITY: Host-only endpoint — session or a HOST-scoped bearer token.

import { NextRequest, NextResponse } from 'next/server';
import { listInviteLinks, ensureEventTokens } from '@/lib/tokens';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// Force Node.js runtime for crypto support
export const runtime = 'nodejs';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SERVER-SIDE AUTH: Verify this is the Host.
    //
    // GTC-267: there used to be a second method here — `?hostId=`, compared against
    // `event.hostId`. It was not authentication. `GET /api/events/[id]` published
    // that same hostId to anonymous callers, so the parameter was a credential the
    // neighbouring route handed out: event id -> hostId -> every access token on
    // this event, including the HOST one. The session path below replaces it.
    // GTC-026 added the parameter because the token-link flow has no session; that
    // no longer applies, since the only route that reveals a hostId now requires a
    // session itself.
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Method 1: Token-based auth (existing)
    if (token) {
      const accessToken = await prisma.accessToken.findUnique({
        where: { token },
        include: { event: true },
      });

      if (!accessToken) {
        return NextResponse.json({ error: 'Unauthorized: Invalid token' }, { status: 403 });
      }

      if (accessToken.scope !== 'HOST') {
        return NextResponse.json(
          { error: 'Unauthorized: Only hosts can access invite links' },
          { status: 403 }
        );
      }

      if (accessToken.eventId !== eventId) {
        return NextResponse.json(
          { error: 'Unauthorized: Token does not match event' },
          { status: 403 }
        );
      }

      // Token auth passed - ensure tokens are up to date, then return invite links
      await ensureEventTokens(eventId);
      const inviteLinks = await listInviteLinks(eventId);
      return NextResponse.json({ inviteLinks });
    }

    // Method 2: the host's own session, via the shared guard.
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    await ensureEventTokens(eventId);
    const inviteLinks = await listInviteLinks(eventId);
    return NextResponse.json({ inviteLinks });
  } catch (error) {
    console.error('Error fetching invite links:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch invite links',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
