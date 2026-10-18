'use client';

import { useState } from 'react';
import { TYPICAL_WORDS } from '@/lib/demo/typical-answers';

/**
 * [[GTC-392]] part B — "FILL IN TYPICAL ANSWERS" (W23 to W26), on Moment 2's questions of a sample,
 * under the kind-of-event pills. Founder plan rulings, 18 Oct 2026 (QB5, QB6).
 *
 * `onFill` fills the questions' own state, so their own save stores it. It never presses Generate.
 */
export default function TypicalAnswersButton({ onFill }: { onFill: () => 'filled' | 'nothing' }) {
  const [said, setSaid] = useState<'filled' | 'nothing' | null>(null);
  return (
    <div data-typical-answers="" className="mt-4">
      <button
        type="button"
        onClick={() => setSaid(onFill())}
        className="px-4 py-2 text-sm font-medium text-accent border border-accent/40 rounded-lg hover:bg-accent/5 transition-colors"
      >
        {TYPICAL_WORDS.BUTTON}
      </button>
      <p className="mt-1.5 text-xs text-gray-500">{TYPICAL_WORDS.EXPLAIN}</p>
      {said && (
        <p className="mt-1 text-xs text-gray-700">
          {said === 'filled' ? TYPICAL_WORDS.DONE : TYPICAL_WORDS.NOTHING}
        </p>
      )}
    </div>
  );
}
