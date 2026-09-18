'use client';

import MomentArc from '@/components/plan/MomentArc';

interface Moment2OpeningProps {
  eventName: string;
  onStart: () => void;
}

export default function Moment2Opening({ onStart }: Moment2OpeningProps) {
  return (
    <div className="fixed inset-0 z-50 bg-white overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8 flex flex-col items-center justify-center min-h-screen">
        {/* MomentArc */}
        <MomentArc currentMoment={2} completedMoments={[1]} />

        {/* Assistant line */}
        <p className="mt-10 text-2xl font-semibold text-gray-900 text-center">
          Let&rsquo;s get this plan out of your head and onto the page.
        </p>

        {/* Primary action */}
        <div className="mt-8">
          <button
            type="button"
            onClick={onStart}
            className="px-6 py-3 bg-accent text-white font-medium rounded-lg hover:bg-accent-dark transition-colors"
          >
            Let&rsquo;s do this &rarr;
          </button>
        </div>
      </div>
    </div>
  );
}
