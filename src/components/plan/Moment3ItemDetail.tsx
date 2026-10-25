'use client';

/**
 * [[GTC-406]] — A DISH'S DETAILS ON MOMENT 3, and the amber "critical" tag on Moment 2's and
 * Moment 3's rows. The founder's rulings of 26 Oct 2026 (docs/tickets/GTC-406.md):
 *
 *   - Ruling 1 (14a): a small "Details" button at the right of each Moment 3 row opens this box.
 *   - Ruling 2 (15a): the box changes Critical and the dish's own drop-off place and time, and
 *     nothing else. The name and the amount are shown, not changed (they stay on Moment 2); who has
 *     it is shown, not changed (giving still happens by tapping on the list).
 *   - Ruling 3 (16a): the tag, in the look the pre-flight already uses for its amber "critical"
 *     tag on unassigned dishes (kept to the row's line height).
 *   - Ruling 4 (17a): a critical dish whose amount is still a placeholder blocks "Move on"; the box
 *     says so, and only then.
 *   - Ruling 6: the box saves nothing itself. It hands only what changed to `onSave`, which the setup
 *     page wires to the save Moment 2's edit box already uses (the item PATCH and its "why" prompt).
 *     An emptied drop-off box is null, never an empty string.
 *   - Ruling 7: a job (kind TASK) shows its name, who has it and the Critical tick; no Amount and no
 *     drop-off boxes, as in Moment 2.
 *
 * Escape or "Close" closes it; the view puts the focus back on the row's Details button. It never
 * changes who is picked or what is selected.
 */

import { useEffect, useId, useRef, useState } from 'react';
import { M3_DETAIL_WORDS } from '@/lib/moment3/words';
import { ANSWER_WORDS } from '@/lib/print/plan-lists';

/** What the box changes, each only when it changed. */
export interface Moment3ItemDetailChanges {
  critical?: boolean;
  dropOffLocation?: string | null;
  dropOffNote?: string | null;
}

/** What the box shows of a row (a Moment 3 item, as the setup page builds it). */
export interface Moment3ItemDetailFacts {
  id: string;
  name: string;
  kind: string;
  /** The amount and unit, or '' when the plan gives none. */
  detail: string;
  critical?: boolean;
  /** Its amount is still a placeholder that nobody has acknowledged (the hold rule's own test). */
  placeholderAmount?: boolean;
  dropOffLocation?: string | null;
  dropOffNote?: string | null;
}

/**
 * Ruling 3 — the amber tag, drawn on a critical row of Moment 2 and Moment 3, after the name and its
 * marks (the marks stay straight after the name). No taller than the row's line (leading-4 and a
 * 1px border: 18px), so a row keeps its height.
 */
export function CriticalTag() {
  return (
    <span
      data-critical-tag
      className="ml-1.5 inline-block align-middle text-[11px] leading-4 uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5"
    >
      {M3_DETAIL_WORDS.ROW_TAG}
    </span>
  );
}

/** The holder's answer in the board's own words, or null when the response is not known. */
export function answerWords(response: string | null | undefined): string | null {
  if (!response) return null;
  return (ANSWER_WORDS as Record<string, string>)[response] ?? null;
}

interface Moment3ItemDetailProps {
  item: Moment3ItemDetailFacts;
  /** Who has it now, or null. */
  holderName: string | null;
  /** Their answer in the board's words, when it is already on this screen (after the send); else null. */
  holderAnswer: string | null;
  /** Saves the changes; true when saved, false when not (the why was cancelled, or it failed). */
  onSave: (changes: Moment3ItemDetailChanges) => Promise<boolean>;
  onClose: () => void;
}

export default function Moment3ItemDetail({
  item,
  holderName,
  holderAnswer,
  onSave,
  onClose,
}: Moment3ItemDetailProps) {
  const isJob = item.kind === 'TASK';
  const [critical, setCritical] = useState(item.critical === true);
  const [dropOffPlace, setDropOffPlace] = useState(item.dropOffLocation ?? '');
  const [dropOffTime, setDropOffTime] = useState(item.dropOffNote ?? '');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  useEffect(() => {
    boxRef.current?.focus();
  }, []);

  // Escape closes the box wherever the focus is, and goes no further: a picked person stays
  // picked (the view's own Escape unpicks). While a save is under way (the why may be asking),
  // Escape is left to the why.
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape' || savingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const place = dropOffPlace.trim() || null;
  const time = dropOffTime.trim() || null;
  const changes: Moment3ItemDetailChanges = {
    ...(critical !== (item.critical === true) ? { critical } : {}),
    ...(!isJob && place !== (item.dropOffLocation?.trim() || null)
      ? { dropOffLocation: place }
      : {}),
    ...(!isJob && time !== (item.dropOffNote?.trim() || null) ? { dropOffNote: time } : {}),
  };
  const changed = Object.keys(changes).length > 0;
  // Ruling 4: said only for a critical dish (as ticked here) whose amount is still a placeholder.
  const needsAmount = !isJob && critical && item.placeholderAmount === true;

  const save = async () => {
    if (!changed || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      if (await onSave(changes)) {
        setDropOffPlace(place ?? '');
        setDropOffTime(time ?? '');
      }
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const who = holderName
    ? holderAnswer
      ? `${holderName} · ${holderAnswer}`
      : holderName
    : M3_DETAIL_WORDS.NOBODY_YET;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/30 p-4">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
        data-m3-detail={item.id}
        className="w-full max-w-md max-h-full overflow-y-auto bg-white rounded-lg border border-gray-200 shadow-lg p-5 focus:outline-none"
      >
        <h2 id={headingId} className="text-lg font-semibold text-gray-900 break-words">
          {item.name}
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          {!isJob && (
            <div data-m3-detail-amount>
              <dt className="text-gray-500">{M3_DETAIL_WORDS.AMOUNT}</dt>
              <dd className="text-gray-900 break-words">{item.detail || '—'}</dd>
            </div>
          )}
          <div data-m3-detail-who>
            <dt className="text-gray-500">{M3_DETAIL_WORDS.WHO}</dt>
            <dd className="text-gray-900 break-words">{who}</dd>
          </div>
        </dl>

        <label className="mt-4 flex items-start gap-2 text-sm text-gray-900">
          <input
            type="checkbox"
            checked={critical}
            onChange={(e) => setCritical(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
          />
          <span>{M3_DETAIL_WORDS.CRITICAL}</span>
        </label>
        {needsAmount && (
          <p data-m3-detail-needs-amount className="mt-2 text-sm text-amber-700">
            {M3_DETAIL_WORDS.NEEDS_AMOUNT}
          </p>
        )}

        {!isJob && (
          <div className="mt-4 space-y-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">
                {M3_DETAIL_WORDS.DROP_OFF_PLACE}
              </span>
              <input
                type="text"
                value={dropOffPlace}
                onChange={(e) => setDropOffPlace(e.target.value)}
                placeholder={M3_DETAIL_WORDS.DROP_OFF_PLACE_HINT}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-600 mb-1">
                {M3_DETAIL_WORDS.DROP_OFF_TIME}
              </span>
              <input
                type="text"
                value={dropOffTime}
                onChange={(e) => setDropOffTime(e.target.value)}
                placeholder={M3_DETAIL_WORDS.DROP_OFF_TIME_HINT}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </label>
          </div>
        )}

        <div className="mt-5 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm px-3 py-1.5 text-gray-700 rounded hover:bg-gray-100"
          >
            {M3_DETAIL_WORDS.CLOSE}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !changed}
            className="text-sm px-4 py-1.5 bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50"
          >
            {M3_DETAIL_WORDS.SAVE}
          </button>
        </div>
      </div>
    </div>
  );
}
