// DELETE /api/events/[id]/teams/[teamId] - Delete team
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string; teamId: string }> }
) {
  try {
    const { id: eventId, teamId } = await context.params;

    // SECURITY: Require HOST role to delete teams
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // Verify team exists and belongs to event
    const team = await prisma.team.findUnique({
      where: { id: teamId },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    if (!team) {
      return NextResponse.json({ error: 'Team not found' }, { status: 404 });
    }

    if (team.eventId !== eventId) {
      return NextResponse.json({ error: 'Team does not belong to this event' }, { status: 400 });
    }

    // Delete team (cascade will delete items)
    await prisma.team.delete({
      where: { id: teamId },
    });
    // Deleting a team does NOT delete its members' PersonEvent rows — GTC-147 changed
    // that cascade to SetNull. Their items go with the team, so any assignment lost
    // this way is a T3 the item routes would have recorded individually; this entry
    // records the team-level act.
    const delTeamActor = await ledgerActorForUser(auth.user, auth.role);
    await prisma.$transaction((tx) =>
      recordChange(tx, {
        eventId,
        actor: delTeamActor,
        changes: [
          {
            action: 'DELETE_TEAM',
            targetType: 'Team',
            targetId: teamId,
            before: { name: team.name },
            after: null,
          },
        ],
      })
    );

    return NextResponse.json({
      success: true,
      message: 'Team deleted',
      itemsDeleted: team._count.items,
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
