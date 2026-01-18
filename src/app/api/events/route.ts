// GET /api/events - List events where user has a role
// POST /api/events - Create new event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { canCreateEvent } from '@/lib/entitlements';

export async function GET(request: NextRequest) {
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
            userId: user.id
          }
        }
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
          select: { role: true }
        }
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

    // Check if user can create a new event
    const allowed = await canCreateEvent(user.id);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Event limit reached',
          reason: 'FREE_LIMIT',
          upgradeUrl: '/billing/upgrade',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { name, startDate, endDate } = body;

    // Validate required fields
    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: name, startDate, endDate' },
        { status: 400 }
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
      // Create event
      const event = await tx.event.create({
        data: eventData,
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
