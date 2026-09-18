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

    // Send custom email for claim flow.
    //
    // GTC-265: the Resend SDK RETURNS its error rather than throwing it, so an
    // `await` alone reported a rejected key as a successful send. This is the
    // fourth of the four call sites — the other three are the senders in
    // `src/lib/email.ts`, which now share the rule recorded in that file's
    // header: record inside, decide outside.
    //
    // ⚠ THE RESPONSE IS DELIBERATELY UNCHANGED. This route answers
    // `{ ok: true }` on every path — missing person, already-claimed person,
    // rate limit — so that the response cannot be used to learn which
    // addresses exist. A failed send must not become the one case that answers
    // differently. The gap GTC-265 names here was never the status code; it was
    // that nobody, not even the server, knew the send had failed. So the
    // failure is RECORDED and the caller is told nothing.
    const resend = getResendClient();
    const sent = await resend.emails.send({
      from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
      to: email,
      subject: 'Claim your Gather host account',
      text: `Click here to claim your Gather host account and continue managing your events:\n\n${link}\n\nThis link expires in 15 minutes.`,
    });

    if (sent.error) {
      console.error(`[Email] claim link to ${email} REJECTED by Resend:`, {
        name: sent.error.name,
        statusCode: sent.error.statusCode,
        message: sent.error.message,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Claim flow error:', error);
    // Generic response to prevent enumeration
    return Response.json({ ok: true });
  }
}
