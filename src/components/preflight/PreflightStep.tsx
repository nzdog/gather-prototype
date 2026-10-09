/**
 * One of the pre-flight's five steps. Moved out of the page unchanged in what it shows by [[GTC-377]]
 * (walkthrough item 34), so a suite can render it: a Next page may export nothing but itself.
 *
 * GTC-377, ruled 2026-10-09 — THE STEPS FOLD, CLOSED TO START WITH. A step given `onToggle` folds,
 * with the ▾ and the fold AccordionShell's own rows use (Q1); the page decides what is open, and
 * several steps may be open at once. Its row stays the whole step's title: "Step N of 5", the
 * title, the blurb, and the line that warns her when something inside needs her (W1 to W3). The
 * tick box sits beside the row, outside the toggle, so she can tick a step without opening it
 * (ruling 3 at scoping), and ticking never opens or closes anything (Q5). A closed step keeps what
 * is inside it on the page, as Moment 2's sections do (Q8).
 *
 * Ready, which holds Send, is given no `onToggle` and never folds (ruling 2 at scoping, Q3); nor
 * does a step an invites-only event does not need (Q4).
 */

import { FoldBody, FoldChevron } from '@/components/plan/AccordionShell';
import { INVITES_ONLY_WORDS } from '@/lib/setup/invites-only';

/** A closed row's line (W1 to W3): amber, with Moment 2's dot, when something needs her. */
export interface StepLine {
  text: string;
  amber: boolean;
}

export default function PreflightStep({
  n,
  title,
  blurb,
  checked,
  onCheck,
  checkLabel = 'Checked',
  settled = false,
  open = false,
  onToggle,
  line = null,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  /**
   * [[GTC-311]] SCOPED ruling 7: no check may claim she LOOKED AT what she CHOSE. Step 4 now carries
   * decisions, so its box reads "Settled" — true of what she read and of what she decided (W9,
   * ruled 2026-09-27). The other four steps are still things she looks at, and keep "Checked".
   */
  checkLabel?: string;
  /**
   * [[GTC-374]] (Q8, Q9) — a step an invites-only event does not need: it stays in its place, says
   * W11, and is ticked for her and greyed; what it would have shown is left out.
   */
  settled?: boolean;
  /** [[GTC-377]] — whether the step is open; read only when it folds. */
  open?: boolean;
  /** [[GTC-377]] — given, the step folds; left out (Ready), it is always open. */
  onToggle?: () => void;
  /** [[GTC-377]] (W1 to W3) — under the blurb on the row; none when nothing needs saying. */
  line?: StepLine | null;
  children: React.ReactNode;
}) {
  const folds = !settled && onToggle !== undefined;
  const rowLine =
    line && !settled ? (
      <span
        data-step-line=""
        className={`mt-1 flex items-center gap-1.5 text-sm ${
          line.amber ? 'text-amber-700' : 'text-gray-500'
        }`}
      >
        {line.amber && (
          <span className="w-1.5 h-1.5 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
        )}
        {line.text}
      </span>
    ) : null;
  const box = (
    <label className="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600">
      <input
        type="checkbox"
        checked={checked || settled}
        disabled={settled}
        onChange={(e) => onCheck(e.target.checked)}
        className="rounded border-gray-300 text-accent focus:ring-accent/40"
      />
      {checkLabel}
    </label>
  );

  return (
    // [[GTC-366]] (item 32): `id` and `data-step` are where W1's line takes her; `scroll-mt-4` keeps
    // the step's top just clear of the top of the screen when it arrives there.
    <section
      id={`step-${n}`}
      data-step={n}
      className={`mb-8 border border-gray-200 rounded-lg bg-white scroll-mt-4${settled ? ' opacity-75' : ''}`}
    >
      <header className={`px-5 pt-5 pb-3${folds && !open ? '' : ' border-b border-gray-100'}`}>
        <div className="flex items-start justify-between gap-4">
          {folds ? (
            <h2 className="min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`step-${n}-body`}
                onClick={onToggle}
                className="w-full flex items-start justify-between gap-3 text-left"
              >
                <span className="block min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Step {n} of 5
                  </span>
                  <span className="block text-lg font-medium text-gray-900">{title}</span>
                  <span className="block text-sm text-gray-500 mt-1">{blurb}</span>
                  {rowLine}
                </span>
                <FoldChevron open={open} className="self-center" />
              </button>
            </h2>
          ) : (
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Step {n} of 5</p>
              <h2 className="text-lg font-medium text-gray-900">{title}</h2>
              <p className="text-sm text-gray-500 mt-1">
                {settled ? INVITES_ONLY_WORDS.STEP_NOT_NEEDED : blurb}
              </p>
              {rowLine}
            </div>
          )}
          {box}
        </div>
      </header>
      {settled ? null : folds ? (
        <FoldBody open={open} id={`step-${n}-body`}>
          <div className="px-5 py-5">{children}</div>
        </FoldBody>
      ) : (
        <div className="px-5 py-5">{children}</div>
      )}
    </section>
  );
}
