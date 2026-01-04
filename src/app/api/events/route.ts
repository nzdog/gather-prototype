// POST /api/events - Create new event
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, startDate, endDate } = body;

    // Validate required fields
    if (!name || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'Missing required fields: name, startDate, endDate' },
        { status: 400 }
      );
    }

    // For prototype: Get or create a default host
    // In production, this would come from authenticated session
    let host = await prisma.person.findFirst({
      where: {
        name: 'Demo Host',
      },
    });

    if (!host) {
      // Create a default demo host if one doesn't exist
      host = await prisma.person.create({
        data: {
          name: 'Demo Host',
          email: 'demo@gather.app',
        },
      });
    }

    // Build event data with all plan-phase fields
    const eventData: any = {
      name,
      hostId: host.id,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      status: 'DRAFT',
      structureMode: 'EDITABLE',

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

    // Create event
    const event = await prisma.event.create({
      data: eventData,
    });

    return NextResponse.json({
      success: true,
      event,
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
