'use client';

import { useState, useEffect } from 'react';
import { Maximize2 } from 'lucide-react';
import { GateBlock, GateBlockCode } from '@/lib/workflow';
import TransitionModal from './TransitionModal';

interface GateCheckProps {
  eventId: string;
  onTransitionComplete?: () => void;
  refreshTrigger?: number;
  onExpand?: () => void;
}

const blockStyles: Record<GateBlockCode, string> = {
  CRITICAL_CONFLICT_UNACKNOWLEDGED: 'bg-red-50 border-red-300 text-red-900',
  CRITICAL_PLACEHOLDER_UNACKNOWLEDGED: 'bg-orange-50 border-orange-300 text-orange-900',
  STRUCTURAL_MINIMUM_TEAMS: 'bg-purple-50 border-purple-300 text-purple-900',
  STRUCTURAL_MINIMUM_ITEMS: 'bg-purple-50 border-purple-300 text-purple-900',
  UNSAVED_DRAFT_CHANGES: 'bg-yellow-50 border-yellow-300 text-yellow-900',
};

const blockIcons: Record<GateBlockCode, string> = {
  CRITICAL_CONFLICT_UNACKNOWLEDGED: '⚠️',
  CRITICAL_PLACEHOLDER_UNACKNOWLEDGED: '⚠️',
  STRUCTURAL_MINIMUM_TEAMS: '👥',
  STRUCTURAL_MINIMUM_ITEMS: '📋',
  UNSAVED_DRAFT_CHANGES: '💾',
};

const blockTitles: Record<GateBlockCode, string> = {
  CRITICAL_CONFLICT_UNACKNOWLEDGED: 'Critical Conflicts Need Acknowledgement',
  CRITICAL_PLACEHOLDER_UNACKNOWLEDGED: 'Critical Placeholders Need Acknowledgement',
  STRUCTURAL_MINIMUM_TEAMS: 'Minimum Teams Required',
  STRUCTURAL_MINIMUM_ITEMS: 'Minimum Items Required',
  UNSAVED_DRAFT_CHANGES: 'Unsaved Draft Changes',
};

export default function GateCheck({
  eventId,
  onTransitionComplete,
  refreshTrigger,
  onExpand,
}: GateCheckProps) {
  const [checking, setChecking] = useState(false);
  const [passed, setPassed] = useState<boolean | null>(null);
  const [blocks, setBlocks] = useState<GateBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const runGateCheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const response = await fetch(`/api/events/${eventId}/gate-check`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Failed to run gate check');
      }

      const result = await response.json();
      setPassed(result.passed);
      setBlocks(result.blocks || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to run gate check');
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    runGateCheck();
  }, [eventId, refreshTrigger]);

  const handleMoveToConfirming = () => {
    setShowModal(true);
  };

  const handleTransitionSuccess = () => {
    setShowModal(false);
    onTransitionComplete?.();
  };

  if (checking) {
    return (
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        <div className="flex items-center justify-center">
          <div className="text-gray-600">Running gate check...</div>
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
          onClick={runGateCheck}
          className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="bg-white rounded-lg border-2 border-gray-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{passed ? '✅' : '🚫'}</span>
            <div>
              <h2 className="text-2xl font-bold">
                {passed ? 'Ready to Confirm' : 'Cannot Transition Yet'}
              </h2>
              <p className="text-gray-600 mt-1">
                {passed
                  ? 'All gate checks passed. You can now move to CONFIRMING.'
                  : `${blocks.length} issue(s) must be resolved before transitioning.`}
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={runGateCheck}
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

        {/* Blocks List */}
        {blocks.length > 0 && (
          <div className="space-y-3 mt-4">
            <h3 className="font-semibold text-lg mb-2">Issues Blocking Transition:</h3>
            {blocks.map((block, index) => (
              <div key={index} className={`rounded-lg border-2 p-4 ${blockStyles[block.code]}`}>
                <div className="flex items-start gap-2">
                  <span className="text-xl">{blockIcons[block.code]}</span>
                  <div className="flex-1">
                    <h4 className="font-semibold mb-1">{blockTitles[block.code]}</h4>
                    <p className="text-sm mb-2">{block.reason}</p>
                    {block.resolution && (
                      <div className="bg-white bg-opacity-50 rounded p-2 text-sm">
                        <span className="font-medium">Resolution: </span>
                        {block.resolution}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <button
            onClick={handleMoveToConfirming}
            disabled={!passed}
            className={`w-full px-6 py-3 rounded-lg font-semibold text-lg transition-colors ${
              passed
                ? 'bg-accent text-white hover:bg-accent-dark'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {passed ? 'Move to CONFIRMING →' : 'Resolve Issues to Continue'}
          </button>
        </div>
      </div>

      {/* Transition Modal */}
      {showModal && (
        <TransitionModal
          eventId={eventId}
          onClose={() => setShowModal(false)}
          onSuccess={handleTransitionSuccess}
        />
      )}
    </>
  );
}
