// GET /api/events/[id]/sessions - [[GTC-479]] Moment 1's sessions card: the sessions, the households
//   and who is not at which session (behind the sessions switch)
// PUT /api/events/[id]/sessions - [[GTC-479]] One person, one session: coming or not (behind the switch)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { isSessionsOn } from '@/lib/sessions/switch';
import { SESSION_ORDER, SESSION_WORDS } from '@/lib/sessions/input';
import { sessionDateKey, sortSessions } from '@/lib/sessions/dates';
import { ATTENDANCE_WORDS, COMING_WORDS } from '@/lib/sessions/card-words';

type Ctx = { params: Promise<{ id: string }> };

/*
 * [[GTC-479]] (founder ruling 2, 24 Nov 2026; GTC-478's ruling D): while GATHER_SESSIONS is off, this
 * address answers what it answered before it existed: 404, for both methods. Nothing is read or
 * written. The check comes first, before the guard.
 */
const closed = () => new NextResponse(null, { status: 404 });

type Kind = 'adult' | 'kid' | 'guest';

/** A household member's kind, read the way the setup page reads it (kids with jobs first). */
function kindOf(m: { householdRole: string | null; isYoungPerson: boolean }): Kind {
  if (m.isYoungPerson || m.householdRole === 'CHILD') return 'kid';
  if (m.householdRole === 'GUEST') return 'guest';
  return 'adult';
}
/** The order people are listed in a household: main contact, partner, kids with jobs, guests. */
function rankOf(m: { householdRole: string | null; isYoungPerson: boolean }): number {
  const kind = kindOf(m);
  if (kind === 'kid') return 2;
  if (kind === 'guest') return 3;
  return m.householdRole === 'PRIMARY_CONTACT' ? 0 : 1;
}

/**
 * [[GTC-479]]: what the card shows. The sessions in their order, each date as YYYY-MM-DD by the date
 * rule (src/lib/sessions/dates.ts), so no stored time reaches the page; the event's first and last
 * date the same way; each household with its named people and its number of kids without jobs; and
 * the marks of who is NOT at which session (none means everyone at every session). Host and co-host.
 */
export async function GET(_request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { startDate: true, endDate: true },
    });
    if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

    const days = await prisma.day.findMany({
      where: { eventId },
      orderBy: SESSION_ORDER,
      select: { id: true, name: true, date: true, displayOrder: true },
    });
    const households = await prisma.household.findMany({
      where: { eventId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        littleCount: true,
        members: {
          orderBy: { id: 'asc' },
          select: {
            id: true,
            householdRole: true,
            isYoungPerson: true,
            person: { select: { name: true } },
          },
        },
      },
    });
    // Both ends on this event: the writer checks it, and the read does not trust that it did.
    const absences = await prisma.sessionAbsence.findMany({
      where: { day: { eventId }, personEvent: { eventId } },
      orderBy: { id: 'asc' },
      select: { personEventId: true, dayId: true },
    });

    return NextResponse.json({
      sessions: sortSessions(days).map((d) => ({
        id: d.id,
        name: d.name,
        date: sessionDateKey(d.date),
        displayOrder: d.displayOrder,
      })),
      eventDates: { start: sessionDateKey(event.startDate), end: sessionDateKey(event.endDate) },
      households: households.map((h) => {
        const members = [...h.members].sort((a, b) => rankOf(a) - rankOf(b));
        const primary = h.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
        return {
          id: h.id,
          title: primary?.person.name ?? members[0]?.person.name ?? '',
          littleCount: h.littleCount,
          people: members.map((m) => ({
            personEventId: m.id,
            name: m.person.name,
            kind: kindOf(m),
          })),
        };
      }),
      absences,
    });
  } catch (error) {
    console.error('Error reading sessions:', error);
    return NextResponse.json({ error: 'Failed to read sessions' }, { status: 500 });
  }
}

/**
 * [[GTC-479]] (decisions 4 and 5, founder ruling 1): one person, one session, coming or not. Body
 * `{ personEventId, dayId, coming, despiteDishes }`. Order of checks: the switch; signed in (401) and
 * host or co-host (403); the input (400); the belongs-to-this-event check on BOTH ids, before
 * anything is read from either (400, nothing written); the dish warning (409 with the dishes, nothing
 * written, unless `despiteDishes` is exactly true); the write. Not coming adds the mark if it is not
 * there; coming removes it. One EDIT_ATTENDANCE ledger line when something changed, never asking why.
 * Nothing about any dish changes (GTC-481 handles dishes).
 */
export async function PUT(request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
  } catch {
    body = {};
  }
  const { personEventId, dayId, coming } = body;
  if (typeof personEventId !== 'string' || personEventId.length === 0) {
    return NextResponse.json({ error: ATTENDANCE_WORDS.personNotOnEvent }, { status: 400 });
  }
  if (typeof dayId !== 'string' || dayId.length === 0) {
    return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
  }
  if (typeof coming !== 'boolean') {
    return NextResponse.json({ error: ATTENDANCE_WORDS.comingMissing }, { status: 400 });
  }
  const despiteDishes = body.despiteDishes === true;

  try {
    // The belongs-to-this-event check, on every id, before anything is read from it.
    const member = await prisma.personEvent.findFirst({
      where: { id: personEventId, eventId },
      select: { id: true, personId: true, person: { select: { name: true } } },
    });
    if (!member) {
      return NextResponse.json({ error: ATTENDANCE_WORDS.personNotOnEvent }, { status: 400 });
    }
    const session = await prisma.day.findFirst({
      where: { id: dayId, eventId },
      select: { id: true, name: true },
    });
    if (!session) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }

    const mark = await prisma.sessionAbsence.findUnique({
      where: { personEventId_dayId: { personEventId, dayId } },
      select: { id: true },
    });
    const wasComing = mark === null;
    if (wasComing === coming) {
      return NextResponse.json({ personEventId, dayId, coming });
    }

    // Decision 5: the dishes this person is down for on THIS session. A dish for the whole event
    // (no session) never warns.
    if (!coming && !despiteDishes) {
      const held = await prisma.item.findMany({
        where: { dayId, assignment: { personId: member.personId } },
        orderBy: { name: 'asc' },
        select: { name: true },
      });
      if (held.length > 0) {
        const dishes = held.map((i) => i.name);
        return NextResponse.json(
          {
            error: COMING_WORDS.dishWarning(member.person.name, dishes, session.name),
            code: 'HOLDS_DISHES',
            dishes,
          },
          { status: 409 }
        );
      }
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    await prisma.$transaction(async (tx) => {
      if (coming) {
        await tx.sessionAbsence.deleteMany({ where: { personEventId, dayId } });
      } else {
        // One mark per person per session (the unique index); a second press finds it there.
        await tx.sessionAbsence.upsert({
          where: { personEventId_dayId: { personEventId, dayId } },
          create: { personEventId, dayId },
          update: {},
        });
      }
      await recordChange(tx, {
        eventId,
        actor,
        changes: [
          {
            action: 'EDIT_ATTENDANCE',
            targetType: 'PersonEvent',
            targetId: personEventId,
            field: `session:${dayId}`,
            before: coming ? 'not coming' : 'coming',
            after: coming ? 'coming' : 'not coming',
          },
        ],
      });
    });
    return NextResponse.json({ personEventId, dayId, coming });
  } catch (error) {
    console.error('Error saving who comes to a session:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
