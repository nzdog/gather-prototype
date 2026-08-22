'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ASK_FIELDS, fieldChanges } from '@/lib/ledger';
import type { SerialisedEvent } from '@/lib/lifecycle';
import { useReasonPrompt } from '@/components/plan/ReasonPrompt';
import { CATEGORY_LABELS } from '@/lib/ai/plan-categories';
import { useToast } from '@/contexts/ToastContext';
import SetupOpeningScreen from '@/components/plan/SetupOpeningScreen';
import Moment1InputForm, {
  Moment1PersonInput,
  ChannelCandidateOption,
} from '@/components/plan/Moment1InputForm';
import HouseholdCardList, { SavedHousehold } from '@/components/plan/HouseholdCardList';
import Moment1Summary from '@/components/plan/Moment1Summary';
import Moment2Opening from '@/components/plan/Moment2Opening';
import Moment2Step1Modal from '@/components/plan/Moment2Step1Modal';
import Moment2Step2Skeleton, { Moment2Plan } from '@/components/plan/Moment2Step2Skeleton';
import Moment2PlanView, {
  PlanCategory as Moment2PlanCategory,
  PlanItem as Moment2PlanItem,
} from '@/components/plan/Moment2PlanView';

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

/**
 * GTC-233: V2's own event shape. The V1 dashboard's `Event` interface carries ~40 fields;
 * the Moment flow reads exactly these four, so the route declares its own rather than
 * sharing a type with the surface it was extracted from.
 *
 * It extends `SerialisedEvent` because the plan view passes the whole event to
 * `askForReason`/`askForBatchReason`, which parse it through `toLifecycleEvent` to decide
 * whether the why-scope rule fires (GTC-202). Reusing the exported interface keeps that
 * one parse, one definition — rather than restating status/sentAt/endDate here.
 */
interface SetupEvent extends SerialisedEvent {
  id: string;
  name: string;
  guestCount: number | null;
  hostId: string;
}

/**
 * GTC-233: the item shape the why-scope lookups need. `PlanApiItem` above already carries
 * every field `fieldChanges` compares against the PATCH body; `assignment` is the one
 * addition, read by onUpdateItem/onRemoveItem to answer GTC-202's assignmentResponse.
 */
type SetupItem = PlanApiItem & {
  assignment: {
    response: 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'MAYBE';
    person: { id: string; name: string };
  } | null;
};

export default function EventSetupPage() {
  const params = useParams();
  const eventId = params.eventId as string;
  const toast = useToast();
  const {
    ask: askForReason,
    askForBatch: askForBatchReason,
    element: reasonPrompt,
  } = useReasonPrompt();

  const [event, setEvent] = useState<SetupEvent | null>(null);
  const [items, setItems] = useState<SetupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // GTC-233: arriving at this route IS the request to start setup, so the opening screen
  // shows unconditionally. Replaces the retired `?setup=true` read.
  const [showSetup, setShowSetup] = useState(true);
  const [showMoment1, setShowMoment1] = useState(false);
  const [moment1Phase, setMoment1Phase] = useState<'input' | 'summary'>('input');
  const [showMoment2Opening, setShowMoment2Opening] = useState(false);
  const [showMoment2Step1, setShowMoment2Step1] = useState(false);
  const [showMoment2Step2Skeleton, setShowMoment2Step2Skeleton] = useState(false);
  const [moment2Plan, setMoment2Plan] = useState<Moment2Plan | null>(null);
  const [showMoment2PlanView, setShowMoment2PlanView] = useState(false);
  const [moment2PlanCategories, setMoment2PlanCategories] = useState<Moment2PlanCategory[]>([]);
  const [households, setHouseholds] = useState<SavedHousehold[]>([]);
  const [channelCandidates, setChannelCandidates] = useState<ChannelCandidateOption[]>([]);
  const [editingHousehold, setEditingHousehold] = useState<SavedHousehold | null>(null);
  const moment1FormRef = useRef<HTMLDivElement>(null);
  // GTC-236: 'plan', a categoryKey, or null when no regeneration is running.
  const [regeneratingScope, setRegeneratingScope] = useState<'plan' | string | null>(null);

  useEffect(() => {
    if (eventId === 'new' || !eventId) {
      setError('Invalid event ID. Please navigate from the demo page or use a valid event link.');
      setLoading(false);
      return;
    }

    loadEvent();
    // GTC-202: `items` backs the assignmentResponse lookup in the plan view's edit and
    // remove handlers. It must be loaded on mount for that lookup to be reliable rather
    // than best-effort — see the comment at those call sites.
    loadItems();
  }, [eventId]);

  const loadEvent = async () => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) throw new Error('Failed to load event');
      const data = await response.json();
      setEvent(data.event);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
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

  const apiHouseholdToSaved = useCallback((h: any): SavedHousehold => {
    const primary = h.members?.find((m: any) => m.householdRole === 'PRIMARY_CONTACT');
    const partnerMember = h.members?.find((m: any) => m.householdRole === 'PARTNER');
    // GTC-172 (C1): "kid with a job" is now isYoungPerson, not householdRole === CHILD.
    // A young person the host deliberately roled as an adult (§10.6) is stored GUEST so
    // they are messageable, but they are still a kid with a job and must round-trip
    // back into the helpers list rather than silently reappearing among the guests.
    const helperMembers =
      h.members?.filter((m: any) => m.isYoungPerson || m.householdRole === 'CHILD') || [];
    const guestMembers =
      h.members?.filter((m: any) => m.householdRole === 'GUEST' && !m.isYoungPerson) || [];
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
        // Reflects the STORED role, so the control shows the host what she chose.
        adultRoled: m.householdRole !== 'CHILD',
      })),
      littleCount: h.littleCount || 0,
      guests: guestMembers.map((g: any) => ({
        personEventId: g.id,
        name: g.person?.name || '',
        email: g.person?.email || undefined,
        phone: g.person?.phoneNumber || undefined,
      })),
      contactPersonEventId: h.contactPersonEventId ?? null,
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
        // GTC-172 (C1): the contact picker is CROSS-HOUSEHOLD capable (§10.7) —
        // Grandma's channel may live in another household — so candidates are
        // gathered across the whole event, not per household. CHILD-role members are
        // omitted here as a courtesy; the gate is the eligibility layer, not this list.
        setChannelCandidates(
          (data.households ?? []).flatMap((h: any) =>
            (h.members ?? [])
              .filter((m: any) => m.householdRole !== 'CHILD')
              .map((m: any) => ({
                personEventId: m.id,
                name: m.person?.name || 'Unknown',
                householdName:
                  h.members?.find((x: any) => x.householdRole === 'PRIMARY_CONTACT')?.person
                    ?.name || 'Household',
                householdId: h.id,
              }))
          )
        );
      }
    };
    fetchHouseholds();
  }, [showMoment1, showMoment2PlanView, event, apiHouseholdToSaved]);

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

  const handleRegenerate = async (scope: 'plan' | 'category', categoryKey?: string) => {
    setRegeneratingScope(scope === 'plan' ? 'plan' : (categoryKey ?? null));
    try {
      const res = await fetch(`/api/events/${eventId}/regenerate-plan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, ...(categoryKey ? { categoryKey } : {}) }),
      });
      if (res.status === 429) {
        toast.error("You've used all 10 AI calls for this event.");
        return;
      }
      if (!res.ok) throw new Error('Failed to regenerate');
      const data = await res.json();
      if (data.noop) {
        // Founder refinement: enabled trigger + explanation beats a disabled control.
        toast.info(
          scope === 'plan'
            ? 'Nothing to regenerate — every item in this plan was added or edited by you.'
            : 'Nothing to regenerate — every item in this category was added or edited by you.'
        );
        return;
      }
      // Categories drive the view; items back the GTC-202 assignmentResponse lookup —
      // both must be fresh after a regenerate.
      setMoment2PlanCategories(await loadMoment2PlanCategories());
      await loadItems();
      toast.success(
        scope === 'plan'
          ? 'Plan regenerated'
          : `${CATEGORY_LABELS[categoryKey ?? ''] ?? categoryKey} regenerated`
      );
    } catch {
      toast.error('Failed to regenerate. Please try again.');
    } finally {
      setRegeneratingScope(null);
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
          <a
            href="/plan/events"
            className="inline-block px-4 py-2 bg-accent text-white rounded-md hover:bg-accent-dark"
          >
            Back to events
          </a>
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
                channelCandidates={channelCandidates}
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
      <>
        {/* GTC-202: this branch returns early, so the prompt is rendered here too —
            otherwise a T3/T4 on this surface would await a dialog that never mounts. */}
        {reasonPrompt}
        <Moment2PlanView
          eventId={event.id}
          eventName={event.name}
          guestCount={planGuestCount}
          categories={moment2PlanCategories}
          onRegeneratePlan={() => handleRegenerate('plan')}
          onRegenerateCategory={(categoryKey) => handleRegenerate('category', categoryKey)}
          regeneratingScope={regeneratingScope}
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
            // GTC-202: T4. PlanItem carries no assignment, so the response comes from
            // `items` — loaded on mount for every path that can reach this view, so the
            // lookup is reliable rather than best-effort.
            const known = items.find((i) => i.id === itemId);
            const answer = await askForBatchReason(
              fieldChanges(
                {
                  action: 'EDIT_ITEM',
                  targetType: 'Item',
                  targetId: itemId,
                  context: { assignmentResponse: known?.assignment?.response ?? null },
                },
                (known ?? {}) as Record<string, unknown>,
                body,
                ASK_FIELDS
              ),
              event
            );
            if (!answer.proceed) return;
            const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...body, reason: answer.reason }),
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
            // GTC-202: T3, same lookup as onUpdateItem above.
            const known = items.find((i) => i.id === itemId);
            const answer = await askForReason(
              {
                action: 'DELETE_ITEM',
                targetType: 'Item',
                targetId: itemId,
                context: { assignmentResponse: known?.assignment?.response ?? null },
              },
              event
            );
            if (!answer.proceed) return;
            const res = await fetch(`/api/events/${eventId}/items/${itemId}`, {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ reason: answer.reason }),
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
            // GTC-233: V2 owns the experience end to end, so approving no longer falls
            // through to the V1 dashboard. There is no V2 surface after the plan yet
            // (invites/people/nudges are still V1-only), so the host stays here on a
            // refreshed plan.
            await loadEvent();
            await loadItems();
            setMoment2PlanCategories(await loadMoment2PlanCategories());
            setMoment2Plan(null);
            toast.success('Plan approved.');
          }}
          onBack={() => {
            setShowMoment2PlanView(false);
            setMoment2PlanCategories([]);
            setShowMoment2Step1(true);
          }}
        />
      </>
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
          // Fallback path (unused when onReady auto-transitions). GTC-233: land on the
          // V2 plan view rather than exiting to nothing.
          await loadEvent();
          await loadItems();
          setMoment2PlanCategories(await loadMoment2PlanCategories());
          setShowMoment2Step2Skeleton(false);
          setShowMoment2PlanView(true);
          setMoment2Plan(null);
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

  // GTC-233: every V2 stage returns above. Reaching here means no stage is active, which
  // only happens transiently between state updates.
  return null;
}
