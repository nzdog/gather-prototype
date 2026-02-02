import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { generateSecureToken } from '@/lib/tokens';

// GET - Check shared link status
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        sharedLinkToken: true,
        sharedLinkEnabled: true,
        status: true,
        _count: { select: { people: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    return NextResponse.json({
      enabled: event.sharedLinkEnabled,
      token: event.sharedLinkToken,
      url: event.sharedLinkToken ? `${baseUrl}/join/${event.sharedLinkToken}` : null,
      peopleCount: event._count.people,
      recommendSharedLink: event._count.people >= 16,
    });
  } catch (error) {
    console.error('Error getting shared link status:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// POST - Generate and enable shared link
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { status: true, sharedLinkToken: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
      return NextResponse.json(
        { error: 'Shared link only available after transitioning to CONFIRMING' },
        { status: 400 }
      );
    }

    // Generate token if doesn't exist, otherwise reuse
    const token = event.sharedLinkToken || generateSecureToken();

    await prisma.event.update({
      where: { id: eventId },
      data: {
        sharedLinkToken: token,
        sharedLinkEnabled: true,
      },
    });

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    return NextResponse.json({
      enabled: true,
      token,
      url: `${baseUrl}/join/${token}`,
    });
  } catch (error) {
    console.error('Error enabling shared link:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

// DELETE - Disable shared link (keeps token for potential re-enable)
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    await prisma.event.update({
      where: { id: eventId },
      data: { sharedLinkEnabled: false },
    });

    return NextResponse.json({ enabled: false });
  } catch (error) {
    console.error('Error disabling shared link:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
