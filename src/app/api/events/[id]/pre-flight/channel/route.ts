// PATCH /api/events/[id]/pre-flight/channel
//
// GTC-188 (I1) — the recipient confirmation: repointing a household's channel from the
// pre-flight. The picker itself is C1's (GTC-172); this is a narrow write for it.
//
//   { householdId, contactPersonEventId }   → Household.contactPersonEventId
//
// NULL means "not picked" and resolves to the household's PRIMARY_CONTACT at read time
// (resolveHouseholdChannel). There is no backfill and none is wanted: the default is
// computed, so clearing the pick restores it exactly.
//
// Deliberately NOT the household PUT at /api/events/[id]/households/[householdId]: that
// route requires a full household body and reconciles every member, so changing one
// reference through it would mean the client reconstructing the whole household.
//
// Validation is C1's `validateChannelTarget` — same event, and never a CHILD (§10.6).
//
// [[GTC-387]] (item 67, Q8) — a SECOND SHAPE, on the same route and the same guard:
//
//   { personEventId, email?, mobile? }      → Person.email / Person.phoneNumber
//
// "People I'll leave to you": a name opens a fold with an Email and a Mobile box. Save only,
// before the press — nothing is sent before Send. The check, the write and its ledger line are
// `saveContactBeforePress` (`@/lib/contact/contact-fix`), which asks the chooser and refuses a
// child, the host, someone not on the event, and anything after the press.

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { validateChannelTarget } from '@/lib/households/channel';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { saveContactBeforePress } from '@/lib/contact/contact-fix';
import { CONTACT_REFUSAL_WORDS } from '@/lib/contact/contact-box';

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id: eventId } = await context.params;

  const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await request.json();

    // [[GTC-387]] — the contact box's shape. Told apart by the field it names.
    if (body && typeof body === 'object' && 'personEventId' in body) {
      const { personEventId, email, mobile } = body as Record<string, unknown>;
      if (typeof personEventId !== 'string' || !personEventId) {
        return NextResponse.json({ error: 'personEventId is required' }, { status: 400 });
      }
      const outcome = await saveContactBeforePress(prisma, {
        eventId,
        personEventId,
        email: typeof email === 'string' ? email : null,
        mobile: typeof mobile === 'string' ? mobile : null,
        actor: await ledgerActorForUser(auth.user, auth.role),
      });
      if (!outcome.ok) {
        return NextResponse.json(
          { error: CONTACT_REFUSAL_WORDS[outcome.code], code: outcome.code },
          { status: outcome.status }
        );
      }
      return NextResponse.json({ ok: true, personEventId });
    }

    const { householdId, contactPersonEventId } = body;

    if (typeof householdId !== 'string' || !householdId) {
      return NextResponse.json({ error: 'householdId is required' }, { status: 400 });
    }
    if (contactPersonEventId !== null && typeof contactPersonEventId !== 'string') {
      return NextResponse.json(
        { error: 'contactPersonEventId must be a PersonEvent id or null' },
        { status: 400 }
      );
    }

    const household = await prisma.household.findFirst({
      where: { id: householdId, eventId },
      select: { id: true },
    });
    if (!household) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    if (contactPersonEventId !== null) {
      const target = await prisma.personEvent.findUnique({
        where: { id: contactPersonEventId },
        select: { eventId: true, householdRole: true },
      });
      const check = validateChannelTarget(target, eventId);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
    }

    await prisma.household.update({
      where: { id: householdId },
      data: { contactPersonEventId },
    });

    return NextResponse.json({ ok: true, householdId, contactPersonEventId });
  } catch (error) {
    console.error('Error saving household channel:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
