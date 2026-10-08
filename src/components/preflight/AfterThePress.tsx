'use client';

/**
 * [[GTC-329]] — the pre-flight's address after the press. RULED 2026-09-29.
 *
 * GTC-311's SCOPED ruling 3 found that after the press the host had no path to the three decisions
 * the chase reads when it runs — the don't-chase mark, the per-person exception and the event
 * switch — and that the pre-flight, reached by typing its address, still spoke as though nothing
 * had gone out: "Before you send", five checks, and a Send the press refuses `ALREADY_SENT`.
 *
 * The ruling (design question): a SMALLER SURFACE AT THE SAME ADDRESS. It holds exactly those three
 * decisions and nothing else:
 *
 *   - no Send, and no path to the press — the pre-flight page stays the ONE surface that posts to
 *     it (`tests/press-route-test.ts`);
 *   - no pace, by ruling 1;
 *   - no channel picker, which after the press would move the chase onto someone never sent the
 *     ask; no preview, no dietary, no coverage.
 *
 * Its words are already ruled wherever they can be: the mark row is step 3's, moved unchanged into
 * `mark-rows.tsx`, and the chase words are [[GTC-311]]'s. The new words, WA to WE, live in
 * `src/lib/preflight/after-press-words.ts`.
 *
 * Unknown 1, ruled: a change here reaches only the reminders not yet sent. That needs no code —
 * `findNudgeCandidates` reads the stored values through `readAskPreview` when the chase runs, and a
 * leg already sent keeps its stamp. WD says so in words. Unknown 2, ruled: nothing records these
 * changes, in this ticket.
 *
 * TWO PARTS. `AfterThePressView` takes props and has no hooks, so it renders in a test with
 * `renderToStaticMarkup` (`tests/after-the-press-test.tsx`). `AfterThePress` loads and writes, through
 * the routes the pre-flight already uses — no new route, and no server change.
 */

import { useCallback, useEffect, useState } from 'react';
import type { NudgeMark, NudgePace } from '@/lib/nudge-cadence';
import type { ChaseWhenNoMobile } from '@/lib/eligibility/chase-when-no-mobile';
import type { RecipientChase } from '@/lib/preflight/ask-preview';
import {
  CHASED_BY_LABEL,
  CHASED_BY_VALUE,
  CHASE_DEFAULT_PILLS,
  CHASE_DEFAULT_SENTENCE,
  CHASE_OPTED_OUT_PLACEHOLDER,
  DEFAULT_SUFFIX,
  chasePersonPills,
} from '@/lib/preflight/ask-preview-compose';
import { AFTER_PRESS_HEADING, afterPressLead } from '@/lib/preflight/after-press-words';
import { MarkRows, Pill, type Member } from '@/components/preflight/mark-rows';
import { boardHref } from '@/lib/events/home-href';
import { STRIP_WORDS } from '@/lib/moments/strip';

// ─── Wire shapes (the parts of /pre-flight and /pre-flight/message this reads) ───

interface HouseholdView {
  id: string;
  label: string;
  resolvedContactPersonEventId: string | null;
  members: Member[];
}

interface ChaseView {
  stored: ChaseWhenNoMobile | null;
  resolved: ChaseWhenNoMobile;
  byRecipient: Record<string, RecipientChase>;
}

export interface AfterThePressViewProps {
  /** [[GTC-367]] (item 31, W5): for the way back to the board. Absent, no link is drawn. */
  eventId?: string;
  eventName: string;
  /** `Event.sentAt`, as the route sends it. */
  sentAt: string;
  /** Read for the mark row's cadence sentence only. Pace is not offered here (ruling 1). */
  pace: NudgePace | null;
  households: HouseholdView[];
  unhoused: Member[];
  /** Null while the message route loads, or if it failed; the mark rows do not wait on it. */
  chase: ChaseView | null;
  saving: boolean;
  error: string | null;
  onMark: (personEventId: string, mark: NudgeMark | null) => void;
  onException: (personEventId: string, exception: ChaseWhenNoMobile | null) => void;
  onDefault: (value: ChaseWhenNoMobile) => void;
}

// ─── The view ────────────────────────────────────────────────────────────────

/**
 * The per-person exception, for the members who have one to decide — control OFFERED, or ruling
 * AI's refusal with ruling AM's placeholder in its place. Everybody else has nothing to decide here
 * (a usable mobile, the mark, the host as carrier), exactly as on the pre-flight.
 */
function ExceptionRows({
  members,
  chase,
  saving,
  onException,
}: {
  members: Member[];
  chase: ChaseView;
  saving: boolean;
  onException: AfterThePressViewProps['onException'];
}) {
  const rows = members
    .map((m) => ({ m, rc: chase.byRecipient[m.personEventId] }))
    .filter(({ rc }) => rc && (rc.control === 'OFFERED' || rc.control === 'REFUSED_OPTED_OUT'));
  if (rows.length === 0) return null;
  return (
    <dl className="mt-3 space-y-2 text-sm">
      {rows.map(({ m, rc }) => (
        <div key={m.personEventId} className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <dt className="w-full sm:w-60 sm:shrink-0 text-gray-900 truncate" title={m.name}>
            {m.name}
          </dt>
          <dd className="text-gray-800">
            <span className="text-gray-400">{CHASED_BY_LABEL}</span> {CHASED_BY_VALUE[rc.chasedBy]}
            {rc.control === 'REFUSED_OPTED_OUT' && (
              <span className="block text-xs text-gray-500 mt-1">
                {CHASE_OPTED_OUT_PLACEHOLDER}
              </span>
            )}
            {rc.control === 'OFFERED' && (
              <span className="flex flex-wrap gap-2 mt-1">
                {chasePersonPills({ exception: rc.exception, eventDefault: chase.stored }).map(
                  (p) => (
                    <Pill
                      key={p.value}
                      active={p.active}
                      onClick={() => !saving && !p.active && onException(m.personEventId, p.writes)}
                    >
                      {p.label}
                    </Pill>
                  )
                )}
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AfterThePressView({
  eventId,
  eventName,
  sentAt,
  pace,
  households,
  unhoused,
  chase,
  saving,
  error,
  onMark,
  onException,
  onDefault,
}: AfterThePressViewProps) {
  return (
    <div className="min-h-screen bg-warm-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          {/* [[GTC-367]] (item 31, W5) — the board sent her here ("Change who I chase"); this goes back. */}
          {eventId && (
            <a
              href={boardHref(eventId)}
              className="mb-4 inline-block text-sm text-gray-500 hover:text-gray-900 underline underline-offset-2"
            >
              {STRIP_WORDS.BACK_TO_BOARD}
            </a>
          )}
          <p className="text-sm text-gray-400 mb-1">{eventName}</p>
          <h1 className="text-2xl font-medium text-gray-900">{AFTER_PRESS_HEADING}</h1>
          <p className="text-gray-600 mt-2">{afterPressLead(new Date(sentAt))}</p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {saving && <p className="text-sm text-gray-400 mt-3">Saving…</p>}
        </header>

        {/* The event switch — GTC-311's W1 to W3, as on step 4. */}
        {chase && (
          <section className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <p className="text-sm text-gray-800 mb-2">{CHASE_DEFAULT_SENTENCE[chase.resolved]}</p>
            <div className="flex flex-wrap gap-2">
              {(['BY_EMAIL', 'HAND_TO_HOST'] as const).map((v) => (
                <Pill
                  key={v}
                  active={chase.resolved === v}
                  onClick={() => !saving && chase.stored !== v && onDefault(v)}
                >
                  {CHASE_DEFAULT_PILLS[v] +
                    (chase.stored === null && chase.resolved === v ? DEFAULT_SUFFIX : '')}
                </Pill>
              ))}
            </div>
          </section>
        )}

        {/* One card per household: step 3's mark row, then the exception where there is one. */}
        <div className="space-y-4">
          {households.map((h) => (
            <section key={h.id} className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-medium text-gray-900 mb-3">{`${h.label}’s household`}</h2>
              <MarkRows
                members={h.members}
                channelPersonEventId={h.resolvedContactPersonEventId}
                pace={pace}
                onMark={onMark}
              />
              {chase && (
                <ExceptionRows
                  members={h.members}
                  chase={chase}
                  saving={saving}
                  onException={onException}
                />
              )}
            </section>
          ))}

          {unhoused.length > 0 && (
            <section className="bg-white border border-gray-200 rounded-lg p-5">
              <h2 className="text-sm font-medium text-gray-900 mb-2">Not in a household</h2>
              <p className="text-xs text-gray-400 mb-2">
                Added straight to the event. Gather talks to them directly.
              </p>
              <MarkRows
                members={unhoused}
                channelPersonEventId={null}
                pace={pace}
                onMark={onMark}
              />
              {chase && (
                <ExceptionRows
                  members={unhoused}
                  chase={chase}
                  saving={saving}
                  onException={onException}
                />
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── The container ───────────────────────────────────────────────────────────

interface PreFlightWire {
  event: { name: string; sentAt: string | null; nudgePace: NudgePace | null };
  households: HouseholdView[];
  unhoused: Member[];
}

/**
 * Loads the two reads the pre-flight already makes, and writes through its two PATCHes: the
 * cadence route for the mark (never its pace field), and the chase route for the exception and the
 * switch. The server's answer is authoritative, so every write re-reads both — flipping the switch
 * moves everyone who follows it.
 */
export default function AfterThePress({ eventId }: { eventId: string }) {
  const [data, setData] = useState<PreFlightWire | null>(null);
  const [chase, setChase] = useState<ChaseView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [pf, msg] = await Promise.all([
      fetch(`/api/events/${eventId}/pre-flight`),
      fetch(`/api/events/${eventId}/pre-flight/message`),
    ]);
    if (!pf.ok) {
      setError(`Could not load this page (${pf.status})`);
      return;
    }
    setData(await pf.json());
    if (msg.ok) setChase(((await msg.json()) as { chase: ChaseView }).chase);
    setError(null);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const patch = async (route: 'cadence' | 'chase', body: Record<string, unknown>) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/${route}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.message ?? err.error ?? 'That did not save.');
        return;
      }
      await load();
    } catch {
      setError('That did not save.');
    } finally {
      setSaving(false);
    }
  };

  if (error && !data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-600">{error}</div>;
  }
  if (!data || !data.event.sentAt) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-400">Loading…</div>;
  }

  return (
    <AfterThePressView
      eventId={eventId}
      eventName={data.event.name}
      sentAt={data.event.sentAt}
      pace={data.event.nudgePace}
      households={data.households}
      unhoused={data.unhoused}
      chase={chase}
      saving={saving}
      error={error}
      onMark={(personEventId, nudgeMark) => patch('cadence', { personEventId, nudgeMark })}
      onException={(personEventId, chaseException) =>
        patch('chase', { personEventId, chaseException })
      }
      onDefault={(v) => patch('chase', { chaseWhenNoMobileDefault: v })}
    />
  );
}
