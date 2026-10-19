import {
  PRETEND_WORDS,
  carrierLine,
  countLine,
  leaveLine,
  personLine,
  type PretendList,
} from '@/lib/demo/pretend-send';

/**
 * [[GTC-392]] part B — THE PRETEND SEND PANEL, under the refusal line (W2) in the pre-flight's last
 * step, on a sample only. Founder plan rulings, 18 Oct 2026 (QB1, QB2; W29 to W36).
 *
 * It shows what Send would have done: who would get a message, how, and what they are asked for;
 * who Gather would leave to her; and that each message is step 4's. Names only. It records nothing
 * and calls nothing. No hooks, so it renders the same on the server.
 *
 * [[GTC-394]] tweak 8 (founder, 19 Oct 2026: "The Open step 4 link goes"): the link and its wiring
 * are gone; the sentence W35 stays.
 */
export default function PretendSend({ state }: { state: PretendList | 'failed' }) {
  if (state === 'failed') {
    return (
      <p data-pretend-send="failed" className="text-sm text-gray-700 mt-3">
        {PRETEND_WORDS.FAILED}
      </p>
    );
  }
  const n = state.messages.length;
  return (
    <div
      data-pretend-send=""
      className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-4 text-sm text-gray-800"
    >
      <p className="font-medium text-gray-900">{PRETEND_WORDS.LEAD}</p>
      {n === 0 ? (
        <p className="mt-2">{PRETEND_WORDS.NOBODY}</p>
      ) : (
        <>
          <p className="mt-2">{countLine(n, state.emailed, state.texted)}</p>
          <ul className="mt-2 space-y-1 text-gray-700">
            {state.messages.map((x) => (
              <li key={`${x.name}-${x.channel}`}>{personLine(x)}</li>
            ))}
          </ul>
          {state.carrierFor.length > 0 && <p className="mt-2">{carrierLine(state.carrierFor)}</p>}
          {state.leftToHer.length > 0 && <p className="mt-2">{leaveLine(state.leftToHer)}</p>}
          <p className="mt-3">{PRETEND_WORDS.SAME}</p>
        </>
      )}
    </div>
  );
}
