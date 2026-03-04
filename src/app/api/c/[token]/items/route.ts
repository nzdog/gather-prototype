import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate, logAudit } from '@/lib/workflow';
import { requireNotFrozen } from '@/lib/auth/guards';

/**
 * POST /api/c/[token]/items
 *
 * Creates a new item in the coordinator's team.
 *
 * CRITICAL:
 * - Force teamId from token, NEVER from client
 * - Check canMutate() before creating
 * - All operations in transaction
 * - Server-side frozen state validation
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // SECURITY: Block mutations when FROZEN (server-side validation)
  const frozenBlock = requireNotFrozen(resolvedContext.event, false);
  if (frozenBlock) return frozenBlock;

  // Check if mutations are allowed
  if (!canMutate(resolvedContext.event.status, 'createItem')) {
    return NextResponse.json(
      {
        error: `Cannot create items while event is ${resolvedContext.event.status}`,
      },
      { status: 403 }
    );
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
        teamId: resolvedContext.team!.id, // FORCE from token, NEVER from client
        dayId: body.dayId || null,
        status: 'UNASSIGNED',
      },
    });

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'CREATE_ITEM',
      targetType: 'Item',
      targetId: newItem.id,
      details: `Created item: ${newItem.name}`,
    });

    return newItem;
  });

  return NextResponse.json({ item });
}
