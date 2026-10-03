import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit, repairItemStatusAfterMutation } from '@/lib/workflow';
import { recordChange, actorFromToken, onAssignmentReleased } from '@/lib/ledger';

/**
 * POST /api/c/[token]/items/[itemId]/assign
 *
 * Assigns a person to an item (or reassigns if already assigned).
 *
 * CRITICAL:
 * - Verify item.teamId === token.teamId
 * - Verify assignee's PersonEvent.teamId === item.teamId (same team)
 * - After assignment create: call repairItemStatusAfterMutation(tx, itemId)
 * - Log ASSIGN_ITEM or REASSIGN_ITEM
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string; itemId: string }> }
) {
  const { token, itemId } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'COORDINATOR' || !resolvedContext.team) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Verify item ownership
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: { assignment: true },
  });

  if (!item || item.teamId !== resolvedContext.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  const body = await request.json();

  if (!body.personId) {
    return NextResponse.json({ error: 'personId is required' }, { status: 400 });
  }

  // Verify assignee is in the same team
  const personEvent = await prisma.personEvent.findFirst({
    where: {
      personId: body.personId,
      eventId: resolvedContext.event.id,
    },
  });

  if (!personEvent || personEvent.teamId !== resolvedContext.team.id) {
    return NextResponse.json(
      {
        error: 'Person must be in the same team as the item',
      },
      { status: 400 }
    );
  }

  const actor = actorFromToken(resolvedContext);
  const released = item.assignment;

  // Assign/reassign in transaction
  const { assignment: result, changeSetId } = await prisma.$transaction(async (tx) => {
    const isReassignment = released !== null;
    const actionType = isReassignment ? 'REASSIGN_ITEM' : 'ASSIGN_ITEM';

    // Delete existing assignment if present
    if (released) {
      await tx.assignment.delete({
        where: { id: released.id },
      });
    }

    // Create new assignment
    const assignment = await tx.assignment.create({
      data: {
        itemId: itemId,
        personId: body.personId,
      },
      include: {
        person: true,
      },
    });

    // Clear notes if it contains "UNASSIGNED" message from seed data
    if (item.notes && item.notes.includes('UNASSIGNED')) {
      await tx.item.update({
        where: { id: itemId },
        data: { notes: null },
      });
    }

    // Repair item status after assignment mutation
    await repairItemStatusAfterMutation(tx, itemId);

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType,
      targetType: 'Item',
      targetId: itemId,
      details: `${isReassignment ? 'Reassigned' : 'Assigned'} ${item.name} to ${assignment.person.name}`,
    });

    // T1 — the ask itself moves. A coordinator owes the same why a host does; the
    // rule is a property of the change, not the changer (ruled 2026-08-03).
    const ledger = await recordChange(tx, {
      eventId: resolvedContext.event.id,
      actor,
      reason: body.reason ?? null,
      changes: [
        {
          action: isReassignment ? 'MOVE_ASSIGNMENT' : 'CREATE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: assignment.id,
          before: released ? { personId: released.personId, response: released.response } : null,
          after: {
            personId: assignment.personId,
            personName: assignment.person.name,
            response: assignment.response,
          },
          context: { assignmentResponse: released?.response ?? null },
        },
      ],
    });

    return { assignment, changeSetId: ledger.changeSetId };
  });

  if (released) {
    await onAssignmentReleased(released.personId, itemId, changeSetId);
  }

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
    include: {
      assignment: {
        include: {
          person: true,
        },
      },
    },
  });

  if (!item || item.teamId !== resolvedContext.team.id) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 });
  }

  if (!item.assignment) {
    return NextResponse.json({ error: 'Item has no assignment' }, { status: 400 });
  }

  // Delete assignment in transaction
  const { changeSetId: delChangeSetId } = await prisma.$transaction(async (tx) => {
    await tx.assignment.delete({
      where: { id: item.assignment!.id },
    });

    // Repair item status after assignment deletion
    await repairItemStatusAfterMutation(tx, itemId);

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'UNASSIGN_ITEM',
      targetType: 'Item',
      targetId: itemId,
      details: `Unassigned ${item.name} from ${item.assignment!.person.name}`,
    });

    // T1 — withdrawing the ask touches whoever held it, at any response state.
    return recordChange(tx, {
      eventId: resolvedContext.event.id,
      actor: actorFromToken(resolvedContext),
      reason: delBody.reason ?? null,
      changes: [
        {
          action: 'DELETE_ASSIGNMENT',
          targetType: 'Assignment',
          targetId: item.assignment!.id,
          before: {
            personId: item.assignment!.personId,
            personName: item.assignment!.person.name,
            response: item.assignment!.response,
          },
          after: null,
          context: { assignmentResponse: item.assignment!.response },
        },
      ],
    });
  });

  await onAssignmentReleased(item.assignment.personId, itemId, delChangeSetId);

  return NextResponse.json({ success: true });
}
