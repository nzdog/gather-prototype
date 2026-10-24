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
 *
 * [[GTC-380]] (item 48, PLAN RULINGS 2026-10-11) — A STEP THAT FOLDS SHOWS IT CAN. Its toggle wears
 * "Show" or "Hide" beside a drawn chevron (`FoldCue`; W1, W2, rulings 3 and 5), at the right of the
 * row on a desktop and under its text on a phone (ruling 4). The whole title row, tick box
 * included, shades under a pointer that can hover, closed or open, and never the open contents
 * (ruling 1); a keyboard sees a sage ring inside the toggle. The tick box sits in a fixed-width
 * slot, wide enough for the wider of its two words ("Checked"), so every step's cue ends the same
 * distance from the box's right edge. Ready and the settled steps are as they were.
 *
 * [[GTC-399]] item 5 (the founder, 24 Oct 2026: "Move check box to the bottom when the accordion is
 * expanded so the user doesn't have to scroll up"; his ruling the same day, "How about two tick
 * boxes so either can be ticked") — AN OPEN STEP HAS A SECOND TICK BOX AT ITS FOOT. The row's box
 * is as it always was, open or closed. While a step that folds is open, a second box sits at the
 * bottom of what it shows (`data-tick-foot`), the same control in effect: the same checked state,
 * the same handler, the same words and rules, so ticking either ticks the step and shows both
 * ticked. Ready and the settled steps have only the row's.
 */

import { FOLD_ROW_RING, FOLD_ROW_SHADE, FoldBody, FoldCue } from '@/components/plan/AccordionShell';
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
  // [[GTC-399]] item 5: an open step that folds draws a second box at its foot.
  const boxAtFoot = folds && open;
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
  // [[GTC-399]] item 5: the foot's box, the row's in every way but its marker (no id on either:
  // each input sits inside its own label, which names it).
  const footBox = (
    <label className="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600">
      <input
        type="checkbox"
        data-tick-foot=""
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
      <header
        className={`px-5 pt-5 pb-3${folds && !open ? '' : ' border-b border-gray-100'}${
          folds ? ` ${open ? 'rounded-t-[7px]' : 'rounded-[7px]'} ${FOLD_ROW_SHADE}` : ''
        }`}
      >
        <div className="flex items-start justify-between gap-4">
          {folds ? (
            <h2 className="min-w-0 flex-1">
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`step-${n}-body`}
                onClick={onToggle}
                className={`w-full flex flex-col items-start gap-2 rounded text-left sm:flex-row sm:justify-between sm:gap-3 ${FOLD_ROW_RING}`}
              >
                <span className="block min-w-0">
                  <span className="block text-xs uppercase tracking-wide text-gray-400 mb-1">
                    Step {n} of 5
                  </span>
                  <span className="block text-lg font-medium text-gray-900">{title}</span>
                  <span className="block text-sm text-gray-500 mt-1">{blurb}</span>
                  {rowLine}
                </span>
                <FoldCue open={open} className="sm:self-center" />
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
          {folds ? (
            <div data-tick-slot="" className="flex w-[5.25rem] shrink-0 justify-end">
              {box}
            </div>
          ) : (
            box
          )}
        </div>
      </header>
      {settled ? null : folds ? (
        <FoldBody open={open} id={`step-${n}-body`}>
          <div className="px-5 py-5">
            {children}
            {boxAtFoot && (
              <div
                data-tick-bottom=""
                className="mt-6 pt-4 border-t border-gray-100 flex justify-end"
              >
                {footBox}
              </div>
            )}
          </div>
        </FoldBody>
      ) : (
        <div className="px-5 py-5">{children}</div>
      )}
    </section>
  );
}
