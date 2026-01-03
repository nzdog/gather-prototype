// DELETE /api/events/[id]/teams/[teamId] - Delete team
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const { id: eventId, teamId } = await context.params;

    // Verify team exists and belongs to event
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        _count: {
          select: { items: true }
        }
      }
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.eventId !== eventId) {
      return NextResponse.json(
        { error: 'Team does not belong to this event' },
        { status: 400 }
      );
    }

    // Delete team (cascade will delete items)
    await prisma.team.delete({
      where: { id: teamId }
    });

    return NextResponse.json({
      success: true,
      message: 'Team deleted',
      itemsDeleted: team._count.items
    });
  } catch (error) {
    console.error('Error deleting team:', error);
    return NextResponse.json(
      {
        error: 'Failed to delete team',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
