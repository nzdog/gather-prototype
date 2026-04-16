import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { callClaudeForJSON } from '@/lib/ai/claude';

const AI_CALL_LIMIT = 10;

const VALID_SECTIONS = [
  'mains',
  'sides',
  'desserts',
  'drinks',
  'setup',
  'dietary',
  'other',
] as const;

type Section = (typeof VALID_SECTIONS)[number];

interface GeneratedItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
}

interface SectionInput {
  items?: Array<{ name: string; included: boolean }>;
  stillDeciding?: boolean;
  setupCrew?: boolean;
  cleanupCrew?: boolean;
  kidsOnDishes?: boolean;
  requirements?: string[];
  other?: string;
}

interface RequestBody {
  section: Section;
  eventType: string;
  eventTypeOther?: string;
  sectionData: SectionInput;
  householdData: {
    totalAdults: number;
    totalKids: number;
    dietaryRequirements: string[];
    kidsWithJobs: string[];
  };
}

function buildSectionPrompt(
  section: Section,
  eventType: string,
  sectionData: SectionInput,
  householdData: RequestBody['householdData']
): { system: string; user: string } {
  const totalPeople = householdData.totalAdults + householdData.totalKids;
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();

  const systemPrompt = `You are a meal planning assistant for a ${eventLabel}. Return only valid JSON matching the required shape. No prose, no markdown, no explanation.`;

  if (section === 'setup') {
    const setupData = sectionData as SectionInput;
    const userPrompt = `Generate setup and cleanup items for a ${eventLabel} for ${totalPeople} people (${householdData.totalAdults} adults, ${householdData.totalKids} children).

Setup crew needed: ${setupData.setupCrew ? 'yes' : 'no'}
Cleanup crew needed: ${setupData.cleanupCrew ? 'yes' : 'no'}
Kids on dishes: ${setupData.kidsOnDishes ? 'yes' : 'no'}
${householdData.kidsWithJobs.length > 0 ? `Kids with jobs: ${householdData.kidsWithJobs.join(', ')}` : ''}

Generate practical setup/cleanup items with quantities.

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`;

    return { system: systemPrompt, user: userPrompt };
  }

  if (section === 'dietary') {
    const dietaryData = sectionData as SectionInput;
    const userPrompt = `Generate dietary accommodation items for a ${eventLabel} for ${totalPeople} people.

Dietary requirements to accommodate: ${(dietaryData.requirements ?? []).join(', ') || 'none specified'}
${dietaryData.other ? `Other dietary needs: ${dietaryData.other}` : ''}

Generate specific food items that accommodate these dietary requirements. Each item should clearly serve a dietary need.

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`;

    return { system: systemPrompt, user: userPrompt };
  }

  // Food sections: mains, sides, desserts, drinks, other
  const sectionLabel =
    section === 'other'
      ? 'miscellaneous/extras'
      : section.charAt(0).toUpperCase() + section.slice(1);

  const includedItems = (sectionData.items ?? []).filter((i) => i.included).map((i) => i.name);
  const excludedItems = (sectionData.items ?? []).filter((i) => !i.included).map((i) => i.name);

  const userPrompt = `Generate the ${sectionLabel} section of a ${eventLabel} plan for ${householdData.totalAdults} adults and ${householdData.totalKids} children.

${householdData.dietaryRequirements.length > 0 ? `Dietary requirements to accommodate: ${householdData.dietaryRequirements.join(', ')}` : ''}

Kate's input:
- Items she wants: ${includedItems.length > 0 ? includedItems.join(', ') : 'none specified'}
- Items she has excluded: ${excludedItems.length > 0 ? excludedItems.join(', ') : 'none'}

Generate a list of ${section === 'other' ? 'miscellaneous' : section} appropriate for this event. Include Kate's wanted items first (with quantities), then fill in any gaps with sensible defaults.

For each item:
- Calculate quantities based on adult/kid counts
- Use real units (kg, pieces, trays, litres, bottles, bowls)
- Note any dietary accommodations

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`;

  return { system: systemPrompt, user: userPrompt };
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    // AI call cap check
    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const body: RequestBody = await request.json();

    // Validate section
    if (!VALID_SECTIONS.includes(body.section)) {
      return NextResponse.json(
        { error: 'Invalid section', allowed: VALID_SECTIONS },
        { status: 400 }
      );
    }

    // Skip if still deciding
    if (body.sectionData?.stillDeciding) {
      return NextResponse.json({ items: [], stored: false });
    }

    // Build and execute AI call
    const { system, user } = buildSectionPrompt(
      body.section,
      body.eventType,
      body.sectionData,
      body.householdData
    );

    const result = await callClaudeForJSON<{ items: GeneratedItem[] }>(system, user, {
      maxTokens: 1024,
      temperature: 0.8,
    });

    const items = result.items ?? [];

    // Store result in EventSetup.generatedData
    const setup = await prisma.eventSetup.findUnique({
      where: { eventId },
    });

    const existingData =
      setup?.generatedData &&
      typeof setup.generatedData === 'object' &&
      !Array.isArray(setup.generatedData)
        ? (setup.generatedData as Record<string, unknown>)
        : {};

    const updatedData = JSON.parse(JSON.stringify({ ...existingData, [body.section]: items }));

    await prisma.eventSetup.upsert({
      where: { eventId },
      create: {
        eventId,
        generatedData: updatedData,
      },
      update: {
        generatedData: updatedData,
      },
    });

    // Increment AI call counter
    await prisma.event.update({
      where: { id: eventId },
      data: { aiCallsUsed: { increment: 1 } },
    });

    return NextResponse.json({ items, stored: true });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to generate section',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
