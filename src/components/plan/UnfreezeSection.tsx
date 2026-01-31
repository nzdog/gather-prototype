'use client';

import { useState } from 'react';
import { Maximize2 } from 'lucide-react';

interface UnfreezeSectionProps {
  eventId: string;
  onUnfreezeComplete?: () => void;
  onExpand?: () => void;
}

export default function UnfreezeSection({
  eventId,
  onUnfreezeComplete,
  onExpand,
}: UnfreezeSectionProps) {
  const [unfreezing, setUnfreezing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUnfreeze = async () => {
    const reason = window.prompt('Please provide a reason for unfreezing the plan (required):');

    // User cancelled
    if (reason === null) {
      return;
    }

    // Empty reason
    if (reason.trim() === '') {
      alert('A reason is required to unfreeze the event.');
      return;
    }

    setUnfreezing(true);
    setError(null);

    try {
      // Get event to find host token
      const eventResponse = await fetch(`/api/events/${eventId}`);
      if (!eventResponse.ok) throw new Error('Failed to load event');
      const eventData = await eventResponse.json();

      // Get tokens to find host token
      const tokensResponse = await fetch(
        `/api/events/${eventId}/tokens?hostId=${eventData.event.hostId}`
      );
      if (!tokensResponse.ok) throw new Error('Failed to load tokens');
      const tokensData = await tokensResponse.json();

      const hostToken = tokensData.inviteLinks?.find((link: any) => link.scope === 'HOST')?.token;
      if (!hostToken) throw new Error('Host token not found');

      // Unfreeze via status update
      const response = await fetch(`/api/h/${hostToken}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'CONFIRMING',
          unfreezeReason: reason,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to unfreeze plan');
      }

      onUnfreezeComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unfreeze plan');
    } finally {
      setUnfreezing(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔓</span>
          <div>
            <h2 className="text-2xl font-bold">Plan is Frozen</h2>
            <p className="text-gray-600 mt-1">
              The plan is locked. Unfreeze it to make changes or continue coordinating.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
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

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border-2 border-red-200 rounded-lg p-4">
          <p className="text-red-800">{error}</p>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
        <div className="flex items-start gap-3">
          <span className="text-xl">ℹ️</span>
          <div className="flex-1">
            <h3 className="font-semibold text-yellow-900 mb-1">What happens when you unfreeze?</h3>
            <ul className="text-sm text-yellow-800 space-y-1">
              <li>• Plan returns to CONFIRMING status</li>
              <li>• You can edit items and assignments again</li>
              <li>• Your unfreeze reason will be logged in the audit trail</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Button */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <button
          onClick={handleUnfreeze}
          disabled={unfreezing}
          className="w-full px-6 py-3 rounded-lg font-semibold text-lg transition-colors bg-yellow-600 text-white hover:bg-yellow-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          {unfreezing ? 'Unfreezing...' : 'Unfreeze Plan 🔓'}
        </button>
      </div>
    </div>
  );
}
