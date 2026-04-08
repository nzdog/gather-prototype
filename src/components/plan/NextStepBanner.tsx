'use client';

import { Users, X } from 'lucide-react';

interface NextStepBannerProps {
  onStartAssigning: () => void;
  onDismiss: () => void;
}

export default function NextStepBanner({ onStartAssigning, onDismiss }: NextStepBannerProps) {
  return (
    <div className="bg-accent-light/10 border border-accent/30 rounded-lg p-4 mb-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1">
          <div className="w-10 h-10 bg-accent/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <Users className="w-5 h-5 text-accent" />
          </div>
          <div>
            <p className="text-sage-900 font-medium">Your plan is ready!</p>
            <p className="text-sage-700 text-sm mt-0.5">
              Next up: assign items to your team members so everyone knows what to bring.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={onStartAssigning}
            className="bg-accent hover:bg-accent-dark text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Start assigning teams
          </button>
          <button
            onClick={onDismiss}
            className="text-sage-400 hover:text-sage-600 p-1 rounded transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
