import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { normalizePhoneNumber } from '@/lib/phone';

interface HouseholdMemberInput {
  name?: string;
  email?: string;
  phone?: string;
}

interface HouseholdRequestBody {
  primaryContact: {
    name: string;
    email?: string;
    phone?: string;
  };
  partner?: HouseholdMemberInput;
  childCount?: number;
  guests?: HouseholdMemberInput[];
}

// PUT /api/events/[id]/households/[householdId] - Update a household
export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string; householdId: string }> }
) {
  try {
    const { id, householdId } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body: HouseholdRequestBody = await request.json();
    const { primaryContact, partner, childCount, guests } = body;

    // Validate primary contact name
    if (!primaryContact?.name?.trim()) {
      return NextResponse.json({ error: 'Primary contact name is required' }, { status: 400 });
    }

    // Validate email format if provided
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const allMembers = [primaryContact, ...(partner ? [partner] : []), ...(guests || [])];
    for (const member of allMembers) {
      if (member.email && !emailRegex.test(member.email)) {
        return NextResponse.json(
          { error: `Invalid email format: ${member.email}` },
          { status: 400 }
        );
      }
    }

    // Validate childCount
    if (childCount !== undefined && (childCount < 0 || childCount > 20)) {
      return NextResponse.json({ error: 'Child count must be between 0 and 20' }, { status: 400 });
    }

    // Find existing household
    const household = await prisma.household.findUnique({
      where: { id: householdId },
      include: {
        members: {
          include: {
            person: true,
          },
        },
      },
    });

    if (!household || household.eventId !== eventId) {
      return NextResponse.json({ error: 'Household not found' }, { status: 404 });
    }

    // Get event for inviteAnchorAt
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { inviteSendConfirmedAt: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Find primary contact member
    const primaryMember = household.members.find((m) => m.householdRole === 'PRIMARY_CONTACT');
    if (!primaryMember) {
      return NextResponse.json(
        { error: 'Primary contact not found in household' },
        { status: 500 }
      );
    }

    // Delete all non-primary PersonEvent records for this household
    const nonPrimaryIds = household.members
      .filter((m) => m.householdRole !== 'PRIMARY_CONTACT')
      .map((m) => m.id);

    if (nonPrimaryIds.length > 0) {
      await prisma.personEvent.deleteMany({
        where: { id: { in: nonPrimaryIds } },
      });
    }

    // Update primary contact Person record
    const normalizedPrimaryPhone = primaryContact.phone
      ? normalizePhoneNumber(primaryContact.phone)
      : null;

    await prisma.person.update({
      where: { id: primaryMember.personId },
      data: {
        name: primaryContact.name.trim(),
        email: primaryContact.email || null,
        phoneNumber: normalizedPrimaryPhone,
      },
    });

    // Update primary contact PersonEvent reachability
    let primaryReachability: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
    let primaryContactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';
    if (normalizedPrimaryPhone) {
      primaryContactMethod = 'SMS';
      primaryReachability = 'DIRECT';
    } else if (primaryContact.email) {
      primaryContactMethod = 'EMAIL';
      primaryReachability = 'DIRECT';
    }

    await prisma.personEvent.update({
      where: { id: primaryMember.id },
      data: {
        reachabilityTier: primaryReachability,
        contactMethod: primaryContactMethod,
      },
    });

    // Helper: find-or-create a Person and create their PersonEvent
    async function createMember(
      input: HouseholdMemberInput,
      hhId: string,
      householdRole: 'PARTNER' | 'GUEST'
    ) {
      if (!input.name?.trim()) return null;

      const normalizedPhone = input.phone ? normalizePhoneNumber(input.phone) : null;

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
            inviteAnchorAt: event!.inviteSendConfirmedAt || null,
          },
        });
      } else if (event!.inviteSendConfirmedAt && !person.inviteAnchorAt) {
        person = await prisma.person.update({
          where: { id: person.id },
          data: { inviteAnchorAt: event!.inviteSendConfirmedAt },
        });
      }

      let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
      let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

      if (person.phoneNumber || (person as any).phone) {
        contactMethod = 'SMS';
        reachabilityTier = 'DIRECT';
      } else if (person.email) {
        contactMethod = 'EMAIL';
        reachabilityTier = 'DIRECT';
      }

      const existing = await prisma.personEvent.findUnique({
        where: { personId_eventId: { personId: person.id, eventId } },
      });

      if (existing) {
        if (!existing.householdId || existing.householdId === hhId) {
          await prisma.personEvent.update({
            where: { id: existing.id },
            data: { householdId: hhId, householdRole },
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
          householdId: hhId,
          householdRole,
        },
      });
    }

    // Update childCount
    await prisma.household.update({
      where: { id: householdId },
      data: { childCount: childCount ?? 0 },
    });

    // Re-create partner if provided
    if (partner?.name?.trim()) {
      await createMember(partner, householdId, 'PARTNER');
    }

    // Re-create guests if provided
    if (guests) {
      for (const guest of guests) {
        if (guest.name?.trim()) {
          await createMember(guest, householdId, 'GUEST');
        }
      }
    }

    // Fetch the complete updated household
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

    return NextResponse.json({ household: result });
  } catch (error: any) {
    console.error('Error updating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
