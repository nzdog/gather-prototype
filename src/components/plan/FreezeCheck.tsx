'use client';

import { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import TransitionModal from './TransitionModal';

interface FreezeCheckProps {
  eventId: string;
  currentStatus?: 'DRAFT' | 'CONFIRMING' | 'FROZEN' | 'COMPLETE';
  refreshTrigger?: number;
  onFreezeComplete?: () => void;
  onExpand?: () => void;
}

export default function FreezeCheck({
  eventId,
  currentStatus,
  refreshTrigger,
  onFreezeComplete,
  onExpand,
}: FreezeCheckProps) {
  const [checking, setChecking] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const checkFreeze = async () => {
    setChecking(true);
    setError(null);

    try {
      // Count unassigned items (for display only, doesn't block)
      const response = await fetch(`/api/events/${eventId}/items`);
      if (!response.ok) throw new Error('Failed to check items');

      const data = await response.json();
      const unassigned = (data.items || []).filter((item: any) => !item.assignment).length;

      setUnassignedCount(unassigned);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check freeze status');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkFreeze();
  }, [eventId, refreshTrigger]);

  const handleFreeze = () => {
    // Don't show modal if already frozen
    if (currentStatus === 'FROZEN') {
      setError('Event is already frozen. Use unfreeze to make changes.');
      return;
    }
    setShowModal(true);
  };

  const handleFreezeSuccess = () => {
    setShowModal(false);
    onFreezeComplete?.();
  };

  // Don't show freeze check if not in CONFIRMING status
  if (currentStatus !== 'CONFIRMING') {
    return null;
  }

  if (checking) {
    return (
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <div className="text-gray-600">Checking freeze status...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 rounded-lg border-2 border-red-300 p-6">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">❌</span>
          <h3 className="font-semibold text-lg text-red-900">Error</h3>
        </div>
        <p className="text-red-800">{error}</p>
        <button
          onClick={checkFreeze}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🧊</span>
          <div>
            <h2 className="text-2xl font-bold">Freeze Plan</h2>
            <p className="text-gray-600 mt-1">
              Lock the plan to prevent further changes. You'll review any warnings before
              confirming.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={checkFreeze}
            className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Refresh
          </button>
          {onExpand && (
            <button
              onClick={onExpand}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-md transition-colors"
              aria-label="Expand section"
              title="Expand full-screen"
            >
              <Maximize2 className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Coverage Indicator */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-gray-900">Assignment Coverage</h3>
            {unassignedCount === 0 ? (
              <p className="text-sm text-green-700 mt-1 flex items-center gap-2">
                <span className="text-lg">✅</span>
                <span className="font-semibold">Coverage complete</span> - All items are assigned
              </p>
            ) : (
              <p className="text-sm text-yellow-700 mt-1 flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span className="font-semibold">{unassignedCount}</span> item
                {unassignedCount !== 1 ? 's' : ''} unassigned (warning will be shown)
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={handleFreeze}
          className="w-full px-6 py-3 rounded-lg font-semibold text-lg transition-colors bg-accent text-white hover:bg-accent-dark"
        >
          Freeze Plan 🧊
        </button>
      </div>

      {/* Freeze Modal with Warnings */}
      {showModal && (
        <TransitionModal
          eventId={eventId}
          currentStatus="CONFIRMING"
          onClose={() => setShowModal(false)}
          onSuccess={handleFreezeSuccess}
        />
      )}
    </div>
  );
}
