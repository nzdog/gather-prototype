'use client';

import { useState } from 'react';
import { X, AlertCircle } from 'lucide-react';

interface RegenerateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegenerate: (options: { preserveProtected: boolean; modifier: string }) => void;
  manualTeamCount: number;
  manualItemCount: number;
}

export default function RegenerateModal({
  isOpen,
  onClose,
  onRegenerate,
  manualTeamCount,
  manualItemCount,
}: RegenerateModalProps) {
  const [modifier, setModifier] = useState('');

  if (!isOpen) return null;

  const hasManualAdditions = manualTeamCount > 0 || manualItemCount > 0;

  const handleRegenerate = (preserveProtected: boolean) => {
    onRegenerate({ preserveProtected, modifier: modifier.trim() });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-2xl font-bold text-gray-900">Regenerate Plan with AI</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Manual Additions Warning */}
          {hasManualAdditions && (
            <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-900 mb-2">You have manual additions:</h3>
                  <ul className="text-amber-800 space-y-1">
                    {manualTeamCount > 0 && (
                      <li>
                        • {manualTeamCount} team{manualTeamCount !== 1 ? 's' : ''} added manually
                      </li>
                    )}
                    {manualItemCount > 0 && (
                      <li>
                        • {manualItemCount} item{manualItemCount !== 1 ? 's' : ''} added manually
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* No Manual Additions */}
          {!hasManualAdditions && (
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
              <p className="text-blue-900">
                This will replace all generated teams and items with a fresh AI-generated plan.
              </p>
            </div>
          )}

          {/* Modifier Input */}
          <div>
            <label htmlFor="modifier" className="block text-sm font-medium text-gray-700 mb-2">
              What changes would you like? (optional)
            </label>
            <textarea
              id="modifier"
              value={modifier}
              onChange={(e) => setModifier(e.target.value)}
              placeholder="e.g., More vegetarian options, Focus on appetizers, Add dessert team..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
            />
            <p className="text-sm text-gray-500 mt-1">
              Tell Claude how to adjust the plan. Leave blank for a standard regeneration.
            </p>
          </div>
        </div>

        {/* Footer / Actions */}
        <div className="p-6 border-t bg-gray-50 space-y-3">
          {hasManualAdditions ? (
            <>
              {/* Option 1: Keep Manual Additions */}
              <button
                onClick={() => handleRegenerate(true)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Keep My Additions (Recommended)
              </button>
              <p className="text-xs text-gray-600 text-center -mt-1">
                Regenerates AI-generated content while preserving your manual teams and items
              </p>

              {/* Option 2: Replace Everything */}
              <button
                onClick={() => handleRegenerate(false)}
                className="w-full px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700 transition-colors"
              >
                Regenerate Everything
              </button>
              <p className="text-xs text-gray-600 text-center -mt-1">
                ⚠️ Deletes all teams and items, including your manual additions
              </p>
            </>
          ) : (
            <>
              {/* Simple Regenerate */}
              <button
                onClick={() => handleRegenerate(false)}
                className="w-full px-6 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 transition-colors"
              >
                Regenerate Plan
              </button>
              <p className="text-xs text-gray-600 text-center -mt-1">
                Replace all teams and items with a fresh AI-generated plan
              </p>
            </>
          )}

          {/* Cancel */}
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-white border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
