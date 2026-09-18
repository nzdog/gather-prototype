import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';
import { logInviteEvent } from '@/lib/invite-events';
import { deriveAttendance, isAttendanceAskable, parseAssignmentResponse } from '@/lib/attendance';
import { resolveCarriedSubjects } from '@/lib/eligibility/carried-answer';

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
 * GTC-191 (a) — AND IT NOW TAKES A CARRIED ANSWER. GTC-189 ruling D item 3: the message sent
 * to a household contact names a child's item and asks her to answer on their behalf, and
 * this route refused it, because the row is not hers.
 *
 * ⚠ DO-NOT-TOUCH ZONE 3, ENTERED UNDER APPROVAL (founder, 2026-09-18). This is a PARTICIPANT
 * token authorising a write to another person's `Assignment`. Nothing about the token changes
 * — no new scope, no issuance, no schema. What changes is the reach, and the reach is decided
 * by `resolveCarriedSubjects`, which re-runs `chooseAskRoute`: the same function that decided
 * to put the child's ask in her message. If the chooser would not carry the ask to her, this
 * route will not take her answer to it. `tests/carried-answer-test.ts` layer F walks the five
 * refusals from one real token.
 *
 * ⚠ AND THE WRITE REACHES `Assignment.response` AND NOTHING ELSE. It must never touch the
 * child's `PersonEvent.attendanceAnswer`: a child's attendance is asked nowhere in the model
 * (founder ruling, 2026-09-18 — "a child's no raises nothing"), and keeping it unreachable is
 * what makes that a fact about the code rather than a convention of the screen.
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

  /*
   * GTC-191 (a) — WHO THIS TOKEN MAY ANSWER FOR.
   *
   * Her own row always. A child's row only where `resolveCarriedSubjects` — the chooser,
   * re-run — says her message carries them. Read here, checked again inside the transaction
   * against the row as it then stands, so a reassignment between the two fails closed.
   *
   * The resolver is skipped entirely when the row is already hers, so the ordinary guest's
   * tap costs exactly what it cost before this ticket.
   */
  const subject = await prisma.assignment.findUnique({
    where: { id: assignmentId },
    select: { personId: true },
  });

  if (!subject) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  const isOwn = subject.personId === resolvedContext.person.id;
  const carried = isOwn
    ? []
    : await resolveCarriedSubjects(prisma, resolvedContext.event.id, resolvedContext.person.id);
  const onBehalfOf = carried.find((c) => c.personId === subject.personId) ?? null;

  if (!isOwn && !onBehalfOf) {
    /*
     * 403 AND NOT 404, AND THE DIFFERENCE IS THE POINT. A 404 says "no such row"; this row
     * exists and is somebody's. Collapsing the two would hide the only case worth telling
     * apart — a token reaching past the person it was issued for. The 404 above is kept for a
     * row that is nobody's.
     */
    return NextResponse.json({ error: 'That is not yours to answer.' }, { status: 403 });
  }

  const answerableFor = new Set([resolvedContext.person.id, ...carried.map((c) => c.personId)]);

  // Update response inside transaction
  const result = await prisma.$transaction(async (tx) => {
    const assignment = await tx.assignment.findUnique({
      where: { id: assignmentId },
      include: { item: true },
    });

    // Verify assignment exists and is one this token may answer for — hers, or a child's
    // whose ask her message carries.
    if (!assignment) {
      return { found: false, allowed: true };
    }
    if (!answerableFor.has(assignment.personId)) {
      return { found: true, allowed: false };
    }

    // If response unchanged, do nothing (idempotent)
    if (assignment.response === response) {
      return { found: true, allowed: true, changed: false };
    }

    const previousResponse = assignment.response;

    // Update response and log
    await tx.assignment.update({
      where: { id: assignmentId },
      data: { response },
    });

    const verb =
      response === 'ACCEPTED' ? 'Accepted' : response === 'DECLINED' ? 'Declined' : 'Maybe on';

    /*
     * GTC-191 (a): THE LINE NAMES BOTH PEOPLE. `actorId` is the carrier — she is who acted —
     * and `targetId` is the child's `Assignment`. Without the name in `details`, a carried
     * answer and her own read identically in the ledger, and the one fact worth keeping about
     * a carried answer is on whose behalf it was given.
     */
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
      details: onBehalfOf
        ? `${verb} assignment for item ${assignment.itemId} on behalf of ${onBehalfOf.name}`
        : `${verb} assignment for item ${assignment.itemId}`,
    });

    return {
      found: true,
      allowed: true,
      changed: true,
      item: assignment.item,
      previousResponse,
    };
  });

  // Track response submission (non-blocking)
  if (result.found && result.changed && result.item) {
    logInviteEvent({
      eventId: resolvedContext.event.id,
      // The RECIPIENT's engagement is what this tracks, and the recipient is the token
      // holder whether the row was hers or a child's. Whose row moved is the metadata.
      personId: resolvedContext.person.id,
      type: 'RESPONSE_SUBMITTED',
      metadata: {
        itemId: result.item.id,
        itemName: result.item.name,
        response: response,
        previousResponse: result.previousResponse,
        ...(onBehalfOf
          ? { onBehalfOfPersonId: onBehalfOf.personId, onBehalfOfName: onBehalfOf.name }
          : {}),
      },
    }).catch((err) => console.error('[ResponseTracking] Failed to log:', err));
  }

  if (!result.found) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
  }

  // The row was reassigned between the read above and the transaction, to somebody this
  // token may not answer for. Same refusal as before the transaction, for the same reason.
  if (!result.allowed) {
    return NextResponse.json({ error: 'That is not yours to answer.' }, { status: 403 });
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
