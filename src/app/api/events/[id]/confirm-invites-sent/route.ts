import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { logInviteEvent } from '@/lib/invite-events';
import { isAddressable } from '@/lib/eligibility/host-exclusion';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // SECURITY: Auth check MUST run first and MUST NOT be in try/catch that returns 500
  let auth;
  try {
    auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;
  } catch (authError) {
    console.error('Auth check error:', authError);
    return NextResponse.json(
      { error: 'Unauthorized', message: 'Authentication required' },
      { status: 401 }
    );
  }

  try {
    // Load event with people
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        people: {
          include: {
            person: {
              select: { id: true, name: true, inviteAnchorAt: true },
            },
          },
        },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // GTC-169 (A3a): the press happens ONCE. "The send happens once, for her...
    // experientially it is one act, one sentence, one handover" (Hinge §7).
    //
    // Freezing used to be what stopped a second press — after CONFIRMING → FROZEN
    // this route 400'd. Removing FROZEN removes that protection, so the idempotency
    // guard becomes explicit here rather than a side effect of a state machine.
    // People added afterwards get their own mini-send, not a re-press of the whole
    // event (Hinge §2, gap #5).
    if (event.sentAt) {
      return NextResponse.json({ error: 'This event has already been sent' }, { status: 400 });
    }

    // The plan must exist before it can be sent — a sequencing fact, not a gate on
    // the host's judgement.
    if (event.status !== 'CONFIRMING') {
      return NextResponse.json(
        { error: 'Can only confirm invites when event is in CONFIRMING status' },
        { status: 400 }
      );
    }

    const pressActor = await ledgerActorForUser(auth.user, 'HOST');
    const now = new Date();

    /*
     * GTC-256 (phase 3), RULING 5 — SHE IS NOT A RECIPIENT.
     *
     * Build decision 2 said three numbers need three answers; phase 2 narrowed it to one.
     * Three of the four counting sites moved to include her ON PURPOSE — the founder's
     * ruling was "let them move. She is at her own party, she is eating, the numbers
     * should say so" — and those are the HEADCOUNT numbers: `totalAdults` in
     * `buildPlanGenerationInput`, "X people coming", and the attendance totals. They stay
     * exactly as phase 2 left them.
     *
     * `recipients` is the fourth, and it is not a headcount. It records who the press
     * sent to, and Ruling 5 says she is not among them. Phase 2 carried the inconsistency
     * forward deliberately rather than resolving it by inference; this settles it.
     *
     * COUNTED THROUGH THE MODULE, NOT AS `length - 1`. A subtraction assumes exactly one
     * host row and silently produces a wrong number the moment a co-host row exists.
     *
     * ⚠ `totalPeople` BELOW IS DELIBERATELY NOT THIS NUMBER. It sits with `newAnchorsSet`
     * and `previouslyAnchored` and describes the STAMPING operation — how many rows had
     * their personal clock set — and her row IS stamped (founder answer 3, 2026-08-29:
     * "Leave sentAt alone. The token gate carries it."). Two different facts, two
     * different counts, and conflating them would make the anchor diagnostics lie.
     */
    const recipientCount = event.people.filter((pe) =>
      isAddressable({ personId: pe.personId, role: pe.role }, event.hostId)
    ).length;

    // Update event timestamp
    await prisma.event.update({
      where: { id: eventId },
      data: { sentAt: now },
    });

    // GTC-196 (A3b): the press stamps EVERY existing member's personal clock at once.
    // Hinge §7 — "Mechanically it may be many messages over an hour with retries;
    // experientially it is one act." One send date for the cohort; anyone added later
    // gets their own (isMiniSend = personEvent.sentAt > event.sentAt).
    await prisma.personEvent.updateMany({
      where: { eventId, sentAt: null },
      data: { sentAt: now },
    });

    // Set anchor for people who don't have one yet
    const peopleNeedingAnchor = event.people
      .filter((pe) => !pe.person.inviteAnchorAt)
      .map((pe) => pe.person.id);

    if (peopleNeedingAnchor.length > 0) {
      await prisma.person.updateMany({
        where: {
          id: { in: peopleNeedingAnchor },
        },
        data: { inviteAnchorAt: now },
      });
    }

    // Log the event
    await logInviteEvent({
      eventId,
      type: 'INVITE_SEND_CONFIRMED',
      metadata: {
        totalPeople: event.people.length,
        newAnchorsSet: peopleNeedingAnchor.length,
        previouslyAnchored: event.people.length - peopleNeedingAnchor.length,
      },
    });

    // THE PRESS ITSELF, as the ledger's first entry.
    //
    // Moment 4 §7: "The audit trail starts at the send." Everything after this is
    // versioned and, where it touches someone, interrogated. The entry that marks the
    // threshold should be in the history it opens.
    await prisma.$transaction((tx) =>
      recordChange(tx, {
        eventId,
        actor: pressActor,
        changes: [
          {
            action: 'SEND_PRESSED',
            targetType: 'Event',
            targetId: eventId,
            before: { sentAt: null },
            after: { sentAt: now.toISOString(), recipients: recipientCount },
          },
        ],
      })
    );

    return NextResponse.json({
      success: true,
      confirmedAt: now.toISOString(),
      peopleAnchored: peopleNeedingAnchor.length,
      totalPeople: event.people.length,
    });
  } catch (error) {
    console.error('Error confirming invites sent:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
