// POST /api/events/[id]/glance/seen
//
// GTC-192 (J1, phase 6, slice 6b) — the replay's memory, written.
//
// Ruling 6: "'Seen' means the replay played" — no acknowledge button, no inbox mechanics. This
// is the endpoint that sentence becomes. 6b ships the route and the page's use of it; the
// client's "the replay finished" call arrives in 6c, when there is an animation to finish.
//
// ── IT READS NOTHING FROM THE REQUEST, AND THAT IS THE POINT ──────────────────────────────
//
// No request payload is parsed, because a caller-supplied instant is a way to break the replay
// from a browser tab: send tomorrow and the memory silences every future arrival; send 1970 and
// every visit replays the whole event. The instant is the server's, always — see
// `stampGlanceSeen`, which is where `new Date()` lives. `tests/glance-replay-test.ts` asserts on
// this source that nothing is read from the request, and drives the route with a payload to
// prove it is ignored rather than merely unread.
//
// ── HOST-SCOPED, THROUGH THE SAME GUARD, UNMODIFIED ───────────────────────────────────────
//
// `requireEventRole(eventId, ['HOST', 'COHOST'])` is byte-for-byte what the GET and the page
// already use. Do-Not-Touch Zone 1 covers `src/lib/auth*`; a second role check living in this
// file is how the three would drift. A COORDINATOR is refused 403 by that guard and the test
// proves it, because "the glance is Kate's board" has to be true of the write as well as the
// read.
//
// ── A ROUTE, NOT A SERVER ACTION, DELIBERATELY ────────────────────────────────────────────
//
// A server action would be less code and would be invisible to every guard this repo has:
// `route-classifications.json` would not list it, the inventory gate would not count it, and
// `test:security`'s auth sweep would never see it. The API surface is the thing that gets
// audited, so a write that carries the host's memory belongs on it.
//
// ⚠ THIS IS THE ROUTE THAT TAKES THE SURFACE FROM 80 TO 81. Phases 1-4 added none; that
// property ends here, once, on purpose.
//
// ── THE WRITE ITSELF IS NOT HERE ──────────────────────────────────────────────────────────
//
// `stampGlanceSeen` (`src/lib/glance/replay-entry.ts`) owns it, because 6b has two callers —
// this route and the page — and a monotonic guard copied into both can be weakened in one of
// them with nothing failing. Ruling 20's `userId` scope is asserted there, once.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { stampGlanceSeen } from '@/lib/glance/replay-entry';

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  // Whether a row moved, never the instant it moved to. The caller has no use for the value
  // and putting a timestamp on the wire is the habit the replay's own fence exists to break.
  const stamped = await stampGlanceSeen(prisma, auth.user.id, eventId);
  return NextResponse.json({ stamped });
}
