import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface PersonToImport {
  name: string;
  email?: string | null;
  phone?: string | null;
  role?: string;
  teamId?: string | null;
}

// POST /api/events/[id]/people/batch-import - Import multiple people at once
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const eventId = params.id;
    const body = await request.json();
    const { people } = body as { people: PersonToImport[] };

    if (!Array.isArray(people) || people.length === 0) {
      return NextResponse.json(
        { error: 'No people provided for import' },
        { status: 400 }
      );
    }

    // Validate event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      select: { id: true, status: true },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // Only allow import in DRAFT mode
    if (event.status !== 'DRAFT') {
      return NextResponse.json(
        { error: 'People can only be imported in DRAFT mode' },
        { status: 400 }
      );
    }

    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Process each person
    for (const personData of people) {
      try {
        // Validate required fields
        if (!personData.name || !personData.name.trim()) {
          errors.push(`Skipped row: Missing name`);
          skipped++;
          continue;
        }

        // Validate team if provided
        if (personData.teamId) {
          const team = await prisma.team.findFirst({
            where: { id: personData.teamId, eventId },
          });

          if (!team) {
            errors.push(`Skipped ${personData.name}: Invalid team`);
            skipped++;
            continue;
          }
        }

        // Create or find person by email
        let person;
        if (personData.email) {
          person = await prisma.person.findUnique({
            where: { email: personData.email },
          });
        }

        if (!person) {
          person = await prisma.person.create({
            data: {
              name: personData.name.trim(),
              email: personData.email || null,
              phone: personData.phone || null,
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
          // Skip duplicates silently
          skipped++;
          continue;
        }

        // Create PersonEvent linking person to event
        await prisma.personEvent.create({
          data: {
            personId: person.id,
            eventId,
            teamId: personData.teamId || null,
            role: personData.role || 'PARTICIPANT',
          },
        });

        imported++;
      } catch (error: any) {
        console.error(`Error importing person ${personData.name}:`, error);
        errors.push(`Error importing ${personData.name}: ${error.message}`);
        skipped++;
      }
    }

    return NextResponse.json({
      imported,
      skipped,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error: any) {
    console.error('Error in batch import:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
