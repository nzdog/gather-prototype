'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  getAccordionDefaults,
  CONFIG_EVENT_TYPES,
  LEGACY_EVENT_TYPE_MAP,
} from '@/lib/ai/config-loader';

// ─── Types ───────────────────────────────────────────────────────────────────

type SectionGenerationStatus = 'idle' | 'generating' | 'generated' | 'failed';

interface Moment2Step1ModalProps {
  eventId: string;
  eventName: string;
  onGenerate: () => void;
  onCancel: () => void;
  onSectionGenerated?: (section: string, status: SectionGenerationStatus) => void;
}

interface FoodItem {
  name: string;
  included: boolean;
}

interface SectionData {
  items: FoodItem[];
  stillDeciding: boolean;
}

interface SetupCleanupData {
  setupCrew: boolean;
  cleanupCrew: boolean;
  kidsOnDishes: boolean;
  stillDeciding: boolean;
}

interface DietaryData {
  requirements: string[];
  other: string;
}

interface Step1State {
  eventType: string | null;
  eventTypeOther: string;
  mainsData: SectionData;
  sidesData: SectionData;
  dessertsData: SectionData;
  drinksData: SectionData;
  setupCleanupData: SetupCleanupData;
  dietaryData: DietaryData;
  otherNotes: string;
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

const INITIAL_STATE: Step1State = {
  eventType: null,
  eventTypeOther: '',
  mainsData: { items: [], stillDeciding: false },
  sidesData: { items: [], stillDeciding: false },
  dessertsData: { items: [], stillDeciding: false },
  drinksData: { items: [], stillDeciding: false },
  setupCleanupData: {
    setupCrew: false,
    cleanupCrew: false,
    kidsOnDishes: false,
    stillDeciding: false,
  },
  dietaryData: { requirements: [], other: '' },
  otherNotes: '',
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function Moment2Step1Modal({
  eventId,
  onGenerate,
  onCancel,
  onSectionGenerated,
}: Moment2Step1ModalProps) {
  const [state, setState] = useState<Step1State>(INITIAL_STATE);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);
  const [peopleCount, setPeopleCount] = useState<number>(0);
  const [totalAdults, setTotalAdults] = useState<number>(0);
  const [totalKids, setTotalKids] = useState<number>(0);
  const [kidsWithJobs, setKidsWithJobs] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Step1State | null>(null);

  // Progressive generation state
  const [sectionStatus, setSectionStatus] = useState<Record<string, SectionGenerationStatus>>({
    mains: 'idle',
    sides: 'idle',
    desserts: 'idle',
    drinks: 'idle',
    setup: 'idle',
    dietary: 'idle',
    other: 'idle',
  });
  // Track what data was last generated for each section to avoid re-generating unchanged sections
  const lastGeneratedRef = useRef<Record<string, string>>({});

  // Fetch household data for people count and kids-with-jobs
  useEffect(() => {
    const fetchHouseholds = async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/households`);
        if (!res.ok) return;
        const data = await res.json();
        const households: Household[] = data.households ?? [];

        let count = 0;
        let adults = 0;
        let kids = 0;
        const kidNames: string[] = [];
        for (const h of households) {
          for (const m of h.members) {
            count++;
            if (m.householdRole === 'CHILD') {
              kids++;
              kidNames.push(m.person.name);
            } else {
              adults++;
            }
          }
          if (typeof h.littleCount === 'number') {
            count += h.littleCount;
            kids += h.littleCount;
          }
        }
        setPeopleCount(count);
        setTotalAdults(adults);
        setTotalKids(kids);
        setKidsWithJobs(kidNames);
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
          // Migrate old string[] items to FoodItem[] if needed
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
            return { items, stillDeciding: raw.stillDeciding ?? fallback.stillDeciding };
          };
          setState((prev) => ({
            ...prev,
            eventType: LEGACY_EVENT_TYPE_MAP[s.eventType] ?? s.eventType ?? prev.eventType,
            eventTypeOther: s.eventTypeOther ?? prev.eventTypeOther,
            mainsData: migrateSectionData(s.mainsData, prev.mainsData),
            sidesData: migrateSectionData(s.sidesData, prev.sidesData),
            dessertsData: migrateSectionData(s.dessertsData, prev.dessertsData),
            drinksData: migrateSectionData(s.drinksData, prev.drinksData),
            setupCleanupData: s.setupCleanupData ?? prev.setupCleanupData,
            dietaryData: s.dietaryData
              ? { requirements: s.dietaryData.requirements ?? [], other: s.dietaryData.other ?? '' }
              : prev.dietaryData,
            otherNotes: s.otherNotes ?? prev.otherNotes,
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
      payload.setupCleanupData = data.setupCleanupData;
      payload.dietaryData = data.dietaryData;
      payload.otherNotes = data.otherNotes;

      try {
        setSaving(true);
        await fetch(`/api/events/${eventId}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch {
        // silent — will retry on next change
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

  // Progressive generation — fire when an accordion closes with real data
  const generateSection = useCallback(
    async (sectionId: string, currentState: Step1State) => {
      // Map section ID to state data
      const sectionDataMap: Record<string, unknown> = {
        mains: currentState.mainsData,
        sides: currentState.sidesData,
        desserts: currentState.dessertsData,
        drinks: currentState.drinksData,
        setup: currentState.setupCleanupData,
        dietary: currentState.dietaryData,
        other: {
          items: currentState.otherNotes ? [{ name: currentState.otherNotes, included: true }] : [],
          stillDeciding: false,
        },
      };

      const sectionData = sectionDataMap[sectionId] as { stillDeciding?: boolean } | undefined;
      if (!sectionData) return;

      // Skip if still deciding
      if (sectionData.stillDeciding) return;

      // Check if data has changed since last generation
      const dataHash = JSON.stringify(sectionData);
      if (lastGeneratedRef.current[sectionId] === dataHash) return;

      setSectionStatus((prev) => ({ ...prev, [sectionId]: 'generating' }));
      onSectionGenerated?.(sectionId, 'generating');

      try {
        const res = await fetch(`/api/events/${eventId}/generate-section`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            section: sectionId,
            eventType: currentState.eventType,
            eventTypeOther: currentState.eventTypeOther,
            sectionData,
            householdData: {
              totalAdults,
              totalKids,
              dietaryRequirements: currentState.dietaryData.requirements,
              kidsWithJobs,
            },
          }),
        });

        if (res.status === 429) {
          // AI cap reached — stop progressive generation silently
          setSectionStatus((prev) => ({ ...prev, [sectionId]: 'idle' }));
          return;
        }

        if (!res.ok) {
          setSectionStatus((prev) => ({ ...prev, [sectionId]: 'failed' }));
          onSectionGenerated?.(sectionId, 'failed');
          return;
        }

        lastGeneratedRef.current[sectionId] = dataHash;
        setSectionStatus((prev) => ({ ...prev, [sectionId]: 'generated' }));
        onSectionGenerated?.(sectionId, 'generated');
      } catch {
        setSectionStatus((prev) => ({ ...prev, [sectionId]: 'failed' }));
        onSectionGenerated?.(sectionId, 'failed');
      }
    },
    [eventId, totalAdults, totalKids, kidsWithJobs, onSectionGenerated]
  );

  // Handle accordion toggle — fire generation when closing a section with data
  const handleAccordionToggle = useCallback(
    (id: string | null) => {
      const previouslyOpen = openAccordion;
      setOpenAccordion(id);

      // If we're closing a section (previouslyOpen was set, now changing away from it)
      if (previouslyOpen && previouslyOpen !== id && state.eventType) {
        // Flush pending save first, then generate
        if (pendingRef.current) {
          const pending = pendingRef.current;
          if (debounceRef.current) {
            clearTimeout(debounceRef.current);
            debounceRef.current = null;
          }
          pendingRef.current = null;
          saveToApi(pending).then(() => {
            generateSection(previouslyOpen, pending);
          });
        } else {
          generateSection(previouslyOpen, state);
        }
      }
    },
    [openAccordion, state, saveToApi, generateSection]
  );

  // Select event type — also populate food defaults if switching types
  const handleEventTypeSelect = useCallback(
    (type: string) => {
      updateState((prev) => {
        const defaults = getAccordionDefaults(type);
        const shouldPopulate = prev.eventType !== type;
        return {
          ...prev,
          eventType: type,
          eventTypeOther: type === 'Other' ? prev.eventTypeOther : '',
          mainsData: shouldPopulate
            ? { items: defaults.mains, stillDeciding: prev.mainsData.stillDeciding }
            : prev.mainsData,
          sidesData: shouldPopulate
            ? { items: defaults.sides, stillDeciding: prev.sidesData.stillDeciding }
            : prev.sidesData,
          dessertsData: shouldPopulate
            ? { items: defaults.desserts, stillDeciding: prev.dessertsData.stillDeciding }
            : prev.dessertsData,
          drinksData: shouldPopulate
            ? { items: defaults.drinks, stillDeciding: prev.drinksData.stillDeciding }
            : prev.drinksData,
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
      await saveToApi(pendingRef.current);
      pendingRef.current = null;
    }
    onGenerate();
  }, [onGenerate, saveToApi]);

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
            {/* Dietary requirements — first so food sections have context */}
            <DietaryAccordion
              id="dietary"
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              data={state.dietaryData}
              onChange={(d) => updateState((prev) => ({ ...prev, dietaryData: d }))}
              generationStatus={sectionStatus.dietary}
            />
            {/* Mains */}
            <FoodAccordion
              id="mains"
              label="🍖 Mains"
              data={state.mainsData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, mainsData: d }))}
              generationStatus={sectionStatus.mains}
            />
            {/* Sides */}
            <FoodAccordion
              id="sides"
              label="🥗 Sides"
              data={state.sidesData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, sidesData: d }))}
              generationStatus={sectionStatus.sides}
            />
            {/* Dessert */}
            <FoodAccordion
              id="desserts"
              label="🍰 Dessert"
              data={state.dessertsData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, dessertsData: d }))}
              generationStatus={sectionStatus.desserts}
            />
            {/* Drinks */}
            <FoodAccordion
              id="drinks"
              label="🍺 Drinks"
              data={state.drinksData}
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              onChange={(d) => updateState((prev) => ({ ...prev, drinksData: d }))}
              generationStatus={sectionStatus.drinks}
            />
            {/* Setup & Cleanup */}
            <SetupCleanupAccordion
              id="setup"
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              data={state.setupCleanupData}
              kidsWithJobs={kidsWithJobs}
              onChange={(d) => updateState((prev) => ({ ...prev, setupCleanupData: d }))}
              generationStatus={sectionStatus.setup}
            />
            {/* Other */}
            <OtherAccordion
              id="other"
              openAccordion={openAccordion}
              onToggle={handleAccordionToggle}
              value={state.otherNotes}
              onChange={(v) => updateState((prev) => ({ ...prev, otherNotes: v }))}
              generationStatus={sectionStatus.other}
            />
          </div>
        )}
      </div>

      {/* Sticky generate button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4">
        <div className="max-w-2xl mx-auto">
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
  stillDeciding,
  onStillDecidingToggle,
  generationStatus,
  children,
}: {
  id: string;
  label: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  stillDeciding: boolean;
  onStillDecidingToggle: () => void;
  generationStatus?: SectionGenerationStatus;
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
          {generationStatus === 'generating' && (
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
          )}
          {generationStatus === 'generated' && <span className="text-xs text-green-500">✓</span>}
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
          <button
            type="button"
            onClick={onStillDecidingToggle}
            className={`text-xs mb-3 transition-colors ${
              stillDeciding ? 'text-accent font-medium' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {stillDeciding ? '✓ Still deciding — click to edit' : 'Still deciding?'}
          </button>
          <div className={stillDeciding ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}

// ─── Food accordion ──────────────────────────────────────────────────────────

function FoodAccordion({
  id,
  label,
  data,
  openAccordion,
  onToggle,
  onChange,
  generationStatus,
}: {
  id: string;
  label: string;
  data: SectionData;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  onChange: (d: SectionData) => void;
  generationStatus?: SectionGenerationStatus;
}) {
  const [newItem, setNewItem] = useState('');

  const handleAddItem = () => {
    const trimmed = newItem.trim();
    if (!trimmed || data.items.some((i) => i.name === trimmed)) return;
    onChange({ ...data, items: [...data.items, { name: trimmed, included: true }] });
    setNewItem('');
  };

  const handleRemoveItem = (name: string) => {
    onChange({ ...data, items: data.items.filter((i) => i.name !== name) });
  };

  const handleToggleIncluded = (name: string) => {
    onChange({
      ...data,
      items: data.items.map((i) => (i.name === name ? { ...i, included: !i.included } : i)),
    });
  };

  return (
    <AccordionShell
      id={id}
      label={label}
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={data.stillDeciding}
      onStillDecidingToggle={() => onChange({ ...data, stillDeciding: !data.stillDeciding })}
      generationStatus={generationStatus}
    >
      <div className="space-y-2">
        {data.items.map((item) => (
          <div key={item.name} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={item.included}
              onChange={() => handleToggleIncluded(item.name)}
              className="rounded border-gray-300 text-accent focus:ring-accent/40"
            />
            <span
              className={`text-sm flex-1 ${item.included ? 'text-gray-700' : 'text-gray-400 line-through'}`}
            >
              {item.name}
            </span>
            <button
              type="button"
              onClick={() => handleRemoveItem(item.name)}
              className="text-gray-300 hover:text-red-400 text-sm transition-colors"
              aria-label={`Remove ${item.name}`}
            >
              &times;
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            placeholder="+ Add your own"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAddItem();
              }
            }}
            className="flex-1 px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      </div>
    </AccordionShell>
  );
}

// ─── Setup & Cleanup accordion ───────────────────────────────────────────────

function SetupCleanupAccordion({
  id,
  openAccordion,
  onToggle,
  data,
  kidsWithJobs,
  onChange,
  generationStatus,
}: {
  id: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  data: SetupCleanupData;
  kidsWithJobs: string[];
  onChange: (d: SetupCleanupData) => void;
  generationStatus?: SectionGenerationStatus;
}) {
  const hasKids = kidsWithJobs.length > 0;

  return (
    <AccordionShell
      id={id}
      label="🧹 Setup & Cleanup"
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={data.stillDeciding}
      onStillDecidingToggle={() => onChange({ ...data, stillDeciding: !data.stillDeciding })}
      generationStatus={generationStatus}
    >
      <div className="space-y-3">
        <ToggleRow
          label="Setup crew needed"
          checked={data.setupCrew}
          onChange={(v) => onChange({ ...data, setupCrew: v })}
        />
        <ToggleRow
          label="Cleanup crew needed"
          checked={data.cleanupCrew}
          onChange={(v) => onChange({ ...data, cleanupCrew: v })}
        />
        {hasKids && (
          <ToggleRow
            label="Kids on dishes"
            checked={data.kidsOnDishes}
            onChange={(v) => onChange({ ...data, kidsOnDishes: v })}
          />
        )}
        {hasKids && (
          <p className="text-sm text-gray-500 mt-2">
            You&rsquo;ve got {kidsWithJobs.length} kid{kidsWithJobs.length !== 1 ? 's' : ''} with
            jobs &mdash; {kidsWithJobs.join(', ')}. I&rsquo;ll include tasks they can handle.
          </p>
        )}
      </div>
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
  generationStatus,
}: {
  id: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  data: DietaryData;
  onChange: (d: DietaryData) => void;
  generationStatus?: SectionGenerationStatus;
}) {
  const toggleReq = (req: string) => {
    const reqs = data.requirements.includes(req)
      ? data.requirements.filter((r) => r !== req)
      : [...data.requirements, req];
    onChange({ ...data, requirements: reqs });
  };

  return (
    <AccordionShell
      id={id}
      label="⚠️ Dietary requirements"
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={false}
      onStillDecidingToggle={() => {}}
      generationStatus={generationStatus}
    >
      <div className="space-y-2">
        {DIETARY_OPTIONS.map((opt) => (
          <label key={opt} className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={data.requirements.includes(opt)}
              onChange={() => toggleReq(opt)}
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
            onChange={(e) => onChange({ ...data, other: e.target.value })}
            className="w-full px-3 py-1.5 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
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
  generationStatus,
}: {
  id: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  value: string;
  onChange: (v: string) => void;
  generationStatus?: SectionGenerationStatus;
}) {
  return (
    <AccordionShell
      id={id}
      label="📝 Other"
      openAccordion={openAccordion}
      onToggle={onToggle}
      stillDeciding={false}
      onStillDecidingToggle={() => {}}
      generationStatus={generationStatus}
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

// ─── Toggle row ──────────────────────────────────────────────────────────────

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-gray-700">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-gray-300'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
          }`}
        />
      </button>
    </label>
  );
}
