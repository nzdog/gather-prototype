/**
 * GTC-192 (J1, phase 2) — where the glance lives, for now.
 *
 * `/plan/[eventId]/glance`. URL-ONLY: nothing links to it. The V1 dashboard
 * (`src/app/plan/[eventId]/page.tsx`) is explicitly out of this phase's scope and is not
 * touched, so the entry point is a URL a host is given rather than a tab she finds.
 *
 * ⚠ THIS IS STILL NOT AN ANSWER TO "WHERE THE SCREEN LIVES". That decision is recorded as
 * open on GTC-192 and stays open: this is the address phase 2 needs in order to be looked
 * at, chosen for being unmistakably outside V1 rather than for being right.
 *
 * ── SERVER COMPONENT, READING THE MODULE — the question phase 1 left open ──────
 *
 * Phase 1 built both doors and did not choose. Phase 2 chooses the module, and the reason
 * is the four-second contract itself (§3): a client fetch renders an empty frame first, so
 * the four seconds start over when the data lands. A server component has the board right
 * in the first paint.
 *
 * The HTTP route (`/api/events/[id]/glance`) is not thereby vestigial — it is what Ruling
 * 10's ~20-second polling will refresh from in phase 6, which is a job a server component
 * cannot do. First paint from the module, refreshes from the route, ONE assembly behind
 * both: `readEventGlance`.
 *
 * ── AUTH ──────────────────────────────────────────────────────────────────────
 *
 * `requireEventRole` is reused exactly as the route uses it, unmodified — Do-Not-Touch
 * Zone 1 covers `src/lib/auth*`, and a second copy of the role check living in a page is
 * how the two would drift. It returns a `NextResponse` on refusal, which a page cannot
 * return; the refusal is converted to `notFound()` rather than to a message, so an event
 * the caller may not see is indistinguishable from one that does not exist.
 */

import { NextResponse } from 'next/server';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { readEventGlance } from '@/lib/glance/read';
import GlanceBoard from '@/components/glance/GlanceBoard';

export default async function GlancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) notFound();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { name: true },
  });
  if (!event) notFound();

  const glance = await readEventGlance(prisma, eventId);

  return (
    <div className="min-h-screen bg-[#efede6]">
      <GlanceBoard glance={glance} eventName={event.name} />
    </div>
  );
}
