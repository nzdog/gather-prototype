import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { requireEventRole } from '@/lib/auth/guards';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  const { id: eventId, personId } = await context.params;

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
    // Find person and their token
    const person = await prisma.person.findFirst({
      where: {
        id: personId,
        eventMemberships: {
          some: {
            eventId: eventId,
          },
        },
      },
      select: {
        id: true,
        name: true,
        tokens: {
          where: {
            scope: 'PARTICIPANT',
            eventId: eventId,
          },
          select: {
            id: true,
            claimedAt: true,
            claimedBy: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    const accessToken = person.tokens[0];

    if (!accessToken) {
      return NextResponse.json({ error: 'No access token found' }, { status: 404 });
    }

    if (!accessToken.claimedAt) {
      return NextResponse.json({ error: 'Name is not claimed' }, { status: 400 });
    }

    const previousClaimBy = accessToken.claimedBy;

    // Reset the claim
    await prisma.accessToken.update({
      where: { id: accessToken.id },
      data: {
        claimedAt: null,
        claimedBy: null,
        // Note: Keep openedAt - we know they opened at some point
      },
    });

    // Log the reset
    await logInviteEvent({
      eventId,
      personId,
      type: 'CLAIM_RESET',
      metadata: {
        previousClaimBy,
        personName: person.name,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Claim reset for ${person.name}. They can now claim their name again.`,
    });
  } catch (error) {
    console.error('Error resetting claim:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
