// GET   /api/events/[id]/pre-flight/message — the ingredients for step 4
// PATCH /api/events/[id]/pre-flight/message — stores the host's movement 1
//
// GTC-187 (H2) — the ingredients for step 4 of the pre-flight, "the message, shown".
// GTC-260 — the read and the write of `Event.askAuthorLine`, the column GTC-259 added
// and deliberately left unwired.
// GTC-189 slice 3 — the preview shows what the press will do. Who is messaged, on which
// channel, carrying which child's ask, and who is a line on the host's list instead, is
// `readAskPreview` in `src/lib/preflight/ask-preview.ts`, which routes every membership
// through slice 1's chooser. This route guards, reads and answers — it assembles nothing,
// the arrangement the glance route has with `readEventGlance`.
//
// THIS ROUTE COMPOSES NOTHING. The screen composes through `composePreview` in
// `src/lib/preflight/ask-preview-compose.ts`, which calls `composeAsk`. That is deliberate
// and is the same arrangement GTC-188 made for the nudge clock: the composer is client-safe
// precisely so the screen renders the message the send will produce rather than a
// server-rendered picture of it, and so the host's edit to movement 1 re-composes live
// through the same function the dispatch path (GTC-189) will call.
//
// NOTHING HERE SENDS, and nothing here issues a token. `ensureEventTokens` runs at the
// transition to CONFIRMING (`transitionToConfirming` in src/lib/workflow.ts) and again at
// the press, which is GTC-189's.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { readAskPreview } from '@/lib/preflight/ask-preview';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const preview = await readAskPreview(prisma, eventId, process.env.NEXT_PUBLIC_APP_URL || '');
    if (!preview) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    return NextResponse.json(preview);
  } catch (error) {
    console.error('Error assembling pre-flight message:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH — stores the host's movement 1. GTC-260.
 *
 *   { askAuthorLine: string | null }  →  Event.askAuthorLine
 *
 * ONE VALUE, LAST WRITE WINS (GTC-187, 2026-08-29). An edit at mini-send time overwrites;
 * no per-send version lives on the column. What each recipient actually received is a
 * different record and is GTC-189's to decide.
 *
 * ⚠ THREE STATES, AND THIS HANDLER'S JOB IS TO KEEP THEM DISTINCT (founder ruling,
 * 2026-08-29). NULL and `''` are different facts:
 *
 *   null   →  never authored        →  composition falls through to the generated draft
 *   ''     →  deliberately no line  →  the bare greeting, "Hi Rob,", and NO draft
 *   value  →  her words             →  "Hi Rob - <value>"
 *
 * The read is `storedAuthorLine ?? draftAuthorLine(event)`, and `??` falls through on null
 * but not on `''` — one expression, all three states, no branching needed downstream.
 *
 * ⚠ DO NOT COLLAPSE `''` TO NULL. An earlier rule the same day required exactly that, on the
 * grounds that a stored `''` suppresses the draft. It does — but suppressing the draft is the
 * point, not the bug. `authorLineFor`'s own comment already treats the blank case as
 * deliberate ("hers to cut to nothing"), and Hinge §5 makes the handover the load-bearing
 * beat, not movement 1's length: a host sending to sixty people, or re-sending after she has
 * said her piece, must be able to decline to speak without Gather's words standing in for
 * hers. The superseded rule is kept in prisma/schema.prisma and GTC-259 with its reason.
 *
 * WHITESPACE-ONLY NORMALISES TO `''`, NOT TO NULL. `authorLineFor` trims before deciding, so
 * `'   '` composes identically to `''` — storing it verbatim would be a fourth spelling of
 * the third state. Values are stored trimmed. The column therefore holds exactly NULL, `''`,
 * or a trimmed non-empty string.
 *
 * Normalised HERE, at the one write site, rather than at the read — so nothing downstream
 * has to remember, and the read stays a plain `??`.
 *
 * NO LENGTH CAP, deliberately. GTC-187 decision 6: "no enforced cap ... do not truncate, do
 * not block". The pre-flight already shows the segment count so the cost is visible, which is
 * what that decision asks for instead. Matches `EventSetup.otherNotes` and the other free-text
 * fields, none of which cap.
 *
 * Deliberately NOT the event PATCH at /api/events/[id], for the reason the cadence route
 * records: that route rebuilds a whole update object with `|| null` defaults, so a one-field
 * PATCH there would clear venue and occasion fields as a side effect.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object' || !('askAuthorLine' in body)) {
      return NextResponse.json({ error: 'askAuthorLine is required' }, { status: 400 });
    }

    const raw = (body as { askAuthorLine: unknown }).askAuthorLine;
    if (raw !== null && typeof raw !== 'string') {
      return NextResponse.json(
        { error: 'askAuthorLine must be a string or null' },
        { status: 400 }
      );
    }

    // Trim, and PRESERVE `''` — the three states, see above. `null` stays null; a string
    // becomes its trimmed self, which is `''` when it was blank or whitespace-only.
    const askAuthorLine = raw === null ? null : raw.trim();

    const event = await prisma.event.update({
      where: { id: eventId },
      data: { askAuthorLine },
      select: { askAuthorLine: true },
    });

    return NextResponse.json({ storedAuthorLine: event.askAuthorLine });
  } catch (error) {
    console.error('Error storing the host author line:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
