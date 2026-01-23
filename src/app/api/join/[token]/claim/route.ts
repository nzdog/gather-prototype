import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logInviteEvent } from '@/lib/invite-events';
import { headers } from 'next/headers';

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  const { token } = params;

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
      hostId: true,
    },
  });

  if (!event) {
    return NextResponse.json({ error: 'Invalid or disabled invite link' }, { status: 404 });
  }

  if (event.status !== 'CONFIRMING' && event.status !== 'FROZEN') {
    return NextResponse.json({ error: 'This event is not accepting responses' }, { status: 400 });
  }

  // Find person and their participant token
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
          scope: 'PARTICIPANT',
          eventId: event.id,
        },
        select: {
          id: true,
          token: true,
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

  const accessToken = person.tokens[0];

  if (!accessToken) {
    // This shouldn't happen - tokens are created at transition
    return NextResponse.json(
      { error: 'No access token found. Please contact the host.' },
      { status: 500 }
    );
  }

  // Check if already claimed
  if (accessToken.claimedAt) {
    return NextResponse.json(
      { error: 'This name has already been claimed. If this is you, please contact the host.' },
      { status: 409 } // Conflict
    );
  }

  // Generate device identifier for audit
  const headersList = headers();
  const userAgent = headersList.get('user-agent') || '';
  const forwardedFor = headersList.get('x-forwarded-for') || '';
  const deviceId = generateDeviceId(userAgent, forwardedFor);

  // Claim the name (update token)
  const now = new Date();

  await prisma.accessToken.update({
    where: { id: accessToken.id },
    data: {
      claimedAt: now,
      claimedBy: deviceId,
      openedAt: accessToken.openedAt || now, // Also mark as opened if not already
    },
  });

  // Log the claim event
  await logInviteEvent({
    eventId: event.id,
    personId: person.id,
    type: 'NAME_CLAIMED',
    metadata: {
      deviceId,
      sharedLinkToken: token,
      personName: person.name,
    },
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
