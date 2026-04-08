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

    // Get access tokens for each person (any scope — HOST, COORDINATOR, or PARTICIPANT)
    const tokens = await prisma.accessToken.findMany({
      where: { eventId },
      select: {
        personId: true,
        token: true,
        scope: true,
      },
    });

    // Create a map of personId -> { token, scope, prefix }
    // Prefer PARTICIPANT token; fall back to COORDINATOR or HOST
    const tokenMap = new Map<string, { token: string; scope: string }>();
    // First pass: add all tokens (later scopes may overwrite earlier ones)
    const scopePriority: Record<string, number> = { PARTICIPANT: 3, COORDINATOR: 2, HOST: 1 };
    tokens.forEach((t) => {
      const existing = tokenMap.get(t.personId);
      if (!existing || (scopePriority[t.scope] || 0) > (scopePriority[existing.scope] || 0)) {
        tokenMap.set(t.personId, { token: t.token, scope: t.scope });
      }
    });

    // Build response with people and their tokens
    const prefixMap: Record<string, string> = { HOST: 'h', COORDINATOR: 'c', PARTICIPANT: 'p' };
    const peopleWithTokens = people.map((pe) => {
      const entry = tokenMap.get(pe.person.id);
      return {
        id: pe.person.id,
        name: pe.person.name,
        token: entry?.token || null,
        tokenPrefix: entry ? prefixMap[entry.scope] || 'p' : null,
      };
    });

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
    return NextResponse.json({ error: 'Failed to load directory' }, { status: 500 });
  }
}
