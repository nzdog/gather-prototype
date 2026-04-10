'use client';

import { notFound } from 'next/navigation';
import { useState, useCallback } from 'react';
import type { Conflict, ConflictType } from '@prisma/client';
import ConflictCard from '@/components/plan/ConflictCard';

// ── Fixture data ──────────────────────────────────────────────────────────────

const now = new Date();

const INITIAL_FIXTURES: Conflict[] = [
  // 1. CRITICAL + OPEN + canDelegate + suggestion + affectedParties
  {
    id: 'fix-1',
    eventId: 'dev-event',
    fingerprint: 'fp-1',
    type: 'TIMING',
    severity: 'CRITICAL',
    claimType: 'CONSTRAINT',
    resolutionClass: 'FIX_IN_PLAN',
    title: 'Oven capacity exceeded at 6pm',
    description: '6 items need the oven at 18:00 but only 4 slots are available.',
    affectedItems: ['item-1', 'item-2'],
    affectedDays: null,
    affectedParties: ['BBQ Team', 'Mains Team'],
    equipment: 'oven',
    timeSlot: '18:00',
    capacityAvailable: 4,
    capacityRequired: 6,
    dietaryType: null,
    guestCount: null,
    category: null,
    currentCoverage: null,
    minimumNeeded: null,
    suggestion: {
      action: 'STAGGER_TIMING',
      reasoning: 'Stagger 2 items to 17:30 to stay within capacity.',
    },
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: true,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 2. CRITICAL + ACKNOWLEDGED
  {
    id: 'fix-2',
    eventId: 'dev-event',
    fingerprint: 'fp-2',
    type: 'EQUIPMENT_MISMATCH',
    severity: 'CRITICAL',
    claimType: 'RISK',
    resolutionClass: 'DECISION_REQUIRED',
    title: 'No BBQ available at venue',
    description: 'The venue does not have a BBQ but 3 items require grilling.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: ['Grill Team'],
    equipment: 'bbq',
    timeSlot: null,
    capacityAvailable: 0,
    capacityRequired: 1,
    dietaryType: null,
    guestCount: null,
    category: null,
    currentCoverage: null,
    minimumNeeded: null,
    suggestion: {
      action: 'SUBSTITUTE',
      reasoning: 'Switch grilled items to oven-based alternatives.',
    },
    inputsReferenced: null,
    status: 'ACKNOWLEDGED',
    viewed: true,
    viewDuration: 5,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: true,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 3. SIGNIFICANT + OPEN + canDelegate + suggestion
  {
    id: 'fix-3',
    eventId: 'dev-event',
    fingerprint: 'fp-3',
    type: 'DIETARY_GAP',
    severity: 'SIGNIFICANT',
    claimType: 'CONSTRAINT',
    resolutionClass: 'DELEGATE_ALLOWED',
    title: 'No gluten-free mains',
    description: '4 guests require gluten-free options but no main dishes are marked gluten-free.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: ['Mains Team'],
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: 'GLUTEN_FREE',
    guestCount: 4,
    category: null,
    currentCoverage: 0,
    minimumNeeded: 2,
    suggestion: {
      action: 'ADD_ITEMS',
      reasoning: 'Add 2 gluten-free main dishes to cover the gap.',
    },
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: true,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 4. SIGNIFICANT + DELEGATED
  {
    id: 'fix-4',
    eventId: 'dev-event',
    fingerprint: 'fp-4',
    type: 'COVERAGE_GAP',
    severity: 'SIGNIFICANT',
    claimType: 'PATTERN',
    resolutionClass: 'DELEGATE_ALLOWED',
    title: 'Desserts team has only 1 item',
    description: 'The desserts team has 1 item for 30 guests. At least 3 items are recommended.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: ['Desserts Team'],
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: null,
    guestCount: null,
    category: 'DESSERTS',
    currentCoverage: 1,
    minimumNeeded: 3,
    suggestion: {
      action: 'ADD_ITEMS',
      reasoning: 'Add 2 more dessert items for adequate variety.',
    },
    inputsReferenced: null,
    status: 'DELEGATED',
    viewed: true,
    viewDuration: 3,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: 'COORDINATOR',
    delegatedAt: now,
    canDelegate: true,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 5. ADVISORY + OPEN + canDelegate:false + suggestion
  {
    id: 'fix-5',
    eventId: 'dev-event',
    fingerprint: 'fp-5',
    type: 'QUANTITY_MISSING',
    severity: 'ADVISORY',
    claimType: 'PREFERENCE',
    resolutionClass: 'INFORMATIONAL',
    title: 'Placeholder quantity on "Bread rolls"',
    description: 'The item "Bread rolls" has a placeholder quantity that should be confirmed.',
    affectedItems: ['item-bread'],
    affectedDays: null,
    affectedParties: ['Sides Team'],
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: null,
    guestCount: null,
    category: null,
    currentCoverage: null,
    minimumNeeded: null,
    suggestion: {
      action: 'CONFIRM_QUANTITY',
      reasoning: 'Ask the coordinator to confirm quantity for bread rolls.',
    },
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: false,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 6. ADVISORY + OPEN + canDelegate:false + no suggestion + no affectedParties
  {
    id: 'fix-6',
    eventId: 'dev-event',
    fingerprint: 'fp-6',
    type: 'STRUCTURAL_IMBALANCE',
    severity: 'ADVISORY',
    claimType: 'ASSUMPTION',
    resolutionClass: 'INFORMATIONAL',
    title: 'Drinks team has no coordinator',
    description: 'The Drinks team has not been assigned a coordinator.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: null,
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: null,
    guestCount: null,
    category: null,
    currentCoverage: null,
    minimumNeeded: null,
    suggestion: null,
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: false,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 7. CRITICAL + canDelegate:false
  {
    id: 'fix-7',
    eventId: 'dev-event',
    fingerprint: 'fp-7',
    type: 'CONSTRAINT_VIOLATION',
    severity: 'CRITICAL',
    claimType: 'CONSTRAINT',
    resolutionClass: 'FIX_IN_PLAN',
    title: 'Zero mains for 30 guests',
    description: 'No main course items exist. This is a critical gap that must be addressed.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: null,
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: null,
    guestCount: 30,
    category: 'MAINS',
    currentCoverage: 0,
    minimumNeeded: 3,
    suggestion: null,
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: false,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
  // 8. ADVISORY + canDelegate:true
  {
    id: 'fix-8',
    eventId: 'dev-event',
    fingerprint: 'fp-8',
    type: 'DIETARY_GAP',
    severity: 'ADVISORY',
    claimType: 'PREFERENCE',
    resolutionClass: 'DELEGATE_ALLOWED',
    title: 'Only 1 dairy-free option',
    description:
      '2 guests are dairy-free but only 1 item is marked dairy-free. Consider adding more.',
    affectedItems: null,
    affectedDays: null,
    affectedParties: ['Sides Team', 'Mains Team'],
    equipment: null,
    timeSlot: null,
    capacityAvailable: null,
    capacityRequired: null,
    dietaryType: 'DAIRY_FREE',
    guestCount: 2,
    category: null,
    currentCoverage: 1,
    minimumNeeded: 2,
    suggestion: { action: 'ADD_ITEMS', reasoning: 'Add 1 dairy-free option to close the gap.' },
    inputsReferenced: null,
    status: 'OPEN',
    viewed: false,
    viewDuration: 0,
    whyThisViewed: false,
    dismissedWithoutReading: false,
    resolvedBy: null,
    resolvedAt: null,
    dismissedAt: null,
    delegatedTo: null,
    delegatedAt: null,
    canDelegate: true,
    delegateToRoles: null,
    createdAt: now,
    updatedAt: now,
  },
];

// ── Page component ────────────────────────────────────────────────────────────

export default function ConflictHarnessPage() {
  if (process.env.NODE_ENV !== 'development') {
    notFound();
  }

  const [conflicts, setConflicts] = useState<Conflict[]>(() =>
    INITIAL_FIXTURES.map((c) => ({ ...c }))
  );
  const [aiCallsDisabled, setAiCallsDisabled] = useState(false);
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());

  const resetAll = useCallback(() => {
    setConflicts(INITIAL_FIXTURES.map((c) => ({ ...c })));
    setResolvingIds(new Set());
  }, []);

  const handleResolve = useCallback((conflictId: string) => {
    setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
  }, []);

  const handleAcknowledge = useCallback((conflictId: string) => {
    setConflicts((prev) =>
      prev.map((c) => (c.id === conflictId ? { ...c, status: 'ACKNOWLEDGED' as const } : c))
    );
  }, []);

  const handleDelegate = useCallback((conflictId: string) => {
    setConflicts((prev) =>
      prev.map((c) =>
        c.id === conflictId
          ? {
              ...c,
              status: 'DELEGATED' as const,
              delegatedTo: 'COORDINATOR' as const,
              delegatedAt: new Date(),
            }
          : c
      )
    );
  }, []);

  const handleResolveWithAI = useCallback(
    (conflictId: string) => {
      if (aiCallsDisabled) return;

      setResolvingIds((prev) => new Set(prev).add(conflictId));

      setTimeout(() => {
        setConflicts((prev) =>
          prev.map((c) =>
            c.id === conflictId
              ? {
                  ...c,
                  suggestion: {
                    action: 'AI_GENERATED_FIX',
                    reasoning:
                      'AI suggests redistributing items across teams to balance workload and resolve this conflict.',
                  },
                }
              : c
          )
        );
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(conflictId);
          return next;
        });
      }, 1500);
    },
    [aiCallsDisabled]
  );

  const handleIgnore = useCallback((conflictId: string) => {
    setConflicts((prev) => prev.filter((c) => c.id !== conflictId));
  }, []);

  const CONFLICT_TYPE_DESTINATIONS: Record<string, string> = {
    QUANTITY_MISSING: 'Items modal',
    DIETARY_GAP: 'Items modal',
    TIMING: 'Items modal',
    EQUIPMENT_MISMATCH: 'Items modal',
    STRUCTURAL_IMBALANCE: 'People modal',
    COVERAGE_GAP: 'Teams modal',
    CONSTRAINT_VIOLATION: 'Plan Status modal',
  };

  const handleGoFixIt = useCallback((_conflictId: string, conflictType: ConflictType) => {
    const destination = CONFLICT_TYPE_DESTINATIONS[conflictType] ?? conflictType;
    window.alert(`Go fix it → Would navigate to: ${destination}`);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">ConflictCard Dev Harness</h1>
        <p className="text-sm text-gray-500 mb-6">
          Local development only — not visible in production
        </p>

        {/* Toolbar */}
        <div className="flex items-center gap-4 mb-6 p-4 bg-white rounded-lg border border-gray-200 shadow-sm">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={aiCallsDisabled}
              onChange={(e) => setAiCallsDisabled(e.target.checked)}
              className="rounded border-gray-300"
            />
            AI calls disabled
          </label>
          <button
            onClick={resetAll}
            className="px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 transition"
          >
            Reset all
          </button>
          <span className="text-sm text-gray-500">
            {conflicts.length} / {INITIAL_FIXTURES.length} cards visible
          </span>
        </div>

        {/* Resolving overlay indicators */}
        {resolvingIds.size > 0 && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            AI resolving {resolvingIds.size} conflict{resolvingIds.size > 1 ? 's' : ''}...
          </div>
        )}

        {/* Conflict cards */}
        {conflicts.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            All cards removed. Click <strong>Reset all</strong> to restore.
          </div>
        ) : (
          <div className="space-y-2">
            {conflicts.map((conflict) => (
              <ConflictCard
                key={conflict.id}
                conflict={conflict}
                onResolve={handleResolve}
                onDelegate={handleDelegate}
                onAcknowledge={handleAcknowledge}
                onResolveWithAI={handleResolveWithAI}
                onIgnore={handleIgnore}
                onGoFixIt={handleGoFixIt}
                aiCallsDisabled={aiCallsDisabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
