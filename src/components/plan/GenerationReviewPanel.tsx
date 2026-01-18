'use client';

import { useState, useEffect } from 'react';
import ItemReviewCard, { ItemDecision, ReviewItem } from './ItemReviewCard';

interface TeamGroup {
  teamName: string;
  items: ReviewItem[];
}

interface GenerationReviewPanelProps {
  teamGroups: TeamGroup[];
  eventId: string;
  onConfirmAndContinue: () => void;
  onRegenerateSelected: (keepIds: string[], regenerateIds: string[]) => Promise<void>;
}

export default function GenerationReviewPanel({
  teamGroups,
  eventId,
  onConfirmAndContinue,
  onRegenerateSelected,
}: GenerationReviewPanelProps) {
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>(() => {
    const initial: Record<string, ItemDecision> = {};
    teamGroups.forEach((group) => {
      group.items.forEach((item) => {
        initial[item.id] = 'pending';
      });
    });
    return initial;
  });

  // Reset decisions when teamGroups change (after regeneration)
  useEffect(() => {
    const newDecisions: Record<string, ItemDecision> = {};
    teamGroups.forEach((group) => {
      group.items.forEach((item) => {
        newDecisions[item.id] = 'pending';
      });
    });
    setDecisions(newDecisions);
  }, [teamGroups]);

  const [isRegenerating, setIsRegenerating] = useState(false);

  const handleDecisionChange = (itemId: string, decision: ItemDecision) => {
    setDecisions((prev) => ({ ...prev, [itemId]: decision }));
  };

  const handleKeepAll = () => {
    const newDecisions: Record<string, ItemDecision> = {};
    teamGroups.forEach((group) => {
      group.items.forEach((item) => {
        newDecisions[item.id] = 'keep';
      });
    });
    setDecisions(newDecisions);
  };

  const handleRegenerateAll = () => {
    const newDecisions: Record<string, ItemDecision> = {};
    teamGroups.forEach((group) => {
      group.items.forEach((item) => {
        newDecisions[item.id] = 'regenerate';
      });
    });
    setDecisions(newDecisions);
  };

  const handleRegenerateSelected = async () => {
    const keepIds = Object.entries(decisions)
      .filter(([_, decision]) => decision === 'keep')
      .map(([id]) => id);
    const regenerateIds = Object.entries(decisions)
      .filter(([_, decision]) => decision === 'regenerate')
      .map(([id]) => id);

    if (regenerateIds.length === 0) {
      alert('Please select at least one item to regenerate');
      return;
    }

    setIsRegenerating(true);
    try {
      await onRegenerateSelected(keepIds, regenerateIds);
    } catch (error) {
      console.error('Error regenerating items:', error);
      alert('Failed to regenerate items. Please try again.');
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleConfirmAndContinue = () => {
    onConfirmAndContinue();
  };

  const getStats = () => {
    const keep = Object.values(decisions).filter((d) => d === 'keep').length;
    const regenerate = Object.values(decisions).filter((d) => d === 'regenerate').length;
    return { keep, regenerate };
  };

  const stats = getStats();

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-sage-900 mb-2">Review Generated Items</h2>
        <p className="text-sage-600">
          Review the AI-generated items below. You can keep items you like or regenerate specific ones.
        </p>
      </div>

      <div className="space-y-6 mb-6">
        {teamGroups.map((group) => (
          <div key={group.teamName} className="border border-sage-200 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-sage-900 mb-4">{group.teamName}</h3>
            <div className="space-y-3">
              {group.items.map((item) => (
                <ItemReviewCard
                  key={item.id}
                  item={item}
                  decision={decisions[item.id]}
                  onDecisionChange={handleDecisionChange}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="border-t border-sage-200 pt-4">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-sage-600">
            <span className="inline-flex items-center mr-4">
              <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
              {stats.keep} to keep
            </span>
            <span className="inline-flex items-center">
              <span className="w-3 h-3 bg-orange-500 rounded-full mr-2"></span>
              {stats.regenerate} to regenerate
            </span>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleKeepAll}
            className="px-4 py-2 bg-sage-100 text-sage-700 rounded-md hover:bg-sage-200 transition-colors font-medium"
          >
            Keep All
          </button>
          <button
            onClick={handleRegenerateAll}
            className="px-4 py-2 bg-sage-100 text-sage-700 rounded-md hover:bg-sage-200 transition-colors font-medium"
          >
            Regen All
          </button>
          <div className="flex-1"></div>
          <button
            onClick={handleRegenerateSelected}
            disabled={isRegenerating || stats.regenerate === 0}
            className="px-6 py-2 bg-orange-500 text-white rounded-md hover:bg-orange-600 disabled:bg-sage-300 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isRegenerating ? 'Regenerating...' : 'Regenerate Selected'}
          </button>
          <button
            onClick={handleConfirmAndContinue}
            className="px-6 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 transition-colors font-medium"
          >
            Confirm & Continue
          </button>
        </div>
      </div>
    </div>
  );
}
