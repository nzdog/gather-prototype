import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';

interface TeamDistribution {
  teamId: string;
  teamName: string;
  memberCount: number;
  totalItems: number;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: eventId } = await context.params;
    const body = await request.json().catch(() => ({}) as { reason?: string });

    // SECURITY: Require HOST role for auto-assignment operations
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    // Fetch event to identify the host
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

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
            role: { not: 'HOST' },
          },
          select: {
            id: true,
            personId: true,
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

    // Ensure host PersonEvent has HOST role (not PARTICIPANT)
    await prisma.personEvent.updateMany({
      where: {
        eventId,
        personId: event.hostId,
        role: { not: 'HOST' },
      },
      data: { role: 'HOST' },
    });

    // 2. Fetch all unassigned participants, excluding the host
    const unassignedParticipants = await prisma.personEvent.findMany({
      where: {
        eventId,
        role: 'PARTICIPANT',
        teamId: null,
        personId: { not: event.hostId },
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

    // 3. Initialize team distribution tracking
    const teamDistributions: TeamDistribution[] = teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      memberCount: team.members.length,
      totalItems: team._count.items,
    }));

    // 4. Calculate assignments using even distribution
    const assignments: Array<{
      personId: string;
      personName: string;
      teamId: string;
      teamName: string;
      reason: string;
    }> = [];

    for (const personEvent of unassignedParticipants) {
      // Find team with fewest members (even distribution)
      const targetTeam = teamDistributions.reduce((lowest, current) =>
        current.memberCount < lowest.memberCount ? current : lowest
      );

      // Record assignment
      assignments.push({
        personId: personEvent.personId,
        personName: personEvent.person.name,
        teamId: targetTeam.teamId,
        teamName: targetTeam.teamName,
        reason: `Even distribution (${targetTeam.memberCount} members before assignment)`,
      });

      // Update member count for next iteration
      targetTeam.memberCount += 1;
    }

    const autoAssignActor = await ledgerActorForUser(auth.user, auth.role);

    // 5. Execute all team assignments and item distribution in a single transaction
    const itemAssignments: Array<{
      itemId: string;
      itemName: string;
      personId: string;
      personName: string;
      teamName: string;
    }> = [];

    await prisma.$transaction(async (tx) => {
      // 5a. Assign people to teams
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

      // 5b. Distribute unassigned items among team members
      for (const team of teams) {
        // Get unassigned items for this team
        const unassignedItems = await tx.item.findMany({
          where: {
            teamId: team.id,
            assignment: null,
          },
          select: { id: true, name: true },
          orderBy: { createdAt: 'asc' },
        });

        if (unassignedItems.length === 0) continue;

        // Get all team members (existing + newly assigned), excluding host
        const existingMemberIds = team.members
          .filter((m) => m.personId !== event.hostId)
          .map((m) => m.personId);
        const newMemberIds = assignments.filter((a) => a.teamId === team.id).map((a) => a.personId);
        const allMemberIds = [...new Set([...existingMemberIds, ...newMemberIds])];

        if (allMemberIds.length === 0) continue;

        // Build a name lookup from assignments + existing team members
        const memberNameMap = new Map<string, string>();
        for (const a of assignments) {
          memberNameMap.set(a.personId, a.personName);
        }

        // Round-robin distribute items among team members
        for (let i = 0; i < unassignedItems.length; i++) {
          const item = unassignedItems[i];
          const personId = allMemberIds[i % allMemberIds.length];

          await tx.assignment.create({
            data: {
              itemId: item.id,
              personId,
            },
          });

          await tx.item.update({
            where: { id: item.id },
            data: { status: 'ASSIGNED' },
          });

          itemAssignments.push({
            itemId: item.id,
            itemName: item.name,
            personId,
            personName: memberNameMap.get(personId) || 'Team member',
            teamName: teams.find((t) => t.id === team.id)?.name || '',
          });
        }
      }

      // GTC-201 — ONE WHY FOR THE BATCH (ruled 2026-08-03, option (a)).
      //
      // Post-send, every assignment this creates is a T1: a person is now being asked
      // for something they were not asked for before (Hinge §2 — "adding a person with
      // an assignment post-send touches someone, so it carries its why"). There is no
      // natural place for the host to give N separate whys, so the batch carries one,
      // in the shape restoreFromRevision already uses: one changeSetId, one reason, N
      // entries, each flagged reasonRequired by the rule.
      //
      // A SYSTEM-AUTHORED REASON WAS EXPLICITLY REJECTED. This route computes a
      // per-assignment rationale ("Even distribution (3 members before assignment)")
      // and it would have been easy to write that into `reason`. It is true, and it is
      // the wrong thing: the ledger is Kate's memory (Hinge §2 — "the reason is not
      // compliance — it's her own memory"), and a generated string that LOOKS like an
      // answer makes the gap invisible. An honest null is better than a plausible lie.
      if (itemAssignments.length > 0) {
        await recordChange(tx, {
          eventId,
          actor: autoAssignActor,
          reason: body.reason ?? null,
          changes: itemAssignments.map((ia) => ({
            action: 'CREATE_ASSIGNMENT' as const,
            targetType: 'Assignment' as const,
            targetId: ia.itemId,
            before: null,
            after: { personId: ia.personId, personName: ia.personName, itemName: ia.itemName },
            context: { assignmentResponse: null },
          })),
        });
      }
    });

    // 6. Return success with assignment details
    return NextResponse.json({
      success: true,
      assigned: assignments.length,
      itemsAssigned: itemAssignments.length,
      assignments: assignments.map((a) => ({
        personName: a.personName,
        teamName: a.teamName,
        reason: a.reason,
      })),
      itemAssignments: itemAssignments.map((ia) => ({
        itemName: ia.itemName,
        personName: ia.personName,
        teamName: ia.teamName,
      })),
      summary: {
        totalUnassigned: unassignedParticipants.length,
        totalAssigned: assignments.length,
        totalItemsAssigned: itemAssignments.length,
        teamDistributions,
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
