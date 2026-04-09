'use client';

import { X, Calendar, Users, Package, Settings } from 'lucide-react';

interface SourceEventSummary {
  eventName: string;
  guestCount: number | null;
  guestNames: string[];
  teamCount: number;
  itemCount: number;
}

interface PastEventOverlayProps {
  summary: SourceEventSummary;
  onOpenDates: () => void;
  onOpenPeople: () => void;
  onOpenItems: () => void;
  onOpenDetails: () => void;
  onDismiss: () => void;
}

export default function PastEventOverlay({
  summary,
  onOpenDates,
  onOpenPeople,
  onOpenItems,
  onOpenDetails,
  onDismiss,
}: PastEventOverlayProps) {
  const formatGuestNames = () => {
    const names = summary.guestNames;
    if (names.length === 0) return null;
    const shown = names.slice(0, 5);
    const remaining = names.length - shown.length;
    const text = shown.join(', ');
    return remaining > 0 ? `${text} + ${remaining} more` : text;
  };

  const guestDisplay = formatGuestNames();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-lg w-full mx-4 relative">
        {/* Close button */}
        <button
          onClick={onDismiss}
          className="absolute top-4 right-4 p-1 text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Heading */}
        <h2 className="text-xl font-bold text-gray-900 mb-1 pr-8">
          {summary.eventName} — last year's details
        </h2>

        {/* Summary */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-4 mb-6">
          <div className="space-y-2 text-sm text-gray-700">
            {(summary.guestCount || guestDisplay) && (
              <div className="flex items-start gap-2">
                <Users className="w-4 h-4 mt-0.5 text-gray-400 shrink-0" />
                <span>
                  {summary.guestCount ? `${summary.guestCount} guests` : ''}
                  {summary.guestCount && guestDisplay ? ' — ' : ''}
                  {guestDisplay || ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-gray-400 shrink-0" />
              <span>
                {summary.teamCount} team{summary.teamCount !== 1 ? 's' : ''}, {summary.itemCount}{' '}
                item{summary.itemCount !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={onOpenDates}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Calendar className="w-4 h-4 text-accent" />
            Enter new dates
          </button>
          <button
            onClick={onOpenPeople}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Users className="w-4 h-4 text-accent" />
            Edit guest list
          </button>
          <button
            onClick={onOpenItems}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Package className="w-4 h-4 text-accent" />
            Edit items
          </button>
          <button
            onClick={onOpenDetails}
            className="flex items-center gap-2 px-4 py-3 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
          >
            <Settings className="w-4 h-4 text-accent" />
            Edit event details
          </button>
        </div>

        {/* Dismiss */}
        <button
          onClick={onDismiss}
          className="w-full px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
        >
          Start planning
        </button>
      </div>
    </div>
  );
}
