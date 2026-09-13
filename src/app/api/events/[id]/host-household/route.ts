import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import {
  createHostHousehold,
  HostHouseholdError,
  type HostHouseholdInput,
} from '@/lib/households/hostHousehold';
import { ChannelValidationError } from '@/lib/households/reconcileMembers';

/**
 * GTC-256 (phase 2) — Moment 1's first screen: the host's own household.
 *
 * A DEDICATED ROUTE, not a mode on `POST /api/events/[id]/households`, because almost
 * nothing about it is the same request. The identity is not in the payload — it is
 * `Event.hostId` (Ruling 10) — the email is not the client's to send, the role is HOST
 * rather than PARTICIPANT (Ruling 8), the householdRole is forced (Ruling 7), and it
 * carries Ruling 6's switch. Folding four exceptions into the generic capture path is
 * how that path stops being legible; the generic POST gains one precondition and
 * nothing else.
 */

interface HostHouseholdBody {
  alone?: boolean;
  name?: string;
  phone?: string;
  partner?: { name?: string; email?: string; phone?: string };
  helpers?: Array<{ name?: string; email?: string; phone?: string; adultRoled?: boolean }>;
  littleCount?: number;
  guests?: Array<{ name?: string; email?: string; phone?: string }>;
  messagesMuted?: boolean | null;
}

/**
 * GET — what Moment 1 needs to render the screen: who she is, and whether she has
 * already done this. `household` is non-null once her row exists, which is also the
 * signal the client uses to skip the step rather than offering it twice.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        hostId: true,
        host: { select: { id: true, name: true, email: true, phoneNumber: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const membership = await prisma.personEvent.findUnique({
      where: { personId_eventId: { personId: event.hostId, eventId } },
      select: { id: true, householdId: true },
    });

    const household = membership?.householdId
      ? await prisma.household.findUnique({
          where: { id: membership.householdId },
          include: {
            members: {
              include: {
                person: { select: { id: true, name: true, email: true, phoneNumber: true } },
              },
            },
          },
        })
      : null;

    return NextResponse.json({
      host: {
        personId: event.host.id,
        name: event.host.name,
        email: event.host.email,
        phone: event.host.phoneNumber,
      },
      household,
    });
  } catch (error: any) {
    console.error('Error loading host household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/events/[id]/host-household — capture the host's own household (Rulings 1, 2,
// 6, 7, 8, 10). Create only; later edits go through the ordinary household PUT, which
// carries the demotion guard.
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body: HostHouseholdBody = await request.json();

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const namedOthers = [
      ...(body.partner ? [body.partner] : []),
      ...(body.helpers ?? []),
      ...(body.guests ?? []),
    ];
    for (const member of namedOthers) {
      if (member.email && !emailRegex.test(member.email)) {
        return NextResponse.json(
          { error: `Invalid email format: ${member.email}` },
          { status: 400 }
        );
      }
    }
    for (const helper of body.helpers ?? []) {
      if (!helper.name?.trim()) {
        return NextResponse.json({ error: 'Kid with a job must have a name' }, { status: 400 });
      }
    }
    if (body.littleCount !== undefined && (body.littleCount < 0 || body.littleCount > 20)) {
      return NextResponse.json(
        { error: 'Kids without jobs count must be between 0 and 20' },
        { status: 400 }
      );
    }
    if (!body.alone && !body.name?.trim()) {
      // Her name is prefilled from her Person, so an empty one means the client cleared
      // it. `POST /api/events` seeds that name as `email.split('@')[0]`, so it is often
      // a placeholder she is expected to fix — but never to blank.
      return NextResponse.json({ error: 'Your name is required' }, { status: 400 });
    }

    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { hostId: true, sentAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const input: HostHouseholdInput = {
      alone: body.alone === true,
      name: body.name,
      phone: body.phone,
      partner: body.partner,
      helpers: body.helpers,
      littleCount: body.littleCount,
      guests: body.guests,
      messagesMuted: body.messagesMuted,
    };

    const actor = await ledgerActorForUser(auth.user, auth.role);

    // GTC-201's reasoning applies unchanged: this is many dependent writes — a Household,
    // a PersonEvent, a Person update, then the member reconcile — and a failure part-way
    // would leave the host half-captured, which is worse than not captured at all because
    // the sequence guarantee would then read as satisfied.
    const result = await prisma.$transaction(async (tx) => {
      const created = await createHostHousehold(tx, {
        eventId,
        hostPersonId: event.hostId,
        sentAt: event.sentAt,
        input,
      });

      await recordChange(tx, {
        eventId,
        actor,
        changes: [
          {
            action: 'ADD_PERSON',
            targetType: 'Household',
            targetId: created.householdId,
            before: null,
            after: { hostHousehold: true, alone: input.alone },
          },
        ],
      });

      return created;
    });

    const household = await prisma.household.findUnique({
      where: { id: result.householdId },
      include: {
        members: {
          include: {
            person: { select: { id: true, name: true, email: true, phoneNumber: true } },
          },
        },
      },
    });

    return NextResponse.json({ household }, { status: 201 });
  } catch (error: any) {
    if (error instanceof HostHouseholdError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    // GTC-172 (C1): a rejected contact picker is a bad request, not a server fault. The
    // transaction has already rolled back, so the capture is not half-applied.
    if (error instanceof ChannelValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating host household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
