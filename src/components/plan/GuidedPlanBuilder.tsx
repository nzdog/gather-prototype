'use client';

import { useState, useEffect } from 'react';
import { ChevronRight, ChevronLeft, Check, Plus, Eye } from 'lucide-react';
import planConfigRaw from '@/lib/ai/plan-option-tree-config.json';

// ─── Shared interfaces (mirrored from generate.ts — no server import) ─────────

export interface GuidedLevelSelection {
  options: string[];
  freeText: string;
}

export type GuidedSelections = Record<string, Record<number, GuidedLevelSelection>>;

export interface GuidedEventContext {
  occasionType: string | null;
  guestCount: number | null;
  startDate: string;
  venueName: string | null;
  venueKitchenAccess: string | null;
  dietaryGlutenFree: number;
  dietaryDairyFree: number;
  dietaryVegetarian: number;
  dietaryVegan: number;
  dietaryAllergies: string | null;
}

// ─── Config types ────────────────────────────────────────────────────────────

interface DependsOnConfig {
  levelIndex: number;
  map: Record<string, string[]>;
}

interface LevelConfig {
  level: number;
  question: string;
  options: string[];
  dependsOn?: DependsOnConfig;
  freeText: boolean;
  freeTextPlaceholder: string;
}

interface CategoryConfig {
  label: string;
  levels: LevelConfig[];
}

interface OccasionConfig {
  label: string;
  nzNotes?: string;
  defaultCategories: string[];
  categories: Record<string, CategoryConfig>;
}

type PlanConfig = Record<string, OccasionConfig>;

const planConfig = planConfigRaw as PlanConfig;

// ─── Global category list (for "Show more categories") ───────────────────────

const ALL_CATEGORY_KEYS = [
  'mains',
  'entree',
  'dessert',
  'sides',
  'drinks_alcoholic',
  'drinks_non_alcoholic',
  'snacks',
  'breakfast_brunch',
  'cake',
  'cleanup',
  'furniture_equipment',
  'decorations',
  'activities_entertainment',
  'other',
];

const FALLBACK_LABELS: Record<string, string> = {
  mains: 'Mains',
  entree: 'Entrée',
  dessert: 'Dessert',
  sides: 'Sides & Salads',
  drinks_alcoholic: 'Drinks (Alcoholic)',
  drinks_non_alcoholic: 'Drinks (Non-alcoholic)',
  snacks: 'Table Snacks',
  breakfast_brunch: 'Breakfast / Brunch',
  cake: 'Cake',
  cleanup: 'Clean-up',
  furniture_equipment: 'Furniture & Equipment',
  decorations: 'Decorations',
  activities_entertainment: 'Activities & Entertainment',
  other: 'Other',
};

const GENERIC_LEVEL: LevelConfig = {
  level: 1,
  question: 'What would you like to include?',
  options: [],
  freeText: true,
  freeTextPlaceholder: 'Describe what you need...',
};

const OCCASION_LABELS: Record<string, string> = {
  CHRISTMAS: 'Christmas',
  BIRTHDAY: 'Birthday',
  THANKSGIVING: 'Thanksgiving',
  EASTER: 'Easter',
  WEDDING: 'Wedding',
  REUNION: 'Reunion',
  RETREAT: 'Retreat',
  GRADUATION: 'Graduation',
  CORPORATE: 'Corporate',
  OTHER: 'Gathering',
};

// ─── View state ──────────────────────────────────────────────────────────────

type View =
  | { name: 'overview' }
  | { name: 'category'; categoryKey: string; levelIndex: number }
  | { name: 'review' };

// ─── Dietary pre-selection helpers ───────────────────────────────────────────

function buildDietaryPreselects(eventContext: GuidedEventContext): string[] {
  const pre: string[] = [];
  if (eventContext.dietaryGlutenFree > 0) pre.push('Gluten free option needed');
  if (eventContext.dietaryDairyFree > 0) pre.push('Dairy free option needed');
  return pre;
}

function initSelections(
  occasionConfig: OccasionConfig | null,
  activeCategoryKeys: string[],
  dietaryPreselects: string[]
): GuidedSelections {
  const selections: GuidedSelections = {};

  for (const key of activeCategoryKeys) {
    const catConfig = occasionConfig?.categories[key];
    const levels = catConfig?.levels ?? [GENERIC_LEVEL];
    const catSelections: Record<number, GuidedLevelSelection> = {};

    levels.forEach((level, idx) => {
      const preOptions = dietaryPreselects.filter((d) => level.options.includes(d));
      catSelections[idx] = { options: preOptions, freeText: '' };
    });

    selections[key] = catSelections;
  }

  return selections;
}

// ─── Prompt compilation (inline — avoids importing server-side SDK chain) ────

function compilePromptInline(
  eventContext: GuidedEventContext,
  selections: GuidedSelections,
  categoryLabels: Record<string, string>
): string {
  const parts: string[] = [];

  const occasionLabel =
    (eventContext.occasionType && OCCASION_LABELS[eventContext.occasionType]) ||
    eventContext.occasionType ||
    'Gathering';
  const guests = eventContext.guestCount
    ? `${eventContext.guestCount} guests`
    : 'unknown number of guests';
  const date = eventContext.startDate
    ? new Date(eventContext.startDate).toLocaleDateString('en-NZ', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';
  const venue = eventContext.venueName ? `${eventContext.venueName} venue` : '';
  const kitchen = eventContext.venueKitchenAccess
    ? `kitchen access: ${eventContext.venueKitchenAccess.toLowerCase()}`
    : '';

  let contextLine = `${occasionLabel} event, ${guests}`;
  if (date) contextLine += `, ${date}`;
  if (venue) contextLine += `. ${venue}`;
  if (kitchen) contextLine += ` with ${kitchen}`;
  parts.push(contextLine + '.');

  const dietaryItems: string[] = [];
  if (eventContext.dietaryVegetarian > 0)
    dietaryItems.push(`${eventContext.dietaryVegetarian} vegetarian`);
  if (eventContext.dietaryVegan > 0) dietaryItems.push(`${eventContext.dietaryVegan} vegan`);
  if (eventContext.dietaryGlutenFree > 0) dietaryItems.push('gluten free option required');
  if (eventContext.dietaryDairyFree > 0) dietaryItems.push('dairy free option required');
  if (eventContext.dietaryAllergies) dietaryItems.push(eventContext.dietaryAllergies);
  if (dietaryItems.length > 0) {
    parts.push(`Dietary requirements: ${dietaryItems.join(', ')}.`);
  }

  for (const [categoryKey, levelSelections] of Object.entries(selections)) {
    const label = categoryLabels[categoryKey] || categoryKey;
    const pieces: string[] = [];
    for (const levelSel of Object.values(levelSelections)) {
      if (levelSel.options.length > 0) pieces.push(levelSel.options.join(', '));
      if (levelSel.freeText.trim()) pieces.push(levelSel.freeText.trim());
    }
    if (pieces.length > 0) {
      parts.push(`${label}: ${pieces.join(' — ')}.`);
    }
  }

  return parts.join(' ');
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface GuidedPlanBuilderProps {
  eventContext: GuidedEventContext;
  onBack: () => void;
  onSubmit: (compiledPrompt: string) => void;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function GuidedPlanBuilder({
  eventContext,
  onBack,
  onSubmit,
}: GuidedPlanBuilderProps) {
  const occasionKey = eventContext.occasionType?.toLowerCase() ?? '';
  const occasionConfig: OccasionConfig | null = planConfig[occasionKey] ?? null;

  const defaultCategoryKeys: string[] = occasionConfig?.defaultCategories ?? [];

  // All keys shown when "show more" is toggled
  const extraCategoryKeys = ALL_CATEGORY_KEYS.filter((k) => !defaultCategoryKeys.includes(k));

  const [showMoreCategories, setShowMoreCategories] = useState(false);
  const [view, setView] = useState<View>({ name: 'overview' });

  const activeCategoryKeys = showMoreCategories
    ? [...defaultCategoryKeys, ...extraCategoryKeys]
    : defaultCategoryKeys;

  const dietaryPreselects = buildDietaryPreselects(eventContext);

  const [selections, setSelections] = useState<GuidedSelections>(() =>
    initSelections(occasionConfig, activeCategoryKeys, dietaryPreselects)
  );

  // Extend selections when "show more" is toggled to include new categories
  useEffect(() => {
    if (!showMoreCategories) return;
    setSelections((prev) => {
      const next = { ...prev };
      for (const key of extraCategoryKeys) {
        if (next[key]) continue;
        const catConfig = occasionConfig?.categories[key];
        const levels = catConfig?.levels ?? [GENERIC_LEVEL];
        const catSelections: Record<number, GuidedLevelSelection> = {};
        levels.forEach((level, idx) => {
          const preOptions = dietaryPreselects.filter((d) => level.options.includes(d));
          catSelections[idx] = { options: preOptions, freeText: '' };
        });
        next[key] = catSelections;
      }
      return next;
    });
  }, [showMoreCategories]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  function getCategoryConfig(key: string): CategoryConfig {
    return (
      occasionConfig?.categories[key] ?? {
        label: FALLBACK_LABELS[key] ?? key,
        levels: [GENERIC_LEVEL],
      }
    );
  }

  function getCategoryLabel(key: string): string {
    return getCategoryConfig(key).label;
  }

  /** Resolve the effective options for a level, grouped by parent L1 selection. */
  interface OptionGroup {
    label: string | null;
    options: string[];
  }

  function resolveOptionGroups(categoryKey: string, level: LevelConfig): OptionGroup[] {
    if (!level.dependsOn) return [{ label: null, options: level.options }];

    const { levelIndex: srcIdx, map } = level.dependsOn;
    const srcSelections = selections[categoryKey]?.[srcIdx]?.options ?? [];

    if (srcSelections.length === 0) return [{ label: null, options: level.options }];

    const seen = new Set<string>();
    const groups: OptionGroup[] = [];

    for (const srcOption of srcSelections) {
      const mapped = map[srcOption];
      if (!mapped) continue;
      const dedupedOptions: string[] = [];
      for (const opt of mapped) {
        if (!seen.has(opt)) {
          seen.add(opt);
          dedupedOptions.push(opt);
        }
      }
      if (dedupedOptions.length > 0) {
        groups.push({ label: srcOption, options: dedupedOptions });
      }
    }

    return groups.length > 0 ? groups : [{ label: null, options: level.options }];
  }

  function isCategoryConfigured(key: string): boolean {
    const catSel = selections[key];
    if (!catSel) return false;
    return Object.values(catSel).some(
      (lvl) => lvl.options.length > 0 || lvl.freeText.trim().length > 0
    );
  }

  function toggleOption(categoryKey: string, levelIndex: number, option: string) {
    setSelections((prev) => {
      const catSel = { ...(prev[categoryKey] ?? {}) };
      const lvlSel = catSel[levelIndex] ?? { options: [], freeText: '' };
      const alreadySelected = lvlSel.options.includes(option);
      catSel[levelIndex] = {
        ...lvlSel,
        options: alreadySelected
          ? lvlSel.options.filter((o) => o !== option)
          : [...lvlSel.options, option],
      };
      return { ...prev, [categoryKey]: catSel };
    });
  }

  function setFreeText(categoryKey: string, levelIndex: number, text: string) {
    setSelections((prev) => {
      const catSel = { ...(prev[categoryKey] ?? {}) };
      const lvlSel = catSel[levelIndex] ?? { options: [], freeText: '' };
      catSel[levelIndex] = { ...lvlSel, freeText: text };
      return { ...prev, [categoryKey]: catSel };
    });
  }

  function buildCategoryLabels(): Record<string, string> {
    const labels: Record<string, string> = {};
    for (const key of activeCategoryKeys) {
      labels[key] = getCategoryLabel(key);
    }
    return labels;
  }

  function handleGenerate() {
    const categoryLabels = buildCategoryLabels();
    // Filter to only categories with actual selections
    const activeSelections: GuidedSelections = {};
    for (const [key, catSel] of Object.entries(selections)) {
      if (isCategoryConfigured(key)) {
        activeSelections[key] = catSel;
      }
    }
    const prompt = compilePromptInline(eventContext, activeSelections, categoryLabels);
    onSubmit(prompt);
  }

  // ── Sub-renders ──────────────────────────────────────────────────────────

  const occasionLabel =
    (eventContext.occasionType && OCCASION_LABELS[eventContext.occasionType]) ||
    eventContext.occasionType ||
    'Event';

  const configuredCount = activeCategoryKeys.filter(isCategoryConfigured).length;

  // Context panel (shown on all screens)
  function renderContextPanel() {
    const dietaryFlags: string[] = [];
    if (eventContext.dietaryGlutenFree > 0) dietaryFlags.push('Gluten free required');
    if (eventContext.dietaryDairyFree > 0) dietaryFlags.push('Dairy free required');
    if (eventContext.dietaryVegetarian > 0)
      dietaryFlags.push(`${eventContext.dietaryVegetarian} vegetarian`);
    if (eventContext.dietaryVegan > 0) dietaryFlags.push(`${eventContext.dietaryVegan} vegan`);
    if (eventContext.dietaryAllergies) dietaryFlags.push(eventContext.dietaryAllergies);

    const dateStr = eventContext.startDate
      ? new Date(eventContext.startDate).toLocaleDateString('en-NZ', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : null;

    return (
      <div className="bg-sage-50 border border-sage-200 rounded-lg px-4 py-3 mb-4 text-sm space-y-1">
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-sage-800 font-medium">
          {occasionLabel && <span>{occasionLabel}</span>}
          {eventContext.guestCount && <span>· {eventContext.guestCount} guests</span>}
          {dateStr && <span>· {dateStr}</span>}
        </div>
        {(eventContext.venueName || eventContext.venueKitchenAccess) && (
          <div className="text-gray-600">
            {eventContext.venueName}
            {eventContext.venueKitchenAccess && (
              <span className="text-gray-500"> · Kitchen: {eventContext.venueKitchenAccess}</span>
            )}
          </div>
        )}
        {dietaryFlags.length > 0 && (
          <div className="text-amber-700">⚠ Dietary: {dietaryFlags.join(', ')}</div>
        )}
      </div>
    );
  }

  // Breadcrumbs
  function renderBreadcrumbs() {
    if (view.name === 'overview') return null;

    const crumbs: Array<{ label: string; onClick?: () => void }> = [
      { label: 'Overview', onClick: () => setView({ name: 'overview' }) },
    ];

    if (view.name === 'category') {
      const catLabel = getCategoryLabel(view.categoryKey);
      const catConfig = getCategoryConfig(view.categoryKey);

      if (view.levelIndex === 0) {
        crumbs.push({ label: catLabel });
      } else {
        crumbs.push({
          label: catLabel,
          onClick: () =>
            setView({ name: 'category', categoryKey: view.categoryKey, levelIndex: 0 }),
        });
        // Show selected option(s) from previous level as intermediate crumb
        const prevSel = selections[view.categoryKey]?.[view.levelIndex - 1];
        const prevLabel =
          prevSel?.options[0] ?? catConfig.levels[view.levelIndex - 1]?.question ?? '';
        crumbs.push({
          label: prevLabel,
          onClick: () =>
            setView({
              name: 'category',
              categoryKey: view.categoryKey,
              levelIndex: view.levelIndex - 1,
            }),
        });
        crumbs.push({
          label: catConfig.levels[view.levelIndex]?.question ?? `Level ${view.levelIndex + 1}`,
        });
      }
    }

    if (view.name === 'review') {
      crumbs.push({ label: 'Review' });
    }

    return (
      <nav className="flex items-center gap-1 text-sm text-gray-500 mb-4 flex-wrap">
        {crumbs.map((crumb, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="w-3 h-3 text-gray-300" />}
            {crumb.onClick ? (
              <button
                onClick={crumb.onClick}
                className="hover:text-accent hover:underline transition-colors"
              >
                {crumb.label}
              </button>
            ) : (
              <span className="text-gray-700 font-medium">{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
    );
  }

  // Overview screen
  function renderOverview() {
    return (
      <div>
        {renderContextPanel()}

        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-800">What do you need for your event?</h3>
          {configuredCount > 0 && (
            <span className="text-xs text-sage-700 bg-sage-100 px-2 py-0.5 rounded-full">
              {configuredCount} of {activeCategoryKeys.length} configured
            </span>
          )}
        </div>

        <div className="space-y-2 mb-4">
          {defaultCategoryKeys.map((key) => renderCategoryRow(key))}

          {showMoreCategories && (
            <>
              <div className="border-t border-gray-100 pt-2 mt-2">
                <p className="text-xs text-gray-400 mb-2">Additional categories</p>
                {extraCategoryKeys.map((key) => renderCategoryRow(key))}
              </div>
            </>
          )}

          {!showMoreCategories && (
            <button
              onClick={() => setShowMoreCategories(true)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 border border-dashed border-gray-300 rounded-lg hover:border-accent hover:text-accent transition-colors"
            >
              <Plus className="w-4 h-4" />
              Show more categories
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <button onClick={onBack} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800">
            ← Back
          </button>
          <button
            onClick={() => setView({ name: 'review' })}
            className="ml-auto flex items-center gap-2 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            <Eye className="w-4 h-4" />
            Review selections
          </button>
          <button
            onClick={handleGenerate}
            className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark"
          >
            Generate Plan →
          </button>
        </div>
      </div>
    );
  }

  function renderCategoryRow(key: string) {
    const label = getCategoryLabel(key);
    const configured = isCategoryConfigured(key);
    return (
      <button
        key={key}
        onClick={() => setView({ name: 'category', categoryKey: key, levelIndex: 0 })}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg border border-gray-200 hover:border-accent hover:bg-gray-50 transition-colors text-left group"
      >
        <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
        <span className="flex items-center gap-2">
          {configured ? (
            <span className="flex items-center gap-1 text-xs text-sage-700">
              <Check className="w-3.5 h-3.5 text-sage-600" />
              Configured
            </span>
          ) : (
            <span className="text-xs text-gray-400">Untouched</span>
          )}
          <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-accent" />
        </span>
      </button>
    );
  }

  // Category / level screen
  function renderCategoryScreen() {
    if (view.name !== 'category') return null;
    const { categoryKey, levelIndex } = view;
    const catConfig = getCategoryConfig(categoryKey);
    const levels = catConfig.levels;
    const currentLevel = levels[levelIndex];
    if (!currentLevel) return null;

    const catSel = selections[categoryKey] ?? {};
    const lvlSel = catSel[levelIndex] ?? { options: [], freeText: '' };

    const isLastLevel = levelIndex === levels.length - 1;
    const isFirstLevel = levelIndex === 0;

    return (
      <div>
        {renderContextPanel()}
        {renderBreadcrumbs()}

        <div className="mb-1">
          <h3 className="font-semibold text-gray-800">{catConfig.label}</h3>
          {levels.length > 1 && (
            <p className="text-xs text-gray-400 mt-0.5">
              Level {levelIndex + 1} of {levels.length}
            </p>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-3">{currentLevel.question}</p>

        {/* Options — checkbox list, grouped by parent L1 selection when dependsOn */}
        {(() => {
          const groups = resolveOptionGroups(categoryKey, currentLevel);
          const hasAnyOptions = groups.some((g) => g.options.length > 0);
          if (!hasAnyOptions) return null;

          const showSectionLabels = groups.length > 1 && groups[0].label !== null;

          return (
            <div className="space-y-1 mb-3 max-h-[50vh] overflow-y-auto">
              {groups.map((group, gi) => (
                <div key={group.label ?? gi}>
                  {showSectionLabels && group.label && (
                    <>
                      {gi > 0 && <div className="border-t border-gray-100 my-2" />}
                      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide px-1 pt-1 pb-1">
                        {group.label}
                      </p>
                    </>
                  )}
                  {group.options.map((option) => {
                    const selected = lvlSel.options.includes(option);
                    return (
                      <label
                        key={option}
                        className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                          selected
                            ? 'bg-accent/10 border-accent'
                            : 'bg-white border-gray-200 hover:border-accent hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleOption(categoryKey, levelIndex, option)}
                          className="w-4 h-4 rounded border-gray-300 text-accent focus:ring-accent shrink-0"
                        />
                        <span
                          className={`text-sm ${selected ? 'text-gray-900 font-medium' : 'text-gray-700'}`}
                        >
                          {option}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ))}
            </div>
          );
        })()}

        {/* Free text */}
        {currentLevel.freeText && (
          <textarea
            value={lvlSel.freeText}
            onChange={(e) => setFreeText(categoryKey, levelIndex, e.target.value)}
            placeholder={currentLevel.freeTextPlaceholder}
            rows={2}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent resize-none mb-3"
          />
        )}

        {/* Navigation */}
        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          {!isFirstLevel ? (
            <button
              onClick={() => setView({ name: 'category', categoryKey, levelIndex: levelIndex - 1 })}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
          ) : (
            <button
              onClick={() => setView({ name: 'overview' })}
              className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
            >
              <ChevronLeft className="w-4 h-4" />
              Overview
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {!isLastLevel ? (
              <button
                onClick={() =>
                  setView({ name: 'category', categoryKey, levelIndex: levelIndex + 1 })
                }
                className="flex items-center gap-1 px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={() => setView({ name: 'overview' })}
                className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Review screen
  function renderReview() {
    const configuredKeys = activeCategoryKeys.filter(isCategoryConfigured);

    return (
      <div>
        {renderContextPanel()}
        {renderBreadcrumbs()}

        <h3 className="font-semibold text-gray-800 mb-3">Review your selections</h3>

        {configuredKeys.length === 0 ? (
          <p className="text-sm text-gray-500 mb-4">
            No categories configured yet. Go back and make some selections.
          </p>
        ) : (
          <div className="space-y-3 mb-4">
            {configuredKeys.map((key) => {
              const catConfig = getCategoryConfig(key);
              const catSel = selections[key] ?? {};

              return (
                <div key={key} className="border border-gray-200 rounded-lg px-3 py-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm font-medium text-gray-800">{catConfig.label}</span>
                    <button
                      onClick={() => setView({ name: 'category', categoryKey: key, levelIndex: 0 })}
                      className="text-xs text-accent hover:underline"
                    >
                      Edit
                    </button>
                  </div>
                  {catConfig.levels.map((level, idx) => {
                    const lvlSel = catSel[idx];
                    if (!lvlSel) return null;
                    const hasContent = lvlSel.options.length > 0 || lvlSel.freeText.trim();
                    if (!hasContent) return null;
                    return (
                      <div key={idx} className="text-sm text-gray-600">
                        {catConfig.levels.length > 1 && (
                          <span className="text-xs text-gray-400">{level.question}: </span>
                        )}
                        {lvlSel.options.length > 0 && <span>{lvlSel.options.join(', ')}</span>}
                        {lvlSel.freeText.trim() && (
                          <span className="italic text-gray-500">
                            {lvlSel.options.length > 0 ? ' — ' : ''}
                            {lvlSel.freeText.trim()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
          <button
            onClick={() => setView({ name: 'overview' })}
            className="flex items-center gap-1 px-3 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
          <button
            onClick={handleGenerate}
            className="ml-auto px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark"
          >
            Generate Plan →
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────────

  return (
    <div className="min-h-0">
      {view.name === 'overview' && renderOverview()}
      {view.name === 'category' && renderCategoryScreen()}
      {view.name === 'review' && renderReview()}
    </div>
  );
}
