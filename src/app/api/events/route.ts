// GET /api/events - List events where user has a role
// POST /api/events - Create new event (requires payment)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { stripe } from '@/lib/stripe';
import { getResendClient } from '@/lib/email';

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
    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, startDate, endDate, stripeSessionId } = body;

    // Validate required fields
    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: name, startDate, endDate' },
        { status: 400 }
      );
    }

    // Require payment session
    if (!stripeSessionId) {
      return NextResponse.json(
        { error: 'Payment required. Missing stripeSessionId.' },
        { status: 402 }
      );
    }

    // Verify Stripe session
    let session;
    try {
      session = await stripe.checkout.sessions.retrieve(stripeSessionId);
    } catch (err) {
      console.error('[Event Creation] Invalid Stripe session:', stripeSessionId, err);
      return NextResponse.json({ error: 'Invalid payment session' }, { status: 400 });
    }

    // Verify payment is completed
    if (session.payment_status !== 'paid') {
      console.error('[Event Creation] Payment not completed:', session.payment_status);
      return NextResponse.json({ error: 'Payment not completed' }, { status: 402 });
    }

    // Verify session belongs to authenticated user
    if (session.metadata?.userId !== user.id) {
      console.error('[Event Creation] Payment session user mismatch');
      return NextResponse.json(
        { error: 'Payment session does not belong to authenticated user' },
        { status: 403 }
      );
    }

    // Check session hasn't been used already
    const existingEvent = await prisma.event.findFirst({
      where: { stripePaymentIntentId: session.payment_intent as string },
    });

    if (existingEvent) {
      console.error('[Event Creation] Payment already used for event:', existingEvent.id);
      return NextResponse.json(
        { error: 'Payment already used for another event' },
        { status: 409 }
      );
    }

    // Build event data with all plan-phase fields
    const eventData: any = {
      name,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'DRAFT',
      structureMode: 'EDITABLE',
      isLegacy: false, // New events are not legacy

      // Payment tracking
      stripePaymentIntentId: session.payment_intent as string,
      paidAt: new Date(),
      amountPaid: session.amount_total,

      // Core optional fields
      guestCount: body.guestCount || null,

      // Occasion
      occasionType: body.occasionType || null,
      occasionDescription: body.occasionDescription || null,

      // Guest parameters
      guestCountConfidence: body.guestCountConfidence || 'MEDIUM',
      guestCountMin: body.guestCountMin || null,
      guestCountMax: body.guestCountMax || null,

      // Dietary
      dietaryStatus: body.dietaryStatus || 'UNSPECIFIED',
      dietaryVegetarian: body.dietaryVegetarian || 0,
      dietaryVegan: body.dietaryVegan || 0,
      dietaryGlutenFree: body.dietaryGlutenFree || 0,
      dietaryDairyFree: body.dietaryDairyFree || 0,
      dietaryAllergies: body.dietaryAllergies || null,

      // Venue
      venueName: body.venueName || null,
      venueType: body.venueType || null,
      venueKitchenAccess: body.venueKitchenAccess || null,
      venueOvenCount: body.venueOvenCount || 0,
      venueStoretopBurners: body.venueStoretopBurners || null,
      venueBbqAvailable: body.venueBbqAvailable !== undefined ? body.venueBbqAvailable : null,
      venueTimingStart: body.venueTimingStart || null,
      venueTimingEnd: body.venueTimingEnd || null,
      venueNotes: body.venueNotes || null,
    };

    // Create event and EventRole in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Find or create a Person record for this user
      let person = await tx.person.findFirst({
        where: { userId: user.id },
      });

      if (!person) {
        // Create a new Person record linked to the user
        person = await tx.person.create({
          data: {
            name: user.email.split('@')[0], // Use email prefix as default name
            email: user.email,
            userId: user.id,
          },
        });
      }

      // Create event with the person as host
      const event = await tx.event.create({
        data: {
          ...eventData,
          hostId: person.id, // Set the required hostId field
        },
      });

      // Create EventRole for the user as HOST
      await tx.eventRole.create({
        data: {
          userId: user.id,
          eventId: event.id,
          role: 'HOST',
        },
      });

      return event;
    });

    console.log('[Event Creation] Event created with payment:', result.id);

    // Send receipt email
    try {
      const resend = getResendClient();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
      const amountFormatted = ((result.amountPaid || 1200) / 100).toFixed(2);

      await resend.emails.send({
        from: process.env.EMAIL_FROM || 'Gather <noreply@gather.app>',
        to: user.email,
        subject: `Receipt: ${result.name} — Gather`,
        text: `Thanks for using Gather!

Event: ${result.name}
Date: ${new Date(result.startDate).toLocaleDateString()}
Amount: $${amountFormatted} NZD

Manage your event: ${baseUrl}/plan/${result.id}

Questions? Reply to this email.
`,
      });

      console.log('[Event Creation] Receipt email sent to:', user.email);
    } catch (emailError) {
      // Don't fail event creation if email fails
      console.error('[Event Creation] Failed to send receipt email:', emailError);
    }

    return NextResponse.json({
      success: true,
      event: result,
    });
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
