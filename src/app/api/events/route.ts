// GET /api/events - List events where user has a role
// POST /api/events - Create new event (requires payment, no auth needed)
import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { stripe } from '@/lib/stripe';
import { sendWelcomeEmail } from '@/lib/email';

export async function GET(_request: NextRequest) {
  try {
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch events where user has any role (HOST, COHOST, COORDINATOR)
    const events = await prisma.event.findMany({
      where: {
        eventRoles: {
          some: {
            userId: user.id,
          },
        },
      },
      include: {
        _count: {
          select: {
            teams: true,
            days: true,
          },
        },
        eventRoles: {
          where: { userId: user.id },
          select: { role: true },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch events',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { stripeSessionId } = body;

    // Require payment session
    if (!stripeSessionId) {
      return NextResponse.json(
        { error: 'Payment required. Missing stripeSessionId.' },
        { status: 402 }
      );
    }

    // Verify Stripe session
    let stripeSession;
    try {
      stripeSession = await stripe.checkout.sessions.retrieve(stripeSessionId);
    } catch (err) {
      console.error('[Event Creation] Invalid Stripe session:', stripeSessionId, err);
      return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
    }

    // Verify payment is completed
    if (stripeSession.payment_status !== 'paid') {
      console.error('[Event Creation] Payment not completed:', stripeSession.payment_status);
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
    }

    // Get email from Stripe (collected during checkout)
    const email = stripeSession.customer_details?.email;
    if (!email) {
      return NextResponse.json({ error: 'No email from Stripe' }, { status: 400 });
    }

    // Get event data from Stripe metadata
    const { eventName, startDate, endDate } = stripeSession.metadata || {};
    if (!eventName || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing event data from payment session' },
        { status: 400 }
      );
    }

    // Check session hasn't been used already
    const existingEvent = await prisma.event.findFirst({
      where: { stripePaymentIntentId: stripeSession.payment_intent as string },
    });

    if (existingEvent) {
      console.error('[Event Creation] Payment already used for event:', existingEvent.id);
      return NextResponse.json(
        { error: 'Payment already used for another event' },
        { status: 409 }
      );
    }

    // Build event data
    const eventData = {
      name: eventName,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'DRAFT' as const,
      structureMode: 'EDITABLE' as const,
      isLegacy: false,
      stripePaymentIntentId: stripeSession.payment_intent as string,
      paidAt: new Date(),
      amountPaid: stripeSession.amount_total,
      guestCountConfidence: 'MEDIUM' as const,
      dietaryStatus: 'UNSPECIFIED' as const,
      dietaryVegetarian: 0,
      dietaryVegan: 0,
      dietaryGlutenFree: 0,
      dietaryDairyFree: 0,
      venueOvenCount: 0,
    };

    // Create user, person, event, and event role in a transaction
    const { event, user } = await prisma.$transaction(async (tx) => {
      // Find or create User by email
      let user = await tx.user.findUnique({ where: { email } });
      if (!user) {
        user = await tx.user.create({ data: { email } });
      }

      // Find or create Person linked to User
      let person = await tx.person.findFirst({ where: { userId: user.id } });
      if (!person) {
        person = await tx.person.create({
          data: {
            name: email.split('@')[0],
            email,
            userId: user.id,
          },
        });
      }

      // Create event with person as host
      const event = await tx.event.create({
        data: { ...eventData, hostId: person.id },
      });

      // Create EventRole for user as HOST
      await tx.eventRole.create({
        data: { userId: user.id, eventId: event.id, role: 'HOST' },
      });

      return { event, user };
    });

    console.log('[Event Creation] Event created with payment:', event.id);

    // Create session to log the user in automatically
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await prisma.session.create({
      data: { token: sessionToken, userId: user.id, expiresAt },
    });

    // Build response with session cookie
    const response = NextResponse.json({ success: true, event });
    response.cookies.set('session', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: expiresAt,
      path: '/',
    });

    // Send welcome email with magic link for future access (fire and forget)
    sendWelcomeEmail(email, event.name, event.id).catch((emailError) => {
      console.error('[Event Creation] Failed to send welcome email:', emailError);
    });

    return response;
  } catch (error) {
    console.error('Error creating event:', error);
    return NextResponse.json(
      {
        error: 'Failed to create event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
