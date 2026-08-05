import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { logInviteEvent } from '@/lib/invite-events';
import { deriveAttendance, isAttendanceAskable, parseAssignmentResponse } from '@/lib/attendance';

/**
 * POST /api/p/[token]/ack/[assignmentId]
 *
 * Records the participant's response to an item ask: accept, decline, or maybe.
 *
 * GTC-174 (D1) — THIS TAP IS NOW THE WHOLE ASK. Hinge §3: the tap is the item ask and
 * attendance is inferred from it, so this route no longer records half a decision. It
 * carries the third way (MAYBE, §8 — "a decision to decide later") and returns the
 * derived attendance so the caller can render the conditional no-follow-up without a
 * second round-trip.
 *
 * CRITICAL: Idempotent + race-safe implementation.
 * - Ownership check performed inside transaction
 * - Allows response changes (PENDING → ACCEPTED, PENDING → MAYBE, MAYBE → DECLINED, …)
 * - Audit logged on response change
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string; assignmentId: string }> }
) {
  const { token, assignmentId } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'PARTICIPANT') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // GTC-169 (A3a) — SEMANTIC INVERSION. This route used to 400 with "Plan is frozen
  // — responses are locked" once the host froze the plan. That is backwards: after
  // the send is precisely when guests are supposed to respond.
  //
  // Moment 4 §7: "Responses, claims, and reassignments-with-reasons are not the plan
  // changing; they are the plan being answered. Greens keep accumulating after the
  // send — that's the Moment working, not a mutation of the locked plan."
  //
  // There is no lifecycle gate here, by design.

  // Parse request body for response type
  const body = await request.json();
  const response = parseAssignmentResponse(body?.response);

  if (response === null) {
    return NextResponse.json(
      { error: 'Invalid response. Must be ACCEPTED, DECLINED or MAYBE' },
      { status: 400 }
    );
  }

  // Update response inside transaction
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: { item: true },
    });

    // Verify assignment exists and belongs to this participant
    if (!assignment || assignment.personId !== resolvedContext.person.id) {
      return { found: false };
    }

    // If response unchanged, do nothing (idempotent)
    if (assignment.response === response) {
      return { found: true, changed: false };
    }

    const previousResponse = assignment.response;

    // Update response and log
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { response },
    });

    const verb =
      response === 'ACCEPTED' ? 'Accepted' : response === 'DECLINED' ? 'Declined' : 'Maybe on';

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType:
        response === 'ACCEPTED'
          ? 'ACCEPT_ASSIGNMENT'
          : response === 'DECLINED'
            ? 'DECLINE_ASSIGNMENT'
            : 'MAYBE_ASSIGNMENT',
      targetType: 'Assignment',
      targetId: assignmentId,
      details: `${verb} assignment for item ${assignment.itemId}`,
    });

    return {
      found: true,
      changed: true,
      item: assignment.item,
      previousResponse,
    };
  });

  // Track response submission (non-blocking)
  if (result.found && result.changed && result.item) {
    logInviteEvent({
      eventId: resolvedContext.event.id,
      personId: resolvedContext.person.id,
      type: 'RESPONSE_SUBMITTED',
      metadata: {
        itemId: result.item.id,
        itemName: result.item.name,
        response: response,
        previousResponse: result.previousResponse,
      },
    }).catch((err) => console.error('[ResponseTracking] Failed to log:', err));
  }

  if (!result.found) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // GTC-174 (D1): hand back the inference the tap just produced. The client renders the
  // conditional no-follow-up off `attendanceAskable` (Hinge §3 — "in the same
  // interaction"), so it must not need a second round-trip to know whether to show it.
  const [assignments, personEvent] = await Promise.all([
    prisma.assignment.findMany({
      where: {
        personId: resolvedContext.person.id,
        item: { team: { eventId: resolvedContext.event.id } },
      },
      select: { response: true },
    }),
    prisma.personEvent.findFirst({
      where: { personId: resolvedContext.person.id, eventId: resolvedContext.event.id },
      select: { attendanceAnswer: true },
    }),
  ]);

  return NextResponse.json({
    success: true,
    attendance: deriveAttendance(assignments, personEvent?.attendanceAnswer ?? null),
    attendanceAskable: isAttendanceAskable(assignments),
  });
}
