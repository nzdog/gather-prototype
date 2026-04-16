import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';

const ALLOWED_EVENT_TYPES = [
  'BBQ',
  'Roast dinner',
  'Potluck',
  'Picnic',
  'Kids party',
  'Christmas',
  'Other',
];

interface SectionData {
  items: string[];
  stillDeciding: boolean;
}

interface SetupCleanupData {
  setupCrew: boolean;
  cleanupCrew: boolean;
  kidsOnDishes: boolean;
  stillDeciding: boolean;
}

interface DietaryData {
  requirements: string[];
  other?: string;
}

interface EventSetupBody {
  eventType?: string;
  eventTypeOther?: string;
  mainsData?: SectionData;
  sidesData?: SectionData;
  dessertsData?: SectionData;
  drinksData?: SectionData;
  setupCleanupData?: SetupCleanupData;
  dietaryData?: DietaryData;
  otherNotes?: string;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const setup = await prisma.eventSetup.findUnique({
      where: { eventId },
    });

    return NextResponse.json({ setup: setup ?? null });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to fetch event setup',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    // Verify event exists
    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const body: EventSetupBody = await request.json();

    // Validate eventType
    if (body.eventType !== undefined) {
      if (!ALLOWED_EVENT_TYPES.includes(body.eventType)) {
        return NextResponse.json(
          { error: 'Invalid eventType', allowed: ALLOWED_EVENT_TYPES },
          { status: 400 }
        );
      }

      if (body.eventType === 'Other' && !body.eventTypeOther?.trim()) {
        return NextResponse.json(
          { error: 'eventTypeOther is required when eventType is "Other"' },
          { status: 400 }
        );
      }
    }

    // Validate dietaryData if provided
    if (body.dietaryData !== undefined) {
      if (!Array.isArray(body.dietaryData.requirements)) {
        return NextResponse.json(
          { error: 'dietaryData.requirements must be an array of strings' },
          { status: 400 }
        );
      }
    }

    // Build update data — only include fields present in the request body
    const data: Record<string, unknown> = {};
    if ('eventType' in body) data.eventType = body.eventType;
    if ('eventTypeOther' in body) data.eventTypeOther = body.eventTypeOther;
    if ('mainsData' in body) data.mainsData = body.mainsData;
    if ('sidesData' in body) data.sidesData = body.sidesData;
    if ('dessertsData' in body) data.dessertsData = body.dessertsData;
    if ('drinksData' in body) data.drinksData = body.drinksData;
    if ('setupCleanupData' in body) data.setupCleanupData = body.setupCleanupData;
    if ('dietaryData' in body) data.dietaryData = body.dietaryData;
    if ('otherNotes' in body) data.otherNotes = body.otherNotes;

    const setup = await prisma.eventSetup.upsert({
      where: { eventId },
      create: { eventId, ...data },
      update: data,
    });

    return NextResponse.json({ setup });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to save event setup',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
