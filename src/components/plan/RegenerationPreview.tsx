'use client';

import { ArrowRight, CheckCircle, Info } from 'lucide-react';

interface PreviewData {
  current: {
    teams: Array<{
      name: string;
      scope: string;
      domain: string;
      itemCount: number;
      items: Array<{
        name: string;
        quantity: string;
        critical: boolean;
        dietaryTags: string[];
      }>;
    }>;
    totalTeams: number;
    totalItems: number;
  };
  proposed: {
    teams: Array<{
      name: string;
      scope: string;
      domain: string;
      itemCount: number;
      items: Array<{
        name: string;
        quantityAmount: number | null;
        quantityUnit: string | null;
        quantityLabel: string;
        quantityReasoning: string;
        critical: boolean;
        dietaryTags: string[];
      }>;
    }>;
    totalTeams: number;
    totalItems: number;
  };
  preserved: {
    items: Array<{
      name: string;
      team: string;
      quantity: string;
      source: string;
    }>;
    count: number;
  };
  modifier: string;
  reasoning: string;
}

interface RegenerationPreviewProps {
  preview: PreviewData;
  onApprove: () => void;
  onCancel: () => void;
}

export default function RegenerationPreview({
  preview,
  onApprove,
  onCancel,
}: RegenerationPreviewProps) {
  const itemsDiff = preview.proposed.totalItems - preview.current.totalItems;
  const teamsDiff = preview.proposed.totalTeams - preview.current.totalTeams;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="bg-sage-50 border-2 border-sage-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-sage-900 mb-2">Preview: "{preview.modifier}"</h3>
            <p className="text-sage-800 text-sm mb-3">{preview.reasoning}</p>
            <div className="flex gap-6 text-sm">
              <div>
                <span className="font-medium">Teams:</span>{' '}
                <span className={teamsDiff > 0 ? 'text-green-700' : teamsDiff < 0 ? 'text-red-700' : ''}>
                  {preview.current.totalTeams} → {preview.proposed.totalTeams}
                  {teamsDiff !== 0 && ` (${teamsDiff > 0 ? '+' : ''}${teamsDiff})`}
                </span>
              </div>
              <div>
                <span className="font-medium">Items:</span>{' '}
                <span className={itemsDiff > 0 ? 'text-green-700' : itemsDiff < 0 ? 'text-red-700' : ''}>
                  {preview.current.totalItems} → {preview.proposed.totalItems}
                  {itemsDiff !== 0 && ` (${itemsDiff > 0 ? '+' : ''}${itemsDiff})`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Preserved Items */}
      {preview.preserved.count > 0 && (
        <div className="bg-green-50 border-2 border-green-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-green-900 mb-2">
                Protected Items ({preview.preserved.count})
              </h3>
              <p className="text-green-800 text-sm mb-2">
                These items will be kept and NOT regenerated:
              </p>
              <div className="space-y-1">
                {preview.preserved.items.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="text-sm text-green-700">
                    • {item.name} ({item.team}) - {item.quantity}
                  </div>
                ))}
                {preview.preserved.count > 5 && (
                  <div className="text-sm text-green-700">
                    ... and {preview.preserved.count - 5} more
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Changes Comparison */}
      <div className="grid grid-cols-2 gap-4">
        {/* Current Plan */}
        <div className="border-2 border-gray-200 rounded-lg p-4">
          <h3 className="font-semibold text-gray-900 mb-3">Current Plan</h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {preview.current.teams.map((team, idx) => (
              <div key={idx} className="bg-gray-50 rounded p-3">
                <div className="font-medium text-gray-900 mb-1">{team.name}</div>
                <div className="text-xs text-gray-600 mb-2">{team.itemCount} items</div>
                <div className="space-y-1">
                  {team.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="text-sm text-gray-700">
                      • {item.name}: {item.quantity}
                      {item.critical && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1 rounded">
                          CRITICAL
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proposed Plan */}
        <div className="border-2 border-blue-300 rounded-lg p-4">
          <h3 className="font-semibold text-sage-900 mb-3 flex items-center gap-2">
            Proposed Plan
            <ArrowRight className="w-4 h-4" />
          </h3>
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {preview.proposed.teams.map((team, idx) => (
              <div key={idx} className="bg-sage-50 rounded p-3">
                <div className="font-medium text-sage-900 mb-1">{team.name}</div>
                <div className="text-xs text-accent mb-2">{team.itemCount} items</div>
                <div className="space-y-1">
                  {team.items.map((item, itemIdx) => (
                    <div key={itemIdx} className="text-sm text-sage-800">
                      • {item.name}:{' '}
                      {item.quantityAmount && item.quantityUnit
                        ? `${item.quantityAmount} ${item.quantityUnit}`
                        : 'TBD'}
                      {item.critical && (
                        <span className="ml-2 text-xs bg-red-100 text-red-700 px-1 rounded">
                          CRITICAL
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onApprove}
          className="flex-1 px-6 py-3 bg-sage-600 text-white rounded-lg font-semibold hover:bg-sage-700 transition-colors"
        >
          Apply These Changes
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
