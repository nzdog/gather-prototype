'use client';

import { Check } from 'lucide-react';

type EventStatus = 'DRAFT' | 'CONFIRMING' | 'FROZEN' | 'COMPLETE';

interface EventStageProgressProps {
  currentStatus: EventStatus;
}

const stages: { status: EventStatus; label: string; icon: string }[] = [
  { status: 'DRAFT', label: 'Draft', icon: '📝' },
  { status: 'CONFIRMING', label: 'Confirming', icon: '👥' },
  { status: 'FROZEN', label: 'Frozen', icon: '🧊' },
  { status: 'COMPLETE', label: 'Complete', icon: '✅' },
];

export default function EventStageProgress({ currentStatus }: EventStageProgressProps) {
  const currentIndex = stages.findIndex((s) => s.status === currentStatus);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;
          const isLast = index === stages.length - 1;

          return (
            <div key={stage.status} className="flex items-center flex-1">
              {/* Stage Circle */}
              <div className="flex flex-col items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-semibold transition-all ${
                    isPast
                      ? 'bg-green-600 text-white'
                      : isCurrent
                      ? 'bg-blue-600 text-white ring-4 ring-blue-200'
                      : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isPast ? <Check className="w-6 h-6" /> : stage.icon}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent
                        ? 'text-blue-600 font-semibold'
                        : isPast
                        ? 'text-gray-900'
                        : 'text-gray-400'
                    }`}
                  >
                    {stage.label}
                  </p>
                  {isCurrent && (
                    <p className="text-xs text-blue-600 font-medium mt-0.5">Current Stage</p>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div className="flex-1 mx-4 mb-8">
                  <div
                    className={`h-1 rounded transition-all ${
                      index < currentIndex ? 'bg-green-600' : 'bg-gray-200'
                    }`}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Stage Description */}
      <div className="mt-6 pt-4 border-t">
        {currentStatus === 'DRAFT' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">Draft Stage</p>
            <p>
              Build your plan: add teams, items, and resolve any conflicts. When ready, move to
              Confirming to share with your team and assign items.
            </p>
          </div>
        )}
        {currentStatus === 'CONFIRMING' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">Confirming Stage</p>
            <p>
              Share invite links with your team and assign all items to people. Once all items are
              assigned, freeze the plan to lock it for execution.
            </p>
          </div>
        )}
        {currentStatus === 'FROZEN' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">Frozen Stage</p>
            <p>
              Plan is locked and ready for execution. Team members can view their assignments and
              acknowledge items. Mark complete when the event is finished.
            </p>
          </div>
        )}
        {currentStatus === 'COMPLETE' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">Complete</p>
            <p>Event completed! You can save this plan as a template for future events.</p>
          </div>
        )}
      </div>
    </div>
  );
}
