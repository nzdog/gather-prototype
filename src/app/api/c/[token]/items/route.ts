import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate, logAudit } from '@/lib/workflow';

/**
 * POST /api/c/[token]/items
 *
 * Creates a new item in the coordinator's team.
 *
 * CRITICAL:
 * - Force teamId from token, NEVER from client
 * - Check canMutate() before creating
 * - All operations in transaction
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  const context = await resolveToken(params.token);

  if (!context || context.scope !== 'COORDINATOR' || !context.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Check if mutations are allowed
  if (!canMutate(context.event.status, 'createItem')) {
    return NextResponse.json({
      error: `Cannot create items while event is ${context.event.status}`
    }, { status: 403 });
  }

  const body = await request.json();

  // Validate required fields
  if (!body.name) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
  }

  // Create item in transaction
  const item = await prisma.$transaction(async (tx) => {
    const newItem = await tx.item.create({
      data: {
        name: body.name,
        quantity: body.quantity || null,
        description: body.description || null,
        critical: body.critical || false,
        glutenFree: body.glutenFree || false,
        dairyFree: body.dairyFree || false,
        vegetarian: body.vegetarian || false,
        notes: body.notes || null,
        dropOffAt: body.dropOffAt ? new Date(body.dropOffAt) : null,
        dropOffLocation: body.dropOffLocation || null,
        dropOffNote: body.dropOffNote || null,
        teamId: context.team!.id, // FORCE from token, NEVER from client
        dayId: body.dayId || null,
        status: 'UNASSIGNED',
      }
    });

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'CREATE_ITEM',
      targetType: 'Item',
      targetId: newItem.id,
      details: `Created item: ${newItem.name}`
    });

    return newItem;
  });

  return NextResponse.json({ item });
}
