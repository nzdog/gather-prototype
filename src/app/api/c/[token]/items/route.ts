import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { recordChange, actorFromToken } from '@/lib/ledger';
import { itemNameForStorage } from '@/lib/items/name';
import { KIND_ERROR, kindFields, readSubmittedKind } from '@/lib/items/row-kind';

/**
 * POST /api/c/[token]/items
 *
 * Creates a new item in the coordinator's team.
 *
 * CRITICAL:
 * - Force teamId from token, NEVER from client
 * - All operations in transaction
 *
 * GTC-302: the row may be a job. The founder (Unknown 2): "A coordinator MAY add a job. They run a
 * team and a team has work in it". The name is stored tidied — see `itemNameForStorage`.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();

  // Validate required fields — after tidying, so a blank name is refused rather than stored.
  const name = itemNameForStorage(body.name);
  if (!name) {
    return NextResponse.json({ error: 'Item name is required' }, { status: 400 });
  }

  // Brought or done. Absent is a dish; anything unreadable is refused, never defaulted.
  const submittedKind = readSubmittedKind(body.kind);
  if (!submittedKind.ok) {
    return NextResponse.json({ error: KIND_ERROR }, { status: 400 });
  }
  const kind = submittedKind.kind ?? 'ITEM';

  // Create item in transaction
  const item = await prisma.$transaction(async (tx) => {
    const newItem = await tx.item.create({
      data: {
        name,
        ...kindFields(kind),
        // A job carries no quantity — kindFields gives it quantityState NA.
        quantity: kind === 'ITEM' ? body.quantity || null : null,
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

    // Versioned, never interrogated: nobody has been asked for this yet.
    await recordChange(tx, {
      eventId: resolvedContext.event.id,
      actor: actorFromToken(resolvedContext),
      changes: [
        {
          action: 'CREATE_ITEM',
          targetType: 'Item',
          targetId: newItem.id,
          before: null,
          after: {
            name: newItem.name,
            kind: newItem.kind,
            quantity: newItem.quantity,
            teamId: newItem.teamId,
          },
        },
      ],
    });

    return newItem;
  });

  return NextResponse.json({ item });
}
