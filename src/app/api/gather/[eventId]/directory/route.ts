import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { ADDRESSABLE_PERSON_EVENT } from '@/lib/eligibility/host-exclusion';
import {
  SHAREABLE_ACCESS_TOKEN,
  SHAREABLE_TOKEN_PREFIX,
} from '@/lib/eligibility/shared-link-exposure';

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
     * ⚠ NARROWED TO THE HOST, DELIBERATELY, AND IT STAYS THAT WAY. GTC-262 closed the
     * coordinator half and did NOT do it here: a coordinator is a guest and belongs in
     * the family's view of who is coming, so their ROW stays and their CREDENTIAL is
     * withheld instead — see the token query below. This filter is about who is not a
     * name in this directory at all, and the host is still the only one.
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

    /*
     * GTC-262 — ONE SHAREABLE SCOPE, AND THE QUERY IS WHERE IT IS ENFORCED.
     *
     * Founder ruling, 2026-09-18 (unknown 1): "a participant token is an ask, a
     * coordinator token is a job, and the no-verification bargain was struck about the
     * ask. It was never struck about write access to a team's plan." A coordinator token
     * authorises create, PATCH and DELETE of a team's items and assign/unassign of people
     * to them, through `src/app/api/c/[token]/**`. This endpoint is unauthenticated and
     * keyed on the event id alone, so it may publish the ask and not the job.
     *
     * What stood here was a `scopePriority` table preferring PARTICIPANT and FALLING BACK
     * to COORDINATOR, and a `prefixMap` carrying `c` and `h` to open them. Measured
     * 2026-09-18, unauthenticated, no cookie, shared link switched OFF: 16 rows across 6
     * events in `gather_dev` emitted a coordinator token, 9 still inside `expiresAt`.
     *
     * FILTERED IN THE QUERY, so the coordinator's token row never enters the process and
     * no later edit to the mapping can reintroduce it — the same fail-closed direction,
     * and the same reason, as the host filter above. There is no priority left to get
     * wrong: one scope is loadable, so `find` is the whole of the selection.
     *
     * ⚠ AND THE TABLE AND THE MAP ARE GONE RATHER THAN NARROWED. Founder ruling, the same
     * day: "restricting leaves the mechanism standing as dead code, and the dead code is
     * the mechanism." A lookup table with two unreachable rows is one edit from reaching
     * them. `tests/coordinator-token-exposure-test.ts` asserts their absence structurally.
     *
     * ⚠ WHAT THIS DOES NOT CLOSE, RULED EXPLICITLY (unknown 2, 2026-09-18): "the
     * participant bargain stands." This endpoint still hands a working PARTICIPANT token
     * to anyone holding the event id, names are still self-selected with no verification,
     * and the 409 in the claim route is still the only friction — which this page does not
     * even pass through, since it routes straight to `/p/{token}`. That is the deliberate
     * design of the unaddressed path in. Do not read this fix as having closed it.
     */
    const tokens = await prisma.accessToken.findMany({
      where: { eventId, ...SHAREABLE_ACCESS_TOKEN },
      select: {
        personId: true,
        token: true,
      },
    });

    const tokenByPerson = new Map(tokens.map((t) => [t.personId, t.token]));

    const peopleWithTokens = people.map((pe) => {
      const token = tokenByPerson.get(pe.person.id) ?? null;
      return {
        id: pe.person.id,
        name: pe.person.name,
        token,
        // Null rather than a substitute prefix: a person with no shareable token has no
        // link HERE, which is not the same as having no access. The page's null branch is
        // what a coordinator sees, and its copy says so.
        tokenPrefix: token ? SHAREABLE_TOKEN_PREFIX : null,
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
