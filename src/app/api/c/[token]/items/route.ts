import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';

/**
 * POST /api/c/[token]/items
 *
 * Creates a new item in the coordinator's team.
 *
 * CRITICAL:
 * - Force teamId from token, NEVER from client
 * - All operations in transaction
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
