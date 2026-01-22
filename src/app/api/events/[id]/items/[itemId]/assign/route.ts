import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole, requireNotFrozen } from '@/lib/auth/guards';

// POST /api/events/[id]/items/[itemId]/assign - Assign item to person
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    // Get event to check frozen state
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Block assignments when frozen (HOST can override)
    const frozenBlock = requireNotFrozen(event, auth.role === 'HOST');
    if (frozenBlock) return frozenBlock;

    const body = await request.json();
    const { personId } = body;

    if (!personId) {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 });
    }

    // Get item with team info
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        team: true,
        assignment: true,
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
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
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

    // If item already has an assignment, delete it first
    if (item.assignment) {
      await prisma.assignment.delete({
        where: { id: item.assignment.id },
      });
    }

    // Create new assignment
    const assignment = await prisma.assignment.create({
      data: {
        itemId,
        personId,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            name: true,
            critical: true,
          },
        },
      },
    });

    // Update item status to ASSIGNED
    await prisma.item.update({
      where: { id: itemId },
      data: { status: 'ASSIGNED' },
    });

    return NextResponse.json({ assignment });
  } catch (error: any) {
    console.error('Error assigning item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/events/[id]/items/[itemId]/assign - Unassign item
export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    // Get event to check frozen state
    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Block unassignments when frozen (HOST can override)
    const frozenBlock = requireNotFrozen(event, auth.role === 'HOST');
    if (frozenBlock) return frozenBlock;

    // Get item with assignment
    const item = await prisma.item.findUnique({
      where: { id: itemId },
      include: {
        team: true,
        assignment: true,
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

    // Delete assignment
    await prisma.assignment.delete({
      where: { id: item.assignment.id },
    });

    // Update item status to UNASSIGNED
    await prisma.item.update({
      where: { id: itemId },
      data: { status: 'UNASSIGNED' },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error unassigning item:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
