// src/app/api/auth/claim/route.ts
import { prisma } from '@/lib/prisma';
import { getResendClient } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const { email, personId, returnToken } = await req.json();

    if (!email || !personId || !returnToken) {
      return Response.json({ ok: false, error: 'Missing required fields' }, { status: 400 });
    }

    // Verify person exists and has no userId yet
    const person = await prisma.person.findUnique({
      where: { id: personId },
    });

    if (!person) {
      // Return success to prevent enumeration
      return Response.json({ ok: true });
    }

    if (person.userId) {
      // Return success to prevent enumeration (don't reveal account is already claimed)
      return Response.json({ ok: true });
    }

    // Rate limit check: max 3 requests per email per 15 minutes
    const recentCount = await prisma.magicLink.count({
      where: {
        email,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    if (recentCount >= 3) {
      // Silent fail - still return success to prevent enumeration
      return Response.json({ ok: true });
    }

    // Create magic link token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    await prisma.magicLink.create({
      data: {
        email,
        token,
        expiresAt,
      },
    });

    // Send email with return URL that includes personId and returnToken
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const returnUrl = `/h/${returnToken}?claimed=true`;
    const link = `${baseUrl}/auth/verify?token=${token}&personId=${personId}&returnUrl=${encodeURIComponent(returnUrl)}`;

    // Send custom email for claim flow
    const resend = getResendClient();
    await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to: email,
      subject: 'Claim your Gather host account',
      text: `Click here to claim your Gather host account and continue managing your events:\n\n${link}\n\nThis link expires in 15 minutes.`,
    });

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Claim flow error:', error);
    // Generic response to prevent enumeration
    return Response.json({ ok: true });
  }
}
