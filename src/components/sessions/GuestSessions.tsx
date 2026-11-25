'use client';

/**
 * [[GTC-481]] A — THE GUEST'S SESSIONS, ON THEIR OWN PAGE (the founder's rulings 1, 2 and 5 on the
 * plan, 25 Nov 2026). "You're down for Christmas lunch and Boxing Day dinner.", each session with its
 * date, "Can't make it" on each the guest is down for but the last, and "Not coming" with "I can make
 * it" on each they can't make. "Can't make it" on a session where they hold dishes not yet No asks
 * first: those dishes are then answered No, as a tap on each No would (ruling 2). Adding a session
 * back leaves its dishes No (ruling 1). Nothing is sent.
 *
 * Placed by the guest page (src/app/p/[token]/page.tsx) and nowhere else. The sessions switch reaches
 * it through src/app/p/[token]/layout.tsx. With the switch off (or drawn without the layout, as a
 * test draws the page) the outer part returns nothing before the card is drawn, so no request is
 * made. With fewer than two sessions, or once the guest has said "Can't make it" to the whole event,
 * the card draws nothing.
 *
 * Its one address is the guest's own, /api/p/<link>/sessions (GET, PUT): the person is the link's,
 * never one named in the request. The page's own answers and reads are not touched; after a write
 * the card asks the page to read again (`onChanged`), so the dishes show their new answers.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSessionsOn } from '@/components/sessions/SessionsSwitch';
import { GUEST_SESSION_WORDS as WORDS } from '@/lib/sessions/answers';

/** A session as the guest's address gives it. */
export interface GuestSession {
  id: string;
  name: string;
  /** "Christmas lunch, Fri 25 Dec" (GTC-485's words, by GTC-479's date rule). */
  label: string;
  /** False when this guest is marked as not at it. */
  coming: boolean;
  /** B: coming, for this session. */
  attendance: string;
}

/** The guest's own rows as the page holds them: enough to name the dishes on a session. */
interface Row {
  response: string;
  item: { name: string; day: { id: string } | null };
}

interface Props {
  token: string;
  /** The page's whole-event reading (GTC-174); the card draws nothing once it is NO. */
  attendance: string;
  assignments: readonly Row[];
  onChanged: () => void | Promise<void>;
}

export default function GuestSessions(props: Props) {
  const on = useSessionsOn();
  if (!on) return null;
  return <GuestSessionsCard {...props} />;
}

const BUTTON =
  'min-h-[44px] rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

/**
 * The card. `initial` is what it shows before its own read lands (the tests draw it that way, on the
 * server, where no effect runs); on the page it is absent and the card reads its address on mount.
 */
export function GuestSessionsCard({
  token,
  attendance,
  assignments,
  onChanged,
  initial,
}: Props & { initial?: GuestSession[] }) {
  const [sessions, setSessions] = useState<GuestSession[] | null>(initial ?? null);
  const [asking, setAsking] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const pressing = useRef(false);
  const url = `/api/p/${token}/sessions`;

  const load = useCallback(async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const body = (await res.json()) as { sessions?: GuestSession[] };
      if (Array.isArray(body.sessions)) setSessions(body.sessions);
    } catch {
      // Not read: the card draws nothing until it is.
    }
  }, [url]);

  // Read on mount, and again when the page's whole-event answer changes.
  useEffect(() => {
    void load();
  }, [load, attendance]);

  if (!sessions || sessions.length < 2 || attendance === 'NO') return null;
  const downFor = sessions.filter((s) => s.coming);
  if (downFor.length === 0) return null;

  /** The guest's own dishes on a session, not yet No. */
  const openOn = (dayId: string) =>
    assignments
      .filter((a) => a.item.day?.id === dayId && a.response !== 'DECLINED')
      .map((a) => a.item.name);

  const answer = async (s: GuestSession, coming: boolean) => {
    if (pressing.current) return;
    pressing.current = true;
    setBusy(true);
    setFailed(false);
    setAsking(null);
    setNote(null);
    const hadNo = assignments.some((a) => a.item.day?.id === s.id && a.response === 'DECLINED');
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayId: s.id, coming }),
      });
      if (!res.ok) throw new Error('not saved');
      const body = (await res.json()) as { sessions?: GuestSession[]; declined?: string[] };
      if (Array.isArray(body.sessions)) setSessions(body.sessions);
      const declined = body.declined ?? [];
      if (!coming && declined.length > 0) setNote(WORDS.marked(declined));
      if (coming && hadNo) setNote(WORDS.stayNo);
    } catch {
      setFailed(true);
    } finally {
      await onChanged();
      setBusy(false);
      pressing.current = false;
    }
  };

  const cantMake = (s: GuestSession) => {
    if (openOn(s.id).length > 0) setAsking(s.id);
    else void answer(s, false);
  };

  return (
    <div
      data-guest-sessions=""
      className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 mb-6"
    >
      <p className="font-semibold text-gray-900">{WORDS.downFor(downFor.map((s) => s.name))}</p>
      <ul className="mt-3 divide-y divide-gray-100">
        {sessions.map((s) => (
          <li key={s.id} data-guest-session={s.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span
                className={`min-w-0 break-words ${s.coming ? 'text-gray-900' : 'text-gray-500'}`}
              >
                {s.label}
              </span>
              {s.coming ? (
                downFor.length > 1 && (
                  <button
                    type="button"
                    aria-label={WORDS.cantMakeAloud(s.name)}
                    onClick={() => cantMake(s)}
                    disabled={busy}
                    className={BUTTON}
                  >
                    {WORDS.cantMake}
                  </button>
                )
              ) : (
                <span className="flex flex-wrap items-center gap-3">
                  <span className="text-sm text-gray-500">{WORDS.notComing}</span>
                  <button
                    type="button"
                    aria-label={WORDS.canMakeAloud(s.name)}
                    onClick={() => void answer(s, true)}
                    disabled={busy}
                    className={BUTTON}
                  >
                    {WORDS.canMake}
                  </button>
                </span>
              )}
            </div>
            {asking === s.id && (
              <div role="alertdialog" className="mt-2 rounded-md bg-amber-50 px-3 py-2">
                <p className="text-sm text-gray-900">{WORDS.confirm(s.name, openOn(s.id))}</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void answer(s, false)}
                    disabled={busy}
                    className="min-h-[44px] rounded-lg bg-gray-500 px-4 text-sm font-medium text-white hover:bg-gray-600 disabled:opacity-50"
                  >
                    {WORDS.confirmYes}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAsking(null)}
                    className="min-h-[44px] px-3 text-sm text-gray-600 hover:text-gray-900"
                  >
                    {WORDS.confirmNo}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {note && (
        <p role="status" className="mt-3 text-sm text-gray-600">
          {note}
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {WORDS.failed}
        </p>
      )}
    </div>
  );
}
