import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { recordChange, actorFromToken, fieldChanges, ASK_FIELDS } from '@/lib/ledger';

const TRACKED = [...ASK_FIELDS, 'description', 'critical', 'dietaryTags'] as const;

/**
 * PATCH /api/c/[token]/items/[itemId]
 *
 * Edits an item.
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId before mutation
 * - Never accept teamId from client (ownership already verified)
 */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify item ownership. The assignment comes along because the why-scope rule
  // turns on whether anyone has ANSWERED (T4) — an ASK_FIELDS edit on a PENDING item
  // is the typo case and is never interrogated.
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { assignment: { select: { response: true } } },
  });

  if (!item || item.teamId !== resolvedContext.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const body = await request.json();

  // Check if substantive fields are being edited
  const substantiveFieldsBeingEdited =
    body.name !== undefined ||
    body.description !== undefined ||
    body.quantity !== undefined ||
    body.critical !== undefined ||
    body.notes !== undefined ||
    body.glutenFree !== undefined ||
    body.dairyFree !== undefined ||
    body.vegetarian !== undefined ||
    body.dayId !== undefined ||
    body.dropOffAt !== undefined ||
    body.dropOffLocation !== undefined ||
    body.dropOffNote !== undefined;

  // Update item in transaction
  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: itemId },
      data: {
        name: body.name ?? item.name,
        quantity: body.quantity !== undefined ? body.quantity : item.quantity,
        description: body.description !== undefined ? body.description : item.description,
        critical: body.critical !== undefined ? body.critical : item.critical,
        glutenFree: body.glutenFree !== undefined ? body.glutenFree : item.glutenFree,
        dairyFree: body.dairyFree !== undefined ? body.dairyFree : item.dairyFree,
        vegetarian: body.vegetarian !== undefined ? body.vegetarian : item.vegetarian,
        notes: body.notes !== undefined ? body.notes : item.notes,
        dropOffAt:
          body.dropOffAt !== undefined
            ? body.dropOffAt
              ? new Date(body.dropOffAt)
              : null
            : item.dropOffAt,
        dropOffLocation:
          body.dropOffLocation !== undefined ? body.dropOffLocation : item.dropOffLocation,
        dropOffNote: body.dropOffNote !== undefined ? body.dropOffNote : item.dropOffNote,
        dayId: body.dayId !== undefined ? body.dayId : item.dayId,
        // If this is a GENERATED item and substantive fields are being edited, mark as HOST_EDITED
        source:
          item.source === 'GENERATED' && substantiveFieldsBeingEdited ? 'HOST_EDITED' : item.source,
      },
    });

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'EDIT_ITEM',
      targetType: 'Item',
      targetId: itemId,
      details: `Updated item: ${updated.name}`,
    });

    const changes = fieldChanges(
      { action: 'EDIT_ITEM', targetType: 'Item', targetId: itemId },
      item as unknown as Record<string, unknown>,
      updated as unknown as Record<string, unknown>,
      TRACKED
    ).map((c) => ({
      ...c,
      action: c.field === 'critical' ? ('TOGGLE_CRITICAL' as const) : c.action,
      context: { assignmentResponse: item.assignment?.response ?? null },
    }));

    if (changes.length > 0) {
      await recordChange(tx, {
        eventId: resolvedContext.event.id,
        actor: actorFromToken(resolvedContext),
        reason: body.reason ?? null,
        changes,
      });
    }

    return updated;
  });

  return NextResponse.json({ item: updatedItem });
}

/**
 * DELETE /api/c/[token]/items/[itemId]
 *
 * Deletes an item.
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId
 * - DRAFT: always allowed
 * - Cascade will delete assignment (via schema)
 */
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await context.params;
  const delBody = await request.json().catch(() => ({}) as { reason?: string });
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify item ownership
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { assignment: { select: { response: true } } },
  });

  if (!item || item.teamId !== resolvedContext.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Delete item in transaction (cascade will delete assignment)
  await prisma.$transaction(async (tx) => {
    await tx.item.delete({
      where: { id: itemId },
    });

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'DELETE_ITEM',
      targetType: 'Item',
      targetId: itemId,
      details: `Deleted item: ${item.name}`,
    });

    // T3 — deleting an item someone holds takes their ask away.
    await recordChange(tx, {
      eventId: resolvedContext.event.id,
      actor: actorFromToken(resolvedContext),
      reason: delBody.reason ?? null,
      changes: [
        {
          action: 'DELETE_ITEM',
          targetType: 'Item',
          targetId: itemId,
          before: { name: item.name, quantity: item.quantity },
          after: null,
          context: { assignmentResponse: item.assignment?.response ?? null },
        },
      ],
    });
  });

  return NextResponse.json({ success: true });
}
