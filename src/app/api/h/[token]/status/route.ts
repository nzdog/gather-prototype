import { NextRequest, NextResponse } from 'next/server';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logAudit } from '@/lib/workflow';

/**
 * PATCH /api/h/[token]/status
 *
 * Updates the host-editable guest count.
 *
 * GTC-169 (A3a) — THE STATUS BRANCH WAS DELETED, including the FROZEN → CONFIRMING
 * "unfreeze" path, its mandatory `unfreezeReason`, and the `OVERRIDE_UNFREEZE` audit
 * entry.
 *
 * Hinge §2 rules recall out at the mechanism level: "there is no unsend for the
 * disaster case... The old FROZEN→CONFIRMING unfreeze path dies with FROZEN in the
 * state-machine reconciliation." A wrong send is recovered forwards — the host fixes
 * the date and everyone is re-asked against the correction (Moment 4 §8.5, built by
 * GTC-183 / F1) — never by pretending the send did not happen.
 *
 * The one authored transition that survives (DRAFT → CONFIRMING) lives on
 * /api/events/[id]/transition, which is a plan-building act on the host dashboard,
 * not something the token view drives.
 *
 * The path is unchanged so the token-route surface stays stable; GTC-198 (A3d)
 * migrates the caller.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params;
  const resolvedContext = await resolveToken(token);

  if (!resolvedContext || resolvedContext.scope !== 'HOST') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { guestCount } = body;

  if (guestCount === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const event = await tx.event.update({
      where: { id: resolvedContext.event.id },
      data: { guestCount },
    });

    await logAudit(tx, {
      eventId: resolvedContext.event.id,
      actorId: resolvedContext.person.id,
      actionType: 'EDIT_EVENT',
      targetType: 'Event',
      targetId: resolvedContext.event.id,
      details: `Changed guest count to ${guestCount}`,
    });

    return event;
  });

  return NextResponse.json({ event: updated });
}
