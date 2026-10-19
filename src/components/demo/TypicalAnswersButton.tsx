'use client';

import { useState } from 'react';
import { TYPICAL_WORDS } from '@/lib/demo/typical-answers';

/**
 * [[GTC-392]] part B — "FILL IN TYPICAL ANSWERS" (W23 to W26), on Moment 2's questions of a sample,
 * under the kind-of-event pills. Founder plan rulings, 18 Oct 2026 (QB5, QB6).
 *
 * `onFill` fills the questions' own state, so their own save stores it. It never presses Generate.
 *
 * [[GTC-394]] tweak 5 (founder, 19 Oct 2026: "the Fill in things button needs to be more obvious"):
 * a filled accent button, full width and larger, in a soft tinted box with its line, at the top of
 * the questions. Words unchanged.
 */
export default function TypicalAnswersButton({ onFill }: { onFill: () => 'filled' | 'nothing' }) {
  const [said, setSaid] = useState<'filled' | 'nothing' | null>(null);
  return (
    <div data-typical-answers="" className="mb-8 rounded-lg bg-sage-50 border border-sage-200 p-4">
      <button
        type="button"
        onClick={() => setSaid(onFill())}
        className="w-full py-3 text-base font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors"
      >
        {TYPICAL_WORDS.BUTTON}
      </button>
      <p className="mt-2 text-sm text-gray-600">{TYPICAL_WORDS.EXPLAIN}</p>
      {said && (
        <p className="mt-1 text-sm text-gray-700">
          {said === 'filled' ? TYPICAL_WORDS.DONE : TYPICAL_WORDS.NOTHING}
        </p>
      )}
    </div>
  );
}
