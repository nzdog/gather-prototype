'use client';

import { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';

interface FreezeCheckProps {
  eventId: string;
  refreshTrigger?: number;
  onFreezeComplete?: () => void;
  onExpand?: () => void;
}

export default function FreezeCheck({
  eventId,
  refreshTrigger,
  onFreezeComplete,
  onExpand,
}: FreezeCheckProps) {
  const [checking, setChecking] = useState(false);
  const [canFreeze, setCanFreeze] = useState(false);
  const [unassignedCount, setUnassignedCount] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [freezing, setFreezing] = useState(false);

  const checkFreeze = async () => {
    setChecking(true);
    setError(null);

    try {
      // Count unassigned items
      const response = await fetch(`/api/events/${eventId}/items`);
      if (!response.ok) throw new Error('Failed to check items');

      const data = await response.json();
      const unassigned = (data.items || []).filter((item: any) => !item.assignment).length;

      setUnassignedCount(unassigned);
      setCanFreeze(unassigned === 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check freeze status');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    checkFreeze();
  }, [eventId, refreshTrigger]);

  const handleFreeze = async () => {
    if (!canFreeze) return;

    if (!confirm('Freeze the plan? This will lock all assignments and prevent further changes.')) {
      return;
    }

    setFreezing(true);
    setError(null);

    try {
      // Get host token - in production this would come from auth
      // const MOCK_HOST_ID = 'cmjwbjrpw0000n99xs11r44qh';

      // Get event to find host token
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to load event');
      const eventData = await eventResponse.json();

      // Get tokens to find host token
      const tokensResponse = await fetch(`/api/events/${eventId}/tokens?hostId=${eventData.event.hostId}`);
      if (!tokensResponse.ok) throw new Error('Failed to load tokens');
      const tokensData = await tokensResponse.json();

      const hostToken = tokensData.inviteLinks?.find((link: any) => link.scope === 'HOST')?.token;
      if (!hostToken) throw new Error('Host token not found');

      // Transition to FROZEN
      const response = await fetch(`/api/h/${hostToken}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'FROZEN' }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to freeze plan');
      }

      onFreezeComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to freeze plan');
    } finally {
      setFreezing(false);
    }
  };

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
          <span className="text-3xl">{canFreeze ? '✅' : '🚫'}</span>
          <div>
            <h2 className="text-2xl font-bold">
              {canFreeze ? 'Ready to Freeze' : 'Cannot Freeze Yet'}
            </h2>
            <p className="text-gray-600 mt-1">
              {canFreeze
                ? 'All items are assigned. You can now freeze the plan.'
                : 'All items must be assigned before freezing the plan.'}
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
              <p className="text-sm text-blue-700 mt-1">
                <span className="font-semibold">{unassignedCount}</span> item
                {unassignedCount !== 1 ? 's' : ''} unassigned
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={handleFreeze}
          disabled={!canFreeze || freezing}
          className={`w-full px-6 py-3 rounded-lg font-semibold text-lg transition-colors ${
            canFreeze && !freezing
              ? 'bg-accent text-white hover:bg-accent-dark'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          {freezing ? 'Freezing...' : canFreeze ? 'Freeze Plan 🧊' : 'Assign All Items to Continue'}
        </button>
      </div>
    </div>
  );
}
