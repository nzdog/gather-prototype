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
import { readGlanceReplay, stampGlanceSeen } from '@/lib/glance/replay-entry';
import GlanceBoard from '@/components/glance/GlanceBoard';

export default async function GlancePage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) notFound();

  const now = new Date();

  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: {
      name: true,
      startDate: true,
      // Phase 6 slice 6b. The replay re-derives each person's state AS AT her last visit, and
      // that derivation takes the same event halves the live board does — the lifecycle facts
      // and the decide-by/cadence defaults. Selected here rather than re-read inside the door,
      // so the page makes one pass at the event rather than two.
      status: true,
      sentAt: true,
      endDate: true,
      decideByOffsetHours: true,
      nudgePace: true,
    },
  });
  if (!event) notFound();

  const glance = await readEventGlance(prisma, eventId, now);

  /*
    ── Phase 6 slice 6b — THE MEMORY, WRITTEN. NOTHING IS PLAYED YET. ──────────────────

    The replay is computed and then DISCARDED: 6b ships no island, no animation and no
    polling, and `GlanceBoard` below is byte-identical to what phase 4 shipped. Computing it
    here is what makes the stamp correct rather than unconditional.

    NOTHING TO PLAY → STAMP IMMEDIATELY, and that covers BOTH cases that produce an empty
    replay. NULL is a viewer who has never been shown this board's news: she is owed nothing,
    so the mark simply starts. An EMPTY DIFF is a viewer who has been away and missed nothing,
    which is most visits. They are different facts (the door keeps them apart, and treating
    null as a baseline would replay the whole event) but they earn the same answer.

    ⚠ AND WHEN THERE *IS* SOMETHING TO PLAY, 6b DOES NOT STAMP. Ruling 6 is that "'seen' means
    the replay played", and in 6b nothing plays — so stamping here would consume news before
    any animation exists to show it, and the first host to open the board in 6c would find her
    reversals already settled. It fails safe: it repeats rather than loses. 6c's completion
    call is what stamps that case, and it posts to the route this slice adds.
  */
  const viewer = await prisma.eventRole.findFirst({
    where: { userId: auth.user.id, eventId },
    select: { glanceSeenAt: true },
  });

  const replay = await readGlanceReplay(
    prisma,
    eventId,
    viewer?.glanceSeenAt ?? null,
    glance,
    {
      status: event.status,
      sentAt: event.sentAt,
      endDate: event.endDate,
      decideByOffsetHours: event.decideByOffsetHours,
      nudgePace: event.nudgePace,
    },
    now
  );

  if (replay.steps.length === 0) {
    await stampGlanceSeen(prisma, auth.user.id, eventId);
  }

  return (
    <div className="min-h-screen bg-[#efede6]">
      <GlanceBoard
        glance={glance}
        eventName={event.name}
        /*
          Phase 4. `auth.role` is the role the guard actually authenticated — HOST or
          COHOST here — and it is what GTC-256 Ruling 9's self-pick is conditioned on. It
          is passed down rather than re-derived: a second role lookup in the view is
          exactly how the two would come to disagree.
        */
        actorRole={auth.role}
        /*
          The date the reminder copy needs, formatted here because the glance payload
          deliberately carries no plan content and a date on the board would be a countdown
          §3 refuses. Same locale and shape `PersonInviteDetailModal` already uses, so the
          two doors into the same nudge route read alike.
        */
        eventDate={event.startDate.toLocaleDateString('en-NZ', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })}
      />
    </div>
  );
}
