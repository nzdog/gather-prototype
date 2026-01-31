import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { logInviteEvent } from '@/lib/invite-events';

type FrozenEditAction = 'reassign' | 'toggle_critical' | 'edit_item';

interface FrozenEditBody {
  action: FrozenEditAction;
  itemId: string;
  reason: string;
  payload: {
    // For reassign
    newPersonId?: string | null;
    notifyRemoved?: boolean;

    // For toggle_critical
    critical?: boolean;

    // For edit_item
    name?: string;
    quantity?: string;
    description?: string;
  };
}

// POST /api/events/[id]/frozen-edit - Perform surgical edit while frozen
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    // SECURITY: Only HOST can make frozen edits
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // Get actorId from authenticated user
    let person = await prisma.person.findFirst({
      where: { userId: auth.user.id },
    });

    if (!person) {
      // Create Person record if it doesn't exist (migration support)
      person = await prisma.person.create({
        data: {
          name: auth.user.email.split('@')[0],
          email: auth.user.email,
          userId: auth.user.id,
        },
      });
    }

    const actorId = person.id;

    const body: FrozenEditBody = await request.json();
    const { action, itemId, reason, payload } = body;

    // Validate required fields
    if (!action || !itemId || !reason) {
      return NextResponse.json(
        { error: 'Missing required fields: action, itemId, reason' },
        { status: 400 }
      );
    }

    if (!reason.trim()) {
      return NextResponse.json({ error: 'Reason required for frozen edits' }, { status: 400 });
    }

    // Validate action type
    const validActions: FrozenEditAction[] = ['reassign', 'toggle_critical', 'edit_item'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be reassign, toggle_critical, or edit_item' },
        { status: 400 }
      );
    }

    // Get event and verify it's frozen
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true, name: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if (event.status !== 'FROZEN') {
      return NextResponse.json(
        { error: 'Event must be frozen for surgical edits' },
        { status: 400 }
      );
    }

    // Get item and verify it belongs to this event
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        team: { select: { id: true, eventId: true, name: true } },
        assignment: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                phoneNumber: true,
                eventMemberships: {
                  where: { eventId },
                  select: { contactMethod: true, reachabilityTier: true },
                },
              },
            },
          },
        },
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    if (item.team.eventId !== eventId) {
      return NextResponse.json({ error: 'Item does not belong to this event' }, { status: 400 });
    }

    // Execute the appropriate action
    const notificationsSent: string[] = [];
    let auditId: string;

    switch (action) {
      case 'reassign':
        ({ auditId } = await handleReassign({
          eventId,
          event,
          item,
          payload,
          reason,
          actorId,
          notificationsSent,
        }));
        break;

      case 'toggle_critical':
        ({ auditId } = await handleToggleCritical({
          eventId,
          item,
          payload,
          reason,
          actorId,
        }));
        break;

      case 'edit_item':
        ({ auditId } = await handleEditItem({
          eventId,
          event,
          item,
          payload,
          reason,
          actorId,
          notificationsSent,
        }));
        break;

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      itemId,
      auditId,
      notifications: {
        sent: notificationsSent,
        failed: [],
      },
    });
  } catch (error: any) {
    console.error('Error performing frozen edit:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// Handle reassignment action
async function handleReassign(params: {
  eventId: string;
  event: { id: string; name: string };
  item: any;
  payload: FrozenEditBody['payload'];
  reason: string;
  actorId: string;
  notificationsSent: string[];
}): Promise<{ auditId: string }> {
  const { eventId, event, item, payload, reason, actorId, notificationsSent } = params;

  return await prisma.$transaction(async (tx) => {
    const before = {
      assignedTo: item.assignment?.personId || null,
      assignedToName: item.assignment?.person.name || null,
      status: item.assignment?.response || null,
    };

    const oldAssignment = item.assignment;

    // Remove current assignment if exists
    if (oldAssignment) {
      await tx.assignment.delete({
        where: { id: oldAssignment.id },
      });

      // Update item status
      await tx.item.update({
        where: { id: item.id },
        data: { status: 'UNASSIGNED' },
      });

      // Queue notification to old assignee if requested
      if (payload.notifyRemoved && oldAssignment.person) {
        await logInviteEvent(
          {
            eventId,
            personId: oldAssignment.personId,
            type: 'MANUAL_OVERRIDE_MARKED',
            metadata: {
              action: 'frozen_reassign_removed',
              itemId: item.id,
              itemName: item.name,
              eventName: event.name,
              reason,
            },
          },
          tx
        );

        notificationsSent.push(oldAssignment.personId);
      }
    }

    let newAssignment = null;

    // Create new assignment if newPersonId provided
    if (payload.newPersonId) {
      // Verify person exists and is in the event
      const person = await tx.personEvent.findUnique({
        where: {
          personId_eventId: {
            personId: payload.newPersonId,
            eventId,
          },
        },
        include: {
          person: { select: { id: true, name: true } },
        },
      });

      if (!person) {
        throw new Error('New assignee not found or not part of this event');
      }

      // Create new assignment with PENDING status
      newAssignment = await tx.assignment.create({
        data: {
          itemId: item.id,
          personId: payload.newPersonId,
          response: 'PENDING',
        },
      });

      // Update item status
      await tx.item.update({
        where: { id: item.id },
        data: { status: 'ASSIGNED' },
      });

      // Queue notification to new assignee
      await logInviteEvent(
        {
          eventId,
          personId: payload.newPersonId,
          type: 'MANUAL_OVERRIDE_MARKED',
          metadata: {
            action: 'frozen_reassign_added',
            itemId: item.id,
            itemName: item.name,
            eventName: event.name,
            reason,
          },
        },
        tx
      );

      notificationsSent.push(payload.newPersonId);
    }

    const after = {
      assignedTo: newAssignment?.personId || null,
      assignedToName: newAssignment
        ? (
            await tx.person.findUnique({
              where: { id: newAssignment.personId },
              select: { name: true },
            })
          )?.name
        : null,
      status: newAssignment?.response || null,
    };

    // Log audit entry
    await logInviteEvent(
      {
        eventId,
        personId: actorId,
        type: 'MANUAL_OVERRIDE_MARKED',
        metadata: {
          auditType: 'FROZEN_EDIT',
          action: 'reassign',
          itemId: item.id,
          itemName: item.name,
          reason,
          before,
          after,
          notifyRemoved: payload.notifyRemoved || false,
        },
      },
      tx
    );

    // Return audit ID from last invite event
    const auditEntry = await tx.inviteEvent.findFirst({
      where: { eventId, personId: actorId },
      orderBy: { createdAt: 'desc' },
    });

    return { auditId: auditEntry?.id || 'unknown' };
  });
}

// Handle toggle critical action
async function handleToggleCritical(params: {
  eventId: string;
  item: any;
  payload: FrozenEditBody['payload'];
  reason: string;
  actorId: string;
}): Promise<{ auditId: string }> {
  const { eventId, item, payload, reason, actorId } = params;

  if (payload.critical === undefined) {
    throw new Error('critical field required for toggle_critical action');
  }

  return await prisma.$transaction(async (tx) => {
    const before = {
      critical: item.critical,
      criticalReason: item.criticalReason,
    };

    // Update item critical flag
    await tx.item.update({
      where: { id: item.id },
      data: {
        critical: payload.critical,
        criticalSource: 'HOST',
        criticalOverride: payload.critical ? 'ADDED' : 'REMOVED',
      },
    });

    const after = {
      critical: payload.critical,
      criticalReason: reason,
    };

    // Log audit entry
    await logInviteEvent(
      {
        eventId,
        personId: actorId,
        type: 'MANUAL_OVERRIDE_MARKED',
        metadata: {
          auditType: 'FROZEN_EDIT',
          action: 'toggle_critical',
          itemId: item.id,
          itemName: item.name,
          reason,
          before,
          after,
        },
      },
      tx
    );

    // Return audit ID from last invite event
    const auditEntry = await tx.inviteEvent.findFirst({
      where: { eventId, personId: actorId },
      orderBy: { createdAt: 'desc' },
    });

    return { auditId: auditEntry?.id || 'unknown' };
  });
}

// Handle edit item action
async function handleEditItem(params: {
  eventId: string;
  event: { id: string; name: string };
  item: any;
  payload: FrozenEditBody['payload'];
  reason: string;
  actorId: string;
  notificationsSent: string[];
}): Promise<{ auditId: string }> {
  const { eventId, event, item, payload, reason, actorId, notificationsSent } = params;

  return await prisma.$transaction(async (tx) => {
    const before = {
      name: item.name,
      quantity: item.quantity,
      description: item.description,
      assignmentStatus: item.assignment?.response || null,
    };

    // Update item fields
    const updateData: any = {};
    if (payload.name !== undefined) updateData.name = payload.name;
    if (payload.quantity !== undefined) updateData.quantity = payload.quantity;
    if (payload.description !== undefined) updateData.description = payload.description;

    if (Object.keys(updateData).length > 0) {
      await tx.item.update({
        where: { id: item.id },
        data: updateData,
      });
    }

    // If item has ACCEPTED assignment, reset to PENDING and notify
    if (item.assignment && item.assignment.response === 'ACCEPTED') {
      await tx.assignment.update({
        where: { id: item.assignment.id },
        data: { response: 'PENDING' },
      });

      // Queue notification to assignee
      await logInviteEvent(
        {
          eventId,
          personId: item.assignment.personId,
          type: 'MANUAL_OVERRIDE_MARKED',
          metadata: {
            action: 'frozen_edit_item_updated',
            itemId: item.id,
            itemName: updateData.name || item.name,
            eventName: event.name,
            reason,
            changes: updateData,
          },
        },
        tx
      );

      notificationsSent.push(item.assignment.personId);
    }

    const after = {
      name: updateData.name || item.name,
      quantity: updateData.quantity || item.quantity,
      description: updateData.description || item.description,
      assignmentStatus:
        item.assignment?.response === 'ACCEPTED' ? 'PENDING' : item.assignment?.response || null,
    };

    // Log audit entry
    await logInviteEvent(
      {
        eventId,
        personId: actorId,
        type: 'MANUAL_OVERRIDE_MARKED',
        metadata: {
          auditType: 'FROZEN_EDIT',
          action: 'edit_item',
          itemId: item.id,
          itemName: item.name,
          reason,
          before,
          after,
        },
      },
      tx
    );

    // Return audit ID from last invite event
    const auditEntry = await tx.inviteEvent.findFirst({
      where: { eventId, personId: actorId },
      orderBy: { createdAt: 'desc' },
    });

    return { auditId: auditEntry?.id || 'unknown' };
  });
}
