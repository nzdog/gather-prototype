// src/app/api/auth/verify/route.ts
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

type ErrorType = 'invalid' | 'expired' | 'used';

export async function POST(req: Request) {
  try {
    const { token, returnUrl } = await req.json();

    if (!token) {
      return Response.json(
        { success: false, error: 'invalid' as ErrorType },
        { status: 400 }
      );
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
    return Response.json(
      { success: false, error: 'invalid' as ErrorType },
      { status: 500 }
    );
  }
}
