import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, onAssignmentReleased, type PendingChange } from '@/lib/ledger';
import { repairItemStatusAfterMutation } from '@/lib/workflow';

// POST /api/events/[id]/items/[itemId]/assign - Assign item to person
//
// GTC-196 (A3b): this is a T1 site — creating, moving or deleting an assignment always
// touches someone once the plan is sent, so it carries a reason. The reason is
// OPTIONAL on the wire and its absence NEVER blocks (plan §13.1): a missing why is
// recorded as a gap in the history, not rejected.
//
// It also absorbs frozen-edit's `reassign` action, whose two correct halves — capture
// the why, notify the released person — are preserved rather than reinvented.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = await request.json();
    const { personId, reason } = body;

    if (!personId) {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 });
    }

    // Get item with team info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        team: true,
        assignment: { include: { person: { select: { id: true, name: true } } } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.team.eventId !== eventId) {
      return NextResponse.json({ error: 'Item does not belong to this event' }, { status: 400 });
    }

    // Check if person is in the same team as the item
    const personEvent = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId, eventId } },
      include: { person: { select: { id: true, name: true } } },
    });

    if (!personEvent) {
      return NextResponse.json({ error: 'Person is not part of this event' }, { status: 404 });
    }

    if (personEvent.teamId !== item.teamId) {
      return NextResponse.json(
        { error: 'Person must be in the same team as the item' },
        { status: 400 }
      );
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    const released = item.assignment;

    // Assignment delete + create + item status + ledger in ONE transaction.
    // gather-architecture-contract §7 — this route previously ran them as sequential
    // awaits with no transaction, so a partial failure could orphan the item.
    const { assignment, changeSetId } = await prisma.$transaction(async (tx) => {
      if (released) {
        await tx.assignment.delete({ where: { id: released.id } });
      }

      const created = await tx.assignment.create({
        data: { itemId, personId },
        include: {
          person: { select: { id: true, name: true } },
          item: { select: { id: true, name: true, critical: true } },
        },
      });

      await repairItemStatusAfterMutation(tx, itemId);

      const change: PendingChange = {
        action: released ? 'MOVE_ASSIGNMENT' : 'CREATE_ASSIGNMENT',
        targetType: 'Assignment',
        targetId: created.id,
        before: released
          ? {
              personId: released.personId,
              personName: released.person.name,
              response: released.response,
            }
          : null,
        after: { personId, personName: personEvent.person.name, response: created.response },
        context: { assignmentResponse: released?.response ?? null },
      };

      const result = await recordChange(tx, {
        eventId,
        actor,
        reason: reason ?? null,
        changes: [change],
      });

      return { assignment: created, changeSetId: result.changeSetId };
    });

    // The system closes the loop with whoever was released (Hinge §8). No-op until
    // GTC-176 (D3) — the call site is fixed here, inside the flow that knows the facts.
    if (released) {
      await onAssignmentReleased(released.personId, itemId, changeSetId);
    }

    return NextResponse.json({ assignment });
  } catch (error: any) {
    console.error('Error assigning item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/events/[id]/items/[itemId]/assign - Unassign item
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // DELETE bodies are optional — an unassign with no why still lands.
    const body = await request.json().catch(() => ({}) as { reason?: string });

    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        team: true,
        assignment: { include: { person: { select: { id: true, name: true } } } },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.team.eventId !== eventId) {
      return NextResponse.json({ error: 'Item does not belong to this event' }, { status: 400 });
    }

    if (!item.assignment) {
      return NextResponse.json({ error: 'Item has no assignment' }, { status: 400 });
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    const released = item.assignment;

    const { changeSetId } = await prisma.$transaction(async (tx) => {
      await tx.assignment.delete({ where: { id: released.id } });
      await repairItemStatusAfterMutation(tx, itemId);

      return recordChange(tx, {
        eventId,
        actor,
        reason: body.reason ?? null,
        changes: [
          {
            action: 'DELETE_ASSIGNMENT',
            targetType: 'Assignment',
            targetId: released.id,
            before: {
              personId: released.personId,
              personName: released.person.name,
              response: released.response,
            },
            after: null,
            context: { assignmentResponse: released.response },
          },
        ],
      });
    });

    await onAssignmentReleased(released.personId, itemId, changeSetId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error unassigning item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
