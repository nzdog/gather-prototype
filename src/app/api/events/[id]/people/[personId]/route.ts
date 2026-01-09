import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// PATCH /api/events/[id]/people/[personId] - Update person (role, team)
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  try {
    const eventId = params.id;
    const personId = params.personId;
    const body = await request.json();
    const { role, teamId } = body;

    // Find the PersonEvent record
    const personEvent = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
    });

    if (!personEvent) {
      return NextResponse.json(
        { error: 'Person is not part of this event' },
        { status: 404 }
      );
    }

    // If teamId is being changed, validate it
    if ('teamId' in body && teamId !== personEvent.teamId) {
      // Only validate if teamId is not null (null means moving to unassigned)
      if (teamId !== null) {
        const team = await prisma.team.findFirst({
          where: { id: teamId, eventId },
        });

        if (!team) {
          return NextResponse.json(
            { error: 'Team not found or does not belong to this event' },
            { status: 404 }
          );
        }
      }

      // When changing teams, remove all assignments (items must be in same team as person)
      await prisma.assignment.deleteMany({
        where: {
          personId,
          item: {
            team: {
              eventId,
            },
          },
        },
      });

      // Update item statuses to UNASSIGNED
      await prisma.item.updateMany({
        where: {
          assignment: null,
          team: {
            eventId,
          },
        },
        data: {
          status: 'UNASSIGNED',
        },
      });
    }

    // Update PersonEvent
    const updated = await prisma.personEvent.update({
      where: {
        personId_eventId: {
          personId,
          eventId,
        },
      },
      data: {
        role: role !== undefined ? role : personEvent.role,
        teamId: 'teamId' in body ? teamId : personEvent.teamId,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    const itemCount = await prisma.assignment.count({
      where: {
        personId,
        item: {
          team: {
            eventId,
          },
        },
      },
    });

    return NextResponse.json({
      personEvent: {
        id: updated.id,
        personId: updated.person.id,
        name: updated.person.name,
        email: updated.person.email,
        phone: updated.person.phone,
        role: updated.role,
        team: updated.team || { id: '', name: 'Unassigned' },
        itemCount,
      },
    });
  } catch (error: any) {
    console.error('Error updating person:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/events/[id]/people/[personId] - Remove person from event
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string; personId: string } }
) {
  try {
    const eventId = params.id;
    const personId = params.personId;

    // Execute removal in transaction
    await prisma.$transaction(async (tx) => {
      // 1. Find all assignments for this person in this event
      const assignments = await tx.assignment.findMany({
        where: {
          personId,
          item: {
            team: { eventId },
          },
        },
        include: { item: true },
      });

      // 2. For each assignment: update the item, then delete assignment
      for (const assignment of assignments) {
        // Update item: mark unassigned, record who had it
        await tx.item.update({
          where: { id: assignment.itemId },
          data: {
            status: 'UNASSIGNED',
            previouslyAssignedTo: assignment.item.previouslyAssignedTo
              ? `${assignment.item.previouslyAssignedTo}, ${personId}`
              : personId,
          },
        });

        // Delete the assignment
        await tx.assignment.delete({
          where: { id: assignment.id },
        });
      }

      // 3. Delete access tokens for this person in this event
      await tx.accessToken.deleteMany({
        where: { personId, eventId },
      });

      // 4. Delete PersonEvent (membership)
      await tx.personEvent.deleteMany({
        where: { personId, eventId },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing person:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
