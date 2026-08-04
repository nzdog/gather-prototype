import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { ledgerActorForUser } from '@/lib/auth/actor';
import { recordChange } from '@/lib/ledger';
import { normalizePhoneNumber } from '@/lib/phone';
import { validateChannelTarget } from '@/lib/households/channel';

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
      select: { sentAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Helper: find-or-create a Person and create their PersonEvent
    async function createMember(
      input: HouseholdMemberInput,
      householdId: string,
      householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD',
      // GTC-172 (C1): DISPLAY ONLY — see the schema note on PersonEvent.isYoungPerson.
      // Never read for a send decision; householdRole is the sole gate (§10.6).
      isYoungPerson = false
    ) {
      if (!input.name?.trim()) return null;

      const normalizedPhone = input.phone ? normalizePhoneNumber(input.phone) : null;

      // Find existing person by email if provided
      let person;
      if (input.email) {
        person = await prisma.person.findUnique({ where: { email: input.email } });
      }

      if (!person) {
        person = await prisma.person.create({
          data: {
            name: input.name.trim(),
            email: input.email || null,
            phoneNumber: normalizedPhone,
            inviteAnchorAt: event!.sentAt || null,
          },
        });
      } else if (event!.sentAt && !person.inviteAnchorAt) {
        person = await prisma.person.update({
          where: { id: person.id },
          data: { inviteAnchorAt: event!.sentAt },
        });
      }

      // Determine reachability
      let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
      let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

      if (person.phoneNumber || person.phone) {
        contactMethod = 'SMS';
        reachabilityTier = 'DIRECT';
      } else if (person.email) {
        contactMethod = 'EMAIL';
        reachabilityTier = 'DIRECT';
      }

      // Check if person already in this event
      const existing = await prisma.personEvent.findUnique({
        where: { personId_eventId: { personId: person.id, eventId } },
      });

      if (existing) {
        // Link to household if not already linked
        if (!existing.householdId) {
          await prisma.personEvent.update({
            where: { id: existing.id },
            data: { householdId, householdRole, isYoungPerson },
          });
        }
        return existing;
      }

      return prisma.personEvent.create({
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

    // Create household
    const household = await prisma.household.create({
      data: {
        eventId,
        littleCount: littleCount ?? 0,
      },
    });

    // Create primary contact
    await createMember(primaryContact, household.id, 'PRIMARY_CONTACT');

    // Create partner if provided with a name
    if (partner?.name?.trim()) {
      await createMember(partner, household.id, 'PARTNER');
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
          await createMember(guest, household.id, 'GUEST');
        }
      }
    }

    // GTC-172 (C1): the household contact picker (§10.7). Applied after members exist.
    // On create this is normally a CROSS-HOUSEHOLD pick — an adult in an already-saved
    // household — since this household's own members have no ids until just now.
    if (contactPersonEventId) {
      const target = await prisma.personEvent.findUnique({
        where: { id: contactPersonEventId },
        select: { eventId: true, householdRole: true },
      });
      const check = validateChannelTarget(target, eventId);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 400 });
      }
      await prisma.household.update({
        where: { id: household.id },
        data: { contactPersonEventId },
      });
    }

    // Fetch the complete household with members
    const result = await prisma.household.findUnique({
      where: { id: household.id },
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

    const hhActor = await ledgerActorForUser(auth.user, auth.role);
    await prisma.$transaction((tx) =>
      recordChange(tx, {
        eventId,
        actor: hhActor,
        changes: [
          {
            action: 'ADD_PERSON',
            targetType: 'Household',
            targetId: result?.id ?? '',
            before: null,
            after: { primaryContact: primaryContact?.name ?? null },
          },
        ],
      })
    );

    return NextResponse.json({ household: result }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
