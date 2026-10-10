// PATCH /api/events/[id]/items/[itemId] - Update item
// DELETE /api/events/[id]/items/[itemId] - Delete item
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, fieldChanges, ASK_FIELDS } from '@/lib/ledger';
import { itemNameForStorage } from '@/lib/items/name';
import { KIND_ERROR, kindFields, readSubmittedKind } from '@/lib/items/row-kind';

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
  // GTC-302: brought or done. Versioned — but NOT yet an ask field, which is a defect: the kind
  // picks the ask's verb, so changing it on an answered row changes what was asked. [[GTC-304]].
  'kind',
  'description',
  'notes',
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
    // GTC-302: a submitted name is tidied (`itemNameForStorage`), and a blank one refused rather
    // than stored. A request that sends no name leaves the stored one exactly as it is.
    if (body.name !== undefined) {
      const name = itemNameForStorage(body.name);
      if (!name) {
        return NextResponse.json({ error: 'name cannot be blank' }, { status: 400 });
      }
      updateData.name = name;
    }
    if (body.description !== undefined) updateData.description = body.description;
    // GTC-238: notes was the one edit-form field the route never read — a 200 that
    // persisted nothing. A note is Kate's manual work (ruling Q1), so it is also
    // substantive and tracked below.
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.critical !== undefined) updateData.critical = body.critical;

    // GTC-302: brought or done — a row added as a dish can be told it is a job, and back. Becoming
    // a job drops to quantityState NA, the shape a generated job has, unless this same request sets
    // a quantity state itself.
    //
    // ⚠ DEFECT [[GTC-303]]: nothing else about the row moves with its kind. A job assigned across
    // teams and made a dish keeps a holder `mayHoldRow` would refuse, and keeps quantityState NA; a
    // dish made a job keeps its quantity. The kind change can leave a row no route would create.
    const submittedKind = readSubmittedKind(body.kind);
    if (!submittedKind.ok) {
      return NextResponse.json({ error: KIND_ERROR }, { status: 400 });
    }
    if (submittedKind.kind !== undefined) {
      updateData.kind = submittedKind.kind;
      if (
        submittedKind.kind === 'TASK' &&
        currentItem.kind !== 'TASK' &&
        body.quantityState === undefined
      ) {
        Object.assign(updateData, kindFields('TASK'));
      }
    }

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

    // GTC-175 (D2): the per-item decide-by override — Hinge §8's "Kate able to override
    // per item". Hours before needed-by; null clears it back to the event default.
    // Deliberately NOT in `substantiveFieldsBeingEdited` below: this changes WHEN the
    // system asks, not WHAT it asks, so it must not flip a GENERATED item to HOST_EDITED
    // and must not read as an ask-change to the ledger.
    if (body.decideByOffsetHours !== undefined) {
      const raw = body.decideByOffsetHours;
      if (raw === null) {
        updateData.decideByOffsetHours = null;
      } else if (Number.isInteger(raw) && raw >= 0) {
        updateData.decideByOffsetHours = raw;
      } else {
        return NextResponse.json(
          { error: 'decideByOffsetHours must be a non-negative integer number of hours, or null' },
          { status: 400 }
        );
      }
    }

    // If this is a GENERATED item and substantive fields are being edited, mark as HOST_EDITED
    // Substantive fields: name, kind, description, quantity*, critical, dietaryTags, timing, drop-off
    // Non-substantive: placeholderAcknowledged, quantityDeferredTo (these are acknowledgements, not edits)
    //
    // GTC-302: kind is substantive for a reason beyond provenance. Regeneration disposes of GENERATED
    // rows BY KIND (`disposableItemWhere` in src/lib/ai/plan-write.ts), so a generated row re-kinded
    // without this flip would be deleted by the next regenerate of the kind it no longer is.
    const substantiveFieldsBeingEdited =
      body.name !== undefined ||
      body.kind !== undefined ||
      body.description !== undefined ||
      body.quantityAmount !== undefined ||
      body.quantityUnit !== undefined ||
      body.quantityUnitCustom !== undefined ||
      body.quantityState !== undefined ||
      body.quantityText !== undefined ||
      body.critical !== undefined ||
      body.notes !== undefined ||
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
