import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { normalizePhoneNumber } from '@/lib/phone';

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
}

interface HouseholdRequestBody {
  primaryContact: {
    name: string;
    email?: string;
    phone?: string;
  };
  partner?: HouseholdMemberInput;
  helpers?: Array<{ name: string; email?: string; phone?: string }>;
  littleCount?: number;
  guests?: HouseholdMemberInput[];
}

// POST /api/events/[id]/households - Create a household with members
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const eventId = id;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body: HouseholdRequestBody = await request.json();
    const { primaryContact, partner, helpers, littleCount, guests } = body;

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
      householdRole: 'PRIMARY_CONTACT' | 'PARTNER' | 'GUEST' | 'CHILD'
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
            data: { householdId, householdRole },
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

    // Create helpers (kids with jobs)
    if (helpers) {
      for (const helper of helpers) {
        if (helper.name?.trim()) {
          await createMember(helper, household.id, 'CHILD');
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

    return NextResponse.json({ household: result }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
