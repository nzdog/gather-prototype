import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { ShareError, readShare, shareDish } from '@/lib/moment3/share-dish';

// POST /api/events/[id]/items/[itemId]/share - share one dish with another person
//
// [[GTC-472]] (the founder, 22 Nov 2026: "Assign more than one item to several people - eg, both
// mum and Joanna bring salad", then "I want to divide the dish being shared"). ONE ROUTE, TWO JOBS,
// chosen by the body:
//
//   { preview: true }                          shows the dish's rows and whether the amount
//                                              divides. Writes NOTHING.
//   { personId, rows: [...], reason }          makes a copy of the item directly under it, gives the
//                                              copy to the person, divides the amount and writes the
//                                              ledger: ONE transaction, all of it or none of it.
//
// The role guard is the assign route's, and so is the same-team rule (`mayHoldRow`, asked inside
// `shareDish`). Nothing here sends anything: no sender, queue or nudge is named in this file or in
// src/lib/moment3/share-dish.ts. The reason is OPTIONAL on the wire, as the assign route's is
// (GTC-196): a missing why is recorded as a gap, never rejected.
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> }
) {
  try {
    const { id: eventId, itemId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => null)) as {
      preview?: unknown;
      personId?: unknown;
      rows?: unknown;
      reason?: unknown;
    } | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'A JSON body is required' }, { status: 400 });
    }

    if (body.preview === true) {
      const preview = await readShare(prisma, { eventId, itemId });
      return NextResponse.json({ preview });
    }

    if (typeof body.personId !== 'string' || body.personId === '') {
      return NextResponse.json({ error: 'personId is required' }, { status: 400 });
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    const result = await shareDish(prisma, {
      eventId,
      itemId,
      personId: body.personId,
      actor,
      actorRole: auth.role,
      reason: typeof body.reason === 'string' ? body.reason : null,
      amounts: body.rows,
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    if (error instanceof ShareError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error('Error sharing item:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to share item' },
      { status: 500 }
    );
  }
}
