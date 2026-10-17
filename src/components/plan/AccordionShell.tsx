'use client';

import { ChevronDown } from 'lucide-react';

/**
 * The accordion shell.
 *
 * Extracted verbatim from Moment2Step1Modal.tsx by GTC-188 (I1) so the pre-flight's
 * household rows collapse the same way Moment 2's sections do, rather than growing a
 * second accordion with its own chevron, timing and open-state convention.
 *
 * GTC-364 (item 3, Q1 and Q2): THE PARENT DECIDES WHAT IS OPEN, and both parents let several
 * rows be open at once, so opening one never shuts another above it and the row just tapped
 * stays where it was. The open box is never measured: a grid row moves between 0fr and 1fr, so
 * the box always fits its content, and a choice that adds options shows them at once.
 *
 * GTC-364 (item 18, W1 to W3): "Still deciding?" sits at the foot of the open box, away from the
 * title row. While a box is still deciding its title row says so, and its content is greyed but
 * still answers a tap — the parent takes the box out of still deciding when a choice is made.
 */

/** W1 — on the title row while a section is still deciding, open or closed. */
export const STILL_DECIDING_HINT = 'Still deciding · left out of the plan for now';
/** W2 — the link that turns it on, at the foot of the open section. */
export const STILL_DECIDING_ASK = 'Still deciding?';
/** W3 — the way out. */
export const STILL_DECIDING_WAY_OUT =
  '✓ Still deciding. Tap here, or pick something, to include it in the plan.';

/**
 * [[GTC-377]] (Q1) — the ▾ and the fold, shared with the pre-flight's steps, so every fold-out row
 * in Gather turns and opens the same way. The steps keep their own frame because their row carries
 * a tick box, which cannot sit inside this shell's one-button title row. The shell renders exactly
 * as it did before these were split out.
 */
export function FoldChevron({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}${className ? ` ${className}` : ''}`}
    >
      ▾
    </span>
  );
}

/** [[GTC-380]] W1 and W2 — the cue's words, closed and open. */
export const FOLD_WORDS = { SHOW: 'Show', HIDE: 'Hide' } as const;

/**
 * [[GTC-380]] (item 48; rulings 3 and 5) — the pre-flight's cue that a box opens: "Show" or "Hide"
 * beside a drawn chevron (lucide's ChevronDown, 20px, dark grey), turned when open. Both are for
 * the eye only (`aria-hidden`): the row's own name is read, and `aria-expanded` says whether it is
 * open (Q5). Moment 2's boxes keep `FoldChevron` (Q6).
 */
export function FoldCue({ open, className }: { open: boolean; className?: string }) {
  return (
    <span
      data-fold-cue=""
      aria-hidden="true"
      className={`flex shrink-0 items-center gap-1 text-sm font-medium text-gray-700${className ? ` ${className}` : ''}`}
    >
      <span>{open ? FOLD_WORDS.HIDE : FOLD_WORDS.SHOW}</span>
      <ChevronDown
        strokeWidth={2.25}
        className={`h-5 w-5 transition-transform duration-200${open ? ' rotate-180' : ''}`}
      />
    </span>
  );
}

/**
 * [[GTC-380]] (ruling 1, C4) — a fold-out row's shade, only where a pointer can hover, so a touch
 * screen never keeps a tapped row grey; and the sage ring a keyboard sees inside it (Q4).
 */
export const FOLD_ROW_SHADE = '[@media(hover:hover)]:hover:bg-gray-100';
export const FOLD_ROW_RING =
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent';

/** The open box is never measured: a grid row moves between 0fr and 1fr (GTC-364). */
export function FoldBody({
  open,
  id,
  children,
}: {
  open: boolean;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      id={id}
      className="grid transition-all duration-200"
      style={{ gridTemplateRows: open ? '1fr' : '0fr', opacity: open ? 1 : 0 }}
    >
      <div className="overflow-hidden min-h-0">{children}</div>
    </div>
  );
}

export default function AccordionShell({
  id,
  label,
  open,
  onToggle,
  stillDeciding = false,
  onStillDecidingToggle,
  headerHint,
  showHide = false,
  children,
}: {
  id: string;
  label: string;
  open: boolean;
  onToggle: () => void;
  stillDeciding?: boolean;
  /** Omit to hide the "Still deciding?" affordance (e.g. dietary, GTC-150; notes, GTC-364) */
  onStillDecidingToggle?: () => void;
  /** Optional indicator rendered beside the label (e.g. "Needs confirmation") */
  headerHint?: React.ReactNode;
  /**
   * [[GTC-380]] (Q6) — the pre-flight's household rows: the cue, the shade and the ring. Left out
   * (Moment 2), the shell renders exactly as before.
   */
  showHide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      data-accordion={id}
      className={`border rounded-lg transition-colors ${
        stillDeciding ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className={
          showHide
            ? `w-full flex items-center justify-between gap-3 px-4 py-3 text-left ${open ? 'rounded-t-[7px]' : 'rounded-[7px]'} ${FOLD_ROW_SHADE} ${FOLD_ROW_RING}`
            : 'w-full flex items-center justify-between gap-3 px-4 py-3 text-left'
        }
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
          <span className={`font-medium ${stillDeciding ? 'text-gray-400' : 'text-gray-900'}`}>
            {label}
          </span>
          {headerHint}
          {stillDeciding && <span className="text-xs text-gray-500">{STILL_DECIDING_HINT}</span>}
        </span>
        {showHide ? <FoldCue open={open} /> : <FoldChevron open={open} />}
      </button>
      <FoldBody open={open}>
        <div className="px-4 pb-4">
          <div className={stillDeciding ? 'opacity-50' : ''}>{children}</div>
          {onStillDecidingToggle && (
            <button
              type="button"
              onClick={onStillDecidingToggle}
              className={`block text-xs mt-3 text-left transition-colors ${
                stillDeciding ? 'text-accent font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {stillDeciding ? STILL_DECIDING_WAY_OUT : STILL_DECIDING_ASK}
            </button>
          )}
        </div>
      </FoldBody>
    </div>
  );
}
