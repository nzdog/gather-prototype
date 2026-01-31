'use client';

import { CheckCircle } from 'lucide-react';

interface ReadyToFreezeIndicatorProps {
  confirmed: number;
  total: number;
  complianceRate: number;
  onLockPlan: () => void;
}

export function ReadyToFreezeIndicator({
  confirmed,
  total,
  complianceRate,
  onLockPlan,
}: ReadyToFreezeIndicatorProps) {
  // Only show when compliance rate >= 80%
  if (complianceRate < 0.8) {
    return null;
  }

  // Determine copy based on count
  const getCopy = () => {
    if (confirmed === total) {
      return `All ${total} confirmed — ready to freeze`;
    }
    return `${confirmed} of ${total} confirmed — ready to freeze`;
  };

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
          <span className="text-sm font-medium text-green-900">{getCopy()}</span>
        </div>
        <button
          onClick={onLockPlan}
          className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 transition-colors"
        >
          Freeze Plan
        </button>
      </div>
    </div>
  );
}
