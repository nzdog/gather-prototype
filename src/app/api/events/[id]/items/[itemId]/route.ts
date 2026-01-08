// PATCH /api/events/[id]/items/[itemId] - Update item
// DELETE /api/events/[id]/items/[itemId] - Delete item
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: _eventId, itemId } = await context.params;
    const body = await request.json();

    // Build update data
    const updateData: any = {};

    // Quantity fields
    if (body.quantityAmount !== undefined) updateData.quantityAmount = body.quantityAmount;
    if (body.quantityUnit !== undefined) updateData.quantityUnit = body.quantityUnit;
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

    // Dietary tags
    if (body.dietaryTags !== undefined) updateData.dietaryTags = body.dietaryTags;

    // Timing fields
    if (body.dayId !== undefined) updateData.dayId = body.dayId;
    if (body.serveTime !== undefined) updateData.serveTime = body.serveTime;

    // Drop-off fields
    if (body.dropOffLocation !== undefined) updateData.dropOffLocation = body.dropOffLocation;
    if (body.dropOffNote !== undefined) updateData.dropOffNote = body.dropOffNote;

    // Update item
    const item = await prisma.item.update({
      where: { id: itemId },
      data: updateData,
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
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // Verify item exists
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: { team: true },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.team.eventId !== eventId) {
      return NextResponse.json({ error: 'Item does not belong to this event' }, { status: 400 });
    }

    // Delete item (cascade will handle assignment if any)
    await prisma.item.delete({
      where: { id: itemId },
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
