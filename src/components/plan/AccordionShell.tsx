'use client';

/**
 * The accordion shell.
 *
 * Extracted verbatim from Moment2Step1Modal.tsx by GTC-188 (I1) so the pre-flight's
 * household rows collapse the same way Moment 2's sections do, rather than growing a
 * second accordion with its own chevron, timing and open-state convention. A pure move:
 * the Moment 2 modal imports it from here and behaves identically.
 *
 * SINGLE-OPEN BY DESIGN. `openAccordion` holds at most one id, so opening a row closes
 * the last one. Pass `null` as the initial value and everything starts collapsed.
 */

import { useRef } from 'react';

export default function AccordionShell({
  id,
  label,
  openAccordion,
  onToggle,
  stillDeciding = false,
  onStillDecidingToggle,
  headerHint,
  children,
}: {
  id: string;
  label: string;
  openAccordion: string | null;
  onToggle: (id: string | null) => void;
  stillDeciding?: boolean;
  /** Omit to hide the "Still deciding?" affordance (e.g. dietary, GTC-150) */
  onStillDecidingToggle?: () => void;
  /** Optional indicator rendered beside the label (e.g. "Needs confirmation") */
  headerHint?: React.ReactNode;
  children: React.ReactNode;
}) {
  const isOpen = openAccordion === id;
  const contentRef = useRef<HTMLDivElement>(null);

  return (
    <div
      className={`border rounded-lg transition-colors ${
        stillDeciding ? 'border-dashed border-gray-300 bg-gray-50' : 'border-gray-200 bg-white'
      }`}
    >
      <button
        type="button"
        onClick={() => onToggle(isOpen ? null : id)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2">
          <span className={`font-medium ${stillDeciding ? 'text-gray-400' : 'text-gray-900'}`}>
            {label}
          </span>
          {headerHint}
        </span>
        <span
          className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        >
          ▾
        </span>
      </button>
      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-200"
        style={{
          maxHeight: isOpen
            ? contentRef.current?.scrollHeight
              ? `${contentRef.current.scrollHeight + 40}px`
              : '1000px'
            : '0px',
          opacity: isOpen ? 1 : 0,
        }}
      >
        <div className="px-4 pb-4">
          {onStillDecidingToggle && (
            <button
              type="button"
              onClick={onStillDecidingToggle}
              className={`text-xs mb-3 transition-colors ${
                stillDeciding ? 'text-accent font-medium' : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {stillDeciding ? '✓ Still deciding — click to edit' : 'Still deciding?'}
            </button>
          )}
          <div className={stillDeciding ? 'opacity-50 pointer-events-none' : ''}>{children}</div>
        </div>
      </div>
    </div>
  );
}
