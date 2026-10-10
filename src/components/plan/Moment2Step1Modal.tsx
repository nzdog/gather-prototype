'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getAccordionDefaults,
  getCategoryLevels,
  getUpFrontCategories,
  CONFIG_EVENT_TYPES,
  LEGACY_EVENT_TYPE_MAP,
  readStoredSelections,
} from '@/lib/ai/config-loader';
import OptionTree, {
  type OptionTreeLevel,
  type OptionTreeSelections,
} from '@/components/shared/OptionTree';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import {
  readDietaryData,
  dietaryTitleSummary,
  DIETARY_OPTIONS,
  type DietaryStatus,
} from '@/lib/dietary';
import AccordionShell from '@/components/plan/AccordionShell';
import MomentArc, { type ArcDoor } from '@/components/plan/MomentArc';
import { STRIP_WORDS } from '@/lib/moments/strip';
import MenuSearch, { MENU_ARRIVAL_RING } from '@/components/plan/MenuSearch';
import {
  buildMenuIndex,
  dietaryFromSearch,
  tickFromSearch,
  type MenuRow,
} from '@/lib/moments/menu-search';

// ─── Types ───────────────────────────────────────────────────────────────────

// GTC-145: per-section incremental generation removed. The modal no longer
// fires AI calls on accordion close — a single finalize-plan call generates
// the whole plan when Kate clicks Generate. Status indicators and the
// per-section state machine are gone.

interface Moment2Step1ModalProps {
  eventId: string;
  eventName: string;
  onGenerate: () => void;
  /**
   * [[GTC-367]] (item 1, W2): back to Moment 1. Was `onCancel`, the × that opened Moment 2's
   * opening, whose only button opened these questions again: a loop with no way out (plan Q7).
   */
  onBack: () => void;
  /** [[GTC-367]] (item 2): the strip's doors. Every door that opens is wrapped in `leave`. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /**
   * [[GTC-368]] (item 17): the event's details (W10). The occasion shown is her answer here, as she
   * gives it (C5), and "Change these details" saves first like every other way out (Q8).
   */
  details?: EventDetailsFacts;
  /** [[GTC-368]] (C5): tells the page her answer as it changes, so the plan view's details agree. */
  onOccasionChange?: (occasion: {
    eventType: string | null;
    eventTypeOther: string | null;
  }) => void;
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
        ? readStoredSelections(r.selections as OptionTreeSelections)
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

// GTC-188 (I1): the list now lives in src/lib/dietary.ts so the pre-flight re-verify
// and this capture screen cannot offer different options. Imported above.

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
  onBack,
  doors,
  details,
  onOccasionChange,
}: Moment2Step1ModalProps) {
  const [state, setState] = useState<Step1State>(INITIAL_STATE);
  // GTC-364 (item 3, Q1): the sections open now. Several may be open at once, so opening one
  // never shuts another above it and the row just tapped stays where it was.
  const [openSections, setOpenSections] = useState<string[]>([]);
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
                ? readStoredSelections(raw.selections as OptionTreeSelections)
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
    (id: string) => {
      const closing = openSections.includes(id);
      setOpenSections((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

      if (closing && pendingRef.current) {
        const pending = pendingRef.current;
        if (debounceRef.current) {
          clearTimeout(debounceRef.current);
          debounceRef.current = null;
        }
        pendingRef.current = null;
        saveToApi(pending);
      }
    },
    [openSections, saveToApi]
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

  /**
   * [[GTC-367]] (Q7) — EVERY WAY OUT SAVES FIRST. The questions save half a second after each
   * change; a page change inside that half second would drop the last one. So W1, W2 and the strip
   * all flush the pending save, as Generate does, and stay put if it fails (the failure is already
   * said in the footer, through saveError).
   */
  const leave = useCallback(
    async (go: () => void) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      if (pendingRef.current) {
        const saved = await saveToApi(pendingRef.current);
        pendingRef.current = null;
        if (!saved) return;
      }
      go();
    },
    [saveToApi]
  );
  const leavingDoors = useMemo(() => {
    if (!doors) return undefined;
    const wrapped: Partial<Record<1 | 2 | 3 | 4, ArcDoor>> = {};
    for (const n of [1, 2, 3, 4] as const) {
      const door = doors[n];
      if (!door) continue;
      wrapped[n] = 'onGo' in door ? { onGo: () => void leave(door.onGo) } : door;
    }
    return wrapped;
  }, [doors, leave]);

  // [[GTC-368]] (C5): her answer, as the details say it, here and (through the page) on the plan view.
  // `onOccasionChange` is the page's state setter, the same function on every render.
  useEffect(() => {
    if (!loaded) return;
    onOccasionChange?.({
      eventType: state.eventType || null,
      eventTypeOther: state.eventTypeOther || null,
    });
  }, [loaded, state.eventType, state.eventTypeOther, onOccasionChange]);
  const liveDetails = details
    ? {
        ...details,
        eventType: state.eventType || null,
        eventTypeOther: state.eventTypeOther || null,
      }
    : undefined;

  // Canonical food categories to render: intersection of OPTION_TREE_FOOD_CATEGORIES
  // and the occasion's up-front categories — its defaultCategories, plus any it shows up
  // front without always planning them (GTC-363 item 26: Christmas's Entrée & Starters).
  // The rest are deferred to sub-commit (h)'s "Show more" mechanic.
  const renderableFoodCategories = useMemo<OptionTreeFoodKey[]>(() => {
    if (!state.eventType) return [];
    const upFront = new Set(getUpFrontCategories(state.eventType));
    return OPTION_TREE_FOOD_CATEGORIES.filter((k) => upFront.has(k));
  }, [state.eventType]);

  // OptionTree food categories that exist in the config for the current occasion
  // but aren't shown up front. Revealed via the "Show more categories" toggle.
  const additionalFoodCategories = useMemo<OptionTreeFoodKey[]>(() => {
    if (!state.eventType) return [];
    const upFront = new Set(getUpFrontCategories(state.eventType));
    return OPTION_TREE_FOOD_CATEGORIES.filter((k) => {
      if (upFront.has(k)) return false;
      const levels = getCategoryLevels(state.eventType!, k);
      return !!levels && levels.length > 0;
    });
  }, [state.eventType]);

  /*
    [[GTC-373]] (item 23) — "Find a dish". Its rows are the kind's whole menu in the questions' own
    order: the sections up front, then those behind "Show more" (Q1). Empty for "Other" or no kind,
    and then the box is not shown (Q2).
  */
  const menuRows = useMemo(
    () =>
      buildMenuIndex(state.eventType, [...renderableFoodCategories, ...additionalFoodCategories]),
    [state.eventType, renderableFoodCategories, additionalFoodCategories]
  );
  const menuTicked = (row: MenuRow): boolean => {
    if (row.kind === 'dietary') return state.dietaryData.requirements.includes(row.words);
    if (row.kind === 'section' || !row.section) return false;
    const selections =
      row.section === 'mains'
        ? (state.mainsData.selections ?? {})
        : (state.extendedCategoriesData[row.section]?.selections ?? {});
    return (selections[row.level]?.options ?? []).includes(row.words);
  };

  /*
    [[GTC-373]] (Q9) — where a found row lands: its section open, then (once the box has grown, a
    beat after it opens) the row in the middle of the screen, its box focused and ringed for two
    seconds. Only a tap on a result sets this; nothing else here scrolls.
  */
  const [arrival, setArrival] = useState<{ section: string; option: string | null } | null>(null);
  useEffect(() => {
    if (!arrival) return;
    const timer = window.setTimeout(() => {
      const box = document.querySelector<HTMLElement>(
        `[data-accordion="${CSS.escape(arrival.section)}"]`
      );
      const target = arrival.option
        ? box?.querySelector<HTMLElement>(`[data-option="${CSS.escape(arrival.option)}"]`)
        : box?.querySelector<HTMLElement>('button');
      if (!target) return;
      target.scrollIntoView({ block: 'center' });
      (target.querySelector('input') ?? target).focus({ preventScroll: true });
      target.classList.add(...MENU_ARRIVAL_RING);
      window.setTimeout(() => target.classList.remove(...MENU_ARRIVAL_RING), 2000);
    }, 260);
    return () => window.clearTimeout(timer);
  }, [arrival]);

  /*
    [[GTC-373]] (Q5 to Q8) — a tap on a found row. A dish or style is ticked through the same state
    and the same half-second save as a tick in the section, and the section stops being still
    deciding, as any pick there does; a row already ticked changes nothing and saves nothing (Q6).
  */
  const pickFromMenu = (row: MenuRow) => {
    const changeIfNeeded = (updater: (prev: Step1State) => Step1State) =>
      setState((prev) => {
        const next = updater(prev);
        if (next !== prev) scheduleSave(next);
        return next;
      });
    let section = 'dietary';
    if (row.kind === 'dietary') {
      changeIfNeeded((prev) => {
        const dietaryData = dietaryFromSearch(prev.dietaryData, row.words);
        return dietaryData === prev.dietaryData ? prev : { ...prev, dietaryData };
      });
    } else if (row.section && state.eventType) {
      const key = row.section;
      section = key;
      const levels = getCategoryLevels(state.eventType, key) ?? [];
      changeIfNeeded((prev) => {
        if (key === 'mains') {
          const current = prev.mainsData.selections ?? {};
          const selections = tickFromSearch(levels, current, row);
          return selections === current
            ? prev
            : { ...prev, mainsData: { ...prev.mainsData, selections, stillDeciding: false } };
        }
        const entry = prev.extendedCategoriesData[key] ?? { selections: {}, stillDeciding: false };
        const selections = tickFromSearch(levels, entry.selections, row);
        return selections === entry.selections
          ? prev
          : {
              ...prev,
              extendedCategoriesData: {
                ...prev.extendedCategoriesData,
                [key]: { selections, stillDeciding: false },
              },
            };
      });
      if ((additionalFoodCategories as readonly string[]).includes(key)) {
        setShowAdditionalCategories(true);
      }
    }
    setOpenSections((prev) => (prev.includes(section) ? prev : [...prev, section]));
    setArrival({
      section,
      option:
        row.kind === 'section'
          ? null
          : row.kind === 'dietary'
            ? `dietary:${row.words}`
            : `${row.level}:${row.words}`,
    });
  };

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
        {/*
          [[GTC-367]] (items 1, 2 and 31) — the way out (W1) and the strip, where the × was. This
          screen covers the menu bar, so it carries its own way out; it saves first (Q7).
        */}
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <a
            href="/plan/events"
            onClick={(e) => {
              e.preventDefault();
              void leave(() => {
                window.location.href = '/plan/events';
              });
            }}
            className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
          >
            {STRIP_WORDS.YOUR_EVENTS}
          </a>
          {/* [[GTC-368]] (item 17, Q1, Q8): the event's name; its "Change these details" saves first. */}
          {liveDetails && (
            <EventDetails
              facts={liveDetails}
              onChangeDetails={(href) =>
                void leave(() => {
                  window.location.href = href;
                })
              }
            />
          )}
        </div>
        <div className="mb-8">
          <MomentArc currentMoment={2} completedMoments={[1]} doors={leavingDoors} />
        </div>

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

        {/* [[GTC-373]] (item 23, Q3) — "Find a dish", in the flow above "Food", never fixed. */}
        {menuRows.length > 0 && (
          <MenuSearch
            rows={menuRows}
            isTicked={menuTicked}
            dietaryNone={state.dietaryData.status === 'confirmed_none'}
            onPick={pickFromMenu}
          />
        )}

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
              openSections={openSections}
              onToggle={handleAccordionToggle}
              data={state.dietaryData}
              onChange={(d) => updateState((prev) => ({ ...prev, dietaryData: d }))}
            />
            {/* GTC-363 (item 25): the notes box, lifted to just after Dietary and renamed.
                Still `otherNotes`, under the same id, so what the AI reads is unchanged. */}
            <NotesAccordion
              id="other"
              openSections={openSections}
              onToggle={handleAccordionToggle}
              value={state.otherNotes}
              onChange={(v) => updateState((prev) => ({ ...prev, otherNotes: v }))}
            />
            {/* Canonical OptionTree food categories shown up front (GTC-363: the defaults,
                plus any shown up front only). The rest are deferred to "Show more". */}
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
                      openSections={openSections}
                      onToggle={handleAccordionToggle}
                      onSelectionsChange={(next) =>
                        updateState((prev) => ({
                          ...prev,
                          // GTC-364 (item 18): a choice made here ends "still deciding".
                          mainsData: { ...prev.mainsData, selections: next, stillDeciding: false },
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
                    openSections={openSections}
                    onToggle={handleAccordionToggle}
                    onSelectionsChange={(next) =>
                      updateState((prev) => ({
                        ...prev,
                        extendedCategoriesData: {
                          ...prev.extendedCategoriesData,
                          // GTC-364 (item 18): a choice made here ends "still deciding".
                          [catKey]: { selections: next, stillDeciding: false },
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
                    openSections={openSections}
                    onToggle={handleAccordionToggle}
                    onSelectionsChange={(next) =>
                      updateState((prev) => ({
                        ...prev,
                        extendedCategoriesData: {
                          ...prev.extendedCategoriesData,
                          // GTC-364 (item 18): a choice made here ends "still deciding".
                          [catKey]: { selections: next, stillDeciding: false },
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
              openSections={openSections}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, setUpData: d }))}
            />
            <FreeTextAccordion
              id="cleanUp"
              label="🧹 Clean up"
              placeholder="What needs cleaning up afterwards? E.g. dishes, rubbish, areas to tidy..."
              data={state.cleanUpData}
              openSections={openSections}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, cleanUpData: d }))}
            />
            <FreeTextAccordion
              id="otherJobsOther"
              label="📋 Other"
              placeholder="Anything else that needs organising? E.g. transport, gifts, music..."
              data={state.otherJobsOtherData}
              openSections={openSections}
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
          {/* [[GTC-367]] (item 1, W2) — the way back to Moment 1, as the plan view's footer has its. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void leave(onBack)}
              className="shrink-0 text-sm text-gray-600 hover:text-gray-900 px-3 py-2"
            >
              {STRIP_WORDS.BACK_TO_PEOPLE}
            </button>
            <div className="flex-1">
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
  openSections,
  onToggle,
  onSelectionsChange,
  onStillDecidingToggle,
}: {
  id: string;
  label: string;
  levels: OptionTreeLevel[];
  selections: OptionTreeSelections;
  stillDeciding: boolean;
  openSections: string[];
  onToggle: (id: string) => void;
  onSelectionsChange: (next: OptionTreeSelections) => void;
  onStillDecidingToggle: () => void;
}) {
  return (
    <AccordionShell
      id={id}
      label={label}
      open={openSections.includes(id)}
      onToggle={() => onToggle(id)}
      stillDeciding={stillDeciding}
      onStillDecidingToggle={onStillDecidingToggle}
    >
      <OptionTree levels={levels} selections={selections} onChange={onSelectionsChange} />
    </AccordionShell>
  );
}

// ─── Free-text accordion (Other-jobs: Set up, Clean up, Other) ───────────────

function FreeTextAccordion({
  id,
  label,
  placeholder,
  data,
  openSections,
  onToggle,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  data: OtherJobsAccordionData;
  openSections: string[];
  onToggle: (id: string) => void;
  onChange: (d: OtherJobsAccordionData) => void;
}) {
  return (
    <AccordionShell
      id={id}
      label={label}
      open={openSections.includes(id)}
      onToggle={() => onToggle(id)}
      stillDeciding={data.stillDeciding}
      onStillDecidingToggle={() => onChange({ ...data, stillDeciding: !data.stillDeciding })}
    >
      <textarea
        placeholder={placeholder}
        value={data.freeText}
        // GTC-364 (item 18): typing here ends "still deciding".
        onChange={(e) => onChange({ ...data, freeText: e.target.value, stillDeciding: false })}
        rows={5}
        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-y"
      />
    </AccordionShell>
  );
}

// ─── Dietary accordion ───────────────────────────────────────────────────────

function DietaryAccordion({
  id,
  openSections,
  onToggle,
  data,
  onChange,
}: {
  id: string;
  openSections: string[];
  onToggle: (id: string) => void;
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
      open={openSections.includes(id)}
      onToggle={() => onToggle(id)}
      headerHint={
        // GTC-364 (item 28, W4 to W7): the row says what was answered, open or closed.
        data.status === 'unanswered' ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-600">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
            {dietaryTitleSummary(data)}
          </span>
        ) : (
          <span
            className="block max-w-full truncate text-xs text-gray-500"
            title={dietaryTitleSummary(data)}
          >
            {dietaryTitleSummary(data)}
          </span>
        )
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
            data-option={`dietary:${opt}`}
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

// ─── Notes accordion (GTC-363 item 25; "📝 Other" until then) ─────────────────

function NotesAccordion({
  id,
  openSections,
  onToggle,
  value,
  onChange,
}: {
  id: string;
  openSections: string[];
  onToggle: (id: string) => void;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <AccordionShell
      id={id}
      label="📝 Notes"
      open={openSections.includes(id)}
      onToggle={() => onToggle(id)}
    >
      <textarea
        placeholder="Anything else Gather should know? For example, you’d like leftovers for 6 people tomorrow."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        className="w-full px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
      />
    </AccordionShell>
  );
}
