'use client';

export type ItemDecision = 'keep' | 'regenerate' | 'pending';

export interface ReviewItem {
  id: string;
  name: string;
  quantityAmount: number | null;
  quantityUnit: string | null;
  assignedTo?: string;
  teamName: string;
  isNew?: boolean; // Flag to indicate if this is a newly regenerated item
}

interface ItemReviewCardProps {
  item: ReviewItem;
  decision: ItemDecision;
  onDecisionChange: (itemId: string, decision: ItemDecision) => void;
}

export default function ItemReviewCard({ item, decision, onDecisionChange }: ItemReviewCardProps) {
  const getQuantityDisplay = () => {
    if (item.quantityAmount && item.quantityUnit) {
      return `${item.quantityAmount}${item.quantityUnit}`;
    }
    return '';
  };

  const getBorderClass = () => {
    if (decision === 'keep') return 'border-green-500 bg-green-50';
    if (decision === 'regenerate') return 'border-orange-500 bg-orange-50';
    return 'border-sage-200 bg-white';
  };

  return (
    <div className={`border-2 rounded-lg p-4 transition-all ${getBorderClass()}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-sage-900">{item.name}</h4>
            {item.isNew && (
              <span className="px-2 py-0.5 text-xs font-bold bg-orange-500 text-white rounded-md animate-pulse">
                NEW
              </span>
            )}
          </div>
          <div className="text-sm text-sage-600 mt-1">
            {getQuantityDisplay() && <span>{getQuantityDisplay()}</span>}
            {item.assignedTo && (
              <>
                {getQuantityDisplay() && <span className="mx-2">•</span>}
                <span>Assigned to {item.assignedTo}</span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => onDecisionChange(item.id, 'keep')}
          className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
            decision === 'keep'
              ? 'bg-green-500 text-white'
              : 'bg-sage-100 text-sage-700 hover:bg-green-100 hover:text-green-700'
          }`}
        >
          Keep
        </button>
        <button
          onClick={() => onDecisionChange(item.id, 'regenerate')}
          className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
            decision === 'regenerate'
              ? 'bg-orange-500 text-white'
              : 'bg-sage-100 text-sage-700 hover:bg-orange-100 hover:text-orange-700'
          }`}
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}
