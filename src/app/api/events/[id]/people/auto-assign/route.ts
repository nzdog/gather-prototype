import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Helper: Calculate workload score for a team
function calculateWorkloadScore(totalItems: number, memberCount: number): number {
  // Empty teams have highest priority (score = 0)
  if (memberCount === 0) return 0;

  // Workload = items per member
  return totalItems / memberCount;
}

interface TeamWorkload {
  teamId: string;
  teamName: string;
  memberCount: number;
  totalItems: number;
  workloadScore: number;
}

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: eventId } = await context.params;

    // 1. Fetch all teams with their stats
    const teams = await prisma.team.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            items: true,
          },
        },
        members: {
          where: {
            role: { not: 'HOST' }, // Don't count hosts in member count
          },
          select: {
            id: true,
          },
        },
      },
    });

    // Validate: must have at least one team
    if (teams.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please create at least one team before auto-assigning people',
          code: 'NO_TEAMS',
        },
        { status: 400 }
      );
    }

    // 2. Fetch all unassigned participants
    const unassignedParticipants = await prisma.personEvent.findMany({
      where: {
        eventId,
        role: 'PARTICIPANT',
        teamId: null,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    // Validate: must have at least one unassigned participant
    if (unassignedParticipants.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'All participants are already assigned to teams',
          code: 'NO_UNASSIGNED',
        },
        { status: 400 }
      );
    }

    // 3. Initialize team workload tracking
    const teamWorkloads: TeamWorkload[] = teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      memberCount: team.members.length,
      totalItems: team._count.items,
      workloadScore: calculateWorkloadScore(team._count.items, team.members.length),
    }));

    // 4. Calculate assignments using workload balancing
    const assignments: Array<{
      personId: string;
      personName: string;
      teamId: string;
      teamName: string;
      reason: string;
    }> = [];

    for (const personEvent of unassignedParticipants) {
      // Find team with lowest workload score
      const targetTeam = teamWorkloads.reduce((lowest, current) =>
        current.workloadScore < lowest.workloadScore ? current : lowest
      );

      // Record assignment
      assignments.push({
        personId: personEvent.personId,
        personName: personEvent.person.name,
        teamId: targetTeam.teamId,
        teamName: targetTeam.teamName,
        reason: `Lowest workload (${targetTeam.totalItems} items, ${targetTeam.memberCount} members)`,
      });

      // Update workload for next iteration
      targetTeam.memberCount += 1;
      targetTeam.workloadScore = calculateWorkloadScore(
        targetTeam.totalItems,
        targetTeam.memberCount
      );
    }

    // 5. Execute all assignments in a single transaction
    await prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx.personEvent.update({
          where: {
            personId_eventId: {
              personId: assignment.personId,
              eventId,
            },
          },
          data: {
            teamId: assignment.teamId,
          },
        });
      }
    });

    // 6. Return success with assignment details
    return NextResponse.json({
      success: true,
      assigned: assignments.length,
      assignments: assignments.map((a) => ({
        personName: a.personName,
        teamName: a.teamName,
        reason: a.reason,
      })),
      summary: {
        totalUnassigned: unassignedParticipants.length,
        totalAssigned: assignments.length,
        teamWorkloads: teamWorkloads.map((t) => ({
          teamId: t.teamId,
          teamName: t.teamName,
          memberCount: t.memberCount,
          totalItems: t.totalItems,
          workloadScore: t.workloadScore,
        })),
      },
    });
  } catch (error: any) {
    console.error('Error auto-assigning people:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to assign people. Please try again.',
        code: 'TRANSACTION_FAILED',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
