import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canMutate, logAudit, repairItemStatusAfterMutation } from '@/lib/workflow';

/**
 * POST /api/c/[token]/items/[itemId]/assign
 *
 * Assigns a person to an item (or reassigns if already assigned).
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId
 * - Verify assignee's PersonEvent.teamId === item.teamId (same team)
 * - Check canMutate() before assigning
 * - After assignment create: call repairItemStatusAfterMutation(tx, itemId)
 * - Log ASSIGN_ITEM or REASSIGN_ITEM
 */
export async function POST(
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
    include: { assignment: true }
  });

  if (!item || item.teamId !== context.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  // Check if mutations are allowed
  if (!canMutate(context.event.status, 'assignItem')) {
    return NextResponse.json({
      error: `Cannot assign items while event is ${context.event.status}`
    }, { status: 403 });
  }

  const body = await request.json();

  if (!body.personId) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 });
  }

  // Verify assignee is in the same team
  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: body.personId,
      eventId: context.event.id
    }
  });

  if (!personEvent || personEvent.teamId !== context.team.id) {
    return NextResponse.json({
      error: 'Person must be in the same team as the item'
    }, { status: 400 });
  }

  // Assign/reassign in transaction
  const result = await prisma.$transaction(async (tx) => {
    const isReassignment = item.assignment !== null;
    const actionType = isReassignment ? 'REASSIGN_ITEM' : 'ASSIGN_ITEM';

    // Delete existing assignment if present
    if (item.assignment) {
      await tx.assignment.delete({
        where: { id: item.assignment.id }
      });
    }

    // Create new assignment
    const assignment = await tx.assignment.create({
      data: {
        itemId: params.itemId,
        personId: body.personId,
      },
      include: {
        person: true
      }
    });

    // Clear notes if it contains "UNASSIGNED" message from seed data
    if (item.notes && item.notes.includes('UNASSIGNED')) {
      await tx.item.update({
        where: { id: params.itemId },
        data: { notes: null }
      });
    }

    // Repair item status after assignment mutation
    await repairItemStatusAfterMutation(tx, params.itemId);

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType,
      targetType: 'Item',
      targetId: params.itemId,
      details: `${isReassignment ? 'Reassigned' : 'Assigned'} ${item.name} to ${assignment.person.name}`
    });

    return assignment;
  });

  return NextResponse.json({ assignment: result });
}

/**
 * DELETE /api/c/[token]/items/[itemId]/assign
 *
 * Removes assignment from an item.
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId
 * - After assignment delete: call repairItemStatusAfterMutation(tx, itemId)
 * - Log UNASSIGN_ITEM
 */
export async function DELETE(
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
    include: {
      assignment: {
        include: {
          person: true
        }
      }
    }
  });

  if (!item || item.teamId !== context.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  if (!item.assignment) {
    return NextResponse.json({ error: 'Item has no assignment' }, { status: 400 });
  }

  // Check if mutations are allowed
  if (!canMutate(context.event.status, 'assignItem')) {
    return NextResponse.json({
      error: `Cannot unassign items while event is ${context.event.status}`
    }, { status: 403 });
  }

  // Delete assignment in transaction
  await prisma.$transaction(async (tx) => {
    await tx.assignment.delete({
      where: { id: item.assignment!.id }
    });

    // Repair item status after assignment deletion
    await repairItemStatusAfterMutation(tx, params.itemId);

    await logAudit(tx, {
      eventId: context.event.id,
      actorId: context.person.id,
      actionType: 'UNASSIGN_ITEM',
      targetType: 'Item',
      targetId: params.itemId,
      details: `Unassigned ${item.name} from ${item.assignment!.person.name}`
    });
  });

  return NextResponse.json({ success: true });
}
