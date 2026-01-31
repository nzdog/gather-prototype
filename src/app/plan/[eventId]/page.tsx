'use client';

import { useEffect, useState } from 'react';
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
  Lock,
} from 'lucide-react';
import ConflictList from '@/components/plan/ConflictList';
import GateCheck from '@/components/plan/GateCheck';
import FreezeCheck from '@/components/plan/FreezeCheck';
import UnfreezeSection from '@/components/plan/UnfreezeSection';
import EventStageProgress from '@/components/plan/EventStageProgress';
import SaveTemplateModal from '@/components/templates/SaveTemplateModal';
import AddTeamModal, { TeamFormData } from '@/components/plan/AddTeamModal';
import AddItemModal, { ItemFormData } from '@/components/plan/AddItemModal';
import EditItemModal from '@/components/plan/EditItemModal';
import RevisionHistory from '@/components/plan/RevisionHistory';
import RegenerateModal from '@/components/plan/RegenerateModal';
import PeopleSection from '@/components/plan/PeopleSection';
import EditEventModal from '@/components/plan/EditEventModal';
import ItemStatusBadges from '@/components/plan/ItemStatusBadges';
import SectionExpandModal from '@/components/plan/SectionExpandModal';
import GenerationReviewPanel from '@/components/plan/GenerationReviewPanel';
import { InviteStatusSection } from '@/components/plan/InviteStatusSection';
import { SharedLinkSection } from '@/components/plan/SharedLinkSection';
import { InviteFunnel } from '@/components/plan/InviteFunnel';
import { WhosMissing } from '@/components/plan/WhosMissing';
import { CopyPlanAsText } from '@/components/plan/CopyPlanAsText';
import { PersonInviteDetailModal } from '@/components/plan/PersonInviteDetailModal';
import { ModalProvider } from '@/contexts/ModalContext';
import { Conflict } from '@prisma/client';
import { DropOffDisplay } from '@/components/shared/DropOffDisplay';

interface Event {
  id: string;
  name: string;
  status: string;
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
  | 'gate'
  | 'freeze'
  | 'unfreeze'
  | 'invites'
  | 'history';

const validSectionIds: SectionId[] = [
  'assessment',
  'items',
  'people',
  'teams',
  'gate',
  'freeze',
  'unfreeze',
  'invites',
  'history',
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

  const [event, setEvent] = useState<Event | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [days, setDays] = useState<Day[]>([]);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());
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
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateModalOpen, setRegenerateModalOpen] = useState(false);
  const [manualTeamCount, _setManualTeamCount] = useState(0);
  const [manualItemCount, _setManualItemCount] = useState(0);
  const [editEventModalOpen, setEditEventModalOpen] = useState(false);
  const [inviteLinks, setInviteLinks] = useState<any[]>([]);
  const [personStatuses, setPersonStatuses] = useState<Map<string, any>>(new Map());
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [resettingClaim, setResettingClaim] = useState<string | null>(null);
  const [copiedDirectory, setCopiedDirectory] = useState(false);
  const [expandedSection, setExpandedSection] = useState<SectionId | null>(null);
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const [inviteStatusData, setInviteStatusData] = useState<any | null>(null);

  // Debug: Log when selectedPersonId changes
  useEffect(() => {
    console.log('selectedPersonId changed:', selectedPersonId);
  }, [selectedPersonId]);

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

  // Mock hostId - in production, this would come from auth
  const MOCK_HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

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
    if (event && ['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status)) {
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
        return;
      }

      const data = await response.json();
      setInviteLinks(data.inviteLinks || []);

      // Also fetch invite status if in CONFIRMING status
      if (event.status === 'CONFIRMING') {
        try {
          const statusResponse = await fetch(`/api/events/${eventId}/invite-status`);
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
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    try {
      const response = await fetch(`/api/events/${eventId}/generate`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error('Failed to generate plan');

      // After success, refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);

      alert('Plan generated! Demo team and items created.');
    } catch (err: any) {
      console.error('Error generating plan:', err);
      alert('Failed to generate plan');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCheckPlan = async () => {
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

      alert('Plan check complete! See conflicts below.');
    } catch (err: any) {
      console.error('Error checking plan:', err);
      alert(`Failed to check plan: ${err.message}`);
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
        alert('No items found to regenerate. Please generate a plan first.');
        setIsRegenerating(false);
        return;
      }

      setReviewTeamGroups(reviewData.teamGroups);
      setReviewMode(true); // Enter review mode
    } catch (err: any) {
      console.error('Error loading items for review:', err);
      alert('Failed to load items for regeneration. Please try again.');
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

      if (!response.ok) throw new Error('Failed to regenerate items');

      const data = await response.json();
      console.log('Regeneration complete:', data);

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

  const handleReviewConfirmAndContinue = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}/review-items`, {
        method: 'POST',
      });

      if (!response.ok) throw new Error('Failed to confirm items');

      const data = await response.json();
      console.log('Confirmed items:', data);

      // Exit review mode and reload plan
      setReviewMode(false);
      setReviewTeamGroups([]);

      // Refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);
    } catch (err: any) {
      console.error('Error confirming items:', err);
      alert('Failed to confirm items');
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
      if (!response.ok) throw new Error('Failed to regenerate plan');

      // After success, refresh all data
      await loadEvent();
      await loadTeams();
      await loadItems();
      await loadConflicts();
      setGateCheckRefresh((prev) => prev + 1);

      // Automatically run check plan if it was run before
      if (event?.lastCheckPlanAt) {
        console.log('Auto-running check plan after regeneration...');
        try {
          const checkResponse = await fetch(`/api/events/${eventId}/check`, {
            method: 'POST',
          });

          if (checkResponse.ok) {
            await loadEvent();
            await loadConflicts();
            console.log('Check plan completed successfully after regeneration');
          }
        } catch (checkError) {
          console.error('Error auto-running check plan:', checkError);
          // Don't fail the regeneration if check fails
        }
      }

      alert('Plan regenerated successfully!');
    } catch (err: any) {
      console.error('Error regenerating plan:', err);
      alert('Failed to regenerate plan');
    } finally {
      setIsRegenerating(false);
    }
  };

  // Commented out unused function
  // const handleDeferToCoordinator = async (itemId: string) => {
  //   try {
  //     const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         placeholderAcknowledged: true,
  //         quantityDeferredTo: 'COORDINATOR',
  //       }),
  //     });
  //     if (!response.ok) throw new Error('Failed to update item');
  //
  //     // Reload items and conflicts
  //     await loadItems();
  //     await loadConflicts();
  //   } catch (err: any) {
  //     console.error('Error deferring item:', err);
  //     alert('Failed to defer item');
  //   }
  // };

  // Commented out unused function
  // const handleStartEditQuantity = (item: Item) => {
  //   setEditingItemId(item.id);
  //   setEditQuantityAmount(item.quantityAmount?.toString() || '');
  //   setEditQuantityUnit(item.quantityUnit || 'SERVINGS');
  // };

  // Commented out unused function
  // const handleSaveQuantity = async (itemId: string) => {
  //   try {
  //     const amount = parseFloat(editQuantityAmount);
  //     if (isNaN(amount) || amount <= 0) {
  //       alert('Please enter a valid quantity');
  //       return;
  //     }
  //
  //     const response = await fetch(`/api/events/${eventId}/items/${itemId}`, {
  //       method: 'PATCH',
  //       headers: { 'Content-Type': 'application/json' },
  //       body: JSON.stringify({
  //         quantityAmount: amount,
  //         quantityUnit: editQuantityUnit,
  //         quantityState: 'SPECIFIED',
  //       }),
  //     });
  //     if (!response.ok) throw new Error('Failed to update item');
  //
  //     // Reload items and conflicts
  //     await loadItems();
  //     await loadConflicts();
  //
  //     // Clear editing state
  //     setEditingItemId(null);
  //     setEditQuantityAmount('');
  //     setEditQuantityUnit('SERVINGS');
  //   } catch (err: any) {
  //     console.error('Error saving quantity:', err);
  //     alert('Failed to save quantity');
  //   }
  // };

  // Commented out unused function
  // const handleCancelEdit = () => {
  //   setEditingItemId(null);
  //   setEditQuantityAmount('');
  //   setEditQuantityUnit('SERVINGS');
  // };

  const handleSaveAsTemplate = async (templateName: string) => {
    try {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hostId: event?.hostId, // Use actual event hostId instead of MOCK_HOST_ID
          eventId: event?.id,
          name: templateName,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save template');
      }

      await response.json();
      alert(`Template "${templateName}" saved successfully!`);

      // Optionally redirect to templates page
      // router.push('/plan/templates');
    } catch (error: any) {
      console.error('Error saving template:', error);
      throw error;
    }
  };

  const handleCopyLink = async (url: string, token: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000); // Reset after 2 seconds
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy link to clipboard');
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
      alert('Failed to copy link to clipboard');
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
        alert(`Claim reset for ${personName}. They can now claim their name again.`);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to reset claim');
      }
    } catch (err) {
      console.error('Failed to reset claim:', err);
      alert('Failed to reset claim');
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
          coordinatorId: MOCK_HOST_ID, // Host is initial coordinator
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to add team');
      }

      // Reload teams and refresh gate check
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
    } catch (error: any) {
      console.error('Error adding team:', error);
      alert('Failed to add team');
      throw error;
    }
  };

  const handleAddItem = async (itemData: ItemFormData) => {
    if (!selectedTeamForItem) return;

    try {
      const response = await fetch(`/api/events/${eventId}/teams/${selectedTeamForItem.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData),
      });

      if (!response.ok) {
        throw new Error('Failed to add item');
      }

      // Reload teams and team items, refresh gate check
      await loadTeams();
      await loadTeamItems(selectedTeamForItem.id);
      setGateCheckRefresh((prev) => prev + 1);
    } catch (error: any) {
      console.error('Error adding item:', error);
      alert('Failed to add item');
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

  const handleQuickAssign = async (itemId: string, personId: string, teamId: string) => {
    try {
      if (personId) {
        // Assign to person
        const response = await fetch(`/api/events/${eventId}/items/${itemId}/assign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ personId }),
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to assign item');
        }
      } else {
        // Unassign
        const response = await fetch(`/api/events/${eventId}/items/${itemId}/assign`, {
          method: 'DELETE',
        });
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || 'Failed to unassign item');
        }
      }

      // Reload team items, teams, and gate check
      await loadTeamItems(teamId);
      await loadTeams();
      setGateCheckRefresh((prev) => prev + 1);
    } catch (error: any) {
      console.error('Error assigning item:', error);
      alert(error.message || 'Failed to assign item');
    }
  };

  // Commented out unused function
  // const toggleTeamExpanded = async (teamId: string) => {
  //   const newExpanded = new Set(expandedTeams);
  //   if (newExpanded.has(teamId)) {
  //     newExpanded.delete(teamId);
  //   } else {
  //     newExpanded.add(teamId);
  //     // Load items when expanding
  //     if (!teamItems[teamId]) {
  //       await loadTeamItems(teamId);
  //     }
  //   }
  //   setExpandedTeams(newExpanded);
  // };

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
    } catch (error: any) {
      console.error('Error updating item:', error);
      alert('Failed to update item');
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
    } catch (error: any) {
      console.error('Error deleting item:', error);
      alert('Failed to delete item');
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
    } catch (error: any) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
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
      if (event && ['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status)) {
        loadInviteLinks();
      }
    } catch (error: any) {
      console.error('Error moving person:', error);
      // Revert optimistic update
      setPeople(originalPeople);
      alert("Couldn't save. Try again.");
    }
  };

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

  return (
    <ModalProvider>
      <div className="min-h-screen bg-gray-50">
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
                    } else {
                      alert(
                        'Host view is not available yet. Please transition to CONFIRMING status first.'
                      );
                    }
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300"
                >
                  View as Host
                </button>
                {event.status === 'DRAFT' && teams.length === 0 && (
                  <button
                    onClick={handleGeneratePlan}
                    disabled={isGenerating}
                    className={`px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2 ${
                      isGenerating ? 'opacity-75 cursor-not-allowed' : ''
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
                {(event.status === 'DRAFT' || event.status === 'CONFIRMING') &&
                  teams.length > 0 && (
                    <button
                      onClick={handleRegeneratePlan}
                      disabled={isRegenerating}
                      className={`px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark flex items-center gap-2 ${
                        isRegenerating ? 'opacity-75 cursor-not-allowed' : ''
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
                <button
                  onClick={handleCheckPlan}
                  className="px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
                >
                  Check Plan
                </button>
                {(event.status === 'CONFIRMING' ||
                  event.status === 'FROZEN' ||
                  event.status === 'COMPLETE') && (
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
          {/* Event Stage Progress */}
          <EventStageProgress currentStatus={event.status as any} />

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
                onConfirmAndContinue={handleReviewConfirmAndContinue}
                onRegenerateSelected={handleReviewRegenerateSelected}
              />
            </div>
          ) : (
            <>
              {/* Card Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Plan Assessment Card */}
                <div
                  onClick={() => handleExpandSection('assessment')}
                  className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                >
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                      <AlertCircle className="w-6 h-6 text-accent" />
                    </div>
                    <h2 className="text-xl font-semibold text-gray-900">Plan Assessment</h2>
                  </div>
                  <div className="flex-1">
                    <p className="text-3xl font-bold text-gray-900 mb-2">{conflicts.length}</p>
                    <p className="text-sm text-gray-600">
                      {conflicts.length === 0
                        ? 'No conflicts found'
                        : `Conflict${conflicts.length > 1 ? 's' : ''} to review`}
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

                {/* Gate Check Card - Only show for DRAFT */}
                {event.status === 'DRAFT' && (
                  <div
                    onClick={() => handleExpandSection('gate')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <AlertCircle className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Gate Check</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">
                        Review readiness to transition to confirming
                      </p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>
                )}

                {/* Freeze Check Card - Only show for CONFIRMING */}
                {event.status === 'CONFIRMING' && (
                  <div
                    onClick={() => handleExpandSection('freeze')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-accent-light/20 rounded-lg flex items-center justify-center group-hover:bg-accent-light/30 transition-colors">
                        <AlertCircle className="w-6 h-6 text-accent" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Freeze Check</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600">Review before freezing plan</p>
                    </div>
                    <div className="text-sm text-accent font-medium">Click to expand →</div>
                  </div>
                )}

                {/* Unfreeze Card - Only show for FROZEN */}
                {event.status === 'FROZEN' && (
                  <div
                    onClick={() => handleExpandSection('unfreeze')}
                    className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group border-2 border-yellow-300"
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center group-hover:bg-yellow-200 transition-colors">
                        <Lock className="w-6 h-6 text-yellow-600" />
                      </div>
                      <h2 className="text-xl font-semibold text-gray-900">Plan Frozen</h2>
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-600 mb-2">The plan is locked</p>
                      <p className="text-sm font-medium text-yellow-700">
                        Click to unfreeze and make changes
                      </p>
                    </div>
                    <div className="text-sm text-yellow-600 font-medium">Click to unfreeze →</div>
                  </div>
                )}

                {/* Invite Links Card */}
                {['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status) &&
                  inviteLinks.length > 0 && (
                    <div
                      onClick={() => handleExpandSection('invites')}
                      className="bg-white rounded-lg shadow-md p-6 cursor-pointer hover:shadow-lg transition-all h-64 flex flex-col group"
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

                {/* Revision History Card */}
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
              </div>
            </>
          )}
        </div>

        {/* Hidden sections for modal expansion - all original components kept but hidden */}
        <div className="hidden">
          <ConflictList
            eventId={eventId}
            conflicts={conflicts}
            onConflictsChanged={loadConflicts}
            hasRunCheck={!!event.lastCheckPlanAt}
          />
          <PeopleSection
            eventId={eventId}
            teams={teams}
            people={people}
            onPeopleChanged={() => {
              loadPeople();
              loadTeams();
              setGateCheckRefresh((prev) => prev + 1);
              if (event && ['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status)) {
                loadInviteLinks();
              }
            }}
            onMovePerson={handleMovePerson}
            onExpand={() => handleExpandSection('people')}
          />
          <GateCheck
            eventId={eventId}
            refreshTrigger={gateCheckRefresh}
            onTransitionComplete={() => {
              loadEvent();
              loadTeams();
              loadConflicts();
            }}
            onExpand={() => handleExpandSection('gate')}
          />
          <FreezeCheck
            eventId={eventId}
            currentStatus={event?.status as any}
            refreshTrigger={gateCheckRefresh}
            onFreezeComplete={() => {
              loadEvent();
              loadTeams();
            }}
            onExpand={() => handleExpandSection('freeze')}
          />
          {event?.status === 'FROZEN' && (
            <UnfreezeSection
              eventId={eventId}
              onUnfreezeComplete={() => {
                loadEvent();
                loadTeams();
              }}
              onExpand={() => handleExpandSection('unfreeze')}
            />
          )}
          <RevisionHistory
            eventId={eventId}
            actorId={MOCK_HOST_ID}
            onExpand={() => handleExpandSection('history')}
          />
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
        {selectedTeamForItem && (
          <AddItemModal
            isOpen={addItemModalOpen}
            onClose={() => {
              setAddItemModalOpen(false);
              setSelectedTeamForItem(null);
            }}
            onAdd={handleAddItem}
            teamName={selectedTeamForItem.name}
            days={days}
          />
        )}

        {/* Edit Item Modal */}
        <EditItemModal
          isOpen={!!editingItem}
          onClose={() => setEditingItem(null)}
          onSave={handleSaveEditItem}
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
        />

        {/* Edit Event Modal */}
        {event && (
          <EditEventModal
            isOpen={editEventModalOpen}
            onClose={() => setEditEventModalOpen(false)}
            onSave={() => {
              loadEvent();
              setEditEventModalOpen(false);
            }}
            event={event}
            eventId={eventId}
          />
        )}

        {/* Section Expansion Modals */}

        {/* Plan Assessment Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'assessment'}
          onClose={handleCloseExpansion}
          title="Plan Assessment"
          icon={<AlertCircle className="w-6 h-6" />}
        >
          <ConflictList
            eventId={eventId}
            conflicts={conflicts}
            onConflictsChanged={loadConflicts}
            hasRunCheck={!!event.lastCheckPlanAt}
          />
        </SectionExpandModal>

        {/* Items & Quantities Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'items'}
          onClose={handleCloseExpansion}
          title="Items & Quantities"
          icon={<Package className="w-6 h-6" />}
        >
          <div className="space-y-3">
            {items.map((item) => {
              const needsAction =
                item.critical &&
                item.quantityState === 'PLACEHOLDER' &&
                !item.placeholderAcknowledged;

              // Check if item was created in the last 60 seconds (newly regenerated)
              const isNew =
                item.createdAt && new Date().getTime() - new Date(item.createdAt).getTime() < 60000;

              return (
                <div
                  key={item.id}
                  className={`border rounded-lg p-4 ${
                    needsAction ? 'border-orange-300 bg-orange-50' : 'border-gray-200'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-gray-900">{item.name}</h3>
                        {isNew && (
                          <span className="px-2 py-0.5 text-xs font-bold bg-orange-500 text-white rounded-md animate-pulse">
                            NEW
                          </span>
                        )}
                        {item.critical && (
                          <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs rounded">
                            CRITICAL
                          </span>
                        )}
                        <span className="text-sm text-gray-500">{item.team.name}</span>
                      </div>

                      <div className="mb-2">
                        <ItemStatusBadges assignment={item.assignment} />
                      </div>

                      {item.description && (
                        <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                      )}

                      <DropOffDisplay
                        dropOffLocation={item.dropOffLocation}
                        dropOffAt={item.dropOffAt}
                        dropOffNote={item.dropOffNote}
                        variant="inline"
                        showIcons={true}
                        className="mb-2"
                      />

                      <div className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                        {item.quantityAmount && item.quantityUnit ? (
                          <span className="font-medium text-gray-900">
                            {item.quantityAmount} {item.quantityUnit}
                          </span>
                        ) : item.quantityText ? (
                          <span className="text-gray-700 italic">{item.quantityText}</span>
                        ) : (
                          <span className="text-orange-600">No quantity set</span>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => setEditingItem(item)}
                        className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-md"
                      >
                        Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </SectionExpandModal>

        {/* People Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'people'}
          onClose={handleCloseExpansion}
          title="People"
          icon={<Users className="w-6 h-6" />}
        >
          <PeopleSection
            eventId={eventId}
            teams={teams}
            people={people}
            onPeopleChanged={() => {
              loadPeople();
              loadTeams();
              setGateCheckRefresh((prev) => prev + 1);
              if (event && ['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status)) {
                loadInviteLinks();
              }
            }}
            onMovePerson={handleMovePerson}
          />
        </SectionExpandModal>

        {/* Teams Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'teams'}
          onClose={handleCloseExpansion}
          title="Teams"
          icon={<Users className="w-6 h-6" />}
        >
          {teams.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <p>No teams yet. Add your first team to get started.</p>
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
                                      value={item.assignment?.person?.id || ''}
                                      onChange={(e) =>
                                        handleQuickAssign(item.id, e.target.value, team.id)
                                      }
                                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-accent"
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
        </SectionExpandModal>

        {/* Gate Check Expansion */}
        {event && event.status === 'DRAFT' && (
          <SectionExpandModal
            isOpen={expandedSection === 'gate'}
            onClose={handleCloseExpansion}
            title="Gate Check"
            icon={<AlertCircle className="w-6 h-6" />}
          >
            <GateCheck
              eventId={eventId}
              refreshTrigger={gateCheckRefresh}
              onTransitionComplete={() => {
                loadEvent();
                loadTeams();
                loadConflicts();
              }}
            />
          </SectionExpandModal>
        )}

        {/* Freeze Check Expansion */}
        {event && event.status === 'CONFIRMING' && (
          <SectionExpandModal
            isOpen={expandedSection === 'freeze'}
            onClose={handleCloseExpansion}
            title="Freeze Check"
            icon={<AlertCircle className="w-6 h-6" />}
          >
            <FreezeCheck
              eventId={eventId}
              currentStatus={event?.status as any}
              refreshTrigger={gateCheckRefresh}
              onFreezeComplete={() => {
                loadEvent();
                loadTeams();
              }}
            />
          </SectionExpandModal>
        )}

        {/* Unfreeze Expansion */}
        {event && event.status === 'FROZEN' && (
          <SectionExpandModal
            isOpen={expandedSection === 'unfreeze'}
            onClose={handleCloseExpansion}
            title="Unfreeze Plan"
            icon={<Lock className="w-6 h-6" />}
          >
            <UnfreezeSection
              eventId={eventId}
              onUnfreezeComplete={() => {
                loadEvent();
                loadTeams();
              }}
            />
          </SectionExpandModal>
        )}

        {/* Invite Links Expansion */}
        {event && ['CONFIRMING', 'FROZEN', 'COMPLETE'].includes(event.status) && (
          <SectionExpandModal
            isOpen={expandedSection === 'invites'}
            onClose={handleCloseExpansion}
            title="Invite Links"
            icon={<LinkIcon className="w-6 h-6" />}
          >
            {/* Shared Link Section - Show in CONFIRMING and FROZEN */}
            <div className="mb-6">
              <SharedLinkSection eventId={eventId} eventStatus={event.status} />
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

        {/* Revision History Expansion */}
        <SectionExpandModal
          isOpen={expandedSection === 'history'}
          onClose={handleCloseExpansion}
          title="Revision History"
          icon={<Clock className="w-6 h-6" />}
        >
          <RevisionHistory eventId={eventId} actorId={MOCK_HOST_ID} />
        </SectionExpandModal>

        {/* Phase 6 - Person Detail Modal */}
        {selectedPersonId && (
          <PersonInviteDetailModal
            eventId={eventId}
            personId={selectedPersonId}
            onClose={() => {
              console.log('Closing person detail modal');
              setSelectedPersonId(null);
            }}
            onUpdate={loadInviteLinks}
          />
        )}
      </div>
    </ModalProvider>
  );
}
