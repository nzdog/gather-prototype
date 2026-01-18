// GET /api/events/[id] - Get event details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { canEditEvent } from '@/lib/entitlements';

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

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if event exists
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if user can edit this event
    const allowed = await canEditEvent(user.id, eventId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Cannot edit event',
          reason: 'SUBSCRIPTION_INACTIVE',
          message: 'Your subscription is inactive. Please update your payment method or upgrade.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();

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

// DELETE /api/events/[id] - Permanently delete an event
export async function DELETE(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // Get authenticated user
    const user = await getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check if event exists
    const existingEvent = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!existingEvent) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Check if user can edit (delete) this event
    const allowed = await canEditEvent(user.id, eventId);
    if (!allowed) {
      return NextResponse.json(
        {
          error: 'Cannot delete event',
          reason: 'SUBSCRIPTION_INACTIVE',
          message: 'Your subscription is inactive. Please update your payment method or upgrade.',
        },
        { status: 403 }
      );
    }

    // Delete event and all related data in a transaction
    await prisma.$transaction(async (tx) => {
      // Delete assignments (linked through items -> teams -> event)
      await tx.assignment.deleteMany({
        where: {
          item: {
            team: {
              eventId,
            },
          },
        },
      });

      // Delete items (linked through teams -> event)
      await tx.item.deleteMany({
        where: {
          team: {
            eventId,
          },
        },
      });

      // Delete teams
      await tx.team.deleteMany({
        where: { eventId },
      });

      // Delete days
      await tx.day.deleteMany({
        where: { eventId },
      });

      // Delete person-event relationships
      await tx.personEvent.deleteMany({
        where: { eventId },
      });

      // Delete access tokens
      await tx.accessToken.deleteMany({
        where: { eventId },
      });

      // Delete conflicts
      await tx.conflict.deleteMany({
        where: { eventId },
      });

      // Delete plan revisions
      await tx.planRevision.deleteMany({
        where: { eventId },
      });

      // Delete plan snapshots
      await tx.planSnapshot.deleteMany({
        where: { eventId },
      });

      // Delete audit entries
      await tx.auditEntry.deleteMany({
        where: { eventId },
      });

      // Finally, delete the event itself
      await tx.event.delete({
        where: { id: eventId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting event:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete event',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
