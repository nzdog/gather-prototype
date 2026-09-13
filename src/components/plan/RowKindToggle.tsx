'use client';

import { ROW_KIND_QUESTION, ROW_KIND_WORDS, type RowKindValue } from '@/lib/items/row-kind';

/**
 * GTC-302 (Unknown 2) — brought or done, on every add form.
 *
 * One component so the plan page's modal, the setup page's row and the coordinator's modal cannot
 * word or behave it three ways. The words are `ROW_KIND_WORDS`, ruled.
 */
export default function RowKindToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: RowKindValue;
  onChange: (kind: RowKindValue) => void;
  disabled?: boolean;
}) {
  const kinds: RowKindValue[] = ['ITEM', 'TASK'];
  return (
    <div
      role="radiogroup"
      aria-label={ROW_KIND_QUESTION}
      className="inline-flex rounded-md border border-gray-300 overflow-hidden"
    >
      {kinds.map((kind) => {
        const selected = value === kind;
        return (
          <button
            key={kind}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(kind)}
            className={`px-4 py-1.5 text-sm transition-colors disabled:opacity-50 ${
              selected ? 'bg-accent text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            {ROW_KIND_WORDS[kind]}
          </button>
        );
      })}
    </div>
  );
}
