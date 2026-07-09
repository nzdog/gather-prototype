'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  getAccordionDefaults,
  getCategoryLevels,
  getDefaultCategories,
  CONFIG_EVENT_TYPES,
  LEGACY_EVENT_TYPE_MAP,
} from '@/lib/ai/config-loader';
import OptionTree, {
  type OptionTreeLevel,
  type OptionTreeSelections,
} from '@/components/shared/OptionTree';
import { readDietaryData, type DietaryStatus } from '@/lib/dietary';

// ─── Types ───────────────────────────────────────────────────────────────────

// GTC-145: per-section incremental generation removed. The modal no longer
// fires AI calls on accordion close — a single finalize-plan call generates
// the whole plan when Kate clicks Generate. Status indicators and the
// per-section state machine are gone.

interface Moment2Step1ModalProps {
  eventId: string;
  eventName: string;
  onGenerate: () => void;
  onCancel: () => void;
}

interface FoodItem {
  name: string;
  included: boolean;
}

interface SectionData {
  items: FoodItem[];
  stillDeciding: boolean;
  selections?: OptionTreeSelections;
}

// GTC-150: three-state dietary model. `status` is derived from interaction —
// ticking "No dietary needs" → confirmed_none; any requirement or other-text
// → confirmed_needs; nothing → unanswered. Skipping the accordion never
// confirms anything.
interface DietaryData {
  status: DietaryStatus;
  requirements: string[];
  other: string;
}

interface OtherJobsAccordionData {
  freeText: string;
  stillDeciding: boolean;
}

interface ExtendedCategoryEntry {
  selections: OptionTreeSelections;
  stillDeciding: boolean;
}

interface Step1State {
  eventType: string | null;
  eventTypeOther: string;
  mainsData: SectionData;
  sidesData: SectionData;
  dessertsData: SectionData;
  drinksData: SectionData;
  dietaryData: DietaryData;
  otherNotes: string;
  extendedCategoriesData: Record<string, ExtendedCategoryEntry>;
  setUpData: OtherJobsAccordionData;
  cleanUpData: OtherJobsAccordionData;
  otherJobsOtherData: OtherJobsAccordionData;
}

// Canonical food categories rendered as OptionTree accordions, in render order
// when present in the occasion's defaultCategories.
const OPTION_TREE_FOOD_CATEGORIES = [
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

type OptionTreeFoodKey = (typeof OPTION_TREE_FOOD_CATEGORIES)[number];

const OPTION_TREE_CATEGORY_META: Record<OptionTreeFoodKey, { label: string; emoji: string }> = {
  mains: { label: 'Mains', emoji: '🍖' },
  entree_starters: { label: 'Entrée & Starters', emoji: '🥟' },
  sides_salads: { label: 'Sides & Salads', emoji: '🥗' },
  dessert: { label: 'Dessert', emoji: '🍰' },
  cake: { label: 'Cake', emoji: '🎂' },
  drinks_alcoholic: { label: 'Alcoholic Drinks', emoji: '🍷' },
  drinks_non_alcoholic: { label: 'Non-Alcoholic Drinks', emoji: '🥤' },
  table_snacks: { label: 'Table Snacks', emoji: '🍿' },
  breakfast_brunch: { label: 'Breakfast & Brunch', emoji: '🍳' },
};

function readExtendedEntry(raw: unknown): ExtendedCategoryEntry {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as { selections?: unknown; stillDeciding?: unknown };
    const selections =
      r.selections && typeof r.selections === 'object' && !Array.isArray(r.selections)
        ? (r.selections as OptionTreeSelections)
        : {};
    return {
      selections,
      stillDeciding: typeof r.stillDeciding === 'boolean' ? r.stillDeciding : false,
    };
  }
  return { selections: {}, stillDeciding: false };
}

interface HouseholdMember {
  householdRole: string;
  person: { id: string; name: string; email: string | null; phoneNumber: string | null };
}

interface Household {
  id: string;
  members: HouseholdMember[];
  littleCount?: number;
}

// ─── Event type defaults ─────────────────────────────────────────────────────

const FEEDBACK_LINES: Record<string, string> = {
  'Casual BBQ': "A BBQ for [X] people. Let's sort out what you need.",
  'Birthday (Kids)': "A kids party for [X]. Let's keep it simple.",
  'Birthday (Adult)': "A birthday for [X]. Let's make it one to remember.",
  Christmas: "Christmas for [X]. Big one. Let's get it sorted.",
  Easter: "Easter for [X]. Let's get the menu sorted.",
  'Wedding Reception': "A wedding reception for [X]. Let's make it special.",
  'Baby Shower': "A baby shower for [X]. Let's plan something lovely.",
  'Engagement Party': "An engagement party for [X]. Let's celebrate.",
  Anniversary: "An anniversary for [X]. Let's make it memorable.",
  Farewell: "A farewell for [X]. Let's send them off right.",
  Other: "Got it. Let's figure out what this needs.",
};

const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-free', 'Dairy-free', 'Nut allergy'];

const EMPTY_OTHER_JOBS: OtherJobsAccordionData = { freeText: '', stillDeciding: false };

const INITIAL_STATE: Step1State = {
  eventType: null,
  eventTypeOther: '',
  mainsData: { items: [], stillDeciding: false },
  sidesData: { items: [], stillDeciding: false },
  dessertsData: { items: [], stillDeciding: false },
  drinksData: { items: [], stillDeciding: false },
  dietaryData: { status: 'unanswered', requirements: [], other: '' },
  otherNotes: '',
  extendedCategoriesData: {},
  setUpData: { ...EMPTY_OTHER_JOBS },
  cleanUpData: { ...EMPTY_OTHER_JOBS },
  otherJobsOtherData: { ...EMPTY_OTHER_JOBS },
};

function readOtherJobs(raw: unknown): OtherJobsAccordionData {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const r = raw as { freeText?: unknown; stillDeciding?: unknown };
    return {
      freeText: typeof r.freeText === 'string' ? r.freeText : '',
      stillDeciding: typeof r.stillDeciding === 'boolean' ? r.stillDeciding : false,
    };
  }
  return { ...EMPTY_OTHER_JOBS };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Moment2Step1Modal({
  eventId,
  onGenerate,
  onCancel,
}: Moment2Step1ModalProps) {
  const [state, setState] = useState<Step1State>(INITIAL_STATE);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [showAdditionalCategories, setShowAdditionalCategories] = useState(false);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Step1State | null>(null);

  // Fetch household data for the feedback line headcount.
  useEffect(() => {
    const fetchHouseholds = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/households`);
        if (!res.ok) return;
        const data = await res.json();
        const households: Household[] = data.households ?? [];

        let count = 0;
        for (const h of households) {
          count += h.members.length;
          if (typeof h.littleCount === 'number') count += h.littleCount;
        }
        setPeopleCount(count);
      } catch {
        // silent — non-critical
      }
    };
    fetchHouseholds();
  }, [eventId]);

  // Fetch existing setup data on mount
  useEffect(() => {
    const fetchSetup = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/setup`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.setup) {
          const s = data.setup;
          // Migrate old string[] items to FoodItem[] if needed; preserve OptionTree
          // selections when present (legacy rows have items only, no selections).
          const migrateSectionData = (
            raw: SectionData | null,
            fallback: SectionData
          ): SectionData => {
            if (!raw) return fallback;
            const items = Array.isArray(raw.items)
              ? raw.items.map((item: FoodItem | string) =>
                  typeof item === 'string' ? { name: item, included: true } : item
                )
              : fallback.items;
            const selections =
              raw.selections && typeof raw.selections === 'object' && !Array.isArray(raw.selections)
                ? (raw.selections as OptionTreeSelections)
                : undefined;
            return {
              items,
              stillDeciding: raw.stillDeciding ?? fallback.stillDeciding,
              ...(selections ? { selections } : {}),
            };
          };
          const rawExtended =
            s.extendedCategoriesData &&
            typeof s.extendedCategoriesData === 'object' &&
            !Array.isArray(s.extendedCategoriesData)
              ? (s.extendedCategoriesData as Record<string, unknown>)
              : {};
          const hydratedExtended: Record<string, ExtendedCategoryEntry> = {};
          for (const [k, v] of Object.entries(rawExtended)) {
            hydratedExtended[k] = readExtendedEntry(v);
          }
          setState((prev) => ({
            ...prev,
            eventType: LEGACY_EVENT_TYPE_MAP[s.eventType] ?? s.eventType ?? prev.eventType,
            eventTypeOther: s.eventTypeOther ?? prev.eventTypeOther,
            mainsData: migrateSectionData(s.mainsData, prev.mainsData),
            sidesData: migrateSectionData(s.sidesData, prev.sidesData),
            dessertsData: migrateSectionData(s.dessertsData, prev.dessertsData),
            drinksData: migrateSectionData(s.drinksData, prev.drinksData),
            dietaryData: s.dietaryData
              ? (() => {
                  // Normalizes legacy rows (no status) via content inference.
                  const d = readDietaryData(s.dietaryData);
                  return { status: d.status, requirements: d.requirements, other: d.other ?? '' };
                })()
              : prev.dietaryData,
            otherNotes: s.otherNotes ?? prev.otherNotes,
            extendedCategoriesData: hydratedExtended,
            setUpData: readOtherJobs(s.setUpData),
            cleanUpData: readOtherJobs(s.cleanUpData),
            otherJobsOtherData: readOtherJobs(s.otherJobsOtherData),
          }));
        }
        setLoaded(true);
      } catch {
        setLoaded(true);
      }
    };
    fetchSetup();
  }, [eventId]);

  // Debounced save
  const saveToApi = useCallback(
    async (data: Step1State) => {
      // Don't send if no event type yet (API validates this)
      const payload: Record<string, unknown> = {};
      if (data.eventType) {
        payload.eventType = data.eventType;
        if (data.eventType === 'Other') {
          payload.eventTypeOther = data.eventTypeOther || 'Custom event';
        } else {
          payload.eventTypeOther = '';
        }
      }
      payload.mainsData = data.mainsData;
      payload.sidesData = data.sidesData;
      payload.dessertsData = data.dessertsData;
      payload.drinksData = data.drinksData;
      payload.dietaryData = data.dietaryData;
      payload.otherNotes = data.otherNotes;
      payload.extendedCategoriesData = data.extendedCategoriesData;
      payload.setUpData = data.setUpData;
      payload.cleanUpData = data.cleanUpData;
      payload.otherJobsOtherData = data.otherJobsOtherData;

      try {
        setSaving(true);
        const res = await fetch(`/api/events/${eventId}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        // fetch only rejects on network failure, not on HTTP 4xx/5xx — a
        // swallowed non-ok response is how Step 1 edits silently failed to
        // persist (the "no error surfaced" half of the GTC-151 class of bug).
        if (!res.ok) {
          let message = 'Your changes could not be saved. Please try again.';
          try {
            const body = await res.json();
            if (typeof body?.error === 'string') message = body.error;
          } catch {
            // response had no JSON body — keep the generic message
          }
          setSaveError(message);
          return false;
        }
        setSaveError(null);
        return true;
      } catch {
        setSaveError('Your changes could not be saved. Check your connection and try again.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [eventId]
  );

  const scheduleSave = useCallback(
    (newState: Step1State) => {
      pendingRef.current = newState;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (pendingRef.current) {
          saveToApi(pendingRef.current);
          pendingRef.current = null;
        }
      }, 500);
    },
    [saveToApi]
  );

  const updateState = useCallback(
    (updater: (prev: Step1State) => Step1State) => {
      setState((prev) => {
        const next = updater(prev);
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave]
  );

  // Handle accordion toggle — flush any pending save when closing a section.
  // GTC-145: closing an accordion no longer fires AI generation. Selections
  // are persisted via the debounced save flow only; the single finalize-plan
  // call (on Generate) reads the persisted state.
  const handleAccordionToggle = useCallback(
    (id: string | null) => {
      const previouslyOpen = openAccordion;
      setOpenAccordion(id);

      if (previouslyOpen && previouslyOpen !== id && pendingRef.current) {
        const pending = pendingRef.current;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        pendingRef.current = null;
        saveToApi(pending);
      }
    },
    [openAccordion, saveToApi]
  );

  // Select event type — when switching, reset OptionTree-driven state since the
  // available options/levels differ per occasion. Legacy item arrays still get
  // pre-populated from the config so legacy back-compat readers see values.
  const handleEventTypeSelect = useCallback(
    (type: string) => {
      updateState((prev) => {
        const switching = prev.eventType !== type;
        if (!switching) {
          return { ...prev, eventType: type };
        }
        setShowAdditionalCategories(false);
        const defaults = getAccordionDefaults(type);
        return {
          ...prev,
          eventType: type,
          eventTypeOther: type === 'Other' ? prev.eventTypeOther : '',
          // Mains keeps the legacy items field for back-compat reads, but
          // selections reset so the new OptionTree starts clean.
          mainsData: {
            items: defaults.mains,
            stillDeciding: prev.mainsData.stillDeciding,
            selections: {},
          },
          sidesData: { items: defaults.sides, stillDeciding: prev.sidesData.stillDeciding },
          dessertsData: {
            items: defaults.desserts,
            stillDeciding: prev.dessertsData.stillDeciding,
          },
          drinksData: { items: defaults.drinks, stillDeciding: prev.drinksData.stillDeciding },
          extendedCategoriesData: {},
        };
      });
    },
    [updateState]
  );

  // Generate handler — flush pending save then call onGenerate
  const handleGenerate = useCallback(async () => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (pendingRef.current) {
      const saved = await saveToApi(pendingRef.current);
      pendingRef.current = null;
      // Don't generate off unpersisted edits — finalize-plan reads the saved
      // setup. The failure is already surfaced via saveError.
      if (!saved) return;
    }
    onGenerate();
  }, [onGenerate, saveToApi]);

  // Canonical food categories to render: intersection of OPTION_TREE_FOOD_CATEGORIES
  // and the occasion's defaultCategories. Non-default categories are deferred to
  // sub-commit (h)'s "Show more" mechanic.
  const renderableFoodCategories = useMemo<OptionTreeFoodKey[]>(() => {
    if (!state.eventType) return [];
    const defaults = new Set(getDefaultCategories(state.eventType));
    return OPTION_TREE_FOOD_CATEGORIES.filter((k) => defaults.has(k));
  }, [state.eventType]);

  // Non-default OptionTree food categories that exist in the config for the
  // current occasion but aren't surfaced by default. Revealed via the
  // "Show more categories" toggle.
  const additionalFoodCategories = useMemo<OptionTreeFoodKey[]>(() => {
    if (!state.eventType) return [];
    const defaults = new Set(getDefaultCategories(state.eventType));
    return OPTION_TREE_FOOD_CATEGORIES.filter((k) => {
      if (defaults.has(k)) return false;
      const levels = getCategoryLevels(state.eventType!, k);
      return !!levels && levels.length > 0;
    });
  }, [state.eventType]);

  // Feedback line
  const feedbackLine = state.eventType
    ? (FEEDBACK_LINES[state.eventType] ?? FEEDBACK_LINES.Other).replace('[X]', String(peopleCount))
    : null;

  if (!loaded) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="animate-pulse text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 pb-32">
        {/* Close button */}
        <button
          type="button"
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X size={24} />
        </button>

        {/* Event type selector */}
        <div className="mb-8">
          <p className="text-lg font-medium text-gray-900 mb-4">
            What kind of event are you planning?
          </p>
          <div className="flex flex-wrap gap-2">
            {CONFIG_EVENT_TYPES.map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => handleEventTypeSelect(type)}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  state.eventType === type
                    ? 'bg-accent text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {type}
              </button>
            ))}
          </div>

          {/* Other text input */}
          {state.eventType === 'Other' && (
            <div className="mt-3">
              <input
                type="text"
                placeholder="What kind of event?"
                value={state.eventTypeOther}
                onChange={(e) =>
                  updateState((prev) => ({ ...prev, eventTypeOther: e.target.value }))
                }
                className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
          )}

          {/* Feedback line */}
          {feedbackLine && <p className="mt-4 text-base text-gray-600 italic">{feedbackLine}</p>}
        </div>

        {/* Accordions — only show after event type selected */}
        {state.eventType && (
          <div className="space-y-2">
            {/* FOOD section */}
            <div className="text-xs uppercase tracking-wider text-gray-500 mt-4 mb-2 border-t border-gray-200 pt-4">
              Food
            </div>
            {/* Dietary requirements — first so food sections have context */}
            <DietaryAccordion
              id="dietary"
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              data={state.dietaryData}
              onChange={(d) => updateState((prev) => ({ ...prev, dietaryData: d }))}
            />
            {/* Canonical OptionTree food categories from defaultCategories.
                Non-default categories are deferred to sub-commit (h)'s "Show more". */}
            {state.eventType &&
              renderableFoodCategories.map((catKey) => {
                const meta = OPTION_TREE_CATEGORY_META[catKey];
                const levels = getCategoryLevels(state.eventType!, catKey);
                if (!levels || levels.length === 0) return null;
                if (catKey === 'mains') {
                  const data = state.mainsData;
                  return (
                    <FoodOptionTreeAccordion
                      key="mains"
                      id="mains"
                      label={`${meta.emoji} ${meta.label}`}
                      levels={levels}
                      selections={data.selections ?? {}}
                      stillDeciding={data.stillDeciding}
                      openAccordion={openAccordion}
                      onToggle={handleAccordionToggle}
                      onSelectionsChange={(next) =>
                        updateState((prev) => ({
                          ...prev,
                          mainsData: { ...prev.mainsData, selections: next },
                        }))
                      }
                      onStillDecidingToggle={() =>
                        updateState((prev) => ({
                          ...prev,
                          mainsData: {
                            ...prev.mainsData,
                            stillDeciding: !prev.mainsData.stillDeciding,
                          },
                        }))
                      }
                    />
                  );
                }
                const entry = state.extendedCategoriesData[catKey] ?? {
                  selections: {},
                  stillDeciding: false,
                };
                return (
                  <FoodOptionTreeAccordion
                    key={catKey}
                    id={catKey}
                    label={`${meta.emoji} ${meta.label}`}
                    levels={levels}
                    selections={entry.selections}
                    stillDeciding={entry.stillDeciding}
                    openAccordion={openAccordion}
                    onToggle={handleAccordionToggle}
                    onSelectionsChange={(next) =>
                      updateState((prev) => ({
                        ...prev,
                        extendedCategoriesData: {
                          ...prev.extendedCategoriesData,
                          [catKey]: {
                            selections: next,
                            stillDeciding:
                              prev.extendedCategoriesData[catKey]?.stillDeciding ?? false,
                          },
                        },
                      }))
                    }
                    onStillDecidingToggle={() =>
                      updateState((prev) => {
                        const cur = prev.extendedCategoriesData[catKey] ?? {
                          selections: {},
                          stillDeciding: false,
                        };
                        return {
                          ...prev,
                          extendedCategoriesData: {
                            ...prev.extendedCategoriesData,
                            [catKey]: { ...cur, stillDeciding: !cur.stillDeciding },
                          },
                        };
                      })
                    }
                  />
                );
              })}
            {/* Other (food) */}
            <OtherAccordion
              id="other"
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              value={state.otherNotes}
              onChange={(v) => updateState((prev) => ({ ...prev, otherNotes: v }))}
            />

            {/* Show more food categories toggle (sub-commit h) */}
            {additionalFoodCategories.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAdditionalCategories((v) => !v)}
                className="w-full text-sm text-accent hover:text-accent-dark font-medium py-2 mt-1 transition-colors"
              >
                {showAdditionalCategories
                  ? 'Hide additional categories'
                  : `Show ${additionalFoodCategories.length} more food ${additionalFoodCategories.length === 1 ? 'category' : 'categories'}`}
              </button>
            )}

            {/* Additional (non-default) food OptionTree accordions */}
            {showAdditionalCategories &&
              additionalFoodCategories.map((catKey) => {
                const meta = OPTION_TREE_CATEGORY_META[catKey];
                const levels = getCategoryLevels(state.eventType!, catKey);
                if (!levels || levels.length === 0) return null;
                const entry = state.extendedCategoriesData[catKey] ?? {
                  selections: {},
                  stillDeciding: false,
                };
                return (
                  <FoodOptionTreeAccordion
                    key={catKey}
                    id={catKey}
                    label={`${meta.emoji} ${meta.label}`}
                    levels={levels}
                    selections={entry.selections}
                    stillDeciding={entry.stillDeciding}
                    openAccordion={openAccordion}
                    onToggle={handleAccordionToggle}
                    onSelectionsChange={(next) =>
                      updateState((prev) => ({
                        ...prev,
                        extendedCategoriesData: {
                          ...prev.extendedCategoriesData,
                          [catKey]: {
                            selections: next,
                            stillDeciding:
                              prev.extendedCategoriesData[catKey]?.stillDeciding ?? false,
                          },
                        },
                      }))
                    }
                    onStillDecidingToggle={() =>
                      updateState((prev) => {
                        const cur = prev.extendedCategoriesData[catKey] ?? {
                          selections: {},
                          stillDeciding: false,
                        };
                        return {
                          ...prev,
                          extendedCategoriesData: {
                            ...prev.extendedCategoriesData,
                            [catKey]: { ...cur, stillDeciding: !cur.stillDeciding },
                          },
                        };
                      })
                    }
                  />
                );
              })}

            {/* OTHER JOBS section */}
            <div className="text-xs uppercase tracking-wider text-gray-500 mt-6 mb-2 border-t border-gray-200 pt-4">
              Other jobs
            </div>
            <FreeTextAccordion
              id="setUp"
              label="🛠️ Set up"
              placeholder="What needs setting up before guests arrive? E.g. tables, chairs, decorations..."
              data={state.setUpData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, setUpData: d }))}
            />
            <FreeTextAccordion
              id="cleanUp"
              label="🧹 Clean up"
              placeholder="What needs cleaning up afterwards? E.g. dishes, rubbish, areas to tidy..."
              data={state.cleanUpData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, cleanUpData: d }))}
            />
            <FreeTextAccordion
              id="otherJobsOther"
              label="📋 Other"
              placeholder="Anything else that needs organising? E.g. transport, gifts, music..."
              data={state.otherJobsOtherData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, otherJobsOtherData: d }))}
            />
          </div>
        )}
      </div>

      {/* Sticky generate button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
          {saveError && (
            <p role="alert" className="mb-2 text-sm text-red-600">
              {saveError}
            </p>
          )}
          <button
            type="button"
            disabled={!state.eventType || saving}
            onClick={handleGenerate}
            className="w-full px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate plan &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Accordion shell ─────────────────────────────────────────────────────────

function AccordionShell({
  id,
  label,
  openAccordion,
  onToggle,
  stillDeciding = false,
  onStillDecidingToggle,
  headerHint,
  children,
}: {
  id: string;
  label: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  stillDeciding?: boolean;
  /** Omit to hide the "Still deciding?" affordance (e.g. dietary, GTC-150) */
  onStillDecidingToggle?: () => void;
  /** Optional indicator rendered beside the label (e.g. "Needs confirmation") */
  headerHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isOpen = openAccordion === id;
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`border rounded-lg transition-colors ${
        stillDeciding ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className={`font-medium ${stillDeciding ? 'text-gray-400' : 'text-gray-900'}`}>
            {label}
          </span>
          {headerHint}
        </span>
        <span
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: isOpen
            ? contentRef.current?.scrollHeight
              ? `${contentRef.current.scrollHeight + 40}px`
              : '1000px'
            : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4">
          {onStillDecidingToggle && (
            <button
              type="button"
              onClick={onStillDecidingToggle}
              className={`text-xs mb-3 transition-colors ${
                stillDeciding ? 'text-accent font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {stillDeciding ? '✓ Still deciding — click to edit' : 'Still deciding?'}
            </button>
          )}
          <div className={stillDeciding ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Food OptionTree accordion ───────────────────────────────────────────────

function FoodOptionTreeAccordion({
  id,
  label,
  levels,
  selections,
  stillDeciding,
  openAccordion,
  onToggle,
  onSelectionsChange,
  onStillDecidingToggle,
}: {
  id: string;
  label: string;
  levels: OptionTreeLevel[];
  selections: OptionTreeSelections;
  stillDeciding: boolean;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  onSelectionsChange: (next: OptionTreeSelections) => void;
  onStillDecidingToggle: () => void;
}) {
  return (
    <AccordionShell
      id={id}
      label={label}
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={stillDeciding}
      onStillDecidingToggle={onStillDecidingToggle}
    >
      <OptionTree
        levels={levels}
        selections={selections}
        onChange={onSelectionsChange}
        disabled={stillDeciding}
      />
    </AccordionShell>
  );
}

// ─── Free-text accordion (Other-jobs: Set up, Clean up, Other) ───────────────

function FreeTextAccordion({
  id,
  label,
  placeholder,
  data,
  openAccordion,
  onToggle,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  data: OtherJobsAccordionData;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  onChange: (d: OtherJobsAccordionData) => void;
}) {
  return (
    <AccordionShell
      id={id}
      label={label}
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={data.stillDeciding}
      onStillDecidingToggle={() => onChange({ ...data, stillDeciding: !data.stillDeciding })}
    >
      <textarea
        placeholder={placeholder}
        value={data.freeText}
        onChange={(e) => onChange({ ...data, freeText: e.target.value })}
        rows={5}
        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
      />
    </AccordionShell>
  );
}

// ─── Dietary accordion ───────────────────────────────────────────────────────

function DietaryAccordion({
  id,
  openAccordion,
  onToggle,
  data,
  onChange,
}: {
  id: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  data: DietaryData;
  onChange: (d: DietaryData) => void;
}) {
  // Status is derived, never stored independently: invalid combinations are
  // unrepresentable. Removing the last requirement returns to 'unanswered'
  // rather than silently becoming "no needs" (GTC-150).
  const deriveNeedsStatus = (requirements: string[], other: string): DietaryStatus =>
    requirements.length > 0 || other.trim() !== '' ? 'confirmed_needs' : 'unanswered';

  const toggleReq = (req: string) => {
    const reqs = data.requirements.includes(req)
      ? data.requirements.filter((r) => r !== req)
      : [...data.requirements, req];
    onChange({
      status: deriveNeedsStatus(reqs, data.other),
      requirements: reqs,
      other: data.other,
    });
  };

  const handleOtherChange = (other: string) => {
    onChange({
      status: deriveNeedsStatus(data.requirements, other),
      requirements: data.requirements,
      other,
    });
  };

  const toggleNone = () => {
    if (data.status === 'confirmed_none') {
      onChange({ status: 'unanswered', requirements: [], other: '' });
    } else {
      onChange({ status: 'confirmed_none', requirements: [], other: '' });
    }
  };

  const isNone = data.status === 'confirmed_none';

  return (
    <AccordionShell
      id={id}
      label="⚠️ Dietary requirements"
      openAccordion={openAccordion}
      onToggle={onToggle}
      headerHint={
        data.status === 'unanswered' ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            Needs confirmation
          </span>
        ) : undefined
      }
    >
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isNone}
            onChange={toggleNone}
            className="rounded border-gray-300 text-accent focus:ring-accent/40"
          />
          <span className="text-sm font-medium text-gray-900">No dietary needs at this event</span>
        </label>
        <div className="border-t border-gray-200 my-2" aria-hidden="true" />
        {DIETARY_OPTIONS.map((opt) => (
          <label
            key={opt}
            className={`flex items-center gap-2 ${isNone ? 'opacity-50' : 'cursor-pointer'}`}
          >
            <input
              type="checkbox"
              checked={data.requirements.includes(opt)}
              onChange={() => toggleReq(opt)}
              disabled={isNone}
              className="rounded border-gray-300 text-accent focus:ring-accent/40"
            />
            <span className="text-sm text-gray-700">{opt}</span>
          </label>
        ))}
        <div className="mt-3">
          <input
            type="text"
            placeholder="Other dietary needs"
            value={data.other}
            onChange={(e) => handleOtherChange(e.target.value)}
            disabled={isNone}
            className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
          />
        </div>
      </div>
    </AccordionShell>
  );
}

// ─── Other accordion ─────────────────────────────────────────────────────────

function OtherAccordion({
  id,
  openAccordion,
  onToggle,
  value,
  onChange,
}: {
  id: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <AccordionShell
      id={id}
      label="📝 Other"
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={false}
      onStillDecidingToggle={() => {}}
    >
      <textarea
        placeholder="Anything else Gather should know about? Music, decorations, specific equipment, venue notes..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
      />
    </AccordionShell>
  );
}
