// GET /api/events/[id]/days - Get days for an event
// POST /api/events/[id]/days - [[GTC-478]] Make a session (behind the sessions switch)
// PUT /api/events/[id]/days - [[GTC-478]] Put the event's sessions in order (behind the switch)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, type PendingChange } from '@/lib/ledger';
import { isSessionsOn } from '@/lib/sessions/switch';
import {
  SESSION_ORDER,
  SESSION_WORDS,
  readSessionDate,
  readSessionName,
} from '@/lib/sessions/input';

/*
 * [[GTC-478]] (founder ruling D, 23 Nov 2026): while GATHER_SESSIONS is off, POST and PUT answer
 * what this address answered before they existed: 405, the answer Next gives a method a route file
 * does not export. They read and write nothing. The check comes first, before the guard.
 */
const closed = () => new NextResponse(null, { status: 405 });

async function readBody(request: NextRequest): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  // GTC-267: unauthenticated before this.
  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    // [[GTC-478]] (E): date, then the session's place, then the order made. Every session made
    // before GTC-478 has place 0, so those read date then made, as the coordinator page does.
    const days = await prisma.day.findMany({
      where: { eventId },
      orderBy: SESSION_ORDER,
      select: {
        id: true,
        name: true,
        date: true,
      },
    });

    return NextResponse.json({ days });
  } catch (error) {
    console.error('Error fetching days:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch days',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * [[GTC-478]] (B): make a session from a name and a date (YYYY-MM-DD). Host and co-host only. It
 * goes last on its date: its place is one more than the highest on the event. One CREATE_DAY
 * ledger line, never asking why. 201 with the session.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSessionsOn()) return closed();
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  const body = await readBody(request);
  const name = readSessionName(body.name);
  if ('error' in name) return NextResponse.json({ error: name.error }, { status: 400 });
  const date = readSessionDate(body.date);
  if ('error' in date) return NextResponse.json({ error: date.error }, { status: 400 });

  try {
    const actor = await ledgerActorForUser(auth.user, auth.role);
    const day = await prisma.$transaction(async (tx) => {
      const last = await tx.day.aggregate({ where: { eventId }, _max: { displayOrder: true } });
      const made = await tx.day.create({
        data: {
          name: name.name,
          date: date.date,
          eventId,
          displayOrder: (last._max.displayOrder ?? -1) + 1,
        },
        select: { id: true, name: true, date: true, displayOrder: true },
      });
      await recordChange(tx, {
        eventId,
        actor,
        changes: [
          {
            action: 'CREATE_DAY',
            targetType: 'Day',
            targetId: made.id,
            before: null,
            after: { name: made.name, date: made.date.toISOString() },
          },
        ],
      });
      return made;
    });
    return NextResponse.json({ day }, { status: 201 });
  } catch (error) {
    console.error('Error creating session:', error);
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
  }
}

/**
 * [[GTC-478]] (B): put the event's sessions in order. The body lists every session of the event
 * once, as `dayIds`, earliest first. Each id must be a session of THIS event (checked before
 * anything else in the list); the list must hold each of them exactly once; and it must keep date
 * order (a later date never before an earlier one). Each session's place becomes its position.
 * One EDIT_DAY ledger line per session whose place moved. 200 with the sessions in their order.
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSessionsOn()) return closed();
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  const body = await readBody(request);
  const dayIds = body.dayIds;
  if (!Array.isArray(dayIds) || !dayIds.every((d) => typeof d === 'string')) {
    return NextResponse.json({ error: SESSION_WORDS.listEachOnce }, { status: 400 });
  }

  try {
    const sessions = await prisma.day.findMany({
      where: { eventId },
      select: { id: true, date: true, displayOrder: true },
    });
    const byId = new Map(sessions.map((s) => [s.id, s]));
    // The belongs-to-this-event check, on every id in the list, before anything is read from it.
    if (dayIds.some((d) => !byId.has(d))) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }
    if (new Set(dayIds).size !== dayIds.length || dayIds.length !== sessions.length) {
      return NextResponse.json({ error: SESSION_WORDS.listEachOnce }, { status: 400 });
    }
    for (let i = 1; i < dayIds.length; i++) {
      if (byId.get(dayIds[i])!.date.getTime() < byId.get(dayIds[i - 1])!.date.getTime()) {
        return NextResponse.json({ error: SESSION_WORDS.dateOrder }, { status: 400 });
      }
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    const days = await prisma.$transaction(async (tx) => {
      const changes: PendingChange[] = [];
      for (let i = 0; i < dayIds.length; i++) {
        const before = byId.get(dayIds[i])!.displayOrder;
        if (before === i) continue;
        await tx.day.update({ where: { id: dayIds[i] }, data: { displayOrder: i } });
        changes.push({
          action: 'EDIT_DAY',
          targetType: 'Day',
          targetId: dayIds[i],
          field: 'displayOrder',
          before,
          after: i,
        });
      }
      await recordChange(tx, { eventId, actor, changes });
      return tx.day.findMany({
        where: { eventId },
        orderBy: SESSION_ORDER,
        select: { id: true, name: true, date: true, displayOrder: true },
      });
    });
    return NextResponse.json({ days });
  } catch (error) {
    console.error('Error ordering sessions:', error);
    return NextResponse.json({ error: 'Failed to order sessions' }, { status: 500 });
  }
}
