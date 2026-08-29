'use client';

/**
 * GTC-188 (I1) — the pre-flight. Kate's last look before the send.
 *
 * ROUGH FIRST PASS. This is a crude, visible assembly of five pieces that already exist
 * underneath, plus one placeholder for a piece that does not. It is deliberately one
 * scrolling page of numbered steps rather than a wizard: the shape is meant to be looked
 * at and argued with, not shipped.
 *
 * Hinge §1: the threshold is not a summary screen before a button — it is a guided check
 * Gather does with Kate, and as she moves through it, the weight lifts.
 *
 * NOTHING HERE SENDS. The press is GTC-189 (I2). Step 5 is a dead button on purpose.
 *
 * THE TWO CADENCE CONTROLS ARE THE POINT OF THIS PASS. GTC-179 stored both, obeys both on
 * the direct and proxy paths, and closed as machinery with neither reachable by a host.
 * Step 3 is the surface that makes them reachable — the per-EVENT pace and the per-PERSON
 * mark on one screen, per GTC-179's Ruling 8. ⚠ Moment 4 §10.3/§10.7 still place the mark
 * at Moment 1 beside the household picker; Ruling 8 supersedes both and the spec passages
 * are not edited. Do not re-derive the Moment 1 placement from them.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  NUDGE_PACE_OFFSET_DAYS,
  resolveNudgeOffsetDays,
  type NudgePace,
  type NudgeMark,
} from '@/lib/nudge-cadence';
import { DIETARY_OPTIONS, type DietaryData, type DietaryStatus } from '@/lib/dietary';
import AccordionShell from '@/components/plan/AccordionShell';
import { composeAsk, draftAuthorLine, firstNameOf } from '@/lib/messages/ask-register';

// ─── Wire shapes (mirror /api/events/[id]/pre-flight) ────────────────────────

interface Member {
  personEventId: string;
  personId: string;
  name: string;
  email: string | null;
  phone: string | null;
  householdRole: string | null;
  isYoungPerson: boolean;
  messageable: boolean;
  /**
   * GTC-256 (phase 3), Ruling 5. False for the host: she is on this screen because she is
   * in the guest list and counted (Rulings 1 and 3), and she is never messaged, so a
   * "hosting judgement about that person" has nothing to suppress. The cadence PATCH
   * refuses the write independently — this only decides what the screen offers.
   */
  markable: boolean;
  nudgeMark: NudgeMark | null;
}

interface HouseholdView {
  id: string;
  label: string;
  littleCount: number;
  contactPersonEventId: string | null;
  resolvedContactPersonEventId: string | null;
  members: Member[];
}

interface PreFlightData {
  event: {
    id: string;
    name: string;
    startDate: string | null;
    sentAt: string | null;
    nudgePace: NudgePace | null;
  };
  coverage: {
    unassignedItems: Array<{
      id: string;
      name: string;
      critical: boolean;
      teamName: string | null;
    }>;
    unassignedCount: number;
    criticalUnassignedCount: number;
    complianceRate: number;
    criticalGaps: Array<{ itemId: string; itemName: string }>;
    warnings: Array<{ type: string; message: string; details: string[] }>;
  };
  dietary: DietaryData;
  households: HouseholdView[];
  unhoused: Member[];
  channelCandidates: Array<{
    personEventId: string;
    name: string;
    householdId: string | null;
    householdLabel: string | null;
  }>;
}

// ─── The cadence, in words ───────────────────────────────────────────────────

/**
 * Render a resolved cadence. The days come from `resolveNudgeOffsetDays`, never from a
 * second table here — that module is import-free precisely so this screen shows the same
 * clock the sweep enforces, and a second definition is how the two start to disagree.
 */
function cadenceSentence(days: readonly number[]): string {
  if (days.length === 0) return 'No nudges at all.';
  if (days.length === 1) return `One nudge, ${days[0]} days after the send.`;
  return `${days.length} nudges, on days ${days.join(' and ')} after the send.`;
}

/**
 * Who Gather currently talks to for a household, for the collapsed row.
 *
 * Reads `resolvedContactPersonEventId` — the picked channel, or the primary contact when
 * nothing is picked — so the row states the fact rather than the setting. The lookup runs
 * over the whole event's candidates, not the household's members, because a channel is
 * cross-household by design (§10.7: Grandma's channel may live in her daughter's
 * household); `elsewhere` names that household when it is not this one.
 */
function channelFor(
  h: HouseholdView,
  candidates: PreFlightData['channelCandidates']
): { name: string; elsewhere: string | null } | null {
  if (!h.resolvedContactPersonEventId) return null;
  const c = candidates.find((x) => x.personEventId === h.resolvedContactPersonEventId);
  if (c) {
    return {
      name: c.name,
      elsewhere:
        c.householdId === h.id
          ? null
          : c.householdLabel
            ? `${c.householdLabel}’s household`
            : 'not in a household',
    };
  }
  // Not in the candidate list means the stored channel is not messageable — a corrupt
  // row, since the API refuses to write one. Name it rather than silently showing the
  // primary contact, which is what resolveHouseholdChannel deliberately does not do.
  const m = h.members.find((x) => x.personEventId === h.resolvedContactPersonEventId);
  return m ? { name: m.name, elsewhere: null } : null;
}

const PACE_LABELS: Record<NudgePace, string> = {
  STANDARD: 'Standard',
  RELAXED: 'Relaxed',
  OFF: 'Off',
};

const MARK_LABELS: Record<NudgeMark, string> = {
  GENTLE: 'Go gentle',
  DONT_CHASE: "Don't chase",
};

// ─── Small building blocks ───────────────────────────────────────────────────

function Step({
  n,
  title,
  blurb,
  checked,
  onCheck,
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 border border-gray-200 rounded-lg bg-white">
      <header className="px-5 pt-5 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-gray-400 mb-1">Step {n} of 5</p>
            <h2 className="text-lg font-medium text-gray-900">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{blurb}</p>
          </div>
          <label className="flex items-center gap-2 shrink-0 cursor-pointer text-sm text-gray-600">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onCheck(e.target.checked)}
              className="rounded border-gray-300 text-accent focus:ring-accent/40"
            />
            Checked
          </label>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
  tone = 'default',
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: 'default' | 'quiet';
}) {
  const base = 'px-3 py-1.5 text-sm rounded-full border transition-colors';
  const on =
    tone === 'quiet'
      ? 'bg-gray-700 text-white border-gray-700'
      : 'bg-accent text-white border-accent';
  const off = 'bg-white text-gray-600 border-gray-300 hover:border-gray-400';
  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? on : off}`}>
      {children}
    </button>
  );
}

// ─── The screen ──────────────────────────────────────────────────────────────

export default function PreFlightPage() {
  const params = useParams();
  const eventId = params.eventId as string;

  const [data, setData] = useState<PreFlightData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The acknowledgements are CLIENT STATE ONLY — nothing persists them. They exist so the
  // flow has an end; whether a pre-flight check should be recorded is GTC-189's question,
  // since only the press has anything to anchor it to.
  const [checked, setChecked] = useState<Record<number, boolean>>({});

  // Which household row is expanded. Null = all collapsed, which is the landing state:
  // step 3 is a list to scan first and open second.
  const [openHousehold, setOpenHousehold] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/events/${eventId}/pre-flight`);
    if (!res.ok) {
      setError(`Could not load the pre-flight (${res.status})`);
      return;
    }
    setData(await res.json());
    setError(null);
  }, [eventId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── writes ────────────────────────────────────────────────────────────────

  const patchCadence = async (body: Record<string, unknown>) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/pre-flight/cadence`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  const patchChannel = async (householdId: string, contactPersonEventId: string | null) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/pre-flight/channel`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ householdId, contactPersonEventId }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  // The dietary correction writes back to EventSetup.dietaryData — G1's underlying data,
  // through the existing setup route. No second copy (GTC-185 acceptance).
  const saveDietary = async (next: DietaryData) => {
    setSaving(true);
    const res = await fetch(`/api/events/${eventId}/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dietaryData: next }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
      return;
    }
    await load();
  };

  const allChecked = useMemo(() => [1, 2, 3, 4, 5].every((n) => checked[n]), [checked]);

  if (error && !data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-600">{error}</div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-400">Loading…</div>;
  }

  const { coverage, dietary, households, unhoused, channelCandidates } = data;
  const pace = data.event.nudgePace;

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <header className="mb-8">
          <p className="text-sm text-gray-400 mb-1">{data.event.name}</p>
          <h1 className="text-2xl font-medium text-gray-900">Before you send</h1>
          <p className="text-gray-600 mt-2">
            Five things to look at. Nothing goes out until you press at the end.
          </p>
          {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
          {saving && <p className="text-sm text-gray-400 mt-3">Saving…</p>}
        </header>

        {/* ── 1. Coverage ─────────────────────────────────────────────────── */}
        <Step
          n={1}
          title="What is still loose"
          blurb="Everything that has no owner yet. None of it blocks you."
          checked={!!checked[1]}
          onCheck={(v) => setChecked((c) => ({ ...c, 1: v }))}
        >
          <div className="flex gap-6 mb-4">
            <div>
              <p className="text-2xl font-medium text-gray-900">{coverage.unassignedCount}</p>
              <p className="text-sm text-gray-500">unassigned</p>
            </div>
            <div>
              <p
                className={`text-2xl font-medium ${
                  coverage.criticalUnassignedCount > 0 ? 'text-amber-700' : 'text-gray-900'
                }`}
              >
                {coverage.criticalUnassignedCount}
              </p>
              <p className="text-sm text-gray-500">critical and unassigned</p>
            </div>
            <div>
              <p className="text-2xl font-medium text-gray-900">{coverage.complianceRate}%</p>
              <p className="text-sm text-gray-500">confirmed so far</p>
            </div>
          </div>

          {coverage.unassignedCount === 0 ? (
            <p className="text-sm text-gray-600">Everything has an owner.</p>
          ) : (
            <>
              <ul className="text-sm text-gray-700 space-y-1 max-h-64 overflow-y-auto pr-2">
                {coverage.unassignedItems.map((i) => (
                  <li key={i.id} className="flex items-center gap-2">
                    {i.critical && (
                      <span className="text-[11px] uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                        critical
                      </span>
                    )}
                    {/*
                      THE LINK GOES TO THE TEAMS SECTION, NOT TO THE ITEM. There is no
                      per-item deep link on the plan page and no URL-addressable way to
                      open one team: `?expand=<section>` is the only param the page reads
                      for this (its `initialExpandedTeam` is internal state, set by the
                      Reassign-Items flow, never from the URL). Making one would mean
                      editing the god file, which the reconciliation campaign's Phase 3
                      owns. So every row here points at the same place, deliberately, and
                      the note underneath says so rather than letting the link imply more
                      than it does.
                    */}
                    <a
                      href={`/plan/${eventId}?expand=teams`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-gray-700 underline decoration-gray-300 underline-offset-2 hover:decoration-gray-600"
                    >
                      {i.name}
                    </a>
                    {i.teamName && <span className="text-gray-400">· {i.teamName}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-gray-400 mt-3">
                Each one opens the plan&rsquo;s Teams section in a new tab — the pre-flight stays
                where it is. There is no link straight to a single item yet, so you&rsquo;ll need to
                find it under its team.{' '}
                <button
                  type="button"
                  onClick={load}
                  className="underline decoration-gray-300 underline-offset-2 hover:text-gray-600"
                >
                  Refresh this list
                </button>{' '}
                when you come back.
              </p>
            </>
          )}

          {coverage.warnings.length > 0 && (
            <details className="mt-4 text-sm">
              <summary className="cursor-pointer text-gray-500">
                The sweep&rsquo;s own wording ({coverage.warnings.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {coverage.warnings.map((w) => (
                  <li key={w.type} className="text-gray-600">
                    {w.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Step>

        {/* ── 2. Dietary ──────────────────────────────────────────────────── */}
        <Step
          n={2}
          title="Dietary needs"
          blurb="Event-level, not by name. The last check before people eat."
          checked={!!checked[2]}
          onCheck={(v) => setChecked((c) => ({ ...c, 2: v }))}
        >
          <DietarySection value={dietary} onSave={saveDietary} />
        </Step>

        {/* ── 3. Who Gather talks to, and how often ───────────────────────── */}
        <Step
          n={3}
          title="Who Gather talks to"
          blurb="One channel per household, and how hard the system chases."
          checked={!!checked[3]}
          onCheck={(v) => setChecked((c) => ({ ...c, 3: v }))}
        >
          {/* The per-EVENT pace (Moment 4 §10.3). */}
          <div className="mb-6 pb-6 border-b border-gray-100">
            <p className="text-sm font-medium text-gray-700 mb-1">Nudge pace for this event</p>
            <p className="text-sm text-gray-500 mb-3">
              How often the system follows up with anyone who has not answered.
            </p>
            <div className="flex flex-wrap gap-2">
              <Pill active={pace === null} onClick={() => patchCadence({ nudgePace: null })}>
                Not set
              </Pill>
              {(Object.keys(PACE_LABELS) as NudgePace[]).map((p) => (
                <Pill key={p} active={pace === p} onClick={() => patchCadence({ nudgePace: p })}>
                  {PACE_LABELS[p]}
                </Pill>
              ))}
            </div>
            <p className="text-sm text-gray-500 mt-3">
              {pace === null
                ? cadenceSentence(resolveNudgeOffsetDays({}))
                : cadenceSentence(NUDGE_PACE_OFFSET_DAYS[pace])}
              {pace === null && ' (the default)'}
            </p>
          </div>

          {/* The household channel picker (§10.7) + the per-PERSON mark (§10.3). */}
          {households.length === 0 && unhoused.length === 0 && (
            <p className="text-sm text-gray-500">Nobody has been added to this event yet.</p>
          )}

          {/*
            One collapsed row per household, single-open, using the same AccordionShell
            Moment 2's sections use. The collapsed row carries the household name and the
            channel, because those are what Kate scans this list for: whose ear Gather has
            for each household. Everything she can CHANGE — the picker and the marks —
            lives behind the expand.
          */}
          <div className="space-y-2">
            {households.map((h) => {
              const channel = channelFor(h, channelCandidates);
              return (
                <AccordionShell
                  key={h.id}
                  id={h.id}
                  label={`${h.label}’s household`}
                  openAccordion={openHousehold}
                  onToggle={setOpenHousehold}
                  headerHint={
                    <span className="text-sm text-gray-500">
                      {channel ? (
                        <>
                          &rarr; {channel.name}
                          {channel.elsewhere && (
                            <span className="text-gray-400"> ({channel.elsewhere})</span>
                          )}
                        </>
                      ) : (
                        <span className="text-amber-700">no one to talk to</span>
                      )}
                    </span>
                  }
                >
                  {h.littleCount > 0 && (
                    <p className="text-xs text-gray-400 mb-3">
                      + {h.littleCount} kid{h.littleCount === 1 ? '' : 's'} without jobs
                    </p>
                  )}

                  <label className="block text-sm text-gray-600 mb-1">
                    Who should Gather talk to for this household?
                  </label>
                  <select
                    value={h.contactPersonEventId ?? ''}
                    onChange={(e) => patchChannel(h.id, e.target.value || null)}
                    className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    {/* value="" is "not picked", which resolves to the primary contact. */}
                    <option value="">{h.label} (main contact)</option>
                    {channelCandidates
                      .filter(
                        (c) =>
                          c.personEventId !==
                          h.members.find((m) => m.householdRole === 'PRIMARY_CONTACT')
                            ?.personEventId
                      )
                      .map((c) => (
                        <option key={c.personEventId} value={c.personEventId}>
                          {c.name}
                          {c.householdId === h.id
                            ? ''
                            : c.householdLabel
                              ? ` — ${c.householdLabel}’s household`
                              : ' — not in a household'}
                        </option>
                      ))}
                  </select>

                  <MarkRows
                    members={h.members}
                    channelPersonEventId={h.resolvedContactPersonEventId}
                    pace={pace}
                    onMark={(personEventId, nudgeMark) =>
                      patchCadence({ personEventId, nudgeMark })
                    }
                  />
                </AccordionShell>
              );
            })}
          </div>

          {unhoused.length > 0 && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Not in a household</h3>
              <p className="text-xs text-gray-400 mb-2">
                Added straight to the event. Gather talks to them directly.
              </p>
              <MarkRows
                members={unhoused}
                channelPersonEventId={null}
                pace={pace}
                onMark={(personEventId, nudgeMark) => patchCadence({ personEventId, nudgeMark })}
              />
            </div>
          )}
        </Step>

        {/* ── 4. The message, shown ───────────────────────────────────────── */}
        <Step
          n={4}
          title="The message, shown"
          blurb="Exactly what each person will receive."
          checked={!!checked[4]}
          onCheck={(v) => setChecked((c) => ({ ...c, 4: v }))}
        >
          <MessageStep eventId={eventId} />
        </Step>

        {/* ── 5. The end ──────────────────────────────────────────────────── */}
        <Step
          n={5}
          title="Ready"
          blurb="The last look is done."
          checked={!!checked[5]}
          onCheck={(v) => setChecked((c) => ({ ...c, 5: v }))}
        >
          <button
            type="button"
            disabled
            title="The press is GTC-189 (I2) and is not built. This button is wired to nothing."
            className="w-full py-3 rounded-lg bg-gray-200 text-gray-500 font-medium cursor-not-allowed"
          >
            Send {allChecked ? '' : '— finish the five checks first'}
          </button>
          <p className="text-xs text-gray-400 mt-3">
            Placeholder. The press is GTC-189 (I2): it commits the release, anchors the send
            timestamp and dispatches. Nothing on this screen dispatches anything.
          </p>
        </Step>
      </div>
    </div>
  );
}

// ─── The per-person mark ─────────────────────────────────────────────────────

/**
 * One row per person: the mark, and the cadence that mark actually resolves to against
 * the event's pace.
 *
 * The resolved sentence is the honest bit. Quieter-wins (Ruling 4) is not an override
 * ladder — a GENTLE person on an OFF event gets NOTHING, not one nudge — and showing the
 * mark alone would let Kate read it backwards. So every row runs the real resolver.
 */
function MarkRows({
  members,
  channelPersonEventId,
  pace,
  onMark,
}: {
  members: Member[];
  channelPersonEventId: string | null;
  pace: NudgePace | null;
  onMark: (personEventId: string, mark: NudgeMark | null) => void;
}) {
  return (
    <ul className="space-y-2">
      {members.map((m) => {
        const days = resolveNudgeOffsetDays({
          person: { nudgeMark: m.nudgeMark },
          event: { nudgePace: pace },
        });
        return (
          <li
            key={m.personEventId}
            className={`flex flex-wrap items-center gap-x-3 gap-y-2 py-2 border-b border-gray-50 last:border-0 ${
              m.messageable ? '' : 'opacity-60'
            }`}
          >
            {/*
              FIXED-WIDTH NAME COLUMN so every row's controls start at the same x. It was
              `min-w-[8rem]`, a floor rather than a column, so a long name pushed the pills
              right and the rows read as ragged — "Aarav Patel-Henderson" sat further out than
              "Amy Henderson". The channel badge lives INSIDE the column for the same reason:
              outside it, the one row that has a badge would be the one row out of line.
              The name truncates rather than growing; `min-w-0` is what lets `truncate` work
              inside a flex child, and `title` keeps the full name reachable.
            */}
            <span className="flex items-center gap-1.5 w-full sm:w-60 sm:shrink-0 min-w-0">
              <span className="text-sm text-gray-900 truncate" title={m.name}>
                {m.name}
              </span>
              {m.personEventId === channelPersonEventId && (
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-accent border border-accent/40 rounded px-1.5 py-0.5">
                  channel
                </span>
              )}
            </span>
            {!m.messageable && (
              <span className="text-xs text-gray-500">
                child — never messaged, whatever contact details are on the record
              </span>
            )}
            {/*
              GTC-256 (phase 3), RULING 5 — THE HOST IS SHOWN, NOT OFFERED A MARK.
              She stays in the list on purpose: removing her would contradict Rulings 1
              and 3 and hide the person the plan is sized around. What she does not get is
              the pill row, because the pre-flight offering her "go gentle on" about
              HERSELF is the absurdity the ticket lists among its consequences. Worded as
              a statement rather than greyed like a child row, because nothing is being
              withheld from her — she is the one doing the asking.
            */}
            {m.messageable && !m.markable && (
              <span className="text-xs text-gray-500">
                you — never messaged about your own event
              </span>
            )}
            {m.messageable && m.markable && (
              <>
                <span className="flex gap-1.5">
                  {/*
                    LABEL ONLY — the stored value for this state is still NULL, which
                    `resolveNudgeOffsetDays` reads as "no opinion, defer to the event pace"
                    (GTC-179 Ruling 4, quieter-wins). "Normal nudge" names what the host gets,
                    not what the column holds; do not turn it into a stored STANDARD.
                  */}
                  <Pill active={m.nudgeMark === null} onClick={() => onMark(m.personEventId, null)}>
                    Normal nudge
                  </Pill>
                  {(Object.keys(MARK_LABELS) as NudgeMark[]).map((k) => (
                    <Pill
                      key={k}
                      tone="quiet"
                      active={m.nudgeMark === k}
                      onClick={() => onMark(m.personEventId, k)}
                    >
                      {MARK_LABELS[k]}
                    </Pill>
                  ))}
                </span>
                <span className="text-xs text-gray-500 basis-full sm:basis-auto">
                  {cadenceSentence(days)}
                </span>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── The dietary re-verify (GTC-185, as rescoped) ────────────────────────────

/**
 * Event-level only. Per-person dietary capture was ruled out on 2026-08-23 and is not
 * deferred — there is no by-name dietary data anywhere in the schema to show.
 *
 * ⚠ Hinge §1 and Moment 4 §10.5 both still say "re-verified by name". Both are superseded
 * by that ruling and neither spec is edited; the by-name reading is not available here.
 */
function DietarySection({
  value,
  onSave,
}: {
  value: DietaryData;
  onSave: (next: DietaryData) => void;
}) {
  const [draft, setDraft] = useState<DietaryData>(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(value);
    setDirty(false);
  }, [value]);

  const set = (next: DietaryData) => {
    setDraft(next);
    setDirty(true);
  };

  const setStatus = (status: DietaryStatus) => {
    if (status === 'confirmed_needs') {
      set({ ...draft, status });
      return;
    }
    // The stored shape is coherence-checked server-side: a non-needs status may carry
    // neither requirements nor free text.
    set({ status, requirements: [], other: undefined });
  };

  const toggle = (opt: string) => {
    const has = draft.requirements.includes(opt);
    const requirements = has
      ? draft.requirements.filter((r) => r !== opt)
      : [...draft.requirements, opt];
    set({ ...draft, status: 'confirmed_needs', requirements });
  };

  const needs = draft.status === 'confirmed_needs';
  const coherent =
    draft.status !== 'confirmed_needs' ||
    draft.requirements.length > 0 ||
    (draft.other ?? '').trim() !== '';

  return (
    <div>
      <p className="text-sm text-gray-500 mb-3">
        {value.status === 'unanswered'
          ? 'Never answered. That is different from “nobody has any”.'
          : value.status === 'confirmed_none'
            ? 'You said there are none.'
            : 'You said there are these.'}
      </p>

      <div className="flex flex-wrap gap-2 mb-4">
        <Pill
          active={draft.status === 'confirmed_none'}
          onClick={() => setStatus('confirmed_none')}
        >
          No dietary needs
        </Pill>
        <Pill active={needs} onClick={() => setStatus('confirmed_needs')}>
          There are some
        </Pill>
        <Pill active={draft.status === 'unanswered'} onClick={() => setStatus('unanswered')}>
          Still don&rsquo;t know
        </Pill>
      </div>

      {needs && (
        <div className="mb-4 space-y-2">
          {DIETARY_OPTIONS.map((opt) => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.requirements.includes(opt)}
                onChange={() => toggle(opt)}
                className="rounded border-gray-300 text-accent focus:ring-accent/40"
              />
              <span className="text-sm text-gray-700">{opt}</span>
            </label>
          ))}
          <input
            type="text"
            placeholder="Other dietary needs"
            value={draft.other ?? ''}
            onChange={(e) =>
              set({ ...draft, status: 'confirmed_needs', other: e.target.value || undefined })
            }
            className="w-full mt-2 px-3 py-2 border border-gray-200 rounded text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
          />
        </div>
      )}

      <button
        type="button"
        disabled={!dirty || !coherent}
        onClick={() => onSave(draft)}
        className="px-4 py-2 text-sm rounded-md bg-accent text-white disabled:opacity-40"
      >
        {dirty ? 'Save this' : 'Saved'}
      </button>
      {!coherent && (
        <span className="ml-3 text-xs text-amber-700">
          Tick at least one, or say there are none.
        </span>
      )}
    </div>
  );
}

// ─── 4. The message, shown ───────────────────────────────────────────────────

interface AskRecipientRow {
  personEventId: string;
  personId: string;
  name: string;
  itemNames: string[];
  link: string;
  linkReady: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}

interface MessageData {
  event: {
    name: string;
    startDate: string;
    venueName: string | null;
    occasionDescription: string | null;
  };
  hostName: string;
  hostIdentityResolved: boolean;
  storedAuthorLine: string | null;
  recipients: AskRecipientRow[];
}

/**
 * GTC-187 (H2) — step 4 made real. Hinge §1: "she reads exactly what each person will
 * receive before it goes... What Kate reads at the pre-flight IS what the guest receives —
 * one shape, two sides."
 *
 * EVERY MESSAGE ON THIS SCREEN COMES OUT OF `composeAsk`, the same function GTC-189's
 * dispatch will call. The route hands over ingredients and nothing else; the composition
 * happens here, in the client, through the shared module. That is the arrangement GTC-188
 * made for the nudge clock and it exists so the screen and the send cannot drift apart.
 *
 * THE SEAM IS RENDERED, NOT HIDDEN. Each movement carries its voice as a label, because
 * Hinge §5's design is that "the guest can tell whose words are whose" — and the threshold's
 * check is "coverage and voice", so the voice has to be visible to be checked.
 */
function MessageStep({ eventId }: { eventId: string }) {
  const [data, setData] = useState<MessageData | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // The host's movement 1, edited here and STORED in Event.askAuthorLine (GTC-259/GTC-260).
  // Null means "no local edit", which falls through to the stored line and then to the draft.
  // ⚠ THE STORED VALUE HAS THREE STATES (founder ruling, 2026-08-29): null = never authored,
  // `''` = deliberately no line, a value = her words. Every `??` and `=== null` below is
  // written to keep `''` distinct from null; `||` anywhere here would collapse the two.
  const [edited, setEdited] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/events/${eventId}/pre-flight/message`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`(${res.status})`);
        return res.json();
      })
      .then((d: MessageData) => {
        if (!live) return;
        setData(d);
        setSelected(d.recipients[0]?.personEventId ?? null);
      })
      .catch((e) => live && setFailed(`Could not load the message ${e.message ?? ''}`));
    return () => {
      live = false;
    };
  }, [eventId]);

  const facts = useMemo(
    () =>
      data
        ? {
            name: data.event.name,
            startDate: new Date(data.event.startDate),
            venueName: data.event.venueName,
            occasionDescription: data.event.occasionDescription,
          }
        : null,
    [data]
  );

  const draft = useMemo(() => (facts ? draftAuthorLine(facts) : ''), [facts]);
  const authorLine = edited ?? data?.storedAuthorLine ?? draft;
  // An unsaved change against whatever the box would show without it — the stored line if
  // there is one, the draft otherwise. Typing back to the shown text is not a change.
  const dirty = edited !== null && edited !== (data?.storedAuthorLine ?? draft);

  // Every recipient's message, composed. The whole list is composed rather than only the
  // selected one so the segment summary is a fact about the send and not about whoever
  // happens to be on screen.
  const composed = useMemo(() => {
    if (!data || !facts) return [];
    return data.recipients.map((r) => ({
      recipient: r,
      ask: composeAsk({
        event: facts,
        hostName: data.hostName,
        recipient: {
          firstName: firstNameOf(r.name),
          itemNames: r.itemNames,
          link: r.link,
        },
        storedAuthorLine: authorLine,
      }),
    }));
  }, [data, facts, authorLine]);

  /**
   * Stores movement 1. GTC-187 decision 2 makes the line reusable across sends — the point
   * is the late addition two weeks on getting the SAME words everyone else got.
   *
   * The server normalises empty to NULL, so this deliberately does NOT pre-empt it: what
   * comes back is authoritative, and a cleared box returns null and re-renders as the draft.
   * One rule, one site.
   */
  const saveAuthorLine = async (value: string | null) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/message`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ askAuthorLine: value }),
      });
      if (!res.ok) {
        setSaveError((await res.json().catch(() => ({}))).error ?? 'That did not save.');
        return;
      }
      const { storedAuthorLine } = (await res.json()) as { storedAuthorLine: string | null };
      setData((d) => (d ? { ...d, storedAuthorLine } : d));
      setEdited(null);
    } catch {
      setSaveError('That did not save.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * THE TWO CLEARING ACTIONS ARE DIFFERENT WRITES, and the founder ruling (2026-08-29) is
   * that Kate must be able to tell them apart. Both empty the box; they mean opposite things.
   *
   *   revertToDraft   → NULL → "put the draft back", Gather speaks for her
   *   sendWithoutLine → ''   → "send without a line from me", nobody speaks for her
   *
   * One button each, labelled as the sentence rather than as the state, because "clear" would
   * be ambiguous between them in exactly the way the ruling forbids.
   */
  const revertToDraft = async () => {
    // Nothing stored and only a local edit: drop the edit, no write needed. `== null` is
    // deliberate — it must catch null and undefined but NOT `''`, which IS a stored state.
    if (data?.storedAuthorLine == null) {
      setEdited(null);
      setSaveError(null);
      return;
    }
    await saveAuthorLine(null);
  };

  const sendWithoutLine = async () => {
    await saveAuthorLine('');
  };

  if (failed) return <p className="text-sm text-red-600">{failed}</p>;
  if (!data) return <p className="text-sm text-gray-400">Loading…</p>;
  if (data.recipients.length === 0) {
    return <p className="text-sm text-gray-600">Nobody to message on this event yet.</p>;
  }

  const current = composed.find((c) => c.recipient.personEventId === selected) ?? composed[0];
  const maxSegments = composed.reduce((m, c) => Math.max(m, c.ask.segments), 0);
  const linksPending = composed.some((c) => !c.recipient.linkReady);

  return (
    <div>
      {/* Movement 1 — hers. */}
      <label className="block text-sm font-medium text-gray-900 mb-1">Your line</label>
      <p className="text-xs text-gray-500 mb-2">
        A starting point built from the event — change it to whatever you would actually say. It
        goes first, in your words, to everyone.
      </p>
      <textarea
        value={authorLine}
        onChange={(e) => setEdited(e.target.value)}
        rows={3}
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 focus:ring-accent/40 focus:border-accent"
      />
      <div className="flex flex-wrap items-center gap-3 mt-2 mb-5">
        <button
          type="button"
          onClick={() => saveAuthorLine(authorLine)}
          disabled={!dirty || saving}
          className="text-xs px-3 py-1 rounded-md bg-accent text-white disabled:bg-gray-200 disabled:text-gray-400"
        >
          {saving ? 'Saving…' : 'Save my line'}
        </button>
        <button
          type="button"
          onClick={revertToDraft}
          disabled={saving || (edited === null && data.storedAuthorLine === null)}
          className="text-xs text-gray-500 underline disabled:no-underline disabled:text-gray-300"
        >
          Put the draft back
        </button>
        <button
          type="button"
          onClick={sendWithoutLine}
          disabled={saving || (edited === null && data.storedAuthorLine === '')}
          className="text-xs text-gray-500 underline disabled:no-underline disabled:text-gray-300"
        >
          Send without a line from me
        </button>
        {/*
          THE THREE STATES, SAID PLAINLY. Kate cannot see which one she is in from the box
          alone — an empty box is "no line from me" and a box full of the draft is "Gather
          speaks for me", and those look nothing alike but read the same if nothing says so.
        */}
        {saveError ? (
          <p className="text-xs text-red-600">{saveError}</p>
        ) : dirty ? (
          <p className="text-xs text-amber-700">Not saved yet.</p>
        ) : data.storedAuthorLine === '' ? (
          <p className="text-xs text-gray-500">
            No line from you. Guests get the greeting and then the handover — the preview below is
            exactly what they will read.
          </p>
        ) : data.storedAuthorLine !== null ? (
          <p className="text-xs text-gray-500">
            Saved. Everyone gets this line, including anyone you add later.
          </p>
        ) : (
          <p className="text-xs text-gray-500">
            This is the draft, in your voice. Save it to make it yours, or send without a line from
            you.
          </p>
        )}
      </div>

      {/* GTC-256. Stated, not hidden. */}
      {!data.hostIdentityResolved && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          <strong>The name on this message is provisional.</strong> This event has no host
          membership row, so &ldquo;{data.hostName}&rdquo; is taken from the account that owns the
          event rather than from the person you captured as yourself. If you are in the guest list
          below, that is the same problem: you would be sent your own invitation. Filed as GTC-256;
          it is a capture decision, not a send one.
        </p>
      )}

      {linksPending && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">
          Some guests have no link yet — links are issued at the press. Those messages show a
          stand-in where the link will go.
        </p>
      )}

      {/* Who to read. */}
      <div className="flex items-baseline justify-between gap-4 mb-2">
        <label className="block text-sm font-medium text-gray-900">Read it as</label>
        <p className="text-xs text-gray-500">
          {composed.length} {composed.length === 1 ? 'person' : 'people'} · longest is {maxSegments}{' '}
          {maxSegments === 1 ? 'text' : 'texts'}
        </p>
      </div>
      <select
        value={current.recipient.personEventId}
        onChange={(e) => setSelected(e.target.value)}
        className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 mb-4"
      >
        {composed.map((c) => (
          <option key={c.recipient.personEventId} value={c.recipient.personEventId}>
            {c.recipient.name} —{' '}
            {c.recipient.itemNames.length === 0
              ? 'nothing to bring'
              : c.recipient.itemNames.join(', ')}
          </option>
        ))}
      </select>

      {/* The message itself, seam visible. */}
      <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
        {current.recipient.hasEmail && (
          <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
            <p className="text-[11px] uppercase tracking-wide text-gray-400">
              Subject (email only)
            </p>
            <p className="text-sm text-gray-800">{current.ask.subject}</p>
          </div>
        )}
        {current.ask.movements.map((m) => (
          <div key={m.slot} className="px-4 py-3 border-b border-gray-100 last:border-0">
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
              {m.voice === 'HOST' ? 'Your voice' : 'Gather'}
            </p>
            <p className="text-sm text-gray-900 whitespace-pre-wrap">{m.text}</p>
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-500 mt-2">
        {current.ask.text.length} characters · {current.ask.segments}{' '}
        {current.ask.segments === 1 ? 'text' : 'texts'} if sent by SMS
        {current.ask.segments > 1 && ' — long is fine, it just costs more to send'}.
        {current.ask.narrowSegments &&
          ' Counted at 70 characters a text rather than 160, because the wording uses punctuation plain SMS cannot carry.'}{' '}
        The same words go by email, with the subject line above.
      </p>
    </div>
  );
}
