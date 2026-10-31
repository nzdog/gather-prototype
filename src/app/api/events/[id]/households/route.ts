import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { normalizePhoneNumber } from '@/lib/phone';
import { validateChannelTarget } from '@/lib/households/channel';
import { hostHasMembership } from '@/lib/households/hostHousehold';
import { findOrCreateCapturedPerson } from '@/lib/households/capturePerson';
import { ChannelValidationError } from '@/lib/households/reconcileMembers';
import { addDemoCrowd } from '@/lib/demo/crowd';

// GET /api/events/[id]/households - List households for event
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const households = await prisma.household.findMany({
      where: { eventId },
      include: {
        members: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    return NextResponse.json({ households });
  } catch (error: any) {
    console.error('Error loading households:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

interface HouseholdMemberInput {
  name?: string;
  email?: string;
  phone?: string;
  /** GTC-172 (C1): explicit adult-roling of a kid with a job (§10.6). Helpers only. */
  adultRoled?: boolean;
}

interface HouseholdRequestBody {
  primaryContact: {
    name: string;
    email?: string;
    phone?: string;
  };
  partner?: HouseholdMemberInput;
  helpers?: Array<{ name: string; email?: string; phone?: string; adultRoled?: boolean }>;
  littleCount?: number;
  guests?: HouseholdMemberInput[];
  /** GTC-172 (C1): the household contact picker (§10.7). */
  contactPersonEventId?: string | null;
}

// POST /api/events/[id]/households - Create a household with members
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body: HouseholdRequestBody = await request.json();

    /*
     * [[GTC-392]] part B — THE SECOND SHAPE: `{ demoCrowd: true }` adds the made-up crowd to a
     * visitor's sample copy, in one transaction, once (founder plan rulings, 18 Oct 2026, QB3, QB4).
     * Refused 409, writing nothing, on any event that is not a sample copy, before her own household
     * is saved, and a second time. Read after the guard, before this route's own checks; the
     * ordinary shape below is unchanged.
     */
    if ((body as { demoCrowd?: unknown } | null)?.demoCrowd === true) {
      const crowdActor = await ledgerActorForUser(auth.user, auth.role);
      const crowd = await addDemoCrowd(prisma, eventId, crowdActor);
      if (!crowd.ok) {
        return NextResponse.json({ error: crowd.words, code: crowd.code }, { status: 409 });
      }
      const crowdHouseholds = await prisma.household.findMany({
        where: { id: { in: crowd.householdIds } },
        include: {
          members: {
            include: {
              person: { select: { id: true, name: true, email: true, phoneNumber: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });
      return NextResponse.json({ households: crowdHouseholds }, { status: 201 });
    }

    const { primaryContact, partner, helpers, littleCount, guests, contactPersonEventId } = body;

    // Validate primary contact name
    if (!primaryContact?.name?.trim()) {
      return NextResponse.json({ error: 'Primary contact name is required' }, { status: 400 });
    }

    // Validate email format if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allMembers = [
      primaryContact,
      ...(partner ? [partner] : []),
      ...(helpers || []),
      ...(guests || []),
    ];
    for (const member of allMembers) {
      if (member.email && !emailRegex.test(member.email)) {
        return NextResponse.json(
          { error: `Invalid email format: ${member.email}` },
          { status: 400 }
        );
      }
    }

    // Validate helper names (required for kids with jobs)
    if (helpers) {
      for (const helper of helpers) {
        if (!helper.name?.trim()) {
          return NextResponse.json({ error: 'Kid with a job must have a name' }, { status: 400 });
        }
      }
    }

    // Validate littleCount
    if (littleCount !== undefined && (littleCount < 0 || littleCount > 20)) {
      return NextResponse.json(
        { error: 'Kids without jobs count must be between 0 and 20' },
        { status: 400 }
      );
    }

    // Get event for inviteAnchorAt
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { sentAt: true, hostId: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    /*
     * GTC-256 (phase 2) — THE SEQUENCE GUARANTEE.
     *
     * Ruling 1's "Moment 1 OPENS with the host's own household" is a SEQUENCE, not a
     * screen order, and the difference is load-bearing. `createMember` below looks a
     * Person up by email and, finding no PersonEvent, creates one with a hard-coded
     * `role: 'PARTICIPANT'`. So a host who reaches another household first — and whose
     * own email is in it — is filed as a participant against the correct Person: the
     * duplicate half of the third state collapses under Ruling 10, but the WRONG-ROLE
     * half survives. Once her own row exists the same branch is a complete no-op,
     * because `existing.householdId` is set. Ordering is the entire difference, so it is
     * enforced here and not only in the UI.
     *
     * 409 rather than 400: nothing is wrong with the request, the event is in the wrong
     * state for it. V1 and seeded events already have a host membership and are
     * unaffected; no script or test drives this route over HTTP.
     */
    if (!(await hostHasMembership(prisma, eventId, event.hostId))) {
      return NextResponse.json(
        {
          error:
            'Add your own household first — Moment 1 opens with the host, and everyone else is added after.',
          code: 'HOST_HOUSEHOLD_REQUIRED',
        },
        { status: 409 }
      );
    }

    // Helper: find-or-create a Person and create their PersonEvent.
    // [[GTC-434]]: every write goes through `db`, the transaction below, so a household is
    // stored whole or not at all.
    async function createMember(
      db: Prisma.TransactionClient,
      input: HouseholdMemberInput,
      householdId: string,
      householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD',
      // GTC-172 (C1): DISPLAY ONLY — see the schema note on PersonEvent.isYoungPerson.
      // Never read for a send decision; householdRole is the sole gate (§10.6).
      isYoungPerson = false
    ) {
      if (!input.name?.trim()) return null;

      const normalizedPhone = input.phone ? normalizePhoneNumber(input.phone) : null;

      // [[GTC-293]]: who this row is — the address AND the first name, never the address alone.
      const person = await findOrCreateCapturedPerson(db, {
        eventId,
        hostPersonId: event!.hostId,
        name: input.name,
        email: input.email,
        phoneNumber: normalizedPhone,
        sentAt: event!.sentAt,
      });

      // Determine reachability
      let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
      let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

      // GTC-312: `|| person.phone` removed — same rule, same value, one column.
      // Found by this ticket's layer W walk rather than from its filed site list.
      if (person.phoneNumber) {
        contactMethod = 'SMS';
        reachabilityTier = 'DIRECT';
      } else if (person.email) {
        contactMethod = 'EMAIL';
        reachabilityTier = 'DIRECT';
      }

      // Check if person already in this event
      const existing = await db.personEvent.findUnique({
        where: { personId_eventId: { personId: person.id, eventId } },
      });

      if (existing) {
        // Link to household if not already linked
        if (!existing.householdId) {
          await db.personEvent.update({
            where: { id: existing.id },
            data: { householdId, householdRole, isYoungPerson },
          });
        }
        return existing;
      }

      return db.personEvent.create({
        data: {
          personId: person.id,
          eventId,
          role: 'PARTICIPANT',
          reachabilityTier,
          contactMethod,
          householdId,
          householdRole,
          isYoungPerson,
          // GTC-196: the mini-send clock — see people/route.ts for the full note.
          sentAt: event!.sentAt ?? null,
        },
      });
    }

    const hhActor = await ledgerActorForUser(auth.user, auth.role);

    /*
     * [[GTC-434]] (founder, 31 Oct 2026) — ONE TRANSACTION, as the PUT and her own household's
     * POST already are. The household, every member, the contact picker and the ledger entry are
     * written together: a failure part-way (a member's write refused, a bad picker) stores nothing,
     * where it used to keep the household, its adults and the children before the failing one, and
     * a retry then made a second household with no main contact. Database writes only: nothing in
     * here sends or calls out.
     */
    const householdId = await prisma.$transaction(async (tx) => {
      // Create household
      const household = await tx.household.create({
        data: {
          eventId,
          littleCount: littleCount ?? 0,
        },
      });

      // Create primary contact
      await createMember(tx, primaryContact, household.id, 'PRIMARY_CONTACT');

      // Create partner if provided with a name
      if (partner?.name?.trim()) {
        await createMember(tx, partner, household.id, 'PARTNER');
      }

      // Create helpers (kids with jobs).
      //
      // GTC-172 (C1): `adultRoled` is the host's explicit, deliberate decision that this
      // particular kid with a job is old enough to be messaged directly (§10.6). It
      // changes the STORED ROLE — there is no "child but messageable" state, because
      // that is the soft override §10.6 forbids. It is never inferred from a phone
      // number or anything else about the person's data.
      if (helpers) {
        for (const helper of helpers) {
          if (helper.name?.trim()) {
            await createMember(
              tx,
              helper,
              household.id,
              helper.adultRoled ? 'GUEST' : 'CHILD',
              true // captured as a kid with a job, whatever role they end up with
            );
          }
        }
      }

      // Create guests if provided with names
      if (guests) {
        for (const guest of guests) {
          if (guest.name?.trim()) {
            await createMember(tx, guest, household.id, 'GUEST');
          }
        }
      }

      // GTC-172 (C1): the household contact picker (§10.7). Applied after members exist.
      // On create this is normally a CROSS-HOUSEHOLD pick — an adult in an already-saved
      // household — since this household's own members have no ids until just now.
      // [[GTC-434]]: a refused pick throws, so the whole household is rolled back (400 below).
      if (contactPersonEventId) {
        const target = await tx.personEvent.findUnique({
          where: { id: contactPersonEventId },
          select: { eventId: true, householdRole: true },
        });
        const check = validateChannelTarget(target, eventId);
        if (!check.ok) throw new ChannelValidationError(check.error);
        await tx.household.update({
          where: { id: household.id },
          data: { contactPersonEventId },
        });
      }

      await recordChange(tx, {
        eventId,
        actor: hhActor,
        changes: [
          {
            action: 'ADD_PERSON',
            targetType: 'Household',
            targetId: household.id,
            before: null,
            after: { primaryContact: primaryContact?.name ?? null },
          },
        ],
      });

      return household.id;
    });

    // Fetch the complete household with members
    const result = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            person: {
              select: {
                id: true,
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ household: result }, { status: 201 });
  } catch (error: any) {
    // [[GTC-434]]: a refused contact picker is a bad request, as before; the transaction has
    // rolled back, so nothing of the household is kept.
    if (error instanceof ChannelValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('Error creating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
