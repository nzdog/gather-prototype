// GET /api/events/[id]/clone-source - the "cloned from" overlay summary
//
// GTC-267. This route exists because of one caller that the guard on
// GET /api/events/[id] would otherwise have broken.
//
// `fetchSourceData` in `src/app/plan/[eventId]/page.tsx` draws an overlay describing
// the event a plan was cloned from, and fetches it by `event.clonedFromId`. That id
// does not have to belong to the viewer: `POST /api/templates/[id]/clone` enforces
// ownership only when `templateSource === 'HOST'`, so a `GATHER_CURATED` template may
// be cloned by anyone and sets `clonedFromId` to `template.createdFrom` — an event the
// cloner may have no role on. Under `requireEventRole` that fetch would 403.
//
// So the overlay gets its own deliberately public projection instead of a hole in the
// guarded route: three fields, chosen because they are the three the overlay renders.
// `name` and `guestCount` are read today; `startDate`/`endDate` are included because
// the overlay is a date-and-size summary and reading them later must not tempt anyone
// back to the unguarded row.
//
// SECURITY: intentionally unauthenticated, and that is the whole design. It can say
// nothing a guest invited to the source event does not already know, and it cannot
// name a person, an email, a token, or a payment. Do not widen it. Anything that
// needs more than this needs a session, which is what GET /api/events/[id] is for.
//
// ⚠ This route is the 82nd in the inventory: `route-classifications.json` counted 81
// before it. That file is hand-maintained and its generator was deleted — see
// [[GTC-268]], which owns the gate. Adding the entry here would be certifying this
// route to a gate that cannot check it, so the count is recorded and left to that
// ticket.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        guestCount: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event });
  } catch (error) {
    console.error('Error fetching clone source:', error);
    return NextResponse.json({ error: 'Failed to fetch clone source' }, { status: 500 });
  }
}
