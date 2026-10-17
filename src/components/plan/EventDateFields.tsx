'use client';

/**
 * [[GTC-385]] (item 53, Q1) — the event's date, for New Event and Edit Event.
 *
 * Closed: one "Date" and, under it, "It runs over more than one day". Open: "First day" and "Last
 * day" (the last day's `min` is the first, and moving the first past it moves it along), with
 * "Just the one day" to close. The end box exists ONLY while open, so it can never be a hidden
 * required field. A backwards pair (an old event, or a typed date) says the line. The rules are in
 * src/lib/events/date-pair.ts; this only draws them.
 */

import type { ReactNode } from 'react';
import {
  DATE_WORDS,
  changeFirst,
  closeMoreDays,
  datePairProblem,
  openMoreDays,
  type DatePairValue,
} from '@/lib/events/date-pair';

interface EventDateFieldsProps {
  value: DatePairValue;
  onChange: (next: DatePairValue) => void;
  labelClassName: string;
  inputClassName: string;
  /** Edit Event marks its required fields "*". */
  star?: boolean;
  icon?: ReactNode;
  /** 'grid' puts first and last side by side (Edit Event); 'stack' puts them one under the other. */
  layout?: 'stack' | 'grid';
  idPrefix?: string;
}

const LINK = 'mt-2 text-sm text-gray-600 underline underline-offset-2 hover:text-gray-900';

export default function EventDateFields({
  value,
  onChange,
  labelClassName,
  inputClassName,
  star = false,
  icon,
  layout = 'stack',
  idPrefix = '',
}: EventDateFieldsProps) {
  const label = (word: string) => `${word}${star ? ' *' : ''}`;
  const startId = `${idPrefix}startDate`;
  const endId = `${idPrefix}endDate`;

  if (!value.moreDays) {
    return (
      <div data-event-dates="one">
        <label htmlFor={startId} className={labelClassName}>
          {icon}
          {label(DATE_WORDS.DATE)}
        </label>
        <input
          type="date"
          id={startId}
          name="startDate"
          required
          value={value.first}
          onChange={(e) => onChange(changeFirst(value, e.target.value))}
          className={inputClassName}
        />
        <button type="button" onClick={() => onChange(openMoreDays(value))} className={LINK}>
          {DATE_WORDS.MORE_DAYS}
        </button>
      </div>
    );
  }

  const problem = datePairProblem(value);
  return (
    <div data-event-dates="more">
      <div className={layout === 'grid' ? 'grid grid-cols-2 gap-4' : 'space-y-6'}>
        <div>
          <label htmlFor={startId} className={labelClassName}>
            {icon}
            {label(DATE_WORDS.FIRST_DAY)}
          </label>
          <input
            type="date"
            id={startId}
            name="startDate"
            required
            value={value.first}
            onChange={(e) => onChange(changeFirst(value, e.target.value))}
            className={inputClassName}
          />
        </div>
        <div>
          <label htmlFor={endId} className={labelClassName}>
            {icon}
            {label(DATE_WORDS.LAST_DAY)}
          </label>
          <input
            type="date"
            id={endId}
            name="endDate"
            min={value.first || undefined}
            value={value.last}
            onChange={(e) => onChange({ ...value, last: e.target.value })}
            className={inputClassName}
          />
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {problem}
        </p>
      )}
      <button type="button" onClick={() => onChange(closeMoreDays(value))} className={LINK}>
        {DATE_WORDS.ONE_DAY}
      </button>
    </div>
  );
}
