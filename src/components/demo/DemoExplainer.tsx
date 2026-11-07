'use client';

import { useState } from 'react';
import { FoldBody, FoldCue, FOLD_ROW_RING, FOLD_ROW_SHADE } from '@/components/plan/AccordionShell';
import { EXPLAINER_STEPS, EXPLAINER_WORDS } from '@/lib/demo/explainer-words';

/**
 * [[GTC-457]] — THE EXPLAINER ON /demo (founder, 8 Nov 2026: "A detailed explainer in accordion
 * (default collapsed) that guides users through the platform").
 *
 * One fold-out row, closed on every visit, built from the same pieces as the pre-flight's steps
 * ([[GTC-377]], [[GTC-380]]): the shared fold and the "Show" / "Hide" cue, so every fold-out in
 * Gather opens the same way. It is only words. It reads no setting, makes no request and holds
 * nothing but whether it is open; the page decides whether to draw it (the demo start switch).
 *
 * The closed text is hidden from screen readers as well as from the eye (`aria-hidden`), and the
 * button says whether it is open (`aria-expanded`) and what it opens (`aria-controls`).
 */
export default function DemoExplainer() {
  const [open, setOpen] = useState(false);
  return (
    <section
      data-demo-explainer=""
      className="mt-8 rounded-lg border border-gray-200 bg-white text-left"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="demo-explainer-body"
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left ${
          open ? 'rounded-t-[7px]' : 'rounded-[7px]'
        } ${FOLD_ROW_SHADE} ${FOLD_ROW_RING}`}
      >
        <span className="font-medium text-gray-900">{EXPLAINER_WORDS.TITLE}</span>
        <FoldCue open={open} />
      </button>
      <FoldBody open={open} id="demo-explainer-body">
        <div
          aria-hidden={!open}
          className="space-y-6 px-4 pb-5 text-sm leading-relaxed text-gray-700"
        >
          <p>{EXPLAINER_WORDS.INTRO}</p>
          {EXPLAINER_STEPS.map((step) => (
            <div key={step.heading}>
              <h2 className="mb-1 text-base font-semibold text-gray-900">{step.heading}</h2>
              <div className="space-y-2">
                {step.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </div>
          ))}
        </div>
      </FoldBody>
    </section>
  );
}
