// src/app/api/auth/verify/route.ts
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';
import { safeReturnPath } from '@/lib/safe-return-path';
import type { User } from '@prisma/client';

type ErrorType = 'invalid' | 'expired' | 'used' | 'claimed';

/**
 * [[GTC-369]] — a claim for a person who is already linked to someone else. Thrown inside the
 * transaction so that nothing it wrote (a new User) survives; the link itself was spent before.
 */
class AlreadyClaimed extends Error {}

export async function POST(req: Request) {
  try {
    // [[GTC-369]] ruling point 1: the person is never read from the request. A body could name
    // anyone; only the link's own row, written by the claim route, says whom it claims.
    const { token, returnUrl } = await req.json();

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

    // [[GTC-369]] F1, ruling Q6: the checks above and this write are two statements, so two
    // requests at the same moment could both pass them. Only the one whose conditional update
    // finds the link still unused goes on.
    const spent = await prisma.magicLink.updateMany({
      where: { id: magicLink.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (spent.count !== 1) {
      return Response.json({ success: false, error: 'used' as ErrorType });
    }

    let user: User;
    try {
      user = await prisma.$transaction(async (tx) => {
        // Find or create User by email
        const found = await tx.user.findUnique({ where: { email: magicLink.email } });
        const signedIn = found ?? (await tx.user.create({ data: { email: magicLink.email } }));

        // A claim link (Ticket 1.6 + 1.7): link the Person to the User and create EventRoles.
        const personId = magicLink.personId;
        if (personId) {
          // [[GTC-369]] ruling point 2: never move a person who is already linked to someone
          // else. Conditional, so a claim racing another cannot take the person from it.
          const linked = await tx.person.updateMany({
            where: { id: personId, OR: [{ userId: null }, { userId: signedIn.id }] },
            data: { userId: signedIn.id },
          });
          if (linked.count !== 1) {
            throw new AlreadyClaimed();
          }

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
                userId: signedIn.id,
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
                userId: signedIn.id,
                eventId: event.id,
                role: 'COHOST' as const,
              })),
              skipDuplicates: true,
            });
          }
        }

        return signedIn;
      });
    } catch (error) {
      if (error instanceof AlreadyClaimed) {
        // [[GTC-369]] ruling Q3: refuse the sign-in. The link stays spent; no session is made.
        return Response.json({ success: false, error: 'claimed' as ErrorType });
      }
      throw error;
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
    (await cookies()).set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60, // 30 days
      path: '/',
    });

    return Response.json({
      success: true,
      // [[GTC-369]] ruling point 3: only Gather's own pages, decided here and not by the link.
      redirectUrl: safeReturnPath(returnUrl),
    });
  } catch (error) {
    console.error('Magic link verification error:', error);
    console.error('Error details:', error instanceof Error ? error.message : 'Unknown error');
    console.error('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return Response.json({ success: false, error: 'invalid' as ErrorType }, { status: 500 });
  }
}
