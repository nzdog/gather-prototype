'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Loader2,
  Users,
  AlertCircle,
  Package,
  Link as LinkIcon,
  Clock,
  Calendar,
  CheckCircle,
  Eye,
  Send,
  Download,
  Gift,
} from 'lucide-react';
import ConflictList from '@/components/plan/ConflictList';
import GateCheck from '@/components/plan/GateCheck';
import FreezeCheck from '@/components/plan/FreezeCheck';
import { isSentJson, isCompleteJson } from '@/lib/lifecycle';
import TransitionModal from '@/components/plan/TransitionModal';
import EventStageProgress from '@/components/plan/EventStageProgress';
import SaveTemplateModal from '@/components/templates/SaveTemplateModal';
import AddTeamModal, { TeamFormData } from '@/components/plan/AddTeamModal';
import AddItemModal, { ItemFormData } from '@/components/plan/AddItemModal';
import EditItemModal from '@/components/plan/EditItemModal';
import RevisionHistory from '@/components/plan/RevisionHistory';
import RegenerateModal from '@/components/plan/RegenerateModal';
import HostDescriptionModal from '@/components/plan/HostDescriptionModal';
import PeopleSection from '@/components/plan/PeopleSection';
import EditEventModal from '@/components/plan/EditEventModal';
import ItemStatusBadges from '@/components/plan/ItemStatusBadges';
import SectionExpandModal from '@/components/plan/SectionExpandModal';
import ModalTabBar, { ModalTabId } from '@/components/plan/ModalTabBar';
import GenerationReviewPanel from '@/components/plan/GenerationReviewPanel';
import { InviteStatusSection } from '@/components/plan/InviteStatusSection';
import { SharedLinkSection } from '@/components/plan/SharedLinkSection';
import { InviteFunnel } from '@/components/plan/InviteFunnel';
import { WhosMissing } from '@/components/plan/WhosMissing';
import NextStepBanner from '@/components/plan/NextStepBanner';
import { CopyPlanAsText } from '@/components/plan/CopyPlanAsText';
import { PersonInviteDetailModal } from '@/components/plan/PersonInviteDetailModal';
import PastEventOverlay from '@/components/plan/PastEventOverlay';
import { ModalProvider } from '@/contexts/ModalContext';
import { useToast } from '@/contexts/ToastContext';
import { Conflict, ConflictType } from '@prisma/client';
import { DropOffDisplay } from '@/components/shared/DropOffDisplay';
import SetupChecklistBanner from '@/components/plan/SetupChecklistBanner';
import SetupOpeningScreen from '@/components/plan/SetupOpeningScreen';
import Moment1InputForm, { Moment1PersonInput } from '@/components/plan/Moment1InputForm';
import HouseholdCardList, { SavedHousehold } from '@/components/plan/HouseholdCardList';
import Moment1Summary from '@/components/plan/Moment1Summary';
import Moment2Opening from '@/components/plan/Moment2Opening';
import Moment2Step1Modal from '@/components/plan/Moment2Step1Modal';
import Moment2Step2Skeleton, { Moment2Plan } from '@/components/plan/Moment2Step2Skeleton';
import Moment2PlanView, {
  PlanCategory as Moment2PlanCategory,
  PlanItem as Moment2PlanItem,
} from '@/components/plan/Moment2PlanView';
import { useEventSetupProgress } from '@/hooks/useEventSetupProgress';

// Moment 2 plan view mappers ────────────────────────────────────────────────
const MOMENT2_CATEGORY_EMOJIS: Record<string, string> = {
  mains: '🍖',
  sides: '🥗',
  salads: '🥗',
  starters: '🥟',
  dessert: '🍰',
  desserts: '🍰',
  drinks: '🍺',
  'setup & cleanup': '🧹',
  setup: '🧹',
  cleanup: '🧹',
  dietary: '⚠️',
};

function emojiForCategoryName(name: string): string {
  return MOMENT2_CATEGORY_EMOJIS[name.toLowerCase()] ?? '📋';
}

type PlanApiItem = {
  id: string;
  name: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  quantityText: string | null;
  notes: string | null;
  dietaryTags: unknown;
  displayOrder: number | null;
  team: { id: string; name: string; displayOrder?: number };
};

type PlanApiTeam = {
  id: string;
  name: string;
  displayOrder?: number;
};

function mapItemUnitToDisplay(item: PlanApiItem): string {
  if (item.quantityUnitCustom) return item.quantityUnitCustom;
  if (!item.quantityUnit || item.quantityUnit === 'CUSTOM') return '';
  const unitMap: Record<string, string> = {
    KG: 'kg',
    G: 'g',
    L: 'litres',
    ML: 'ml',
    COUNT: 'pieces',
    PACKS: 'packs',
    TRAYS: 'trays',
    SERVINGS: 'servings',
  };
  return unitMap[item.quantityUnit] ?? item.quantityUnit.toLowerCase();
}

function mapTeamsAndItemsToPlanCategories(
  teams: PlanApiTeam[],
  items: PlanApiItem[]
): Array<{
  id: string;
  name: string;
  emoji: string;
  items: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: string;
    servingSize: string;
    notes?: string;
    dietaryFlags?: string[];
    displayOrder?: number;
  }>;
}> {
  const itemsByTeamId = new Map<string, PlanApiItem[]>();
  for (const item of items) {
    const list = itemsByTeamId.get(item.team.id) ?? [];
    list.push(item);
    itemsByTeamId.set(item.team.id, list);
  }

  const sortedTeams = [...teams].sort((a, b) => {
    const aOrder = a.displayOrder ?? 0;
    const bOrder = b.displayOrder ?? 0;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.name.localeCompare(b.name);
  });

  return sortedTeams.map((team) => ({
    id: team.id,
    name: team.name,
    emoji: emojiForCategoryName(team.name),
    items: (itemsByTeamId.get(team.id) ?? [])
      .slice()
      .sort((a, b) => {
        const ao = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const bo = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        return ao - bo;
      })
      .map((item) => {
        const dietaryFlags = Array.isArray(item.dietaryTags)
          ? (item.dietaryTags as string[])
          : undefined;
        return {
          id: item.id,
          name: item.name,
          quantity: item.quantityAmount ?? 0,
          unit: mapItemUnitToDisplay(item),
          servingSize: item.quantityText ?? '',
          notes: item.notes ?? undefined,
          dietaryFlags,
          displayOrder: item.displayOrder ?? undefined,
        };
      }),
  }));
}

interface Event {
  id: string;
  name: string;
  status: string;
  /** GTC-197: the send is a timestamp, not a status. Drives isSentJson/isCompleteJson. */
  sentAt: string | null;
  occasionType: string | null;
  occasionDescription: string | null;
  guestCount: number | null;
  guestCountConfidence: string;
  guestCountMin: number | null;
  guestCountMax: number | null;
  dietaryStatus: string;
  dietaryVegetarian: number;
  dietaryVegan: number;
  dietaryGlutenFree: number;
  dietaryDairyFree: number;
  dietaryAllergies: string | null;
  venueName: string | null;
  venueType: string | null;
  venueKitchenAccess: string | null;
  venueOvenCount: number;
  venueStoretopBurners: number | null;
  venueBbqAvailable: boolean | null;
  venueTimingStart: string | null;
  venueTimingEnd: string | null;
  venueNotes: string | null;
  startDate: string;
  endDate: string;
  lastCheckPlanAt: string | null;
  hostId: string;
  isDemo: boolean;
  clonedFromId: string | null;
  aiCallsUsed: number;
  // Present when the event entered the V2 Moment flow (EventSetup row exists).
  // V1-pipeline actions (e.g. Regenerate) are hidden when set (GTC-148).
  setup: { id: string } | null;
}

interface Team {
  id: string;
  name: string;
  scope: string;
  coordinator: {
    id: string;
    name: string;
  };
  _count: {
    items: number;
    members: number;
  };
  unassignedCount: number;
}

interface Item {
  id: string;
  name: string;
  description: string | null;
  critical: boolean;
  quantityState: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityText: string | null;
  placeholderAcknowledged: boolean;
  quantityDeferredTo: string | null;
  dietaryTags: string[];
  dayId: string | null;
  serveTime: string | null;
  dropOffLocation: string | null;
  dropOffAt: string | null;
  dropOffNote: string | null;
  createdAt: string; // For checking if item is newly regenerated
  team: {
    id: string;
    name: string;
    displayOrder: number;
  };
  assignment: {
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED';
    person: {
      id: string;
      name: string;
    };
  } | null;
  day?: {
    id: string;
    name: string;
    date: string;
  } | null;
}

interface Day {
  id: string;
  name: string;
  date: string;
}

interface Person {
  id: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  team: {
    id: string;
    name: string;
  };
  itemCount: number;
}

type SectionId =
  | 'assessment'
  | 'items'
  | 'people'
  | 'teams'
  | 'planstatus'
  | 'invites'
  | 'history'
  | 'wrapup';

const validSectionIds: SectionId[] = [
  'assessment',
  'items',
  'people',
  'teams',
  'planstatus',
  'invites',
  'history',
  'wrapup',
];

function isValidSectionId(value: string): value is SectionId {
  return validSectionIds.includes(value as SectionId);
}

export default function PlanEditorPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const eventId = params.eventId as string;
  const toast = useToast();

  const [event, setEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
  const [expandedItemCategories, setExpandedItemCategories] = useState<Set<string>>(new Set());
  const [_editingItemId, _setEditingItemId] = useState<string | null>(null);
  const [_editQuantityAmount, _setEditQuantityAmount] = useState('');
  const [_editQuantityUnit, _setEditQuantityUnit] = useState('SERVINGS');
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);
  const [addTeamModalOpen, setAddTeamModalOpen] = useState(false);
  const [addItemModalOpen, setAddItemModalOpen] = useState(false);
  const [selectedTeamForItem, setSelectedTeamForItem] = useState<Team | null>(null);
  const [teamItems, setTeamItems] = useState<Record<string, Item[]>>({});
  const [loadingTeamItems, setLoadingTeamItems] = useState<Set<string>>(new Set());
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [gateCheckRefresh, setGateCheckRefresh] = useState(0);
  const [showTransitionModal, setShowTransitionModal] = useState(false);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isCheckingPlan, setIsCheckingPlan] = useState(false);
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [hostDescriptionModalOpen, setHostDescriptionModalOpen] = useState(false);
  const [manualTeamCount, _setManualTeamCount] = useState(0);
  const [manualItemCount, _setManualItemCount] = useState(0);
  const [editEventModalOpen, setEditEventModalOpen] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<any[]>([]);
  const [inviteLinksError, setInviteLinksError] = useState(false);
  const [personStatuses, setPersonStatuses] = useState<Map<string, any>>(new Map());
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [resettingClaim, setResettingClaim] = useState<string | null>(null);
  const [copiedDirectory, setCopiedDirectory] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SectionId | null>(null);
  const [initialExpandedTeam, setInitialExpandedTeam] = useState<string | null>(null);
  const [peopleInitialView, setPeopleInitialView] = useState<'table' | 'board'>('table');
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [inviteStatusData, setInviteStatusData] = useState<any | null>(null);
  const [checklistDismissed, setChecklistDismissed] = useState(false);
  const [nextStepDismissed, setNextStepDismissed] = useState(false);
  const [inviteHighlightSeen, setInviteHighlightSeen] = useState(false);
  const [checklistStepContext, setChecklistStepContext] = useState<string | null>(null);
  const [isPostPayment, setIsPostPayment] = useState(false);
  const [showSetup, setShowSetup] = useState(searchParams.get('setup') === 'true');
  const [showMoment1, setShowMoment1] = useState(false);
  const [moment1Phase, setMoment1Phase] = useState<'input' | 'summary'>('input');
  const [showMoment2Opening, setShowMoment2Opening] = useState(false);
  const [showMoment2Step1, setShowMoment2Step1] = useState(false);
  const [showMoment2Step2Skeleton, setShowMoment2Step2Skeleton] = useState(false);
  const [moment2Plan, setMoment2Plan] = useState<Moment2Plan | null>(null);
  const [showMoment2PlanView, setShowMoment2PlanView] = useState(false);
  const [moment2PlanCategories, setMoment2PlanCategories] = useState<Moment2PlanCategory[]>([]);
  const [households, setHouseholds] = useState<SavedHousehold[]>([]);
  const [editingHousehold, setEditingHousehold] = useState<SavedHousehold | null>(null);
  const moment1FormRef = useRef<HTMLDivElement>(null);
  const [wrapUpLoading, setWrapUpLoading] = useState(false);
  const [wrapUpResult, setWrapUpResult] = useState<{
    success: boolean;
    guestsToNotify?: number;
    guestsSkipped?: number;
    warning?: boolean;
    message?: string;
  } | null>(null);
  const [wrapUpDispatch, setWrapUpDispatch] = useState<{
    total: number;
    sent: number;
    failed: number;
    skipped: number;
    pending: number;
    earliestCreatedAt: string | null;
    guests: Array<{
      personId: string;
      name: string;
      channel: string;
      dispatched: boolean;
      failed: boolean;
      failReason: string | null;
    }>;
  } | null>(null);
  const [wrapUpRetrying, setWrapUpRetrying] = useState(false);
  const [wrapUpStatusLoading, setWrapUpStatusLoading] = useState(false);
  const [countdownMinutes, setCountdownMinutes] = useState<number | null>(null);
  const [modalBreadcrumbTrail, setModalBreadcrumbTrail] = useState<ModalTabId[]>([]);
  const [savingForNextYear, setSavingForNextYear] = useState(false);
  const [savedForNextYear, setSavedForNextYear] = useState(false);
  const [showReuseOverlay, setShowReuseOverlay] = useState(false);
  const [reuseOverlaySummary, setReuseOverlaySummary] = useState<{
    eventName: string;
    guestCount: number | null;
    guestNames: string[];
    teamCount: number;
    itemCount: number;
  } | null>(null);
  const pendingModalAction = useRef<'generate' | 'reassign-items' | null>(null);

  // Batch assignment state for Teams modal
  const [pendingAssignments, setPendingAssignments] = useState<
    Record<string, { personId: string; teamId: string }>
  >({});
  const [showDiscardWarning, setShowDiscardWarning] = useState(false);
  const [savingAssignments, setSavingAssignments] = useState(false);

  // Review mode for selective regeneration
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewTeamGroups, setReviewTeamGroups] = useState<
    Array<{
      teamName: string;
      items: Array<{
        id: string;
        name: string;
        quantityAmount: number | null;
        quantityUnit: string | null;
        assignedTo?: string;
        teamName: string;
        isNew?: boolean;
      }>;
    }>
  >([]);

  useEffect(() => {
    // Handle invalid eventId (like "new")
    if (eventId === 'new' || !eventId) {
      setError('Invalid event ID. Please navigate from the demo page or use a valid event link.');
      setLoading(false);
      return;
    }

    loadEvent();
    loadTeams();
    loadDays();
    loadConflicts();
    loadItems();
    loadPeople();
  }, [eventId]);

  // Load invite links when event status is CONFIRMING or later
  useEffect(() => {
    if (event && (event.status === 'CONFIRMING' || isSentJson(event))) {
      loadInviteLinks();
    }
  }, [event?.status]);

  // Sync URL params to expanded section state
  useEffect(() => {
    const expand = searchParams.get('expand');
    if (expand && isValidSectionId(expand)) {
      setExpandedSection(expand as SectionId);
    } else {
      setExpandedSection(null);
    }
  }, [searchParams]);

  // Dismiss invite highlight after host opens the Invite Links modal once
  useEffect(() => {
    if (expandedSection === 'invites') {
      setInviteHighlightSeen(true);
    }
  }, [expandedSection]);

  // Pre-expand a team accordion when navigating from Reassign Items
  useEffect(() => {
    if (expandedSection === 'teams' && initialExpandedTeam) {
      setExpandedTeams(new Set([initialExpandedTeam]));
      // Load items for the pre-expanded team
      if (!teamItems[initialExpandedTeam]) {
        loadTeamItems(initialExpandedTeam);
      }
    }
  }, [expandedSection, initialExpandedTeam]);

  // Execute pending action after expansion modal fully closes
  useEffect(() => {
    if (expandedSection === null && pendingModalAction.current === 'generate') {
      pendingModalAction.current = null;
      setHostDescriptionModalOpen(true);
    }
    if (expandedSection === null && pendingModalAction.current === 'reassign-items') {
      pendingModalAction.current = null;
      handleExpandSection('teams');
    }
  }, [expandedSection]);

  // Show reuse overlay when redirected from "Use this again"
  useEffect(() => {
    if (searchParams.get('fromReuse') === 'true' && event?.clonedFromId) {
      // Fetch source event data for overlay summary
      const fetchSourceData = async () => {
        try {
          const [eventRes, peopleRes] = await Promise.all([
            fetch(`/api/events/${event.clonedFromId}`),
            fetch(`/api/events/${event.clonedFromId}/people`),
          ]);
          const eventData = await eventRes.json();
          const peopleData = await peopleRes.json();
          const sourceEvent = eventData.event;
          const sourcePeople = (peopleData.people || []).filter(
            (p: any) => p.role === 'PARTICIPANT' || p.role === 'COORDINATOR'
          );

          // Get team/item counts from the NEW event (already loaded)
          setReuseOverlaySummary({
            eventName: sourceEvent?.name || event.name,
            guestCount: sourceEvent?.guestCount || null,
            guestNames: sourcePeople.map((p: any) => p.name?.split(' ')[0] || ''),
            teamCount: teams.length,
            itemCount: items.length,
          });
          setShowReuseOverlay(true);
        } catch {
          // If source event fetch fails, still show overlay with available data
          setReuseOverlaySummary({
            eventName: event.name,
            guestCount: null,
            guestNames: [],
            teamCount: teams.length,
            itemCount: items.length,
          });
          setShowReuseOverlay(true);
        }
      };
      fetchSourceData();
      // Remove fromReuse param from URL
      router.replace(`/plan/${eventId}`, { scroll: false });
    }
  }, [event?.clonedFromId, searchParams, teams.length, items.length]);

  // Clean ?setup=true from URL on mount (opening screen state is already captured)
  useEffect(() => {
    if (searchParams.get('setup') === 'true') {
      router.replace(`/plan/${eventId}`, { scroll: false });
    }
  }, [searchParams, eventId, router]);

  // Load checklist dismissed state from localStorage
  useEffect(() => {
    if (eventId && typeof window !== 'undefined') {
      try {
        const dismissed = localStorage.getItem(`gather_checklist_dismissed_${eventId}`);
        setChecklistDismissed(dismissed === 'true');
      } catch (err) {
        // localStorage unavailable, keep banner visible
        console.warn('localStorage unavailable:', err);
      }
    }
  }, [eventId]);

  // Countdown timer for wrap-up dispatch (updates every 30s)
  useEffect(() => {
    if (
      !wrapUpDispatch?.pending ||
      wrapUpDispatch.pending === 0 ||
      !wrapUpDispatch.earliestCreatedAt
    ) {
      setCountdownMinutes(null);
      return;
    }

    const computeMinutes = () => {
      const createdAt = new Date(wrapUpDispatch.earliestCreatedAt!).getTime();
      const dispatchAt = createdAt + 10 * 60 * 1000; // 10-minute delay
      const remaining = Math.ceil((dispatchAt - Date.now()) / 60000);
      setCountdownMinutes(remaining > 0 ? remaining : 0);
    };

    computeMinutes();
    const interval = setInterval(computeMinutes, 30000);
    return () => clearInterval(interval);
  }, [wrapUpDispatch?.pending, wrapUpDispatch?.earliestCreatedAt]);

  const apiHouseholdToSaved = useCallback((h: any): SavedHousehold => {
    const primary = h.members?.find((m: any) => m.householdRole === 'PRIMARY_CONTACT');
    const partnerMember = h.members?.find((m: any) => m.householdRole === 'PARTNER');
    const helperMembers = h.members?.filter((m: any) => m.householdRole === 'CHILD') || [];
    const guestMembers = h.members?.filter((m: any) => m.householdRole === 'GUEST') || [];
    return {
      id: h.id,
      primaryContact: {
        name: primary?.person?.name || 'Unknown',
        email: primary?.person?.email || undefined,
        phone: primary?.person?.phoneNumber || undefined,
      },
      partner: partnerMember
        ? {
            personEventId: partnerMember.id,
            name: partnerMember.person?.name || '',
            email: partnerMember.person?.email || undefined,
            phone: partnerMember.person?.phoneNumber || undefined,
          }
        : undefined,
      helpers: helperMembers.map((m: any) => ({
        personEventId: m.id,
        name: m.person?.name || '',
        email: m.person?.email || undefined,
        phone: m.person?.phoneNumber || undefined,
      })),
      littleCount: h.littleCount || 0,
      guests: guestMembers.map((g: any) => ({
        personEventId: g.id,
        name: g.person?.name || '',
        email: g.person?.email || undefined,
        phone: g.person?.phoneNumber || undefined,
      })),
    };
  }, []);

  // Fetch households when Moment 1 view opens, or when the Moment 2 plan view
  // needs a canonical headcount for its summary header (GTC-136).
  useEffect(() => {
    if (!event) return;
    if (!showMoment1 && !showMoment2PlanView) return;
    const fetchHouseholds = async () => {
      const res = await fetch(`/api/events/${event.id}/households`);
      if (res.ok) {
        const data = await res.json();
        setHouseholds(data.households.map(apiHouseholdToSaved));
      }
    };
    fetchHouseholds();
  }, [showMoment1, showMoment2PlanView, event, apiHouseholdToSaved]);

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) throw new Error('Failed to load event');
      const data = await response.json();
      setEvent(data.event);

      // Save hostId to localStorage for templates page
      if (data.event?.hostId) {
        localStorage.setItem('gather_hostId', data.event.hostId);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTeams = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/teams`);
      if (!response.ok) throw new Error('Failed to load teams');
      const data = await response.json();
      setTeams(data.teams);
    } catch (err: any) {
      console.error('Error loading teams:', err);
    }
  };

  const loadDays = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/days`);
      if (!response.ok) throw new Error('Failed to load days');
      const data = await response.json();
      setDays(data.days || []);
    } catch (err: any) {
      console.error('Error loading days:', err);
      setDays([]); // Set empty array on error
    }
  };

  const loadConflicts = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/conflicts`);
      if (!response.ok) throw new Error('Failed to load conflicts');
      const data = await response.json();
      setConflicts(data.conflicts || []);
    } catch (err: any) {
      console.error('Error loading conflicts:', err);
    }
  };

  const loadItems = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/items`);
      if (!response.ok) throw new Error('Failed to load items');
      const data = await response.json();
      setItems(data.items || []);
    } catch (err: any) {
      console.error('Error loading items:', err);
    }
  };

  const loadMoment2PlanCategories = async (): Promise<Moment2PlanCategory[]> => {
    const [teamsRes, itemsRes] = await Promise.all([
      fetch(`/api/events/${eventId}/teams`),
      fetch(`/api/events/${eventId}/items`),
    ]);
    if (!teamsRes.ok || !itemsRes.ok) {
      throw new Error('Failed to load plan data');
    }
    const teamsData = await teamsRes.json();
    const itemsData = await itemsRes.json();
    return mapTeamsAndItemsToPlanCategories(teamsData.teams ?? [], itemsData.items ?? []);
  };

  const loadPeople = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/people`);
      if (!response.ok) throw new Error('Failed to load people');
      const data = await response.json();
      setPeople(data.people || []);
    } catch (err: any) {
      console.error('Error loading people:', err);
    }
  };

  const loadInviteLinks = async () => {
    try {
      if (!event) return;

      // Use hostId query param for authentication
      // This allows the Plan page to fetch tokens without requiring a stored token
      const response = await fetch(`/api/events/${eventId}/tokens?hostId=${event.hostId}`);

      if (!response.ok) {
        console.error('Failed to load invite links:', response.status);
        setInviteLinksError(true);
        return;
      }

      const data = await response.json();
      setInviteLinksError(false);
      setInviteLinks(data.inviteLinks || []);

      // Also fetch invite status if in CONFIRMING status
      if (event.status === 'CONFIRMING') {
        try {
          const statusResponse = await fetch(
            `/api/events/${eventId}/invite-status?hostId=${event.hostId}`
          );
          if (statusResponse.ok) {
            const statusData = await statusResponse.json();
            const statusMap = new Map<string, any>();
            statusData.people.forEach((p: any) => {
              statusMap.set(p.id, p);
            });
            setPersonStatuses(statusMap);
            setInviteStatusData(statusData); // Store full data for Phase 6 components
          }
        } catch (err) {
          console.error('Error loading invite status:', err);
        }
      }
    } catch (err: any) {
      console.error('Error loading invite links:', err);
    }
  };

  // Section expansion handlers
  const handleExpandSection = (sectionId: SectionId) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('expand', sectionId);
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleCloseExpansion = () => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('expand');
    router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
      scroll: false,
    });
    setModalBreadcrumbTrail([]);
    setPeopleInitialView('table');
    setInitialExpandedTeam(null);
    setExpandedItemCategories(new Set());
    // Refresh dashboard card data after any expansion modal close
    loadItems();
    loadTeams();
    loadPeople();
  };

  // Navigate from a conflict card to the relevant section
  const CONFLICT_TYPE_TO_SECTION: Record<ConflictType, SectionId> = {
    QUANTITY_MISSING: 'items',
    DIETARY_GAP: 'items',
    TIMING: 'items',
    EQUIPMENT_MISMATCH: 'items',
    STRUCTURAL_IMBALANCE: 'people',
    COVERAGE_GAP: 'teams',
    CONSTRAINT_VIOLATION: 'planstatus',
  };

  const handleGoFixIt = (
    _conflictId: string,
    conflictType: ConflictType,
    affectedTeamName?: string
  ) => {
    const section = CONFLICT_TYPE_TO_SECTION[conflictType];
    if (section === 'items' && affectedTeamName) {
      setExpandedItemCategories(new Set([affectedTeamName]));
    }
    handleExpandSection(section);
  };

  // Inter-modal tab navigation handler
  const handleModalTabNavigate = (tabId: ModalTabId, fromTab: ModalTabId) => {
    if (tabId === fromTab) return;

    // Compute new breadcrumb trail
    const newTrail = (() => {
      const prev = modalBreadcrumbTrail.length > 0 ? modalBreadcrumbTrail : [fromTab];
      // If navigating to a tab already in the trail, truncate to it
      const idx = prev.indexOf(tabId);
      if (idx >= 0) return prev.slice(0, idx + 1);
      // Otherwise append the new destination
      return [...prev, tabId];
    })();

    setModalBreadcrumbTrail(newTrail);

    if (tabId === 'details') {
      // Close any expansion modal, open EditEventModal
      const params = new URLSearchParams(searchParams.toString());
      params.delete('expand');
      router.push(params.toString() ? `${pathname}?${params.toString()}` : pathname, {
        scroll: false,
      });
      setEditEventModalOpen(true);
    } else {
      // If coming from EditEventModal, close it
      if (fromTab === 'details') {
        setEditEventModalOpen(false);
      }
      // Navigate to the target section modal
      handleExpandSection(tabId as SectionId);
    }
  };

  // Build a tab bar for a given section
  const buildTabBar = (currentTab: ModalTabId) => {
    if (!event) return undefined;
    return (
      <ModalTabBar
        activeTab={currentTab}
        eventStatus={event.status}
        hiddenTabs={event.setup ? ['history'] : undefined}
        onNavigate={(tabId) => handleModalTabNavigate(tabId, currentTab)}
        onCloseToDashboard={() => {
          if (currentTab === 'details') {
            setEditEventModalOpen(false);
          } else {
            handleCloseExpansion();
          }
          setModalBreadcrumbTrail([]);
        }}
        breadcrumbTrail={
          modalBreadcrumbTrail.length > 0 &&
          modalBreadcrumbTrail[modalBreadcrumbTrail.length - 1] === currentTab
            ? modalBreadcrumbTrail
            : [currentTab]
        }
      />
    );
  };

  const handleGeneratePlan = async (hostDescription?: string) => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          hostDescription: hostDescription || undefined,
        }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          await loadEvent();
          toast.error("You've used all 10 AI calls for this event.");
          return;
        }
        throw new Error('Failed to generate plan');
      }

      // After success, refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);

      // Close any expanded section so the user lands on the full plan page
      handleCloseExpansion();

      toast.success('Plan generated! Demo team and items created.');

      // Reset session dismiss so the next-step CTA appears after fresh generation
      setNextStepDismissed(false);
    } catch (err: any) {
      console.error('Error generating plan:', err);
      toast.error('Failed to generate plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCheckPlan = async () => {
    setIsCheckingPlan(true);
    try {
      const response = await fetch(`/api/events/${eventId}/check`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Check plan error:', errorData);
        throw new Error(errorData.details || 'Failed to check plan');
      }

      // After success, refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);

      toast.success('Plan check complete! See conflicts below.');
    } catch (err: any) {
      console.error('Error checking plan:', err);
      toast.error(`Failed to check plan: ${err.message}`);
    } finally {
      setIsCheckingPlan(false);
    }
  };

  // Auto-recheck conflicts after data-changing actions.
  // Only runs if the host has previously run a manual check.
  // Silent failure — never blocks or toasts on error.
  const autoRecheck = async () => {
    if (!event?.lastCheckPlanAt) return;
    try {
      const checkResponse = await fetch(`/api/events/${eventId}/check`, {
        method: 'POST',
      });
      if (checkResponse.ok) {
        await loadEvent();
        await loadConflicts();
        setGateCheckRefresh((prev) => prev + 1);
      }
    } catch {
      // Silent failure — auto-recheck is best-effort
    }
  };

  const handleRegeneratePlan = async () => {
    // Load all current AI-generated items for selective regeneration
    try {
      setIsRegenerating(true);

      // First, mark all current items as AI-generated and unconfirmed
      // This allows them to show up in the review panel
      const markResponse = await fetch(`/api/events/${eventId}/items/mark-for-review`, {
        method: 'POST',
      });

      if (!markResponse.ok) {
        console.warn('Failed to mark items for review, continuing anyway');
      }

      // Load items for review
      const reviewResponse = await fetch(`/api/events/${eventId}/review-items`);
      if (!reviewResponse.ok) {
        throw new Error('Failed to load items for review');
      }

      const reviewData = await reviewResponse.json();

      if (!reviewData.teamGroups || reviewData.teamGroups.length === 0) {
        toast.warning('No items found to regenerate. Please generate a plan first.');
        setIsRegenerating(false);
        return;
      }

      setReviewTeamGroups(reviewData.teamGroups);
      setReviewMode(true); // Enter review mode
    } catch (err: any) {
      console.error('Error loading items for review:', err);
      toast.error('Failed to load items for regeneration. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleReviewRegenerateSelected = async (keepIds: string[], regenerateIds: string[]) => {
    try {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepItemIds: keepIds,
          regenerateItemIds: regenerateIds,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          await loadEvent();
          toast.error("You've used all 10 AI calls for this event.");
          return;
        }
        throw new Error('Failed to regenerate items');
      }

      await response.json();

      // Reload review items to show ALL items (kept + newly regenerated)
      const reviewResponse = await fetch(`/api/events/${eventId}/review-items`);
      if (reviewResponse.ok) {
        const reviewData = await reviewResponse.json();
        setReviewTeamGroups(reviewData.teamGroups || []);
      }
    } catch (err: any) {
      console.error('Error regenerating items:', err);
      throw err;
    }
  };

  const executeRegenerate = async (options: {
    preserveProtected: boolean;
    modifier: string;
    preGeneratedPlan?: any;
  }) => {
    setRegenerateModalOpen(false);
    setIsRegenerating(true);

    try {
      const response = await fetch(`/api/events/${eventId}/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          preserveProtected: options.preserveProtected,
          modifier: options.modifier || undefined,
          preGeneratedPlan: options.preGeneratedPlan || undefined,
        }),
      });
      if (!response.ok) {
        if (response.status === 429) {
          await loadEvent();
          toast.error("You've used all 10 AI calls for this event.");
          return;
        }
        throw new Error('Failed to regenerate plan');
      }

      // After success, refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);

      await autoRecheck();

      toast.success('Plan regenerated successfully!');
    } catch (err: any) {
      console.error('Error regenerating plan:', err);
      toast.error('Failed to regenerate plan');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleSaveAsTemplate = async (templateName: string) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: event?.hostId,
          eventId: event?.id,
          name: templateName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      await response.json();
      toast.success(`Template "${templateName}" saved successfully!`);

      // Optionally redirect to templates page
      // router.push('/plan/templates');
    } catch (error: any) {
      console.error('Error saving template:', error);
      throw error;
    }
  };

  const handleSaveForNextYear = async () => {
    if (!event) return;
    setSavingForNextYear(true);
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: event.hostId,
          eventId: event.id,
          name: event.name,
        }),
      });

      if (!response.ok) throw new Error('Failed to save');
      setSavedForNextYear(true);
      toast.success("Saved — find it in Past Events when you're ready.");
    } catch (error: any) {
      console.error('Error saving for next year:', error);
      toast.error('Failed to save. Please try again.');
    } finally {
      setSavingForNextYear(false);
    }
  };

  const handleCopyLink = async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link to clipboard');
    }
  };

  const handleCopyDirectoryLink = async () => {
    try {
      const baseUrl = window.location.origin;
      const directoryUrl = `${baseUrl}/gather/${eventId}/directory`;
      await navigator.clipboard.writeText(directoryUrl);
      setCopiedDirectory(true);
      setTimeout(() => setCopiedDirectory(false), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
      toast.error('Failed to copy link to clipboard');
    }
  };

  const handleWrapUp = async (confirmEarly = false) => {
    setWrapUpLoading(true);
    setWrapUpResult(null);
    try {
      const res = await fetch(`/api/events/${eventId}/wrap-up`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmEarly }),
      });
      const data = await res.json();
      setWrapUpResult(data);
      if (data.success) {
        loadEvent();
      }
    } catch {
      setWrapUpResult({ success: false, message: 'Failed to complete event.' });
    } finally {
      setWrapUpLoading(false);
    }
  };

  const loadWrapUpStatus = async () => {
    setWrapUpStatusLoading(true);
    try {
      const res = await fetch(`/api/events/${eventId}/wrap-up/status`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.success) {
        setWrapUpDispatch(data);
      }
    } catch {
      // silent — status is informational
    } finally {
      setWrapUpStatusLoading(false);
    }
  };

  const handleWrapUpRetry = async () => {
    setWrapUpRetrying(true);
    try {
      await fetch(`/api/events/${eventId}/wrap-up/retry`, { method: 'POST' });
      await loadWrapUpStatus();
    } catch {
      // silent
    } finally {
      setWrapUpRetrying(false);
    }
  };

  const handleResetClaim = async (personId: string, personName: string) => {
    if (!confirm(`Reset claim for ${personName}? They will need to claim their name again.`)) {
      return;
    }

    setResettingClaim(personId);
    try {
      const res = await fetch(`/api/events/${eventId}/people/${personId}/reset-claim`, {
        method: 'POST',
      });

      if (res.ok) {
        // Reload invite links to refresh status
        await loadInviteLinks();
        toast.success(`Claim reset for ${personName}. They can now claim their name again.`);
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to reset claim');
      }
    } catch (err) {
      console.error('Failed to reset claim:', err);
      toast.error('Failed to reset claim');
    } finally {
      setResettingClaim(null);
    }
  };

  const handleAddTeam = async (teamData: TeamFormData) => {
    try {
      const response = await fetch(`/api/events/${eventId}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...teamData,
          coordinatorId: event?.hostId, // Host is initial coordinator
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add team');
      }

      // Reload teams and refresh gate check
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
      autoRecheck();
    } catch (error: any) {
      console.error('Error adding team:', error);
      toast.error('Failed to add team');
      throw error;
    }
  };

  const handleAddItem = async (itemData: ItemFormData) => {
    const team = selectedTeamForItem ?? teams.find((t) => t.id === itemData.teamId) ?? null;
    if (!team) return;

    try {
      const response = await fetch(`/api/events/${eventId}/teams/${team.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        throw new Error('Failed to add item');
      }

      // Reload teams, team items, global items list, and refresh gate check
      await loadTeams();
      await loadTeamItems(team.id);
      await loadItems();
      setGateCheckRefresh((prev) => prev + 1);
      autoRecheck();
    } catch (error: any) {
      console.error('Error adding item:', error);
      toast.error('Failed to add item');
      throw error;
    }
  };

  const loadTeamItems = async (teamId: string) => {
    setLoadingTeamItems((prev) => new Set(prev).add(teamId));
    try {
      const response = await fetch(`/api/events/${eventId}/teams/${teamId}/items`);
      if (!response.ok) throw new Error('Failed to load team items');

      const data = await response.json();
      setTeamItems((prev) => ({ ...prev, [teamId]: data.items }));
    } catch (error: any) {
      console.error('Error loading team items:', error);
    } finally {
      setLoadingTeamItems((prev) => {
        const newSet = new Set(prev);
        newSet.delete(teamId);
        return newSet;
      });
    }
  };

  // Stage an assignment change locally (no API call)
  const handleStageAssignment = (
    itemId: string,
    personId: string,
    teamId: string,
    currentPersonId: string
  ) => {
    setPendingAssignments((prev) => {
      const next = { ...prev };
      // If the new value matches the original server state, remove from pending
      if (personId === currentPersonId) {
        delete next[itemId];
      } else {
        next[itemId] = { personId, teamId };
      }
      return next;
    });
  };

  // Save all pending assignments in batch
  const handleSaveAllAssignments = async () => {
    const entries = Object.entries(pendingAssignments);
    if (entries.length === 0) return;

    setSavingAssignments(true);
    try {
      for (const [itemId, { personId }] of entries) {
        if (personId) {
          const response = await fetch(`/api/events/${eventId}/items/${itemId}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ personId }),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to assign item ${itemId}`);
          }
        } else {
          const response = await fetch(`/api/events/${eventId}/items/${itemId}/assign`, {
            method: 'DELETE',
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to unassign item ${itemId}`);
          }
        }
      }

      // Clear pending and reload data
      setPendingAssignments({});
      const affectedTeamIds = new Set(entries.map(([, { teamId }]) => teamId));
      await Promise.all([
        ...Array.from(affectedTeamIds).map((tid) => loadTeamItems(tid)),
        loadTeams(),
        loadItems(),
      ]);
      setGateCheckRefresh((prev) => prev + 1);
      toast.success(`Saved ${entries.length} assignment${entries.length > 1 ? 's' : ''}`);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save assignments');
    } finally {
      setSavingAssignments(false);
    }
  };

  // Teams modal close handler with unsaved changes warning
  const handleTeamsModalClose = () => {
    if (Object.keys(pendingAssignments).length > 0) {
      setShowDiscardWarning(true);
    } else {
      handleCloseExpansion();
    }
  };

  const handleDiscardAndClose = () => {
    setPendingAssignments({});
    setShowDiscardWarning(false);
    handleCloseExpansion();
  };

  const handleStartEditItem = (item: Item) => {
    setEditingItem(item);
  };

  const handleSaveEditItem = async (itemId: string, data: any) => {
    const item = editingItem; // Store reference before clearing
    try {
      const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) throw new Error('Failed to update item');

      // Reload items list (for unexpanded view)
      await loadItems();

      // Reload team items to show updated data (for expanded view)
      if (item?.team?.id) {
        await loadTeamItems(item.team.id);
      }

      // Reload teams to update unassigned count badges
      await loadTeams();

      // Refresh gate check to update coverage indicator
      setGateCheckRefresh((prev) => prev + 1);
      autoRecheck();
    } catch (error: any) {
      console.error('Error updating item:', error);
      toast.error('Failed to update item');
      throw error; // Re-throw to prevent modal from closing
    }
  };

  const handleDeleteItem = async (item: Item) => {
    if (!confirm(`Delete "${item.name}"? This cannot be undone.`)) return;

    try {
      const response = await fetch(`/api/events/${eventId}/items/${item.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete item');

      // Reload team items and teams, refresh gate check
      await loadTeamItems(item.team.id);
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
      autoRecheck();
    } catch (error: any) {
      console.error('Error deleting item:', error);
      toast.error('Failed to delete item');
    }
  };

  const handleDeleteTeam = async (team: Team) => {
    const itemCount = team._count.items;
    const message =
      itemCount > 0
        ? `Delete "${team.name}" and its ${itemCount} item(s)? This cannot be undone.`
        : `Delete "${team.name}"? This cannot be undone.`;

    if (!confirm(message)) return;

    try {
      const response = await fetch(`/api/events/${eventId}/teams/${team.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete team');

      // Remove from expanded teams
      const newExpanded = new Set(expandedTeams);
      newExpanded.delete(team.id);
      setExpandedTeams(newExpanded);

      // Remove from team items
      const newTeamItems = { ...teamItems };
      delete newTeamItems[team.id];
      setTeamItems(newTeamItems);

      // Reload teams and refresh gate check
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
      autoRecheck();
    } catch (error: any) {
      console.error('Error deleting team:', error);
      toast.error('Failed to delete team');
    }
  };

  const handleMovePerson = async (personId: string, newTeamId: string | null) => {
    // Find the person being moved
    const person = people.find((p) => p.personId === personId);
    if (!person) return;

    // Store original state for rollback
    const originalPeople = [...people];

    // Optimistically update local state
    const updatedPeople = people.map((p) =>
      p.personId === personId
        ? {
            ...p,
            team: newTeamId
              ? teams.find((t) => t.id === newTeamId)!
              : { id: '', name: 'Unassigned' },
          }
        : p
    );
    setPeople(updatedPeople);

    try {
      // PATCH to backend
      const response = await fetch(`/api/events/${eventId}/people/${personId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId: newTeamId }),
      });

      if (!response.ok) {
        throw new Error('Failed to update person');
      }

      // Reload people to get fresh data (including itemCount updates)
      await loadPeople();
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
      // Reload invite links if event is in CONFIRMING or later status
      if (event && (event.status === 'CONFIRMING' || isSentJson(event))) {
        loadInviteLinks();
      }
      autoRecheck();
    } catch (error: any) {
      console.error('Error moving person:', error);
      // Revert optimistic update
      setPeople(originalPeople);
      toast.error("Couldn't save. Try again.");
    }
  };

  // Setup checklist handlers
  const handleChecklistOpenEditDetails = () => {
    setChecklistStepContext('Step 2 of 5: Add event details');
    setEditEventModalOpen(true);
  };

  const handleChecklistOpenAddPerson = () => {
    setChecklistStepContext('Step 3 of 5: Add people');
    // Strip `setup` before navigating — if the user arrived via post-payment
    // (?setup=true), window.history.replaceState clears the visible URL but
    // Next.js searchParams still carries setup=true. Carrying it into the
    // expand URL re-triggers the setup effect and opens EditEventModal instead.
    const params = new URLSearchParams(searchParams.toString());
    params.delete('setup');
    params.set('expand', 'people');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const handleChecklistOpenCreatePlan = () => {
    setChecklistStepContext(null);
    // V2 events never enter the V1 generate pipeline — offer manual team
    // creation instead (GTC-149).
    if (teams.length === 0 && !event?.setup) {
      setHostDescriptionModalOpen(true);
    } else {
      setAddTeamModalOpen(true);
    }
  };

  const handleChecklistRunPlanCheck = () => {
    setChecklistStepContext(null);
    handleCheckPlan();
  };

  const handleChecklistDismiss = () => {
    setChecklistDismissed(true);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`gather_checklist_dismissed_${eventId}`, 'true');
      } catch (err) {
        console.warn('Failed to save dismissed state:', err);
      }
    }
  };

  const handleNextStepDismiss = () => {
    setNextStepDismissed(true);
  };

  const handleBannerMoveToConfirming = async () => {
    setTransitionLoading(true);
    try {
      const response = await fetch(`/api/events/${eventId}/gate-check`, { method: 'POST' });
      if (!response.ok) {
        toast.error('Failed to run gate check');
        return;
      }
      const result = await response.json();
      if (result.passed) {
        setShowTransitionModal(true);
      } else {
        // Gate check failed — open the plan status section so user can see blocking issues
        handleExpandSection('planstatus');
        toast.error(`${result.blocks?.length || 0} issue(s) must be resolved before transitioning`);
      }
    } catch {
      toast.error('Failed to run gate check');
    } finally {
      setTransitionLoading(false);
    }
  };

  // Clear checklist step context when modals close
  const handleEditEventModalClose = () => {
    setEditEventModalOpen(false);
    setChecklistStepContext(null);
    setIsPostPayment(false);
    setModalBreadcrumbTrail([]);
  };

  // Setup progress hook
  const setupProgress = useEventSetupProgress({
    event,
    people,
    teams,
    unresolvedConflictCount: conflicts.length,
    onOpenEditDetails: handleChecklistOpenEditDetails,
    onOpenAddPerson: handleChecklistOpenAddPerson,
    onOpenCreatePlan: handleChecklistOpenCreatePlan,
    onRunPlanCheck: handleChecklistRunPlanCheck,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading event...</div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md">
          <h2 className="text-xl font-semibold text-red-600 mb-4">Error</h2>
          <p className="text-gray-700 mb-4">{error || 'Event not found'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  if (showSetup) {
    return (
      <SetupOpeningScreen
        onStart={() => {
          setShowSetup(false);
          setShowMoment1(true);
        }}
      />
    );
  }

  if (showMoment1 && event) {
    // Summary phase
    if (moment1Phase === 'summary') {
      return (
        <Moment1Summary
          eventId={event.id}
          eventName={event.name}
          households={households}
          onContinue={() => {
            setShowMoment1(false);
            setMoment1Phase('input');
            setShowMoment2Opening(true);
          }}
          onBackToEditing={() => {
            setMoment1Phase('input');
          }}
        />
      );
    }

    // Input phase
    const handleAddHousehold = async (person: Moment1PersonInput) => {
      const res = await fetch(`/api/events/${event.id}/households`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add household');
      }
      const data = await res.json();
      const saved = apiHouseholdToSaved(data.household);
      setHouseholds((prev) => [...prev, saved]);

      // On mobile, scroll form back into view
      if (window.innerWidth < 768) {
        setTimeout(() => {
          moment1FormRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
      }
    };

    const handleEditSave = async (householdId: string, person: Moment1PersonInput) => {
      const res = await fetch(`/api/events/${event.id}/households/${householdId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(person),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to update household');
      }
      const data = await res.json();
      const saved = apiHouseholdToSaved(data.household);
      setHouseholds((prev) => prev.map((h) => (h.id === householdId ? saved : h)));
      setEditingHousehold(null);
    };

    const handleDeleteHousehold = async (householdId: string) => {
      const res = await fetch(`/api/events/${event.id}/households/${householdId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete household');
      }
      setHouseholds((prev) => prev.filter((h) => h.id !== householdId));
    };

    const handleEdit = (householdId: string) => {
      const household = households.find((h) => h.id === householdId);
      if (household) {
        setEditingHousehold(household);
        // On mobile, scroll to form
        if (window.innerWidth < 768) {
          setTimeout(() => {
            moment1FormRef.current?.scrollIntoView({ behavior: 'smooth' });
          }, 100);
        }
      }
    };

    const totalPeopleCount = households.reduce((sum, h) => {
      return sum + 1 + (h.partner ? 1 : 0) + h.helpers.length + h.littleCount + h.guests.length;
    }, 0);

    return (
      <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col md:flex-row md:gap-8">
            {/* Mobile: cards above form */}
            <div className="md:hidden mb-6">
              <HouseholdCardList
                households={households}
                onEdit={handleEdit}
                onDelete={handleDeleteHousehold}
                editingHouseholdId={editingHousehold?.id}
              />
            </div>

            {/* Left column: input form */}
            <div ref={moment1FormRef} className="flex-1 min-w-0">
              <Moment1InputForm
                eventId={event.id}
                eventName={event.name}
                onComplete={() => {
                  setMoment1Phase('summary');
                  setEditingHousehold(null);
                }}
                onAddPerson={handleAddHousehold}
                editingHousehold={editingHousehold}
                onEditSave={handleEditSave}
                onCancelEdit={() => setEditingHousehold(null)}
                totalPeopleCount={totalPeopleCount}
              />
            </div>

            {/* Right column: card list (desktop only) */}
            <div className="hidden md:block w-80 flex-shrink-0">
              <div className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto">
                <HouseholdCardList
                  households={households}
                  onEdit={handleEdit}
                  onDelete={handleDeleteHousehold}
                  editingHouseholdId={editingHousehold?.id}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showMoment2PlanView && event) {
    // Canonical headcount: aggregate from households using the same formula as
    // Moment1Summary ("X people coming"). Fall back to event.guestCount only if
    // households aren't loaded yet. (GTC-136)
    const householdsHeadcount = households.reduce(
      (sum, h) =>
        sum + 1 + (h.partner ? 1 : 0) + h.helpers.length + h.littleCount + h.guests.length,
      0
    );
    const planGuestCount = householdsHeadcount > 0 ? householdsHeadcount : (event.guestCount ?? 0);
    return (
      <Moment2PlanView
        eventId={event.id}
        eventName={event.name}
        guestCount={planGuestCount}
        categories={moment2PlanCategories}
        onUpdateItem={async (itemId, updates) => {
          const body: Record<string, unknown> = {};
          if (updates.name !== undefined) body.name = updates.name;
          if (updates.quantity !== undefined) body.quantityAmount = updates.quantity;
          if (updates.unit !== undefined) {
            body.quantityUnit = 'CUSTOM';
            body.quantityUnitCustom = updates.unit;
          }
          if (updates.servingSize !== undefined) body.quantityText = updates.servingSize;
          if (updates.notes !== undefined) body.notes = updates.notes;
          const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) throw new Error('Failed to update item');
          // Patch local state instead of full reload for snappy UX.
          setMoment2PlanCategories((prev) =>
            prev.map((cat) => ({
              ...cat,
              items: cat.items.map((it) =>
                it.id === itemId
                  ? {
                      ...it,
                      ...(updates.name !== undefined ? { name: updates.name } : {}),
                      ...(updates.quantity !== undefined ? { quantity: updates.quantity } : {}),
                      ...(updates.unit !== undefined ? { unit: updates.unit } : {}),
                      ...(updates.servingSize !== undefined
                        ? { servingSize: updates.servingSize }
                        : {}),
                      ...(updates.notes !== undefined ? { notes: updates.notes } : {}),
                    }
                  : it
              ),
            }))
          );
        }}
        onRemoveItem={async (itemId) => {
          const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {
            method: 'DELETE',
          });
          if (!res.ok) throw new Error('Failed to remove item');
          setMoment2PlanCategories((prev) =>
            prev.map((cat) => ({
              ...cat,
              items: cat.items.filter((it) => it.id !== itemId),
            }))
          );
        }}
        onAddItem={async (categoryId, newItem) => {
          const res = await fetch(`/api/events/${eventId}/teams/${categoryId}/items`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: newItem.name,
              quantityAmount: newItem.quantity,
              quantityUnit: 'CUSTOM',
              quantityUnitCustom: newItem.unit,
              quantityText: newItem.servingSize || undefined,
              description: newItem.notes,
            }),
          });
          if (!res.ok) throw new Error('Failed to add item');
          const data = await res.json();
          const createdItem = data.item as {
            id: string;
            name: string;
            quantityAmount: number | null;
            quantityUnitCustom: string | null;
            quantityText: string | null;
            notes: string | null;
            displayOrder: number | null;
          };
          const appended: Moment2PlanItem = {
            id: createdItem.id,
            name: createdItem.name,
            quantity: createdItem.quantityAmount ?? newItem.quantity,
            unit: createdItem.quantityUnitCustom ?? newItem.unit,
            servingSize: createdItem.quantityText ?? newItem.servingSize,
            displayOrder: createdItem.displayOrder ?? undefined,
            notes: createdItem.notes ?? newItem.notes,
          };
          setMoment2PlanCategories((prev) =>
            prev.map((cat) =>
              cat.id === categoryId ? { ...cat, items: [...cat.items, appended] } : cat
            )
          );
        }}
        onAddCategory={async (name) => {
          const res = await fetch(`/api/events/${eventId}/teams`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name,
              coordinatorId: event.hostId,
            }),
          });
          if (!res.ok) throw new Error('Failed to add category');
          const data = await res.json();
          const createdTeam = data.team as { id: string; name: string };
          setMoment2PlanCategories((prev) => [
            ...prev,
            {
              id: createdTeam.id,
              name: createdTeam.name,
              emoji: emojiForCategoryName(createdTeam.name),
              items: [],
            },
          ]);
        }}
        onApprove={async () => {
          await loadEvent();
          await loadTeams();
          await loadItems();
          await loadConflicts();
          setGateCheckRefresh((prev) => prev + 1);
          setShowMoment2PlanView(false);
          setMoment2PlanCategories([]);
          setMoment2Plan(null);
          setNextStepDismissed(false);
          toast.success('Plan approved.');
        }}
        onBack={() => {
          setShowMoment2PlanView(false);
          setMoment2PlanCategories([]);
          setShowMoment2Step1(true);
        }}
      />
    );
  }

  if (showMoment2Step2Skeleton && event) {
    return (
      <Moment2Step2Skeleton
        eventName={event.name}
        plan={moment2Plan}
        onReady={async () => {
          try {
            const categories = await loadMoment2PlanCategories();
            setMoment2PlanCategories(categories);
            setShowMoment2Step2Skeleton(false);
            setShowMoment2PlanView(true);
          } catch (err) {
            console.error('Failed to load plan for editing:', err);
            toast.error('Failed to load plan. Please try again.');
          }
        }}
        onApprove={async () => {
          // Fallback path (unused when onReady auto-transitions): refresh and exit.
          await loadEvent();
          await loadTeams();
          await loadItems();
          await loadConflicts();
          setGateCheckRefresh((prev) => prev + 1);
          setShowMoment2Step2Skeleton(false);
          setMoment2Plan(null);
          setNextStepDismissed(false);
          toast.success('Plan approved.');
        }}
      />
    );
  }

  if (showMoment2Step1 && event) {
    return (
      <Moment2Step1Modal
        eventId={event.id}
        eventName={event.name}
        onGenerate={async () => {
          setShowMoment2Step1(false);
          setShowMoment2Step2Skeleton(true);
          setMoment2Plan(null);

          // Call finalize-plan endpoint
          try {
            const res = await fetch(`/api/events/${eventId}/finalize-plan`, {
              method: 'POST',
            });
            if (res.status === 429) {
              await loadEvent();
              toast.error("You've used all 10 AI calls for this event.");
              setShowMoment2Step2Skeleton(false);
              return;
            }
            if (!res.ok) {
              throw new Error('Failed to finalize plan');
            }
            const data = await res.json();
            setMoment2Plan(data.plan);
          } catch {
            toast.error('Failed to generate plan. Please try again.');
            setShowMoment2Step2Skeleton(false);
          }
        }}
        onCancel={() => {
          setShowMoment2Step1(false);
          setShowMoment2Opening(true);
        }}
      />
    );
  }

  if (showMoment2Opening && event) {
    return (
      <Moment2Opening
        eventName={event.name}
        onStart={() => {
          setShowMoment2Opening(false);
          setShowMoment2Step1(true);
        }}
      />
    );
  }

  return (
    <ModalProvider>
      <div className="min-h-screen bg-gray-50">
        {/* Demo back-link */}
        {event.isDemo && (
          <div className="bg-indigo-50 border-b border-indigo-100">
            <div className="max-w-7xl mx-auto px-4 py-2">
              <a href="/demo" className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">
                ← Back to Demo
              </a>
            </div>
          </div>
        )}
        {/* Header */}
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 py-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold text-gray-900">{event.name}</h1>
                <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                  <span className="px-2 py-1 bg-sage-100 text-sage-800 rounded">
                    {event.status}
                  </span>
                  <span>{event.occasionType}</span>
                  {event.guestCount && <span>{event.guestCount} guests</span>}
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    // Find the HOST token from invite links
                    const hostLink = inviteLinks.find((link) => link.scope === 'HOST');
                    if (hostLink) {
                      window.open(`/h/${hostLink.token}?expand=all`, '_blank');
                    } else if (event.status === 'DRAFT') {
                      toast.warning(
                        'Host view is not available yet. Please transition to CONFIRMING status first.'
                      );
                    } else {
                      toast.error('Host link unavailable — try refreshing the page.');
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  View as Host
                </button>
                {inviteLinksError && (
                  <span className="self-center text-sm text-red-600">
                    Failed to load host link — try refreshing.
                  </span>
                )}
                {/* V1 generate entry — hidden on V2 events (GTC-149) */}
                {!event.setup && event.status === 'DRAFT' && teams.length === 0 && (
                  <button
                    onClick={() => setHostDescriptionModalOpen(true)}
                    disabled={isGenerating || event.aiCallsUsed >= 10}
                    className={`px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2 ${
                      isGenerating || event.aiCallsUsed >= 10
                        ? 'disabled:opacity-50 disabled:cursor-not-allowed opacity-50 cursor-not-allowed'
                        : ''
                    }`}
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Generating with AI...
                      </>
                    ) : (
                      'Generate Plan'
                    )}
                  </button>
                )}
                {/* V2 events (EventSetup present) must not expose the V1 regenerate
                    pipeline — it reads different persistence and different prompts
                    than the plan was generated with (GTC-148). */}
                {!event.isDemo &&
                  !event.setup &&
                  (event.status === 'DRAFT' || event.status === 'CONFIRMING') &&
                  teams.length > 0 && (
                    <button
                      onClick={handleRegeneratePlan}
                      disabled={isRegenerating || event.aiCallsUsed >= 10}
                      className={`px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2 ${
                        isRegenerating || event.aiCallsUsed >= 10
                          ? 'disabled:opacity-50 disabled:cursor-not-allowed opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      {isRegenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Regenerating with AI...
                        </>
                      ) : (
                        'Regenerate Plan'
                      )}
                    </button>
                  )}
                {/* AI call cap warning / exhausted message */}
                {event.aiCallsUsed >= 10 && (
                  <span className="self-center text-sm text-red-600 font-medium">
                    You've used all 10 AI calls for this event.
                  </span>
                )}
                {event.aiCallsUsed >= 7 && event.aiCallsUsed < 10 && (
                  <span className="self-center text-sm text-amber-600">
                    Your event includes 10 AI calls. You have {10 - event.aiCallsUsed} remaining.
                  </span>
                )}
                {(event.status === 'CONFIRMING' || isSentJson(event)) && (
                  <button
                    onClick={() => setSaveTemplateModalOpen(true)}
                    className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2"
                  >
                    <Save className="w-4 h-4" />
                    Save as Template
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Event Stage Progress - Hide when checklist is visible */}
          {!(event.status === 'DRAFT' && !checklistDismissed) && (
            <EventStageProgress
              currentStatus={event.status as any}
              onSendClick={() => handleExpandSection('planstatus')}
            />
          )}

          {/* Setup Checklist Banner - Only show in DRAFT status and not dismissed */}
          {event.status === 'DRAFT' && !checklistDismissed && (
            <SetupChecklistBanner
              progress={setupProgress}
              onDismiss={handleChecklistDismiss}
              onMoveToConfirming={handleBannerMoveToConfirming}
              transitionLoading={transitionLoading}
            />
          )}

          {/* AI Generation Loading Banner */}
          {(isGenerating || isRegenerating) && (
            <div className="bg-sage-50 border-2 border-sage-200 rounded-lg p-4 mb-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />
                <div>
                  <p className="text-sage-900 font-medium">
                    🤖 Claude is {isGenerating ? 'creating' : 'adjusting'} your plan...
                  </p>
                  <p className="text-sage-700 text-sm mt-1">
                    This usually takes 15-20 seconds. Please wait.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Next Step CTA — shown when unassigned items exist, session-dismissible */}
          {!nextStepDismissed &&
            !isGenerating &&
            !isRegenerating &&
            teams.length > 0 &&
            items.length > 0 &&
            items.some((i) => !i.assignment) && (
              <NextStepBanner
                onStartAssigning={() => {
                  setPeopleInitialView('board');
                  handleExpandSection('people');
                }}
                onDismiss={handleNextStepDismiss}
              />
            )}

          {/* Review Mode - Selective Regeneration */}
          {reviewMode ? (
            <div className="mb-8">
              <div className="mb-4">
                <button
                  onClick={() => setReviewMode(false)}
                  className="text-sage-600 hover:text-sage-700 flex items-center gap-2"
                >
                  ← Back to Plan View
                </button>
              </div>
              <GenerationReviewPanel
                teamGroups={reviewTeamGroups}
                eventId={eventId}
                onRegenerateSelected={handleReviewRegenerateSelected}
              />
            </div>
          ) : (
            <>
              {/* Card Grid */}
              <div className="relative">
                {isGenerating && (
                  <div
                    className="absolute inset-0 bg-white/60 rounded-lg z-10"
                    style={{ cursor: 'wait', pointerEvents: 'all' }}
                  />
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {/* THE THRESHOLD SCRIPT — Hinge §2's two sentences, verbatim.
                      "What the threshold says — the complete script, two sentences."
                      Sentence 2 is deliberate in what it OMITS: it leads with what
                      she'll watch and never mentions chasing, because behaviours seen
                      in advance are pre-worry material. Do not add a third sentence. */}
                  {isSentJson(event) && !isCompleteJson(event) && (
                    <div className="bg-gradient-to-br from-sage-50 to-white rounded-lg shadow-md p-6 h-64 flex flex-col border-2 border-sage-200">
                      <div className="flex items-center gap-4 mb-4">
                        <div className="w-14 h-14 bg-sage-100 rounded-full flex items-center justify-center ring-4 ring-sage-200/50">
                          <CheckCircle className="w-8 h-8 text-sage-600" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">It&apos;s away</h2>
                      </div>
                      <div className="flex-1 space-y-3">
                        <p className="text-sm text-gray-700 leading-relaxed">
                          You can still change anything — I&apos;ll just keep the history.
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                          You&apos;ll start to see replies coming in. I&apos;ll track them and flag
                          anything that needs you.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* GTC-197 (A3c): the "Plan Frozen" card is DELETED. There is no freeze
                      to announce, and its only affordance was "Click to unfreeze" —
                      which Hinge §2 rules out at the mechanism level. What replaces it
                      is the threshold script below, shown once the plan is sent. */}

                  {/* Wrap-up card. Shown once the plan is sent; the calendar decides
                      whether the event is past (Moment 4 §10.1), so nothing here offers
                      a "mark complete" action — there is nothing to declare. */}
                  {isSentJson(event) && (
                    <div
                      onClick={() => handleExpandSection('wrapup')}
                      className={`bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group ${
                        isCompleteJson(event)
                          ? 'border-2 border-green-300'
                          : 'border-2 border-accent/30'
                      }`}
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div
                          className={`w-12 h-12 rounded-lg flex items-center justify-center group-hover:opacity-80 transition-colors ${
                            isCompleteJson(event) ? 'bg-green-100' : 'bg-accent-light/20'
                          }`}
                        >
                          <Gift
                            className={`w-6 h-6 ${isCompleteJson(event) ? 'text-green-600' : 'text-accent'}`}
                          />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {isCompleteJson(event) ? 'Event past' : 'Wrap up'}
                        </h2>
                      </div>
                      <div className="flex-1">
                        {isCompleteJson(event) ? (
                          <p className="text-sm text-gray-600">
                            Thank-you messages sent. Click to view dispatch status.
                          </p>
                        ) : (
                          <p className="text-sm text-gray-600">
                            Send a thank-you to your guests and close the event.
                          </p>
                        )}
                      </div>
                      <div
                        className={`text-sm font-medium ${
                          isCompleteJson(event) ? 'text-green-600' : 'text-accent'
                        }`}
                      >
                        {isCompleteJson(event) ? 'View status →' : 'Send thank-yous →'}
                      </div>
                    </div>
                  )}

                  {/* Event Details Card */}
                  <div
                    onClick={() => setEditEventModalOpen(true)}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <Calendar className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Event Details</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-2">
                        <span className="font-medium">{event.occasionType}</span>
                      </p>
                      <p className="text-sm text-gray-600">{event.guestCount} guests</p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(event.startDate).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to edit →</div>
                  </div>

                  {/* People Card */}
                  <div
                    onClick={() => handleExpandSection('people')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <Users className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">People</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-3xl font-bold text-gray-900 mb-2">{people.length}</p>
                      <p className="text-sm text-gray-600">
                        {people.filter((p) => p.role === 'COORDINATOR').length} coordinators,{' '}
                        {people.filter((p) => p.role === 'PARTICIPANT').length} participants
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>

                  {/* Items & Quantities Card */}
                  <div
                    onClick={() => handleExpandSection('items')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <Package className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Items & Quantities</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-3xl font-bold text-gray-900 mb-2">{items.length}</p>
                      <p className="text-sm text-gray-600">
                        {items.filter((i) => !i.assignment).length} unassigned
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>

                  {/* Teams Card */}
                  <div
                    onClick={() => handleExpandSection('teams')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <Users className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Teams</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-3xl font-bold text-gray-900 mb-2">{teams.length}</p>
                      <p className="text-sm text-gray-600">
                        {teams.reduce((sum, team) => sum + team._count.items, 0)} total items
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>

                  {/* Plan Status Card — merged Plan Assessment + Gate Check + Freeze Check */}
                  <div
                    onClick={() => handleExpandSection('planstatus')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <AlertCircle className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Plan Status</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-3xl font-bold text-gray-900 mb-2">{conflicts.length}</p>
                      <p className="text-sm text-gray-600">
                        {conflicts.length === 0
                          ? '0 conflicts'
                          : `${conflicts.length} conflict${conflicts.length > 1 ? 's' : ''}`}
                        {' · '}
                        {isCompleteJson(event)
                          ? 'Event past'
                          : isSentJson(event)
                            ? 'Sent'
                            : `${items.filter((i) => !i.assignment).length} unassigned`}
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>

                  {/* Invite Links Card */}
                  {(event.status === 'CONFIRMING' || isSentJson(event)) &&
                    inviteLinks.length > 0 && (
                      <div
                        onClick={() => handleExpandSection('invites')}
                        className={`bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group ${
                          event.status === 'CONFIRMING' && !inviteHighlightSeen
                            ? 'border-2 border-blue-400 ring-2 ring-blue-100'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                            <LinkIcon className="w-6 h-6 text-accent" />
                          </div>
                          <h2 className="text-xl font-semibold text-gray-900">Invite Links</h2>
                        </div>
                        <div className="flex-1">
                          <p className="text-3xl font-bold text-gray-900 mb-2">
                            {inviteLinks.length}
                          </p>
                          <p className="text-sm text-gray-600">Personalized links ready to share</p>
                        </div>
                        <div className="text-sm text-accent font-medium">Click to expand →</div>
                      </div>
                    )}

                  {/* Revision History Card — V1-shape snapshot/restore system,
                      hidden on V2 events (GTC-149) */}
                  {!event.setup && (
                    <div
                      onClick={() => handleExpandSection('history')}
                      className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                    >
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                          <Clock className="w-6 h-6 text-accent" />
                        </div>
                        <h2 className="text-xl font-semibold text-gray-900">Revision History</h2>
                      </div>
                      <div className="flex-1">
                        <p className="text-sm text-gray-600">View all changes and updates</p>
                      </div>
                      <div className="text-sm text-accent font-medium">Click to expand →</div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Hidden sections for modal expansion - all original components kept but hidden */}
        <div className="hidden">
          <ConflictList
            eventId={eventId}
            hostId={event?.hostId ?? ''}
            conflicts={conflicts}
            onConflictsChanged={() => {
              loadConflicts();
              setGateCheckRefresh((prev) => prev + 1);
            }}
            hasRunCheck={!!event.lastCheckPlanAt}
            isCheckingPlan={isCheckingPlan}
            onGoFixIt={handleGoFixIt}
          />
          <PeopleSection
            eventId={eventId}
            hostId={event?.hostId}
            teams={teams}
            people={people}
            onPeopleChanged={() => {
              loadPeople();
              loadTeams();
              setGateCheckRefresh((prev) => prev + 1);
              if (event && (event.status === 'CONFIRMING' || isSentJson(event))) {
                loadInviteLinks();
              }
              autoRecheck();
            }}
            onMovePerson={handleMovePerson}
            onExpand={() => handleExpandSection('people')}
            onGeneratePlan={event?.setup ? undefined : () => setHostDescriptionModalOpen(true)}
            stepLabel={undefined}
          />
          <GateCheck
            eventId={eventId}
            refreshTrigger={gateCheckRefresh}
            onTransitionComplete={() => {
              loadEvent();
              loadTeams();
              loadConflicts();
            }}
            onExpand={() => handleExpandSection('planstatus')}
          />
          <FreezeCheck
            eventId={eventId}
            currentStatus={event?.status as any}
            refreshTrigger={gateCheckRefresh}
            onFreezeComplete={() => {
              loadEvent();
              loadTeams();
            }}
            onExpand={() => handleExpandSection('planstatus')}
          />
          {/* V1-shape snapshot/restore system — hidden on V2 events (GTC-149) */}
          {!event?.setup && (
            <RevisionHistory
              eventId={eventId}
              actorId={event?.hostId ?? ''}
              onExpand={() => handleExpandSection('history')}
            />
          )}
        </div>

        {/* Save Template Modal */}
        {event && (
          <SaveTemplateModal
            isOpen={saveTemplateModalOpen}
            onClose={() => setSaveTemplateModalOpen(false)}
            onSave={handleSaveAsTemplate}
            eventName={event.name}
            teamCount={teams.length}
            itemCount={teams.reduce((sum, team) => sum + team._count.items, 0)}
            occasionType={event.occasionType || 'OTHER'}
          />
        )}

        {/* Add Team Modal */}
        <AddTeamModal
          isOpen={addTeamModalOpen}
          onClose={() => setAddTeamModalOpen(false)}
          onAdd={handleAddTeam}
        />

        {/* Add Item Modal */}
        <AddItemModal
          isOpen={addItemModalOpen}
          onClose={() => {
            setAddItemModalOpen(false);
            setSelectedTeamForItem(null);
          }}
          onAdd={handleAddItem}
          teamName={selectedTeamForItem?.name}
          teams={!selectedTeamForItem ? teams : undefined}
          days={days}
        />

        {/* Edit Item Modal */}
        <EditItemModal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveEditItem}
          eventStatus={event?.status}
          item={editingItem}
          days={days}
          eventId={eventId}
          people={people}
        />

        {/* Regenerate Modal */}
        <RegenerateModal
          isOpen={regenerateModalOpen}
          onClose={() => setRegenerateModalOpen(false)}
          onRegenerate={executeRegenerate}
          manualTeamCount={manualTeamCount}
          manualItemCount={manualItemCount}
          eventId={eventId}
          isSent={event ? isSentJson(event) : false}
        />

        {/* Host Description Modal — choke point for every V1 generate entry;
            never opens on V2 events regardless of caller (GTC-149) */}
        <HostDescriptionModal
          isOpen={hostDescriptionModalOpen && !event?.setup}
          onClose={() => setHostDescriptionModalOpen(false)}
          onGenerate={handleGeneratePlan}
          onSkip={() => handleGeneratePlan()}
          eventLoading={loading}
          eventContext={
            event
              ? {
                  occasionType: event.occasionType,
                  guestCount: event.guestCount,
                  startDate: event.startDate,
                  venueName: event.venueName,
                  venueKitchenAccess: event.venueKitchenAccess,
                  dietaryGlutenFree: event.dietaryGlutenFree,
                  dietaryDairyFree: event.dietaryDairyFree,
                  dietaryVegetarian: event.dietaryVegetarian,
                  dietaryVegan: event.dietaryVegan,
                  dietaryAllergies: event.dietaryAllergies,
                }
              : undefined
          }
        />

        {/* Transition Modal — DRAFT → CONFIRMING (rendered at page level, not inside hidden div) */}
        {showTransitionModal && (
          <TransitionModal
            eventId={eventId}
            onClose={() => setShowTransitionModal(false)}
            onSuccess={() => {
              setShowTransitionModal(false);
              loadEvent();
              loadTeams();
              loadConflicts();
              toast.success('Event moved to CONFIRMING — invites are ready to send!');
            }}
            onGoToAssign={() => {
              setShowTransitionModal(false);
              handleExpandSection('teams');
            }}
          />
        )}

        {/* Edit Event Modal */}
        {event && (
          <EditEventModal
            isOpen={editEventModalOpen}
            onClose={handleEditEventModalClose}
            onSave={() => {
              loadEvent();
              handleEditEventModalClose();
            }}
            event={event}
            eventId={eventId}
            stepLabel={checklistStepContext || undefined}
            showPaymentConfirmation={isPostPayment}
            tabBar={buildTabBar('details')}
            isSent={event ? isSentJson(event) : false}
          />
        )}

        {/* Section Expansion Modals */}

        {/* Plan Status Expansion — merged Plan Assessment + Gate Check + Freeze Check */}
        <SectionExpandModal
          isOpen={expandedSection === 'planstatus' || expandedSection === 'assessment'}
          onClose={handleCloseExpansion}
          title="Plan Status"
          icon={<AlertCircle className="w-6 h-6" />}
          tabBar={buildTabBar('planstatus')}
        >
          {/* Conflicts section — always visible */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Conflicts</h3>
            {items.length === 0 && teams.length === 0 ? (
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 max-w-md mx-auto">
                <div className="text-center">
                  <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
                    <AlertCircle className="w-6 h-6 text-gray-400" />
                  </div>
                  <p className="text-lg font-semibold text-gray-900 mb-1">No plan yet</p>
                  <p className="text-sm text-gray-500 mb-4">
                    Generate a plan to check for conflicts
                  </p>
                  {event?.status === 'DRAFT' && !event?.setup && (
                    <button
                      onClick={() => {
                        pendingModalAction.current = 'generate';
                        handleCloseExpansion();
                      }}
                      className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-dark transition-colors inline-flex items-center gap-1.5"
                    >
                      Generate Plan
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <ConflictList
                eventId={eventId}
                hostId={event?.hostId ?? ''}
                conflicts={conflicts}
                onConflictsChanged={() => {
                  loadConflicts();
                  setGateCheckRefresh((prev) => prev + 1);
                }}
                hasRunCheck={!!event.lastCheckPlanAt}
                onCheckPlan={handleCheckPlan}
                isCheckingPlan={isCheckingPlan}
                onGoFixIt={handleGoFixIt}
              />
            )}
          </div>

          {/* Send readiness — a hunt for absence, not a verdict. Hinge §1: "Gather
              sweeps for gaps, and each 'no holes here' is weight down." Warnings only;
              nothing here can block, and nothing scores her (Moment 4 §2). */}
          {event && event.status === 'CONFIRMING' && !isSentJson(event) && (
            <div className="border-t border-gray-200 pt-8">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Before you send</h3>
              <FreezeCheck
                eventId={eventId}
                currentStatus={event?.status as any}
                refreshTrigger={gateCheckRefresh}
                onFreezeComplete={() => {
                  handleCloseExpansion();
                  loadEvent();
                  loadTeams();
                }}
              />
            </div>
          )}
        </SectionExpandModal>

        {/* Items & Quantities Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'items'}
          onClose={handleCloseExpansion}
          title="Items & Quantities"
          icon={<Package className="w-6 h-6" />}
          tabBar={buildTabBar('items')}
          headerActions={
            <div className="flex items-center gap-2">
              {items.length > 0 && (
                <button
                  onClick={() => {
                    const printWindow = window.open('', '_blank');
                    if (!printWindow) return;

                    // Build sorted categories matching accordion order
                    const grouped = items.reduce<Record<string, Item[]>>((acc, item) => {
                      const key = item.team.name;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(item);
                      return acc;
                    }, {});
                    const hasOrder = items.some((i) => i.team.displayOrder > 0);
                    const cats = Object.keys(grouped).sort((a, b) => {
                      if (hasOrder) {
                        const oA = grouped[a][0]?.team.displayOrder ?? 0;
                        const oB = grouped[b][0]?.team.displayOrder ?? 0;
                        if (oA !== oB) return oA - oB;
                      }
                      return a.localeCompare(b);
                    });

                    const eventName = event?.name || 'Event';
                    const eventDate = event?.startDate
                      ? new Date(event.startDate).toLocaleDateString('en-NZ', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric',
                        })
                      : '';

                    const gatherLogo = `<svg viewBox="0 0 240 40" fill="none" xmlns="http://www.w3.org/2000/svg" style="height:32px;width:auto;"><circle cx="7" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="7" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="15" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="31" cy="15" r="2.5" fill="rgba(107,124,111,0.3)"/><circle cx="7" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="23" r="2.5" fill="#6b7c6f"/><circle cx="7" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="15" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="23" cy="31" r="2.5" fill="#6b7c6f"/><circle cx="31" cy="31" r="2.5" fill="#6b7c6f"/><text x="56" y="29" fill="#6b7c6f" style="font-family:'Source Serif 4',Georgia,serif;font-size:28px;font-weight:400;letter-spacing:-0.01em;">Gather</text></svg>`;

                    let html = `<!DOCTYPE html><html><head><title>${eventName} — Items</title>
                      <style>
                        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 800px; margin: 0 auto; padding: 24px; color: #111; }
                        .logo { margin-bottom: 16px; }
                        h1 { font-size: 20px; margin-bottom: 2px; }
                        .date { font-size: 14px; color: #666; margin-bottom: 24px; }
                        h2 { font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-top: 20px; }
                        table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
                        th, td { text-align: left; padding: 6px 8px; font-size: 13px; border-bottom: 1px solid #eee; }
                        th { font-weight: 600; color: #555; font-size: 11px; text-transform: uppercase; }
                        .qty { color: #555; }
                        .status-confirmed { color: #16a34a; }
                        .status-declined { color: #dc2626; }
                        .status-pending { color: #d97706; }
                        .status-unassigned { color: #999; font-style: italic; }
                        @media print { body { padding: 0; } .logo svg text { fill: #333; } }
                      </style></head><body>`;
                    html += `<div class="logo">${gatherLogo}</div>`;
                    html += `<h1>${eventName}</h1>`;
                    if (eventDate) html += `<div class="date">${eventDate}</div>`;

                    for (const cat of cats) {
                      const catItems = grouped[cat];
                      html += `<h2>${cat}</h2><table><thead><tr><th>Item</th><th>Qty</th><th>Assigned To</th><th>Status</th></tr></thead><tbody>`;
                      for (const item of catItems) {
                        const qty =
                          item.quantityAmount && item.quantityUnit
                            ? `${item.quantityAmount} ${item.quantityUnit}`
                            : item.quantityText || '—';
                        const assignee =
                          item.assignment?.person?.name ||
                          '<span class="status-unassigned">Unassigned</span>';
                        const status = item.assignment
                          ? `<span class="status-${item.assignment.response === 'ACCEPTED' ? 'confirmed' : item.assignment.response === 'DECLINED' ? 'declined' : 'pending'}">${item.assignment.response === 'ACCEPTED' ? 'Confirmed' : item.assignment.response === 'DECLINED' ? 'Declined' : 'Pending'}</span>`
                          : '';
                        html += `<tr><td>${item.name}</td><td class="qty">${qty}</td><td>${assignee}</td><td>${status}</td></tr>`;
                      }
                      html += `</tbody></table>`;
                    }

                    html += `</body></html>`;
                    printWindow.document.write(html);
                    printWindow.document.close();
                    printWindow.print();
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              )}
              {event?.status === 'DRAFT' && (
                <button
                  onClick={() => {
                    setSelectedTeamForItem(null);
                    setAddItemModalOpen(true);
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition"
                >
                  <Plus className="w-4 h-4" />
                  Add Item
                </button>
              )}
            </div>
          }
        >
          {items.length === 0 ? (
            <div className="text-center py-16">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-6">
                No items yet. Generate a plan or add items manually.
              </p>
              <div className="flex items-center justify-center gap-3">
                {event?.status === 'DRAFT' && !event?.setup && (
                  <button
                    onClick={() => {
                      pendingModalAction.current = 'generate';
                      handleCloseExpansion();
                    }}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-dark transition-colors flex items-center gap-1.5"
                  >
                    Generate Plan
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {event?.status === 'DRAFT' && (
                  <button
                    onClick={() => {
                      setSelectedTeamForItem(null);
                      setAddItemModalOpen(true);
                    }}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Item
                  </button>
                )}
              </div>
            </div>
          ) : (
            (() => {
              // Group items by team name
              const grouped = [...items].reduce<Record<string, Item[]>>((acc, item) => {
                const key = item.team.name;
                if (!acc[key]) acc[key] = [];
                acc[key].push(item);
                return acc;
              }, {});
              // Sort categories by displayOrder when available (guided build),
              // fall back to alphabetical (quick generate / manual teams)
              const hasDisplayOrder = items.some((item) => item.team.displayOrder > 0);
              const categoryNames = Object.keys(grouped).sort((a, b) => {
                if (hasDisplayOrder) {
                  const orderA = grouped[a][0]?.team.displayOrder ?? 0;
                  const orderB = grouped[b][0]?.team.displayOrder ?? 0;
                  if (orderA !== orderB) return orderA - orderB;
                }
                return a.localeCompare(b);
              });

              return (
                <div className="space-y-2">
                  {categoryNames.map((categoryName) => {
                    const categoryItems = grouped[categoryName];
                    const isExpanded = expandedItemCategories.has(categoryName);

                    return (
                      <div
                        key={categoryName}
                        className="border border-gray-200 rounded-lg overflow-hidden"
                      >
                        {/* Accordion Header */}
                        <button
                          onClick={() => {
                            setExpandedItemCategories((prev) => {
                              const next = new Set(prev);
                              if (next.has(categoryName)) {
                                next.delete(categoryName);
                              } else {
                                next.add(categoryName);
                              }
                              return next;
                            });
                          }}
                          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-gray-400" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900">{categoryName}</span>
                            <span className="text-sm text-gray-500">
                              · {categoryItems.length}{' '}
                              {categoryItems.length === 1 ? 'item' : 'items'}
                            </span>
                          </div>
                        </button>

                        {/* Accordion Body — three-column table */}
                        <div
                          className={`transition-all duration-200 ease-in-out overflow-hidden ${
                            isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                          }`}
                        >
                          <div className="border-t border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wider">
                                  <th className="px-4 py-2 font-medium">Item</th>
                                  <th className="px-4 py-2 font-medium">Category</th>
                                  <th className="px-4 py-2 font-medium">Status</th>
                                  <th className="px-4 py-2 font-medium text-right">Action</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {categoryItems.map((item) => {
                                  const isNew =
                                    item.createdAt &&
                                    new Date().getTime() - new Date(item.createdAt).getTime() <
                                      60000;

                                  return (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                      <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                          <span className="font-medium text-gray-900">
                                            {item.name}
                                          </span>
                                          {isNew && (
                                            <span className="px-1.5 py-0.5 text-xs font-bold bg-orange-500 text-white rounded animate-pulse">
                                              NEW
                                            </span>
                                          )}
                                          {item.critical && (
                                            <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                                              CRITICAL
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500 mt-0.5">
                                          {item.quantityAmount && item.quantityUnit ? (
                                            <span>
                                              {item.quantityAmount} {item.quantityUnit}
                                            </span>
                                          ) : item.quantityText ? (
                                            <span className="italic">{item.quantityText}</span>
                                          ) : (
                                            <span className="text-orange-600">No quantity set</span>
                                          )}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-gray-400">{item.team.name}</td>
                                      <td className="px-4 py-3">
                                        {item.assignment ? (
                                          <span
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                              item.assignment.response === 'ACCEPTED'
                                                ? 'bg-green-100 text-green-800'
                                                : item.assignment.response === 'DECLINED'
                                                  ? 'bg-red-100 text-red-800'
                                                  : 'bg-amber-100 text-amber-800'
                                            }`}
                                          >
                                            {item.assignment.response === 'ACCEPTED'
                                              ? 'Confirmed'
                                              : item.assignment.response === 'DECLINED'
                                                ? 'Declined'
                                                : 'Pending'}
                                            <span className="text-xs text-inherit opacity-70">
                                              — {item.assignment.person.name}
                                            </span>
                                          </span>
                                        ) : (
                                          <span className="text-xs text-gray-400 italic">
                                            Unassigned
                                          </span>
                                        )}
                                      </td>
                                      <td className="px-4 py-3 text-right">
                                        <button
                                          onClick={() => setEditingItem(item)}
                                          className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
                                        >
                                          Edit
                                        </button>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {categoryNames.length === 0 && (
                    <div className="text-center py-12 text-gray-500">
                      <p>No items yet. Generate a plan or add items manually.</p>
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </SectionExpandModal>

        {/* People Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'people'}
          onClose={handleCloseExpansion}
          title="People"
          icon={<Users className="w-6 h-6" />}
          tabBar={buildTabBar('people')}
        >
          <PeopleSection
            eventId={eventId}
            hostId={event?.hostId}
            teams={teams}
            people={people}
            onPeopleChanged={() => {
              loadPeople();
              loadTeams();
              setGateCheckRefresh((prev) => prev + 1);
              if (event && (event.status === 'CONFIRMING' || isSentJson(event))) {
                loadInviteLinks();
              }
              setChecklistStepContext(null);
              autoRecheck();
            }}
            onMovePerson={handleMovePerson}
            onGeneratePlan={event?.setup ? undefined : () => setHostDescriptionModalOpen(true)}
            stepLabel={checklistStepContext || undefined}
            initialView={peopleInitialView}
            onReassignItems={(teamId) => {
              setInitialExpandedTeam(teamId);
              pendingModalAction.current = 'reassign-items';
              handleCloseExpansion();
            }}
          />
        </SectionExpandModal>

        {/* Teams Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'teams'}
          onClose={handleTeamsModalClose}
          title="Teams"
          icon={<Users className="w-6 h-6" />}
          tabBar={buildTabBar('teams')}
        >
          {teams.length === 0 ? (
            <div className="text-center py-16">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-600 mb-6">
                No teams yet. Generate a plan to create teams automatically.
              </p>
              <div className="flex items-center justify-center gap-3">
                {event?.status === 'DRAFT' && !event?.setup && (
                  <button
                    onClick={() => {
                      pendingModalAction.current = 'generate';
                      handleCloseExpansion();
                    }}
                    className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-dark transition-colors flex items-center gap-1.5"
                  >
                    Generate Plan
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
                {event?.status === 'DRAFT' && (
                  <button
                    onClick={() => setAddTeamModalOpen(true)}
                    className="px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-50 transition-colors flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    Add Team
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              {teams.map((team) => (
                <div key={team.id} className="border border-gray-200 rounded-lg">
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                    onClick={async () => {
                      const newExpanded = new Set(expandedTeams);
                      if (newExpanded.has(team.id)) {
                        newExpanded.delete(team.id);
                      } else {
                        newExpanded.add(team.id);
                        // Load items when expanding
                        if (!teamItems[team.id]) {
                          await loadTeamItems(team.id);
                        }
                      }
                      setExpandedTeams(newExpanded);
                    }}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {expandedTeams.has(team.id) ? (
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      )}
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{team.name}</span>
                          {team.unassignedCount > 0 && (
                            <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-xs rounded">
                              {team.unassignedCount} unassigned
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          Coordinator: {team.coordinator?.name || 'None'} •{' '}
                          {team._count.members ?? 0}{' '}
                          {(team._count.members ?? 0) === 1 ? 'member' : 'members'} •{' '}
                          {team._count.items} items
                        </div>
                      </div>
                    </div>
                    <div className="text-sm text-gray-500">{team.scope}</div>
                  </div>

                  {/* Expanded Items Section */}
                  {expandedTeams.has(team.id) && (
                    <div className="px-4 py-3 bg-gray-50 border-t">
                      <div className="flex gap-2 mb-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTeamForItem(team);
                            setAddItemModalOpen(true);
                          }}
                          className="px-3 py-1 bg-sage-600 text-white text-sm rounded-md hover:bg-sage-700 flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add Item
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTeam(team);
                          }}
                          className="px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 flex items-center gap-1"
                        >
                          Delete Team
                        </button>
                      </div>

                      {/* Items List */}
                      {loadingTeamItems.has(team.id) ? (
                        <div className="text-center py-4 text-gray-500">
                          <p className="text-sm">Loading items...</p>
                        </div>
                      ) : teamItems[team.id] && teamItems[team.id].length > 0 ? (
                        <div className="space-y-2">
                          {teamItems[team.id].map((item: any) => (
                            <div
                              key={item.id}
                              className="bg-white border border-gray-200 rounded-md p-3"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-gray-900">{item.name}</h4>
                                    {item.critical && (
                                      <span className="px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded">
                                        Critical
                                      </span>
                                    )}
                                  </div>

                                  <div className="mt-2">
                                    <ItemStatusBadges assignment={item.assignment} />
                                  </div>

                                  {item.description && (
                                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                  )}

                                  <DropOffDisplay
                                    dropOffLocation={item.dropOffLocation}
                                    dropOffAt={item.dropOffAt}
                                    dropOffNote={item.dropOffNote}
                                    variant="inline"
                                    showIcons={true}
                                    className="mt-2"
                                  />

                                  {/* Quantity Display */}
                                  <div className="text-sm mt-2">
                                    {item.quantityState === 'SPECIFIED' ? (
                                      <span className="text-gray-700">
                                        Quantity: {item.quantityAmount}{' '}
                                        {item.quantityUnit?.toLowerCase()}
                                      </span>
                                    ) : (
                                      <span className="text-orange-600">
                                        Quantity: {item.quantityText || 'TBD'}
                                      </span>
                                    )}
                                  </div>

                                  {/* Dietary Tags */}
                                  {item.dietaryTags && item.dietaryTags.length > 0 && (
                                    <div className="flex gap-1 mt-2">
                                      {item.dietaryTags.map((tag: string) => (
                                        <span
                                          key={tag}
                                          className="px-2 py-0.5 bg-green-100 text-green-800 text-xs rounded"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </div>

                                {/* Right Side: Quick Assign + Action Buttons */}
                                <div className="flex flex-col gap-3 ml-4 w-48">
                                  {/* Quick Assign Dropdown */}
                                  <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">
                                      Assign to
                                    </label>
                                    <select
                                      value={
                                        pendingAssignments[item.id] !== undefined
                                          ? pendingAssignments[item.id].personId
                                          : item.assignment?.person?.id || ''
                                      }
                                      onChange={(e) =>
                                        handleStageAssignment(
                                          item.id,
                                          e.target.value,
                                          team.id,
                                          item.assignment?.person?.id || ''
                                        )
                                      }
                                      className={`w-full px-2 py-1 text-sm border rounded-md focus:outline-none focus:ring-2 focus:ring-accent ${
                                        pendingAssignments[item.id] !== undefined
                                          ? 'border-amber-400 bg-amber-50'
                                          : 'border-gray-300'
                                      }`}
                                    >
                                      <option value="">Unassigned</option>
                                      {people
                                        .filter((p) => p.team.id === team.id)
                                        .map((person) => (
                                          <option key={person.personId} value={person.personId}>
                                            {person.name}
                                          </option>
                                        ))}
                                    </select>
                                    {pendingAssignments[item.id] !== undefined && (
                                      <p className="text-xs text-amber-600 mt-0.5">Unsaved</p>
                                    )}
                                    {people.filter((p) => p.team.id === team.id).length === 0 ? (
                                      <p className="text-xs text-gray-500 mt-1">
                                        No people in this team yet
                                      </p>
                                    ) : null}
                                  </div>

                                  {/* Action Buttons */}
                                  <div className="flex gap-2">
                                    <button
                                      onClick={() => handleStartEditItem(item)}
                                      className="flex-1 px-2 py-1 bg-accent text-white text-xs rounded-md hover:bg-accent-dark"
                                    >
                                      Edit
                                    </button>
                                    <button
                                      onClick={() => handleDeleteItem(item)}
                                      className="flex-1 px-2 py-1 bg-red-600 text-white text-xs rounded-md hover:bg-red-700"
                                    >
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-4 text-gray-500">
                          <p className="text-sm">No items yet. Add an item to get started.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Batch Save Bar */}
          {Object.keys(pendingAssignments).length > 0 && (
            <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 flex items-center justify-between shadow-lg rounded-b-lg">
              <span className="text-sm text-amber-700 font-medium">
                {Object.keys(pendingAssignments).length} unsaved assignment
                {Object.keys(pendingAssignments).length > 1 ? 's' : ''}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPendingAssignments({})}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Discard
                </button>
                <button
                  onClick={handleSaveAllAssignments}
                  disabled={savingAssignments}
                  className="px-4 py-2 text-sm text-white bg-accent rounded-md hover:bg-accent-dark disabled:opacity-50"
                >
                  {savingAssignments ? 'Saving...' : 'Save All'}
                </button>
              </div>
            </div>
          )}
        </SectionExpandModal>

        {/* Unsaved changes warning for Teams modal */}
        {showDiscardWarning && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-[70] flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Unsaved changes</h3>
              <p className="text-sm text-gray-600 mb-4">
                You have {Object.keys(pendingAssignments).length} unsaved assignment
                {Object.keys(pendingAssignments).length > 1 ? 's' : ''}. Close without saving?
              </p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowDiscardWarning(false)}
                  className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Go Back
                </button>
                <button
                  onClick={handleDiscardAndClose}
                  className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
                >
                  Discard & Close
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Invite Links Expansion */}
        {event && (event.status === 'CONFIRMING' || isSentJson(event)) && (
          <SectionExpandModal
            isOpen={expandedSection === 'invites'}
            onClose={handleCloseExpansion}
            title="Invite Links"
            icon={<LinkIcon className="w-6 h-6" />}
            tabBar={buildTabBar('invites')}
          >
            {/* Shared Link Section — available from CONFIRMING onward, through the send */}
            <div className="mb-6">
              <SharedLinkSection
                eventId={eventId}
                available={event.status === 'CONFIRMING' || isSentJson(event)}
              />
            </div>

            {/* Invite Status Section - Only show in CONFIRMING */}
            {event.status === 'CONFIRMING' && (
              <div className="mb-6">
                <InviteStatusSection
                  eventId={eventId}
                  onPersonClick={setSelectedPersonId}
                  onDataUpdate={setInviteStatusData}
                />
              </div>
            )}

            {/* Phase 6 Components - Invite Funnel */}
            {event.status === 'CONFIRMING' && inviteStatusData && (
              <div className="mb-6">
                <InviteFunnel
                  data={{
                    total: inviteStatusData.counts.total,
                    sent: inviteStatusData.counts.total - inviteStatusData.counts.notSent,
                    opened: inviteStatusData.counts.opened + inviteStatusData.counts.responded,
                    responded: inviteStatusData.counts.responded,
                    confirmed: inviteStatusData.people.filter((p: any) => p.response === 'ACCEPTED')
                      .length,
                  }}
                />
              </div>
            )}

            {/* Phase 6 Components - Who's Missing */}
            {event.status === 'CONFIRMING' && inviteStatusData && (
              <div className="mb-6">
                <WhosMissing
                  people={inviteStatusData.people.map((p: any) => ({
                    id: p.id,
                    name: p.name,
                    status: p.status,
                    hasPhone: p.hasPhone,
                    lastAction: p.response,
                    daysSinceAnchor: p.inviteAnchorAt
                      ? Math.floor(
                          (Date.now() - new Date(p.inviteAnchorAt).getTime()) /
                            (1000 * 60 * 60 * 24)
                        )
                      : null,
                  }))}
                  onPersonClick={setSelectedPersonId}
                />
              </div>
            )}

            {/* Phase 6 Components - Copy Plan as Text */}
            <div className="mb-6">
              <CopyPlanAsText eventId={eventId} />
            </div>

            {/* Family Directory Link - Prominent Card */}
            <div className="bg-sage-50 border-2 border-sage-300 rounded-lg p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 w-12 h-12 bg-sage-600 rounded-full flex items-center justify-center">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Family Directory Link
                  </h3>
                  <p className="text-sm text-gray-700 mb-3">
                    Share this single link with your whole family. Everyone can click their name to
                    access their personal page.
                  </p>
                  <div className="bg-white rounded-md p-3 mb-3 border border-sage-200">
                    <p className="text-xs text-gray-500 font-mono break-all">
                      {typeof window !== 'undefined'
                        ? `${window.location.origin}/gather/${eventId}/directory`
                        : `...loading`}
                    </p>
                  </div>
                  <button
                    onClick={handleCopyDirectoryLink}
                    className="w-full sm:w-auto px-4 py-2 bg-sage-600 text-white text-sm font-medium rounded-md hover:bg-sage-700 transition-colors"
                  >
                    {copiedDirectory ? '✓ Copied!' : 'Copy Directory Link'}
                  </button>
                </div>
              </div>
            </div>

            {/* Individual Invite Links Section */}
            <div className="border-t border-gray-200 pt-6">
              <p className="text-sm text-gray-600 mb-4">
                Or share these individual links directly. Each link is personalized and grants
                access to the appropriate view.
              </p>
              <div className="space-y-4">
                {inviteLinks.map((link) => {
                  const personData = personStatuses.get(link.personId);
                  const status = personData?.status;
                  const getStatusIcon = () => {
                    switch (status) {
                      case 'RESPONDED':
                        return (
                          <span title="Responded">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                          </span>
                        );
                      case 'OPENED':
                        return (
                          <span title="Opened link">
                            <Eye className="w-4 h-4 text-blue-500" />
                          </span>
                        );
                      case 'SENT':
                        return (
                          <span title="Invite sent">
                            <Send className="w-4 h-4 text-yellow-500" />
                          </span>
                        );
                      case 'NOT_SENT':
                        return (
                          <span title="Not sent yet">
                            <Clock className="w-4 h-4 text-gray-400" />
                          </span>
                        );
                      default:
                        return null;
                    }
                  };

                  return (
                    <div key={link.token} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                link.scope === 'HOST'
                                  ? 'bg-sage-100 text-sage-800'
                                  : link.scope === 'COORDINATOR'
                                    ? 'bg-sage-100 text-sage-800'
                                    : 'bg-green-100 text-green-800'
                              }`}
                            >
                              {link.scope}
                            </span>
                            {getStatusIcon()}
                            <span className="font-medium text-gray-900">{link.personName}</span>
                            {personData?.claimedAt && (
                              <span className="text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded">
                                Claimed
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1 font-mono truncate max-w-md">
                            {link.url}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleCopyLink(link.url, link.token)}
                            className="px-3 py-1 bg-accent text-white text-sm rounded-md hover:bg-accent-dark"
                          >
                            {copiedToken === link.token ? 'Copied!' : 'Copy Link'}
                          </button>
                          {personData?.claimedAt && link.scope === 'PARTICIPANT' && (
                            <button
                              onClick={() => handleResetClaim(link.personId, link.personName)}
                              disabled={resettingClaim === link.personId}
                              className="px-3 py-1 text-xs text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {resettingClaim === link.personId ? 'Resetting...' : 'Reset claim'}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </SectionExpandModal>
        )}

        {/* Complete Event Expansion */}
        {event && isSentJson(event) && (
          <SectionExpandModal
            isOpen={expandedSection === 'wrapup'}
            onClose={handleCloseExpansion}
            title="Event Complete"
            icon={<Gift className="w-6 h-6" />}
          >
            {isCompleteJson(event) && !wrapUpResult?.success && (
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Send a thank-you to your guests and complete {event.name}?
                  </h3>
                  <p className="text-sm text-gray-600 mb-4">
                    This will close the event, and each guest will receive a personalised thank-you
                    message acknowledging what they brought. Messages are sent via SMS (or email if
                    no phone number) within a few minutes.
                  </p>
                  {wrapUpResult?.warning && (
                    <div className="bg-yellow-100 border border-yellow-300 rounded-md p-3 mb-4">
                      <p className="text-sm font-medium text-yellow-800">{wrapUpResult.message}</p>
                      <button
                        onClick={() => handleWrapUp(true)}
                        disabled={wrapUpLoading}
                        className="mt-2 px-4 py-2 bg-yellow-600 text-white text-sm rounded-md hover:bg-yellow-700 disabled:opacity-50"
                      >
                        {wrapUpLoading ? 'Completing...' : 'Yes, complete anyway'}
                      </button>
                    </div>
                  )}
                  {!wrapUpResult?.warning && (
                    <button
                      onClick={() => handleWrapUp()}
                      disabled={wrapUpLoading}
                      className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark disabled:opacity-50 transition-colors"
                    >
                      {wrapUpLoading ? (
                        <span className="flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Completing...
                        </span>
                      ) : (
                        'Complete event & send thank-you messages'
                      )}
                    </button>
                  )}
                  {wrapUpResult && !wrapUpResult.success && !wrapUpResult.warning && (
                    <p className="mt-3 text-sm text-red-600">{wrapUpResult.message}</p>
                  )}
                </div>
              </div>
            )}

            {(isCompleteJson(event) || wrapUpResult?.success) && (
              <div className="space-y-6">
                {wrapUpResult?.success && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <h3 className="text-lg font-semibold text-green-800">Done!</h3>
                    </div>
                    <p className="text-sm text-green-700">{wrapUpResult.message}</p>
                    {(wrapUpResult.guestsSkipped ?? 0) > 0 && (
                      <p className="text-sm text-gray-600 mt-1">
                        Could not reach {wrapUpResult.guestsSkipped} guest(s) — no contact details
                        on file.
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Dispatch Status</h3>
                    <button
                      onClick={loadWrapUpStatus}
                      disabled={wrapUpStatusLoading}
                      className="text-sm text-accent hover:text-accent-dark disabled:opacity-50"
                    >
                      {wrapUpStatusLoading ? 'Refreshing…' : 'Refresh'}
                    </button>
                  </div>

                  {wrapUpDispatch ? (
                    <div>
                      <div className="grid grid-cols-4 gap-4 mb-6">
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-gray-900">{wrapUpDispatch.total}</p>
                          <p className="text-xs text-gray-500">Total</p>
                        </div>
                        <div className="bg-green-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-green-700">{wrapUpDispatch.sent}</p>
                          <p className="text-xs text-gray-500">Sent</p>
                        </div>
                        <div className="bg-red-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-red-700">{wrapUpDispatch.failed}</p>
                          <p className="text-xs text-gray-500">Failed</p>
                        </div>
                        <div className="bg-gray-50 rounded-lg p-3 text-center">
                          <p className="text-2xl font-bold text-gray-500">
                            {wrapUpDispatch.skipped}
                          </p>
                          <p className="text-xs text-gray-500">Skipped</p>
                        </div>
                      </div>

                      {wrapUpDispatch.pending > 0 && (
                        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
                          <p className="text-sm text-blue-700">
                            {wrapUpDispatch.pending} message(s) still queued — messages will be sent
                            within 10–20 minutes.
                          </p>
                          {countdownMinutes !== null && (
                            <p className="text-sm font-medium text-blue-800 mt-1">
                              {countdownMinutes > 0
                                ? `Sending in ${countdownMinutes} minute${countdownMinutes !== 1 ? 's' : ''}`
                                : 'Sending now — refresh to check status'}
                            </p>
                          )}
                        </div>
                      )}

                      {wrapUpDispatch.failed > 0 && (
                        <button
                          onClick={handleWrapUpRetry}
                          disabled={wrapUpRetrying}
                          className="mb-4 px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                        >
                          {wrapUpRetrying
                            ? 'Retrying...'
                            : `Retry ${wrapUpDispatch.failed} failed message(s)`}
                        </button>
                      )}

                      <div className="space-y-2">
                        {wrapUpDispatch.guests.map((g) => (
                          <div
                            key={g.personId}
                            className="flex items-center justify-between py-2 px-3 bg-white rounded border border-gray-100"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">{g.name}</span>
                              <span className="text-xs text-gray-400 uppercase">{g.channel}</span>
                            </div>
                            <div>
                              {g.channel === 'skipped' ? (
                                <span className="text-xs text-gray-400">No contact</span>
                              ) : g.failed ? (
                                <span
                                  className="text-xs text-red-600"
                                  title={g.failReason || undefined}
                                >
                                  Failed
                                </span>
                              ) : g.dispatched ? (
                                <span className="text-xs text-green-600">Sent</span>
                              ) : (
                                <span className="text-xs text-blue-600">Queued</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={loadWrapUpStatus}
                      disabled={wrapUpStatusLoading}
                      className="px-4 py-2 bg-accent text-white text-sm rounded-md hover:bg-accent-dark disabled:opacity-50"
                    >
                      {wrapUpStatusLoading ? 'Loading…' : 'Load dispatch status'}
                    </button>
                  )}
                </div>

                {/* Save for next year CTA */}
                <div className="bg-sage-50 border border-sage-200 rounded-lg p-4 mt-6">
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    Planning again next year?
                  </h3>
                  <p className="text-sm text-gray-600 mb-3">
                    Save this event's structure so you can pick up where you left off.
                  </p>
                  <button
                    onClick={handleSaveForNextYear}
                    disabled={savingForNextYear || savedForNextYear}
                    className="px-4 py-2 text-sm bg-accent text-white rounded-md hover:bg-accent-dark disabled:opacity-50 transition-colors"
                  >
                    {savedForNextYear
                      ? 'Saved for next year'
                      : savingForNextYear
                        ? 'Saving...'
                        : 'Save for next year'}
                  </button>
                </div>
              </div>
            )}
          </SectionExpandModal>
        )}

        {/* Revision History Expansion — gated so even a ?expand=history
            deep link shows nothing on V2 events (GTC-149) */}
        <SectionExpandModal
          isOpen={expandedSection === 'history' && !event?.setup}
          onClose={handleCloseExpansion}
          title="Revision History"
          icon={<Clock className="w-6 h-6" />}
          tabBar={buildTabBar('history')}
        >
          <RevisionHistory eventId={eventId} actorId={event?.hostId ?? ''} />
        </SectionExpandModal>

        {/* Phase 6 - Person Detail Modal */}
        {selectedPersonId && (
          <PersonInviteDetailModal
            eventId={eventId}
            personId={selectedPersonId}
            onClose={() => {
              setSelectedPersonId(null);
            }}
            onUpdate={loadInviteLinks}
          />
        )}

        {/* Footer */}
        <div className="bg-white border-t border-gray-200 px-6 py-4 mt-8">
          <p className="text-center text-sm text-gray-400">
            <a href="/privacy" className="hover:text-gray-600 hover:underline">
              Privacy Policy
            </a>
          </p>
        </div>
      </div>

      {/* Past Event Reuse Overlay */}
      {showReuseOverlay && reuseOverlaySummary && (
        <PastEventOverlay
          summary={reuseOverlaySummary}
          onOpenDates={() => {
            setShowReuseOverlay(false);
            setEditEventModalOpen(true);
          }}
          onOpenPeople={() => {
            setShowReuseOverlay(false);
            handleExpandSection('people');
          }}
          onOpenItems={() => {
            setShowReuseOverlay(false);
            handleExpandSection('items');
          }}
          onOpenDetails={() => {
            setShowReuseOverlay(false);
            setEditEventModalOpen(true);
          }}
          onDismiss={() => setShowReuseOverlay(false)}
        />
      )}
    </ModalProvider>
  );
}
