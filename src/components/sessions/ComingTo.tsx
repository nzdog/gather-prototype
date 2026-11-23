'use client';

/**
 * [[GTC-479]] — "Who comes to which session" (founder ruling 1, decisions 4 and 5, 24 Nov 2026), under
 * Moment 1's sessions card once there are two or more sessions. On each household, "Coming to", and
 * a way to change it: one tick box per named person per session, saved at once through
 * PUT /api/events/:id/sessions. No mark means "every session".
 *
 * Decision 4: named people choose (adults, guests, kids with jobs); kids without jobs come with their
 * household. Decision 5: marking someone as not at a session where they are down for a dish is
 * answered with a warning first; only "Mark as not coming" writes it, and nothing about the dish
 * changes.
 *
 * Drawn only by ./Moment1Sessions, which draws nothing while the sessions switch is off.
 */

import { useState } from 'react';
import { CARD_WORDS, COMING_WORDS } from '@/lib/sessions/card-words';
import type { CardSession } from '@/components/sessions/Moment1Sessions';

export interface ComingHousehold {
  id: string;
  title: string;
  littleCount: number;
  people: { personEventId: string; name: string; kind: 'adult' | 'kid' | 'guest' }[];
}

interface Props {
  eventId: string;
  sessions: CardSession[];
  households: ComingHousehold[];
  absences: { personEventId: string; dayId: string }[];
  onSaved: () => Promise<void>;
  /** The household shown opened at first (the tests draw it that way); none in the page. */
  initialOpen?: string;
}

/** "Coming to: …" for one household, from who is not at which session. */
export function comingLine(
  household: ComingHousehold,
  sessions: readonly { id: string; name: string }[],
  notAt: ReadonlySet<string>
): string {
  const sets = household.people.map((p) =>
    sessions.filter((s) => !notAt.has(`${p.personEventId}|${s.id}`)).map((s) => s.id)
  );
  if (sets.length === 0 || sets.every((ids) => ids.length === sessions.length)) {
    return COMING_WORDS.every;
  }
  const first = JSON.stringify(sets[0]);
  if (!sets.every((ids) => JSON.stringify(ids) === first)) return COMING_WORDS.differs;
  if (sets[0].length === 0) return COMING_WORDS.none;
  return COMING_WORDS.some(sessions.filter((s) => sets[0].includes(s.id)).map((s) => s.name));
}

export default function ComingTo({
  eventId,
  sessions,
  households,
  absences,
  onSaved,
  initialOpen,
}: Props) {
  const [open, setOpen] = useState<string | null>(initialOpen ?? null);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<{
    personEventId: string;
    dayId: string;
    words: string;
  } | null>(null);
  const [error, setError] = useState<{ householdId: string; words: string } | null>(null);

  const notAt = new Set(absences.map((a) => `${a.personEventId}|${a.dayId}`));

  const save = async (
    householdId: string,
    personEventId: string,
    dayId: string,
    coming: boolean,
    despiteDishes = false
  ) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/sessions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personEventId, dayId, coming, despiteDishes }),
      });
      const body = await res.json().catch(() => null);
      if (res.status === 409 && body?.code === 'HOLDS_DISHES' && typeof body.error === 'string') {
        setWarning({ personEventId, dayId, words: body.error });
        return;
      }
      if (!res.ok) {
        setError({
          householdId,
          words: typeof body?.error === 'string' ? body.error : CARD_WORDS.saveFailed,
        });
        return;
      }
      setWarning(null);
      await onSaved();
    } catch {
      setError({ householdId, words: CARD_WORDS.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-8" data-coming-to="">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
        {COMING_WORDS.heading}
      </h2>
      <p className="mt-1 text-sm text-gray-600">{COMING_WORDS.line}</p>
      <div className="mt-3 space-y-2">
        {households.map((h) => {
          const isOpen = open === h.id;
          return (
            <div
              key={h.id}
              className="border border-gray-200 rounded-lg bg-white"
              data-household-id={h.id}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-4 py-3">
                <div>
                  <span className="text-gray-900 font-medium">{h.title}</span>
                  <p className="text-sm text-gray-500">{comingLine(h, sessions, notAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setWarning(null);
                    setError(null);
                    setOpen(isOpen ? null : h.id);
                  }}
                  className="text-sm text-accent hover:text-accent-dark font-medium transition-colors"
                >
                  {isOpen ? COMING_WORDS.done : COMING_WORDS.change}
                </button>
              </div>

              {isOpen && (
                <div className="px-4 pb-4 pt-3 border-t border-gray-100 space-y-4">
                  {h.people.map((p) => (
                    <fieldset key={p.personEventId}>
                      <legend className="text-sm font-medium text-gray-900">{p.name}</legend>
                      <div className="mt-1 flex flex-wrap gap-x-5 gap-y-2">
                        {sessions.map((s) => {
                          const coming = !notAt.has(`${p.personEventId}|${s.id}`);
                          return (
                            <label
                              key={s.id}
                              className="inline-flex items-center gap-2 text-sm text-gray-700"
                            >
                              <input
                                type="checkbox"
                                checked={coming}
                                disabled={busy}
                                onChange={(e) =>
                                  save(h.id, p.personEventId, s.id, e.target.checked)
                                }
                                className="h-4 w-4"
                              />
                              {s.name}
                            </label>
                          );
                        })}
                      </div>
                      {warning && warning.personEventId === p.personEventId && (
                        <div role="alert" className="mt-2 rounded-md bg-amber-50 px-3 py-2">
                          <p className="text-sm text-gray-900">{warning.words}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                save(h.id, warning.personEventId, warning.dayId, false, true)
                              }
                              className="text-sm text-red-700 hover:text-red-900 font-medium"
                            >
                              {COMING_WORDS.markAnyway}
                            </button>
                            <button
                              type="button"
                              onClick={() => setWarning(null)}
                              className="text-sm text-gray-500 hover:text-gray-800"
                            >
                              {COMING_WORDS.keepComing}
                            </button>
                          </div>
                        </div>
                      )}
                    </fieldset>
                  ))}
                  {h.littleCount > 0 && (
                    <p className="text-sm text-gray-500">{COMING_WORDS.littles}</p>
                  )}
                  {error && error.householdId === h.id && (
                    <p role="alert" className="text-sm text-red-700">
                      {error.words}
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
