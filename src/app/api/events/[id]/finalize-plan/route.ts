import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { callClaudeForJSON } from '@/lib/ai/claude';

const AI_CALL_LIMIT = 10;

const CATEGORY_EMOJIS: Record<string, string> = {
  mains: '🍖',
  sides: '🥗',
  desserts: '🍰',
  drinks: '🍺',
  setup: '🧹',
  dietary: '⚠️',
  other: '📝',
};

const CATEGORY_LABELS: Record<string, string> = {
  mains: 'Mains',
  sides: 'Sides',
  desserts: 'Dessert',
  drinks: 'Drinks',
  setup: 'Setup & Cleanup',
  dietary: 'Dietary',
  other: 'Other',
};

const FOOD_SECTIONS = ['mains', 'sides', 'desserts', 'drinks', 'setup', 'dietary'] as const;

interface GeneratedItem {
  name: string;
  quantity: number;
  unit: string;
  servingSize: string;
  notes?: string;
  dietaryTags?: string[];
}

interface HouseholdData {
  totalAdults: number;
  totalKids: number;
  dietaryRequirements: string[];
}

function buildGapPrompt(
  section: string,
  eventType: string,
  householdData: HouseholdData
): { system: string; user: string } {
  const totalPeople = householdData.totalAdults + householdData.totalKids;
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();
  const sectionLabel = CATEGORY_LABELS[section] ?? section;

  return {
    system: `You are a meal planning assistant for a ${eventLabel}. Return only valid JSON. No prose.`,
    user: `Generate the ${sectionLabel} section for a ${eventLabel} for ${householdData.totalAdults} adults and ${householdData.totalKids} children (${totalPeople} total).

${householdData.dietaryRequirements.length > 0 ? `Dietary requirements: ${householdData.dietaryRequirements.join(', ')}` : ''}

Generate sensible defaults for this event type. Use real units (kg, pieces, trays, litres, bottles).

Return JSON: { "items": [{ "name": string, "quantity": number, "unit": string, "servingSize": string, "notes": string (optional) }] }`,
  };
}

function buildDietaryCoveragePrompt(
  allItems: Array<{ category: string; items: GeneratedItem[] }>,
  dietaryRequirements: string[]
): { system: string; user: string } {
  const itemList = allItems
    .flatMap((c) => c.items.map((i) => `${c.category}: ${i.name}${i.notes ? ` (${i.notes})` : ''}`))
    .join('\n');

  return {
    system: 'You are a dietary requirement checker. Return only valid JSON. No prose.',
    user: `Check whether these dietary requirements are covered by the plan items.

Dietary requirements: ${dietaryRequirements.join(', ')}

Plan items:
${itemList}

For each requirement, determine if it's adequately covered.

Return JSON: { "coverage": [{ "requirement": string, "covered": boolean, "flaggedItems": string[] (items that help cover it, or empty if not covered) }] }`,
  };
}

function buildThingsToConsiderPrompt(
  eventType: string,
  totalPeople: number
): { system: string; user: string } {
  const eventLabel = eventType === 'Other' ? 'event' : eventType.toLowerCase();

  return {
    system: 'You are an event planning assistant. Return only valid JSON. No prose.',
    user: `Suggest 6-10 "things to consider" items for a ${eventLabel} for ${totalPeople} people. These are items the host might forget — napkins, ice, serving spoons, rubbish bags, etc.

Each item should include a suggested category (where it would go if added to the plan).

Return JSON: { "items": [{ "name": string, "category": string }] }`,
  };
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
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

    // AI call cap — ensure at least 1 call remaining for finalize
    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const setup = await prisma.eventSetup.findUnique({
      where: { eventId },
    });

    if (!setup) {
      return NextResponse.json({ error: 'No event setup found' }, { status: 404 });
    }

    const generatedData: Record<string, GeneratedItem[]> =
      setup.generatedData &&
      typeof setup.generatedData === 'object' &&
      !Array.isArray(setup.generatedData)
        ? JSON.parse(JSON.stringify(setup.generatedData))
        : {};

    const eventType = setup.eventType ?? 'Other';

    // Gather household data from setup
    const dietaryData = setup.dietaryData as { requirements?: string[]; other?: string } | null;
    const dietaryRequirements = dietaryData?.requirements ?? [];

    // Count people from households
    let totalAdults = 0;
    let totalKids = 0;
    try {
      const households = await prisma.household.findMany({
        where: { eventId },
        include: { members: true },
      });
      for (const h of households) {
        for (const m of h.members) {
          if (m.householdRole === 'CHILD') {
            totalKids++;
          } else {
            totalAdults++;
          }
        }
        if (typeof (h as Record<string, unknown>).littleCount === 'number') {
          totalKids += (h as Record<string, unknown>).littleCount as number;
        }
      }
    } catch {
      // Fallback — use event guestCount
      totalAdults = event.guestCount ?? 10;
    }

    if (totalAdults === 0 && totalKids === 0) {
      totalAdults = event.guestCount ?? 10;
    }

    const householdData: HouseholdData = {
      totalAdults,
      totalKids,
      dietaryRequirements,
    };

    // Fill gaps — generate any missing sections
    let aiCallsUsedInFinalize = 0;
    const currentAiCalls = event.aiCallsUsed ?? 0;

    for (const section of FOOD_SECTIONS) {
      if (generatedData[section]) continue;

      // Check if this section is "still deciding"
      const sectionKey =
        section === 'setup'
          ? 'setupCleanupData'
          : section === 'dietary'
            ? 'dietaryData'
            : `${section}Data`;
      const sectionSetup = (setup as Record<string, unknown>)[sectionKey] as {
        stillDeciding?: boolean;
      } | null;
      if (sectionSetup?.stillDeciding) continue;

      // Check cap before each call
      if (currentAiCalls + aiCallsUsedInFinalize >= AI_CALL_LIMIT) break;

      const { system, user } = buildGapPrompt(section, eventType, householdData);
      const result = await callClaudeForJSON<{ items: GeneratedItem[] }>(system, user, {
        maxTokens: 1024,
        temperature: 0.8,
      });
      generatedData[section] = result.items ?? [];
      aiCallsUsedInFinalize++;
    }

    // Build categories from generated data
    const categories = Object.entries(generatedData)
      .filter(([, items]) => items && items.length > 0)
      .map(([section, items]) => ({
        name: CATEGORY_LABELS[section] ?? section,
        emoji: CATEGORY_EMOJIS[section] ?? '📋',
        items: items.map((item) => ({
          ...item,
          dietaryTags: item.dietaryTags ?? [],
        })),
      }));

    // Dietary coverage check (only if requirements exist, and we have cap room)
    let dietaryCoverage: Array<{
      requirement: string;
      covered: boolean;
      flaggedItems?: string[];
    }> = [];

    if (dietaryRequirements.length > 0 && currentAiCalls + aiCallsUsedInFinalize < AI_CALL_LIMIT) {
      const allItems = Object.entries(generatedData).map(([cat, items]) => ({
        category: cat,
        items,
      }));
      const { system, user } = buildDietaryCoveragePrompt(allItems, dietaryRequirements);
      const coverageResult = await callClaudeForJSON<{
        coverage: Array<{ requirement: string; covered: boolean; flaggedItems: string[] }>;
      }>(system, user, { maxTokens: 512, temperature: 0.3 });
      dietaryCoverage = coverageResult.coverage ?? [];
      aiCallsUsedInFinalize++;
    }

    // Things to consider (if we have cap room)
    let thingsToConsider: Array<{ name: string; category: string }> = [];

    if (currentAiCalls + aiCallsUsedInFinalize < AI_CALL_LIMIT) {
      const totalPeople = totalAdults + totalKids;
      const { system, user } = buildThingsToConsiderPrompt(eventType, totalPeople);
      const considerResult = await callClaudeForJSON<{
        items: Array<{ name: string; category: string }>;
      }>(system, user, { maxTokens: 512, temperature: 0.8 });
      thingsToConsider = considerResult.items ?? [];
      aiCallsUsedInFinalize++;
    }

    // Persist generatedData back to EventSetup
    await prisma.eventSetup.update({
      where: { eventId },
      data: { generatedData: JSON.parse(JSON.stringify(generatedData)) },
    });

    // Increment AI call counter for all calls made during finalize
    if (aiCallsUsedInFinalize > 0) {
      await prisma.event.update({
        where: { id: eventId },
        data: { aiCallsUsed: { increment: aiCallsUsedInFinalize } },
      });
    }

    // Persist generated items to Team/Item models for downstream use
    const batchId = `m2-finalize-${Date.now()}`;

    for (const category of categories) {
      // Find or create team for this category
      let team = await prisma.team.findFirst({
        where: { eventId, name: category.name },
      });

      if (!team) {
        const maxOrder = await prisma.team.aggregate({
          where: { eventId },
          _max: { displayOrder: true },
        });
        team = await prisma.team.create({
          data: {
            name: category.name,
            eventId,
            source: 'GENERATED',
            displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
          },
        });
      }

      // Seed sequential displayOrder starting after any existing items in the team,
      // so re-running finalize-plan appends without colliding with prior batches.
      const existingMaxOrder = await prisma.item.aggregate({
        where: { teamId: team.id },
        _max: { displayOrder: true },
      });
      let nextDisplayOrder = (existingMaxOrder._max.displayOrder ?? 0) + 1;

      // Create items
      for (const item of category.items) {
        await prisma.item.create({
          data: {
            name: item.name,
            teamId: team.id,
            quantityAmount: item.quantity,
            quantityUnit: 'CUSTOM',
            quantityUnitCustom: item.unit,
            quantityText: item.servingSize,
            notes: item.notes ?? null,
            source: 'GENERATED',
            aiGenerated: true,
            userConfirmed: false,
            generatedBatchId: batchId,
            displayOrder: nextDisplayOrder,
            dietaryTags:
              item.dietaryTags && item.dietaryTags.length > 0 ? item.dietaryTags : undefined,
          },
        });
        nextDisplayOrder++;
      }
    }

    return NextResponse.json({
      plan: {
        categories,
        dietaryCoverage,
        thingsToConsider,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to finalize plan',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
