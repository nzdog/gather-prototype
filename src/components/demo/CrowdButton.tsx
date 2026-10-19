import { CROWD_WORDS } from '@/lib/demo/crowd';

/**
 * [[GTC-392]] part B — "ADD A CROWD" (W16 to W21), on Moment 1's household screen of a sample copy,
 * once her own household is saved. Founder plan rulings, 18 Oct 2026 (QB4: usable once).
 *
 * The page holds the state and makes the request (the households route, `{ demoCrowd: true }`);
 * this only draws it. No hooks.
 *
 * [[GTC-394]] tweak 4 (founder, 19 Oct 2026: "make Add a crowd much more obvious"): a filled accent
 * button, full width and larger, in a soft tinted box with its line. Words and rules unchanged.
 */
export type CrowdState = 'idle' | 'working' | 'done' | 'already' | 'failed';

export default function CrowdButton({ state, onAdd }: { state: CrowdState; onAdd: () => void }) {
  if (state === 'done' || state === 'already') {
    return (
      <p
        data-crowd=""
        className="mb-4 rounded-lg bg-sage-50 border border-sage-200 px-4 py-3 text-sm text-gray-700"
      >
        {state === 'done' ? CROWD_WORDS.DONE : CROWD_WORDS.ALREADY}
      </p>
    );
  }
  return (
    <div data-crowd="" className="mb-4 rounded-lg bg-sage-50 border border-sage-200 p-4">
      <button
        type="button"
        onClick={onAdd}
        disabled={state === 'working'}
        className="w-full py-3 text-base font-semibold text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors disabled:opacity-50"
      >
        {state === 'working' ? CROWD_WORDS.WORKING : CROWD_WORDS.BUTTON}
      </button>
      <p className="mt-2 text-sm text-gray-600">{CROWD_WORDS.EXPLAIN}</p>
      {state === 'failed' && (
        <p role="alert" className="mt-1 text-sm text-red-600">
          {CROWD_WORDS.FAILED}
        </p>
      )}
    </div>
  );
}
