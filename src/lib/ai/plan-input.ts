import { prisma } from '@/lib/prisma';
import type { EventSetup } from '@prisma/client';
import type {
  PlanGenerationInput,
  PlanGenerationCategoryInput,
  PlanGenerationSessionInput,
  OptionTreeSelections,
} from '@/lib/ai/prompts';
import {
  getCategoryLevels,
  getDefaultCategories,
  getSectionReferenceItems,
  readStoredOption,
  readStoredSelections,
  withoutOrphanedChoices,
} from '@/lib/ai/config-loader';
import { readDietaryData } from '@/lib/dietary';
import {
  type OtherJobsField,
  type TaskBucket,
  type TaskResponse,
  isBucketEligible,
} from '@/lib/ai/tasks';
// [[GTC-482]]: the sessions, read only while the sessions switch is on.
import { isSessionsOn } from '@/lib/sessions/switch';
import { sessionHeadcounts } from '@/lib/sessions/answers';
import { sessionDateKey, sessionDateWords, sortSessions } from '@/lib/sessions/dates';

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
    /** [[GTC-482]]: the session's label ("S2") or "whole"; asked for only when sessions exist. */
    session?: string;
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
    // GTC-363 (item 22): a renamed option goes to the AI under its new words.
    for (const opt of (lvl?.options ?? []).map(readStoredOption)) {
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

/**
 * [[GTC-482]] — THE SESSIONS FOR THE ONE CALL (the founder's rulings of 26 Nov 2026). Each session is
 * given to the AI by a short label of its order ("S1", "S2", ...), never by its id; `dayIds` maps
 * each label back, and the write checks each one again (plan-write.ts). The headcounts are counted
 * from the same people as the event's own totals below (named people, kids by role CHILD, plus
 * each household's little ones), less those marked as not at the session, by GTC-481's rule; the
 * adults and children are given only when they add up to `sessionHeadcounts`' figure. When the
 * households name no one (the event's count then comes from its guest count), no session carries
 * a count. Pure, so the suite can hand it rows.
 */
export interface PlanSessions {
  sessions: PlanGenerationSessionInput[];
  dayIds: Record<string, string>;
}

export function planSessionsFrom(
  days: readonly { id: string; name: string; date: Date | string; displayOrder: number }[],
  households: readonly {
    littleCount: number;
    members: readonly { id: string; householdRole: string | null }[];
  }[],
  absences: readonly { personEventId: string; dayId: string }[]
): PlanSessions {
  const ordered = sortSessions(days);
  const named = households.reduce((n, h) => n + h.members.length + (h.littleCount ?? 0), 0);
  const heads = sessionHeadcounts(
    ordered.map((d) => d.id),
    households.map((h) => ({
      littleCount: h.littleCount ?? 0,
      people: h.members.map((m) => ({ personEventId: m.id })),
    })),
    absences
  );
  const dayIds: Record<string, string> = {};
  const sessions = ordered.map((d, i): PlanGenerationSessionInput => {
    const label = `S${i + 1}`;
    dayIds[label] = d.id;
    const words = sessionDateWords(sessionDateKey(d.date));
    const base = { label, name: d.name, date: d.name.trim() === words ? '' : words };
    if (named === 0) return base;
    const away = new Set(absences.filter((a) => a.dayId === d.id).map((a) => a.personEventId));
    let adults = 0;
    let children = 0;
    for (const h of households) {
      const here = h.members.filter((m) => !away.has(m.id));
      for (const m of here) {
        if (m.householdRole === 'CHILD') children++;
        else adults++;
      }
      if (!(h.members.length > 0 && here.length === 0)) children += h.littleCount ?? 0;
    }
    const coming = heads[d.id] ?? 0;
    return adults + children === coming
      ? { ...base, coming, adults, children }
      : { ...base, coming };
  });
  return { sessions, dayIds };
}

async function readPlanSessions(
  eventId: string,
  households: Parameters<typeof planSessionsFrom>[1]
): Promise<PlanSessions | null> {
  const days = await prisma.day.findMany({
    where: { eventId },
    select: { id: true, name: true, date: true, displayOrder: true },
  });
  if (days.length === 0) return null;
  // Both ends on this event, as the sessions route reads them.
  const absences = await prisma.sessionAbsence.findMany({
    where: { day: { eventId }, personEvent: { eventId } },
    select: { personEventId: true, dayId: true },
  });
  return planSessionsFrom(days, households, absences);
}

export async function buildPlanGenerationInput(
  eventId: string,
  event: { guestCount: number | null },
  setup: EventSetup
): Promise<{
  promptInput: PlanGenerationInput;
  bucketSources: Record<TaskBucket, OtherJobsField>;
  bucketIsEligible: (key: TaskBucket) => boolean;
  /** [[GTC-482]]: each session's label to its id; present only when sessions went in the prompt. */
  sessionDayIds?: Record<string, string>;
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
  // [[GTC-482]]: the same households, kept for the sessions' headcounts.
  let householdsRead: Parameters<typeof planSessionsFrom>[1] = [];
  try {
    const households = await prisma.household.findMany({
      where: { eventId },
      include: { members: true },
    });
    householdsRead = households;
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
    const levels = getCategoryLevels(eventType, key);
    // GTC-364 (Q5): the saved picks, read as today's words, less any choice under a style that is
    // no longer ticked — worked out once, here, and used for everything below. A category whose
    // only picks were such choices counts as not picked, as it looks on screen.
    const saved =
      entry?.selections && levels
        ? withoutOrphanedChoices(levels, readStoredSelections(entry.selections))
        : entry?.selections;
    const selections = flattenSelections(saved);

    // Skip entirely if not a default and Kate didn't engage it.
    if (!isDefault && !hasAnySelection(saved) && !stillDeciding) continue;

    // Skip if config has no levels for this event type / category combo.
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

  // [[GTC-482]]: with the switch on and sessions on the event, the one call is told them. With
  // the switch off, or no session, nothing more is read and nothing is added.
  const planSessions = isSessionsOn() ? await readPlanSessions(eventId, householdsRead) : null;

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
      ...(planSessions ? { sessions: planSessions.sessions } : {}),
    },
    bucketSources,
    bucketIsEligible,
    ...(planSessions ? { sessionDayIds: planSessions.dayIds } : {}),
  };
}
