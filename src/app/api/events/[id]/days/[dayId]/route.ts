// PATCH /api/events/[id]/days/[dayId] - [[GTC-478]] Rename a session or change its date
// DELETE /api/events/[id]/days/[dayId] - [[GTC-478]] Remove a session that holds no items
// Both behind the sessions switch (src/lib/sessions/switch.ts).
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange, type PendingChange } from '@/lib/ledger';
import { isSessionsOn } from '@/lib/sessions/switch';
import { SESSION_WORDS, readSessionDate, readSessionName } from '@/lib/sessions/input';
import { sessionDateKey } from '@/lib/sessions/dates';

type Ctx = { params: Promise<{ id: string; dayId: string }> };

/*
 * [[GTC-478]] (founder ruling D, 23 Nov 2026): while GATHER_SESSIONS is off, this address answers
 * what it answered before it existed: 404. Nothing is read or written. The check comes first.
 */
const closed = () => new NextResponse(null, { status: 404 });

/** The belongs-to-this-event check on the session in the address. */
function sessionOfEvent(dayId: string, eventId: string) {
  return prisma.day.findFirst({
    where: { id: dayId, eventId },
    select: { id: true, name: true, date: true, displayOrder: true },
  });
}

/**
 * [[GTC-478]] (B): rename a session (`name`), change its date (`date`, YYYY-MM-DD), or both. A
 * session moved to another date goes last on that date. One EDIT_DAY ledger line per changed
 * field. [[GTC-481]] E (decision 4): a new date after the send carries the host's why (`reason`, or
 * null when skipped), as the event's own date does; a rename never asks. 200 with the session.
 */
export async function PATCH(request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { id: eventId, dayId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  let body: Record<string, unknown> = {};
  try {
    const parsed = await request.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) body = parsed;
  } catch {
    body = {};
  }
  const name = 'name' in body ? readSessionName(body.name) : null;
  if (name && 'error' in name) return NextResponse.json({ error: name.error }, { status: 400 });
  const date = 'date' in body ? readSessionDate(body.date) : null;
  if (date && 'error' in date) return NextResponse.json({ error: date.error }, { status: 400 });
  const reason =
    typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;

  try {
    const session = await sessionOfEvent(dayId, eventId);
    if (!session) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }

    const data: { name?: string; date?: Date; displayOrder?: number } = {};
    const changes: PendingChange[] = [];
    const base = { action: 'EDIT_DAY' as const, targetType: 'Day' as const, targetId: dayId };
    if (name && name.name !== session.name) {
      data.name = name.name;
      changes.push({ ...base, field: 'name', before: session.name, after: name.name });
    }
    // [[GTC-479]] (decision 1, the date rule): the same NZ calendar day is not a change, whichever
    // form the session's date is stored in; the stored date is then left as it is.
    if (date && sessionDateKey(date.date) !== sessionDateKey(session.date)) {
      data.date = date.date;
      changes.push({
        ...base,
        field: 'date',
        before: session.date.toISOString(),
        after: date.date.toISOString(),
      });
    }

    const actor = changes.length > 0 ? await ledgerActorForUser(auth.user, auth.role) : null;
    const day = await prisma.$transaction(async (tx) => {
      if (changes.length === 0) return session;
      if (data.date) {
        const last = await tx.day.aggregate({ where: { eventId }, _max: { displayOrder: true } });
        data.displayOrder = (last._max.displayOrder ?? -1) + 1;
        if (data.displayOrder !== session.displayOrder) {
          changes.push({
            ...base,
            field: 'displayOrder',
            before: session.displayOrder,
            after: data.displayOrder,
          });
        }
      }
      const saved = await tx.day.update({
        where: { id: dayId },
        data,
        select: { id: true, name: true, date: true, displayOrder: true },
      });
      await recordChange(tx, { eventId, actor: actor!, changes, reason });
      return saved;
    });
    return NextResponse.json({ day });
  } catch (error) {
    console.error('Error editing session:', error);
    return NextResponse.json({ error: 'Failed to edit session' }, { status: 500 });
  }
}

/**
 * [[GTC-478]] (B, founder ruling 1): remove a session. Refused (409) while any item is on it, so a
 * dish only ever changes session through the item edit, which asks why after the send. Its
 * absence rows go with it (ON DELETE CASCADE). One DELETE_DAY ledger line. 200.
 */
export async function DELETE(_request: NextRequest, context: Ctx) {
  if (!isSessionsOn()) return closed();
  const { id: eventId, dayId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const session = await sessionOfEvent(dayId, eventId);
    if (!session) {
      return NextResponse.json({ error: SESSION_WORDS.notOnEvent }, { status: 400 });
    }
    const items = await prisma.item.count({ where: { dayId } });
    if (items > 0) {
      return NextResponse.json({ error: SESSION_WORDS.stillHasItems }, { status: 409 });
    }

    const actor = await ledgerActorForUser(auth.user, auth.role);
    await prisma.$transaction(async (tx) => {
      // Inside the transaction too, so an item added since the count above still refuses.
      if ((await tx.item.count({ where: { dayId } })) > 0) throw new Error('STILL_HAS_ITEMS');
      await tx.day.delete({ where: { id: dayId } });
      await recordChange(tx, {
        eventId,
        actor,
        changes: [
          {
            action: 'DELETE_DAY',
            targetType: 'Day',
            targetId: dayId,
            before: { name: session.name, date: session.date.toISOString() },
            after: null,
          },
        ],
      });
    });
    return NextResponse.json({ removed: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'STILL_HAS_ITEMS') {
      return NextResponse.json({ error: SESSION_WORDS.stillHasItems }, { status: 409 });
    }
    console.error('Error removing session:', error);
    return NextResponse.json({ error: 'Failed to remove session' }, { status: 500 });
  }
}
