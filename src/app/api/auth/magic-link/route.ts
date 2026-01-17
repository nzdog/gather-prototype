// src/app/api/auth/magic-link/route.ts
import { prisma } from '@/lib/prisma';
import { sendMagicLinkEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const { email } = await req.json();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email || !emailRegex.test(email)) {
      return Response.json(
        { error: 'Invalid email address' },
        { status: 400 }
      );
    }

    // Rate limit check: max 3 requests per email per 15 minutes
    const recentCount = await prisma.magicLink.count({
      where: {
        email,
        createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) },
      },
    });

    if (recentCount >= 3) {
      // Silent fail - return success to prevent enumeration
      return Response.json({ ok: true });
    }

    // Generate secure random token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create MagicLink record
    await prisma.magicLink.create({
      data: { email, token, expiresAt },
    });

    // Send magic link email
    await sendMagicLinkEmail(email, token);

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Magic link send error:', error);
    // Return generic success to prevent enumeration
    return Response.json({ ok: true });
  }
}
