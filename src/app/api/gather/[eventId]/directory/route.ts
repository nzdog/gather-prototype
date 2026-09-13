import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ADDRESSABLE_PERSON_EVENT } from '@/lib/eligibility/host-exclusion';

/**
 * GET /api/gather/[eventId]/directory
 *
 * Public endpoint that returns basic event info and list of people
 * for the shareable family directory page.
 * No authentication required.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;

    // `hostId` is selected because the people query below excludes the host by it
    // (GTC-256 Ruling 5). See THE HOST IS NOT IN THIS DIRECTORY, further down.
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        occasionType: true,
        hostId: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    /*
     * GTC-256 (phase 3), RULING 5 — THE HOST IS NOT IN THIS DIRECTORY.
     *
     * "Her name is not claimable through the shared link." This endpoint is the widest
     * form of that link: it is unauthenticated, it is keyed on the event id alone, and
     * the payload below pairs every person with an access token AND the URL prefix that
     * token opens. The dashboard tells the host to "share this single link with your
     * whole family", and the page renders each returned person as a card that routes to
     * `/${tokenPrefix}/${token}`. With her row present, one of those cards signed the
     * clicker in as the host.
     *
     * A PHASE-2 REGRESSION, WHICH IS WHY IT LANDS FIRST AND ALONE. Before phase 2 the
     * host had no `PersonEvent` on a Moment-flow event, so this loop had nothing of hers
     * to iterate and the exposure did not exist. Phase 2 wrote her row (Rulings 1, 8,
     * 10) and every reader that enumerates `PersonEvent` inherited her — this one while
     * handing out tokens. `tests/host-directory-exposure-test.ts` asserts the before and
     * the after, so the control is not a claim in a comment.
     *
     * FILTERED IN SQL, NOT AFTER THE FETCH. Her row never loads, so no later edit to the
     * mapping below can reintroduce her by accident. That is the fail-closed direction
     * for an endpoint whose entire output is credentials.
     *
     * ⚠ NARROWED TO THE HOST, DELIBERATELY. This endpoint also hands COORDINATOR tokens
     * to unauthenticated callers, which is the same class of defect with a wider blast
     * radius and is NOT GTC-256's — filed as GTC-262. Do not widen this filter to close
     * that; it needs its own decision about what the directory is for.
     */
    const people = await prisma.personEvent.findMany({
      where: { eventId, ...ADDRESSABLE_PERSON_EVENT(event.hostId) },
      include: {
        person: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        person: {
          name: 'asc',
        },
      },
    });

    // Get access tokens for each person (any scope — HOST, COORDINATOR, or PARTICIPANT)
    const tokens = await prisma.accessToken.findMany({
      where: { eventId },
      select: {
        personId: true,
        token: true,
        scope: true,
      },
    });

    // Create a map of personId -> { token, scope, prefix }
    // Prefer PARTICIPANT token; fall back to COORDINATOR or HOST
    const tokenMap = new Map<string, { token: string; scope: string }>();
    // First pass: add all tokens (later scopes may overwrite earlier ones)
    const scopePriority: Record<string, number> = { PARTICIPANT: 3, COORDINATOR: 2, HOST: 1 };
    tokens.forEach((t) => {
      const existing = tokenMap.get(t.personId);
      if (!existing || (scopePriority[t.scope] || 0) > (scopePriority[existing.scope] || 0)) {
        tokenMap.set(t.personId, { token: t.token, scope: t.scope });
      }
    });

    // Build response with people and their tokens
    const prefixMap: Record<string, string> = { HOST: 'h', COORDINATOR: 'c', PARTICIPANT: 'p' };
    const peopleWithTokens = people.map((pe) => {
      const entry = tokenMap.get(pe.person.id);
      return {
        id: pe.person.id,
        name: pe.person.name,
        token: entry?.token || null,
        tokenPrefix: entry ? prefixMap[entry.scope] || 'p' : null,
      };
    });

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        occasionType: event.occasionType,
      },
      people: peopleWithTokens,
    });
  } catch (error: any) {
    console.error('Error fetching directory:', error);
    return NextResponse.json({ error: 'Failed to load directory' }, { status: 500 });
  }
}
