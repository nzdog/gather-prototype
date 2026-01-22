// src/app/api/auth/verify/route.ts
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

type ErrorType = 'invalid' | 'expired' | 'used';

export async function POST(req: Request) {
  try {
    const { token, returnUrl, personId } = await req.json();

    if (!token) {
      return Response.json({ success: false, error: 'invalid' as ErrorType }, { status: 400 });
    }

    // Find the magic link
    const magicLink = await prisma.magicLink.findUnique({
      where: { token },
    });

    // Token not found
    if (!magicLink) {
      return Response.json({ success: false, error: 'invalid' as ErrorType });
    }

    // Token expired
    if (magicLink.expiresAt < new Date()) {
      return Response.json({ success: false, error: 'expired' as ErrorType });
    }

    // Token already used
    if (magicLink.usedAt) {
      return Response.json({ success: false, error: 'used' as ErrorType });
    }

    // Valid token - mark as used
    await prisma.magicLink.update({
      where: { id: magicLink.id },
      data: { usedAt: new Date() },
    });

    // Find or create User by email
    let user = await prisma.user.findUnique({
      where: { email: magicLink.email },
    });

    if (!user) {
      user = await prisma.user.create({
        data: { email: magicLink.email },
      });
    }

    // If personId provided (claim flow), link Person to User and create EventRole records (Ticket 1.6 + 1.7)
    if (personId) {
      console.log('[Verify] Claim flow - personId:', personId, 'userId:', user.id);
      await prisma.$transaction(async (tx) => {
        // Link Person to User
        console.log('[Verify] Updating Person.userId...');
        await tx.person.update({
          where: { id: personId },
          data: { userId: user.id },
        });
        console.log('[Verify] Person.userId updated successfully');

        // Find all events where this Person is host or co-host
        const hostedEvents = await tx.event.findMany({
          where: { hostId: personId },
          select: { id: true },
        });

        const coHostedEvents = await tx.event.findMany({
          where: { coHostId: personId },
          select: { id: true },
        });

        // Create EventRole records for hosted events
        if (hostedEvents.length > 0) {
          await tx.eventRole.createMany({
            data: hostedEvents.map((event) => ({
              userId: user.id,
              eventId: event.id,
              role: 'HOST' as const,
            })),
            skipDuplicates: true,
          });
        }

        // Create EventRole records for co-hosted events
        if (coHostedEvents.length > 0) {
          await tx.eventRole.createMany({
            data: coHostedEvents.map((event) => ({
              userId: user.id,
              eventId: event.id,
              role: 'COHOST' as const,
            })),
            skipDuplicates: true,
          });
        }
      });
    }

    // Create Session (30-day expiry)
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        expiresAt,
      },
    });

    // Set httpOnly cookie
    cookies().set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return Response.json({
      success: true,
      redirectUrl: returnUrl || '/plan/events',
    });
  } catch (error) {
    console.error('Magic link verification error:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return Response.json({ success: false, error: 'invalid' as ErrorType }, { status: 500 });
  }
}
