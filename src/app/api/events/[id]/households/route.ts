import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

// GET /api/events/[id]/households - List households for event
export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id;

    // Require HOST, COHOST, or COORDINATOR role
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST', 'COORDINATOR']);
    if (auth instanceof NextResponse) return auth;

    const households = await prisma.household.findMany({
      where: { eventId },
      include: {
        proxyPerson: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        members: {
          include: {
            personEvent: {
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
            name: 'asc',
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

// POST /api/events/[id]/households - Host creates household with proxy
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const eventId = params.id;

    // Only HOST and COHOST can create households
    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json();
    const { proxyPersonId, name } = body;

    if (!proxyPersonId) {
      return NextResponse.json({ error: 'proxyPersonId is required' }, { status: 400 });
    }

    // Verify the proxy person exists
    const proxyPerson = await prisma.person.findUnique({
      where: { id: proxyPersonId },
    });

    if (!proxyPerson) {
      return NextResponse.json({ error: 'Proxy person not found' }, { status: 404 });
    }

    // Verify the proxy person is part of this event
    const proxyPersonEvent = await prisma.personEvent.findUnique({
      where: {
        personId_eventId: {
          personId: proxyPersonId,
          eventId,
        },
      },
    });

    if (!proxyPersonEvent) {
      return NextResponse.json(
        { error: 'Proxy person is not part of this event' },
        { status: 400 }
      );
    }

    // Check if a household already exists for this proxy person
    const existingHousehold = await prisma.household.findUnique({
      where: {
        eventId_proxyPersonId: {
          eventId,
          proxyPersonId,
        },
      },
    });

    if (existingHousehold) {
      return NextResponse.json(
        { error: 'Household already exists for this proxy person' },
        { status: 400 }
      );
    }

    // Create household
    const household = await prisma.household.create({
      data: {
        eventId,
        proxyPersonId,
        name: name || null,
      },
      include: {
        proxyPerson: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
          },
        },
        members: true,
      },
    });

    return NextResponse.json({ household }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating household:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
