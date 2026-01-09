import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/events/[id]/people - List people on this event
export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;

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
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;
    const body = await request.json();
    const { name, email, phone, role, teamId } = body;

    if (!name || !teamId) {
      return NextResponse.json(
        { error: 'Name and team are required' },
        { status: 400 }
      );
    }

    // Validate team belongs to event
    const team = await prisma.team.findFirst({
      where: { id: teamId, eventId },
    });

    if (!team) {
      return NextResponse.json(
        { error: 'Team not found or does not belong to this event' },
        { status: 404 }
      );
    }

    // Create or find person
    let person;
    if (email) {
      person = await prisma.person.findUnique({ where: { email } });
    }

    if (!person) {
      person = await prisma.person.create({
        data: {
          name,
          email: email || null,
          phone: phone || null,
        },
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
      return NextResponse.json(
        { error: 'Person is already part of this event' },
        { status: 400 }
      );
    }

    // Create PersonEvent linking person to event and team
    const personEvent = await prisma.personEvent.create({
      data: {
        personId: person.id,
        eventId,
        teamId,
        role: role || 'PARTICIPANT',
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
