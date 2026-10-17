'use client';

/**
 * [[GTC-373]] (item 23) — "Find a dish": the box above Moment 2's questions, and its results.
 *
 * Ruled 2026-10-08 (W1 to W12, Q1 to Q10 as proposed). The box sits in the questions' own flow,
 * never fixed or sticky, so it cannot cover "Generate plan →" or the ways out (Q3). Results are a
 * `ul > li > button` list, so `test:walkthrough-batch2`'s header finder (`div.rounded-lg > button`)
 * never meets them (C6). A tap empties the box and hands the row to the questions, which tick it and
 * show it (`onPick`); this file ticks nothing itself.
 */

import { useId, useState } from 'react';
import { MENU_SHOWN, MENU_WORDS, findInMenu, type MenuRow } from '@/lib/moments/menu-search';

/**
 * Q9 — the ring a found dish wears for two seconds, GTC-366's arrival ring without its rounding
 * (the option's label is already rounded). Written here, in a file Tailwind reads, so the classes
 * are built.
 */
export const MENU_ARRIVAL_RING = ['ring-2', 'ring-accent', 'ring-offset-2'];

export default function MenuSearch({
  rows,
  isTicked,
  dietaryNone,
  onPick,
  initialQuery = '',
}: {
  /** The kind's index (`buildMenuIndex`); empty means no menu, and nothing renders (Q2). */
  rows: MenuRow[];
  isTicked: (row: MenuRow) => boolean;
  /** "No dietary needs at this event" is ticked: a Dietary row says W12 instead (Q8). */
  dietaryNone: boolean;
  onPick: (row: MenuRow) => void;
  /** For a render in a test: what the box opens with. */
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const id = useId();
  if (rows.length === 0) return null;

  const found = findInMenu(rows, query);
  const shown = found.slice(0, MENU_SHOWN);
  const more = found.length - shown.length;
  const nothing = query.trim().length >= 2 && found.length === 0;

  const end = (row: MenuRow) => {
    if (row.kind === 'section') return MENU_WORDS.OPEN;
    if (row.kind === 'dietary' && dietaryNone) return MENU_WORDS.UNTICK_NONE_FIRST;
    return isTicked(row) ? MENU_WORDS.TICKED : MENU_WORDS.TICK;
  };

  return (
    <div data-menu-search="" className="mb-8">
      <label htmlFor={id} className="block text-sm font-medium text-gray-900 mb-1.5">
        {MENU_WORDS.LABEL}
      </label>
      <input
        id={id}
        type="search"
        autoComplete="off"
        value={query}
        placeholder={MENU_WORDS.PLACEHOLDER}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') setQuery('');
        }}
        className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {shown.length > 0 && (
        <ul className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden bg-white">
          {shown.map((row) => (
            <li key={row.id} className="border-t border-gray-100 first:border-t-0">
              <button
                type="button"
                data-menu-row={row.id}
                onClick={() => {
                  setQuery('');
                  onPick(row);
                }}
                className="w-full flex items-start justify-between gap-3 px-3 py-2.5 text-left hover:bg-gray-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm text-gray-900">{row.words}</span>
                  <span className="block text-xs text-gray-500">{row.where}</span>
                </span>
                <span
                  className={`shrink-0 text-xs ${isTicked(row) ? 'text-gray-900 font-medium' : 'text-gray-400'}`}
                >
                  {end(row)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {more > 0 && <p className="mt-1.5 text-xs text-gray-500">{MENU_WORDS.more(more)}</p>}
      {nothing && <p className="mt-2 text-sm text-gray-600">{MENU_WORDS.nothing(query.trim())}</p>}
    </div>
  );
}
