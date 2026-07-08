import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { validateDietaryData, type DietaryData } from '@/lib/dietary';

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

interface OptionTreeLevelSelection {
  options: string[];
  freeText: string;
}

type OptionTreeSelections = Record<string, OptionTreeLevelSelection>;

interface ExtendedCategoryEntry {
  selections?: OptionTreeSelections;
  stillDeciding?: boolean;
}

type ExtendedCategoriesData = Record<string, ExtendedCategoryEntry>;

interface OtherJobsAccordionData {
  freeText: string;
  stillDeciding: boolean;
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
  extendedCategoriesData?: ExtendedCategoriesData;
  setUpData?: OtherJobsAccordionData;
  cleanUpData?: OtherJobsAccordionData;
  otherJobsOtherData?: OtherJobsAccordionData;
}

const OTHER_JOBS_FIELDS = ['setUpData', 'cleanUpData', 'otherJobsOtherData'] as const;
type OtherJobsField = (typeof OTHER_JOBS_FIELDS)[number];

function validateOtherJobsField(field: OtherJobsField, value: unknown): NextResponse | null {
  if (value === null) return null;
  if (!isPlainObject(value)) {
    return NextResponse.json(
      {
        error: `${field} must be an object with shape { freeText: string, stillDeciding: boolean }`,
      },
      { status: 400 }
    );
  }
  const allowedKeys = new Set(['freeText', 'stillDeciding']);
  for (const key of Object.keys(value)) {
    if (!allowedKeys.has(key)) {
      return NextResponse.json(
        { error: `${field} contains unexpected key "${key}". Allowed: freeText, stillDeciding` },
        { status: 400 }
      );
    }
  }
  if ('freeText' in value && typeof value.freeText !== 'string') {
    return NextResponse.json({ error: `${field}.freeText must be a string` }, { status: 400 });
  }
  if ('stillDeciding' in value && typeof value.stillDeciding !== 'boolean') {
    return NextResponse.json(
      { error: `${field}.stillDeciding must be a boolean` },
      { status: 400 }
    );
  }
  return null;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

    // Validate dietaryData if provided — three-state shape with coherence
    // rules (GTC-150): status must match content; legacy statusless writes
    // are still accepted and inferred on read.
    if (body.dietaryData !== undefined) {
      const dietaryError = validateDietaryData(body.dietaryData);
      if (dietaryError) {
        return NextResponse.json({ error: dietaryError }, { status: 400 });
      }
    }

    // Validate extendedCategoriesData shape if provided. Lightweight gate: must be a
    // plain object whose values are plain objects. Per-level selection shape is trusted
    // to the modal — mismatched data round-trips harmlessly through Prisma's Json column.
    if (body.extendedCategoriesData !== undefined) {
      if (!isPlainObject(body.extendedCategoriesData)) {
        return NextResponse.json(
          { error: 'extendedCategoriesData must be an object keyed by category' },
          { status: 400 }
        );
      }
      for (const [key, entry] of Object.entries(body.extendedCategoriesData)) {
        if (!isPlainObject(entry)) {
          return NextResponse.json(
            { error: `extendedCategoriesData.${key} must be an object` },
            { status: 400 }
          );
        }
      }
    }

    // Validate the three Other-jobs free-text fields if present
    for (const field of OTHER_JOBS_FIELDS) {
      if (field in body) {
        const err = validateOtherJobsField(field, body[field] as unknown);
        if (err) return err;
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
    if ('extendedCategoriesData' in body) data.extendedCategoriesData = body.extendedCategoriesData;
    if ('setUpData' in body) data.setUpData = body.setUpData;
    if ('cleanUpData' in body) data.cleanUpData = body.cleanUpData;
    if ('otherJobsOtherData' in body) data.otherJobsOtherData = body.otherJobsOtherData;

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
