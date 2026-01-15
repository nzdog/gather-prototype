// GET /api/events/[id]/tokens
// Returns all invite links for an event
// SECURITY: Host-only endpoint

import { NextRequest, NextResponse } from 'next/server';
import { listInviteLinks, ensureEventTokens } from '@/lib/tokens';
import { prisma } from '@/lib/prisma';

// Force Node.js runtime for crypto support
export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // SERVER-SIDE AUTH: Verify this is the Host
    // Two authentication methods supported:
    // 1. Bearer token (HOST-scoped access token)
    // 2. Query param hostId (validates against event.hostId)

    const { searchParams } = new URL(request.url);
    const hostIdParam = searchParams.get('hostId');
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');

    // Method 1: Token-based auth (existing)
    if (token) {
      const accessToken = await prisma.accessToken.findUnique({
        where: { token },
        include: { event: true },
      });

      if (!accessToken) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid token' },
          { status: 403 }
        );
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

    // Method 2: hostId query param auth (new - for Plan page)
    if (hostIdParam) {
      // Fetch event and verify hostId matches
      const event = await prisma.event.findUnique({
        where: { id: eventId },
        select: { hostId: true, coHostId: true },
      });

      if (!event) {
        return NextResponse.json(
          { error: 'Event not found' },
          { status: 404 }
        );
      }

      // Allow both host and co-host to access invite links
      if (event.hostId !== hostIdParam && event.coHostId !== hostIdParam) {
        return NextResponse.json(
          { error: 'Unauthorized: Only the host can access invite links' },
          { status: 403 }
        );
      }

      // hostId auth passed - ensure tokens are up to date, then return invite links
      await ensureEventTokens(eventId);
      const inviteLinks = await listInviteLinks(eventId);
      return NextResponse.json({ inviteLinks });
    }

    // No authentication method provided
    return NextResponse.json(
      { error: 'Unauthorized: No authentication provided. Use Bearer token or hostId query param.' },
      { status: 403 }
    );
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
