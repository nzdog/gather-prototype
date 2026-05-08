import planConfig from './plan-option-tree-config.json';
import type { OptionTreeLevel } from '@/components/shared/OptionTree';

// ─── Types ───────────────────────────────────────────────────────────────────

interface FoodItem {
  name: string;
  included: boolean;
}

interface ConfigLevel {
  level: number;
  question?: string;
  breadcrumbLabel?: string;
  options?: string[];
  dependsOn?: Record<string, string[]>;
  multiSelect?: boolean;
  freeText?: boolean;
  freeTextPlaceholder?: string;
}

interface ConfigCategory {
  label: string;
  levels: ConfigLevel[];
}

interface ConfigOccasion {
  label: string;
  nzNotes: string;
  defaultCategories: string[];
  categories: Record<string, ConfigCategory>;
}

type PlanConfig = Record<string, ConfigOccasion>;

const config = planConfig as unknown as PlanConfig;

// ─── Mappings ────────────────────────────────────────────────────────────────

/** Event type label (as stored in EventSetup) → config occasion key */
const EVENT_TYPE_TO_CONFIG_KEY: Record<string, string> = {
  Christmas: 'christmas',
  'Birthday (Adult)': 'birthday_adult',
  'Birthday (Kids)': 'birthday_kids',
  'Casual BBQ': 'bbq_casual',
  'Wedding Reception': 'wedding_reception',
  'Baby Shower': 'baby_shower',
  'Engagement Party': 'engagement_party',
  Easter: 'easter',
  Anniversary: 'anniversary',
  Farewell: 'farewell',
  // Legacy values from old EventSetup records
  BBQ: 'bbq_casual',
  'Kids party': 'birthday_kids',
};

/** Legacy event type names → current labels (for migrating saved records) */
export const LEGACY_EVENT_TYPE_MAP: Record<string, string> = {
  BBQ: 'Casual BBQ',
  'Kids party': 'Birthday (Kids)',
};

/** Config category key → accordion section ID */
const CATEGORY_TO_SECTION: Record<string, 'mains' | 'sides' | 'desserts' | 'drinks'> = {
  mains: 'mains',
  breakfast_brunch: 'mains',
  entree_starters: 'sides',
  sides_salads: 'sides',
  table_snacks: 'sides',
  dessert: 'desserts',
  cake: 'desserts',
  drinks_alcoholic: 'drinks',
  drinks_non_alcoholic: 'drinks',
};

/** Accordion section ID → config category keys (for AI reference items) */
const SECTION_TO_CATEGORIES: Record<string, string[]> = {
  mains: ['mains', 'breakfast_brunch'],
  sides: ['sides_salads', 'table_snacks', 'entree_starters'],
  desserts: ['dessert', 'cake'],
  drinks: ['drinks_alcoholic', 'drinks_non_alcoholic'],
  setup: ['cleanup', 'furniture_equipment'],
};

/** Ordered event type labels for the UI selector */
export const CONFIG_EVENT_TYPES = [
  'Casual BBQ',
  'Birthday (Kids)',
  'Birthday (Adult)',
  'Christmas',
  'Easter',
  'Wedding Reception',
  'Baby Shower',
  'Engagement Party',
  'Anniversary',
  'Farewell',
  'Other',
] as const;

// ─── Internal helpers ────────────────────────────────────────────────────────

/** Extract a representative set of default items from a category's deepest useful level */
function extractDefaultItems(category: ConfigCategory): string[] {
  const level2 = category.levels.find((l) => l.level === 2);
  if (level2?.dependsOn) {
    const firstKey = Object.keys(level2.dependsOn)[0];
    return level2.dependsOn[firstKey] ?? [];
  }
  if (level2?.options && !level2.multiSelect) {
    return level2.options;
  }
  const level1 = category.levels.find((l) => l.level === 1);
  return (level1?.options ?? []).filter((o) => !o.toLowerCase().startsWith('no '));
}

/** Extract ALL reference items from a category (for AI prompt context) */
function extractAllReferenceItems(category: ConfigCategory): string[] {
  const items: string[] = [];
  for (const level of category.levels) {
    if (level.multiSelect) continue;
    if (level.dependsOn) {
      for (const opts of Object.values(level.dependsOn)) {
        items.push(...opts);
      }
    }
  }
  // If no dependsOn items found, fall back to Level 1 options
  if (items.length === 0) {
    const level1 = category.levels.find((l) => l.level === 1);
    if (level1?.options) {
      items.push(...level1.options.filter((o) => !o.toLowerCase().startsWith('no ')));
    }
  }
  return [...new Set(items)];
}

// ─── Public API ─────────────────────────────────────────────────────────────

/** Resolve an event type label to a config occasion key */
export function getConfigKey(eventType: string): string | null {
  return EVENT_TYPE_TO_CONFIG_KEY[eventType] ?? null;
}

/** Get accordion default FoodItem arrays for an event type */
export function getAccordionDefaults(eventType: string): {
  mains: FoodItem[];
  sides: FoodItem[];
  desserts: FoodItem[];
  drinks: FoodItem[];
} {
  const configKey = getConfigKey(eventType);
  const empty = {
    mains: [] as FoodItem[],
    sides: [] as FoodItem[],
    desserts: [] as FoodItem[],
    drinks: [] as FoodItem[],
  };
  if (!configKey || !(configKey in config)) return empty;

  const occasion = config[configKey];
  const result: Record<string, string[]> = { mains: [], sides: [], desserts: [], drinks: [] };

  for (const [catKey, catData] of Object.entries(occasion.categories)) {
    const section = CATEGORY_TO_SECTION[catKey];
    if (!section) continue;
    result[section].push(...extractDefaultItems(catData));
  }

  return {
    // GTC-126: food accordions default to unchecked — user opts in to what they want.
    // Note: items the user types via "+ Add your own" still default to included: true
    // (if they typed it, they want it); this only affects the pre-populated defaults.
    mains: [...new Set(result.mains)].map((name) => ({ name, included: false })),
    sides: [...new Set(result.sides)].map((name) => ({ name, included: false })),
    desserts: [...new Set(result.desserts)].map((name) => ({ name, included: false })),
    drinks: [...new Set(result.drinks)].map((name) => ({ name, included: false })),
  };
}

/** Get NZ cultural notes for an event type (for AI system prompt) */
export function getNzNotes(eventType: string): string | null {
  const configKey = getConfigKey(eventType);
  if (!configKey || !(configKey in config)) return null;
  return config[configKey].nzNotes;
}

/** Default category keys (in render order) for the chosen event type. */
export function getDefaultCategories(eventType: string): string[] {
  const configKey = getConfigKey(eventType);
  if (!configKey || !(configKey in config)) return [];
  return config[configKey].defaultCategories ?? [];
}

/** Resolve OptionTree-shaped levels for one category of an event type. */
export function getCategoryLevels(
  eventType: string,
  categoryKey: string
): OptionTreeLevel[] | null {
  const configKey = getConfigKey(eventType);
  if (!configKey || !(configKey in config)) return null;
  const cat = config[configKey].categories[categoryKey];
  if (!cat) return null;
  return cat.levels.map((l) => ({
    question: l.question ?? '',
    breadcrumbLabel: l.breadcrumbLabel,
    options: l.options,
    multiSelect: l.multiSelect,
    dependsOn: l.dependsOn,
    freeText: l.freeText ?? false,
    freeTextPlaceholder: l.freeTextPlaceholder,
  }));
}

/** Get categorized reference items for a section and event type (for AI prompt) */
export function getSectionReferenceItems(
  eventType: string,
  section: string
): { categoryLabel: string; items: string[] }[] {
  const configKey = getConfigKey(eventType);
  if (!configKey || !(configKey in config)) return [];

  const occasion = config[configKey];
  const targetCategories = SECTION_TO_CATEGORIES[section];
  if (!targetCategories) return [];

  const results: { categoryLabel: string; items: string[] }[] = [];
  for (const catKey of targetCategories) {
    const cat = occasion.categories[catKey];
    if (!cat) continue;
    const items = extractAllReferenceItems(cat);
    if (items.length > 0) {
      results.push({ categoryLabel: cat.label, items });
    }
  }
  return results;
}
