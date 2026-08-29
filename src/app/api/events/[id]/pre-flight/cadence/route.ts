// PATCH /api/events/[id]/pre-flight/cadence
//
// GTC-188 (I1) — the write side of BOTH of E2's cadence controls (GTC-179).
//
//   { nudgePace }                   → Event.nudgePace          (per-EVENT pace)
//   { personEventId, nudgeMark }    → PersonEvent.nudgeMark    (per-PERSON mark)
//
// Both live on this screen by GTC-179's Ruling 8: the household picker is ONE decision
// per household and the mark is PER PERSON, so putting marks beside the picker at
// Moment 1 builds the matrix §10.7 refuses. ⚠ Moment 4 §10.3 and §10.7 still read the
// old way and are not edited; do not re-derive the Moment 1 placement from them.
//
// NULL CLEARS. Neither column has a "normal" sentinel — null is "no opinion", which is a
// different fact from either value and is what lets an unmarked person defer to the
// event's pace. `undefined` (key absent) leaves the column alone.
//
// This route only STORES. The composition is quieter-wins and lives in
// `resolveNudgeOffsetDays`; nothing here may reproduce it.
//
// Deliberately NOT the event PATCH at /api/events/[id]: that route rebuilds a whole
// update object with `|| null` defaults, so a one-field PATCH there would clear venue and
// occasion fields as a side effect.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { NUDGE_PACE_OFFSET_DAYS, NUDGE_MARK_OFFSET_DAYS } from '@/lib/nudge-cadence';

// The vocabularies come from the module, not from @prisma/client: nudge-cadence.ts is
// the source and the Prisma enums are the copy (schema-follows-module). Validating
// against the module means this route cannot drift from the resolver that reads it.
const PACES = Object.keys(NUDGE_PACE_OFFSET_DAYS);
const MARKS = Object.keys(NUDGE_MARK_OFFSET_DAYS);

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    if ('nudgePace' in body) {
      const pace = body.nudgePace;
      if (pace !== null && !PACES.includes(pace)) {
        return NextResponse.json(
          { error: `nudgePace must be one of ${PACES.join(', ')}, or null` },
          { status: 400 }
        );
      }
      await prisma.event.update({
        where: { id: eventId },
        data: { nudgePace: pace },
      });
    }

    if ('nudgeMark' in body || 'personEventId' in body) {
      const { personEventId, nudgeMark } = body;
      if (typeof personEventId !== 'string' || !personEventId) {
        return NextResponse.json(
          { error: 'personEventId is required when setting nudgeMark' },
          { status: 400 }
        );
      }
      if (nudgeMark !== null && !MARKS.includes(nudgeMark)) {
        return NextResponse.json(
          { error: `nudgeMark must be one of ${MARKS.join(', ')}, or null` },
          { status: 400 }
        );
      }
      // Scope the write to this event. A bare update by id would let a host of one
      // event mark somebody in another.
      const updated = await prisma.personEvent.updateMany({
        where: { id: personEventId, eventId },
        data: { nudgeMark },
      });
      if (updated.count === 0) {
        return NextResponse.json({ error: 'Person is not part of this event' }, { status: 404 });
      }
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { nudgePace: true },
    });

    return NextResponse.json({ ok: true, nudgePace: event?.nudgePace ?? null });
  } catch (error) {
    console.error('Error saving cadence control:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
