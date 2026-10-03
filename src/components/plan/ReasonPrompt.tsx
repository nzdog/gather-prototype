'use client';

/**
 * GTC-202 (A3c-2) — THE FLOW THAT ASKS.
 *
 * Plan §13.1, endorsed by Nigel 2026-08-03, is the load-bearing reconciliation between
 * Hinge §2's "the why is REQUIRED for changes that touch someone" and Moment 4 §7's
 * "the product never... demands justification":
 *
 *   > the reason is required *of the flow* (THE UI ALWAYS ASKS) and never *of the
 *   > server* (a reason-less change lands, with reasonRequired: true, reason: null)
 *
 * GTC-196 built the server half. GTC-197 promised this half — "a general reason-prompt
 * component... used by any change the why-scope rule flags, from any surface" — and did
 * not build it, which left every post-send touching-someone change landing
 * `reason: null` because nothing could send one. This is that component.
 *
 * TWO RULES IT MUST NEVER BREAK
 *
 * 1. IT ASKS BY THE SERVER'S OWN RULE. `ask()` calls `whyTrigger()` from
 *    src/lib/ledger.ts — the exact function `recordChange()` consults. It is pure and
 *    client-safe (its only @prisma/client import is a type, which erases at build). If
 *    no trigger fires, `ask()` resolves immediately and renders NOTHING. There is one
 *    definition of "touches someone"; a screen cannot drift from it. Writing a second
 *    rulebook here is exactly how FROZEN got out of step with itself.
 *
 * 2. IT NEVER BLOCKS. Skip completes the change with a null reason, recorded honestly.
 *    No required field, no validation, no disabled button, and Skip is not styled as
 *    the lesser choice. Moment 4 §7: "It states facts plainly... and never says
 *    'hang on' or demands justification."
 *
 * Cancel is not a block either — it abandons a change she has not yet made. Nothing was
 * altered, so nothing is owed.
 */

import { useCallback, useState } from 'react';
import { X } from 'lucide-react';
import { whyTrigger, type PendingChange, type WhyTrigger } from '@/lib/ledger';
import { toLifecycleEvent, type SerialisedEvent } from '@/lib/lifecycle';

/**
 * What is about to happen, in her terms — one line per trigger.
 *
 * These describe the ACT, not a rule. "You're moving an ask someone already has" is a
 * fact about what she is doing; "reassignment requires a reason" would be a demand.
 */
const TRIGGER_LINE: Record<WhyTrigger, string> = {
  T1: "You're moving an ask someone already has.",
  T2: "You're removing someone who's holding things.",
  T3: "You're deleting something someone's holding.",
  T4: "You're changing an ask someone's already answered.",
  T5: "You're changing the date or venue.",
};

export interface ReasonAnswer {
  /** False only when she backed out of the change entirely. */
  proceed: boolean;
  /** Her note, or null for "skipped" — which the ledger records honestly. */
  reason: string | null;
}

/** Proceed with no note and no dialog. The answer for every non-triggering change. */
const SILENT: ReasonAnswer = { proceed: true, reason: null };

interface Pending {
  trigger: WhyTrigger;
  resolve: (answer: ReasonAnswer) => void;
}

/**
 * Ask for the why when — and only when — the why-scope rule says one is owed.
 *
 * Usage at a call site is two lines:
 *
 *   const answer = await ask({ action: 'DELETE_ASSIGNMENT', ... }, event);
 *   if (!answer.proceed) return;
 *   ...body: JSON.stringify({ reason: answer.reason })
 *
 * Render `{element}` once anywhere in the surface's tree.
 */
export function useReasonPrompt() {
  const [pending, setPending] = useState<Pending | null>(null);

  const ask = useCallback(
    (change: PendingChange, event: SerialisedEvent | null | undefined): Promise<ReasonAnswer> => {
      // No event loaded yet: nothing can be known about the phase, so nothing is asked.
      // The server still applies the rule — this is a display decision, not the gate.
      if (!event) return Promise.resolve(SILENT);

      const trigger = whyTrigger(change, toLifecycleEvent(event));
      if (trigger === null) return Promise.resolve(SILENT);

      return new Promise<ReasonAnswer>((resolve) => setPending({ trigger, resolve }));
    },
    []
  );

  /**
   * Ask once for a batch of changes, not once per change.
   *
   * A single save that moves eight assignments is one act to her and one changeSet to
   * the ledger; asking eight times would be interrogation by volume. The prompt fires
   * if ANY change in the batch triggers, and the answer rides all of them.
   */
  const askForBatch = useCallback(
    (
      changes: PendingChange[],
      event: SerialisedEvent | null | undefined
    ): Promise<ReasonAnswer> => {
      if (!event) return Promise.resolve(SILENT);

      const lifecycleEvent = toLifecycleEvent(event);
      const first = changes.map((c) => whyTrigger(c, lifecycleEvent)).find((t) => t !== null);
      if (!first) return Promise.resolve(SILENT);

      return new Promise<ReasonAnswer>((resolve) => setPending({ trigger: first, resolve }));
    },
    []
  );

  const settle = useCallback(
    (answer: ReasonAnswer) => {
      pending?.resolve(answer);
      setPending(null);
    },
    [pending]
  );

  const element = pending ? (
    <ReasonPromptModal
      trigger={pending.trigger}
      onSave={(reason) => settle({ proceed: true, reason })}
      onSkip={() => settle({ proceed: true, reason: null })}
      onCancel={() => settle({ proceed: false, reason: null })}
    />
  ) : null;

  return { ask, askForBatch, element };
}

interface ReasonPromptModalProps {
  trigger: WhyTrigger;
  onSave: (reason: string) => void;
  onSkip: () => void;
  onCancel: () => void;
}

export function ReasonPromptModal({ trigger, onSave, onSkip, onCancel }: ReasonPromptModalProps) {
  const [note, setNote] = useState('');

  // An empty note saves as a SKIP, never as reason: "". An empty string in the ledger
  // would read as an answer that was given and said nothing.
  const submit = () => {
    const trimmed = note.trim();
    if (trimmed === '') onSkip();
    else onSave(trimmed);
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4"
      onClick={onCancel}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Keep a note?"
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          // Cmd/Ctrl+Enter saves, because the field is a textarea.
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
        }}
      >
        <div className="flex items-start justify-between p-5 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Keep a note?</h2>
            <p className="text-sm text-gray-600 mt-1">{TRIGGER_LINE[trigger]}</p>
          </div>
          <button
            onClick={onCancel}
            aria-label="Cancel this change"
            className="text-gray-400 hover:text-gray-600 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-3">
          {/* Hinge §2, near enough verbatim: "The reason is not compliance — it's her
              own memory", and its own worked example. Saying so in the dialog is what
              stops it reading as an audit demand. */}
          <p className="text-sm text-gray-500">
            Just for you, later — <em>why did I reassign the beef?</em> Nothing is sent to anyone.
          </p>

          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Pete couldn't do it"
            rows={3}
            autoFocus
            className="w-full text-sm px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
          />

          {/* Both buttons complete the change. Skip is a peer, not a get-out: §13.1
              says the flow asks and the server accepts either answer. */}
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="flex-1 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Skip
            </button>
            <button
              onClick={submit}
              className="flex-1 py-2 text-sm font-medium text-white bg-accent rounded-lg hover:bg-accent-dark transition-colors"
            >
              Save note
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
