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
 * ✅ STEP 5 SENDS NOW — GTC-189 SLICE 5f, 2026-09-19, AND THIS LINE USED TO SAY THE OPPOSITE. It read
 * *"NOTHING HERE SENDS. The press is GTC-189 (I2). Step 5 is a dead button on purpose."* The press
 * exists, the dispatcher exists, the board's fourth red exists, and this screen is the ONE surface
 * that may reach them — two others posted to the press until slice 5c took them down (option D).
 *
 * ⚠ READ THE COMMENT AT STEP 5 BEFORE PRESSING IT IN THIS ENVIRONMENT. What it does here is not what
 * it does on a working deployment, and the difference is permanent.
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
} from '@/lib/nudge-cadence';
import { DIETARY_OPTIONS, type DietaryData, type DietaryStatus } from '@/lib/dietary';
import AccordionShell from '@/components/plan/AccordionShell';
import { draftAuthorLine } from '@/lib/messages/ask-register';
import { PRESS_REFUSAL_WORDS, THRESHOLD_SCRIPT } from '@/lib/press/press-words';
import {
  CHASED_BY_LABEL,
  CHASED_BY_VALUE,
  CHASE_DEFAULT_PILLS,
  CHASE_DEFAULT_SENTENCE,
  CHASE_OPTED_OUT_PLACEHOLDER,
  DEFAULT_SUFFIX,
  HOST_LIST_BLURB,
  HOST_LIST_EMPTY,
  HOST_LIST_HEADING,
  HOST_LIST_NOT_ASKED_HEADING,
  HOST_LIST_NOT_CHASED_BLURB,
  HOST_LIST_NOT_CHASED_HEADING,
  NOT_MESSAGED_WHY,
  NO_REPLY_TO_LINE,
  TOLD_ABOUT_LABEL,
  chasePersonPills,
  composePreview,
  hostListReason,
  notChasedReason,
  messageCountLine,
  messageRows,
  notMessagedRows,
  replyToLine,
  toldAboutValue,
} from '@/lib/preflight/ask-preview-compose';
import type { AskPreview, NotMessagedLinkState } from '@/lib/preflight/ask-preview';
import { OPT_OUT_LINE } from '@/lib/sms/opt-out-line';
// [[GTC-329]] — moved unchanged, so the post-press surface shows the same row as step 3.
import { MarkRows, Pill, cadenceSentence, type Member } from '@/components/preflight/mark-rows';
import AfterThePress from '@/components/preflight/AfterThePress';
import { BOARD_MOVE_AFTER_MS, SEE_THE_BOARD_LINK } from '@/lib/preflight/after-press-words';
import { boardHref } from '@/lib/events/home-href';
import { HOUSEHOLD_CONTACT_LINE } from '@/lib/households/contact-line';

// ─── Wire shapes (mirror /api/events/[id]/pre-flight) ────────────────────────

interface HouseholdView {
  id: string;
  label: string;
  littleCount: number;
  contactPersonEventId: string | null;
  resolvedContactPersonEventId: string | null;
  members: Member[];
  /** GTC-363 (item 6): optional, so a view built without it shows the line. */
  isHostHousehold?: boolean;
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

// ─── Small building blocks ───────────────────────────────────────────────────

function Step({
  n,
  title,
  blurb,
  checked,
  onCheck,
  checkLabel = 'Checked',
  children,
}: {
  n: number;
  title: string;
  blurb: string;
  checked: boolean;
  onCheck: (v: boolean) => void;
  /**
   * [[GTC-311]] SCOPED ruling 7: no check may claim she LOOKED AT what she CHOSE. Step 4 now carries
   * decisions, so its box reads "Settled" — true of what she read and of what she decided (W9,
   * ruled 2026-09-27). The other four steps are still things she looks at, and keep "Checked".
   */
  checkLabel?: string;
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
            {checkLabel}
          </label>
        </div>
      </header>
      <div className="px-5 py-5">{children}</div>
    </section>
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

  /*
   * ── GTC-189 SLICE 5f — THE PRESS, CALLED ONCE ───────────────────────────────
   *
   * ⚠ THREE GUARDS AGAINST A SECOND PRESS, AND THEY ARE NOT REDUNDANT BECAUSE THEY FAIL DIFFERENTLY.
   * The press is ruled ONE ACT, NO RECALL, so a double-click must not be able to produce a second
   * anything:
   *
   *   1. `pressing` — the in-flight latch, checked at the TOP of this function rather than only in
   *      the button's `disabled`, because a disabled attribute is a rendering and a second click can
   *      land before React re-renders.
   *   2. `pressed` — the done latch, so the button stays spent for the life of the page.
   *   3. The route's own `ALREADY_SENT`, which is the only one that holds across a page reload and is
   *      therefore the real guarantee. The two above make the common case quiet; this one makes it
   *      correct.
   *
   * It reads the `code` and shows the press's own words for that state — never the route's prose,
   * which is written for a log, and never a generic failure sentence for a state the press named.
   */
  const [pressing, setPressing] = useState(false);
  const [pressed, setPressed] = useState<{ recipients: number } | null>(null);
  const [pressError, setPressError] = useState<string | null>(null);

  const press = useCallback(async () => {
    if (pressing || pressed !== null) return;
    setPressing(true);
    setPressError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/send`, { method: 'POST' });
      const body = await res.json().catch(() => ({}) as Record<string, unknown>);
      if (res.ok && body?.success) {
        setPressed({ recipients: Number(body.recipients ?? 0) });
        return;
      }
      const code = typeof body?.code === 'string' ? body.code : null;
      setPressError(
        (code && PRESS_REFUSAL_WORDS[code as keyof typeof PRESS_REFUSAL_WORDS]) ||
          'Nothing was sent. Try again in a moment.'
      );
    } catch {
      /*
       * ⚠ A NETWORK FAILURE IS NOT A REFUSAL, AND THE WORDS SAY SO CAREFULLY. The request may have
       * reached the press and committed before the connection dropped, so this cannot claim nothing
       * was sent — every refusal sentence above can, because the route answered. Reloading is the
       * honest instruction: `ALREADY_SENT` is what will tell her which way it went.
       */
      setPressError('Gather could not tell whether that went through. Reload the page to check.');
    } finally {
      setPressing(false);
    }
  }, [eventId, pressing, pressed]);

  /*
   * [[GTC-357]] — AFTER THE PRESS, THE BOARD. Founder, PLAN RULINGS 2026-10-03, Q2: *"Lines, link,
   * then board (Recommended)"* — the threshold lines show with "See the board →" under them, and
   * after about 8 seconds, roughly the time it takes to read them, the page moves to the board by
   * itself. Outside `press`, so the press handler and its dependency list are untouched; before the
   * after-the-press return below, so the hook order never changes.
   */
  useEffect(() => {
    if (!pressed) return;
    const timer = setTimeout(() => window.location.assign(boardHref(eventId)), BOARD_MOVE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pressed, eventId]);

  if (error && !data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-600">{error}</div>;
  }
  if (!data) {
    return <div className="max-w-3xl mx-auto px-6 py-16 text-gray-400">Loading…</div>;
  }

  /*
   * [[GTC-329]], ruled 2026-09-29 — AFTER THE PRESS THIS ADDRESS IS A SMALLER SURFACE, NOT THIS ONE.
   *
   * Everything below speaks before the press — "Before you send", five checks, a preview of what
   * each person "will receive", and a Send the press refuses `ALREADY_SENT`. After it, the host
   * comes here for the three decisions the chase reads when it runs: the don't-chase mark, the
   * per-person exception and the event switch. Pace is left out, by the same ruling; so is the
   * channel picker, which after the press would move the chase onto someone never sent the ask.
   *
   * The same address rather than a new one, so GTC-192 Ruling 17's "revisited where it is set (the
   * pre-flight)" stays literally true. After every hook above, so the hook order never changes.
   */
  if (data.event.sentAt) {
    return <AfterThePress eventId={eventId} />;
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
            Five things to go through. Nothing goes out until you press at the end.
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
                  {/* GTC-363 (item 6, W1) — not for the host's own household, where it is untrue. */}
                  {!h.isHostHousehold && (
                    <p className="text-xs text-gray-400 -mt-2 mb-3">{HOUSEHOLD_CONTACT_LINE}</p>
                  )}

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
          blurb="Exactly what each person will receive, and who I'll chase."
          checked={!!checked[4]}
          onCheck={(v) => setChecked((c) => ({ ...c, 4: v }))}
          checkLabel="Settled"
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
          {/*
            ── GTC-189 SLICE 5f — THE PRESS. ONE ACT, NO RECALL ────────────────────────

            ⚠ WHAT PRESSING THIS DOES IN THIS ENVIRONMENT, RECORDED HERE AND NOT ONLY IN THE TICKET,
            ON FOUNDER INSTRUCTION (2026-09-19): whoever meets this button next should meet the
            consequence in the same place.

            Measured on the one pressable board in `gather_dev` — Henderson Family Christmas 2025,
            43 memberships, 38 recipients:

              • The press writes 38 `OutboundMessage` rows, sets `Event.sentAt`, sets the invite
                anchors and writes `SEND_PRESSED`. IRREVERSIBLE AT THE MECHANISM LEVEL (Hinge §2,
                ruled gap #1): no undo, and a second press is refused `ALREADY_SENT`.
              • When the dispatcher runs, nothing reaches a provider: since [[GTC-274]] the live
                switch is off on every machine but production. All 37 email rows are REJECTED with
                no provider code — the sender stops before the key is tried (where the switch is on,
                a key that does not authenticate is refused `validation_error` / 401, terminal on the
                first attempt, [[GTC-247]]). The 1 text row is withheld `SMS_DISABLED`:
                `TNZ_AUTH_TOKEN` is absent, and the switch is off.
              • ⚠ THE BOARD THEN READS RED, "never got it", FOR ALL 38, WHOSE ADDRESSES AND NUMBER
                ARE FINE (GTC-189 slice 7a's `NOT_DELIVERED`; the text since [[GTC-340]]), and the
                summary says 38 need her.
              • ⚠ THE WAY BACK IS SLICE 7b's DOOR, AND HERE IT CANNOT WORK. "Send it again", "Send to
                a different address" and "Send to an email address" each queue a row the next drain
                stops the same way, so the red clears while the row waits and comes back after the
                drain ([[GTC-347]]). "Send it as a text" is not offered while texting is off
                (founder answer 1's fence). The remind is withdrawn on that red, and the press
                cannot be repeated.

            That is the press behaving exactly as designed against a broken key, which is the state
            founder answer Q7 chose over a fake provider. It is not a defect and it is not a surprise
            — it is written here so it is not discovered by pressing.

            ⚠ AND PRESSING SENDS NOTHING AT ALL LOCALLY. Vercel's cron does not run on a dev machine,
            so the rows sit unattempted until somebody calls `/api/cron/outbound-dispatch` with
            `CRON_SECRET`. Anyone testing this presses, sees nothing happen, and that is not a bug:
            the press and the sending are two acts here.
          */}
          <button
            type="button"
            disabled={!allChecked || pressing || pressed !== null}
            onClick={press}
            className={`w-full py-3 rounded-lg font-medium ${
              !allChecked || pressing || pressed !== null
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-gray-900 text-white hover:bg-gray-800'
            }`}
          >
            {pressed !== null
              ? 'Sent'
              : pressing
                ? 'Sending…'
                : `Send${allChecked ? '' : ' — finish the five checks first'}`}
          </button>

          {/*
            THE TWO-SENTENCE THRESHOLD SCRIPT, at the moment of commitment (Hinge §2). Verbatim, from
            `press-words.ts`, and deliberately WITHOUT a roadmap door beside it — the spec refuses an
            options screen showing the machine's plan, and the compressed script is what carries the
            feeling instead of the inventory.
          */}
          {pressed !== null && (
            <div className="mt-4 rounded-lg bg-gray-50 border border-gray-200 p-4">
              <p className="text-sm text-gray-900">
                Sent to {pressed.recipients} {pressed.recipients === 1 ? 'person' : 'people'}.
              </p>
              {THRESHOLD_SCRIPT.map((line) => (
                <p key={line} className="text-sm text-gray-700 mt-2">
                  {line}
                </p>
              ))}
              {/* [[GTC-357]] Q2 — one link to the board, not a roadmap door: the board is where the
                  page goes by itself after BOARD_MOVE_AFTER_MS, and this lets her go sooner. */}
              <a
                href={boardHref(eventId)}
                className="mt-3 inline-block text-sm font-medium text-gray-900 underline underline-offset-2"
              >
                {SEE_THE_BOARD_LINK}
              </a>
            </div>
          )}

          {/*
            THE REFUSAL, IN THE PRESS'S OWN WORDS FOR THAT STATE. The route sends a `code` beside its
            prose precisely so this screen can pick the sentence a host should read rather than
            rendering an internal message — and `PRESS_REFUSAL_WORDS` is a `Record` over the union, so
            an eighth code cannot arrive here without one.
          */}
          {pressError && (
            <p className="text-sm text-red-700 mt-3" role="alert">
              {pressError}
            </p>
          )}
        </Step>
      </div>
    </div>
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

/** `readAskPreview`'s answer as it arrives over the wire — the date as a string. */
type MessageData = Omit<AskPreview, 'event'> & {
  event: Omit<AskPreview['event'], 'startDate'> & { startDate: string };
};

/** What one person, or one child, has been asked for — names exactly as stored ([[GTC-302]]). */
function rowsInBrief(x: { itemNames: readonly string[]; jobNames: readonly string[] }): string {
  const parts = [
    x.itemNames.length > 0 ? `bring ${x.itemNames.join(', ')}` : null,
    x.jobNames.length > 0 ? `do ${x.jobNames.join(', ')}` : null,
  ].filter((p): p is string => p !== null);
  return parts.length > 0 ? parts.join(' · ') : 'nothing';
}

/**
 * GTC-187 (H2) — step 4 made real. Hinge §1: "she reads exactly what each person will
 * receive before it goes... What Kate reads at the pre-flight IS what the guest receives —
 * one shape, two sides."
 *
 * EVERY MESSAGE ON THIS SCREEN COMES OUT OF `composeAsk`, the same function GTC-189's
 * dispatch will call, by way of `composePreview`. The route hands over ingredients and nothing
 * else; the composition happens here, in the client, through the shared module. That is the
 * arrangement GTC-188 made for the nudge clock and it exists so the screen and the send cannot
 * drift apart.
 *
 * GTC-189 SLICE 3 — WHO, AND HOW. The ingredients are the route slice 1's chooser picks for each
 * person: the channel, the children's asks their message carries, and the host's list — the
 * people Gather will not message, each with the reason. Names show exactly as stored
 * ([[GTC-302]], ordered after this slice), so capitals and bracketed qualifiers appear
 * mid-sentence here, on purpose.
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
  const [chaseSaving, setChaseSaving] = useState(false);
  const [chaseError, setChaseError] = useState<string | null>(null);

  /**
   * [[GTC-311]] — the chase channel's two writes, the switch and one person's exception.
   *
   * The server's answer is authoritative, so this re-reads the whole preview rather than patching
   * local state: flipping the switch moves everyone who follows it, and the list below must show
   * exactly who moved. The selected recipient is kept.
   */
  const patchChase = async (body: Record<string, unknown>) => {
    setChaseSaving(true);
    setChaseError(null);
    try {
      const res = await fetch(`/api/events/${eventId}/pre-flight/chase`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setChaseError(err.message ?? err.error ?? 'That did not save.');
        return;
      }
      const fresh = await fetch(`/api/events/${eventId}/pre-flight/message`);
      if (fresh.ok) setData(await fresh.json());
    } catch {
      setChaseError('That did not save.');
    } finally {
      setChaseSaving(false);
    }
  };

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
  const composed = useMemo(
    () => (data ? composePreview(data, authorLine) : { rows: [], longestText: null }),
    [data, authorLine]
  );

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
  if (data.recipients.length === 0 && data.hostList.length === 0) {
    return <p className="text-sm text-gray-600">Nobody to message on this event yet.</p>;
  }

  const rows = composed.rows;
  const current = rows.find((c) => c.recipient.personEventId === selected) ?? rows[0] ?? null;
  /*
   * ⚠ THE COUNTS ARE OVER THE MESSAGES, NOT OVER THE RECIPIENTS — GTC-189 slice 5b, decision 29.
   *
   * This read `rows.length`, and the founder named what was wrong with it at Q1: "the
   * pre-flight's own arithmetic says '8 messages' — two of those eight are not messages." Since
   * slice 5a it is a disagreement with the code, not only a wording problem: `pressSend` writes
   * a row per recipient it holds a link for, so the screen promised more messages than the press
   * sends, in the direction that reassures.
   *
   * The split comes from the module, through the one predicate the press gates on, so this
   * screen and the send cannot answer "who gets a message" differently.
   */
  const messages = messageRows(rows);
  const notMessaged = notMessagedRows(rows);
  const emailed = messages.filter((c) => c.recipient.channel === 'EMAIL').length;
  const texted = messages.length - emailed;
  const linksAtPress = messages.some((c) => c.recipient.linkState === 'AT_PRESS');

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

      {/* GTC-256, CLOSED 2026-08-29. Stated, not hidden.
          Still correct, and now permanent for these events rather than pending: phase 2
          gives every NEW event a host membership row, and Ruling 12 rules no backfill for
          the ones that predate it. So this banner fires only on pre-phase-2 events, and
          what it describes is not going to be repaired — it is reseeded. */}
      {!data.hostIdentityResolved && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          <strong>The name on this message is provisional.</strong> This event has no host
          membership row, so &ldquo;{data.hostName}&rdquo; is taken from the account that owns the
          event rather than from the person you captured as yourself. If you are in the guest list
          below, that is the same problem: you would be sent your own invitation. This event
          predates the fix (GTC-256); newer events capture you properly.
        </p>
      )}

      {linksAtPress && (
        <p className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2 mb-4">
          Some guests have no link yet — links are issued at the press. Those messages show a
          stand-in where the link will go.
        </p>
      )}

      {/* GTC-294. What stood here said "Coordinators are not given a guest link, at the press or
          before it", which this ticket made false: a coordinator now gets the same link as any
          other adult.

          The notice is kept rather than deleted because the STATE it speaks to still exists —
          `NONE_NOT_ISSUED`, a recipient the press will issue no link to — it is simply no longer
          a coordinator, and is unreachable for every role `PersonRole` currently has. So the
          sentence has to say what it means WITHOUT naming a population, which is the same
          constraint GTC-262's directory copy was written under and the opposite of the Family
          Directory card's, where the reader is the host. Founder ruling, 2026-09-18: ships. */}
      {/* ⚠ GTC-189 slice 5b — THIS NAMES EVERY RECIPIENT THE PRESS WILL NOT MESSAGE, NOT JUST
          `NONE_NOT_ISSUED`. It filtered that one state alone, so the host as carrier was counted
          as a message AND went unnamed — the two halves of the same defect. The reason comes
          from `NOT_MESSAGED_WHY`, keyed so a state with no words is a compile error. Its two
          sentences are PROPOSED and carry an anchor; every other word here was ruled. */}
      {notMessaged.length > 0 && (
        <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          <strong>
            {notMessaged.length === 1
              ? 'One person gets no message'
              : `${notMessaged.length} people get no message`}
            .
          </strong>{' '}
          They stay on this screen, and the count below does not include them.
          <ul className="mt-1.5 space-y-1">
            {notMessaged.map((c) => (
              <li key={c.recipient.personEventId}>
                <span className="font-medium">{c.recipient.name}</span> —{' '}
                {NOT_MESSAGED_WHY[c.recipient.linkState as NotMessagedLinkState]}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* The words are the view module's, ruled at slice 3 — Gather says "I". */}
      <p className="text-xs text-gray-500 mb-3">
        {data.replyTo ? (
          replyToLine(data.replyTo)
        ) : (
          <span className="text-amber-700">{NO_REPLY_TO_LINE}</span>
        )}
      </p>

      {/* Who is sent what. */}
      {current && (
        <>
          <div className="flex items-baseline justify-between gap-4 mb-2">
            <label className="block text-sm font-medium text-gray-900">Read it as</label>
            <p className="text-xs text-gray-500">
              {messageCountLine(messages.length, emailed, texted)}
              {composed.longestText !== null &&
                ` · the longest text runs to ${composed.longestText} ${
                  composed.longestText === 1 ? 'text' : 'texts'
                }`}
            </p>
          </div>
          <select
            value={current.recipient.personEventId}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full text-sm border border-gray-300 rounded-md px-3 py-2 mb-4"
          >
            {rows.map((c) => (
              <option key={c.recipient.personEventId} value={c.recipient.personEventId}>
                {c.recipient.name} · by {c.recipient.channel === 'EMAIL' ? 'email' : 'text'}
                {c.recipient.carried.length > 0 &&
                  ` · with ${c.recipient.carried.map((k) => k.firstName).join(', ')}`}
              </option>
            ))}
          </select>

          {/* What this person's message carries, before the words. */}
          <dl className="text-sm mb-3 space-y-1">
            <div className="flex gap-2">
              <dt className="w-24 shrink-0 text-gray-400">Sent by</dt>
              <dd className="text-gray-800">
                {current.recipient.channel === 'EMAIL' ? 'Email' : 'Text'}
                {/* GTC-189 slice 8a, W2 — why a person with an address is sent a text. */}
                {current.recipient.emailNote ? (
                  <span data-email-note="" className="block text-xs text-gray-500">
                    {current.recipient.emailNote}
                  </span>
                ) : null}
              </dd>
            </div>
            {/*
              [[GTC-311]] — HOW THEY ARE CHASED, AND THE ONE PLACE SHE MAY TAKE THEM OFF IT.

              The per-person control lives on the recipient she is reading, not on a list of every
              emailed guest: ruling AH rejected the forty-row screen, and the list she reads below is
              the short one — the people she has taken. The pills name BEHAVIOURS, never a tick; the
              control's polarity inverted on 2026-09-15 and a tick would read either way.

              An opted-out row is refused the control and says so IN ITS PLACE (ruling AI; ruling AM's
              words, from the module) rather than simply having no switch.
            */}
            {(() => {
              const rc = data.chase.byRecipient[current.recipient.personEventId];
              if (!rc) return null;
              return (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-gray-400">{CHASED_BY_LABEL}</dt>
                  <dd className="text-gray-800">
                    {CHASED_BY_VALUE[rc.chasedBy]}
                    {rc.control === 'REFUSED_OPTED_OUT' && (
                      <span className="block text-xs text-gray-500 mt-1">
                        {CHASE_OPTED_OUT_PLACEHOLDER}
                      </span>
                    )}
                    {rc.control === 'OFFERED' && (
                      <span className="flex flex-wrap gap-2 mt-1">
                        {chasePersonPills({
                          exception: rc.exception,
                          eventDefault: data.chase.stored,
                        }).map((p) => (
                          <Pill
                            key={p.value}
                            active={p.active}
                            onClick={() =>
                              !chaseSaving &&
                              !p.active &&
                              patchChase({
                                personEventId: current.recipient.personEventId,
                                chaseException: p.writes,
                              })
                            }
                          >
                            {p.label}
                          </Pill>
                        ))}
                      </span>
                    )}
                  </dd>
                </div>
              );
            })()}
            {!current.recipient.hostAsCarrier && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">Theirs</dt>
                <dd className="text-gray-800">{rowsInBrief(current.recipient)}</dd>
              </div>
            )}
            {current.recipient.carried.map((k) => (
              <div key={k.personEventId} className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">For {k.firstName}</dt>
                <dd className="text-gray-800">{rowsInBrief(k)}</dd>
              </div>
            ))}
            {/* [[GTC-356]] W5 — whose asks her message tells her about. The lines are in the message below. */}
            {current.recipient.household.length > 0 && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">{TOLD_ABOUT_LABEL}</dt>
                <dd className="text-gray-800">{toldAboutValue(current.recipient.household)}</dd>
              </div>
            )}
            {current.replyTo !== null && (
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-gray-400">Reply-to</dt>
                <dd className="text-gray-800">{current.replyTo}</dd>
              </div>
            )}
          </dl>

          {current.ask === null ? (
            /* Ruling A2 — the host as carrier. Movements 1 and 2 are voiced as her, so which voice
               a message TO her is in is decision 20, unruled; her link is GTC-297. Not composed. */
            <p className="text-sm text-gray-700 bg-gray-50 border border-gray-200 rounded-md px-4 py-3">
              This goes to you, because another household picked you as its contact. It carries only
              their child&rsquo;s ask &mdash; nothing of yours. Its wording is not settled yet
              (GTC-189 decision 20) and neither is the link you would answer it from (GTC-297), so
              it is not shown.
            </p>
          ) : (
            <>
              {/* The message itself, seam visible. */}
              <div className="border border-gray-200 rounded-md bg-white overflow-hidden">
                {current.subject !== null && (
                  <div className="px-4 py-2 border-b border-gray-100 bg-gray-50">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400">Subject</p>
                    <p className="text-sm text-gray-800">{current.subject}</p>
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
                {/* [[GTC-337]] ruling 2 — Gather ends every text with this line; the count below
                    includes it. An email carries none. */}
                {current.textAsSent !== null && (
                  <div className="px-4 py-3 border-b border-gray-100 last:border-0">
                    <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Gather</p>
                    <p className="text-sm text-gray-900">{OPT_OUT_LINE}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                {current.segments !== null && current.textAsSent !== null ? (
                  <>
                    {current.textAsSent.length} characters · {current.segments}{' '}
                    {current.segments === 1 ? 'text' : 'texts'}
                    {current.segments > 1 && ' — long is fine, it just costs more to send'}.
                    {current.narrowSegments &&
                      ' Counted at 70 characters a text rather than 160, because the wording uses punctuation plain SMS cannot carry.'}
                  </>
                ) : (
                  'Sent by email, so there is no text count.'
                )}
              </p>
            </>
          )}
        </>
      )}

      {/*
        [[GTC-311]] — THE DEFAULT, STATED ONCE (acceptance: "in one sentence, rather than per row").
        It sits above the list because it decides who is on the second half of it. The switch is the
        event's; the per-person exception is on each recipient above. Words: W1–W3, ruled 2026-09-27.
      */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        <p className="text-sm text-gray-800 mb-2">{CHASE_DEFAULT_SENTENCE[data.chase.resolved]}</p>
        <div className="flex flex-wrap gap-2">
          {(['BY_EMAIL', 'HAND_TO_HOST'] as const).map((v) => (
            <Pill
              key={v}
              active={data.chase.resolved === v}
              onClick={() =>
                !chaseSaving &&
                !(data.chase.stored === v) &&
                patchChase({ chaseWhenNoMobileDefault: v })
              }
            >
              {CHASE_DEFAULT_PILLS[v]}
              {data.chase.stored === null && data.chase.resolved === v && DEFAULT_SUFFIX}
            </Pill>
          ))}
        </div>
        {chaseSaving && <p className="text-xs text-gray-400 mt-2">Saving…</p>}
        {chaseError && <p className="text-xs text-red-600 mt-2">{chaseError}</p>}
      </div>

      {/* The host's list — ruling A as corrected: adults Gather cannot reach, and children whose
          route is closed. Each named with what they were asked for, and why it is hers.

          ⚠ [[GTC-311]] SCOPED ruling 6 — TWO KINDS OF PERSON NOW, AND EVERY HEADING IS TRUE OF
          EVERYONE UNDER IT. Group A is who Gather does not ask; slice 3's blurb is exactly true of
          them and stays with them. Group B is who Gather asks and will not chase, which the blurb
          would be false of. Each half comes from its own field and its own words map — group B's
          reasons are ruling AN's `CHASE_NONE_WHY`, never `ADULT_WHY`. */}
      <div className="mt-6 pt-5 border-t border-gray-100">
        <h3 className="text-sm font-medium text-gray-900 mb-1">{HOST_LIST_HEADING}</h3>
        {data.hostList.length === 0 && data.chase.notChased.length === 0 ? (
          <p className="text-sm text-gray-600">{HOST_LIST_EMPTY}</p>
        ) : (
          <>
            {data.hostList.length > 0 && (
              <div className="mt-3">
                <h4 className="text-sm text-gray-800 mb-1">{HOST_LIST_NOT_ASKED_HEADING}</h4>
                <p className="text-xs text-gray-500 mb-3">{HOST_LIST_BLURB}</p>
                <ul className="space-y-2">
                  {data.hostList.map((l) => (
                    <li key={l.personEventId} className="text-sm">
                      <span className="text-gray-900">{l.name}</span>
                      <span className="text-gray-500"> — {rowsInBrief(l)}</span>
                      <p className="text-xs text-gray-500">{hostListReason(l)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.chase.notChased.length > 0 && (
              <div className="mt-4">
                <h4 className="text-sm text-gray-800 mb-1">{HOST_LIST_NOT_CHASED_HEADING}</h4>
                <p className="text-xs text-gray-500 mb-3">{HOST_LIST_NOT_CHASED_BLURB}</p>
                <ul className="space-y-2">
                  {data.chase.notChased.map((l) => (
                    <li key={l.personEventId} className="text-sm">
                      <span className="text-gray-900">{l.name}</span>
                      <span className="text-gray-500"> — {rowsInBrief(l)}</span>
                      <p className="text-xs text-gray-500">{notChasedReason(l)}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
