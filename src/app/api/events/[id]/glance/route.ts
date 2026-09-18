// GET /api/events/[id]/glance
//
// GTC-192 (J1, phase 1) — the person-keyed read, over HTTP.
//
// Moment 4 §10.8 fixes the shape: "People are the boxes; items live inside the person."
// The chosen design keeps that and changes the geometry — card = household = channel,
// strip = person = state — so this returns household cards with no colour of their own.
//
// THIS ROUTE ASSEMBLES NOTHING. Every derivation lives in `readEventGlance`
// (`src/lib/glance/read.ts`) and `src/lib/glance/state.ts`, which are client-safe, so
// phase 2's screen can render the same colours this returns rather than a second
// definition that drifts. `tests/glance-read-test.ts` asserts that structurally.
//
// HOST-SCOPED, LIKE THE PRE-FLIGHT IT SITS BESIDE. This is Kate's board: it names every
// guest and what each of them has and has not decided. `requireEventRole(['HOST',
// 'COHOST'])` is the same guard `/api/events/[id]/pre-flight` (GTC-188, I1) uses for the
// same reason, and the corresponding `route-classifications.json` entry is held true by
// the `route auth` assertions in the test rather than asserted only in the data file.
//
// ⚠ THIS IS NOT "WHERE THE SCREEN LIVES". That question — the Moment 4 screen's own route
// and entry point — is still open on GTC-192 and is NOT answered by this endpoint's path.
// Phase 2 may call `readEventGlance` directly from a server component instead; both doors
// reach one assembly.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { readEventGlance } from '@/lib/glance/read';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const glance = await readEventGlance(prisma, eventId);
    return NextResponse.json(glance);
  } catch (error) {
    // `readEventGlance` uses findUniqueOrThrow for the event, so a bad id lands here
    // rather than returning a half-assembled board.
    if ((error as { code?: string }).code === 'P2025') {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    console.error('[Glance] Failed to assemble the board', { eventId, error });
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
