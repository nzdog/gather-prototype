import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ensureEventTokens } from '@/lib/tokens';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { normalizePhoneNumber } from '@/lib/phone';
import { isHostMembership } from '@/lib/eligibility/host-exclusion';

// PATCH /api/events/[id]/people/[personId] - Update person (role, team)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const { id: eventId, personId } = await context.params;

    // SECURITY: Require HOST or COORDINATOR role to update people
    const auth = await requireEventRole(eventId, ['HOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { role, teamId, name, email, phoneNumber } = body;

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
      return NextResponse.json({ error: 'Person is not part of this event' }, { status: 404 });
    }

    /*
     * GTC-256 (phase 3) — THE HOST'S ROLE IS NOT WRITABLE. Sibling of the
     * HOST_NOT_REMOVABLE guard on the DELETE below, and it closes the same door.
     *
     * Phase 2 guarded removal and left this open, on the strength of `PeopleSection`
     * disabling her role control — which is markup, and `personId` comes from the URL.
     * The consequence was not cosmetic: setting her role to PARTICIPANT made
     * `ensureEventTokens` (called at the foot of this handler) mint her a PARTICIPANT
     * token, and that token was never revoked, so she became a live auto-nudge and
     * decide-by recipient and a claimable name — permanently, from one call.
     *
     * BOTH HALVES SHIPPED TOGETHER, AND NEITHER IS SUFFICIENT ALONE. This guard stops the
     * write; `ensureEventTokens` now revokes a PARTICIPANT token held by a role-HOST row,
     * which is what protects events that already took the write and any route that
     * reaches a role change by another door.
     *
     * Only the ROLE is refused. Name, email, phone and team on her row stay editable —
     * Ruling 9 needs the team write, since item choice is bounded by team membership.
     */
    const eventForHost = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true },
    });

    if (
      role !== undefined &&
      role !== personEvent.role &&
      eventForHost &&
      isHostMembership({ personId, role: personEvent.role }, eventForHost.hostId)
    ) {
      return NextResponse.json(
        {
          error: 'HOST_ROLE_NOT_CHANGEABLE',
          message:
            "The host's role cannot be changed on her own event (GTC-256 Ruling 5/8). " +
            'Her membership carries role HOST so that no participant token is issued to her.',
        },
        { status: 409 }
      );
    }

    // Update Person fields if provided (name, email, phoneNumber)
    const personUpdateData: Record<string, unknown> = {};
    if (name !== undefined) personUpdateData.name = name;
    if (email !== undefined) personUpdateData.email = email || null;
    if (phoneNumber !== undefined) {
      personUpdateData.phoneNumber = phoneNumber ? normalizePhoneNumber(phoneNumber) : null;
    }

    if (Object.keys(personUpdateData).length > 0) {
      await prisma.person.update({
        where: { id: personId },
        data: personUpdateData,
      });
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

    // Determine final role and teamId
    const finalRole = role !== undefined ? role : personEvent.role;
    const finalTeamId = 'teamId' in body ? teamId : personEvent.teamId;

    // Track coordinator changes for user notification
    let demotedCoordinator: { name: string; teamName: string } | null = null;

    // If person is being assigned as COORDINATOR to a team, handle coordinator transition
    if (finalRole === 'COORDINATOR' && finalTeamId) {
      // First, delete ANY existing coordinator token for this team (belt and suspenders)
      await prisma.accessToken.deleteMany({
        where: {
          eventId,
          teamId: finalTeamId,
          scope: 'COORDINATOR',
        },
      });

      // Find the current coordinator of this team (if any)
      const currentCoordinator = await prisma.personEvent.findFirst({
        where: {
          eventId,
          teamId: finalTeamId,
          role: 'COORDINATOR',
          personId: { not: personId }, // Don't include the person we're updating
        },
        include: {
          person: true,
          team: true,
        },
      });

      // If there's already a coordinator, demote them to PARTICIPANT
      if (currentCoordinator) {
        await prisma.personEvent.update({
          where: {
            personId_eventId: {
              personId: currentCoordinator.personId,
              eventId,
            },
          },
          data: {
            role: 'PARTICIPANT',
          },
        });

        demotedCoordinator = {
          name: currentCoordinator.person.name,
          teamName: currentCoordinator.team?.name || 'Unknown Team',
        };
      }

      // Update the team's coordinatorId
      await prisma.team.update({
        where: { id: finalTeamId },
        data: { coordinatorId: personId },
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
        role: finalRole,
        teamId: finalTeamId,
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

    // Handle access token updates when role or team changes
    const roleChanged = role !== undefined && role !== personEvent.role;
    const teamChanged = 'teamId' in body && teamId !== personEvent.teamId;

    if (roleChanged || teamChanged) {
      // Clean up old tokens based on role changes
      if (roleChanged) {
        if (finalRole === 'COORDINATOR' && personEvent.role === 'PARTICIPANT') {
          // Promoted to coordinator - delete old PARTICIPANT token
          await prisma.accessToken.deleteMany({
            where: {
              personId,
              eventId,
              scope: 'PARTICIPANT',
            },
          });
        } else if (personEvent.role === 'COORDINATOR' && finalRole === 'PARTICIPANT') {
          // Demoted from coordinator - delete old COORDINATOR token
          await prisma.accessToken.deleteMany({
            where: {
              personId,
              eventId,
              scope: 'COORDINATOR',
            },
          });
        }
      }

      // If coordinator is moving teams, delete their old coordinator token
      if (finalRole === 'COORDINATOR' && teamChanged) {
        await prisma.accessToken.deleteMany({
          where: {
            personId,
            eventId,
            scope: 'COORDINATOR',
          },
        });
      }

      // Create new tokens for the updated roles/teams
      await ensureEventTokens(eventId);
    }

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
      demotedCoordinator,
    });
  } catch (error: any) {
    console.error('Error updating person:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/events/[id]/people/[personId] - Remove person from event
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string; personId: string }> }
) {
  try {
    const { id: eventId, personId } = await context.params;

    // SECURITY: Require HOST or COORDINATOR role to remove people
    const auth = await requireEventRole(eventId, ['HOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    // GTC-202: the why, when there is one.
    //
    // This is the ONLY route that fires T2 — a trigger Hinge §2 names by name
    // ("reassignment, removal, …") — and until now it was the only T-firing route with
    // no way to carry a reason, which made T2 structurally unanswerable.
    //
    // Optional, and never a 400: plan §13.1, endorsed — "required" means the flow asks,
    // never that the server rejects. A bodyless DELETE still works.
    const body = await request.json().catch(() => ({}) as { reason?: string });
    const reason =
      typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason : null;

    /*
     * GTC-256 (phase 2) — THE HOST CANNOT BE REMOVED FROM HER OWN EVENT.
     *
     * Before phase 2 this was unreachable on a Moment-flow event for the dullest of
     * reasons: there was no host membership row to remove. Phase 2 writes one (Rulings 1,
     * 8, 10), so this route — which deletes the PersonEvent AND its access tokens —
     * becomes a one-click way to undo it, taking her NudgeLog rows with it and leaving
     * the households POST refusing every further household on the event via the sequence
     * guarantee. `PeopleSection` already disables her ROLE control but still renders the
     * remove button, so the durable guard is here rather than in the markup.
     *
     * Matched on `role: HOST` and on `Event.hostId` both, because they are the same row
     * under Ruling 10 and either alone would be a narrower promise than "the host stays".
     */
    const targetMembership = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId, eventId } },
      select: { role: true, event: { select: { hostId: true } } },
    });
    if (targetMembership?.role === 'HOST' || targetMembership?.event.hostId === personId) {
      return NextResponse.json(
        {
          error: 'The host cannot be removed from their own event.',
          code: 'HOST_NOT_REMOVABLE',
        },
        { status: 409 }
      );
    }

    const removalActor = await ledgerActorForUser(auth.user, auth.role);

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

      // 3. Clear coordinator assignments for teams where this person was coordinator
      await tx.team.updateMany({
        where: {
          eventId,
          coordinatorId: personId,
        },
        data: {
          coordinatorId: null,
        },
      });

      // 4. Delete access tokens for this person in this event
      await tx.accessToken.deleteMany({
        where: { personId, eventId },
      });

      // 5. Delete PersonEvent (membership)
      await tx.personEvent.deleteMany({
        where: { personId, eventId },
      });

      // T2 — removing someone who is HOLDING something touches them: their asks
      // disappear, and the count is what decides it. Removing a guest who holds
      // nothing touches nobody and is never interrogated.
      //
      // This route removes people INLINE. GTC-196 wired the same T2 into a
      // workflow.removePerson() helper "so every caller inherits it", but that helper
      // had no callers and was deleted by GTC-202 — this is the implementation that
      // actually runs, and the only one.
      await recordChange(tx, {
        eventId,
        actor: removalActor,
        reason,
        changes: [
          {
            action: 'REMOVE_PERSON',
            targetType: 'PersonEvent',
            targetId: personId,
            before: { personId, heldAssignments: assignments.length },
            after: null,
            context: { heldAssignmentCount: assignments.length },
          },
        ],
      });
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error removing person:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
