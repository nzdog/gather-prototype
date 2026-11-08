'use client';

import { useState } from 'react';
import { Play } from 'lucide-react';
import { FoldBody, FoldCue, FOLD_ROW_RING, FOLD_ROW_SHADE } from '@/components/plan/AccordionShell';
import { EXPLAINER_STEPS, EXPLAINER_WORDS, type ExplainerBlock } from '@/lib/demo/explainer-words';
import { MOMENT_HEADINGS } from '@/lib/moments/moment-words';

/**
 * [[GTC-457]] — THE EXPLAINER ON /demo (founder, 8 Nov 2026: "A detailed explainer in accordion
 * (default collapsed) that guides users through the platform").
 *
 * [[GTC-458]] (founder, 8 Nov 2026: "very boring page ... style it using Gather's design styles.
 * Have all the paragraph headings as titles that expand when clicked. Add some screen shots,
 * especially of the Add People buttons and suggest answers"): the one closed row became a heading,
 * the always-showing introduction, and one fold-out row per step, each closed on every visit. The
 * steps carry real screenshots of the sample. Styled from the theme's own tokens: sage for the
 * accent, the warm greys for the page, the serif the wordmark is set in for the heading.
 *
 * Built from the same pieces as the pre-flight's steps ([[GTC-377]], [[GTC-380]]): the shared fold
 * and the "Show" / "Hide" cue, so every fold-out in Gather opens the same way. Several steps can be
 * open at once, as in the pre-flight and Moment 2 ([[GTC-364]]): opening one never shuts another.
 * It reads no setting, makes no request and holds nothing but which steps are open; the page decides
 * whether to draw it (the demo start switch).
 *
 * A closed step's text is hidden from screen readers as well as from the eye (`aria-hidden`), and
 * its button says whether it is open (`aria-expanded`) and what it opens (`aria-controls`). The
 * screenshots load only when scrolled near (`loading="lazy"`), so a closed explainer costs a
 * visitor nothing.
 *
 * [[GTC-459]] (founder, 8 Nov 2026): each Moment opens with "What this does" and "When it’s done"
 * (short forms of its screen's lines), and Moments 3 and 4 carry a picture. A picture opens full
 * size in a new tab, which is the phone fix GTC-458 left open.
 */

/** The label a Moment's "does" and "done" lines open with: the screens' own words. */
const ROLE_LABELS = { does: MOMENT_HEADINGS.DOES, done: MOMENT_HEADINGS.DONE } as const;

function Block({ block, open }: { block: ExplainerBlock; open: boolean }) {
  if (block.kind === 'p') {
    if (!block.role) return <p>{block.text}</p>;
    return (
      <p>
        <span className="font-semibold text-warm-black">{ROLE_LABELS[block.role]}:</span>{' '}
        {block.text}
      </p>
    );
  }
  return (
    <figure className="mx-auto my-5" style={{ maxWidth: block.width }}>
      <div className="overflow-hidden rounded-lg border border-warm-grey-200 bg-warm-white shadow-sm">
        {/* Opens full size in a new tab, so the small text is readable on a phone. Not focusable
            while its step is closed. */}
        <a
          href={block.src}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={open ? undefined : -1}
          className="block"
        >
          {/* A plain img on purpose: fixed, already-cropped files in /public, nothing to resize. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={block.src}
            alt={block.alt}
            width={block.width}
            height={block.height}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
        </a>
      </div>
      <figcaption className="mt-2 text-xs leading-snug text-warm-grey-600">
        {block.caption}
      </figcaption>
    </figure>
  );
}

export default function DemoExplainer() {
  const [openSteps, setOpenSteps] = useState<ReadonlySet<string>>(new Set());
  const toggle = (heading: string) =>
    setOpenSteps((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });

  return (
    <section data-demo-explainer="" className="mt-12 text-left">
      <h2 className="font-serif text-2xl font-semibold tracking-tight text-warm-black">
        {EXPLAINER_WORDS.TITLE}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-warm-grey-700">{EXPLAINER_WORDS.INTRO}</p>

      <div className="mt-6 space-y-3">
        {EXPLAINER_STEPS.map((step, i) => {
          const open = openSteps.has(step.heading);
          const bodyId = `demo-explainer-step-${i}`;
          return (
            <div
              key={step.heading}
              data-demo-explainer-step=""
              className={`rounded-xl border bg-white transition-colors ${
                open ? 'border-sage-300 shadow-sm' : 'border-warm-grey-200'
              }`}
            >
              <button
                type="button"
                aria-expanded={open}
                aria-controls={bodyId}
                onClick={() => toggle(step.heading)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                  open ? 'rounded-t-[11px]' : 'rounded-[11px]'
                } ${FOLD_ROW_SHADE} ${FOLD_ROW_RING}`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                    open ? 'bg-sage-600 text-white' : 'bg-sage-100 text-sage-800'
                  }`}
                >
                  {step.badge ?? <Play className="h-3.5 w-3.5" fill="currentColor" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-sage-600">
                    {step.eyebrow}
                  </span>
                  <span className="block text-base font-semibold text-warm-black">
                    {step.heading}
                  </span>
                </span>
                <FoldCue open={open} />
              </button>
              <FoldBody open={open} id={bodyId}>
                <div
                  aria-hidden={!open}
                  className="space-y-3 border-t border-warm-grey-100 px-4 pb-5 pt-4 text-sm leading-relaxed text-warm-grey-700 sm:pl-[60px]"
                >
                  {step.blocks.map((block, j) => (
                    <Block key={j} block={block} open={open} />
                  ))}
                </div>
              </FoldBody>
            </div>
          );
        })}
      </div>
    </section>
  );
}
