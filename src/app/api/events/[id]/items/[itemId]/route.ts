// PATCH /api/events/[id]/items/[itemId] - Update item
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;
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
