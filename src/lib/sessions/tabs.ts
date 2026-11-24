/**
 * [[GTC-480]] — MOMENTS 2 AND 3 BY SESSION (the founder's rulings on the plan, 24 Nov 2026: A, B and
 * decisions 2 and 4). The words, word for word; the tabs, their order and counts; which tab opens;
 * a plan's rows for one tab; and whether a session's name is only its date.
 *
 * Pure: no React, no request, no clock. It imports only the date helper, so every date here is read
 * by GTC-479's date rule (`./dates`). Drawn by `src/components/sessions/SessionTabs.tsx`, which shows
 * nothing while the sessions switch is off.
 */

import { sessionDateWords } from './dates';

/** The key of the last tab: the rows with no session (Q9, "whole event"). Never a session's id. */
export const WHOLE_EVENT = 'whole';

/** Decision 4, word for word. */
export const TAB_WORDS = {
  /** The tab row's name, read aloud. */
  rowLabel: 'Sessions',
  /** The last tab, and the picker's last choice. */
  whole: 'Whole event',
  /** The picker's label. */
  pickerLabel: 'Session',
  /** Moment 3, a session's tab with no rows. */
  emptySession: 'Nothing in this session yet.',
  /** Moment 3, "Whole event" with no rows. */
  emptyWhole: 'Nothing for the whole event yet.',
} as const;

/** A session as the sessions route gives it: its date already YYYY-MM-DD by the date rule. */
export interface TabSession {
  id: string;
  name: string;
  date: string;
}

/** A row of a plan: its session, or none for the whole event. */
export interface SessionRow {
  dayId?: string | null;
}

/** One tab: its key (a session's id, or WHOLE_EVENT), its words and how many rows it holds. */
export interface Tab {
  key: string;
  name: string;
  /** The date's words under the name ("Thu 25 Dec"); null for "Whole event" and when the name is only the date. */
  date: string | null;
  count: number;
}

/** Is the session's name only its date's words, as GTC-479's one-tap fill names it ("Thu 24 Dec")? */
export function nameIsDate(name: string, dateKey: string): boolean {
  const words = sessionDateWords(dateKey);
  return words !== '' && name.trim() === words;
}

/** The picker's choice for a session: "Christmas lunch, Thu 25 Dec", or "Thu 24 Dec" once. */
export function sessionWithDate(session: { name: string; date: string }): string {
  return nameIsDate(session.name, session.date)
    ? session.name.trim()
    : `${session.name}, ${sessionDateWords(session.date)}`;
}

/** A tab's words: "Christmas lunch (6)". */
export function tabLabel(name: string, count: number): string {
  return `${name} (${count})`;
}

/** The tab a row is on: its session's, or "Whole event" (also for a session not in the list). */
export function tabOf(row: SessionRow, sessions: readonly TabSession[]): string {
  const id = row.dayId ?? null;
  return id !== null && sessions.some((s) => s.id === id) ? id : WHOLE_EVENT;
}

/** The tabs: each session in the order given (GTC-479's), then "Whole event"; each with its count. */
export function tabsFor(sessions: readonly TabSession[], rows: readonly SessionRow[]): Tab[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = tabOf(row, sessions);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [
    ...sessions.map((s) => ({
      key: s.id,
      name: s.name,
      date: nameIsDate(s.name, s.date) ? null : sessionDateWords(s.date),
      count: counts.get(s.id) ?? 0,
    })),
    { key: WHOLE_EVENT, name: TAB_WORDS.whole, date: null, count: counts.get(WHOLE_EVENT) ?? 0 },
  ];
}

/** Which tab opens first: the first that holds a row; when none does, the first session. */
export function openingTab(tabs: readonly Tab[]): string {
  return (tabs.find((t) => t.count > 0) ?? tabs[0])?.key ?? WHOLE_EVENT;
}

/** The plan's sections, each with only one tab's rows. Every section is kept, even with none. */
export function rowsOnTab<C extends { items: readonly SessionRow[] }>(
  categories: readonly C[],
  key: string,
  sessions: readonly TabSession[]
): C[] {
  return categories.map((c) => ({
    ...c,
    items: c.items.filter((row) => tabOf(row, sessions) === key),
  }));
}
