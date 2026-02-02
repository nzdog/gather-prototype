'use client';

import { Check } from 'lucide-react';
import { SetupProgress, SetupStep } from '@/hooks/useEventSetupProgress';

interface SetupChecklistBannerProps {
  progress: SetupProgress;
  onDismiss: () => void;
}

export default function SetupChecklistBanner({ progress, onDismiss }: SetupChecklistBannerProps) {
  const { steps, completedCount, totalSteps, allComplete, nextStep } = progress;

  const handleStepClick = (step: SetupStep) => {
    // Only allow clicking incomplete steps
    if (!step.complete && step.action) {
      step.action();
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-100 py-4 px-6 mb-6">
      <div className="max-w-7xl mx-auto">
        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center flex-1 gap-2">
            {steps.map((step, index) => {
              const isComplete = step.complete;
              const isNext = nextStep?.number === step.number;
              const isLast = index === steps.length - 1;

              return (
                <div key={step.number} className="flex items-center flex-1">
                  {/* Step Indicator */}
                  <div className="flex flex-col items-center">
                    <button
                      onClick={() => handleStepClick(step)}
                      disabled={isComplete}
                      className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                        isComplete
                          ? 'bg-sage-600 cursor-default'
                          : isNext
                            ? 'bg-white ring-2 ring-accent-300 cursor-pointer hover:ring-accent-400'
                            : 'bg-gray-200 cursor-pointer hover:bg-gray-300'
                      }`}
                      aria-label={`${step.label} - ${isComplete ? 'Complete' : 'Incomplete'}`}
                    >
                      {isComplete ? (
                        <Check className="w-4 h-4 text-white" />
                      ) : isNext ? (
                        <span className="text-accent-600 font-semibold text-sm">{step.number}</span>
                      ) : (
                        <span className="text-gray-400 text-sm">{step.number}</span>
                      )}
                    </button>

                    {/* Step Label */}
                    <div className="mt-1.5 text-center max-w-[80px]">
                      <p
                        className={`text-xs font-medium leading-tight ${
                          isComplete
                            ? 'text-sage-700'
                            : isNext
                              ? 'text-accent-700'
                              : 'text-gray-400'
                        }`}
                      >
                        {step.label}
                      </p>
                    </div>
                  </div>

                  {/* Connecting Line */}
                  {!isLast && (
                    <div className="flex-1 mx-2 mb-6">
                      <div
                        className={`h-0.5 transition-colors ${
                          isComplete ? 'bg-sage-600' : 'bg-gray-200'
                        }`}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress Text / Completion Message */}
        <div className="flex items-center justify-between">
          <div className="text-sm">
            {allComplete ? (
              <p className="text-sage-700 font-medium">All set — your event is ready to share</p>
            ) : (
              <p className="text-gray-500">
                {completedCount} of {totalSteps} complete
              </p>
            )}
          </div>

          {/* Dismiss Button (only when all complete) */}
          {allComplete && (
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Dismiss checklist"
            >
              <span className="text-sm font-medium">Dismiss ✕</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
