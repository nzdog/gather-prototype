'use client';

import { Check } from 'lucide-react';
import type { EventPhase } from '@/lib/lifecycle';

/**
 * GTC-198 (A3d): this takes a PHASE, not a status.
 *
 * It used to key its steps off EventStatus, which meant the stepper carried its own
 * opinion about what FROZEN meant — the exact drift the send-lock reconciliation
 * exists to end. `getEventPhase` is the single definition; this renders it.
 *
 * Four phases, and only two of them are steps she takes: DRAFT and CONFIRMING are
 * authored, SENT is stamped by the press, and COMPLETE is the calendar's
 * (Moment 4 §10.1). Nothing here is clickable except the send.
 */
interface EventStageProgressProps {
  phase: EventPhase;
  onSendClick?: () => void;
}

const stages: { phase: EventPhase; label: string; icon: string }[] = [
  { phase: 'DRAFT', label: 'DRAFT', icon: '📝' },
  { phase: 'CONFIRMING', label: 'CONFIRMING', icon: '👥' },
  { phase: 'SENT', label: 'Sent', icon: '📤' },
  { phase: 'COMPLETE', label: 'PAST', icon: '✅' },
];

export default function EventStageProgress({ phase, onSendClick }: EventStageProgressProps) {
  const currentIndex = stages.findIndex((s) => s.phase === phase);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 mb-6">
      <div className="flex items-center justify-between">
        {stages.map((stage, index) => {
          const isPast = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isLast = index === stages.length - 1;

          const isSendStep = stage.phase === 'SENT';
          const isClickableFreezeStep = isSendStep && phase === 'CONFIRMING' && onSendClick;
          const displayLabel = isSendStep && phase === 'CONFIRMING' ? 'Send' : stage.label;

          return (
            <div key={stage.phase} className="flex items-center flex-1">
              {/* Stage Circle */}
              <div
                className={`flex flex-col items-center${isClickableFreezeStep ? ' cursor-pointer group' : ''}`}
                onClick={isClickableFreezeStep ? onSendClick : undefined}
                role={isClickableFreezeStep ? 'button' : undefined}
                tabIndex={isClickableFreezeStep ? 0 : undefined}
                onKeyDown={
                  isClickableFreezeStep
                    ? (e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSendClick();
                        }
                      }
                    : undefined
                }
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-semibold transition-all ${
                    isPast
                      ? 'bg-sage-600 text-white'
                      : isCurrent
                        ? 'bg-accent text-white ring-4 ring-blue-200'
                        : isClickableFreezeStep
                          ? 'bg-blue-100 text-blue-600 ring-2 ring-blue-300 group-hover:ring-blue-400 group-hover:bg-blue-200'
                          : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isPast ? <Check className="w-6 h-6" /> : stage.icon}
                </div>
                <div className="mt-2 text-center">
                  <p
                    className={`text-sm font-medium ${
                      isCurrent
                        ? 'text-accent font-semibold'
                        : isPast
                          ? 'text-gray-900'
                          : isClickableFreezeStep
                            ? 'text-blue-600 font-semibold group-hover:text-blue-700'
                            : 'text-gray-400'
                    }`}
                  >
                    {displayLabel}
                  </p>
                  {isCurrent && (
                    <p className="text-xs text-accent font-medium mt-0.5">Current Status</p>
                  )}
                </div>
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div className="flex-1 mx-4 mb-8">
                  <div
                    className={`h-1 rounded transition-all ${
                      index < currentIndex ? 'bg-sage-600' : 'bg-gray-200'
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
        {phase === 'DRAFT' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">DRAFT</p>
            <p>
              Build your plan: add teams, items, and resolve any conflicts. When ready, move to
              CONFIRMING to share with your team and assign items.
            </p>
          </div>
        )}
        {phase === 'CONFIRMING' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">CONFIRMING</p>
            <p>
              Share invite links with your team and assign all items to people. Once all items are
              assigned, you can send the plan to your guests.
            </p>
            <p className="mt-3 text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
              Share your invite links with guests and wait for them to confirm their items. Once
              everyone has responded, you can send the plan to your guests.
            </p>
          </div>
        )}
        {phase === 'SENT' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">SENT</p>
            <p>
              The asks are with your guests. You can still change anything — the history keeps the
              story. Replies arrive as they come.
            </p>
          </div>
        )}
        {phase === 'COMPLETE' && (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-900 mb-1">PAST</p>
            <p>The day has been. You can save this plan as a template for future events.</p>
          </div>
        )}
      </div>
    </div>
  );
}
