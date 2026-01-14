'use client';

import { Conflict } from '@prisma/client';

interface ConflictCardProps {
  conflict: Conflict;
  onResolve: (conflictId: string) => void;
  onDismiss: (conflictId: string) => void;
  onDelegate: (conflictId: string) => void;
  onAcknowledge: (conflictId: string) => void;
  onResolveWithAI: (conflictId: string) => void;
}

const severityStyles = {
  CRITICAL: 'bg-red-50 border-red-300 text-red-900',
  SIGNIFICANT: 'bg-orange-50 border-orange-300 text-orange-900',
  ADVISORY: 'bg-blue-50 border-blue-300 text-blue-900',
};

const severityBadges = {
  CRITICAL: 'bg-red-100 text-red-800 border-red-300',
  SIGNIFICANT: 'bg-orange-100 text-orange-800 border-orange-300',
  ADVISORY: 'bg-blue-100 text-blue-800 border-blue-300',
};

const severityIcons = {
  CRITICAL: '⚠️',
  SIGNIFICANT: '⚠️',
  ADVISORY: 'ℹ️',
};

export default function ConflictCard({
  conflict,
  onResolve,
  onDismiss,
  onDelegate,
  onAcknowledge,
  onResolveWithAI,
}: ConflictCardProps) {
  const isCritical = conflict.severity === 'CRITICAL';
  const canDelegate = conflict.canDelegate;
  const isAcknowledged = conflict.status === 'ACKNOWLEDGED';
  const isDelegated = conflict.status === 'DELEGATED';

  return (
    <div
      className={`rounded-lg border-2 p-4 mb-4 ${
        severityStyles[conflict.severity]
      } ${isAcknowledged ? 'opacity-75' : ''}`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2">
          <span className="text-xl">{severityIcons[conflict.severity]}</span>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{conflict.title}</h3>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full border ${
                  severityBadges[conflict.severity]
                }`}
              >
                {conflict.severity}
              </span>
              {isAcknowledged && (
                <span className="px-2 py-1 text-xs font-medium rounded-full border bg-yellow-100 text-yellow-800 border-yellow-300">
                  ✓ ACKNOWLEDGED
                </span>
              )}
              {isDelegated && (
                <span className="px-2 py-1 text-xs font-medium rounded-full border bg-purple-100 text-purple-800 border-purple-300">
                  ↗ DELEGATED
                </span>
              )}
            </div>
            <p className="text-sm">{conflict.description}</p>
          </div>
        </div>
      </div>

      {/* Affected Parties */}
      {conflict.affectedParties && Array.isArray(conflict.affectedParties) && (
        <div className="mt-3 text-sm">
          <span className="font-medium">Affected: </span>
          <span>{(conflict.affectedParties as string[]).join(', ')}</span>
        </div>
      )}

      {/* Suggestion */}
      {conflict.suggestion && typeof conflict.suggestion === 'object' && (
        <div className="mt-3 p-3 bg-white bg-opacity-60 rounded border border-gray-300">
          <p className="text-sm font-medium mb-1">Suggestion:</p>
          <p className="text-sm">{(conflict.suggestion as any).action || 'No action specified'}</p>
          {(conflict.suggestion as any).reasoning && (
            <p className="text-xs text-gray-600 mt-1">{(conflict.suggestion as any).reasoning}</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-4">
        <button
          onClick={() => onResolveWithAI(conflict.id)}
          className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700 transition flex items-center gap-1"
        >
          <span>✨</span>
          Resolve with AI
        </button>
        <button
          onClick={() => onResolve(conflict.id)}
          className="px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700 transition"
        >
          Mark Resolved
        </button>

        {/* Only show action buttons if not already acknowledged or delegated */}
        {!isAcknowledged && !isDelegated && (
          <>
            {isCritical ? (
              <button
                onClick={() => onAcknowledge(conflict.id)}
                className="px-3 py-1.5 text-sm bg-yellow-600 text-white rounded hover:bg-yellow-700 transition"
              >
                Acknowledge
              </button>
            ) : (
              <button
                onClick={() => onDismiss(conflict.id)}
                className="px-3 py-1.5 text-sm bg-gray-500 text-white rounded hover:bg-gray-600 transition"
              >
                Dismiss
              </button>
            )}

            {canDelegate && (
              <button
                onClick={() => onDelegate(conflict.id)}
                className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition"
              >
                Delegate to Coordinator
              </button>
            )}
          </>
        )}

        {/* Show status message for acknowledged/delegated */}
        {isAcknowledged && (
          <div className="px-3 py-1.5 text-sm text-yellow-800 bg-yellow-50 rounded border border-yellow-300">
            This conflict has been acknowledged and can proceed to gate check
          </div>
        )}
        {isDelegated && (
          <div className="px-3 py-1.5 text-sm text-purple-800 bg-purple-50 rounded border border-purple-300">
            Delegated to coordinator for resolution
          </div>
        )}
      </div>
    </div>
  );
}
