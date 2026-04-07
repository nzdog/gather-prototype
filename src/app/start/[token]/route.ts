// GET /start/[token]
// Resolves a WrapUpLink token and redirects to /plan/new with pre-populated params
// Public route — no auth required (the token IS the auth)

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

  try {
    const link = await prisma.wrapUpLink.findUnique({
      where: { token },
    });

    if (!link) {
      return NextResponse.redirect(`${baseUrl}/plan/new`);
    }

    // Check expiry — redirect with expired flag per operator instruction
    if (link.expiresAt < new Date()) {
      return NextResponse.redirect(`${baseUrl}/plan/new?expired=true`);
    }

    // Build pre-populated redirect URL
    const params = new URLSearchParams();
    if (link.guestName) params.set('name', link.guestName);
    if (link.guestEmail) params.set('email', link.guestEmail);
    if (link.guestPhone) params.set('phone', link.guestPhone);
    params.set('ref', link.token);

    return NextResponse.redirect(`${baseUrl}/plan/new?${params.toString()}`);
  } catch (error) {
    console.error('[Start] Error resolving wrap-up link:', error);
    return NextResponse.redirect(`${baseUrl}/plan/new`);
  }
}
