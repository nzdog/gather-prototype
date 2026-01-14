'use client';

import { useState, useEffect } from 'react';
import { Conflict } from '@prisma/client';
import { Loader2, Sparkles, CheckCircle, XCircle, RotateCw } from 'lucide-react';

interface AISuggestion {
  summary: string;
  actions: string[];
  rationale: string;
  executableActions?: any[];
}

interface ResolveWithAIModalProps {
  isOpen: boolean;
  conflict: Conflict;
  eventId: string;
  onClose: () => void;
  onAccept: (conflictId: string) => void;
}

export default function ResolveWithAIModal({
  isOpen,
  conflict,
  eventId,
  onClose,
  onAccept,
}: ResolveWithAIModalProps) {
  const [loading, setLoading] = useState(false);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [implementing, setImplementing] = useState(false);
  const [implementationResults, setImplementationResults] = useState<any>(null);

  // Auto-load suggestion when modal opens
  useEffect(() => {
    if (isOpen && !suggestion && !loading && !error) {
      loadSuggestion();
    }
  }, [isOpen]);

  const loadSuggestion = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/conflicts/${conflict.id}/suggest-resolution`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to generate suggestion');
      }

      const data = await response.json();
      setSuggestion(data.suggestion);
    } catch (err) {
      console.error('Error loading suggestion:', err);
      setError('Failed to generate AI suggestion. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegenerate = () => {
    setSuggestion(null);
    loadSuggestion();
  };

  const handleAccept = async () => {
    if (!suggestion?.executableActions || suggestion.executableActions.length === 0) {
      // No executable actions, just mark as resolved
      onAccept(conflict.id);
      onClose();
      return;
    }

    // Execute the actions
    setImplementing(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/events/${eventId}/conflicts/${conflict.id}/execute-resolution`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            executableActions: suggestion.executableActions,
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to implement changes');
      }

      const results = await response.json();
      setImplementationResults(results);

      // Show success message with details
      console.log('Implementation results:', results);

      // Show success for 2 seconds, then close and trigger refresh
      setTimeout(() => {
        onAccept(conflict.id);
        onClose();
        // Force page reload to show new items
        window.location.reload();
      }, 2000);
    } catch (err) {
      console.error('Error implementing changes:', err);
      setError('Failed to implement changes automatically. Please try again or make changes manually.');
      setImplementing(false);
    }
  };

  const handleClose = () => {
    setSuggestion(null);
    setError(null);
    setImplementing(false);
    setImplementationResults(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-blue-600 text-white px-6 py-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              <h2 className="text-xl font-semibold">AI Resolution Suggestion</h2>
            </div>
            <button
              onClick={handleClose}
              className="text-white hover:text-gray-200 transition"
            >
              <XCircle className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Conflict Summary */}
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h3 className="font-semibold text-gray-900 mb-2">{conflict.title}</h3>
            <p className="text-sm text-gray-700">{conflict.description}</p>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
              <p className="text-gray-600">Generating resolution suggestion...</p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-4">
              <p className="text-red-900 font-medium mb-2">Error</p>
              <p className="text-red-700 text-sm">{error}</p>
              <button
                onClick={loadSuggestion}
                className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 text-sm"
              >
                Try Again
              </button>
            </div>
          )}

          {/* Suggestion Display */}
          {suggestion && !loading && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-blue-50 border border-blue-300 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4" />
                  Suggested Resolution
                </h4>
                <p className="text-blue-800">{suggestion.summary}</p>
              </div>

              {/* Actions */}
              <div className="bg-white border border-gray-300 rounded-lg p-4">
                <h4 className="font-semibold text-gray-900 mb-3">Action Steps:</h4>
                <ol className="space-y-2">
                  {suggestion.actions.map((action, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-purple-600 text-white rounded-full flex items-center justify-center text-sm font-semibold">
                        {index + 1}
                      </span>
                      <span className="text-gray-700 pt-0.5">{action}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Rationale */}
              <div className="bg-green-50 border border-green-300 rounded-lg p-4">
                <h4 className="font-semibold text-green-900 mb-2">Why this works:</h4>
                <p className="text-green-800 text-sm">{suggestion.rationale}</p>
              </div>

              {/* Implementation Info */}
              {suggestion.executableActions && suggestion.executableActions.length > 0 ? (
                <div className="bg-green-50 border border-green-300 rounded-lg p-3">
                  <p className="text-green-900 text-sm">
                    <strong>✨ Auto-Implementation Available:</strong> Clicking "Accept & Implement" will
                    automatically add these items to your plan and mark the conflict as resolved.
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3">
                  <p className="text-yellow-900 text-sm">
                    <strong>Note:</strong> You'll need to manually implement these suggestions.
                    Clicking "Accept & Resolve" will mark this conflict as resolved.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Implementing State */}
          {implementing && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="w-12 h-12 text-green-600 animate-spin mb-4" />
              <p className="text-gray-600 font-medium">Implementing changes...</p>
              <p className="text-sm text-gray-500 mt-2">Adding items to your plan</p>
            </div>
          )}

          {/* Implementation Results */}
          {implementationResults && (
            <div className="bg-green-50 border border-green-300 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <h4 className="font-semibold text-green-900">Changes Implemented Successfully!</h4>
              </div>
              <p className="text-green-800 text-sm mb-2">{implementationResults.message}</p>

              {/* Show details of what was created */}
              {implementationResults.results && implementationResults.results.length > 0 && (
                <div className="mt-3 space-y-1">
                  {implementationResults.results.map((result: any, index: number) => (
                    result.success && (
                      <div key={index} className="text-green-700 text-xs">
                        ✓ {result.action === 'CREATE_TEAM'
                          ? `Created team "${result.result.teamName}" with ${result.result.itemsCreated} item(s)`
                          : `Added "${result.result.itemName}" to ${result.result.teamName}`}
                      </div>
                    )
                  ))}
                </div>
              )}

              <p className="text-green-700 text-xs mt-3 font-medium">Refreshing page to show new items...</p>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {suggestion && !loading && !implementing && !implementationResults && (
          <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg flex gap-3">
            <button
              onClick={handleAccept}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition flex items-center justify-center gap-2"
              disabled={implementing}
            >
              <CheckCircle className="w-4 h-4" />
              {suggestion.executableActions && suggestion.executableActions.length > 0
                ? 'Accept & Implement'
                : 'Accept & Resolve'}
            </button>
            <button
              onClick={handleRegenerate}
              className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition flex items-center gap-2"
            >
              <RotateCw className="w-4 h-4" />
              Regenerate
            </button>
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 transition"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
