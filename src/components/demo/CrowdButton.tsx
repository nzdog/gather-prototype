import { CROWD_WORDS } from '@/lib/demo/crowd';

/**
 * [[GTC-392]] part B — "ADD A CROWD" (W16 to W21), on Moment 1's household screen of a sample copy,
 * once her own household is saved. Founder plan rulings, 18 Oct 2026 (QB4: usable once).
 *
 * The page holds the state and makes the request (the households route, `{ demoCrowd: true }`);
 * this only draws it. No hooks.
 */
export type CrowdState = 'idle' | 'working' | 'done' | 'already' | 'failed';

export default function CrowdButton({ state, onAdd }: { state: CrowdState; onAdd: () => void }) {
  if (state === 'done' || state === 'already') {
    return (
      <p data-crowd="" className="mb-4 text-sm text-gray-600">
        {state === 'done' ? CROWD_WORDS.DONE : CROWD_WORDS.ALREADY}
      </p>
    );
  }
  return (
    <div data-crowd="" className="mb-4">
      <button
        type="button"
        onClick={onAdd}
        disabled={state === 'working'}
        className="w-full py-2 text-sm font-medium text-accent border border-accent/40 rounded-lg hover:bg-accent/5 transition-colors disabled:opacity-50"
      >
        {state === 'working' ? CROWD_WORDS.WORKING : CROWD_WORDS.BUTTON}
      </button>
      <p className="mt-1.5 text-xs text-gray-500">{CROWD_WORDS.EXPLAIN}</p>
      {state === 'failed' && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {CROWD_WORDS.FAILED}
        </p>
      )}
    </div>
  );
}
