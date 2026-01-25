import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { normalizePhoneNumber } from '@/lib/phone';

// GET /api/events/[id]/people - List people on this event
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const people = await prisma.personEvent.findMany({
      where: { eventId },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        role: 'asc', // HOST, COORDINATOR, PARTICIPANT
      },
    });

    // Count items assigned to each person
    const peopleWithCounts = await Promise.all(
      people.map(async (pe) => {
        const itemCount = await prisma.assignment.count({
          where: {
            personId: pe.personId,
            item: {
              team: {
                eventId,
              },
            },
          },
        });

        return {
          id: pe.id,
          personId: pe.person.id,
          name: pe.person.name,
          email: pe.person.email,
          phone: pe.person.phone,
          role: pe.role,
          team: pe.team || { id: '', name: 'Unassigned' },
          itemCount,
        };
      })
    );

    return NextResponse.json({ people: peopleWithCounts });
  } catch (error: any) {
    console.error('Error loading people:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST /api/events/[id]/people - Add person to event
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id;

    // Only HOST and COHOST can add people
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { name, email, phone, role, teamId } = body;

    if (!name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Normalize phone number (API should accept raw input and normalize)
    const normalizedPhone = phone ? normalizePhoneNumber(phone) : null;

    // Get event to check if invites have been confirmed
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { inviteSendConfirmedAt: true, status: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Validate team belongs to event (if teamId provided)
    if (teamId) {
      const team = await prisma.team.findFirst({
        where: { id: teamId, eventId },
      });

      if (!team) {
        return NextResponse.json(
          { error: 'Team not found or does not belong to this event' },
          { status: 404 }
        );
      }
    }

    // Create or find person
    let person;
    if (email) {
      person = await prisma.person.findUnique({ where: { email } });
    }

    if (!person) {
      // Create new person with anchor if invites already confirmed
      person = await prisma.person.create({
        data: {
          name,
          email: email || null,
          phoneNumber: normalizedPhone,
          inviteAnchorAt: event.inviteSendConfirmedAt || null,
        },
      });
    } else if (event.inviteSendConfirmedAt && !person.inviteAnchorAt) {
      // If person exists but doesn't have an anchor, set it
      person = await prisma.person.update({
        where: { id: person.id },
        data: { inviteAnchorAt: event.inviteSendConfirmedAt },
      });
    }

    // Check if person already exists in this event
    const existing = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId: person.id,
          eventId,
        },
      },
    });

    if (existing) {
      return NextResponse.json({ error: 'Person is already part of this event' }, { status: 400 });
    }

    // Determine reachability tier and contact method based on contact info
    let reachabilityTier: 'DIRECT' | 'UNTRACKABLE' = 'UNTRACKABLE';
    let contactMethod: 'EMAIL' | 'SMS' | 'NONE' = 'NONE';

    if (person.phoneNumber || person.phone) {
      contactMethod = 'SMS';
      reachabilityTier = 'DIRECT';
    } else if (person.email) {
      contactMethod = 'EMAIL';
      reachabilityTier = 'DIRECT';
    }

    // Create PersonEvent linking person to event and team
    const personEvent = await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId,
        teamId: teamId || null,
        role: role || 'PARTICIPANT',
        reachabilityTier,
        contactMethod,
      },
      include: {
        person: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
        },
        team: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      personEvent: {
        id: personEvent.id,
        personId: personEvent.person.id,
        name: personEvent.person.name,
        email: personEvent.person.email,
        phone: personEvent.person.phone,
        role: personEvent.role,
        team: personEvent.team || { id: '', name: 'Unassigned' },
        itemCount: 0,
      },
    });
  } catch (error: any) {
    console.error('Error adding person:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
