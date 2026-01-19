import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * GET /api/gather/[eventId]/directory
 *
 * Public endpoint that returns basic event info and list of people
 * for the shareable family directory page.
 * No authentication required.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ eventId: string }> }
) {
  try {
    const { eventId } = await context.params;

    // Fetch event with basic info
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: {
        id: true,
        name: true,
        startDate: true,
        endDate: true,
        occasionType: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Fetch all people in this event with their participant tokens
    const people = await prisma.personEvent.findMany({
      where: { eventId },
      include: {
        person: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        person: {
          name: 'asc',
        },
      },
    });

    // Get participant tokens for each person
    const tokens = await prisma.accessToken.findMany({
      where: {
        eventId,
        scope: 'PARTICIPANT',
      },
      select: {
        personId: true,
        token: true,
      },
    });

    // Create a map of personId -> token
    const tokenMap = new Map<string, string>();
    tokens.forEach((t) => {
      tokenMap.set(t.personId, t.token);
    });

    // Build response with people and their tokens
    const peopleWithTokens = people.map((pe) => ({
      id: pe.person.id,
      name: pe.person.name,
      token: tokenMap.get(pe.person.id) || null,
    }));

    return NextResponse.json({
      event: {
        id: event.id,
        name: event.name,
        startDate: event.startDate.toISOString(),
        endDate: event.endDate.toISOString(),
        occasionType: event.occasionType,
      },
      people: peopleWithTokens,
    });
  } catch (error: any) {
    console.error('Error fetching directory:', error);
    return NextResponse.json(
      { error: 'Failed to load directory' },
      { status: 500 }
    );
  }
}
