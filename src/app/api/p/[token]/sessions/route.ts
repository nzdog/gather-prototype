// GET /api/p/[token]/sessions - [[GTC-481]] A: the sessions this guest is down for (behind the
//   sessions switch)
// PUT /api/p/[token]/sessions - [[GTC-481]] A: the guest can't make one session, or can after all
//   (behind the switch)
import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { resolveToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { actorFromToken, recordChange } from '@/lib/ledger';
import { recordAssignmentAnswer } from '@/lib/assignment/answer';
import { logInviteEvent } from '@/lib/invite-events';
import { deriveAttendance } from '@/lib/attendance';
import { isSessionsOn } from '@/lib/sessions/switch';
import { SESSION_ORDER, SESSION_WORDS } from '@/lib/sessions/input';
import { sessionDateKey, sortSessions } from '@/lib/sessions/dates';
import { sessionWithDate } from '@/lib/sessions/tabs';
import { SESSION_ANSWER_WORDS, sessionAttendance } from '@/lib/sessions/answers';

type Ctx = { params: Promise<{ token: string }> };

/*
 * [[GTC-481]] (the founder's rulings 1, 2 and 6 on the plan, 25 Nov 2026). While GATHER_SESSIONS is
 * off this address answers what it answered before it existed: 404, for both methods. Nothing is
 * read or written. The check comes first, before the link is looked at.
 *
 * ⚠ DO-NOT-TOUCH ZONE 3 IS NEAR AND NOT ENTERED. The link is read through the existing
 * `resolveToken`, and only a PARTICIPANT link is taken, as at every guest address. Nothing about
 * tokens, scopes or their issuing changes. WHO this address may change is decided by the link and
 * by nothing in the request: the person is the link's own, never a person named in the body, so a
 * guest's link changes only that guest's own marks and that guest's own dishes on that event. A
 * carried child's sessions stay the host's to set (ruling 1), so GTC-191's carried reach
 * (`resolveCarriedSubjects`) is not used here.
 */
const closed = () => new NextResponse(null, { status: 404 });
const refused = () => NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });

/**
 * What the guest's card shows: the event's sessions in their order (GTC-479's date rule), each with
 * its words ("Christmas lunch, Fri 25 Dec"), whether this guest is marked as not at it (`coming`
 * false), and B's reading of coming for it. Only this guest's own marks, on this event's sessions.
 */
async function readSessions(eventId: string, personId: string, personEventId: string) {
  const days = await prisma.day.findMany({
    where: { eventId },
    orderBy: SESSION_ORDER,
    select: { id: true, name: true, date: true, displayOrder: true },
  });
  const marks = await prisma.sessionAbsence.findMany({
    where: { personEventId, day: { eventId } },
    select: { dayId: true },
  });
  const [answers, place] = await Promise.all([
    prisma.assignment.findMany({
      where: { personId, item: { team: { eventId } } },
      select: { response: true },
    }),
    prisma.personEvent.findUnique({
      where: { id: personEventId },
      select: { attendanceAnswer: true },
    }),
  ]);
  const whole = deriveAttendance(answers, place?.attendanceAnswer ?? null);
  const away = new Set(marks.map((m) => m.dayId));
  return sortSessions(days).map((d) => ({
    id: d.id,
    name: d.name,
    label: sessionWithDate({ name: d.name, date: sessionDateKey(d.date) }),
    coming: !away.has(d.id),
    attendance: sessionAttendance(whole, away.has(d.id)),
  }));
}

/** The link holder's own place on the event the link opens, or null. */
function placeOf(personId: string, eventId: string) {
  return prisma.personEvent.findFirst({ where: { personId, eventId }, select: { id: true } });
}

export async function GET(_request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { token } = await context.params;
  const resolved = await resolveToken(token);
  if (!resolved || resolved.scope !== 'PARTICIPANT') return refused();

  try {
    const place = await placeOf(resolved.person.id, resolved.event.id);
    if (!place) return notFound();
    return NextResponse.json({
      sessions: await readSessions(resolved.event.id, resolved.person.id, place.id),
    });
  } catch (error) {
    console.error('Error reading the guest sessions:', error);
    return NextResponse.json({ error: 'Failed to read sessions' }, { status: 500 });
  }
}

/**
 * [[GTC-481]] A (rulings 1 and 2): this guest can't make one session (`coming` false), or can after
 * all (true). Body `{ dayId, coming }`. Order of checks: the switch; the link (PARTICIPANT only,
 * 403); the guest's own place on that event (404); the input (400); the session is on the event
 * this link opens (400, nothing written); already so (200, nothing written); the last session they
 * are down for (409, nothing written: missing every session is the whole-event "Can't make it").
 *
 * Not coming, in one transaction: the mark; then each of the guest's OWN dishes on that session not
 * yet No is answered No through `recordAssignmentAnswer`, the same write and history line a tap on
 * its No makes; then one EDIT_ATTENDANCE ledger line with the guest as the one who acted. Coming
 * again: the mark is removed and the same line written; the dishes stay No (ruling 1), and the guest
 * can answer each again on the page. After the write, what a tap logs: one RESPONSE_SUBMITTED per
 * dish turned No. Nothing is sent.
 */
export async function PUT(request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { token } = await context.params;
  const resolved = await resolveToken(token);
  if (!resolved || resolved.scope !== 'PARTICIPANT') return refused();

  const eventId = resolved.event.id;
  const me = resolved.person.id;

  try {
    const place = await placeOf(me, eventId);
    if (!place) return notFound();
    const personEventId = place.id;

    let body: Record<string, unknown> = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
    } catch {
      body = {};
    }
    const { dayId, coming } = body;
    if (typeof dayId !== 'string' || dayId.length === 0) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }
    if (typeof coming !== 'boolean') {
      return NextResponse.json({ error: SESSION_ANSWER_WORDS.comingMissing }, { status: 400 });
    }

    // The belongs-to-this-event check: the session must be on the event this link opens.
    const session = await prisma.day.findFirst({
      where: { id: dayId, eventId },
      select: { id: true },
    });
    if (!session) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }

    const mark = await prisma.sessionAbsence.findUnique({
      where: { personEventId_dayId: { personEventId, dayId } },
      select: { id: true },
    });
    if ((mark === null) === coming) {
      return NextResponse.json({
        sessions: await readSessions(eventId, me, personEventId),
        declined: [],
      });
    }

    const lastLeft = async (db: Pick<Prisma.TransactionClient, 'day' | 'sessionAbsence'>) => {
      const [total, away] = await Promise.all([
        db.day.count({ where: { eventId } }),
        db.sessionAbsence.count({ where: { personEventId, day: { eventId } } }),
      ]);
      return total - away <= 1;
    };
    if (!coming && (await lastLeft(prisma))) {
      return NextResponse.json({ error: SESSION_ANSWER_WORDS.lastSession }, { status: 409 });
    }

    const actor = actorFromToken(resolved);
    const declined = await prisma.$transaction(async (tx) => {
      const turned: { id: string; response: string; item: { id: string; name: string } }[] = [];
      if (coming) {
        await tx.sessionAbsence.deleteMany({ where: { personEventId, dayId } });
      } else {
        // Inside the transaction too, so two presses at once cannot take the last session away.
        if (await lastLeft(tx)) throw new Error('LAST_SESSION');
        await tx.sessionAbsence.upsert({
          where: { personEventId_dayId: { personEventId, dayId } },
          create: { personEventId, dayId },
          update: {},
        });
        // The guest's own dishes on this session, and only theirs: never another guest's or a child's.
        const held = await tx.assignment.findMany({
          where: {
            personId: me,
            response: { not: 'DECLINED' },
            item: { dayId, team: { eventId } },
          },
          orderBy: { item: { name: 'asc' } },
          select: { id: true, response: true, item: { select: { id: true, name: true } } },
        });
        for (const a of held) {
          await recordAssignmentAnswer(tx, {
            eventId,
            assignmentId: a.id,
            itemName: a.item.name,
            response: 'DECLINED',
            actorId: me,
            onBehalfOfName: null,
          });
          turned.push(a);
        }
      }
      // Last, after the writes it describes (src/lib/ledger.ts). Never asks why (GTC-479).
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
      return turned;
    });

    // What a tap on each dish's No logs (non-blocking), exactly as the answer route does.
    for (const a of declined) {
      logInviteEvent({
        eventId,
        personId: me,
        type: 'RESPONSE_SUBMITTED',
        metadata: {
          itemId: a.item.id,
          itemName: a.item.name,
          response: 'DECLINED',
          previousResponse: a.response,
        },
      }).catch((err) => console.error('[ResponseTracking] Failed to log:', err));
    }

    return NextResponse.json({
      sessions: await readSessions(eventId, me, personEventId),
      declined: declined.map((a) => a.item.name),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'LAST_SESSION') {
      return NextResponse.json({ error: SESSION_ANSWER_WORDS.lastSession }, { status: 409 });
    }
    console.error('Error saving the guest session answer:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
