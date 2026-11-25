'use client';

/**
 * [[GTC-480]] — MOMENTS 2 AND 3 BY SESSION (the founder's rulings on the plan, 24 Nov 2026: A, B and
 * decision 2). Three pieces, and nothing else:
 *
 *   - SessionPlanProvider, placed by the setup layout inside the sessions switch. While the switch
 *     is on it asks the sessions route (GET /api/events/:id/sessions, GTC-479's, itself behind the
 *     switch) for the event's sessions each time Moment 2's plan view or Moment 3 opens, and holds
 *     the open tab, so Moment 3 opens on the tab Moment 2 last showed. While the switch is off it
 *     asks nothing, holds nothing and draws no element: every hook below then reads "off".
 *   - useSessionTabs and SessionTabRow: a tab for each session, then "Whole event", each with its
 *     count; the plan's sections with only the open tab's rows. Off, or no sessions: the plan as it
 *     came, the very same list, and no row drawn.
 *   - useSessionChoice and SessionPicker: the "Session" list on a row's edit and add boxes and in
 *     Moment 3's Details box. A new row starts on the open tab's session. Off: nothing drawn, and
 *     `on` false, so the boxes send nothing new.
 *
 * Anything drawn without the provider (a test, another page) reads off, as with the switch.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useParams } from 'next/navigation';
import { useSessionsOn } from '@/components/sessions/SessionsSwitch';
import {
  TAB_WORDS,
  WHOLE_EVENT,
  openingTab,
  rowsOnTab,
  sessionWithDate,
  tabLabel,
  tabOf,
  tabsFor,
  type SessionRow,
  type Tab,
  type TabSession,
} from '@/lib/sessions/tabs';
import {
  AWAY_WORDS,
  sessionHeadcounts,
  tabDateLine,
  type HeadcountHousehold,
  type SessionMark,
} from '@/lib/sessions/answers';

interface SessionPlan {
  sessions: TabSession[];
  /** The open tab's key, once a view has opened one; null until then. */
  open: string | null;
  setOpen: (key: string) => void;
  /** Asks the sessions route again (a view calls it when it opens). */
  load: () => void;
  /** [[GTC-481]] C and D: each household's named people, and who is not at which session. */
  households: HeadcountHousehold[];
  absences: SessionMark[];
}

const SessionPlanContext = createContext<SessionPlan | null>(null);
const NO_SESSIONS: TabSession[] = [];
const noop = () => {};
/** [[GTC-481]]: no households and no marks, until the sessions route answers. */
const NO_MARKS: { households: HeadcountHousehold[]; absences: SessionMark[] } = {
  households: [],
  absences: [],
};

export function SessionPlanProvider({
  children,
  eventId: givenEventId,
  initialSessions,
  initialOpen = null,
}: {
  children: ReactNode;
  /** The event, when not read from the address. The setup layout passes none. */
  eventId?: string;
  /** The sessions before the route answers, and the tab open at first (the tests draw it this way). */
  initialSessions?: TabSession[];
  initialOpen?: string | null;
}) {
  const on = useSessionsOn();
  const params = useParams<{ eventId?: string }>();
  const fromAddress = typeof params?.eventId === 'string' ? params.eventId : null;
  const eventId = givenEventId ?? fromAddress;
  const [sessions, setSessions] = useState<TabSession[]>(initialSessions ?? NO_SESSIONS);
  const [open, setOpen] = useState<string | null>(initialOpen);
  const [marks, setMarks] = useState(NO_MARKS);

  const load = useCallback(() => {
    if (!on || !eventId) return;
    void (async () => {
      try {
        const res = await fetch(`/api/events/${eventId}/sessions`);
        if (!res.ok) return;
        const body = (await res.json()) as {
          sessions?: TabSession[];
          households?: HeadcountHousehold[];
          absences?: SessionMark[];
        };
        if (!Array.isArray(body.sessions)) return;
        setSessions(body.sessions.map(({ id, name, date }) => ({ id, name, date })));
        // [[GTC-481]] C and D: the same reply's households and marks, for the warning and the counts.
        setMarks({
          households: Array.isArray(body.households) ? body.households : [],
          absences: Array.isArray(body.absences) ? body.absences : [],
        });
      } catch {
        // Not loaded: the screens stay as they are without sessions.
      }
    })();
  }, [on, eventId]);

  const plan = useMemo<SessionPlan | null>(
    () => (on ? { sessions, open, setOpen, load, ...marks } : null),
    [on, sessions, open, load, marks]
  );
  return <SessionPlanContext.Provider value={plan}>{children}</SessionPlanContext.Provider>;
}

/** What a view reads: whether the tabs show, the tabs, the open one, and its sections. */
export interface SessionTabsView<C> {
  /** The switch is on and the event has at least one session. */
  on: boolean;
  tabs: Tab[];
  open: string;
  setOpen: (key: string) => void;
  /** The sections with only the open tab's rows; off, the very list the view was given. */
  shown: C[];
  /** The tab a row is on. */
  keyOf: (row: SessionRow) => string;
  /** [[GTC-481]] D: how many are at each session, by its id; null until the households are read. */
  headcounts: Record<string, number> | null;
}

export function useSessionTabs<C extends { items: readonly SessionRow[] }>(
  categories: C[]
): SessionTabsView<C> {
  const plan = useContext(SessionPlanContext);
  const load = plan?.load;
  // The sessions are asked for each time the view opens (Moment 1's card may have changed them).
  useEffect(() => {
    load?.();
  }, [load]);
  const sessions = plan?.sessions ?? NO_SESSIONS;
  const on = plan !== null && sessions.length > 0;
  const tabs = useMemo(
    () =>
      on
        ? tabsFor(
            sessions,
            categories.flatMap((c) => c.items)
          )
        : [],
    [on, sessions, categories]
  );
  const stored = plan?.open ?? null;
  const open = !on
    ? WHOLE_EVENT
    : stored !== null && tabs.some((t) => t.key === stored)
      ? stored
      : openingTab(tabs);
  // The tab that opens first is kept, so it does not jump when a row moves off it.
  const setOpen = plan?.setOpen;
  useEffect(() => {
    if (on && setOpen && stored !== open) setOpen(open);
  }, [on, setOpen, stored, open]);
  const shown = useMemo(
    () => (on ? rowsOnTab(categories, open, sessions) : categories),
    [on, categories, open, sessions]
  );
  const keyOf = useCallback((row: SessionRow) => tabOf(row, sessions), [sessions]);
  // [[GTC-481]] D: each session's headcount, from the households and marks the route gave.
  const households = plan?.households;
  const absences = plan?.absences;
  const headcounts = useMemo(
    () =>
      on && households && absences && households.length > 0
        ? sessionHeadcounts(
            sessions.map((s) => s.id),
            households,
            absences
          )
        : null,
    [on, sessions, households, absences]
  );
  return { on, tabs, open, setOpen: setOpen ?? noop, shown, keyOf, headcounts };
}

const ROW_CLASS = '-mx-6 px-6 mb-6';

/** The tab row: it scrolls sideways inside itself, never the page. Draws nothing while off. */
export function SessionTabRow<C>({
  tabs,
  className = ROW_CLASS,
}: {
  tabs: SessionTabsView<C>;
  className?: string;
}) {
  if (!tabs.on) return null;
  return (
    <div
      role="group"
      aria-label={TAB_WORDS.rowLabel}
      data-session-tabs=""
      className={`${className} flex gap-2 overflow-x-auto pb-1`}
    >
      {tabs.tabs.map((t) => {
        const isOpen = t.key === tabs.open;
        // [[GTC-481]] D: the date, then the session's headcount ("Thu 25 Dec · 14 coming").
        const line = tabDateLine(t.date, tabs.headcounts?.[t.key]);
        return (
          <button
            key={t.key}
            type="button"
            data-session-tab={t.key}
            aria-pressed={isOpen}
            onClick={() => tabs.setOpen(t.key)}
            className={`shrink-0 min-h-[44px] rounded-lg border px-3 py-1.5 text-left text-sm transition-colors ${
              isOpen
                ? 'border-accent bg-accent text-white'
                : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50'
            }`}
          >
            <span className="block whitespace-nowrap font-medium">{tabLabel(t.name, t.count)}</span>
            {line && (
              <span
                className={`block whitespace-nowrap text-xs ${isOpen ? 'text-white/80' : 'text-gray-500'}`}
              >
                {line}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** A box's session: on, its value (a session's id, or null for the whole event), and the list. */
export interface SessionChoice {
  on: boolean;
  value: string | null;
  set: (value: string | null) => void;
  sessions: TabSession[];
}

/**
 * The session a box holds. `initial` is the row's own (an edit); left out, a new row starts on the
 * open tab's session, or the whole event when "Whole event" is open.
 */
export function useSessionChoice(initial?: string | null): SessionChoice {
  const plan = useContext(SessionPlanContext);
  const sessions = plan?.sessions ?? NO_SESSIONS;
  const on = plan !== null && sessions.length > 0;
  const fromTab =
    plan?.open && sessions.some((s) => s.id === plan.open) ? (plan.open as string) : null;
  const [value, set] = useState<string | null>(initial !== undefined ? initial : fromTab);
  return { on, value, set, sessions };
}

/** The "Session" list. Draws nothing while off. */
export function SessionPicker({ choice }: { choice: SessionChoice }) {
  const id = useId();
  if (!choice.on) return null;
  return (
    <div data-session-picker="">
      <label htmlFor={id} className="block text-xs font-medium text-gray-600 mb-1">
        {TAB_WORDS.pickerLabel}
      </label>
      <select
        id={id}
        value={choice.value ?? WHOLE_EVENT}
        onChange={(e) => choice.set(e.target.value === WHOLE_EVENT ? null : e.target.value)}
        className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {choice.sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {sessionWithDate(s)}
          </option>
        ))}
        <option value={WHOLE_EVENT}>{TAB_WORDS.whole}</option>
      </select>
    </div>
  );
}

/**
 * [[GTC-481]] C (the founder's ruling 3 on the plan, 25 Nov 2026): Moment 3's warning before a
 * session's dish goes to someone marked as not at that session. `isAway` reads the plan's marks (none
 * while the switch is off, so it is always false there); `ask` opens the box and answers true for
 * "Give anyway", false for "Pick someone else". `element` is drawn once by the view; it is nothing
 * until a warning is open.
 */
export function useAwayWarning() {
  const plan = useContext(SessionPlanContext);
  const id = useId();
  const [pending, setPending] = useState<{ words: string; answer: (go: boolean) => void } | null>(
    null
  );
  const absences = plan?.absences ?? NO_MARKS.absences;
  const sessions = plan?.sessions ?? NO_SESSIONS;
  const isAway = useCallback(
    (personEventId: string | undefined, dayId: string | null | undefined) =>
      !!personEventId &&
      !!dayId &&
      absences.some((a) => a.personEventId === personEventId && a.dayId === dayId),
    [absences]
  );
  const ask = useCallback(
    (person: string, dish: string, dayId: string) =>
      new Promise<boolean>((answer) =>
        setPending({
          words: AWAY_WORDS.warning(person, dish, sessions.find((s) => s.id === dayId)?.name ?? ''),
          answer,
        })
      ),
    [sessions]
  );
  const close = (go: boolean) => {
    pending?.answer(go);
    setPending(null);
  };
  const element = pending ? (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/30 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={id}
        data-away-warning=""
        className="w-full max-w-sm rounded-lg bg-white p-5 shadow-lg"
      >
        <p id={id} className="text-sm text-gray-900">
          {pending.words}
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => close(false)}
            className="min-h-[44px] px-3 text-sm text-gray-600 hover:text-gray-900"
          >
            {AWAY_WORDS.pickSomeoneElse}
          </button>
          <button
            type="button"
            onClick={() => close(true)}
            className="min-h-[44px] rounded-lg bg-accent px-4 text-sm font-medium text-white hover:bg-accent-dark"
          >
            {AWAY_WORDS.giveAnyway}
          </button>
        </div>
      </div>
    </div>
  ) : null;
  return { isAway, ask, element };
}
