import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cookies } from 'next/headers';
import { randomBytes } from 'crypto';

const DEMO_EVENT_NAME = 'Henderson Family Christmas 2025';
const DEMO_HOST_EMAIL = 'sarah.henderson@demo.gather';

/**
 * POST /api/demo/session
 *
 * Creates an authenticated session for the demo host (Sarah Henderson)
 * so the planning dashboard at /plan/[eventId] is accessible.
 * SECURITY: DEV ONLY — disabled in production.
 */
export async function POST() {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }

  try {
    // Find demo event
    const event = await prisma.event.findFirst({
      where: { name: DEMO_EVENT_NAME },
      select: { id: true, hostId: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Demo event not found' }, { status: 404 });
    }

    // Find Sarah Henderson (the host)
    const person = await prisma.person.findUnique({
      where: { id: event.hostId },
    });

    if (!person) {
      return NextResponse.json({ error: 'Demo host not found' }, { status: 404 });
    }

    // Find or create a User for Sarah
    let user = person.userId
      ? await prisma.user.findUnique({ where: { id: person.userId } })
      : null;

    if (!user) {
      user = await prisma.user.upsert({
        where: { email: DEMO_HOST_EMAIL },
        update: {},
        create: { email: DEMO_HOST_EMAIL },
      });

      // Link Person → User if not already linked
      if (!person.userId) {
        await prisma.person.update({
          where: { id: person.id },
          data: { userId: user.id },
        });
      }
    }

    // Ensure EventRole (HOST) exists
    await prisma.eventRole.upsert({
      where: { userId_eventId: { userId: user.id, eventId: event.id } },
      update: {},
      create: { userId: user.id, eventId: event.id, role: 'HOST' },
    });

    // Create Session (30-day expiry) — same pattern as verify/route.ts
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: { userId: user.id, token: sessionToken, expiresAt },
    });

    cookies().set('session', sessionToken, {
      httpOnly: true,
      secure: (process.env.NODE_ENV as string) === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60,
      path: '/',
    });

    return NextResponse.json({ success: true, eventId: event.id });
  } catch (error) {
    console.error('[DemoSession] Failed:', error);
    return NextResponse.json(
      {
        error: 'Failed to create demo session',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
