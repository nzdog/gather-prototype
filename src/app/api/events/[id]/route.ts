// GET /api/events/[id] - Get event details
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth/session';
import { canEditEvent } from '@/lib/entitlements';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, fieldChanges, onMaterialChange, MATERIAL_EVENT_FIELDS } from '@/lib/ledger';
import { isSent } from '@/lib/lifecycle';

// Everything the host can change about the event itself. The material subset
// (date/venue) additionally fires the F1 re-ask; the rest is versioned only.
const TRACKED_EVENT_FIELDS = [
  ...MATERIAL_EVENT_FIELDS,
  'name',
  'occasionType',
  'occasionDescription',
  'guestCount',
  'dietaryStatus',
  'dietaryAllergies',
] as const;

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
        // V2 signal: events that entered the Moment flow have an EventSetup row.
        // The dashboard uses its presence to suppress V1-pipeline actions (GTC-148).
        setup: {
          select: {
            id: true,
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

    // GTC-196 (A3b): THE T5 SITE. This is the only route that writes startDate,
    // endDate or venue*, and until now it had no status gating AND no audit logging
    // at all — a post-send date change left no trace whatsoever.
    //
    // A change here is material: Hinge §2 names date/venue as touching someone, and
    // Moment 4 §8.5 has the system re-asking everyone against the correction. It is
    // also the recovery path for a wrong-date send, since release is absolute and
    // there is no unsend.
    const actor = await ledgerActorForUser(user, 'HOST');
    const beforeEvent = existingEvent as unknown as Record<string, unknown>;

    const updateData = {
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
    };

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: updateData,
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
        // V2 signal: events that entered the Moment flow have an EventSetup row.
        // The dashboard uses its presence to suppress V1-pipeline actions (GTC-148).
        setup: {
          select: {
            id: true,
          },
        },
      },
    });

    // One entry per changed field, grouped as one step. `fieldChanges` drops
    // unchanged fields — a submission is not a change, and the ledger must not be
    // asked to hold noise (Hinge §2).
    const changes = fieldChanges(
      { action: 'EDIT_EVENT', targetType: 'Event', targetId: eventId },
      beforeEvent,
      updateData as Record<string, unknown>,
      TRACKED_EVENT_FIELDS
    );

    if (changes.length > 0) {
      const { changeSetId } = await prisma.$transaction((tx) =>
        recordChange(tx, { eventId, actor, reason: body.reason ?? null, changes })
      );

      // T5 fires the re-ask. No-op until GTC-183 (F1) — and until then a post-send
      // date change is RECORDED but nobody is re-asked, which is why F1 is a
      // correctness dependency of Epic A and not a later feature (plan §7.3).
      const materialFields = changes
        .map((c) => c.field!)
        .filter((f) => MATERIAL_EVENT_FIELDS.includes(f as never));
      if (materialFields.length > 0 && isSent(existingEvent)) {
        await onMaterialChange(eventId, changeSetId, materialFields);
      }
    }

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
