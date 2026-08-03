import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isSent } from '@/lib/lifecycle';
import { logInviteEvent } from '@/lib/invite-events';
import { headers } from 'next/headers';

export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;

  // Parse request body
  let body: { personId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { personId } = body;

  if (!personId) {
    return NextResponse.json({ error: 'Person ID is required' }, { status: 400 });
  }

  // Find event by shared link token
  const event = await prisma.event.findFirst({
    where: {
      sharedLinkToken: token,
      sharedLinkEnabled: true,
    },
    select: {
      id: true,
      status: true,
      sentAt: true,
      endDate: true,
      hostId: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Invalid or disabled invite link' }, { status: 404 });
  }

  // Responses are accepted once the plan is built, and stay open through the send.
  // Someone claiming a name post-send becomes a mini-send (Hinge §2, gap #5).
  if (event.status !== 'CONFIRMING' && !isSent(event)) {
    return NextResponse.json({ error: 'This event is not accepting responses' }, { status: 400 });
  }

  // Find person and their access token for this event
  const person = await prisma.person.findFirst({
    where: {
      id: personId,
      eventMemberships: {
        some: {
          eventId: event.id,
        },
      },
    },
    select: {
      id: true,
      name: true,
      tokens: {
        where: {
          eventId: event.id,
        },
        select: {
          id: true,
          token: true,
          scope: true,
          claimedAt: true,
          claimedBy: true,
          openedAt: true,
        },
      },
    },
  });

  if (!person) {
    return NextResponse.json({ error: 'Person not found in this event' }, { status: 404 });
  }

  // Prefer PARTICIPANT token, but fall back to COORDINATOR or HOST
  const participantToken = person.tokens.find((t) => t.scope === 'PARTICIPANT');
  const anyToken = participantToken || person.tokens[0];

  if (!anyToken) {
    return NextResponse.json(
      { error: 'No access token found. Please contact the host.' },
      { status: 500 }
    );
  }

  // If person has a non-PARTICIPANT token (coordinator/host), redirect them
  // to their role-appropriate view instead of claiming
  if (!participantToken) {
    const prefix = anyToken.scope === 'HOST' ? 'h' : anyToken.scope === 'COORDINATOR' ? 'c' : 'p';
    return NextResponse.json({
      success: true,
      participantToken: anyToken.token,
      personName: person.name,
      redirectPrefix: prefix,
    });
  }

  const accessToken = participantToken;

  // Check if already claimed
  if (accessToken.claimedAt) {
    return NextResponse.json(
      { error: 'This name has already been claimed. If this is you, please contact the host.' },
      { status: 409 } // Conflict
    );
  }

  // Generate device identifier for audit
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const forwardedFor = headersList.get('x-forwarded-for') || '';
  const deviceId = generateDeviceId(userAgent, forwardedFor);

  // Claim the name (update token and set reachability tier)
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    // Update the access token to mark it as claimed
    await tx.accessToken.update({
      where: { id: accessToken.id },
      data: {
        claimedAt: now,
        claimedBy: deviceId,
        openedAt: accessToken.openedAt || now, // Also mark as opened if not already
      },
    });

    // Update PersonEvent to set reachability tier and claimed via shared link flag
    await tx.personEvent.update({
      where: {
        personId_eventId: {
          personId: person.id,
          eventId: event.id,
        },
      },
      data: {
        reachabilityTier: 'SHARED',
        claimedViaSharedLink: true,
      },
    });

    // Log the claim event
    await logInviteEvent(
      {
        eventId: event.id,
        personId: person.id,
        type: 'NAME_CLAIMED',
        metadata: {
          deviceId,
          sharedLinkToken: token,
          personName: person.name,
        },
      },
      tx
    );
  });

  return NextResponse.json({
    success: true,
    participantToken: accessToken.token,
    personName: person.name,
  });
}

/**
 * Generate a semi-stable device identifier for audit purposes
 * This is NOT for security - just for tracking claims
 */
function generateDeviceId(userAgent: string, ip: string): string {
  const combined = `${userAgent.substring(0, 100)}-${ip.split(',')[0].trim()}`;

  // Simple hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return `device_${Math.abs(hash).toString(36)}`;
}
