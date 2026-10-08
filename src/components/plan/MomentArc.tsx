'use client';

import { useState } from 'react';

/**
 * [[GTC-367]] (item 2) — a door on one Moment of the strip. The founder: *"Both now: show it and make
 * it tappable"*. `onGo` changes the stage in the setup page; `href` opens the setup page from another
 * page (the pre-flight); `locked` is a Moment she can't reach yet: a tap says its line (W6 to W9b)
 * under the strip and goes nowhere (plan ruling Q5). Which door each Moment gets is
 * `stripDoors` (src/lib/moments/strip.ts), so every screen reads one rule.
 */
export type ArcDoor = { onGo: () => void } | { href: string } | { locked: string };

interface MomentArcProps {
  currentMoment: 1 | 2 | 3 | 4;
  completedMoments?: number[];
  /** Absent: the strip renders as it always has, words only. */
  doors?: Partial<Record<1 | 2 | 3 | 4, ArcDoor>>;
  /** While a plan regenerates or is being held, the strip waits, as the back buttons do. */
  disabled?: boolean;
}

const moments = [
  { number: 1, label: "Who's coming?" },
  { number: 2, label: "What's the plan?" },
  { number: 3, label: "Who's on what?" },
  { number: 4, label: 'Is everyone sorted?' },
] as const;

export default function MomentArc({
  currentMoment,
  completedMoments = [],
  doors,
  disabled = false,
}: MomentArcProps) {
  const [note, setNote] = useState<string | null>(null);

  const row = (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-center gap-3 sm:gap-6">
      {moments.map((moment) => {
        const isCurrent = moment.number === currentMoment;
        const isCompleted = completedMoments.includes(moment.number);
        const door = isCurrent ? undefined : doors?.[moment.number];
        const opens = door !== undefined && !('locked' in door);

        const cellClass = `flex items-center gap-2 transition-opacity ${
          isCurrent || isCompleted ? 'opacity-100' : 'opacity-70'
        }`;
        const content = (
          <>
            <span
              className={`flex items-center justify-center w-7 h-7 rounded-full text-sm font-medium ${
                isCompleted
                  ? 'bg-green-600 text-white'
                  : isCurrent
                    ? 'bg-accent text-white'
                    : 'bg-gray-200 text-gray-500'
              }`}
            >
              {isCompleted ? '✓' : moment.number}
            </span>
            <span
              className={`text-base ${
                isCompleted
                  ? 'text-green-700 font-medium'
                  : isCurrent
                    ? 'text-gray-900 font-medium'
                    : 'text-gray-500'
              }${opens ? ' underline underline-offset-4' : ''}`}
            >
              {moment.label}
              {isCompleted && ' ✓'}
            </span>
          </>
        );

        if (!door) {
          return (
            <div
              key={moment.number}
              className={cellClass}
              aria-current={isCurrent && doors ? 'step' : undefined}
            >
              {content}
            </div>
          );
        }
        if ('href' in door) {
          return (
            <a
              key={moment.number}
              href={door.href}
              className={`${cellClass} hover:opacity-80`}
              aria-disabled={disabled || undefined}
              onClick={(e) => {
                if (disabled) e.preventDefault();
              }}
            >
              {content}
            </a>
          );
        }
        if ('locked' in door) {
          return (
            <button
              key={moment.number}
              type="button"
              aria-disabled="true"
              className={`${cellClass} text-left cursor-default`}
              onClick={() => setNote(door.locked)}
            >
              {content}
            </button>
          );
        }
        return (
          <button
            key={moment.number}
            type="button"
            disabled={disabled}
            className={`${cellClass} text-left hover:opacity-80 disabled:cursor-not-allowed`}
            onClick={() => {
              setNote(null);
              door.onGo();
            }}
          >
            {content}
          </button>
        );
      })}
    </div>
  );

  if (!doors) return row;
  return (
    <div data-moment-strip="">
      {row}
      {note && (
        <p
          data-strip-note=""
          role="status"
          className="mt-2 text-sm text-gray-500 italic sm:text-center"
        >
          {note}
        </p>
      )}
    </div>
  );
}
