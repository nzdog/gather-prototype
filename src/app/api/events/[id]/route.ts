// GET /api/events/[id] - Get event details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        coHost: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({
      event,
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

// PATCH /api/events/[id] - Update event details
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json();

    // Check if event exists
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Update event with provided fields
    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        name: body.name,
        startDate: body.startDate ? new Date(body.startDate) : undefined,
        endDate: body.endDate ? new Date(body.endDate) : undefined,
        occasionType: body.occasionType || null,
        occasionDescription: body.occasionDescription || null,
        guestCount: body.guestCount,
        guestCountConfidence: body.guestCountConfidence,
        guestCountMin: body.guestCountMin,
        guestCountMax: body.guestCountMax,
        dietaryStatus: body.dietaryStatus,
        dietaryVegetarian: body.dietaryVegetarian,
        dietaryVegan: body.dietaryVegan,
        dietaryGlutenFree: body.dietaryGlutenFree,
        dietaryDairyFree: body.dietaryDairyFree,
        dietaryAllergies: body.dietaryAllergies || null,
        venueName: body.venueName || null,
        venueType: body.venueType || null,
        venueKitchenAccess: body.venueKitchenAccess || null,
        venueOvenCount: body.venueOvenCount,
        venueStoretopBurners: body.venueStoretopBurners,
        venueBbqAvailable: body.venueBbqAvailable,
        venueTimingStart: body.venueTimingStart || null,
        venueTimingEnd: body.venueTimingEnd || null,
        venueNotes: body.venueNotes || null,
      },
      include: {
        host: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        coHost: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({ event: updatedEvent });
  } catch (error) {
    console.error('Error updating event:', error);
    return NextResponse.json(
      {
        error: 'Failed to update event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
