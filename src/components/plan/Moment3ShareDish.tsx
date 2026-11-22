'use client';

/**
 * [[GTC-472]] — SHARING ONE DISH, THE PICKER AND THE SPLIT. Inside the dish's Details box
 * (Moment3ItemDetail.tsx), after "Share with someone" is pressed (the founder's ruling D3 A, 22 Nov
 * 2026). The same sheet holds both steps, so on a phone at 390 pixels nothing is added to the page's
 * rows: the box is already a sheet from the bottom of the screen.
 *
 *   1. the picker — the people the screen already lists, each row 44 pixels tall; anyone who already
 *      has the dish is greyed (W3) and cannot be pressed;
 *   2. the split — one line per person: the name, a number box (a decimal keypad) and the unit word.
 *      Nothing is written until "Share it". W10 says when her numbers do not add up to the total and
 *      NEVER blocks; W6 says when the amount cannot be divided; after the invitations have gone W7
 *      says nobody is messaged about an amount that dropped.
 *
 * The dividing rules are src/lib/moment3/share-split.ts, the one place the server also uses. This
 * component saves nothing itself: it hands the confirmed lines to `onConfirm`, which the view wires to
 * the one share route (one why asked after the send, then one save, all of it or none of it).
 */

import { useEffect, useMemo, useState } from 'react';
import {
  M3_SHARE_WORDS,
  shareAmountLabel,
  sharePersonLabel,
  sharePickHeading,
  shareToldLine,
  shareTotalLine,
} from '@/lib/moment3/words';
import {
  splitTotal,
  sumAmounts,
  validShareAmount,
  type ShareAmountLine,
  type SharePreview,
} from '@/lib/moment3/share-split';

export interface ShareablePerson {
  personId: string;
  name: string;
}

interface Moment3ShareDishProps {
  dishName: string;
  people: ShareablePerson[];
  /** After the invitations have gone: W7 is said when someone's amount drops. */
  sentAt: boolean;
  /** Reads the dish's rows (the share route's preview); null when it could not be read. */
  onLoad: () => Promise<SharePreview | null>;
  /** Saves her confirmed lines; true when saved, false when not (the why was cancelled, or it failed). */
  onConfirm: (
    personId: string,
    preview: SharePreview,
    lines: ShareAmountLine[]
  ) => Promise<boolean>;
  /** The save is under way (the why may be asking): the box leaves Escape to it. */
  onBusy: (busy: boolean) => void;
  /** Back to the dish's details. */
  onBack: () => void;
}

export default function Moment3ShareDish({
  dishName,
  people,
  sentAt,
  onLoad,
  onConfirm,
  onBusy,
  onBack,
}: Moment3ShareDishProps) {
  const [preview, setPreview] = useState<SharePreview | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [typed, setTyped] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    void onLoad().then((p) => {
      if (!live) return;
      // The view has said "That didn't save. Try again." (a failed read); back to the details.
      if (p) setPreview(p);
      else onBack();
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const holders = useMemo(() => new Set((preview?.rows ?? []).map((r) => r.personId)), [preview]);
  const chosen = personId ? (people.find((p) => p.personId === personId) ?? null) : null;

  /** The split she is shown to start with: the total divided between everyone, or nothing to type. */
  const proposed = (p: SharePreview): string[] => {
    const parts = p.divided && p.total !== null ? splitTotal(p.total, p.rows.length + 1) : null;
    return parts ? parts.map((x) => String(x)) : [];
  };

  const pick = (id: string) => {
    if (!preview) return;
    setPersonId(id);
    setTyped(proposed(preview));
  };

  const numbers = typed.map((t) => (t.trim() === '' ? NaN : Number(t)));
  const editable = Boolean(preview?.divided) && typed.length === (preview?.rows.length ?? 0) + 1;
  const allValid = !editable || numbers.every((n) => validShareAmount(n));
  const sum = editable && allValid ? sumAmounts(numbers) : null;
  /** W10 — only when her numbers do not add up to the total. It never blocks. */
  const totalLine =
    preview &&
    sum !== null &&
    preview.total !== null &&
    Math.round(sum * 100) !== Math.round(preview.total * 100)
      ? shareTotalLine(sum, preview.total)
      : null;
  /** W7 — after the send, the people whose amount dropped. */
  const dropped =
    sentAt && preview && editable && allValid
      ? preview.rows.filter((r, i) => r.amount !== null && numbers[i] < r.amount).map((r) => r.name)
      : [];

  const confirm = async () => {
    if (!preview || !chosen || saving || !allValid) return;
    const lines: ShareAmountLine[] = editable
      ? [
          ...preview.rows.map((r, i) => ({
            itemId: r.itemId,
            before: r.amount,
            amount: numbers[i],
          })),
          { itemId: null, before: null, amount: numbers[preview.rows.length] },
        ]
      : [];
    setSaving(true);
    onBusy(true);
    try {
      await onConfirm(chosen.personId, preview, lines);
    } finally {
      setSaving(false);
      onBusy(false);
    }
  };

  const isJob = preview?.kind === 'TASK';

  return (
    <div data-m3-share>
      {!preview && <p className="mt-3 text-sm text-gray-500" aria-busy="true" />}

      {preview && !chosen && (
        <div data-m3-share-picker>
          <h3 className="mt-3 text-sm font-medium text-gray-900 break-words">
            {sharePickHeading(dishName)}
          </h3>
          <ul className="mt-2 max-h-72 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded">
            {people.map((p) => {
              const has = holders.has(p.personId);
              return (
                <li key={p.personId}>
                  <button
                    type="button"
                    data-m3-share-person={p.personId}
                    disabled={has}
                    onClick={() => pick(p.personId)}
                    aria-label={sharePersonLabel(dishName, p.name)}
                    className="w-full min-h-[44px] flex items-center justify-between gap-3 px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-50 disabled:text-gray-400 disabled:hover:bg-white disabled:cursor-not-allowed"
                  >
                    <span className="min-w-0 break-words">{p.name}</span>
                    {has && (
                      <span className="shrink-0 text-xs text-gray-500">
                        {M3_SHARE_WORDS.ALREADY_HAS}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onBack}
              className="text-sm px-3 py-1.5 text-gray-700 rounded hover:bg-gray-100"
            >
              {M3_SHARE_WORDS.BACK}
            </button>
          </div>
        </div>
      )}

      {preview && chosen && (
        <div data-m3-share-split>
          {/* W4 invites a change, so it is said only when there are numbers to change. */}
          {editable && <p className="mt-3 text-sm text-gray-900">{M3_SHARE_WORDS.SPLIT_HEAD}</p>}
          <ul className="mt-2 space-y-1">
            {[...preview.rows.map((r) => r.name), chosen.name].map((name, i) => (
              <li key={`${name}-${i}`} className="flex items-center gap-2 min-h-[44px]">
                <span className="flex-1 min-w-0 break-words text-sm text-gray-900">{name}</span>
                {editable && (
                  <>
                    <input
                      type="text"
                      inputMode="decimal"
                      data-m3-share-amount={i}
                      aria-label={shareAmountLabel(name)}
                      value={typed[i] ?? ''}
                      onChange={(e) =>
                        setTyped((prev) => prev.map((t, k) => (k === i ? e.target.value : t)))
                      }
                      aria-invalid={!validShareAmount(numbers[i])}
                      className="w-24 text-right text-sm border border-gray-300 rounded px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                    {preview.unitWord && (
                      <span className="text-sm text-gray-600">{preview.unitWord}</span>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {totalLine && (
            <p data-m3-share-total className="mt-2 text-sm text-gray-600">
              {totalLine}
            </p>
          )}
          {!editable && !isJob && (
            <p data-m3-share-not-divided className="mt-2 text-sm text-gray-600">
              {M3_SHARE_WORDS.NOT_DIVIDED}
            </p>
          )}
          {dropped.length > 0 && (
            <p data-m3-share-told className="mt-2 text-sm text-amber-700">
              {shareToldLine(dropped)}
            </p>
          )}
          <div className="mt-5 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setPersonId(null)}
              disabled={saving}
              className="min-h-[44px] text-sm px-3 py-1.5 text-gray-700 rounded hover:bg-gray-100"
            >
              {M3_SHARE_WORDS.BACK}
            </button>
            <button
              type="button"
              data-m3-share-confirm
              onClick={() => void confirm()}
              disabled={saving || !allValid}
              className="min-h-[44px] text-sm px-4 py-1.5 bg-accent text-white rounded hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? M3_SHARE_WORDS.SHARING : M3_SHARE_WORDS.CONFIRM}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
