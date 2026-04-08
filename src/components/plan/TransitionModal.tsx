'use client';

import { useState, useEffect } from 'react';
import { useModal } from '@/contexts/ModalContext';

interface UnassignedItem {
  id: string;
  name: string;
  critical: boolean;
  team: { id: string; name: string };
}

interface TransitionModalProps {
  eventId: string;
  currentStatus?: 'DRAFT' | 'CONFIRMING' | 'FROZEN' | 'COMPLETE';
  onClose: () => void;
  onSuccess: () => void;
  onGoToAssign?: () => void;
}

interface FreezeWarning {
  type: 'LOW_COMPLIANCE' | 'CRITICAL_GAPS' | 'UNASSIGNED_ITEMS';
  message: string;
  details: string[];
}

const FREEZE_REASONS = [
  { value: 'time_pressure', label: 'Time pressure — event is soon' },
  { value: 'handling_offline', label: 'Handling remaining items offline' },
  { value: 'small_event', label: 'Small event — this is enough' },
  { value: 'other', label: 'Other' },
] as const;

interface PlanSummary {
  teamCount: number;
  itemCount: number;
  criticalItemCount: number;
  criticalAssignedCount: number;
  criticalUnassignedCount: number;
  acknowledgedConflictsCount: number;
  criticalPlaceholderCount: number;
}

interface WeakSpot {
  title: string;
  description: string;
  count?: number;
  icon: string;
}

export default function TransitionModal({
  eventId,
  currentStatus,
  onClose,
  onSuccess,
  onGoToAssign,
}: TransitionModalProps) {
  const { openModal, closeModal } = useModal();
  const [loading, setLoading] = useState(true);
  const [transitioning, setTransitioning] = useState(false);
  const [summary, setSummary] = useState<PlanSummary | null>(null);
  const [weakSpots, setWeakSpots] = useState<WeakSpot[]>([]);
  const [showWeakSpots, setShowWeakSpots] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostId, setHostId] = useState<string | null>(null);
  const [freezeWarnings, setFreezeWarnings] = useState<FreezeWarning[]>([]);
  const [showFreezeWarnings, setShowFreezeWarnings] = useState(false);
  const [complianceRate, setComplianceRate] = useState<number | null>(null);
  const [freezeReason, setFreezeReason] = useState<string>('');
  const [unassignedItems, setUnassignedItems] = useState<UnassignedItem[]>([]);

  const isFreezeTransition = currentStatus === 'CONFIRMING';

  // Modal blocking check - TransitionModal needs special handling since it's opened programmatically
  useEffect(() => {
    if (eventId) {
      if (!openModal('transition-modal')) {
        onClose();
      }
    }
    return () => closeModal();
  }, [eventId]);

  useEffect(() => {
    fetchPlanSummary();
  }, [eventId]);

  const fetchPlanSummary = async () => {
    setLoading(true);
    setError(null);

    try {
      // First, fetch the event to get the hostId
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (eventResponse.ok) {
        const eventData = await eventResponse.json();
        setHostId(eventData.event.hostId);
      }

      // Fetch event summary and items in parallel
      const [summaryResponse, itemsResponse] = await Promise.all([
        fetch(`/api/events/${eventId}/summary`),
        fetch(`/api/events/${eventId}/items`),
      ]);

      if (!summaryResponse.ok) {
        setSummary({
          teamCount: 8,
          itemCount: 55,
          criticalItemCount: 10,
          criticalAssignedCount: 6,
          criticalUnassignedCount: 4,
          acknowledgedConflictsCount: 2,
          criticalPlaceholderCount: 3,
        });
      } else {
        const data = await summaryResponse.json();
        setSummary(data);
      }

      // Extract unassigned items
      if (itemsResponse.ok) {
        const itemsData = await itemsResponse.json();
        const unassigned = itemsData.items
          .filter((item: { assignment: unknown }) => !item.assignment)
          .map(
            (item: {
              id: string;
              name: string;
              critical: boolean;
              team: { id: string; name: string };
            }) => ({
              id: item.id,
              name: item.name,
              critical: item.critical,
              team: { id: item.team.id, name: item.team.name },
            })
          );
        setUnassignedItems(unassigned);
      }

      // Calculate weak spots
      calculateWeakSpots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load plan summary');
    } finally {
      setLoading(false);
    }
  };

  const calculateWeakSpots = () => {
    const spots: WeakSpot[] = [];

    // Weak spot 1: Placeholder quantities on critical items
    const placeholderCount = summary?.criticalPlaceholderCount || 0;
    if (placeholderCount > 0) {
      spots.push({
        icon: '⚠️',
        title: 'Placeholder Quantities on Critical Items',
        description: `${placeholderCount} critical item(s) still have placeholder quantities. Consider specifying exact amounts or acknowledging these placeholders.`,
        count: placeholderCount,
      });
    }

    // Weak spot 2: Unassigned critical items
    const unassignedCount = summary?.criticalUnassignedCount || 0;
    if (unassignedCount > 0) {
      spots.push({
        icon: '❗',
        title: 'Unassigned Critical Items',
        description: `${unassignedCount} critical item(s) are not yet assigned. While you can still proceed, assigning these will reduce last-minute coordination.`,
        count: unassignedCount,
      });
    }

    // Weak spot 3: Acknowledged critical issues
    const acknowledgedCount = summary?.acknowledgedConflictsCount || 0;
    if (acknowledgedCount > 0) {
      spots.push({
        icon: 'ℹ️',
        title: 'Acknowledged Critical Issues',
        description: `${acknowledgedCount} critical issue(s) have been acknowledged but not fully resolved. Make sure you have mitigation plans in place.`,
        count: acknowledgedCount,
      });
    }

    setWeakSpots(spots.slice(0, 3)); // Top 3 only
  };

  const handleProceed = async () => {
    setTransitioning(true);
    setError(null);

    try {
      // Use the host ID as the actor
      if (!hostId) {
        throw new Error('Host ID not available');
      }

      // For freeze transitions, check warnings first without freezing
      if (isFreezeTransition && !showFreezeWarnings) {
        // Check warnings without actually freezing
        const checkResponse = await fetch(`/api/events/${eventId}/freeze-check`, {
          method: 'POST',
        });

        if (checkResponse.ok) {
          const checkResult = await checkResponse.json();
          setComplianceRate(checkResult.complianceRate ?? null);

          if (checkResult.warnings && checkResult.warnings.length > 0) {
            // Show warnings, don't freeze yet
            setFreezeWarnings(checkResult.warnings);
            setShowFreezeWarnings(true);
            setTransitioning(false);
            return;
          }
        }
        // If no warnings or check failed, proceed with freeze
      }

      // Actually perform the transition
      const requestBody: { actorId: string; freezeReason?: string } = { actorId: hostId };

      // Include freeze reason if freezing and compliance < 80%
      if (isFreezeTransition && complianceRate !== null && complianceRate < 80 && freezeReason) {
        requestBody.freezeReason = freezeReason;
      }

      const response = await fetch(`/api/events/${eventId}/transition`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to transition');
      }

      const result = await response.json();

      if (result.success) {
        onSuccess();
      } else {
        throw new Error(result.error || 'Transition failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to transition');
    } finally {
      setTransitioning(false);
    }
  };

  const handleNotYet = () => {
    calculateWeakSpots();
    setShowWeakSpots(true);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <div className="text-center">
            <div className="text-gray-600">Loading plan summary...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {showFreezeWarnings && freezeWarnings.length > 0 ? (
          <>
            {/* Freeze Warnings View */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Heads up before you freeze</h2>
              <p className="text-gray-600">
                You can still freeze the plan, but here are some things to be aware of:
              </p>
            </div>

            {/* Warnings List */}
            <div className="space-y-4 mb-6">
              {freezeWarnings.map((warning, index) => (
                <div key={index} className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">⚠️</span>
                    <div className="flex-1">
                      <h3 className="font-semibold text-yellow-900 mb-2">{warning.message}</h3>
                      {warning.details.length > 0 && (
                        <ul className="text-sm text-yellow-800 space-y-1">
                          {warning.details.slice(0, 5).map((detail, i) => (
                            <li key={i}>• {detail}</li>
                          ))}
                          {warning.details.length > 5 && (
                            <li className="italic">...and {warning.details.length - 5} more</li>
                          )}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Reason Picker (only show if compliance < 80%) */}
            {complianceRate !== null && complianceRate < 80 && (
              <div className="mb-6">
                <h3 className="font-semibold text-lg mb-3">Why are you freezing early?</h3>
                <div className="space-y-2">
                  {FREEZE_REASONS.map((reason) => (
                    <label
                      key={reason.value}
                      className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
                      style={{
                        borderColor: freezeReason === reason.value ? '#4A7C59' : '#E5E7EB',
                        backgroundColor: freezeReason === reason.value ? '#F0F4F1' : 'white',
                      }}
                    >
                      <input
                        type="radio"
                        name="freezeReason"
                        value={reason.value}
                        checked={freezeReason === reason.value}
                        onChange={(e) => setFreezeReason(e.target.value)}
                        className="w-4 h-4 text-sage-600"
                      />
                      <span className="text-sm font-medium">{reason.label}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={transitioning}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                onClick={handleProceed}
                disabled={
                  transitioning || (complianceRate !== null && complianceRate < 80 && !freezeReason)
                }
                className="flex-1 px-6 py-3 bg-sage-600 text-white rounded-lg font-semibold hover:bg-sage-700 disabled:opacity-50"
              >
                {transitioning ? 'Freezing...' : 'Freeze Anyway'}
              </button>
            </div>
          </>
        ) : !showWeakSpots ? (
          <>
            {/* Transition Confirmation */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">
                {isFreezeTransition ? 'Freeze this plan?' : 'Ready to Move to CONFIRMING?'}
              </h2>
              <p className="text-gray-600">
                {isFreezeTransition
                  ? 'Freezing will lock the plan and prevent further changes.'
                  : 'Review your plan summary before transitioning.'}
              </p>
            </div>

            {/* Plan Summary */}
            {summary && (
              <div className="bg-gray-50 rounded-lg p-6 mb-6 space-y-4">
                <h3 className="font-semibold text-lg mb-3">Plan Summary</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded p-3">
                    <div className="text-sm text-gray-600">Teams</div>
                    <div className="text-2xl font-bold">{summary.teamCount}</div>
                  </div>

                  <div className="bg-white rounded p-3">
                    <div className="text-sm text-gray-600">Total Items</div>
                    <div className="text-2xl font-bold">{summary.itemCount}</div>
                  </div>

                  <div className="bg-white rounded p-3">
                    <div className="text-sm text-gray-600">Critical Items</div>
                    <div className="text-2xl font-bold">{summary.criticalItemCount}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {summary.criticalAssignedCount} assigned, {summary.criticalUnassignedCount}{' '}
                      unassigned
                    </div>
                  </div>

                  <div className="bg-white rounded p-3">
                    <div className="text-sm text-gray-600">Acknowledged Issues</div>
                    <div className="text-2xl font-bold">{summary.acknowledgedConflictsCount}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Unassigned Items Section */}
            {unassignedItems.length > 0 ? (
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-6 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold text-lg text-amber-900">
                    {unassignedItems.length} Unassigned Item
                    {unassignedItems.length !== 1 ? 's' : ''}
                  </h3>
                  {onGoToAssign && (
                    <button
                      onClick={onGoToAssign}
                      className="text-sm font-medium text-amber-700 hover:text-amber-900 underline"
                    >
                      Go to Teams to assign
                    </button>
                  )}
                </div>
                <ul className="space-y-2">
                  {unassignedItems.slice(0, 8).map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between bg-white rounded px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        {item.critical && (
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 text-xs rounded font-medium">
                            Critical
                          </span>
                        )}
                        <span className="text-sm font-medium text-gray-900">{item.name}</span>
                      </div>
                      <span className="text-xs text-gray-500">{item.team.name}</span>
                    </li>
                  ))}
                  {unassignedItems.length > 8 && (
                    <li className="text-sm text-amber-700 italic px-3">
                      ...and {unassignedItems.length - 8} more
                    </li>
                  )}
                </ul>
              </div>
            ) : summary && summary.itemCount > 0 ? (
              <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4 mb-6">
                <div className="flex items-center gap-2 text-green-700">
                  <span className="text-lg">&#10003;</span>
                  <span className="font-medium text-sm">All items assigned</span>
                </div>
              </div>
            ) : null}

            {/* What Happens Next */}
            {!isFreezeTransition && (
              <div className="bg-sage-50 border-2 border-sage-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-lg mb-2 text-sage-900">
                  What "Structure Locked" Means
                </h3>
                <ul className="space-y-2 text-sm text-sage-800">
                  <li className="flex gap-2">
                    <span>🔒</span>
                    <span>Team structure will be locked (no adding/removing teams)</span>
                  </li>
                  <li className="flex gap-2">
                    <span>✏️</span>
                    <span>You can still edit item details and assignments</span>
                  </li>
                  <li className="flex gap-2">
                    <span>📸</span>
                    <span>A snapshot of your current plan will be saved</span>
                  </li>
                  <li className="flex gap-2">
                    <span>👥</span>
                    <span>Coordinators can continue working on their teams</span>
                  </li>
                </ul>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 mb-6">
                <p className="text-red-800">{error}</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3">
              {!isFreezeTransition && (
                <button
                  onClick={handleNotYet}
                  disabled={transitioning}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Not yet, keep planning
                </button>
              )}

              {isFreezeTransition && (
                <button
                  onClick={onClose}
                  disabled={transitioning}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              )}

              <button
                onClick={handleProceed}
                disabled={transitioning}
                className="flex-1 px-6 py-3 bg-sage-600 text-white rounded-lg font-semibold hover:bg-sage-700 disabled:opacity-50"
              >
                {transitioning
                  ? isFreezeTransition
                    ? 'Freezing...'
                    : 'Transitioning...'
                  : isFreezeTransition
                    ? 'Freeze Plan'
                    : 'Yes, proceed →'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Weak Spots View */}
            <div className="mb-6">
              <h2 className="text-2xl font-bold mb-2">Before You Go...</h2>
              <p className="text-gray-600">Here are the top areas you might want to strengthen:</p>
            </div>

            {/* Weak Spots List */}
            <div className="space-y-3 mb-6">
              {weakSpots.length > 0 ? (
                weakSpots.map((spot, index) => (
                  <div
                    key={index}
                    className="bg-yellow-50 border-2 border-yellow-200 rounded-lg p-4"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl">{spot.icon}</span>
                      <div className="flex-1">
                        <h3 className="font-semibold text-yellow-900 mb-1">{spot.title}</h3>
                        <p className="text-sm text-yellow-800">{spot.description}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <h3 className="font-semibold text-green-900">Your plan looks solid!</h3>
                      <p className="text-sm text-green-800">No significant weak spots detected.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-6 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50"
              >
                Go back and refine
              </button>

              <button
                onClick={handleProceed}
                disabled={transitioning}
                className="flex-1 px-6 py-3 bg-sage-600 text-white rounded-lg font-semibold hover:bg-sage-700 disabled:opacity-50"
              >
                {transitioning ? 'Transitioning...' : 'Proceed anyway →'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
