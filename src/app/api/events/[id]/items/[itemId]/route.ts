// PATCH /api/events/[id]/items/[itemId] - Update item
// DELETE /api/events/[id]/items/[itemId] - Delete item
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, fieldChanges, ASK_FIELDS } from '@/lib/ledger';

// GTC-196 (A3b): this route absorbs frozen-edit's `edit_item` AND `toggle_critical`.
//
// The two are recorded differently, and that asymmetry is the ruling:
//   - An ASK_FIELDS change on an ANSWERED item is T4 — it moves what someone claimed
//     against, so it carries a why.
//   - A criticality toggle is NEVER interrogated. Moment 4 §8.3: "criticality does
//     exactly two things (the badge, and the assistant's message at red) and touches
//     nothing else. It is entirely a host-facing signal, never a guest-facing
//     pressure." frozen-edit demanded a reason for it; that was the contradiction the
//     discovery report flagged.
//
// Every changed field gets its own entry; unchanged fields get nothing. A submission
// is not a change.
const TRACKED_ITEM_FIELDS = [
  ...ASK_FIELDS,
  'description',
  'critical',
  'dietaryTags',
  'dayId',
  'serveTime',
  'displayOrder',
] as const;

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // SECURITY: Require HOST or COORDINATOR role to update items
    const auth = await requireEventRole(eventId, ['HOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();

    // Fetch the item BEFORE the write — the ledger's `before` must be the real prior
    // state, and the why-scope rule needs to know whether anyone has answered.
    const currentItem = await prisma.item.findUnique({
      where: { id: itemId },
      include: { assignment: { select: { response: true } } },
    });

    if (!currentItem) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // Build update data
    const updateData: any = {};

    // Quantity fields
    if (body.quantityAmount !== undefined) updateData.quantityAmount = body.quantityAmount;
    if (body.quantityUnit !== undefined) updateData.quantityUnit = body.quantityUnit;
    if (body.quantityUnitCustom !== undefined)
      updateData.quantityUnitCustom = body.quantityUnitCustom;
    if (body.quantityState !== undefined) updateData.quantityState = body.quantityState;
    if (body.quantityText !== undefined) updateData.quantityText = body.quantityText;

    // Placeholder acknowledgement
    if (body.placeholderAcknowledged !== undefined) {
      updateData.placeholderAcknowledged = body.placeholderAcknowledged;
    }

    // Deferred to
    if (body.quantityDeferredTo !== undefined) {
      updateData.quantityDeferredTo = body.quantityDeferredTo;
    }

    // Other fields
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.critical !== undefined) updateData.critical = body.critical;

    // Display order — pure reorder, not substantive (does not flip GENERATED → HOST_EDITED).
    if (body.displayOrder !== undefined) updateData.displayOrder = body.displayOrder;

    // Dietary tags
    if (body.dietaryTags !== undefined) updateData.dietaryTags = body.dietaryTags;

    // Timing fields
    if (body.dayId !== undefined) updateData.dayId = body.dayId;
    if (body.serveTime !== undefined) updateData.serveTime = body.serveTime;

    // Drop-off fields
    if (body.dropOffLocation !== undefined) updateData.dropOffLocation = body.dropOffLocation;
    if (body.dropOffNote !== undefined) updateData.dropOffNote = body.dropOffNote;

    // If this is a GENERATED item and substantive fields are being edited, mark as HOST_EDITED
    // Substantive fields: name, description, quantity*, critical, dietaryTags, timing, drop-off
    // Non-substantive: placeholderAcknowledged, quantityDeferredTo (these are acknowledgements, not edits)
    const substantiveFieldsBeingEdited =
      body.name !== undefined ||
      body.description !== undefined ||
      body.quantityAmount !== undefined ||
      body.quantityUnit !== undefined ||
      body.quantityUnitCustom !== undefined ||
      body.quantityState !== undefined ||
      body.quantityText !== undefined ||
      body.critical !== undefined ||
      body.dietaryTags !== undefined ||
      body.dayId !== undefined ||
      body.serveTime !== undefined ||
      body.dropOffLocation !== undefined ||
      body.dropOffNote !== undefined;

    if (currentItem.source === 'GENERATED' && substantiveFieldsBeingEdited) {
      updateData.source = 'HOST_EDITED';
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);

    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.item.update({
        where: { id: itemId },
        data: updateData,
      });

      const changes = fieldChanges(
        { action: 'EDIT_ITEM', targetType: 'Item', targetId: itemId },
        currentItem as unknown as Record<string, unknown>,
        updateData,
        TRACKED_ITEM_FIELDS
      ).map((c) => ({
        ...c,
        // TOGGLE_CRITICAL is versioned but never interrogated (§8.3).
        action: c.field === 'critical' ? ('TOGGLE_CRITICAL' as const) : c.action,
        context: { assignmentResponse: currentItem.assignment?.response ?? null },
      }));

      if (changes.length > 0) {
        await recordChange(tx, {
          eventId,
          actor,
          reason: body.reason ?? null,
          changes,
        });
      }

      return updated;
    });

    return NextResponse.json({
      success: true,
      item,
    });
  } catch (error) {
    console.error('Error updating item:', error);
    return NextResponse.json(
      {
        error: 'Failed to update item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // SECURITY: Require HOST or COORDINATOR role to delete items
    const auth = await requireEventRole(eventId, ['HOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const delBody = await request.json().catch(() => ({}) as { reason?: string });

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { team: true, assignment: { select: { response: true, personId: true } } },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.team.eventId !== eventId) {
      return NextResponse.json({ error: 'Item does not belong to this event' }, { status: 400 });
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);

    await prisma.$transaction(async (tx) => {
      // Delete item (cascade will handle assignment if any)
      await tx.item.delete({ where: { id: itemId } });

      // T3 — deleting an item someone holds takes their ask away, at any response
      // state. Deleting an unassigned item touches nobody.
      await recordChange(tx, {
        eventId,
        actor,
        reason: delBody.reason ?? null,
        changes: [
          {
            action: 'DELETE_ITEM',
            targetType: 'Item',
            targetId: itemId,
            before: { name: item.name, quantity: item.quantity, teamId: item.teamId },
            after: null,
            context: { assignmentResponse: item.assignment?.response ?? null },
          },
        ],
      });
    });

    return NextResponse.json({ success: true, message: 'Item deleted' });
  } catch (error) {
    console.error('Error deleting item:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete item',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
