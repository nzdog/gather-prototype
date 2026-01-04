import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate, logAudit } from '@/lib/workflow';

/**
 * PATCH /api/c/[token]/items/[itemId]
 *
 * Edits an item.
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId before mutation
 * - Check canMutate() before updating
 * - Never accept teamId from client (ownership already verified)
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR' || !context.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify item ownership
  const item = await prisma.item.findUnique({
    where: { id: params.itemId },
  });

  if (!item || item.teamId !== context.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Check if mutations are allowed
  if (!canMutate(context.event.status, 'editItem')) {
    return NextResponse.json(
      {
        error: `Cannot edit items while event is ${context.event.status}`,
      },
      { status: 403 }
    );
  }

  const body = await request.json();

  // Update item in transaction
  const updatedItem = await prisma.$transaction(async (tx) => {
    const updated = await tx.item.update({
      where: { id: params.itemId },
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
      },
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'EDIT_ITEM',
      targetType: 'Item',
      targetId: params.itemId,
      details: `Updated item: ${updated.name}`,
    });

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
 * - FROZEN: delete blocked (no override)
 * - CONFIRMING: blocked if critical
 * - DRAFT: always allowed
 * - Cascade will delete assignment (via schema)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { token: string; itemId: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR' || !context.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify item ownership
  const item = await prisma.item.findUnique({
    where: { id: params.itemId },
  });

  if (!item || item.teamId !== context.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Check if deletion is allowed (allow both critical and non-critical)
  if (!canMutate(context.event.status, 'deleteItem', false)) {
    return NextResponse.json(
      {
        error: `Cannot delete items while event is ${context.event.status}`,
      },
      { status: 403 }
    );
  }

  // Delete item in transaction (cascade will delete assignment)
  await prisma.$transaction(async (tx) => {
    await tx.item.delete({
      where: { id: params.itemId },
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'DELETE_ITEM',
      targetType: 'Item',
      targetId: params.itemId,
      details: `Deleted item: ${item.name}`,
    });
  });

  return NextResponse.json({ success: true });
}
