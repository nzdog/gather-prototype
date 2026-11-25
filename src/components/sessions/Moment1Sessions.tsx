'use client';

/**
 * [[GTC-479]] — Moment 1's sessions card (founder rulings 1 and 2, 24 Nov 2026), on the summary,
 * after the contact-details list. The host names and arranges her sessions here: add, rename, change
 * date, reorder within a date, remove, through GTC-478's routes. "Who comes to which session" sits
 * under it once there are two or more (./ComingTo).
 *
 * Behind GATHER_SESSIONS: with the switch off this draws nothing and asks the server nothing (the
 * outer component returns before any hook of the card runs).
 *
 * Decision 1 (the date rule): dates arrive as YYYY-MM-DD, already read by src/lib/sessions/dates.ts
 * on the server; the card compares and shows those, never a stored time.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSessionsOn } from '@/components/sessions/SessionsSwitch';
import { CARD_WORDS } from '@/lib/sessions/card-words';
import { datesFrom, sessionDateWords } from '@/lib/sessions/dates';
import { nameIsDate } from '@/lib/sessions/tabs';
import ComingTo, { type ComingHousehold } from '@/components/sessions/ComingTo';
import { useReasonPrompt } from '@/components/plan/ReasonPrompt';
import type { SerialisedEvent } from '@/lib/lifecycle';

export interface CardSession {
  id: string;
  name: string;
  date: string;
  displayOrder: number;
}

export interface SessionsState {
  sessions: CardSession[];
  eventDates: { start: string; end: string };
  households: ComingHousehold[];
  absences: { personEventId: string; dayId: string }[];
  /** [[GTC-481]] E: the event's phase, so a date moved after the send asks why first. */
  lifecycle?: SerialisedEvent;
}

/** The most dates "Add one session for each date" is offered for (decision 3). */
const FILL_MAX_DATES = 14;

/** The words a refused request carries, else the card's own. */
async function wordsOf(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === 'string' && body.error.length > 0) return body.error;
  } catch {
    // fall through
  }
  return CARD_WORDS.saveFailed;
}

const BUTTON = 'text-sm text-accent hover:text-accent-dark font-medium transition-colors';
const QUIET = 'text-sm text-gray-500 hover:text-gray-800 transition-colors';
const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent';

export default function Moment1Sessions({ eventId }: { eventId: string }) {
  const on = useSessionsOn();
  if (!on) return null;
  return <SessionsCard eventId={eventId} />;
}

/**
 * The card. `initial` is what it shows before its own read lands (the tests draw it that way, on the
 * server, where no effect runs); in the page it is absent and the card reads the route on mount.
 */
export function SessionsCard({ eventId, initial }: { eventId: string; initial?: SessionsState }) {
  const [state, setState] = useState<SessionsState | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ at: string; words: string } | null>(null);
  const [form, setForm] = useState<{ at: string; name: string; date: string } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const { ask: askWhy, element: whyBox } = useReasonPrompt();

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/events/${eventId}/sessions`);
      if (res.ok) setState(await res.json());
    } catch {
      // Nothing is drawn until it reads.
    }
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!state) return null;
  const { sessions, eventDates } = state;
  const dates = datesFrom(eventDates.start, eventDates.end);
  const manyDates = dates.length > 1;

  /** Run one request; on success read the card again, on refusal show its words at `at`. */
  const run = async (at: string, req: () => Promise<Response>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await req();
      if (!res.ok) {
        setError({ at, words: await wordsOf(res) });
        return false;
      }
      await load();
      return true;
    } catch {
      setError({ at, words: CARD_WORDS.saveFailed });
      return false;
    } finally {
      setBusy(false);
    }
  };

  const json = (method: string, body: unknown) => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const daysUrl = `/api/events/${eventId}/days`;

  const fillEachDate = async () => {
    setBusy(true);
    setError(null);
    try {
      for (const date of dates) {
        const res = await fetch(daysUrl, json('POST', { name: sessionDateWords(date), date }));
        if (!res.ok) {
          setError({ at: 'card', words: await wordsOf(res) });
          break;
        }
      }
    } catch {
      setError({ at: 'card', words: CARD_WORDS.saveFailed });
    } finally {
      await load();
      setBusy(false);
    }
  };

  const saveForm = async () => {
    if (!form) return;
    const at = form.at;
    // [[GTC-481]] E (decision 4): a session's date moved after the send asks why first, as the event's
    // own date does (T5). Nothing is sent. A new session, or a rename, never asks.
    const was = sessions.find((s) => s.id === at);
    const why =
      was && was.date !== form.date
        ? await askWhy(
            { action: 'EDIT_DAY', targetType: 'Day', targetId: at, field: 'date' },
            state.lifecycle
          )
        : { proceed: true, reason: null };
    if (!why.proceed) return;
    const ok =
      at === 'new'
        ? await run(at, () => fetch(daysUrl, json('POST', { name: form.name, date: form.date })))
        : await run(at, () =>
            fetch(
              `${daysUrl}/${at}`,
              json('PATCH', { name: form.name, date: form.date, reason: why.reason })
            )
          );
    if (ok) setForm(null);
  };

  const move = (index: number, by: -1 | 1) => {
    const ids = sessions.map((s) => s.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    run(sessions[index].id, () => fetch(daysUrl, json('PUT', { dayIds: ids })));
  };

  const remove = async (id: string) => {
    // Removed or refused, the question closes; a refusal's words stay under the session.
    await run(id, () => fetch(`${daysUrl}/${id}`, { method: 'DELETE' }));
    setAsking(null);
  };

  const outside = (date: string) => date < eventDates.start || date > eventDates.end;
  const lastDate = sessions.length > 0 ? sessions[sessions.length - 1].date : eventDates.start;

  const sessionForm = (at: string) =>
    form && form.at === at ? (
      <div className="space-y-3 pt-2">
        <div>
          <label htmlFor={`session-name-${at}`} className="block text-sm text-gray-600 mb-1">
            {CARD_WORDS.nameLabel}
          </label>
          <input
            id={`session-name-${at}`}
            type="text"
            value={form.name}
            maxLength={100}
            placeholder={CARD_WORDS.namePlaceholder}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className={INPUT}
          />
        </div>
        <div>
          <label htmlFor={`session-date-${at}`} className="block text-sm text-gray-600 mb-1">
            {CARD_WORDS.dateLabel}
          </label>
          <input
            id={`session-date-${at}`}
            type="date"
            value={form.date}
            onChange={(e) => setForm({ ...form, date: e.target.value })}
            className={INPUT}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveForm}
            disabled={busy}
            className="px-4 py-2 bg-accent text-white text-sm font-medium rounded-md hover:bg-accent-dark transition-colors disabled:opacity-50"
          >
            {CARD_WORDS.save}
          </button>
          <button type="button" onClick={() => setForm(null)} className={QUIET}>
            {CARD_WORDS.cancel}
          </button>
        </div>
      </div>
    ) : null;

  const errorAt = (at: string) =>
    error && error.at === at ? (
      <p role="alert" className="mt-2 text-sm text-red-700">
        {error.words}
      </p>
    ) : null;

  return (
    <div className="mt-8" data-sessions-card="">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        {CARD_WORDS.heading}
      </h2>
      <div className="mt-3 border border-gray-200 rounded-lg bg-white px-4 py-3">
        {sessions.length === 0 && (
          <p className="text-sm text-gray-600">
            {manyDates ? CARD_WORDS.emptyManyDates : CARD_WORDS.emptyOneDay}
          </p>
        )}

        {sessions.length > 0 && (
          <ul className="divide-y divide-gray-100">
            {sessions.map((s, i) => {
              const sameDateBefore = i > 0 && sessions[i - 1].date === s.date;
              const sameDateAfter = i < sessions.length - 1 && sessions[i + 1].date === s.date;
              return (
                <li key={s.id} className="py-3" data-session-id={s.id}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <div>
                      <span className="text-gray-900 font-medium">{s.name}</span>
                      {/* [[GTC-480]] H (GTC-479's note): the date once, when the name is only it. */}
                      {!nameIsDate(s.name, s.date) && (
                        <>
                          {' '}
                          <span className="text-sm text-gray-500">{sessionDateWords(s.date)}</span>
                        </>
                      )}
                      {outside(s.date) && (
                        <span className="ml-2 text-xs text-amber-700">
                          {CARD_WORDS.outsideDates}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      {sameDateBefore && (
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={busy}
                          aria-label={CARD_WORDS.moveUpAloud(s.name)}
                          className={QUIET}
                        >
                          {CARD_WORDS.moveUp}
                        </button>
                      )}
                      {sameDateAfter && (
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={busy}
                          aria-label={CARD_WORDS.moveDownAloud(s.name)}
                          className={QUIET}
                        >
                          {CARD_WORDS.moveDown}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setAsking(null);
                          setForm({ at: s.id, name: s.name, date: s.date });
                        }}
                        className={BUTTON}
                      >
                        {CARD_WORDS.edit}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setError(null);
                          setForm(null);
                          setAsking(s.id);
                        }}
                        className={QUIET}
                      >
                        {CARD_WORDS.remove}
                      </button>
                    </div>
                  </div>
                  {asking === s.id && (
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <span className="text-sm text-gray-900">{CARD_WORDS.removeAsk(s.name)}</span>
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        disabled={busy}
                        className="text-sm text-red-700 hover:text-red-900 font-medium"
                      >
                        {CARD_WORDS.removeYes}
                      </button>
                      <button type="button" onClick={() => setAsking(null)} className={QUIET}>
                        {CARD_WORDS.removeNo}
                      </button>
                    </div>
                  )}
                  {sessionForm(s.id)}
                  {errorAt(s.id)}
                </li>
              );
            })}
          </ul>
        )}

        {sessionForm('new')}
        {errorAt('new')}
        {errorAt('card')}

        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          {sessions.length === 0 && dates.length >= 2 && dates.length <= FILL_MAX_DATES && (
            <button type="button" onClick={fillEachDate} disabled={busy} className={BUTTON}>
              {CARD_WORDS.fillEachDate}
            </button>
          )}
          {!(form && form.at === 'new') && (
            <button
              type="button"
              onClick={() => {
                setError(null);
                setAsking(null);
                setForm({ at: 'new', name: '', date: lastDate });
              }}
              className={BUTTON}
            >
              {CARD_WORDS.add}
            </button>
          )}
        </div>
      </div>

      {sessions.length >= 2 && (
        <ComingTo
          eventId={eventId}
          sessions={sessions}
          households={state.households}
          absences={state.absences}
          onSaved={load}
        />
      )}
      {/* [[GTC-481]] E: the why box, over the page, only while a moved date asks. */}
      {whyBox}
    </div>
  );
}
