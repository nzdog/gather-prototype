import { prisma } from '@/lib/prisma';
import type { EventSetup } from '@prisma/client';
import type {
  PlanGenerationInput,
  PlanGenerationCategoryInput,
  OptionTreeSelections,
} from '@/lib/ai/prompts';
import {
  getCategoryLevels,
  getDefaultCategories,
  getSectionReferenceItems,
} from '@/lib/ai/config-loader';
import { readDietaryData } from '@/lib/dietary';
import {
  type OtherJobsField,
  type TaskBucket,
  type TaskResponse,
  isBucketEligible,
} from '@/lib/ai/tasks';

// GTC-236: extracted move-only from the finalize-plan route so the regenerate-plan route
// builds its prompt input through the SAME assembly — one definition, no drift between
// initial generation and regeneration. Behaviour is unchanged by the extraction.

export { CATEGORY_EMOJIS, CATEGORY_LABELS, FOOD_CATEGORY_ORDER } from '@/lib/ai/plan-categories';
import { CATEGORY_EMOJIS, CATEGORY_LABELS, FOOD_CATEGORY_ORDER } from '@/lib/ai/plan-categories';

export interface SectionResponse {
  category: string;
  key?: string;
  emoji?: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
    servingSize: string;
    notes?: string;
    critical?: boolean;
    criticalReason?: string | null;
    dietaryTags?: string[];
  }>;
}

// GTC-171 (B2): day-of job rows. Deliberately no `critical` field — B1's rule that
// setup/cleanup work is never critical stands, and omitting it here means task rows take
// the schema default (false) without touching B1's prompt block.
export interface FullPlanResponse {
  sections: SectionResponse[];
  tasks?: TaskResponse[];
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

/**
 * Build a single engaged-category input outside the defaults/engagement rules — used by
 * category-scope regeneration when the target category exists as a team but is no longer
 * engaged in the current EventSetup. `stillDeciding` is false on purpose: the prompt
 * builder SKIPS still-deciding categories, and an explicit regenerate click on a category
 * is the host asking for output (ruling Q2b), so the "(none — pick sensible defaults)"
 * path is the right fallback.
 */
export function synthesizeCategoryInput(
  eventType: string,
  key: string
): PlanGenerationCategoryInput {
  const family =
    key === 'mains' || key === 'breakfast_brunch'
      ? 'mains'
      : key === 'sides_salads' || key === 'entree_starters' || key === 'table_snacks'
        ? 'sides'
        : key === 'dessert' || key === 'cake'
          ? 'desserts'
          : 'drinks';
  const referencesByCat = getSectionReferenceItems(eventType, family);
  return {
    key,
    label: CATEGORY_LABELS[key] ?? key,
    emoji: CATEGORY_EMOJIS[key] ?? '📋',
    selections: [],
    stillDeciding: false,
    referenceItems: referencesByCat.flatMap((r) => r.items),
  };
}

export async function buildPlanGenerationInput(
  eventId: string,
  event: { guestCount: number | null },
  setup: EventSetup
): Promise<{
  promptInput: PlanGenerationInput;
  bucketSources: Record<TaskBucket, OtherJobsField>;
  bucketIsEligible: (key: TaskBucket) => boolean;
}> {
  const eventType = setup.eventType ?? 'Other';

  // GTC-150: three-state dietary read. readDietaryData normalizes legacy
  // rows (statusless {requirements, other}) and coerces incoherent stored
  // combinations safety-first, so 'unanswered' is never presented as "none".
  const dietary = readDietaryData(setup.dietaryData);
  const dietaryRequirements = [
    ...dietary.requirements,
    ...(dietary.other ? [`Other: ${dietary.other}`] : []),
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
  // GTC-171 (B2): read the full persisted shape — the previous cast dropped
  // `stillDeciding`, which the food categories have always honoured and these three
  // never did. A bucket the host is still deciding on must not become task rows.
  const otherNotes = (setup.otherNotes ?? '').trim();
  const setUpData = setup.setUpData as OtherJobsField;
  const cleanUpData = setup.cleanUpData as OtherJobsField;
  const otherJobsData = setup.otherJobsOtherData as OtherJobsField;

  const bucketSources: Record<TaskBucket, OtherJobsField> = {
    set_up: setUpData,
    clean_up: cleanUpData,
    other_jobs: otherJobsData,
  };
  const bucketIsEligible = (key: TaskBucket): boolean => isBucketEligible(bucketSources[key]);

  return {
    promptInput: {
      eventType,
      totalAdults,
      totalKids,
      dietaryStatus: dietary.status,
      dietaryRequirements,
      engagedCategories,
      otherNotes,
      setUpNotes: (setUpData?.freeText ?? '').trim(),
      cleanUpNotes: (cleanUpData?.freeText ?? '').trim(),
      otherJobsNotes: (otherJobsData?.freeText ?? '').trim(),
    },
    bucketSources,
    bucketIsEligible,
  };
}
