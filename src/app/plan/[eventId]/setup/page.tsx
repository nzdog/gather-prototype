'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { ASK_FIELDS, fieldChanges } from '@/lib/ledger';
import type { SerialisedEvent } from '@/lib/lifecycle';
import { useReasonPrompt } from '@/components/plan/ReasonPrompt';
import { CATEGORY_LABELS } from '@/lib/ai/plan-categories';
import { hasGeneratedPlan, resolveSetupStage, type SetupStage } from '@/lib/setup/entry-stage';
import { useToast } from '@/contexts/ToastContext';
import SetupOpeningScreen from '@/components/plan/SetupOpeningScreen';
import Moment1InputForm, {
  Moment1PersonInput,
  ChannelCandidateOption,
  HostHouseholdPayload,
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
import Moment3AssignView, {
  Moment3Category,
  Moment3Holder,
} from '@/components/plan/Moment3AssignView';
import type { PanelHouseholdInput } from '@/lib/moment3/people';
import { M3_WORDS } from '@/lib/moment3/words';
import { boardHref } from '@/lib/events/home-href';
import { holdNotice, holdThePlan, type HoldNotice } from '@/lib/moment3/hold';
import type { InvitesOnlyState } from '@/lib/setup/invites-only';
import type { ArcDoor } from '@/components/plan/MomentArc';
import EventDetails, { type EventDetailsFacts } from '@/components/shared/EventDetails';
import {
  STRIP_WORDS,
  requestedStage,
  stripDoors,
  type MomentNumber,
  type StripTarget,
} from '@/lib/moments/strip';

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
  /**
   * GTC-235: provenance, read by the entry rule to answer "is there a plan here yet".
   * Already on the wire — `GET /api/events/[id]/items` selects no subset, so every Item
   * scalar comes back — and declared here because it is now read rather than ignored.
   */
  source?: 'GENERATED' | 'TEMPLATE' | 'MANUAL' | 'HOST_EDITED' | null;
  quantityAmount: number | null;
  quantityUnit: string | null;
  quantityUnitCustom: string | null;
  quantityText: string | null;
  notes: string | null;
  dietaryTags: unknown;
  displayOrder: number | null;
  team: { id: string; name: string; displayOrder?: number };
};

/**
 * GTC-355: Moment 3's view of the plan — the same rows, in the plan view's order, each with
 * its kind, its quantity and unit, and who holds it. Built from `GET /api/events/[id]/items`,
 * which already carries `kind` and `assignment.person`.
 */
type Moment3ApiItem = PlanApiItem & {
  kind?: string;
  assignment: { person: { id: string; name: string } } | null;
};

function mapItemsToMoment3(items: Moment3ApiItem[]): {
  categories: Moment3Category[];
  holders: Record<string, Moment3Holder | null>;
} {
  const teams = new Map<string, { id: string; name: string; displayOrder: number }>();
  for (const item of items) {
    teams.set(item.team.id, {
      id: item.team.id,
      name: item.team.name,
      displayOrder: item.team.displayOrder ?? 0,
    });
  }
  const holders: Record<string, Moment3Holder | null> = {};
  const categories = [...teams.values()]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.name.localeCompare(b.name))
    .map((team) => ({
      id: team.id,
      name: team.name,
      emoji: emojiForCategoryName(team.name),
      items: items
        .filter((i) => i.team.id === team.id)
        .sort(
          (a, b) =>
            (a.displayOrder ?? Number.MAX_SAFE_INTEGER) -
            (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
        )
        .map((item) => {
          holders[item.id] = item.assignment
            ? { personId: item.assignment.person.id, name: item.assignment.person.name }
            : null;
          const kind = item.kind ?? 'ITEM';
          const amountAndUnit = [item.quantityAmount ?? '', mapItemUnitToDisplay(item)]
            .filter((x) => x !== '')
            .join(' ');
          return {
            id: item.id,
            name: item.name,
            kind,
            detail: kind === 'TASK' ? '' : amountAndUnit || (item.quantityText ?? ''),
          };
        }),
    }));
  return { categories, holders };
}

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
  /**
   * GTC-235: the V1/V2 discriminator, and the first input to the entry rule. Already
   * on the wire — `EVENT_WIRE_SELECT` names it so the events list can route on it —
   * so reading it here costs no extra request.
   */
  setup: {
    id: string;
    planApprovedAt?: string | null;
    /** [[GTC-368]] (Q14): Moment 2's answer, the details' Occasion (on the wire, `EVENT_WIRE_SELECT`). */
    eventType?: string | null;
    eventTypeOther?: string | null;
    /** [[GTC-374]]: invites only, on the wire (`EVENT_WIRE_SELECT`). */
    invitesOnly?: boolean;
  } | null;
  /** [[GTC-368]] (item 17): the rest of the details, already on the wire (`EVENT_WIRE_SELECT`). */
  startDate: string;
  venueName?: string | null;
  venueTimingStart?: string | null;
  venueTimingEnd?: string | null;
  occasionDescription?: string | null;
  /**
   * GTC-355: Moment 3's conflict recheck fires only once a check has been run, the old
   * dashboard's guard. Already on the wire (`EVENT_WIRE_SELECT`).
   */
  lastCheckPlanAt?: string | null;
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

  /**
   * ⚠ OVERTURNED 2026-09-12 by GTC-235, deliberately, and left here rather than deleted.
   *
   * GTC-233 ruled: "arriving at this route IS the request to start setup, so the opening
   * screen shows unconditionally" — which is why this initialised `true`. That was a
   * decision, not an oversight, and it is being reversed as one. Unconditional meant a
   * reload sent a host with a finished plan back to "Ready to start herding", and her
   * only way forward was to generate again.
   *
   * The stage is now resolved from stored state by `resolveSetupStage` before first
   * paint, so every flag below initialises `false` and the mount effect sets exactly one.
   * GTC-233's Scenario 2 evidence ("Opening screen with no query param") records the old
   * behaviour and is annotated on that ticket as superseded.
   */
  const [showSetup, setShowSetup] = useState(false);
  const [showMoment1, setShowMoment1] = useState(false);
  /**
   * GTC-256 (phase 2): 'host' is Moment 1's new FIRST phase — the host's own household.
   *
   * Ruling 1's "Moment 1 OPENS with the host's own household" is a SEQUENCE GUARANTEE,
   * not a screen order: her row must exist before any other household can be entered, or
   * `createMember` files her as a `role: 'PARTICIPANT'` the first time her email appears
   * in someone else's household. This ordering is the client half of that; the server
   * half is the 409 on `POST /api/events/[id]/households`, and the server half is the one
   * that actually holds.
   */
  const [moment1Phase, setMoment1Phase] = useState<'host' | 'input' | 'summary'>('host');
  const [hostStep, setHostStep] = useState<{
    loading: boolean;
    host: { name: string; email: string | null; phone: string | null } | null;
  }>({ loading: true, host: null });
  const [showMoment2Opening, setShowMoment2Opening] = useState(false);
  const [showMoment2Step1, setShowMoment2Step1] = useState(false);
  const [showMoment2Step2Skeleton, setShowMoment2Step2Skeleton] = useState(false);
  const [moment2Plan, setMoment2Plan] = useState<Moment2Plan | null>(null);
  const [showMoment2PlanView, setShowMoment2PlanView] = useState(false);
  const [moment2PlanCategories, setMoment2PlanCategories] = useState<Moment2PlanCategory[]>([]);
  // GTC-355: Moment 3, the fifth stage, and what it shows.
  const [showMoment3, setShowMoment3] = useState(false);
  const [moment3Data, setMoment3Data] = useState<{
    categories: Moment3Category[];
    holders: Record<string, Moment3Holder | null>;
    households: PanelHouseholdInput[];
    headcount: number;
  } | null>(null);
  // [[GTC-360]] — "Move on →" holds the plan; while it works, and what it says if it cannot.
  const [holding, setHolding] = useState(false);
  // [[GTC-374]] — the invites-only choice on Moment 2's opening: W3 while it works, W4, W5.
  const [invitesOnlyState, setInvitesOnlyState] = useState<InvitesOnlyState>('idle');
  const [holdNoticeShown, setHoldNoticeShown] = useState<HoldNotice | null>(null);

  /**
   * [[GTC-360]] — "MOVE ON →" HOLDS THE PLAN, THEN GOES ON. Founder: *"On "Move on" from Moment 3
   * (Recommended)"*. A sent event goes straight to `target` (the board, [[GTC-357]]); an unsent one is
   * held first by `holdThePlan` — a held but unsent one is not held twice — and only then opened on
   * the pre-flight. Anything that keeps her in Moment 3 is said in the completion panel.
   */
  const moveOn = async (target: string) => {
    if (!event) return;
    if (event.sentAt) {
      window.location.href = target;
      return;
    }
    setHolding(true);
    setHoldNoticeShown(null);
    const outcome = await holdThePlan({ eventId, status: event.status });
    if (outcome.kind === 'GO') {
      window.location.href = target;
      return;
    }
    setHolding(false);
    setHoldNoticeShown(holdNotice(outcome, eventId));
  };
  const [households, setHouseholds] = useState<SavedHousehold[]>([]);
  const [channelCandidates, setChannelCandidates] = useState<ChannelCandidateOption[]>([]);
  const [editingHousehold, setEditingHousehold] = useState<SavedHousehold | null>(null);
  const moment1FormRef = useRef<HTMLDivElement>(null);
  // [[GTC-365]] item 16: the household being typed in Moment 1, shown in the column before Save.
  // It lives only here; nothing is written until she presses Save.
  const [moment1Draft, setMoment1Draft] = useState<SavedHousehold | null>(null);
  const desktopColumnRef = useRef<HTMLDivElement>(null);
  // [[GTC-365]] Q2: on a computer the column keeps that card in view by scrolling itself, never the
  // page. (On a phone the column sits below the form, so nothing above the form grows.)
  useEffect(() => {
    const col = desktopColumnRef.current;
    const card = col?.querySelector<HTMLElement>('[data-draft-card]');
    if (!col || !card) return;
    const top = card.offsetTop;
    const bottom = top + card.offsetHeight;
    if (bottom > col.scrollTop + col.clientHeight) col.scrollTop = bottom - col.clientHeight;
    else if (top < col.scrollTop) col.scrollTop = top;
  }, [moment1Draft]);
  // GTC-236: 'plan', a categoryKey, or null when no regeneration is running.
  const [regeneratingScope, setRegeneratingScope] = useState<'plan' | string | null>(null);
  /**
   * [[GTC-368]] (C5): her answer on Moment 2's questions, as she gives it. The page read the event
   * once, so without this the details would show the occasion as it was when the page opened.
   */
  const [liveOccasion, setLiveOccasion] = useState<{
    eventType: string | null;
    eventTypeOther: string | null;
  } | null>(null);

  /**
   * GTC-235: show exactly one stage, chosen by the entry rule.
   *
   * Every flag is cleared first, so this is the only place that decides which surface is
   * live and there is no arrangement of calls that leaves two of them true.
   */
  const applyStage = useCallback((stage: SetupStage | 'moment2-opening') => {
    setShowSetup(stage === 'opening');
    setShowMoment1(stage === 'moment1');
    // [[GTC-367]]: the strip can open Moment 2's opening too, so it is one of the stages here.
    setShowMoment2Opening(stage === 'moment2-opening');
    setShowMoment2Step1(stage === 'moment2-step1');
    setShowMoment2Step2Skeleton(false);
    setShowMoment2PlanView(stage === 'plan');
    setShowMoment3(stage === 'moment3');
  }, []);

  useEffect(() => {
    if (eventId === 'new' || !eventId) {
      setError('Invalid event ID. Please navigate from the demo page or use a valid event link.');
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        // GTC-202: `items` backs the assignmentResponse lookup in the plan view's edit
        // and remove handlers. It must be loaded on mount for that lookup to be reliable
        // rather than best-effort — see the comment at those call sites. GTC-235 reads
        // the same rows for `source`, so the entry rule costs no request of its own.
        const [loadedEvent, loadedItems] = await Promise.all([loadEvent(), loadItems()]);
        if (cancelled || !loadedEvent) return;

        /**
         * The third input, fetched ONLY when it can change the answer. With an
         * `EventSetup` row the rule never reads the household count, and GTC-233
         * verified this route makes exactly two mount requests — a third one on every
         * load would undo that for the common case.
         */
        let householdCount = 0;
        if (!loadedEvent.setup) {
          const res = await fetch(`/api/events/${eventId}/households`);
          if (res.ok) householdCount = ((await res.json()).households ?? []).length;
        }
        if (cancelled) return;

        let stage: SetupStage | 'moment2-opening' = resolveSetupStage({
          items: loadedItems,
          hasSetup: Boolean(loadedEvent.setup),
          householdCount,
          // GTC-355: an approved plan opens at Moment 3, so a returning host lands there.
          planApproved: Boolean(loadedEvent.setup?.planApprovedAt),
          // [[GTC-374]]: an invites-only event has no plan to open.
          invitesOnly: Boolean(loadedEvent.setup?.invitesOnly),
        });
        /*
         * [[GTC-367]] (item 2) — a strip tap from another page (the pre-flight) asks for a Moment by
         * the address: `?at=people` or `?at=plan`. Read once, here; anything else leaves the entry
         * rule's answer. The address is then put back to this page's own, so a reload follows the
         * stored state as it always has. This page reads no `useSearchParams` (KB-003).
         */
        const at = new URLSearchParams(window.location.search).get('at');
        const asked = requestedStage(at, { hasPlan: hasGeneratedPlan(loadedItems) });
        if (asked) stage = asked;
        if (at !== null) {
          window.history.replaceState(window.history.state, '', window.location.pathname);
        }
        /*
         * [[GTC-374]] — where an invites-only event is up to: the board once the invitations have
         * gone, the pre-flight once it is held, else Moment 2's opening (her choice stored and the
         * hold not yet made, so she can press it again). Taps from another page (`?at=`) win above.
         */
        if (stage === 'invites-only') {
          if (loadedEvent.sentAt) {
            window.location.replace(boardHref(eventId));
            return;
          }
          if (loadedEvent.status !== 'DRAFT') {
            window.location.replace(`/plan/${eventId}/pre-flight`);
            return;
          }
          stage = 'moment2-opening';
        }
        if (stage === 'plan') {
          setMoment2PlanCategories(await loadMoment2PlanCategories());
        }
        if (stage === 'moment3') {
          setMoment3Data(await loadMoment3Data());
        }
        applyStage(stage);
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? 'Failed to load this event');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const loadEvent = async (): Promise<SetupEvent | null> => {
    try {
      const response = await fetch(`/api/events/${eventId}`);
      if (!response.ok) throw new Error('Failed to load event');
      const data = await response.json();
      setEvent(data.event);
      return data.event as SetupEvent;
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
      return null;
    }
  };

  const loadItems = async (): Promise<SetupItem[]> => {
    try {
      const response = await fetch(`/api/events/${eventId}/items`);
      if (!response.ok) throw new Error('Failed to load items');
      const data = await response.json();
      setItems(data.items || []);
      return (data.items || []) as SetupItem[];
    } catch (err: any) {
      console.error('Error loading items:', err);
      return [];
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
      // GTC-256 (Ruling 8 + Ruling 10): her membership carries `role: HOST`, and it is
      // the only row on the event that does. Derived here rather than stored on the
      // household — the household has no host of its own, it merely contains her.
      isHostHousehold: (h.members ?? []).some((m: any) => m.role === 'HOST'),
      messagesMuted: h.messagesMuted ?? null,
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

  /**
   * GTC-256 (phase 2): who she is, and whether she has already done this step.
   *
   * `household` non-null means her row exists, so the step is skipped rather than
   * offered twice — she edits her household from the card list like any other, which is
   * the path the demotion guard protects. It never RE-OFFERS the step, because the POST
   * is create-only and would 409.
   */
  useEffect(() => {
    if (!event || !showMoment1) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/events/${event.id}/host-household`);
        if (!res.ok) throw new Error('Failed to load host household');
        const data = await res.json();
        if (cancelled) return;
        setHostStep({ loading: false, host: data.host ?? null });
        if (data.household) setMoment1Phase((prev) => (prev === 'host' ? 'input' : prev));
      } catch {
        if (!cancelled) setHostStep({ loading: false, host: null });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showMoment1, event]);

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

  /**
   * GTC-355: what Moment 3 reads — the plan's rows with their holders, and Moment 1's
   * households with every membership column (`justAttending` among them). Two reads the
   * flow already makes; no new route. The headcount is Moment 1's ("X people coming"):
   * every member plus each household's kids without jobs.
   */
  const loadMoment3Data = async () => {
    const [itemsRes, householdsRes] = await Promise.all([
      fetch(`/api/events/${eventId}/items`),
      fetch(`/api/events/${eventId}/households`),
    ]);
    if (!itemsRes.ok || !householdsRes.ok) {
      throw new Error('Failed to load plan data');
    }
    const items = ((await itemsRes.json()).items ?? []) as Moment3ApiItem[];
    const households = ((await householdsRes.json()).households ?? []) as PanelHouseholdInput[];
    const headcount = households.reduce(
      (sum, h) => sum + h.members.length + (h.littleCount ?? 0),
      0
    );
    return { ...mapItemsToMoment3(items), households, headcount };
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

  /*
   * [[GTC-367]] (item 2) — THE STRIP'S TAPS. One rule says which Moments open (`stripDoors`); this
   * turns a door into a stage. A tap never approves, holds or sends: Moment 3 opens only once the
   * plan is approved, the pre-flight only once it is held, and the board only once it is sent.
   */
  const hostSaved = Boolean(event?.setup) || households.some((h) => h.isHostHousehold);
  const goToMoment = async (target: StripTarget) => {
    if (target === 'preflight') {
      window.location.href = `/plan/${eventId}/pre-flight`;
      return;
    }
    if (target === 'board') {
      window.location.href = boardHref(eventId);
      return;
    }
    if (target === 'moment1') {
      setEditingHousehold(null);
      setMoment1Phase(hostSaved ? 'input' : 'host');
      applyStage('moment1');
      return;
    }
    if (target === 'moment3') {
      await loadItems();
      setMoment3Data(await loadMoment3Data());
      applyStage('moment3');
      return;
    }
    // Moment 2: the plan view when there is a plan, else Moment 2's opening — "On to the plan →"'s
    // rule (GTC-235). Read fresh: after a first generation `items` has not been reloaded.
    const fresh = await loadItems();
    if (hasGeneratedPlan(fresh)) {
      setMoment2PlanCategories(await loadMoment2PlanCategories());
      applyStage('plan');
      return;
    }
    applyStage('moment2-opening');
  };
  /** The strip's doors for a screen; `blocked` keeps her where she is (W9, W9b) with its line. */
  const doorsFor = (
    current: MomentNumber,
    blocked: string | null = null
  ): Partial<Record<MomentNumber, ArcDoor>> => {
    const all = stripDoors({
      hostSaved,
      hasPlan: hasGeneratedPlan(items),
      planApproved: Boolean(event?.setup?.planApprovedAt),
      held: Boolean(event && event.status !== 'DRAFT'),
      sent: Boolean(event?.sentAt),
      invitesOnly: Boolean(event?.setup?.invitesOnly),
    });
    const doors: Partial<Record<MomentNumber, ArcDoor>> = {};
    for (const n of [1, 2, 3, 4] as const) {
      if (n === current) continue;
      const door = all[n];
      // [[GTC-374]]: a not-needed Moment says so on the strip, and its door is the rule's.
      const notNeeded = door.kind === 'not-needed' ? { notNeeded: true as const } : {};
      if ('line' in door) doors[n] = { locked: door.line, ...notNeeded };
      else if (blocked) doors[n] = { locked: blocked, ...notNeeded };
      else doors[n] = { onGo: () => void goToMoment(door.target), ...notNeeded };
    }
    return doors;
  };

  /** [[GTC-368]] (item 17): the event's name and its details, for every screen of the flow. */
  const details: EventDetailsFacts | undefined = event
    ? {
        id: event.id,
        name: event.name,
        startDate: event.startDate,
        endDate: event.endDate,
        venueName: event.venueName,
        venueTimingStart: event.venueTimingStart,
        venueTimingEnd: event.venueTimingEnd,
        occasionDescription: event.occasionDescription,
        eventType: liveOccasion ? liveOccasion.eventType : (event.setup?.eventType ?? null),
        eventTypeOther: liveOccasion
          ? liveOccasion.eventTypeOther
          : (event.setup?.eventTypeOther ?? null),
      }
    : undefined;

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
        doors={doorsFor(1)}
        details={details}
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
          doors={doorsFor(2)}
          details={details}
          onContinue={async () => {
            setMoment1Phase('input');
            /**
             * GTC-235: forward on the first pass, BACK on a return visit.
             *
             * Moment 1 is now reachable from the plan view, so "Continue" has two
             * correct answers and the difference is whether a plan already exists. It
             * reads the same predicate the entry rule reads, so there is one definition
             * of "there is a plan here" rather than two that can drift apart. Sending a
             * returning host to Moment 2's opening would walk her at the Generate button
             * she has no reason to press.
             *
             * [[GTC-367]]: the strip's "What's the plan?" goes by the same rule, so both go
             * through `goToMoment`, which reads the items fresh (after a first generation the
             * page's `items` were never reloaded, and this sent her to the opening).
             */
            await goToMoment('plan');
          }}
          onBackToEditing={() => {
            setMoment1Phase('input');
          }}
        />
      );
    }

    /**
     * GTC-256 (phase 2) — Moment 1's first phase: the host's own household.
     *
     * Renders the ordinary capture form in `hostMode`, so the partner / kid-with-a-job /
     * kid-without-a-job / guest sub-forms, the phone normalisation and the validation are
     * the same ones every other household gets. What differs is what the form CANNOT do
     * here: name a different primary (it is `Event.hostId`'s Person, Ruling 10), edit the
     * account email, or pick a cross-household channel.
     */
    if (moment1Phase === 'host') {
      if (hostStep.loading || !hostStep.host) {
        return (
          <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
            <div className="text-gray-600">
              {hostStep.loading ? 'Loading…' : 'Could not load your details. Please reload.'}
            </div>
          </div>
        );
      }

      const handleSaveHostHousehold = async (payload: HostHouseholdPayload) => {
        const res = await fetch(`/api/events/${event.id}/host-household`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Failed to save your household');
        }
        const data = await res.json();
        setHouseholds((prev) => [...prev, apiHouseholdToSaved(data.household)]);
        setMoment1Phase('input');
      };

      return (
        <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
          <div className="max-w-5xl mx-auto px-6 py-8">
            {/* [[GTC-367]] (item 31, W1; correction C1): her own household's step had no way out.
                [[GTC-368]] (item 17, Q1): the event's name across from it. */}
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <a
                href="/plan/events"
                className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
              >
                {STRIP_WORDS.YOUR_EVENTS}
              </a>
              {details && <EventDetails facts={details} />}
            </div>
            <div className="max-w-[640px]">
              <Moment1InputForm
                eventId={event.id}
                eventName={event.name}
                stripDoors={doorsFor(1)}
                onComplete={() => setMoment1Phase('input')}
                onAddPerson={async () => {}}
                hostMode={hostStep.host}
                onSaveHostHousehold={handleSaveHostHousehold}
                channelCandidates={[]}
              />
            </div>
          </div>
        </div>
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
          {/* GTC-235: the way out of the longest-dwell overlay. Every Moment 1 screen is
              `fixed inset-0 z-50` and so covers the global navigation, and the entry rule
              now HOLDS a half-finished host here across a reload rather than returning
              her to an opening screen she could leave. Without this she has the URL bar
              and nothing else. */}
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <a
              href="/plan/events"
              className="inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              {STRIP_WORDS.YOUR_EVENTS}
            </a>
            {/* [[GTC-368]] (item 17, Q1): the event's name across from the way out. */}
            {details && <EventDetails facts={details} />}
          </div>
          <div className="flex flex-col md:flex-row md:gap-8">
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
                onDraftChange={setMoment1Draft}
                stripDoors={doorsFor(
                  1,
                  // [[GTC-367]] (Q9): a household typed or being changed keeps her here.
                  editingHousehold
                    ? STRIP_WORDS.SAVE_CHANGES
                    : moment1Draft
                      ? STRIP_WORDS.SAVE_NEW_HOUSEHOLD
                      : null
                )}
              />
            </div>

            {/* [[GTC-365]] Q1 — a phone: the cards sit BELOW the form (they sat above it), so nothing
                above the form grows while she types, and the household being typed shows first,
                just under the Save buttons (Q2). */}
            <div className="md:hidden mt-8">
              <HouseholdCardList
                households={households}
                onEdit={handleEdit}
                onDelete={handleDeleteHousehold}
                editingHouseholdId={editingHousehold?.id}
                draft={moment1Draft}
                draftAt="start"
              />
            </div>

            {/* Right column: card list (desktop only) */}
            <div className="hidden md:block w-80 flex-shrink-0">
              <div
                ref={desktopColumnRef}
                className="sticky top-8 max-h-[calc(100vh-4rem)] overflow-y-auto"
              >
                <HouseholdCardList
                  households={households}
                  onEdit={handleEdit}
                  onDelete={handleDeleteHousehold}
                  editingHouseholdId={editingHousehold?.id}
                  draft={moment1Draft}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (showMoment3 && event && moment3Data) {
    return (
      <>
        {/* GTC-202: this branch returns early, so the why prompt is rendered here too —
            after the press, each Moment 3 change asks it (the route's T1). */}
        {reasonPrompt}
        <Moment3AssignView
          eventId={event.id}
          event={event}
          hostPersonId={event.hostId}
          headcount={moment3Data.headcount}
          categories={moment3Data.categories}
          initialHolders={moment3Data.holders}
          households={moment3Data.households}
          askForReason={askForReason}
          askForBatchReason={askForBatchReason}
          onBack={async () => {
            // "← Back to the plan" (ruling Q14). Her approval stays: "Plan looks good →"
            // brings her straight back, and a reload opens Moment 3.
            await loadItems();
            setMoment2PlanCategories(await loadMoment2PlanCategories());
            setShowMoment3(false);
            setMoment3Data(null);
            setShowMoment2PlanView(true);
          }}
          onMoveOn={() => {
            // "Move on →" goes to the pre-flight (ruling Q5): the Hinge sits between 3 and 4.
            // [[GTC-357]] Q5: once the invitations have gone, the board is the event's home.
            // [[GTC-360]]: before the press, the plan is held first (`moveOn`).
            void moveOn(event.sentAt ? boardHref(eventId) : `/plan/${eventId}/pre-flight`);
          }}
          holding={holding}
          holdNotice={holdNoticeShown}
          stripDoors={doorsFor(3)}
          details={details}
        />
      </>
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
                // GTC-302: brought or done. A job carries no quantity, so none is sent for one.
                kind: newItem.kind,
                ...(newItem.kind === 'TASK'
                  ? {}
                  : {
                      quantityAmount: newItem.quantity,
                      quantityUnit: 'CUSTOM',
                      quantityUnitCustom: newItem.unit,
                      quantityText: newItem.servingSize || undefined,
                    }),
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
            // GTC-355: approving opens Moment 3 straight away, with no button between
            // (acceptance 1). It stamps `EventSetup.planApprovedAt` first, so a reload — or a
            // host coming back tomorrow — lands in Moment 3 too (ruling Q4). GTC-233's rule
            // stands: approving never falls through to the V1 dashboard.
            const res = await fetch(`/api/events/${eventId}/setup`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ planApproved: true }),
            });
            if (!res.ok) {
              toast.error(M3_WORDS.SAVE_FAILED);
              return;
            }
            await loadEvent();
            await loadItems();
            setMoment3Data(await loadMoment3Data());
            setMoment2Plan(null);
            applyStage('moment3');
            toast.success('Plan approved.');
          }}
          onBack={() => {
            setShowMoment2PlanView(false);
            setMoment2PlanCategories([]);
            setShowMoment2Step1(true);
          }}
          onEditGuests={() => {
            // GTC-235: the only route back to Moment 1 from Moment 2. Her households
            // rehydrate from the server the moment the flag flips — the effect that
            // fetches them keys on `showMoment1`.
            setShowMoment2PlanView(false);
            setMoment1Phase('input');
            setShowMoment1(true);
          }}
          onGoToDashboard={() => {
            // GTC-235: a full navigation, not a stage change — the dashboard is a
            // different route and V2's stages are full-viewport overlays over it.
            window.location.href = `/plan/${eventId}`;
          }}
          stripDoors={doorsFor(2)}
          details={details}
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
        onBack={() => void goToMoment('moment1')}
        doors={doorsFor(2)}
        details={details}
        onOccasionChange={setLiveOccasion}
      />
    );
  }

  if (showMoment2Opening && event) {
    /*
     * [[GTC-374]] (item 14) — "Let’s do this →" on an invites-only event is her change of mind
     * (founder: *"if she changes her mind, tapping one starts a plan"*): the flag is cleared first,
     * through the setup route, then the questions open. The event stays held if it was: nothing
     * un-holds (plan Q5). A co-host is refused, and told W5.
     */
    const invitesOnly = Boolean(event.setup?.invitesOnly);
    const setInvitesOnly = async (value: boolean): Promise<boolean> => {
      setInvitesOnlyState('working');
      try {
        const res = await fetch(`/api/events/${eventId}/setup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ invitesOnly: value }),
        });
        if (!res.ok) {
          setInvitesOnlyState(res.status === 403 ? 'not-host' : 'failed');
          return false;
        }
        setEvent((e) => (e && e.setup ? { ...e, setup: { ...e.setup, invitesOnly: value } } : e));
        return true;
      } catch {
        setInvitesOnlyState('failed');
        return false;
      }
    };
    /*
     * [[GTC-374]] — W1: the choice is stored, then the event is held through the hold Moment 3 uses
     * (`holdThePlan`: the transition, its gate lifted for an invites-only event alone), then the
     * pre-flight opens. No "are you sure" (plan Q2): nothing is sent until she presses Send there.
     */
    const chooseInvitesOnly = async () => {
      if (invitesOnlyState === 'working') return;
      if (!(await setInvitesOnly(true))) return;
      setInvitesOnlyState('working');
      const outcome = await holdThePlan({ eventId, status: event.status });
      if (outcome.kind === 'GO') {
        window.location.href = `/plan/${eventId}/pre-flight`;
        return;
      }
      setInvitesOnlyState(outcome.kind === 'NOT_HOST' ? 'not-host' : 'failed');
    };
    // Until [[GTC-375]], never offered for an event with any item (plan Q13), nor after the press.
    const offerInvitesOnly = items.length === 0 && !event.sentAt;
    return (
      <Moment2Opening
        eventName={event.name}
        onStart={async () => {
          if (invitesOnly && !(await setInvitesOnly(false))) return;
          setInvitesOnlyState('idle');
          setShowMoment2Opening(false);
          setShowMoment2Step1(true);
        }}
        onBack={() => void goToMoment('moment1')}
        doors={doorsFor(2)}
        details={details}
        onInvitesOnly={offerInvitesOnly ? () => void chooseInvitesOnly() : undefined}
        invitesOnlyState={invitesOnlyState}
      />
    );
  }

  // GTC-233: every V2 stage returns above. Reaching here means no stage is active, which
  // only happens transiently between state updates.
  return null;
}
