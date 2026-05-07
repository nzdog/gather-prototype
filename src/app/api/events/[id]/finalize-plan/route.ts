import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { callClaudeForJSON } from '@/lib/ai/claude';
import {
  MAX_TOKENS_GAP_FILL,
  MAX_TOKENS_DIETARY_COVERAGE,
  MAX_TOKENS_CONSIDERATIONS,
} from '@/lib/ai/token-limits';
import {
  buildGapPrompt,
  buildDietaryCoveragePrompt,
  buildThingsToConsiderPrompt,
} from '@/lib/ai/prompts';

const AI_CALL_LIMIT = 20;

const CATEGORY_EMOJIS: Record<string, string> = {
  mains: '🍖',
  sides_salads: '🥗',
  entree_starters: '🥟',
  dessert: '🍰',
  drinks_alcoholic: '🍷',
  drinks_non_alcoholic: '🥤',
  table_snacks: '🥨',
  breakfast_brunch: '🍳',
  cake: '🎂',
  dietary: '⚠️',
  other: '📝',
};

const CATEGORY_LABELS: Record<string, string> = {
  mains: 'Mains',
  sides_salads: 'Sides & Salads',
  entree_starters: 'Entrée & Starters',
  dessert: 'Dessert',
  drinks_alcoholic: 'Alcoholic Drinks',
  drinks_non_alcoholic: 'Non-Alcoholic Drinks',
  table_snacks: 'Table Snacks',
  breakfast_brunch: 'Breakfast & Brunch',
  cake: 'Cake',
  dietary: 'Dietary',
  other: 'Other',
};

const FOOD_SECTIONS = [
  'dietary',
  'mains',
  'sides_salads',
  'entree_starters',
  'dessert',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'breakfast_brunch',
  'cake',
] as const;

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

      // Resolve still-deciding flag from the column shape that backs this section.
      // mains/dietary still have dedicated columns; canonical food keys without a
      // dedicated column live under extendedCategoriesData[key] (GTC-133).
      let stillDeciding = false;
      if (section === 'mains') {
        stillDeciding = Boolean(
          (setup.mainsData as { stillDeciding?: boolean } | null)?.stillDeciding
        );
      } else if (section === 'dietary') {
        stillDeciding = Boolean(
          (setup.dietaryData as { stillDeciding?: boolean } | null)?.stillDeciding
        );
      } else {
        const ext = setup.extendedCategoriesData as Record<
          string,
          { stillDeciding?: boolean }
        > | null;
        stillDeciding = Boolean(ext?.[section]?.stillDeciding);
      }
      if (stillDeciding) continue;

      // Check cap before each call
      if (currentAiCalls + aiCallsUsedInFinalize >= AI_CALL_LIMIT) break;

      const { system, user } = buildGapPrompt(section, eventType, householdData);
      const result = await callClaudeForJSON<{ items: GeneratedItem[] }>(system, user, {
        maxTokens: MAX_TOKENS_GAP_FILL,
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
      }>(system, user, { maxTokens: MAX_TOKENS_DIETARY_COVERAGE, temperature: 0.3 });
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
      }>(system, user, { maxTokens: MAX_TOKENS_CONSIDERATIONS, temperature: 0.8 });
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
