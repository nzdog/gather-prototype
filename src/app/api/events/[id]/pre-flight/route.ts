// GET /api/events/[id]/pre-flight
//
// GTC-188 (I1) — everything the pre-flight screen reads, in one call.
//
// ROUGH FIRST PASS. This assembles existing reads; it builds no new machinery and
// dispatches nothing. The press is GTC-189 (I2) and is not wired here.
//
// The five pieces, and where each comes from:
//   coverage   — checkSendReadiness (GTC-169's rename of checkFreezeReadiness), plus a
//                direct unassigned-item query for the exact counts the screen shows.
//   dietary    — EventSetup.dietaryData via readDietaryData (GTC-185 as rescoped:
//                event-level, never by name).
//   recipients — Household.contactPersonEventId + resolveHouseholdChannel (GTC-172).
//   pace       — Event.nudgePace (GTC-179).
//   mark       — PersonEvent.nudgeMark (GTC-179, placed here by its Ruling 8).
//
// The resolved cadence is NOT computed here. `resolveNudgeOffsetDays` is client-safe by
// design so the screen renders the same clock the sweep enforces; duplicating the
// resolution server-side is exactly the second definition that module refuses.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { checkSendReadiness } from '@/lib/workflow';
import { readDietaryData } from '@/lib/dietary';
import { resolveHouseholdChannel } from '@/lib/households/channel';
import { isMessageableRole } from '@/lib/eligibility/child-exclusion';

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, name: true, startDate: true, sentAt: true, nudgePace: true },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const [setup, readiness, unassignedItems, households, people] = await Promise.all([
      prisma.eventSetup.findUnique({
        where: { eventId },
        select: { dietaryData: true },
      }),
      // A1's artifact, reused rather than rebuilt — GTC-188's Context asks the question
      // and GTC-169 already renamed this for the pre-flight. Warnings only; nothing here
      // blocks (Moment 4 §2/§7).
      checkSendReadiness(eventId),
      // The counts the sweep shows. checkSendReadiness returns unassigned NAMES only and
      // its criticalGaps are "critical without an ACCEPTED assignment", which is a wider
      // set than "critical and unassigned". Both are shown; they are different facts.
      prisma.item.findMany({
        where: { team: { eventId }, assignment: null },
        select: { id: true, name: true, critical: true, team: { select: { name: true } } },
        orderBy: [{ critical: 'desc' }, { name: 'asc' }],
      }),
      prisma.household.findMany({
        where: { eventId },
        select: {
          id: true,
          littleCount: true,
          contactPersonEventId: true,
          members: {
            select: {
              id: true,
              personId: true,
              householdRole: true,
              isYoungPerson: true,
              nudgeMark: true,
              person: { select: { name: true, email: true, phoneNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      // Everyone in the event, so the mark is reachable for people who were never
      // captured through a household (people/route.ts and batch-import add them
      // directly, with householdRole null).
      prisma.personEvent.findMany({
        where: { eventId },
        select: {
          id: true,
          personId: true,
          householdId: true,
          householdRole: true,
          nudgeMark: true,
          person: { select: { name: true, email: true, phoneNumber: true } },
        },
        // PersonEvent carries no createdAt; name order is stable enough for a list.
        orderBy: { person: { name: 'asc' } },
      }),
    ]);

    const memberView = (m: {
      id: string;
      personId: string;
      householdRole: string | null;
      isYoungPerson?: boolean;
      nudgeMark: string | null;
      person: { name: string; email: string | null; phoneNumber: string | null };
    }) => ({
      personEventId: m.id,
      personId: m.personId,
      name: m.person.name,
      email: m.person.email,
      phone: m.person.phoneNumber,
      householdRole: m.householdRole,
      isYoungPerson: m.isYoungPerson ?? false,
      // §10.6 is absolute: a CHILD is never a recipient, whatever contact info the
      // record carries. The screen shows them greyed rather than hiding them, so Kate
      // can see that the exclusion happened rather than wondering where they went.
      messageable: isMessageableRole(m.householdRole),
      nudgeMark: m.nudgeMark,
    });

    // Household members come back in no defined order, so a row would jump position
    // every time a mark was saved. Primary contact first, then partner, guests, kids.
    const ROLE_ORDER = ['PRIMARY_CONTACT', 'PARTNER', 'GUEST', 'CHILD'];
    const roleRank = (role: string | null) => {
      const i = ROLE_ORDER.indexOf(role ?? '');
      return i === -1 ? ROLE_ORDER.length : i;
    };

    const householdViews = households.map((h) => {
      const primary = h.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
      const members = [...h.members].sort(
        (a, b) =>
          roleRank(a.householdRole) - roleRank(b.householdRole) ||
          a.person.name.localeCompare(b.person.name)
      );
      return {
        id: h.id,
        label: primary?.person.name ?? 'Household',
        littleCount: h.littleCount,
        contactPersonEventId: h.contactPersonEventId,
        // NULL means "not picked" and resolves to the primary contact at read time.
        resolvedContactPersonEventId: resolveHouseholdChannel({
          contactPersonEventId: h.contactPersonEventId,
          members: members.map((m) => ({ id: m.id, householdRole: m.householdRole })),
        }),
        members: members.map(memberView),
      };
    });

    // Cross-household by design (§10.7): Grandma's channel may live in her daughter's
    // household, so the candidate list spans the whole event. Children are not offered.
    const householdLabelById = new Map(householdViews.map((h) => [h.id, h.label]));
    const channelCandidates = people
      .filter((p) => isMessageableRole(p.householdRole))
      .map((p) => ({
        personEventId: p.id,
        name: p.person.name,
        householdId: p.householdId,
        householdLabel: p.householdId ? (householdLabelById.get(p.householdId) ?? null) : null,
      }));

    return NextResponse.json({
      event,
      coverage: {
        unassignedItems: unassignedItems.map((i) => ({
          id: i.id,
          name: i.name,
          critical: i.critical,
          teamName: i.team?.name ?? null,
        })),
        unassignedCount: unassignedItems.length,
        criticalUnassignedCount: unassignedItems.filter((i) => i.critical).length,
        complianceRate: readiness.complianceRate,
        criticalGaps: readiness.criticalGaps,
        warnings: readiness.warnings,
      },
      dietary: readDietaryData(setup?.dietaryData),
      households: householdViews,
      // People with no household row. Their mark still has to be reachable.
      unhoused: people.filter((p) => !p.householdId).map(memberView),
      channelCandidates,
    });
  } catch (error) {
    console.error('Error assembling pre-flight:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
