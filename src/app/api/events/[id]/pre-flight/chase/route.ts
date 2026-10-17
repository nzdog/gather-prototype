// PATCH /api/events/[id]/pre-flight/chase
//
// GTC-311 — the write side of the chase channel: the event-level switch and the per-person named
// exception ([[GTC-189]] rulings AH and AL).
//
//   { chaseWhenNoMobileDefault }         → Event.chaseWhenNoMobileDefault
//   { personEventId, chaseException }    → PersonEvent.chaseException
//
// This route guards, reads the body and answers. What may be written, and the refusals, are
// `writeChaseChoice` in `src/lib/preflight/chase-choice.ts`, which re-reads the event through the
// pre-flight's own preview so the screen and this gate cannot disagree.
//
// STORES ONLY. Nothing here sends.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { writeChaseChoice } from '@/lib/preflight/chase-choice';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);
    const result = await writeChaseChoice(
      prisma,
      eventId,
      body,
      process.env.NEXT_PUBLIC_APP_URL || ''
    );
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Error saving the chase channel:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
