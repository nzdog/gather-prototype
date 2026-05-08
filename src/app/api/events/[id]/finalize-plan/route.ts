import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireEventRole } from '@/lib/auth/guards';
import { callClaudeForJSON } from '@/lib/ai/claude';
import { MAX_TOKENS_FULL_PLAN } from '@/lib/ai/token-limits';
import {
  buildPlanGenerationPrompt,
  type PlanGenerationCategoryInput,
  type OptionTreeSelections,
} from '@/lib/ai/prompts';
import {
  getCategoryLevels,
  getDefaultCategories,
  getSectionReferenceItems,
} from '@/lib/ai/config-loader';

// GTC-145: lowered from 20 → 10. The single-call architecture fires exactly
// one Claude call per finalize-plan invocation, so 10 gives ample headroom
// for retries and any future small auxiliary calls without crowding the cap.
const AI_CALL_LIMIT = 10;

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
  other: 'Other',
};

// Order in which food categories appear in the modal (and so in the plan).
const FOOD_CATEGORY_ORDER = [
  'mains',
  'entree_starters',
  'sides_salads',
  'dessert',
  'cake',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'table_snacks',
  'breakfast_brunch',
] as const;

interface SectionResponse {
  category: string;
  key?: string;
  emoji?: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    servingSize: string;
    notes?: string;
    dietaryTags?: string[];
  }>;
}

interface FullPlanResponse {
  sections: SectionResponse[];
  dietaryCoverage: Array<{ requirement: string; covered: boolean; flaggedItems?: string[] }>;
  thingsToConsider: Array<{ name: string; category: string }>;
}

function flattenSelections(selections: OptionTreeSelections | undefined | null): string[] {
  if (!selections) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const lvl of Object.values(selections)) {
    for (const opt of lvl?.options ?? []) {
      if (opt && !seen.has(opt)) {
        seen.add(opt);
        out.push(opt);
      }
    }
    const ft = (lvl?.freeText ?? '').trim();
    if (ft && !seen.has(ft)) {
      seen.add(ft);
      out.push(ft);
    }
  }
  return out;
}

function hasAnySelection(selections: OptionTreeSelections | undefined | null): boolean {
  return flattenSelections(selections).length > 0;
}

export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id: eventId } = await context.params;

    const auth = await requireEventRole(eventId, ['HOST', 'COHOST']);
    if (auth instanceof NextResponse) return auth;

    const event = await prisma.event.findUnique({ where: { id: eventId } });
    if (!event) {
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    if ((event.aiCallsUsed ?? 0) >= AI_CALL_LIMIT) {
      return NextResponse.json({ error: 'AI call limit reached for this event' }, { status: 429 });
    }

    const setup = await prisma.eventSetup.findUnique({ where: { eventId } });
    if (!setup) {
      return NextResponse.json({ error: 'No event setup found' }, { status: 404 });
    }

    const eventType = setup.eventType ?? 'Other';

    // Dietary requirements: structured + free-text "Other: ..."
    const dietaryData = setup.dietaryData as { requirements?: string[]; other?: string } | null;
    const dietaryOther = (dietaryData?.other ?? '').trim();
    const dietaryRequirements = [
      ...(dietaryData?.requirements ?? []),
      ...(dietaryOther ? [`Other: ${dietaryOther}`] : []),
    ];

    // Headcount from households
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
        const little = (h as Record<string, unknown>).littleCount;
        if (typeof little === 'number') totalKids += little;
      }
    } catch {
      totalAdults = event.guestCount ?? 10;
    }
    if (totalAdults === 0 && totalKids === 0) {
      totalAdults = event.guestCount ?? 10;
    }

    // Resolve engaged categories: defaults are always engaged; non-defaults
    // only when Kate selected something via "Show more".
    const defaults = new Set(getDefaultCategories(eventType));
    const mainsData = setup.mainsData as {
      selections?: OptionTreeSelections;
      stillDeciding?: boolean;
    } | null;
    const extended =
      (setup.extendedCategoriesData as Record<
        string,
        { selections?: OptionTreeSelections; stillDeciding?: boolean }
      > | null) ?? {};

    const engagedCategories: PlanGenerationCategoryInput[] = [];
    for (const key of FOOD_CATEGORY_ORDER) {
      const isDefault = defaults.has(key);
      const entry = key === 'mains' ? mainsData : extended[key];
      const stillDeciding = Boolean(entry?.stillDeciding);
      const selections = flattenSelections(entry?.selections);

      // Skip entirely if not a default and Kate didn't engage it.
      if (!isDefault && !hasAnySelection(entry?.selections) && !stillDeciding) continue;

      // Skip if config has no levels for this event type / category combo.
      const levels = getCategoryLevels(eventType, key);
      if (!levels || levels.length === 0) continue;

      // Reference items pulled from the section family (mains/sides/desserts/drinks).
      // getSectionReferenceItems takes a section family — map canonical key to family.
      const family =
        key === 'mains' || key === 'breakfast_brunch'
          ? 'mains'
          : key === 'sides_salads' || key === 'entree_starters' || key === 'table_snacks'
            ? 'sides'
            : key === 'dessert' || key === 'cake'
              ? 'desserts'
              : 'drinks';
      const referencesByCat = getSectionReferenceItems(eventType, family);
      const referenceItems = referencesByCat.flatMap((r) => r.items);

      engagedCategories.push({
        key,
        label: CATEGORY_LABELS[key] ?? key,
        emoji: CATEGORY_EMOJIS[key] ?? '📋',
        selections,
        stillDeciding,
        referenceItems,
      });
    }

    // Free-text "Other" notes
    const otherNotes = (setup.otherNotes ?? '').trim();
    const setUpData = setup.setUpData as { freeText?: string } | null;
    const cleanUpData = setup.cleanUpData as { freeText?: string } | null;
    const otherJobsData = setup.otherJobsOtherData as { freeText?: string } | null;

    const { system, user } = buildPlanGenerationPrompt({
      eventType,
      totalAdults,
      totalKids,
      dietaryRequirements,
      engagedCategories,
      otherNotes,
      setUpNotes: (setUpData?.freeText ?? '').trim(),
      cleanUpNotes: (cleanUpData?.freeText ?? '').trim(),
      otherJobsNotes: (otherJobsData?.freeText ?? '').trim(),
    });

    const result = await callClaudeForJSON<FullPlanResponse>(system, user, {
      maxTokens: MAX_TOKENS_FULL_PLAN,
      temperature: 0.8,
      callSiteLabel: 'finalize-plan:full',
    });

    // Increment AI call counter once for the single call.
    await prisma.event.update({
      where: { id: eventId },
      data: { aiCallsUsed: { increment: 1 } },
    });

    const sections = Array.isArray(result.sections) ? result.sections : [];
    const dietaryCoverage = Array.isArray(result.dietaryCoverage) ? result.dietaryCoverage : [];
    const thingsToConsider = Array.isArray(result.thingsToConsider) ? result.thingsToConsider : [];

    // Map model response → response shape consumed by Moment2Step2Skeleton.
    // Use the model-supplied label/emoji when present; fall back to canonical
    // mapping by key so a typo'd label doesn't break the UI.
    const categories = sections
      .filter((s) => s && Array.isArray(s.items) && s.items.length > 0)
      .map((s) => {
        const key = s.key ?? '';
        const emoji = s.emoji || CATEGORY_EMOJIS[key] || '📋';
        const name = s.category || CATEGORY_LABELS[key] || key || 'Items';
        return {
          name,
          emoji,
          items: s.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            servingSize: item.servingSize,
            notes: item.notes,
            dietaryTags: item.dietaryTags ?? [],
          })),
        };
      });

    // GTC-145: drop any pre-existing AI-generated teams from prior runs so the
    // single-call output replaces them rather than stacking. We only delete
    // teams whose source is GENERATED to preserve any teams Kate added by hand.
    await prisma.team.deleteMany({
      where: { eventId, source: 'GENERATED' },
    });

    const batchId = `m2-finalize-${Date.now()}`;

    for (const category of categories) {
      const maxOrder = await prisma.team.aggregate({
        where: { eventId },
        _max: { displayOrder: true },
      });
      const team = await prisma.team.create({
        data: {
          name: category.name,
          eventId,
          source: 'GENERATED',
          displayOrder: (maxOrder._max.displayOrder ?? 0) + 1,
        },
      });

      let nextDisplayOrder = 1;
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
