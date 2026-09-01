import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { computeAutoAssignments, type TeamDistribution } from '@/lib/auto-assign';

/**
 * POST /api/events/[id]/people/auto-assign — put unassigned participants on teams.
 *
 * AUTO-ASSIGN PLACES PEOPLE. IT CREATES NO ASSIGNMENTS (founder Ruling 1, 2026-08-29).
 *
 * This route used to do a second thing its name never advertised: after placing people
 * it round-robined every unassigned item in every team onto that team's members, writing
 * Assignment rows directly. That half is REMOVED.
 *
 * The rationale, recorded: **dealing out who brings what is a decision, not a
 * distribution.** Two concrete harms made that concrete rather than theoretical, both
 * observed on a real event (GTC-133 fixture, 14 people / 27 items):
 *
 *   - It dealt 8 of 27 items to three CHILD-role people. A child is assignable by design
 *     (GTC-207 — the kid with a job) but is NEVER messaged (§10.6, absolute). So the
 *     round-robin created items owed by people the system guarantees will never be told
 *     they owe them.
 *   - It treated the host as a guest, because the host exclusion did not reach (see the
 *     exclusion below).
 *
 * NOT DELETED FROM THE ROADMAP — deleted from this button. Auto-assigning items may
 * return later as an explicit, separate option that says what it is doing. Nothing here
 * forecloses that; the round-robin is simply not something a "put people on teams" button
 * gets to do on the way past.
 *
 * ONE BEHAVIOUR, ONE NAME (Ruling 2). The V1 dashboard button in PeopleSection.tsx is the
 * only caller and posts here, so removing the half server-side removes it everywhere.
 * There is deliberately no flag to turn it back on: two behaviours behind one name is how
 * this gets misremembered.
 *
 * NO LEDGER ENTRY, AND THAT IS THE CONSEQUENCE OF RULING 1, NOT AN OVERSIGHT.
 * GTC-201 gave this route a batch `recordChange` for one reason: post-send, every
 * assignment it created was a T1 — "a person is now being asked for something they were
 * not asked for before" (Hinge §2). With the item half gone, this route asks nobody for
 * anything. Putting someone on a team is not an ask: it changes which items they COULD be
 * given, never what they owe. Nothing touches anyone, so nothing carries a why — the same
 * reason a single drag on the team board records nothing today. The `reason` field is
 * still accepted on the wire and ignored, so an old caller does not break.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: eventId } = await context.params;
    // Accepted and ignored — see the no-ledger note above. Parsed so a body-carrying
    // caller does not 500 on an unread stream.
    await request.json().catch(() => ({}));

    // SECURITY: Require HOST role for auto-assignment operations
    const auth = await requireEventRole(eventId, ['HOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, host: { select: { userId: true } } },
    });

    if (!event) {
      return NextResponse.json(
        { success: false, error: 'Event not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    /*
     * THE HOST EXCLUSION (founder Ruling 3, 2026-08-29).
     *
     * ⚠ THE RULING'S PREMISE IS CORRECTED HERE. It described this as comparing a User id
     * against a Person id. It is not: `Event.hostId` is a **Person** FK
     * (`host Person @relation("EventHost")` in schema.prisma), so `personId: { not:
     * event.hostId }` was always type-correct. The bug the ruling was aiming at is real
     * but has a different shape — see below.
     *
     * Three identity paths, because the host is reachable by different ones depending on
     * how the event was built, and matching on only the first is what made this brittle:
     *
     *   1. `personId === Event.hostId` — the direct FK. Holds on V1/seeded events.
     *   2. `role === 'HOST'` on the membership row — set by the V1 dashboard, and the
     *      thing the promotion below maintains.
     *   3. `person.userId === host.userId` — the same human captured under a DIFFERENT
     *      Person row. Guarded on non-null: `userId` is nullable, and `null === null`
     *      must never make every contactless guest the host.
     *
     * ⚠ CORRECTED 2026-08-29 (GTC-256 phase 2). This comment used to state, inside this
     * block, "verified: zero rows for the host Person across every event in the database".
     * THAT WAS WRONG: it was 1 — Sarah Henderson, on the V1 demo seed — and GTC-256's own
     * evidence table said so on the line above the claim. The parallel comment in
     * pre-flight/message/route.ts carried the exception correctly ("0 except on the V1
     * seed") and was the one to copy. What was genuinely zero is the count for the two
     * MOMENT-FLOW host Persons, across every event.
     *
     * ⚠ AND THE CONDITION IT DESCRIBED HAS NOW LAPSED. GTC-256 phase 2 captures the host's
     * own household in Moment 1 (Rulings 1, 2, 7, 8, 10), so on any event created through
     * the Moment flow after that change the host HAS a PersonEvent, it points at
     * `Event.hostId`'s existing Person, and identity path 1 resolves. Events created
     * before it still have none, AND THEY KEEP NONE. GTC-256 Ruling 12 (phase 5,
     * 2026-08-29): no backfill. Every event in the database is seed or script data —
     * `stripePaymentIntentId` is null on all nine — so the fix applies forward and
     * anything worth keeping is reseeded rather than patched. ⚠ That ruling is
     * CONDITIONAL on no real event existing; see GTC-256 for the condition and what a
     * backfill would have to do if it lapses.
     *
     * NOTHING HERE CHANGES, AND THAT IS RULING 9 WORKING AS INTENDED. Her row carries
     * `role: 'HOST'`, so the participant pool below — which selects `role: 'PARTICIPANT'`
     * — still excludes her, and "the existing rule keeping role: HOST out of auto-assign's
     * PARTICIPANT pool stays exactly as it is, unchanged". She may hold items, but only
     * ones she picks herself through the manual assign route, which has no role gate.
     */
    const hostUserId = event.host?.userId ?? null;

    /*
     * RESOLVED POSITIVELY, THEN EXCLUDED BY ID — never as a `NOT { OR: [...] }`.
     *
     * The negated form was written first and it emptied the participant list on a real
     * event: 14 unassigned people, zero returned, a 400 NO_UNASSIGNED on an event where
     * nobody was on a team. SQL three-valued logic — `NOT (person.userId = 'x')` is NULL,
     * not TRUE, for the rows where `userId` IS NULL, and NULL is not TRUE, so every guest
     * with no linked account was silently filtered out. That is the identical trap
     * `src/lib/eligibility/child-exclusion.ts` records for `NOT (householdRole = 'CHILD')`
     * and refuses an allowlist to avoid.
     *
     * Two queries instead of a clever one. `id` is a non-null primary key, so `notIn` has
     * no null semantics to get wrong, and an empty list excludes nobody rather than
     * everybody.
     */
    const hostMemberships = await prisma.personEvent.findMany({
      where: {
        eventId,
        OR: [
          { personId: event.hostId },
          { role: 'HOST' },
          ...(hostUserId ? [{ person: { userId: hostUserId } }] : []),
        ],
      },
      select: { id: true },
    });
    const hostPersonEventIds = hostMemberships.map((m) => m.id);

    // 1. Fetch all teams with their stats
    const teams = await prisma.team.findMany({
      where: { eventId },
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            // GTC-171 (B2): ITEM rows only — a team holding nothing but task rows is
            // not an assignable destination for people.
            items: { where: { kind: 'ITEM' } },
          },
        },
        members: {
          where: { role: { not: 'HOST' } },
          select: { id: true, personId: true },
        },
      },
    });

    // Validate: must have at least one team
    if (teams.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'Please create at least one team before auto-assigning people',
          code: 'NO_TEAMS',
        },
        { status: 400 }
      );
    }

    // Ensure the host's membership row carries HOST, so path 2 of the exclusion holds on
    // the next run. Reaches the host by the same three paths, for the same reason.
    await prisma.personEvent.updateMany({
      where: {
        eventId,
        role: { not: 'HOST' },
        OR: [
          { personId: event.hostId },
          ...(hostUserId ? [{ person: { userId: hostUserId } }] : []),
        ],
      },
      data: { role: 'HOST' },
    });

    // 2. Fetch all unassigned participants, excluding the host.
    //
    // CHILDREN ARE PLACED, DELIBERATELY (founder Ruling 4, 2026-08-29). There is no
    // householdRole filter here and there must not be one: a CHILD-role person is a "kid
    // with a job" and is assignment-eligible by design (GTC-207, which pins this and
    // forbids importing the message-exclusion gate into any assignment path). A child on
    // a team is fine. A child holding an item they can never be told about was the
    // problem, and Ruling 1 removed the code that did that.
    const unassignedParticipants = await prisma.personEvent.findMany({
      where: {
        eventId,
        role: 'PARTICIPANT',
        teamId: null,
        id: { notIn: hostPersonEventIds },
      },
      include: {
        person: { select: { id: true, name: true, email: true } },
      },
    });

    // Validate: must have at least one unassigned participant
    if (unassignedParticipants.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: 'All participants are already assigned to teams',
          code: 'NO_UNASSIGNED',
        },
        { status: 400 }
      );
    }

    // 3. Initialize team distribution tracking
    const teamDistributions: TeamDistribution[] = teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      memberCount: team.members.length,
      itemCount: team._count.items,
    }));

    // 4. Calculate assignments using even distribution
    const assignments = computeAutoAssignments(
      teamDistributions,
      unassignedParticipants.map((pe) => ({
        personId: pe.personId,
        personName: pe.person.name,
      }))
    );

    // 5. Place people on teams. One transaction: a half-applied placement would leave
    // the distribution the next run reads from wrong.
    await prisma.$transaction(async (tx) => {
      for (const assignment of assignments) {
        await tx.personEvent.update({
          where: { personId_eventId: { personId: assignment.personId, eventId } },
          data: { teamId: assignment.teamId },
        });
      }
    });

    // 6. Return success with placement details. `itemsAssigned` / `itemAssignments` /
    // `summary.totalItemsAssigned` are GONE rather than pinned at zero — a field that
    // always reads 0 is a behaviour that looks merely idle.
    return NextResponse.json({
      success: true,
      assigned: assignments.length,
      assignments: assignments.map((a) => ({
        personName: a.personName,
        teamName: a.teamName,
        reason: a.reason,
      })),
      summary: {
        totalUnassigned: unassignedParticipants.length,
        totalAssigned: assignments.length,
        teamDistributions,
      },
    });
  } catch (error: any) {
    console.error('Error auto-assigning people:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to assign people. Please try again.',
        code: 'TRANSACTION_FAILED',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
